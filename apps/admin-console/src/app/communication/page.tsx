'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Tabs, Form, Input, Button, Tag, Row, Col, Space, Spin, Statistic, Skeleton, Select, InputNumber } from 'antd';
import { message } from '@/lib/antd-app';
import { CheckCircle2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';
import {
	useCommunicationDashboard,
	useMessageLogs,
	useCommunicationProviders,
	useSaveCommunicationProvider,
} from '@/hooks/use-communication';
import { getCommunicationHealth } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

interface HealthStatus {
	channel: string;
	status: 'healthy' | 'unhealthy' | 'unknown';
	latency?: string;
}

const { Option } = Select;

// A-177 补修：页签「渠道配置」表单对齐后端 provider 契约
// （create = CreateProviderConfigRequest，update = UpdateProviderConfigRequest）。
const PROVIDER_OPTIONS = [
	{ value: 'aliyun', labelKey: 'communication.providers.provider.aliyun' },
	{ value: 'tencent', labelKey: 'communication.providers.provider.tencent' },
	{ value: 'sendgrid', labelKey: 'communication.providers.provider.sendgrid' },
	{ value: 'fcm', labelKey: 'communication.providers.provider.fcm' },
	{ value: 'apns', labelKey: 'communication.providers.provider.apns' },
];

// 服务端掩码哨兵（maskConfig）：编辑回显原样展示，提交时不得回写（否则销毁真密文）。
const REDACTED_SENTINEL = '***REDACTED***';

export default function CommunicationPage() {
	const { t } = useTranslation();
	// A-182：页面标题（与面包屑同源）
	usePageTitle(t('communication.title'));
	const [activeTab, setActiveTab] = useState('dashboard');
	const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({});
	const [checkingHealth, setCheckingHealth] = useState<Record<string, boolean>>({});
	const [savingChannel, setSavingChannel] = useState<string | null>(null);
	// A-182：仪表盘统计窗口（7/30/90 天）——原实现恒取后端默认窗，无切换入口。
	const [days, setDays] = useState(30);

	const { data: dashboard, isLoading: dashLoading } = useCommunicationDashboard(days);
	const { data: logs = [], isLoading: logsLoading, error, refetch } = useMessageLogs();
	const { data: providers = [] } = useCommunicationProviders();
	const saveProviderMut = useSaveCommunicationProvider();

	const [emailForm] = Form.useForm();
	const [smsForm] = Form.useForm();
	const [pushForm] = Form.useForm();
	const channelForms = useMemo<Record<string, ReturnType<typeof Form.useForm>[0]>>(
		() => ({ email: emailForm, sms: smsForm, push: pushForm }),
		[emailForm, smsForm, pushForm],
	);

	// A-177：渠道行回填（每渠道一次性，防 providers 刷新 clobber 正在编辑的表单）。
	const prefilledRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		const rows = providers as Array<Record<string, unknown>>;
		for (const row of rows) {
			const ch = row.channel as string | undefined;
			const form = ch ? channelForms[ch] : undefined;
			if (!ch || !form || prefilledRef.current.has(ch)) continue;
			prefilledRef.current.add(ch);
			form.setFieldsValue({
				provider: row.provider,
				config: (row.config as string) || '{}',
				priority: (row.priority as number) ?? 0,
			});
		}
	}, [providers, channelForms]);

	const CHANNELS = [
		{ key: 'email', label: t('communication.channel.email'), icon: '📧' },
		{ key: 'sms', label: t('communication.channel.sms'), icon: '📱' },
		{ key: 'push', label: t('communication.channel.push'), icon: '🔔' },
	];

	const statusLabels: Record<string, string> = {
		sent: t('communication.status.sent'),
		delivered: t('communication.status.delivered'),
		failed: t('communication.status.failed'),
		pending: t('communication.status.pending'),
		scheduled: t('communication.status.scheduled'),
		cancelled: t('communication.status.cancelled'),
		partial: t('communication.status.partial'),
		opened: t('communication.status.opened'),
	};

	const statusColors: Record<string, string> = {
		sent: 'blue',
		delivered: 'green',
		failed: 'red',
		pending: 'default',
		scheduled: 'orange',
		cancelled: 'default',
		partial: 'warning',
		opened: 'cyan',
	};

	const getHealthText = (status: string) => {
		if (status === 'healthy') return t('communication.status.normal');
		if (status === 'unhealthy') return t('communication.status.abnormal');
		return t('communication.status.unknown');
	};

	const handleCheckHealth = async (channel: string) => {
		setCheckingHealth((prev) => ({ ...prev, [channel]: true }));
		try {
			const res: unknown = await getCommunicationHealth(channel);
			const data = res as Record<string, unknown> | undefined;
			setHealthMap((prev) => ({
				...prev,
				[channel]: {
					channel,
					status: (data?.status as HealthStatus['status']) || 'unknown',
					latency: data?.latency as string | undefined,
				},
			}));
		} catch (err) {
			setHealthMap((prev) => ({
				...prev,
				[channel]: { channel, status: 'unhealthy' },
			}));
			handleApiError(err, t('communication.healthCheckFailed'));
		} finally {
			setCheckingHealth((prev) => ({ ...prev, [channel]: false }));
		}
	};

	const handleSaveConfig = async (channel: string, values: Record<string, unknown>) => {
		setSavingChannel(channel);
		try {
			const existing = (providers as Array<{ channel: string; id?: string }>).find(
				(p) => p.channel === channel,
			);
			const priority = (values.priority as number | null | undefined) ?? 0;
			if (existing?.id) {
				// A-177：update 契约仅接受 {config, is_active, priority}，发 channel 会 400 "no fields to update"。
				const data: Record<string, unknown> = { priority };
				const configText = String(values.config ?? '').trim();
				// 掩码哨兵或留空 = 不改 config（后端非 nil 才覆盖；回写掩码即销毁真密文）。
				if (configText && configText !== REDACTED_SENTINEL) {
					data.config = configText;
				}
				await saveProviderMut.mutateAsync({ id: existing.id, channel, data });
			} else {
				// A-177：create 契约 = {channel, provider, config(JSON 字符串), priority}。
				await saveProviderMut.mutateAsync({
					channel,
					data: {
						provider: values.provider,
						config: String(values.config ?? '') || '{}',
						priority,
					},
				});
			}
			const chLabel = CHANNELS.find((c) => c.key === channel)?.label;
			message.success(
				t('communication.saveConfigSuccess').replace('{channel}', chLabel || channel),
			);
		} catch (err) {
			handleApiError(err, t('communication.saveConfigFailed'));
		} finally {
			setSavingChannel(null);
		}
	};

	const logColumns = [
		{ title: t('communication.id'), dataIndex: 'id', key: 'id', ellipsis: true },
		{
			title: t('communication.channel'),
			dataIndex: 'channel',
			key: 'channel',
			render: (v: string) => <Tag>{v?.toUpperCase()}</Tag>,
		},
		{ title: t('communication.recipient'), dataIndex: 'recipient', key: 'recipient' },
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={statusColors[v] || 'default'}>{statusLabels[v] || v}</Tag>,
		},
		{
			title: t('communication.sendTime'),
			dataIndex: 'sentAt',
			key: 'sentAt',
			// A-179：失败行 sentAt 恒空（后端 SentAt omitempty）→ 回退显示 createdAt（创建/入队时刻）。
			render: (v: string | undefined, r: { createdAt?: string }) => v || r.createdAt || '-',
		},
	];

	const dashboardTab = (
		<div>
			{/* A-182：统计窗口切换（7/30/90 天；days 入 hook queryKey 与 wire） */}
			<div className="mb-4 flex items-center justify-end gap-2">
				<span className="text-sm text-neutral-600">{t('communication.windowDays')}</span>
				<Select
					value={days.toString()}
					onChange={(v) => setDays(Number(v))}
					options={[
						{ label: t('notifications.stats.days7'), value: '7' },
						{ label: t('notifications.stats.days30'), value: '30' },
						{ label: t('notifications.stats.days90'), value: '90' },
					]}
					style={{ width: 120 }}
				/>
			</div>
			<Row gutter={[16, 16]}>
				<Col xs={24} sm={12} md={6}>
					<Card>
						{dashLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('communication.totalSentDays').replace('{days}', String(days))}
								value={dashboard?.totalSent ?? 0}
								prefix={<Send size="1em" className="text-info" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} md={6}>
					<Card>
						{dashLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('communication.delivered')}
								value={dashboard?.delivered ?? 0}
								prefix={<CheckCircle2 size="1em" className="text-success" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} md={6}>
					<Card>
						{dashLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('communication.failed')}
								value={dashboard?.failed ?? 0}
								valueStyle={{ color: (dashboard?.failed ?? 0) > 0 ? 'var(--color-danger-text)' : undefined }}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} md={6}>
					<Card>
						{dashLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('communication.deliveryRate')}
								value={
									dashboard?.deliveryRate ? Math.round(dashboard.deliveryRate * 10000) / 100 : 0
								}
								suffix="%"
								precision={1}
								valueStyle={{ color: (dashboard?.deliveryRate ?? 0) > 0.9 ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}
							/>
						)}
					</Card>
				</Col>
			</Row>

			<Row gutter={[16, 16]} className="mt-6">
				<Col xs={24} md={12}>
					<Card title={t('communication.byChannel')}>
						{dashLoading ? (
							<Skeleton active paragraph={{ rows: 3 }} />
						) : (
							<DataTable
								dataSource={Object.entries(dashboard?.byChannel ?? {}).map(([key, count]) => ({
									channel: key.toUpperCase(),
									count,
								}))}
								pagination={false}
								size="small"
								rowKey="channel"
								scroll={{ x: 800 }}
								columns={[
									{
										title: t('communication.channel'),
										dataIndex: 'channel',
										key: 'channel',
										render: (v: string) => <Tag>{v}</Tag>,
									},
									{
										title: t('communication.sentCount'),
										dataIndex: 'count',
										key: 'count',
										render: (v: number) => v.toLocaleString(),
									},
								]}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} md={12}>
					<Card title={t('communication.byStatus')}>
						{dashLoading ? (
							<Skeleton active paragraph={{ rows: 3 }} />
						) : (
							<DataTable
								dataSource={Object.entries(dashboard?.byStatus ?? {}).map(([key, count]) => ({
									status: key,
									label: statusLabels[key] || key,
									color: statusColors[key] || 'default',
									count,
								}))}
								pagination={false}
								size="small"
								rowKey="status"
								scroll={{ x: 800 }}
								columns={[
									{
										title: t('common.status'),
										dataIndex: 'status',
										key: 'status',
										render: (_v: string, r: { color: string; label: string }) => (
											<Tag color={r.color}>{r.label}</Tag>
										),
									},
									{
										title: t('communication.count'),
										dataIndex: 'count',
										key: 'count',
										render: (v: number) => v.toLocaleString(),
									},
								]}
							/>
						)}
					</Card>
				</Col>
			</Row>
		</div>
	);

	const tabs = [
		{
			key: 'dashboard',
			label: t('communication.dashboard'),
			children: dashboardTab,
		},
		...CHANNELS.map((c) => {
			const row = (providers as Array<Record<string, unknown>>).find((p) => p.channel === c.key);
			const hasExisting = Boolean(row?.id);
			return {
				key: c.key,
				label: c.label,
				children: (
					<>
						<Card
							title={t('communication.channelConfig').replace('{channel}', c.label)}
							className="mb-4"
						>
							<Form
								name={c.key}
								form={channelForms[c.key]}
								layout="vertical"
								onFinish={(values: unknown) =>
									handleSaveConfig(c.key, values as Record<string, unknown>)
								}
							>
								<Row gutter={16}>
									<Col xs={24} md={12}>
										<Form.Item
											name="provider"
											label={t('communication.providers.provider')}
											rules={[{ required: true }]}
										>
											<Select
												showSearch
												disabled={hasExisting}
												placeholder={t('communication.providers.selectProvider')}
											>
												{PROVIDER_OPTIONS.map((p) => (
													<Option key={p.value} value={p.value}>
														{t(p.labelKey)}
													</Option>
												))}
											</Select>
										</Form.Item>
									</Col>
									<Col xs={24} md={12}>
										<Form.Item name="priority" label={t('communication.providers.priority')}>
											<InputNumber min={0} max={100} className="w-full" />
										</Form.Item>
									</Col>
									<Col xs={24}>
										<Form.Item name="config" label={t('communication.providers.config')}>
											<Input.TextArea
												rows={4}
												placeholder={t('communication.providers.configPlaceholder')}
											/>
										</Form.Item>
									</Col>
								</Row>
								<Space>
									<Button type="primary" htmlType="submit" loading={savingChannel === c.key}>
										{t('communication.saveConfig')}
									</Button>
									<Button
										icon={<CheckCircle2 size="1em" />}
										onClick={() => handleCheckHealth(c.key)}
										loading={checkingHealth[c.key]}
									>
										{t('communication.healthCheck')}
									</Button>
								</Space>
							</Form>
						</Card>

						<Card title={t('communication.sendLogs')}>
							<Spin spinning={logsLoading}>
								<DataTable
									rowKey="id"
									columns={logColumns}
									dataSource={logs}
									pagination={{ pageSize: 10 }}
									scroll={{ x: 800 }}
								/>
							</Spin>
						</Card>
					</>
				),
			};
		}),
	];

	return (
		<div>
			<AppPageHeader title={t('communication.title')} />

			<Row gutter={[16, 16]} className="mb-6">
				{CHANNELS.map((c) => {
					const health = healthMap[c.key];
					const color =
						health?.status === 'healthy'
							? 'success'
							: health?.status === 'unhealthy'
								? 'error'
								: 'default';
					const text = getHealthText(health?.status || 'unknown');
					return (
						<Col xs={24} sm={8} key={c.key}>
							<Card>
								<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
									<div>
										<div className="text-neutral-600 text-sm">
											{c.label} {t('common.status')}
										</div>
										<div className="text-2xl font-bold mt-1">
											<Tag color={color}>{text}</Tag>
										</div>
										{health?.latency && (
											<div className="text-xs text-neutral-600 mt-1">
												{t('notifications.stats.readRate')}: {health.latency}
											</div>
										)}
									</div>
									<div className="text-3xl">{c.icon}</div>
								</div>
							</Card>
						</Col>
					);
				})}
			</Row>

			{error && (
				<PageError message={t('communication.loadError')} retry={refetch} className="mb-4" />
			)}

			<Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
		</div>
	);
}

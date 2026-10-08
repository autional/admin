'use client';

import React, { useMemo, useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Popconfirm, Switch } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fromPageResult, toPageParams, usePageTitle } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { getCommunicationProviders } from '@/lib/api.generated';
import {
	useCreateCommunicationProvider,
	useUpdateCommunicationProvider,
	useDeleteCommunicationProvider,
} from '@/hooks/use-communication';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { TextArea } = Input;

interface ProviderRecord {
	id?: string;
	channel?: string;
	provider?: string;
	// A-177（TASK-AB1-09）：服务端 ProviderConfigResponse.config 为脱敏 JSON 字符串；
	// W3-02（A-189）：编辑态不回填掩码串（回写必被后端哨兵 400 拒收），留空 = 不修改。
	config?: string;
	isActive?: boolean;
	priority?: number;
	updatedAt?: string;
}

// A-190：表单值形状（创建/编辑共用）；编辑态 config 可空 = 不修改（不回写掩码串）。
interface ProviderFormValues {
	channel: string;
	provider: string;
	config?: string;
	isActive?: boolean;
	priority?: number;
}

const CHANNEL_COLORS: Record<string, string> = { sms: 'orange', email: 'green', push: 'purple' };
const PROVIDER_COLORS: Record<string, string> = {
	aliyun: 'blue',
	tencent: 'cyan',
	sendgrid: 'green',
	fcm: 'orange',
	apns: 'purple',
};

// A-191：渠道 × 服务商联动白名单（后端 oneof 仅约束 channel，provider 无服务端白名单，
// 此处按渠道收敛可选项；切换渠道时清空失配值，由 required 兜底）。
const CHANNEL_PROVIDERS: Record<string, string[]> = {
	sms: ['aliyun', 'tencent'],
	email: ['sendgrid'],
	push: ['fcm', 'apns'],
};
const ALL_PROVIDERS = ['aliyun', 'tencent', 'sendgrid', 'fcm', 'apns'];

/** A-193：服务端分页每页条数（与旧本地分页 pageSize=10 对齐） */
const PAGE_SIZE = 10;

export default function CommunicationProvidersPage() {
	const { t } = useTranslation();
	usePageTitle(t('communication.providers.title'));

	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<ProviderRecord | null>(null);
	const [form] = Form.useForm();
	const [page, setPage] = useState(1);

	// A-193（服务端分页）：page/page_size 走 wire（toPageParams 单点），列表归一 fromPageResult；
	// 键前缀 = queryKeys.communication.providers，增/改/删 mutation 的前缀失效自动覆盖本查询。
	const {
		data: pageData,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: [...queryKeys.communication.providers, { page, pageSize: PAGE_SIZE }],
		queryFn: async () =>
			fromPageResult<ProviderRecord>(
				await getCommunicationProviders(toPageParams({ page, pageSize: PAGE_SIZE })),
			),
		staleTime: 60000,
	});
	const data = pageData?.items ?? [];
	const total = pageData?.total ?? 0;

	const createMut = useCreateCommunicationProvider();
	const updateMut = useUpdateCommunicationProvider();
	const deleteMut = useDeleteCommunicationProvider();

	const CHANNEL_OPTIONS = [
		{ value: 'sms', label: t('communication.channel.sms') },
		{ value: 'email', label: t('communication.channel.email') },
		{ value: 'push', label: t('communication.channel.push') },
	];

	// A-191：渠道 × 服务商联动——provider 选项随所选渠道收敛。
	const selectedChannel = Form.useWatch('channel', form);
	const providerOptions = useMemo(() => {
		const allowed = selectedChannel
			? (CHANNEL_PROVIDERS[selectedChannel as string] ?? [])
			: undefined;
		return ALL_PROVIDERS.filter((p) => !allowed || allowed.includes(p)).map((value) => ({
			value,
			label: t(`communication.providers.provider.${value}`),
		}));
	}, [selectedChannel, t]);

	// A-193：config 本地 JSON 校验（非法即拦，不发请求）；W3-02：编辑态留空 = 不修改。
	const validateConfig = (_: unknown, value?: string) => {
		const v = (value ?? '').trim();
		if (!v) {
			if (editing?.id) return Promise.resolve();
			return Promise.reject(new Error(t('communication.providers.configJsonInvalid')));
		}
		if (v.includes('***REDACTED***')) {
			return Promise.reject(new Error(t('communication.providers.configMaskedRejected')));
		}
		try {
			JSON.parse(v);
			return Promise.resolve();
		} catch {
			return Promise.reject(new Error(t('communication.providers.configJsonInvalid')));
		}
	};

	// A-191 联动守门：值必须属于当前渠道的白名单。编辑态跳过——channel/provider 均被禁用，
	// 历史失配数据不可经本表单引入，也不应把编辑提交卡死（禁用字段无法修正）。
	const validateProviderChannel = (_: unknown, value?: string) => {
		if (editing?.id || !value) return Promise.resolve();
		const channel = form.getFieldValue('channel') as string | undefined;
		const allowed = channel ? (CHANNEL_PROVIDERS[channel] ?? []) : [];
		if (allowed.length > 0 && !allowed.includes(value)) {
			return Promise.reject(new Error(t('communication.providers.providerChannelMismatch')));
		}
		return Promise.resolve();
	};

	const handleSave = async (values: ProviderFormValues) => {
		try {
			// A-177：请求体对齐后端 DTO ——
			// create = CreateProviderConfigRequest{channel, provider, config(JSON 字符串), priority}；
			// update = UpdateProviderConfigRequest{config?, is_active, priority}（再发 channel/provider
			// 会命中后端 "no fields to update"）。键名一律 camel 书面写，camel→snake 由 shared
			// apiClient 请求拦截器承担（isActive→is_active）。
			// W3-02（A-189）：编辑态 config 留空 = 不修改（仅非空才发键，掩码串绝不回写）。
			// A-190：isActive 由真控件驱动（编辑态取控件实际值；创建态服务端固定 true，不随请求）。
			const configText: string = (values.config ?? '').trim();
			const priority: number = values.priority ?? 0;
			if (editing?.id) {
				const payload: Record<string, unknown> = {
					isActive: values.isActive === true,
					priority,
				};
				if (configText) payload.config = configText;
				await updateMut.mutateAsync({ id: editing.id, data: payload });
				message.success(t('communication.providers.updateSuccess'));
			} else {
				await createMut.mutateAsync({
					channel: values.channel,
					provider: values.provider,
					config: configText,
					priority,
				});
				message.success(t('communication.providers.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('communication.providers.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('communication.providers.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('communication.providers.deleteFailed'));
		}
	};

	const columns = [
		{
			title: t('communication.providers.channel'),
			dataIndex: 'channel',
			key: 'channel',
			render: (v: string) => (
				<Tag color={CHANNEL_COLORS[v] || 'default'}>
					{v ? t(`communication.channel.${v}`, { defaultValue: v }) : '-'}
				</Tag>
			),
		},
		{
			title: t('communication.providers.provider'),
			dataIndex: 'provider',
			key: 'provider',
			render: (v: string) => <Tag color={PROVIDER_COLORS[v] || 'default'}>{v || '-'}</Tag>,
		},
		{
			title: t('common.status'),
			dataIndex: 'isActive',
			key: 'isActive',
			render: (v: boolean) => (
				<Tag color={v ? 'success' : 'default'}>
					{v ? t('communication.providers.enabled') : t('communication.providers.disabled')}
				</Tag>
			),
		},
		{
			// A-191：priority 列（对齐后端 ProviderConfigResponse.priority）
			title: t('communication.providers.priority'),
			dataIndex: 'priority',
			key: 'priority',
			width: 90,
			render: (v?: number) => (typeof v === 'number' ? v : '-'),
		},
		{
			title: t('common.updatedAt'),
			dataIndex: 'updatedAt',
			key: 'updatedAt',
			render: (v?: string) => (v ? v.slice(0, 10) : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: unknown, record: ProviderRecord) => (
				<Space size="small">
					<Button
						type="text"
						size="small"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								channel: record.channel,
								provider: record.provider,
								// W3-02：config 不回填掩码串（回写 = 400），留空 = 不修改
								config: '',
								isActive: record.isActive === true,
								priority: record.priority ?? 0,
							});
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Popconfirm
						title={t('communication.providers.confirmDelete')}
						onConfirm={() => record.id && handleDelete(record.id)}
					>
						<Button type="text" danger size="small" icon={<Trash2 size="1em" />}>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('communication.providers.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalVisible(true);
							}}
						>
							{t('communication.providers.addProvider')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError
					message={t('communication.providers.loadError')}
					retry={refetch}
					className="mb-4"
				/>
			)}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data}
				loading={isLoading}
				pagination={{
					current: page,
					pageSize: PAGE_SIZE,
					total,
					showSizeChanger: false,
					showTotal: (n: number) => t('paginationTotal', { total: n }),
					onChange: (p: number) => setPage(p),
				}}
				scroll={{ x: 900 }}
			/>

			<Modal
				title={
					editing?.id
						? t('communication.providers.editProvider')
						: t('communication.providers.addProvider')
				}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				width={640}
				className="w-full max-w-[640px]"
				destroyOnHidden
			>
				<Form
					form={form}
					layout="vertical"
					onFinish={handleSave}
					initialValues={{ channel: 'email', priority: 0, isActive: true }}
				>
					<Form.Item
						name="channel"
						label={t('communication.providers.channel')}
						rules={[{ required: true }]}
					>
						{/* A-190/W3-01：编辑态禁用（update 契约不含 channel，改发即 400） */}
						<Select
							options={CHANNEL_OPTIONS}
							disabled={!!editing?.id}
							onChange={(v: string) => {
								const current = form.getFieldValue('provider') as string | undefined;
								const allowed = CHANNEL_PROVIDERS[v] ?? [];
								if (current && !allowed.includes(current)) {
									form.setFieldValue('provider', undefined);
								}
							}}
						/>
					</Form.Item>
					<Form.Item
						name="provider"
						label={t('communication.providers.provider')}
						rules={[{ required: true }, { validator: validateProviderChannel }]}
					>
						{/* A-191：选项随渠道收敛；编辑态禁用（update 契约不含 provider） */}
						<Select
							options={providerOptions}
							placeholder={t('communication.providers.selectProvider')}
							disabled={!!editing?.id}
						/>
					</Form.Item>
					<Form.Item
						name="config"
						label={t('communication.providers.config')}
						rules={
							editing?.id
								? [{ validator: validateConfig }]
								: [{ required: true }, { validator: validateConfig }]
						}
						extra={editing?.id ? t('communication.providers.configEditHint') : undefined}
					>
						<TextArea rows={6} placeholder={t('communication.providers.configPlaceholder')} />
					</Form.Item>
					{/* A-190：is_active 真控件——编辑态取实际值随请求提交；创建态服务端固定 true，
					    控件禁用并如实呈现（DTO 无 is_active 字段，登记见执行摘要） */}
					<Form.Item
						name="isActive"
						label={t('communication.providers.activeStatus')}
						valuePropName="checked"
						extra={!editing?.id ? t('communication.providers.activeStatusCreateHint') : undefined}
					>
						<Switch disabled={!editing?.id} />
					</Form.Item>
					{/* A-177：priority 对齐后端 DTO（min0 max100，dto.go:582） */}
					<Form.Item
						name="priority"
						label={t('communication.providers.priority')}
						rules={[{ type: 'number', min: 0, max: 100 }]}
					>
						<InputNumber min={0} max={100} className="w-full" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

'use client';
// @generated-api-exempt: 2 key(s) [IDENTITY.ADMIN_CONSENTS, TENANT.MINORS_PROTECTION] lack generated func

import React, { useState, useEffect, useRef } from 'react';
import { DataTable, PageError } from '@autional/ui/antd';
import { Card, Form, InputNumber, Switch, Button, Spin, TimePicker, Space, Statistic, Row, Col, Tabs, Tag } from 'antd';
import {
	BadgeCheck,
	RefreshCw,
	Save,
	User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { handleApiError } from '@/lib/error-handler';
import { message } from '@/lib/antd-app';

import { apiClient, API_PATHS, fromPageResult, toPageParams, useCurrentTenantId } from '@autional/shared';
import { adminUsers } from '@autional/shared/generated/api';
import { AppPageHeader, SectionCard } from '@autional/ui';
import dayjs from 'dayjs';

// TASK-AB1-27（RC-5 契约收敛）：契约键直读（响应拦截器已 snake→camel），禁止 snake 直读。
// wire 锚：service-tenant dto.go:390-403 MinorsProtectionConfigResponse 经拦截器 camel 化。
interface MinorsProtectionConfig {
	tenantId: string;
	dailyUsageLimitMin: number;
	nightModeStart: string;
	nightModeEnd: string;
	nightModeEnabled: boolean;
	monthlySpendLimit: number;
	liveStreamBlockedUnder16: boolean;
	contentFilterEnabled: boolean;
	childDefaultMaxPrivacy: boolean;
	minorDataRetentionDays: number;
	// A-272（W1e，分支②补展示）：wire 含两阈值字段而前端 10 键接口零 UI → 补只读展示
	minorsAgeThreshold?: number;
	digitalConsentAge?: number;
}

/** wire 锚：service-identity dto/user.go:272-296 AuthUserResponse（isMinor/ageGroup/pendingParentalConsent…）。 */
interface MinorUser {
	id: string;
	tenantId: string;
	email: string;
	phone: string;
	username: string;
	status: string;
	isMinor: boolean;
	ageGroup: string;
	birthDate: string;
	pendingParentalConsent: boolean;
	createdAt: string;
}

/** wire 锚：service-identity dto/consent.go:25-36 ChildrenConsentResponse（userId/parentEmail/recordedAt…）。 */
interface ConsentRecord {
	id: string;
	userId: string;
	parentEmail: string;
	parentPhone: string;
	status: string;
	verified: boolean;
	method: string;
	recordedAt: string;
	verifiedAt?: string;
}

/** W4-02（A-273）：真服务端分页——wire 契约 page/page_size（service-core base/dto/page.go，默认 20 上限 100）。 */
const PAGE_SIZE = 20;

export default function MinorsProtectionPage() {
	const { t } = useTranslation();

	const AGE_GROUP_LABELS: Record<string, string> = {
		'under-14': t('compliance.minors.ageGroupUnder14'),
		'14-16': t('compliance.minors.ageGroup14to16'),
		'16-18': t('compliance.minors.ageGroup16to18'),
		adult: t('compliance.minors.ageGroupAdult'),
	};

	const STATUS_COLORS: Record<string, string> = {
		pending: 'orange',
		verified: 'green',
		expired: 'default',
		denied: 'red',
	};

	const [config, setConfig] = useState<MinorsProtectionConfig | null>(null);
	const [loading, setLoading] = useState(true);
	// A-265f（RC-B2-14 P1）：配置加载失败显式成态——失败绝不伪装成「租户未配置」（空表单+伪 0 统计）。
	const [configError, setConfigError] = useState(false);
	const [saving, setSaving] = useState(false);
	const [users, setUsers] = useState<MinorUser[]>([]);
	const [usersLoading, setUsersLoading] = useState(false);
	const [userTotal, setUserTotal] = useState(0);
	// A-271（W1e）：统计卡首屏恒 0（懒加载）→ 挂载即载 + 三态（加载中 '-' / 已载真值）。
	// requestedRef 同步置位：挂载在飞请求不被首次 Tab 点击二次触发（保 pagination 测试 1 次调用不变量）。
	const usersRequestedRef = useRef(false);
	const [usersLoaded, setUsersLoaded] = useState(false);
	// W4-02（A-273）：真服务端分页——当前页由请求回填，翻页触发新请求（旧实现 pageSize=100 单页假分页）。
	const [userPage, setUserPage] = useState(1);
	const [consents, setConsents] = useState<ConsentRecord[]>([]);
	const [consentsLoading, setConsentsLoading] = useState(false);
	const [consentTotal, setConsentTotal] = useState(0);
	const [consentPage, setConsentPage] = useState(1);
	// A-268f（RC-B2-14 P2）：失败 ≠ 空态。403 专用文案（权限不足/管理面配置缺失）与通用失败文案分流。
	const [consentsError, setConsentsError] = useState<'forbidden' | 'failed' | null>(null);
	const [activeTab, setActiveTab] = useState('config');
	const [form] = Form.useForm();
	const tenantId = useCurrentTenantId() ?? '';

	useEffect(() => {
		loadConfig();
		// A-271（W1e）：users 挂载即载（旧实现仅 Tab 点击懒加载 → 统计卡恒 0 直到点击）
		loadUsers();
	}, []);

	const loadConfig = async () => {
		try {
			const res = await apiClient.get(API_PATHS.TENANT.MINORS_PROTECTION(tenantId));
			// DataResponse 信封已由拦截器解包 + 深 camel：res.data 即配置对象（契约直读）
			const d = res.data as MinorsProtectionConfig;
			setConfig(d);
			setConfigError(false);
			form.setFieldsValue({
				dailyUsageLimitMin: d.dailyUsageLimitMin,
				monthlySpendLimit: d.monthlySpendLimit,
				nightModeEnabled: d.nightModeEnabled,
				nightModeStart: d.nightModeStart
					? dayjs(d.nightModeStart, 'HH:mm')
					: dayjs('22:00', 'HH:mm'),
				nightModeEnd: d.nightModeEnd
					? dayjs(d.nightModeEnd, 'HH:mm')
					: dayjs('06:00', 'HH:mm'),
				liveStreamBlockedUnder16: d.liveStreamBlockedUnder16,
				contentFilterEnabled: d.contentFilterEnabled,
				childDefaultMaxPrivacy: d.childDefaultMaxPrivacy,
				minorDataRetentionDays: d.minorDataRetentionDays,
			});
		} catch {
			setConfigError(true);
		} finally {
			setLoading(false);
		}
	};

	/** 错误态重试：回到加载态再取数（configError 由 loadConfig 成功路径清除）。 */
	const retryLoadConfig = () => {
		setLoading(true);
		loadConfig();
	};

	const loadUsers = async (page: number = userPage) => {
		usersRequestedRef.current = true;
		setUsersLoading(true);
		try {
			// 请求侧 camel 书面写（拦截器 snake 化）；分页经 toPageParams 单点。
			// isMinor 过滤为后端实名参数（identity dto/user.go:59 form:"is_minor"），生成签名未收编故 as any 收窄。
			const res = await adminUsers({
				isMinor: true,
				...toPageParams({ page, pageSize: PAGE_SIZE }),
			} as any);
			const result = fromPageResult<MinorUser>(res);
			setUsers(result.items);
			setUserTotal(result.total);
			setUserPage(page);
			setUsersLoaded(true);
		} catch (err) {
			handleApiError(err, t('compliance.minors.loadUsersFailed'));
		} finally {
			setUsersLoading(false);
		}
	};

	const loadConsents = async (page: number = consentPage) => {
		setConsentsLoading(true);
		try {
			const res = await apiClient.get(API_PATHS.IDENTITY.ADMIN_CONSENTS, {
				params: toPageParams({ page, pageSize: PAGE_SIZE }),
			});
			const result = fromPageResult<ConsentRecord>(res.data);
			setConsents(result.items);
			setConsentTotal(result.total);
			setConsentPage(page);
			setConsentsError(null);
		} catch (err) {
			// 403 = 权限不足或管理面配置缺失（TASK-AB2-32 网关声明面）；其余失败走通用文案。
			const status = (err as { response?: { status?: number } })?.response?.status;
			setConsentsError(status === 403 ? 'forbidden' : 'failed');
		} finally {
			setConsentsLoading(false);
		}
	};

	const handleTabChange = (key: string) => {
		setActiveTab(key);
		// A-271（W1e）：挂载已在飞/已载（ref 同步置位）→ Tab 点击不二次触发
		if (key === 'users' && !usersRequestedRef.current) loadUsers();
		if (key === 'consents' && consents.length === 0) loadConsents();
	};

	const handleSave = async () => {
		try {
			const values = await form.validateFields();
			setSaving(true);
			// 提交侧 camel 书面写（拦截器 snake 化上 wire）
			const payload: Record<string, unknown> = {};
			payload.dailyUsageLimitMin = values.dailyUsageLimitMin;
			payload.monthlySpendLimit = values.monthlySpendLimit;
			payload.nightModeEnabled = values.nightModeEnabled;
			payload.liveStreamBlockedUnder16 = values.liveStreamBlockedUnder16;
			payload.contentFilterEnabled = values.contentFilterEnabled;
			payload.childDefaultMaxPrivacy = values.childDefaultMaxPrivacy;
			payload.minorDataRetentionDays = values.minorDataRetentionDays;
			if (values.nightModeStart) payload.nightModeStart = values.nightModeStart.format('HH:mm');
			if (values.nightModeEnd) payload.nightModeEnd = values.nightModeEnd.format('HH:mm');
			await apiClient.put(API_PATHS.TENANT.MINORS_PROTECTION(tenantId), payload);
			message.success(t('compliance.minors.saveSuccess'));
			loadConfig();
		} catch (err) {
			// W0-04（TASK-AB2-04）：空更新被后端显式 422 empty_update 拒绝——承接为可读中文，
			// 不再让英文 title "Validation Failed" 穿透（extractApiErrorMessage 优先 title）。
			const emptyUpdate = (
				err as { response?: { data?: { errors?: Array<{ code?: string }> } } }
			)?.response?.data?.errors?.some((e) => e?.code === 'empty_update');
			if (emptyUpdate) {
				message.error(t('compliance.minors.saveEmptyUpdate'));
			} else {
				handleApiError(err, t('compliance.minors.saveFailed'));
			}
		} finally {
			setSaving(false);
		}
	};

	const userColumns = [
		{
			title: t('compliance.minors.columnUserId'),
			dataIndex: 'id',
			key: 'id',
			width: 200,
			ellipsis: true,
		},
		{ title: t('common.email'), dataIndex: 'email', key: 'email' },
		{ title: t('compliance.minors.columnPhone'), dataIndex: 'phone', key: 'phone' },
		{
			title: t('compliance.minors.columnAgeGroup'),
			dataIndex: 'ageGroup',
			key: 'ageGroup',
			render: (v: string) => (
				<Tag color={v === 'under-14' ? 'red' : v === '14-16' ? 'orange' : 'blue'}>
					{AGE_GROUP_LABELS[v] || v}
				</Tag>
			),
		},
		{
			title: t('compliance.minors.columnParentalConsent'),
			dataIndex: 'pendingParentalConsent',
			key: 'pendingParentalConsent',
			render: (v: boolean) =>
				v ? (
					<Tag color="orange">{t('compliance.minors.pendingVerification')}</Tag>
				) : (
					<Tag color="green">{t('compliance.minors.verified')}</Tag>
				),
		},
		{ title: t('compliance.minors.columnStatus'), dataIndex: 'status', key: 'status' },
		{
			title: t('compliance.minors.columnCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 180,
		},
	];

	if (loading) return <Spin size="large" className="block mx-auto my-20" />;

	return (
		<div>
			<AppPageHeader title={t('compliance.minors.title')} description={t('compliance.minors.subtitle')} />

			{/* 配置不可知时统计卡整体退场：绝不呈现伪 0（「0 分钟/关闭」= 把失败伪装成未配置）。 */}
			{!configError && (
				<Row gutter={16} className="mb-6">
					<Col span={8}>
						<Card>
							{/* A-271（W1e）：三态——加载中 '-' / 已载真值（首屏不再恒 0 伪值） */}
							<Statistic
								title={t('compliance.minors.userCount')}
								value={usersLoaded ? userTotal : undefined}
								prefix={<User size="1em" />}
							/>
						</Card>
					</Col>
					<Col span={8}>
						<Card>
							<Statistic
								title={t('compliance.minors.dailyLimit')}
								value={config?.dailyUsageLimitMin || 0}
								suffix={t('compliance.minors.minutes')}
							/>
						</Card>
					</Col>
					<Col span={8}>
						<Card>
							<Statistic
								title={t('compliance.minors.curfew')}
								value={
									config?.nightModeEnabled
										? `${config.nightModeStart}-${config.nightModeEnd}`
										: t('compliance.minors.curfewOff')
								}
								prefix={<BadgeCheck size="1em" />}
							/>
						</Card>
					</Col>
				</Row>
			)}

			<Tabs
				activeKey={activeTab}
				onChange={handleTabChange}
				items={[
					{
						key: 'config',
						label: t('compliance.minors.tabConfig'),
						children: configError ? (
							<PageError
								message={t('compliance.minors.loadConfigFailed')}
								retry={retryLoadConfig}
							/>
						) : (
							<>
								<SectionCard title={t('compliance.minors.sectionAntiAddiction')}>
									<Form form={form} layout="vertical" className="max-w-[600px]">
										<Form.Item
											name="dailyUsageLimitMin"
											label={t('compliance.minors.dailyUsageLimit')}
											tooltip={t('compliance.minors.dailyUsageTooltip')}
										>
											<InputNumber min={0} max={1440} className="w-full" />
										</Form.Item>
										<Form.Item
											name="nightModeEnabled"
											label={t('compliance.minors.enableCurfew')}
											valuePropName="checked"
										>
											<Switch />
										</Form.Item>
										<Form.Item
											shouldUpdate={(prev, cur) =>
												prev.nightModeEnabled !== cur.nightModeEnabled
											}
										>
											{({ getFieldValue }) =>
												getFieldValue('nightModeEnabled') ? (
													<Space>
														<Form.Item
															name="nightModeStart"
															label={t('compliance.minors.curfewStart')}
														>
															<TimePicker format="HH:mm" />
														</Form.Item>
														<Form.Item
															name="nightModeEnd"
															label={t('compliance.minors.curfewEnd')}
														>
															<TimePicker format="HH:mm" />
														</Form.Item>
													</Space>
												) : null
											}
										</Form.Item>
									</Form>
								</SectionCard>

								<SectionCard title={t('compliance.minors.sectionSpending')} className="mt-4">
									<Form form={form} layout="vertical" className="max-w-[600px]">
										<Form.Item
											name="monthlySpendLimit"
											label={t('compliance.minors.monthlySpendLimit')}
											tooltip={t('compliance.minors.monthlySpendTooltip')}
										>
											<InputNumber min={0} className="w-full" />
										</Form.Item>
										<Form.Item
											name="liveStreamBlockedUnder16"
											label={t('compliance.minors.blockLiveUnder16')}
											valuePropName="checked"
										>
											<Switch />
										</Form.Item>
										<Form.Item
											name="contentFilterEnabled"
											label={t('compliance.minors.enableContentFilter')}
											valuePropName="checked"
										>
											<Switch />
										</Form.Item>
									</Form>
								</SectionCard>

								<SectionCard title={t('compliance.minors.sectionPrivacy')} className="mt-4">
									<Form form={form} layout="vertical" className="max-w-[600px]">
										<Form.Item
											name="childDefaultMaxPrivacy"
											label={t('compliance.minors.defaultMaxPrivacy')}
											valuePropName="checked"
										>
											<Switch />
										</Form.Item>
										<Form.Item
											name="minorDataRetentionDays"
											label={t('compliance.minors.dataRetentionDays')}
										>
											<InputNumber min={30} max={3650} className="w-full" />
										</Form.Item>
									</Form>
									{/* A-272（W1e，分支②补展示）：wire 两阈值字段（minors_age_threshold/digital_consent_age）原零 UI → 只读回显 */}
									<div className="text-neutral-600 text-sm">
										{t('compliance.minors.ageThresholdLabel')}：
										{config?.minorsAgeThreshold ?? '-'} ·{' '}
										{t('compliance.minors.digitalConsentAgeLabel')}：
										{config?.digitalConsentAge ?? '-'}
									</div>
								</SectionCard>

								<div className="mt-6 text-right">
									<Button onClick={loadConfig} icon={<RefreshCw size="1em" />} className="mr-2">
										{t('compliance.minors.reset')}
									</Button>
									<Button
										type="primary"
										onClick={handleSave}
										loading={saving}
										icon={<Save size="1em" />}
									>
										{t('compliance.minors.saveConfig')}
									</Button>
								</div>
							</>
						),
					},
					{
						key: 'users',
						label: `${t('compliance.minors.userTab')} (${userTotal})`,
						children: (
							<DataTable
								columns={userColumns}
								dataSource={users}
								rowKey="id"
								loading={usersLoading}
								pagination={{
									current: userPage,
									pageSize: PAGE_SIZE,
									total: userTotal,
									onChange: (p) => loadUsers(p),
									showSizeChanger: false,
									// A-270（W1e）：模板为 {{total}} 而旧传 { count } ⇒ DOM 字面量；改传 { total }
									showTotal: (total) => t('paginationTotal', { total }),
								}}
								scroll={{ x: 800 }}
							/>
						),
					},
					{
						key: 'consents',
						label: t('compliance.minors.parentalConsentTab'),
						// 失败 ≠ 空态：错误成全屏占位（含重试），空表仅在真实空数据时出现。
						children: consentsError ? (
							<PageError
								message={
									consentsError === 'forbidden'
										? t('compliance.minors.consentsForbidden')
										: t('compliance.minors.loadConsentsFailed')
								}
								retry={loadConsents}
							/>
						) : (
							<DataTable
								columns={[
									{
										title: t('compliance.minors.columnUserId'),
										dataIndex: 'userId',
										key: 'userId',
										width: 200,
										ellipsis: true,
									},
									{
										title: t('compliance.minors.parentEmail'),
										dataIndex: 'parentEmail',
										key: 'parentEmail',
									},
									{
										title: t('compliance.minors.verificationMethod'),
										dataIndex: 'method',
										key: 'method',
									},
									{
										title: t('common.status'),
										dataIndex: 'status',
										key: 'status',
										render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
									},
									{
										title: t('compliance.minors.isVerified'),
										dataIndex: 'verified',
										key: 'verified',
										render: (v: boolean) =>
											v ? (
												<Tag color="green">{t('compliance.minors.yes')}</Tag>
											) : (
												<Tag>{t('compliance.minors.no')}</Tag>
											),
									},
									{
										title: t('compliance.minors.recordTime'),
										dataIndex: 'recordedAt',
										key: 'recordedAt',
										width: 180,
									},
								]}
								dataSource={consents}
								rowKey="id"
								loading={consentsLoading}
								pagination={{
									current: consentPage,
									pageSize: PAGE_SIZE,
									total: consentTotal,
									onChange: (p) => loadConsents(p),
									showSizeChanger: false,
								}}
								scroll={{ x: 800 }}
							/>
						),
					},
				]}
			/>
		</div>
	);
}

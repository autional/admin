'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { Card, Tag, Descriptions, Tabs, Button, Spin, Empty, Row, Col, Statistic, Modal, Form, Input, InputNumber, Select, Space } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	ReloadOutlined,
	PlusOutlined,
	EditOutlined,
	DeleteOutlined,
	CheckOutlined,
	CloseOutlined,
	PlayCircleOutlined,
} from '@ant-design/icons';

import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import { handleApiError } from '@/lib/error-handler';
import { useTranslation } from 'react-i18next';
import {
	useBillingSubscription,
	useBillingUsage,
	useBillingStatistics,
	useBillingRecords,
	usePlans,
	useCreatePlan,
	useUpdatePlan,
	useDeletePlan,
	usePaymentGateways,
	useCreatePaymentGateway,
	useUpdatePaymentGateway,
	useRefundApprovals,
	useApproveRefund,
	useRejectRefund,
	useExecuteRefund,
	useDunningSettings,
	useUpdateDunningSettings,
} from '@/hooks/use-billing';
import type { BillingRecord, Plan, PaymentGateway, RefundApproval } from '@/hooks/use-billing';

/**
 * 判断错误是否为"资源/记录不存在"（业务 404：61110004 resource not found / 61110025 usage stats not found / HTTP 404）。
 * 此类错误应显示空态而非"加载失败"（BUG-016：租户无订阅/用量记录时）。
 */
function isNotFoundError(err: unknown): boolean {
	if (!err) return false;
	const e = err as any;
	const code = e?.response?.data?.code ?? e?.code ?? e?.status;
	if (code === 404) return true;
	if (typeof code === 'number') return code === 61110004 || code === 61110025;
	if (typeof code === 'string') return code.includes('404') || code.includes('not_found') || code.includes('not found');
	return false;
}

export default function BillingPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const [activeTab, setActiveTab] = useState('subscription');

	const {
		data: subscription,
		isLoading: subLoading,
		error: subError,
		refetch: subRefetch,
	} = useBillingSubscription(tenantId);

	const {
		data: usage,
		isLoading: usageLoading,
		error: usageError,
		refetch: usageRefetch,
	} = useBillingUsage(tenantId);

	const {
		data: statistics,
		isLoading: statsLoading,
		error: statsError,
		refetch: statsRefetch,
	} = useBillingStatistics(tenantId);

	const {
		data: records = [],
		isLoading: recordsLoading,
		error: recordsError,
		refetch: recordsRefetch,
	} = useBillingRecords(tenantId);

	const {
		data: plans = [],
		isLoading: plansLoading,
		error: plansError,
		refetch: plansRefetch,
	} = usePlans();

	const {
		data: paymentGateways = [],
		isLoading: gatewaysLoading,
		error: gatewaysError,
		refetch: gatewaysRefetch,
	} = usePaymentGateways();

	const {
		data: refundApprovals = [],
		isLoading: refundsLoading,
		error: refundsError,
		refetch: refundsRefetch,
	} = useRefundApprovals();

	const {
		data: dunningSettings,
		isLoading: dunningLoading,
		error: dunningError,
		refetch: dunningRefetch,
	} = useDunningSettings(tenantId);

	const createPlanMut = useCreatePlan();
	const updatePlanMut = useUpdatePlan();
	const deletePlanMut = useDeletePlan();
	const createGatewayMut = useCreatePaymentGateway();
	const updateGatewayMut = useUpdatePaymentGateway();
	const approveRefundMut = useApproveRefund();
	const rejectRefundMut = useRejectRefund();
	const executeRefundMut = useExecuteRefund();
	const updateDunningMut = useUpdateDunningSettings();

	const [planModal, setPlanModal] = useState(false);
	const [planForm] = Form.useForm();
	const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

	const [gatewayModal, setGatewayModal] = useState(false);
	const [gatewayForm] = Form.useForm();
	const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);

	const [executeModal, setExecuteModal] = useState(false);
	const [executeForm] = Form.useForm();
	const [executingRefund, setExecutingRefund] = useState<RefundApproval | null>(null);

	const [dunningForm] = Form.useForm();

	React.useEffect(() => {
		if (dunningSettings) {
			dunningForm.setFieldsValue(dunningSettings);
		}
	}, [dunningSettings, dunningForm]);

	const channelLabels: Record<string, string> = {
		wechat: t('billing.gateways.channel.wechat'),
		alipay: t('billing.gateways.channel.alipay'),
		stripe: t('billing.gateways.channel.stripe'),
		paypal: t('billing.gateways.channel.paypal'),
	};

	const handleSavePlan = async (values: any) => {
		try {
			if (editingPlan) {
				await updatePlanMut.mutateAsync({ id: editingPlan.id, data: values });
				message.success(t('billing.planUpdated'));
			} else {
				await createPlanMut.mutateAsync(values);
				message.success(t('billing.planCreated'));
			}
			setPlanModal(false);
			planForm.resetFields();
			setEditingPlan(null);
		} catch (err) {
			handleApiError(err, t('billing.saveFailed'));
		}
	};

	const handleDeletePlan = (id: string) => {
		modal.confirm({
			title: t('billing.confirmDeleteTitle'),
			content: t('billing.confirmDeleteContent'),
			okText: t('common.delete'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deletePlanMut.mutateAsync(id);
					message.success(t('billing.deleteSuccess'));
				} catch (err) {
					handleApiError(err, t('billing.deleteFailed'));
				}
			},
		});
	};

	const handleSaveGateway = async (values: any) => {
		try {
			if (editingGateway) {
				await updateGatewayMut.mutateAsync({ id: editingGateway.id, data: values });
				message.success(t('billing.gatewayUpdated'));
			} else {
				await createGatewayMut.mutateAsync(values);
				message.success(t('billing.gatewayCreated'));
			}
			setGatewayModal(false);
			gatewayForm.resetFields();
			setEditingGateway(null);
		} catch (err) {
			handleApiError(err, t('billing.saveFailed'));
		}
	};

	const handleApproveRefund = (id: string) => {
		modal.confirm({
			title: t('billing.confirmApproveTitle'),
			content: t('billing.confirmApproveContent'),
			okText: t('billing.approve'),
			onOk: async () => {
				try {
					await approveRefundMut.mutateAsync(id);
					message.success(t('billing.approved'));
				} catch (err) {
					handleApiError(err, t('billing.operationFailed'));
				}
			},
		});
	};

	const handleRejectRefund = (id: string) => {
		modal.confirm({
			title: t('billing.confirmRejectTitle'),
			content: t('billing.confirmRejectContent'),
			okText: t('billing.reject'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await rejectRefundMut.mutateAsync(id);
					message.success(t('billing.rejected'));
				} catch (err) {
					handleApiError(err, t('billing.operationFailed'));
				}
			},
		});
	};

	const handleExecuteRefund = async (values: { remark: string }) => {
		if (!executingRefund || !tenantId) return;
		try {
			await executeRefundMut.mutateAsync({
				id: executingRefund.id,
				data: { ...values },
			});
			message.success(t('billing.refundExecuted'));
			setExecuteModal(false);
			executeForm.resetFields();
			setExecutingRefund(null);
		} catch (err) {
			handleApiError(err, t('billing.executeFailed'));
		}
	};

	const handleSaveDunning = async (values: any) => {
		if (!tenantId) return;
		try {
			await updateDunningMut.mutateAsync({ tenantId, data: values });
			message.success(t('billing.dunningSaved'));
		} catch (err) {
			handleApiError(err, t('billing.saveFailed'));
		}
	};

	const recordColumns = [
		{ title: t('billing.records.column.id'), dataIndex: 'id', key: 'id', ellipsis: true },
		{
			title: t('billing.records.column.type'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string) => <Tag>{v}</Tag>,
		},
		{
			title: t('billing.records.column.amount'),
			dataIndex: 'amount',
			key: 'amount',
			render: (v: number) => (v != null ? `$${v.toFixed(2)}` : '-'),
		},
		{
			title: t('billing.records.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag color={v === 'completed' ? 'success' : v === 'pending' ? 'processing' : 'default'}>
					{v}
				</Tag>
			),
		},
		{
			title: t('billing.records.column.description'),
			dataIndex: 'description',
			key: 'description',
			ellipsis: true,
		},
		{
			title: t('billing.records.column.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
	];

	const planColumns = [
		{ title: t('common.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('billing.plans.column.code'),
			dataIndex: 'code',
			key: 'code',
			render: (v: string) => <Tag>{v || '-'}</Tag>,
		},
		{
			title: t('billing.plans.column.monthlyPrice'),
			dataIndex: 'monthlyPrice',
			key: 'monthlyPrice',
			render: (v: number) => (v != null ? `$${v.toFixed(2)}` : '-'),
		},
		{
			title: t('billing.plans.column.yearlyPrice'),
			dataIndex: 'yearlyPrice',
			key: 'yearlyPrice',
			render: (v: number) => (v != null ? `$${v.toFixed(2)}` : '-'),
		},
		{
			title: t('billing.plans.column.features'),
			dataIndex: 'features',
			key: 'features',
			render: (v: string[]) =>
				v?.length
					? v.slice(0, 3).map((f) => (
							<Tag key={f} className="mb-1">
								{f}
							</Tag>
						))
					: '-',
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'active' ? 'success' : 'default'}>{v || '-'}</Tag>,
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: Plan) => (
				<Space size="small">
					<Button
						type="link"
						icon={<EditOutlined />}
						onClick={() => {
							setEditingPlan(record);
							planForm.setFieldsValue(record);
							setPlanModal(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="link"
						danger
						icon={<DeleteOutlined />}
						onClick={() => handleDeletePlan(record.id)}
					>
						{t('common.delete')}
					</Button>
				</Space>
			),
		},
	];

	const gatewayColumns = [
		{ title: t('common.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('billing.gateways.column.channel'),
			dataIndex: 'channel',
			key: 'channel',
			render: (v: string) => <Tag color="blue">{channelLabels[v] || v}</Tag>,
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'active' ? 'success' : 'default'}>{v || '-'}</Tag>,
		},
		{
			title: t('common.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => (v ? new Date(v).toLocaleDateString() : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: PaymentGateway) => (
				<Button
					type="link"
					icon={<EditOutlined />}
					onClick={() => {
						setEditingGateway(record);
						gatewayForm.setFieldsValue(record);
						setGatewayModal(true);
					}}
				>
					{t('common.edit')}
				</Button>
			),
		},
	];

	const refundColumns = [
		{
			title: t('billing.refunds.column.id'),
			dataIndex: 'id',
			key: 'id',
			ellipsis: true,
			width: 180,
		},
		{
			title: t('billing.refunds.column.amount'),
			dataIndex: 'amount',
			key: 'amount',
			render: (v: number) => `$${v?.toFixed(2) || '-'}`,
		},
		{
			title: t('billing.refunds.column.reason'),
			dataIndex: 'reason',
			key: 'reason',
			ellipsis: true,
		},
		{
			title: t('billing.refunds.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag
					color={
						v === 'approved'
							? 'success'
							: v === 'pending'
								? 'processing'
								: v === 'rejected'
									? 'error'
									: 'default'
					}
				>
					{v}
				</Tag>
			),
		},
		{
			title: t('billing.refunds.column.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => (v ? new Date(v).toLocaleDateString() : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: RefundApproval) => {
				if (record.status === 'pending') {
					return (
						<Space size="small">
							<Button
								type="link"
								icon={<CheckOutlined />}
								onClick={() => handleApproveRefund(record.id)}
							>
								{t('billing.approve')}
							</Button>
							<Button
								type="link"
								danger
								icon={<CloseOutlined />}
								onClick={() => handleRejectRefund(record.id)}
							>
								{t('billing.reject')}
							</Button>
						</Space>
					);
				}
				if (record.status === 'approved') {
					return (
						<Button
							type="link"
							icon={<PlayCircleOutlined />}
							onClick={() => {
								setExecutingRefund(record);
								executeForm.resetFields();
								setExecuteModal(true);
							}}
						>
							{t('billing.executeRefund')}
						</Button>
					);
				}
				return '-';
			},
		},
	];

	const tabItems = [
		{
			key: 'subscription',
			label: t('billing.tab.subscription'),
			children: (
				<Card>
					{subLoading ? (
						<Spin className="flex justify-center py-8" />
					) : subError ? (
						// 61110004/404 = 记录不存在（租户无订阅）→ 显示空态而非加载失败（BUG-016）
						isNotFoundError(subError) ? (
							<Empty description={t('billing.subscription.empty')} />
						) : (
							<PageError message={t('billing.subscription.loadError')} retry={subRefetch} />
						)
					) : subscription ? (
						<Descriptions column={2} bordered size="small">
							<Descriptions.Item label={t('billing.subscription.plan')}>
								{subscription.planId || subscription.plan || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('billing.subscription.status')}>
								<Tag color={subscription.status === 'active' ? 'success' : 'default'}>
									{subscription.status === 'active'
										? t('applications.status.active')
										: subscription.status === 'suspended'
											? t('applications.status.suspended')
											: subscription.status === 'inactive'
												? t('applications.status.inactive')
												: subscription.status || '-'}
								</Tag>
							</Descriptions.Item>
							<Descriptions.Item label={t('billing.subscription.startDate')}>
								{subscription.currentPeriodStart || subscription.startDate
									? new Date(
											(subscription.currentPeriodStart || subscription.startDate) as string,
										).toLocaleDateString()
									: '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('billing.subscription.currentPeriodEnd')}>
								{subscription.currentPeriodEnd
									? new Date(subscription.currentPeriodEnd).toLocaleDateString()
									: '-'}
							</Descriptions.Item>
							{subscription.seats != null && (
								<Descriptions.Item label={t('billing.subscription.seats')}>
									{subscription.seats}
								</Descriptions.Item>
							)}
							{subscription.amount != null && (
								<Descriptions.Item label={t('billing.subscription.price')}>
									{subscription.currency || ''} {subscription.amount}
								</Descriptions.Item>
							)}
						</Descriptions>
					) : (
						<Empty description={t('billing.subscription.noData')} />
					)}
				</Card>
			),
		},
		{
			key: 'usage',
			label: t('billing.tab.usage'),
			children: (
				<Card>
					{usageLoading ? (
						<Spin className="flex justify-center py-8" />
					) : usageError ? (
						// 61110025/404 = 用量记录不存在 → 空态（BUG-016）
						isNotFoundError(usageError) ? (
							<Empty description={t('billing.usage.empty')} />
						) : (
							<PageError message={t('billing.usage.loadError')} retry={usageRefetch} />
						)
					) : usage ? (
						<div className="space-y-4">
							<Row gutter={16}>
								<Col span={8}>
									<Card size="small">
										<Statistic title={t('billing.usage.used')} value={usage.total || 0} />
									</Card>
								</Col>
								<Col span={8}>
									<Card size="small">
										<Statistic title={t('billing.usage.quota')} value={usage.quota || 0} />
									</Card>
								</Col>
								<Col span={8}>
									<Card size="small">
										<Statistic title={t('billing.usage.remaining')} value={usage.remaining || 0} />
									</Card>
								</Col>
							</Row>
							<Row gutter={16} className="mt-3">
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.usage.smsSent')}
											value={usage.smsSent || 0}
											suffix={`/ ${usage.smsQuota || 0}${t('billing.usage.perDay')}`}
										/>
									</Card>
								</Col>
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.usage.emailSent')}
											value={usage.emailSent || 0}
											suffix={`/ ${usage.emailQuota || 0}${t('billing.usage.perDay')}`}
										/>
									</Card>
								</Col>
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.usage.apiRequests')}
											value={usage.apiRequests || 0}
										/>
									</Card>
								</Col>
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.usage.userCount')}
											value={usage.userCount || 0}
											suffix={`/ ${usage.maxUsers || 0}`}
										/>
									</Card>
								</Col>
							</Row>
							{usage.usage && usage.usage.length > 0 && (
								<div className="mt-4">
									<h4 className="text-sm font-medium mb-2">{t('billing.usage.trend')}</h4>
									<DataTable
										rowKey="date"
										dataSource={usage.usage}
										pagination={false}
										scroll={{ x: 800 }}
										columns={[
											{ title: t('billing.usage.column.date'), dataIndex: 'date', key: 'date' },
											{
												title: t('billing.usage.column.amount'),
												dataIndex: 'amount',
												key: 'amount',
											},
										]}
									/>
								</div>
							)}
						</div>
					) : (
						<Empty description={t('billing.usage.noData')} />
					)}
				</Card>
			),
		},
		{
			key: 'statistics',
			label: t('billing.tab.statistics'),
			children: (
				<Card>
					{statsLoading ? (
						<Spin className="flex justify-center py-8" />
					) : statsError ? (
						<PageError message={t('billing.statistics.loadError')} retry={statsRefetch} />
					) : statistics ? (
						<Row gutter={16}>
							{statistics.totalRevenue != null && (
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.statistics.totalRevenue')}
											prefix="$"
											value={statistics.totalRevenue}
										/>
									</Card>
								</Col>
							)}
							{statistics.activeSubscriptions != null && (
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.statistics.activeSubscriptions')}
											value={statistics.activeSubscriptions}
										/>
									</Card>
								</Col>
							)}
							{statistics.mrr != null && (
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.statistics.mrr')}
											prefix="$"
											value={statistics.mrr}
										/>
									</Card>
								</Col>
							)}
							{statistics.churnRate != null && (
								<Col span={6}>
									<Card size="small">
										<Statistic
											title={t('billing.statistics.churnRate')}
											suffix="%"
											value={statistics.churnRate}
										/>
									</Card>
								</Col>
							)}
						</Row>
					) : (
						<Empty description={t('billing.statistics.noData')} />
					)}
				</Card>
			),
		},
		{
			key: 'records',
			label: t('billing.tab.records'),
			children: (
				<>
					{recordsError && (
						<PageError
							message={t('billing.records.loadError')}
							retry={recordsRefetch}
							className="mb-4"
						/>
					)}
					<DataTable
						rowKey="id"
						columns={recordColumns}
						dataSource={records}
						loading={recordsLoading}
						pagination={{ pageSize: 10 }}
						locale={{ emptyText: <Empty description={t('billing.records.noData')} /> }}
						scroll={{ x: 800 }}
					/>
				</>
			),
		},
		{
			key: 'plans',
			label: t('billing.tab.plans'),
			children: (
				<>
					<div className="flex justify-end mb-4">
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								setEditingPlan(null);
								planForm.resetFields();
								setPlanModal(true);
							}}
						>
							{t('billing.plans.createPlan')}
						</Button>
					</div>
					{plansError && (
						<PageError
							message={t('billing.plans.loadError')}
							retry={plansRefetch}
							className="mb-4"
						/>
					)}
					<DataTable
						rowKey="id"
						columns={planColumns}
						dataSource={plans}
						loading={plansLoading}
						pagination={{ pageSize: 10 }}
						locale={{ emptyText: <Empty description={t('billing.plans.noPlans')} /> }}
						scroll={{ x: 800 }}
					/>
				</>
			),
		},
		{
			key: 'gateways',
			label: t('billing.tab.gateways'),
			children: (
				<>
					<div className="flex justify-end mb-4">
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								setEditingGateway(null);
								gatewayForm.resetFields();
								setGatewayModal(true);
							}}
						>
							{t('billing.gateways.createGateway')}
						</Button>
					</div>
					{gatewaysError && (
						<PageError
							message={t('billing.gateways.loadError')}
							retry={gatewaysRefetch}
							className="mb-4"
						/>
					)}
					<DataTable
						rowKey="id"
						columns={gatewayColumns}
						dataSource={paymentGateways}
						loading={gatewaysLoading}
						pagination={{ pageSize: 10 }}
						locale={{ emptyText: <Empty description={t('billing.gateways.noGateways')} /> }}
						scroll={{ x: 800 }}
					/>
				</>
			),
		},
		{
			key: 'refunds',
			label: t('billing.tab.refunds'),
			children: (
				<>
					{refundsError && (
						<PageError
							message={t('billing.refunds.loadError')}
							retry={refundsRefetch}
							className="mb-4"
						/>
					)}
					<DataTable
						rowKey="id"
						columns={refundColumns}
						dataSource={refundApprovals}
						loading={refundsLoading}
						pagination={{ pageSize: 10 }}
						locale={{ emptyText: <Empty description={t('billing.refunds.noRefunds')} /> }}
						scroll={{ x: 800 }}
					/>
				</>
			),
		},
		{
			key: 'dunning',
			label: t('billing.tab.dunning'),
			children: (
				<div className="max-w-lg">
					{dunningError && (
						<PageError
							message={t('billing.dunning.loadError')}
							retry={dunningRefetch}
							className="mb-4"
						/>
					)}
					{dunningLoading ? (
						<Spin className="flex justify-center py-8" />
					) : (
						<Form form={dunningForm} layout="vertical" onFinish={handleSaveDunning}>
							<Form.Item name="gracePeriodDays" label={t('billing.dunning.form.gracePeriod')}>
								<InputNumber className="w-full" min={0} max={90} />
							</Form.Item>
							<Form.Item name="autoCancelDays" label={t('billing.dunning.form.autoCancelDays')}>
								<InputNumber className="w-full" min={0} max={180} />
							</Form.Item>
							<Form.Item name="status" label={t('common.status')} initialValue="active">
								<Select
									options={[
										{ value: 'active', label: t('common.enable') },
										{ value: 'inactive', label: t('common.disable') },
									]}
								/>
							</Form.Item>
							<Button type="primary" htmlType="submit" loading={updateDunningMut.isPending}>
								{t('billing.dunning.form.saveBtn')}
							</Button>
						</Form>
					)}
				</div>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('billing.title')}
				actions={
					<>
						<Button
							icon={<ReloadOutlined />}
							onClick={() => {
								subRefetch();
								usageRefetch();
								statsRefetch();
								recordsRefetch();
								plansRefetch();
								gatewaysRefetch();
								refundsRefetch();
								dunningRefetch();
								message.success(t('billing.refreshed'));
							}}
						>
							{t('common.refresh')}
						</Button>
					</>
				}
			/>

			<Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

			<Modal
				title={editingPlan ? t('billing.plans.editPlan') : t('billing.plans.createPlan')}
				open={planModal}
				onCancel={() => {
					setPlanModal(false);
					setEditingPlan(null);
					planForm.resetFields();
				}}
				onOk={() => planForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={planForm} layout="vertical" onFinish={handleSavePlan}>
					<Form.Item name="name" label={t('billing.plans.form.name')} rules={[{ required: true }]}>
						<Input placeholder={t('billing.plans.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="code" label={t('billing.plans.form.code')}>
						<Input placeholder={t('billing.plans.form.codePlaceholder')} />
					</Form.Item>
					<Form.Item name="monthlyPrice" label={t('billing.plans.form.monthlyPrice')}>
						<InputNumber
							className="w-full"
							min={0}
							precision={2}
							placeholder={t('billing.plans.form.monthlyPricePlaceholder')}
						/>
					</Form.Item>
					<Form.Item name="yearlyPrice" label={t('billing.plans.form.yearlyPrice')}>
						<InputNumber
							className="w-full"
							min={0}
							precision={2}
							placeholder={t('billing.plans.form.yearlyPricePlaceholder')}
						/>
					</Form.Item>
					<Form.Item name="description" label={t('common.description')}>
						<Input.TextArea rows={3} placeholder={t('billing.plans.form.descriptionPlaceholder')} />
					</Form.Item>
					<Form.Item name="status" label={t('common.status')} initialValue="active">
						<Select
							options={[
								{ value: 'active', label: t('common.enable') },
								{ value: 'inactive', label: t('common.disable') },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={
					editingGateway ? t('billing.gateways.editGateway') : t('billing.gateways.createGateway')
				}
				open={gatewayModal}
				onCancel={() => {
					setGatewayModal(false);
					setEditingGateway(null);
					gatewayForm.resetFields();
				}}
				onOk={() => gatewayForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={gatewayForm} layout="vertical" onFinish={handleSaveGateway}>
					<Form.Item
						name="name"
						label={t('billing.gateways.form.name')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('billing.gateways.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="channel"
						label={t('billing.gateways.form.channel')}
						rules={[{ required: true }]}
					>
						<Select
							placeholder={t('billing.gateways.form.channelPlaceholder')}
							options={[
								{ value: 'wechat', label: t('billing.gateways.channel.wechat') },
								{ value: 'alipay', label: t('billing.gateways.channel.alipay') },
								{ value: 'stripe', label: t('billing.gateways.channel.stripe') },
								{ value: 'paypal', label: t('billing.gateways.channel.paypal') },
							]}
						/>
					</Form.Item>
					<Form.Item name="callbackUrl" label={t('billing.gateways.form.callbackUrl')}>
						<Input placeholder={t('billing.gateways.form.callbackUrlPlaceholder')} />
					</Form.Item>
					<Form.Item name="status" label={t('common.status')} initialValue="active">
						<Select
							options={[
								{ value: 'active', label: t('common.enable') },
								{ value: 'inactive', label: t('common.disable') },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('billing.refunds.executeTitle')}
				open={executeModal}
				onCancel={() => {
					setExecuteModal(false);
					setExecutingRefund(null);
					executeForm.resetFields();
				}}
				onOk={() => executeForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={executeForm} layout="vertical" onFinish={handleExecuteRefund}>
					<Form.Item name="remark" label={t('billing.refunds.form.remark')}>
						<Input.TextArea rows={3} placeholder={t('billing.refunds.form.remarkPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

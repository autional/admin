'use client';

import React, { useState } from 'react';
import { Tag, Button, Modal, Form, Input, Space, Descriptions, Popconfirm, InputNumber } from 'antd';
import { message } from '@/lib/antd-app';
import { Ban, Calendar, Eye, Repeat2 } from 'lucide-react';
import {
	useBillingSubscriptions,
	useCancelSubscription,
	useChangePlan,
	useRollbackPlan,
	useExtendTrial,
	type SubscriptionItem,
} from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';

// A-405：状态标签/配色单点（表格与详情弹窗共用，杜绝详情裸显英文原文）
const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
	active: 'success',
	trialing: 'processing',
	past_due: 'warning',
	canceled: 'default',
	unpaid: 'error',
	paused: 'default',
};

export default function BillingSubscriptionsPage() {
	const { t } = useTranslation();
	usePageTitle(t('subscriptions.title'));
	// A-404：状态/套餐两筛选器移除 —— 服务端 ListSubscriptions 只绑定 PageRequest
	// （service-billing handler/subscription.go:37-57），status/plan 查询串被忽略（静默 NO-OP）；
	// 套餐筛选本就 options=[] 死控件。移除后 filters 状态不再需要。
	const { data: subscriptions = [], isLoading, error, refetch } = useBillingSubscriptions();
	const cancelMut = useCancelSubscription();
	const changePlanMut = useChangePlan();
	const rollbackMut = useRollbackPlan();
	const extendTrialMut = useExtendTrial();

	const [detailModal, setDetailModal] = useState(false);
	const [selected, setSelected] = useState<SubscriptionItem | null>(null);

	const [changePlanModal, setChangePlanModal] = useState(false);
	const [changePlanForm] = Form.useForm();
	const [changeTenantId, setChangeTenantId] = useState('');

	const [extendTrialModal, setExtendTrialModal] = useState(false);
	const [extendTrialForm] = Form.useForm();
	const [extendTenantId, setExtendTenantId] = useState('');

	const handleCancel = async (tenantId: string) => {
		try {
			await cancelMut.mutateAsync(tenantId);
			message.success(t('subscriptions.cancelSuccess'));
		} catch (err) {
			handleApiError(err, t('subscriptions.cancelFailed'));
		}
	};

	const handleChangePlan = async (values: { newPlanCode: string }) => {
		try {
			// A-402：wire 必填键 = new_plan（PlanChangeRequest dto.go:364-367）；旧键 plan_code 必 400
			await changePlanMut.mutateAsync({
				tenantId: changeTenantId,
				data: { newPlan: values.newPlanCode },
			});
			message.success(t('subscriptions.planChanged'));
			setChangePlanModal(false);
			changePlanForm.resetFields();
		} catch (err) {
			handleApiError(err, t('subscriptions.changeFailed'));
		}
	};

	const handleRollback = async (tenantId: string) => {
		try {
			await rollbackMut.mutateAsync(tenantId);
			message.success(t('subscriptions.rollbackSuccess'));
		} catch (err) {
			handleApiError(err, t('subscriptions.rollbackFailed'));
		}
	};

	const handleExtendTrial = async (values: { days: number }) => {
		try {
			// A-403：wire 必填键 = extend_days（ExtendTrialRequest dto.go:1026-1037，Range 1..90）；旧键 days 必 400
			await extendTrialMut.mutateAsync({
				tenantId: extendTenantId,
				data: { extendDays: values.days },
			});
			message.success(t('subscriptions.trialExtended'));
			setExtendTrialModal(false);
			extendTrialForm.resetFields();
		} catch (err) {
			handleApiError(err, t('subscriptions.extendFailed'));
		}
	};

	const statusLabelMap: Record<string, string> = {
		active: 'subscriptions.statusActive',
		trialing: 'subscriptions.statusTrialing',
		past_due: 'subscriptions.statusPastDue',
		canceled: 'subscriptions.statusCanceled',
		unpaid: 'subscriptions.statusUnpaid',
		paused: 'subscriptions.statusPaused',
	};

	// A-405：状态标签/配色单点（表格与详情弹窗共用；此前详情裸显英文原文）
	const renderStatus = (v?: string) => (
		<Tag color={SUBSCRIPTION_STATUS_COLORS[v ?? ''] ?? 'default'}>
			{t(statusLabelMap[v ?? ''] ?? v ?? '-')}
		</Tag>
	);

	const columns = [
		{
			title: t('subscriptions.column.tenantId'),
			dataIndex: 'tenantId',
			key: 'tenantId',
			ellipsis: true,
			width: 160,
		},
		{
			title: t('subscriptions.column.plan'),
			dataIndex: 'planName',
			key: 'planName',
			width: 120,
			render: (v: string, r: SubscriptionItem) => v || r.planCode || '-',
		},
		{
			title: t('subscriptions.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => renderStatus(v),
		},
		{
			title: t('subscriptions.column.price'),
			dataIndex: 'price',
			key: 'price',
			width: 100,
			// A-405①：wire 全 CNY → 币符 ¥（A-292 $ 家族）
			render: (v: string) => (v ? `¥${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('subscriptions.column.view'),
			key: 'view',
			width: 80,
			render: (_: unknown, record: SubscriptionItem) => (
				<Button
					type="link"
					icon={<Eye size="1em" />}
					onClick={() => {
						setSelected(record);
						setDetailModal(true);
					}}
				>
					{t('subscriptions.detail')}
				</Button>
			),
		},
		{
			title: t('subscriptions.column.actions'),
			key: 'action',
			width: 280,
			render: (_: unknown, record: SubscriptionItem) => (
				<Space size="small">
					<Button
						size="small"
						icon={<Repeat2 size="1em" />}
						onClick={() => {
							setChangeTenantId(record.tenantId);
							changePlanForm.resetFields();
							setChangePlanModal(true);
						}}
					>
						{t('subscriptions.changePlan')}
					</Button>
					<Button
						size="small"
						icon={<Repeat2 size="1em" />}
						onClick={() => handleRollback(record.tenantId)}
						disabled={record.status === 'trialing'}
					>
						{t('subscriptions.rollback')}
					</Button>
					<Button
						size="small"
						icon={<Calendar size="1em" />}
						onClick={() => {
							setExtendTenantId(record.tenantId);
							extendTrialForm.resetFields();
							setExtendTrialModal(true);
						}}
					>
						{t('subscriptions.extendTrial')}
					</Button>
					<Popconfirm
						title={t('subscriptions.confirmCancel')}
						onConfirm={() => handleCancel(record.tenantId)}
						okText={t('subscriptions.confirmOk')}
						cancelText={t('subscriptions.confirmCancelText')}
					>
						<Button size="small" danger icon={<Ban size="1em" />}>
							{t('subscriptions.cancel')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('subscriptions.title')} />

			{error && (
				<PageError message={t('subscriptions.loadError')} retry={refetch} className="mb-4" />
			)}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={subscriptions}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1200 }}
			/>

			<Modal
				title={t('subscriptions.detailTitle')}
				open={detailModal}
				onCancel={() => {
					setDetailModal(false);
					setSelected(null);
				}}
				footer={null}
				width={600}
				className="w-full max-w-[600px]"
			>
				{selected && (
					<Descriptions column={2} bordered size="small">
						<Descriptions.Item label={t('subscriptions.detail.tenantId')}>
							{selected.tenantId}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.plan')}>
							{selected.planName || selected.planCode}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.status')}>
							{renderStatus(selected.status)}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.price')}>
							{selected.price ? `¥${parseFloat(selected.price).toFixed(2)}` : '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.startDate')}>
							{selected.startDate
								? new Date(selected.startDate).toLocaleDateString('zh-CN')
								: '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.currentPeriodEnd')}>
							{selected.currentPeriodEnd
								? new Date(selected.currentPeriodEnd).toLocaleDateString('zh-CN')
								: '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.trialEnd')}>
							{selected.trialEndDate
								? new Date(selected.trialEndDate).toLocaleDateString('zh-CN')
								: '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.seats')}>
							{selected.seats ?? '-'}
						</Descriptions.Item>
					</Descriptions>
				)}
			</Modal>

			<Modal
				title={t('subscriptions.changePlanTitle')}
				open={changePlanModal}
				onCancel={() => {
					setChangePlanModal(false);
					changePlanForm.resetFields();
				}}
				onOk={() => changePlanForm.submit()}
				confirmLoading={changePlanMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={changePlanForm} layout="vertical" onFinish={handleChangePlan}>
					<Form.Item
						name="newPlanCode"
						label={t('subscriptions.newPlanCode')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('subscriptions.newPlanCodePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('subscriptions.extendTrialTitle')}
				open={extendTrialModal}
				onCancel={() => {
					setExtendTrialModal(false);
					extendTrialForm.resetFields();
				}}
				onOk={() => extendTrialForm.submit()}
				confirmLoading={extendTrialMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={extendTrialForm} layout="vertical" onFinish={handleExtendTrial}>
					{/* A-403：服务端 Range 1..90（旧 max=365 越界 91-365 必 400） */}
					<Form.Item name="days" label={t('subscriptions.extendDays')} rules={[{ required: true }]}>
						<InputNumber className="w-full" min={1} max={90} placeholder="30" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

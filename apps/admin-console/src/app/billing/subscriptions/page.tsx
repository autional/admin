'use client';

import React, { useState } from 'react';
import { Tag, Button, Modal, Form, Input, Select, Space, Card, Descriptions, Popconfirm, InputNumber } from 'antd';
import { message } from '@/lib/antd-app';
import { EyeOutlined, StopOutlined, RetweetOutlined, CalendarOutlined } from '@ant-design/icons';
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

export default function BillingSubscriptionsPage() {
	const { t } = useTranslation();
	const [filters, setFilters] = useState<Record<string, unknown>>({});
	const { data: subscriptions = [], isLoading, error, refetch } = useBillingSubscriptions(filters);
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
			await changePlanMut.mutateAsync({
				tenantId: changeTenantId,
				data: { plan_code: values.newPlanCode },
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
			await extendTrialMut.mutateAsync({ tenantId: extendTenantId, data: { days: values.days } });
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
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					active: 'success',
					trialing: 'processing',
					past_due: 'warning',
					canceled: 'default',
					unpaid: 'error',
					paused: 'default',
				};
				return <Tag color={colorMap[v] ?? 'default'}>{t(statusLabelMap[v] ?? v)}</Tag>;
			},
		},
		{
			title: t('subscriptions.column.price'),
			dataIndex: 'price',
			key: 'price',
			width: 100,
			render: (v: string) => (v ? `$${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('subscriptions.column.view'),
			key: 'view',
			width: 80,
			render: (_: unknown, record: SubscriptionItem) => (
				<Button
					type="link"
					icon={<EyeOutlined />}
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
						icon={<RetweetOutlined />}
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
						icon={<RetweetOutlined />}
						onClick={() => handleRollback(record.tenantId)}
						disabled={record.status === 'trialing'}
					>
						{t('subscriptions.rollback')}
					</Button>
					<Button
						size="small"
						icon={<CalendarOutlined />}
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
						<Button size="small" danger icon={<StopOutlined />}>
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

			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('subscriptions.status.filter')}
						allowClear
						className="w-30"
						value={filters.status}
						onChange={(v) => setFilters({ ...filters, status: v })}
						options={[
							{ value: 'active', label: t('subscriptions.statusActive') },
							{ value: 'trialing', label: t('subscriptions.statusTrialing') },
							{ value: 'past_due', label: t('subscriptions.statusPastDue') },
							{ value: 'canceled', label: t('subscriptions.statusCanceled') },
						]}
					/>
					<Select
						placeholder={t('subscriptions.plan.filter')}
						allowClear
						className="w-30"
						value={filters.plan}
						onChange={(v) => setFilters({ ...filters, plan: v })}
						options={[]}
					/>
				</Space>
			</Card>

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
							<Tag color={selected.status === 'active' ? 'success' : 'default'}>
								{selected.status}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.price')}>
							{selected.price ? `$${parseFloat(selected.price).toFixed(2)}` : '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.startDate')}>
							{selected.startDate ? new Date(selected.startDate).toLocaleDateString() : '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.currentPeriodEnd')}>
							{selected.currentPeriodEnd
								? new Date(selected.currentPeriodEnd).toLocaleDateString()
								: '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('subscriptions.detail.trialEnd')}>
							{selected.trialEndDate ? new Date(selected.trialEndDate).toLocaleDateString() : '-'}
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
					<Form.Item name="days" label={t('subscriptions.extendDays')} rules={[{ required: true }]}>
						<InputNumber className="w-full" min={1} max={365} placeholder="30" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

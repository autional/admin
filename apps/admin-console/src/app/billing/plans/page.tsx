'use client';

import React, { useState } from 'react';
import {
	Button,
	Modal,
	Form,
	Input,
	Select,
	InputNumber,
	Space,
	Popconfirm,
	Tag,
} from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
	useBillingPlans,
	useCreatePlan,
	useUpdatePlan,
	useDeletePlan,
	type PlanItem,
} from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { Alert, AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';
import { createPlanSchema } from '@/lib/validators';

/**
 * A-398：编辑载荷构建（纯函数，导出供单测）。
 * 编辑面键 = UpdatePlanRequest（dto.go:297-312 指针语义）：name/description/monthly_price/
 * yearly_price、max_ 前缀配额键、mfa、sso、audit_log_days、support_level、status(active|inactive)。
 * 本页表单可编辑键只有 name/monthlyPrice/yearlyPrice/status —— 只提交已提供键；
 * 旧行为把 createPlanSchema 全量输出（含 code/billingCycle/quarterlyPrice/features/isCustom）
 * 原样上行，用户见「更新成功」而部分改动静默丢弃（结果失真）。
 */
export function buildPlanUpdatePayload(values: Record<string, unknown>): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	if (values.name !== undefined) data.name = values.name;
	if (values.monthlyPrice !== undefined) data.monthlyPrice = values.monthlyPrice;
	if (values.yearlyPrice !== undefined) data.yearlyPrice = values.yearlyPrice;
	if (values.status !== undefined) data.status = values.status;
	return data;
}

export default function BillingPlansPage() {
	const { t } = useTranslation();
	usePageTitle(t('plans2.title'));
	const { data: plans = [], isLoading, error, refetch } = useBillingPlans();
	const createMut = useCreatePlan();
	const updateMut = useUpdatePlan();
	const deleteMut = useDeletePlan();

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<PlanItem | null>(null);
	const [form] = Form.useForm();

	const handleSave = async (values: Record<string, unknown>) => {
		// A-398：编辑面不走 createPlanSchema（create-only 约束不适用于更新载荷）
		if (editing) {
			try {
				await updateMut.mutateAsync({ id: editing.id, data: buildPlanUpdatePayload(values) });
				message.success(t('plans2.updateSuccess'));
				setModalOpen(false);
				form.resetFields();
				setEditing(null);
			} catch (err) {
				handleApiError(err, t('plans2.saveFailed'));
			}
			return;
		}
		const result = createPlanSchema.safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		try {
			const data = { ...result.data } as Record<string, unknown>;
			if (data.features && typeof data.features === 'string') {
				try {
					data.features = JSON.parse(data.features as string);
				} catch {
					/* keep as string */
				}
			}
			await createMut.mutateAsync(data);
			message.success(t('plans2.createSuccess'));
			setModalOpen(false);
			form.resetFields();
			setEditing(null);
		} catch (err) {
			handleApiError(err, t('plans2.saveFailed'));
		}
	};

	const columns = [
		{ title: t('plans2.column.code'), dataIndex: 'code', key: 'code' },
		{ title: t('plans2.column.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('plans2.column.billingCycle'),
			dataIndex: 'billingCycle',
			key: 'billingCycle',
			width: 100,
			render: (v: string) => {
				const labels: Record<string, string> = {
					monthly: t('plans2.billingCycle.monthly'),
					yearly: t('plans2.billingCycle.yearly'),
					quarterly: t('plans2.billingCycle.quarterly'),
					weekly: t('plans2.billingCycle.weekly'),
				};
				return labels[v] ?? v;
			},
		},
		{
			title: t('plans2.column.monthlyPrice'),
			dataIndex: 'monthlyPrice',
			key: 'monthlyPrice',
			width: 100,
			// A-400②：wire 全 CNY → 币符 ¥（A-292 $ 家族）
			render: (v: string) => (v ? `¥${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('plans2.column.yearlyPrice'),
			dataIndex: 'yearlyPrice',
			key: 'yearlyPrice',
			width: 100,
			render: (v: string) => (v ? `¥${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('plans2.column.features'),
			dataIndex: 'features',
			key: 'features',
			ellipsis: true,
			render: (v: unknown) => (v ? JSON.stringify(v).substring(0, 80) : '-'),
		},
		{
			title: t('plans2.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 80,
			render: (v: string) => (
				<Tag color={v === 'active' ? 'success' : 'default'}>
					{v === 'active'
						? t('plans2.status.active')
						: v === 'inactive'
							? t('plans2.status.inactive')
							: v}
				</Tag>
			),
		},
		{
			title: t('plans2.column.actions'),
			key: 'action',
			width: 140,
			render: (_: unknown, record: PlanItem) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								...record,
								features: record.features ? JSON.stringify(record.features, null, 2) : '',
							});
							setModalOpen(true);
						}}
					>
						{t('plans2.edit')}
					</Button>
					<Popconfirm
						title={t('plans2.confirmDelete')}
						onConfirm={() => deleteMut.mutate(record.id)}
						okText={t('plans2.okText')}
						cancelText={t('plans2.cancelText')}
					>
						<Button type="link" danger icon={<Trash2 size="1em" />}>
							{t('plans2.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('plans2.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalOpen(true);
							}}
						>
							{t('plans2.create')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('plans2.loadError')} retry={refetch} className="mb-4" />}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={plans}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1100 }}
			/>

			<Modal
				title={editing ? t('plans2.editTitle') : t('plans2.createTitle')}
				open={modalOpen}
				onCancel={() => {
					setModalOpen(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={createMut.isPending || updateMut.isPending}
				width={600}
				className="w-full max-w-[600px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					{editing && (
						// 第 63 轮补：antd Alert → 设计系统 Alert（图标由 variant 自带，原来是 showIcon）
						<Alert
							variant="info"
							title={t('plans2.form.editHint')}
							className="mb-4"
						/>
					)}
					<Form.Item
						name="code"
						label={t('plans2.form.code')}
						rules={editing ? [] : [{ required: true }]}
					>
						<Input placeholder={t('plans2.form.codePlaceholder')} disabled={!!editing} />
					</Form.Item>
					<Form.Item name="name" label={t('plans2.form.name')} rules={[{ required: true }]}>
						<Input placeholder={t('plans2.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="billingCycle"
						label={t('plans2.form.billingCycle')}
						rules={editing ? [] : [{ required: true }]}
					>
						<Select
							disabled={!!editing}
							options={[
								{ value: 'monthly', label: t('plans2.billingCycle.monthly') },
								{ value: 'yearly', label: t('plans2.billingCycle.yearly') },
								{ value: 'quarterly', label: t('plans2.billingCycle.quarterly') },
								{ value: 'weekly', label: t('plans2.billingCycle.weekly') },
							]}
						/>
					</Form.Item>
					<Space className="w-full" size="middle">
						<Form.Item name="monthlyPrice" label={t('plans2.form.monthlyPrice')}>
							<InputNumber precision={2} min={0} />
						</Form.Item>
						<Form.Item name="yearlyPrice" label={t('plans2.form.yearlyPrice')}>
							<InputNumber precision={2} min={0} />
						</Form.Item>
						{/* A-398：季价无 UpdatePlanRequest 落点 → 编辑态只读（避免静默丢弃） */}
						<Form.Item name="quarterlyPrice" label={t('plans2.form.quarterlyPrice')}>
							<InputNumber precision={2} min={0} disabled={!!editing} />
						</Form.Item>
					</Space>
					{/* A-398：功能特性无 UpdatePlanRequest 落点 → 编辑态只读（避免静默丢弃） */}
					<Form.Item name="features" label={t('plans2.form.features')}>
						<Input.TextArea
							rows={4}
							placeholder={t('plans2.form.featuresPlaceholder')}
							disabled={!!editing}
						/>
					</Form.Item>
					{editing && (
						<Form.Item name="status" label={t('plans2.form.status')}>
							<Select
								allowClear
								options={[
									{ value: 'active', label: t('plans2.status.active') },
									{ value: 'inactive', label: t('plans2.status.inactive') },
								]}
							/>
						</Form.Item>
					)}
					{/* A-399：Select 链路修复 —— 移除 valuePropName="checked"（旧值向 Select 注入 checked 而非 value，选中渲染/回填链路断） */}
					<Form.Item name="isCustom" label={t('plans2.form.isCustom')}>
						<Select
							options={[
								{ value: true, label: t('plans2.form.isCustomYes') },
								{ value: false, label: t('plans2.form.isCustomNo') },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

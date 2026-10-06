'use client';

import React, { useState } from 'react';
import { Button, Modal, Form, Input, Select, InputNumber, Space, Popconfirm, Tag } from 'antd';
import { message } from '@/lib/antd-app';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
	useBillingPlans,
	useCreatePlan,
	useUpdatePlan,
	useDeletePlan,
	type PlanItem,
} from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { createPlanSchema } from '@/lib/validators';

export default function BillingPlansPage() {
	const { t } = useTranslation();
	const { data: plans = [], isLoading, error, refetch } = useBillingPlans();
	const createMut = useCreatePlan();
	const updateMut = useUpdatePlan();
	const deleteMut = useDeletePlan();

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<PlanItem | null>(null);
	const [form] = Form.useForm();

	const handleSave = async (values: Record<string, unknown>) => {
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
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data });
				message.success(t('plans2.updateSuccess'));
			} else {
				await createMut.mutateAsync(data);
				message.success(t('plans2.createSuccess'));
			}
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
			render: (v: string) => (v ? `$${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('plans2.column.yearlyPrice'),
			dataIndex: 'yearlyPrice',
			key: 'yearlyPrice',
			width: 100,
			render: (v: string) => (v ? `$${parseFloat(v).toFixed(2)}` : '-'),
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
					{v === 'active' ? t('plans2.status.active') : v}
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
						icon={<EditOutlined />}
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
						<Button type="link" danger icon={<DeleteOutlined />}>
							{t('plans2.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('plans2.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<PlusOutlined />}
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
					<Form.Item name="code" label={t('plans2.form.code')} rules={[{ required: true }]}>
						<Input placeholder={t('plans2.form.codePlaceholder')} disabled={!!editing} />
					</Form.Item>
					<Form.Item name="name" label={t('plans2.form.name')} rules={[{ required: true }]}>
						<Input placeholder={t('plans2.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="billingCycle"
						label={t('plans2.form.billingCycle')}
						rules={[{ required: true }]}
					>
						<Select
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
						<Form.Item name="quarterlyPrice" label={t('plans2.form.quarterlyPrice')}>
							<InputNumber precision={2} min={0} />
						</Form.Item>
					</Space>
					<Form.Item name="features" label={t('plans2.form.features')}>
						<Input.TextArea rows={4} placeholder={t('plans2.form.featuresPlaceholder')} />
					</Form.Item>
					<Form.Item name="isCustom" label={t('plans2.form.isCustom')} valuePropName="checked">
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

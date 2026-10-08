'use client';

import React, { useState } from 'react';
import { usePageTitle } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Form, Input, Select, InputNumber, Space, Popconfirm, DatePicker, Tag } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import {
	useCoupons,
	useCreateCoupon,
	useUpdateCoupon,
	useDeleteCoupon,
	type CouponItem,
} from '@/hooks/use-wallet-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import type { CreateCouponRequest } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';

// W1-04（A-376）：表单键与 CreateCouponRequest/UpdateCouponRequest 逐一对齐——
// min_spend（string）/ expires_at（RFC3339）/ valid_from（RFC3339）/ usage_limit（int>=1）；
// value/min_spend 为 DTO string 字段，提交时显式字符串化；DatePicker 值到 RFC3339 由 toISOString 完成。
interface CouponFormValues {
	code: string;
	name?: string;
	type: string;
	value?: number;
	minSpend?: number | null;
	usageLimit?: number | null;
	validFrom?: dayjs.Dayjs | null;
	expiresAt?: dayjs.Dayjs | null;
}

export default function WalletCouponsPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('walletCoupons.title'));
	const { data: coupons = [], isLoading, error, refetch } = useCoupons();
	const createMut = useCreateCoupon();
	const updateMut = useUpdateCoupon();
	const deleteMut = useDeleteCoupon();

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<CouponItem | null>(null);
	const [form] = Form.useForm<CouponFormValues>();

	const handleSave = async (values: CouponFormValues) => {
		try {
			// 拦截器负责 camel→snake；此处只保证 DTO 形状：金额 string、时间为 RFC3339、缺席键不上 wire。
			const data: Record<string, unknown> = {
				code: values.code,
				type: values.type,
				value: String(values.value),
				name: values.name ?? '',
			};
			if (values.minSpend !== undefined && values.minSpend !== null) {
				data.minSpend = String(values.minSpend);
			}
			if (values.usageLimit !== undefined && values.usageLimit !== null) {
				data.usageLimit = values.usageLimit;
			}
			if (values.validFrom) {
				data.validFrom = values.validFrom.toISOString();
			}
			if (values.expiresAt) {
				data.expiresAt = values.expiresAt.toISOString();
			}
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data });
				message.success(t('walletCoupons.updateSuccess'));
			} else {
				await createMut.mutateAsync(data as unknown as CreateCouponRequest);
				message.success(t('walletCoupons.createSuccess'));
			}
			setModalOpen(false);
			form.resetFields();
			setEditing(null);
		} catch (err) {
			handleApiError(err, t('walletCoupons.saveFailed'));
		}
	};

	// 编辑回显：wire 字符串 → 表单值（金额 Number、日期 dayjs、usageLimit<=0 视为不限次不写回）。
	const openEdit = (record: CouponItem) => {
		setEditing(record);
		form.setFieldsValue({
			code: record.code,
			name: record.name,
			type: record.type,
			value: record.value !== '' && record.value != null ? Number(record.value) : undefined,
			minSpend: record.minAmount ? Number(record.minAmount) : undefined,
			usageLimit: record.usageLimit && record.usageLimit > 0 ? record.usageLimit : undefined,
			validFrom: record.validFrom ? dayjs(record.validFrom) : undefined,
			expiresAt: record.validUntil ? dayjs(record.validUntil) : undefined,
		});
		setModalOpen(true);
	};

	// A-379②：删除成功/失败 toast（对照创建/编辑有反馈；旧 Popconfirm 直发 mutate 零反馈）。
	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('walletCoupons.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('walletCoupons.deleteFailed'));
		}
	};

	// A-379④：有效性本地化 + 零值抑制（无 locale 时恒系统区域；零值券曝露 "1/1/1"）。
	const formatDate = (v?: string) => {
		if (!v || v.startsWith('0001-01-01')) return '-';
		return new Date(v).toLocaleDateString(i18n.language);
	};

	const columns = [
		{ title: t('walletCoupons.colCode'), dataIndex: 'code', key: 'code' },
		{
			title: t('walletCoupons.colType'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string) => {
				const labels: Record<string, string> = {
					fixed: t('walletCoupons.typeFixed'),
					percentage: t('walletCoupons.typePercentageShort'),
					free_shipping: t('walletCoupons.typeFreeShipping'),
				};
				return labels[v] ?? v;
			},
		},
		{
			title: t('walletCoupons.colValue'),
			dataIndex: 'value',
			key: 'value',
			// A-379③：按类型分支（旧无分支 ⇒ free_shipping 券恒显 "¥0.00"）
			render: (v: string, r: CouponItem) => {
				if (r.type === 'free_shipping') return t('walletCoupons.typeFreeShipping');
				return r.type === 'percentage' ? `${v}%` : `¥${parseFloat(v).toFixed(2)}`;
			},
		},
		{
			title: t('walletCoupons.colMinAmount'),
			dataIndex: 'minAmount',
			key: 'minAmount',
			render: (v: string) => (v ? `¥${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('walletCoupons.colUsage'),
			key: 'usage',
			render: (_: unknown, r: CouponItem) => `${r.usageCount ?? 0} / ${r.usageLimit ? r.usageLimit : '∞'}`,
		},
		{
			title: t('walletCoupons.colValidity'),
			key: 'validity',
			render: (_: unknown, r: CouponItem) =>
				`${formatDate(r.validFrom)} ~ ${formatDate(r.validUntil)}`,
		},
		{
			title: t('walletCoupons.colStatus'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag color={v === 'active' ? 'success' : 'default'}>
					{v === 'active' ? t('walletCoupons.statusActive') : v}
				</Tag>
			),
		},
		{
			title: t('walletCoupons.colActions'),
			key: 'action',
			render: (_: unknown, record: CouponItem) => (
				<Space size="small">
					<Button type="link" icon={<Pencil size="1em" />} onClick={() => openEdit(record)}>
						{t('walletCoupons.edit')}
					</Button>
					<Popconfirm
						title={t('walletCoupons.confirmDelete')}
						onConfirm={() => handleDelete(record.id)}
						okText={t('walletCoupons.ok')}
						cancelText={t('walletCoupons.cancel')}
					>
						<Button type="link" danger icon={<Trash2 size="1em" />}>
							{t('walletCoupons.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('walletCoupons.title')}
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
							{t('walletCoupons.createBtn')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError message={t('walletCoupons.loadError')} retry={refetch} className="mb-4" />
			)}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={coupons}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={editing ? t('walletCoupons.editTitle') : t('walletCoupons.createTitle')}
				open={modalOpen}
				onCancel={() => {
					setModalOpen(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={createMut.isPending || updateMut.isPending}
				width={560}
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item name="code" label={t('walletCoupons.fieldCode')} rules={[{ required: true }]}>
						<Input placeholder={t('walletCoupons.fieldCodePlaceholder')} disabled={!!editing} />
					</Form.Item>
					<Form.Item name="name" label={t('walletCoupons.fieldName')}>
						<Input placeholder={t('walletCoupons.fieldNamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="type"
						label={t('walletCoupons.fieldType')}
						rules={[{ required: true }]}
						initialValue="fixed"
					>
						<Select
							options={[
								{ value: 'fixed', label: t('walletCoupons.typeFixed') },
								{ value: 'percentage', label: t('walletCoupons.typePercentage') },
								{ value: 'free_shipping', label: t('walletCoupons.typeFreeShipping') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="value"
						label={t('walletCoupons.fieldValue')}
						rules={[{ required: true }]}
					>
						<InputNumber
							className="w-full"
							placeholder={t('walletCoupons.fieldValuePlaceholder')}
						/>
					</Form.Item>
					<Form.Item name="minSpend" label={t('walletCoupons.fieldMinAmount')}>
						<InputNumber
							className="w-full"
							precision={2}
							min={0}
							placeholder={t('walletCoupons.fieldMinAmountPlaceholder')}
						/>
					</Form.Item>
					<Space className="w-full" size="middle">
						<Form.Item
							name="usageLimit"
							label={t('walletCoupons.fieldMaxUses')}
							initialValue={1}
						>
							<InputNumber
								placeholder={t('walletCoupons.fieldMaxUsesPlaceholder')}
								min={1}
								precision={0}
							/>
						</Form.Item>
						<Form.Item name="validFrom" label={t('walletCoupons.fieldValidFrom')}>
							<DatePicker />
						</Form.Item>
						<Form.Item name="expiresAt" label={t('walletCoupons.fieldValidUntil')}>
							<DatePicker showTime />
						</Form.Item>
					</Space>
				</Form>
			</Modal>
		</div>
	);
}

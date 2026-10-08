'use client';

import React, { useState, useMemo } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select } from 'antd';
import { message, modal } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
	usePermissions,
	useCreatePermission,
	useUpdatePermission,
	useDeletePermission,
} from '@/hooks/use-permissions';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

interface PermissionRecord {
	id: string;
	code: string;
	name: string;
	description: string;
	category: string;
	/** A-16：系统内置权限标识（wire 预留；后端 PermissionResponse 暂无 is_system 字段，见记录偏差）。 */
	isSystem?: boolean;
}

export default function PermissionsPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<PermissionRecord | null>(null);
	const [categoryFilter, setCategoryFilter] = useState<string>('all');
	const [keyword, setKeyword] = useState('');
	const [form] = Form.useForm();

	// TASK-AB1-18 / A-14：服务端分页单点驱动——usePermissions 内以 toPageParams 发 page/page_size，
	// total 由列表结果（fromPageResult 归一）直接取，删除本地 slice 假分页。
	const [page, setPage] = useState(1);
	const pageSize = 10;
	const {
		data: permissionsResult,
		isLoading,
		error,
		refetch,
	} = usePermissions({ page, pageSize });
	const data = permissionsResult?.items ?? [];
	const createMut = useCreatePermission();
	const updateMut = useUpdatePermission();
	const deleteMut = useDeletePermission();

	const filteredData = useMemo(() => {
		let result = (permissionsResult?.items ?? []) as PermissionRecord[];
		if (categoryFilter !== 'all') {
			result = result.filter((p) => p.category === categoryFilter);
		}
		if (keyword) {
			const k = keyword.toLowerCase();
			result = result.filter(
				(p) =>
					p.code.toLowerCase().includes(k) ||
					p.name.toLowerCase().includes(k) ||
					p.description.toLowerCase().includes(k),
			);
		}
		return result;
	}, [categoryFilter, keyword, permissionsResult]);

	const categories = Array.from(
		new Set((data as PermissionRecord[]).map((p) => p.category).filter(Boolean)),
	);

	// 分类显示名：优先取 i18n 映射（permissions.category.{code}），无映射时回退 raw 值（专项 D）
	const categoryLabel = (code: string) => {
		const key = `permissions.category.${code}`;
		const translated = t(key);
		return translated === key ? code : translated;
	};

	const handleSave = async (values: any) => {
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data: values });
				message.success(t('permissions.updateSuccess'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('permissions.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('permissions.saveFailed'));
		}
	};

	const handleDelete = (record: PermissionRecord) => {
		// A-16 守卫：系统权限不可删除（按钮已禁用，此处双保险防直接调用）。
		if (record.isSystem) return;
		modal.confirm({
			title: t('permissions.confirmDelete'),
			content: t('permissions.deleteWarning'),
			okText: t('common.delete'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deleteMut.mutateAsync(record.id);
					message.success(t('permissions.deleteSuccess'));
				} catch (err) {
					handleApiError(err, t('permissions.deleteError'));
				}
			},
		});
	};

	const columns = [
		{
			title: t('permissions.column.code'),
			dataIndex: 'code',
			key: 'code',
			render: (v: string) => <Tag>{v}</Tag>,
		},
		{
			title: t('common.name'),
			dataIndex: 'name',
			key: 'name',
			render: (v: string, record: PermissionRecord) => (
				<Space size={4}>
					{v}
					{record.isSystem && <Tag color="gold">{t('permissions.systemTag')}</Tag>}
				</Space>
			),
		},
		{
			title: t('permissions.column.description'),
			dataIndex: 'description',
			key: 'description',
			ellipsis: true,
		},
		{
			title: t('permissions.column.category'),
			dataIndex: 'category',
			key: 'category',
			render: (v: string) => <Tag color="blue">{categoryLabel(v)}</Tag>,
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: PermissionRecord) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue(record);
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="link"
						danger
						icon={<Trash2 size="1em" />}
						disabled={record.isSystem}
						onClick={() => handleDelete(record)}
					>
						{t('common.delete')}
					</Button>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('nav.permissions')}
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
							{t('permissions.createPermission')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('permissions.loadError')} retry={refetch} className="mb-4" />}
			<div className="flex gap-4 mb-4 flex-wrap">
				<Input.Search
					placeholder={t('permissions.searchPlaceholder')}
					allowClear
					value={keyword}
					onChange={(e) => setKeyword(e.target.value)}
					className="max-w-md"
				/>
				<Select
					placeholder={t('permissions.categoryFilter')}
					value={categoryFilter}
					onChange={setCategoryFilter}
					options={[
						{ label: t('permissions.allCategories'), value: 'all' },
						...categories.map((c) => ({ label: categoryLabel(c), value: c })),
					]}
					className="w-48"
				/>
			</div>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={filteredData}
				loading={isLoading}
				pagination={{
					current: page,
					pageSize,
					total: permissionsResult?.total ?? 0,
					onChange: (p) => setPage(p),
					showSizeChanger: false,
				}}
			/>

			<Modal
				title={editing ? t('permissions.editPermission') : t('permissions.createPermission')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="code"
						label={t('permissions.column.code')}
						rules={[{ required: true, message: t('permissions.codeRequired') }]}
					>
						<Input placeholder={t('permissions.codePlaceholder')} disabled={!!editing} />
					</Form.Item>
					<Form.Item
						name="name"
						label={t('common.name')}
						rules={[{ required: true, message: t('permissions.nameRequired') }]}
					>
						<Input placeholder={t('permissions.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('permissions.column.description')}>
						<Input.TextArea rows={3} placeholder={t('permissions.descriptionPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="category"
						label={t('permissions.column.category')}
						rules={[{ required: true, message: t('permissions.categoryRequired') }]}
					>
						<Input placeholder={t('permissions.categoryPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

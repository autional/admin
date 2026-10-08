'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Tooltip } from 'antd';
import { message, modal } from '@/lib/antd-app';
import { Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
	useAbacPolicies,
	useCreateAbacPolicy,
	useUpdateAbacPolicy,
	useDeleteAbacPolicy,
} from '@/hooks/use-abac-policies';
import type { ABACPolicy } from '@/hooks/use-abac-policies';
import { handleApiError } from '@/lib/error-handler';
import { useCurrentTenantId, usePageTitle, PLATFORM_TENANT_ID } from '@autional/shared';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

export default function AbacPoliciesPage() {
	const { t } = useTranslation();
	usePageTitle(t('abacPolicies.title')); // A-140：tab 标题（旧实现恒「Autional 管理控制台」）
	const currentTenantId = useCurrentTenantId() ?? '';
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<ABACPolicy | null>(null);
	const [keyword, setKeyword] = useState('');
	const [form] = Form.useForm();

	// A-136：服务端分页状态（旧实现 hook 无分页参 → 后端默认 page_size=20 截断，21+ 永不可达；
	// 前端本地 10/页与后端 20 不同源 → 收敛为服务端分页驱动）。
	const [page, setPage] = useState(1);
	const [pageSize] = useState(10);

	const { data, isLoading, error, refetch } = useAbacPolicies({ page, pageSize });
	const policies = data?.items ?? [];
	const total = data?.total ?? 0;
	const createMut = useCreateAbacPolicy();
	const updateMut = useUpdateAbacPolicy();
	const deleteMut = useDeleteAbacPolicy();

	// 本地关键字过滤作用于「当前页已载入集」（SDK 列表接口无 search 参；服务端搜索待接口支持）。
	const filteredData = policies.filter((p) => {
		if (!keyword) return true;
		const k = keyword.toLowerCase();
		return (
			p.name.toLowerCase().includes(k) || (p.description && p.description.toLowerCase().includes(k))
		);
	});

	// A-132f：平台行只读 = 后端 platformPolicyWriteForbidden 的前端镜像（identity abac_handler.go:265-268）
	// ——平台属主行（tenantId == 平台租户常量）且当前会话非平台租户 → 编辑/删除入口隐藏（点击不可达，
	// 不再让用户触发注定 403 的写）。平台租户自身会话保留自管（AC-B2-014：不误伤）。
	const isPlatformReadOnly = (record: ABACPolicy) =>
		record.tenantId === PLATFORM_TENANT_ID && currentTenantId !== PLATFORM_TENANT_ID;

	const handleSave = async (values: any) => {
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data: values });
				message.success(t('abacPolicies.updateSuccess'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('abacPolicies.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('abacPolicies.saveFailed'));
		}
	};

	const handleDelete = (id: string) => {
		modal.confirm({
			title: t('abacPolicies.confirmDelete'),
			content: t('abacPolicies.deleteWarning'),
			okText: t('common.delete'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deleteMut.mutateAsync(id);
					message.success(t('abacPolicies.deleteSuccess'));
				} catch (err) {
					handleApiError(err, t('abacPolicies.deleteFailed'));
				}
			},
		});
	};

	const columns = [
		{
			title: t('abacPolicies.policyName'),
			dataIndex: 'name',
			key: 'name',
		},
		{
			// A-132f 归属列：平台/租户可辨（契约键直读 tenantId，拦截器 camel 后形状）。
			title: t('abacPolicies.ownership'),
			key: 'ownership',
			width: 100,
			render: (_: any, record: ABACPolicy) => (
				<Tag color={record.tenantId === PLATFORM_TENANT_ID ? 'purple' : 'blue'}>
					{record.tenantId === PLATFORM_TENANT_ID
						? t('abacPolicies.ownershipPlatform')
						: t('abacPolicies.ownershipTenant')}
				</Tag>
			),
		},
		{
			title: t('common.description'),
			dataIndex: 'description',
			key: 'description',
			ellipsis: true,
		},
		{
			// A-140：优先级口径说明（旧仅弹窗 placeholder 有「数字越大优先级越高」，列表列头零说明）
			title: (
				<span className="inline-flex items-center gap-1">
					{t('abacPolicies.priority')}
					<Tooltip title={t('abacPolicies.priorityHint')}>
						<Info size="0.9em" className="text-neutral-500" />
					</Tooltip>
				</span>
			),
			dataIndex: 'priority',
			key: 'priority',
			width: 100,
		},
		{
			title: t('abacPolicies.condition'),
			dataIndex: 'condition',
			key: 'condition',
			width: 200,
			// A-140：截断表达式补 title 提示（长条件 hover 可见全文）
			render: (v: string) => (
				<code
					title={v}
					className="text-xs bg-neutral-200 px-2 py-1 rounded-xs max-w-48 inline-block truncate"
				>
					{v}
				</code>
			),
		},
		{
			title: t('abacPolicies.effect'),
			dataIndex: 'effect',
			key: 'effect',
			width: 80,
			render: (v: string) => (
				<Tag color={v === 'allow' ? 'green' : 'red'}>
					{v === 'allow' ? t('abacPolicies.allow') : t('abacPolicies.deny')}
				</Tag>
			),
		},
		{
			title: t('abacPolicies.enabled'),
			dataIndex: 'enabled',
			key: 'enabled',
			width: 80,
			render: (v: boolean) => (
				<Tag color={v ? 'blue' : 'default'}>
					{v ? t('abacPolicies.enabledYes') : t('abacPolicies.enabledNo')}
				</Tag>
			),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: ABACPolicy) => {
				// 平台行（租户会话）：只读——无任何操作入口，仅示只读标记。
				if (isPlatformReadOnly(record)) {
					return <Tag>{t('abacPolicies.platformReadOnly')}</Tag>;
				}
				return (
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
							onClick={() => handleDelete(record.id)}
						>
							{t('common.delete')}
						</Button>
					</Space>
				);
			},
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('abacPolicies.title')}
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
							{t('abacPolicies.createBtn')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError message={t('abacPolicies.loadError')} retry={refetch} className="mb-4" />
			)}
			<div className="flex gap-4 mb-4 flex-wrap">
				<Input.Search
					placeholder={t('abacPolicies.searchPlaceholder')}
					allowClear
					value={keyword}
					onChange={(e) => setKeyword(e.target.value)}
					className="max-w-md"
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
					total,
					showSizeChanger: false,
					onChange: (p) => setPage(p),
				}}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={editing ? t('abacPolicies.modalEdit') : t('abacPolicies.modalCreate')}
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
						name="name"
						label={t('abacPolicies.policyName')}
						rules={[{ required: true, message: t('abacPolicies.namePlaceholder') }]}
					>
						<Input placeholder={t('abacPolicies.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('common.description')}>
						<Input.TextArea rows={2} placeholder={t('abacPolicies.descriptionPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="priority"
						label={t('abacPolicies.priority')}
						rules={[{ required: true, message: t('abacPolicies.priorityPlaceholder') }]}
					>
						<InputNumber
							min={0}
							max={100}
							className="w-full"
							placeholder={t('abacPolicies.priorityPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="condition"
						label={t('abacPolicies.condition')}
						rules={[{ required: true, message: t('abacPolicies.conditionPlaceholder') }]}
					>
						<Input.TextArea
							rows={4}
							placeholder={t('abacPolicies.conditionPlaceholder')}
							className="font-mono text-sm"
						/>
					</Form.Item>
					<Form.Item
						name="effect"
						label={t('abacPolicies.effect')}
						rules={[{ required: true, message: t('abacPolicies.effectPlaceholder') }]}
					>
						<Select
							options={[
								{ label: t('abacPolicies.effectAllow'), value: 'allow' },
								{ label: t('abacPolicies.effectDeny'), value: 'deny' },
							]}
							placeholder={t('abacPolicies.effectPlaceholder')}
						/>
					</Form.Item>
					<Form.Item name="enabled" label={t('abacPolicies.enableStatus')} valuePropName="checked">
						<Select
							options={[
								{ label: t('abacPolicies.enabledYes'), value: true },
								{ label: t('abacPolicies.enabledNo'), value: false },
							]}
							placeholder={t('abacPolicies.enableStatusPlaceholder')}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

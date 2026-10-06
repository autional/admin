'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Space, Button, Modal, Form, Input, InputNumber, message, Switch, Empty } from 'antd';
import {
	extractList,
	getAccessToken,
	getPortalUrl,
	PLATFORM_TENANT_ID,
	useCurrentTenantId,
} from '@autional/shared';
import type { ApplicationResponse } from '@autional/shared/generated/types';
import { useTranslation } from 'react-i18next';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import {
	getApplications,
	updateApplication,
	activateApplication,
	suspendApplication,
} from '@/lib/api.generated';

// TASK-AB1-27（RC-5 契约收敛）：行契约 = ApplicationResponse（wire 锚 service-tenant dto.go:1248-1271）。
// 残留观察：该契约无 config 字段（后端 handler 未映射 db 侧 config）⇒ allowedRoles / oauthClient
// 两列当前数据面恒 '-'（保留展示位不删列）；扩展 config 仅为这两列的读取形状。
type PlatformPortalRecord = ApplicationResponse & {
	config?: { portal?: { allowedRoles?: string[]; host?: string } };
};

export default function PlatformPortalsPage() {
	const { t } = useTranslation();
	const token = getAccessToken();
	const tenantId = useCurrentTenantId() ?? '';
	// 平台内置 Portal 属平台租户数据：非平台租户会话隐藏并停取数（U320；语义与 U94 同轴）。
	const isPlatformTenant = tenantId === PLATFORM_TENANT_ID;
	const queryClient = useQueryClient();
	const [modalVisible, setModalVisible] = useState(false);
	const [editingApp, setEditingApp] = useState<PlatformPortalRecord | null>(null);
	const [form] = Form.useForm();

	const {
		data: portals = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ['platform-portals'],
		queryFn: async () => {
			// TASK-AB1-27（RC-5 契约收敛）：raw fetch → generated + 拦截器单点。
			// 请求参数 camel 书面写（拦截器 snake 化上 wire）；is_platform 未入 generated 签名（params 类型未收编）故收窄直传。
			// wire 锚：service-tenant/internal/handler/dto/dto.go:1200（form is_platform）；响应 = 扁平 ListResponse（http_handler_app.go:300）。
			const res = await getApplications(PLATFORM_TENANT_ID, {
				type: 'portal',
				isPlatform: true,
			} as unknown as { type?: string; is_platform?: boolean });
			// 根因修复：旧 raw fetch 手读 res.data（后端实际返回扁平 items）恒 undefined ⇒ 页面恒空表；
			// 拦截器已解包 {items,total,pagination} ⇒ extractList 契约直取。
			return extractList<PlatformPortalRecord>(res);
		},
		enabled: !!token && isPlatformTenant,
		staleTime: 60000,
	});

	const updateMutation = useMutation({
		mutationFn: async (data: { id: string; name: string; description: string; order: number }) => {
			// TASK-AB1-27（RC-5 契约收敛）：PUT generated 端点；body camel 书面写（拦截器 snake 化上 wire）。
			return updateApplication(PLATFORM_TENANT_ID, data.id, {
				name: data.name,
				description: data.description,
				order: data.order,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['platform-portals'] });
			message.success(t('applications.saveSuccess', '保存成功'));
			setModalVisible(false);
		},
		onError: () => message.error(t('applications.saveFailed', '保存失败')),
	});

	const statusMutation = useMutation({
		mutationFn: async (data: { id: string; active: boolean }) => {
			// TASK-AB1-27（RC-5 契约收敛）：激活/暂停 = 两枚 generated 端点。
			// activate 无请求体（wire 锚 http_handler_app.go:504）；suspend body { reason }（同上 :558-572）。
			return data.active
				? activateApplication(PLATFORM_TENANT_ID, data.id)
				: suspendApplication(PLATFORM_TENANT_ID, data.id, { reason: 'suspended by admin' });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['platform-portals'] });
			message.success(t('applications.statusUpdated', '状态已更新'));
		},
		onError: () => message.error(t('applications.statusFailed', '状态更新失败')),
	});

	const openEdit = (app: PlatformPortalRecord) => {
		setEditingApp(app);
		form.setFieldsValue({ name: app.name, description: app.description, order: app.order });
		setModalVisible(true);
	};

	const handleSave = async () => {
		const values = await form.validateFields();
		if (!editingApp) return;
		updateMutation.mutate({ id: editingApp.id ?? '', ...values });
	};

	const handleToggleStatus = (app: PlatformPortalRecord) => {
		statusMutation.mutate({ id: app.id ?? '', active: app.status !== 'active' });
	};

	const columns = [
		{ title: t('applications.column.code'), dataIndex: 'code', key: 'code', width: 100 },
		{
			title: t('applications.column.name'),
			dataIndex: 'name',
			key: 'name',
			render: (_: any, record: PlatformPortalRecord) => (
				<Button type="link" size="small" onClick={() => openEdit(record)} className="p-0">
					{record.name}
				</Button>
			),
		},
		{
			title: t('applications.column.url'),
			key: 'url',
			render: (_: any, record: PlatformPortalRecord) => {
				const url = getPortalUrl(record.code ?? '');
				return url ? (
					<a href={url} target="_blank" className="text-xs text-info-text hover:underline">
						{url}
					</a>
				) : (
					'-'
				);
			},
		},
		{
			title: t('applications.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 80,
			render: (_: any, record: PlatformPortalRecord) => (
				<Switch
					checked={record.status === 'active'}
					size="small"
					onChange={() => handleToggleStatus(record)}
					loading={statusMutation.isPending}
				/>
			),
		},
		{
			title: t('applications.column.order'),
			dataIndex: 'order',
			key: 'order',
			width: 60,
		},
		{
			title: t('applications.column.allowedRoles'),
			key: 'roles',
			width: 180,
			render: (_: any, record: PlatformPortalRecord) => {
				// TASK-AB1-27（RC-5 契约收敛）：snake 直读 → camel 键（拦截器深 camel 化）。
				// 残留观察：ApplicationResponse 契约无 config（dto.go:1248-1271 实读）⇒ 本列数据面恒 '-'（保留展示位）。
				const roles = record.config?.portal?.allowedRoles;
				return roles ? (
					<Space size={4} wrap>
						{roles.map((r: string) => (
							<Tag key={r}>{r}</Tag>
						))}
					</Space>
				) : (
					'-'
				);
			},
		},
		{
			title: t('applications.column.oauthClient'),
			key: 'oauth',
			width: 140,
			render: (_: any, record: PlatformPortalRecord) => {
				const clientId = record.config?.portal?.host ? `portal-${record.code}` : '';
				return clientId ? <code className="text-xs">{clientId}</code> : '-';
			},
		},
	];

	if (!isPlatformTenant) {
		return (
			<div>
				<ConsolePageHeader title={t('applications.platformPortals', 'Platform Portals')} />
				<Empty
					description={t(
						'applications.platformOnlyTenant',
						'平台内置 Portal 属平台租户数据，仅平台租户会话可查看。',
					)}
				/>
			</div>
		);
	}

	if (error) {
		return <PageError message={t('applications.loadError', '加载失败')} retry={refetch} />;
	}

	return (
		<div>
			<ConsolePageHeader
				title={t('applications.platformPortals', 'Platform Portals')}
				description={<>{t('applications.platformPortalsDesc', '平台内置的系统 Portal，对所有租户可见。')}{' '} {portals.length} {t('applications.portalsCount', 'portals')}</>}
			/>
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={portals}
				loading={isLoading}
				pagination={false}
				scroll={{ x: 900 }}
			/>

			<Modal
				title={t('applications.editPortal', '编辑 Portal')}
				open={modalVisible}
				onCancel={() => setModalVisible(false)}
				onOk={handleSave}
				confirmLoading={updateMutation.isPending}
			>
				<Form form={form} layout="vertical">
					<Form.Item
						name="name"
						label={t('applications.form.name', '名称')}
						rules={[{ required: true }]}
					>
						<Input />
					</Form.Item>
					<Form.Item name="description" label={t('applications.form.description', '描述')}>
						<Input.TextArea rows={3} />
					</Form.Item>
					<Form.Item
						name="order"
						label={t('applications.form.order', '排序')}
						rules={[{ required: true }]}
					>
						<InputNumber min={0} className="w-full" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

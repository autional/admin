'use client';
// @generated-api-exempt: 1 key(s) [IDENTITY.ADMIN_IOT] lack generated func
// W1b（A-93）：豁免面收窄 —— GET 已收敛 generated（adminIotsByIots）；此 key 仅 PUT 复用
// （generated 仅有 GET/POST/DELETE 三函数，PUT 无 generated 面）。

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button, Tag, Modal, Form, Input, Skeleton, Descriptions } from 'antd';
import { ArrowLeft, Pencil } from 'lucide-react';
import { usePageTitle, useTenantSlug, useCurrentTenantId } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { AppPageHeader, EmptyState, ErrorState, SectionCard, StatusBadge } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_PATHS, extractItem } from '@autional/shared';
import { adminIotsByIots } from '@autional/shared/generated/api';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';
import { useOwnerDisplay } from '@/hooks/use-owner-display';
import { DEVICE_STATUS_VARIANT, statusVariantOf, retryUnlessNotFound } from '@/lib/nhi';

import { useTranslation } from 'react-i18next';
import type { DeviceInfo } from '@autional/shared/generated/types';

// W1b（A-89）：owner_principal_id 为 additive 增量键（generated 快照未含）→ 局部增强类型。
type DeviceRecord = DeviceInfo & { ownerPrincipalId?: string };

// A-92：状态词表单源 = src/lib/nhi.ts（旧本地表含 revoked 死代码——后端 revoked/deleted 零写入，
// 两页各抄一份即漂移根源，已收敛）。

const SUBTYPE_COLORS: Record<string, string> = {
	pet: 'pink',
	smart_home: 'green',
	office: 'blue',
	sensor: 'orange',
};

function formatDate(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleDateString('zh-CN');
}

async function fetchDevice(id: string): Promise<DeviceRecord | null> {
	// A-93：GET 收敛到 generated 单点（adminIotsByIots）；extractItem 解包后返回 null
	// 使 notFound EmptyState 可达（旧 `?? ({} as DeviceInfo)` 空对象恒 truthy → notFound 分支死代码）。
	const res = await adminIotsByIots(id);
	return extractItem<DeviceRecord>(res);
}

async function updateDevice(id: string, values: Record<string, unknown>): Promise<DeviceRecord> {
	// PUT 无 generated 函数（admin 平面 exempt），保留 apiClient 直连。
	const res = await apiClient.put(API_PATHS.IDENTITY.ADMIN_IOT(id), values);
	return extractItem<DeviceRecord>(res.data) ?? ({} as DeviceRecord);
}

export default function DeviceDetailPage() {
	const { t } = useTranslation();
	// A-92：subtype 文案键 = wire 值原样（smart_home），消除 smartHome 键名漂移。
	const SUBTYPE_LABELS: Record<string, string> = {
		pet: t('devices.type.pet'),
		smart_home: t('devices.type.smart_home'),
		office: t('devices.type.office'),
		sensor: t('devices.type.sensor'),
	};
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const queryClient = useQueryClient();
	const tenantId = useCurrentTenantId() ?? '';
	const [editVisible, setEditVisible] = useState(false);
	const [form] = Form.useForm();

	// A-89：owner_principal_id → 成员显示名解析（列表/详情共用单点 hook）
	const { resolve: resolveOwner } = useOwnerDisplay();

	const {
		data: device,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.devices.detail(tenantId, id!),
		queryFn: () => fetchDevice(id!),
		enabled: !!id,
		staleTime: 30000,
		// A-91：404 不重试（消「假 ID 2 条 console 404」噪声）；其余沿用全局 retry:1
		retry: retryUnlessNotFound,
	});

	const updateMut = useMutation({
		mutationFn: ({ id: devId, values }: { id: string; values: Record<string, unknown> }) =>
			updateDevice(devId, values),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.detail(tenantId, id!) });
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(tenantId) });
		},
	});

	usePageTitle(device?.name ? `${device.name} - ${t('devices.detailTitle')}` : t('devices.detailTitle'));

	const handleEdit = async (values: Record<string, unknown>) => {
		if (!id) return;
		try {
			await updateMut.mutateAsync({ id, values });
			message.success(t('devices.updateSuccess'));
			setEditVisible(false);
		} catch (err) {
			handleApiError(err, t('devices.updateFailed'));
		}
	};

	const openEdit = () => {
		if (!device) return;
		form.setFieldsValue({
			name: device.name,
			firmwareVer: device.firmwareVer,
			hardwareId: device.hardwareId,
			manufacturer: device.manufacturer,
		});
		setEditVisible(true);
	};

	if (!id) {
		return (
			<div>
				<ErrorState title={t('devices.invalidTitle')} message={t('devices.invalidMessage')} />
			</div>
		);
	}

	return (
		<div>
			<div className="mb-6">
				<Button
					type="text"
					icon={<ArrowLeft size="1em" />}
					onClick={() => navigate(buildNavHref('/devices', tenantSlug))}
					className="mb-4 pl-0"
				>
					{t('devices.backToList')}
				</Button>
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
					<AppPageHeader
						title={device?.name || t('devices.detailTitle')}
						// A-91：错误/未达态副标题不得残留「加载中」（device 未达时留白，由下方 ErrorState/EmptyState 表达）
						description={
							device?.manufacturer
								? `${t('devices.form.manufacturer')}: ${device.manufacturer}`
								: undefined
						}
					/>
					{device && (
						<Button icon={<Pencil size="1em" />} onClick={openEdit}>
							{t('devices.editTitle')}
						</Button>
					)}
				</div>
			</div>

			{isLoading && (
				<div className="space-y-4">
					<Skeleton active paragraph={{ rows: 4 }} />
				</div>
			)}

			{!isLoading && error && (
				<ErrorState
					title={t('devices.detailLoadError')}
					message={t('devices.retryHint')}
					onRetry={() => refetch()}
				/>
			)}

			{!isLoading && !error && device && (
				<SectionCard title={t('devices.section.info')} className="mb-6">
					<Descriptions column={2} bordered size="small">
						<Descriptions.Item label={t('devices.column.name')}>{device.name}</Descriptions.Item>
						<Descriptions.Item label={t('common.status')}>
							<StatusBadge variant={statusVariantOf(DEVICE_STATUS_VARIANT, device.status)}>
								{t(`devices.status.${device.status}`, { defaultValue: device.status || '-' })}
							</StatusBadge>
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.column.type')}>
							<Tag color={SUBTYPE_COLORS[device.workloadSubtype || ''] || 'default'}>
								{SUBTYPE_LABELS[device.workloadSubtype || ''] || device.workloadSubtype || '-'}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.identityId')}>
							{device.identityId || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.column.hardwareId')}>
							{device.hardwareId || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.column.firmware')}>
							{device.firmwareVer || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.form.manufacturer')}>
							{device.manufacturer || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.ownerId')}>
							{/* A-89：owner 显示名（owner_principal_id 优先；历史行回退 owner_id） */}
							{resolveOwner(device.ownerPrincipalId, device.ownerId)}
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.pairingCode')}>
							{device.pairingCode ? <code className="text-xs">{device.pairingCode}</code> : '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('devices.column.created')}>
							{formatDate(device.createdAt || '')}
						</Descriptions.Item>
						<Descriptions.Item label={t('common.updatedAt')}>
							{formatDate(device.updatedAt || '')}
						</Descriptions.Item>
					</Descriptions>
				</SectionCard>
			)}

			{!isLoading && !error && !device && (
				<EmptyState
					title={t('devices.notFoundTitle')}
					description={t('devices.notFoundDesc')}
				/>
			)}

			<Modal
				title={t('devices.editTitle')}
				open={editVisible}
				onCancel={() => {
					setEditVisible(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={updateMut.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleEdit}>
					<Form.Item name="name" label={t('devices.column.name')} rules={[{ required: true }]}>
						<Input placeholder={t('devices.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="firmwareVer" label={t('devices.form.firmware')}>
						<Input placeholder={t('devices.form.firmwarePlaceholder')} />
					</Form.Item>
					<Form.Item name="hardwareId" label={t('devices.form.hardwareId')}>
						<Input placeholder={t('devices.form.hardwareIdPlaceholder')} />
					</Form.Item>
					<Form.Item name="manufacturer" label={t('devices.form.manufacturer')}>
						<Input placeholder={t('devices.form.manufacturerPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

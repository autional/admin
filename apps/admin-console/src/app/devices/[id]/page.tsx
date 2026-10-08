'use client';
// @generated-api-exempt: 1 key(s) [IDENTITY.ADMIN_IOT] lack generated func

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button, Tag, Modal, Form, Input, Select, Skeleton, Descriptions } from 'antd';
import { EditOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { usePageTitle, useTenantSlug, useCurrentTenantId } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { AppPageHeader, EmptyState, ErrorState, SectionCard, StatusBadge } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_PATHS, extractItem } from '@autional/shared';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';

import { useTranslation } from 'react-i18next';
import type { DeviceInfo } from '@autional/shared/generated/types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
	active: 'success',
	unpaired: 'info',
	transferring: 'warning',
	revoked: 'danger',
};

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
	return STATUS_VARIANT[s] || 'neutral';
}

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

async function fetchDevice(id: string): Promise<DeviceInfo> {
	const res = await apiClient.get(API_PATHS.IDENTITY.ADMIN_IOT(id));
	return extractItem(res.data) ?? ({} as DeviceInfo);
}

async function updateDevice(id: string, values: Record<string, unknown>): Promise<DeviceInfo> {
	const res = await apiClient.put(API_PATHS.IDENTITY.ADMIN_IOT(id), values);
	return extractItem(res.data) ?? ({} as DeviceInfo);
}

export default function DeviceDetailPage() {
	const { t } = useTranslation();
	const SUBTYPE_LABELS: Record<string, string> = {
		pet: t('devices.type.pet'),
		smart_home: t('devices.type.smartHome'),
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

	const {
		data: device,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.devices.detail(tenantId, id!) as unknown as readonly unknown[],
		queryFn: () => fetchDevice(id!),
		enabled: !!id,
		staleTime: 30000,
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
					icon={<ArrowLeftOutlined />}
					onClick={() => navigate(buildNavHref('/devices', tenantSlug))}
					className="mb-4 pl-0"
				>
					{t('devices.backToList')}
				</Button>
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
					<AppPageHeader
						title={device?.name || t('devices.detailTitle')}
						description={
							device?.manufacturer
								? `${t('devices.form.manufacturer')}: ${device.manufacturer}`
								: t('common.loading')
						}
					/>
					{device && (
						<Button icon={<EditOutlined />} onClick={openEdit}>
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
							<StatusBadge variant={statusVariant(device.status || '')}>
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
						<Descriptions.Item label={t('devices.ownerId')}>{device.ownerId || '-'}</Descriptions.Item>
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

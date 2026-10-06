'use client';
// @generated-api-exempt: 3 key(s) [VERIFICATION.ADMIN_VERIFICATION, VERIFICATION.ADMIN_VERIFICATION_OVERRIDE, VERIFICATION.ADMIN_VERIFICATION_RESET_RETRY] lack generated func

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { extractItem, apiClient, API_PATHS, useTenantSlug } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { buildNavHref } from '@/lib/nav';
import { Card, Tag, Button, Space, Descriptions, Modal, Form, Select, Input, Spin, Empty, Tabs } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	ArrowLeftOutlined,
	EditOutlined,
	ReloadOutlined,
	CheckCircleOutlined,
	CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import type { ColumnsType } from 'antd/es/table';

const statusColorMap: Record<string, string> = {
	verified: 'green',
	verified_minor: 'blue',
	pending: 'orange',
	rejected: 'red',
	unverified: 'default',
	expired: 'purple',
	ocr_pending: 'cyan',
	ocr_completed: 'geekblue',
};

interface VerificationDetail {
	id: string;
	userId: string;
	tenantId: string;
	status: string;
	method: string;
	provider: string;
	ageGroup: string;
	verifiedAt: string;
	createdAt: string;

	nameMasked?: string;
	idNumberMasked?: string;
	dob?: string;
	gender?: string;
	ocrConfidence?: number;

	apiRequestId?: string;
	apiScore?: number;

	livenessScore?: number;

	overrideHistory?: OverrideHistoryItem[];
}

interface OverrideHistoryItem {
	id: string;
	operatorId: string;
	oldStatus: string;
	newStatus: string;
	reason: string;
	createdAt: string;
}

const queryKeys = {
	verifications: {
		all: ['verifications'] as const,
		detail: (id: string) => ['verifications', 'detail', id] as const,
	},
};

function useVerificationDetail(id: string) {
	return useQuery({
		queryKey: queryKeys.verifications.detail(id),
		queryFn: async () => {
			const res = await apiClient.get(API_PATHS.VERIFICATION.ADMIN_VERIFICATION(id));
			return extractItem<VerificationDetail>(res.data);
		},
		enabled: !!id,
	});
}

function useOverrideVerification() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, status, reason }: { id: string; status: string; reason: string }) =>
			apiClient.post(API_PATHS.VERIFICATION.ADMIN_VERIFICATION_OVERRIDE(id), { status, reason }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.verifications.all });
		},
	});
}

function useResetRetry() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			apiClient.post(API_PATHS.VERIFICATION.ADMIN_VERIFICATION_RESET_RETRY(id)),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.verifications.all });
		},
	});
}

export default function VerificationDetailPage() {
	const { t } = useTranslation();
	const params = useParams();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const id = params.id as string;

	const statusLabelMap = useMemo<Record<string, string>>(
		() => ({
			verified: t('verifications.status.verified'),
			verified_minor: t('verifications.status.verified_minor'),
			pending: t('verifications.status.pending'),
			rejected: t('verifications.status.rejected'),
			unverified: t('verifications.status.unverified'),
			expired: t('verifications.status.expired'),
			ocr_pending: t('verifications.status.ocr_pending'),
			ocr_completed: t('verifications.status.ocr_completed'),
		}),
		[t],
	);

	const statusOptions = useMemo(
		() => Object.entries(statusLabelMap).map(([value, label]) => ({ value, label })),
		[statusLabelMap],
	);

	const { data: record, isLoading: loading, error, refetch } = useVerificationDetail(id);
	const overrideMutation = useOverrideVerification();
	const resetRetryMutation = useResetRetry();

	const [overrideModalOpen, setOverrideModalOpen] = useState(false);
	const [overrideForm] = Form.useForm();

	const handleOverride = async (values: { status: string; reason: string }) => {
		try {
			await overrideMutation.mutateAsync({ id, status: values.status, reason: values.reason });
			message.success(t('verifications.overrideSuccess'));
			setOverrideModalOpen(false);
			overrideForm.resetFields();
			refetch();
		} catch (err) {
			handleApiError(err, t('verifications.overrideFailed'));
		}
	};

	const handleResetRetry = () => {
		modal.confirm({
			title: t('verifications.resetRetryConfirmTitle'),
			content: t('verifications.resetRetryConfirmContent'),
			onOk: async () => {
				try {
					await resetRetryMutation.mutateAsync(id);
					message.success(t('verifications.resetRetrySuccess'));
					refetch();
				} catch (err) {
					handleApiError(err, t('verifications.resetRetryFailed'));
				}
			},
		});
	};

	if (loading) {
		return (
			<div className="flex justify-center py-20">
				<Spin size="large" />
			</div>
		);
	}

	if (error) {
		return <PageError message={t('verifications.loadDetailError')} retry={refetch} />;
	}

	if (!record) {
		return <Empty description={t('verifications.notFound')} />;
	}

	const historyColumns: ColumnsType<OverrideHistoryItem> = [
		{
			title: t('verifications.detailOperator'),
			dataIndex: 'operatorId',
			key: 'operatorId',
			ellipsis: true,
		},
		{
			title: t('verifications.detailOldStatus'),
			dataIndex: 'oldStatus',
			key: 'oldStatus',
			render: (s: string) => (
				<Tag color={statusColorMap[s] || 'default'}>{statusLabelMap[s] || s}</Tag>
			),
		},
		{
			title: t('verifications.detailNewStatus'),
			dataIndex: 'newStatus',
			key: 'newStatus',
			render: (s: string) => (
				<Tag color={statusColorMap[s] || 'default'}>{statusLabelMap[s] || s}</Tag>
			),
		},
		{
			title: t('verifications.detailOverrideReason'),
			dataIndex: 'reason',
			key: 'reason',
			ellipsis: true,
		},
		{
			title: t('verifications.detailOverrideTime'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 180,
		},
	];

	return (
		<div>
			<div className="mb-4">
				<Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
					{t('verifications.actionBack')}
				</Button>
			</div>

			<Card className="mb-4">
				<div className="flex items-start justify-between flex-wrap gap-4">
					<div>
						<div className="text-xl font-semibold flex items-center gap-2">
							{t('verifications.detailTitle')}
							<Tag color={statusColorMap[record.status] || 'default'}>
								{statusLabelMap[record.status] || record.status}
							</Tag>
						</div>
						<div className="text-neutral-600 mt-1">
							{t('verifications.detailCreatedAt')} {record.createdAt}
						</div>
					</div>
					<Space wrap>
						<Button
							icon={<EditOutlined />}
							onClick={() => {
								overrideForm.setFieldsValue({ status: record.status });
								setOverrideModalOpen(true);
							}}
						>
							{t('verifications.actionOverride')}
						</Button>
						{record.status === 'rejected' && (
							<Button
								icon={<ReloadOutlined />}
								onClick={handleResetRetry}
								loading={resetRetryMutation.isPending}
							>
								{t('verifications.actionResetRetry')}
							</Button>
						)}
					</Space>
				</div>
			</Card>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
				<Card title={t('verifications.detailUserInfo')}>
					<Descriptions bordered column={1} size="small">
						<Descriptions.Item label={t('verifications.detailRecordId')}>
							{record.id}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailUserId')}>
							<Button type="link" size="small" onClick={() => navigate(buildNavHref(`/users/${record.userId}`, tenantSlug))}>
								{record.userId}
							</Button>
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailTenantId')}>
							{record.tenantId}
						</Descriptions.Item>
					</Descriptions>
				</Card>

				<Card title={t('verifications.detailVerificationInfo')}>
					<Descriptions bordered column={1} size="small">
						<Descriptions.Item label={t('verifications.detailStatus')}>
							<Tag color={statusColorMap[record.status] || 'default'}>
								{statusLabelMap[record.status] || record.status}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailMethod')}>
							{record.method || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailProvider')}>
							{record.provider || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailAgeGroup')}>
							{record.ageGroup || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailVerifiedAt')}>
							{record.verifiedAt || '-'}
						</Descriptions.Item>
					</Descriptions>
				</Card>
			</div>

			{(record.nameMasked ||
				record.idNumberMasked ||
				record.dob ||
				record.gender ||
				record.ocrConfidence != null) && (
				<Card title={t('verifications.detailOcrResult')} className="mb-4">
					<Descriptions bordered column={2} size="small">
						<Descriptions.Item label={t('verifications.detailName')}>
							{record.nameMasked || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailIdNumber')}>
							{record.idNumberMasked || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailDob')}>
							{record.dob || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailGender')}>
							{record.gender || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailConfidence')}>
							{record.ocrConfidence != null ? `${(record.ocrConfidence * 100).toFixed(1)}%` : '-'}
						</Descriptions.Item>
					</Descriptions>
				</Card>
			)}

			{(record.apiRequestId || record.apiScore != null) && (
				<Card title={t('verifications.detailApiResult')} className="mb-4">
					<Descriptions bordered column={2} size="small">
						<Descriptions.Item label={t('verifications.detailProviderReqId')}>
							{record.apiRequestId || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailScoreLabel')}>
							{record.apiScore != null ? record.apiScore : '-'}
						</Descriptions.Item>
					</Descriptions>
				</Card>
			)}

			{record.livenessScore != null && (
				<Card title={t('verifications.detailLiveness')} className="mb-4">
					<Descriptions bordered column={1} size="small">
						<Descriptions.Item label={t('verifications.detailLivenessScore')}>
							{record.livenessScore != null ? `${(record.livenessScore * 100).toFixed(1)}%` : '-'}
						</Descriptions.Item>
					</Descriptions>
				</Card>
			)}

			<Card title={t('verifications.detailOverrideHistory')}>
				{record.overrideHistory && record.overrideHistory.length > 0 ? (
					<DataTable
						rowKey="id"
						columns={historyColumns}
						dataSource={record.overrideHistory}
						pagination={false}
						size="small"
						scroll={{ x: 'max-content' }}
					/>
				) : (
					<Empty description={t('verifications.noOverrideHistory')} />
				)}
			</Card>

			<Modal
				title={t('verifications.overrideTitle')}
				open={overrideModalOpen}
				onCancel={() => {
					setOverrideModalOpen(false);
					overrideForm.resetFields();
				}}
				onOk={() => overrideForm.submit()}
				confirmLoading={overrideMutation.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={overrideForm} layout="vertical" onFinish={handleOverride}>
					<Form.Item
						name="status"
						label={t('verifications.overrideStatus')}
						rules={[{ required: true, message: t('verifications.overrideStatusRequired') }]}
					>
						<Select
							options={statusOptions}
							placeholder={t('verifications.overrideStatusPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('verifications.overrideReasonLabel')}
						rules={[{ required: true, message: t('verifications.overrideReasonRequired') }]}
					>
						<Input.TextArea
							rows={3}
							placeholder={t('verifications.overrideReasonPlaceholderTip')}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

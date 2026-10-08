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
	ArrowLeft,
	Pencil,
	RefreshCw,
	UserCheck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { useManualReviewVerification, useResolveVerificationReview } from '@/hooks/use-verifications';
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
	// A-260（W1e）：domain 9 值 vs 页面映射 8 值（缺 manual_review）→ 补齐
	manual_review: 'gold',
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
	const { t, i18n } = useTranslation();
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
			// A-260（W1e）：manual_review 补映射
			manual_review: t('verifications.status.manual_review'),
		}),
		[t],
	);

	const statusOptions = useMemo(
		() => Object.entries(statusLabelMap).map(([value, label]) => ({ value, label })),
		[statusLabelMap],
	);

	// A-262（W1e）：枚举值原样英文 → 词表（未收录值回退原值）
	const methodLabelMap: Record<string, string> = {
		ocr: t('verifications.method.ocr'),
		two_element: t('verifications.method.two_element'),
		three_element: t('verifications.method.three_element'),
		four_element: t('verifications.method.four_element'),
		manual: t('verifications.method.manual'),
	};
	const providerLabelMap: Record<string, string> = {
		aliyun: t('verifications.provider.aliyun'),
	};
	const ageGroupLabelMap: Record<string, string> = {
		adult: t('verifications.ageGroup.adult'),
		minor: t('verifications.ageGroup.minor'),
	};
	const genderLabelMap: Record<string, string> = {
		male: t('verifications.gender.male'),
		female: t('verifications.gender.female'),
	};

	const { data: record, isLoading: loading, error, refetch } = useVerificationDetail(id);
	const overrideMutation = useOverrideVerification();
	const resetRetryMutation = useResetRetry();

	const [overrideModalOpen, setOverrideModalOpen] = useState(false);
	const [overrideForm] = Form.useForm();

	// A-264（W1e）：manual-review/resolve-review 能力零入口 → 全部补入口（均需 Step-up）
	const manualReviewMutation = useManualReviewVerification();
	const resolveReviewMutation = useResolveVerificationReview();
	const [manualReviewModalOpen, setManualReviewModalOpen] = useState(false);
	const [manualReviewForm] = Form.useForm();
	const [resolveReviewModalOpen, setResolveReviewModalOpen] = useState(false);
	const [resolveReviewForm] = Form.useForm();

	const handleManualReview = async (values: { reason: string }) => {
		try {
			await manualReviewMutation.mutateAsync({ id, reason: values.reason });
			message.success(t('verifications.manualReviewSuccess'));
			setManualReviewModalOpen(false);
			manualReviewForm.resetFields();
			refetch();
		} catch (err) {
			handleApiError(err, t('verifications.manualReviewFailed'));
		}
	};

	const handleResolveReview = async (values: { resolution: 'approved' | 'rejected'; reason: string }) => {
		try {
			await resolveReviewMutation.mutateAsync({ id, resolution: values.resolution, reason: values.reason });
			message.success(t('verifications.resolveReviewSuccess'));
			setResolveReviewModalOpen(false);
			resolveReviewForm.resetFields();
			refetch();
		} catch (err) {
			handleApiError(err, t('verifications.resolveReviewFailed'));
		}
	};

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
			// A-262（W1e）：覆盖历史时间同族本地化
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
	];

	return (
		<div>
			<div className="mb-4">
				<Button icon={<ArrowLeft size="1em" />} onClick={() => navigate(-1)}>
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
							{/* A-262（W1e）：创建于 RFC3339 原样 → 本地化 */}
							{t('verifications.detailCreatedAt')}{' '}
							{record.createdAt ? new Date(record.createdAt).toLocaleString(i18n.language) : '-'}
						</div>
					</div>
					<Space wrap>
						<Button
							icon={<Pencil size="1em" />}
							onClick={() => {
								overrideForm.setFieldsValue({ status: record.status });
								setOverrideModalOpen(true);
							}}
						>
							{t('verifications.actionOverride')}
						</Button>
						{/* A-264（W1e）：转人工复核入口（manual_review 行不再重复触发） */}
						{record.status !== 'manual_review' && (
							<Button
								icon={<UserCheck size="1em" />}
								onClick={() => setManualReviewModalOpen(true)}
							>
								{t('verifications.actionManualReview')}
							</Button>
						)}
						{/* A-264（W1e）：复核结论入口（仅 manual_review 状态可操作，与后端一致） */}
						{record.status === 'manual_review' && (
							<Button
								type="primary"
								icon={<UserCheck size="1em" />}
								onClick={() => setResolveReviewModalOpen(true)}
							>
								{t('verifications.actionResolveReview')}
							</Button>
						)}
						{record.status === 'rejected' && (
							<Button
								icon={<RefreshCw size="1em" />}
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
							{/* A-262（W1e）：three_element 等原样英文 → 词表（未收录回退原值） */}
							{(record.method && methodLabelMap[record.method]) || record.method || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailProvider')}>
							{(record.provider && providerLabelMap[record.provider]) || record.provider || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailAgeGroup')}>
							{(record.ageGroup && ageGroupLabelMap[record.ageGroup]) || record.ageGroup || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('verifications.detailVerifiedAt')}>
							{/* A-262（W1e）：认证时间 RFC3339 原样 → 本地化 */}
							{record.verifiedAt ? new Date(record.verifiedAt).toLocaleString(i18n.language) : '-'}
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
							{/* A-262（W1e）：male/female 原样英文 → 词表 */}
							{(record.gender && genderLabelMap[record.gender]) || record.gender || '-'}
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
				closable={{ 'aria-label': t('common.close') }}
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

			{/* A-264（W1e）：转人工复核（POST /manual-review；需 Step-up 二次认证） */}
			<Modal
				title={t('verifications.manualReviewTitle')}
				open={manualReviewModalOpen}
				onCancel={() => {
					setManualReviewModalOpen(false);
					manualReviewForm.resetFields();
				}}
				onOk={() => manualReviewForm.submit()}
				confirmLoading={manualReviewMutation.isPending}
				destroyOnHidden
				closable={{ 'aria-label': t('common.close') }}
				className="w-full max-w-[560px]"
			>
				<div className="mb-2 text-sm text-neutral-600">{t('verifications.manualReviewHint')}</div>
				<Form form={manualReviewForm} layout="vertical" onFinish={handleManualReview}>
					<Form.Item
						name="reason"
						label={t('verifications.manualReviewReasonLabel')}
						rules={[{ required: true, message: t('verifications.manualReviewReasonRequired') }]}
					>
						<Input.TextArea
							rows={3}
							placeholder={t('verifications.manualReviewReasonPlaceholder')}
						/>
					</Form.Item>
				</Form>
			</Modal>

			{/* A-264（W1e）：复核结论（POST /resolve-review；仅 manual_review 可操作；需 Step-up） */}
			<Modal
				title={t('verifications.resolveReviewTitle')}
				open={resolveReviewModalOpen}
				onCancel={() => {
					setResolveReviewModalOpen(false);
					resolveReviewForm.resetFields();
				}}
				onOk={() => resolveReviewForm.submit()}
				confirmLoading={resolveReviewMutation.isPending}
				destroyOnHidden
				closable={{ 'aria-label': t('common.close') }}
				className="w-full max-w-[560px]"
			>
				<div className="mb-2 text-sm text-neutral-600">{t('verifications.manualReviewHint')}</div>
				<Form form={resolveReviewForm} layout="vertical" onFinish={handleResolveReview}>
					<Form.Item
						name="resolution"
						label={t('verifications.resolveReviewResolutionLabel')}
						rules={[{ required: true, message: t('verifications.resolveReviewResolutionRequired') }]}
					>
						<Select
							options={[
								{ value: 'approved', label: t('verifications.resolution.approved') },
								{ value: 'rejected', label: t('verifications.resolution.rejected') },
							]}
							placeholder={t('verifications.resolveReviewResolutionPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('verifications.resolveReviewReasonLabel')}
						rules={[{ required: true, message: t('verifications.resolveReviewReasonRequired') }]}
					>
						<Input.TextArea
							rows={3}
							placeholder={t('verifications.resolveReviewReasonPlaceholder')}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

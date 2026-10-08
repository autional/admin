'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { extractList, apiClient, useTenantSlug, toPageParams } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Input, Space, Card, Statistic, Row, Col, Select, Modal, Form, Empty, Skeleton } from 'antd';
import { message } from '@/lib/antd-app';
import {
	CheckCircle2,
	ClipboardCheck,
	Clock,
	Download,
	Search,
	XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import {
	useVerifications,
	useVerificationStats,
	useOverrideVerification,
	useExportVerifications,
	useManualReviewVerification,
	type VerificationRecord,
} from '@/hooks/use-verifications';
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
	// A-260（W1e）：domain 9 值 vs 页面映射 8 值（缺 manual_review）→ 补齐（行显原始英文 + 不可筛选）
	manual_review: 'gold',
};

export default function VerificationsPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();

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
			// A-260（W1e）：manual_review 补映射（label+筛选选项同源派生）
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
	const queryClient = useQueryClient();

	// A-264（W1e）：搜索防抖——输入态（keywordInput）与提交态（keyword）分离，击键 400ms 空闲才发 GET
	const [keywordInput, setKeywordInput] = useState('');
	const [keyword, setKeyword] = useState('');
	const [statusFilter, setStatusFilter] = useState<string | undefined>();
	const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });

	useEffect(() => {
		if (keywordInput === keyword) return;
		const timer = setTimeout(() => {
			setKeyword(keywordInput);
			setPagination((p) => ({ ...p, page: 1 }));
		}, 400);
		return () => clearTimeout(timer);
	}, [keywordInput, keyword]);

	const [overrideModalOpen, setOverrideModalOpen] = useState(false);
	const [overrideRecord, setOverrideRecord] = useState<VerificationRecord | null>(null);
	const [overrideForm] = Form.useForm();

	// A-264（W1e）：manual-review 能力零入口 → 补入口（转人工复核；后端需 Step-up）
	const [manualReviewRecord, setManualReviewRecord] = useState<VerificationRecord | null>(null);
	const [manualReviewForm] = Form.useForm();
	const exportMutation = useExportVerifications();
	const manualReviewMutation = useManualReviewVerification();

	const handleExport = async () => {
		try {
			// A-264（W1e）：导出端点存在而零引用（admin_handler.go:350-413）→ 接线（CSV 文本 → 客户端 Blob 下载）
			const csv = await exportMutation.mutateAsync(statusFilter ? { status: statusFilter } : undefined);
			const blob = new Blob([typeof csv === 'string' ? csv : String(csv ?? '')], {
				type: 'text/csv;charset=utf-8',
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `verifications-${Date.now()}.csv`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			message.success(t('verifications.exportSuccess'));
		} catch (err) {
			handleApiError(err, t('verifications.exportFailed'));
		}
	};

	const openManualReviewModal = (record: VerificationRecord) => {
		setManualReviewRecord(record);
		manualReviewForm.resetFields();
	};

	const handleManualReview = async (values: { reason: string }) => {
		if (!manualReviewRecord) return;
		try {
			await manualReviewMutation.mutateAsync({ id: manualReviewRecord.id, reason: values.reason });
			message.success(t('verifications.manualReviewSuccess'));
			setManualReviewRecord(null);
			manualReviewForm.resetFields();
		} catch (err) {
			handleApiError(err, t('verifications.manualReviewFailed'));
		}
	};

	// TASK-AB1-27（RC-5 契约收敛）：分页参数经 toPageParams 单点转 wire snake（禁手写字面量）。
	const queryParams = useMemo(
		() => ({
			...toPageParams({ page: pagination.page, pageSize: pagination.pageSize }),
			...(statusFilter && { status: statusFilter }),
			...(keyword && { search: keyword }),
		}),
		[pagination, statusFilter, keyword],
	);

	const { data, isLoading, error, refetch } = useVerifications(queryParams);
	const { data: stats, isLoading: statsLoading } = useVerificationStats();
	const overrideMutation = useOverrideVerification();

	const handleSearch = () => {
		setPagination((p) => ({ ...p, page: 1 }));
		if (keywordInput === keyword) {
			refetch();
		} else {
			// 回车/点按 = 立即提交（不等防抖）
			setKeyword(keywordInput);
		}
	};

	const handleOverride = async (values: { status: string; reason: string }) => {
		if (!overrideRecord) return;
		try {
			await overrideMutation.mutateAsync({
				id: overrideRecord.id,
				status: values.status,
				reason: values.reason,
			});
			message.success(t('verifications.overrideSuccess'));
			setOverrideModalOpen(false);
			overrideForm.resetFields();
		} catch (err) {
			handleApiError(err, t('verifications.overrideFailed'));
		}
	};

	const openOverrideModal = (record: VerificationRecord) => {
		setOverrideRecord(record);
		overrideForm.setFieldsValue({ status: record.status });
		setOverrideModalOpen(true);
	};

	const columns: ColumnsType<VerificationRecord> = [
		{
			title: t('verifications.columnUserId'),
			dataIndex: 'userId',
			key: 'userId',
			ellipsis: true,
			render: (id: string) => (
				<Button type="link" size="small" onClick={() => navigate(buildNavHref(`/users/${id}`, tenantSlug))}>
					{id}
				</Button>
			),
		},
		{
			title: t('verifications.columnStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 140,
			render: (status: string) => (
				<Tag color={statusColorMap[status] || 'default'}>{statusLabelMap[status] || status}</Tag>
			),
		},
		{
			title: t('verifications.columnMethod'),
			dataIndex: 'method',
			key: 'method',
			width: 120,
			// A-262（W1e）：three_element 等原样英文 → 词表（未收录回退原值）
			render: (v: string) => methodLabelMap[v] || v || '-',
		},
		{
			title: t('verifications.columnProvider'),
			dataIndex: 'provider',
			key: 'provider',
			width: 120,
			render: (v: string) => providerLabelMap[v] || v || '-',
		},
		{
			title: t('verifications.columnAgeGroup'),
			dataIndex: 'ageGroup',
			key: 'ageGroup',
			width: 140,
			render: (v: string) => ageGroupLabelMap[v] || v || '-',
		},
		{
			title: t('verifications.columnVerifiedAt'),
			dataIndex: 'verifiedAt',
			key: 'verifiedAt',
			width: 180,
			// A-262（W1e）：RFC3339 原样 → 本地化时间
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('verifications.columnCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 180,
			// A-262（W1e）：提交时间同族本地化
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			width: 220,
			render: (_: unknown, record: VerificationRecord) => (
				<Space size="small">
					<Button type="link" size="small" onClick={() => navigate(buildNavHref(`/verifications/${record.id}`, tenantSlug))}>
						{t('verifications.actionViewDetail')}
					</Button>
					<Button type="link" size="small" danger onClick={() => openOverrideModal(record)}>
						{t('verifications.actionShortOverride')}
					</Button>
					{/* A-264（W1e）：manual-review 能力零入口 → 转人工复核入口（manual_review 行不再重复触发） */}
					{record.status !== 'manual_review' && (
						<Button type="link" size="small" onClick={() => openManualReviewModal(record)}>
							{t('verifications.actionManualReview')}
						</Button>
					)}
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('verifications.title')}
				actions={
					<>
						{/* A-264（W1e）：导出 CSV 入口（端点存在而零引用；按当前状态筛选导出） */}
						<Button
							icon={<Download size="1em" />}
							onClick={handleExport}
							loading={exportMutation.isPending}
						>
							{t('verifications.exportCsv')}
						</Button>
						<Button icon={<ClipboardCheck size="1em" />} onClick={() => refetch()}>
							{t('common.refresh')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError message={t('verifications.loadListError')} retry={refetch} className="mb-4" />
			)}

			<Row gutter={16} className="mb-6">
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsTotal')}
							value={stats?.total ?? 0}
							prefix={<ClipboardCheck size="1em" />}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsVerified')}
							value={stats?.verified ?? 0}
							prefix={<CheckCircle2 size="1em" />}
							valueStyle={{ color: 'var(--color-success-light)' }}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsPending')}
							value={stats?.pending ?? 0}
							prefix={<Clock size="1em" />}
							valueStyle={{ color: 'var(--color-warning-light)' }}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsRejected')}
							value={stats?.rejected ?? 0}
							prefix={<XCircle size="1em" />}
							valueStyle={{ color: 'var(--color-error-light)' }}
						/>
					</Card>
				</Col>
			</Row>

			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
				<Space>
					<Input.Search
						placeholder={t('verifications.searchUser')}
						allowClear
						enterButton={<Search size="1em" />}
						value={keywordInput}
						onChange={(e) => setKeywordInput(e.target.value)}
						onSearch={handleSearch}
						className="max-w-xs"
					/>
					<Select
						allowClear
						placeholder={t('verifications.filterStatus')}
						value={statusFilter}
						onChange={(v) => {
							setStatusFilter(v);
							setPagination((p) => ({ ...p, page: 1 }));
						}}
						options={statusOptions}
						className="w-40"
					/>
				</Space>
			</div>

			{isLoading ? (
				<Skeleton active paragraph={{ rows: 8 }} />
			) : (
				<DataTable
					rowKey="id"
					columns={columns}
					dataSource={data || []}
					pagination={{
						current: pagination.page,
						pageSize: pagination.pageSize,
						showSizeChanger: true,
						pageSizeOptions: [10, 20, 50, 100],
						// A-259（W1e）：模板为 {{total}} 而旧传 { count } ⇒ DOM 字面量；改传 { total }
						showTotal: (total) => t('paginationTotal', { total }),
						onChange: (page, pageSize) => setPagination({ page, pageSize }),
					}}
					scroll={{ x: 1200 }}
					locale={{ emptyText: <Empty description={t('verifications.noRecords')} /> }}
				/>
			)}

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
				open={!!manualReviewRecord}
				onCancel={() => {
					setManualReviewRecord(null);
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
		</div>
	);
}

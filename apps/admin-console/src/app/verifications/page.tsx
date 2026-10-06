'use client';

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { extractList, apiClient, useTenantSlug, toPageParams } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Input, Space, Card, Statistic, Row, Col, Select, Modal, Form, Empty, Skeleton } from 'antd';
import { message } from '@/lib/antd-app';
import {
	SearchOutlined,
	AuditOutlined,
	CheckCircleOutlined,
	ClockCircleOutlined,
	CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import {
	useVerifications,
	useVerificationStats,
	useOverrideVerification,
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
};

export default function VerificationsPage() {
	const { t } = useTranslation();
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
		}),
		[t],
	);

	const statusOptions = useMemo(
		() => Object.entries(statusLabelMap).map(([value, label]) => ({ value, label })),
		[statusLabelMap],
	);
	const queryClient = useQueryClient();

	const [keyword, setKeyword] = useState('');
	const [statusFilter, setStatusFilter] = useState<string | undefined>();
	const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });

	const [overrideModalOpen, setOverrideModalOpen] = useState(false);
	const [overrideRecord, setOverrideRecord] = useState<VerificationRecord | null>(null);
	const [overrideForm] = Form.useForm();

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
		refetch();
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
		},
		{
			title: t('verifications.columnProvider'),
			dataIndex: 'provider',
			key: 'provider',
			width: 120,
		},
		{
			title: t('verifications.columnAgeGroup'),
			dataIndex: 'ageGroup',
			key: 'ageGroup',
			width: 140,
		},
		{
			title: t('verifications.columnVerifiedAt'),
			dataIndex: 'verifiedAt',
			key: 'verifiedAt',
			width: 180,
			render: (t: string) => t || '-',
		},
		{
			title: t('verifications.columnCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 180,
		},
		{
			title: t('common.actions'),
			key: 'action',
			width: 160,
			render: (_: unknown, record: VerificationRecord) => (
				<Space size="small">
					<Button type="link" size="small" onClick={() => navigate(buildNavHref(`/verifications/${record.id}`, tenantSlug))}>
						{t('verifications.actionViewDetail')}
					</Button>
					<Button type="link" size="small" danger onClick={() => openOverrideModal(record)}>
						{t('verifications.actionShortOverride')}
					</Button>
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('verifications.title')}
				actions={
					<>
						<Button icon={<AuditOutlined />} onClick={() => refetch()}>
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
							prefix={<AuditOutlined />}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsVerified')}
							value={stats?.verified ?? 0}
							prefix={<CheckCircleOutlined />}
							valueStyle={{ color: 'var(--color-success-light)' }}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsPending')}
							value={stats?.pending ?? 0}
							prefix={<ClockCircleOutlined />}
							valueStyle={{ color: 'var(--color-warning-light)' }}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('verifications.statsRejected')}
							value={stats?.rejected ?? 0}
							prefix={<CloseCircleOutlined />}
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
						enterButton={<SearchOutlined />}
						value={keyword}
						onChange={(e) => setKeyword(e.target.value)}
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
						showTotal: (total) => t('paginationTotal', { count: total }),
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

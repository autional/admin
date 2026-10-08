'use client';

import React, { useState } from 'react';
import { usePageTitle } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Modal, Form, Input, Select, Space, Card, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import {
	useWithdrawals,
	useApproveWithdrawal,
	useRejectWithdrawal,
	type WithdrawalItem,
} from '@/hooks/use-wallet-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

// W1-02（A-365+A-367）：数据源改接 GET /admin/wallets/withdrawals（withdrawal_requests 真源，
// 旧交易端点 type=withdraw 列表与审批对象（提现申请实体）错位）；撤 bankAccount 列（响应无此字段）；
// note→remark（wire 键）；状态词表 = 服务端值域 pending/auto_approved/completed/rejected；
// 批准加确认弹窗；驳回契约键 remark（旧 reason 键与 RejectWithdrawalRequest.remark 错配）。
export default function WalletWithdrawalsPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('walletWithdrawals.title')); // A-369③：tab 标题（旧实现恒「Autional 管理控制台」，第 26 例）
	const [filters, setFilters] = useState<Record<string, unknown>>({});
	// A-369⑤：服务端分页受控（服务端默认 page_size=20 vs 旧本地 10/页伪全量 ⇒ 第 11 条起不可达）
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const { data: result, isLoading, error, refetch } = useWithdrawals({ ...filters, page, pageSize });
	const withdrawals = result?.items ?? [];
	const total = result?.pagination?.total ?? 0;
	const approveMut = useApproveWithdrawal();
	const rejectMut = useRejectWithdrawal();

	const [rejectModal, setRejectModal] = useState(false);
	const [selectedId, setSelectedId] = useState<string>('');
	const [rejectForm] = Form.useForm();

	const handleApprove = async (id: string) => {
		try {
			// 审批人由服务端从 JWT 派生，请求体不携带身份字段（G2 信任边界）。
			await approveMut.mutateAsync({ id, data: {} });
			message.success(t('walletWithdrawals.approved'));
		} catch (err) {
			handleApiError(err, t('walletWithdrawals.approveFailed'));
		}
	};

	const handleReject = async (values: { remark: string }) => {
		try {
			await rejectMut.mutateAsync({ id: selectedId, data: { remark: values.remark } });
			message.success(t('walletWithdrawals.rejected'));
			setRejectModal(false);
			rejectForm.resetFields();
		} catch (err) {
			handleApiError(err, t('walletWithdrawals.rejectFailed'));
		}
	};

	const columns = [
		{ title: t('walletWithdrawals.colId'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{ title: t('walletWithdrawals.colUserId'), dataIndex: 'userId', key: 'userId', width: 120 },
		{
			title: t('walletWithdrawals.colAmount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 120,
			// A-369①：去硬编码 ¥（wire 六键无币种字段，dto.go:605-612；钱包币种可 USD ⇒ ¥ 无依据，
			// 宁缺勿伪）；仅数值两段式格式化。
			render: (v: string) => parseFloat(v).toFixed(2),
		},
		{
			title: t('walletWithdrawals.colStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					pending: 'processing',
					auto_approved: 'cyan',
					completed: 'success',
					rejected: 'error',
				};
				const labelMap: Record<string, string> = {
					pending: t('walletWithdrawals.statusPending'),
					auto_approved: t('walletWithdrawals.statusAutoApproved'),
					completed: t('walletWithdrawals.statusCompleted'),
					rejected: t('walletWithdrawals.statusRejected'),
				};
				return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
			},
		},
		{ title: t('walletWithdrawals.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true },
		{
			title: t('walletWithdrawals.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			// A-369②：toLocaleString 无 locale（旧恒跑宿主默认）
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('walletWithdrawals.colActions'),
			key: 'action',
			width: 160,
			render: (_: unknown, record: WithdrawalItem) => (
				<Space size="small">
					{record.status === 'pending' && (
						<>
							<Popconfirm
								title={t('walletWithdrawals.approveConfirm')}
								onConfirm={() => handleApprove(record.id)}
								okText={t('walletWithdrawals.approve')}
								cancelText={t('common.cancel')}
							>
								<Button type="link" size="small">
									{t('walletWithdrawals.approve')}
								</Button>
							</Popconfirm>
							<Button
								type="link"
								danger
								size="small"
								onClick={() => {
									setSelectedId(record.id);
									rejectForm.resetFields();
									setRejectModal(true);
								}}
							>
								{t('walletWithdrawals.reject')}
							</Button>
						</>
					)}
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('walletWithdrawals.title')} />

			{error && (
				<PageError message={t('walletWithdrawals.loadError')} retry={refetch} className="mb-4" />
			)}

			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('walletWithdrawals.filterPlaceholder')}
						allowClear
						className="w-30"
						value={filters.status}
						onChange={(v) => {
							setFilters({ ...filters, status: v });
							setPage(1);
						}}
						options={[
							{ value: 'pending', label: t('walletWithdrawals.statusPending') },
							{ value: 'auto_approved', label: t('walletWithdrawals.statusAutoApproved') },
							{ value: 'completed', label: t('walletWithdrawals.statusCompleted') },
							{ value: 'rejected', label: t('walletWithdrawals.statusRejected') },
						]}
					/>
				</Space>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={withdrawals}
				loading={isLoading}
				// A-369⑤：服务端真 total 驱动页数（旧本地 pageSize:10 ⇒ 伪全量）
				pagination={{
					current: page,
					pageSize,
					total,
					onChange: (p, ps) => {
						setPage(p);
						setPageSize(ps);
					},
				}}
				scroll={{ x: 1000 }}
			/>

			<Modal
				title={t('walletWithdrawals.rejectTitle')}
				open={rejectModal}
				onCancel={() => {
					setRejectModal(false);
					rejectForm.resetFields();
				}}
				onOk={() => rejectForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={rejectForm} layout="vertical" onFinish={handleReject}>
					<Form.Item
						name="remark"
						label={t('walletWithdrawals.rejectReason')}
						rules={[{ required: true }]}
					>
						<Input.TextArea rows={3} placeholder={t('walletWithdrawals.rejectReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

'use client';

import React, { useState } from 'react';
import { useCurrentTenantId, usePageTitle } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Modal, Form, Input, Select, Card, Space } from 'antd';
import { message } from '@/lib/antd-app';

import { useWalletDisputes, useResolveDispute, type Dispute } from '@/hooks/use-wallets';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

// W1-03（A-370+A-372）：裁决契约键 resolution/remark（旧 result/reason 错配）；
// 选项值域 = 服务端裁决词表 resolved/rejected（旧 approved/partial 幽灵值被 oneof 拒）；
// 撤 amount 列（服务端无此字段，toFixed 假声明崩溃）；去幽灵 'open'（按钮条件仅 pending）；
// 标签本地化 + 文案去资金承诺（原「通过（退款）/部分退款」）。
export default function WalletDisputesPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('walletDisputes.title')); // A-374③：tab 标题（旧实现恒「Autional 管理控制台」，第 27 例）
	const tenantId = useCurrentTenantId() ?? '';
	// A-375①：状态筛选（旧无筛选控件）；A-374④：服务端分页受控（旧本地 10/页伪全量）
	const [status, setStatus] = useState<string | undefined>(undefined);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const { data: result, isLoading, error, refetch } = useWalletDisputes(tenantId, {
		...(status ? { status } : {}),
		page,
		pageSize,
	});
	const disputes = result?.items ?? [];
	const total = result?.pagination?.total ?? 0;
	const resolveMut = useResolveDispute();

	const [resolveModal, setResolveModal] = useState(false);
	const [current, setCurrent] = useState<Dispute | null>(null);
	const [form] = Form.useForm();

	const handleResolve = async (values: { resolution: string; remark: string }) => {
		if (!current || !tenantId) return;
		try {
			await resolveMut.mutateAsync({
				tenantId,
				id: current.id,
				data: { resolution: values.resolution, remark: values.remark },
			});
			message.success(t('walletDisputes.resolved'));
			setResolveModal(false);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('walletDisputes.resolveFailed'));
		}
	};

	const columns = [
		{ title: t('walletDisputes.colId'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{
			title: t('walletDisputes.colTransactionId'),
			dataIndex: 'transactionId',
			key: 'transactionId',
			ellipsis: true,
			width: 160,
		},
		{ title: t('walletDisputes.colReason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
		{
			title: t('walletDisputes.colStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					pending: 'warning',
					resolved: 'success',
					rejected: 'error',
				};
				const labelMap: Record<string, string> = {
					pending: t('walletDisputes.statusPending'),
					resolved: t('walletDisputes.statusResolved'),
					rejected: t('walletDisputes.statusRejected'),
				};
				return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
			},
		},
		{
			title: t('walletDisputes.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			// A-374②：toLocaleString 无 locale（旧恒跑宿主默认）
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('walletDisputes.colActions'),
			key: 'action',
			width: 80,
			render: (_: unknown, record: Dispute) => (
				<Button
					type="link"
					size="small"
					disabled={record.status !== 'pending'}
					onClick={() => {
						setCurrent(record);
						form.resetFields();
						setResolveModal(true);
					}}
				>
					{t('walletDisputes.handle')}
				</Button>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('walletDisputes.title')} />

			{error && (
				<PageError message={t('walletDisputes.loadError')} retry={refetch} className="mb-4" />
			)}

			{/* A-375①：状态筛选（旧无筛选控件，全量拉取后本地看） */}
			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('walletDisputes.statusFilter')}
						allowClear
						className="w-30"
						value={status}
						onChange={(v) => {
							setStatus(v as string | undefined);
							setPage(1);
						}}
						options={[
							{ value: 'pending', label: t('walletDisputes.statusPending') },
							{ value: 'resolved', label: t('walletDisputes.statusResolved') },
							{ value: 'rejected', label: t('walletDisputes.statusRejected') },
						]}
					/>
				</Space>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={disputes}
				loading={isLoading}
				// A-374④：服务端真 total 驱动页数
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
				title={t('walletDisputes.resolveTitle')}
				open={resolveModal}
				onCancel={() => {
					setResolveModal(false);
					setCurrent(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleResolve}>
					<Form.Item
						name="resolution"
						label={t('walletDisputes.fieldResolution')}
						rules={[{ required: true }]}
					>
						<Select
							options={[
								{ value: 'resolved', label: t('walletDisputes.resultResolved') },
								{ value: 'rejected', label: t('walletDisputes.resultRejected') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="remark"
						label={t('walletDisputes.fieldRemark')}
						rules={[{ required: true }]}
					>
						<Input.TextArea rows={3} placeholder={t('walletDisputes.fieldRemarkPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

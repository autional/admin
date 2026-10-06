'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Modal, Form, Input, Select, Space } from 'antd';
import { message } from '@/lib/antd-app';

import { useWalletDisputes, useResolveDispute, type Dispute } from '@/hooks/use-wallets';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

export default function WalletDisputesPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const { data: disputes = [], isLoading, error, refetch } = useWalletDisputes(tenantId);
	const resolveMut = useResolveDispute();

	const [resolveModal, setResolveModal] = useState(false);
	const [current, setCurrent] = useState<Dispute | null>(null);
	const [form] = Form.useForm();

	const handleResolve = async (values: { result: string; reason: string }) => {
		if (!current || !tenantId) return;
		try {
			await resolveMut.mutateAsync({ tenantId, id: current.id, data: values });
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
			title: t('walletDisputes.colAmount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 120,
			render: (v: number) => `¥${v.toFixed(2)}`,
		},
		{
			title: t('walletDisputes.colStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => (
				<Tag color={v === 'resolved' ? 'success' : v === 'rejected' ? 'error' : 'warning'}>{v}</Tag>
			),
		},
		{
			title: t('walletDisputes.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('walletDisputes.colActions'),
			key: 'action',
			width: 80,
			render: (_: unknown, record: Dispute) => (
				<Button
					type="link"
					size="small"
					disabled={record.status !== 'open' && record.status !== 'pending'}
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
			<ConsolePageHeader title={t('walletDisputes.title')} />

			{error && (
				<PageError message={t('walletDisputes.loadError')} retry={refetch} className="mb-4" />
			)}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={disputes}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
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
						name="result"
						label={t('walletDisputes.fieldResult')}
						rules={[{ required: true }]}
					>
						<Select
							options={[
								{ value: 'approved', label: t('walletDisputes.resultApproved') },
								{ value: 'rejected', label: t('walletDisputes.resultRejected') },
								{ value: 'partial', label: t('walletDisputes.resultPartial') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('walletDisputes.fieldReason')}
						rules={[{ required: true }]}
					>
						<Input.TextArea rows={3} placeholder={t('walletDisputes.fieldReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

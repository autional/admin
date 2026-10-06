'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Modal, Form, Input, Select, Space, Popconfirm, InputNumber } from 'antd';
import { message } from '@/lib/antd-app';
import { PlusOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import {
	useWalletList,
	useCreateWallet,
	useUpdateWallet,
	useDeleteWallet,
	useBatchFreeze,
	useBatchUnfreeze,
	type WalletItem,
} from '@/hooks/use-wallet-admin';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import type { CreateWalletRequest } from '@autional/shared/generated/types';
import { ConsolePageHeader } from '@autional/ui';

export default function WalletListPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const { data: wallets = [], isLoading, error, refetch } = useWalletList({ tenant_id: tenantId });
	const createMut = useCreateWallet();
	const updateMut = useUpdateWallet();
	const deleteMut = useDeleteWallet();
	const freezeMut = useBatchFreeze();
	const unfreezeMut = useBatchUnfreeze();

	const [createModal, setCreateModal] = useState(false);
	const [form] = Form.useForm();

	const handleCreate = async (values: Record<string, unknown>) => {
		try {
			await createMut.mutateAsync(values as unknown as CreateWalletRequest);
			message.success(t('walletList.createSuccess'));
			setCreateModal(false);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('walletList.createFailed'));
		}
	};

	const handleFreeze = async (userId: string) => {
		try {
			await freezeMut.mutateAsync({ user_ids: [userId] });
			message.success(t('walletList.freezeSuccess'));
		} catch (err) {
			handleApiError(err, t('walletList.freezeFailed'));
		}
	};

	const handleUnfreeze = async (userId: string) => {
		try {
			await unfreezeMut.mutateAsync({ user_ids: [userId] });
			message.success(t('walletList.unfreezeSuccess'));
		} catch (err) {
			handleApiError(err, t('walletList.unfreezeFailed'));
		}
	};

	const columns = [
		{ title: t('walletList.colId'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{
			title: t('walletList.colUserId'),
			dataIndex: 'userId',
			key: 'userId',
			ellipsis: true,
			width: 120,
		},
		{
			title: t('walletList.colBalance'),
			dataIndex: 'balance',
			key: 'balance',
			width: 120,
			render: (v: string) => `¥${parseFloat(v).toFixed(2)}`,
		},
		{ title: t('walletList.colCurrency'), dataIndex: 'currency', key: 'currency', width: 80 },
		{
			title: t('walletList.colStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 80,
			render: (v: string) => (
				<Tag color={v === 'active' ? 'success' : 'error'}>
					{v === 'active'
						? t('walletList.statusActive')
						: v === 'frozen'
							? t('walletList.statusFrozen')
							: v}
				</Tag>
			),
		},
		{
			title: t('walletList.colFrozenAmount'),
			dataIndex: 'frozenAmount',
			key: 'frozenAmount',
			width: 120,
			render: (v: string) => (v ? `¥${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('walletList.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('walletList.colActions'),
			key: 'action',
			width: 200,
			render: (_: unknown, record: WalletItem) => (
				<Space size="small">
					{record.status === 'active' ? (
						<Popconfirm
							title={t('walletList.confirmFreeze')}
							onConfirm={() => handleFreeze(record.userId)}
							okText={t('walletList.ok')}
							cancelText={t('walletList.cancel')}
						>
							<Button type="link" icon={<LockOutlined />} size="small">
								{t('walletList.freeze')}
							</Button>
						</Popconfirm>
					) : (
						<Popconfirm
							title={t('walletList.confirmUnfreeze')}
							onConfirm={() => handleUnfreeze(record.userId)}
							okText={t('walletList.ok')}
							cancelText={t('walletList.cancel')}
						>
							<Button type="link" icon={<UnlockOutlined />} size="small">
								{t('walletList.unfreeze')}
							</Button>
						</Popconfirm>
					)}
					<Popconfirm
						title={t('walletList.confirmDelete')}
						onConfirm={() => deleteMut.mutate(record.id)}
						okText={t('walletList.ok')}
						cancelText={t('walletList.cancel')}
					>
						<Button type="link" danger size="small">
							{t('walletList.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('walletList.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								form.resetFields();
								setCreateModal(true);
							}}
						>
							{t('walletList.createButton')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('walletList.loadError')} retry={refetch} className="mb-4" />}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={wallets}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1100 }}
			/>

			<Modal
				title={t('walletList.createTitle')}
				open={createModal}
				onCancel={() => {
					setCreateModal(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={createMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleCreate}>
					<Form.Item
						name="user_id"
						label={t('walletList.fieldUserId')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('walletList.fieldUserIdPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="currency"
						label={t('walletList.fieldCurrency')}
						rules={[{ required: true }]}
						initialValue="CNY"
					>
						<Select
							options={[
								{ value: 'CNY', label: t('walletList.currencyCNY') },
								{ value: 'USD', label: t('walletList.currencyUSD') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="initial_balance"
						label={t('walletList.fieldInitialBalance')}
						initialValue="0"
					>
						<InputNumber className="w-full" precision={2} placeholder="0.00" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

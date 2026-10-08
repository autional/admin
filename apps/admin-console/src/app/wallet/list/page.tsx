'use client';

import React, { useState } from 'react';
import { useCurrentTenantId, usePageTitle } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Modal, Form, Input, Select, Space, Popconfirm, InputNumber } from 'antd';
import { message } from '@/lib/antd-app';
import { Lock, Plus, Unlock } from 'lucide-react';
import {
	useWalletList,
	useCreateWallet,
	useDeleteWallet,
	useBatchFreeze,
	useBatchUnfreeze,
	type WalletItem,
} from '@/hooks/use-wallet-admin';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import type { CreateWalletRequest } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';

// A-362①：币符按钱包币种（USD → $，其余默认 ¥；旧实现硬编码 ¥ 而创建弹窗币种可选 USD）
const currencySymbol = (currency?: string) => (currency === 'USD' ? '$' : '¥');

export default function WalletListPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('walletList.title'));
	const tenantId = useCurrentTenantId() ?? '';
	// A-362⑥：服务端分页受控（服务端真 total 驱动）
	const [walletPage, setWalletPage] = useState(1);
	const [walletPageSize, setWalletPageSize] = useState(10);
	const {
		data: walletResult,
		isLoading,
		error,
		refetch,
	} = useWalletList({ tenant_id: tenantId, page: walletPage, pageSize: walletPageSize });
	const wallets = walletResult?.items ?? [];
	const walletTotal = walletResult?.pagination?.total ?? 0;
	const createMut = useCreateWallet();
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
			// A-362①：币符按 record.currency（旧硬编码 ¥）
			render: (v: string, r: WalletItem) => `${currencySymbol(r.currency)}${parseFloat(v).toFixed(2)}`,
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
			// A-362①：币符按 record.currency（旧硬编码 ¥）
			render: (v: string, r: WalletItem) =>
				v ? `${currencySymbol(r.currency)}${parseFloat(v).toFixed(2)}` : '-',
		},
		{
			title: t('walletList.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			// A-362③：时间本地化（旧 toLocaleString() 无 locale ⇒ 恒系统区域）
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
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
							<Button type="link" icon={<Lock size="1em" />} size="small">
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
							<Button type="link" icon={<Unlock size="1em" />} size="small">
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
			<AppPageHeader
				title={t('walletList.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
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
				pagination={{
					// A-362⑥：服务端分页受控（旧本地 pageSize:10 ⇒ 服务端默认 20/页下第 11 条起不可达）
					current: walletPage,
					pageSize: walletPageSize,
					total: walletTotal,
					showSizeChanger: true,
					onChange: (p, ps) => {
						setWalletPage(p);
						setWalletPageSize(ps);
					},
				}}
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

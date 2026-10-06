'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Card, Tag, Button, Statistic, Row, Col, Space, Modal, Form, Input, Select, DatePicker, Tabs, InputNumber } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	WalletOutlined,
	ArrowUpOutlined,
	ArrowDownOutlined,
	ToolOutlined,
	PlusOutlined,
	EditOutlined,
	DeleteOutlined,
	GiftOutlined,
	SafetyOutlined,
	SyncOutlined,
	LockOutlined,
	UnlockOutlined,
} from '@ant-design/icons';
import {
	useWalletSummary,
	useWalletTransactions,
	useWalletDisputes,
	useResolveDispute,
	useAdjustWallet,
	useCoupons,
	useCreateCoupon,
	useUpdateCoupon,
	useDeleteCoupon,
	useFraudRules,
	useUpdateFraudRules,
	useReconciliation,
	useBatchFreeze,
	useBatchUnfreeze,
} from '@/hooks/use-wallets';
import { useWalletPolicy, useUpdateWalletPolicy } from '@/hooks/use-wallet-admin';
import type { Transaction, Dispute, Coupon, FraudRule } from '@/hooks/use-wallets';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DateRangeValue } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

export default function WalletsPage() {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState('overview');
	const [txFilters, setTxFilters] = useState({
		user: '',
		type: undefined as string | undefined,
		status: undefined as string | undefined,
		dateRange: null as DateRangeValue,
	});

	const [disputeModal, setDisputeModal] = useState(false);
	const [disputeForm] = Form.useForm();
	const [currentDispute, setCurrentDispute] = useState<Dispute | null>(null);

	const [adjustModal, setAdjustModal] = useState(false);
	const [adjustForm] = Form.useForm();

	const [couponModal, setCouponModal] = useState(false);
	const [couponForm] = Form.useForm();
	const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

	const [fraudForm] = Form.useForm();
	const [reconDate, setReconDate] = useState<string>('');

	const [batchFreezeModal, setBatchFreezeModal] = useState(false);
	const [batchUnfreezeModal, setBatchUnfreezeModal] = useState(false);
	const [batchForm] = Form.useForm();
	const [policyForm] = Form.useForm();
	const [policyAppId, setPolicyAppId] = useState<string>('');

	const tenantId = useCurrentTenantId() ?? '';

	const {
		data: summary,
		isLoading: summaryLoading,
		error: walletSummaryError,
		refetch: walletSummaryRefetch,
	} = useWalletSummary(tenantId);
	const {
		data: transactions = [],
		isLoading: txLoading,
		refetch: refetchTx,
		error: walletTransactionsError,
		refetch: walletTransactionsRefetch,
	} = useWalletTransactions(tenantId);
	const {
		data: disputes = [],
		isLoading: disputeLoading,
		error: walletDisputesError,
		refetch: walletDisputesRefetch,
	} = useWalletDisputes(tenantId);

	const {
		data: coupons = [],
		isLoading: couponsLoading,
		error: couponsError,
		refetch: couponsRefetch,
	} = useCoupons();
	const {
		data: fraudRules = [],
		isLoading: fraudLoading,
		error: fraudError,
		refetch: fraudRefetch,
	} = useFraudRules();
	const {
		data: reconciliation = [],
		isLoading: reconLoading,
		refetch: reconRefetch,
	} = useReconciliation(reconDate ? { date: reconDate } : undefined);

	const resolveMut = useResolveDispute();
	const adjustMut = useAdjustWallet();
	const createCouponMut = useCreateCoupon();
	const updateCouponMut = useUpdateCoupon();
	const deleteCouponMut = useDeleteCoupon();
	const updateFraudMut = useUpdateFraudRules();
	const batchFreezeMut = useBatchFreeze();
	const batchUnfreezeMut = useBatchUnfreeze();
	const { data: walletPolicy, isLoading: policyLoading } = useWalletPolicy(tenantId, policyAppId);
	const updatePolicyMut = useUpdateWalletPolicy();

	React.useEffect(() => {
		if (fraudRules.length > 0 && !fraudForm.getFieldValue('rules')) {
			fraudForm.setFieldsValue({ rules: fraudRules });
		}
	}, [fraudRules, fraudForm]);

	React.useEffect(() => {
		if (walletPolicy) {
			policyForm.setFieldsValue(walletPolicy);
		}
	}, [walletPolicy, policyForm]);

	const applyTxFilters = async () => {
		if (!tenantId) return;
		const params: Record<string, unknown> = {};
		if (txFilters.user) params.userId = txFilters.user;
		if (txFilters.type) params.type = txFilters.type;
		if (txFilters.status) params.status = txFilters.status;
		if (txFilters.dateRange) {
			params.startTime = txFilters.dateRange[0];
			params.endTime = txFilters.dateRange[1];
		}
		refetchTx();
	};

	const handleResolveDispute = async (values: { result: string; reason: string }) => {
		if (!currentDispute || !tenantId) return;
		try {
			await resolveMut.mutateAsync({ tenantId, id: currentDispute.id, data: values });
			message.success(t('wallets.disputeResolved'));
			setDisputeModal(false);
			disputeForm.resetFields();
			setCurrentDispute(null);
		} catch (err) {
			handleApiError(err, t('wallets.processFailed'));
		}
	};

	const handleAdjust = async (values: { userId: string; amount: number; reason: string }) => {
		try {
			await adjustMut.mutateAsync({
				userId: values.userId,
				data: { amount: values.amount, reason: values.reason },
			});
			message.success(t('wallets.adjustSuccess'));
			setAdjustModal(false);
			adjustForm.resetFields();
		} catch (err) {
			handleApiError(err, t('wallets.adjustFailed'));
		}
	};

	const handleSaveCoupon = async (values: any) => {
		try {
			if (editingCoupon) {
				await updateCouponMut.mutateAsync({ id: editingCoupon.id, data: values });
				message.success(t('wallets.couponUpdated'));
			} else {
				await createCouponMut.mutateAsync(values);
				message.success(t('wallets.couponCreated'));
			}
			setCouponModal(false);
			couponForm.resetFields();
			setEditingCoupon(null);
		} catch (err) {
			handleApiError(err, t('wallets.saveFailed'));
		}
	};

	const handleDeleteCoupon = (id: string) => {
		modal.confirm({
			title: t('wallets.confirmDelete'),
			content: t('wallets.deleteConfirm'),
			okText: t('wallets.delete'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deleteCouponMut.mutateAsync(id);
					message.success(t('wallets.deleteSuccessMsg'));
				} catch (err) {
					handleApiError(err, t('wallets.deleteFailed'));
				}
			},
		});
	};

	const handleSaveFraudRules = async (values: { rules: FraudRule[] }) => {
		try {
			await updateFraudMut.mutateAsync({ rules: values.rules } as Record<string, unknown>);
			message.success(t('wallets.fraudRulesSaved'));
		} catch (err) {
			handleApiError(err, t('wallets.saveFailed'));
		}
	};

	const handleBatchFreeze = async (values: { userIds: string; reason: string }) => {
		try {
			const userIds = values.userIds
				.split(',')
				.map((s: string) => s.trim())
				.filter(Boolean);
			await batchFreezeMut.mutateAsync({ userIds, reason: values.reason });
			message.success(t('wallets.batchFreezeSuccess'));
			setBatchFreezeModal(false);
			batchForm.resetFields();
		} catch (err) {
			handleApiError(err, t('wallets.batchFreezeFailed'));
		}
	};

	const handleBatchUnfreeze = async (values: { userIds: string; reason: string }) => {
		try {
			const userIds = values.userIds
				.split(',')
				.map((s: string) => s.trim())
				.filter(Boolean);
			await batchUnfreezeMut.mutateAsync({ userIds, reason: values.reason });
			message.success(t('wallets.batchUnfreezeSuccess'));
			setBatchUnfreezeModal(false);
			batchForm.resetFields();
		} catch (err) {
			handleApiError(err, t('wallets.batchUnfreezeFailed'));
		}
	};

	const txColumns: any[] = [
		{ title: t('wallets.txId'), dataIndex: 'id', key: 'id', ellipsis: true },
		{
			title: t('wallets.user'),
			dataIndex: 'userName',
			key: 'userName',
			render: (_: any, r: Transaction) => r.userName || r.userId,
		},
		{
			title: t('wallets.type'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					recharge: 'success',
					withdraw: 'error',
					transfer: 'blue',
					adjustment: 'orange',
				};
				return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
			},
		},
		{
			title: t('wallets.amount'),
			dataIndex: 'amount',
			key: 'amount',
			render: (v: number) => `¥${Number(v ?? 0).toFixed(2)}`,
		},
		{
			title: t('wallets.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag color={v === 'completed' ? 'success' : v === 'pending' ? 'warning' : 'error'}>{v}</Tag>
			),
		},
		{ title: t('wallets.time'), dataIndex: 'createdAt', key: 'createdAt' },
	];

	const disputeColumns = [
		{ title: t('wallets.disputeId'), dataIndex: 'id', key: 'id' },
		{ title: t('wallets.txId'), dataIndex: 'transactionId', key: 'transactionId' },
		{ title: t('wallets.userId'), dataIndex: 'userId', key: 'userId' },
		{ title: t('wallets.reason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
		{
			title: t('wallets.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'resolved' ? 'success' : 'warning'}>{v}</Tag>,
		},
		{ title: t('wallets.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
		{
			title: t('wallets.actions'),
			key: 'action',
			render: (_: any, record: Dispute) => (
				<Button
					type="link"
					disabled={record.status === 'resolved'}
					onClick={() => {
						setCurrentDispute(record);
						disputeForm.resetFields();
						setDisputeModal(true);
					}}
				>
					{t('wallets.process')}
				</Button>
			),
		},
	];

	const couponColumns = [
		{
			title: t('wallets.code'),
			dataIndex: 'code',
			key: 'code',
			render: (v: string) => <Tag color="gold">{v}</Tag>,
		},
		{ title: t('wallets.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('wallets.type'),
			dataIndex: 'discountType',
			key: 'discountType',
			render: (v: string) => (
				<Tag color={v === 'percentage' ? 'blue' : 'green'}>
					{v === 'percentage'
						? t('wallets.percentage')
						: v === 'fixed'
							? t('wallets.fixedAmount')
							: v || '-'}
				</Tag>
			),
		},
		{
			title: t('wallets.discountValue'),
			dataIndex: 'discountValue',
			key: 'discountValue',
			render: (v: number) => (v != null ? (v > 0 ? `¥${v}` : `${v}%`) : '-'),
		},
		{
			title: t('wallets.minAmount'),
			dataIndex: 'minOrderAmount',
			key: 'minOrderAmount',
			render: (v: number) => (v != null ? `¥${v}` : '-'),
		},
		{
			title: t('wallets.validPeriod'),
			dataIndex: 'validUntil',
			key: 'validUntil',
			render: (v: string, r: Coupon) => {
				const from = r.validFrom ? new Date(r.validFrom).toLocaleDateString() : '-';
				const to = v ? new Date(v).toLocaleDateString() : '-';
				return `${from} ~ ${to}`;
			},
		},
		{
			title: t('wallets.usage'),
			key: 'usage',
			render: (_: any, r: Coupon) => `${r.usedCount || 0}/${r.usageLimit || '∞'}`,
		},
		{
			title: t('wallets.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'active' ? 'success' : 'default'}>{v || '-'}</Tag>,
		},
		{
			title: t('wallets.actions'),
			key: 'action',
			render: (_: any, record: Coupon) => (
				<Space size="small">
					<Button
						type="link"
						icon={<EditOutlined />}
						onClick={() => {
							setEditingCoupon(record);
							couponForm.setFieldsValue(record);
							setCouponModal(true);
						}}
					>
						{t('wallets.edit')}
					</Button>
					<Button
						type="link"
						danger
						icon={<DeleteOutlined />}
						onClick={() => handleDeleteCoupon(record.id)}
					>
						{t('wallets.delete')}
					</Button>
				</Space>
			),
		},
	];

	const reconColumns = [
		{ title: t('wallets.date'), dataIndex: 'date', key: 'date' },
		{
			title: t('wallets.internalBalance'),
			dataIndex: 'internalBalance',
			key: 'internalBalance',
			render: (v: number) => `¥${Number(v ?? 0).toFixed(2)}`,
		},
		{
			title: t('wallets.externalBalance'),
			dataIndex: 'externalBalance',
			key: 'externalBalance',
			render: (v: number) => `¥${Number(v ?? 0).toFixed(2)}`,
		},
		{
			title: t('wallets.difference'),
			dataIndex: 'difference',
			key: 'difference',
			render: (v: number) => (
				<span className={v !== 0 ? 'text-danger-text font-medium' : 'text-success-text'}>
					¥{Number(v ?? 0).toFixed(2)}
				</span>
			),
		},
		{
			title: t('wallets.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'balanced' ? 'success' : 'error'}>{v || '-'}</Tag>,
		},
		{ title: t('wallets.txCount'), dataIndex: 'transactions', key: 'transactions' },
	];

	return (
		<div>
			{walletSummaryError && (
				<PageError message={t('wallets.loadError')} retry={walletSummaryRefetch} className="mb-4" />
			)}
			{walletTransactionsError && (
				<PageError
					message={t('wallets.loadError')}
					retry={walletTransactionsRefetch}
					className="mb-4"
				/>
			)}
			{walletDisputesError && (
				<PageError
					message={t('wallets.loadError')}
					retry={walletDisputesRefetch}
					className="mb-4"
				/>
			)}

			<ConsolePageHeader
				title={t('wallets.title')}
				actions={
					<>
						<Space>
							<Button
								icon={<LockOutlined />}
								onClick={() => {
									batchForm.resetFields();
									setBatchFreezeModal(true);
								}}
							>
								{t('wallets.batchFreeze')}
							</Button>
							<Button
								icon={<UnlockOutlined />}
								onClick={() => {
									batchForm.resetFields();
									setBatchUnfreezeModal(true);
								}}
							>
								{t('wallets.batchUnfreeze')}
							</Button>
							<Button
								type="primary"
								icon={<ToolOutlined />}
								onClick={() => {
									adjustForm.resetFields();
									setAdjustModal(true);
								}}
							>
								{t('wallets.manualAdjust')}
							</Button>
						</Space>
					</>
				}
			/>

			<Row gutter={16} className="mb-4">
				<Col xs={24} sm={12} md={6}>
					<Card>
						<Statistic
							title={t('wallets.balance')}
							value={summary?.totalBalance ?? summary?.balance ?? 0}
							precision={2}
							valueStyle={{ color: 'var(--color-success-text)' }}
							prefix={
								<span>
									<WalletOutlined /> ¥
								</span>
							}
						/>
					</Card>
				</Col>
				<Col xs={24} sm={12} md={6}>
					<Card>
						<Statistic
							title={t('wallets.frozenAmount')}
							value={summary?.totalFrozenBalance ?? summary?.frozenAmount ?? 0}
							prefix="¥"
							precision={2}
							valueStyle={{ color: 'var(--color-danger-text)' }}
						/>
					</Card>
				</Col>
				<Col xs={24} sm={12} md={6}>
					<Card>
						<Statistic
							title={t('wallets.totalIncome')}
							value={summary?.totalIncome || 0}
							precision={2}
							prefix={
								<span>
									<ArrowUpOutlined /> ¥
								</span>
							}
						/>
					</Card>
				</Col>
				<Col xs={24} sm={12} md={6}>
					<Card>
						<Statistic
							title={t('wallets.totalExpense')}
							value={summary?.totalExpense || 0}
							precision={2}
							valueStyle={{ color: 'var(--color-danger-text)' }}
							prefix={
								<span>
									<ArrowDownOutlined /> ¥
								</span>
							}
						/>
					</Card>
				</Col>
			</Row>

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'overview',
						label: t('wallets.transactionHistory'),
						children: (
							<>
								<Card size="small" className="mb-4">
									<Space wrap>
										<Input
											placeholder={t('wallets.userIdOrName')}
											value={txFilters.user}
											onChange={(e) => setTxFilters({ ...txFilters, user: e.target.value })}
											className="!w-40"
										/>
										<Select
											placeholder={t('wallets.txType')}
											allowClear
											className="!w-[120px]"
											value={txFilters.type}
											onChange={(v) => setTxFilters({ ...txFilters, type: v })}
											options={[
												{ value: 'recharge', label: t('wallets.recharge') },
												{ value: 'withdraw', label: t('wallets.withdraw') },
												{ value: 'transfer', label: t('wallets.transfer') },
												{ value: 'adjustment', label: t('wallets.adjustment') },
											]}
										/>
										<Select
											placeholder={t('wallets.status')}
											allowClear
											className="!w-[120px]"
											value={txFilters.status}
											onChange={(v) => setTxFilters({ ...txFilters, status: v })}
											options={[
												{ value: 'completed', label: t('wallets.completed') },
												{ value: 'pending', label: t('wallets.pending') },
												{ value: 'failed', label: t('wallets.failed') },
											]}
										/>
										<DateRangeFilter
											showTime
											format="YYYY-MM-DD HH:mm:ss"
											value={txFilters.dateRange}
											onChange={(dateRange) => setTxFilters({ ...txFilters, dateRange })}
										/>
										<Button type="primary" onClick={applyTxFilters}>
											{t('wallets.filter')}
										</Button>
									</Space>
								</Card>
								<DataTable
									rowKey="id"
									columns={txColumns}
									dataSource={transactions}
									loading={txLoading}
									pagination={{ pageSize: 10 }}
									scroll={{ x: 800 }}
								/>
							</>
						),
					},
					{
						key: 'disputes',
						label: t('wallets.disputeHandling'),
						children: (
							<DataTable
								rowKey="id"
								columns={disputeColumns}
								dataSource={disputes}
								loading={disputeLoading}
								pagination={{ pageSize: 10 }}
								scroll={{ x: 800 }}
							/>
						),
					},
					{
						key: 'coupons',
						label: t('wallets.coupons'),
						children: (
							<>
								<div className="flex justify-end mb-4">
									<Button
										type="primary"
										icon={<PlusOutlined />}
										onClick={() => {
											setEditingCoupon(null);
											couponForm.resetFields();
											setCouponModal(true);
										}}
									>
										{t('wallets.createCoupon')}
									</Button>
								</div>
								{couponsError && (
									<PageError
										message={t('wallets.loadCouponsError')}
										retry={couponsRefetch}
										className="mb-4"
									/>
								)}
								<DataTable
									rowKey="id"
									columns={couponColumns}
									dataSource={coupons}
									loading={couponsLoading}
									pagination={{ pageSize: 10 }}
									scroll={{ x: 800 }}
								/>
							</>
						),
					},
					{
						key: 'fraud',
						label: t('wallets.fraudRules'),
						children: (
							<div className="max-w-2xl">
								{fraudError && (
									<PageError
										message={t('wallets.loadFraudRulesError')}
										retry={fraudRefetch}
										className="mb-4"
									/>
								)}
								{fraudLoading ? (
									<Card loading />
								) : (
									<Form form={fraudForm} layout="vertical" onFinish={handleSaveFraudRules}>
										<Form.List name="rules">
											{(fields, { add, remove }) => (
												<>
													{fields.map(({ key, name, ...rest }) => (
														<Card
															key={key}
															size="small"
															className="mb-3"
															extra={
																<Button
																	type="link"
																	danger
																	icon={<DeleteOutlined />}
																	aria-label={t('wallets.delete')}
																	onClick={() => remove(name)}
																/>
															}
														>
															<Row gutter={12}>
																<Col span={8}>
																	<Form.Item
																		{...rest}
																		name={[name, 'name']}
																		label={t('wallets.ruleName')}
																		rules={[{ required: true }]}
																	>
																		<Input placeholder={t('wallets.ruleNamePlaceholder')} />
																	</Form.Item>
																</Col>
																<Col span={6}>
																	<Form.Item
																		{...rest}
																		name={[name, 'type']}
																		label={t('wallets.type')}
																		rules={[{ required: true }]}
																	>
																		<Select
																			options={[
																				{ value: 'amount_limit', label: t('wallets.amountLimit') },
																				{ value: 'frequency', label: t('wallets.frequencyLimit') },
																				{ value: 'velocity', label: t('wallets.velocityLimit') },
																			]}
																		/>
																	</Form.Item>
																</Col>
																<Col span={5}>
																	<Form.Item
																		{...rest}
																		name={[name, 'threshold']}
																		label={t('wallets.threshold')}
																	>
																		<InputNumber className="w-full" min={0} placeholder="1000" />
																	</Form.Item>
																</Col>
																<Col span={5}>
																	<Form.Item
																		{...rest}
																		name={[name, 'enabled']}
																		label={t('wallets.enabled')}
																		valuePropName="checked"
																	>
																		<Select
																			options={[
																				{ value: true, label: t('wallets.yes') },
																				{ value: false, label: t('wallets.no') },
																			]}
																		/>
																	</Form.Item>
																</Col>
															</Row>
														</Card>
													))}
													<Button
														type="dashed"
														onClick={() => add({ enabled: true })}
														icon={<PlusOutlined />}
														block
													>
														{t('wallets.addRule')}
													</Button>
													{fields.length > 0 && (
														<Button
															type="primary"
															htmlType="submit"
															loading={updateFraudMut.isPending}
															className="mt-4"
														>
															{t('wallets.saveRules')}
														</Button>
													)}
												</>
											)}
										</Form.List>
									</Form>
								)}
							</div>
						),
					},
					{
						key: 'reconciliation',
						label: t('wallets.reconciliation'),
						children: (
							<div>
								<Space className="mb-4">
									<DatePicker
										onChange={(date) => {
											if (date) {
												setReconDate(date.format('YYYY-MM-DD'));
											} else {
												setReconDate('');
											}
										}}
										placeholder={t('wallets.selectReconDate')}
									/>
									<Button
										type="primary"
										icon={<SyncOutlined />}
										onClick={() => reconRefetch()}
										disabled={!reconDate}
									>
										{t('wallets.queryRecon')}
									</Button>
								</Space>
								{reconDate ? (
									<DataTable
										rowKey="date"
										columns={reconColumns}
										dataSource={reconciliation}
										loading={reconLoading}
										pagination={false}
										scroll={{ x: 800 }}
									/>
								) : (
									<div className="text-center text-neutral-600 py-12">
										{t('wallets.selectDateForRecon')}
									</div>
								)}
							</div>
						),
					},
					{
						key: 'policy',
						label: t('wallets.policyConfig'),
						children: (
							<div className="max-w-lg">
								<div className="mb-4">
									<Space>
										<span className="text-neutral-600 text-sm">
											{t('wallets.tenantId')}: {tenantId || '-'}
										</span>
										<Input
											placeholder={t('wallets.appIdRequired')}
											value={policyAppId}
											onChange={(e) => setPolicyAppId(e.target.value)}
											className="!w-[200px]"
										/>
									</Space>
								</div>
								{!tenantId || !policyAppId ? (
									<div className="text-center text-neutral-600 py-12">
										{t('wallets.enterAppIdForPolicy')}
									</div>
								) : policyLoading ? (
									<Card loading />
								) : (
									<Form
										form={policyForm}
										layout="vertical"
										onFinish={async (values) => {
											try {
												await updatePolicyMut.mutateAsync({
													tenantId,
													appId: policyAppId,
													data: values,
												});
												message.success(t('wallets.policySaved'));
											} catch (err) {
												handleApiError(err, t('wallets.saveFailed'));
											}
										}}
									>
										<Form.Item name="maxBalance" label={t('wallets.maxBalance')}>
											<Input placeholder={t('wallets.unlimited')} />
										</Form.Item>
										<Form.Item name="dailyWithdrawLimit" label={t('wallets.dailyWithdrawLimit')}>
											<Input placeholder={t('wallets.unlimited')} />
										</Form.Item>
										<Form.Item
											name="monthlyWithdrawLimit"
											label={t('wallets.monthlyWithdrawLimit')}
										>
											<Input placeholder={t('wallets.unlimited')} />
										</Form.Item>
										<Form.Item name="minWithdrawAmount" label={t('wallets.minWithdrawAmount')}>
											<Input placeholder="0" />
										</Form.Item>
										<Form.Item name="autoApproveLimit" label={t('wallets.autoApproveLimit')}>
											<Input placeholder={t('wallets.allNeedApproval')} />
										</Form.Item>
										<Form.Item
											name="withdrawalRequireReview"
											label={t('wallets.withdrawRequireReview')}
											valuePropName="checked"
										>
											<Select
												options={[
													{ value: true, label: t('wallets.yes') },
													{ value: false, label: t('wallets.no') },
												]}
											/>
										</Form.Item>
										<Form.Item
											name="transferEnabled"
											label={t('wallets.transferEnabled')}
											valuePropName="checked"
										>
											<Select
												options={[
													{ value: true, label: t('wallets.yes') },
													{ value: false, label: t('wallets.no') },
												]}
											/>
										</Form.Item>
										<Form.Item name="supportedCurrencies" label={t('wallets.supportedCurrencies')}>
											<Input placeholder={t('wallets.currencyPlaceholder')} />
										</Form.Item>
										<Form.Item name="timezone" label={t('wallets.timezone')}>
											<Input placeholder={t('wallets.timezonePlaceholder')} />
										</Form.Item>
										<div className="grid grid-cols-2 gap-3">
											<Form.Item name="rateLimitPerMin" label={t('wallets.rateLimitPerMin')}>
												<InputNumber className="w-full" min={0} />
											</Form.Item>
											<Form.Item name="rateLimitPerHour" label={t('wallets.rateLimitPerHour')}>
												<InputNumber className="w-full" min={0} />
											</Form.Item>
											<Form.Item name="idempotencyTTL" label={t('wallets.idempotencyTTL')}>
												<InputNumber className="w-full" min={0} />
											</Form.Item>
											<Form.Item name="quoteCacheTTL" label={t('wallets.quoteCacheTTL')}>
												<InputNumber className="w-full" min={0} />
											</Form.Item>
											<Form.Item
												name="internalClientTimeout"
												label={t('wallets.internalClientTimeout')}
											>
												<InputNumber className="w-full" min={0} />
											</Form.Item>
											<Form.Item
												name="defaultListPageSize"
												label={t('wallets.defaultListPageSize')}
											>
												<InputNumber className="w-full" min={1} max={100} />
											</Form.Item>
											<Form.Item name="exportPageSize" label={t('wallets.exportPageSize')}>
												<InputNumber className="w-full" min={1} max={1000} />
											</Form.Item>
										</div>
										<Button type="primary" htmlType="submit" loading={updatePolicyMut.isPending}>
											{t('wallets.savePolicy')}
										</Button>
									</Form>
								)}
							</div>
						),
					},
				]}
			/>

			<Modal
				title={t('wallets.resolveDispute')}
				open={disputeModal}
				onCancel={() => {
					setDisputeModal(false);
					setCurrentDispute(null);
					disputeForm.resetFields();
				}}
				onOk={() => disputeForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={disputeForm} layout="vertical" onFinish={handleResolveDispute}>
					<Form.Item name="result" label={t('wallets.result')} rules={[{ required: true }]}>
						<Select
							placeholder={t('wallets.selectResult')}
							options={[
								{ value: 'approved', label: t('wallets.approveRefund') },
								{ value: 'rejected', label: t('wallets.reject') },
								{ value: 'partial', label: t('wallets.partialRefund') },
							]}
						/>
					</Form.Item>
					<Form.Item name="reason" label={t('wallets.reasonDesc')} rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder={t('wallets.reasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('wallets.manualAdjust')}
				open={adjustModal}
				onCancel={() => {
					setAdjustModal(false);
					adjustForm.resetFields();
				}}
				onOk={() => adjustForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={adjustForm} layout="vertical" onFinish={handleAdjust}>
					<Form.Item name="userId" label={t('wallets.userId')} rules={[{ required: true }]}>
						<Input placeholder={t('wallets.userIdPlaceholder')} />
					</Form.Item>
					<Form.Item name="amount" label={t('wallets.adjustAmount')} rules={[{ required: true }]}>
						<InputNumber className="w-full" placeholder={t('wallets.adjustAmountPlaceholder')} />
					</Form.Item>
					<Form.Item name="reason" label={t('wallets.adjustReason')} rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder={t('wallets.adjustReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={editingCoupon ? t('wallets.editCoupon') : t('wallets.createCoupon')}
				open={couponModal}
				onCancel={() => {
					setCouponModal(false);
					setEditingCoupon(null);
					couponForm.resetFields();
				}}
				onOk={() => couponForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={couponForm} layout="vertical" onFinish={handleSaveCoupon}>
					<Form.Item name="code" label={t('wallets.couponCode')} rules={[{ required: true }]}>
						<Input placeholder={t('wallets.couponCodePlaceholder')} />
					</Form.Item>
					<Form.Item name="name" label={t('wallets.name')}>
						<Input placeholder={t('wallets.couponNamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="discountType"
						label={t('wallets.couponType')}
						rules={[{ required: true }]}
						initialValue="fixed"
					>
						<Select
							options={[
								{ value: 'fixed', label: t('wallets.fixedAmount') },
								{ value: 'percentage', label: t('wallets.percentage') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="discountValue"
						label={t('wallets.discountValue')}
						rules={[{ required: true }]}
					>
						<InputNumber className="w-full" min={0} placeholder="10" />
					</Form.Item>
					<Form.Item name="minOrderAmount" label={t('wallets.minOrderAmount')}>
						<InputNumber className="w-full" min={0} placeholder="0" />
					</Form.Item>
					<Form.Item name="validFrom" label={t('wallets.validFrom')}>
						<Input placeholder={t('wallets.datePlaceholder')} />
					</Form.Item>
					<Form.Item name="validUntil" label={t('wallets.validUntil')}>
						<Input placeholder={t('wallets.datePlaceholder')} />
					</Form.Item>
					<Form.Item name="usageLimit" label={t('wallets.usageLimit')}>
						<InputNumber className="w-full" min={1} placeholder={t('wallets.noLimit')} />
					</Form.Item>
					<Form.Item name="status" label={t('wallets.status')} initialValue="active">
						<Select
							options={[
								{ value: 'active', label: t('wallets.enabled') },
								{ value: 'inactive', label: t('wallets.disabled') },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('wallets.batchFreezeTitle')}
				open={batchFreezeModal}
				onCancel={() => {
					setBatchFreezeModal(false);
					batchForm.resetFields();
				}}
				onOk={() => batchForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={batchForm} layout="vertical" onFinish={handleBatchFreeze}>
					<Form.Item name="userIds" label={t('wallets.userIdList')} rules={[{ required: true }]}>
						<Input placeholder="user-1, user-2, user-3" />
					</Form.Item>
					<Form.Item name="reason" label={t('wallets.freezeReason')} rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder={t('wallets.freezeReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('wallets.batchUnfreezeTitle')}
				open={batchUnfreezeModal}
				onCancel={() => {
					setBatchUnfreezeModal(false);
					batchForm.resetFields();
				}}
				onOk={() => batchForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={batchForm} layout="vertical" onFinish={handleBatchUnfreeze}>
					<Form.Item name="userIds" label={t('wallets.userIdList')} rules={[{ required: true }]}>
						<Input placeholder="user-1, user-2, user-3" />
					</Form.Item>
					<Form.Item name="reason" label={t('wallets.unfreezeReason')} rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder={t('wallets.unfreezeReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

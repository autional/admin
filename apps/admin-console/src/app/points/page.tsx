'use client';

import React, { useState } from 'react';
import { Tabs, Card, Tag, Button, Space, Modal, Form, Input, Select, InputNumber, Popconfirm } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	ArrowLeftRight,
	Calculator,
	Clock,
	Gift,
	Lock,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
	Unlock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
	usePointRules,
	useCreatePointRule,
	useUpdatePointRule,
	useDeletePointRule,
	usePointAccounts,
	useBatchEarnPoints,
	useTestPointRule,
	usePointTransactions,
	usePointRiskScore,
	useTenantConfig,
	useUpdateTenantConfig,
	useFreezePoints,
	useUnfreezePoints,
	useExpirePoints,
	useTransferPoints,
	useExchangePoints,
} from '@/hooks/use-points';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

interface PointRule {
	id: string;
	name: string;
	triggerCondition: string;
	points: number;
	status: string;
}

interface PointAccount {
	id: string;
	userId: string;
	userName?: string;
	balance: number;
	// A-327①：wire 键 frozen_balance/status 补型（旧接口缺键 ⇒ 冻结额与账户状态无列可渲）
	frozenBalance?: number;
	totalEarned: number;
	totalSpent: number;
	status?: string;
}

interface PointTestResult {
	points?: number;
	ruleId?: string;
	matchResult?: Record<string, unknown>;
}

interface PointRiskScoreData {
	riskLevel?: string;
	riskScore?: number;
}

export default function PointsPage() {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState('rules');

	const [ruleModal, setRuleModal] = useState(false);
	const [ruleForm] = Form.useForm();
	const [editingRule, setEditingRule] = useState<PointRule | null>(null);

	const [testModal, setTestModal] = useState(false);
	const [testForm] = Form.useForm();
	const [testResult, setTestResult] = useState<PointTestResult | null>(null);

	const [batchModal, setBatchModal] = useState(false);
	const [batchForm] = Form.useForm();

	const [txModalUserId, setTxModalUserId] = useState<string>('');
	const [configForm] = Form.useForm();

	// A-327②：账户/交易服务端分页（旧零参上行 ⇒ 服务端默认 20/页 vs 本地 10/页截断潜伏）
	const [accountsPage, setAccountsPage] = useState(1);
	const [accountsPageSize, setAccountsPageSize] = useState(10);
	const [txPage, setTxPage] = useState(1);
	const [txPageSize, setTxPageSize] = useState(10);

	const [freezeModal, setFreezeModal] = useState(false);
	const [freezeForm] = Form.useForm();
	const [actionUserId, setActionUserId] = useState<string>('');
	const [actionUserName, setActionUserName] = useState<string>('');
	const [actionType, setActionType] = useState<'freeze' | 'unfreeze' | 'expire'>('freeze');

	const [transferModal, setTransferModal] = useState(false);
	const [transferForm] = Form.useForm();
	// A-331：页签内转赠表单独立实例（旧复用 modal 的 transferForm ⇒ 两处 resetFields 互相清空、串扰）
	const [transferTabForm] = Form.useForm();
	const [transferMode, setTransferMode] = useState<'standalone' | 'account'>('standalone');

	const [exchangeModal, setExchangeModal] = useState(false);
	const [exchangeForm] = Form.useForm();

	const { data: rules = [], isLoading: rulesLoading, error, refetch } = usePointRules();
	// A-327②：消费服务端分页元数据（items + pagination.total）
	const { data: accountsResult, isLoading: accountsLoading } = usePointAccounts({
		page: accountsPage,
		pageSize: accountsPageSize,
	});
	const accounts = accountsResult?.items ?? [];
	const accountsTotal = accountsResult?.pagination?.total ?? 0;
	const { data: txResult, isLoading: txsLoading } = usePointTransactions(txModalUserId, {
		page: txPage,
		pageSize: txPageSize,
	});
	const transactions = txResult?.items ?? [];
	const txTotal = txResult?.pagination?.total ?? 0;
	const { data: tenantConfig, isLoading: configLoading } = useTenantConfig();
	const updateConfigMut = useUpdateTenantConfig();
	const createMut = useCreatePointRule();
	const updateMut = useUpdatePointRule();
	const deleteMut = useDeletePointRule();
	const batchMut = useBatchEarnPoints();
	const testMut = useTestPointRule();
	const freezeMut = useFreezePoints();
	const unfreezeMut = useUnfreezePoints();
	const expireMut = useExpirePoints();
	const transferMut = useTransferPoints();
	const exchangeMut = useExchangePoints();

	const handleSaveRule = async (values: any) => {
		try {
			if (editingRule) {
				await updateMut.mutateAsync({ id: editingRule.id, data: values });
				message.success(t('points.ruleUpdateSuccess'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('points.ruleCreateSuccess'));
			}
			setRuleModal(false);
			ruleForm.resetFields();
			setEditingRule(null);
		} catch (err) {
			handleApiError(err, t('points.saveFailed'));
		}
	};

	const handleDeleteRule = async (id: string) => {
		modal.confirm({
			title: t('points.confirmDelete'),
			content: t('points.deleteConfirm'),
			okText: t('points.delete'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deleteMut.mutateAsync(id);
					message.success(t('points.deleteSuccess'));
				} catch (err) {
					handleApiError(err, t('points.saveFailed'));
				}
			},
		});
	};

	const handleTestRule = async (values: { ruleId: string; context: string }) => {
		try {
			const result = await testMut.mutateAsync({
				id: values.ruleId,
				data: { eventType: values.context || '' },
			});
			setTestResult(result as PointTestResult);
			message.success(t('points.testComplete'));
		} catch (err) {
			handleApiError(err, t('points.testFailed'));
		}
	};

	const handleUpdateConfig = async () => {
		try {
			const values = configForm.getFieldsValue();
			await updateConfigMut.mutateAsync(values);
			message.success(t('points.configSaved'));
		} catch (err) {
			handleApiError(err, t('points.configSaveFailed'));
		}
	};

	const handleBatchEarn = async (values: {
		userIds?: string;
		userGroup?: string;
		points: number;
		reason: string;
	}) => {
		try {
			const payload: any = { points: values.points, reason: values.reason };
			if (values.userIds) {
				payload.userIds = values.userIds.split(',').map((s) => s.trim());
			}
			if (values.userGroup) {
				payload.userGroup = values.userGroup;
			}
			await batchMut.mutateAsync(payload);
			message.success(t('points.batchEarnSuccess'));
			setBatchModal(false);
			batchForm.resetFields();
		} catch (err) {
			handleApiError(err, t('points.batchEarnFailed'));
		}
	};

	const openActionModal = (record: PointAccount, type: 'freeze' | 'unfreeze' | 'expire') => {
		setActionUserId(record.userId);
		setActionUserName(record.userName || record.userId);
		setActionType(type);
		freezeForm.resetFields();
		setFreezeModal(true);
	};

	const handleAccountAction = async (values: { amount: number; reason: string }) => {
		try {
			const data = { amount: values.amount, reason: values.reason };
			switch (actionType) {
				case 'freeze':
					await freezeMut.mutateAsync({ userId: actionUserId, data });
					message.success(t('points.freezeSuccess'));
					break;
				case 'unfreeze':
					await unfreezeMut.mutateAsync({ userId: actionUserId, data });
					message.success(t('points.unfreezeSuccess'));
					break;
				case 'expire':
					await expireMut.mutateAsync({ userId: actionUserId, data });
					message.success(t('points.expireSuccess'));
					break;
			}
			setFreezeModal(false);
			freezeForm.resetFields();
		} catch (err) {
			handleApiError(err, t('points.operationFailed'));
		}
	};

	const openTransferModal = (record?: PointAccount) => {
		if (record) {
			setTransferMode('account');
			transferForm.resetFields();
			transferForm.setFieldsValue({ fromUserId: record.userId });
			setTransferModal(true);
		} else {
			setTransferMode('standalone');
			transferForm.resetFields();
			setTransferModal(true);
		}
	};

	// TASK-AB1-27（RC-5 契约收敛）：表单键与提交体 camel 书面写（拦截器 snake 化上 wire）。
	// wire 锚：service-point/internal/handler/dto/dto.go:393（ToUserID json:"to_user_id"）
	const handleTransfer = async (values: {
		fromUserId: string;
		toUserId: string;
		amount: number;
		reason: string;
		description: string;
	}) => {
		try {
			await transferMut.mutateAsync({
				userId: values.fromUserId,
				data: {
					toUserId: values.toUserId,
					amount: values.amount,
					reason: values.reason,
					description: values.description,
				},
			});
			message.success(t('points.transferSuccess'));
			setTransferModal(false);
			transferForm.resetFields();
		} catch (err) {
			handleApiError(err, t('points.transferFailed'));
		}
	};

	const openExchangeModal = (record: PointAccount) => {
		exchangeForm.resetFields();
		exchangeForm.setFieldsValue({ fromUserId: record.userId });
		setExchangeModal(true);
	};

	// TASK-AB1-27（RC-5 契约收敛）：同上（exchange_type 键形）。
	// wire 锚：service-point/internal/handler/dto/dto.go:377（ExchangeType json:"exchange_type"）
	const handleExchange = async (values: {
		fromUserId: string;
		amount: number;
		exchangeType: string;
		description: string;
		source: string;
	}) => {
		try {
			await exchangeMut.mutateAsync({
				userId: values.fromUserId,
				data: {
					amount: values.amount,
					exchangeType: values.exchangeType,
					description: values.description,
					source: values.source,
				},
			});
			message.success(t('points.exchangeSuccess'));
			setExchangeModal(false);
			exchangeForm.resetFields();
		} catch (err) {
			handleApiError(err, t('points.exchangeFailed'));
		}
	};

	const actionTitleMap: Record<string, string> = {
		freeze: t('points.freezePoints'),
		unfreeze: t('points.unfreezePoints'),
		expire: t('points.expireProcess'),
	};

	const ruleColumns = [
		{ title: t('points.ruleName'), dataIndex: 'name', key: 'name' },
		{
			title: t('points.triggerCondition'),
			dataIndex: 'triggerCondition',
			key: 'triggerCondition',
			ellipsis: true,
		},
		{ title: t('points.pointsValue'), dataIndex: 'points', key: 'points' },
		{
			title: t('points.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'active' ? 'success' : 'default'}>{v}</Tag>,
		},
		{
			title: t('points.actions'),
			key: 'action',
			render: (_: any, record: PointRule) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditingRule(record);
							ruleForm.setFieldsValue(record);
							setRuleModal(true);
						}}
					>
						{t('points.edit')}
					</Button>
					<Button
						type="link"
						icon={<Calculator size="1em" />}
						onClick={() => {
							testForm.setFieldsValue({ ruleId: record.id });
							setTestResult(null);
							setTestModal(true);
						}}
					>
						{t('points.test')}
					</Button>
					<Button
						type="link"
						danger
						icon={<Trash2 size="1em" />}
						onClick={() => handleDeleteRule(record.id)}
					>
						{t('points.delete')}
					</Button>
				</Space>
			),
		},
	];

	const accountColumns = [
		{ title: t('points.userId'), dataIndex: 'userId', key: 'userId', ellipsis: true },
		{
			title: t('points.userName'),
			dataIndex: 'userName',
			key: 'userName',
			render: (_: any, r: PointAccount) => r.userName || '-',
		},
		{ title: t('points.balance'), dataIndex: 'balance', key: 'balance' },
		// A-327①：冻结积分列（wire frozen_balance；FreezePoints 实移动 Balance→FrozenBalance）
		{ title: t('points.frozenBalance'), dataIndex: 'frozenBalance', key: 'frozenBalance' },
		{ title: t('points.totalEarned'), dataIndex: 'totalEarned', key: 'totalEarned' },
		{ title: t('points.totalSpent'), dataIndex: 'totalSpent', key: 'totalSpent' },
		// A-327①：账户状态列（wire status：active/suspended/closed）
		{
			title: t('points.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => {
				const statusMap: Record<string, { color: string; label: string }> = {
					active: { color: 'success', label: t('points.activeStatus') },
					suspended: { color: 'warning', label: t('points.statusSuspended') },
					closed: { color: 'default', label: t('points.statusClosed') },
				};
				const item = statusMap[v] || { color: 'default', label: v || '-' };
				return <Tag color={item.color}>{item.label}</Tag>;
			},
		},
		{
			title: t('points.riskScore'),
			dataIndex: 'userId',
			key: 'riskScore',
			width: 110,
			render: (userId: string) => <RiskScoreCell userId={userId} />,
		},
		{
			title: t('points.actions'),
			key: 'action',
			width: 380,
			render: (_: any, record: PointAccount) => (
				<Space size="small" wrap>
					<Popconfirm
						title={t('points.confirmFreeze')}
						description={t('points.freezeUserMsg', { user: record.userName || record.userId })}
						onConfirm={() => openActionModal(record, 'freeze')}
						okText={t('points.confirm')}
						cancelText={t('points.cancel')}
					>
						<Button size="small" icon={<Lock size="1em" />} type="link" danger>
							{t('points.freeze')}
						</Button>
					</Popconfirm>
					{/* A-332：解冻/过期补二次确认（旧仅冻结有 Popconfirm；过期比冻结更不可逆） */}
					<Popconfirm
						title={t('points.confirmUnfreeze')}
						description={t('points.unfreezeUserMsg', { user: record.userName || record.userId })}
						onConfirm={() => openActionModal(record, 'unfreeze')}
						okText={t('points.confirm')}
						cancelText={t('points.cancel')}
					>
						<Button size="small" icon={<Unlock size="1em" />} type="link">
							{t('points.unfreeze')}
						</Button>
					</Popconfirm>
					<Popconfirm
						title={t('points.confirmExpire')}
						description={t('points.expireUserMsg', { user: record.userName || record.userId })}
						onConfirm={() => openActionModal(record, 'expire')}
						okText={t('points.confirm')}
						cancelText={t('points.cancel')}
					>
						<Button size="small" icon={<Clock size="1em" />} type="link">
							{t('points.expire')}
						</Button>
					</Popconfirm>
					<Button
						size="small"
						icon={<ArrowLeftRight size="1em" />}
						type="link"
						onClick={() => openTransferModal(record)}
					>
						{t('points.transfer')}
					</Button>
					<Button
						size="small"
						icon={<RefreshCw size="1em" />}
						type="link"
						onClick={() => openExchangeModal(record)}
					>
						{t('points.exchange')}
					</Button>
				</Space>
			),
		},
	];

	// A-328：金额着色按交易类型判色（wire amount 恒正数存储 ⇒ 旧按符号判色则消费/过期亦绿）
	const txAmountKind: Record<string, 'debit' | 'credit'> = {
		spend: 'debit',
		expire: 'debit',
		freeze: 'debit',
		confirm_deduction: 'debit',
		earn: 'credit',
		refund: 'credit',
		unfreeze: 'credit',
	};

	const txColumns = [
		{ title: t('points.userId'), dataIndex: 'userId', key: 'userId', ellipsis: true, width: 160 },
		{
			title: t('points.txType'),
			dataIndex: 'type',
			key: 'type',
			width: 100,
			render: (v: string) => {
				const m: Record<string, string> = {
					earn: t('points.txEarn'),
					spend: t('points.txSpend'),
					refund: t('points.txRefund'),
					adjust: t('points.txAdjust'),
					freeze: t('points.freeze'),
					unfreeze: t('points.unfreeze'),
					expire: t('points.expire'),
					confirm_deduction: t('points.txConfirmDeduct'),
				};
				const colors: Record<string, string> = {
					earn: 'green',
					spend: 'red',
					refund: 'blue',
					adjust: 'orange',
					freeze: 'orange',
					unfreeze: 'cyan',
					expire: 'default',
				};
				return <Tag color={colors[v] || 'default'}>{m[v] ?? v}</Tag>;
			},
		},
		{
			title: t('points.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 100,
			render: (v: number, r: { type?: string }) => {
				// A-328：类型判色（debit=红 / credit=绿 / 方向不明=中性）
				const kind = txAmountKind[r.type ?? ''];
				const cls =
					kind === 'debit'
						? 'text-danger-text'
						: kind === 'credit'
							? 'text-success-text'
							: 'text-neutral-900';
				return <span className={cls}>{v?.toLocaleString()}</span>;
			},
		},
		{ title: t('points.source'), dataIndex: 'source', key: 'source', width: 100 },
		{
			title: t('points.txTime'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 170,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('points.title')} />

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'rules',
						label: t('points.rules'),
						children: (
							<>
								<div className="flex justify-end mb-4">
									<Button
										type="primary"
										icon={<Plus size="1em" />}
										onClick={() => {
											setEditingRule(null);
											ruleForm.resetFields();
											setRuleModal(true);
										}}
									>
										{t('points.newRule')}
									</Button>
								</div>
								{error && (
									<PageError
										message={t('points.loadRulesError')}
										retry={refetch}
										className="mb-4"
									/>
								)}
								<DataTable
									rowKey="id"
									columns={ruleColumns}
									dataSource={rules}
									loading={rulesLoading}
									pagination={{ pageSize: 10 }}
									scroll={{ x: 800 }}
								/>
							</>
						),
					},
					{
						key: 'accounts',
						label: t('points.accounts'),
						children: (
							<>
								<div className="flex justify-end mb-4">
									<Button
										type="primary"
										icon={<Gift size="1em" />}
										onClick={() => {
											batchForm.resetFields();
											setBatchModal(true);
										}}
									>
										{t('points.batchEarn')}
									</Button>
								</div>
								<DataTable
									rowKey="userId"
									columns={accountColumns}
									dataSource={accounts}
									loading={accountsLoading}
									pagination={{
										// A-327②：服务端分页受控（旧本地 pageSize:10 ⇒ 服务端默认 20/页第 11 行起不可达）
										current: accountsPage,
										pageSize: accountsPageSize,
										total: accountsTotal,
										showSizeChanger: true,
										onChange: (p, ps) => {
											setAccountsPage(p);
											setAccountsPageSize(ps);
										},
									}}
									scroll={{ x: 800 }}
								/>
							</>
						),
					},
					{
						key: 'transactions',
						label: t('points.transactions'),
						children: (
							<div>
								<div className="mb-4">
									<Input.Search
										placeholder={t('points.searchUserTx')}
										onSearch={(val) => {
											setTxModalUserId(val);
											setTxPage(1);
										}}
										enterButton
										className="max-w-[400px]"
									/>
								</div>
								{txModalUserId ? (
									<DataTable
										rowKey="id"
										columns={txColumns}
										dataSource={transactions}
										loading={txsLoading}
										pagination={{
											// A-327②：同上（交易表）
											current: txPage,
											pageSize: txPageSize,
											total: txTotal,
											showSizeChanger: true,
											onChange: (p, ps) => {
												setTxPage(p);
												setTxPageSize(ps);
											},
										}}
										size="small"
										scroll={{ x: 800 }}
									/>
								) : (
									<div className="text-center text-neutral-600 py-12">
										{t('points.enterUserIdForTx')}
									</div>
								)}
							</div>
						),
					},
					{
						key: 'config',
						label: t('points.config'),
						children: (
							<div className="max-w-lg">
								<Form
									form={configForm}
									layout="vertical"
									initialValues={tenantConfig}
									onFinish={handleUpdateConfig}
								>
									<Form.Item name="pointsType" label={t('points.config.pointsType')}>
										<Select
											options={[
												{ value: 'cash_equivalent', label: t('points.config.cashEquivalent') },
												{ value: 'expirable', label: t('points.config.expirable') },
												{ value: 'tier_points', label: t('points.config.tierPoints') },
											]}
										/>
									</Form.Item>
									<Form.Item name="exchangeRate" label={t('points.config.exchangeRateLabel')}>
										<InputNumber className="w-full" />
									</Form.Item>
									<Form.Item
										name="defaultExpiryDays"
										label={t('points.config.defaultExpiryDaysLabel')}
									>
										<InputNumber className="w-full" />
									</Form.Item>
									<Form.Item name="expiryMode" label={t('points.config.expiryMode')}>
										<Select
											options={[
												{ value: 'rolling', label: t('points.config.rolling') },
												{ value: 'fixed_date', label: t('points.config.fixedDate') },
												{ value: 'never', label: t('points.config.never') },
											]}
										/>
									</Form.Item>
									<div className="grid grid-cols-2 gap-3">
										<Form.Item name="maxBalance" label={t('points.config.maxBalance')}>
											<InputNumber
												className="w-full"
												min={0}
												placeholder={t('points.config.unlimited')}
											/>
										</Form.Item>
										<Form.Item name="minSpendPoints" label={t('points.config.minSpendPoints')}>
											<InputNumber className="w-full" min={0} />
										</Form.Item>
										<Form.Item name="maxEarnPerDay" label={t('points.config.maxEarnPerDay')}>
											<InputNumber
												className="w-full"
												min={0}
												placeholder={t('points.config.unlimited')}
											/>
										</Form.Item>
										<Form.Item name="maxSpendPerDay" label={t('points.config.maxSpendPerDay')}>
											<InputNumber
												className="w-full"
												min={0}
												placeholder={t('points.config.unlimited')}
											/>
										</Form.Item>
									</div>
									<Form.Item
										name="exchangeEnabled"
										label={t('points.config.exchangeEnabled')}
										valuePropName="checked"
									>
										<Select
											options={[
												{ value: true, label: t('points.activeStatus') },
												{ value: false, label: t('points.disabled') },
											]}
										/>
									</Form.Item>
									<Form.Item name="metadata" label={t('points.config.metadata')}>
										<Input.TextArea rows={3} placeholder='{"key": "value"}' />
									</Form.Item>
									<div className="grid grid-cols-2 gap-3">
										<Form.Item
											name="earnEnabled"
											label={t('points.config.earnEnabled')}
											valuePropName="checked"
										>
											<Select
												options={[
													{ value: true, label: t('points.activeStatus') },
													{ value: false, label: t('points.disabled') },
												]}
											/>
										</Form.Item>
										<Form.Item
											name="spendEnabled"
											label={t('points.config.spendEnabled')}
											valuePropName="checked"
										>
											<Select
												options={[
													{ value: true, label: t('points.activeStatus') },
													{ value: false, label: t('points.disabled') },
												]}
											/>
										</Form.Item>
										<Form.Item
											name="expireEnabled"
											label={t('points.config.expireEnabled')}
											valuePropName="checked"
										>
											<Select
												options={[
													{ value: true, label: t('points.activeStatus') },
													{ value: false, label: t('points.disabled') },
												]}
											/>
										</Form.Item>
										<Form.Item
											name="transferEnabled"
											label={t('points.config.transferEnabled')}
											valuePropName="checked"
										>
											<Select
												options={[
													{ value: true, label: t('points.activeStatus') },
													{ value: false, label: t('points.disabled') },
												]}
											/>
										</Form.Item>
									</div>
									<Button type="primary" htmlType="submit" loading={updateConfigMut.isPending}>
										{t('points.saveConfig')}
									</Button>
								</Form>
							</div>
						),
					},
					{
						key: 'transfer',
						label: t('points.transfer'),
						children: (
							<div className="max-w-lg">
								<Card title={t('points.transferPoints')}>
									{/* A-331：页签表单独立实例（旧与行转账 Modal 共用 transferForm ⇒ 双向 resetFields 串扰） */}
									<Form form={transferTabForm} layout="vertical" onFinish={handleTransfer}>
										<Form.Item
											name="fromUserId"
											label={t('points.transfer.fromUserId')}
											rules={[{ required: true, message: t('points.transfer.fromUserIdRequired') }]}
										>
											<Input placeholder={t('points.transfer.userIdPlaceholder')} />
										</Form.Item>
										<Form.Item
											name="toUserId"
											label={t('points.transfer.toUserId')}
											rules={[{ required: true, message: t('points.transfer.toUserIdRequired') }]}
										>
											<Input placeholder={t('points.transfer.toUserIdPlaceholder')} />
										</Form.Item>
										<Form.Item
											name="amount"
											label={t('points.transfer.amount')}
											rules={[{ required: true, message: t('points.transfer.amountRequired') }]}
										>
											<InputNumber
												className="w-full"
												min={1}
												placeholder={t('points.transfer.amountPlaceholder')}
											/>
										</Form.Item>
										<Form.Item
											name="reason"
											label={t('points.transfer.reason')}
											rules={[{ required: true, message: t('points.transfer.reasonRequired') }]}
										>
											<Input.TextArea
												rows={2}
												placeholder={t('points.transfer.reasonPlaceholder')}
												maxLength={200}
												showCount
											/>
										</Form.Item>
										<Form.Item name="description" label={t('points.transfer.description')}>
											<Input.TextArea
												rows={2}
												placeholder={t('points.transfer.descriptionPlaceholder')}
											/>
										</Form.Item>
										<Button
											type="primary"
											htmlType="submit"
											loading={transferMut.isPending}
											icon={<ArrowLeftRight size="1em" />}
										>
											{t('points.transfer.confirm')}
										</Button>
									</Form>
								</Card>
							</div>
						),
					},
				]}
			/>

			<Modal
				title={editingRule ? t('points.editRule') : t('points.createRule')}
				open={ruleModal}
				onCancel={() => {
					setRuleModal(false);
					setEditingRule(null);
					ruleForm.resetFields();
				}}
				onOk={() => ruleForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={ruleForm} layout="vertical" onFinish={handleSaveRule}>
					<Form.Item name="name" label={t('points.ruleName')} rules={[{ required: true }]}>
						<Input placeholder={t('points.ruleNamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="triggerCondition"
						label={t('points.triggerCondition')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('points.triggerConditionPlaceholder')} />
					</Form.Item>
					<Form.Item name="points" label={t('points.pointsValue')} rules={[{ required: true }]}>
						<InputNumber className="w-full" placeholder="100" />
					</Form.Item>
					<Form.Item name="status" label={t('points.status')} initialValue="active">
						<Select
							options={[
								{ value: 'active', label: t('points.activeStatus') },
								{ value: 'inactive', label: t('points.disabled') },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('points.testRule')}
				open={testModal}
				onCancel={() => {
					setTestModal(false);
					testForm.resetFields();
					setTestResult(null);
				}}
				onOk={() => testForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={testForm} layout="vertical" onFinish={handleTestRule}>
					<Form.Item name="ruleId" label={t('points.test.ruleId')} rules={[{ required: true }]}>
						<Input disabled />
					</Form.Item>
					<Form.Item name="context" label={t('points.test.context')}>
						<Input.TextArea rows={3} placeholder='{"amount": 100}' />
					</Form.Item>
				</Form>
				{testResult && (
					<Card size="small" className="mt-4 bg-success-soft">
						<div className="text-success-text font-medium">
							{t('points.testResultCalc')}
							{testResult.points} {t('points.pointsUnit')}
						</div>
					</Card>
				)}
			</Modal>

			<Modal
				title={t('points.batchEarnTitle')}
				open={batchModal}
				onCancel={() => {
					setBatchModal(false);
					batchForm.resetFields();
				}}
				onOk={() => batchForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={batchForm} layout="vertical" onFinish={handleBatchEarn}>
					<Form.Item name="userIds" label={t('points.batch.userIds')}>
						<Input placeholder="user-1, user-2, user-3" />
					</Form.Item>
					<Form.Item name="userGroup" label={t('points.batch.orSelectGroup')}>
						<Select
							allowClear
							placeholder={t('points.batch.selectGroup')}
							options={[
								{ value: 'all', label: t('points.batch.allUsers') },
								{ value: 'vip', label: t('points.batch.vipUsers') },
								{ value: 'new', label: t('points.batch.newUsers') },
							]}
						/>
					</Form.Item>
					<Form.Item name="points" label={t('points.pointsValue')} rules={[{ required: true }]}>
						<InputNumber className="w-full" placeholder="100" />
					</Form.Item>
					<Form.Item name="reason" label={t('points.batch.reason')} rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder={t('points.batch.reasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={`${actionTitleMap[actionType]} - ${actionUserName}`}
				open={freezeModal}
				onCancel={() => {
					setFreezeModal(false);
					freezeForm.resetFields();
				}}
				onOk={() => freezeForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={freezeForm} layout="vertical" onFinish={handleAccountAction}>
					<Form.Item name="amount" label={t('points.pointsAmount')} rules={[{ required: true }]}>
						<InputNumber
							className="w-full"
							min={1}
							placeholder={t('points.transfer.amountPlaceholder')}
						/>
					</Form.Item>
					<Form.Item name="reason" label={t('points.actionReason')} rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder={t('points.actionReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('points.transferPoints')}
				open={transferModal}
				onCancel={() => {
					setTransferModal(false);
					transferForm.resetFields();
				}}
				onOk={() => transferForm.submit()}
				confirmLoading={transferMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={transferForm} layout="vertical" onFinish={handleTransfer}>
					<Form.Item
						name="fromUserId"
						label={t('points.transfer.fromUserId')}
						rules={[{ required: true }]}
					>
						<Input
							placeholder={t('points.transfer.userIdPlaceholder')}
							disabled={transferMode === 'account'}
						/>
					</Form.Item>
					<Form.Item
						name="toUserId"
						label={t('points.transfer.toUserId')}
						rules={[{ required: true, message: t('points.transfer.toUserIdRequired') }]}
					>
						<Input placeholder={t('points.transfer.toUserIdPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="amount"
						label={t('points.transfer.amount')}
						rules={[{ required: true, message: t('points.transfer.amountRequired') }]}
					>
						<InputNumber
							className="w-full"
							min={1}
							placeholder={t('points.transfer.amountPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('points.transfer.reason')}
						rules={[{ required: true, message: t('points.transfer.reasonRequired') }]}
					>
						<Input.TextArea
							rows={2}
							placeholder={t('points.transfer.reasonPlaceholder')}
							maxLength={200}
							showCount
						/>
					</Form.Item>
					<Form.Item name="description" label={t('points.transfer.description')}>
						<Input.TextArea rows={2} placeholder={t('points.transfer.descriptionPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('points.exchangeTitle')}
				open={exchangeModal}
				onCancel={() => {
					setExchangeModal(false);
					exchangeForm.resetFields();
				}}
				onOk={() => exchangeForm.submit()}
				confirmLoading={exchangeMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={exchangeForm} layout="vertical" onFinish={handleExchange}>
					<Form.Item name="fromUserId" label={t('points.userId')} rules={[{ required: true }]}>
						<Input disabled />
					</Form.Item>
					<Form.Item
						name="amount"
						label={t('points.exchange.amount')}
						rules={[{ required: true, message: t('points.exchange.amountRequired') }]}
					>
						<InputNumber
							className="w-full"
							min={1}
							placeholder={t('points.transfer.amountPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="exchangeType"
						label={t('points.exchange.type')}
						rules={[{ required: true, message: t('points.exchange.typeRequired') }]}
					>
						<Select
							placeholder={t('points.exchange.selectType')}
							options={[
								{ value: 'coupon', label: t('points.exchange.coupon') },
								{ value: 'discount', label: t('points.exchange.discount') },
								{ value: 'cash', label: t('points.exchange.cash') },
								{ value: 'gift_card', label: t('points.exchange.giftCard') },
								{ value: 'vip', label: t('points.exchange.vip') },
							]}
						/>
					</Form.Item>
					<Form.Item name="source" label={t('points.exchange.source')}>
						<Input placeholder={t('points.exchange.sourcePlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('points.transfer.description')}>
						<Input.TextArea rows={2} placeholder={t('points.transfer.descriptionPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

function RiskScoreCell({ userId }: { userId: string }) {
	const { t } = useTranslation();
	// A-329：懒载（旧每行一 useQuery ⇒ 10 行 10 请求 N+1）；点击该行后才发起请求
	const [requested, setRequested] = useState(false);
	const { data, isLoading } = usePointRiskScore(requested ? userId : '');
	if (!requested) {
		return (
			<Button type="link" size="small" onClick={() => setRequested(true)}>
				{t('points.viewRiskScore')}
			</Button>
		);
	}
	if (isLoading) return <span className="text-neutral-300">...</span>;
	if (!data) return <span className="text-neutral-600">-</span>;
	const riskData = data as PointRiskScoreData | undefined;
	const riskLevel = riskData?.riskLevel || 'low';
	const riskScore = riskData?.riskScore;
	const colorMap: Record<string, string> = { high: 'red', medium: 'orange', low: 'green' };
	const labelMap: Record<string, string> = {
		high: t('points.riskHigh'),
		medium: t('points.riskMedium'),
		low: t('points.riskLow'),
	};
	return (
		<Tag color={colorMap[riskLevel] || 'default'}>
			{labelMap[riskLevel] || riskLevel} {riskScore != null ? `(${riskScore})` : ''}
		</Tag>
	);
}

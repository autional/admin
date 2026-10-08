'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, InputNumber, Button, Card, Select } from 'antd';
import { usePageTitle } from '@autional/shared';
import { message } from '@/lib/antd-app';
import { useAdjustWalletBalance } from '@/hooks/use-wallet-admin';
import { handleApiError } from '@/lib/error-handler';
import { Alert, AppPageHeader } from '@autional/ui';

// W1-01（A-363）：payload 与 AdjustBalanceRequest{amount*,type*,reason*} 逐键对齐——
// type 为必选控件（值域 deposit=增加 / withdraw=扣减，与服务端 switch 一致）；
// amount 显式 String(v)（DTO 为 string）；服务端强制 amount>0，负数文案已撤。
interface AdjustFormValues {
	userId: string;
	type: 'deposit' | 'withdraw';
	amount: number;
	reason: string;
}

/** U399（W4-04）：成功应答 ManualAdjustResult.wallet 的消费面（余额/币种回显）。 */
interface AdjustWalletResult {
	balance: string;
	currency?: string;
}

export default function WalletAdjustPage() {
	const { t } = useTranslation();
	usePageTitle(t('walletAdjust.title')); // A-364②：tab 标题（旧实现恒「Autional 管理控制台」，第 25 例）
	const adjustMut = useAdjustWalletBalance();
	const [form] = Form.useForm<AdjustFormValues>();
	const [adjustResult, setAdjustResult] = React.useState<AdjustWalletResult | null>(null);

	const handleAdjust = async (values: AdjustFormValues) => {
		try {
			// U399：消费 ManualAdjustResult.wallet（此前响应丢弃 → 用户看不到调账后余额，只能去列表碰运气）。
			const result = (await adjustMut.mutateAsync({
				userId: values.userId,
				data: {
					amount: String(values.amount),
					type: values.type,
					reason: values.reason,
				},
			})) as { wallet?: { balance?: string; currency?: string } } | undefined;
			const wallet = result?.wallet;
			if (wallet?.balance !== undefined && wallet?.balance !== null) {
				setAdjustResult({ balance: wallet.balance, currency: wallet.currency });
			} else {
				// 降级：响应缺 wallet（旧形态/异常载荷）→ 原 toast，不崩
				message.success(t('walletAdjust.success'));
			}
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('walletAdjust.failed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('walletAdjust.title')} />
			{adjustResult && (
				// 第 63 轮补：antd Alert → 设计系统 Alert（同一语义只有一种长相；L22 的题面已腐 —— 
				// 复查时发现这里又新写了 antd 的 Alert）。antd 的 message/description 对应 DS 的 title/children；
				// 图标由 variant 自带（原来是 showIcon）；closable 在 DS 里是**受控**的，关闭动作走 onClose。
				<Alert
					variant="success"
					title={t('walletAdjust.success')}
					closable
					onClose={() => setAdjustResult(null)}
					className="mb-4 max-w-lg"
				>
					{t('walletAdjust.successBalance', {
						balance: adjustResult.balance,
						currency: adjustResult.currency ?? '',
					})}
				</Alert>
			)}
			<Card className="max-w-lg">
				<Form form={form} layout="vertical" onFinish={handleAdjust}>
					<Form.Item
						name="userId"
						label={t('walletAdjust.fieldUserId')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('walletAdjust.fieldUserIdPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="type"
						label={t('walletAdjust.fieldType')}
						rules={[{ required: true }]}
					>
						<Select
							placeholder={t('walletAdjust.fieldTypePlaceholder')}
							options={[
								{ value: 'deposit', label: t('walletAdjust.typeDeposit') },
								{ value: 'withdraw', label: t('walletAdjust.typeWithdraw') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="amount"
						label={t('walletAdjust.fieldAmount')}
						rules={[
							{ required: true },
							{ type: 'number', min: 0.01, message: t('walletAdjust.amountMustBePositive') },
						]}
					>
						<InputNumber
							className="w-full"
							precision={2}
							min={0.01}
							placeholder={t('walletAdjust.fieldAmountPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('walletAdjust.fieldReason')}
						rules={[{ required: true }]}
					>
						<Input.TextArea rows={3} placeholder={t('walletAdjust.fieldReasonPlaceholder')} />
					</Form.Item>
					<Button type="primary" htmlType="submit" loading={adjustMut.isPending}>
						{t('walletAdjust.submit')}
					</Button>
				</Form>
			</Card>
		</div>
	);
}

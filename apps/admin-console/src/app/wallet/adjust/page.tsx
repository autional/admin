'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, InputNumber, Button, Card } from 'antd';
import { message } from '@/lib/antd-app';
import { useAdjustWalletBalance } from '@/hooks/use-wallet-admin';
import { handleApiError } from '@/lib/error-handler';
import { AppPageHeader } from '@autional/ui';

export default function WalletAdjustPage() {
	const { t } = useTranslation();
	const adjustMut = useAdjustWalletBalance();
	const [form] = Form.useForm();

	const handleAdjust = async (values: { userId: string; amount: number; reason: string }) => {
		try {
			await adjustMut.mutateAsync({
				userId: values.userId,
				data: { amount: values.amount, reason: values.reason },
			});
			message.success(t('walletAdjust.success'));
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('walletAdjust.failed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('walletAdjust.title')} />
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
						name="amount"
						label={t('walletAdjust.fieldAmount')}
						rules={[{ required: true }]}
					>
						<InputNumber
							className="w-full"
							precision={2}
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

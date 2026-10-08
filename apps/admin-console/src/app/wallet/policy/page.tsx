'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { Form, Input, InputNumber, Select, Button, Card, Spin, Switch, Space, Empty } from 'antd';
import { message } from '@/lib/antd-app';

import {
	useWalletPolicy,
	useUpdateWalletPolicy,
	type WalletPolicy,
} from '@/hooks/use-wallet-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

export default function WalletPolicyPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const [appId, setAppId] = useState('default');
	const { data: policy, isLoading, error, refetch } = useWalletPolicy(tenantId, appId);
	const updateMut = useUpdateWalletPolicy();
	const [form] = Form.useForm();

	const handleSave = async (values: Record<string, unknown>) => {
		try {
			const data = {
				...values,
				app_id: appId,
			};
			await updateMut.mutateAsync({ tenantId, appId, data });
			message.success(t('walletPolicy.saved'));
		} catch (err) {
			handleApiError(err, t('walletPolicy.saveFailed'));
		}
	};

	const handleLoad = () => {
		if (policy) {
			form.setFieldsValue(policy);
		}
	};

	React.useEffect(() => {
		handleLoad();
	}, [policy]);

	return (
		<div>
			<AppPageHeader title={t('walletPolicy.title')} />

			<Card size="small" className="mb-4 max-w-xs">
				<Form.Item label={t('walletPolicy.appId')} className="mb-0">
					<Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="default" />
				</Form.Item>
			</Card>

			{isLoading ? (
				<div className="flex justify-center py-8">
					<Spin />
				</div>
			) : error ? (
				// ADM-014: policy 未配置时后端返回 404，展示"尚未配置策略"空态而非加载失败
				(error as any)?.response?.status === 404 || (error as any)?.status === 404 ? (
					<Empty
						description={t('walletPolicy.notConfigured', '尚未配置钱包策略')}
						className="py-8"
					/>
				) : (
					<PageError message={t('walletPolicy.loadError')} retry={refetch} />
				)
			) : (
				<Card className="max-w-2xl">
					<Form form={form} layout="vertical" onFinish={handleSave} initialValues={policy ?? {}}>
						<Form.Item name="maxBalance" label={t('walletPolicy.fieldMaxBalance')}>
							<InputNumber
								className="w-full"
								precision={2}
								placeholder={t('walletPolicy.fieldMaxBalancePlaceholder')}
							/>
						</Form.Item>
						<Form.Item
							name="maxDailyWithdrawAmount"
							label={t('walletPolicy.fieldMaxDailyWithdrawAmount')}
						>
							<InputNumber
								className="w-full"
								precision={2}
								placeholder={t('walletPolicy.fieldDailyWithdrawPlaceholder')}
							/>
						</Form.Item>
						<Form.Item
							name="supportedCurrencies"
							label={t('walletPolicy.fieldSupportedCurrencies')}
						>
							<Select mode="tags" placeholder={t('walletPolicy.fieldCurrenciesPlaceholder')} />
						</Form.Item>
						<Form.Item name="exchangeRate" label={t('walletPolicy.fieldExchangeRate')}>
							<InputNumber className="w-full" precision={6} placeholder="1.000000" />
						</Form.Item>
						<Space className="mb-4" size="large">
							<Form.Item
								name="transferEnabled"
								label={t('walletPolicy.fieldTransferEnabled')}
								valuePropName="checked"
								className="mb-0"
							>
								<Switch />
							</Form.Item>
							<Form.Item
								name="withdrawEnabled"
								label={t('walletPolicy.fieldWithdrawEnabled')}
								valuePropName="checked"
								className="mb-0"
							>
								<Switch />
							</Form.Item>
							<Form.Item
								name="depositEnabled"
								label={t('walletPolicy.fieldDepositEnabled')}
								valuePropName="checked"
								className="mb-0"
							>
								<Switch />
							</Form.Item>
						</Space>
						<Form.Item name="rateLimitPerMin" label={t('walletPolicy.fieldRateLimitPerMin')}>
							<InputNumber
								className="w-full"
								placeholder={t('walletPolicy.fieldRateLimitPerMinPlaceholder')}
								min={0}
							/>
						</Form.Item>
						<Form.Item name="rateLimitPerHour" label={t('walletPolicy.fieldRateLimitPerHour')}>
							<InputNumber
								className="w-full"
								placeholder={t('walletPolicy.fieldRateLimitPerHourPlaceholder')}
								min={0}
							/>
						</Form.Item>
						<Button type="primary" htmlType="submit" loading={updateMut.isPending}>
							{t('walletPolicy.save')}
						</Button>
					</Form>
				</Card>
			)}
		</div>
	);
}

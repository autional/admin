'use client';

import React, { useState } from 'react';
import { Form, InputNumber, Select, Button, Card, Spin, Switch } from 'antd';
import { message } from '@/lib/antd-app';
import { useDunningSettings, useUpdateDunningSettings } from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { Alert, AppPageHeader } from '@autional/ui';
import { usePageTitle } from '@autional/shared';

import { Input } from 'antd';
import { useTranslation } from 'react-i18next';

export default function BillingDunningPage() {
	const { t } = useTranslation();
	usePageTitle(t('dunning.title'));
	const [tenantId, setTenantId] = useState('');
	const { data: settings, isLoading, error, refetch } = useDunningSettings(tenantId);
	const updateMut = useUpdateDunningSettings();
	const [form] = Form.useForm();

	// A-418④：403（入口平面门禁/租户不匹配）与网络错分流 —— 旧行为统一"加载设置失败"
	const forbidden =
		(error as { response?: { status?: number } } | null)?.response?.status === 403;

	React.useEffect(() => {
		if (settings) {
			if (settings.status) {
				form.setFieldsValue(settings);
			} else {
				// A-417②：空记录（status 为空 = 未配置）不预填 0/0 —— 空回包全零貌似已配置，
				// 且 0/0 直接保存必 400（服务端 Range 1..90 / 1..180）。
				form.resetFields();
			}
		}
	}, [settings, form]);

	const handleSave = async (values: Record<string, unknown>) => {
		if (!tenantId) {
			message.warning(t('dunning.enterTenantIdFirst'));
			return;
		}
		try {
			await updateMut.mutateAsync({ tenantId, data: values });
			message.success(t('dunning.saveSuccess'));
		} catch (err) {
			handleApiError(err, t('dunning.saveFailed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('dunning.title')} />

			<Card size="small" className="mb-4 max-w-xs">
				<div className="flex gap-2 items-end">
					<Form.Item label={t('dunning.tenantId')} className="mb-0 flex-1">
						<Input
							value={tenantId}
							onChange={(e) => setTenantId(e.target.value)}
							placeholder={t('dunning.tenantIdPlaceholder')}
						/>
					</Form.Item>
					<Button onClick={() => refetch()} className="mb-0">
						{t('dunning.load')}
					</Button>
				</div>
			</Card>

			{!tenantId ? (
				<div className="text-neutral-600 py-8">{t('dunning.enterTenantIdHint')}</div>
			) : isLoading ? (
				<div className="flex justify-center py-8">
					<Spin />
				</div>
			) : error ? (
				<PageError
					message={forbidden ? t('dunning.forbiddenError') : t('dunning.loadError')}
					retry={refetch}
				/>
			) : (
				<Card className="max-w-lg">
					{settings && !settings.status && (
						// 第 63 轮补：antd Alert → 设计系统 Alert（图标由 variant 自带，原来是 showIcon）
						<Alert
							variant="info"
							// A-417②：未配置语义（空记录 status 为空 → 不再以 0/0 伪装已配置）
							title={t('dunning.notConfigured')}
							className="mb-4"
						/>
					)}
					<Form form={form} layout="vertical" onFinish={handleSave}>
						<Form.Item
							name="gracePeriodDays"
							label={t('dunning.gracePeriodDays')}
							// A-417①：服务端 Range 1..90（旧 min=0 输入 0 必 400）
							rules={[
								{ required: true },
								{ type: 'number', min: 1, max: 90, message: t('dunning.graceRange') },
							]}
						>
							<InputNumber className="w-full" min={1} max={90} placeholder="7" />
						</Form.Item>
						<Form.Item
							name="autoCancelDays"
							label={t('dunning.autoCancelDays')}
							// A-417①：服务端 Range 1..180（旧 max=365 输入 181-365 必 400）
							rules={[
								{ required: true },
								{ type: 'number', min: 1, max: 180, message: t('dunning.autoCancelRange') },
							]}
						>
							<InputNumber className="w-full" min={1} max={180} placeholder="30" />
						</Form.Item>
						<Form.Item
							name="notificationEnabled"
							label={t('dunning.notificationEnabled')}
							valuePropName="checked"
						>
							<Switch />
						</Form.Item>
						<Form.Item name="notificationChannels" label={t('dunning.notificationChannels')}>
							<Select
								mode="multiple"
								placeholder={t('dunning.selectChannels')}
								options={[
									{ value: 'email', label: t('dunning.channel.email') },
									{ value: 'sms', label: t('dunning.channel.sms') },
									{ value: 'push', label: t('dunning.channel.push') },
								]}
							/>
						</Form.Item>
						<Button type="primary" htmlType="submit" loading={updateMut.isPending}>
							{t('dunning.save')}
						</Button>
					</Form>
				</Card>
			)}
		</div>
	);
}

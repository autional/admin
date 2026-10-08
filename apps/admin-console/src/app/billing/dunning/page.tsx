'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { Form, InputNumber, Select, Button, Card, Spin, Switch } from 'antd';
import { message } from '@/lib/antd-app';
import { useDunningSettings, useUpdateDunningSettings } from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

import { Input } from 'antd';
import { useTranslation } from 'react-i18next';

export default function BillingDunningPage() {
	const { t } = useTranslation();
	const [tenantId, setTenantId] = useState('');
	const { data: settings, isLoading, error, refetch } = useDunningSettings(tenantId);
	const updateMut = useUpdateDunningSettings();
	const [form] = Form.useForm();

	React.useEffect(() => {
		if (settings) {
			form.setFieldsValue(settings);
		}
	}, [settings]);

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
				<PageError message={t('dunning.loadError')} retry={refetch} />
			) : (
				<Card className="max-w-lg">
					<Form form={form} layout="vertical" onFinish={handleSave} initialValues={settings ?? {}}>
						<Form.Item
							name="gracePeriodDays"
							label={t('dunning.gracePeriodDays')}
							rules={[{ required: true }]}
						>
							<InputNumber className="w-full" min={0} max={90} placeholder="7" />
						</Form.Item>
						<Form.Item
							name="autoCancelDays"
							label={t('dunning.autoCancelDays')}
							rules={[{ required: true }]}
						>
							<InputNumber className="w-full" min={0} max={365} placeholder="30" />
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

'use client';

import React, { useState, useEffect } from 'react';
import { Card, Form, Select, Button, Spin, Descriptions, Tag } from 'antd';
import { message } from '@/lib/antd-app';
import { RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { extractItem, useCurrentTenantId } from '@autional/shared';

import { apiClient, API_PATHS } from '@autional/shared';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

// TASK-AB1-27（RC-5 契约收敛）：表单键 camel 契约直读（拦截器深 camel 化；写入 camel 书面写。
// wire 锚：service-tenant/internal/handler/dto/dto.go:1983/1988 + domain/sod_config.go:12（json sod_mode）
interface SodConfigData {
	sodMode: 'single' | 'strict';
}

export default function SodConfigPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const [form] = Form.useForm<SodConfigData>();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [currentMode, setCurrentMode] = useState<string>('single');

	const fetchConfig = async () => {
		if (!tenantId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await apiClient.get(API_PATHS.TENANT.SOD_CONFIG(tenantId));
			const item = extractItem<{ sodMode?: string }>(res);
			if (item) {
				setCurrentMode(item.sodMode ?? 'single');
				form.setFieldsValue({ sodMode: item.sodMode as 'single' | 'strict' });
			}
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchConfig();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId]);

	const handleSave = async (values: SodConfigData) => {
		if (!tenantId) return;
		setSaving(true);
		try {
			await apiClient.put(API_PATHS.TENANT.SOD_CONFIG(tenantId), { sodMode: values.sodMode });
			setCurrentMode(values.sodMode);
			message.success(t('sod.saveSuccess'));
		} catch (err) {
			handleApiError(err, t('sod.saveFailed'));
		} finally {
			setSaving(false);
		}
	};

	if (!tenantId) {
		return (
			<div>
				<PageError message={t('common.noTenant')} />
			</div>
		);
	}

	return (
		<div className="max-w-2xl">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<ShieldCheck size="1em" className="text-xl" />
					<AppPageHeader title={t('sod.title')} />
				</div>
				<Button icon={<RefreshCw size="1em" />} onClick={fetchConfig} loading={loading}>
					{t('common.refresh')}
				</Button>
			</div>

			{error && <PageError message={t('sod.loadFailed')} retry={fetchConfig} className="mb-4" />}

			<Spin spinning={loading}>
				<Card className="mb-6">
					<Descriptions column={1} size="small" className="mb-4">
						<Descriptions.Item label={t('sod.currentMode')}>
							<Tag color={currentMode === 'strict' ? 'red' : 'blue'}>
								{currentMode === 'strict' ? t('sod.modeStrict') : t('sod.modeSingle')}
							</Tag>
						</Descriptions.Item>
					</Descriptions>

					<div className="mb-4 p-3 bg-info-soft rounded-xs text-sm text-info-text">
						<strong>{t('sod.whatIs')}</strong>
						<ul className="mt-1 ml-4 list-disc space-y-1">
							<li>
								<strong>{t('sod.modeSingle')}</strong> — {t('sod.singleDesc')}
							</li>
							<li>
								<strong>{t('sod.modeStrict')}</strong> — {t('sod.strictDesc')}
							</li>
						</ul>
					</div>

					<Form
						form={form}
						layout="vertical"
						onFinish={handleSave}
						initialValues={{ sodMode: 'single' }}
					>
						<Form.Item
							label={t('sod.modeLabel')}
							name="sodMode"
							rules={[{ required: true, message: t('sod.modeRequired') }]}
						>
							<Select>
								<Select.Option value="single">{t('sod.modeSingle')}</Select.Option>
								<Select.Option value="strict">{t('sod.modeStrict')}</Select.Option>
							</Select>
						</Form.Item>

						<Form.Item>
							<Button type="primary" htmlType="submit" loading={saving} icon={<Save size="1em" />}>
								{t('common.save')}
							</Button>
						</Form.Item>
					</Form>
				</Card>
			</Spin>
		</div>
	);
}

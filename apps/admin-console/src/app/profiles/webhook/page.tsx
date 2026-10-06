'use client';

import { useState, useEffect } from 'react';
import { Form, Input, Select, Switch, Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { ConsolePageHeader, LoadingScreen, SectionCard } from '@autional/ui';
import { apiClient } from '@autional/shared';
import {
	adminProfilesWebhook,
	adminProfilesWebhookPut,
	adminProfilesWebhookDelete,
} from '@autional/shared/generated/api';

const ALL_EVENTS = [
	{ label: 'profile.updated', value: 'profile.updated' },
	{ label: 'profile.deleted', value: 'profile.deleted' },
	{ label: 'profile.archived', value: 'profile.archived' },
	{ label: 'profile.avatar_updated', value: 'profile.avatar_updated' },
	{ label: 'profile.preferences_updated', value: 'profile.preferences_updated' },
	{ label: 'profile.tags.set', value: 'profile.tags.set' },
	{ label: 'profile.tags.deleted', value: 'profile.tags.deleted' },
];

export default function WebhookPage() {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [form] = Form.useForm();

	useEffect(() => {
		adminProfilesWebhook()
			.then((res) => {
				const d = (res as any) ?? null;
				if (d) {
					// TASK-AB1-27（RC-5 契约收敛）：表单键 camel 契约直读（拦截器深 camel 化）。
					// wire 锚：service-profile/internal/handler/dto/dto.go:497/504（is_enabled）
					form.setFieldsValue({
						url: d.url ?? '',
						secret: d.secret ?? '',
						events: d.events ?? [],
						isEnabled: d.isEnabled ?? true,
					});
				}
			})
			.finally(() => setLoading(false));
	}, []);

	const handleSave = async (values: any) => {
		setSaving(true);
		try {
			await adminProfilesWebhookPut(values);
			message.success(t('profileWebhook.saveSuccess'));
		} catch (err: any) {
			message.error(err?.message || t('profileWebhook.saveFailed'));
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		try {
			await adminProfilesWebhookDelete();
			form.resetFields();
			message.success(t('profileWebhook.removeSuccess'));
		} catch (err: any) {
			message.error(err?.message || t('profileWebhook.removeFailed'));
		}
	};

	if (loading) return <LoadingScreen />;

	return (
		<div>
			<ConsolePageHeader title={t('profileWebhook.title')} description={t('profileWebhook.subtitle')} />
			<SectionCard>
				<Form
					form={form}
					layout="vertical"
					onFinish={handleSave}
					initialValues={{ isEnabled: true }}
				>
					<Form.Item
						name="url"
						label={t('profileWebhook.form.url')}
						rules={[{ required: true, type: 'url' }]}
					>
						<Input placeholder={t('profileWebhook.form.urlPlaceholder')} />
					</Form.Item>
					<Form.Item name="secret" label={t('profileWebhook.form.secret')}>
						<Input.Password placeholder={t('profileWebhook.form.secretPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="events"
						label={t('profileWebhook.form.events')}
						rules={[{ required: true }]}
					>
						<Select
							mode="multiple"
							placeholder={t('profileWebhook.form.eventsPlaceholder')}
							options={ALL_EVENTS}
						/>
					</Form.Item>
					<Form.Item
						name="isEnabled"
						label={t('profileWebhook.form.enabled')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Space>
						<Button type="primary" htmlType="submit" loading={saving}>
							{t('profileWebhook.saveButton')}
						</Button>
						<Button danger onClick={handleDelete}>
							{t('profileWebhook.removeButton')}
						</Button>
					</Space>
				</Form>
			</SectionCard>
		</div>
	);
}

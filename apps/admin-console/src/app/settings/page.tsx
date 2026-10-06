'use client';

import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, Avatar } from 'antd';
import { message } from '@/lib/antd-app';
import {
	UserOutlined,
	LockOutlined,
	SaveOutlined,
	GlobalOutlined,
	ClockCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore, processPasswordForTransmission } from '@autional/shared';
import { PublicAuthConfigByAuthConfig } from '@autional/shared/generated/api';
import { useUpdateSettings } from '@/hooks/use-settings';
import { updateUser, changePassword } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const PREFERENCE_KEYS = {
	language: 'admin-console-lang',
	timezone: 'admin-console-timezone',
};

export default function SettingsPage() {
	const { t, i18n } = useTranslation();
	const [profileForm] = Form.useForm();
	const [passwordForm] = Form.useForm();
	const [prefForm] = Form.useForm();
	const [loading, setLoading] = useState(false);

	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);

	useEffect(() => {
		const savedLang = localStorage.getItem(PREFERENCE_KEYS.language) || i18n.language || 'zh-CN';
		const savedTimezone = localStorage.getItem(PREFERENCE_KEYS.timezone) || 'Asia/Shanghai';
		prefForm.setFieldsValue({ language: savedLang, timezone: savedTimezone });
	}, [prefForm, i18n.language]);

	React.useEffect(() => {
		if (user) {
			profileForm.setFieldsValue({
				username: user.username,
				email: user.email,
				avatar: user?.avatarUrl || '',
			});
		}
	}, [user, profileForm]);

	const handleSavePreferences = (values: { language: string; timezone: string }) => {
		localStorage.setItem(PREFERENCE_KEYS.language, values.language);
		localStorage.setItem(PREFERENCE_KEYS.timezone, values.timezone);
		i18n.changeLanguage(values.language);
		message.success(t('settings.preferencesSaved'));
	};

	const handleSaveProfile = async (values: any) => {
		if (!user?.id) {
			message.error(t('settings.cannotGetUser'));
			return;
		}
		setLoading(true);
		try {
			await updateUser(user.id, values);
			message.success(t('settings.profileSaved'));
			setUser({ ...user, ...values });
		} catch (err) {
			handleApiError(err, t('settings.saveFailed'));
		} finally {
			setLoading(false);
		}
	};

	const handleChangePassword = async (values: any) => {
		setLoading(true);
		try {
			const tenantId = useAuthStore.getState().currentTenantId || '';
			// 2026-08-17 安全修复：禁止静默回退 plain + camelCase 读取。
			// 后端恒返回 password_transmission；undefined/空串 = 契约错误必须抛错暴露，
			// 不能降级明文（hash/symmetric 租户会 61000104）。
			const authConfig = await PublicAuthConfigByAuthConfig(tenantId);
			const mode = authConfig?.passwordPolicy?.passwordTransmission;
			if (mode === undefined || mode === '' || mode === null) {
				throw new Error(
					'password transmission mode is missing from tenant auth-config (contract error)',
				);
			}
			const result = await processPasswordForTransmission(
				values.newPassword,
				mode,
				tenantId,
				undefined,
			);
			await changePassword({
				oldPassword: values.oldPassword,
				newPassword: result.password,
				password_transmission: result.passwordTransmission,
			} as any);
			message.success(t('settings.passwordChanged'));
			passwordForm.resetFields();
		} catch (err) {
			handleApiError(err, t('settings.passwordChangeFailed'));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div>
			<ConsolePageHeader title={t('settings.title')} />

			<Card title={t('settings.profile')} className="mb-6">
				<div className="flex items-center gap-4 mb-6">
					<Avatar
						size={64}
						icon={<UserOutlined />}
						src={user?.avatarUrl}
						className="!bg-info"
					/>
					<div>
						<div className="font-medium">{user?.username || t('settings.notLoggedIn')}</div>
						<div className="text-neutral-600 text-sm">{user?.email || ''}</div>
					</div>
				</div>
				<Form form={profileForm} layout="vertical" onFinish={handleSaveProfile}>
					<Form.Item name="username" label={t('settings.username')} rules={[{ required: true }]}>
						<Input prefix={<UserOutlined />} placeholder={t('settings.usernamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="email"
						label={t('settings.email')}
						rules={[{ required: true, type: 'email' }]}
					>
						<Input prefix={<UserOutlined />} placeholder={t('settings.emailPlaceholder')} />
					</Form.Item>
					<Form.Item name="avatar" label={t('settings.avatarUrl')}>
						<Input placeholder="https://example.com/avatar.png" />
					</Form.Item>
					<Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={loading}>
						{t('settings.saveProfile')}
					</Button>
				</Form>
			</Card>

			<Card title={t('settings.preferences')} className="mb-6">
				<Form
					form={prefForm}
					layout="vertical"
					onFinish={handleSavePreferences}
					initialValues={{ language: 'zh-CN', timezone: 'Asia/Shanghai' }}
				>
					<Form.Item name="language" label={t('settings.language')}>
						<Select
							prefix={<GlobalOutlined />}
							options={[
								{ label: t('settings.langZhCN'), value: 'zh-CN' },
								{ label: t('settings.langEnUS'), value: 'en-US' },
							]}
						/>
					</Form.Item>
					<Form.Item name="timezone" label={t('settings.timezone')}>
						<Select
							prefix={<ClockCircleOutlined />}
							options={[
								{ label: t('settings.timezoneShanghai'), value: 'Asia/Shanghai' },
								{ label: t('settings.timezoneTokyo'), value: 'Asia/Tokyo' },
								{ label: t('settings.timezoneUTC'), value: 'UTC' },
							]}
						/>
					</Form.Item>
					<Button type="primary" icon={<SaveOutlined />} htmlType="submit">
						{t('settings.savePreferences')}
					</Button>
				</Form>
			</Card>

			<Card title={t('settings.changePassword')}>
				<Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
					<Form.Item
						name="oldPassword"
						label={t('settings.oldPassword')}
						rules={[{ required: true, message: t('settings.oldPasswordRequired') }]}
					>
						<Input.Password
							prefix={<LockOutlined />}
							placeholder={t('settings.oldPasswordPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="newPassword"
						label={t('settings.newPassword')}
						rules={[{ required: true, message: t('settings.newPasswordRequired') }]}
					>
						<Input.Password
							prefix={<LockOutlined />}
							placeholder={t('settings.newPasswordPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="confirmPassword"
						label={t('settings.confirmPassword')}
						rules={[
							{ required: true, message: t('settings.confirmPasswordRequired') },
							({ getFieldValue }) => ({
								validator(_, value) {
									if (!value || getFieldValue('newPassword') === value) {
										return Promise.resolve();
									}
									return Promise.reject(new Error(t('settings.passwordMismatch')));
								},
							}),
						]}
					>
						<Input.Password
							prefix={<LockOutlined />}
							placeholder={t('settings.confirmPasswordPlaceholder')}
						/>
					</Form.Item>
					<Button type="primary" icon={<LockOutlined />} htmlType="submit" loading={loading}>
						{t('settings.changePassword')}
					</Button>
				</Form>
			</Card>
		</div>
	);
}

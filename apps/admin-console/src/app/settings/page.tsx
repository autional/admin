'use client';

import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, Avatar, Modal, Typography } from 'antd';
import { message } from '@/lib/antd-app';
import {
	Globe,
	Lock,
	Mail,
	Save,
	ShieldCheck,
	User,
} from 'lucide-react';
import { useAuthStore, processPasswordForTransmission, usePageTitle } from '@autional/shared';
import { PublicAuthConfigByAuthConfig } from '@autional/shared/generated/api';
// W2-04（A-437）：保存资料改走 self 自助三通道（旧 updateUser 走 admin 端点恒 61002205）。
import {
	changePassword,
	updateMyProfile,
	requestEmailChange,
	verifyEmailChange,
	cancelEmailChange,
	updateMyAvatar,
} from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const PREFERENCE_KEYS = {
	language: 'admin-console-lang',
};

// A-442②：头像占位改为内联 data-URI 常量 —— 原输入框 placeholder 硬编码外域示例 URL
//（未入 i18n 且指向不存在资源）；无头像时的 Avatar 兜底同源，data-URI 不产生任何外域请求。
const AVATAR_PLACEHOLDER_DATA_URI =
	'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48Y2lyY2xlIGN4PSIzMiIgY3k9IjIyIiByPSIxMSIgZmlsbD0iIzk0YTNiOCIvPjxwYXRoIGQ9Ik0xMiA1NmMwLTEwIDktMTcgMjAtMTdzMjAgNyAyMCAxN3oiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4=';

export default function SettingsPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('settings.title'));
	const [profileForm] = Form.useForm();
	const [passwordForm] = Form.useForm();
	const [prefForm] = Form.useForm();
	const [loading, setLoading] = useState(false);

	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);

	// W2-04（A-437 / Q-06）：邮箱双步变更弹窗状态（发起 → 验证码）。
	const [emailModalOpen, setEmailModalOpen] = useState(false);
	const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request');
	const [pendingEmail, setPendingEmail] = useState('');
	const [emailMaskedTo, setEmailMaskedTo] = useState('');
	const [emailSubmitting, setEmailSubmitting] = useState(false);
	const [emailForm] = Form.useForm();
	const [verifyForm] = Form.useForm();

	useEffect(() => {
		const savedLang = localStorage.getItem(PREFERENCE_KEYS.language) || i18n.language || 'zh-CN';
		prefForm.setFieldsValue({ language: savedLang });
	}, [prefForm, i18n.language]);

	React.useEffect(() => {
		if (user) {
			profileForm.setFieldsValue({
				username: user.username,
				avatarUrl: user?.avatarUrl || '',
			});
		}
	}, [user, profileForm]);

	const handleSavePreferences = (values: { language: string }) => {
		localStorage.setItem(PREFERENCE_KEYS.language, values.language);
		i18n.changeLanguage(values.language);
		message.success(t('settings.preferencesSaved'));
	};

	/** 按租户密码传输模式预 hash 当前密码（修改密码与邮箱变更共用同一单点）。
	 *  2026-08-17 安全修复：禁止静默回退 plain + camelCase 读取；
	 *  契约缺失 → 抛错暴露，不能降级明文（hash/symmetric 租户会 61000104）。 */
	const resolvePasswordForTransmission = async (rawPassword: string) => {
		const tenantId = useAuthStore.getState().currentTenantId || '';
		const authConfig = await PublicAuthConfigByAuthConfig(tenantId);
		const mode = authConfig?.passwordPolicy?.passwordTransmission;
		if (mode === undefined || mode === '' || mode === null) {
			throw new Error(
				'password transmission mode is missing from tenant auth-config (contract error)',
			);
		}
		return processPasswordForTransmission(rawPassword, mode, tenantId, undefined);
	};

	// W2-04（A-437）：保存资料 = username（self authMePut）+ avatar（self profile 端点）两通道；
	// 每通道独立成败、精确合并（不再 {...user, ...values} 盲写 —— A-438：旧代码写 user.avatar 死键而展示读 avatarUrl）。
	const handleSaveProfile = async (values: { username: string; avatarUrl?: string }) => {
		if (!user?.id) {
			message.error(t('settings.cannotGetUser'));
			return;
		}
		setLoading(true);
		let allOk = true;

		// 通道 1：用户名
		try {
			await updateMyProfile({ username: values.username });
			const fresh = useAuthStore.getState().user ?? user;
			setUser({ ...fresh, username: values.username });
		} catch (err) {
			allOk = false;
			handleApiError(err, t('settings.saveFailed'));
		}

		// 通道 2：头像（仅当值变更且非空；端点不接受空串 → 无法经此清空头像）
		const avatarUrl = (values.avatarUrl ?? '').trim();
		if (avatarUrl && avatarUrl !== (user.avatarUrl ?? '')) {
			try {
				const res = (await updateMyAvatar(user.id, { avatarUrl })) as
					| { profile?: { avatarUrl?: string } }
					| undefined;
				const fresh = useAuthStore.getState().user ?? user;
				// 精确合并：以响应 profile.avatarUrl 为准（响应缺失时降级为已提交值 —— 200 即已保存）
				setUser({ ...fresh, avatarUrl: res?.profile?.avatarUrl ?? avatarUrl });
			} catch (err) {
				allOk = false;
				handleApiError(err, t('settings.saveFailed'));
			}
		}

		if (allOk) message.success(t('settings.profileSaved'));
		setLoading(false);
	};

	/** 打开邮箱变更弹窗（重置为第一步）。 */
	const openEmailModal = () => {
		emailForm.resetFields();
		verifyForm.resetFields();
		setPendingEmail('');
		setEmailMaskedTo('');
		setEmailStep('request');
		setEmailModalOpen(true);
	};

	/** 关闭/取消邮箱变更：第一步未发起 → 零副作用；已在第二步 = 存在 pending 变更 → best-effort 取消
	 *  （幂等端点：无记录→61002204、已消费/已取消→61002207，均可忽略；失败不阻断关闭）。 */
	const closeEmailModal = () => {
		const hasPending = emailStep === 'verify';
		setEmailModalOpen(false);
		setEmailStep('request');
		emailForm.resetFields();
		verifyForm.resetFields();
		if (hasPending) {
			cancelEmailChange().catch(() => {
				/* best-effort：pending 清理失败不阻断关闭 */
			});
		}
	};

	/** 邮箱变更第一步：发起（验证当前密码 + 发送验证码到新邮箱）。 */
	const handleRequestEmailChange = async (values: { newEmail: string; password: string }) => {
		setEmailSubmitting(true);
		try {
			// 契约 ChangeEmailRequest.password 为 string（user_profile.go:217-220）——按租户传输模式
			// 预处理后**只取 password 字符串**；整包 TransmissionResult 是 wire 违例（对象入 string 位）。
			const result = await resolvePasswordForTransmission(values.password);
			const res = (await requestEmailChange({
				newEmail: values.newEmail,
				password: result.password,
			})) as { maskedTo?: string } | undefined;
			const maskedTo = res?.maskedTo ?? values.newEmail;
			setPendingEmail(values.newEmail);
			setEmailMaskedTo(maskedTo);
			setEmailStep('verify');
			message.success(t('settings.emailCodeSent', { email: maskedTo }));
		} catch (err) {
			handleApiError(err, t('settings.emailChangeFailed'));
		} finally {
			setEmailSubmitting(false);
		}
	};

	/** 邮箱变更第二步：验证码校验 → 本地邮箱精确合并。 */
	const handleVerifyEmailChange = async (values: { code: string }) => {
		setEmailSubmitting(true);
		try {
			await verifyEmailChange({ code: values.code });
			const fresh = useAuthStore.getState().user;
			if (fresh && pendingEmail) setUser({ ...fresh, email: pendingEmail });
			message.success(t('settings.emailChanged'));
			// 成功路径不取消：pending 已由 verify 消费。弹窗状态复位（不触发 closeEmailModal 的取消分支）。
			setEmailModalOpen(false);
			setEmailStep('request');
			emailForm.resetFields();
			verifyForm.resetFields();
		} catch (err) {
			handleApiError(err, t('settings.emailVerifyFailed'));
		} finally {
			setEmailSubmitting(false);
		}
	};

	const handleChangePassword = async (values: any) => {
		setLoading(true);
		try {
			const result = await resolvePasswordForTransmission(values.newPassword);
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
			<AppPageHeader title={t('settings.title')} />

			<Card title={t('settings.profile')} className="mb-6">
				<div className="flex items-center gap-4 mb-6">
					<Avatar
						size={64}
						icon={<User size="1em" />}
						src={user?.avatarUrl || AVATAR_PLACEHOLDER_DATA_URI}
						className="!bg-info"
					/>
					<div>
						<div className="font-medium">{user?.username || t('settings.notLoggedIn')}</div>
						<div className="text-neutral-600 text-sm">{user?.email || ''}</div>
					</div>
				</div>
				<Form form={profileForm} layout="vertical" onFinish={handleSaveProfile}>
					<Form.Item name="username" label={t('settings.username')} rules={[{ required: true }]}>
						<Input prefix={<User size="1em" />} placeholder={t('settings.usernamePlaceholder')} />
					</Form.Item>
					{/* A-437（Q-06）：邮箱改只读展示 + 独立双步 OTP 弹窗（不再随「保存资料」走 admin 端点直存） */}
					<Form.Item label={t('settings.email')}>
						<div className="flex items-center gap-3">
							<span data-testid="settings-email-display">{user?.email || '-'}</span>
							<Button icon={<Mail size="1em" />} onClick={openEmailModal}>
								{t('settings.changeEmail')}
							</Button>
						</div>
					</Form.Item>
					<Form.Item name="avatarUrl" label={t('settings.avatarUrl')}>
						<Input placeholder={AVATAR_PLACEHOLDER_DATA_URI} />
					</Form.Item>
					<Button type="primary" icon={<Save size="1em" />} htmlType="submit" loading={loading}>
						{t('settings.saveProfile')}
					</Button>
				</Form>
			</Card>

			<Card title={t('settings.preferences')} className="mb-6">
				<Form
					form={prefForm}
					layout="vertical"
					onFinish={handleSavePreferences}
					initialValues={{ language: 'zh-CN' }}
				>
					<Form.Item name="language" label={t('settings.language')}>
						<Select
							prefix={<Globe size="1em" />}
							options={[
								{ label: t('settings.langZhCN'), value: 'zh-CN' },
								{ label: t('settings.langEnUS'), value: 'en-US' },
							]}
						/>
					</Form.Item>
					<Button type="primary" icon={<Save size="1em" />} htmlType="submit">
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
							autoComplete="current-password"
							prefix={<Lock size="1em" />}
							placeholder={t('settings.oldPasswordPlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="newPassword"
						label={t('settings.newPassword')}
						rules={[{ required: true, message: t('settings.newPasswordRequired') }]}
					>
						<Input.Password
							autoComplete="new-password"
							prefix={<Lock size="1em" />}
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
							autoComplete="new-password"
							prefix={<Lock size="1em" />}
							placeholder={t('settings.confirmPasswordPlaceholder')}
						/>
					</Form.Item>
					<Button type="primary" icon={<Lock size="1em" />} htmlType="submit" loading={loading}>
						{t('settings.changePassword')}
					</Button>
				</Form>
			</Card>

			{/* A-437（Q-06）：双步 OTP 邮箱变更 —— 第一步发起（当前密码 + 新邮箱），第二步验证码校验。 */}
			<Modal
				title={t('settings.changeEmail')}
				open={emailModalOpen}
				onCancel={closeEmailModal}
				footer={null}
				destroyOnClose
			>
				{emailStep === 'request' ? (
					<Form form={emailForm} layout="vertical" onFinish={handleRequestEmailChange}>
						<Form.Item
							name="newEmail"
							label={t('settings.newEmail')}
							rules={[
								{ required: true, message: t('settings.newEmailRequired') },
								{ type: 'email', message: t('settings.newEmailInvalid') },
							]}
						>
							<Input prefix={<Mail size="1em" />} placeholder={t('settings.newEmailPlaceholder')} />
						</Form.Item>
						<Form.Item
							name="password"
							label={t('settings.oldPassword')}
							rules={[{ required: true, message: t('settings.oldPasswordRequired') }]}
						>
							<Input.Password
								autoComplete="current-password"
								prefix={<Lock size="1em" />}
								placeholder={t('settings.oldPasswordPlaceholder')}
							/>
						</Form.Item>
						<div className="flex justify-end gap-2">
							<Button onClick={closeEmailModal}>{t('common.cancel')}</Button>
							<Button type="primary" htmlType="submit" loading={emailSubmitting}>
								{t('settings.sendEmailCode')}
							</Button>
						</div>
					</Form>
				) : (
					<Form form={verifyForm} layout="vertical" onFinish={handleVerifyEmailChange}>
						<Typography.Paragraph type="secondary">
							{t('settings.emailCodeSentHint', { email: emailMaskedTo || pendingEmail })}
						</Typography.Paragraph>
						<Form.Item
							name="code"
							label={t('settings.emailCode')}
							rules={[{ required: true, message: t('settings.emailCodeRequired') }]}
						>
							<Input
								prefix={<ShieldCheck size="1em" />}
								placeholder={t('settings.emailCodePlaceholder')}
							/>
						</Form.Item>
						<div className="flex justify-end gap-2">
							<Button onClick={closeEmailModal}>{t('common.cancel')}</Button>
							<Button type="primary" htmlType="submit" loading={emailSubmitting}>
								{t('settings.verifyEmailCode')}
							</Button>
						</div>
					</Form>
				)}
			</Modal>
		</div>
	);
}

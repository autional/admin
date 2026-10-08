'use client';

import React, { useState } from 'react';
import {
	Card,
	Form,
	InputNumber,
	Checkbox,
	Select,
	Button,
	Space,
	Divider,
	Switch,
	Radio,
	Modal,
	Tag,
} from 'antd';
import { message } from '@/lib/antd-app';
import { BadgeCheck, Save } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAuthConfig, updateAuthConfig } from '@/lib/api.generated';

import { queryKeys } from '@/lib/query-keys';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { extractItem, useCurrentTenantId } from '@autional/shared';
import { Alert, AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { COMPLIANCE_PROFILES, type ProfilePreset } from '@/lib/compliance-profiles';

const { Option } = Select;

export default function AuthConfigPage() {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const tenantId = useCurrentTenantId() ?? '';
	const [selectedProfile, setSelectedProfile] = useState<string>('custom');
	const [showProfileConfirm, setShowProfileConfirm] = useState<ProfilePreset | null>(null);

	const handleProfileChange = (key: string) => {
		if (key === 'custom') {
			setSelectedProfile('custom');
			return;
		}
		const profile = COMPLIANCE_PROFILES.find((p) => p.key === key);
		if (profile) {
			setShowProfileConfirm(profile);
		}
	};

	const applyProfile = (profile: ProfilePreset) => {
		form.setFieldsValue(profile.values);
		setSelectedProfile(profile.key);
		setShowProfileConfirm(null);
		message.info(t('authConfig.profileApplied'));
	};

	const {
		data: config,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.security.authConfig,
		queryFn: async () => {
			const res = await getAuthConfig();
			return extractItem(res) ?? {};
		},
		enabled: !!tenantId,
	});

	const updateMut = useMutation({
		mutationFn: (data: any) => updateAuthConfig(data),
		onSuccess: () => {
			message.success(t('authConfig.saveSuccess'));
		},
	});

	React.useEffect(() => {
		if (config) {
			const cfg = config as Record<string, unknown>;
			// A-119（并入 A-109 回显键映射）：响应 camel 键 → 表单 name 对齐，消除「已启用项呈未启用」。
			// requireUpper/requireLower ← DTO json tag require_upper/require_lower（dto/policy.go:37-38）；
			// passwordTransmission/checkBreachedPasswords 为响应侧键名（password_transmission/check_breached_passwords）。
			form.setFieldsValue({
				...cfg,
				requireUppercase: cfg.requireUpper,
				requireLowercase: cfg.requireLower,
				transmissionMethod: cfg.passwordTransmission,
				breachCheckEnabled: cfg.checkBreachedPasswords,
			});
		}
	}, [config, form]);

	const onFinish = async (values: any) => {
		try {
			// 显式映射到后端 UpdateAuthConfigRequest 字段名（snake_case 由 api client 统一转换，
			// 此处用 camelCase 键名与后端 DTO 对齐：transmissionMethod→passwordTransmission 等）
			const payload = {
				minLength: values.minLength,
				maxLength: values.maxLength,
				requireUpper: values.requireUppercase,
				requireLower: values.requireLowercase,
				requireDigit: values.requireDigit,
				requireSpecial: values.requireSpecial,
				expiryDays: values.expiryDays,
				gracePeriodDays: values.gracePeriodDays,
				historyCount: values.historyCount,
				passwordTransmission: values.transmissionMethod,
				loginMethods: values.loginMethods,
				oauthProviders: values.oauthProviders,
				ssoProviders: values.ssoProviders,
				membershipApproval: values.membershipApproval,
				magicLinkEnabled: values.magicLinkEnabled,
				passkeyEnabled: values.passkeyEnabled,
				breachCheckEnabled: values.breachCheckEnabled,
				deviceFingerprintEnabled: values.deviceFingerprintEnabled,
				silentChallengeEnabled: values.silentChallengeEnabled,
				emailCodeLogin: values.emailCodeLogin,
				phoneCodeLogin: values.phoneCodeLogin,
				atoAlertsEnabled: values.atoAlertsEnabled,
				continuousSessionCheck: values.continuousSessionCheck,
				maxLoginAttempts: values.lockoutAttempts,
				lockDurationSec: values.lockoutDuration,
				maxConcurrentSessions: values.maxConcurrentSessions,
			};
			await updateMut.mutateAsync(payload);
		} catch (err) {
			handleApiError(err, t('authConfig.saveFailed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('authConfig.title')} />

			{error && <PageError message={t('authConfig.loadError')} retry={refetch} className="mb-4" />}

			{/* Compliance Profile Selector */}
			<Card size="small" className="mb-4 border-info-soft bg-info-soft">
				<div className="flex items-center gap-3">
					<BadgeCheck size="1em" className="text-info text-lg" />
					<span className="font-medium text-info-text">{t('authConfig.complianceProfile')}:</span>
					<Select
						value={selectedProfile}
						onChange={handleProfileChange}
						className="w-72"
						placeholder={t('authConfig.selectProfile')}
					>
						<Option value="custom">{t('authConfig.profileCustom')}</Option>
						{COMPLIANCE_PROFILES.map((p) => (
							<Option key={p.key} value={p.key}>
								{t(p.i18nKey)}
							</Option>
						))}
					</Select>
					{selectedProfile !== 'custom' && <Tag color="blue">{t('authConfig.profileActive')}</Tag>}
				</div>
				{selectedProfile !== 'custom' && (
					<Alert variant="info" title={t('authConfig.profileOverrideNotice')} className="mt-2" />
				)}
			</Card>

			{/* Profile Confirm Modal */}
			<Modal
				title={t('authConfig.profileConfirmTitle')}
				open={!!showProfileConfirm}
				onOk={() => showProfileConfirm && applyProfile(showProfileConfirm)}
				onCancel={() => setShowProfileConfirm(null)}
				okText={t('authConfig.profileConfirmApply')}
				cancelText={t('authConfig.profileConfirmCancel')}
			>
				{showProfileConfirm && (
					<div>
						<p className="font-medium mb-2">{t(showProfileConfirm.i18nKey)}</p>
						<p className="text-sm text-neutral-600 mb-3">
							{t(showProfileConfirm.descriptionI18nKey)}
						</p>
						<Alert variant="warning" title={t('authConfig.profileOverrideWarning')} />
					</div>
				)}
			</Modal>

			<Form
				form={form}
				layout="vertical"
				onFinish={onFinish}
				onValuesChange={() => setSelectedProfile('custom')}
			>
				<Card title={t('authConfig.passwordComplexity')} loading={isLoading} className="mb-4">
					<Space direction="vertical" className="w-full">
						<div className="flex gap-4">
							<Form.Item name="minLength" label={t('authConfig.minLength')} className="flex-1">
								<InputNumber min={4} max={128} className="w-full" />
							</Form.Item>
							<Form.Item name="maxLength" label={t('authConfig.maxLength')} className="flex-1">
								{/* A-115：三层边界同源 —— UI 上限对齐 DTO（UpdateAuthConfigRequest.Validate
								    max_length ≤128，dto/policy.go:157-159；旧 UI 256 → 129-256 区间保存必 400） */}
								<InputNumber min={8} max={128} className="w-full" />
							</Form.Item>
						</div>
						<Form.Item label={t('authConfig.characterRequirements')}>
							<Space>
								<Form.Item name="requireUppercase" valuePropName="checked" noStyle>
									<Checkbox>{t('authConfig.requireUppercase')}</Checkbox>
								</Form.Item>
								<Form.Item name="requireLowercase" valuePropName="checked" noStyle>
									<Checkbox>{t('authConfig.requireLowercase')}</Checkbox>
								</Form.Item>
								<Form.Item name="requireDigit" valuePropName="checked" noStyle>
									<Checkbox>{t('authConfig.requireDigit')}</Checkbox>
								</Form.Item>
								<Form.Item name="requireSpecial" valuePropName="checked" noStyle>
									<Checkbox>{t('authConfig.requireSpecial')}</Checkbox>
								</Form.Item>
							</Space>
						</Form.Item>
					</Space>
				</Card>

				<Card title={t('authConfig.passwordLifecycle')} loading={isLoading} className="mb-4">
					<Space direction="vertical" className="w-full">
						<div className="flex gap-4">
							<Form.Item name="expiryDays" label={t('authConfig.expiryDays')} className="flex-1">
								<InputNumber min={0} max={365} className="w-full" />
							</Form.Item>
							<Form.Item
								name="gracePeriodDays"
								label={t('authConfig.gracePeriodDays')}
								className="flex-1"
							>
								<InputNumber min={0} max={30} className="w-full" />
							</Form.Item>
							<Form.Item
								name="historyCount"
								label={t('authConfig.historyCount')}
								className="flex-1"
							>
								<InputNumber min={0} max={24} className="w-full" />
							</Form.Item>
						</div>
					</Space>
				</Card>

				<Card title={t('authConfig.transmissionMethod')} loading={isLoading} className="mb-4">
					<Form.Item name="transmissionMethod" label={t('authConfig.transmissionMethod')}>
						<Select className="w-60" placeholder={t('authConfig.transmissionMethodPlaceholder')}>
							<Option value="plain">{t('authConfig.plain')}</Option>
							<Option value="hash">{t('authConfig.hash')}</Option>
							<Option value="symmetric">{t('authConfig.symmetric')}</Option>
							<Option value="asymmetric">{t('authConfig.asymmetric')}</Option>
						</Select>
					</Form.Item>
				</Card>

				<Card title={t('authConfig.loginMethods')} loading={isLoading} className="mb-4">
					<Form.Item name="loginMethods" label={t('authConfig.allowedLoginMethods')}>
						<Checkbox.Group>
							<Space direction="vertical">
								<Checkbox value="password">{t('authConfig.loginMethodPassword')}</Checkbox>
								<Checkbox value="oauth">{t('authConfig.loginMethodOAuth')}</Checkbox>
								<Checkbox value="qr">{t('authConfig.loginMethodQR')}</Checkbox>
								<Checkbox value="sso">{t('authConfig.loginMethodSSO')}</Checkbox>
								<Checkbox value="passkey">{t('authConfig.loginMethodPasskey')}</Checkbox>
							</Space>
						</Checkbox.Group>
					</Form.Item>
				</Card>

				<Card title={t('authConfig.membershipApproval')} loading={isLoading} className="mb-4">
					<Form.Item name="membershipApproval" label={t('authConfig.membershipApproval')}>
						<Radio.Group>
							<Radio value="open">{t('authConfig.membershipApproval.open')}</Radio>
							<Radio value="approval_required">
								{t('authConfig.membershipApproval.approvalRequired')}
							</Radio>
							<Radio value="invitation_only">
								{t('authConfig.membershipApproval.invitationOnly')}
							</Radio>
						</Radio.Group>
					</Form.Item>
				</Card>

				<Card title={t('authConfig.oauthProviders')} loading={isLoading} className="mb-4">
					<Form.Item name="oauthProviders" label={t('authConfig.enabledOAuthProviders')}>
						<Checkbox.Group>
							<Space>
								<Checkbox value="github">GitHub</Checkbox>
								<Checkbox value="google">Google</Checkbox>
								<Checkbox value="microsoft">Microsoft</Checkbox>
								<Checkbox value="apple">Apple</Checkbox>
								<Checkbox value="wechat">{t('authConfig.oauthProviderWechat')}</Checkbox>
							</Space>
						</Checkbox.Group>
					</Form.Item>
				</Card>

				<Card title={t('authConfig.ssoProviders')} loading={isLoading} className="mb-4">
					<Form.Item name="ssoProviders" label={t('authConfig.enabledSSOProviders')}>
						<Checkbox.Group>
							<Space>
								<Checkbox value="saml">SAML</Checkbox>
								<Checkbox value="oidc">OpenID Connect (OIDC)</Checkbox>
							</Space>
						</Checkbox.Group>
					</Form.Item>
				</Card>

				<Card title={t('authConfig.featureToggles')} loading={isLoading} className="mb-4">
					<Space direction="vertical" className="w-full">
						<Form.Item
							name="magicLinkEnabled"
							valuePropName="checked"
							label={t('authConfig.magicLinkEnabled')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="passkeyEnabled"
							valuePropName="checked"
							label={t('authConfig.passkeyEnabled')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="deviceFingerprintEnabled"
							valuePropName="checked"
							label={t('authConfig.deviceFingerprintEnabled')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="silentChallengeEnabled"
							valuePropName="checked"
							label={t('authConfig.silentChallengeEnabled')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="breachCheckEnabled"
							valuePropName="checked"
							label={t('authConfig.breachCheckEnabled')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="emailCodeLogin"
							valuePropName="checked"
							label={t('authConfig.emailCodeLogin')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="phoneCodeLogin"
							valuePropName="checked"
							label={t('authConfig.phoneCodeLogin')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="atoAlertsEnabled"
							valuePropName="checked"
							label={t('authConfig.atoAlertsEnabled')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
						<Form.Item
							name="continuousSessionCheck"
							valuePropName="checked"
							label={t('authConfig.continuousSessionCheck')}
						>
							<Switch
								checkedChildren={t('authConfig.switchOn')}
								unCheckedChildren={t('authConfig.switchOff')}
							/>
						</Form.Item>
					</Space>
				</Card>

				<Card title={t('authConfig.accountSecurity')} loading={isLoading} className="mb-4">
					<Space direction="vertical" className="w-full">
						<div className="flex gap-4">
							<Form.Item
								name="lockoutAttempts"
								label={t('authConfig.lockoutAttempts')}
								className="flex-1"
							>
								<InputNumber min={1} max={20} className="w-full" />
							</Form.Item>
							<Form.Item
								name="lockoutDuration"
								label={t('authConfig.lockoutDuration')}
								className="flex-1"
							>
								<InputNumber min={1} max={1440} className="w-full" />
							</Form.Item>
						</div>
						<div className="flex gap-4">
							<Form.Item
								name="maxConcurrentSessions"
								label={t('authConfig.maxConcurrentSessions')}
								className="flex-1"
							>
								<InputNumber min={0} max={1000} className="w-full" />
							</Form.Item>
						</div>
					</Space>
				</Card>

				<Button
					type="primary"
					icon={<Save size="1em" />}
					htmlType="submit"
					loading={updateMut.isPending}
					size="large"
				>
					{t('authConfig.save')}
				</Button>
			</Form>
		</div>
	);
}

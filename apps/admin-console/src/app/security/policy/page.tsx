'use client';

import React from 'react';
import { Card, Form, Input, Select, Switch, InputNumber, Button } from 'antd';
import { message } from '@/lib/antd-app';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getSecurityPolicy, updateSecurityPolicy } from '@/lib/api.generated';
import { queryKeys } from '@/lib/query-keys';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { extractItem, useCurrentTenantId } from '@autional/shared';
import { ConsolePageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

/** 后端 GET 返回的嵌套结构（apiClient 响应已转 camelCase） */
interface SecurityPolicyNested {
	passwordPolicy?: {
		minLength?: number;
		maxLength?: number;
		requireUppercase?: boolean;
		requireLowercase?: boolean;
		requireDigit?: boolean;
		requireSpecial?: boolean;
	};
	sessionPolicy?: {
		timeoutSeconds?: number;
		maxConcurrentSessions?: number;
	};
	ipWhitelist?: string[];
	mfaRequired?: boolean;
}

/** 表单模型（对应后端 UpdateSecurityPolicyRequest 扁平字段，camelCase） */
interface SecurityPolicyForm {
	passwordMinLength?: number;
	passwordMaxLength?: number;
	requireUppercase?: boolean;
	requireLowercase?: boolean;
	requireDigit?: boolean;
	requireSpecial?: boolean;
	maxAttemptsPerUser?: number;
	lockDuration?: string;
	sessionTimeout?: string;
	maxConcurrentSessions?: number;
	mfaRequired?: boolean;
	allowedIpRanges?: string[];
	blockedCountries?: string[];
}

export default function SecurityPolicyPage() {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const tenantId = useCurrentTenantId() ?? '';

	const { data: policy, isLoading } = useQuery({
		queryKey: queryKeys.security.tenantPolicy(tenantId),
		queryFn: async () => {
			const res = await getSecurityPolicy(tenantId);
			const nested = extractItem<SecurityPolicyNested>(res) ?? ({} as SecurityPolicyNested);
			const formData: SecurityPolicyForm = {
				passwordMinLength: nested.passwordPolicy?.minLength,
				passwordMaxLength: nested.passwordPolicy?.maxLength,
				requireUppercase: nested.passwordPolicy?.requireUppercase,
				requireLowercase: nested.passwordPolicy?.requireLowercase,
				requireDigit: nested.passwordPolicy?.requireDigit,
				requireSpecial: nested.passwordPolicy?.requireSpecial,
				sessionTimeout: nested.sessionPolicy?.timeoutSeconds
					? `${Math.round(nested.sessionPolicy.timeoutSeconds / 60)}m`
					: undefined,
				maxConcurrentSessions: nested.sessionPolicy?.maxConcurrentSessions,
				mfaRequired: nested.mfaRequired,
				allowedIpRanges: nested.ipWhitelist ?? [],
				blockedCountries: [],
			};
			return formData;
		},
		enabled: !!tenantId,
	});

	const updateMut = useMutation({
		mutationFn: (data: any) => updateSecurityPolicy(tenantId, data),
		onSuccess: () => {
			message.success(t('securityPolicy.saveSuccess'));
		},
	});

	React.useEffect(() => {
		if (policy) form.setFieldsValue(policy);
	}, [policy, form]);

	const onFinish = async (values: any) => {
		if (!tenantId) {
			message.error(t('securityPolicy.noTenantId'));
			return;
		}

		const payload: Record<string, unknown> = {
			password_min_length: values.passwordMinLength,
			password_max_length: values.passwordMaxLength,
			require_uppercase: values.requireUppercase,
			require_lowercase: values.requireLowercase,
			require_digit: values.requireDigit,
			require_special: values.requireSpecial,
			max_attempts_per_user: values.maxAttemptsPerUser,
			lock_duration: values.lockDuration,
			session_timeout: values.sessionTimeout,
			max_concurrent_sessions: values.maxConcurrentSessions,
			mfa_required: values.mfaRequired,
			allowed_ip_ranges: Array.isArray(values.allowedIpRanges)
				? values.allowedIpRanges
				: String(values.allowedIpRanges ?? '')
						.split('\n')
						.map((s: string) => s.trim())
						.filter(Boolean),
			blocked_countries: values.blockedCountries ?? [],
		};

		try {
			await updateMut.mutateAsync(payload);
		} catch (err) {
			handleApiError(err, t('securityPolicy.saveFailed'));
		}
	};

	return (
		<div>
			<ConsolePageHeader title={t('securityPolicy.title')} />
			<Card loading={isLoading}>
				<Form form={form} layout="vertical" onFinish={onFinish}>
					<Form.Item name="allowedIpRanges" label={t('securityPolicy.ipWhitelist')}>
						<Input.TextArea
							rows={4}
							placeholder={t('securityPolicy.ipWhitelistPlaceholder')}
							value={undefined}
						/>
					</Form.Item>

					<Form.Item name="blockedCountries" label={t('securityPolicy.restrictedRegions')}>
						<Select
							mode="multiple"
							placeholder={t('securityPolicy.restrictedRegionsPlaceholder')}
							options={[
								{ label: t('securityPolicy.region.CN'), value: 'CN' },
								{ label: t('securityPolicy.region.HK'), value: 'HK' },
								{ label: t('securityPolicy.region.MO'), value: 'MO' },
								{ label: t('securityPolicy.region.TW'), value: 'TW' },
								{ label: t('securityPolicy.region.US'), value: 'US' },
								{ label: t('securityPolicy.region.JP'), value: 'JP' },
								{ label: t('securityPolicy.region.SG'), value: 'SG' },
								{ label: t('securityPolicy.region.GB'), value: 'GB' },
								{ label: t('securityPolicy.region.DE'), value: 'DE' },
							]}
						/>
					</Form.Item>

					<Form.Item name="mfaRequired" label="MFA 必填" valuePropName="checked">
						<Switch />
					</Form.Item>

					<h3 className="text-sm font-semibold mt-4 mb-2">密码复杂度</h3>
					<Form.Item name="passwordMinLength" label="最小长度">
						<InputNumber min={4} max={128} className="w-50" />
					</Form.Item>
					<Form.Item name="passwordMaxLength" label="最大长度">
						<InputNumber min={8} max={256} className="w-50" />
					</Form.Item>
					<Form.Item name="requireUppercase" label="必须包含大写字母" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="requireLowercase" label="必须包含小写字母" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="requireDigit" label="必须包含数字" valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item name="requireSpecial" label="必须包含特殊字符" valuePropName="checked">
						<Switch />
					</Form.Item>

					<h3 className="text-sm font-semibold mt-4 mb-2">账户与会话</h3>
					<Form.Item name="maxAttemptsPerUser" label="最大登录失败次数">
						<InputNumber min={0} max={20} className="w-50" />
					</Form.Item>
					<Form.Item name="lockDuration" label="锁定时长">
						<Input placeholder="如 30m / 1h" className="w-50" />
					</Form.Item>
					<Form.Item name="sessionTimeout" label="会话超时">
						<Input placeholder="如 30m / 2h" className="w-50" />
					</Form.Item>
					<Form.Item name="maxConcurrentSessions" label="最大并发会话">
						<InputNumber min={1} max={1000} className="w-50" />
					</Form.Item>

					<Button
						type="primary"
						icon={<SaveOutlined />}
						htmlType="submit"
						loading={updateMut.isPending}
					>
						{t('common.save')}
					</Button>
				</Form>
			</Card>
		</div>
	);
}

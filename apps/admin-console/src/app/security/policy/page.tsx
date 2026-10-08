'use client';

import React from 'react';
import { Card, Form, Input, Select, Switch, InputNumber, Button } from 'antd';
import { message } from '@/lib/antd-app';
import { Save } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getSecurityPolicy, updateSecurityPolicy } from '@/lib/api.generated';
import { queryKeys } from '@/lib/query-keys';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { extractItem, useCurrentTenantId, usePageTitle } from '@autional/shared';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

/** 后端 GET 返回的嵌套结构（apiClient 响应已转 camelCase；flat 键与 nested 键并存）。
 *  wire 锚：service-tenant/internal/handler/dto/dto.go:337-346 SecurityPolicyResponse
 *  （password_policy/session_policy 嵌套 + max_attempts_per_user/lock_duration/allowed_ip_ranges/
 *  blocked_countries/mfa_required 扁平）。 */
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
	/** A-128：响应扁平键 blocked_countries → camel；旧实现硬编码 [] → 已配置列表不可见。 */
	blockedCountries?: string[];
	mfaRequired?: boolean;
}

/** Go time.ParseDuration 可解析的必要格式（数字+单位 h/m/s 的一段或多段），如 30m / 1h / 1h30m。
 *  A-129：自由文本如 "30" 直送后端 ParseDuration 必 400 且报错为英文，前端同格式预校验。 */
const DURATION_PATTERN = /^(\d+(\.\d+)?(h|m|s))+$/;

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
	usePageTitle(t('securityPolicy.title')); // A-130：tab 标题（旧实现恒「Autional 管理控制台」）
	const [form] = Form.useForm();
	const tenantId = useCurrentTenantId() ?? '';

	const {
		data: policy,
		isLoading,
		error, // A-131：error 接线（旧实现未解构 → GET 失败静默空白表单）
		refetch,
	} = useQuery({
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
				// A-128：读回显（响应键 blocked_countries → camel）；保存即「所见集合」的替换语义可见化。
				blockedCountries: nested.blockedCountries ?? [],
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
			<AppPageHeader title={t('securityPolicy.title')} />
			{/* A-131：GET 失败显示错误态（旧实现 error 未解构 → 空白表单被当现状，据空白保存） */}
			{error && (
				<PageError message={t('securityPolicy.loadError')} retry={refetch} className="mb-4" />
			)}
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

					{/* A-130：以下标签/分组标题全部走 t()（旧实现硬编码中文，EN 模式半中文） */}
					<Form.Item name="mfaRequired" label={t('securityPolicy.mfaRequired')} valuePropName="checked">
						<Switch />
					</Form.Item>

					<h3 className="text-sm font-semibold mt-4 mb-2">{t('securityPolicy.passwordComplexity')}</h3>
					<Form.Item name="passwordMinLength" label={t('securityPolicy.minLength')}>
						{/* A-129：边界同源 —— DTO min=6（dto.go:364 password_min_length [6,128]；旧 UI min=4 → 4/5 保存必 400） */}
						<InputNumber min={6} max={128} className="w-50" />
					</Form.Item>
					<Form.Item name="passwordMaxLength" label={t('securityPolicy.maxLength')}>
						<InputNumber min={8} max={256} className="w-50" />
					</Form.Item>
					<Form.Item
						name="requireUppercase"
						label={t('securityPolicy.requireUppercase')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="requireLowercase"
						label={t('securityPolicy.requireLowercase')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item name="requireDigit" label={t('securityPolicy.requireDigit')} valuePropName="checked">
						<Switch />
					</Form.Item>
					<Form.Item
						name="requireSpecial"
						label={t('securityPolicy.requireSpecial')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>

					<h3 className="text-sm font-semibold mt-4 mb-2">
						{t('securityPolicy.accountAndSession')}
					</h3>
					<Form.Item name="maxAttemptsPerUser" label={t('securityPolicy.maxAttemptsPerUser')}>
						{/* A-129：边界同源 —— DTO [1,100]（dto.go:362 max_attempts_per_user；旧 UI [0,20] → 0 必 400） */}
						<InputNumber min={1} max={100} className="w-50" />
					</Form.Item>
					<Form.Item
						name="lockDuration"
						label={t('securityPolicy.lockDuration')}
						rules={[
							{
								validator: (_, value: string) =>
									!value || DURATION_PATTERN.test(value)
										? Promise.resolve()
										: Promise.reject(new Error(t('securityPolicy.durationInvalid'))),
							},
						]}
					>
						<Input placeholder={t('securityPolicy.durationPlaceholder')} className="w-50" />
					</Form.Item>
					<Form.Item
						name="sessionTimeout"
						label={t('securityPolicy.sessionTimeout')}
						rules={[
							{
								validator: (_, value: string) =>
									!value || DURATION_PATTERN.test(value)
										? Promise.resolve()
										: Promise.reject(new Error(t('securityPolicy.durationInvalid'))),
							},
						]}
					>
						<Input placeholder={t('securityPolicy.durationPlaceholder')} className="w-50" />
					</Form.Item>
					<Form.Item name="maxConcurrentSessions" label={t('securityPolicy.maxConcurrentSessions')}>
						<InputNumber min={1} max={1000} className="w-50" />
					</Form.Item>

					<Button
						type="primary"
						icon={<Save size="1em" />}
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

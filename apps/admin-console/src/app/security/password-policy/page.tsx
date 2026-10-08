'use client';

import React from 'react';
import { Card, Form, InputNumber, Checkbox, Switch, Button, Space } from 'antd';
import { Link } from 'react-router';
import { message } from '@/lib/antd-app';
import { Save } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPasswordPolicy, updatePasswordPolicy } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { queryKeys } from '@/lib/query-keys';
import { useTranslation } from 'react-i18next';
import type { PasswordPolicyResponse } from '@autional/shared/generated/types';
import { Alert, AppPageHeader } from '@autional/ui';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';

export default function PasswordPolicyPage() {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const tenantSlug = useTenantSlug();

	const { data: policy, isLoading } = useQuery({
		queryKey: queryKeys.security.passwordPolicy,
		queryFn: async () => {
			const res = await getPasswordPolicy();
			return (res?.data ?? res ?? {}) as PasswordPolicyResponse;
		},
	});

	const updateMut = useMutation({
		mutationFn: updatePasswordPolicy,
		onSuccess: () => {
			message.success(t('passwordPolicy.saveSuccess'));
		},
	});

	React.useEffect(() => {
		if (policy) {
			form.setFieldsValue({
				...policy,
				// A-119（并入 A-116 回显键映射）：响应 camel 键 → 表单 name 对齐
				// （requireUpper/requireLower/expiryDays ← dto/policy.go:37-38/41 json tag）；
				// 旧实现 3 组键错配静默丢弃 → 显示与真实策略不符（A-94 家族第 5 例）。
				requireUppercase: policy.requireUpper,
				requireLowercase: policy.requireLower,
				expirationDays: policy.expiryDays,
				// 后端 check_breached_passwords（client 自动转 camelCase）→ 前端 leakDetectionEnabled
				leakDetectionEnabled: policy.checkBreachedPasswords ?? false,
			});
		}
	}, [policy, form]);

	const onFinish = async (values: any) => {
		try {
			await updateMut.mutateAsync({
				// A-117 局部：有回显值的字段用回退链（未触碰保存不送零值）；无回显字段 undefined 即省略键
				// （指针省略 = 后端保留现值，防静默清零）。
				min_length: values.minLength ?? policy?.minLength ?? 10,
				max_length: values.maxLength ?? policy?.maxLength ?? 128,
				require_upper: values.requireUppercase ?? policy?.requireUpper,
				require_lower: values.requireLowercase ?? policy?.requireLower,
				require_digit: values.requireDigit ?? policy?.requireDigit,
				require_special: values.requireSpecial ?? policy?.requireSpecial,
				max_login_attempts: values.maxLoginAttempts,
				lock_duration_sec: values.lockDurationSec,
				expiry_days: values.expirationDays ?? policy?.expiryDays,
				grace_period_days: values.gracePeriodDays ?? policy?.gracePeriodDays,
				history_count: values.historyCount ?? policy?.historyCount,
				change_cooldown_minutes: values.changeCooldownMinutes ?? policy?.changeCooldownMinutes,
				// 前端 leakDetectionEnabled → 后端 check_breached_passwords（P2 闭环）
				check_breached_passwords: values.leakDetectionEnabled ?? policy?.checkBreachedPasswords,
			});
		} catch (err) {
			// A-120：专属文案（旧复用 t('mfa.saveFailed') 跨模块误导）
			handleApiError(err, t('passwordPolicy.saveFailed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('passwordPolicy.title')} />
			{/* A-119：主从口径 —— 本页与「认证配置」页共用同一密码策略（同写路径），主面为认证配置 */}
			<Alert
				variant="info"
				className="mb-4"
				title={
					<span>
						{t('passwordPolicy.masterHint')}{' '}
						<Link
							to={buildNavHref('/security/auth-config', tenantSlug)}
							className="underline"
						>
							{t('passwordPolicy.masterLink')}
						</Link>
					</span>
				}
			/>
			<Card loading={isLoading}>
				<Form form={form} layout="vertical" onFinish={onFinish}>
					<Form.Item name="minLength" label={t('passwordPolicy.minLength')}>
						<InputNumber min={4} max={128} className="w-50" />
					</Form.Item>

					{/* A-120：字段展示补齐（响应 max_length 有值而旧实现读到即丢弃） */}
					<Form.Item name="maxLength" label={t('passwordPolicy.maxLength')}>
						<InputNumber min={8} max={128} className="w-50" />
					</Form.Item>

					<Form.Item label={t('passwordPolicy.complexityRequirements')}>
						<Space direction="vertical">
							<Form.Item name="requireUppercase" valuePropName="checked" noStyle>
								<Checkbox>{t('passwordPolicy.requireUppercase')}</Checkbox>
							</Form.Item>
							<Form.Item name="requireLowercase" valuePropName="checked" noStyle>
								<Checkbox>{t('passwordPolicy.requireLowercase')}</Checkbox>
							</Form.Item>
							<Form.Item name="requireDigit" valuePropName="checked" noStyle>
								<Checkbox>{t('passwordPolicy.requireDigit')}</Checkbox>
							</Form.Item>
							<Form.Item name="requireSpecial" valuePropName="checked" noStyle>
								<Checkbox>{t('passwordPolicy.requireSpecial')}</Checkbox>
							</Form.Item>
						</Space>
					</Form.Item>

					<Form.Item name="expirationDays" label={t('passwordPolicy.expirationDays')}>
						<InputNumber min={0} max={365} className="w-50" />
					</Form.Item>

					{/* A-120：字段展示补齐（响应 grace_period_days / change_cooldown_minutes） */}
					<Form.Item name="gracePeriodDays" label={t('passwordPolicy.gracePeriodDays')}>
						<InputNumber min={0} max={365} className="w-50" />
					</Form.Item>

					<Form.Item name="historyCount" label={t('passwordPolicy.historyCount')}>
						<InputNumber min={0} max={24} className="w-50" />
					</Form.Item>

					<Form.Item
						name="changeCooldownMinutes"
						label={t('passwordPolicy.changeCooldownMinutes')}
					>
						<InputNumber min={0} max={1440} className="w-50" />
					</Form.Item>

					<Form.Item
						name="leakDetectionEnabled"
						label={t('passwordPolicy.leakDetectionEnabled')}
						valuePropName="checked"
					>
						<Switch />
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

'use client';

import React from 'react';
import { Card, Form, InputNumber, Checkbox, Switch, Button, Space } from 'antd';
import { message } from '@/lib/antd-app';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPasswordPolicy, updatePasswordPolicy } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { queryKeys } from '@/lib/query-keys';
import { useTranslation } from 'react-i18next';
import type { PasswordPolicyResponse } from '@autional/shared/generated/types';
import { ConsolePageHeader } from '@autional/ui';

export default function PasswordPolicyPage() {
	const { t } = useTranslation();
	const [form] = Form.useForm();

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
				// 后端 check_breached_passwords（client 自动转 camelCase）→ 前端 leakDetectionEnabled
				leakDetectionEnabled:
					(policy as any).checkBreachedPasswords ?? (policy as any).breachCheckEnabled ?? false,
			});
		}
	}, [policy, form]);

	const onFinish = async (values: any) => {
		try {
			await updateMut.mutateAsync({
				min_length: values.minLength ?? policy?.minLength ?? 10,
				max_length: values.maxLength ?? policy?.maxLength ?? 128,
				require_upper: values.requireUppercase ?? false,
				require_lower: values.requireLowercase ?? false,
				require_digit: values.requireDigit ?? false,
				require_special: values.requireSpecial ?? false,
				max_login_attempts: values.maxLoginAttempts ?? 0,
				lock_duration_sec: values.lockDurationSec ?? 0,
				expiry_days: values.expirationDays ?? 0,
				grace_period_days: values.gracePeriodDays ?? 0,
				history_count: values.historyCount ?? 0,
				change_cooldown_minutes: values.changeCooldownMinutes ?? 0,
				// 前端 leakDetectionEnabled → 后端 check_breached_passwords（P2 闭环）
				check_breached_passwords: values.leakDetectionEnabled ?? false,
			});
		} catch (err) {
			handleApiError(err, t('mfa.saveFailed'));
		}
	};

	return (
		<div>
			<ConsolePageHeader title={t('passwordPolicy.title')} />
			<Card loading={isLoading}>
				<Form form={form} layout="vertical" onFinish={onFinish}>
					<Form.Item name="minLength" label={t('passwordPolicy.minLength')}>
						<InputNumber min={4} max={128} className="w-50" />
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

					<Form.Item name="historyCount" label={t('passwordPolicy.historyCount')}>
						<InputNumber min={0} max={24} className="w-50" />
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

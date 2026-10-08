'use client';

import React from 'react';
import { Card, Form, Radio, Checkbox, Switch, Button } from 'antd';
import { message } from '@/lib/antd-app';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthPolicy, updateAuthPolicy } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { queryKeys } from '@/lib/query-keys';
import { extractItem, useCurrentTenantId } from '@autional/shared';
import type { AuthPolicyResponse, UpdateAuthPolicyRequest } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

type MFAMode = 'required' | 'optional' | 'disabled';

/** 后端 auth_policies 字段 → 表单字段（契约类型直读：AuthPolicyResponse 已被拦截器深 camel 化）。
 *  wire 锚：service-tenant/internal/domain/auth_policy.go:14-16/53/55（mfa_enabled/mfa_enforce_* json tag） */
function policyToForm(p: AuthPolicyResponse | undefined): {
	mode: MFAMode;
	methods: string[];
	highRiskRequired: boolean;
	newDeviceRequired: boolean;
} {
	if (!p) {
		return { mode: 'optional', methods: [], highRiskRequired: false, newDeviceRequired: false };
	}
	const enabled = !!p.mfaEnabled;
	const mode: MFAMode = !enabled ? 'disabled' : p.mfaEnforceForAll ? 'required' : 'optional';
	let methods: string[] = [];
	if (p.mfaMethods) {
		try {
			const parsed = JSON.parse(p.mfaMethods);
			if (Array.isArray(parsed)) methods = parsed.filter((m) => typeof m === 'string');
		} catch {
			methods = [];
		}
	}
	return {
		mode,
		methods,
		highRiskRequired: !!p.mfaEnforceForHighRisk,
		newDeviceRequired: !!p.mfaEnforceForNewDevice,
	};
}

/** 表单字段 → 后端 auth_policies 字段（部分更新；camel 书面写，拦截器 snake 化上 wire） */
function formToPolicy(values: {
	mode: MFAMode;
	methods: string[];
	highRiskRequired: boolean;
	newDeviceRequired: boolean;
}): UpdateAuthPolicyRequest {
	const payload: UpdateAuthPolicyRequest = {
		mfaEnforceForHighRisk: values.highRiskRequired,
		mfaEnforceForNewDevice: values.newDeviceRequired,
	};
	// mode: disabled → mfaEnabled=false; optional → on + enforceForAll=false; required → on + enforceForAll=true
	payload.mfaEnabled = values.mode !== 'disabled';
	payload.mfaEnforceForAll = values.mode === 'required';
	payload.mfaMethods = JSON.stringify(values.methods);
	return payload;
}

export default function MFAPolicyPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const [form] = Form.useForm();

	const { data: policy, isLoading, error, refetch } = useQuery({
		queryKey: queryKeys.security.mfaPolicy,
		queryFn: async () => {
			const res = await getAuthPolicy(tenantId);
			return extractItem<AuthPolicyResponse>(res) ?? {};
		},
		enabled: !!tenantId,
	});

	const updateMut = useMutation({
		mutationFn: (data: UpdateAuthPolicyRequest) => updateAuthPolicy(tenantId, data),
		onSuccess: () => {
			message.success(t('mfa.saveSuccess'));
		},
	});

	React.useEffect(() => {
		if (policy) form.setFieldsValue(policyToForm(policy));
	}, [policy, form]);

	const onFinish = async (values: any) => {
		if (!tenantId) {
			message.error(t('mfa.saveFailed'));
			return;
		}
		try {
			await updateMut.mutateAsync(formToPolicy(values));
		} catch (err) {
			handleApiError(err, t('mfa.saveFailed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('mfa.title')} />
			{error && <PageError message={t('mfa.saveFailed')} retry={refetch} className="mb-4" />}
			<Card loading={isLoading}>
				<Form form={form} layout="vertical" onFinish={onFinish}>
					<Form.Item name="mode" label={t('mfa.mode.label')} initialValue="optional">
						<Radio.Group>
							<Radio.Button value="required">{t('mfa.mode.required')}</Radio.Button>
							<Radio.Button value="optional">{t('mfa.mode.optional')}</Radio.Button>
							<Radio.Button value="disabled">{t('mfa.mode.disabled')}</Radio.Button>
						</Radio.Group>
					</Form.Item>

					<Form.Item name="methods" label={t('mfa.methods.label')}>
						<Checkbox.Group
							options={[
								{ label: t('mfa.method.totp'), value: 'totp' },
								{ label: t('mfa.method.sms'), value: 'sms' },
								{ label: t('mfa.method.email'), value: 'email' },
								{ label: t('mfa.method.passkey'), value: 'passkey' },
								{ label: t('mfa.method.recoveryCode'), value: 'recovery_code' },
							]}
						/>
					</Form.Item>

					<Form.Item
						name="highRiskRequired"
						label={t('mfa.highRiskRequired')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>

					<Form.Item
						name="newDeviceRequired"
						label={t('mfa.newDeviceRequired')}
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

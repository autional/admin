'use client';

import React from 'react';
import { Card, Form, Radio, Checkbox, Switch, Button } from 'antd';
import { message } from '@/lib/antd-app';
import { Save } from 'lucide-react';
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

/** JSON 数组字符串 → string[]（wire 存储形态为 `'["totp","passkey"]'`；空串/坏值容错为 []）。 */
function parseMethodList(raw: string | undefined | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((m) => typeof m === 'string');
	} catch {
		/* fallthrough */
	}
	return [];
}

/** 后端 auth_policies 字段 → 表单字段（契约类型直读：AuthPolicyResponse 已被拦截器深 camel 化）。
 *  wire 锚：service-tenant/internal/handler/dto/dto.go:437-480（mfa_enabled / mfa_enforce_ 三布尔 /
 *  mfa_methods / mfa_preferred_methods json tag）；A-100：双集合字段（mfa_methods 可用方式 /
 *  mfa_preferred_methods 首选方式）均回读，保存时两者都写（UpdateAuthPolicyRequest :491/:528 双字段齐备）。 */
function policyToForm(p: AuthPolicyResponse | undefined): {
	mode: MFAMode;
	methods: string[];
	preferredMethods: string[];
	highRiskRequired: boolean;
	newDeviceRequired: boolean;
} {
	if (!p) {
		return {
			mode: 'optional',
			methods: [],
			preferredMethods: [],
			highRiskRequired: false,
			newDeviceRequired: false,
		};
	}
	const enabled = !!p.mfaEnabled;
	const mode: MFAMode = !enabled ? 'disabled' : p.mfaEnforceForAll ? 'required' : 'optional';
	return {
		mode,
		methods: parseMethodList(p.mfaMethods),
		preferredMethods: parseMethodList(p.mfaPreferredMethods),
		highRiskRequired: !!p.mfaEnforceForHighRisk,
		newDeviceRequired: !!p.mfaEnforceForNewDevice,
	};
}

/** 表单字段 → 后端 auth_policies 字段（部分更新；camel 书面写，拦截器 snake 化上 wire） */
function formToPolicy(values: {
	mode: MFAMode;
	methods?: string[];
	preferredMethods?: string[];
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
	payload.mfaMethods = JSON.stringify(values.methods ?? []);
	// A-100：首选方式与可用方式同保存（读回写一致；空数组 = 不指定首选）
	payload.mfaPreferredMethods = JSON.stringify(values.preferredMethods ?? []);
	return payload;
}

/** MFA 方式选项单源（可用方式 / 首选方式共用，A-100 双字段口径一致）。 */
const MFA_METHOD_OPTIONS = ['totp', 'sms', 'email', 'passkey', 'recovery_code'] as const;

export default function MFAPolicyPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const [form] = Form.useForm();

	// A-101：mode=禁用态联动 —— 禁用时方式勾选与两个强制 Switch 均置灰（消除
	// 「禁用 MFA + 高风险强制=开」自相矛盾组合）；值保留在表单，重新启用即恢复可编辑。
	const modeValue = Form.useWatch('mode', form);
	const disabledByMode = modeValue === 'disabled';

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
			{/* A-99：GET 失败独立文案（旧复用 mfa.saveFailed「保存失败」→ 误导为保存动作出错） */}
			{error && <PageError message={t('mfa.loadFailed')} retry={refetch} className="mb-4" />}
			<Card loading={isLoading}>
				<Form form={form} layout="vertical" onFinish={onFinish}>
					<Form.Item
						name="mode"
						label={t('mfa.mode.label')}
						initialValue="optional"
						extra={disabledByMode ? t('mfa.disabledHint') : undefined}
					>
						<Radio.Group>
							<Radio.Button value="required">{t('mfa.mode.required')}</Radio.Button>
							<Radio.Button value="optional">{t('mfa.mode.optional')}</Radio.Button>
							<Radio.Button value="disabled">{t('mfa.mode.disabled')}</Radio.Button>
						</Radio.Group>
					</Form.Item>

					{/* A-100：空选语义明确 + A-101 禁用联动 */}
					<Form.Item
						name="methods"
						label={t('mfa.methods.label')}
						extra={t('mfa.methodsHint')}
					>
						<Checkbox.Group
							disabled={disabledByMode}
							options={MFA_METHOD_OPTIONS.map((m) => ({
								label: t(
									m === 'recovery_code' ? 'mfa.method.recoveryCode' : `mfa.method.${m}`,
								),
								value: m,
							}))}
						/>
					</Form.Item>

					{/* A-100：mfa_preferred_methods 回读 + 编辑口（旧实现零展示零编辑，保存/回读不一致） */}
					<Form.Item
						name="preferredMethods"
						label={t('mfa.preferredMethods.label')}
						extra={t('mfa.preferredMethods.hint')}
					>
						<Checkbox.Group
							disabled={disabledByMode}
							options={MFA_METHOD_OPTIONS.map((m) => ({
								label: t(
									m === 'recovery_code' ? 'mfa.method.recoveryCode' : `mfa.method.${m}`,
								),
								value: m,
							}))}
						/>
					</Form.Item>

					<Form.Item
						name="highRiskRequired"
						label={t('mfa.highRiskRequired')}
						valuePropName="checked"
						extra={t('mfa.highRiskHint')}
					>
						<Switch disabled={disabledByMode} />
					</Form.Item>

					<Form.Item
						name="newDeviceRequired"
						label={t('mfa.newDeviceRequired')}
						valuePropName="checked"
						extra={t('mfa.newDeviceHint')}
					>
						<Switch disabled={disabledByMode} />
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

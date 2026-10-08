'use client';

import { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Switch, Button, Space, Spin } from 'antd';
import { message } from '@/lib/antd-app';
import { AppPageHeader, SectionCard } from '@autional/ui';
import { apiClient, extractItem } from '@autional/shared';
import {
	adminSecretsPolicy,
	adminSecretsPolicyPut,
	adminSecretsPolicyDelete,
} from '@autional/shared/generated/api';
import { useTranslation } from 'react-i18next';
import type { SecretPolicyResponse } from '@autional/shared/generated/types';

// TASK-AB1-27（RC-5 契约收敛）：契约类型直读（generated types，键名 camel），旧本地 snake 接口删除。
// wire 锚：service-secret dto/dto.go:261-270 SecretPolicyResponse（tenant_id/default_ttl/max_ttl… snake json tag）
// 经响应拦截器深 camel 化；GET/PUT 均为 DataResponse 信封（admin_handler.go:370-402），拦截器已解包。

// 根因修复 (2026-08-13): 后端 default_ttl/max_ttl 是 time.Duration 纳秒
// （如 31536000000000000 = 8760h），此前表单 Input 原样显示纳秒、保存原样提交。
// 显示/编辑统一用小时，保存转回纳秒（后端契约不变）。
const NS_PER_HOUR = 3600e9; // 3600 * 1e9

/** 纳秒 → 小时（保留最多 2 位小数，整小时则无小数） */
function nsToHours(ns: string | number | null | undefined): string {
	if (ns == null || ns === '') return '';
	const n = typeof ns === 'number' ? ns : Number(ns);
	if (!Number.isFinite(n)) return '';
	const h = n / NS_PER_HOUR;
	return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100);
}

/** 小时 → 纳秒（number，匹配后端 time.Duration 的 JSON number 契约）；
 *  非法/空返回 undefined（前端校验拦截，不提交空值）。 */
function hoursToNs(h: string | number | null | undefined): number | undefined {
	if (h == null || h === '') return undefined;
	const v = typeof h === 'number' ? h : Number(h);
	if (!Number.isFinite(v)) return undefined;
	return Math.round(v * NS_PER_HOUR);
}

export default function SecretPolicyPage() {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form] = Form.useForm();

	const fetchPolicy = () => {
		setLoading(true);
		setError(null);
		adminSecretsPolicy()
			.then((res) => {
				// 契约直读（拦截器深 camel；generated 已解包 payload）——旧 snake/camel 双读链删除
				const policy = extractItem<SecretPolicyResponse>(res);
				if (policy) {
					form.setFieldsValue({
						// 纳秒 → 小时显示（placeholder 已是 "0h"/"8760h"）
						defaultTtl: nsToHours(policy.defaultTtl),
						maxTtl: nsToHours(policy.maxTtl),
						autoRotateDays: policy.autoRotateDays,
						notificationDaysBefore: policy.notificationDaysBefore ?? 7,
						maxVersions: policy.maxVersions ?? 100,
						requireRotationForFallbackKeys: policy.requireRotationForFallbackKeys ?? false,
					});
				}
			})
			.catch(() => {
				setError(t('secrets.policy.loadError'));
			})
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		fetchPolicy();
	}, []);

	const handleSave = async (values: Record<string, unknown>) => {
		setSaving(true);
		try {
			// 小时 → 纳秒转回（后端契约 time.Duration，dto.go:253-254）；提交侧 camel 书面写，
			// 拦截器 snake 化上 wire（default_ttl/max_ttl/auto_rotate_days…）
			const payload: Record<string, unknown> = { ...values };
			if (payload.defaultTtl != null && payload.defaultTtl !== '') {
				payload.defaultTtl = hoursToNs(payload.defaultTtl as string);
			}
			if (payload.maxTtl != null && payload.maxTtl !== '') {
				payload.maxTtl = hoursToNs(payload.maxTtl as string);
			}
			await adminSecretsPolicyPut(payload);
			message.success(t('secrets.policy.saveSuccess'));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			message.error(msg || t('secrets.policy.saveError'));
		} finally {
			setSaving(false);
		}
	};

	const handleReset = async () => {
		try {
			await adminSecretsPolicyDelete();
			await fetchPolicy();
			message.success(t('secrets.policy.resetSuccess'));
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			message.error(msg || t('secrets.policy.saveError'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('secrets.policy.title')} description={t('secrets.policy.description')} />

			{loading ? (
				<Spin size="large" className="flex justify-center mt-16" />
			) : error ? (
				<div className="text-danger-text mt-8 text-center">{error}</div>
			) : (
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<SectionCard title={t('secrets.policy.title')}>
						<Form.Item
							name="defaultTtl"
							label={t('secrets.policy.defaultTtl')}
							extra={t('secrets.policy.defaultTtlHint')}
						>
							<Input placeholder="0h" className="w-60" />
						</Form.Item>

						<Form.Item
							name="maxTtl"
							label={t('secrets.policy.maxTtl')}
							extra={t('secrets.policy.maxTtlHint')}
						>
							<Input placeholder="8760h" className="w-60" />
						</Form.Item>

						<Form.Item name="autoRotateDays" label={t('secrets.policy.autoRotate')}>
							<InputNumber min={0} className="w-60" />
						</Form.Item>

						<Form.Item
							name="notificationDaysBefore"
							label={t('secrets.policy.notifyBefore')}
							initialValue={7}
						>
							<InputNumber min={0} className="w-60" />
						</Form.Item>

						<Form.Item
							name="maxVersions"
							label={t('secrets.policy.maxVersions')}
							initialValue={100}
						>
							<InputNumber min={1} max={1000} className="w-60" />
						</Form.Item>

						<Form.Item
							name="requireRotationForFallbackKeys"
							label={t('secrets.policy.requireRotation')}
							valuePropName="checked"
						>
							<Switch />
						</Form.Item>
					</SectionCard>

					<Space className="mt-4">
						<Button onClick={handleReset}>{t('secrets.policy.resetDefaults')}</Button>
						<Button type="primary" htmlType="submit" loading={saving}>
							{t('secrets.policy.save')}
						</Button>
					</Space>
				</Form>
			)}
		</div>
	);
}

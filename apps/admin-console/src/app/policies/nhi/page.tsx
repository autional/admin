'use client';

import React, { useEffect } from 'react';
import { Form, InputNumber, Select, Button, Skeleton, Typography } from 'antd';
import { Save } from 'lucide-react';
import { usePageTitle } from '@autional/shared';
import { AppPageHeader, ErrorState, SectionCard } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractItem } from '@autional/shared';
import { adminPoliciesNhi, adminPoliciesNhiPut } from '@autional/shared/generated/api';
import type { NHIPolicyRequest } from '@autional/shared/generated/types';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';
import { useTranslation } from 'react-i18next';

/**
 * TASK-AB1-20 / A-94：表单契约 = 生成类型 NHIPolicyRequest（camel 书面键）。
 * Form.Item name 与契约键对齐 —— setFieldsValue(响应 camel) 回显命中；提交 camel 经拦截器 snake 化上 wire。
 * A-97：updated_at 随响应下发（快照未含）→ 局部增强类型承载。
 */
type NhiPolicy = NHIPolicyRequest & { updatedAt?: string };

function formatDateTime(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleString('zh-CN');
}

async function fetchNhiPolicy(): Promise<NhiPolicy> {
	const res = await adminPoliciesNhi();
	// 根因修复 (2026-08-13): generated 已解包，extractItem(res.data) → null → 表单永远空
	const data = extractItem<NhiPolicy>(res);
	return data ?? {};
}

async function saveNhiPolicy(values: NhiPolicy): Promise<NhiPolicy> {
	const res = await adminPoliciesNhiPut(values);
	return extractItem<NhiPolicy>(res) ?? {};
}

export default function NhiPolicyPage() {
	const { t } = useTranslation();
	usePageTitle(t('nhiPolicy.pageTitle'));
	const queryClient = useQueryClient();
	const [form] = Form.useForm();

	const {
		data: policy,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.nhiPolicy.all,
		queryFn: fetchNhiPolicy,
		staleTime: 300000,
	});

	useEffect(() => {
		if (policy) {
			form.setFieldsValue(policy);
		}
	}, [policy, form]);

	const saveMut = useMutation({
		mutationFn: saveNhiPolicy,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.nhiPolicy.all });
		},
	});

	const handleSave = async (values: NhiPolicy) => {
		try {
			await saveMut.mutateAsync(values);
			message.success(t('nhiPolicy.saveSuccess'));
		} catch (err) {
			handleApiError(err, t('nhiPolicy.saveFailed'));
		}
	};

	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton active />
				<Skeleton active />
				<Skeleton active />
			</div>
		);
	}

	if (error && !policy) {
		return (
			<div>
				<ErrorState
					title={t('nhiPolicy.loadError')}
					message={t('nhiPolicy.loadErrorHint')}
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	return (
		<div>
			<div className="mb-6">
				<AppPageHeader title={t('nhiPolicy.title')} description={t('nhiPolicy.subtitle')} />
			</div>

			<Form
				form={form}
				layout="vertical"
				onFinish={handleSave}
				initialValues={{
					// A-96：全表与后端缺省/边界同源 —— agentMaxCount 100（nhi_policy.go gorm default）、
					// robotMaxCount 100（同上；旧 50 系前端漂移）、rotationDaysDefault 90（同上）。
					agentMaxCount: 100,
					agentDefaultTtl: '1h',
					robotMaxCount: 100,
					deviceMaxPerOwner: 10,
					rotationDaysDefault: 90,
				}}
			>
				<SectionCard title={t('nhiPolicy.section.agentDefaults')}>
					<Form.Item
						name="agentMaxCount"
						label={t('nhiPolicy.agentMaxCount')}
						rules={[{ required: true, message: t('nhiPolicy.required') }]}
					>
						<InputNumber min={1} max={10000} className="w-50" />
					</Form.Item>
					<Form.Item
						name="agentDefaultTtl"
						label={t('nhiPolicy.agentDefaultTtl')}
						rules={[{ required: true, message: t('nhiPolicy.required') }]}
					>
						<Select
							className="w-50"
							options={[
								{ value: '5m', label: t('nhiPolicy.ttl.5m') },
								{ value: '15m', label: t('nhiPolicy.ttl.15m') },
								{ value: '30m', label: t('nhiPolicy.ttl.30m') },
								{ value: '1h', label: t('nhiPolicy.ttl.1h') },
							]}
						/>
					</Form.Item>
				</SectionCard>

				<SectionCard title={t('nhiPolicy.section.robotDefaults')} className="mt-6">
					<Form.Item
						name="robotMaxCount"
						label={t('nhiPolicy.robotMaxCount')}
						rules={[{ required: true, message: t('nhiPolicy.required') }]}
					>
						<InputNumber min={1} max={10000} className="w-50" />
					</Form.Item>
				</SectionCard>

				<SectionCard title={t('nhiPolicy.section.deviceDefaults')} className="mt-6">
					<Form.Item
						name="deviceMaxPerOwner"
						label={t('nhiPolicy.deviceMaxPerOwner')}
						rules={[{ required: true, message: t('nhiPolicy.required') }]}
					>
						<InputNumber min={1} max={1000} className="w-50" />
					</Form.Item>
				</SectionCard>

				<SectionCard title={t('nhiPolicy.section.securityDefaults')} className="mt-6">
					<Form.Item
						name="rotationDaysDefault"
						label={t('nhiPolicy.rotationDaysDefault')}
						rules={[{ required: true, message: t('nhiPolicy.required') }]}
					>
						{/* A-96：上限对齐后端 Validate [1,3650]（dto/policy.go:222-223；旧 UI 365 系漂移） */}
						<InputNumber min={1} max={3650} className="w-50" />
					</Form.Item>
				</SectionCard>

				<div className="mt-6 flex items-center gap-4">
					<Button
						type="primary"
						htmlType="submit"
						icon={<Save size="1em" />}
						loading={saveMut.isPending}
						size="large"
					>
						{t('nhiPolicy.savePolicy')}
					</Button>
					{/* A-97：updated_at 展示（旧实现响应有值但界面零展示，管理员看不到上次修改时间） */}
					{policy?.updatedAt && (
						<Typography.Text type="secondary">
							{t('nhiPolicy.lastUpdated')}: {formatDateTime(policy.updatedAt)}
						</Typography.Text>
					)}
				</div>
			</Form>
		</div>
	);
}

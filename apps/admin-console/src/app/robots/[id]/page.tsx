'use client';
// @generated-api-exempt: 3 key(s) [IDENTITY.ADMIN_ROBOT_COMMISSION, IDENTITY.ADMIN_ROBOT_DECOMMISSION, IDENTITY.ADMIN_ROBOT_INTENT] lack generated func

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
	Button,
	Tag,
	Modal,
	Form,
	Input,
	Select,
	Skeleton,
	Descriptions,
	Typography,
	Space,
} from 'antd';
import {
	ArrowLeft,
	KeyRound,
	PauseCircle,
	Pencil,
	Play,
} from 'lucide-react';
import { usePageTitle, useTenantSlug, useCurrentTenantId } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { AppPageHeader, EmptyState, ErrorState, SectionCard, StatusBadge } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_PATHS, extractItem } from '@autional/shared';
import { adminRobotsByRobots, adminRobotsByRobotsPut } from '@autional/shared/generated/api';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';
import { useOwnerDisplay } from '@/hooks/use-owner-display';
import { ROBOT_STATUS_VARIANT, statusVariantOf, retryUnlessNotFound } from '@/lib/nhi';

import type { RobotInfo } from '@autional/shared/generated/types';

// W1b（A-84）：owner_principal_id 为 additive 增量键（generated 快照未含）→ 局部增强类型。
type RobotDetail = RobotInfo & { ownerPrincipalId?: string };

const { Paragraph, Text } = Typography;

// A-85：状态词表单源 = src/lib/nhi.ts（旧本地表含维护中/配置中等幽灵态——两页各抄一份即漂移根源）。

function formatDate(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleDateString('zh-CN');
}

async function fetchRobot(id: string): Promise<RobotDetail> {
	const res = await adminRobotsByRobots(id);
	// 根因修复 (2026-08-13): generated 已解包，res.data → undefined → 详情页空
	return extractItem(res) ?? ({} as RobotDetail);
}

async function updateRobot(id: string, values: Record<string, unknown>): Promise<RobotInfo> {
	const res = await adminRobotsByRobotsPut(id, values);
	return extractItem(res) ?? ({} as RobotInfo);
}

async function commissionRobot(id: string): Promise<void> {
	await apiClient.post(API_PATHS.IDENTITY.ADMIN_ROBOT_COMMISSION(id));
}

async function decommissionRobot(id: string): Promise<void> {
	await apiClient.post(API_PATHS.IDENTITY.ADMIN_ROBOT_DECOMMISSION(id));
}

async function issueIntentToken(
	id: string,
	data: Record<string, unknown>,
): Promise<{ intentToken?: string }> {
	// TASK-AB1-27（RC-5 契约收敛）：响应键 camel 直读（拦截器深 camel 化）。
	// wire 锚：service-identity/internal/robot/handler/robot_handler.go:230（json intent_token）
	const res = await apiClient.post(API_PATHS.IDENTITY.ADMIN_ROBOT_INTENT(id), data);
	return extractItem(res.data) ?? {};
}

export default function RobotDetailPage() {
	const { t } = useTranslation();
	const SUBTYPE_LABELS: Record<string, string> = {
		industrial: t('robotDetail.subtype.industrial'),
		vehicle: t('robotDetail.subtype.vehicle'),
		drone: t('robotDetail.subtype.drone'),
	};
	const ACTION_OPTIONS = [
		{ value: 'move', label: t('robotDetail.action.move') },
		{ value: 'grasp', label: t('robotDetail.action.grasp') },
		{ value: 'navigate', label: t('robotDetail.action.navigate') },
		{ value: 'scan', label: t('robotDetail.action.scan') },
		{ value: 'dock', label: t('robotDetail.action.dock') },
	];
	const ZONE_OPTIONS = [
		{ value: 'zone-a', label: t('robotDetail.zone.a') },
		{ value: 'zone-b', label: t('robotDetail.zone.b') },
		{ value: 'warehouse-1', label: t('robotDetail.zone.warehouse1') },
		{ value: 'floor-1', label: t('robotDetail.zone.floor1') },
	];
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const queryClient = useQueryClient();
	const tenantId = useCurrentTenantId() ?? '';
	const [editVisible, setEditVisible] = useState(false);
	const [intentVisible, setIntentVisible] = useState(false);
	const [intentResult, setIntentResult] = useState<string | null>(null);
	const [form] = Form.useForm();
	const [intentForm] = Form.useForm();

	// A-84：owner_principal_id → 成员显示名解析（列表/详情共用单点 hook）
	const { resolve: resolveOwner } = useOwnerDisplay();

	const {
		data: robot,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.robots.detail(tenantId, id!),
		queryFn: () => fetchRobot(id!),
		enabled: !!id,
		staleTime: 30000,
		// A-86：404 不重试（消「假 ID 2 条 console 404」噪声）；其余沿用全局 retry:1
		retry: retryUnlessNotFound,
	});

	const updateMut = useMutation({
		mutationFn: ({ id: robotId, values }: { id: string; values: Record<string, unknown> }) =>
			updateRobot(robotId, values),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.robots.detail(tenantId, id!) });
			queryClient.invalidateQueries({ queryKey: queryKeys.robots.all(tenantId) });
		},
	});

	const commissionMut = useMutation({
		mutationFn: commissionRobot,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.robots.detail(tenantId, id!) });
			queryClient.invalidateQueries({ queryKey: queryKeys.robots.all(tenantId) });
		},
	});

	const decommissionMut = useMutation({
		mutationFn: decommissionRobot,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.robots.detail(tenantId, id!) });
			queryClient.invalidateQueries({ queryKey: queryKeys.robots.all(tenantId) });
		},
	});

	const intentMut = useMutation({
		mutationFn: ({ id: robotId, data }: { id: string; data: Record<string, unknown> }) =>
			issueIntentToken(robotId, data),
	});

	usePageTitle(robot?.name ? `${robot.name} - ${t('robotDetail.title')}` : t('robotDetail.title'));

	const handleEdit = async (values: Record<string, unknown>) => {
		if (!id) return;
		try {
			await updateMut.mutateAsync({ id, values });
			message.success(t('robotDetail.updateSuccess'));
			setEditVisible(false);
		} catch (err) {
			handleApiError(err, t('robotDetail.updateFailed'));
		}
	};

	const openEdit = () => {
		if (!robot) return;
		form.setFieldsValue({
			name: robot.name,
			model: robot.model,
			location: robot.location,
			firmwareVer: robot.firmwareVer,
			safetyPolicy: robot.safetyPolicy,
		});
		setEditVisible(true);
	};

	const handleCommission = async () => {
		if (!id) return;
		try {
			await commissionMut.mutateAsync(id);
			message.success(t('robotDetail.commissionSuccess'));
		} catch (err) {
			handleApiError(err, t('robotDetail.commissionFailed'));
		}
	};

	const handleDecommission = async () => {
		if (!id) return;
		try {
			await decommissionMut.mutateAsync(id);
			message.success(t('robotDetail.decommissionSuccess'));
		} catch (err) {
			handleApiError(err, t('robotDetail.decommissionFailed'));
		}
	};

	const handleIssueIntent = async (values: Record<string, unknown>) => {
		if (!id) return;
		try {
			const result = await intentMut.mutateAsync({ id, data: values });
			setIntentResult(result.intentToken ?? null);
			message.success(t('robotDetail.intentSuccess'));
		} catch (err) {
			handleApiError(err, t('robotDetail.intentFailed'));
		}
	};

	const canCommission = robot?.status === 'decommissioned' || robot?.status === 'provisioning';
	const canDecommission = robot?.status === 'active';
	const canIssueIntent = robot?.status === 'active';

	if (!id) {
		return (
			<div>
				<ErrorState title={t('robotDetail.invalidTitle')} message={t('robotDetail.invalidMessage')} />
			</div>
		);
	}

	return (
		<div>
			<div className="mb-6">
				<Button
					type="text"
					icon={<ArrowLeft size="1em" />}
					onClick={() => navigate(buildNavHref('/robots', tenantSlug))}
					className="mb-4 pl-0"
				>
					{t('robotDetail.backToList')}
				</Button>
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
					<AppPageHeader
						title={robot?.name || t('robotDetail.title')}
						// A-86：错误态副标题不得残留「加载中」（robot 未达时留白，由下方 ErrorState 表达）
						description={
							robot?.model ? `${t('robotDetail.modelLabel')}: ${robot.model}` : undefined
						}
					/>
					{robot && (
						<Space>
							{canCommission && (
								<Button
									icon={<Play size="1em" />}
									className="!text-success-text !border-success"
									onClick={handleCommission}
									loading={commissionMut.isPending}
								>
									{t('robotDetail.commissionBtn')}
								</Button>
							)}
							{canDecommission && (
								<Button
									icon={<PauseCircle size="1em" />}
									danger
									onClick={handleDecommission}
									loading={decommissionMut.isPending}
								>
									{t('robotDetail.decommissionBtn')}
								</Button>
							)}
							{canIssueIntent && (
								<Button
									icon={<KeyRound size="1em" />}
									onClick={() => {
										intentForm.resetFields();
										setIntentResult(null);
										setIntentVisible(true);
									}}
								>
									{t('robotDetail.issueIntent')}
								</Button>
							)}
							<Button icon={<Pencil size="1em" />} onClick={openEdit}>
								{t('robotDetail.editTitle')}
							</Button>
						</Space>
					)}
				</div>
			</div>

			{isLoading && (
				<div className="space-y-4">
					<Skeleton active paragraph={{ rows: 4 }} />
					<Skeleton active paragraph={{ rows: 3 }} />
				</div>
			)}

			{!isLoading && error && (
				<ErrorState
					title={t('robotDetail.loadError')}
					message={t('robotDetail.loadErrorHint')}
					onRetry={() => refetch()}
				/>
			)}

			{!isLoading && !error && robot && (
				<>
					<SectionCard title={t('robotDetail.section.info')} className="mb-6">
						<Descriptions column={2} bordered size="small">
							<Descriptions.Item label={t('common.name')}>{robot.name}</Descriptions.Item>
						<Descriptions.Item label={t('common.status')}>
							<StatusBadge variant={statusVariantOf(ROBOT_STATUS_VARIANT, robot.status)}>
								{t(`robots.status.${robot.status}`, { defaultValue: robot.status || '-' })}
							</StatusBadge>
						</Descriptions.Item>
							<Descriptions.Item label={t('robots.column.model')}>{robot.model || '-'}</Descriptions.Item>
							<Descriptions.Item label={t('robots.form.subtype')}>
								<Tag color="purple">
									{SUBTYPE_LABELS[robot.workloadSubtype || ''] || robot.workloadSubtype || '-'}
								</Tag>
							</Descriptions.Item>
							<Descriptions.Item label={t('robots.column.location')}>{robot.location || '-'}</Descriptions.Item>
							<Descriptions.Item label={t('robots.form.firmware')}>{robot.firmwareVer || '-'}</Descriptions.Item>
							<Descriptions.Item label={t('robotDetail.identityId')}>{robot.identityId || '-'}</Descriptions.Item>
							<Descriptions.Item label={t('robotDetail.ownerId')}>
								{/* A-84：owner 显示名（owner_principal_id 优先；历史行回退 owner_id） */}
								{resolveOwner(robot.ownerPrincipalId, robot.ownerId)}
							</Descriptions.Item>
							<Descriptions.Item label={t('robotDetail.safetyPolicy')}>
								{robot.safetyPolicy || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('robotDetail.lastHealth')}>
								{formatDate(robot.lastHealthAt || '')}
							</Descriptions.Item>
							<Descriptions.Item label={t('robots.column.created')}>
								{formatDate(robot.createdAt || '')}
							</Descriptions.Item>
							<Descriptions.Item label={t('common.updatedAt')}>
								{formatDate(robot.updatedAt || '')}
							</Descriptions.Item>
						</Descriptions>
					</SectionCard>

					<SectionCard title={t('common.actions')} className="mb-6">
						<div className="space-y-4">
							<div>
								<Text strong>{t('robotDetail.commissionStatus')}</Text>
								{canCommission && <Text type="success">{t('robotDetail.readyToCommission')}</Text>}
								{canDecommission && (
									<Text type="warning">{t('robotDetail.activeCanDecommission')}</Text>
								)}
								{robot.status === 'decommissioned' && (
									<Text type="secondary">{t('robotDetail.decommissioned')}</Text>
								)}
								{robot.status === 'degraded' && (
									<Text type="warning">{t('robotDetail.degradedMode')}</Text>
								)}
							</div>
							{canIssueIntent && (
								<div>
									<Text strong>{t('robotDetail.intentTokenLabel')}</Text>
									<Text>{t('robotDetail.intentAvailable')}</Text>
								</div>
							)}
						</div>
					</SectionCard>
				</>
			)}

			<Modal
				title={t('robotDetail.editTitle')}
				open={editVisible}
				onCancel={() => {
					setEditVisible(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={updateMut.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleEdit}>
					<Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
						<Input placeholder={t('robots.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="model" label={t('robots.column.model')}>
						<Input placeholder={t('robots.form.modelPlaceholder')} />
					</Form.Item>
					<Form.Item name="location" label={t('robots.column.location')}>
						<Input placeholder={t('robots.form.locationPlaceholder')} />
					</Form.Item>
					<Form.Item name="firmwareVer" label={t('robots.form.firmware')}>
						<Input placeholder={t('robots.form.firmwarePlaceholder')} />
					</Form.Item>
					<Form.Item name="safetyPolicy" label={t('robotDetail.safetyPolicy')}>
						<Input placeholder={t('robotDetail.safetyPolicyPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={`${t('robotDetail.issueIntent')} — ${robot?.name || ''}`}
				open={intentVisible}
				onCancel={() => {
					setIntentVisible(false);
					setIntentResult(null);
					intentForm.resetFields();
				}}
				className="w-full max-w-[560px]"
				footer={
					intentResult
						? [
								<Button
									key="close"
									onClick={() => {
										setIntentVisible(false);
										setIntentResult(null);
									}}
								>
									{t('common.close')}
								</Button>,
							]
						: [
								<Button
									key="cancel"
									onClick={() => {
										setIntentVisible(false);
										setIntentResult(null);
									}}
								>
									{t('common.cancel')}
								</Button>,
								<Button
									key="submit"
									type="primary"
									loading={intentMut.isPending}
									onClick={() => intentForm.submit()}
								>
									{t('robotDetail.issueToken')}
								</Button>,
							]
				}
				destroyOnHidden
			>
				{intentResult ? (
					<div className="space-y-3">
						<Text strong>{t('robotDetail.generatedIntentToken')}</Text>
						<Paragraph copyable code className="break-all text-xs bg-neutral-50 p-3 rounded-xs border">
							{intentResult}
						</Paragraph>
						<Text type="secondary" className="text-xs">
							{t('robotDetail.intentTokenHint')}
						</Text>
					</div>
				) : (
					<Form form={intentForm} layout="vertical" onFinish={handleIssueIntent}>
						<Form.Item name="actions" label={t('robotDetail.allowedActions')}>
							<Select
								mode="tags"
								placeholder={t('robotDetail.allowedActionsPlaceholder')}
								options={ACTION_OPTIONS}
							/>
						</Form.Item>
						<Form.Item name="allowedZones" label={t('robotDetail.allowedZones')}>
							<Select
								mode="tags"
								placeholder={t('robotDetail.allowedZonesPlaceholder')}
								options={ZONE_OPTIONS}
							/>
						</Form.Item>
						<Form.Item name="maxSpeed" label={t('robotDetail.maxSpeed')}>
							<Input type="number" placeholder={t('robotDetail.maxSpeedPlaceholder')} />
						</Form.Item>
					</Form>
				)}
			</Modal>
		</div>
	);
}

'use client';

import React, { useState, useEffect } from 'react';
import {
	Card,
	Button,
	Form,
	Input,
	InputNumber,
	Select,
	Switch,
	Spin,
	Descriptions,
	Statistic,
	Popconfirm,
	Row as AntRow,
	Col,
} from 'antd';
import dayjs from 'dayjs';
import { message } from '@/lib/antd-app';
import { DownloadCloud, Pencil, Save, X } from 'lucide-react';
import { useRetentionPolicy, useSaveRetentionPolicy } from '@/hooks/use-retention-policy';
import type { RetentionPolicy } from '@/hooks/use-retention-policy';
import type * as Types from '@autional/shared/generated/types';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { apiClient, extractItem, extractListResult } from '@autional/shared';
import {
	adminAuditArchiveStatus,
	adminAuditArchivePost,
	adminAuditLogs,
} from '@autional/shared/generated/api';
import { AppPageHeader } from '@autional/ui';
import { usePageTitle } from '@autional/shared';
import { useTranslation } from 'react-i18next';

export default function RetentionPolicyPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('auditRetention.title'));
	const [editing, setEditing] = useState(false);
	const [form] = Form.useForm();

	const { data, isLoading, error, refetch } = useRetentionPolicy();
	const saveMut = useSaveRetentionPolicy();

	const [archiveStatus, setArchiveStatus] = useState<any>(null);
	const [archiveLoading, setArchiveLoading] = useState(false);
	const [archiveNowLoading, setArchiveNowLoading] = useState(false);

	// A-215f：Popconfirm 影响面（ADR-B2-04）——条数/未知态 + 与归档同口径的 before（10 位秒，ADR-B2-10）。
	const [archiveCount, setArchiveCount] = useState<number | null>(null);
	const [archiveCountUnknown, setArchiveCountUnknown] = useState(false);
	const [archiveBefore, setArchiveBefore] = useState<number | null>(null);

	const fetchArchiveStatus = async () => {
		setArchiveLoading(true);
		try {
			const res = await adminAuditArchiveStatus();
			setArchiveStatus(extractItem(res));
		} catch (err) {
			handleApiError(err, t('auditRetention.archiveStatusLoadFailed'));
		} finally {
			setArchiveLoading(false);
		}
	};

	/** A-215f：Popconfirm 打开时取影响面条数（ADR-B2-04 = 既有列表 total；失败 → 无法预估但不豁免确认）。 */
	const prepareArchiveConfirm = async () => {
		const before = dayjs().unix(); // ADR-B2-10：10 位秒（旧实现 Date.now() 13 位毫秒 → 后端按秒解释 ≈ 全量归档）
		setArchiveBefore(before);
		setArchiveCount(null);
		setArchiveCountUnknown(false);
		try {
			// 契约键 snake（generated/adminAuditLogs 的类型即 wire 原样；拦截器幂等直过）——仓内既有风格同款
			// （use-dashboard-summary `adminSecrets({ page_size: 1 })`、users/[id] `getAuditLogs({ user_id, page_size })`）。
			const res = await adminAuditLogs({ end_time: before, page_size: 1 });
			setArchiveCount(extractListResult(res).pagination.total);
		} catch {
			// 取数失败不回退为无确认：Popconfirm 仍显示「无法预估条数」+ 不可逆警告
			setArchiveCountUnknown(true);
		}
	};

	const handleArchiveNow = async () => {
		setArchiveNowLoading(true);
		try {
			// A-215f/ADR-B2-10：before 为 10 位秒，且与影响面条数同口径（同一个 before）
			const res = await adminAuditArchivePost({
				before: archiveBefore ?? dayjs().unix(),
			});
			const count = extractItem(res)?.archivedCount || 0;
			message.success(t('auditRetention.archiveSuccess', { count }));
			fetchArchiveStatus();
		} catch (err) {
			handleApiError(err, t('auditRetention.archiveFailed'));
		} finally {
			setArchiveNowLoading(false);
		}
	};

	useEffect(() => {
		fetchArchiveStatus();
	}, []);

	const handleSave = async (values: any) => {
		try {
			const payload: Types.RetentionPolicyRequest = {
				days: values.days,
				enabled: values.enabled,
				archiveTo: values.archiveTo,
				bucket: values.bucket,
			};
			await saveMut.mutateAsync(payload);
			message.success(t('auditRetention.saveSuccess'));
			setEditing(false);
		} catch (err) {
			handleApiError(err, t('auditRetention.saveFailed'));
		}
	};

	const startEdit = () => {
		if (data) {
			form.setFieldsValue({
				days: data.days ?? 90,
				enabled: data.enabled ?? false,
				archiveTo: data.archiveTo ?? 'minio',
				bucket: data.bucket ?? 'audit-archive',
			});
		}
		setEditing(true);
	};

	if (isLoading) return <Spin className="flex justify-center py-16" />;
	if (error) return <PageError message={t('auditRetention.loadError')} retry={refetch} />;

	// P3-2: 归档状态字段真实化 — 后端 ArchiveStatusResponse 无 status/totalArchived 字段（plan.md ADR-2/3/4）
	// TASK-AB1-27（RC-5 契约收敛）：契约键 camel 直读（拦截器深 camel 化），删 snake/Pascal 双读回退。
	// wire 锚：service-audit/internal/handler/dto/dto.go:642-647（enabled/days/bucket/last_archive）
	const archiveEnabled = archiveStatus?.enabled;
	const rawLastArchive = archiveStatus?.lastArchive;
	let lastArchiveNum: number = NaN;
	if (typeof rawLastArchive === 'number') {
		lastArchiveNum = rawLastArchive;
	} else if (typeof rawLastArchive === 'string' && rawLastArchive !== '') {
		lastArchiveNum = Number(rawLastArchive);
	}
	const EPOCH_ZERO_SENTINEL = -62135596800000; // Go time.Time{} 零值毫秒 = 从未归档
	const neverArchived =
		Number.isNaN(lastArchiveNum) || lastArchiveNum <= 0 || lastArchiveNum === EPOCH_ZERO_SENTINEL;

	return (
		<div>
			<AppPageHeader
				title={t('auditRetention.title')}
				actions={
					<>
						{!editing && (
							<Button icon={<Pencil size="1em" />} onClick={startEdit}>
								{t('auditRetention.edit')}
							</Button>
						)}
					</>
				}
			/>

			{editing ? (
				<Card>
					<Form form={form} layout="vertical" onFinish={handleSave}>
						<Form.Item name="days" label={t('auditRetention.form.retentionDays')} rules={[{ required: true }]}>
							<InputNumber min={1} max={3650} className="w-full md:w-64" />
						</Form.Item>
						{/* W4-03（A-219）：archiveTo 后端 oneof minio/cos/oss/空（dto.go Validate / domain.IsValidArchiveTarget）
						    —— 自由文本输其它值即 400，改 Select 收敛合法集（allowClear = 空合法）。 */}
						<Form.Item name="archiveTo" label={t('auditRetention.form.archiveTarget')}>
							<Select
								allowClear
								placeholder={t('auditRetention.form.archiveTargetPlaceholder')}
								className="w-full md:w-64"
								options={[
									{ value: 'minio', label: 'MinIO' },
									{ value: 'cos', label: 'COS' },
									{ value: 'oss', label: 'OSS' },
								]}
							/>
						</Form.Item>
						<Form.Item name="bucket" label={t('auditRetention.form.archiveBucket')}>
							<Input placeholder={t('auditRetention.form.archiveBucketPlaceholder')} className="w-full md:w-64" />
						</Form.Item>
						<Form.Item name="enabled" label={t('auditRetention.form.autoArchive')} valuePropName="checked">
							<Switch />
						</Form.Item>
						<div className="flex gap-3">
							<Button
								type="primary"
								htmlType="submit"
								icon={<Save size="1em" />}
								loading={saveMut.isPending}
							>
								{t('common.save')}
							</Button>
							<Button icon={<X size="1em" />} onClick={() => setEditing(false)}>
								{t('common.cancel')}
							</Button>
						</div>
					</Form>
				</Card>
			) : (
				<Card>
					<Descriptions column={1} size="middle">
						<Descriptions.Item label={t('auditRetention.desc.retentionDays')}>{data?.days ?? '-'}</Descriptions.Item>
						<Descriptions.Item label={t('auditRetention.desc.autoArchive')}>
							<span className={data?.enabled ? 'text-success-text' : 'text-neutral-600'}>
								{data?.enabled ? t('auditRetention.desc.enabled') : t('auditRetention.desc.disabled')}
							</span>
						</Descriptions.Item>
						<Descriptions.Item label={t('auditRetention.desc.archiveTarget')}>{data?.archiveTo || '-'}</Descriptions.Item>
						<Descriptions.Item label={t('auditRetention.desc.bucket')}>{data?.bucket || '-'}</Descriptions.Item>
						<Descriptions.Item label={t('auditRetention.desc.tenant')}>{data?.tenantId || '-'}</Descriptions.Item>
					</Descriptions>
				</Card>
			)}

			<Card
				title={t('auditRetention.archiveTitle')}
				className="mt-6"
				extra={
					<Popconfirm
						title={t('auditRetention.archiveConfirm.title')}
						description={
							<div className="max-w-64">
								{archiveCountUnknown
									? t('auditRetention.archiveConfirm.countUnknown')
									: archiveCount !== null
										? t('auditRetention.archiveConfirm.count', { count: archiveCount })
										: null}
								<div className="mt-1 text-warning-text">
									{t('auditRetention.archiveConfirm.warning')}
								</div>
							</div>
						}
						onOpenChange={(open) => {
							if (open) prepareArchiveConfirm();
						}}
						onConfirm={handleArchiveNow}
						okText={t('auditRetention.archiveConfirm.ok')}
						cancelText={t('common.cancel')}
						okButtonProps={{ danger: true }}
					>
						<Button icon={<DownloadCloud size="1em" />} loading={archiveNowLoading}>
							{t('auditRetention.archiveNow')}
						</Button>
					</Popconfirm>
				}
			>
				{archiveLoading ? (
					<Spin />
				) : archiveStatus ? (
					<AntRow gutter={24}>
						<Col span={8}>
							<Statistic
								title={t('auditRetention.archiveStatus')}
								value={
									archiveEnabled
										? t('auditRetention.desc.enabled')
										: t('auditRetention.desc.disabled')
								}
								valueStyle={{
									color: archiveEnabled ? 'var(--color-active)' : 'var(--color-info-light)',
								}}
							/>
						</Col>
						<Col span={8}>
							<Statistic
								title={t('auditRetention.lastArchiveTime')}
								value={
									neverArchived
										? t('auditRetention.neverArchived')
										: new Date(lastArchiveNum).toLocaleString(i18n.language)
								}
							/>
						</Col>
						<Col span={8}>
							{/* W4-03（A-219）：days 缺失成态——旧 `?? 0` 把缺数据伪装成「0 天」真值。 */}
							<Statistic
								title={t('auditRetention.desc.retentionDays')}
								value={archiveStatus.days ?? '-'}
							/>
						</Col>
					</AntRow>
				) : (
					<div className="text-neutral-600">{t('auditRetention.noArchiveStatus')}</div>
				)}
			</Card>
		</div>
	);
}

'use client';

import React, { useState } from 'react';
import { Tag, Button, Select, Space, Row, Col, Modal, Input } from 'antd';

import { message } from '@/lib/antd-app';
import { Search } from 'lucide-react';
import { useAlerts, useUpdateAlertStatus, useAssignAlert } from '@/hooks/use-audit-alerts';
import { handleApiError } from '@/lib/error-handler';
import { DataTable, Drawer, PageError } from '@autional/ui/antd';
import type { DataTablePagination } from '@autional/ui/antd';
import { useIsAuditRestricted, AuditStatsOnly, usePageTitle } from '@autional/shared';
import type * as Types from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const SEVERITY_COLORS: Record<string, string> = {
	low: 'blue',
	medium: 'orange',
	high: 'red',
	critical: 'magenta',
};

const STATUS_COLORS: Record<string, string> = {
	open: 'processing',
	acknowledged: 'warning',
	escalated: 'error',
	resolved: 'success',
	dismissed: 'default',
};

// A-205（W1e）：type 原无配色（SEVERITY/STATUS 有映射，TYPE 裸 Tag）→ 补齐
const TYPE_COLORS: Record<string, string> = {
	anomaly: 'volcano',
	threshold: 'gold',
	system: 'cyan',
};

export default function AuditAlertsPage() {
	const { t, i18n } = useTranslation();
	// A-205（W1e）：tab 恒"Autional 管理控制台" → 挂载页面标题
	usePageTitle(t('auditAlerts.title'));

	const SEVERITY_OPTIONS = [
		{ label: t('auditAlerts.severity.low'), value: 'low' },
		{ label: t('auditAlerts.severity.medium'), value: 'medium' },
		{ label: t('auditAlerts.severity.high'), value: 'high' },
		{ label: t('auditAlerts.severity.critical'), value: 'critical' },
	];

	const STATUS_OPTIONS = [
		{ label: t('auditAlerts.status.open'), value: 'open' },
		{ label: t('auditAlerts.status.acknowledged'), value: 'acknowledged' },
		{ label: t('auditAlerts.status.escalated'), value: 'escalated' },
		{ label: t('auditAlerts.status.resolved'), value: 'resolved' },
		{ label: t('auditAlerts.status.dismissed'), value: 'dismissed' },
	];

	const TYPE_OPTIONS = [
		{ label: t('auditAlerts.type.anomaly'), value: 'anomaly' },
		{ label: t('auditAlerts.type.threshold'), value: 'threshold' },
		{ label: t('auditAlerts.type.system'), value: 'system' },
	];

	const [severity, setSeverity] = useState<string | undefined>();
	const [status, setStatus] = useState<string | undefined>();
	const [type, setType] = useState<string | undefined>();
	const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });
	const [drawerVisible, setDrawerVisible] = useState(false);
	const [currentRecord, setCurrentRecord] = useState<any>(null);

	const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
	const [assigneeName, setAssigneeName] = useState('');

	const [statusTarget, setStatusTarget] = useState<{
		id: string;
		newStatus: string;
		label: string;
	} | null>(null);
	const [statusComment, setStatusComment] = useState('');

	const params: Record<string, unknown> = { ...pagination };
	if (severity) params.severity = severity;
	if (status) params.status = status;
	if (type) params.type = type;

	const isRestricted = useIsAuditRestricted();
	const { data, isLoading, refetch, error } = useAlerts(params);
	const statusMut = useUpdateAlertStatus();
	const assignMut = useAssignAlert();

	const handleStatusAction = (id: string, newStatus: string, label: string) => {
		setStatusTarget({ id, newStatus, label });
		setStatusComment('');
	};

	const handleStatusConfirm = async () => {
		if (!statusTarget) return;
		try {
			const payload: Types.UpdateAlertStatusRequest = { status: statusTarget.newStatus };
			if (statusComment) (payload as unknown as Record<string, string>).comment = statusComment;
			await statusMut.mutateAsync({ id: statusTarget.id, data: payload });
			message.success(t('auditAlerts.actionDone', { action: statusTarget.label }));
			setStatusTarget(null);
			setStatusComment('');
			refetch();
		} catch (err) {
			handleApiError(err, t('auditAlerts.actionFailed', { action: statusTarget.label }));
		}
	};

	const handleAssignClick = (id: string) => {
		setAssignTargetId(id);
		setAssigneeName('');
	};

	const handleAssignConfirm = async () => {
		if (!assignTargetId) return;
		// A-204（W1e）：空/纯空白输入不再静默 return —— 显式拦截提示（确定按钮同步禁用）
		if (!assigneeName.trim()) {
			message.warning(t('auditAlerts.assigneeRequired'));
			return;
		}
		try {
			await assignMut.mutateAsync({ id: assignTargetId, data: { assignee: assigneeName.trim() } });
			message.success(t('auditAlerts.assigned'));
			setAssignTargetId(null);
			setAssigneeName('');
			refetch();
		} catch (err) {
			handleApiError(err, t('auditAlerts.assignFailed'));
		}
	};

	const openDetail = (record: any) => {
		setCurrentRecord(record);
		setDrawerVisible(true);
	};

	const columns = [
		{
			title: t('auditAlerts.column.severity'),
			dataIndex: 'severity',
			key: 'severity',
			width: 100,
			// A-203（W1e）：英文原值 → 词表中文（未收录值回退原值）
			render: (v: string) => (
				<Tag color={SEVERITY_COLORS[v] || 'default'}>
					{t(`auditAlerts.severity.${v}`, { defaultValue: v })}
				</Tag>
			),
		},
		{
			title: t('auditAlerts.column.type'),
			dataIndex: 'type',
			key: 'type',
			width: 100,
			render: (v: string) => (
				<Tag color={TYPE_COLORS[v] || 'default'}>
					{t(`auditAlerts.type.${v}`, { defaultValue: v })}
				</Tag>
			),
		},
		{ title: t('auditAlerts.column.title'), dataIndex: 'title', key: 'title', ellipsis: true },
		{
			title: t('auditAlerts.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 130,
			render: (v: string) => (
				<Tag color={STATUS_COLORS[v] || 'default'}>
					{t(`auditAlerts.status.${v}`, { defaultValue: v })}
				</Tag>
			),
		},
		{ title: t('auditAlerts.column.assignee'), dataIndex: 'assignee', key: 'assignee', width: 130 },
		{
			title: t('auditAlerts.column.created'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 170,
			// A-203（W1e）：RFC3339 原样 → 本地化时间
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('auditAlerts.column.action'),
			key: 'action_col',
			width: 300,
			render: (_: any, record: any) => (
				<Space size="small" wrap>
					<Button type="link" size="small" onClick={() => openDetail(record)}>
						{t('auditAlerts.actions.detail')}
					</Button>
					<Button type="link" size="small" onClick={() => handleAssignClick(record.id)}>
						{t('auditAlerts.actions.assign')}
					</Button>
					{record.status === 'open' && (
						<Button
							type="link"
							size="small"
							onClick={() => handleStatusAction(record.id, 'acknowledged', t('auditAlerts.actions.ack'))}
						>
							{t('auditAlerts.actions.ack')}
						</Button>
					)}
					{record.status === 'acknowledged' && (
						<Button
							type="link"
							size="small"
							onClick={() => handleStatusAction(record.id, 'escalated', t('auditAlerts.actions.escalate'))}
						>
							{t('auditAlerts.actions.escalate')}
						</Button>
					)}
					{(record.status === 'open' || record.status === 'acknowledged') && (
						<Button
							type="link"
							size="small"
							onClick={() => handleStatusAction(record.id, 'resolved', t('auditAlerts.actions.resolve'))}
						>
							{t('auditAlerts.actions.resolve')}
						</Button>
					)}
					{record.status !== 'dismissed' && (
						<Button
							type="link"
							danger
							size="small"
							onClick={() => handleStatusAction(record.id, 'dismissed', t('auditAlerts.actions.dismiss'))}
						>
							{t('auditAlerts.actions.dismiss')}
						</Button>
					)}
				</Space>
			),
		},
	];

	if (isRestricted) {
		return <AuditStatsOnly title={t('auditAlerts.title')} />;
	}

	return (
		<div>
			<AppPageHeader title={t('auditAlerts.title')} />

			{error && <PageError message={t('auditAlerts.loadError')} retry={refetch} className="mb-4" />}
			<div className="mb-4">
				<Row gutter={16}>
					<Col xs={24} sm={8} md={6}>
						<Select
							placeholder={t('auditAlerts.filter.severity')}
							allowClear
							className="w-full"
							options={SEVERITY_OPTIONS}
							value={severity}
							onChange={setSeverity}
						/>
					</Col>
					<Col xs={24} sm={8} md={6}>
						<Select
							placeholder={t('auditAlerts.filter.status')}
							allowClear
							className="w-full"
							options={STATUS_OPTIONS}
							value={status}
							onChange={setStatus}
						/>
					</Col>
					<Col xs={24} sm={8} md={6}>
						<Select
							placeholder={t('auditAlerts.filter.type')}
							allowClear
							className="w-full"
							options={TYPE_OPTIONS}
							value={type}
							onChange={setType}
						/>
					</Col>
					<Col xs={24} sm={8} md={6}>
						<Button type="primary" icon={<Search size="1em" />} onClick={() => refetch()}>
							{t('auditAlerts.search')}
						</Button>
					</Col>
				</Row>
			</div>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data?.items || []}
				loading={isLoading}
				scroll={{ x: 960 }}
				pagination={{
					current: pagination.page,
					pageSize: pagination.pageSize,
					showSizeChanger: true,
					pageSizeOptions: [20, 50, 100],
					total: data?.pagination?.total || 0,
				}}
				onChange={(pag: DataTablePagination) => {
					setPagination({ page: pag.current || 1, pageSize: pag.pageSize || 20 });
				}}
			/>

			<Drawer
				title={t('auditAlerts.detailTitle')}
				size="md"
				open={drawerVisible}
				onClose={() => setDrawerVisible(false)}
				className="!w-full sm:!w-[480px]"
			>
				{currentRecord ? (
					<div className="space-y-4">
						<Row>
							<Col span={8} className="text-neutral-600">
								ID
							</Col>
							<Col span={16}>{currentRecord.id}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.column.severity')}
							</Col>
							<Col span={16}>
								<Tag color={SEVERITY_COLORS[currentRecord.severity] || 'default'}>
									{t(`auditAlerts.severity.${currentRecord.severity}`, {
										defaultValue: currentRecord.severity,
									})}
								</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.column.type')}
							</Col>
							<Col span={16}>
								<Tag color={TYPE_COLORS[currentRecord.type] || 'default'}>
									{t(`auditAlerts.type.${currentRecord.type}`, { defaultValue: currentRecord.type })}
								</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.column.title')}
							</Col>
							<Col span={16}>{currentRecord.title}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.column.status')}
							</Col>
							<Col span={16}>
								<Tag color={STATUS_COLORS[currentRecord.status] || 'default'}>
									{t(`auditAlerts.status.${currentRecord.status}`, {
										defaultValue: currentRecord.status,
									})}
								</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.column.assignee')}
							</Col>
							<Col span={16}>{currentRecord.assignee || '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.source')}
							</Col>
							<Col span={16}>{currentRecord.source || '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.message')}
							</Col>
							<Col span={16}>{currentRecord.message || '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('auditAlerts.column.created')}
							</Col>
							<Col span={16}>
								{currentRecord.createdAt
									? new Date(currentRecord.createdAt).toLocaleString(i18n.language)
									: '-'}
							</Col>
						</Row>
						{currentRecord.acknowledgedAt && (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('auditAlerts.acknowledgedAt')}
								</Col>
								<Col span={16}>
									{new Date(currentRecord.acknowledgedAt).toLocaleString(i18n.language)}
								</Col>
							</Row>
						)}
						{currentRecord.resolvedAt && (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('auditAlerts.resolvedAt')}
								</Col>
								<Col span={16}>
									{new Date(currentRecord.resolvedAt).toLocaleString(i18n.language)}{' '}
									{t('auditAlerts.resolvedBy', { user: currentRecord.resolvedBy })}
								</Col>
							</Row>
						)}
						{currentRecord.escalatedAt && (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('auditAlerts.escalatedAt')}
								</Col>
								<Col span={16}>
									{new Date(currentRecord.escalatedAt).toLocaleString(i18n.language)}
								</Col>
							</Row>
						)}
						<Row className="pt-4">
							<Space wrap>
								<Button
									onClick={() => handleAssignClick(currentRecord.id)}
									loading={assignMut.isPending}
								>
									{t('auditAlerts.actions.assign')}
								</Button>
								{currentRecord.status === 'open' && (
									<Button
										type="primary"
										onClick={() =>
											handleStatusAction(currentRecord.id, 'acknowledged', t('auditAlerts.actions.ack'))
										}
									>
										{t('auditAlerts.actions.ack')}
									</Button>
								)}
								{currentRecord.status === 'acknowledged' && (
									<Button
										type="primary"
										onClick={() => handleStatusAction(currentRecord.id, 'escalated', t('auditAlerts.actions.escalate'))}
									>
										{t('auditAlerts.actions.escalate')}
									</Button>
								)}
								{(currentRecord.status === 'open' || currentRecord.status === 'acknowledged') && (
									<Button
										onClick={() => handleStatusAction(currentRecord.id, 'resolved', t('auditAlerts.actions.resolve'))}
									>
										{t('auditAlerts.actions.resolve')}
									</Button>
								)}
								{currentRecord.status !== 'dismissed' && (
									<Button
										danger
										onClick={() => handleStatusAction(currentRecord.id, 'dismissed', t('auditAlerts.actions.dismiss'))}
									>
										{t('auditAlerts.actions.dismiss')}
									</Button>
								)}
							</Space>
						</Row>
					</div>
				) : null}
			</Drawer>

			<Modal
				title={t('auditAlerts.assignTitle')}
				open={!!assignTargetId}
				onOk={handleAssignConfirm}
				onCancel={() => {
					setAssignTargetId(null);
					setAssigneeName('');
				}}
				okButtonProps={{ disabled: !assigneeName.trim() }}
				confirmLoading={assignMut.isPending}
				className="w-full max-w-[560px]"
			>
				<div className="mb-2 text-sm text-neutral-600">{t('auditAlerts.assigneeHint')}</div>
				<Input
					placeholder={t('auditAlerts.assigneePlaceholder')}
					value={assigneeName}
					onChange={(e) => setAssigneeName(e.target.value)}
					onPressEnter={handleAssignConfirm}
				/>
			</Modal>

			<Modal
				title={t('auditAlerts.statusModalTitle', { action: statusTarget?.label || '' })}
				open={!!statusTarget}
				onOk={handleStatusConfirm}
				onCancel={() => {
					setStatusTarget(null);
					setStatusComment('');
				}}
				confirmLoading={statusMut.isPending}
				className="w-full max-w-[560px]"
			>
				<div className="mb-2 text-sm text-neutral-600">{t('auditAlerts.commentOptional')}</div>
				<Input.TextArea
					rows={3}
					placeholder={t('auditAlerts.commentPlaceholder')}
					value={statusComment}
					onChange={(e) => setStatusComment(e.target.value)}
				/>
			</Modal>
		</div>
	);
}

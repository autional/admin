'use client';
// （A-195/A-199 起 hashchain 与 export download 均走 generated 函数，零 raw API_PATHS 引用）

import React, { useState, useEffect } from 'react';
import { Tag, Button, Input, Space, Select, Card, Row, Col, Modal, Collapse, Typography, Spin, Empty } from 'antd';
import dayjs from 'dayjs';

import { message, modal } from '@/lib/antd-app';
import {
	Download,
	ExternalLink,
	Eye,
	FileLock,
	Link2,
	Search,
	ShieldCheck,
} from 'lucide-react';
import { useAuditLogs, useVerifyAuditChain, useExportAuditLogs } from '@/hooks/use-audit-logs';
import { handleApiError } from '@/lib/error-handler';
import { DataTable, DateRangeFilter, Drawer, PageError } from '@autional/ui/antd';
import type { DataTablePagination, DateRangeValue } from '@autional/ui/antd';
import { extractItem, extractList, useCurrentTenantId, usePageTitle } from '@autional/shared';
import { useOwnerDisplay } from '@/hooks/use-owner-display';
import {
	adminAuditExportDownloadByExport,
	adminAuditExportJobs,
	adminAuditHashchainByHashchain,
	adminAuditMerkleProof,
} from '@autional/shared/generated/api';
import { useTranslation } from 'react-i18next';
import { useIsAuditRestricted, AuditStatsOnly } from '@autional/shared';
import { AppPageHeader } from '@autional/ui';

const { Text, Paragraph } = Typography;

export default function AuditLogsPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const isRestricted = useIsAuditRestricted();
	// A-200（W1e）：页面标题 + 操作人 ULID → 显示名解析（未命中回退原值）
	usePageTitle(t('audit.title'));
	const { resolve: resolveOwner } = useOwnerDisplay();

	const ACTION_OPTIONS = [
		{ label: t('audit.action.create'), value: 'create' },
		{ label: t('audit.action.update'), value: 'update' },
		{ label: t('audit.action.delete'), value: 'delete' },
		{ label: t('audit.action.login'), value: 'login' },
		{ label: t('audit.action.logout'), value: 'logout' },
		{ label: t('audit.action.export'), value: 'export' },
		{ label: t('audit.action.other'), value: 'other' },
	];

	const TARGET_TYPE_OPTIONS = [
		{ label: t('audit.target.user'), value: 'user' },
		{ label: t('audit.target.role'), value: 'role' },
		{ label: t('audit.target.permission'), value: 'permission' },
		{ label: t('audit.target.tenant'), value: 'tenant' },
		{ label: t('audit.target.application'), value: 'application' },
		{ label: t('audit.target.session'), value: 'session' },
		{ label: t('audit.target.other'), value: 'other' },
	];

	const STATUS_OPTIONS = [
		{ label: t('audit.status.success'), value: 0 },
		{ label: t('audit.status.failure'), value: 1 },
	];

	const LEVEL_OPTIONS = [
		{ label: t('audit.level.info'), value: 'info' },
		{ label: t('audit.level.warning'), value: 'warning' },
		{ label: t('audit.level.error'), value: 'error' },
		{ label: t('audit.level.critical'), value: 'critical' },
	];
	const [keyword, setKeyword] = useState('');
	const [action, setAction] = useState<string | undefined>();
	const [targetType, setTargetType] = useState<string | undefined>();
	const [actor, setActor] = useState('');
	const [status, setStatus] = useState<number | undefined>();
	const [level, setLevel] = useState<string | undefined>();
	const [module, setModule] = useState<string | undefined>();
	const [dateRange, setDateRange] = useState<DateRangeValue>(null);
	const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });

	const [drawerVisible, setDrawerVisible] = useState(false);
	const [currentRecord, setCurrentRecord] = useState<any>(null);

	const [exportJobs, setExportJobs] = useState<any[]>([]);
	const [exportLoading, setExportLoading] = useState(false);

	const [hashChainVisible, setHashChainVisible] = useState(false);
	// A-195：后端 HashChainResponse 为聚合对象（dto.go:181-190），非条目数组
	const [hashChainData, setHashChainData] = useState<any | null>(null);
	const [hashChainLoading, setHashChainLoading] = useState(false);
	// W2 通则①：错误态与空态分离（失败 ≠「暂无数据」）
	const [hashChainError, setHashChainError] = useState(false);

	const [selectedEntryId, setSelectedEntryId] = useState<string>('');
	const [merkleVisible, setMerkleVisible] = useState(false);
	const [merkleData, setMerkleData] = useState<any>(null);
	const [merkleLoading, setMerkleLoading] = useState(false);

	// 断链报告弹窗（根因修复 2026-08-13: 后端链损坏返回 200 + {valid:false, broken_at}，
	// 前端展示断链位置而非报 500）
	const [verifyReport, setVerifyReport] = useState<any>(null);

	const params: Record<string, unknown> = { ...pagination };
	if (keyword) params.keyword = keyword;
	if (action) params.action = action;
	// RC-5（TASK-AB1-27）：请求侧 camel 书面写（拦截器 snake 化上 wire；
	// wire 锚：service-audit dto.go:86-99 form user_id/target_type/start_time/end_time）
	if (targetType) params.targetType = targetType;
	if (actor) params.userId = actor;
	if (status !== undefined) params.status = status;
	if (level) params.level = level;
	if (module) params.module = module;
	if (dateRange) {
		// A-194（ADR-B2-10）：wire 契约为 epoch 秒 int64（service-audit dto.go:99-100 form start_time/end_time）；
		// DateRangeFilter 产出格式化串（format='YYYY-MM-DD HH:mm:ss'）直发 → 后端 int64 解析 400。
		// 日粒度选择取当日 endOf('day')；精确时刻原样 unix()。禁发格式化串 / 13 位毫秒。
		params.startTime = dayjs(dateRange[0]).unix();
		const endStr = dateRange[1];
		params.endTime = /^\d{4}-\d{2}-\d{2}$/.test(endStr)
			? dayjs(endStr).endOf('day').unix()
			: dayjs(endStr).unix();
	}

	const { data, isLoading, refetch, error } = useAuditLogs(params);
	const verifyMutation = useVerifyAuditChain();
	const exportMutation = useExportAuditLogs();

	const handleVerifyChain = async () => {
		try {
			// 验证链需要 start_date（后端必填）。优先用当前筛选的日期范围，
			// 未筛选时默认校验最近 30 天（覆盖近期审计记录完整性）。
			let startDate: string;
			let endDate: string | undefined;
			if (dateRange && dateRange[0]) {
				startDate = dateRange[0];
				endDate = dateRange[1] || undefined;
			} else {
				const end = new Date();
				const start = new Date(end.getTime() - 30 * 86400000);
				startDate = start.toISOString().slice(0, 10);
				endDate = end.toISOString().slice(0, 10);
			}
			// camel 书面写（拦截器 snake 化；wire 锚：dto.go:182-189 json start_date/end_date）
			const res = await verifyMutation.mutateAsync({ startDate, ...(endDate ? { endDate } : {}) });
			if (res?.valid) {
				message.success(t('audit.toast.verifyPassed'));
			} else {
				// 根因修复 (2026-08-13): 链损坏是验证结果（200 + valid:false + broken_at），
				// 弹窗展示断链报告（broken_at 位置 + 详情），不再只给泛化 warning。
				setVerifyReport(res || { valid: false });
			}
		} catch (err) {
			handleApiError(err, t('audit.toast.verifyError'));
		}
	};

	const handleExport = async (format: string) => {
		try {
			await exportMutation.mutateAsync({ format, ...params });
			message.success(t('audit.toast.exportSubmitted'));
		} catch (err) {
			handleApiError(err, t('audit.toast.exportFailed'));
		}
	};

	const fetchExportJobs = async () => {
		setExportLoading(true);
		try {
			const res = await adminAuditExportJobs();
			// 根因修复 (2026-08-13): generated 函数已返回解包后的 payload，
			// 再取 .data 得到 undefined → extractList → []（误报空态）。改为 extractList(res)。
			setExportJobs(extractList(res));
		} catch (err) {
			handleApiError(err, t('audit.toast.exportJobsError'));
		} finally {
			setExportLoading(false);
		}
	};

	const handleDownload = async (jobId: string) => {
		try {
			// A-199：路径参数由 generated 收口（旧实现 handleDownload(record.id) → id 键不存在 →
			// .../export/undefined/download 404）。响应 { data: { download_url } } 经拦截器解包 camel 化。
			const res = await adminAuditExportDownloadByExport(jobId);
			const url = extractItem(res)?.downloadUrl;
			if (url) {
				window.open(url, '_blank');
				message.success(t('audit.toast.downloadStart'));
			} else {
				message.warning(t('audit.toast.downloadUnavailable'));
			}
		} catch (err) {
			handleApiError(err, t('audit.toast.downloadFailed'));
		}
	};

	// A-195/A-196：链状态单一取数点（弹窗「查看」与「租户链状态」卡共用）。
	// 会话租户替代硬编码 'default'（路径参数 wire 锚：generated api.ts hashchain/${tenantId}）；
	// 响应为聚合对象（含 isValid/logCount/verifiedAt 等；无 entries 明细字段）——旧实现取
	// ?.entries || [] 恒空态（弹窗永远「暂无」）。
	const fetchHashChain = async () => {
		setHashChainLoading(true);
		setHashChainError(false);
		try {
			const res = await adminAuditHashchainByHashchain(tenantId);
			setHashChainData(extractItem(res));
		} catch (err) {
			handleApiError(err, t('audit.toast.hashChainError'));
			setHashChainData(null);
			setHashChainError(true);
		} finally {
			setHashChainLoading(false);
		}
	};

	const handleViewHashChain = () => {
		setHashChainVisible(true);
		fetchHashChain();
	};

	const handleVerifyProof = async () => {
		if (!selectedEntryId) {
			message.warning(t('audit.toast.selectEntryHint'));
			return;
		}
		setMerkleVisible(true);
		setMerkleLoading(true);
		try {
		// camel 书面写（拦截器 snake 化）；generated 该端点入参类型仍为 snake 字面量（签名未收编）故收窄直传
		const res = await adminAuditMerkleProof({ entryId: selectedEntryId, tenantId } as unknown as {
			tenant_id: string;
			entry_id: string;
		});
		setMerkleData(extractItem(res));
		} catch (err) {
			handleApiError(err, t('audit.toast.merkleProofError'));
		} finally {
			setMerkleLoading(false);
		}
	};

	useEffect(() => {
		fetchExportJobs();
	}, []);

	// A-196：链状态卡挂载即拉（旧「最近验证」初载不拉恒空；且调平台面 /admin/audit/verifications
	// 实测跨租户 5702 条泄露——改走本租户 hashchain，平台面端点从此零请求）。
	useEffect(() => {
		if (isRestricted || !tenantId) return;
		fetchHashChain();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId, isRestricted]);

	const openDetail = (record: any) => {
		setCurrentRecord(record);
		setDrawerVisible(true);
	};

	// 审计库双管道（A-197）：事件管道 status∈{0=成功,1=失败}；请求管道 status 为 HTTP 码（2xx=成功，≥400=失败）。
	// 与后端 status_class 口径逐字一致（service-audit statusClassOr）；其余数值（如 3xx）原样展示，不猜语义。
	const renderStatusTag = (v: unknown) => {
		if (v === 0 || (typeof v === 'number' && v >= 200 && v < 300)) {
			return <Tag color="success">{t('audit.status.success')}</Tag>;
		}
		if (v === 1 || (typeof v === 'number' && v >= 400)) {
			return <Tag color="error">{t('audit.status.failure')}</Tag>;
		}
		return <Tag>{String(v)}</Tag>;
	};

	// A-199：导出任务状态映射（wire 值 pending/processing/completed/failed 全集 + 未知值原样兜底）
	const EXPORT_JOB_STATUS: Record<string, { color: string; label: string }> = {
		pending: { color: 'default', label: t('audit.exportJobs.status.pending') },
		processing: { color: 'processing', label: t('audit.exportJobs.status.processing') },
		completed: { color: 'success', label: t('audit.exportJobs.status.completed') },
		failed: { color: 'error', label: t('audit.exportJobs.status.failed') },
	};

	const columns = [
		{ title: t('audit.column.sequence'), dataIndex: 'sequence', key: 'sequence', width: 70 },
		{
			title: t('audit.column.timestamp'),
			dataIndex: 'timestamp',
			key: 'timestamp',
			width: 170,
			render: (v: number) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('audit.column.operator'),
			dataIndex: 'operatorId',
			key: 'operatorId',
			width: 120,
			// A-200（W1e）：裸 ULID → 成员显示名（未命中回退原值）
			render: (v: string) => resolveOwner(v),
		},
		{
			title: t('audit.column.action'),
			dataIndex: 'action',
			key: 'action',
			width: 100,
			render: (v: string) => <Tag>{v}</Tag>,
		},
		{
			title: t('audit.column.level'),
			dataIndex: 'level',
			key: 'level',
			width: 80,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					info: 'blue',
					warning: 'orange',
					error: 'red',
					critical: 'red',
				};
				return v ? <Tag color={colorMap[v] || 'default'}>{v}</Tag> : null;
			},
		},
		{ title: t('audit.column.module'), dataIndex: 'module', key: 'module', width: 100 },
		{ title: t('audit.column.targetType'), dataIndex: 'targetType', key: 'targetType', width: 100 },
		{
			title: t('audit.column.targetId'),
			dataIndex: 'targetId',
			key: 'targetId',
			ellipsis: true,
			width: 140,
		},
		{ title: t('audit.column.description'), dataIndex: 'message', key: 'message', ellipsis: true },
		{
			title: t('audit.column.result'),
			dataIndex: 'status',
			key: 'status',
			width: 80,
			render: (v: number) => renderStatusTag(v),
		},
		{ title: t('audit.column.ip'), dataIndex: 'ip', key: 'ip', width: 130 },
		{
			title: t('audit.column.duration'),
			dataIndex: 'duration',
			key: 'duration',
			width: 80,
			// A-200（W1e）：0ms 为「未记录耗时」哨兵（后端零值）→ 回落 '-'
			render: (v: number) => (v ? `${v}ms` : '-'),
		},
		{
			title: t('common.actions'),
			key: 'actionCol',
			width: 90,
			render: (_: any, record: any) => (
				<Button type="link" icon={<Eye size="1em" />} onClick={() => openDetail(record)}>
					{t('common.viewDetail')}
				</Button>
			),
		},
	];

	if (isRestricted) {
		return <AuditStatsOnly title={t('audit.title')} />;
	}

	return (
		<div>
			<AppPageHeader
				title={t('audit.title')}
				actions={
					<>
						<Space>
							<Button
								icon={<ShieldCheck size="1em" />}
								onClick={handleVerifyChain}
								loading={verifyMutation.isPending}
							>
								{t('audit.action.verifyChain')}
							</Button>
							<Button
								icon={<ExternalLink size="1em" />}
								onClick={() => handleExport('csv')}
								loading={exportMutation.isPending}
							>
								{t('audit.action.exportCSV')}
							</Button>
						</Space>
					</>
				}
			/>

			{error && <PageError message={t('audit.loadError')} retry={refetch} className="mb-4" />}
			<Card className="mb-4" size="small">
				<Row gutter={16} className="items-center">
					<Col xs={24} sm={12} md={6} lg={4}>
						<DateRangeFilter
							showTime
							format="YYYY-MM-DD HH:mm:ss"
							className="w-full"
							placeholder={[t('audit.filter.startTime'), t('audit.filter.endTime')]}
							value={dateRange}
							onChange={setDateRange}
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Select
							placeholder={t('audit.filter.action')}
							allowClear
							className="w-full"
							options={ACTION_OPTIONS}
							value={action}
							onChange={setAction}
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Select
							placeholder={t('audit.filter.targetType')}
							allowClear
							className="w-full"
							options={TARGET_TYPE_OPTIONS}
							value={targetType}
							onChange={setTargetType}
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Select
							placeholder={t('audit.filter.level')}
							allowClear
							className="w-full"
							options={LEVEL_OPTIONS}
							value={level}
							onChange={setLevel}
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Input
							placeholder={t('audit.filter.module')}
							value={module}
							onChange={(e) => setModule(e.target.value)}
							allowClear
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Input
							placeholder={t('audit.filter.operator')}
							value={actor}
							onChange={(e) => setActor(e.target.value)}
							allowClear
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Select
							placeholder={t('audit.filter.result')}
							allowClear
							className="w-full"
							options={STATUS_OPTIONS}
							value={status}
							onChange={setStatus}
						/>
					</Col>
					<Col xs={24} sm={12} md={6} lg={4}>
						<Input.Search
							placeholder={t('audit.filter.keyword')}
							allowClear
							value={keyword}
							onChange={(e) => setKeyword(e.target.value)}
							onSearch={() => refetch()}
						/>
					</Col>
				</Row>
				<div className="mt-3 text-right">
					<Button type="primary" icon={<Search size="1em" />} onClick={() => refetch()}>
						{t('audit.action.search')}
					</Button>
				</div>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data?.items || []}
				loading={isLoading}
				pagination={{
					current: pagination.page,
					pageSize: pagination.pageSize,
					showSizeChanger: true,
					pageSizeOptions: [20, 50, 100],
					total: data?.pagination?.total || 0,
				}}
				scroll={{ x: 1400 }}
				locale={{ emptyText: <Empty description={t('audit.emptyText')} /> }}
				onChange={(pag: DataTablePagination) => {
					setPagination({ page: pag.current || 1, pageSize: pag.pageSize || 20 });
				}}
			/>

			<Drawer
				title={t('audit.detail.title')}
				size="md"
				open={drawerVisible}
				onClose={() => setDrawerVisible(false)}
				className="!w-full sm:!w-[480px]"
			>
				{currentRecord ? (
					<div className="space-y-4">
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.logId')}
							</Col>
							<Col span={16}>{currentRecord.id}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.timestamp')}
							</Col>
							<Col span={16}>
								{currentRecord.timestamp ? new Date(currentRecord.timestamp).toLocaleString() : '-'}
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.operator')}
							</Col>
							<Col span={16}>{resolveOwner(currentRecord.operatorId)}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.operatorType')}
							</Col>
							<Col span={16}>{currentRecord.operatorType ?? '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.action')}
							</Col>
							<Col span={16}>
								<Tag>{currentRecord.action}</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.level')}
							</Col>
							<Col span={16}>{currentRecord.level ?? '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.module')}
							</Col>
							<Col span={16}>{currentRecord.module ?? '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.targetType')}
							</Col>
							<Col span={16}>{currentRecord.targetType}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.targetId')}
							</Col>
							<Col span={16} className="break-all">
								{currentRecord.targetId}
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.description')}
							</Col>
							<Col span={16}>{currentRecord.message}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.result')}
							</Col>
							<Col span={16}>{renderStatusTag(currentRecord.status)}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.ipAddress')}
							</Col>
							<Col span={16}>{currentRecord.ip}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.duration')}
							</Col>
							<Col span={16}>
								{currentRecord.duration ? `${currentRecord.duration}ms` : '-'}
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.sequence')}
							</Col>
							<Col span={16}>{currentRecord.sequence ?? '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.requestId')}
							</Col>
							<Col span={16} className="break-all">
								{currentRecord.requestId ?? '-'}
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.detail.tenantId')}
							</Col>
							<Col span={16} className="break-all">
								{currentRecord.tenantId ?? '-'}
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.exportJobs.userAgent')}
							</Col>
							<Col span={16} className="break-all">
								{currentRecord.userAgent ?? '-'}
							</Col>
						</Row>
						{currentRecord.metadata && (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('audit.detail.metadata')}
								</Col>
								<Col span={16}>
									<pre className="bg-neutral-50 p-3 rounded-xs text-xs overflow-auto">
										{JSON.stringify(currentRecord.metadata, null, 2)}
									</pre>
								</Col>
							</Row>
						)}
					</div>
				) : null}
			</Drawer>

			<Collapse
				className="mt-6"
				items={[
					{
						key: 'export',
						label: (
							<span>
								<ExternalLink size="1em" className="mr-2" />
								{t('audit.exportJobs.title')}
							</span>
						),
						children: (
							<div>
								<div className="flex justify-between mb-3">
									<span className="text-neutral-600">
										{t('audit.exportJobs.subtitle')}
									</span>
									<Button size="small" onClick={fetchExportJobs} loading={exportLoading}>
										{t('common.refresh')}
									</Button>
								</div>
								<DataTable
									rowKey="jobId"
									dataSource={exportJobs}
									loading={exportLoading}
									pagination={false}
									size="small"
									scroll={{ x: 800 }}
									columns={[
										{ title: t('audit.exportJobs.jobId'), dataIndex: 'jobId', key: 'jobId', width: 220, ellipsis: true },
										{ title: t('audit.exportJobs.contentType'), dataIndex: 'contentType', key: 'contentType', width: 110 },
										{
											title: t('common.status'),
											dataIndex: 'status',
											key: 'status',
											width: 100,
											render: (v: string) => {
												const s = EXPORT_JOB_STATUS[v];
												return <Tag color={s?.color ?? 'default'}>{s?.label ?? v ?? '-'}</Tag>;
											},
										},
										{ title: t('audit.exportJobs.records'), dataIndex: 'recordCount', key: 'recordCount', width: 80 },
										{
											title: t('audit.exportJobs.generatedAt'),
											dataIndex: 'generatedAt',
											key: 'generatedAt',
											width: 170,
											render: (v: number) => (v ? new Date(v).toLocaleString() : '-'),
										},
										{
											title: t('common.actions'),
											key: 'action',
											width: 100,
											render: (_: any, record: any) =>
												record.status === 'completed' ? (
													<Button
														type="link"
														size="small"
														icon={<Download size="1em" />}
														onClick={() => handleDownload(record.jobId)}
													>
														{t('audit.exportJobs.download')}
													</Button>
												) : null,
										},
									]}
									locale={{ emptyText: <Empty description={t('audit.exportJobs.empty')} /> }}
								/>
							</div>
						),
					},
					{
						key: 'verification',
						label: (
							<span>
								<FileLock size="1em" className="mr-2" />
								{t('audit.verification.title')}
							</span>
						),
						children: (
							<Row gutter={[24, 24]}>
								<Col xs={24} md={8}>
									<Card
										title={t('audit.hashChain.title')}
										size="small"
										extra={
											<Button
												type="primary"
												size="small"
												icon={<Link2 size="1em" />}
												onClick={handleViewHashChain}
											>
												{t('audit.hashChain.view')}
											</Button>
										}
									>
										<p className="text-neutral-600 text-sm mb-3">
											{t('audit.hashChain.hint')}
										</p>
									</Card>
								</Col>
								<Col xs={24} md={8}>
									<Card
										title={t('audit.merkle.title')}
										size="small"
										extra={
											<Button
												type="primary"
												size="small"
												icon={<ShieldCheck size="1em" />}
												onClick={handleVerifyProof}
											>
												{t('audit.merkle.verify')}
											</Button>
										}
									>
										<Space direction="vertical" className="w-full">
											<Input
												placeholder={t('audit.merkle.entryId')}
												value={selectedEntryId}
												onChange={(e) => setSelectedEntryId(e.target.value)}
												size="small"
											/>
											<span className="text-neutral-600 text-xs">
												{t('audit.merkle.hint')}
											</span>
										</Space>
									</Card>
								</Col>
								<Col xs={24} md={8}>
									{/* A-196：租户链状态卡（旧「最近验证」调平台面 /admin/audit/verifications，
									    实测 5702 条=5702 个不同租户跨租户泄露）→ 改走本租户 hashchain 聚合；
									    失败 → 错误态（非空卡，W2 通则①）。 */}
									<Card
										title={t('audit.merkle.tenantChain')}
										size="small"
										extra={
											<Button
												size="small"
												onClick={fetchHashChain}
												loading={hashChainLoading}
											>
												{t('common.refresh')}
											</Button>
										}
									>
										{hashChainLoading ? (
											<Spin />
										) : hashChainError ? (
											<PageError
												message={t('audit.toast.hashChainError')}
												retry={fetchHashChain}
											/>
										) : hashChainData ? (
											<Space direction="vertical" className="w-full" size={4}>
												<Row>
													<Col span={12} className="text-neutral-600">
														{t('audit.hashChain.chainStatus')}
													</Col>
													<Col span={12}>
														<Tag color={hashChainData.isValid ? 'success' : 'error'}>
															{hashChainData.isValid
																? t('audit.hashChain.valid')
																: t('audit.hashChain.broken')}
														</Tag>
													</Col>
												</Row>
												<Row>
													<Col span={12} className="text-neutral-600">
														{t('audit.hashChain.logCount')}
													</Col>
													<Col span={12}>{hashChainData.logCount ?? '-'}</Col>
												</Row>
												<Row>
													<Col span={12} className="text-neutral-600">
														{t('audit.hashChain.verifiedAt')}
													</Col>
													<Col span={12}>
														{hashChainData.verifiedAt
															? new Date(hashChainData.verifiedAt).toLocaleString('zh-CN')
															: '-'}
													</Col>
												</Row>
											</Space>
										) : (
											<Empty
												description={t('audit.hashChain.empty')}
												image={Empty.PRESENTED_IMAGE_SIMPLE}
											/>
										)}
									</Card>
								</Col>
							</Row>
						),
					},
				]}
			/>

			<Modal
				title={t('audit.hashChain.title')}
				open={hashChainVisible}
				onCancel={() => setHashChainVisible(false)}
				footer={null}
				width={800}
				className="w-full max-w-[800px]"
			>
				{hashChainLoading ? (
					<Spin className="flex justify-center py-8" />
				) : hashChainError ? (
					<PageError message={t('audit.toast.hashChainError')} retry={fetchHashChain} />
				) : hashChainData ? (
					<div className="space-y-3">
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.hashChain.chainStatus')}
							</Col>
							<Col span={16}>
								<Tag color={hashChainData.isValid ? 'success' : 'error'}>
									{hashChainData.isValid ? t('audit.hashChain.valid') : t('audit.hashChain.broken')}
								</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.hashChain.logCount')}
							</Col>
							<Col span={16}>{hashChainData.logCount ?? '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.hashChain.verifiedAt')}
							</Col>
							<Col span={16}>
								{hashChainData.verifiedAt ? new Date(hashChainData.verifiedAt).toLocaleString('zh-CN') : '-'}
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.hashChain.startHash')}
							</Col>
							<Col span={16}>
								<Text copyable className="break-all font-mono text-xs">
									{hashChainData.startHash || '-'}
								</Text>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.hashChain.endHash')}
							</Col>
							<Col span={16}>
								<Text copyable className="break-all font-mono text-xs">
									{hashChainData.endHash || '-'}
								</Text>
							</Col>
						</Row>
						{hashChainData.chainId ? (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('audit.hashChain.chainId')}
								</Col>
								<Col span={16}>
									<Text className="break-all font-mono text-xs">{hashChainData.chainId}</Text>
								</Col>
							</Row>
						) : null}
						{hashChainData.message ? (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('audit.hashChain.message')}
								</Col>
								<Col span={16}>
									<Paragraph className="break-all text-xs">{hashChainData.message}</Paragraph>
								</Col>
							</Row>
						) : null}
					</div>
				) : (
					<Empty description={t('audit.hashChain.empty')} />
				)}
			</Modal>

			<Modal
				title={t('audit.merkle.title')}
				open={merkleVisible}
				onCancel={() => setMerkleVisible(false)}
				footer={null}
				width={700}
				className="w-full max-w-[700px]"
			>
				{merkleLoading ? (
					<Spin className="flex justify-center py-8" />
				) : merkleData ? (
					<div className="space-y-4">
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.merkle.entryId')}
							</Col>
							<Col span={16}>{merkleData.entryId || '-'}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.merkle.rootHash')}
							</Col>
							<Col span={16}>
								<Text copyable className="break-all font-mono text-xs">
									{merkleData.rootHash || '-'}
								</Text>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.merkle.verified')}
							</Col>
							<Col span={16}>
								<Tag color={merkleData.verified ? 'success' : 'error'}>
									{merkleData.verified ? t('common.yes') : t('common.no')}
								</Tag>
							</Col>
						</Row>
						{merkleData.proofPath ? (
							<div>
								<div className="text-neutral-600 mb-2">{t('audit.merkle.proofPath')}</div>
								<pre className="bg-neutral-50 p-3 rounded-xs text-xs overflow-auto">
									{JSON.stringify(merkleData.proofPath, null, 2)}
								</pre>
							</div>
						) : null}
					</div>
				) : null}
			</Modal>
			<Modal
				title={t('audit.verifyReport.title')}
				open={!!verifyReport}
				onCancel={() => setVerifyReport(null)}
				footer={
					<Button type="primary" onClick={() => setVerifyReport(null)}>
						{t('common.cancel')}
					</Button>
				}
				width={560}
			>
				{verifyReport ? (
					<div className="space-y-3">
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.verifyReport.result')}
							</Col>
							<Col span={16}>
								<Tag color="error">{t('audit.toast.verifyFailed')}</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('audit.verifyReport.brokenAt')}
							</Col>
							<Col span={16}>
								{verifyReport.brokenAt != null ? (
									<Tag color="red">seq = {verifyReport.brokenAt}</Tag>
								) : (
									'-'
								)}
							</Col>
						</Row>
						{verifyReport.message ? (
							<Row>
								<Col span={8} className="text-neutral-600">
									{t('audit.verifyReport.detail')}
								</Col>
								<Col span={16}>
									<Paragraph
										className="break-all font-mono text-xs bg-neutral-50 p-3 rounded-xs"
										copyable
									>
										{verifyReport.message}
									</Paragraph>
								</Col>
							</Row>
						) : null}
						<Row>
							<Col span={24}>
								<Text type="secondary" className="text-xs">
									{t('audit.verifyReport.hint')}
								</Text>
							</Col>
						</Row>
					</div>
				) : null}
			</Modal>
		</div>
	);
}

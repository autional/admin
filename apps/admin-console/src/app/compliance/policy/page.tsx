'use client';
// @generated-api-exempt: 2 key(s) [COMPLIANCE.ADMIN_TENANT_SELF_POLICY, COMPLIANCE.ADMIN_TENANT_SELF_READINESS] lack generated func

import React, { useState, useEffect, useRef } from 'react';
import { Tabs, Card, Checkbox, Button, Tag, Space, Modal, Form, Input, message, Progress, Row, Col, Statistic, Descriptions, Popconfirm } from 'antd';
import {
	BadgeCheck,
	CheckCircle2,
	Pencil,
	Plus,
	Trash2,
	XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { handleApiError } from '@/lib/error-handler';
import { apiClient, API_PATHS, extractItem } from '@autional/shared';
import {
	adminComplianceStandards,
	adminComplianceTenantsSelfOverrides,
	adminComplianceTenantsSelfStandardsPut,
	adminComplianceTenantsSelfOverridesByOverridesDelete,
} from '@autional/shared/generated/api';
import { PageError, DataTable } from '@autional/ui/antd';

interface StandardItem {
	id: string;
	name: string;
	version: string;
	category: string;
	description: string;
}

interface ControlItem {
	id: string;
	requirement: string;
	name: string;
	description: string;
	parameter: string;
	operator: string;
	value: any;
	severity: string;
	tags: string[];
}

// TASK-AB1-27（RC-5 契约收敛）：契约类型 camel 直读（响应拦截器深 camel 化，禁 snake 直读）。
// wire 锚：service-compliance/internal/handler/dto/compliance_engine_dto.go:40-47（ResolvedParamItem）
// / :59-69（ParameterGapItem）/ :83-92（ReadinessReportResponse）/ :98-104（OverrideItem）

interface ResolvedParam {
	value: any;
	source: string[];
	mergeRule: string;
	overridden: boolean;
	overrideValue?: any;
	severity: string;
}

interface GapItem {
	parameter: string;
	required: any;
	current: any;
	operator: string;
	compliant: boolean;
	severity: string;
	standard?: string;
	controlRef?: string;
	description?: string;
}

interface OverrideItem {
	parameter: string;
	value: any;
	reason: string;
	createdBy: string;
	createdAt: string;
}

interface ReadinessItem {
	standardId: string;
	standardName: string;
	totalControls: number;
	passedControls: number;
	complianceRate: number;
	readyForAudit: boolean;
	recommendations: string[];
}

// TASK-AB2-30（A-246/A-251）：差距报告全对象（旧代码只取 parameters 丢弃 overallScore）。
interface GapReport {
	standards?: string[];
	parameters: GapItem[];
	overallScore: number;
	criticalGaps?: number;
	highGaps?: number;
	mediumGaps?: number;
	lowGaps?: number;
}

// TASK-AB2-30（ADR-B2-05）：评估基准输入口行 —— resolvedPolicy 参数名/值预填，可增删改。
interface ConfigRow {
	key: string;
	name: string;
	value: string;
}

/** 输入口值 → payload 值：JSON.parse 尝试，失败按字符串；空 = 未提供（undefined → 省略该键）。 */
function parseConfigValue(raw: string): unknown {
	const s = raw.trim();
	if (s === '') return undefined;
	try {
		return JSON.parse(s);
	} catch {
		return raw;
	}
}

/** resolvedPolicy 参数值 → 输入口预填字符串（字符串直出；数字/布尔 String；对象/数组 JSON 序列化）。 */
function configValueToInput(v: unknown): string {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return JSON.stringify(v);
}

export default function CompliancePolicyPage() {
	const { t } = useTranslation();

	const severityColor: Record<string, string> = {
		critical: 'red',
		high: 'orange',
		medium: 'gold',
		low: 'blue',
	};

	const severityLabel: Record<string, string> = {
		critical: t('compliance.policy.critical'),
		high: t('compliance.policy.high'),
		medium: t('compliance.policy.medium'),
		low: t('compliance.policy.low'),
	};

	const categoryLabel: Record<string, string> = {
		financial: t('compliance.policy.financial'),
		government: t('compliance.policy.government'),
		privacy: t('compliance.policy.privacy'),
		security: t('compliance.policy.security'),
		healthcare: t('compliance.policy.healthcare'),
	};

	const [activeTab, setActiveTab] = useState('standards');
	const [standards, setStandards] = useState<StandardItem[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [resolvedPolicy, setResolvedPolicy] = useState<Record<string, ResolvedParam>>({});
	const [gapReport, setGapReport] = useState<GapReport | null>(null);
	const [configRows, setConfigRows] = useState<ConfigRow[]>([]);
	const [overrides, setOverrides] = useState<OverrideItem[]>([]);
	const [readiness, setReadiness] = useState<Record<string, ReadinessItem>>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [overrideModal, setOverrideModal] = useState(false);
	const [overrideForm] = Form.useForm();
	const [resolvedStandards, setResolvedStandards] = useState<string[]>([]);
	const configRowSeq = useRef(0);

	useEffect(() => {
		fetchStandards();
		fetchOverrides();
	}, []);

	const fetchStandards = async () => {
		try {
			setLoading(true);
			const res = await adminComplianceStandards();
			// 根因修复 (2026-08-13): generated 已解包，extractItem(res.data) → null → 标准列表空
			const items = extractItem<StandardItem[]>(res) || [];
			setStandards(items);

			const res2 = await apiClient.get(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_POLICY);
			const policy = extractItem(res2.data);
			if (policy?.standards) {
				setSelectedIds(policy.standards);
				setResolvedPolicy(policy.parameters || {});
				setResolvedStandards(policy.standards);
				seedConfigRows(policy.parameters || {});
			}
		} catch (err) {
			setError(t('compliance.policy.loadFailed'));
		} finally {
			setLoading(false);
		}
	};

	const fetchOverrides = async () => {
		try {
			const res = await adminComplianceTenantsSelfOverrides();
			setOverrides(extractItem(res)?.overrides || []);
		} catch (err) {
			if (import.meta.env.DEV) {
				console.error('Failed to load compliance policy data', err);
			}
		}
	};

	// TASK-AB2-30（A-251）：fetchScore/score 死代码已删 —— 差距卡头圆环统一读差距报告
	// gapReport.overallScore（口径收敛，不再并存 GET /score 的安全评分）。

	const handleApply = async () => {
		setLoading(true);
		try {
			await adminComplianceTenantsSelfStandardsPut({ standards: selectedIds });
			// A-253（W1e）②：PUT 成功即回执（旧实现回读并进同一 try——GET 失败连带报"更新失败"，
			// 成功被吞、文案与事实不符）。
			message.success(t('compliance.policy.standardsUpdated'));
		} catch (err) {
			handleApiError(err, t('compliance.policy.updateFailed'));
			setLoading(false);
			return;
		}
		// A-253（W1e）②：回读分段——GET 失败仅提示刷新失败，不推翻更新成功事实。
		try {
			const res = await apiClient.get(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_POLICY);
			const policy = extractItem(res.data);
			setResolvedPolicy(policy?.parameters || {});
			setResolvedStandards(policy?.standards || []);
			seedConfigRows(policy?.parameters || {});
			fetchOverrides();
		} catch (err) {
			handleApiError(err, t('compliance.policy.refreshFailed'));
		} finally {
			setLoading(false);
		}
	};

	const seedConfigRows = (params: Record<string, ResolvedParam>) => {
		setConfigRows(
			Object.entries(params).map(([name, p]) => ({
				key: name,
				name,
				value: configValueToInput(p?.value),
			})),
		);
	};

	const addConfigRow = () => {
		configRowSeq.current += 1;
		setConfigRows((rows) => [...rows, { key: `custom-${configRowSeq.current}`, name: '', value: '' }]);
	};

	const updateConfigRow = (key: string, patch: Partial<ConfigRow>) => {
		setConfigRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
	};

	const removeConfigRow = (key: string) => {
		setConfigRows((rows) => rows.filter((r) => r.key !== key));
	};

	/** 输入口 → POST body 的 parameters（空名行忽略；空值行 = 未提供 → 省略键）。 */
	const buildGapParameters = (): Record<string, unknown> => {
		const parameters: Record<string, unknown> = {};
		for (const row of configRows) {
			const name = row.name.trim();
			if (!name) continue;
			const parsed = parseConfigValue(row.value);
			if (parsed === undefined) continue;
			parameters[name] = parsed;
		}
		return parameters;
	};

	const handleRunGapAnalysis = async () => {
		try {
			setLoading(true);
			// A-246（ADR-B2-05）：恒发 body —— 有标准时后端 ShouldBindJSON 必读（无 body 必 400）；
			// parameters = 输入口行，空 = {}（诚实空基准）。
			const res = await apiClient.post(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_GAP_ANALYSIS, {
				parameters: buildGapParameters(),
			});
			// A-251：存全对象，ring 读 overallScore（不再丢弃）。
			setGapReport(extractItem<GapReport>(res.data));
			setActiveTab('gaps');
		} catch (err) {
			handleApiError(err, t('compliance.policy.gapAnalysisFailed'));
		} finally {
			setLoading(false);
		}
	};

	const handleGetReadiness = async (stdId: string) => {
		try {
			setLoading(true);
			const res = await apiClient.post(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_READINESS(stdId), {});
			setReadiness((prev) => ({
				...prev,
				[stdId]: extractItem<ReadinessItem>(res.data) ?? ({} as ReadinessItem),
			}));
		} catch (err) {
			handleApiError(err, t('compliance.policy.getReportFailed'));
		} finally {
			setLoading(false);
		}
	};

	const handleAddOverride = async (values: any) => {
		try {
			await apiClient.post(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_OVERRIDES, {
				parameter: values.parameter,
				value: values.value,
				reason: values.reason || '',
			});
			message.success(t('compliance.policy.overrideSet'));
			setOverrideModal(false);
			overrideForm.resetFields();
			fetchOverrides();
		} catch (err) {
			handleApiError(err, t('compliance.policy.overrideFailed'));
		}
	};

	const handleRemoveOverride = async (param: string) => {
		try {
			await adminComplianceTenantsSelfOverridesByOverridesDelete(param);
			message.success(t('compliance.policy.overrideRemoved'));
			fetchOverrides();
		} catch (err) {
			handleApiError(err, t('compliance.policy.removeFailed'));
		}
	};

	if (error) {
		return <PageError message={t('compliance.policy.loadFailed')} retry={fetchStandards} />;
	}

	const tabs = [
		{
			key: 'standards',
			label: t('compliance.policy.standards'),
			children: (
				<div>
					<Card title={t('compliance.policy.standards')} className="mb-4">
						<Checkbox.Group
							value={selectedIds}
							onChange={(v) => setSelectedIds(v as string[])}
							className="w-full"
						>
							<Space direction="vertical" size="middle" className="w-full">
								{standards.map((std) => (
									<Card key={std.id} size="small" hoverable>
										<Checkbox value={std.id}>
											<strong>{std.name}</strong>
											<Tag className="ml-2">{categoryLabel[std.category] || std.category}</Tag>
											<Tag color="blue">{std.version}</Tag>
										</Checkbox>
										<div className="mt-1 text-neutral-600 text-xs">{std.description}</div>
									</Card>
								))}
							</Space>
						</Checkbox.Group>
					</Card>
					<Space>
						{selectedIds.length === 0 ? (
							// A-253（W1e）③：零勾选应用 = 静默清空全部标准（无确认无警示）→ 前置 Popconfirm
							<Popconfirm
								title={t('compliance.policy.zeroSelectionConfirmTitle')}
								description={t('compliance.policy.zeroSelectionConfirmDesc')}
								okText={t('common.confirm')}
								cancelText={t('common.cancel')}
								onConfirm={handleApply}
							>
								<Button type="primary" icon={<BadgeCheck size="1em" />} loading={loading}>
									{t('compliance.policy.apply')}
								</Button>
							</Popconfirm>
						) : (
							<Button
								type="primary"
								icon={<BadgeCheck size="1em" />}
								onClick={handleApply}
								loading={loading}
							>
								{t('compliance.policy.apply')}
							</Button>
						)}
						<Button onClick={handleRunGapAnalysis} loading={loading}>
							{t('compliance.policy.runGap')}
						</Button>
					</Space>
				</div>
			),
		},
		{
			key: 'policy',
			label: `${t('compliance.policy.policyTab')}${resolvedStandards.length ? ` (${resolvedStandards.length})` : ''}`,
			children: (
				<div>
					<Card title={t('compliance.policy.matrix')} className="mb-4">
						{resolvedStandards.length > 0 && (
							<Space wrap className="mb-3">
								{resolvedStandards.map((sid) => (
									<Tag key={sid} color="blue">
										{standards.find((s) => s.id === sid)?.name || sid}
									</Tag>
								))}
							</Space>
						)}
						{/* A-253（W1e）④：组合策略空态无引导（对照认证就绪有明确指引）→ 空态引导文案 */}
						{Object.keys(resolvedPolicy).length === 0 ? (
							<div className="text-center py-10 text-neutral-600">
								{t('compliance.policy.matrixEmptyHint')}
							</div>
						) : (
							<DataTable
								rowKey="parameter"
								dataSource={Object.entries(resolvedPolicy).map(([k, v]) => ({
									parameter: k,
									...v,
									key: k,
								}))}
								columns={[
									{ title: t('compliance.policy.parameter'), dataIndex: 'parameter', width: 200 },
									{
										title: t('compliance.policy.requiredValue'),
										dataIndex: 'value',
										render: (v: any) => String(v),
									},
									{ title: t('compliance.policy.mergeRule'), dataIndex: 'mergeRule', width: 100 },
									{
										title: t('compliance.policy.sourceStandards'),
										dataIndex: 'source',
										render: (s: string[]) => s.join(', '),
									},
									{
										title: t('compliance.policy.severity'),
										dataIndex: 'severity',
										render: (s: string) => <Tag color={severityColor[s]}>{severityLabel[s]}</Tag>,
									},
									{
										title: t('compliance.policy.overridden'),
										dataIndex: 'overridden',
										render: (v: boolean) =>
											v ? (
												<Tag color="green">{t('compliance.policy.yes')}</Tag>
											) : (
												<Tag>{t('compliance.policy.no')}</Tag>
											),
									},
								]}
								pagination={{ pageSize: 20 }}
								size="small"
								scroll={{ x: 800 }}
							/>
						)}
					</Card>
				</div>
			),
		},
		{
			key: 'gaps',
			label: `${t('compliance.policy.gapsTitle')}${gapReport && gapReport.parameters.length ? ` (${t('compliance.policy.nonCompliantCount', { count: gapReport.parameters.filter((g) => !g.compliant).length })})` : ''}`,
			children: (
				<div>
					<Card title={t('compliance.policy.gapInputTitle')} className="mb-4">
						<p className="mb-3 text-neutral-600 text-xs">{t('compliance.policy.gapInputHint')}</p>
						<DataTable
							rowKey="key"
							dataSource={configRows}
							pagination={false}
							size="small"
							columns={[
								{
									title: t('compliance.policy.parameter'),
									dataIndex: 'name',
									width: 260,
									render: (_: unknown, row: ConfigRow, index: number) => (
										<Input
											id={`gap-param-${index}`}
											value={row.name}
											onChange={(e) => updateConfigRow(row.key, { name: e.target.value })}
										/>
									),
								},
								{
									title: t('compliance.policy.currentValue'),
									dataIndex: 'value',
									render: (_: unknown, row: ConfigRow, index: number) => (
										<Input
											id={`gap-value-${index}`}
											value={row.value}
											onChange={(e) => updateConfigRow(row.key, { value: e.target.value })}
										/>
									),
								},
								{
									title: t('common.actions'),
									width: 90,
									render: (_: unknown, row: ConfigRow) => (
										<Button
											type="link"
											danger
											icon={<Trash2 size="1em" />}
											onClick={() => removeConfigRow(row.key)}
										>
											{t('compliance.policy.remove')}
										</Button>
									),
								},
							]}
						/>
						<Space className="mt-3">
							<Button icon={<Plus size="1em" />} onClick={addConfigRow}>
								{t('compliance.policy.addParam')}
							</Button>
							<Button type="primary" onClick={handleRunGapAnalysis} loading={loading}>
								{t('compliance.policy.runGap')}
							</Button>
						</Space>
					</Card>
					{gapReport === null ? (
						<Card>
							<div className="text-center p-10">
								<p>{t('compliance.policy.runGapHint')}</p>
							</div>
						</Card>
					) : (
						<Card
							title={
								<Space>
									<span>{t('compliance.policy.gaps')}</span>
									<Progress
										type="circle"
										percent={Math.round(gapReport.overallScore)}
										size={40}
										status={gapReport.overallScore >= 80 ? 'success' : gapReport.overallScore >= 60 ? 'normal' : 'exception'}
									/>
								</Space>
							}
						>
							{gapReport.parameters.length === 0 && (
								<div className="mb-3 text-neutral-600">
									{t('compliance.policy.noStandardsGapHint')}
								</div>
							)}
							<DataTable
								rowKey="parameter"
								dataSource={gapReport.parameters}
								columns={[
									{ title: t('compliance.policy.parameter'), dataIndex: 'parameter', width: 200 },
									{
										title: t('compliance.policy.requiredValue'),
										dataIndex: 'required',
										render: (v: any) => String(v),
									},
									{
										title: t('compliance.policy.currentValue'),
										dataIndex: 'current',
										render: (v: any) => (v != null ? String(v) : '\u2014'),
									},
									{ title: t('compliance.policy.operator'), dataIndex: 'operator', width: 70 },
									{
										title: t('common.status'),
										dataIndex: 'compliant',
										width: 80,
										render: (v: boolean) =>
											v ? (
												<Tag color="green" icon={<CheckCircle2 size="1em" />}>
													{t('compliance.gap.compliant')}
												</Tag>
											) : (
												<Tag color="red" icon={<XCircle size="1em" />}>
													{t('compliance.gap.nonCompliant')}
												</Tag>
											),
									},
									{
										title: t('compliance.policy.severity'),
										dataIndex: 'severity',
										width: 80,
										render: (s: string) => <Tag color={severityColor[s]}>{severityLabel[s]}</Tag>,
									},
									{
										title: t('compliance.policy.standardSource'),
										dataIndex: 'standard',
										width: 120,
									},
									{
										title: t('compliance.policy.explanation'),
										dataIndex: 'description',
										ellipsis: true,
									},
								]}
								pagination={{ pageSize: 20 }}
								size="small"
								scroll={{ x: 800 }}
							/>
						</Card>
					)}
				</div>
			),
		},
		{
			key: 'overrides',
			label: `${t('compliance.policy.overridesTitle')}${overrides.length ? ` (${overrides.length})` : ''}`,
			children: (
				<div>
					<Card
						title={t('compliance.policy.overrides')}
						extra={
							<Button type="primary" icon={<Pencil size="1em" />} onClick={() => setOverrideModal(true)}>
								{t('compliance.policy.addOverride')}
							</Button>
						}
					>
						<DataTable
							rowKey="parameter"
							dataSource={overrides}
							columns={[
								{ title: t('compliance.policy.parameter'), dataIndex: 'parameter', width: 220 },
								{
									title: t('compliance.policy.overrideValue'),
									dataIndex: 'value',
									render: (v: any) => <Tag color="green">{String(v)}</Tag>,
								},
								{ title: t('compliance.policy.reason'), dataIndex: 'reason' },
								{ title: t('compliance.policy.setTime'), dataIndex: 'createdAt', width: 180 },
								{
									title: t('common.actions'),
									width: 80,
									render: (_: any, record: OverrideItem) => (
										<Button
											type="link"
											danger
											icon={<Trash2 size="1em" />}
											onClick={() => handleRemoveOverride(record.parameter)}
										>
											{t('compliance.policy.remove')}
										</Button>
									),
								},
							]}
							pagination={{ pageSize: 20 }}
							size="small"
							scroll={{ x: 800 }}
						/>
					</Card>
					<Modal
						title={t('compliance.policy.overrideTitle')}
						open={overrideModal}
						onCancel={() => {
							setOverrideModal(false);
							overrideForm.resetFields();
						}}
						onOk={() => overrideForm.submit()}
						className="w-full max-w-[560px]"
					>
						<Form form={overrideForm} layout="vertical" onFinish={handleAddOverride}>
							<Form.Item
								name="parameter"
								label={t('compliance.policy.paramName')}
								rules={[{ required: true }]}
							>
								<Input placeholder="password_min_length_sfa" />
							</Form.Item>
							<Form.Item
								name="value"
								label={t('compliance.policy.overrideValueLabel')}
								rules={[{ required: true }]}
							>
								<Input placeholder={t('compliance.policy.overridePlaceholder')} />
							</Form.Item>
							<Form.Item name="reason" label={t('compliance.policy.reason')}>
								<Input.TextArea placeholder={t('compliance.policy.reasonPlaceholder')} rows={2} />
							</Form.Item>
						</Form>
					</Modal>
				</div>
			),
		},
		{
			key: 'readiness',
			label: t('compliance.policy.readiness'),
			children: (
				<div>
					{resolvedStandards.length === 0 ? (
						<Card>
							<div className="text-center p-10">{t('compliance.policy.noStandards')}</div>
						</Card>
					) : (
						<Space direction="vertical" size="middle" className="w-full">
							{resolvedStandards.map((sid) => {
								const r = readiness[sid];
								return (
									<Card
										key={sid}
										title={standards.find((s) => s.id === sid)?.name || sid}
										extra={
											<Button
												size="small"
												onClick={() => handleGetReadiness(sid)}
												loading={loading}
											>
												{t('compliance.policy.checkReadiness')}
											</Button>
										}
									>
										{r ? (
											<div>
												<Row gutter={16}>
													<Col span={6}>
														<Statistic
															title={t('compliance.policy.readinessRate')}
															value={Math.round(r.complianceRate)}
															suffix="%"
														/>
													</Col>
													<Col span={6}>
														<Statistic
															title={t('compliance.policy.passed')}
															value={r.passedControls}
															suffix={`/ ${r.totalControls}`}
														/>
													</Col>
													<Col span={6}>
														<Statistic
															title={t('compliance.policy.auditable')}
															value={
																r.readyForAudit
																	? t('compliance.policy.yes')
																	: t('compliance.policy.no')
															}
														/>
													</Col>
													<Col span={6}>
														<Progress
															type="circle"
															percent={Math.round(r.complianceRate)}
															size={60}
															status={r.readyForAudit ? 'success' : 'normal'}
														/>
													</Col>
												</Row>
												{r.recommendations.length > 0 && (
													<div className="mt-3">
														<Descriptions
															title={t('compliance.policy.recommendations')}
															column={1}
															size="small"
														>
															{r.recommendations.map((rec, i) => (
																<Descriptions.Item key={i} label={`#${i + 1}`}>
																	{rec}
																</Descriptions.Item>
															))}
														</Descriptions>
													</div>
												)}
											</div>
										) : (
											<div className="text-neutral-600 p-5 text-center">
												{t('compliance.policy.checkReadinessHint')}
											</div>
										)}
									</Card>
								);
							})}
						</Space>
					)}
				</div>
			),
		},
	];

	return (
		<div>
			<h2 className="mb-4">
				<BadgeCheck size="1em" className="mr-2" />
				{t('compliance.policy.title')}
			</h2>
			<Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
		</div>
	);
}

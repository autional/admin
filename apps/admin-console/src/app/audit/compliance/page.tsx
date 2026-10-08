'use client';

import { useState, useEffect, useCallback } from 'react';
import { DataTable, PageError } from '@autional/ui/antd';
import { Tabs, Button, Modal, Form, Input, Select, Space, Tag, Typography, InputNumber, Switch } from 'antd';
import { message } from '@/lib/antd-app';
import { Plus, RefreshCw } from 'lucide-react';
import { AppPageHeader, EmptyState, LoadingScreen, SectionCard } from '@autional/ui';
import { apiClient, API_PATHS, usePageTitle } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const { Text } = Typography;

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const SEVERITY_OPTIONS = [
	{ label: 'Low', value: 'low' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'High', value: 'high' },
	{ label: 'Critical', value: 'critical' },
];

const SEVERITY_COLORS: Record<string, string> = {
	low: 'blue',
	medium: 'orange',
	high: 'red',
	critical: 'magenta',
};

/* -------------------------------------------------------------------------- */
/*  Shared utilities                                                          */
/* -------------------------------------------------------------------------- */

interface TabConfig {
	key: string;
	label: string;
	apiPath: string;
	columns: any[];
	formFields: (t: TFunction) => React.ReactNode;
	readOnly?: boolean;
	/** 列表响应的非数组形状折叠（如 role-actions 的 map[string][]string → 行数组）。 */
	transformList?: (payload: unknown) => Record<string, unknown>[];
	/** 提交体构造（表单校验值 → DTO 键；键名 snake 化由 apiClient 请求拦截器承担）。 */
	prepareSubmit?: (values: Record<string, unknown>) => Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*  Sub-component: CrudTab                                                    */
/* -------------------------------------------------------------------------- */

function CrudTab({
	apiPath,
	columns,
	formFields,
	readOnly,
	transformList,
	prepareSubmit,
}: {
	apiPath: string;
	columns: any[];
	formFields: () => React.ReactNode;
	readOnly?: boolean;
	transformList?: (payload: unknown) => Record<string, unknown>[];
	prepareSubmit?: (values: Record<string, unknown>) => Record<string, unknown>;
}) {
	const { t } = useTranslation();
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form] = Form.useForm();

	const fetchData = useCallback(() => {
		setLoading(true);
		setError(false);
		// @generated-api-exempt: apiPath is a prop from generic CrudTab component.
		// This component accepts arbitrary API paths for CRUD operations, making it
		// impossible to use static generated functions without a redesign.
		apiClient
			.get(apiPath)
			.then((res: any) => {
				// apiClient 已自动 unwrap data，res.data 即业务数组/分页对象
				const payload = res.data;
				// A-221：role-actions 返回 map（非数组）→ 经 transformList 折叠为行数组
				setData(transformList ? transformList(payload) : Array.isArray(payload) ? payload : payload?.items || []);
			})
			// A-220（AC-B2-038）：失败态独立呈现（PageError + 重试）——旧实现仅瞬时 toast，
			// 随后「暂无数据」空表把 404/500 伪装成真空列表（两者 DOM 无从区分）。
			.catch(() => setError(true))
			.finally(() => setLoading(false));
	}, [apiPath, transformList]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleSave = async (values: Record<string, unknown>) => {
		setSaving(true);
		try {
			// A-221：提交体按 Tab 的 prepareSubmit 构造（表单控件值 → DTO 键）；键名 camel→snake 由
			// apiClient 请求拦截器统一承担。
			// A-222：合规实体后端有意无 PUT/DELETE（REDLINE「追加版本，不原地修改」）→ 本组件只为
			// 「追加创建」服务，编辑/删除代码路径已整体移除（不再有死按钮）。
			const payload = prepareSubmit ? prepareSubmit(values) : values;
			await apiClient.post(apiPath, payload); // @generated-api-exempt
			message.success(t('compliance.audit.created'));
			setModalOpen(false);
			form.resetFields();
			fetchData();
		} catch (err: any) {
			message.error(err?.message || t('compliance.audit.saveFailed'));
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <LoadingScreen />;
	if (error) return <PageError message={t('compliance.audit.loadError')} retry={fetchData} />;

	return (
		<div>
			{!readOnly && (
				<Button
					type="primary"
					icon={<Plus size="1em" />}
					onClick={() => {
						form.resetFields();
						setModalOpen(true);
					}}
					className="mb-4"
				>
					{t('common.create')}
				</Button>
			)}
			<Button icon={<RefreshCw size="1em" />} onClick={fetchData} className="mb-4 ml-2">
				{t('common.refresh')}
			</Button>
			{!readOnly && (
				<Text type="secondary" className="block mb-4 text-sm">
					{t('compliance.audit.appendOnlyHint')}
				</Text>
			)}
			<DataTable
				columns={columns}
				dataSource={data}
				rowKey={(r: any) => r.id || r._id || r.role}
				locale={{ emptyText: <EmptyState title={t('common.noData')} /> }}
				scroll={{ x: 800 }}
			/>
			<Modal
				title={t('common.create')}
				open={modalOpen}
				onCancel={() => {
					setModalOpen(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				// A-225（W1e）：Modal 关闭按钮 a11y 名 "Close" 未本地化 → 中文「关闭」
				closable={{ 'aria-label': t('common.close') }}
				confirmLoading={saving}
				width={640}
				className="w-full max-w-[640px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					{formFields()}
				</Form>
			</Modal>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  JSON 输入 / 折叠变换 helpers（A-221 · ADR-B2-07）                            */
/* -------------------------------------------------------------------------- */

/** JSON 校验器（ADR-B2-07）：空值放行；非法 JSON / 类型不符 → 内联错误并阻塞提交。 */
function jsonValidator(t: TFunction, kind: 'array' | 'object') {
	return (_rule: unknown, value: unknown) => {
		if (value === undefined || value === null || String(value).trim() === '') return Promise.resolve();
		let parsed: unknown;
		try {
			parsed = JSON.parse(String(value));
		} catch {
			return Promise.reject(new Error(t('compliance.audit.validation.jsonInvalid')));
		}
		if (kind === 'array' && !Array.isArray(parsed)) {
			return Promise.reject(new Error(t('compliance.audit.validation.jsonArray')));
		}
		if (kind === 'object' && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
			return Promise.reject(new Error(t('compliance.audit.validation.jsonObject')));
		}
		return Promise.resolve();
	};
}

/** 空值 → fallback；否则 JSON.parse（校验器已前置拦截，此处 try/catch 兜底防炸）。 */
function parseJsonField(raw: unknown, fallback: unknown) {
	if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
	try {
		return JSON.parse(String(raw));
	} catch {
		return fallback;
	}
}

/** role-actions 响应为 map[string][]string（compliance_handler.go · GetRoleActionMappings）→ 折叠为行。 */
function foldRoleActionMappings(payload: unknown): Record<string, unknown>[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
	return Object.entries(payload as Record<string, unknown>).map(([role, actions]) => ({
		role,
		actions: Array.isArray(actions) ? actions : [],
	}));
}

/** PIA 提交体 → CreatePIARequest（dto.go:1333-1339；data_types = 字符串数组）。 */
function preparePiasSubmit(values: Record<string, unknown>) {
	return {
		name: values.name,
		description: values.description || undefined,
		dataTypes: parseJsonField(values.dataTypes, []),
		purpose: values.purpose || undefined,
		riskLevel: values.riskLevel,
	};
}

/** 数据分类提交体 → CreateDataClassificationRequest（dto.go:1369-1373；tiers = 字符串）。 */
function prepareDataClassSubmit(values: Record<string, unknown>) {
	return {
		dataSetName: values.dataSetName,
		tiers: values.tiers,
		description: values.description || undefined,
	};
}

/** AI 决策提交体 → RecordAIDecisionRequest（dto.go:749-756；input/output = 对象）。 */
function prepareAiDecisionsSubmit(values: Record<string, unknown>) {
	return {
		decisionId: values.decisionId,
		model: values.model,
		input: parseJsonField(values.input, {}),
		output: parseJsonField(values.output, {}),
		reviewed: !!values.reviewed,
		reviewer: values.reviewer || undefined,
	};
}

/** breach 提交体 → CreateBreachNotificationRequest（dto.go:1350-1355；affected_users 为 int64）。 */
function prepareBreachesSubmit(values: Record<string, unknown>) {
	const affected = values.affectedUsers;
	return {
		title: values.title,
		description: values.description || undefined,
		severity: values.severity,
		affectedUsers: affected === undefined || affected === null || affected === '' ? undefined : Number(affected),
	};
}

/** 清理记录提交体 → CreateCleanupRecordRequest（dto.go:1410-1414；count 为 int64）。 */
function prepareCleanupSubmit(values: Record<string, unknown>) {
	const count = values.count;
	return {
		recordType: values.recordType,
		count: count === undefined || count === null || count === '' ? undefined : Number(count),
		period: values.period || undefined,
	};
}

/* -------------------------------------------------------------------------- */
/*  Form field definitions per tab                                            */
/* -------------------------------------------------------------------------- */

// A-221：对齐 CreatePIARequest{name* / description / data_types[] / purpose / risk_level}
// （dto.go:1333-1339）——旧表单 {title*, dataScope, risks, mitigation, status} 与后端完全不同源，
// 缺必填 name → 提交即 400。
const piaFormFields = (t: TFunction) => (
	<>
		<Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.title')} />
		</Form.Item>
		<Form.Item name="description" label={t('compliance.audit.field.description')}>
			<Input.TextArea rows={3} placeholder={t('compliance.audit.placeholder.description')} />
		</Form.Item>
		<Form.Item
			name="dataTypes"
			label={t('compliance.audit.field.dataTypes')}
			rules={[{ validator: jsonValidator(t, 'array') }]}
		>
			<Input.TextArea rows={2} placeholder={t('compliance.audit.placeholder.dataTypes')} />
		</Form.Item>
		<Form.Item name="purpose" label={t('compliance.audit.field.purpose')}>
			<Input placeholder={t('compliance.audit.placeholder.purpose')} />
		</Form.Item>
		<Form.Item name="riskLevel" label={t('compliance.audit.field.riskLevel')} initialValue="low">
			<Select options={SEVERITY_OPTIONS.map((o) => ({ ...o, label: t(`compliance.audit.severity.${o.value}`) }))} />
		</Form.Item>
	</>
);

// A-223：对齐 CreateBreachNotificationRequest{title* / description / severity* / affected_users int64}
// （dto.go:1350-1355）——旧表单 affectedData/reportedTo/status 后端不存在（Go 静默忽略未知键=假成功
// 丢字段），且响应 BreachNotificationResponse 无 status/reportedTo → 两列恒空。
const breachesFormFields = (t: TFunction) => (
	<>
		<Form.Item name="title" label={t('compliance.audit.field.title')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.title')} />
		</Form.Item>
		<Form.Item name="description" label={t('compliance.audit.field.description')}>
			<Input.TextArea rows={3} placeholder={t('compliance.audit.placeholder.breachDescription')} />
		</Form.Item>
		<Form.Item name="severity" label={t('compliance.audit.field.severity')} initialValue="medium">
			<Select options={SEVERITY_OPTIONS.map((o) => ({ ...o, label: t(`compliance.audit.severity.${o.value}`) }))} />
		</Form.Item>
		<Form.Item name="affectedUsers" label={t('compliance.audit.field.affectedUsers')}>
			<InputNumber min={0} className="w-full" placeholder={t('compliance.audit.placeholder.affectedUsers')} />
		</Form.Item>
	</>
);

// A-221：对齐 CreateDataClassificationRequest{data_set_name* / tiers* / description}
// （dto.go:1369-1373）。注：tiers 在后端为**字符串**（例 "PII/Confidential"）非数组——计划
// 括注"tiers JSON 数组"与 dto.go:1371 实况不符，按代码实况实现（F-AB2-23 偏离登记）。
const dataClassFormFields = (t: TFunction) => (
	<>
		<Form.Item name="dataSetName" label={t('compliance.audit.field.dataSetName')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.dataSetName')} />
		</Form.Item>
		<Form.Item name="tiers" label={t('compliance.audit.field.tiers')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.tiers')} />
		</Form.Item>
		<Form.Item name="description" label={t('compliance.audit.field.description')}>
			<Input.TextArea rows={3} placeholder={t('compliance.audit.placeholder.description')} />
		</Form.Item>
	</>
);

const crossBorderFormFields = (t: TFunction) => (
	<>
		<Form.Item name="dataType" label={t('compliance.audit.field.dataType')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.dataType')} />
		</Form.Item>
		<Form.Item name="originCountry" label={t('compliance.audit.field.originCountry')}>
			<Input placeholder={t('compliance.audit.placeholder.originCountry')} />
		</Form.Item>
		<Form.Item name="destinationCountries" label={t('compliance.audit.field.destinationCountries')}>
			<Input placeholder={t('compliance.audit.placeholder.destinationCountries')} />
		</Form.Item>
		<Form.Item name="legalBasis" label={t('compliance.audit.field.legalBasis')}>
			<Input placeholder={t('compliance.audit.placeholder.legalBasis')} />
		</Form.Item>
		<Form.Item name="safeguards" label={t('compliance.audit.field.safeguards')}>
			<Input.TextArea rows={2} placeholder={t('compliance.audit.placeholder.safeguards')} />
		</Form.Item>
		<Form.Item name="status" label={t('common.status')} initialValue="pending">
			<Select
				options={[
					{ label: t('compliance.audit.crossStatus.pending'), value: 'pending' },
					{ label: t('compliance.audit.crossStatus.approved'), value: 'approved' },
					{ label: t('compliance.audit.crossStatus.rejected'), value: 'rejected' },
				]}
			/>
		</Form.Item>
	</>
);

// A-221：对齐 RecordAIDecisionRequest{decision_id* / model* / input / output / reviewed / reviewer}
// （dto.go:749-756）。input/output 为对象（非字符串）→ JSON textarea + parse 校验（ADR-B2-07）。
const aiDecisionsFormFields = (t: TFunction) => (
	<>
		<Form.Item name="decisionId" label={t('compliance.audit.field.decisionId')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.decisionId')} />
		</Form.Item>
		<Form.Item name="model" label={t('compliance.audit.field.modelName')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.modelName')} />
		</Form.Item>
		<Form.Item
			name="input"
			label={t('compliance.audit.field.input')}
			rules={[{ validator: jsonValidator(t, 'object') }]}
		>
			<Input.TextArea rows={2} placeholder={t('compliance.audit.placeholder.inputJson')} />
		</Form.Item>
		<Form.Item
			name="output"
			label={t('compliance.audit.field.output')}
			rules={[{ validator: jsonValidator(t, 'object') }]}
		>
			<Input.TextArea rows={2} placeholder={t('compliance.audit.placeholder.outputJson')} />
		</Form.Item>
		<Form.Item
			name="reviewed"
			label={t('compliance.audit.field.reviewed')}
			valuePropName="checked"
			initialValue={false}
		>
			<Switch />
		</Form.Item>
		<Form.Item name="reviewer" label={t('compliance.audit.field.reviewer')}>
			<Input placeholder={t('compliance.audit.placeholder.reviewer')} />
		</Form.Item>
	</>
);

// A-223：对齐 CreateCleanupRecordRequest{record_type* / count / period}（dto.go:1410-1414）——旧表单
// targetId/reason/method/recordsDeleted/status 后端不存在（静默丢弃），且缺 count/period 输入口；
// 响应 CleanupRecordResponse 无 targetId/method/status → 三列恒空。
const cleanupFormFields = (t: TFunction) => (
	<>
		<Form.Item name="recordType" label={t('compliance.audit.field.recordType')} rules={[{ required: true }]}>
			<Input placeholder={t('compliance.audit.placeholder.recordType')} />
		</Form.Item>
		<Form.Item name="count" label={t('compliance.audit.field.count')}>
			<InputNumber min={0} className="w-full" placeholder={t('compliance.audit.placeholder.count')} />
		</Form.Item>
		<Form.Item name="period" label={t('compliance.audit.field.period')}>
			<Input placeholder={t('compliance.audit.placeholder.period')} />
		</Form.Item>
	</>
);

/* -------------------------------------------------------------------------- */
/*  Column definitions per tab                                                */
/* -------------------------------------------------------------------------- */

const tagRender = (colors: Record<string, string>) => (v: string) => (
	<Tag color={colors[v] || 'default'}>{v}</Tag>
);
// A-225（W1e）：toLocaleString 无 locale 参数 → 按当前语言本地化（locale 由调用点传入）
const tsRender = (v: string | number, locale?: string) =>
	v ? new Date(typeof v === 'number' ? v * 1000 : v).toLocaleString(locale) : '-';
/** A-224：数组列渲染（roles_a/roles_b 等）→ 逗号连接；空数组/非数组 → '-'。 */
const listRender = (v: unknown) => (Array.isArray(v) && v.length > 0 ? v.join(', ') : '-');

// A-221：列键对齐 PIAResponse{name / data_types / purpose / risk_level / created_at}（dto.go:1427-1436）。
const piaCols = [
	{ title: 'common.name', dataIndex: 'name', key: 'name', ellipsis: true },
	{
		title: 'compliance.audit.column.riskLevel',
		dataIndex: 'riskLevel',
		key: 'riskLevel',
		width: 100,
		render: tagRender(SEVERITY_COLORS),
	},
	{ title: 'compliance.audit.column.purpose', dataIndex: 'purpose', key: 'purpose', ellipsis: true },
	{ title: 'common.createdAt', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: tsRender },
];

// A-223：列键对齐 BreachNotificationResponse{title / severity / affected_users / created_at}
// （dto.go:1439-1447）——旧 status/reportedTo 列在响应中不存在（恒空列）。
const breachCols = [
	{ title: 'compliance.audit.column.title', dataIndex: 'title', key: 'title', ellipsis: true },
	{
		title: 'compliance.audit.column.severity',
		dataIndex: 'severity',
		key: 'severity',
		width: 100,
		render: tagRender(SEVERITY_COLORS),
	},
	{ title: 'compliance.audit.column.affectedUsers', dataIndex: 'affectedUsers', key: 'affectedUsers', width: 130 },
	{ title: 'common.createdAt', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: tsRender },
];

// A-221：列键对齐 DataClassificationRecord{data_set_name / tiers / description / created_at}（dto.go:1450-1457）。
const dataClassCols = [
	{ title: 'compliance.audit.column.dataSetName', dataIndex: 'dataSetName', key: 'dataSetName', ellipsis: true },
	{ title: 'compliance.audit.column.tiers', dataIndex: 'tiers', key: 'tiers', width: 180, ellipsis: true },
	{ title: 'common.description', dataIndex: 'description', key: 'description', ellipsis: true },
	{ title: 'common.createdAt', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: tsRender },
];

// A-221：列键对齐 CrossBorderTransferRecord{data_type / from_country / to_country / purpose /
// safeguard / created_at}（dto.go:1460-1469）——旧列 originCountry/destinationCountries/legalBasis/status
// 在响应中不存在（恒空列）。
const crossBorderCols = [
	{ title: 'compliance.audit.column.dataType', dataIndex: 'dataType', key: 'dataType', ellipsis: true },
	{ title: 'compliance.audit.column.fromCountry', dataIndex: 'fromCountry', key: 'fromCountry', width: 90 },
	{ title: 'compliance.audit.column.toCountry', dataIndex: 'toCountry', key: 'toCountry', width: 90 },
	{ title: 'compliance.audit.column.purpose', dataIndex: 'purpose', key: 'purpose', ellipsis: true },
	{
		title: 'compliance.audit.column.safeguard',
		dataIndex: 'safeguard',
		key: 'safeguard',
		width: 160,
		ellipsis: true,
	},
	{ title: 'common.createdAt', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: tsRender },
];

// A-221：列键对齐 AIDecisionRecord{model_name / decision_type / reviewer / reviewed / created_at}
// （dto.go:1472-1482）——旧 humanReview/status 列在响应中不存在。
const aiDecisionCols = [
	{ title: 'compliance.audit.column.decisionType', dataIndex: 'decisionType', key: 'decisionType', ellipsis: true },
	{ title: 'compliance.audit.column.model', dataIndex: 'modelName', key: 'modelName', width: 140 },
	{
		title: 'compliance.audit.column.reviewed',
		dataIndex: 'reviewed',
		key: 'reviewed',
		width: 100,
		render: (v: boolean) => (v ? 'compliance.audit.yes' : 'compliance.audit.no'),
	},
	{ title: 'compliance.audit.column.reviewer', dataIndex: 'reviewer', key: 'reviewer', width: 140 },
	{ title: 'common.createdAt', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: tsRender },
];

// A-223：列键对齐 CleanupRecordResponse{record_type / count / period / created_at}（dto.go:1485-1492）
// ——旧 targetId/method/recordsDeleted/status 列在响应中不存在（恒空列）。
const cleanupCols = [
	{ title: 'compliance.audit.column.recordType', dataIndex: 'recordType', key: 'recordType', ellipsis: true },
	{ title: 'compliance.audit.column.count', dataIndex: 'count', key: 'count', width: 110 },
	{ title: 'compliance.audit.column.period', dataIndex: 'period', key: 'period', width: 220, ellipsis: true },
	{ title: 'common.createdAt', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: tsRender },
];

// A-224：列键对齐 SoDRule{name / roles_a[] / roles_b[] / enabled}（advanced_types.go:285-292）——
// 旧列 dataIndex roleA/roleB（单数）与响应 rolesA/rolesB 不符 → 两列恒空；响应无 created_at →
// 删死列，改显 enabled（旧实现该字段零展示）。
const sodCols = [
	{ title: 'compliance.audit.column.ruleName', dataIndex: 'name', key: 'name' },
	{ title: 'compliance.audit.column.rolesA', dataIndex: 'rolesA', key: 'rolesA', width: 200, render: listRender },
	{ title: 'compliance.audit.column.rolesB', dataIndex: 'rolesB', key: 'rolesB', width: 200, render: listRender },
	{
		title: 'compliance.audit.column.enabled',
		dataIndex: 'enabled',
		key: 'enabled',
		width: 90,
		render: (v: boolean) => (v ? 'compliance.audit.yes' : 'compliance.audit.no'),
	},
	{ title: 'common.description', dataIndex: 'description', key: 'description', ellipsis: true },
];

// A-221：role-actions 响应为 map[string][]string（role → actions）经 foldRoleActionMappings 折叠为
// 行 {role, actions[]}——旧列 resource/action/effect/createdAt 在数据中不存在（恒空列）。
const roleActionCols = [
	{ title: 'compliance.audit.column.role', dataIndex: 'role', key: 'role', width: 180 },
	{
		title: 'compliance.audit.column.actions',
		dataIndex: 'actions',
		key: 'actions',
		render: (v: unknown) => (
			<Space size={[0, 4]} wrap>
				{(Array.isArray(v) ? v : []).map((a: string) => (
					<Tag key={a}>{a}</Tag>
				))}
			</Space>
		),
	},
];

/* -------------------------------------------------------------------------- */
/*  Main page                                                                 */
/* -------------------------------------------------------------------------- */

const TABS: TabConfig[] = [
	{
		key: 'pias',
		label: 'compliance.audit.tabPias',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_PIAS,
		columns: piaCols,
		formFields: piaFormFields,
		prepareSubmit: preparePiasSubmit,
	},
	{
		key: 'breaches',
		label: 'compliance.audit.tabBreaches',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_BREACHES,
		columns: breachCols,
		formFields: breachesFormFields,
		prepareSubmit: prepareBreachesSubmit,
	},
	{
		key: 'data-class',
		label: 'compliance.audit.tabDataClass',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_DATA_CLASS,
		columns: dataClassCols,
		formFields: dataClassFormFields,
		prepareSubmit: prepareDataClassSubmit,
	},
	{
		key: 'cross-border',
		label: 'compliance.audit.tabCrossBorder',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_CROSS_BORDER,
		columns: crossBorderCols,
		formFields: crossBorderFormFields,
	},
	{
		key: 'ai-decisions',
		label: 'compliance.audit.tabAiDecisions',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_AI_DECISIONS,
		columns: aiDecisionCols,
		formFields: aiDecisionsFormFields,
		prepareSubmit: prepareAiDecisionsSubmit,
	},
	{
		key: 'cleanup',
		label: 'compliance.audit.tabCleanup',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_CLEANUP,
		columns: cleanupCols,
		formFields: cleanupFormFields,
		prepareSubmit: prepareCleanupSubmit,
	},
	{
		key: 'sod-rules',
		label: 'compliance.audit.tabSodRules',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_SOD_RULES,
		columns: sodCols,
		formFields: () => null,
		readOnly: true,
	},
	{
		key: 'role-actions',
		label: 'compliance.audit.tabRoleActions',
		apiPath: API_PATHS.AUDIT.ADMIN_COMPLIANCE_ROLE_ACTIONS,
		columns: roleActionCols,
		formFields: () => null,
		readOnly: true,
		transformList: foldRoleActionMappings,
	},
];

export default function CompliancePage() {
	const { t, i18n } = useTranslation();
	// A-225（W1e）：tab 恒"Autional 管理控制台" → 挂载页面标题
	usePageTitle(t('compliance.audit.title'));
	const tabItems = TABS.map((tab) => {
		const cols = tab.columns.map((col: any) => ({
			...col,
			title: t(col.title),
			// A-225（W1e）：时间列按当前语言本地化（tsRender 单一判定点，恒经此分流）
			render:
				col.render === tsRender
					? (v: any) => tsRender(v, i18n.language)
					: col.render
						? (v: any, r: any) => {
								const out = col.render(v, r);
								return typeof out === 'string' && out.startsWith('compliance.audit.')
									? t(out)
									: out;
						  }
						: undefined,
		}));
		return {
			key: tab.key,
			label: t(tab.label),
			children: (
				<CrudTab
					key={tab.key}
					apiPath={tab.apiPath}
					columns={cols}
					formFields={() => tab.formFields(t)}
					readOnly={tab.readOnly}
					transformList={tab.transformList}
					prepareSubmit={tab.prepareSubmit}
				/>
			),
		};
	});
	return (
		<div>
			<AppPageHeader
				title={t('compliance.audit.title')}
				description={t('compliance.audit.subtitle')}
			/>
			<SectionCard>
				<Tabs
					defaultActiveKey="pias"
					items={tabItems}
				/>
			</SectionCard>
		</div>
	);
}

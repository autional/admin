'use client';
// @generated-api-exempt: 4 key(s) [COMPLIANCE.ADMIN_LEGAL_DOCUMENTS, COMPLIANCE.ADMIN_LEGAL_DOCUMENT, COMPLIANCE.ADMIN_LEGAL_DOCUMENT_PUBLISH, COMPLIANCE.ADMIN_LEGAL_DOCUMENT_ARCHIVE] lack generated func

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, DatePicker, Empty, Form, Input, Modal, Select, Space, Tag } from 'antd';

import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { message, modal } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { Alert } from '@autional/ui';
import { PageError, DataTable } from '@autional/ui/antd';
import type { DataTableProps } from '@autional/ui/antd';

import {
	apiClient,
	API_PATHS,
	fromPageResult,
	toPageParams,
	useCurrentTenantIdOr,
	usePageTitle,
} from '@autional/shared';
import dayjs from 'dayjs';

// A-274（TASK-AB1-23）：契约键直读（响应拦截器已 snake→camel），禁止 snake 双读兼容。
interface LegalDocumentItem {
	id: string;
	docType: string;
	version: string;
	title: string;
	lang: string;
	status: string;
	content: string;
	effectiveAt: string | null;
}

interface LegalDocumentFormValues {
	docType?: string;
	version?: string;
	title: string;
	lang: string;
	content: string;
	effectiveAt?: dayjs.Dayjs | null;
}

/** 客户端分页每页条数（ADR-001：全量拉取后前端翻页） */
const PAGE_SIZE = 20;

/** 服务端 List 接口单次最大拉取量（超量时展示守卫 banner） */
// ADM-009: 200 超后端 PageSize max（校验错误 10000005），保守降至 50
const FETCH_LIMIT = 50;

export default function LegalDocumentsPage() {
	const { t, i18n } = useTranslation();
	// A-278③（W1e）：无 usePageTitle（第 16 例，实测 tab 恒"Autional 管理控制台"）→ 挂载
	usePageTitle(t('legalDocuments.title'));
	const tenantId = useCurrentTenantIdOr('default-tenant');

	/** status → Tag 颜色映射（AC-004） */
	const STATUS_COLORS: Record<string, string> = {
		draft: 'gold',
		published: 'green',
		archived: 'red',
	};

	/** lang 值（zh-CN/en-US）→ i18n 短 key 后缀映射 */
	const LANG_KEY_MAP: Record<string, string> = {
		'zh-CN': 'zh',
		'en-US': 'en',
	};

	const DOC_TYPE_OPTIONS = [
		{ value: 'terms', label: t('legalDocuments.docType.terms') },
		{ value: 'privacy', label: t('legalDocuments.docType.privacy') },
	];

	const LANG_OPTIONS = [
		{ value: 'zh-CN', label: t('legalDocuments.lang.zh') },
		{ value: 'en-US', label: t('legalDocuments.lang.en') },
	];

	const [items, setItems] = useState<LegalDocumentItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [docTypeFilter, setDocTypeFilter] = useState('');
	const [langFilter, setLangFilter] = useState('');
	const [page, setPage] = useState(1);
	const [serverTotal, setServerTotal] = useState(0);
	const [modalOpen, setModalOpen] = useState(false);
	const [editingDoc, setEditingDoc] = useState<LegalDocumentItem | null>(null);
	const [saving, setSaving] = useState(false);
	const [form] = Form.useForm<LegalDocumentFormValues>();

	/** 请求序号守卫（P2-1）：docType 快速变化时丢弃过期响应，防止旧数据覆盖新数据 */
	const requestSeqRef = useRef(0);

	/**
	 * 拉取条款列表（ADR-003：useEffect + apiClient + API_PATHS，不引入 useQuery）。
	 * docType 变化时经 useCallback 依赖自动重新请求（AC-010 服务端透传）。
	 */
	const fetchData = useCallback(async () => {
		const seq = ++requestSeqRef.current;
		setLoading(true);
		setError(null);
		try {
			// A-274（TASK-AB1-23）：请求侧 camel 书面写（拦截器 snake 化）；分页参数经
			// toPageParams 单点（勿手写 page_size 字面量——client.ts 契约指针）。
			const res = await apiClient.get(API_PATHS.COMPLIANCE.ADMIN_LEGAL_DOCUMENTS, {
				params: { docType: docTypeFilter || undefined, ...toPageParams({ pageSize: FETCH_LIMIT }) },
			});
			// 过期响应直接丢弃（新请求已发出，旧结果不覆盖新数据）
			if (seq !== requestSeqRef.current) return;
			// A-274（TASK-AB1-23）：列表归一单点 = fromPageResult（内部 extractList/pagination），
			// 键名已由拦截器转 camel；条目形状 = LegalDocumentItem（docType/effectiveAt）。
			const { items: listItems, total } = fromPageResult<LegalDocumentItem>(res.data);
			setItems(listItems);
			setServerTotal(total);
			// 列表刷新后回到第 1 页（客户端分页语义）
			setPage(1);
		} catch {
			// 过期错误同样丢弃，避免旧请求的失败态覆盖新请求
			if (seq !== requestSeqRef.current) return;
			setError(t('legalDocuments.loadFailed'));
		} finally {
			// 仅最新请求有权关闭 loading（旧请求先返回时不清新请求的 loading）
			if (seq === requestSeqRef.current) setLoading(false);
		}
	}, [docTypeFilter, t]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	/** lang 筛选为前端内存过滤（ADR-001 方案 A：不改变请求参数） */
	const filteredItems = items.filter((i) => !langFilter || i.lang === langFilter);

	const openCreateModal = () => {
		setEditingDoc(null);
		form.resetFields();
		setModalOpen(true);
	};

	const openEditModal = (record: LegalDocumentItem) => {
		setEditingDoc(record);
		// A-274 关键守门：契约 camel 直读（旧缺陷 = 读 snake 键恒 undefined →
		// Select 空 + 编辑态 disabled + required ⇒ 校验必败且字段被禁 = 编辑死锁）
		form.setFieldsValue({
			docType: record.docType,
			version: record.version,
			title: record.title,
			lang: record.lang,
			content: record.content,
			effectiveAt: record.effectiveAt ? dayjs(record.effectiveAt) : null,
		});
		setModalOpen(true);
	};

	const closeModal = () => {
		setModalOpen(false);
		setEditingDoc(null);
		form.resetFields();
	};

	const handleCreate = async (values: LegalDocumentFormValues) => {
		setSaving(true);
		try {
			await apiClient.post(API_PATHS.COMPLIANCE.ADMIN_LEGAL_DOCUMENTS, {
				docType: values.docType,
				version: values.version,
				title: values.title,
				lang: values.lang,
				content: values.content,
				effectiveAt: values.effectiveAt?.format('YYYY-MM-DDTHH:mm:ssZ') || null,
				tenantId,
			});
			message.success(t('legalDocuments.createSuccess'));
			closeModal();
			fetchData();
		} catch (err) {
			handleApiError(err, t('legalDocuments.createFailed'));
		} finally {
			setSaving(false);
		}
	};

	/**
	 * 编辑提交（AC-008 关键守门）：
	 * PUT body 仅 4 字段 { title, lang, content, effectiveAt }（camel 书面写，拦截器 snake 化），
	 * 绝不含 docType / version / status（后端 Update 契约不可变）。
	 */
	const handleUpdate = async (values: LegalDocumentFormValues) => {
		if (!editingDoc) return;
		setSaving(true);
		try {
			await apiClient.put(API_PATHS.COMPLIANCE.ADMIN_LEGAL_DOCUMENT(editingDoc.id), {
				title: values.title,
				lang: values.lang,
				content: values.content,
				effectiveAt: values.effectiveAt?.format('YYYY-MM-DDTHH:mm:ssZ') || null,
			});
			message.success(t('legalDocuments.updateSuccess'));
			closeModal();
			fetchData();
		} catch (err) {
			handleApiError(err, t('legalDocuments.updateFailed'));
		} finally {
			setSaving(false);
		}
	};

	// W4-01（F2-01）：content 在服务端落入 jsonb 列——非法 JSON 会在 DB 层 22P02 → 500。
	// 本地前置校验（提交前拦截，不发请求）：JSON.parse 失败给可读提示；required/max 由既有规则承担。
	const validateContentJson = (_: unknown, value?: string) => {
		if (!value) return Promise.resolve();
		try {
			JSON.parse(value);
			return Promise.resolve();
		} catch {
			return Promise.reject(new Error(t('legalDocuments.contentJsonInvalid')));
		}
	};

	const handlePublish = async (id: string) => {
		try {
			await apiClient.post(API_PATHS.COMPLIANCE.ADMIN_LEGAL_DOCUMENT_PUBLISH(id));
			message.success(t('legalDocuments.publishSuccess'));
			fetchData();
		} catch (err) {
			handleApiError(err, t('legalDocuments.publishFailed'));
		}
	};

	const handleArchive = async (id: string) => {
		try {
			await apiClient.post(API_PATHS.COMPLIANCE.ADMIN_LEGAL_DOCUMENT_ARCHIVE(id));
			message.success(t('legalDocuments.archiveSuccess'));
			fetchData();
		} catch (err) {
			handleApiError(err, t('legalDocuments.archiveFailed'));
		}
	};

	/** 发布确认（AC-009：仅 draft 行可触发） */
	const confirmPublish = (record: LegalDocumentItem) => {
		modal.confirm({
			title: t('legalDocuments.publishConfirmTitle'),
			content: t('legalDocuments.publishConfirmContent'),
			okText: t('legalDocuments.publish'),
			onOk: () => handlePublish(record.id),
		});
	};

	/** 归档确认（A-276：draft（作废草稿）与 published 行均可触发） */
	const confirmArchive = (record: LegalDocumentItem) => {
		modal.confirm({
			title: t('legalDocuments.archiveConfirmTitle'),
			content: t('legalDocuments.archiveConfirmContent'),
			okText: t('legalDocuments.archive'),
			onOk: () => handleArchive(record.id),
		});
	};

	const columns: DataTableProps<LegalDocumentItem>['columns'] = [
		{
			title: t('legalDocuments.column.docType'),
			dataIndex: 'docType',
			key: 'docType',
			width: 120,
			render: (v: string) => t(`legalDocuments.docType.${v}`, { defaultValue: v }),
		},
		{
			title: t('legalDocuments.column.version'),
			dataIndex: 'version',
			key: 'version',
			width: 100,
		},
		{
			title: t('legalDocuments.column.title'),
			dataIndex: 'title',
			key: 'title',
			ellipsis: true,
		},
		{
			title: t('legalDocuments.column.lang'),
			dataIndex: 'lang',
			key: 'lang',
			width: 120,
			render: (v: string) => t(`legalDocuments.lang.${LANG_KEY_MAP[v] || v}`, { defaultValue: v }),
		},
		{
			title: t('legalDocuments.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 110,
			render: (v: string) => (
				<Tag color={STATUS_COLORS[v] || 'default'}>
					{t(`legalDocuments.status.${v}`, { defaultValue: v })}
				</Tag>
			),
		},
		{
			title: t('legalDocuments.column.effectiveAt'),
			dataIndex: 'effectiveAt',
			key: 'effectiveAt',
			width: 190,
			// A-278\u2461\uff08W1e\uff09\uff1a\u751f\u6548\u65f6\u95f4\u5217\u96f6\u683c\u5f0f\u5316\uff08\u88f8\u663e RFC3339\uff09\u2192 \u672c\u5730\u5316\u65f6\u95f4
			render: (v: string | null) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('legalDocuments.column.actions'),
			key: 'actions',
			width: 210,
			render: (_: unknown, record: LegalDocumentItem) => (
				<Space size="small" wrap>
					<Button type="link" size="small" onClick={() => openEditModal(record)}>
						{t('legalDocuments.edit')}
					</Button>
					{record.status === 'draft' && (
						<Button type="link" size="small" onClick={() => confirmPublish(record)}>
							{t('legalDocuments.publish')}
						</Button>
					)}
					{/* A-276（W1e）：弃用草稿无归档路径（旧仅 published 行）→ draft 亦可直接归档，
					    避免"发布（effective_at 空时置 now）→归档"绕行造成的非预期短时上线风险 */}
					{(record.status === 'draft' || record.status === 'published') && (
						<Button type="link" size="small" danger onClick={() => confirmArchive(record)}>
							{t('legalDocuments.archive')}
						</Button>
					)}
				</Space>
			),
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="mb-1">{t('legalDocuments.title')}</h2>
					<p className="text-sm text-neutral-600">{t('legalDocuments.subtitle')}</p>
				</div>
				<Button type="primary" icon={<Plus size="1em" />} onClick={openCreateModal}>
					{t('legalDocuments.create')}
				</Button>
			</div>

			<Space wrap>
				{/* docType 筛选：服务端透传（AC-010） */}
				<Select
					style={{ width: 200 }}
					value={docTypeFilter}
					placeholder={t('legalDocuments.filter.docType')}
					options={[{ value: '', label: t('legalDocuments.filter.all') }, ...DOC_TYPE_OPTIONS]}
					onChange={(v: string) => {
						setDocTypeFilter(v);
						setPage(1);
					}}
				/>
				{/* lang 筛选：前端内存过滤（ADR-001，不改变请求参数） */}
				<Select
					style={{ width: 200 }}
					value={langFilter}
					placeholder={t('legalDocuments.filter.lang')}
					options={[{ value: '', label: t('legalDocuments.filter.all') }, ...LANG_OPTIONS]}
					onChange={(v: string) => {
						setLangFilter(v);
						setPage(1);
					}}
				/>
			</Space>

			{error ? (
				<PageError message={t('legalDocuments.loadFailed')} retry={fetchData} />
			) : (
				<>
					{/* 守卫 banner（ADR-001）：服务端总数超拉取上限时提示使用筛选 */}
					{serverTotal > FETCH_LIMIT && (
						<Alert variant="warning" title={t('legalDocuments.loadSubsetWarning')} />
					)}
					<DataTable<LegalDocumentItem>
						columns={columns}
						dataSource={filteredItems}
						rowKey="id"
						loading={loading}
						pagination={{
							current: page,
							pageSize: PAGE_SIZE,
							total: filteredItems.length,
							showSizeChanger: false,
							showTotal: (total) => t('paginationTotal', { total }),
							onChange: (currentPage: number) => setPage(currentPage),
						}}
						scroll={{ x: 900 }}
						locale={{
							emptyText: (
								<Empty
									description={
										langFilter || docTypeFilter
											? t('legalDocuments.filterHint')
											: t('legalDocuments.empty')
									}
								/>
							),
						}}
					/>
				</>
			)}

			<Modal
				title={editingDoc ? t('legalDocuments.edit') : t('legalDocuments.create')}
				open={modalOpen}
				onCancel={closeModal}
				onOk={() => form.submit()}
				confirmLoading={saving}
				width={720}
			>
				<Form form={form} layout="vertical" onFinish={editingDoc ? handleUpdate : handleCreate}>
					<Form.Item
						name="docType"
						label={t('legalDocuments.column.docType')}
						rules={[{ required: true }]}
					>
						{/* 编辑时只读（AC-008）：docType 参与唯一键，禁止修改 */}
						<Select
							options={DOC_TYPE_OPTIONS}
							disabled={!!editingDoc}
							placeholder={t('legalDocuments.form.docTypePlaceholder')}
						/>
					</Form.Item>
					<Form.Item
						name="version"
						label={t('legalDocuments.column.version')}
						rules={[{ required: true }, { max: 20 }]}
					>
						{/* 编辑时只读（AC-008）：version 参与版本语义，禁止修改 */}
						<Input disabled={!!editingDoc} maxLength={20} placeholder="1.0" />
					</Form.Item>
					<Form.Item
						name="title"
						label={t('legalDocuments.column.title')}
						rules={[{ required: true }, { max: 255 }]}
					>
						<Input maxLength={255} showCount />
					</Form.Item>
					<Form.Item
						name="lang"
						label={t('legalDocuments.column.lang')}
						rules={[{ required: true }]}
					>
						<Select options={LANG_OPTIONS} placeholder={t('legalDocuments.form.langPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="content"
						label={t('legalDocuments.column.content')}
						rules={[{ required: true }, { max: 100000 }, { validator: validateContentJson }]}
						extra={t('legalDocuments.contentJsonHint')}
					>
						{/* content 为纯文本 TextArea（防 XSS，禁富文本渲染器）；W4-01：须为合法 JSON */}
						<Input.TextArea rows={10} maxLength={100000} showCount />
					</Form.Item>
					<Form.Item name="effectiveAt" label={t('legalDocuments.column.effectiveAt')}>
						<DatePicker showTime className="w-full" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

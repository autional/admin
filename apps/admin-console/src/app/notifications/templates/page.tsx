'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, Tabs, Tooltip, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import {
	PlusOutlined,
	EditOutlined,
	DeleteOutlined,
	SendOutlined,
	CodeOutlined,
	CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { extractItem } from '@autional/shared';
import {
	useNotificationTemplates,
	useCreateNotificationTemplate,
	useUpdateNotificationTemplate,
	useDeleteNotificationTemplate,
	useTestNotification,
	useCloneNotificationTemplateToLocale,
	type NotificationTemplateRecord,
} from '@/hooks/use-notifications';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import { createNotificationTemplateSchema } from '@/lib/validators';

const { Option } = Select;
const { TextArea } = Input;

// A-151（TASK-AB1-25）：行模型对齐 TemplateResponse（type 取代旧 channel）；配色仅呈现用途。
const TYPE_COLORS: Record<string, string> = {
	system: 'blue',
	user: 'green',
	alert: 'orange',
	reminder: 'purple',
	promotion: 'gold',
};

const TEMPLATE_TYPES = ['system', 'user', 'alert', 'reminder', 'promotion'] as const;
// 测试发送渠道（TestNotificationRequest.channel binding:required；dto.go:524-527）
const TEST_CHANNELS = ['email', 'sms', 'push'] as const;

const VARIABLES = ['{{username}}', '{{tenant_name}}', '{{reset_url}}', '{{code}}', '{{time}}'];

export default function NotificationTemplatesPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [testModalVisible, setTestModalVisible] = useState(false);
	const [cloneModalVisible, setCloneModalVisible] = useState(false);
	const [editing, setEditing] = useState<NotificationTemplateRecord | null>(null);
	const [cloning, setCloning] = useState<NotificationTemplateRecord | null>(null);
	const [form] = Form.useForm();
	const [testForm] = Form.useForm();
	const [cloneForm] = Form.useForm();
	const [activeLang, setActiveLang] = useState('zh-CN');
	const testChannel = Form.useWatch('channel', testForm);

	const { data = [], isLoading, error, refetch } = useNotificationTemplates();
	const createMut = useCreateNotificationTemplate();
	const updateMut = useUpdateNotificationTemplate();
	const deleteMut = useDeleteNotificationTemplate();
	const testMut = useTestNotification();
	const cloneMut = useCloneNotificationTemplateToLocale();

	const typeLabel = (type: string) => t(`notifications.stats.type.${type}`, type);

	const closeModal = () => {
		setModalVisible(false);
		setEditing(null);
		form.resetFields();
	};

	// A-151（TASK-AB1-25）：提交体对齐后端契约 ——
	// create = CreateTemplateRequest{code,name,type,subject,content 必填}（dto.go:312-320）；
	// en 走两步：先建 zh，再 clone-to-locale（原生 i18n 机制，不发明 wire 字段）；
	// update = UpdateTemplateRequest{name,type,subject,content}（dto.go:349-356，无 code 字段）。
	const handleSave = async (values: any) => {
		if (editing) {
			try {
				await updateMut.mutateAsync({
					id: editing.templateId,
					data: {
						name: values.name,
						type: values.type,
						subject: values.subject,
						content: values.content,
					},
				});
				message.success(t('notifications.templates.updateSuccess'));
				closeModal();
			} catch (err) {
				handleApiError(err, t('notifications.templates.saveFailed'));
			}
			return;
		}
		// zod 先行（CreateTemplateRequest 必填集；编辑无 code 字段，不适用该 schema）
		const result = createNotificationTemplateSchema.safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		try {
			const created = await createMut.mutateAsync({
				code: values.code,
				name: values.name,
				type: values.type,
				subject: values.subject,
				content: values.content,
			});
			message.success(t('notifications.templates.createSuccess'));
			// en 两步路径：create 响应（template_id → 拦截器 camel）取 id 后克隆到 en-US；
			// 体 = CloneTemplateToLocaleRequest{target_locale,title,content}（dto.go:902-907）。
			const createdId = extractItem<{ templateId?: string }>(created)?.templateId;
			if (createdId && (values.enTitle || values.enContent)) {
				try {
					await cloneMut.mutateAsync({
						id: createdId,
						data: {
							targetLocale: 'en-US',
							title: values.enTitle,
							content: values.enContent,
						},
					});
					message.success(t('notifications.templates.cloneSuccess'));
				} catch (cloneErr) {
					handleApiError(cloneErr, t('notifications.templates.cloneFailed'));
				}
			}
			closeModal();
		} catch (err) {
			handleApiError(err, t('notifications.templates.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('notifications.templates.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('notifications.templates.deleteFailed'));
		}
	};

	// A-155：行内「克隆到语言」——体 {target_locale,title,content}，调 clone-to-locale 端点。
	const handleCloneToLocale = async (values: any) => {
		if (!cloning?.templateId) return;
		try {
			await cloneMut.mutateAsync({
				id: cloning.templateId,
				data: {
					targetLocale: values.targetLocale,
					title: values.title,
					content: values.content,
				},
			});
			message.success(t('notifications.templates.cloneSuccess'));
			setCloneModalVisible(false);
			setCloning(null);
			cloneForm.resetFields();
		} catch (err) {
			handleApiError(err, t('notifications.templates.cloneFailed'));
		}
	};

	const insertVariable = (variable: string) => {
		const fieldName = activeLang === 'zh-CN' ? 'content' : 'enContent';
		const current = form.getFieldValue(fieldName) || '';
		form.setFieldValue(fieldName, current + variable);
	};

	const handleTestSend = async (values: any) => {
		try {
			await testMut.mutateAsync({ channel: values.channel, target: values.target });
			message.success(t('notifications.templates.testSubmitSuccess'));
			setTestModalVisible(false);
			testForm.resetFields();
		} catch (err) {
			handleApiError(err, t('notifications.templates.testSubmitFailed'));
		}
	};

	const columns = [
		{ title: t('notifications.templates.templateName'), dataIndex: 'name', key: 'name' },
		{
			title: t('notifications.templates.notificationType'),
			dataIndex: 'type',
			key: 'type',
			render: (type: string) => (
				<Tag color={TYPE_COLORS[type] || 'default'}>{typeLabel(type)}</Tag>
			),
		},
		{
			title: t('notifications.templates.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v?: string) => (v ? v.slice(0, 10) : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: NotificationTemplateRecord) => (
				<Space size="small">
					<Button
						type="text"
						size="small"
						icon={<EditOutlined />}
						onClick={() => {
							setEditing(record);
							setActiveLang('zh-CN');
							form.setFieldsValue({
								name: record.name,
								type: record.type,
								subject: record.subject,
								content: record.content,
							});
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<SendOutlined />}
						onClick={() => setTestModalVisible(true)}
					>
						{t('notifications.templates.test')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<CopyOutlined />}
						onClick={() => {
							setCloning(record);
							setCloneModalVisible(true);
						}}
					>
						{t('notifications.templates.cloneToLocale')}
					</Button>
					<Popconfirm
						title={t('notifications.templates.confirmDelete')}
						onConfirm={() => handleDelete(record.templateId)}
					>
						<Button type="text" danger size="small" icon={<DeleteOutlined />}>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	const zhTab = {
		key: 'zh-CN',
		label: t('notifications.templates.langZhCN'),
		children: (
			<Form.Item
				name="content"
				label={t('notifications.templates.contentHtml')}
				rules={[{ required: true }]}
			>
				<TextArea rows={8} placeholder={t('notifications.templates.supportHtml')} />
			</Form.Item>
		),
	};

	// en 字段仅创建路径：提交后由 clone-to-locale 落库（编辑态用行内「克隆到语言」）。
	const enTab = {
		key: 'en-US',
		label: t('notifications.templates.langEnUS'),
		children: (
			<>
				<div className="mb-2 text-sm text-neutral-600">
					{t('notifications.templates.enContentHint')}
				</div>
				<Form.Item name="enTitle" label={t('notifications.templates.enTitle')}>
					<Input />
				</Form.Item>
				<Form.Item name="enContent" label={t('notifications.templates.enContent')}>
					<TextArea rows={8} placeholder={t('notifications.templates.supportHtml')} />
				</Form.Item>
			</>
		),
	};

	return (
		<div>
			<ConsolePageHeader
				title={t('notifications.templates.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								setEditing(null);
								setActiveLang('zh-CN');
								form.resetFields();
								setModalVisible(true);
							}}
						>
							{t('notifications.templates.createTemplate')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError
					message={t('notifications.templates.loadError')}
					retry={refetch}
					className="mb-4"
				/>
			)}
			<DataTable
				rowKey="templateId"
				columns={columns}
				dataSource={data}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={
					editing
						? t('notifications.templates.editTemplate')
						: t('notifications.templates.createTemplate')
				}
				open={modalVisible}
				onCancel={closeModal}
				onOk={() => form.submit()}
				width={720}
				className="w-full max-w-[720px]"
				destroyOnHidden
			>
				<Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ type: 'system' }}>
					{/* code 仅创建可填（UpdateTemplateRequest 无该字段；响应 TemplateResponse 亦不回传） */}
					{!editing && (
						<Form.Item
							name="code"
							label={t('notifications.templates.code')}
							rules={[{ required: true }]}
						>
							<Input placeholder={t('notifications.templates.codePlaceholder')} />
						</Form.Item>
					)}
					<Form.Item
						name="name"
						label={t('notifications.templates.templateName')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('notifications.templates.namePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="type"
						label={t('notifications.templates.notificationType')}
						rules={[{ required: true }]}
					>
						<Select>
							{TEMPLATE_TYPES.map((v) => (
								<Option key={v} value={v}>
									{typeLabel(v)}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item
						name="subject"
						label={t('notifications.templates.subject')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('notifications.templates.subjectPlaceholder')} />
					</Form.Item>

					<div className="mb-2">
						<span className="text-sm text-neutral-600 mr-2">
							{t('notifications.templates.insertVariable')}:
						</span>
						<Space size="small" wrap>
							{VARIABLES.map((v) => (
								<Tooltip
									title={t('notifications.templates.insertVariableTip').replace('{}', v)}
									key={v}
								>
									<Button size="small" icon={<CodeOutlined />} onClick={() => insertVariable(v)}>
										{v}
									</Button>
								</Tooltip>
							))}
						</Space>
					</div>

					<Tabs
						activeKey={activeLang}
						onChange={setActiveLang}
						items={editing ? [zhTab] : [zhTab, enTab]}
					/>
				</Form>
			</Modal>

			{/* A-155：行内「克隆到语言」表单（target_locale + title + content） */}
			<Modal
				title={t('notifications.templates.cloneToLocale')}
				open={cloneModalVisible}
				onCancel={() => {
					setCloneModalVisible(false);
					setCloning(null);
					cloneForm.resetFields();
				}}
				onOk={() => cloneForm.submit()}
				width={560}
				className="w-full max-w-[560px]"
				destroyOnHidden
			>
				<Form
					form={cloneForm}
					layout="vertical"
					onFinish={handleCloneToLocale}
					initialValues={{ targetLocale: 'en-US' }}
				>
					<Form.Item
						name="targetLocale"
						label={t('notifications.templates.targetLocale')}
						rules={[{ required: true }]}
					>
						<Input placeholder="en-US" />
					</Form.Item>
					<Form.Item name="title" label={t('notifications.templates.cloneTitle')}>
						<Input />
					</Form.Item>
					<Form.Item name="content" label={t('notifications.templates.cloneContent')}>
						<TextArea rows={6} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('notifications.templates.testSend')}
				open={testModalVisible}
				onCancel={() => {
					setTestModalVisible(false);
					testForm.resetFields();
				}}
				onOk={() => testForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form
					form={testForm}
					layout="vertical"
					onFinish={handleTestSend}
					initialValues={{ channel: 'email' }}
				>
					<Form.Item
						name="channel"
						label={t('notifications.templates.channelType')}
						rules={[{ required: true }]}
					>
						<Select placeholder={t('notifications.templates.selectChannel')}>
							{TEST_CHANNELS.map((c) => (
								<Option key={c} value={c}>
									{t(`notifications.templates.channel.${c}`)}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item
						name="target"
						label={
							testChannel === 'sms'
								? t('notifications.templates.testPhone')
								: t('notifications.templates.testEmailOrUserId')
						}
						rules={[{ required: true }]}
					>
						<Input placeholder={testChannel === 'sms' ? '13800138000' : 'test@example.com'} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

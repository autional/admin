'use client';
// @generated-api-exempt: 1 key(s) [PROFILE.ADMIN_FIELD_SCHEMA] lack generated func

import { useState, useEffect } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Button, Modal, Form, Input, Select, Switch, InputNumber, Space, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { AppPageHeader, EmptyState, LoadingScreen, SectionCard } from '@autional/ui';
import { apiClient, API_PATHS } from '@autional/shared';
import {
	adminProfilesFieldSchemas,
	adminProfilesFieldSchemasPost,
} from '@autional/shared/generated/api';

const FIELD_TYPES = [
	{ label: 'Text', value: 'text' },
	{ label: 'Number', value: 'number' },
	{ label: 'Date', value: 'date' },
	{ label: 'Select', value: 'select' },
	{ label: 'Multi Select', value: 'multiselect' },
	{ label: 'URL', value: 'url' },
	{ label: 'Email', value: 'email' },
];
const CLASSIFICATIONS = [
	{ label: 'Public', value: 'public' },
	{ label: 'PII', value: 'pii' },
	{ label: 'Sensitive', value: 'sensitive' },
	{ label: 'Internal', value: 'internal' },
];

export default function FieldSchemaPage() {
	const { t } = useTranslation();
	const [schemas, setSchemas] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<any>(null);
	const [form] = Form.useForm();

	const fetchSchemas = () => {
		adminProfilesFieldSchemas()
			.then((res) => setSchemas((res as any)?.schemas || []))
			.finally(() => setLoading(false));
	};
	useEffect(() => {
		fetchSchemas();
	}, []);

	const handleCreate = async (values: any) => {
		try {
			if (editing) {
				await apiClient.put(API_PATHS.PROFILE.ADMIN_FIELD_SCHEMA(editing.fieldKey), values);
				message.success(t('profileFields.updated'));
			} else {
				await adminProfilesFieldSchemasPost(values);
				message.success(t('profileFields.created'));
			}
			setModalOpen(false);
			setEditing(null);
			form.resetFields();
			fetchSchemas();
		} catch (err: any) {
			message.error(err?.message || t('profileFields.saveFailed'));
		}
	};

	const handleDelete = async (fieldKey: string) => {
		try {
			await apiClient.delete(API_PATHS.PROFILE.ADMIN_FIELD_SCHEMA(fieldKey));
			message.success(t('profileFields.deleted'));
			fetchSchemas();
		} catch (err: any) {
			message.error(err?.message || t('profileFields.deleteFailed'));
		}
	};

	const openEdit = (record: any) => {
		setEditing(record);
		form.setFieldsValue({
			field_key: record.fieldKey,
			display_name: record.displayName,
			field_type: record.fieldType,
			is_required: record.isRequired,
			data_classification: record.dataClassification,
			sort_order: record.sortOrder,
		});
		setModalOpen(true);
	};

	if (loading) return <LoadingScreen />;

	const columns = [
		{ title: t('profileFields.column.fieldKey'), dataIndex: 'fieldKey', key: 'fieldKey' },
		{
			title: t('profileFields.column.displayName'),
			dataIndex: 'displayName',
			key: 'displayName',
		},
		{ title: t('profileFields.column.type'), dataIndex: 'fieldType', key: 'fieldType' },
		{
			title: t('profileFields.column.required'),
			dataIndex: 'isRequired',
			key: 'isRequired',
			render: (v: boolean) => (v ? t('profileFields.yes') : t('profileFields.no')),
		},
		{ title: t('profileFields.column.sort'), dataIndex: 'sortOrder', key: 'sortOrder' },
		{
			title: t('profileFields.column.class'),
			dataIndex: 'dataClassification',
			key: 'dataClassification',
		},
		{
			title: t('profileFields.column.actions'),
			key: 'actions',
			render: (_: any, r: any) => (
				<Space>
					<Button size="small" icon={<Pencil size="1em" />} onClick={() => openEdit(r)}>
						{t('profileFields.action.edit')}
					</Button>
					<Popconfirm
						title={t('profileFields.deleteConfirm')}
						onConfirm={() => handleDelete(r.fieldKey)}
					>
						<Button size="small" danger icon={<Trash2 size="1em" />}>
							{t('profileFields.action.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('profileFields.title')} description={t('profileFields.subtitle')} />
			<SectionCard>
				<Button
					type="primary"
					icon={<Plus size="1em" />}
					onClick={() => {
						setEditing(null);
						form.resetFields();
						setModalOpen(true);
					}}
					className="mb-4"
				>
					{t('profileFields.addField')}
				</Button>
				<DataTable
					columns={columns}
					dataSource={schemas}
					rowKey="fieldKey"
					locale={{
						emptyText: (
							<EmptyState
								title={t('profileFields.emptyTitle')}
								description={t('profileFields.emptyDescription')}
							/>
						),
					}}
					scroll={{ x: 800 }}
				/>
			</SectionCard>
			<Modal
				title={editing ? t('profileFields.editField') : t('profileFields.addField')}
				open={modalOpen}
				onCancel={() => {
					setModalOpen(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				width={600}
				className="w-full max-w-[600px]"
			>
				<Form form={form} layout="vertical" onFinish={handleCreate}>
					<Form.Item
						name="field_key"
						label={t('profileFields.form.fieldKey')}
						rules={[{ required: true }]}
					>
						<Input disabled={!!editing} />
					</Form.Item>
					<Form.Item
						name="field_type"
						label={t('profileFields.form.fieldType')}
						rules={[{ required: true }]}
					>
						<Select
							options={FIELD_TYPES.map((o) => ({
								...o,
								label: t(`profileFields.fieldType.${o.value}`),
							}))}
						/>
					</Form.Item>
					<Form.Item
						name="display_name"
						label={t('profileFields.form.displayName')}
						rules={[{ required: true }]}
					>
						<Input />
					</Form.Item>
					<Form.Item
						name="is_required"
						label={t('profileFields.form.required')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item
						name="requires_consent"
						label={t('profileFields.form.requiresConsent')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
					<Form.Item name="data_classification" label={t('profileFields.form.dataClassification')}>
						<Select
							options={CLASSIFICATIONS.map((o) => ({
								...o,
								label: t(`profileFields.classification.${o.value}`),
							}))}
						/>
					</Form.Item>
					<Form.Item name="validation_regex" label={t('profileFields.form.validationRegex')}>
						<Input placeholder={t('profileFields.form.regexPlaceholder')} />
					</Form.Item>
					<Form.Item name="placeholder" label={t('profileFields.form.placeholder')}>
						<Input />
					</Form.Item>
					<Form.Item name="help_text" label={t('profileFields.form.helpText')}>
						<Input.TextArea rows={2} />
					</Form.Item>
					<Form.Item name="sort_order" label={t('profileFields.form.sortOrder')}>
						<InputNumber className="w-full" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

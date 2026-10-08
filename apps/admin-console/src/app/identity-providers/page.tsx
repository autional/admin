'use client';

import React, { useState } from 'react';
import { Tag, Button, Space, Modal, Form, Input, Select, Popconfirm, Upload } from 'antd';
import { message } from '@/lib/antd-app';
import {
	CheckCircle2,
	Pencil,
	Plug,
	Plus,
	Trash2,
} from 'lucide-react';
import {
	useIdentityProviders,
	useCreateIdentityProvider,
	useUpdateIdentityProvider,
	useDeleteIdentityProvider,
	useTestIdentityProvider,
	useLdapHealth,
	useTestLdapConnection,
} from '@/hooks/use-identity-providers';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { Alert, AppPageHeader } from '@autional/ui';
import { createIdpSchema } from '@/lib/validators';
import { useTranslation } from 'react-i18next';
import type {
	LdapHealthResponse,
	LdapTestConnectionResponse,
} from '@autional/shared/generated/types';

interface IdPRecord {
	id: string;
	name: string;
	type: 'oauth' | 'saml' | 'ldap';
	status: 'active' | 'inactive';
	lastTestedAt?: string;
	config?: Record<string, any>;
}

const TYPE_LABELS: Record<string, string> = {
	oauth: 'OAuth',
	saml: 'SAML',
	ldap: 'LDAP',
};

/**
 * A-37：未配置 LDAP 时后端返回 503（ErrCodeLDAPNotConfigured=61001801，
 * service-identity errors.go:143-144/353-354），区别于其他健康检查失败。
 */
function isLdapNotConfigured(err: unknown): boolean {
	const e = err as { response?: { status?: number; data?: { code?: number } } } | undefined;
	return e?.response?.status === 503 || e?.response?.data?.code === 61001801;
}

export default function IdentityProvidersPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<IdPRecord | null>(null);
	const [form] = Form.useForm();
	const [submitting, setSubmitting] = useState(false);
	const [testingId, setTestingId] = useState<string | null>(null);
	const [metadataFileList, setMetadataFileList] = useState<any[]>([]);

	// LDAP: test-connection state for the inline form button
	const [testConnResult, setTestConnResult] = useState<LdapTestConnectionResponse | null>(null);
	const [testingConnection, setTestingConnection] = useState(false);

	const { data = [], isLoading, error, refetch } = useIdentityProviders();
	const createMut = useCreateIdentityProvider();
	const updateMut = useUpdateIdentityProvider();
	const deleteMut = useDeleteIdentityProvider();
	const testMut = useTestIdentityProvider();

	// LDAP hooks
	const {
		data: ldapHealth = [],
		isLoading: ldapHealthLoading,
		error: ldapHealthError,
	} = useLdapHealth();
	const testConnMut = useTestLdapConnection();

	const STATUS_LABELS: Record<string, string> = {
		active: t('common.enable'),
		inactive: t('common.disable'),
	};

	const openModal = (record?: IdPRecord) => {
		if (record) {
			setEditing(record);
			form.setFieldsValue({
				type: record.type,
				name: record.name,
				status: record.status,
				...record.config,
			});
		} else {
			setEditing(null);
			form.resetFields();
			form.setFieldsValue({ type: 'oauth', status: 'active' });
		}
		setMetadataFileList([]);
		setTestConnResult(null);
		setModalVisible(true);
	};

	const closeModal = () => {
		setModalVisible(false);
		setEditing(null);
		form.resetFields();
		setMetadataFileList([]);
		setTestConnResult(null);
	};

	const handleSubmit = async (values: any) => {
		const result = createIdpSchema.passthrough().safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		const v = result.data;
		setSubmitting(true);
		try {
			const payload: any = {
				name: v.name,
				type: v.type,
				status: v.status || 'active',
				config: {},
			};

			if (v.type === 'oauth') {
				payload.config = {
					clientId: v.clientId,
					clientSecret: v.clientSecret,
					authorizationUrl: v.authorizationUrl,
					scope: v.scope,
					redirectUrl: v.redirectUrl,
				};
			} else if (v.type === 'saml') {
				payload.config = {
					metadataUrl: v.metadataUrl,
					acsUrl: v.acsUrl,
					entityId: v.entityId,
				};
				if (metadataFileList.length > 0 && metadataFileList[0].originFileObj) {
					try {
						const content = await metadataFileList[0].originFileObj.text();
						payload.config.metadataContent = content;
					} catch {
						// ignore
					}
				}
			} else if (v.type === 'ldap') {
				payload.config = {
					serverUrl: v.serverUrl,
					bindDn: v.bindDn,
					bindPassword: v.bindPassword,
					baseDn: v.baseDn,
				};
			}

			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data: payload });
				message.success(t('idp.updateSuccess'));
			} else {
				await createMut.mutateAsync(payload);
				message.success(t('idp.createSuccess'));
			}
			closeModal();
		} catch (err) {
			handleApiError(err, t('idp.saveFailed'));
		} finally {
			setSubmitting(false);
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('idp.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('idp.deleteFailed'));
		}
	};

	const handleTest = async (id: string) => {
		setTestingId(id);
		try {
			await testMut.mutateAsync(id);
			message.success(t('idp.testSuccess'));
		} catch (err) {
			handleApiError(err, t('idp.testFailed'));
		} finally {
			setTestingId(null);
		}
	};

	// LDAP: test connection from the form
	const handleTestLdapConnection = async () => {
		const directoryName = form.getFieldValue('name');
		if (!directoryName) {
			message.warning(t('idp.form.enterNameFirst', 'Please enter a name first'));
			return;
		}

		setTestingConnection(true);
		setTestConnResult(null);
		try {
			const res = await testConnMut.mutateAsync({ directoryName });
			setTestConnResult(res);
			if (res.success) {
				message.success(t('idp.testSuccess'));
			} else {
				message.warning(res.error || t('idp.testFailed'));
			}
		} catch (err) {
			handleApiError(err, t('idp.testFailed'));
		} finally {
			setTestingConnection(false);
		}
	};

	const columns = [
		{ title: t('common.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('common.type'),
			dataIndex: 'type',
			key: 'type',
			render: (type: string) => {
				const colors: Record<string, string> = { oauth: 'blue', saml: 'purple', ldap: 'orange' };
				return <Tag color={colors[type] || 'default'}>{TYPE_LABELS[type] || type}</Tag>;
			},
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag color={status === 'active' ? 'success' : 'default'}>
					{STATUS_LABELS[status] || status}
				</Tag>
			),
		},
		{
			title: t('idp.column.lastTested'),
			dataIndex: 'lastTestedAt',
			key: 'lastTestedAt',
			render: (v?: string) => v || '-',
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: IdPRecord) => (
				<Space size="small">
					<Button
						type="link"
						size="small"
						icon={<Pencil size="1em" />}
						onClick={() => openModal(record)}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="link"
						size="small"
						icon={<CheckCircle2 size="1em" />}
						loading={testingId === record.id}
						onClick={() => handleTest(record.id)}
					>
						{t('idp.testConnection')}
					</Button>
					<Popconfirm title={t('idp.confirmDelete')} onConfirm={() => handleDelete(record.id)}>
						<Button type="link" size="small" danger icon={<Trash2 size="1em" />}>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	const type = Form.useWatch('type', form);

	return (
		<div>
			<AppPageHeader
				title={t('idp.title')}
				actions={
					<>
						<Button type="primary" icon={<Plus size="1em" />} onClick={() => openModal()}>
							{t('idp.createBtn')}
						</Button>
					</>
				}
			/>

			{/* LDAP Health Status Section（A-37 三态：加载中不渲染 / 有健康数据渲染列表 /
			    未配置（503/61001801）渲染中性块 / 其他错误渲染失败块） */}
			{!ldapHealthLoading && ldapHealth.length > 0 && (
				<div className="mb-4">
					<div className="text-sm font-medium text-neutral-700 mb-2">
						{t('idp.ldapHealthTitle', 'LDAP Directory Health')}
					</div>
					<Space direction="vertical" className="w-full" size="small">
						{ldapHealth.map((h: LdapHealthResponse, i: number) => (
							<Alert
								key={h.directoryName || i}
								variant={h.healthy ? 'success' : 'danger'}
								title={
									<span>
										<strong>{h.directoryName || `Directory #${i + 1}`}</strong>
										{' — '}
										{h.healthy
											? t('idp.ldapHealthy', 'Healthy')
											: t('idp.ldapUnhealthy', 'Unhealthy')}
										{h.error ? `: ${h.error}` : ''}
									</span>
								}
							/>
						))}
					</Space>
				</div>
			)}
			{!ldapHealthLoading && ldapHealth.length === 0 && ldapHealthError && (
				<div className="mb-4">
					<Alert
						variant={isLdapNotConfigured(ldapHealthError) ? 'info' : 'danger'}
						title={
							isLdapNotConfigured(ldapHealthError)
								? t('idp.ldapNotConfigured', 'No LDAP directory configured')
								: t('idp.ldapHealthError', 'Failed to load LDAP health status')
						}
					/>
				</div>
			)}

			{error && <PageError message={t('idp.loadError')} retry={refetch} className="mb-4" />}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={editing ? t('idp.editIdp') : t('idp.createIdp')}
				open={modalVisible}
				onCancel={closeModal}
				onOk={() => form.submit()}
				confirmLoading={submitting}
				width={640}
				className="w-full max-w-[640px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSubmit}>
					<Form.Item name="type" label={t('idp.form.type')} rules={[{ required: true }]}>
						<Select
							disabled={!!editing}
							options={[
								{ label: 'OAuth', value: 'oauth' },
								{ label: 'SAML', value: 'saml' },
								{ label: 'LDAP', value: 'ldap' },
							]}
						/>
					</Form.Item>
					<Form.Item name="name" label={t('idp.form.name')} rules={[{ required: true }]}>
						<Input />
					</Form.Item>
					<Form.Item name="status" label={t('idp.form.status')} initialValue="active">
						<Select
							options={[
								{ label: t('idp.status.enabled'), value: 'active' },
								{ label: t('idp.status.disabled'), value: 'inactive' },
							]}
						/>
					</Form.Item>

					{type === 'oauth' && (
						<>
							<Form.Item name="clientId" label={t('idp.form.clientId')} rules={[{ required: true }]}>
								<Input />
							</Form.Item>
							<Form.Item
								name="clientSecret"
								label={t('idp.form.clientSecret')}
								rules={[{ required: true }]}
							>
								<Input.Password />
							</Form.Item>
							<Form.Item
								name="authorizationUrl"
								label={t('idp.form.authUrl')}
								rules={[{ required: true }]}
							>
								<Input placeholder="https://idp.example.com/oauth/api/v1/oauth/authorize" />
							</Form.Item>
							<Form.Item name="scope" label={t('idp.form.scope')}>
								<Input placeholder="openid profile email" />
							</Form.Item>
							<Form.Item
								name="redirectUrl"
								label={t('idp.form.redirectUrl')}
								rules={[{ required: true }]}
							>
								<Input placeholder="https://your-app.example.com/callback" />
							</Form.Item>
						</>
					)}

					{type === 'saml' && (
						<>
							<Form.Item name="metadataUrl" label={t('idp.form.metadataUrl')}>
								<Input placeholder="https://idp.example.com/metadata.xml" />
							</Form.Item>
							<Form.Item label={t('idp.form.metadataFile')}>
								<Upload
									beforeUpload={() => false}
									fileList={metadataFileList}
									onChange={({ fileList }) => setMetadataFileList(fileList)}
									maxCount={1}
								>
									<Button>{t('idp.form.selectFile')}</Button>
								</Upload>
							</Form.Item>
							<Form.Item name="acsUrl" label={t('idp.form.acsUrl')} rules={[{ required: true }]}>
								<Input placeholder="https://your-app.example.com/saml/acs" />
							</Form.Item>
							<Form.Item
								name="entityId"
								label={t('idp.form.entityId')}
								rules={[{ required: true }]}
							>
								<Input placeholder="https://your-app.example.com" />
							</Form.Item>
						</>
					)}

					{type === 'ldap' && (
						<>
							<Form.Item
								name="serverUrl"
								label={t('idp.form.serverUrl')}
								rules={[{ required: true }]}
							>
								<Input placeholder="ldap://ldap.example.com:389" />
							</Form.Item>
							<Form.Item name="bindDn" label={t('idp.form.bindDn')} rules={[{ required: true }]}>
								<Input placeholder="cn=admin,dc=example,dc=com" />
							</Form.Item>
							<Form.Item
								name="bindPassword"
								label={t('idp.form.bindPassword')}
								rules={[{ required: true }]}
							>
								<Input.Password />
							</Form.Item>
							<Form.Item name="baseDn" label={t('idp.form.baseDn')} rules={[{ required: true }]}>
								<Input placeholder="dc=example,dc=com" />
							</Form.Item>

							{/* Test Connection button */}
							<Form.Item>
								<Button
									icon={<Plug size="1em" />}
									loading={testingConnection}
									onClick={handleTestLdapConnection}
								>
									{t('idp.testConnection')}
								</Button>
							</Form.Item>

							{/* Test connection result feedback */}
							{testConnResult && (
								<Alert
									variant={testConnResult.success ? 'success' : 'danger'}
									closable
									onClose={() => setTestConnResult(null)}
									title={
										testConnResult.success
											? `${t('idp.testSuccess')} (${testConnResult.latencyMs ?? '?'}ms)`
											: testConnResult.error || t('idp.testFailed')
									}
									className="mb-4"
								/>
							)}
						</>
					)}
				</Form>
			</Modal>
		</div>
	);
}

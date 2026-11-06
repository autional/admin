'use client';

import React, { useState } from 'react';
import { Tag, Button, Space, Modal, Form, Input, Select, Popconfirm, Upload } from 'antd';
import { message } from '@/lib/antd-app';
import {
	CheckCircle2,
	Pencil,
	Plug,
	Plus,
	ShieldCheck,
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
	useSamlSigningStatus,
	useUpdateSamlSigningPolicy,
} from '@/hooks/use-identity-providers';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { Alert, AppPageHeader } from '@autional/ui';
import { createIdpSchema } from '@/lib/validators';
import { useTranslation } from 'react-i18next';
import { semanticsOfError } from '@/lib/error-semantics';
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
 * 「需人工动作、非故障」判定 —— **由契约驱动**，不再手写 503/61001801。
 *
 * 契约中 `ui_observation === 'action_required'` 才具备此语义（当前 = ErrCodeLDAPNotConfigured=61001801：
 * 「未配置」需人工配置，重试必败）。**其余 5xx（502/500…）是真实故障** → 走 danger 分支
 * （此前「任何 503 → 中性块」会把真实故障也说成「未配置」）。
 */
function isActionRequiredError(err: unknown): boolean {
	return semanticsOfError(err)?.uiObservation === 'action_required';
}

export default function IdentityProvidersPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<IdPRecord | null>(null);
	const [form] = Form.useForm();
	const [submitting, setSubmitting] = useState(false);
	const [testingId, setTestingId] = useState<string | null>(null);
	const [metadataFileList, setMetadataFileList] = useState<any[]>([]);
	// SAML 签名策略弹窗
	const [signingRecord, setSigningRecord] = useState<IdPRecord | null>(null);
	const [signAuthnMode, setSignAuthnMode] = useState<'inherit' | 'on' | 'off'>('inherit');
	const [signLogoutMode, setSignLogoutMode] = useState<'inherit' | 'on' | 'off'>('inherit');

	// LDAP: test-connection state for the inline form button
	const [testConnResult, setTestConnResult] = useState<LdapTestConnectionResponse | null>(null);
	const [testingConnection, setTestingConnection] = useState(false);

	const { data = [], isLoading, error, refetch } = useIdentityProviders();
	const createMut = useCreateIdentityProvider();
	const updateMut = useUpdateIdentityProvider();
	const deleteMut = useDeleteIdentityProvider();
	const testMut = useTestIdentityProvider();
	const { data: signingStatus } = useSamlSigningStatus();
	const signingMut = useUpdateSamlSigningPolicy();

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
		const result = createIdpSchema(t).passthrough().safeParse(values);
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

	const modeOf = (v: unknown): 'inherit' | 'on' | 'off' =>
		v === true ? 'on' : v === false ? 'off' : 'inherit';

	const openSigning = (record: IdPRecord) => {
		const cfg = record.config || {};
		setSigningRecord(record);
		setSignAuthnMode(modeOf(cfg.signAuthnRequests));
		setSignLogoutMode(modeOf(cfg.signLogout));
	};

	const saveSigning = async () => {
		if (!signingRecord) return;
		const payload: any = {};
		if (signAuthnMode === 'inherit') payload.clearSignAuthn = true;
		else payload.signAuthnRequests = signAuthnMode === 'on';
		if (signLogoutMode === 'inherit') payload.clearSignLogout = true;
		else payload.signLogout = signLogoutMode === 'on';
		try {
			await signingMut.mutateAsync({ id: signingRecord.id, ...payload });
			message.success(t('idp.signing.saveSuccess'));
			setSigningRecord(null);
		} catch (err) {
			handleApiError(err, t('idp.signing.saveFailed'));
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
					{/* SAML 行不提供测试：identity /identity-providers/:id/test 不认 saml-service
					    的 provider id（404）；service-saml 无测试端点。 */}
					{record.type !== 'saml' && (
						<Button
							type="link"
							size="small"
							icon={<CheckCircle2 size="1em" />}
							loading={testingId === record.id}
							onClick={() => handleTest(record.id)}
						>
							{t('idp.testConnection')}
						</Button>
					)}
					{record.type === 'saml' && (
						<Button
							type="link"
							size="small"
							icon={<ShieldCheck size="1em" />}
							onClick={() => openSigning(record)}
						>
							{t('idp.signing.action')}
						</Button>
					)}
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

			{/* SAML SP 签名证书状态（只读；到期倒计时） */}
			{signingStatus && (
				<div className="mb-4">
					{signingStatus.hasKey === false || !signingStatus.certificate?.notAfter ? (
						<Alert
							variant="neutral"
							title={t('idp.signing.certMissing')}
						/>
					) : (
						(() => {
							const notAfter = signingStatus.certificate!.notAfter!;
							const days = Math.ceil((new Date(notAfter).getTime() - Date.now()) / 86400000);
							const variant = days <= 0 ? 'danger' : days <= 30 ? 'warning' : 'success';
							const tail = signingStatus.certificate?.sha256Fingerprint?.slice(0, 16) ?? '';
							return (
								<Alert
									variant={variant}
									title={`${t('idp.signing.certTitle')} · ${
										days <= 0
											? t('idp.signing.certExpired')
											: `${days} ${t('idp.signing.certDaysLeft')}`
									} · ${new Date(notAfter).toLocaleDateString()}${tail ? ` · ${tail}…` : ''}`}
								/>
							);
						})()
					)}
				</div>
			)}

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
						variant={isActionRequiredError(ldapHealthError) ? 'info' : 'danger'}
						title={
							isActionRequiredError(ldapHealthError)
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
								<Input.Password autoComplete="off" />
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
								<Input.Password autoComplete="off" />
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

			{/* SAML 签名策略（三态覆盖） */}
			<Modal
				title={`${t('idp.signing.title')}${signingRecord ? ` — ${signingRecord.name}` : ''}`}
				open={!!signingRecord}
				onCancel={() => setSigningRecord(null)}
				onOk={saveSigning}
				confirmLoading={signingMut.isPending}
				okText={t('common.save')}
				width={520}
			>
				<div className="space-y-5">
					<div className="text-sm text-neutral-600">
						{t('idp.signing.desc')}
					</div>

					<div>
						<div className="mb-1 text-sm font-medium">
							{t('idp.signing.authn')}
						</div>
						<Select
							value={signAuthnMode}
							onChange={(v) => setSignAuthnMode(v as 'inherit' | 'on' | 'off')}
							style={{ width: '100%' }}
							options={[
								{ value: 'inherit', label: t('idp.signing.inherit') },
								{ value: 'on', label: t('idp.signing.on') },
								{ value: 'off', label: t('idp.signing.off') },
							]}
						/>
						<div className="mt-1 text-xs text-neutral-500">
							{t('idp.signing.effective')}:{' '}
							{signingRecord?.config?.signAuthnEffective
								? t('idp.signing.on')
								: t('idp.signing.off')}
						</div>
					</div>

					<div>
						<div className="mb-1 text-sm font-medium">
							{t('idp.signing.logout')}
						</div>
						<Select
							value={signLogoutMode}
							onChange={(v) => setSignLogoutMode(v as 'inherit' | 'on' | 'off')}
							style={{ width: '100%' }}
							options={[
								{ value: 'inherit', label: t('idp.signing.inherit') },
								{ value: 'on', label: t('idp.signing.on') },
								{ value: 'off', label: t('idp.signing.off') },
							]}
						/>
						<div className="mt-1 text-xs text-neutral-500">
							{t('idp.signing.effective')}:{' '}
							{signingRecord?.config?.signLogoutEffective
								? t('idp.signing.on')
								: t('idp.signing.off')}
						</div>
					</div>

					<Alert
						variant="warning"
						title={t('idp.signing.authnWarning')}
					/>
				</div>
			</Modal>
		</div>
	);
}

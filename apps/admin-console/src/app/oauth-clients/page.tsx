'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, Descriptions, Popconfirm, Empty, Spin, Tabs, Statistic, Card, Row, Col, Typography } from 'antd';
import { message } from '@/lib/antd-app';
import {
	Ban,
	Copy,
	Eye,
	KeyRound,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
	useOAuthClients,
	useCreateOAuthClient,
	useUpdateOAuthClient,
	useDeleteOAuthClient,
	useRotateOAuthClientSecret,
	useOAuthClientSecrets,
	useCreateOAuthClientSecret,
	useDeleteOAuthClientSecret,
	useDeactivateOAuthClientSecret,
	useOAuthClientStats,
} from '@/hooks/use-oauth-clients';
import type {
	OAuthClientRecord,
	OAuthClientSecretRecord,
	OAuthClientStats,
} from '@/hooks/use-oauth-clients';
import { handleApiError } from '@/lib/error-handler';
import { DataTable, Drawer, PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { Option } = Select;
const { Text } = Typography;

/** A-48：OAuth 客户端状态 → Tag 颜色（值域见 service-share micro-share/auth/oauth_client.go:22-24）。 */
const OAUTH_STATUS_COLORS: Record<string, string> = {
	active: 'success',
	suspended: 'warning',
	inactive: 'default',
};

/** TextArea 换行分割 → wire 数组（trim + 去空行；wire `redirect_uris`/`post_logout_redirect_uris` 均为 []string）。 */
const splitUris = (value?: string): string[] =>
	(value || '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

export default function OAuthClientsPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<OAuthClientRecord | null>(null);
	const [detailClient, setDetailClient] = useState<OAuthClientRecord | null>(null);
	const [secretDrawerClient, setSecretDrawerClient] = useState<OAuthClientRecord | null>(null);
	const [form] = Form.useForm();

	const { data = [], isLoading, error, refetch } = useOAuthClients();
	const createMut = useCreateOAuthClient();
	const updateMut = useUpdateOAuthClient();
	const deleteMut = useDeleteOAuthClient();
	const rotateMut = useRotateOAuthClientSecret();

	const { data: secrets = [], isLoading: secretsLoading } = useOAuthClientSecrets(
		secretDrawerClient?.clientId || '',
	);
	const createSecretMut = useCreateOAuthClientSecret();
	const deleteSecretMut = useDeleteOAuthClientSecret();
	const deactivateSecretMut = useDeactivateOAuthClientSecret();
	const { data: stats } = useOAuthClientStats(detailClient?.clientId || '');

	const handleSave = async (values: any) => {
		// A-45/A-46：payload 按 wire 键书写（camel 书面 → 请求拦截器 snake 化）。
		// `name`（wire 非 clientName）；`redirect_uris`/`post_logout_redirect_uris` 须为数组（TextArea 换行分割）。
		const payload = {
			name: values.name,
			// 显示简称：用户门户「已授权应用」优先展示它，空则回退全名。
			alias: (values.alias || '').trim(),
			redirectUris: splitUris(values.redirectUris),
			postLogoutRedirectUris: splitUris(values.postLogoutRedirectUris),
			// 允许的浏览器源（CORS）：第三方应用浏览器直连换票/取用户信息时的跨域白名单。
			// 仅精确 origin（scheme+host[:port]，无路径/尾斜杠）——语法校验在服务端
			// normalizeCorsOrigins，前端不重复实现第二份规则。
			corsOrigins: splitUris(values.corsOrigins),
			grantTypes: values.grantTypes,
			// 展示元信息：用户门户「已授权应用」用 website 渲染「打开应用」、logo_url 渲染图标。
			// 空串 = 清除（UpdateClientParams 用 *string：nil 不动、空串清空）。
			// URL 合法性由服务端校验（CreateClient/UpdateClient 内），前端不重复实现第三份白名单。
			website: (values.website || '').trim(),
			logoUrl: (values.logoUrl || '').trim(),
		};
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.clientId, data: payload });
				message.success(t('oauthClients.updateSuccess'));
			} else {
				await createMut.mutateAsync(payload);
				message.success(t('oauthClients.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('oauthClients.saveFailed'));
		}
	};

	const handleDelete = async (clientId: string) => {
		try {
			await deleteMut.mutateAsync(clientId);
			message.success(t('oauthClients.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('oauthClients.deleteFailed'));
		}
	};

	const handleCreateSecret = async () => {
		if (!secretDrawerClient) return;
		try {
			const res = await createSecretMut.mutateAsync(secretDrawerClient.clientId);
			const result = res as any;
			const secretValue =
				result?.data?.secretValue || result?.secretValue || result?.data?.secret || result?.secret;
			if (secretValue) {
				message.success(t('oauthClients.secretCreated'));
				message.info(`${t('oauthClients.copySecretHint')}: ${secretValue}`);
			} else {
				message.success(t('oauthClients.secretCreated'));
			}
		} catch (err) {
			handleApiError(err, t('oauthClients.secretCreateFailed'));
		}
	};

	const handleRotateSecret = async () => {
		if (!secretDrawerClient) return;
		try {
			const res = await rotateMut.mutateAsync(secretDrawerClient.clientId);
			const result = res as any;
			const secretValue =
				result?.data?.secretValue || result?.secretValue || result?.data?.secret || result?.secret;
			if (secretValue) {
				message.success(t('oauthClients.secretRotated'));
				message.info(`${t('oauthClients.copySecretHint')}: ${secretValue}`);
			} else {
				message.success(t('oauthClients.secretRotated'));
			}
		} catch (err) {
			handleApiError(err, t('oauthClients.secretRotateFailed'));
		}
	};

	const columns = [
		{ title: t('oauthClients.column.clientName'), dataIndex: 'name', key: 'name' },
		{
			title: t('oauthClients.column.clientId'),
			dataIndex: 'clientId',
			key: 'clientId',
			render: (v: string) => (
				<Space size="small">
					<code className="text-xs bg-neutral-200 px-1.5 py-0.5 rounded-xs">{v}</code>
					<Button
						type="text"
						size="small"
						icon={<Copy size="1em" />}
						aria-label={t('oauthClients.copyClientId')}
						onClick={() => {
							navigator.clipboard.writeText(v);
							message.success(t('oauthClients.copied'));
						}}
					/>
				</Space>
			),
		},
		{
			title: t('oauthClients.column.grantTypes'),
			dataIndex: 'grantTypes',
			key: 'grantTypes',
			render: (types: string[]) => (types || []).map((t) => <Tag key={t}>{t}</Tag>),
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag color={OAUTH_STATUS_COLORS[status] ?? 'default'}>
					{t(`oauthClients.status.${status}`, { defaultValue: status })}
				</Tag>
			),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: OAuthClientRecord) => (
				<Space size="small">
					<Button
						type="text"
						size="small"
						icon={<KeyRound size="1em" />}
						onClick={() => setSecretDrawerClient(record)}
					>
						{t('oauthClients.manageSecrets')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<Eye size="1em" />}
						onClick={() => setDetailClient(record)}
					>
						{t('oauthClients.detail')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<Pencil size="1em" />}
						aria-label={t('common.edit')}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								name: record.name,
								alias: record.alias || '',
								redirectUris: record.redirectUris?.join('\n') || '',
								postLogoutRedirectUris: record.postLogoutRedirectUris?.join('\n') || '',
								corsOrigins: record.corsOrigins?.join('\n') || '',
								grantTypes: record.grantTypes || [],
								website: record.website || '',
								logoUrl: record.logoUrl || '',
							});
							setModalVisible(true);
						}}
					/>
					<Popconfirm
						title={t('oauthClients.confirmDelete')}
						onConfirm={() => handleDelete(record.clientId)}
					>
						<Button
							type="text"
							size="small"
							danger
							icon={<Trash2 size="1em" />}
							aria-label={t('common.delete')}
						/>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			{error && (
				<PageError message={t('oauthClients.loadError')} retry={refetch} className="mb-4" />
			)}

			<AppPageHeader
				title={t('oauthClients.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalVisible(true);
							}}
						>
							{t('oauthClients.createBtn')}
						</Button>
					</>
				}
			/>

			{isLoading ? (
				<Spin className="flex justify-center py-12" />
			) : data.length === 0 ? (
				<Empty description={t('oauthClients.noData')} />
			) : (
				<DataTable
					rowKey="clientId"
					columns={columns}
					dataSource={data}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 900 }}
				/>
			)}

			{/* Create/Edit Modal */}
			<Modal
				title={editing ? t('oauthClients.editApp') : t('oauthClients.createApp')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnClose
				width={560}
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="name"
						label={t('oauthClients.form.clientName')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('oauthClients.form.clientNamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="alias"
						label={t('oauthClients.form.alias')}
						extra={t('oauthClients.form.aliasExtra')}
					>
						<Input maxLength={32} placeholder={t('oauthClients.form.aliasPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="redirectUris"
						label={t('oauthClients.form.redirectUris')}
						extra={t('oauthClients.form.redirectUrisExtra')}
					>
						<Input.TextArea rows={3} placeholder={t('oauthClients.form.redirectUrisPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="postLogoutRedirectUris"
						label={t('oauthClients.form.postLogoutRedirectUris')}
						extra={t('oauthClients.form.postLogoutRedirectUrisExtra')}
					>
						<Input.TextArea
							rows={2}
							placeholder={t('oauthClients.form.postLogoutRedirectUrisPlaceholder')}
						/>
					</Form.Item>
					{/* CORS：第三方应用浏览器直连（SDK 直连形态）必需；登记后 ≤60s 生效（网关快照 TTL）。
					    未登记的表现是浏览器 CORS 报错、而换票在服务端已成功 —— 极难自查，故给出明确提示。 */}
					<Form.Item
						name="corsOrigins"
						label={t('oauthClients.form.corsOrigins')}
						extra={t('oauthClients.form.corsOriginsExtra')}
					>
						<Input.TextArea rows={2} placeholder={t('oauthClients.form.corsOriginsPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="grantTypes"
						label={t('oauthClients.form.grantTypes')}
						rules={[{ required: true }]}
					>
						<Select mode="multiple" placeholder={t('oauthClients.form.grantTypesPlaceholder')}>
							<Option value="authorization_code">authorization_code</Option>
							<Option value="client_credentials">client_credentials</Option>
							<Option value="refresh_token">refresh_token</Option>
							<Option value="implicit">implicit</Option>
						</Select>
					</Form.Item>
					{/* 展示元信息（用户门户「已授权应用」消费）：官网 → 「打开应用」；Logo → 列表图标。
					    URL 合法性由服务端校验（CreateClient/UpdateClient），前端不重复第三份白名单。 */}
					<Form.Item
						name="website"
						label={t('oauthClients.form.website')}
						extra={t('oauthClients.form.websiteExtra')}
					>
						<Input maxLength={255} placeholder={t('oauthClients.form.websitePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="logoUrl"
						label={t('oauthClients.form.logoUrl')}
						extra={t('oauthClients.form.logoUrlExtra')}
					>
						<Input maxLength={255} placeholder={t('oauthClients.form.logoUrlPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			{/* Detail Drawer */}
			<Drawer
				title={t('oauthClients.detail')}
				open={!!detailClient}
				onClose={() => setDetailClient(null)}
				size="sm"
			>
				{detailClient && (
					<Space direction="vertical" style={{ width: '100%' }} size="large">
						<Descriptions column={1} bordered size="small">
							<Descriptions.Item label={t('oauthClients.column.clientName')}>
								{detailClient.name}
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.detailAlias')}>
								{detailClient.alias || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.column.clientId')}>
								<Space>
									<code className="text-xs">{detailClient.clientId}</code>
									<Button
										type="text"
										size="small"
										icon={<Copy size="1em" />}
										aria-label={t('oauthClients.copyClientId')}
										onClick={() => {
											navigator.clipboard.writeText(detailClient.clientId);
											message.success(t('oauthClients.copied'));
										}}
									/>
								</Space>
							</Descriptions.Item>
							<Descriptions.Item label={t('common.status')}>
								<Tag color={OAUTH_STATUS_COLORS[detailClient.status] ?? 'default'}>
									{t(`oauthClients.status.${detailClient.status}`, {
										defaultValue: detailClient.status,
									})}
								</Tag>
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.column.grantTypes')}>
								{(detailClient.grantTypes || []).join(', ')}
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.detailRedirectUris')}>
								{(detailClient.redirectUris || []).join(', ') || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.detailCorsOrigins')}>
								<span style={{ wordBreak: 'break-all' }}>
									{(detailClient.corsOrigins || []).join(', ') || '-'}
								</span>
							</Descriptions.Item>
							{/* 展示元信息：纯文本展示（不渲染成可点链接）——内部控制台只需核对值，
							    避免在管理面引入第四份外链白名单。 */}
							<Descriptions.Item label={t('oauthClients.detailWebsite')}>
								<span style={{ wordBreak: 'break-all' }}>{detailClient.website || '-'}</span>
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.detailLogo')}>
								<span style={{ wordBreak: 'break-all' }}>{detailClient.logoUrl || '-'}</span>
							</Descriptions.Item>
						</Descriptions>

						{stats && (
							<Card size="small" title={t('oauthClients.stats')}>
								<Row gutter={16}>
									<Col span={8}>
										<Statistic
											title={t('oauthClients.statsActiveTokens')}
											value={(stats as any)?.activeTokens || 0}
										/>
									</Col>
									<Col span={8}>
										<Statistic
											title={t('oauthClients.statsRefreshTokens')}
											value={(stats as any)?.activeRefreshTokens || 0}
										/>
									</Col>
								</Row>
							</Card>
						)}
					</Space>
				)}
			</Drawer>

			{/* Secrets Drawer */}
			<Drawer
				title={t('oauthClients.manageSecrets')}
				open={!!secretDrawerClient}
				onClose={() => setSecretDrawerClient(null)}
				size="sm"
				extra={
					<Space>
						<Button icon={<RefreshCw size="1em" />} onClick={handleRotateSecret}>
							{t('oauthClients.rotateSecret')}
						</Button>
						<Button type="primary" icon={<Plus size="1em" />} onClick={handleCreateSecret}>
							{t('oauthClients.addSecret')}
						</Button>
					</Space>
				}
			>
				{secretDrawerClient && (
					<>
						<Descriptions column={1} bordered size="small" className="mb-4">
							<Descriptions.Item label={t('oauthClients.column.clientName')}>
								{secretDrawerClient.name}
							</Descriptions.Item>
							<Descriptions.Item label={t('oauthClients.column.clientId')}>
								<code className="text-xs">{secretDrawerClient.clientId}</code>
							</Descriptions.Item>
						</Descriptions>

						{secretsLoading ? (
							<Spin className="flex justify-center py-8" />
						) : secrets.length === 0 ? (
							<Empty description={t('oauthClients.noSecrets')} />
						) : (
							<DataTable
								rowKey="id"
								dataSource={secrets}
								pagination={false}
								columns={[
									{
										title: t('oauthClients.secretLabel'),
										dataIndex: 'label',
										key: 'label',
										render: (v: string) => v || '-',
									},
									{
										title: t('common.status'),
										dataIndex: 'status',
										key: 'status',
										render: (s: string) => (
											<Tag color={s === 'active' ? 'success' : 'default'}>{s}</Tag>
										),
									},
									{
										title: t('oauthClients.secretCreatedAt'),
										dataIndex: 'createdAt',
										key: 'createdAt',
										render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
									},
									{
										title: t('common.actions'),
										key: 'action',
										render: (_: any, record: OAuthClientSecretRecord) => (
											<Space size="small">
												<Popconfirm
													title={t('oauthClients.confirmDeactivateSecret')}
													onConfirm={() =>
														deactivateSecretMut.mutate({
															clientId: secretDrawerClient.clientId,
															secretId: record.id,
														})
													}
												>
													<Button
														type="text"
														size="small"
														icon={<Ban size="1em" />}
														aria-label={t('oauthClients.deactivateSecret')}
													/>
												</Popconfirm>
												<Popconfirm
													title={t('oauthClients.confirmDeleteSecret')}
													onConfirm={() =>
														deleteSecretMut.mutate({
															clientId: secretDrawerClient.clientId,
															secretId: record.id,
														})
													}
												>
													<Button
														type="text"
														size="small"
														danger
														icon={<Trash2 size="1em" />}
														aria-label={t('oauthClients.deleteSecret')}
													/>
												</Popconfirm>
											</Space>
										),
									},
								]}
							/>
						)}
					</>
				)}
			</Drawer>
		</div>
	);
}

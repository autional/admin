'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { extractList, apiClient } from '@autional/shared';
import { adminSessions } from '@autional/shared/generated/api';
import { Card, Avatar, Tabs, Tag, Button, Space, Form, Input, Descriptions, Modal, Spin, Empty, Select } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	ArrowLeft,
	Clock,
	Lock,
	Mail,
	Plus,
	RefreshCw,
	ShieldCheck,
	Trash2,
	Unlock,
	User,
} from 'lucide-react';
import { useUser } from '@/hooks/use-users';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import {
	getUserRoles,
	getUserPermissions,
	getUserLoginHistories,
	updateUser,
	updateUserStatus,
	resetUserPassword,
	unlockUser,
	resetUserMFA,
	getAuditLogs,
	getPasswordStatus,
} from '@/lib/api.generated';
import { useAssignUserPermissions, useRevokeUserPermissions } from '@/hooks/use-user-roles';
import { usePermissionsForSelect } from '@/hooks/use-permissions-for-select';

export default function UserDetailPage() {
	const { t } = useTranslation();
	const params = useParams();
	const navigate = useNavigate();
	const id = params.id as string;

	const { data: user, isLoading: loading, refetch } = useUser(id);
	const [activeTab, setActiveTab] = useState('basic');

	const [roles, setRoles] = useState<any[]>([]);
	const [permissions, setPermissions] = useState<any[]>([]);
	const [loginHistories, setLoginHistories] = useState<any[]>([]);
	const [sessions, setSessions] = useState<any[]>([]);
	const [auditLogs, setAuditLogs] = useState<any[]>([]);
	const [passwordStatus, setPasswordStatus] = useState<any>(null);
	const [tabLoading, setTabLoading] = useState(false);

	const [editModalVisible, setEditModalVisible] = useState(false);
	const [editForm] = Form.useForm();

	const [permModalVisible, setPermModalVisible] = useState(false);
	const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

	const assignPermMut = useAssignUserPermissions();
	const revokePermMut = useRevokeUserPermissions();
	const permissionOptions = usePermissionsForSelect();

	const loadTabData = async (key: string) => {
		setTabLoading(true);
		try {
			switch (key) {
				case 'roles': {
					const [rRes, pRes] = await Promise.all([getUserRoles(id), getUserPermissions(id)]);
					setRoles(extractList(rRes));
					setPermissions(extractList(pRes));
					break;
				}
				case 'loginHistory': {
					const lhRes = await getUserLoginHistories(id);
					setLoginHistories(extractList(lhRes));
					break;
				}
				case 'sessions': {
					const sRes = await adminSessions({ user_id: id });
					const allSessions = extractList(sRes);
					setSessions(allSessions);
					break;
				}
				case 'auditLogs': {
					const aRes = await getAuditLogs({ user_id: id, page_size: 20 });
					setAuditLogs(extractList(aRes));
					break;
				}
				case 'passwordStatus': {
					const psRes = await getPasswordStatus(id);
					setPasswordStatus(psRes.data);
					break;
				}
				case 'directPermissions': {
					const pRes = await getUserPermissions(id);
					setPermissions(extractList(pRes));
					break;
				}
			}
		} catch (err) {
			handleApiError(err, t('userDetail.tabLoadFailed'));
		} finally {
			setTabLoading(false);
		}
	};

	useEffect(() => {
		if (id && activeTab !== 'basic' && activeTab !== 'mfa') {
			loadTabData(activeTab);
		}
	}, [activeTab, id]);

	const handleUpdateStatus = async (status: string) => {
		try {
			// 后端 UpdateUserStatus 契约: { status: active|banned|suspended|deleted }
			// UI 的 "禁用" 语义映射到后端 banned（后端 oneof 无 disabled）
			const apiStatus = status === 'disabled' ? 'banned' : status;
			await updateUserStatus(id, { status: apiStatus });
			message.success(t('userDetail.statusUpdateSuccess'));
			refetch();
		} catch (err) {
			handleApiError(err, t('userDetail.statusUpdateFailed'));
		}
	};

	const handleUnlock = async () => {
		try {
			await unlockUser(id, {});
			message.success(t('userDetail.accountUnlocked'));
			refetch();
		} catch (err) {
			handleApiError(err, t('userDetail.unlockFailed'));
		}
	};

	const handleResetPassword = async () => {
		modal.confirm({
			title: t('userDetail.confirmResetPassword'),
			content: t('userDetail.resetPasswordConfirm'),
			onOk: async () => {
				try {
					await resetUserPassword(id, {});
					message.success(t('userDetail.passwordResetSuccess'));
				} catch (err) {
					handleApiError(err, t('userDetail.passwordResetFailed'));
				}
			},
		});
	};

	const handleResetMFA = async () => {
		modal.confirm({
			title: t('userDetail.confirmResetMfa'),
			content: t('userDetail.resetMfaConfirm'),
			onOk: async () => {
				try {
					await resetUserMFA(id);
					message.success(t('userDetail.mfaResetSuccess'));
				} catch (err) {
					handleApiError(err, t('userDetail.mfaResetFailed'));
				}
			},
		});
	};

	const handleSaveBasic = async (values: any) => {
		try {
			// 后端 AC-005/ADR-07：admin 直改 email 必须提供 reason（61002205 拒绝缺失）
			// values 含 username/email/reason，直接透传
			await updateUser(id, values);
			message.success(t('userDetail.saveSuccess'));
			setEditModalVisible(false);
			refetch();
		} catch (err) {
			handleApiError(err, t('userDetail.saveFailed'));
		}
	};

	const handleAssignPermission = async () => {
		if (selectedPermissionIds.length === 0) {
			message.warning(t('userDetail.selectAtLeastOnePerm'));
			return;
		}
		try {
			await assignPermMut.mutateAsync({
				userId: id,
				data: { permissionIds: selectedPermissionIds },
			});
			message.success(t('userDetail.permissionAssignSuccess'));
			setPermModalVisible(false);
			setSelectedPermissionIds([]);
			loadTabData('directPermissions');
		} catch (err) {
			handleApiError(err, t('userDetail.permissionAssignFailed'));
		}
	};

	const handleRevokePermission = async (permissionId: string) => {
		try {
			await revokePermMut.mutateAsync({
				userId: id,
				data: { permissionIds: [permissionId] },
			});
			message.success(t('userDetail.permissionRevoked'));
			loadTabData('directPermissions');
		} catch (err) {
			handleApiError(err, t('userDetail.permissionRevokeFailed'));
		}
	};

	const statusColor = (status: string) => {
		if (status === 'active') return 'success';
		if (status === 'locked' || status === 'banned' || status === 'suspended') return 'error';
		if (status === 'deleted') return 'default';
		return 'processing';
	};

	const statusText = (status: string) => {
		if (status === 'active') return t('userDetail.statusNormal');
		if (status === 'locked') return t('userDetail.statusLocked');
		if (status === 'banned') return t('users.statusBanned');
		if (status === 'suspended') return t('users.statusSuspended');
		if (status === 'deleted') return t('users.statusDeleted');
		if (status === 'disabled') return t('userDetail.statusDisabled');
		return status;
	};

	if (loading) {
		return (
			<div className="flex justify-center py-20">
				<Spin size="large" />
			</div>
		);
	}

	if (!user) {
		return <Empty description={t('userDetail.notFound')} />;
	}

	return (
		<div>
			<div className="mb-4">
				<Button icon={<ArrowLeft size="1em" />} onClick={() => navigate(-1)}>
					{t('userDetail.back')}
				</Button>
			</div>

			<Card className="mb-4">
				<div className="flex items-start justify-between flex-wrap gap-4">
					<div className="flex items-center gap-4">
						<Avatar size={64} icon={<User size="1em" />} className="!bg-info" />
						<div>
							<div className="text-xl font-semibold flex items-center gap-2">
								{user.username}
								<Tag color={statusColor(user.status)}>{statusText(user.status)}</Tag>
							</div>
							<div className="text-neutral-600 mt-1 flex flex-wrap items-center gap-4">
								<span>
									<Mail size="1em" /> {user.email}
								</span>
								<span>
									<Clock size="1em" /> {t('userDetail.createdAt')} {user.createdAt}
								</span>
							</div>
						</div>
					</div>
					<Space wrap>
						<Button icon={<Lock size="1em" />} onClick={handleResetPassword}>
							{t('userDetail.resetPassword')}
						</Button>
						{user.status === 'locked' && (
							<Button icon={<Unlock size="1em" />} onClick={handleUnlock}>
								{t('userDetail.unlockAccount')}
							</Button>
						)}
						{user.status === 'active' ? (
							<Button danger onClick={() => handleUpdateStatus('disabled')}>
								{t('userDetail.disableAccount')}
							</Button>
						) : (
							<Button type="primary" onClick={() => handleUpdateStatus('active')}>
								{t('userDetail.enableAccount')}
							</Button>
						)}
						<Button icon={<ShieldCheck size="1em" />} onClick={handleResetMFA}>
							{t('userDetail.resetMfa')}
						</Button>
						<Button icon={<RefreshCw size="1em" />} onClick={() => setEditModalVisible(true)}>
							{t('userDetail.editProfile')}
						</Button>
					</Space>
				</div>
			</Card>

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'basic',
						label: t('userDetail.basicInfo'),
						children: (
							<Card>
								<Descriptions bordered column={2}>
									<Descriptions.Item label={t('userDetail.userId')}>{user.id}</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.username')}>
										{user.username}
									</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.email')}>{user.email}</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.status')}>
										<Tag color={statusColor(user.status)}>{statusText(user.status)}</Tag>
									</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.mfaStatus')}>
										{user.mfaEnabled ? (
											<Tag color="success">{t('userDetail.mfaEnabled')}</Tag>
										) : (
											<Tag>{t('userDetail.mfaNotEnabled')}</Tag>
										)}
									</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.createdAt')}>
										{user.createdAt}
									</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.lastLogin')}>
										{user.lastLoginAt || '-'}
									</Descriptions.Item>
								</Descriptions>
							</Card>
						),
					},
					{
						key: 'roles',
						label: t('userDetail.rolesPermissions'),
						children: (
							<Spin spinning={tabLoading}>
								<Card title={t('userDetail.assignedRoles')} className="mb-4">
									{roles.length === 0 ? (
										<Empty description={t('userDetail.noRoles')} />
									) : (
										<Space wrap>
											{roles.map((role: any) => (
												<Tag key={role.id} color="blue">
													{role.name}
												</Tag>
											))}
										</Space>
									)}
								</Card>
								<Card title={t('userDetail.permissionsDetail')}>
									{permissions.length === 0 ? (
										<Empty description={t('userDetail.noPermissions')} />
									) : (
										<DataTable
											rowKey="id"
											dataSource={permissions}
											columns={[
												{ title: t('userDetail.permissionCode'), dataIndex: 'code', key: 'code' },
												{ title: t('userDetail.name'), dataIndex: 'name', key: 'name' },
												{
													title: t('userDetail.description'),
													dataIndex: 'description',
													key: 'description',
													ellipsis: true,
												},
												{
													title: t('userDetail.category'),
													dataIndex: 'category',
													key: 'category',
													render: (v: string) => <Tag>{v}</Tag>,
												},
											]}
											pagination={false}
											scroll={{ x: 800 }}
										/>
									)}
								</Card>
							</Spin>
						),
					},
					{
						key: 'directPermissions',
						label: t('userDetail.directPermissions'),
						children: (
							<Spin spinning={tabLoading}>
								<Card
									title={t('userDetail.directlyAssignedPermissions')}
									extra={
										<Button
											type="primary"
											icon={<Plus size="1em" />}
											onClick={() => setPermModalVisible(true)}
										>
											{t('userDetail.assignPermission')}
										</Button>
									}
								>
									{permissions.length === 0 ? (
										<Empty description={t('userDetail.noDirectPermissions')} />
									) : (
										<DataTable
											rowKey="id"
											dataSource={permissions}
											columns={[
												{ title: t('userDetail.permissionCode'), dataIndex: 'code', key: 'code' },
												{ title: t('userDetail.name'), dataIndex: 'name', key: 'name' },
												{
													title: t('userDetail.description'),
													dataIndex: 'description',
													key: 'description',
													ellipsis: true,
												},
												{
													title: t('userDetail.category'),
													dataIndex: 'category',
													key: 'category',
													render: (v: string) => <Tag>{v}</Tag>,
												},
												{
													title: t('userDetail.actions'),
													key: 'action',
													render: (_: any, record: any) => (
														<Button
															type="link"
															danger
															icon={<Trash2 size="1em" />}
															onClick={() => handleRevokePermission(record.id)}
														>
															{t('userDetail.revoke')}
														</Button>
													),
												},
											]}
											pagination={false}
											scroll={{ x: 800 }}
										/>
									)}
								</Card>
							</Spin>
						),
					},
					{
						key: 'loginHistory',
						label: t('userDetail.loginHistory'),
						children: (
							<Spin spinning={tabLoading}>
								<DataTable
									rowKey="id"
									dataSource={loginHistories}
									columns={[
										{ title: t('userDetail.time'), dataIndex: 'createdAt', key: 'createdAt' },
										{ title: t('userDetail.ipAddress'), dataIndex: 'ipAddress', key: 'ipAddress' },
										{ title: t('userDetail.device'), dataIndex: 'device', key: 'device' },
										{ title: t('userDetail.browser'), dataIndex: 'browser', key: 'browser' },
										{ title: t('userDetail.location'), dataIndex: 'location', key: 'location' },
										{
											title: t('userDetail.result'),
											dataIndex: 'result',
											key: 'result',
											render: (v: string) => (
												<Tag color={v === 'success' ? 'success' : 'error'}>
													{v === 'success' ? t('userDetail.success') : t('userDetail.failed')}
												</Tag>
											),
										},
									]}
									locale={{ emptyText: <Empty description={t('userDetail.noLoginHistory')} /> }}
									scroll={{ x: 800 }}
								/>
							</Spin>
						),
					},
					{
						key: 'sessions',
						label: t('userDetail.activeSessions'),
						children: (
							<Spin spinning={tabLoading}>
								<DataTable
									rowKey="id"
									dataSource={sessions}
									columns={[
										{
											title: t('userDetail.sessionId'),
											dataIndex: 'id',
											key: 'id',
											ellipsis: true,
										},
										{ title: t('userDetail.ipAddress'), dataIndex: 'ipAddress', key: 'ipAddress' },
										{ title: t('userDetail.device'), dataIndex: 'device', key: 'device' },
										{ title: t('userDetail.browser'), dataIndex: 'browser', key: 'browser' },
										{ title: t('userDetail.location'), dataIndex: 'location', key: 'location' },
										{ title: t('userDetail.riskScore'), dataIndex: 'riskScore', key: 'riskScore' },
										{
											title: t('userDetail.lastActive'),
											dataIndex: 'lastActiveAt',
											key: 'lastActiveAt',
										},
									]}
									locale={{ emptyText: <Empty description={t('userDetail.noActiveSessions')} /> }}
									scroll={{ x: 800 }}
								/>
							</Spin>
						),
					},
					{
						key: 'mfa',
						label: t('userDetail.mfaStatus'),
						children: (
							<Card>
								<Descriptions bordered column={1}>
									<Descriptions.Item label={t('userDetail.mfaStatus')}>
										{user.mfaEnabled ? (
											<Tag color="success">{t('userDetail.mfaEnabled')}</Tag>
										) : (
											<Tag>{t('userDetail.mfaNotEnabled')}</Tag>
										)}
									</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.totp')}>
										{user.mfaEnabled ? t('userDetail.bound') : t('userDetail.notBound')}
									</Descriptions.Item>
									<Descriptions.Item label={t('userDetail.backupRecoveryCodes')}>
										{user.mfaEnabled ? t('userDetail.available') : t('userDetail.notGenerated')}
									</Descriptions.Item>
								</Descriptions>
							</Card>
						),
					},
					{
						key: 'passwordStatus',
						label: t('userDetail.passwordStatus'),
						children: (
							<Spin spinning={tabLoading}>
								<Card>
									<Descriptions bordered column={1}>
										<Descriptions.Item label={t('userDetail.passwordAgeDays')}>
											{passwordStatus?.passwordAgeDays != null
												? `${passwordStatus.passwordAgeDays} ${t('userDetail.days')}`
												: '-'}
										</Descriptions.Item>
										<Descriptions.Item label={t('userDetail.mustChange')}>
											{passwordStatus?.mustChange ? (
												<Tag color="processing">{t('userDetail.yes')}</Tag>
											) : (
												<Tag color="success">{t('userDetail.no')}</Tag>
											)}
										</Descriptions.Item>
										<Descriptions.Item label={t('userDetail.expiryRemaining')}>
											{passwordStatus?.expiryDaysRemaining != null ? (
												passwordStatus.expiryDaysRemaining > 0 ? (
													<Tag color="success">
														{passwordStatus.expiryDaysRemaining} {t('userDetail.days')}
													</Tag>
												) : (
													<Tag color="error">{t('userDetail.expired')}</Tag>
												)
											) : (
												'-'
											)}
										</Descriptions.Item>
										<Descriptions.Item label={t('userDetail.lastChanged')}>
											{passwordStatus?.lastChangedAt || '-'}
										</Descriptions.Item>
										<Descriptions.Item label={t('userDetail.historyCount')}>
											{passwordStatus?.historyEntriesCount ?? '-'}
										</Descriptions.Item>
									</Descriptions>
								</Card>
							</Spin>
						),
					},
					{
						key: 'auditLogs',
						label: t('userDetail.auditLogs'),
						children: (
							<Spin spinning={tabLoading}>
								<DataTable
									rowKey="id"
									dataSource={auditLogs}
									columns={[
										{ title: t('userDetail.time'), dataIndex: 'createdAt', key: 'createdAt' },
										{ title: t('userDetail.operation'), dataIndex: 'action', key: 'action' },
										{
											title: t('userDetail.resourceType'),
											dataIndex: 'resourceType',
											key: 'resourceType',
										},
										{
											title: t('userDetail.resourceId'),
											dataIndex: 'resourceId',
											key: 'resourceId',
											ellipsis: true,
										},
										{
											title: t('userDetail.description'),
											dataIndex: 'description',
											key: 'description',
											ellipsis: true,
										},
										{
											title: t('userDetail.result'),
											dataIndex: 'result',
											key: 'result',
											render: (v: string) => (
												<Tag color={v === 'success' ? 'success' : 'error'}>
													{v === 'success' ? t('userDetail.success') : t('userDetail.failed')}
												</Tag>
											),
										},
									]}
									locale={{ emptyText: <Empty description={t('userDetail.noAuditLogs')} /> }}
									scroll={{ x: 800 }}
								/>
							</Spin>
						),
					},
				]}
			/>

			<Modal
				title={t('userDetail.editUserProfile')}
				open={editModalVisible}
				onCancel={() => setEditModalVisible(false)}
				onOk={() => editForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={editForm} layout="vertical" onFinish={handleSaveBasic} initialValues={user}>
					<Form.Item name="username" label={t('userDetail.username')} rules={[{ required: true }]}>
						<Input />
					</Form.Item>
					<Form.Item
						name="email"
						label={t('userDetail.email')}
						rules={[{ required: true, type: 'email' }]}
					>
						<Input />
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('userDetail.changeReasonLabel')}
						rules={[{ required: true, message: t('userDetail.changeReasonRequired') }]}
					>
						<Input.TextArea
							rows={2}
							placeholder={t('userDetail.changeReasonPlaceholder')}
							maxLength={500}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('userDetail.assignDirectPermissions')}
				open={permModalVisible}
				onCancel={() => {
					setPermModalVisible(false);
					setSelectedPermissionIds([]);
				}}
				onOk={handleAssignPermission}
				confirmLoading={assignPermMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Select
					mode="multiple"
					placeholder={t('userDetail.searchPermissions')}
					options={permissionOptions}
					value={selectedPermissionIds}
					onChange={(vals) => setSelectedPermissionIds(vals)}
					className="w-full"
					showSearch
					optionFilterProp="label"
					filterOption={(input, option) =>
						(option?.label as string)?.toLowerCase().includes(input.toLowerCase())
					}
				/>
			</Modal>
		</div>
	);
}

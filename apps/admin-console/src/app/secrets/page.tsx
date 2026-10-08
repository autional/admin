'use client';

import React, { useState, useMemo } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, Descriptions, Typography, Tooltip, Empty } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	Ban,
	Eye,
	KeyRound,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { handleApiError } from '@/lib/error-handler';
import { DataTable, Drawer, PageError } from '@autional/ui/antd';
import { createSecretSchema, updateSecretSchema } from '@/lib/validators';
import {
	useSecrets,
	useCreateSecret,
	useUpdateSecret,
	useDeleteSecret,
	useRotateSecret,
	useRevokeSecret,
	type SecretRecord,
	useSecretDetail,
	useSecretVersions,
	useSecretVersionValue,
	useBatchRevoke,
	useBatchDelete,
	useEncryptionKeys,
} from '@/hooks/use-secrets';
import type { SecretVersionResponse } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';

const { Text } = Typography;

export default function SecretsPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [rotateVisible, setRotateVisible] = useState(false);
	const [editing, setEditing] = useState<SecretRecord | null>(null);
	const [rotatingTarget, setRotatingTarget] = useState<SecretRecord | null>(null);
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [keyword, setKeyword] = useState('');
	const [form] = Form.useForm();
	const [rotateForm] = Form.useForm();

	const [detailKey, setDetailKey] = useState<string | null>(null);
	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [versionValueVisible, setVersionValueVisible] = useState(false);
	const [versionValueData, setVersionValueData] = useState<{
		value: string;
		version: number;
	} | null>(null);
	const [versionValueLoading, setVersionValueLoading] = useState(false);

	const { data = [], isLoading, error, refetch } = useSecrets();
	const createMut = useCreateSecret();
	const updateMut = useUpdateSecret();
	const deleteMut = useDeleteSecret();
	const rotateMut = useRotateSecret();
	const revokeMut = useRevokeSecret();
	const batchRevokeMut = useBatchRevoke();
	const batchDeleteMut = useBatchDelete();

	const { data: detail, isLoading: detailLoading } = useSecretDetail(detailKey ?? '');
	const { data: versions = [] } = useSecretVersions(detailKey ?? '');
	const { data: encryptionKeys } = useEncryptionKeys();
	const versionValueMut = useSecretVersionValue();

	const statusColors: Record<string, string> = { active: 'green', rotated: 'blue', revoked: 'red' };

	const statusOptions = useMemo(
		() => [
			{ label: t('common.all'), value: 'all' },
			{ label: t('secrets.status.active'), value: 'active' },
			{ label: t('secrets.status.rotated'), value: 'rotated' },
			{ label: t('secrets.status.revoked'), value: 'revoked' },
		],
		[t],
	);

	const filteredData = useMemo(() => {
		let result = data as SecretRecord[];
		if (statusFilter !== 'all') {
			result = result.filter((s) => s.status === statusFilter);
		}
		if (keyword) {
			const kw = keyword.toLowerCase();
			result = result.filter(
				(s) => s.key!.toLowerCase().includes(kw) || s.description?.toLowerCase().includes(kw),
			);
		}
		return result;
	}, [statusFilter, keyword, data]);

	const handleSave = async (values: any) => {
		try {
			if (editing) {
				const result = updateSecretSchema.safeParse(values);
				if (!result.success) {
					result.error.issues.forEach((i) => message.error(i.message));
					return;
				}
				await updateMut.mutateAsync({
					key: editing.key!,
					data: { description: result.data.description },
				});
				message.success(t('secrets.updateSuccess'));
			} else {
				const result = createSecretSchema.safeParse(values);
				if (!result.success) {
					result.error.issues.forEach((i) => message.error(i.message));
					return;
				}
				await createMut.mutateAsync({
					key: result.data.key,
					value: result.data.value,
					description: result.data.description,
				});
				message.success(t('secrets.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('secrets.saveFailed'));
		}
	};

	const handleRotate = async (values: { value: string }) => {
		try {
			if (!rotatingTarget) return;
			await rotateMut.mutateAsync({ key: rotatingTarget.key!, data: { value: values.value } });
			message.success(t('secrets.rotateSuccess'));
			setRotateVisible(false);
			setRotatingTarget(null);
			rotateForm.resetFields();
		} catch (err) {
			handleApiError(err, t('secrets.rotateFailed'));
		}
	};

	const handleRevoke = (record: SecretRecord) => {
		modal.confirm({
			title: t('secrets.revokeConfirm'),
			content: t('secrets.revokeWarning', { key: record.key }),
			okText: t('common.revoke'),
			okType: 'danger',
			onOk: async () => {
				try {
					await revokeMut.mutateAsync(record.key!);
					message.success(t('secrets.revokeSuccess'));
				} catch (err) {
					handleApiError(err, t('secrets.revokeFailed'));
				}
			},
		});
	};

	const handleDelete = (record: SecretRecord) => {
		modal.confirm({
			title: t('common.confirmDelete'),
			content: t('secrets.deleteConfirm', { key: record.key }),
			okText: t('common.delete'),
			okType: 'danger',
			onOk: async () => {
				try {
					await deleteMut.mutateAsync(record.key!);
					message.success(t('secrets.deleteSuccess'));
				} catch (err) {
					handleApiError(err, t('secrets.deleteFailed'));
				}
			},
		});
	};

	const handleBatchRevoke = () => {
		const keys = selectedRowKeys.map(String);
		modal.confirm({
			title: t('common.revoke'),
			content: t('secrets.batchRevokeConfirm', { count: keys.length }),
			okText: t('common.revoke'),
			okType: 'danger',
			onOk: async () => {
				try {
					const result = await batchRevokeMut.mutateAsync(keys);
					const failed = result.errors?.length ?? 0;
					if (failed > 0) {
						message.warning(
							t('secrets.batchRevokePartial', { succeeded: result.succeeded.length, failed }),
						);
					} else {
						message.success(
							t('secrets.batchRevokeSuccessCount', { count: result.succeeded.length }),
						);
					}
					setSelectedRowKeys([]);
				} catch (err) {
					handleApiError(err, t('secrets.revokeFailed'));
				}
			},
		});
	};

	const handleBatchDelete = () => {
		const keys = selectedRowKeys.map(String);
		modal.confirm({
			title: t('common.delete'),
			content: t('secrets.batchDeleteConfirm', { count: keys.length }),
			okText: t('common.delete'),
			okType: 'danger',
			onOk: async () => {
				try {
					const result = await batchDeleteMut.mutateAsync(keys);
					if (result.errors?.length) {
						message.warning(
							t('secrets.batchDeletePartial', {
								succeeded: result.succeeded.length,
								failed: result.errors.length,
							}),
						);
					} else {
						message.success(
							t('secrets.batchDeleteSuccessCount', { count: result.succeeded.length }),
						);
					}
					setSelectedRowKeys([]);
				} catch (err) {
					handleApiError(err, t('secrets.deleteFailed'));
				}
			},
		});
	};

	const handleViewVersionValue = async (key: string, version: number) => {
		setVersionValueLoading(true);
		try {
			const result = await versionValueMut.mutateAsync({ key, version });
			setVersionValueData({ value: result.value!, version: result.version! });
			setVersionValueVisible(true);
		} catch (err) {
			handleApiError(err, t('secrets.loadVersionError'));
		} finally {
			setVersionValueLoading(false);
		}
	};

	const columns = [
		{
			title: t('secrets.column.key'),
			dataIndex: 'key',
			key: 'key',
			render: (v: string, record: SecretRecord) => (
				<Button type="link" onClick={() => setDetailKey(record.key!)} className="p-0">
					<code className="text-xs bg-neutral-200 px-2 py-0.5 rounded-xs">{v}</code>
				</Button>
			),
		},
		{
			title: t('secrets.column.description'),
			dataIndex: 'description',
			key: 'description',
			ellipsis: true,
		},
		{
			title: t('secrets.column.app'),
			dataIndex: 'appId',
			key: 'appId',
			render: (v: string) =>
				v ? <Tag>{v}</Tag> : <Tag color="default">{t('secrets.column.global')}</Tag>,
		},
		{ title: t('secrets.column.version'), dataIndex: 'version', key: 'version', width: 60 },
		{
			title: t('secrets.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={statusColors[v] || 'default'}>{v}</Tag>,
		},
		{
			title: t('secrets.column.updatedAt'),
			dataIndex: 'updatedAt',
			key: 'updatedAt',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('secrets.column.actions'),
			key: 'action',
			width: 300,
			render: (_: any, record: SecretRecord) => (
				<Space size="small">
					<Button type="link" icon={<Eye size="1em" />} onClick={() => setDetailKey(record.key!)}>
						{t('common.viewDetail')}
					</Button>
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue(record);
							setModalVisible(true);
						}}
					>
						{t('secrets.action.edit')}
					</Button>
					<Button
						type="link"
						icon={<RefreshCw size="1em" />}
						disabled={record.status === 'revoked'}
						onClick={() => {
							setRotatingTarget(record);
							rotateForm.resetFields();
							setRotateVisible(true);
						}}
					>
						{t('secrets.action.rotate')}
					</Button>
					<Button
						type="link"
						danger
						icon={<Ban size="1em" />}
						disabled={record.status === 'revoked'}
						onClick={() => handleRevoke(record)}
					>
						{t('secrets.action.revoke')}
					</Button>
					<Button type="link" danger icon={<Trash2 size="1em" />} onClick={() => handleDelete(record)}>
						{t('secrets.action.delete')}
					</Button>
				</Space>
			),
		},
	];

	const rowSelection = {
		selectedRowKeys,
		onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
	};

	return (
		<div>
			<AppPageHeader
				title={t('secrets.title')}
				actions={
					<>
						<Space>
							{selectedRowKeys.length > 0 && (
								<>
									<Button danger icon={<Ban size="1em" />} onClick={handleBatchRevoke}>
										{t('secrets.batchRevokeCount', { count: selectedRowKeys.length })}
									</Button>
									<Button danger icon={<Trash2 size="1em" />} onClick={handleBatchDelete}>
										{t('secrets.batchDeleteCount', { count: selectedRowKeys.length })}
									</Button>
								</>
							)}
							<Tooltip
								title={
									encryptionKeys
										? t('secrets.encryptionKeyTooltip', { key: encryptionKeys.current })
										: ''
								}
							>
								<Button icon={<KeyRound size="1em" />}>{encryptionKeys?.current ?? '...'}</Button>
							</Tooltip>
							<Button
								type="primary"
								icon={<Plus size="1em" />}
								onClick={() => {
									setEditing(null);
									form.resetFields();
									setModalVisible(true);
								}}
							>
								{t('secrets.createButton')}
							</Button>
						</Space>
					</>
				}
			/>

			{error && <PageError message={t('secrets.loadError')} retry={refetch} className="mb-4" />}

			<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 flex-wrap">
				<Input.Search
					placeholder={t('secrets.searchPlaceholder')}
					allowClear
					value={keyword}
					onChange={(e) => setKeyword(e.target.value)}
					className="max-w-md"
				/>
				<Select
					placeholder={t('secrets.statusFilter')}
					value={statusFilter}
					onChange={setStatusFilter}
					options={statusOptions}
					className="w-36"
				/>
			</div>

			<DataTable
				rowKey="key"
				columns={columns}
				dataSource={filteredData}
				loading={isLoading}
				pagination={{ pageSize: 15 }}
				rowSelection={rowSelection}
				locale={{ emptyText: <Empty description={t('secrets.noSecrets')} /> }}
				scroll={{ x: 800 }}
			/>

			{/* Detail Drawer */}
			<Drawer
				title={detailKey ?? t('common.viewDetail')}
				open={!!detailKey}
				onClose={() => {
					setDetailKey(null);
				}}
				size="md"
				loading={detailLoading}
				className="!w-full sm:!w-[480px]"
			>
				{detail && (
					<Descriptions column={2} bordered size="small" className="mb-6">
						<Descriptions.Item label={t('secrets.detailId')}>{detail.id}</Descriptions.Item>
						<Descriptions.Item label={t('secrets.column.key')}>
							<code>{detail.key}</code>
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.column.status')}>
							<Tag color={statusColors[detail.status!] || 'default'}>{detail.status}</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.column.version')}>
							{detail.version}
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.column.description')} span={2}>
							{detail.description || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.detailExpiresAt')}>
							{detail.expiresAt
								? new Date(detail.expiresAt!).toLocaleString()
								: t('secrets.detailNever')}
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.detailNotifyBefore')}>
							{detail.notifyBefore
								? t('secrets.detailNotifyBeforeDays', { days: detail.notifyBefore })
								: '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.column.updatedAt')}>
							{new Date(detail.updatedAt!).toLocaleString()}
						</Descriptions.Item>
						<Descriptions.Item label={t('secrets.detailCreatedAt')}>
							{new Date(detail.createdAt!).toLocaleString()}
						</Descriptions.Item>
					</Descriptions>
				)}

				{versions.length > 0 && (
					<>
						<Text strong className="block mb-2">
							{t('secrets.versionHistory')}
						</Text>
						<DataTable<SecretVersionResponse>
							rowKey="version"
							dataSource={versions}
							loading={!versions}
							size="small"
							pagination={false}
							scroll={{ x: 800 }}
							columns={[
								{
									title: t('secrets.versionColumn'),
									dataIndex: 'version',
									key: 'version',
									width: 80,
								},
								{ title: t('secrets.createdBy'), dataIndex: 'createdBy', key: 'createdBy' },
								{
									title: t('secrets.detailCreatedAt'),
									dataIndex: 'createdAt',
									key: 'createdAt',
									render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
								},
								{
									title: '',
									key: 'action',
									width: 80,
									render: (_: unknown, v: SecretVersionResponse) => (
										<Button
											type="link"
											size="small"
											loading={versionValueLoading}
											onClick={() =>
												v.version != null && handleViewVersionValue(detailKey!, v.version)
											}
										>
											{t('secrets.view')}
										</Button>
									),
								},
							]}
						/>
					</>
				)}
			</Drawer>

			{/* Version Value Modal */}
			<Modal
				title={t('secrets.versionValueTitle', { version: versionValueData?.version })}
				open={versionValueVisible}
				onCancel={() => setVersionValueVisible(false)}
				footer={null}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Input.TextArea
					value={versionValueData?.value ?? ''}
					readOnly
					rows={6}
					className="font-mono"
				/>
			</Modal>

			{/* Create/Edit Modal */}
			<Modal
				title={editing ? t('secrets.modal.edit') : t('secrets.modal.create')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnHidden
				width={560}
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="key"
						label={t('secrets.form.key')}
						rules={[{ required: true, message: t('secrets.form.keyRequired'), max: 512 }]}
					>
						<Input placeholder={t('secrets.form.keyPlaceholder')} disabled={!!editing} />
					</Form.Item>
					<Form.Item
						name="value"
						label={t('secrets.form.value')}
						rules={editing ? [] : [{ required: true, message: t('secrets.form.valueRequired') }]}
					>
						<Input.Password
							placeholder={
								editing ? t('secrets.form.valueEmpty') : t('secrets.form.valuePlaceholder')
							}
						/>
					</Form.Item>
					<Form.Item name="description" label={t('secrets.form.description')}>
						<Input.TextArea rows={3} placeholder={t('secrets.form.descriptionPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			{/* Rotate Modal */}
			<Modal
				title={t('secrets.rotateTitle', { key: rotatingTarget?.key ?? '' })}
				open={rotateVisible}
				onCancel={() => {
					setRotateVisible(false);
					setRotatingTarget(null);
					rotateForm.resetFields();
				}}
				onOk={() => rotateForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={rotateForm} layout="vertical" onFinish={handleRotate}>
					<Form.Item
						name="value"
						label={t('secrets.form.newValue')}
						rules={[{ required: true, message: t('secrets.form.newValueRequired') }]}
					>
						<Input.Password placeholder={t('secrets.form.newValuePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

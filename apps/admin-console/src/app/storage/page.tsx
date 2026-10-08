'use client';

import React, { useState } from 'react';
import { Tabs, Card, Button, Tree, Progress, Space, Upload, Modal, Form, Input, Row, Col } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	Download,
	File,
	FileArchive,
	FileImage,
	FileText,
	FolderPlus,
	Trash2,
	Undo2,
	Upload as UploadIcon,
} from 'lucide-react';
import {
	useFiles,
	useStorageQuota,
	useStorageStats,
	useStorageTrash,
	useRestoreTrashItem,
	useDeleteTrashItem,
	useCreateFolder,
	useDeleteFile,
	useUploadFile,
	type FileRecord,
	type TrashRecord,
} from '@/hooks/use-storage';
import { downloadFile } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

import { useTranslation } from 'react-i18next';

const getFileIcon = (type: string) => {
	if (type?.startsWith('image/')) return <FileImage size="1em" className="text-info" />;
	if (type?.includes('zip') || type?.includes('rar'))
		return <FileArchive size="1em" className="text-warning" />;
	if (type?.startsWith('text/')) return <FileText size="1em" className="text-success" />;
	return <File size="1em" className="text-neutral-600" />;
};

const formatSize = (bytes: number) => {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default function StoragePage() {
	const { t } = useTranslation();
	const [activeTab, setActiveTab] = useState('files');
	const [selectedFolder, setSelectedFolder] = useState<string>('');
	const [newFolderVisible, setNewFolderVisible] = useState(false);
	const [newFolderForm] = Form.useForm();
	// A-301：文件/回收站受控分页（服务端 page/page_size + total 驱动）
	const [filesPage, setFilesPage] = useState(1);
	const [filesPageSize, setFilesPageSize] = useState(10);
	const [trashPage, setTrashPage] = useState(1);
	const [trashPageSize, setTrashPageSize] = useState(10);

	const {
		data: filesResult,
		isLoading: filesLoading,
		error: filesError,
		refetch: filesRefetch,
	} = useFiles({
		parentId: selectedFolder || undefined,
		page: filesPage,
		pageSize: filesPageSize,
	});
	const files = filesResult?.items ?? [];
	const filesTotal = filesResult?.pagination?.total ?? 0;
	const {
		data: quota,
		error: storageQuotaError,
		refetch: storageQuotaRefetch,
	} = useStorageQuota();
	const {
		data: stats,
		error: storageStatsError,
		refetch: storageStatsRefetch,
	} = useStorageStats();
	const {
		data: trashResult,
		isLoading: trashLoading,
		error: storageTrashError,
		refetch: storageTrashRefetch,
	} = useStorageTrash({ page: trashPage, pageSize: trashPageSize });
	const trash = trashResult?.items ?? [];
	const trashTotal = trashResult?.pagination?.total ?? 0;
	const restoreMut = useRestoreTrashItem();
	const deleteTrashMut = useDeleteTrashItem();
	const createFolderMut = useCreateFolder();
	const deleteFileMut = useDeleteFile();
	const uploadMut = useUploadFile();

	const handleUpload = async (file: File) => {
		const formData = new FormData();
		formData.append('file', file);
		// 服务端认 parent_id（旧 'path' 字段被忽略；不传 owner_id——非本人会被拒 403）
		if (selectedFolder) formData.append('parent_id', selectedFolder);
		try {
			await uploadMut.mutateAsync(formData);
			message.success(t('storage.uploadSuccess'));
		} catch (err) {
			handleApiError(err, t('storage.uploadFailed'));
		}
		return false;
	};

	const handleDownload = async (record: FileRecord) => {
		try {
			// TASK-AB1-21 / A-294：行标识取 fileId（wire file_id）
			const res = await downloadFile(record.fileId);
			const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = record.name || 'download';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			handleApiError(err, t('storage.downloadFailed'));
		}
	};

	const handleCreateFolder = async (values: { name: string }) => {
		try {
			// A-302③：撤 ownerId（CreateFolderRequest 无此字段，服务端静默忽略的无效字段）
			await createFolderMut.mutateAsync({
				name: values.name,
				parentId: selectedFolder || undefined,
			});
			message.success(t('storage.createFolderSuccess', { name: values.name }));
			setNewFolderVisible(false);
			newFolderForm.resetFields();
		} catch (err) {
			handleApiError(err, t('storage.createFolderFailed'));
		}
	};

	const handleDeleteFile = (fileId: string) => {
		modal.confirm({
			title: t('storage.confirmDeleteTitle'),
			content: t('storage.confirmDeleteContent'),
			onOk: async () => {
				try {
					await deleteFileMut.mutateAsync(fileId);
					message.success(t('storage.fileMovedToTrash'));
				} catch (err) {
					handleApiError(err, t('storage.deleteFailed'));
				}
			},
		});
	};

	const handleRestore = async (fileId: string) => {
		try {
			await restoreMut.mutateAsync(fileId);
			message.success(t('storage.restoreSuccess'));
		} catch (err) {
			handleApiError(err, t('storage.restoreFailed'));
		}
	};

	const handlePermanentDelete = async (fileId: string) => {
		modal.confirm({
			title: t('storage.permanentDeleteTitle'),
			content: t('storage.permanentDeleteContent'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deleteTrashMut.mutateAsync(fileId);
					message.success(t('storage.permanentlyDeleted'));
				} catch (err) {
					handleApiError(err, t('storage.deleteFailed'));
				}
			},
		});
	};

	// ADM-010: 后端返回 quota_bytes/used_bytes/available_bytes（camelCase 后为 quotaBytes 等），
	// 原先取 quota?.totalBytes（undefined→1）导致 usedBytes/totalBytes 负数 → formatSize(NaN)
	const totalBytes = quota?.quotaBytes || quota?.totalBytes || 0;
	const usedBytes = quota?.usedBytes || 0;
	const remaining = totalBytes > usedBytes ? totalBytes - usedBytes : 0;
	const usedPercent =
		totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;

	const treeData = [
		{
			title: t('storage.allFiles'),
			key: '',
			children: [
				{ title: t('storage.documents'), key: '/documents' },
				{ title: t('storage.images'), key: '/images' },
				{ title: t('storage.videos'), key: '/videos' },
				{ title: t('storage.others'), key: '/others' },
			],
		},
	];

	const fileColumns = [
		{
			title: t('storage.column.fileName'),
			dataIndex: 'name',
			key: 'name',
			render: (_: any, record: FileRecord) => (
				<Space>
					{getFileIcon(record.type)}
					<span>{record.name}</span>
				</Space>
			),
		},
		{ title: t('storage.column.type'), dataIndex: 'type', key: 'type' },
		{
			title: t('storage.column.size'),
			dataIndex: 'size',
			key: 'size',
			render: (v: number) => formatSize(v),
		},
		{ title: t('storage.column.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
		{
			title: t('storage.column.actions'),
			key: 'action',
			render: (_: any, record: FileRecord) => (
				<Space size="small">
					<Button type="link" icon={<Download size="1em" />} onClick={() => handleDownload(record)}>
						{t('storage.download')}
					</Button>
					<Button
						type="link"
						danger
						icon={<Trash2 size="1em" />}
						onClick={() => handleDeleteFile(record.fileId)}
					>
						{t('storage.delete')}
					</Button>
				</Space>
			),
		},
	];

	const trashColumns = [
		{
			title: t('storage.column.fileName'),
			dataIndex: 'name',
			key: 'name',
			render: (_: any, record: TrashRecord) => (
				<Space>
					{getFileIcon(record.type)}
					<span>{record.name}</span>
				</Space>
			),
		},
		{ title: t('storage.column.type'), dataIndex: 'type', key: 'type' },
		{
			title: t('storage.column.size'),
			dataIndex: 'size',
			key: 'size',
			render: (v: number) => formatSize(v),
		},
		{ title: t('storage.column.deletedAt'), dataIndex: 'deletedAt', key: 'deletedAt' },
		{
			title: t('storage.column.actions'),
			key: 'action',
			render: (_: any, record: TrashRecord) => (
				<Space size="small">
					<Button type="link" icon={<Undo2 size="1em" />} onClick={() => handleRestore(record.fileId)}>
						{t('storage.restore')}
					</Button>
					<Button
						type="link"
						danger
						icon={<Trash2 size="1em" />}
						onClick={() => handlePermanentDelete(record.fileId)}
					>
						{t('storage.permanentDelete')}
					</Button>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('storage.title')}
				actions={
					<>
						<Space>
							<Upload beforeUpload={handleUpload} showUploadList={false}>
								<Button icon={<UploadIcon size="1em" />}>{t('storage.uploadFile')}</Button>
							</Upload>
							<Button icon={<FolderPlus size="1em" />} onClick={() => setNewFolderVisible(true)}>
								{t('storage.newFolder')}
							</Button>
						</Space>
					</>
				}
			/>

			{filesError && (
				<PageError message={t('storage.loadFailed')} retry={filesRefetch} className="mb-4" />
			)}

			{storageQuotaError && (
				<PageError message={t('storage.loadFailed')} retry={storageQuotaRefetch} className="mb-4" />
			)}

			{storageStatsError && (
				<PageError message={t('storage.loadFailed')} retry={storageStatsRefetch} className="mb-4" />
			)}

			{storageTrashError && (
				<PageError message={t('storage.loadFailed')} retry={storageTrashRefetch} className="mb-4" />
			)}
			<Card className="mb-4" size="small">
				<Row gutter={16} align="middle">
					<Col xs={24} md={12}>
						<div className="text-sm text-neutral-600 mb-1">{t('storage.storageQuota')}</div>
						<Progress percent={usedPercent} status={usedPercent >= 90 ? 'exception' : 'normal'} />
					</Col>
					<Col xs={8} md={4}>
						<div className="text-sm text-neutral-600">{t('storage.totalCapacity')}</div>
						<div className="font-semibold">{formatSize(totalBytes)}</div>
					</Col>
					<Col xs={8} md={4}>
						<div className="text-sm text-neutral-600">{t('storage.used')}</div>
						<div className="font-semibold">{formatSize(usedBytes)}</div>
					</Col>
					<Col xs={8} md={4}>
						<div className="text-sm text-neutral-600">{t('storage.remaining')}</div>
						<div className="font-semibold">{formatSize(remaining)}</div>
					</Col>
				</Row>
			</Card>

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'files',
						label: t('storage.allFiles'),
						children: (
							<div className="flex gap-4">
								<div className="w-48 shrink-0">
									<Tree
										treeData={treeData}
										selectedKeys={[selectedFolder]}
										onSelect={(keys) => {
											setSelectedFolder((keys[0] as string) || '');
											// A-301：切换目录回到第 1 页（避免旧页码落在新过滤集之外）
											setFilesPage(1);
										}}
									/>
								</div>
								<div className="flex-1 min-w-0">
									<DataTable
										rowKey="fileId"
										columns={fileColumns}
										dataSource={files}
										loading={filesLoading}
										pagination={{
											// A-301：服务端分页受控（旧本地 pageSize:10 无参上行 ⇒ 截断）
											current: filesPage,
											pageSize: filesPageSize,
											total: filesTotal,
											showSizeChanger: true,
											onChange: (p, ps) => {
												setFilesPage(p);
												setFilesPageSize(ps);
											},
										}}
										scroll={{ x: 800 }}
									/>
								</div>
							</div>
						),
					},
					{
						key: 'trash',
						label: t('storage.recycleBin'),
						children: (
							<DataTable
								rowKey="fileId"
								columns={trashColumns}
								dataSource={trash}
								loading={trashLoading}
								pagination={{
									// A-301：回收站服务端分页受控
									current: trashPage,
									pageSize: trashPageSize,
									total: trashTotal,
									showSizeChanger: true,
									onChange: (p, ps) => {
										setTrashPage(p);
										setTrashPageSize(ps);
									},
								}}
								scroll={{ x: 800 }}
							/>
						),
					},
				]}
			/>

			<Modal
				title={t('storage.newFolderTitle')}
				open={newFolderVisible}
				onCancel={() => {
					setNewFolderVisible(false);
					newFolderForm.resetFields();
				}}
				onOk={() => newFolderForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={newFolderForm} layout="vertical" onFinish={handleCreateFolder}>
					<Form.Item
						name="name"
						label={t('storage.folderName')}
						rules={[{ required: true, message: t('storage.folderNameRequired') }]}
					>
						<Input placeholder={t('storage.newFolderPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

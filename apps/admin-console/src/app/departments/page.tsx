'use client';

import React, { useState, useMemo } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { Tree, Card, Button, Space, Tag, Modal, Form, Input, Empty, Typography } from 'antd';
import { message, modal } from '@/lib/antd-app';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DataNode } from 'antd/es/tree';
import {
	useDepartments,
	useCreateDepartment,
	useUpdateDepartment,
	useDeleteDepartment,
} from '@/hooks/use-departments';

import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { createDepartmentSchema } from '@/lib/validators';

interface DeptRecord {
	id: string;
	name: string;
	code?: string;
	parentId?: string;
	memberCount: number;
}

function buildTree(data: DeptRecord[], t: (key: string, options?: any) => string): DataNode[] {
	const map: Record<string, DataNode> = {};
	const roots: DataNode[] = [];

	data.forEach((item) => {
		map[item.id] = {
			key: item.id,
			title: (
				<span className="flex items-center gap-2">
					{item.name}
					<Tag>{t('departments.memberCountValue', { count: item.memberCount })}</Tag>
				</span>
			),
			children: [],
		};
	});

	data.forEach((item) => {
		if (item.parentId && map[item.parentId]) {
			map[item.parentId].children!.push(map[item.id]);
		} else {
			roots.push(map[item.id]);
		}
	});

	return roots;
}

export default function DepartmentsPage() {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<DeptRecord | null>(null);
	const [form] = Form.useForm();

	const tenantId = useCurrentTenantId() ?? '';
	const { data = [], isLoading, error, refetch } = useDepartments(tenantId);
	const createMut = useCreateDepartment();
	const updateMut = useUpdateDepartment();
	const deleteMut = useDeleteDepartment();

	const treeData = useMemo(() => buildTree(data as DeptRecord[], t), [data, t]);
	const selectedDept = (data as DeptRecord[]).find((d) => d.id === selectedId);

	const handleSave = async (values: any) => {
		if (!tenantId) {
			message.error(t('departments.noTenantId'));
			return;
		}
		const result = createDepartmentSchema.safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		try {
			if (editing) {
				await updateMut.mutateAsync({ tenantId, id: editing.id, data: result.data });
				message.success(t('departments.updateSuccess'));
			} else {
				const payload = selectedId ? { ...result.data, parentId: selectedId } : result.data;
				await createMut.mutateAsync({ tenantId, data: payload });
				message.success(t('departments.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('departments.saveFailed'));
		}
	};

	const handleDelete = (id: string) => {
		if (!tenantId) return;
		modal.confirm({
			title: t('common.confirmDelete'),
			content: t('departments.deleteConfirmContent'),
			okText: t('common.delete'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await deleteMut.mutateAsync({ tenantId, id });
					message.success(t('departments.deleteSuccess'));
					setSelectedId(null);
				} catch (err) {
					handleApiError(err, t('departments.deleteFailed'));
				}
			},
		});
	};

	return (
		<div>
			<AppPageHeader
				title={t('departments.title')}
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
							{t('departments.createDepartment')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('departments.loadError')} retry={refetch} className="mb-4" />}
			<div className="flex gap-6 flex-col md:flex-row">
				<Card className="w-full md:w-80" title={t('departments.orgTree')} loading={isLoading}>
					{treeData.length === 0 ? (
						<Empty description={t('departments.noDepartments')} />
					) : (
						<Tree
							treeData={treeData}
							selectedKeys={selectedId ? [selectedId] : []}
							onSelect={(keys) => setSelectedId(keys[0] as string | null)}
							defaultExpandAll
						/>
					)}
				</Card>

				<Card className="flex-1" title={t('departments.departmentDetail')}>
					{selectedDept ? (
						<div>
							<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
								<div className="flex items-center gap-2">
									<Network size="1em" />
									<span className="text-lg font-medium">{selectedDept.name}</span>
								</div>
								<Space>
									<Button
										icon={<Plus size="1em" />}
										onClick={() => {
											setEditing(null);
											form.resetFields();
											setModalVisible(true);
										}}
									>
										{t('departments.addSubDepartment')}
									</Button>
									<Button
										icon={<Pencil size="1em" />}
										onClick={() => {
											setEditing(selectedDept);
											form.setFieldsValue({ name: selectedDept.name });
											setModalVisible(true);
										}}
									>
										{t('common.edit')}
									</Button>
									<Button
										danger
										icon={<Trash2 size="1em" />}
										onClick={() => handleDelete(selectedDept.id)}
									>
										{t('common.delete')}
									</Button>
								</Space>
							</div>
							<div className="text-neutral-600 space-y-2">
								<p>
									{t('departments.departmentId')}
									<Typography.Text copyable={{ text: selectedDept.id }} title={selectedDept.id}>
										{selectedDept.id.length > 8 ? `${selectedDept.id.slice(0, 8)}…` : selectedDept.id}
									</Typography.Text>
								</p>
								{selectedDept.code && (
									<p>
										{t('departments.departmentCode')}
										{selectedDept.code}
									</p>
								)}
								<p>
									{t('departments.memberCount')}
									{selectedDept.memberCount} {t('departments.people')}
								</p>
								<p>
									{t('departments.parentDepartment')}
									{selectedDept.parentId
										? (data as DeptRecord[]).find((d) => d.id === selectedDept.parentId)?.name ||
											'-'
										: t('departments.none')}
								</p>
							</div>
						</div>
					) : (
						<Empty description={t('departments.selectDepartment')} />
					)}
				</Card>
			</div>

			<Modal
				title={editing ? t('departments.editDepartment') : t('departments.createDepartment')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="name"
						label={t('departments.departmentName')}
						rules={[{ required: true, message: t('departments.departmentNameRequired') }]}
					>
						<Input placeholder={t('departments.departmentNamePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}

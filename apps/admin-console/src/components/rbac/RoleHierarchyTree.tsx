'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Tree, Input, Descriptions, Tag, Spin, Empty, Button, Space } from 'antd';
import { Network, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { extractList } from '@autional/shared';
import { Drawer } from '@autional/ui/antd';
import { useRoles } from '@/hooks/use-roles';
import { useRoleChildren, useRoleParents } from '@/hooks/use-role-hierarchy';
import type { RoleRecord } from '@/hooks/use-roles';
import type { DataNode, EventDataNode } from 'antd/es/tree';

function buildTreeNode(role: RoleRecord): DataNode {
	return {
		title: `${role.name} (${role.code})`,
		key: role.id,
		isLeaf: false,
	} as DataNode;
}

export function RoleHierarchyTree() {
	// TASK-AB1-18：useRoles 返回 { items, total }（服务端分页结果），树取当前页 items。
	const { data: rolesResult, isLoading, refetch: refetchRoles } = useRoles();
	const roles = rolesResult?.items ?? [];
	const { t } = useTranslation();
	const [searchText, setSearchText] = useState('');
	const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
	const [loadedChildren, setLoadedChildren] = useState<Set<string>>(new Set());
	const [drawerRoleId, setDrawerRoleId] = useState<string | null>(null);

	const { data: drawerChildren = [], isLoading: drawerChildrenLoading } = useRoleChildren(
		drawerRoleId || '',
	);
	const { data: drawerParents = [], isLoading: drawerParentsLoading } = useRoleParents(
		drawerRoleId || '',
	);

	const filteredRoles = useMemo(() => {
		const rows = rolesResult?.items ?? [];
		if (!searchText) return rows;
		const lower = searchText.toLowerCase();
		return rows.filter(
			(r: RoleRecord) =>
				r.name.toLowerCase().includes(lower) || r.code.toLowerCase().includes(lower),
		);
	}, [rolesResult, searchText]);

	const handleLoadData = useCallback(
		async (node: EventDataNode<DataNode>) => {
			const roleId = node.key as string;
			if (loadedChildren.has(roleId)) return;

			const response = await import('@/lib/api.generated').then((m) => m.getRoleChildren(roleId));
			const children: Array<{ id: string; name: string; code: string }> = extractList(response);
			setLoadedChildren((prev) => new Set(prev).add(roleId));

			const childNodes: DataNode[] = children.map((child) => ({
				title: `${child.name} (${child.code})`,
				key: child.id,
				isLeaf: false,
			}));

			const mutableNode = node as unknown as { children?: DataNode[] };
			if (mutableNode.children) {
				mutableNode.children = [...mutableNode.children, ...childNodes];
			}
		},
		[loadedChildren],
	);

	const treeData = useMemo(() => {
		return filteredRoles.map((r: RoleRecord) => buildTreeNode(r));
	}, [filteredRoles]);

	const onSelect = useCallback((selectedKeys: React.Key[]) => {
		if (selectedKeys.length > 0) {
			setDrawerRoleId(selectedKeys[0] as string);
		}
	}, []);

	const drawerRole = drawerRoleId ? roles.find((r: RoleRecord) => r.id === drawerRoleId) : null;

	return (
		<div>
			<div className="flex items-center justify-between mb-4 gap-4">
				<Input
					placeholder={t('roleHierarchy.searchPlaceholder')}
					prefix={<Search size="1em" />}
					value={searchText}
					onChange={(e) => setSearchText(e.target.value)}
					allowClear
					className="max-w-sm"
				/>
				<Button icon={<RefreshCw size="1em" />} onClick={() => refetchRoles()}>
					{t('common.refresh')}
				</Button>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-12">
					<Spin size="large" />
				</div>
			) : treeData.length === 0 ? (
				<Empty description={searchText ? t('roleHierarchy.noMatch') : t('roleHierarchy.noData')} />
			) : (
				<Tree
					showLine={{ showLeafIcon: false }}
					showIcon
					icon={<Network size="1em" />}
					loadData={handleLoadData}
					treeData={treeData}
					expandedKeys={expandedKeys}
					onExpand={(keys) => setExpandedKeys(keys)}
					onSelect={onSelect}
					className="bg-white rounded-lg p-4"
				/>
			)}

			<Drawer
				title={
					drawerRole
						? t('roleHierarchy.detailWithName', { name: drawerRole.name })
						: t('roleHierarchy.detail')
				}
				open={!!drawerRoleId}
				onClose={() => setDrawerRoleId(null)}
				size="sm"
			>
				{drawerRole && (
					<Space direction="vertical" className="w-full" size="large">
						<Descriptions bordered column={1} size="small">
							<Descriptions.Item label={t('roleHierarchy.roleCode')}>
								<Tag>{drawerRole.code}</Tag>
							</Descriptions.Item>
							<Descriptions.Item label={t('roleHierarchy.roleName')}>
								{drawerRole.name}
							</Descriptions.Item>
							<Descriptions.Item label={t('common.description')}>
								{drawerRole.description || '-'}
							</Descriptions.Item>
						</Descriptions>

						<div>
							<div className="font-medium mb-2">
								{t('roleHierarchy.parentRoles')}
								{drawerParentsLoading && <Spin size="small" className="ml-2" />}
							</div>
							{drawerParents.length === 0 ? (
								<Empty
									description={t('roleHierarchy.noParent')}
									image={Empty.PRESENTED_IMAGE_SIMPLE}
								/>
							) : (
								<Space wrap>
									{drawerParents.map((p: { id: string; name: string; code: string }) => (
										<Tag
											key={p.id}
											color="blue"
											className="cursor-pointer"
											onClick={() => setDrawerRoleId(p.id)}
										>
											{p.name} ({p.code})
										</Tag>
									))}
								</Space>
							)}
						</div>

						<div>
							<div className="font-medium mb-2">
								{t('roleHierarchy.childRoles')}
								{drawerChildrenLoading && <Spin size="small" className="ml-2" />}
							</div>
							{drawerChildren.length === 0 ? (
								<Empty
									description={t('roleHierarchy.noChildren')}
									image={Empty.PRESENTED_IMAGE_SIMPLE}
								/>
							) : (
								<Space wrap>
									{drawerChildren.map((c: { id: string; name: string; code: string }) => (
										<Tag
											key={c.id}
											color="green"
											className="cursor-pointer"
											onClick={() => setDrawerRoleId(c.id)}
										>
											{c.name} ({c.code})
										</Tag>
									))}
								</Space>
							)}
						</div>
					</Space>
				)}
			</Drawer>
		</div>
	);
}

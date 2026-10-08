import { useEffect, useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Input, Button, Space, Tag, message, Modal, Typography } from 'antd';
import { Download, Eye, Lock, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AppPageHeader, EmptyState, LoadingScreen, SectionCard, StatusBadge } from '@autional/ui';
import { searchProfiles, archiveProfile, exportProfile } from '@/lib/api.generated';
import { extractItem, useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';

const { Text } = Typography;

export default function ProfilesPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const [keyword, setKeyword] = useState('');
	const [loading, setLoading] = useState(false);
	const [data, setData] = useState<any[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<string[]>([]);

	const fetchProfiles = async (keyword: string, page: number, pageSize: number) => {
		setLoading(true);
		try {
			const res = await searchProfiles({ keyword, page, page_size: pageSize });
			// ADM-004: apiClient 已 unwrap 后端 { code, items, total } → { items, total }，
			// 兼容嵌套 { data: { items, total } } 与扁平数组两种形状
			const d = extractItem((res as any)?.data) ?? (res as any) ?? null;
			const items = d?.items ?? (Array.isArray(d) ? d : []);
			if (Array.isArray(items)) {
				setData(items);
				setTotal(d?.total ?? items.length);
			}
		} catch (err: any) {
			message.error(err?.message || t('profilesList.searchFailed'));
		} finally {
			setLoading(false);
		}
	};

	// ADM-004: 初始挂载即拉取（此前只在 onSearch 时取数，页面永远空态）
	useEffect(() => {
		fetchProfiles('', 1, 20);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleSearch = () => {
		setPage(1);
		fetchProfiles(keyword, 1, 20);
	};

	const handleArchive = async (userId: string) => {
		Modal.confirm({
			title: t('profilesList.archiveTitle'),
			content: t('profilesList.archiveConfirm'),
			onOk: async () => {
				try {
					await archiveProfile(userId, { reason: 'Admin action' });
					message.success(t('profilesList.archiveSuccess'));
					fetchProfiles(keyword, page, 20);
				} catch (err: any) {
					message.error(err?.message || t('profilesList.archiveFailed'));
				}
			},
		});
	};

	const handleExport = async (userId: string) => {
		try {
			const res = await exportProfile(userId, { format: 'json' });
			const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `profile-${userId}.json`;
			a.click();
			URL.revokeObjectURL(url);
			message.success(t('profilesList.exportSuccess'));
		} catch (err: any) {
			message.error(err?.message || t('profilesList.exportFailed'));
		}
	};

	const columns = [
		{
			title: t('profilesList.column.userId'),
			dataIndex: 'id',
			key: 'id',
			width: 220,
			ellipsis: true,
		},
		{
			title: t('profilesList.column.name'),
			key: 'name',
			render: (_: any, r: any) =>
				r.displayName || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '-',
		},
		{ title: t('profilesList.column.country'), dataIndex: 'country', key: 'country' },
		{ title: t('profilesList.column.city'), dataIndex: 'city', key: 'city' },
		{
			title: t('profilesList.column.updated'),
			dataIndex: 'updatedAt',
			key: 'updatedAt',
			render: (v: string) => (v ? new Date(v).toLocaleDateString() : '-'),
		},
		{
			title: t('common.actions'),
			key: 'actions',
			render: (_: any, r: any) => (
				<Space>
					<Button size="small" icon={<Eye size="1em" />} onClick={() => navigate(buildNavHref(`/profiles/${r.id}`, tenantSlug))}>
						{t('profilesList.action.view')}
					</Button>
					<Button size="small" icon={<Lock size="1em" />} onClick={() => handleArchive(r.id)} danger>
						{t('profilesList.action.archive')}
					</Button>
					<Button size="small" icon={<Download size="1em" />} onClick={() => handleExport(r.id)}>
						{t('profilesList.action.export')}
					</Button>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('profilesList.title')} description={t('profilesList.subtitle')} />
			<SectionCard>
				<Space className="mb-4">
					<Input.Search
						placeholder={t('profilesList.searchPlaceholder')}
						value={keyword}
						onChange={(e) => setKeyword(e.target.value)}
						onSearch={handleSearch}
						enterButton={<Search size="1em" />}
						className="w-[300px]"
						allowClear
					/>
				</Space>
				{selected.length > 0 && (
					<Space className="mb-4">
						<Text>{t('profilesList.selected', { count: selected.length })}</Text>
					</Space>
				)}
				<DataTable
					columns={columns}
					dataSource={data}
					rowKey="id"
					loading={loading}
					scroll={{ x: 800 }}
					rowSelection={{
						selectedRowKeys: selected,
						onChange: (keys) => setSelected(keys as string[]),
					}}
					pagination={{
						current: page,
						total,
						pageSize: 20,
						onChange: (p) => {
							setPage(p);
							fetchProfiles(keyword, p, 20);
						},
					}}
					locale={{
						emptyText: (
							<EmptyState
								title={t('profilesList.emptyTitle')}
								description={t('profilesList.emptyDescription')}
							/>
						),
					}}
				/>
			</SectionCard>
		</div>
	);
}

// @generated-api-exempt: 1 key(s) [PROFILE.PROFILE_VERSIONS] lack generated func
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
	Descriptions,
	Button,
	Tag,
	Space,
	message,
	Card,
	Tabs,
	Timeline,
	Modal,
	Select,
} from 'antd';
import {
	ArrowLeft,
	Download,
	History,
	Lock,
	Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppPageHeader, EmptyState, ErrorState, LoadingScreen, SectionCard } from '@autional/ui';
import { apiClient, API_PATHS, extractItem, useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { getProfile, archiveProfile, exportProfile } from '@/lib/api.generated';

export default function ProfileDetailPage() {
	const { t } = useTranslation();
	const { userId } = useParams<{ userId: string }>();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const [profile, setProfile] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [versions, setVersions] = useState<any[]>([]);
	const [approvalOpen, setApprovalOpen] = useState(false);
	const [approvalAction, setApprovalAction] = useState('archive');
	const [approvalReason, setApprovalReason] = useState('');

	useEffect(() => {
		if (!userId) return;
		setLoading(true);
		Promise.all([
			getProfile(userId),
			apiClient
				.get(API_PATHS.PROFILE.PROFILE_VERSIONS(userId))
				.catch(() => ({ data: { data: { versions: [] } } })),
		])
			.then(([profileRes, versionsRes]) => {
				setProfile(extractItem(profileRes)?.profile);
				setVersions(extractItem(versionsRes.data)?.versions || []);
			})
			.catch((err) => setError(err?.message || t('profileDetail.loadError')))
			.finally(() => setLoading(false));
	}, [userId]);

	const handleRequestApproval = async () => {
		try {
			await apiClient.post(API_PATHS.PROFILE.ADMIN_APPROVAL_REQUESTS, {
				action: approvalAction,
				user_ids: [userId],
				reason: approvalReason,
			});
			message.success(t('profileDetail.approvalSubmitted'));
			setApprovalOpen(false);
		} catch (err: any) {
			message.error(err?.message || t('profileDetail.approvalFailed'));
		}
	};

	const handleArchive = async () => {
		if (!userId) return;
		try {
			await archiveProfile(userId, { reason: 'Admin action' });
			message.success(t('profileDetail.archiveSuccess'));
			setProfile((p: any) => (p ? { ...p, archived: true } : p));
		} catch (err: any) {
			message.error(err?.message || t('profileDetail.archiveFailed'));
		}
	};

	const handleExport = async () => {
		if (!userId) return;
		try {
			const res = await exportProfile(userId, { format: 'json' });
			const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `profile-${userId}.json`;
			a.click();
			URL.revokeObjectURL(url);
			message.success(t('profileDetail.exportSuccess'));
		} catch (err: any) {
			message.error(err?.message || t('profileDetail.exportFailed'));
		}
	};

	if (loading) return <LoadingScreen message={t('profileDetail.loading')} />;
	if (error)
		return (
			<ErrorState
				title={t('profileDetail.loadError')}
				description={error}
				onRetry={() => window.location.reload()}
			/>
		);
	if (!profile) return <ErrorState title={t('profileDetail.notFound')} />;

	const tabItems = [
		{
			key: 'info',
			label: t('profileDetail.tab.profileInfo'),
			children: (
				<>
					<Card title={t('profileDetail.section.basicInfo')} className="mb-4">
						<Descriptions column={2} bordered size="small">
							<Descriptions.Item label={t('profileDetail.field.firstName')}>
								{profile.firstName || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.lastName')}>
								{profile.lastName || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.nickname')}>
								{profile.nickname || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.gender')}>
								{profile.gender
									? t(`profileDetail.gender.${String(profile.gender).toLowerCase()}`, {
											defaultValue: String(profile.gender),
										})
									: '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.birthdate')}>
								{profile.birthdate || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.bio')} span={2}>
								{profile.bio || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.website')}>
								{profile.website || '-'}
							</Descriptions.Item>
						</Descriptions>
					</Card>
					<Card title={t('profileDetail.section.locationContact')} className="mb-4">
						<Descriptions column={2} bordered size="small">
							<Descriptions.Item label={t('profileDetail.field.country')}>
								{profile.country || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.city')}>
								{profile.city || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.address')}>
								{profile.address || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.timezone')}>
								{profile.timezone || '-'}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.language')}>
								{profile.language || '-'}
							</Descriptions.Item>
						</Descriptions>
					</Card>
					{profile.socialLinks && Object.keys(profile.socialLinks).length > 0 && (
						<Card title={t('profileDetail.section.socialLinks')} className="mb-4">
							<Space wrap>
								{Object.entries(profile.socialLinks as Record<string, string>).map(([k, v]) => (
									<Tag key={k} color="blue">
										{k}: {v}
									</Tag>
								))}
							</Space>
						</Card>
					)}
					<Card title={t('profileDetail.section.timestamps')}>
						<Descriptions column={2} bordered size="small">
							<Descriptions.Item label={t('profileDetail.field.created')}>
								{new Date(profile.createdAt).toLocaleString()}
							</Descriptions.Item>
							<Descriptions.Item label={t('profileDetail.field.updated')}>
								{new Date(profile.updatedAt).toLocaleString()}
							</Descriptions.Item>
						</Descriptions>
					</Card>
				</>
			),
		},
		{
			key: 'history',
			label: (
				<span>
					<History size="1em" /> {t('profileDetail.tab.versionHistory')}
				</span>
			),
			children:
				versions.length > 0 ? (
					<Timeline
						items={versions.map((v: any) => ({
							children: (
								<div>
									<Tag color="blue">v{v.version}</Tag>
									<Tag>{v.changeType}</Tag>
									<span className="ml-2 text-[#888]">
										{v.changedBy} at {new Date(v.changedAt).toLocaleString()}
									</span>
								</div>
							),
						}))}
					/>
				) : (
					<EmptyState
						title={t('profileDetail.emptyVersionTitle')}
						description={t('profileDetail.emptyVersionDesc')}
					/>
				),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={
					profile.displayName ||
					profile.nickname ||
					`${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() ||
					userId
				}
				description={t('profileDetail.subtitleUser', { userId })}
			/>
			<Space className="mb-4">
				<Button icon={<ArrowLeft size="1em" />} onClick={() => navigate(buildNavHref('/profiles', tenantSlug))}>
					{t('profileDetail.action.back')}
				</Button>
				<Button icon={<Lock size="1em" />} danger onClick={handleArchive}>
					{t('profileDetail.action.archive')}
				</Button>
				<Button icon={<Download size="1em" />} onClick={handleExport}>
					{t('profileDetail.action.export')}
				</Button>
				<Button icon={<Send size="1em" />} onClick={() => setApprovalOpen(true)}>
					{t('profileDetail.action.requestApproval')}
				</Button>
			</Space>
			<Tabs defaultActiveKey="info" items={tabItems} />
			<Modal
				title={t('profileDetail.modal.approvalTitle')}
				open={approvalOpen}
				onCancel={() => setApprovalOpen(false)}
				onOk={handleRequestApproval}
				className="w-full max-w-[560px]"
			>
				<Select
					value={approvalAction}
					onChange={setApprovalAction}
					className="w-full mb-4"
					options={[
						{ label: t('profileDetail.modal.actionArchive'), value: 'archive' },
						{ label: t('profileDetail.modal.actionExport'), value: 'export' },
						{ label: t('profileDetail.modal.actionDelete'), value: 'delete' },
					]}
				/>
				<Input.TextArea
					rows={2}
					placeholder={t('profileDetail.modal.reasonPlaceholder')}
					value={approvalReason}
					onChange={(e) => setApprovalReason(e.target.value)}
				/>
			</Modal>
		</div>
	);
}

import { Input } from 'antd';

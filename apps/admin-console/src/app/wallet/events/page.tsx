'use client';
// @generated-api-exempt: 1 key(s) [WALLET.ADMIN_WALLET_INTEGRITY] lack generated func

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Button, Typography, Space, Spin, Descriptions } from 'antd';
import { Result } from '@autional/ui';
import {
	CheckCircle2,
	Link2,
	Search,
	XCircle,
} from 'lucide-react';
import { apiClient, API_PATHS, extractItem, usePageTitle } from '@autional/shared';
import { AppPageHeader } from '@autional/ui';
import { message } from '@/lib/antd-app';

const { Text } = Typography;

interface IntegrityResult {
	walletId: string;
	total: number;
	valid: boolean;
	brokenAt?: number;
	lastHash?: string;
}

export default function WalletEventsPage() {
	const { t } = useTranslation();
	usePageTitle(t('walletEvents.title')); // A-393①：tab 标题（旧实现恒「Autional 管理控制台」，第 31 例）
	const [walletId, setWalletId] = useState('');
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<IntegrityResult | null>(null);
	// W1-06（AC-B3-W1-06-1/2/4）：三态呈现——区分「钱包不存在（404）」/「空事件集警示」/
	// 「正常验证结果」；单一 error 字符串无法区分 404 与其他失败。
	const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

	const handleVerify = async () => {
		// A-393②：空输入不再静默（旧 return 零请求零反馈）——Enter 路径给提示；按钮侧另有禁用态。
		if (!walletId.trim()) {
			message.warning(t('walletEvents.inputRequired'));
			return;
		}
		setLoading(true);
		setError(null);
		setResult(null);
		try {
			const res = await apiClient.get(API_PATHS.WALLET.ADMIN_WALLET_INTEGRITY(walletId.trim()));
			setResult(extractItem(res.data));
		} catch (e: unknown) {
			// 404 = 钱包不存在（后端存在性前置检查，AC-B3-W1-06-1）；其余 = 普通失败。
			const ax = e as { response?: { status?: number }; status?: number };
			const notFound = ax?.response?.status === 404 || ax?.status === 404;
			const msg = e instanceof Error ? e.message : t('walletEvents.verifyFailed');
			setError({ message: msg, notFound });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			{/* A-393①：标题层级对齐（旧 Title level={3}=H3 手工页头，其余 7 页均 AppPageHeader=H1） */}
			<AppPageHeader title={t('walletEvents.title')} description={t('walletEvents.description')} />

			<Card>
				<Space.Compact className="w-full max-w-[500px]">
					<Input
						placeholder={t('walletEvents.inputPlaceholder')}
						value={walletId}
						onChange={(e) => setWalletId(e.target.value)}
						onPressEnter={handleVerify}
						prefix={<Link2 size="1em" />}
					/>
					<Button
						type="primary"
						icon={<Search size="1em" />}
						onClick={handleVerify}
						loading={loading}
						// A-393②：空输入禁用态（旧可点击但零反应）
						disabled={!walletId.trim()}
					>
						{t('walletEvents.verifyBtn')}
					</Button>
				</Space.Compact>
			</Card>

			{loading && (
				<Card className="text-center py-12">
					<Spin size="large" tip={t('walletEvents.loading')} />
				</Card>
			)}

			{error &&
				(error.notFound ? (
					// AC-B3-W1-06-1：钱包不存在 → 明确「未找到」，绝不出绿勾。
					<Result
						variant="info"
						className="mx-auto max-w-md"
						title={t('walletEvents.notFoundTitle')}
						description={t('walletEvents.notFoundDesc')}
					/>
				) : (
					<Result
						variant="danger"
						className="mx-auto max-w-md"
						title={t('walletEvents.verifyError')}
						description={error.message}
					/>
				))}

			{result && result.total === 0 && (
				// AC-B3-W1-06-2：空事件集 = 显式警示态（创世事件缺失/数据损坏），不得呈现为通过。
				<Card>
					<Result
						variant="warning"
						className="mx-auto max-w-md"
						title={t('walletEvents.emptyTitle')}
						description={
							<span>
								{t('walletEvents.emptyDesc')} · {t('walletEvents.resultWalletPrefix')}{' '}
								<Text code>{result.walletId}</Text>
							</span>
						}
					/>
				</Card>
			)}

			{result && result.total > 0 && (
				<Card>
					<Result
						variant={result.valid ? 'success' : 'danger'}
						className="mx-auto max-w-md"
						icon={
							result.valid ? (
								<CheckCircle2 size="1em" className="text-success text-5xl" />
							) : (
								<XCircle size="1em" className="text-danger text-5xl" />
							)
						}
						title={
							<span className={result.valid ? 'text-success-text' : 'text-danger-text'}>
								{result.valid
									? `✅ ${t('walletEvents.resultPass')}`
									: `❌ ${t('walletEvents.resultFail')}`}
							</span>
						}
						description={
							<span>
								{t('walletEvents.resultWalletPrefix')} <Text code>{result.walletId}</Text> ·{' '}
								{t('walletEvents.resultTotalEvents', { total: result.total })}
							</span>
						}
					/>
					<Descriptions
						column={1}
						size="small"
						bordered
						className="max-w-[600px] mx-auto mt-4"
						items={[
							{
								key: 'total',
								label: t('walletEvents.resultTotalEvents', { total: result.total }),
								children: result.total,
							},
							{
								key: 'brokenAt',
								label: t('walletEvents.resultBrokenAt'),
								children: result.brokenAt ? result.brokenAt : '-',
							},
							{
								key: 'lastHash',
								label: t('walletEvents.resultLastHash'),
								children: result.lastHash ? (
									<Text code copyable className="text-xs break-all">
										{result.lastHash}
									</Text>
								) : (
									'-'
								),
							},
						]}
					/>
				</Card>
			)}
		</div>
	);
}

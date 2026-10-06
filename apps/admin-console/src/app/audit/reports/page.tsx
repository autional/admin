'use client';

import React, { useState } from 'react';
import {
	Tabs,
	Card,
	Button,
	Select,
	Spin,
	Tag,
	Timeline,
	List,
	Statistic,
	Row,
	Col,
	Typography,
} from 'antd';
import { FileProtectOutlined, AuditOutlined, ReloadOutlined } from '@ant-design/icons';
import { extractItem, useCurrentTenantId } from '@autional/shared';
import {
	adminAuditReportsSecurity,
	adminAuditReportsCompliance,
} from '@autional/shared/generated/api';
import type { ComplianceCheckResp, SecurityRiskResp } from '@autional/shared/generated/types';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { useIsAuditRestricted, AuditStatsOnly } from '@autional/shared';
import { ConsolePageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

const STANDARD_OPTIONS = [
	{ label: 'GDPR', value: 'GDPR' },
	{ label: 'ISO 27001', value: 'ISO27001' },
	{ label: 'SOX', value: 'SOX' },
];

const SEVERITY_COLORS: Record<string, string> = {
	low: 'blue',
	medium: 'orange',
	high: 'red',
	critical: 'magenta',
};

export default function AuditReportsPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const isRestricted = useIsAuditRestricted();

	const PERIOD_OPTIONS = [
		{ label: t('auditReports.period.last7Days'), value: '7d' },
		{ label: t('auditReports.period.last30Days'), value: '30d' },
		{ label: t('auditReports.period.last90Days'), value: '90d' },
	];

	// ---- Security Tab State ----
	const [secPeriod, setSecPeriod] = useState('7d');
	const [secLoading, setSecLoading] = useState(false);
	const [secError, setSecError] = useState<string | null>(null);
	const [secData, setSecData] = useState<any>(null);

	// ---- Compliance Tab State ----
	const [compStandard, setCompStandard] = useState('GDPR');
	const [compPeriod, setCompPeriod] = useState('7d');
	const [compLoading, setCompLoading] = useState(false);
	const [compError, setCompError] = useState<string | null>(null);
	const [compData, setCompData] = useState<any>(null);

	const generateSecurityReport = async () => {
		setSecLoading(true);
		setSecError(null);
		try {
			// A-226（AC-B2-044）：generated 返回 res.data = 拦截器已解包的业务 payload（api/client.ts:105：
			// `res.data = camelCaseKeys(payload)`；generated/api.ts 直返 res.data）——旧 `const { data } = …;
			// data?.data ?? data` 取业务对象的 `.data` 键恒 undefined（成功 toast 照发、报告区恒空白）。
			// 统一走 extractItem（utils/response.ts 唯一形状适配点，单次解包口径）。
			const res = await adminAuditReportsSecurity({
				period: secPeriod,
				tenant_id: tenantId,
			});
			setSecData(extractItem(res));
			message.success(t('auditReports.securityGenerated'));
		} catch (err) {
			setSecError(t('auditReports.securityGenerateFailed'));
			handleApiError(err, t('auditReports.securityGenerateFailed'));
		} finally {
			setSecLoading(false);
		}
	};

	const generateComplianceReport = async () => {
		setCompLoading(true);
		setCompError(null);
		try {
			// A-226（AC-B2-044）：同 security 腿——generated 已含拦截器解包，extractItem 单次口径（防双重解包）。
			const res = await adminAuditReportsCompliance({
				standard: compStandard,
				period: compPeriod,
				tenant_id: tenantId,
			});
			setCompData(extractItem(res));
			message.success(t('auditReports.complianceGenerated'));
		} catch (err) {
			setCompError(t('auditReports.complianceGenerateFailed'));
			handleApiError(err, t('auditReports.complianceGenerateFailed'));
		} finally {
			setCompLoading(false);
		}
	};

	const riskDescription = (r: SecurityRiskResp) => {
		const map: Record<string, string> = {
			brute_force: t('auditReports.risk.bruteForce.desc'),
			unusual_location: t('auditReports.risk.unusualLocation.desc'),
			data_exfiltration: t('auditReports.risk.dataExfiltration.desc'),
			privilege_escalation: t('auditReports.risk.privilegeEscalation.desc'),
			credential_stuffing: t('auditReports.risk.credentialStuffing.desc'),
		};
		return r.description || map[r.type ?? ''] || t('auditReports.risk.defaultDesc');
	};

	const riskRecommendation = (r: SecurityRiskResp) => {
		const map: Record<string, string> = {
			brute_force: t('auditReports.risk.bruteForce.rec'),
			unusual_location: t('auditReports.risk.unusualLocation.rec'),
			data_exfiltration: t('auditReports.risk.dataExfiltration.rec'),
			privilege_escalation: t('auditReports.risk.privilegeEscalation.rec'),
			credential_stuffing: t('auditReports.risk.credentialStuffing.rec'),
		};
		return map[r.type ?? ''] || t('auditReports.risk.defaultRec');
	};

	// ---- Security Report Tab ----
	const securityTab = (
		<div>
			<div className="flex items-center gap-4 mb-6">
				<Select
					options={PERIOD_OPTIONS}
					value={secPeriod}
					onChange={(v) => setSecPeriod(v)}
					className="w-40"
				/>
				<Button
					type="primary"
					icon={<FileProtectOutlined />}
					onClick={generateSecurityReport}
					loading={secLoading}
				>
					{t('auditReports.generate')}
				</Button>
			</div>

			{secLoading && <Spin className="flex justify-center py-16" />}

			{secError && !secLoading && <PageError message={secError} retry={generateSecurityReport} />}

			{secData && !secLoading && !secError && (
				<>
					<Row gutter={24} className="mb-6">
						<Col xs={12} sm={6}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.totalEvents')}
									value={secData.summary?.totalEvents ?? 0}
								/>
							</Card>
						</Col>
						<Col xs={12} sm={6}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.failedLogins')}
									value={secData.summary?.failedLogins ?? 0}
									valueStyle={{
										color:
											secData.summary?.failedLogins > 0 ? 'var(--color-error-light)' : undefined,
									}}
								/>
							</Card>
						</Col>
						<Col xs={12} sm={6}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.anomalies')}
									value={secData.summary?.anomaliesDetected ?? 0}
									valueStyle={{
										color:
											secData.summary?.anomaliesDetected > 0
												? 'var(--color-error-light)'
												: undefined,
									}}
								/>
							</Card>
						</Col>
						<Col xs={12} sm={6}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.blockedIps')}
									value={secData.summary?.blockedIps ?? 0}
								/>
							</Card>
						</Col>
					</Row>

					{secData.topRisks?.length > 0 && (
						<Card title={t('auditReports.topRisks')} className="mb-6">
							<List
								dataSource={secData.topRisks}
								renderItem={(r: SecurityRiskResp, i: number) => (
									<List.Item>
										<div className="w-full">
											<div className="flex items-center gap-2 mb-1">
												<Tag color={SEVERITY_COLORS[r.severity ?? ''] || 'default'}>
													{r.severity ?? t('auditReports.unknown')}
												</Tag>
												<Text strong>{r.type?.replace(/_/g, ' ')}</Text>
												{r.count != null && (
													<Text type="secondary">
														{t('auditReports.occurrenceCount', { count: r.count })}
													</Text>
												)}
											</div>
											<Paragraph className="mb-1 text-neutral-700" ellipsis={{ rows: 2 }}>
												{riskDescription(r)}
											</Paragraph>
											<Text type="secondary" className="text-xs">
												{t('auditReports.recommendation')}{riskRecommendation(r)}
											</Text>
										</div>
									</List.Item>
								)}
							/>
						</Card>
					)}

					<Card title={t('auditReports.suspiciousUsers')}>
						{secData.details?.suspiciousUsers?.length > 0 ? (
							<List
								dataSource={secData.details.suspiciousUsers}
								renderItem={(u: string) => (
									<List.Item>
										<Text code>{u}</Text>
									</List.Item>
								)}
							/>
						) : (
							<Text type="secondary">{t('auditReports.noSuspiciousUsers')}</Text>
						)}
					</Card>
				</>
			)}

			{!secData && !secLoading && !secError && (
				<Card>
					<div className="text-center py-10 text-neutral-600">
						<FileProtectOutlined className="text-[40px]" />
						<p className="mt-3">{t('auditReports.securityEmptyHint')}</p>
					</div>
				</Card>
			)}
		</div>
	);

	// ---- Compliance Report Tab ----
	const complianceTab = (
		<div>
			<div className="flex items-center gap-4 mb-6">
				<Select
					options={STANDARD_OPTIONS}
					value={compStandard}
					onChange={(v) => setCompStandard(v)}
					className="w-40"
				/>
				<Select
					options={PERIOD_OPTIONS}
					value={compPeriod}
					onChange={(v) => setCompPeriod(v)}
					className="w-40"
				/>
				<Button
					type="primary"
					icon={<AuditOutlined />}
					onClick={generateComplianceReport}
					loading={compLoading}
				>
					{t('auditReports.generate')}
				</Button>
			</div>

			{compLoading && <Spin className="flex justify-center py-16" />}

			{compError && !compLoading && (
				<PageError message={compError} retry={generateComplianceReport} />
			)}

			{compData && !compLoading && !compError && (
				<>
					<Row gutter={24} className="mb-6">
						<Col xs={24} sm={8}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.standard')}
									value={compData.standard ?? '-'}
								/>
							</Card>
						</Col>
						<Col xs={12} sm={8}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.complianceScore')}
									value={compData.complianceScore ?? 0}
									suffix="/ 100"
									valueStyle={{
										color:
											(compData.complianceScore ?? 0) >= 80
												? 'var(--color-success-light)'
												: 'var(--color-error-light)',
									}}
								/>
							</Card>
						</Col>
						<Col xs={12} sm={8}>
							<Card size="small">
								<Statistic
									title={t('auditReports.stat.status')}
									valueRender={() => (
										<Tag
											color={
												compData.overallStatus === 'pass'
													? 'success'
													: compData.overallStatus === 'failed'
														? 'error'
														: 'warning'
											}
										>
											{compData.overallStatus ?? '-'}
										</Tag>
									)}
									value=" "
								/>
							</Card>
						</Col>
					</Row>

					{compData.checks?.length > 0 && (
						<Card title={t('auditReports.complianceChecks')} className="mb-6">
							<List
								dataSource={compData.checks}
								renderItem={(c: ComplianceCheckResp) => (
									<List.Item>
										<div className="w-full">
											<div className="flex items-center gap-2 mb-1">
												<Tag color={c.passed ? 'success' : 'error'}>
													{c.passed ? t('auditReports.passed') : t('auditReports.failed')}
												</Tag>
												<Text strong>{c.item}</Text>
												{c.severity && <Tag>{c.severity}</Tag>}
											</div>
											<Paragraph className="mb-1 text-neutral-700" ellipsis={{ rows: 2 }}>
												{c.description}
											</Paragraph>
											{(c.issues?.length ?? 0) > 0 && (
												<div className="mt-2">
													<Text type="secondary" className="text-xs mb-1 block">
														{t('auditReports.issues')}
													</Text>
													<ul className="list-disc list-inside text-neutral-600 text-sm space-y-0.5">
														{(c.issues ?? []).map((issue: string, i: number) => (
															<li key={i}>{issue}</li>
														))}
													</ul>
												</div>
											)}
										</div>
									</List.Item>
								)}
							/>
						</Card>
					)}

					{compData.recommendations?.length > 0 && (
						<Card title={t('auditReports.recommendationsTitle')}>
							<List
								dataSource={compData.recommendations}
								renderItem={(r: string, i: number) => (
									<List.Item>
										<Text>
											{i + 1}. {r}
										</Text>
									</List.Item>
								)}
							/>
						</Card>
					)}
				</>
			)}

			{!compData && !compLoading && !compError && (
				<Card>
					<div className="text-center py-10 text-neutral-600">
						<AuditOutlined className="text-[40px]" />
						<p className="mt-3">
							{t('auditReports.complianceEmptyHint')}
						</p>
					</div>
				</Card>
			)}
		</div>
	);

	if (isRestricted) {
		return <AuditStatsOnly title={t('auditReports.title')} />;
	}

	return (
		<div>
			<ConsolePageHeader title={t('auditReports.title')} />

			<Tabs
				defaultActiveKey="security"
				items={[
					{
						key: 'security',
						label: t('auditReports.tab.security'),
						icon: <FileProtectOutlined />,
						children: securityTab,
					},
					{
						key: 'compliance',
						label: t('auditReports.tab.compliance'),
						icon: <AuditOutlined />,
						children: complianceTab,
					},
				]}
			/>
		</div>
	);
}

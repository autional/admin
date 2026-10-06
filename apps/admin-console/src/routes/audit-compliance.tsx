import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import AuditLogsPage from '../app/audit-logs/page';
import AlertsPage from '../app/audit/alerts/page';
import AnomaliesPage from '../app/audit/anomalies/page';
import RetentionPage from '../app/audit/retention/page';
import AuditCompliancePage from '../app/audit/compliance/page';
import ReportsPage from '../app/audit/reports/page';
import CompliancePage from '../app/compliance/page';
import CompliancePolicyPage from '../app/compliance/policy/page';
import MinorsProtectionPage from '../app/compliance/minors/page';
import SodConfigPage from '../app/audit/sod/page';
import LegalDocumentsPage from '../app/compliance/legal-documents/page';

// 角色守卫常量
// SecurityRead: admin-console 中 admin 可用的审计路由（受 sod_mode 控制）
const SecurityRead = ['super_admin', 'admin', 'security_admin'] as const;
// AuditRead: 审计证据路由（不含 admin — 仅 security_admin + auditor）
const AuditRead = ['super_admin', 'security_admin', 'auditor'] as const;
// SecurityAdminOnly: 安全配置管理（不含 admin 和 auditor）
const SecurityAdminOnly = ['super_admin', 'security_admin'] as const;
// Admin: 管理配置（不含 security_admin 和 auditor）
const Admin = ['super_admin', 'admin'] as const;

export const AuditComplianceRoutes = (
	<>
		{/* admin 可看统计摘要（受 sod_mode 组件内分流） */}
		<Route
			path="audit-logs"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<AuditLogsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="audit/alerts"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<AlertsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="audit/anomalies"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<AnomaliesPage />
				</RequireAuth>
			}
		/>
		{/* SIEM 已移入 security-dashboard — 删除 */}
		{/* 审计证据路由（仅 security_admin + auditor） */}
		<Route
			path="audit/retention"
			element={
				<RequireAuth allowedRoles={AuditRead} fallback={<ForbiddenRedirect />}>
					<RetentionPage />
				</RequireAuth>
			}
		/>
		<Route
			path="audit/compliance"
			element={
				<RequireAuth allowedRoles={AuditRead} fallback={<ForbiddenRedirect />}>
					<AuditCompliancePage />
				</RequireAuth>
			}
		/>
		{/* 报告/合规（admin 受 sod_mode 控制） */}
		<Route
			path="audit/reports"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ReportsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="compliance"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<CompliancePage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		{/* 合规策略配置（仅 admin） */}
		<Route
			path="compliance/policy"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<CompliancePolicyPage />
				</RequireAuth>
			}
		/>
		<Route
			path="compliance/minors"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<MinorsProtectionPage />
				</RequireAuth>
			}
		/>
		{/* A-277（D1c 显式加）：法务文书为合规只读面，security_admin 同权（页面内写操作另有裁决） */}
		<Route
			path="compliance/legal-documents"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<LegalDocumentsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		{/* SoD 配置（security_admin + auditor 可查看，仅 security_admin 可修改） */}
		<Route
			path="audit/sod"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<SodConfigPage />
				</RequireAuth>
			}
		/>
	</>
);

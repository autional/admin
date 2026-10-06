'use client';

import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import OAuthClientsPage from '../app/oauth-clients/page';
import ApiKeysPage from '../app/api-keys/page';
import UsagePage from '../app/usage/page';
import LogsPage from '../app/logs/page';
import TracesPage from '../app/traces/page';
import RequestLogsPage from '../app/request-logs/page';
import SdkPage from '../app/sdks/page';
import NhiSdkPage from '../app/sdks/nhi/page';
import TeamPage from '../app/team/page';
import StatusPage from '../app/status/page';
import ApiDocsPage from '../app/api-docs/page';

const Admin = ['super_admin', 'admin'] as const;
// A-444③（TASK-AB1-14）：监控/开发者只读面两条（/status、/oauth-clients）对 security_admin 开放；
// 其余 developer 路由（api-keys/usage/sdks/api-docs/...）映射源不在 11 码集，保持 Admin。
const SecurityRead = ['super_admin', 'admin', 'security_admin'] as const;

export const DeveloperRoutes = (
	<>
		<Route
			path="oauth-clients"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<OAuthClientsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="api-keys"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<ApiKeysPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="usage"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<UsagePage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="logs"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<LogsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="traces"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<TracesPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="request-logs"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<RequestLogsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="sdks"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<SdkPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="sdks/nhi"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<NhiSdkPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="team"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<TeamPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="status"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<StatusPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="api-docs"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<ApiDocsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
	</>
);

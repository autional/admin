import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import ApplicationsPage from '../app/applications/page';
import PlatformPortalsPage from '../app/applications/platform-portals/page';
import AppRolesPage from '../app/applications/[id]/roles/page';
import IdentityProvidersPage from '../app/identity-providers/page';
import WebhooksPage from '../app/webhooks/page';

const Admin = ['super_admin', 'admin'] as const;

export const AppIntegrationRoutes = (
	<>
		<Route
			path="applications"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<ApplicationsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="applications/platform-portals"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<PlatformPortalsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="applications/:id/roles"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<AppRolesPage />
				</RequireAuth>
			}
		/>
		<Route
			path="identity-providers"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<IdentityProvidersPage />
				</RequireAuth>
			}
		/>
		<Route
			path="webhooks"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<WebhooksPage />
				</RequireAuth>
			}
		/>
	</>
);

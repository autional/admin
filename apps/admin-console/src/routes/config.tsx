import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import BrandingPage from '../app/branding/page';
import NotificationTemplatesPage from '../app/notifications/templates/page';
import AnnouncementsPage from '../app/notifications/announcements/page';
import NotificationStatsPage from '../app/notifications/stats/page';
import EventMappingsPage from '../app/notifications/event-mappings/page';
import GlobalVariablesPage from '../app/notifications/global-variables/page';
import CommunicationPage from '../app/communication/page';
import CommunicationTemplatesPage from '../app/communication/templates/page';
import CommunicationProvidersPage from '../app/communication/providers/page';
import BroadcastPage from '../app/notifications/broadcast/page';
import VerificationsPage from '../app/verifications/page';
import VerificationDetailPage from '../app/verifications/[id]/page';

const Admin = ['super_admin', 'admin'] as const;

export const ConfigRoutes = (
	<>
		<Route
			path="branding"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<BrandingPage />
				</RequireAuth>
			}
		/>
		<Route
			path="notifications/templates"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<NotificationTemplatesPage />
				</RequireAuth>
			}
		/>
		<Route
			path="notifications/announcements"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<AnnouncementsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="notifications/stats"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<NotificationStatsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="notifications/event-mappings"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<EventMappingsPage />
				</RequireAuth>
			}
		/>
		<Route
			path="notifications/global-variables"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<GlobalVariablesPage />
				</RequireAuth>
			}
		/>
		<Route
			path="communication"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<CommunicationPage />
				</RequireAuth>
			}
		/>
		<Route
			path="communication/templates"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<CommunicationTemplatesPage />
				</RequireAuth>
			}
		/>
		<Route
			path="communication/providers"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<CommunicationProvidersPage />
				</RequireAuth>
			}
		/>
		<Route
			path="notifications/broadcast"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<BroadcastPage />
				</RequireAuth>
			}
		/>
		{/* A-263（RC-6 面漂移）：verifications 为 admin-only（后端面裁定），security_admin 不入口 */}
		<Route
			path="verifications"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<VerificationsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="verifications/:id"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<VerificationDetailPage />
				</RequireAuth>
			}
		/>
	</>
);

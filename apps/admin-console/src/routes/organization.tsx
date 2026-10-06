import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import DepartmentsPage from '../app/departments/page';
import MembersPage from '../app/members/page';
import ApprovalPage from '../app/members/approval/page';

const Admin = ['super_admin', 'admin'] as const;

export const OrganizationRoutes = (
	<>
		<Route
			path="departments"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<DepartmentsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="members"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<MembersPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="members/approval"
			element={
				<RequireAuth allowedRoles={Admin} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<ApprovalPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
	</>
);

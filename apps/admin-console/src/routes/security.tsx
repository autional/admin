import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import MFAPolicyPage from '../app/security/mfa/page';
import RiskConfigPage from '../app/security/risk-config/page';
import AuthConfigPage from '../app/security/auth-config/page';
import SecurityPolicyPage from '../app/security/policy/page';
import PasswordPolicyPage from '../app/security/password-policy/page';
import DataClassificationPage from '../app/data-classification/page';

const SecurityRead = ['super_admin', 'admin', 'security_admin'] as const;

export const SecurityRoutes = (
	<>
		<Route
			path="security/mfa"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<MFAPolicyPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="security/risk-config"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<RiskConfigPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="security/auth-config"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<AuthConfigPage />
				</RequireAuth>
			}
		/>
		<Route
			path="security/policy"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<SecurityPolicyPage />
				</RequireAuth>
			}
		/>
		<Route
			path="security/password-policy"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<PasswordPolicyPage />
				</RequireAuth>
			}
		/>
		<Route
			path="data-classification"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<DataClassificationPage />
				</RequireAuth>
			}
		/>
	</>
);

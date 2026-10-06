import { Route } from 'react-router';
import { RequireAuth } from '@autional/shared';
import { ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from '../lib/error-boundary-config';
import { ForbiddenRedirect } from '../components/common/ForbiddenRedirect';

import AgentsPage from '../app/agents/page';
import AgentDetailPage from '../app/agents/[id]/page';
import RobotsPage from '../app/robots/page';
import RobotDetailPage from '../app/robots/[id]/page';
import DevicesPage from '../app/devices/page';
import DeviceDetailPage from '../app/devices/[id]/page';
import NhiPolicyPage from '../app/policies/nhi/page';

// A-444①（TASK-AB1-14）：NHI 只读面 7 路由对 security_admin 开放（后端读面拆分见 TASK-AB1-07）；
// 原两角色白名单常量随 7 路由全部换用后失引，已删。
const SecurityRead = ['super_admin', 'admin', 'security_admin'] as const;

export const NhiRoutes = (
	<>
		<Route
			path="agents"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<AgentsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="agents/:id"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<AgentDetailPage />
				</RequireAuth>
			}
		/>
		<Route
			path="robots"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<RobotsPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="robots/:id"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<RobotDetailPage />
				</RequireAuth>
			}
		/>
		<Route
			path="devices"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<DevicesPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
		<Route
			path="devices/:id"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<DeviceDetailPage />
				</RequireAuth>
			}
		/>
		<Route
			path="policies/nhi"
			element={
				<RequireAuth allowedRoles={SecurityRead} fallback={<ForbiddenRedirect />}>
					<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
						<NhiPolicyPage />
					</ErrorBoundary>
				</RequireAuth>
			}
		/>
	</>
);

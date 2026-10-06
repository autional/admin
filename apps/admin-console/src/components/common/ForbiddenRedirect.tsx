import { Navigate } from 'react-router';
import { useTenantSlug } from '@autional/shared';

/**
 * 角色不满足时的落点：/403 在本站是租户段内路由（/:tenantSlug/403），
 * 必须带上当前 slug —— 裸 /403 会被当成租户 slug '403'（挂载闸门判 404）。
 */
export function ForbiddenRedirect() {
	const tenantSlug = useTenantSlug();
	return <Navigate to={tenantSlug ? `/${tenantSlug}/403` : '/403'} replace />;
}

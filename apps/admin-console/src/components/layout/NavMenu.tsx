'use client';

import React from 'react';
// NavMenu —— 本站的**导航内容**（菜单树 + 权限/功能门过滤 + 展开态管理）。
//
// 它过去是 Sidebar.tsx：一个 <Sider> 外壳 + 品牌 + <Menu>。外壳那部分（固定定位、宽度、折叠、
// 移动端抽屉、滚动容器）2026-10-04 起归设计系统的 <AppShell>；品牌挪到 AppShell 的 brand 槽。
// 这里只留四个门户里**真正不同**的那部分。
import { useNavigate, useLocation } from 'react-router';
import {
	CreditCard,
	DollarSign,
	FileSearch,
	IdCard,
	LayoutDashboard,
	LayoutGrid,
	Network,
	Plug,
	Receipt,
	Settings,
	ShieldCheck,
	Users,
} from 'lucide-react';
import { Menu, Badge } from 'antd';
import { useUIStore } from '@/stores/ui-store';
import { usePermission, useTenantSlug, useCurrentTenantId } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getPendingMembers } from '@/lib/api.generated';

import { queryKeys } from '@/lib/query-keys';
import { useFeatureGates } from '@/hooks/use-feature-gates';
import { buildNavHref, stripTenantPrefix } from '@/lib/nav';

interface MenuItem {
	key: string;
	icon?: React.ReactNode;
	label: React.ReactNode;
	permission?: string;
	featureGateKey?: string;
	children?: MenuItem[];
}

/**
 * Filter menu items by role permission.
 */
function filterMenuByPermission(items: MenuItem[], can: (p: string) => boolean): MenuItem[] {
	const result: MenuItem[] = [];
	for (const item of items) {
		const hasPerm = !item.permission || can(item.permission);
		if (!hasPerm) continue;

		if (item.children) {
			const filteredChildren = filterMenuByPermission(item.children, can);
			if (filteredChildren.length > 0) {
				result.push({ ...item, children: filteredChildren });
			}
		} else {
			result.push(item);
		}
	}
	return result;
}

/**
 * Phase 0b: FeatureGate secondary filter — removes sections not enabled.
 */
function filterMenuByFeatureGate(items: MenuItem[], gates: Set<string>): MenuItem[] {
	const result: MenuItem[] = [];
	for (const item of items) {
		const hasGate = !item.featureGateKey || gates.has(item.featureGateKey);
		if (!hasGate) continue;

		if (item.children) {
			const filteredChildren = filterMenuByFeatureGate(item.children, gates);
			if (filteredChildren.length > 0) {
				result.push({ ...item, children: filteredChildren });
			}
		} else {
			result.push(item);
		}
	}
	return result;
}

/**
 * Sidebar component.
 * Extracted from AppLayout. Supports permission-filtered menus, collapse/expand.
 */
export function NavMenu() {
	const navigate = useNavigate();
	const location = useLocation();
	const tenantSlug = useTenantSlug();
	const path = stripTenantPrefix(location.pathname, tenantSlug);
	const collapsed = useUIStore((s) => s.sidebarCollapsed);
	const { can } = usePermission();
	const featureGates = useFeatureGates();
	const { t } = useTranslation();

	const tenantId = useCurrentTenantId() ?? '';

	const { data: pendingData } = useQuery({
		queryKey: queryKeys.members.pending(tenantId),
		queryFn: () => getPendingMembers(tenantId),
		enabled: !!tenantId,
		refetchInterval: 30000,
	});

	const pendingCount = pendingData?.data?.total ?? 0;

	const allMenuItems: MenuItem[] = React.useMemo(
		() => [
			{
				key: '/',
				icon: <LayoutDashboard size="1em" />,
				label: t('nav.dashboard'),
				permission: 'tenant:dashboard:read',
			},
			{
				key: 'user-permission',
				icon: <Users size="1em" />,
				label: t('nav.section.users'),
				children: [
					{ key: '/users', label: t('nav.users'), permission: 'tenant:user:read' },
					{ key: '/roles', label: t('nav.roles'), permission: 'tenant:role:read' },
					{
						key: '/permissions',
						label: t('nav.permissions'),
						permission: 'tenant:permission:read',
					},
					{ key: '/sessions', label: t('nav.sessions'), permission: 'tenant:session:read' },
					{ key: '/secrets', label: t('nav.secrets'), permission: 'tenant:secret:manage' },
					{
						key: '/secrets/policy',
						label: t('nav.secretsPolicy'),
						permission: 'tenant:secret:manage',
					},
				],
			},
			{
				key: 'profiles-mgmt',
				icon: <IdCard size="1em" />,
				label: t('nav.profilesSection'),
				children: [
					{ key: '/profiles', label: t('nav.profiles'), permission: 'tenant:profile:read' },
					{
						key: '/profiles/policy',
						label: t('nav.profilesPolicy'),
						permission: 'tenant:profile:read',
					},
					{
						key: '/profiles/field-schemas',
						label: t('nav.profilesFieldSchemas'),
						permission: 'tenant:profile:read',
					},
					{
						key: '/profiles/approval',
						label: t('nav.profilesApproval'),
						permission: 'tenant:profile:read',
					},
					{
						key: '/profiles/webhook',
						label: t('nav.profilesWebhook'),
						permission: 'tenant:profile:read',
					},
				],
			},
			{
				key: 'org',
				icon: <Network size="1em" />,
				label: t('nav.section.org'),
				children: [
					{
						key: '/departments',
						label: t('nav.departments'),
						permission: 'tenant:department:read',
					},
					{ key: '/members', label: t('nav.members'), permission: 'tenant:member:read' },
					{ key: '/team', label: t('nav.team'), permission: 'tenant:member:read' },
					{
						key: '/members/approval',
						label: (
							<span>
								{t('nav.memberApproval')}
								{pendingCount > 0 && <Badge count={pendingCount} size="small" className="ml-2" />}
							</span>
						),
						permission: 'tenant:member:approve',
					},
				],
			},
			{
				key: 'app-integration',
				icon: <LayoutGrid size="1em" />,
				label: t('nav.section.apps'),
				children: [
					{ key: '/applications', label: t('nav.applications'), permission: 'tenant:app:read' },
					{
						key: '/identity-providers',
						label: t('nav.identityProviders'),
						permission: 'tenant:idp:read',
					},
					{ key: '/webhooks', label: t('nav.webhooks'), permission: 'tenant:webhook:read' },
				],
			},
			{
				key: 'developer',
				icon: <Plug size="1em" />,
				label: t('nav.section.developer'),
				children: [
					{ key: '/oauth-clients', label: t('nav.oauthClients'), permission: 'tenant:oauth:read' },
					{ key: '/api-keys', label: t('nav.apiKeys'), permission: 'tenant:apikey:read' },
					{ key: '/usage', label: t('nav.usage'), permission: 'tenant:usage:read' },
					{ key: '/sdks', label: t('nav.sdks'), permission: 'tenant:sdk:read' },
					{ key: '/api-docs', label: t('nav.apiDocs'), permission: 'tenant:sdk:read' },
				],
			},
			{
				key: 'logs-monitoring',
				icon: <LayoutDashboard size="1em" />,
				label: t('nav.section.monitoring'),
				children: [
					{ key: '/status', label: t('nav.serviceStatus'), permission: 'tenant:monitor:read' },
					{ key: '/logs', label: t('nav.systemLogs'), permission: 'tenant:log:read' },
					{ key: '/traces', label: t('nav.traces'), permission: 'tenant:log:read' },
					{ key: '/request-logs', label: t('nav.requestLogs'), permission: 'tenant:log:read' },
				],
			},
			{
				key: 'nhi',
				icon: <LayoutGrid size="1em" />,
				label: t('nav.section.nhi'),
				permission: 'tenant:nhi:read',
				featureGateKey: 'nhi',
				children: [
					{
						key: '/agents',
						label: t('nav.agents'),
						permission: 'agent:read',
						featureGateKey: 'nhi',
					},
					{
						key: '/robots',
						label: t('nav.robots'),
						permission: 'robot:read',
						featureGateKey: 'nhi',
					},
					{
						key: '/devices',
						label: t('nav.nhiDevices'),
						permission: 'device:read',
						featureGateKey: 'nhi',
					},
					{
						key: '/policies/nhi',
						label: t('nav.nhiPolicy'),
						permission: 'tenant:nhi:read',
						featureGateKey: 'nhi',
					},
				],
			},
			{
				key: 'security',
				icon: <ShieldCheck size="1em" />,
				label: t('nav.section.security'),
				children: [
					{ key: '/security/mfa', label: t('nav.mfaPolicy'), permission: 'tenant:mfa:read' },
					{
						key: '/security/risk-config',
						label: t('nav.riskConfig'),
						permission: 'tenant:security:read',
					},
					{
						key: '/security/auth-config',
						label: t('nav.authConfig'),
						permission: 'tenant:security:read',
					},
					{
						key: '/security/password-policy',
						label: t('nav.passwordPolicy'),
						permission: 'tenant:security:read',
					},
					{
						key: '/data-classification',
						label: t('nav.dataClassification'),
						permission: 'tenant:security:read',
					},
					{
						key: '/security/policy',
						label: t('nav.securityPolicy'),
						permission: 'tenant:security:read',
					},
					{ key: '/abac-policies', label: t('nav.abacPolicies'), permission: 'tenant:abac:read' },
					{
						key: '/role-activations',
						label: t('nav.roleActivations'),
						permission: 'tenant:role:read',
					},
				],
			},
			{
				key: 'config',
				icon: <Settings size="1em" />,
				label: t('nav.section.config'),
				children: [
					{ key: '/branding', label: t('nav.branding'), permission: 'tenant:branding:read' },
					{
						key: '/notifications/templates',
						label: t('nav.notificationTemplates'),
						permission: 'tenant:notification:read',
					},
					{
						key: '/notifications/announcements',
						label: t('nav.announcements'),
						permission: 'tenant:notification:read',
					},
					{
						key: '/notifications/stats',
						label: t('nav.notificationStats'),
						permission: 'tenant:notification:read',
					},
					{
						key: '/notifications/event-mappings',
						label: t('nav.eventMappings'),
						permission: 'tenant:notification:read',
					},
					{
						key: '/notifications/global-variables',
						label: t('nav.globalVariables'),
						permission: 'tenant:notification:read',
					},
					{
						key: '/notifications/broadcast',
						label: t('nav.broadcast'),
						permission: 'tenant:notification:read',
					},
					{
						key: '/communication',
						label: t('nav.communication'),
						permission: 'tenant:communication:read',
					},
					{
						key: '/communication/templates',
						label: t('nav.communicationTemplates'),
						permission: 'tenant:communication:read',
					},
					{
						key: '/communication/providers',
						label: t('nav.communicationProviders'),
						permission: 'tenant:communication:read',
					},
				],
			},
			{
				key: 'audit-compliance',
				icon: <FileSearch size="1em" />,
				label: t('nav.section.audit'),
				children: [
					{ key: '/audit-logs', label: t('nav.auditLogs'), permission: 'tenant:audit:read' },
					{ key: '/audit/alerts', label: t('nav.alerts'), permission: 'tenant:audit:read' },
					{ key: '/audit/anomalies', label: t('nav.anomalies'), permission: 'tenant:audit:read' },
					// SIEM 已移入 security-dashboard — 删除
					// { key: '/audit/siem', label: t('nav.siemConnectors'), permission: 'tenant:audit:read' },
					{
						key: '/audit/retention',
						label: t('nav.retentionPolicy'),
						permission: 'tenant:audit:read',
					},
					{
						key: '/audit/compliance',
						label: t('nav.auditCompliance'),
						permission: 'tenant:compliance:read',
					},
					{ key: '/audit/reports', label: t('nav.auditReports'), permission: 'tenant:audit:read' },
					{ key: '/compliance', label: t('nav.compliance'), permission: 'tenant:compliance:read' },
					{
						key: '/verifications',
						label: t('nav.verifications'),
						// 无映射源 = admin-only，对齐后端（A-263：security_admin 不入口）
						permission: 'tenant:verification:read',
					},
					{
						key: '/compliance/policy',
						label: t('nav.compliancePolicy'),
						// 无映射源 = admin-only，对齐后端（A-263）
						permission: 'tenant:compliance:policy',
					},
					{
						key: '/compliance/minors',
						label: t('nav.minorsProtection'),
						// 无映射源 = admin-only，对齐后端（A-263）
						permission: 'tenant:compliance:minors',
					},
					{
						key: '/compliance/legal-documents',
						label: t('nav.legalDocuments'),
						permission: 'tenant:compliance:read',
					},
				],
			},
			{
				key: 'ops-finance',
				icon: <CreditCard size="1em" />,
				label: t('nav.section.ops'),
				children: [
					{ key: '/billing', label: t('nav.billing'), permission: 'tenant:billing:read' },
					{ key: '/storage', label: t('nav.storage'), permission: 'tenant:storage:read' },
					{ key: '/wallets', label: t('nav.wallets'), permission: 'tenant:wallet:read' },
					{ key: '/points', label: t('nav.points'), permission: 'tenant:point:read' },
					{ key: '/pay/channels', label: t('nav.payChannels'), permission: 'tenant:billing:read' },
					{ key: '/pay/payments', label: t('nav.payPayments'), permission: 'tenant:billing:read' },
					{
						key: '/pay/reconciliation',
						label: t('nav.payReconciliation'),
						permission: 'tenant:billing:read',
					},
					{ key: '/pay/refunds', label: t('nav.payRefunds'), permission: 'tenant:billing:read' },
				],
			},
			{
				key: 'wallet-mgmt',
				icon: <DollarSign size="1em" />,
				label: t('nav.walletSection'),
				children: [
					{ key: '/wallet/list', label: t('nav.walletList'), permission: 'tenant:wallet:read' },
					{ key: '/wallet/adjust', label: t('nav.walletAdjust'), permission: 'tenant:wallet:read' },
					{
						key: '/wallet/withdrawals',
						label: t('nav.walletWithdrawals'),
						permission: 'tenant:wallet:read',
					},
					{
						key: '/wallet/disputes',
						label: t('nav.walletDisputes'),
						permission: 'tenant:wallet:read',
					},
					{
						key: '/wallet/coupons',
						label: t('nav.walletCoupons'),
						permission: 'tenant:wallet:read',
					},
					{ key: '/wallet/policy', label: t('nav.walletPolicy'), permission: 'tenant:wallet:read' },
					{
						key: '/wallet/fraud-rules',
						label: t('nav.walletFraudRules'),
						permission: 'tenant:wallet:read',
					},
					{ key: '/wallet/events', label: t('nav.walletEvents'), permission: 'tenant:wallet:read' },
				],
			},
			{
				key: 'billing-mgmt',
				icon: <Receipt size="1em" />,
				label: t('nav.billingSection'),
				children: [
					{
						key: '/billing/plans',
						label: t('nav.billingPlans'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/subscriptions',
						label: t('nav.billingSubscriptions'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/refunds',
						label: t('nav.billingRefunds'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/revenue',
						label: t('nav.billingRevenue'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/dunning',
						label: t('nav.billingDunning'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/tax-export',
						label: t('nav.billingTaxExport'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/alerts',
						label: t('nav.billingAlerts'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/credit-notes',
						label: t('nav.billingCreditNotes'),
						permission: 'tenant:billing:read',
					},
					{
						key: '/billing/credit-balance',
						label: t('nav.billingCreditBalance'),
						permission: 'tenant:billing:read',
					},
				],
			},

			{
				key: '/settings',
				icon: <Settings size="1em" />,
				label: t('nav.settings'),
				permission: 'self:profile:read',
			},
		],
		[t, pendingCount],
	);

	const menuItems = React.useMemo(
		() => filterMenuByFeatureGate(filterMenuByPermission(allMenuItems, can), featureGates),
		[can, allMenuItems, featureGates],
	);

	const convertItems = (items: MenuItem[]): any[] =>
		items.map((item) => ({
			key: item.key,
			icon: item.icon,
			label: item.label,
			children: item.children ? convertItems(item.children) : undefined,
		}));

	const antMenuItems = convertItems(menuItems);

	const routeOpenKeys = React.useMemo(() => {
		if (path.startsWith('/billing/')) return ['billing-mgmt'];
		if (path.startsWith('/wallet/')) return ['wallet-mgmt'];
		const routeToGroup: Record<string, string> = {
			'/users': 'user-permission',
			'/roles': 'user-permission',
			'/permissions': 'user-permission',
			'/sessions': 'user-permission',
			'/secrets': 'user-permission',
			'/profiles': 'profiles-mgmt',
			'/departments': 'org',
			'/members': 'org',
			'/team': 'org',
			'/applications': 'app-integration',
			'/identity-providers': 'app-integration',
			'/webhooks': 'app-integration',
			'/agents': 'nhi',
			'/robots': 'nhi',
			'/devices': 'nhi',
			'/policies/nhi': 'nhi',
			'/security': 'security',
			'/data-classification': 'security',
			'/abac-policies': 'security',
			'/role-activations': 'security',
			'/branding': 'config',
			'/notifications': 'config',
			'/communication': 'config',
			'/audit-logs': 'audit-compliance',
			'/audit': 'audit-compliance',
			'/compliance': 'audit-compliance',
			'/verifications': 'audit-compliance',
			'/billing': 'ops-finance',
			'/storage': 'ops-finance',
			'/wallets': 'ops-finance',
			'/points': 'ops-finance',
			'/pay': 'ops-finance',
			'/oauth-clients': 'developer',
			'/api-keys': 'developer',
			'/usage': 'developer',
			'/sdks': 'developer',
			'/api-docs': 'developer',
			'/status': 'logs-monitoring',
			'/logs': 'logs-monitoring',
			'/traces': 'logs-monitoring',
			'/request-logs': 'logs-monitoring',
		};
		const exact = routeToGroup[path];
		if (exact) return [exact];
		for (const [prefix, group] of Object.entries(routeToGroup)) {
			if (path.startsWith(prefix + '/')) return [group];
		}
		return ['user-permission'];
	}, [path]);

	const [openKeys, setOpenKeys] = React.useState<string[]>(routeOpenKeys);
	const lastOpenKeyRef = React.useRef<Set<string>>(new Set(routeOpenKeys));

	React.useEffect(() => {
		setOpenKeys(routeOpenKeys);
		lastOpenKeyRef.current = new Set(routeOpenKeys);
	}, [routeOpenKeys]);

	const handleOpenChange = React.useCallback((keys: string[]) => {
		const current = new Set(keys);
		const last = lastOpenKeyRef.current;
		const added = [...current].filter((k) => !last.has(k));
		if (added.length === 1) {
			setOpenKeys([added[0]]);
		} else {
			setOpenKeys(keys);
		}
		lastOpenKeyRef.current = current;
	}, []);

	const loading = !antMenuItems.length;
	return (
		<>
			<Menu
				mode="inline"
				selectedKeys={[path]}
				openKeys={openKeys}
				onOpenChange={handleOpenChange}
				items={antMenuItems}
				onClick={({ key }) => navigate(buildNavHref(key, tenantSlug))}
				className="border-r-0"
				role="navigation"
				aria-label={t('common.mainNavigation', '主导航')}
			/>
			{loading && <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">{t('common.loading', 'Loading...')}</div>}
		</>
	);
}

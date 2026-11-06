'use client';

import React from 'react';
import { useNavigate } from 'react-router';
import { Layout, Space, Typography, Select, Tag } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useLogout, usePortalCatalog, useTenantSlug } from '@autional/shared';
import {
	getDEVELOPER_PORTAL_URL,
	getLANDING_SITE_URL,
	getSTATUS_PAGE_URL,
} from '@autional/shared';
import { LanguageSwitcher, PortalSwitcher, ThemeToggle, UserMenu } from '@autional/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildNavHref } from '@/lib/nav';

const { Text } = Typography;

/**
 * 门户切换器只列「同类控制台」（2026-11-02）。
 * status/trust/developer/brand 是公开内容站：混在控制台切换器里会把用户整页甩出
 * 当前工作上下文，权限身份也换了。白名单而非黑名单 —— 以后新增内容站不会自动漏进来。
 * 2026-11 接入配置中心：config 同属管理面平面，加入白名单。
 */
const CONSOLE_PORTALS = new Set(['config', 'admin', 'security', 'user', 'platform']);
/** 目录里的 code → 图标；config 需显式补一个，否则落到 Globe 兜底。 */
const PORTAL_ICONS = { config: SlidersHorizontal };

// HeaderActions —— 顶栏**右侧**那组控件（门户切换 / 语言 / 主题 / 租户选择 / 用户菜单）。
//
// 它过去是 Header.tsx：一个 <AntHeader> 外壳 + 折叠按钮 + 这组控件。外壳（sticky、高度令牌、
// 左右两端对齐、移动端行为）2026-10-04 起归设计系统的 <AppShell>；折叠按钮挪到 headerLeft
// （它与面包屑同属左侧）。这里只剩右侧的内容。
export function HeaderActions() {
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();

	const user = useAuthStore((s) => s.user);
	const tenants = useAuthStore((s) => s.tenants);
	const currentTenantId = useAuthStore((s) => s.currentTenantId);
	const switchTenant = useAuthStore((s) => s.switchTenant);
	const handleLogout = useLogout();

	const queryClient = useQueryClient();
	const { t } = useTranslation();

	// 管理面平面（audiences [admin, platform]）：控制台侧走 admin 受众端点
	const { portals } = usePortalCatalog({
		tenantId: currentTenantId,
		slug: tenantSlug,
		audience: 'admin',
	});
	const consolePortals = React.useMemo(
		() => portals.filter((p) => CONSOLE_PORTALS.has(p.code)),
		[portals],
	);

	return (
		<Space size="large">
			<PortalSwitcher portals={consolePortals} currentPortal="admin" iconForPortal={PORTAL_ICONS} />
			<LanguageSwitcher />
			<ThemeToggle />
			{tenants.length === 0 ? (
				<Text type="secondary" className="text-xs">
					{t('tenant.noTenants')}
				</Text>
			) : tenants.length === 1 ? (
				<Tag color="blue">{tenants[0].name}</Tag>
			) : (
				<Select
					value={currentTenantId || undefined}
					onChange={(value) => {
						switchTenant(value);
						queryClient.invalidateQueries();
					}}
					options={tenants.map((t) => ({ label: t.name, value: t.id }))}
					className="min-w-40"
					placeholder={t('common.selectTenant')}
					size="small"
					aria-label={t('header.switchTenant')}
				/>
			)}

			<UserMenu
				user={user}
				items={[
					{
						key: 'settings',
						type: 'settings',
						onClick: () => navigate(buildNavHref('/settings', tenantSlug)),
					},
					// 站外出口（2026-11-02）：控制台此前只有「设置/退出」，登录后回不到
					// 官网、文档、状态页。三项用 shared 的门户 URL 解析（随根域/区域派生）。
					{ key: 'docs', type: 'custom', label: t('nav.docs'), href: getDEVELOPER_PORTAL_URL() },
					{ key: 'status', type: 'custom', label: t('nav.statusPage'), href: getSTATUS_PAGE_URL() },
					{ key: 'landing', type: 'custom', label: t('nav.officialSite'), href: getLANDING_SITE_URL() },
					{ key: 'logout', type: 'logout', onClick: handleLogout },
				]}
			/>
		</Space>
	);
}

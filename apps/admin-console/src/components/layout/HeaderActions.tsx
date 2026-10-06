'use client';

import React from 'react';
import { useNavigate } from 'react-router';
import { Layout, Space, Typography, Select, Tag } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useLogout, usePortalCatalog, useTenantSlug } from '@autional/shared';
import { LanguageSwitcher, PortalSwitcher, ThemeToggle, UserMenu } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { buildNavHref } from '@/lib/nav';

const { Text } = Typography;

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

	return (
		<Space size="large">
			<PortalSwitcher portals={portals} currentPortal="admin" />
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
					{ key: 'logout', type: 'logout', onClick: handleLogout },
				]}
			/>
		</Space>
	);
}

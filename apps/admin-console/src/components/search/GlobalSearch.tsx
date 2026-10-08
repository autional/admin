'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { AutoComplete, Input, type AutoCompleteProps } from 'antd';
import {
	LayoutGrid,
	Search,
	ShieldCheck,
	User,
	Users,
} from 'lucide-react';
import { getUsers, getRoles, getAllTenants } from '@/lib/api.generated';
import { getApplications } from '@/lib/api.generated';
import { useAuthStore, useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';

import { useTranslation } from 'react-i18next';

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
	users: { label: 'users', icon: <User size="1em" />, color: '#1677ff' },
	roles: { label: 'roles', icon: <ShieldCheck size="1em" />, color: 'var(--color-success)' },
	tenants: { label: 'tenants', icon: <Users size="1em" />, color: '#fa8c16' },
	applications: { label: 'applications', icon: <LayoutGrid size="1em" />, color: '#722ed1' },
};

function extractItems(res: unknown): unknown[] {
	if (!res) return [];
	if (Array.isArray(res)) return res;
	const d = res as Record<string, unknown>;
	if (Array.isArray(d.data)) return d.data as unknown[];
	if (d.data && Array.isArray((d.data as Record<string, unknown>).items)) {
		return (d.data as Record<string, unknown>).items as unknown[];
	}
	if (Array.isArray(d.items)) return d.items as unknown[];
	return [];
}

export function GlobalSearch() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const [options, setOptions] = useState<AutoCompleteProps['options']>([]);
	const [open, setOpen] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const currentTenantId = useAuthStore((s) => s.currentTenantId);
	const tenantSlug = useTenantSlug();

	const performSearch = useCallback(
		async (q: string) => {
			if (!q.trim()) {
				setOptions([]);
				return;
			}

			const search = q.trim().toLowerCase();

			try {
				const [usersRes, rolesRes, tenantsRes] = await Promise.allSettled([
					getUsers({ search, limit: 5 }),
					getRoles(),
					getAllTenants(),
				]);

				let appsRes: PromiseSettledResult<unknown> = { status: 'fulfilled', value: null };
				if (currentTenantId) {
					const r = await getApplications(currentTenantId);
					appsRes = { status: 'fulfilled', value: r };
				}

				interface SearchOptionItem {
					id: string;
					value: string;
					label: React.ReactNode;
					path: string;
					category: string;
				}
				const groups: Array<{ label: string; options: SearchOptionItem[] }> = [];

				const addGroup = (
					cat: string,
					items: unknown[],
					nameKey = 'name',
					detailKey?: string,
					pathFn?: (item: Record<string, unknown>) => string,
				) => {
					const filtered = items.filter((item: unknown) => {
						const record = item as Record<string, unknown> | undefined;
						const name = String(record?.[nameKey] ?? '').toLowerCase();
						return name.includes(search);
					});

					if (filtered.length === 0) return;

					const config = CATEGORY_CONFIG[cat];
					if (!config) return;

					const opts: SearchOptionItem[] = filtered.map((item: unknown) => {
						const record = item as Record<string, unknown>;
						const name = String(record[nameKey] ?? '');
						const detail = detailKey ? String(record[detailKey] ?? '') : undefined;
						const path = pathFn ? pathFn(record) : '#';
						return {
							id: String(record.id ?? ''),
							name,
							category: cat,
							path,
							detail,
							label: (
								<div className="flex items-center gap-2 py-0.5">
									<span className="shrink-0" style={{ color: config.color }}>
										{config.icon}
									</span>
									<div className="flex-1 min-w-0">
										<div className="font-medium text-sm truncate">{name}</div>
										{detail && <div className="text-xs text-neutral-600 truncate">{detail}</div>}
									</div>
								</div>
							),
							value: `${cat}:${record.id}`,
						};
					});

					if (opts.length > 0) {
						groups.push({
							label: t(`globalSearch.labels.${config.label}`),
							options: opts,
						});
					}
				};

				if (usersRes.status === 'fulfilled') {
					addGroup(
						'users',
						extractItems(usersRes.value),
						'username',
						'email',
						(item) => `/users/${item.id}`,
					);
				}

				if (rolesRes.status === 'fulfilled') {
					addGroup('roles', extractItems(rolesRes.value), 'name', 'code', () => '/roles');
				}

				if (tenantsRes.status === 'fulfilled') {
					addGroup(
						'tenants',
						extractItems(tenantsRes.value),
						'name',
						'domain',
						() => '/tenant/api/v1/tenants',
					);
				}

				if (appsRes.status === 'fulfilled' && appsRes.value) {
					addGroup(
						'applications',
						extractItems(appsRes.value),
						'name',
						'type',
						() => '/applications',
					);
				}

				setOptions(groups as unknown as AutoCompleteProps['options']);
			} catch {
				setOptions([]);
			}
		},
		[currentTenantId],
	);

	const handleSearch = (value: string) => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => performSearch(value), 300);
	};

	const handleSelect = (_: string, option: unknown) => {
		const opt = option as { path?: string } | undefined;
		if (opt?.path && opt.path !== '#') {
			navigate(buildNavHref(opt.path, tenantSlug));
		}
		setOpen(false);
	};

	return (
		<AutoComplete
			popupMatchSelectWidth={420}
			className="w-70"
			options={options}
			onSearch={handleSearch}
			onSelect={handleSelect}
			open={open}
			onDropdownVisibleChange={setOpen}
			notFoundContent={
				<div className="flex items-center justify-center py-4 text-sm text-neutral-600">
					{t('globalSearch.noResults')}
				</div>
			}
		>
			<Input
				prefix={<Search size="1em" className="text-neutral-500" />}
				placeholder={t('globalSearch.placeholder')}
				size="small"
				allowClear
			/>
		</AutoComplete>
	);
}

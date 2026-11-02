// 2026-11-02（方案 W2/W3）：控制台顶部控件的「站外出口」与「切换器收窄」回归锁。
//
// 锁两件事：
//   ① 用户菜单里有 文档 / 服务状态 / 官方网站 三条站外出口，且 href 来自 shared 的门户解析
//      （缺陷形态：登录后只有「设置/退出」，回不到官网与文档）；
//   ② 门户切换器只列同类控制台（admin/security/user/platform），目录里的内容站
//      （status/trust/developer/brand）必须被过滤掉，否则一点就整页甩出工作上下文。
//
// 断言口径 = 真实 i18n 渲染出的中文标签。这一条同时锁住 i18n 的「平铺键」约束：
// 本仓 keySeparator=false，若新键被加进嵌套 "nav": {} 对象，标签会渲染成字面量 'nav.docs'，
// 这里的 getByRole(name:'文档') 会直接失败。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeaderActions } from '../HeaderActions';

const mockCatalog = vi.hoisted(() => ({
	value: { portals: [] as Array<{ code: string; name?: string; url: string }>, isError: false, isLoading: false },
}));
const mockLogout = vi.hoisted(() => vi.fn());
const mockGetPortalUrl = vi.hoisted(() =>
	vi.fn((code: string, slug?: string) => `https://${code}.example.com${slug ? `/${slug}` : ''}`),
);

// 关键：用 importOriginal 展开真实模块，只覆盖需要打桩的三项。
// 不要写白名单式工厂 —— 那种写法在组件新增 import 时会直接 "is not a function"（本项目踩过）。
vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return {
		...actual,
		getPortalUrl: mockGetPortalUrl,
		// 三个 getter 必须在模块边界覆盖：它们内部引用的是真实模块里的 getPortalUrl，
		// 只覆盖 getPortalUrl 不会影响已导出的 getter（实测踩到）。
		getDEVELOPER_PORTAL_URL: () => 'https://developer.example.com',
		getSTATUS_PAGE_URL: () => 'https://status.example.com',
		getLANDING_SITE_URL: () => 'https://www.example.com',
		useLogout: () => mockLogout,
		useTenantSlug: () => 'demo',
		usePortalCatalog: () => ({
			portals: mockCatalog.value.portals,
			allPortals: mockCatalog.value.portals,
			isLoading: false,
			isError: mockCatalog.value.isError,
			refetch: () => {},
		}),
	};
});

function renderHeaderActions() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={['/demo']}>
				<HeaderActions />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('HeaderActions · 站外出口与切换器收窄', () => {
	beforeEach(() => {
		mockCatalog.value = { portals: [], isError: false, isLoading: false };
		mockLogout.mockClear();
		mockGetPortalUrl.mockClear();
	});

	it('用户菜单有三条站外出口，且登出恒为末项', async () => {
		const user = userEvent.setup();
		renderHeaderActions();

		await user.click(screen.getByLabelText('用户菜单'));

		expect(screen.getByRole('menuitem', { name: '文档' })).toHaveAttribute(
			'href',
			'https://developer.example.com',
		);
		expect(screen.getByRole('menuitem', { name: '服务状态' })).toHaveAttribute(
			'href',
			'https://status.example.com',
		);
		expect(screen.getByRole('menuitem', { name: '官方网站' })).toHaveAttribute(
			'href',
			'https://www.example.com',
		);

		const items = screen.getAllByRole('menuitem');
		expect(items[items.length - 1]).toHaveTextContent('退出登录');
	});

	it('切换器只保留控制台，内容站被过滤', async () => {
		mockCatalog.value = {
			portals: [
				{ code: 'admin', name: '管理后台', url: 'https://admin.example.com/demo' },
				{ code: 'user', name: '用户中心', url: 'https://user.example.com/demo' },
				{ code: 'status', name: '状态页', url: 'https://status.example.com' },
				{ code: 'trust', name: '信任中心', url: 'https://trust.example.com' },
				{ code: 'developer', name: '开发者门户', url: 'https://developer.example.com' },
				{ code: 'brand', name: '品牌入口', url: 'https://brand.example.com' },
			],
			isError: false,
			isLoading: false,
		};
		const user = userEvent.setup();
		renderHeaderActions();

		await user.click(screen.getByLabelText('切换门户'));

		expect(screen.getByRole('menuitem', { name: '管理后台' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: '用户中心' })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: '状态页' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: '信任中心' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: '开发者门户' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: '品牌入口' })).not.toBeInTheDocument();
	});
});

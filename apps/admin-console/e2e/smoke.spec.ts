import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * 管理控制台浏览器冒烟（BFF 全量桩）。
 *
 * 为什么要有这一层：站点是**纯 API 控制台**，单测把 `@autional/shared` 的
 * auth / bootstrap / 租户白名单链全 mock 掉了，于是「路由白屏」「租户 slug 漏斗断裂」
 * 「app↔shared 信封误读」「控制台报错」这类问题单测永远发现不了。
 *
 * 做法：不发真后端、不走登录 —— 用 localStorage 预置一份持久化会话（zustand persist 的
 * `autional-auth-v1`，见 shared/auth/create-auth-store.ts 默认 name），再把 `/bff/**`
 * 全量拦截成**源码验证过的真实信封形状**。本站点两种信封并存，混用会假绿：
 *
 *   ① axios 客户端（identity / rbac / audit / notification / secret / tenant / billing …）
 *      走 `{ code, message, data, timestamp }`；响应拦截器解 `data` 并深 camelCase
 *      （shared/api/client.ts:88-108）。
 *   ② 列表类端点后端是 dto_base.ListResponse，数组与 total 在**顶层**
 *      （`{code, message, items, total, pagination, timestamp}`）；拦截器把它折成
 *      `{ items, total, pagination }`（client.ts:92-97），hooks 再经
 *      `fromPageResult` / `extractListResult` 取（shared/utils/response.ts）。
 *   ③ 少数端点走**裸 fetch**：公开租户名单（shared/components/TenantIndexGuard.tsx:60）
 *      与公开租户详情/品牌（shared/branding/BrandingInitializer.tsx:44）。前者只认顶层
 *      `items`（无 `data` 分支兜底前先看 `data`），后者走 axios。
 *
 * 关于「平台成员门」的源码核查（与 platform-console 的差异，勿照抄其结论）：
 * 本仓 admin-console **没有**站点级平台成员门 —— `App.tsx` 只用
 * `RequireAuth` / `AuthGuard` / `AdminGuard` / `UserMgmtGuard`，全仓搜不到 `platform_tenant_guard`
 * 或 `usePlatformMember`。`PLATFORM_TENANT_ID` 只出现在两处**页面级**语义：
 * `usePortalCatalog`（isPlatformMember 仅用于过滤 audience=platform 的门户目录）与
 * `app/abac-policies/page.tsx`（平台级策略只读标记）。因此这里用**普通演示租户**，
 * 并让 token 的 `tenant_id` claim 与会话里的 currentTenantId 保持一致 —— 后端网关
 * 认的是 claim/`X-Tenant-ID` 与租户一致，写错会整站 403。
 */

const SLUG = 'demo';
/** 当前会话租户（普通演示租户，非平台租户；见文件头「平台成员门」核查）。 */
const TENANT_ID = '01JADMINTENANT0000000001';
const USER_ID = 'user-smoke';
/** zustand persist 的存储键（shared/auth/create-auth-store.ts 默认 name）。 */
const AUTH_STORAGE_KEY = 'autional-auth-v1';
/** 角色与 shared/auth/portal-config.ts 的 ROLE_SUPER_ADMIN 对齐（AdminGuard 直通）。 */
const ROLE = 'super_admin';
/**
 * 权限集（bootstrap 会把它写回 store）：只放只读码，避免任何页面因「有写权限」
 * 渲染出额外的动作按钮，把冒烟面收敛到「首屏能不能渲染」。
 * 注：`usePermission().can` 对 super_admin 直通所有 `tenant:*`，故侧栏仍完整；
 * 这里不追求「菜单最少」，只保证断言面稳定。
 */
const PERMISSIONS = [
	'tenant:dashboard:read',
	'tenant:user:read',
	'tenant:role:read',
	'tenant:audit:read',
	'tenant:notification:read',
];

/** exp = 2100-01-01：避免被 shared 的 isTokenExpired 判过期，触发 refresh 分支跑偏。 */
const ACCESS_TOKEN = (() => {
	const encode = (payload: Record<string, unknown>) =>
		Buffer.from(JSON.stringify(payload)).toString('base64url');
	return [
		encode({ alg: 'none', typ: 'JWT' }),
		encode({ sub: USER_ID, exp: 4102444800, tenant_id: TENANT_ID }),
		'smoke',
	].join('.');
})();

const TIMESTAMP = '2026-01-01T00:00:00Z';

const json = (data: unknown) => ({
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify(data),
});

/** 标准信封（axios 拦截器解 data 后转 camelCase）。 */
const envelope = (data: unknown) => json({ code: 0, message: 'ok', data, timestamp: TIMESTAMP });

/** ListResponse 信封（数组与 total 在顶层；拦截器折成 { items, total, pagination }）。 */
const listResponse = (items: unknown[], total = items.length) =>
	json({
		code: 0,
		message: 'ok',
		items,
		total,
		pagination: { page: 1, pageSize: 10, total: total, totalPages: 1, hasNext: false },
		timestamp: TIMESTAMP,
	});

/**
 * 控制台错误噪声白名单。
 * 只放「不是本次冒烟要抓的问题」的噪声；其余一律必须为 0 —— 否则这条断言就失去意义。
 *
 * - 资源类：favicon / 被桩短接的连接，是浏览器自己打的，不是应用代码。
 * - 组件库弃用告警：antd 6 用 console.error 发 deprecation 提示，本站实测两种句式：
 *   `[antd: Card] `bordered` is deprecated` 与
 *   `[antd: List] The `List` component is deprecated`（仪表盘「最近登录」用了 List）。
 *   修它要改应用源码 —— 不在本卡范围。匹配仍以 `[antd: …]` 前缀 + `deprecated` 收窄，
 *   不放宽到任意 "deprecated" 字样。
 */
const CONSOLE_NOISE = [
	/Failed to load resource/i,
	/net::ERR_/i,
	/\[antd: [^\]]+\][^\n]*deprecated/i,
];

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const text = msg.text();
		if (CONSOLE_NOISE.some((re) => re.test(text))) return;
		errors.push(`[console.error] ${text}`);
	});
	return errors;
}

/** 预置持久化会话：localStorage 在每次导航前写入（addInitScript 每条文档都执行）。 */
async function seedSession(page: Page) {
	await page.addInitScript(
		({ key, token, tenantId, role, permissions, userId }) => {
			window.localStorage.setItem(
				key,
				JSON.stringify({
					state: {
						user: {
							id: userId,
							email: 'smoke@example.com',
							username: 'smoke',
							status: 'active',
						},
						accessToken: token,
						refreshToken: token,
						// 裸根漏斗（TenantRootRedirect）用 currentTenantId 去公开名单里找 slug；
						// useCurrentRole / HeaderActions 也从这里读，必须与 token claim 同一个租户。
						tenants: [{ id: tenantId, name: '演示租户', role }],
						currentTenantId: tenantId,
						permissions,
						isAuthenticated: true,
					},
					version: 1,
				}),
			);
		},
		{
			key: AUTH_STORAGE_KEY,
			token: ACCESS_TOKEN,
			tenantId: TENANT_ID,
			role: ROLE,
			permissions: PERMISSIONS,
			userId: USER_ID,
		},
	);
}

/** `/bff/**` 全量桩。未知端点兜底返回空 data（保证不出现 4xx/5xx 噪声）。 */
async function mockApi(page: Page) {
	await page.route('**/bff/**', async (route: Route) => {
		const path = new URL(route.request().url()).pathname.replace(/^\/bff/, '');

		// ── 启动链（TenantRootRedirect / TenantIndexGuard / BrandingInitializer）──────
		// 公开租户**名单**：裸 fetch + ListResponse（`items` 在顶层，不是 `data`）。
		// `name` 即 slug 权威（TenantRootRedirect 用 name 拼 URL，用展示名会落 404），
		// 故这里 name 与 slug 同为 'demo'，展示名放在会话 tenants[].name。
		if (path === '/tenant/api/v1/tenant/public/tenants') {
			return route.fulfill(
				listResponse([{ id: TENANT_ID, name: SLUG, slug: SLUG }], 1),
			);
		}
		// 公开租户详情（品牌）：BrandingInitializer 按 URL slug 拉，axios 信封
		if (path === `/tenant/api/v1/tenant/public/tenants/${SLUG}`) {
			return route.fulfill(envelope({ id: TENANT_ID, name: SLUG, branding: {} }));
		}
		if (path === '/identity/api/v1/auth/me/permissions') {
			return route.fulfill(envelope(PERMISSIONS));
		}
		if (path === '/identity/api/v1/auth/me/tenants') {
			return route.fulfill(envelope([{ id: TENANT_ID, name: '演示租户', role: ROLE }]));
		}
		// 启动补读头像：空 URL ⇒ Avatar 回落首字母（不产生 <img> 失败请求）
		if (path === '/profile/api/v1/profile/avatar') {
			return route.fulfill(envelope({ avatarUrl: '' }));
		}

		// ── 仪表盘六查询（shape 对齐页面读取的字段名：camelCase）───────────────────
		// 用户列表：useUsers 与 useTenantSummary（limit=1 拿 total）共用同一端点。
		// ListResponse：items 是数组、total 是总数（128）—— 写进 `data` 会让
		// 「成员 / 总用户数」卡退化成 0（假绿）。
		if (path === '/identity/api/v1/admin/users') {
			return route.fulfill(
				listResponse(
					[
						{
							id: 'user-1',
							username: 'smoke-user',
							email: 'smoke-user@example.com',
							status: 'active',
							// 早于「今天」⇒ 今日新增恒 0（避免依赖运行日期的脆弱断言）
							createdAt: TIMESTAMP,
							mustChangePassword: false,
							passwordChangedAt: TIMESTAMP,
						},
					],
					128,
				),
			);
		}
		if (path === '/session/api/v1/admin/sessions/active-count') {
			return route.fulfill(envelope({ count: 5 }));
		}
		// 角色列表：total=12 直接喂「角色 / 角色数量」两卡
		if (path === '/rbac/api/v1/admin/roles') {
			return route.fulfill(
				listResponse(
					[{ id: 'role-1', code: 'admin', name: '管理员', description: '', dataScope: 'all' }],
					12,
				),
			);
		}
		// 审计告警：仪表盘只读 `pagination.total`（status=open 条数）⇒ 必须给 pagination
		if (path === '/audit/api/v1/admin/audit/alerts') {
			return route.fulfill(listResponse([], 3));
		}
		// 最近登录：走 extractListResult（顶层 items）
		if (path === '/audit/api/v1/admin/audit/logs') {
			return route.fulfill(
				listResponse(
					[
						{
							id: 'log-smoke-1',
							timestamp: Date.parse(TIMESTAMP),
							operatorId: 'smoke-admin',
							operatorType: 'user',
							action: 'LOGIN',
							module: 'identity',
							level: 'info',
							message: 'login success',
							status: 200,
							ip: '127.0.0.1',
							duration: 12,
						},
					],
					1,
				),
			);
		}
		// 系统公告：同样走 extractListResult
		if (path === '/notification/api/v1/admin/announcements') {
			return route.fulfill(
				listResponse(
					[
						{
							id: 'ann-1',
							tenantId: TENANT_ID,
							title: '冒烟公告：控制台巡检',
							content: 'e2e',
							status: 'published',
							views: 1,
							dismissals: 0,
							publishAt: TIMESTAMP,
							createdAt: TIMESTAMP,
							updatedAt: TIMESTAMP,
						},
					],
					1,
				),
			);
		}

		// ── 顶栏 / 侧栏（HeaderActions、NavMenu）──────────────────────────────────
		// 门户切换器（audience=admin）：给空目录 ⇒ 切换器按 Gainsight 规则自动隐藏，
		// 冒烟面收敛到「首屏能不能渲染」，不把无关接口的成败混进断言。
		if (/^\/tenant\/api\/v1\/admin\/tenants\/[^/]+\/applications$/.test(path)) {
			return route.fulfill(listResponse([], 0));
		}
		// 侧栏「待审批成员」角标：pendingData?.data?.total ?? 0
		if (/^\/tenant\/api\/v1\/admin\/tenants\/[^/]+\/members\/pending$/.test(path)) {
			return route.fulfill(listResponse([], 0));
		}
		// 功能开关（侧栏 NHI 分组双门之一）：空集合 ⇒ 该分组隐藏（避免额外详情请求）
		if (path === '/billing/api/v1/admin/billing/feature-gates') {
			return route.fulfill(envelope({ featureGates: [] }));
		}

		// ── 仪表盘概览里的两处小 KPI（读法不同，形状必须分别对齐）──────────────
		// `apiKeysData?.data?.total ?? apiKeysData?.total`：拦截器已解包 ⇒ 顶层 total
		if (path === '/identity/api/v1/admin/auth/api-keys/stats') {
			return route.fulfill(envelope({ total: 7 }));
		}
		// 密钥列表：`secretsData?.data?.total ?? secretsData?.total`（ListResponse 顶层 total）
		if (path === '/secret/api/v1/admin/secrets') {
			return route.fulfill(listResponse([], 4));
		}

		return route.fulfill(envelope({}));
	});
}

test.describe('管理控制台冒烟', () => {
	test.beforeEach(async ({ page }) => {
		await seedSession(page);
		await mockApi(page);
	});

	test('裸根 / 返回 200，且有会话时漏斗到租户总览', async ({ page }) => {
		const errors = collectErrors(page);

		// waitUntil: 'commit' —— 该页是一条「立即整页跳走」的漏斗路由（TenantRootRedirect），
		// 等 load 会在跳转中途被中断（假红），只取文档响应状态这一件事。
		const response = await page.goto('/', { waitUntil: 'commit' });
		expect(response?.status(), 'GET / 的 HTTP 状态').toBe(200);

		// 裸根不得停在空白页：有会话 + 公开名单命中 → /<slug>/（源码 TenantRootRedirect 口径）。
		// URL 上会带一跳溯源参数 `?rt=<层>.<reason>.<id>`（auth-trace 的 decorateTarget），
		// 断言因此只认路径 /demo/，不认整个字符串。
		await expect(page).toHaveURL(new RegExp(`/${SLUG}/(\\?.*)?$`));
		await expect(page.locator('main h1')).toHaveText('仪表盘');

		// 跳转后仍有接口在路上（bootstrap / 仪表盘六查询），给它们落定再判控制台干净。
		await page.waitForTimeout(1_500);
		expect(errors.join('\n'), '控制台/pageerror').toBe('');
	});

	test('租户总览渲染：标题、KPI 与两张列表卡可见，且无未捕获异常', async ({ page }) => {
		const errors = collectErrors(page);

		const response = await page.goto(`/${SLUG}/`);
		expect(response?.status()).toBe(200);

		// ④ 稳定元素：AppPageHeader 的 h1（i18n zh-CN 的 dashboard.title）。
		//    它是「真的渲染出来了」的证据，而不是加载占位。
		await expect(page.locator('main h1')).toHaveText('仪表盘');

		// 卡片标题限定在 main 内：这些词在左侧菜单里也有一份（严格模式会命中 2 个）。
		const main = page.locator('main');
		await expect(main.getByText('租户概览', { exact: true })).toBeVisible();
		await expect(main.getByText('最近登录', { exact: true })).toBeVisible();
		await expect(main.getByText('系统公告', { exact: true })).toBeVisible();

		// 桩值落到页面上 ⇒ 同时证明**两种信封**都读对了：
		//   - 128：users ListResponse 顶层 total（写进 data 会退化成 0）
		//   - 12：roles ListResponse 顶层 total
		//   - 7 / 4：api-keys stats 与 secrets 两种不同读法（顶层 total）
		//   （成员与总用户数都用 128，故取 first()）
		await expect(main.getByText('128', { exact: true }).first()).toBeVisible();
		await expect(main.getByText('12', { exact: true }).first()).toBeVisible();
		await expect(main.getByText('7', { exact: true }).first()).toBeVisible();
		await expect(main.getByText('4', { exact: true }).first()).toBeVisible();

		// 告警卡取 pagination.total（不是 items 长度）⇒ 3
		await expect(
			main.locator('.ant-card').filter({ hasText: '待处理审计告警' }),
		).toContainText('3');

		// 列表类端点（顶层 items）：最近登录行与公告标题
		await expect(main.getByText('smoke-admin', { exact: true })).toBeVisible();
		await expect(main.getByText('冒烟公告：控制台巡检', { exact: true })).toBeVisible();

		// ② 非白屏：主体有可见文本，且没有把 undefined 直接喷到脸上。
		const text = await main.innerText();
		expect(text.trim().length).toBeGreaterThan(0);
		expect(text).not.toContain('undefined');

		// ③ 给迟到的报错留窗口（头像补读 / react-query 落定都在这之后）。
		await page.waitForTimeout(2_000);
		expect(errors.join('\n'), '控制台/pageerror').toBe('');
	});

	test('未知租户 slug 渲染 404（白名单守卫没被绕过）', async ({ page }) => {
		const errors = collectErrors(page);

		const response = await page.goto('/not-a-tenant/');
		// SPA 由 vite 回落 index.html，HTTP 仍 200；404 是前端按公开名单判定的
		// （AdminMountGate 放行 → TenantIndexGuard 用名单比对后渲染 not-found 页）。
		expect(response?.status()).toBe(200);

		await expect(page.getByText('你访问的页面不存在')).toBeVisible();
		await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible();
		await page.waitForTimeout(1_000);
		expect(errors.join('\n'), '控制台/pageerror').toBe('');
	});
});

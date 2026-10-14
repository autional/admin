import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BASE_PATH, getRouterBasename, isRetryableError } from '@autional/shared';
import { ThemeProvider } from '@autional/ui';
import { AntdAppProvider } from './lib/antd-app';
import './i18n';
import App from './App';
import './non-tenant-segments';
import './app/globals.css';

const PORTAL_SLUGS: string[] = []; // No longer needed — each portal is on its own domain

/**
 * 多域名架构：admin.autional.local 已是独立域名，URL 无需 slug 前缀。
 * 若将 /users 的第一段误当 slug basename，BrowserRouter 会把 /users 剥离成 /，
 * 导致所有页面都匹配到 index(Dashboard)（BUG-005）。
 * slug 前缀模式已在多域名重构中废弃（每个 portal 独立域名），恒返回 /。
 */
function resolveBasename(): string {
	return '/';
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// 重试策略唯一实现：只重试「重试可能改变结果」的错误（@autional/shared/utils/query-state
			// 的 isRetryableError：无状态码 / 5xx / 408 / 429）；4xx（含 404/403）一律不重试。
			// 历史：原 `retry: 1` 会把 404/403 也重试，各页为此各写局部谓词（A-79/A-86/A-91/A-93/
			// A-344②/A-405⑤…），谓词散布 → 收敛到此处一处。
			// ⚠️ 页面/hook 不得再写 retry / retryDelay 覆盖本策略（唯一例外见 use-identity-providers.ts 的 LDAP 503）。
			retry: (failureCount, error) => isRetryableError(error) && failureCount < 1,
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		},
	},
});

const root = document.getElementById('root');
if (root) {
	const basename = resolveBasename();
	createRoot(root).render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter basename={basename}>
				<ThemeProvider storageKey="admin-console-theme">
					<AntdAppProvider>
						<App />
					</AntdAppProvider>
				</ThemeProvider>
			</BrowserRouter>
		</QueryClientProvider>,
	);
}

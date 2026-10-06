import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BASE_PATH, getRouterBasename } from '@autional/shared';
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
			retry: 1,
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

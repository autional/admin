import { ROOT_DOMAIN } from '@/lib/site-env';

/**
 * 文档站地址单源 —— api-docs / sdks 页共用（A-62 / A-60）。
 *
 * 兜底 docs.<区域根域>（按 ROOT_DOMAIN 派生，B3 单源双区）；
 * 可用 VITE_DOCS_URL 覆盖。路径口径以 sites/docs 页面清单为准：/api、/sdk、/auth-concepts。
 */
export const DOCS_BASE = import.meta.env.VITE_DOCS_URL || `https://docs.${ROOT_DOMAIN}`;

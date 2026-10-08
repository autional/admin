/**
 * 文档站地址单源 —— api-docs / sdks 页共用（A-62 / A-60）。
 *
 * 兜底 docs.autional.cn（对齐 sites/docs 部署域）；可用 VITE_DOCS_URL 覆盖。
 * 路径口径以 sites/docs 页面清单为准：/api、/sdk、/auth-concepts。
 */
export const DOCS_BASE = import.meta.env.VITE_DOCS_URL || 'https://docs.autional.cn';

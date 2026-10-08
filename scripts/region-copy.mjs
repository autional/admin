/**
 * 区域静态文案单点（index.html 元信息 / robots 注释）。
 * zh = cn 基线原文（逐字节不变）；en = com 面文案（B3 起 com 默认 en）。
 * robotsComment 为行数组（cn 基线两行注释，勿并成一行）。
 */
export const REGION_COPY = {
  zh: {
    locale: 'zh-CN',
    title: 'Autional 管理控制台',
    description: 'Autional 管理控制台 —— 租户、用户、应用与策略的集中管理后台。',
    robotsComment: [
      '管理控制台：不收录（登录后使用，无公开内容）。',
      '不用 Disallow：保持可抓取，搜索引擎才能读到 index.html 里的 robots noindex。',
    ],
  },
  en: {
    locale: 'en-US',
    title: 'Autional Admin Console',
    description: 'Autional Admin Console — centralized administration for tenants, users, applications, and policies.',
    robotsComment: [
      'admin console: not indexed (used after login; no public content).',
      'No Disallow: stay crawlable so search engines can read the robots noindex meta in index.html.',
    ],
  },
};

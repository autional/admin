// a11y 专用 flat config —— 试点（2026-11-12 · 分母体系 AC C-28 / ui-denominator G5·G6）
//
// 为什么单独一份，而不是塞进 eslint.config.mjs：
//   1. 共享配置 `@autional/eslint-config` 在试点仓里是**已发布版本**（0.1.0-rc.1），
//      规则改不了；DS 侧 0.2.0-rc.1 已把同一套规则写进 `packages/eslint-config/index.js`，
//      等它发布后本文件即可删除（改回 `export default config` 一行）。
//   2. 存量 lint（no-explicit-any / no-unused-vars）噪音大；a11y 闸门要能独立回答
//      「这次有没有新增无障碍回归」，否则会被无关告警埋掉。
//
// 口径：`pnpm lint:a11y` 必须 0 error（CI 里用 --max-warnings 0，等价于 error+warn 全清）。
// 基线：2026-11-12 首次接入时全量 11 条命中（4 处「链接/卡片当按钮用」），已在本仓修掉：
//   agents/devices/robots 的 `<a onClick>` → `<button type="button">`；
//   audit/anomalies 的可点击卡片 div → 加 `role="button" tabIndex={0} onKeyDown`。
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config({
	files: ['**/*.{ts,tsx,js,jsx}'],
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
	},
	// react-hooks 只登记插件、不开规则：本仓有 7 处 `// eslint-disable-next-line react-hooks/exhaustive-deps`
	// （插件缺席的年代写的），ESLint 10 会把"禁用了未定义规则"直接报成 error。
	// 同时关掉 reportUnusedDisableDirectives：本配置本就**不跑** react-hooks，那 7 处 disable 在这里
	// 必然是"未使用"的假信号，不该让 a11y 闸门因为它变红。
	linterOptions: { reportUnusedDisableDirectives: 'off' },
	plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
	rules: { ...jsxA11y.flatConfigs.recommended.rules },
});

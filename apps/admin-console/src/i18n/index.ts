import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { registerUiI18n } from '@autional/ui/i18n';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import { FALLBACK_LANG, localeOf } from '@/lib/site-env';

// Locale files use flat dot-delimited keys (e.g. "common.delete", "abacPolicies.policyName").
// keySeparator: false prevents i18next from splitting keys on '.' — needed because the
// JSON keys contain literal dots that are NOT path separators (the resources are flat hashmaps).
// This matches the pattern used in authenticator-app.
//
// 语言契约（B3 §1.5）：首访语言 = 区域默认（cn→zh / com→en）——由 fallbackLng 承接，
// 探测链只留 localStorage（关 navigator：避免区域默认被浏览器语言覆盖）；
// 手动切换经 localStorage（lookupLocalStorage）持久，跨访问保留。
i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } },
		fallbackLng: localeOf(FALLBACK_LANG),
		supportedLngs: ['zh-CN', 'en-US'],
		keySeparator: false,
		interpolation: { escapeValue: false },
		detection: {
			order: ['localStorage'],
			caches: ['localStorage'],
			lookupLocalStorage: 'admin-console-lang',
		},
	});

registerUiI18n(i18n);

// 同步 <html lang> —— 换语言后必须更新 documentElement.lang。
// ① a11y：WCAG 3.1.1 要求页面声明的语言与正文一致；index.html 的 {{LANG}} 只声明区域默认，
//    用户手动切换后那个声明就过期了（读屏器会按旧语言念新语言）。
// ② 设计系统的 ErrorBoundary 字典按这个属性选语言 —— 没有它，错误页只会用区域默认语言。
const syncHtmlLang = () => {
	if (typeof document !== 'undefined') {
		document.documentElement.lang = i18n.language || localeOf(FALLBACK_LANG);
	}
};
i18n.on('languageChanged', syncHtmlLang);
// 初始化完成后立即同步一次（覆盖 index.html 声明的区域默认 lang）
if (i18n.isInitialized) {
	syncHtmlLang();
} else {
	i18n.on('initialized', syncHtmlLang);
}

export default i18n;

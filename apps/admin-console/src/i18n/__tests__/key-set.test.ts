// 批 5 · W1h（A-441）：i18n 顶层键集回归锁 ——
//   ① 顶层值必须全为 string：keySeparator:false（i18n/index.ts:19）下对象值键不可达 = 死数据；
//      A-441 删除的 `verifications` 904 键死块（旧版整文件嵌套残留）即此形态，本锁防再生。
//   ② 顶层不得再出现 `verifications` 对象键（删除面防回归）。
//   ③ zh-CN / en-US 双侧键集对称（键增删双侧同提交的口径固化，plan §1.3 i18n 双侧门）。
import { describe, it, expect } from 'vitest';
import zhCN from '../locales/zh-CN.json';
import enUS from '../locales/en-US.json';

type LocaleMap = Record<string, unknown>;

const zh = zhCN as LocaleMap;
const en = enUS as LocaleMap;

describe('i18n 顶层键集回归锁（A-441）', () => {
	it('AC-B5-W1h-08：顶层值全为 string（对象值键 = keySeparator:false 下不可达死数据）', () => {
		for (const [name, locale] of Object.entries({ 'zh-CN': zh, 'en-US': en })) {
			const offenders = Object.entries(locale)
				.filter(([, v]) => typeof v !== 'string')
				.map(([k, v]) => `${k} (${typeof v})`);
			expect(offenders, `${name} 顶层存在非 string 值键`).toEqual([]);
		}
	});

	it('AC-B5-W1h-08：verifications 顶层死块不存在（防再生）', () => {
		expect('verifications' in zh).toBe(false);
		expect('verifications' in en).toBe(false);
	});

	it('双侧键集对称：zh-CN 与 en-US 顶层键名集合一致', () => {
		expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
	});
});

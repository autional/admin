import { describe, it, expect } from 'vitest';
import { formatAmount } from '../page';

// AC-B4-W2-02：number/string/undefined 三型测试（string "499" 不再崩溃 + 渲染 ¥499.00）。
// A-292②（W1f）：全门户 CNY 口径收口后符号 `$`→`¥`，本断言同步（三型不崩语义零改动）。
describe('formatAmount（A-279 / RC-B4-03）', () => {
	it('number：直用格式化', () => {
		expect(formatAmount(499)).toBe('¥499.00');
		expect(formatAmount(0)).toBe('¥0.00');
		expect(formatAmount(12.5)).toBe('¥12.50');
	});

	it('string：可解析则同格式（记录 Tab "499" 实证）', () => {
		expect(formatAmount('499')).toBe('¥499.00');
		expect(formatAmount('0.1')).toBe('¥0.10');
		expect(formatAmount(' 88 ')).toBe('¥88.00');
	});

	it('undefined/null/空串/不可解析 → "-"（不崩）', () => {
		expect(formatAmount(undefined)).toBe('-');
		expect(formatAmount(null)).toBe('-');
		expect(formatAmount('')).toBe('-');
		expect(formatAmount('abc')).toBe('-');
		expect(formatAmount(Number.NaN)).toBe('-');
		expect(formatAmount(Number.POSITIVE_INFINITY)).toBe('-');
	});
});

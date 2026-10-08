// W1g（A-398 / AC-B5-W1g-01）：套餐编辑载荷构建纯函数回归锁。
//
// 修复前：编辑保存把 createPlanSchema 产物（code/billingCycle/quarterlyPrice/features/isCustom
// 全量）原样上行 —— UpdatePlanRequest（dto.go:296-310）不识别这些键，价格键名 monthlyPrice
// ≠ monthly_price 亦被丢弃 ⇒ 用户见「更新成功」而仅名称生效（结果失真）。
// 修复后：buildPlanUpdatePayload 只透出 UpdatePlanRequest 认得的四键。
import { describe, it, expect } from 'vitest';
import { buildPlanUpdatePayload } from '../plans/page';

describe('buildPlanUpdatePayload（A-398 / AC-B5-W1g-01）', () => {
	it('只保留 name/monthlyPrice/yearlyPrice/status 四键；create-only 键全剥离', () => {
		expect(
			buildPlanUpdatePayload({
				code: 'pro_monthly',
				name: 'Pro',
				billingCycle: 'monthly',
				monthlyPrice: 49,
				yearlyPrice: 490,
				quarterlyPrice: 12,
				features: '{"max_users":100}',
				isCustom: true,
				status: 'active',
			}),
		).toEqual({
			name: 'Pro',
			monthlyPrice: 49,
			yearlyPrice: 490,
			status: 'active',
		});
	});

	it('未提供的键不注入（undefined 省略；防误清既有字段）', () => {
		expect(buildPlanUpdatePayload({ name: 'Basic' })).toEqual({ name: 'Basic' });
		expect(buildPlanUpdatePayload({ status: 'inactive' })).toEqual({ status: 'inactive' });
		expect(buildPlanUpdatePayload({})).toEqual({});
	});

	it('显式 null 视为已提供（指针语义透传，不做真值判定）', () => {
		expect(buildPlanUpdatePayload({ yearlyPrice: null })).toEqual({ yearlyPrice: null });
		expect(buildPlanUpdatePayload({ monthlyPrice: 0 })).toEqual({ monthlyPrice: 0 });
	});
});

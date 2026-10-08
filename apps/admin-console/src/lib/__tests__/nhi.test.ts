// W1b（A-77/A-85/A-92）词汇映射单点回归锁 ——
//   A-85：robot 状态五态映射（后端 robot/domain/robot.go:23-28 枚举实读）
//   A-92：device 状态三态映射（后端 device/domain/device.go:22-28；revoked/deleted 零写入不在表内）
//   A-77：agent 状态五态映射（后端 agent/domain/agent.go:17-24 实读）
//   statusVariantOf：未知/空 → neutral（旧本地表兜底语义不变）
//   retryUnlessNotFound：404 不重试（消假 ID 重复请求，A-79/A-86/A-91/A-93）；其余沿用 retry:1
// 恢复即红：任何一页再抄本地状态表 / 表内混入幽灵状态词，本锁或页面测试即失败。
import { describe, it, expect } from 'vitest';
import {
	AGENT_STATUS_VARIANT,
	ROBOT_STATUS_VARIANT,
	DEVICE_STATUS_VARIANT,
	statusVariantOf,
	isNotFoundError,
	retryUnlessNotFound,
} from '../nhi';

describe('NHI 状态词表单源（A-77/A-85/A-92）', () => {
	it('AC-B5-W1b-85：robot 状态五态 = 后端枚举全量（幽灵键 maintenance/offline/online/provisioning 不得混入）', () => {
		expect(Object.keys(ROBOT_STATUS_VARIANT).sort()).toEqual([
			'active',
			'commissioning',
			'decommissioned',
			'degraded',
			'deleted',
		]);
		expect(ROBOT_STATUS_VARIANT.commissioning).toBe('info');
		expect(ROBOT_STATUS_VARIANT.active).toBe('success');
		expect(ROBOT_STATUS_VARIANT.degraded).toBe('warning');
		expect(ROBOT_STATUS_VARIANT.decommissioned).toBe('neutral');
		expect(ROBOT_STATUS_VARIANT.deleted).toBe('neutral');
	});

	it('AC-B5-W1b-92：device 状态三态 = 实际可写入全量（revoked/deleted 零写入不进表）', () => {
		expect(Object.keys(DEVICE_STATUS_VARIANT).sort()).toEqual([
			'active',
			'transferring',
			'unpaired',
		]);
		expect(DEVICE_STATUS_VARIANT.unpaired).toBe('info');
		expect(DEVICE_STATUS_VARIANT.active).toBe('success');
		expect(DEVICE_STATUS_VARIANT.transferring).toBe('warning');
	});

	it('AC-B5-W1b-77：agent 状态五态 = 后端枚举全量（幽灵键 disabled/expired/suspended 不在映射面）', () => {
		expect(Object.keys(AGENT_STATUS_VARIANT).sort()).toEqual([
			'active',
			'deleted',
			'provisioning',
			'revoked',
			'rotating',
		]);
		expect(AGENT_STATUS_VARIANT.provisioning).toBe('info');
		expect(AGENT_STATUS_VARIANT.active).toBe('success');
		expect(AGENT_STATUS_VARIANT.rotating).toBe('warning');
		expect(AGENT_STATUS_VARIANT.revoked).toBe('danger');
		expect(AGENT_STATUS_VARIANT.deleted).toBe('neutral');
	});

	it('statusVariantOf：命中取表值；未收录/空/未定义一律 neutral（兜底语义）', () => {
		expect(statusVariantOf(AGENT_STATUS_VARIANT, 'revoked')).toBe('danger');
		expect(statusVariantOf(AGENT_STATUS_VARIANT, 'maintenance')).toBe('neutral');
		expect(statusVariantOf(AGENT_STATUS_VARIANT, '')).toBe('neutral');
		expect(statusVariantOf(AGENT_STATUS_VARIANT, undefined)).toBe('neutral');
		expect(statusVariantOf(AGENT_STATUS_VARIANT, null)).toBe('neutral');
	});
});

describe('详情查询 retry 谓词（A-79/A-86/A-91/A-93）', () => {
	it('isNotFoundError：axios response.status / 裸 status 双形态 404 判定', () => {
		expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
		expect(isNotFoundError({ status: 404 })).toBe(true);
		expect(isNotFoundError({ response: { status: 500 } })).toBe(false);
		expect(isNotFoundError(new Error('Network Error'))).toBe(false);
		expect(isNotFoundError(undefined)).toBe(false);
	});

	it('retryUnlessNotFound：404 零重试；非 404 沿用 failureCount<1（全局 retry:1 口径）', () => {
		expect(retryUnlessNotFound(0, new Error('Request failed with status code 404'))).toBe(true);
		// 404 错误对象（形态与线上信封经 axios 抛出的一致）
		const nf = Object.assign(new Error('not found'), { response: { status: 404 } });
		expect(retryUnlessNotFound(0, nf)).toBe(false);
		const err500 = Object.assign(new Error('boom'), { response: { status: 500 } });
		expect(retryUnlessNotFound(0, err500)).toBe(true);
		expect(retryUnlessNotFound(1, err500)).toBe(false);
	});
});

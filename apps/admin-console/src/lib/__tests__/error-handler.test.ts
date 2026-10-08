// W1e-33（fix-admin-b5-polish / A-200④）：error-handler 本地化 fallback 优先级回归锁。
//
// 缺陷形态：服务端语义消息（Problem 契约 message/title/detail）缺席时，axios 传输层英文原文
// （"Request failed with status code 404"）会顶掉调用方传入的中文 fallback → 用户看到英文裸串。
// 修复口径（src/lib/error-handler.ts :8-12）：msg === err.message（即键链落到传输层原文）时，
// 本地化 fallback 优先；服务端语义消息仍然最优先。
//
// 断言口径 = 最终 message.error 实参（notify 单点）：
//   ① 传输层错误 + fallback → fallback（英文原文零透出）；
//   ② 服务端 message/title/detail 在册 → 服务端消息赢过 fallback；
//   ③ 无 fallback → 保持原样（err.message / defaultMsg），不吞不造。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message } from '@/lib/antd-app';
import { handleApiError } from '../error-handler';

vi.mock('@/lib/antd-app', () => ({
	message: { error: vi.fn(), success: vi.fn() },
}));

const errorMock = message.error as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
	errorMock.mockClear();
});

/** axios 传输层错误形态：Error.message = 英文原文，无 response.data。 */
function transportError(msg: string): Error {
	return new Error(msg);
}

/** 服务端信封错误形态：response.data 携带 Problem 契约字段。 */
function serverError(data: Record<string, unknown>, transportMsg = 'Request failed with status code 400'): Error {
	const err = new Error(transportMsg) as Error & { response?: unknown };
	err.response = { status: 400, data };
	return err;
}

describe('handleApiError 本地化 fallback 优先级（A-200④）', () => {
	it('传输层英文原文 + 中文 fallback → 通知中文 fallback（英文零透出）', () => {
		handleApiError(transportError('Request failed with status code 404'), '加载失败');
		expect(errorMock).toHaveBeenCalledTimes(1);
		expect(errorMock).toHaveBeenCalledWith('加载失败');
	});

	it('传输层错误 + 无 fallback → 原样通知 err.message（保持既有行为）', () => {
		handleApiError(transportError('Request failed with status code 500'));
		expect(errorMock).toHaveBeenCalledWith('Request failed with status code 500');
	});

	it('服务端 data.message 在册 → 服务端语义消息赢过 fallback', () => {
		handleApiError(serverError({ code: 40000502, message: '账号已被锁定' }), '登录失败');
		expect(errorMock).toHaveBeenCalledWith('账号已被锁定');
	});

	it('服务端 data.title 在册（Problem 契约无 message）→ title 赢过 fallback 与英文原文', () => {
		handleApiError(serverError({ title: '权限不足', detail: '缺少 audit:read 权限' }), '请求失败');
		expect(errorMock).toHaveBeenCalledWith('权限不足');
	});

	it('服务端仅 data.detail 在册 → detail 参与键链，赢过 fallback', () => {
		handleApiError(serverError({ detail: '目标记录不存在' }), '操作失败');
		expect(errorMock).toHaveBeenCalledWith('目标记录不存在');
	});

	it('空串语义按缺省处理：data.message="" → 落到 fallback（不通知空串）', () => {
		handleApiError(serverError({ message: '' }), '保存失败');
		expect(errorMock).toHaveBeenCalledWith('保存失败');
	});

	it('err.message 恰与 fallback 同文案 → 去重导向同一通知（无双重输出）', () => {
		handleApiError(transportError('加载失败'), '加载失败');
		expect(errorMock).toHaveBeenCalledTimes(1);
		expect(errorMock).toHaveBeenCalledWith('加载失败');
	});
});

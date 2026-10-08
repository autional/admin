// W1e-27（fix-admin-b5-polish / A-225）：合规审计页三处本地化回归锁。
//
//   A-225①：tab 标题恒 "Autional 管理控制台"（无 usePageTitle）→ 挂载 '合规审计 — Autional'；
//   A-225②：Modal 关闭按钮 a11y 名恒 "Close"（antd 默认）→ 中文「关闭」；
//   A-225③：时间列 tsRender 无 locale 参数（两联卡片渲染随进程 locale 而非当前语言）→
//            调用点统一传 i18n.language（页面 tsRender 单一分流点，见 page.tsx :631-635）。
//
// 断言口径 = 渲染输出：title / 关闭按钮可访问名 / createdAt 本地化串；旧形态零命中。
// 会话未播种也走通（GET 无 token 预判刷新路径；与 reports-unwrap-contract 同法）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { apiClient } from '@autional/shared';
import AuditCompliancePage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const PIAS_URL = '/audit/api/v1/admin/audit/compliance/pias';
const TS = '2026-10-04T00:00:00Z';
const CREATED_AT = '2026-01-15T10:00:00Z';

interface Captured {
	url: string;
	method: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

/** PIA 列表 wire（snake 键 = 后端真形状；created_at 为 RFC3339 串）。 */
function piasEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: [
			{
				id: 'pia-1',
				name: '隐私影响评估 #1',
				data_types: '["email"]',
				purpose: '营销分析',
				risk_level: 'high',
				created_at: CREATED_AT,
			},
		],
		timestamp: TS,
	};
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({ url, method: String(config.method || 'get').toLowerCase() });
		if (url === PIAS_URL) return ok(piasEnvelope(), config);
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

describe('合规审计页本地化（A-225）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('A-225①③：document.title=合规审计；PIA 行 createdAt 按 zh-CN 本地化（wire 串零命中）', async () => {
		render(<AuditCompliancePage />);

		await waitFor(() => expect(document.title).toBe('合规审计 — Autional'));
		// 行数据上屏（穿真实拦截器：snake wire → camel 渲染）
		expect(await screen.findByText('隐私影响评估 #1')).toBeInTheDocument();
		expect(captured.filter((c) => c.url === PIAS_URL)).toHaveLength(1);

		// tsRender 本地化：期望值同进程计算（时区无关）；旧形态 RFC3339 原文零命中
		expect(screen.getByText(new Date(CREATED_AT).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.queryByText(CREATED_AT)).toBeNull();
	});

	it('A-225②：创建弹窗关闭按钮 a11y 名 =「关闭」；antd 默认 Close 零命中', async () => {
		render(<AuditCompliancePage />);
		await screen.findByText('隐私影响评估 #1');

		// 按钮文案「创建」（antd 对恰好两汉字自动插空格 → 正则容忍空档）
		const createBtn = (Array.from(document.querySelectorAll('button')) as HTMLElement[]).find((b) =>
			/^创\s*建$/.test((b.textContent || '').trim()),
		);
		expect(createBtn).toBeTruthy();
		fireEvent.click(createBtn as HTMLElement);

		// Modal 关闭按钮：可访问名本地化（旧形态 = "Close"）
		const closeBtn = await screen.findByRole('button', { name: '关闭' });
		expect(closeBtn.classList.contains('ant-modal-close')).toBe(true);
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
	});
});

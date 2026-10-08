// TASK-B4-W2-03（fix-admin-b4-presentation / A-49 · RC-B4-02）：
//   AC-B4-W2-03-1：create/rotate 读 `rawKey`（wire 顶层键，信封已由响应拦截器解包）并呈一次性展示框（仅显示一次 + 复制）。
//   AC-B4-W2-03-2：rawKey 缺失时降级（原成功 toast，不崩、不伪造展示）。
//   AC-B4-W2-03-3：测试（呈现 + 缺失两分支）。
//
// 断言口径：hook 层 mock（页面行为锁定）+ 创建/轮换两入口各覆盖一分支；
// 旧缺陷已锁死：`result?.data?.key || result?.key` 恒 false → 凭据原文丢失（本测试对 rawKey 呈现为阳性断言）。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ApiKeysPage from '../page';
import { message } from '@/lib/antd-app';
import {
	useApiKeys,
	useCreateApiKey,
	useDeleteApiKey,
	useRotateApiKey,
} from '@/hooks/use-api-keys';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/use-api-keys', () => ({
	useApiKeys: vi.fn(),
	useCreateApiKey: vi.fn(),
	useDeleteApiKey: vi.fn(),
	useRotateApiKey: vi.fn(),
}));

const RECORD = {
	id: 'key-1',
	name: 'CI 发布密钥',
	scopes: ['read'],
	status: 'active',
	environment: 'live',
};

/** 一次性凭据原文（mock fixture；真实链路 = wire 顶层 rawKey 键）。 */
const RAW_KEY = 'ak-live-REVEAL_0123456789abcdef';

/** A-53：确认文案已对齐后端 24h 宽限期语义（旧文案「立即失效」矛盾）。 */
const REFRESH_CONFIRM = '轮换此密钥？当前密钥将在 24 小时宽限期后失效。';

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<ApiKeysPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** Modal/Popconfirm 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

/** 在 antd v6 Select 中按唯一 option 文案选择（触发区 = .ant-select-content）。 */
async function selectOption(selectDomId: string, optionTitle: string) {
	const input = document.querySelector(`#${selectDomId}`) as HTMLInputElement;
	fireEvent.mouseDown(input.closest('.ant-select-content')!);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${optionTitle}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

describe('api-keys 一次性凭据（A-49 / RC-B4-02）', () => {
	let rotateMutate: ReturnType<typeof vi.fn>;
	let createMutate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		rotateMutate = vi.fn();
		createMutate = vi.fn();
		// A-52：hook 现返回服务端分页形状 { items, total }（fromPageResult 契约）
		vi.mocked(useApiKeys).mockReturnValue({
			data: { items: [RECORD], total: 1 },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as unknown as ReturnType<typeof useApiKeys>);
		vi.mocked(useCreateApiKey).mockReturnValue({ mutateAsync: createMutate } as unknown as ReturnType<typeof useCreateApiKey>);
		vi.mocked(useDeleteApiKey).mockReturnValue({ mutateAsync: vi.fn() } as unknown as ReturnType<typeof useDeleteApiKey>);
		vi.mocked(useRotateApiKey).mockReturnValue({ mutateAsync: rotateMutate } as unknown as ReturnType<typeof useRotateApiKey>);
	});

	it('AC-B4-W2-03-1/3（轮换）：rawKey 呈一次性展示框（原文入框 + 「仅显示一次」警示）', { timeout: 20000 }, async () => {
		rotateMutate.mockResolvedValue({ rawKey: RAW_KEY });
		renderPage();

		// A-47/A-52：操作列按钮有显式可访问名（accessible name），且状态列本地化渲染
		expect(screen.getByRole('button', { name: '轮换' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '吊销' })).toBeInTheDocument();
		expect(screen.getByText('活跃')).toBeInTheDocument();

		fireEvent.click(await screen.findByText('轮换'));
		// 弹层确已打开（防「根本没打开」型假绿）
		expect(await screen.findByText(REFRESH_CONFIRM)).toBeInTheDocument();
		clickModalOk();

		const revealed = await screen.findByTestId('api-key-revealed');
		expect((revealed as HTMLInputElement).value).toBe(RAW_KEY);
		// 「仅显示一次」警示 + 复制按钮可见
		expect(screen.getByText(/仅显示一次/)).toBeInTheDocument();
		expect(screen.getByText('复制')).toBeInTheDocument();
		expect(rotateMutate).toHaveBeenCalledWith('key-1');
	});

	it('AC-B4-W2-03-1/3（创建）：rawKey 呈一次性展示框（表单提交 → 原文入框）', { timeout: 20000 }, async () => {
		createMutate.mockResolvedValue({ rawKey: RAW_KEY });
		renderPage();

		fireEvent.click(screen.getByText('创建 API 密钥'));
		const nameInput = await waitFor(() => {
			const el = document.querySelector('#name') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		fireEvent.change(nameInput, { target: { value: 'deploy-key' } });
		await selectOption('environment', '生产环境');
		clickModalOk();

		const revealed = await screen.findByTestId('api-key-revealed');
		expect((revealed as HTMLInputElement).value).toBe(RAW_KEY);
		expect(screen.getByText(/仅显示一次/)).toBeInTheDocument();
		expect(createMutate).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'deploy-key', environment: 'live' }),
		);
	});

	it('AC-B4-W2-03-2/3（缺失）：rawKey 缺失 → 不崩、不出现展示框、仍成功 toast（降级）', { timeout: 20000 }, async () => {
		rotateMutate.mockResolvedValue({});
		renderPage();

		fireEvent.click(await screen.findByText('轮换'));
		expect(await screen.findByText(REFRESH_CONFIRM)).toBeInTheDocument();
		clickModalOk();

		// 处理完成信号：原成功 toast 仍在（降级为原行为）
		await waitFor(() => expect(message.success).toHaveBeenCalled());
		expect(rotateMutate).toHaveBeenCalledWith('key-1');
		// 不伪造展示
		expect(screen.queryByTestId('api-key-revealed')).toBeNull();
	});
});

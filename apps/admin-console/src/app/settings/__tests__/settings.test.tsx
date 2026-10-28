// TASK-B4-W2-04（fix-admin-b4-presentation / A-437 + A-438 闭合 · RC-B4-04）：
//   AC-B4-W2-04-1：保存资料（用户名）走 `authMePut`（self 端点）；成功后本地用户态精确合并。
//   AC-B4-W2-04-2：邮箱修改为双步 modal（发起 authMeEmailChangePost + 验证码 authMeEmailVerifyPost），含取消
//                  （authMeEmailChangeCancelPost best-effort）；旧直存路径（admin updateUser）移除。
//   AC-B4-W2-04-3：头像经 profile avatar 端点保存，展示即时更新（以响应 profile.avatarUrl 精确合并）。
//   AC-B4-W2-04-4（dev）: 保存资料 200（61002205 消失）——由 G-B4-02 线上复现门实证，本文件锁前端通道。
//
// 旧缺陷已锁死：`updateUser(user.id, values)` 恒含非空 email → admin 端点 61002205 必败（本测试断言
// 用户名通道 = updateMyProfile、头像通道 = updateMyAvatar；且 store 合并无 email 盲写）。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { useAuthStore } from '@autional/shared';
import SettingsPage from '../page';
import { message } from '@/lib/antd-app';
import {
	changePassword,
	updateMyProfile,
	requestEmailChange,
	verifyEmailChange,
	cancelEmailChange,
	updateMyAvatar,
	getProfileAvatar,
} from '@/lib/api.generated';
import { PublicAuthConfigByAuthConfig } from '@autional/shared/generated/api';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api.generated', () => ({
	changePassword: vi.fn(),
	updateMyProfile: vi.fn(),
	requestEmailChange: vi.fn(),
	verifyEmailChange: vi.fn(),
	cancelEmailChange: vi.fn(),
	updateMyAvatar: vi.fn(),
	// U447：页面挂载即补读一次 self 头像端点（/auth/me 不含 avatarUrl）；不 mock 会让
	// mock 模块缺该导出 → 调用 undefined → 整个 describe 全红。
	getProfileAvatar: vi.fn(),
}));

vi.mock('@autional/shared/generated/api', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared/generated/api')>();
	return { ...actual, PublicAuthConfigByAuthConfig: vi.fn() };
});

const TENANT = 'tenant-1';
const OLD_EMAIL = 'old@example.com';
const OLD_AVATAR = 'https://cdn.example.com/a.png';

function seedUser() {
	useAuthStore.setState({
		user: {
			id: 'user-1',
			username: 'alice',
			email: OLD_EMAIL,
			avatarUrl: OLD_AVATAR,
		} as any,
		currentTenantId: TENANT,
	});
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<SettingsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('settings 自助三通道（A-437 / A-438）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		seedUser();
		vi.mocked(PublicAuthConfigByAuthConfig).mockResolvedValue({
			passwordPolicy: { passwordTransmission: 'plain' },
		} as any);
		vi.mocked(updateMyProfile).mockResolvedValue({} as any);
		vi.mocked(updateMyAvatar).mockResolvedValue({} as any);
		vi.mocked(requestEmailChange).mockResolvedValue({} as any);
		vi.mocked(verifyEmailChange).mockResolvedValue({} as any);
		vi.mocked(cancelEmailChange).mockResolvedValue({} as any);
		vi.mocked(getProfileAvatar).mockResolvedValue({} as any);
	});

	it('U447：进页面补读 self 头像端点并回填表单与认证快照（/auth/me 不含 avatarUrl）', { timeout: 20000 }, async () => {
		vi.mocked(getProfileAvatar).mockResolvedValue({
			avatarUrl: 'https://cdn.example.com/stored.png',
		} as any);
		// 模拟"换浏览器/重新登录后"：认证快照里没有头像
		useAuthStore.setState({
			user: { id: 'user-1', username: 'alice', email: OLD_EMAIL } as any,
			currentTenantId: TENANT,
		});
		renderPage();

		expect(
			await screen.findByDisplayValue('https://cdn.example.com/stored.png'),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(useAuthStore.getState().user?.avatarUrl).toBe('https://cdn.example.com/stored.png'),
		);
	});

	it('AC-B4-W2-04-1：保存用户名走 self 端点 + 精确合并（头像未变 → 不触发头像通道）', { timeout: 20000 }, async () => {
		renderPage();

		// 不用 display value 定位：改密表单的 hidden username 语义字段同样值是 alice（会二义）。
		const nameInput = await screen.findByPlaceholderText('用户名');
		fireEvent.change(nameInput, { target: { value: 'alice-new' } });
		fireEvent.click(screen.getByText('保存资料'));

		await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ username: 'alice-new' }));
		// 精确合并：username 更新；email/avatarUrl 零盲写
		expect(useAuthStore.getState().user?.username).toBe('alice-new');
		expect(useAuthStore.getState().user?.email).toBe(OLD_EMAIL);
		expect(useAuthStore.getState().user?.avatarUrl).toBe(OLD_AVATAR);
		// 头像值未变 → 头像通道零调用（不做无谓写）
		expect(updateMyAvatar).not.toHaveBeenCalled();
		expect(message.success).toHaveBeenCalled();
		expect(message.error).not.toHaveBeenCalled();
	});

	it('AC-B4-W2-04-3：头像经 profile 端点保存，以响应 profile.avatarUrl 精确合并（非提交值）', { timeout: 20000 }, async () => {
		vi.mocked(updateMyAvatar).mockResolvedValue({
			profile: { avatarUrl: 'https://cdn.example.com/from-response.png' },
		} as any);
		renderPage();

		const avatarInput = await screen.findByDisplayValue(OLD_AVATAR);
		fireEvent.change(avatarInput, { target: { value: 'https://cdn.example.com/new.png' } });
		fireEvent.click(screen.getByText('保存资料'));

		await waitFor(() =>
			expect(updateMyAvatar).toHaveBeenCalledWith({
				avatarUrl: 'https://cdn.example.com/new.png',
			}),
		);
		// 展示即时更新 = 响应值（响应缺失才降级为提交值）
		await waitFor(() =>
			expect(useAuthStore.getState().user?.avatarUrl).toBe(
				'https://cdn.example.com/from-response.png',
			),
		);
	});

	it('AC-B4-W2-04-2：邮箱双步 modal（发起 → 验证码）→ 本地邮箱精确合并', { timeout: 20000 }, async () => {
		vi.mocked(requestEmailChange).mockResolvedValue({ maskedTo: 'n***@example.com' } as any);
		renderPage();

		// 只读展示：旧邮箱文本 + 「修改邮箱」入口（无 email 输入框）
		const emailDisplay = await screen.findByTestId('settings-email-display');
		expect(emailDisplay.textContent).toBe(OLD_EMAIL);
		expect(document.querySelector('#email')).toBeNull();

		fireEvent.click(screen.getByText('修改邮箱'));

		// 第一步：新邮箱 + 当前密码（按租户模式处理：plain → 原样）
		const newEmailInput = await waitFor(() => {
			const el = document.querySelector('#newEmail') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		fireEvent.change(newEmailInput, { target: { value: 'new@example.com' } });
		fireEvent.change(document.querySelector('#password')!, { target: { value: 'secret-123' } });
		fireEvent.click(screen.getByText('发送验证码'));

		await waitFor(() =>
			expect(requestEmailChange).toHaveBeenCalledWith({
				newEmail: 'new@example.com',
				password: 'secret-123',
			}),
		);
		expect(PublicAuthConfigByAuthConfig).toHaveBeenCalledWith(TENANT);

		// 第二步：验证码到位（hint 用响应 maskedTo）
		expect(await screen.findByText(/n\*\*\*@example\.com/)).toBeInTheDocument();
		fireEvent.change(document.querySelector('#code')!, { target: { value: '123456' } });
		fireEvent.click(screen.getByText('验证并修改'));

		await waitFor(() => expect(verifyEmailChange).toHaveBeenCalledWith({ code: '123456' }));
		// 精确合并：只并 email（verify 端点无 data → 用发起时登记的新邮箱）
		await waitFor(() => expect(useAuthStore.getState().user?.email).toBe('new@example.com'));
		expect(useAuthStore.getState().user?.username).toBe('alice');
		expect(message.success).toHaveBeenCalled();
	});

	it('AC-B4-W2-04-2：第二步取消 → best-effort 取消 pending，不触达验证', { timeout: 20000 }, async () => {
		renderPage();

		fireEvent.click(await screen.findByText('修改邮箱'));
		const newEmailInput = await waitFor(() => {
			const el = document.querySelector('#newEmail') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		fireEvent.change(newEmailInput, { target: { value: 'new@example.com' } });
		fireEvent.change(document.querySelector('#password')!, { target: { value: 'secret-123' } });
		fireEvent.click(screen.getByText('发送验证码'));
		await waitFor(() => expect(requestEmailChange).toHaveBeenCalled());

		// 第二步点取消（弹窗确已进入 verify 步）
		expect(await screen.findByText(/请输入邮件中的验证码/)).toBeInTheDocument();
		// antd Button 对双中文字符自动插空格（「取 消」）——正则匹配两种形态
		fireEvent.click(screen.getByText(/^取\s*消$/));

		await waitFor(() => expect(cancelEmailChange).toHaveBeenCalledTimes(1));
		expect(verifyEmailChange).not.toHaveBeenCalled();
		// 本地邮箱不变
		expect(useAuthStore.getState().user?.email).toBe(OLD_EMAIL);
	});

	it('AC-B4-W2-04-2：第一步取消失效 → 未发起 pending 时零取消调用', { timeout: 20000 }, async () => {
		renderPage();

		fireEvent.click(await screen.findByText('修改邮箱'));
		await waitFor(() => expect(document.querySelector('#newEmail')).toBeTruthy());
		fireEvent.click(screen.getByText(/^取\s*消$/));

		// jsdom 无真实 CSS 过渡：rc-motion 离场步进等不到 transitionend（antd 6.5 Modal 未设 motionDeadline），
		// 弹窗内容会滞留 DOM。补发合成 transitionend 推进离场（真实浏览器由动画自然结束触发）——
		// 终态断言仍锁「弹窗关闭 → 内容卸载」，而非降级为弱断言。
		await waitFor(() => {
			const dialog = document.querySelector('.ant-modal');
			if (dialog) fireEvent.transitionEnd(dialog);
			expect(screen.queryByText('发送验证码')).toBeNull();
		});
		expect(cancelEmailChange).not.toHaveBeenCalled();
	});

	// DevTools 密码语义回归锁（2026-10-27）：改密表单的密码输入在 <form> 内 + autocomplete
	// + form 内含 username 语义隐藏字段（Chromium 三条 VERBOSE [DOM] 警告清零的结构前提）。
	it('改密表单携带 form 语义（hidden username + autocomplete）', () => {
		const { container } = renderPage();

		const passwords = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
		expect(passwords).toHaveLength(3);
		expect(passwords[0].getAttribute('autocomplete')).toBe('current-password');
		expect(passwords[1].getAttribute('autocomplete')).toBe('new-password');
		expect(passwords[2].getAttribute('autocomplete')).toBe('new-password');

		const form = passwords[0].closest('form');
		expect(form).not.toBeNull();
		for (const password of passwords) {
			expect(password.closest('form')).toBe(form);
		}

		const username = form!.querySelector<HTMLInputElement>('input[name="username"]');
		expect(username).not.toBeNull();
		expect(username!.getAttribute('autocomplete')).toBe('username');
		expect(username!.value).toBe('alice');
	});
});

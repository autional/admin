/**
 * 模拟会话 hash 消费（platform 门户 → admin 门户的交接通道）。
 *
 * 平台模拟登录成功后以 `https://admin.<根域>/<slug>#impersonate=<token>` 打开本站。
 * 消费必须在 React 渲染前发生（App.tsx 模块顶层调用）：否则 RequireAuth 首帧把
 * 「store 尚未落模拟 token」判为未登录，整页弹去登录页。
 * hash 命中即清（replaceState）——防刷新重放，也防 token 留在地址栏/历史记录。
 */
import { apiClient, useAuthStore, decodeJwtPayload as decodeJwtPayloadShared } from '@autional/shared';
import type { User } from '@autional/shared';

// token 为 URL 未编码形态（JWT 字符集 [A-Za-z0-9._-]）
const IMPERSONATION_HASH = /^#impersonate=([A-Za-z0-9._-]+)$/;

export interface ImpersonationInfo {
	targetUserId: string;
	adminId: string;
	adminName: string;
	impId: string;
	reason: string;
	expiresAtMs: number;
}

type JwtPayload = Record<string, unknown> & { custom?: Record<string, unknown> };

function decodeJwtPayload(token?: string | null): JwtPayload | null {
	if (!token) return null;
	// single source：shared decodeJwtPayload（base64url 归一化 + 填充 + UTF-8；
	// 此前本地实现漏了填充补齐，段长 %4≠0 时 atob 抛错整链解析失败）。
	return decodeJwtPayloadShared(token) as JwtPayload | null;
}

function isImpersonationPayload(payload: JwtPayload | null): boolean {
	return payload?.custom?.is_imp === true;
}

/** 当前 token 是否为模拟 token（解析失败/无 token 一律 false）。 */
export function isImpersonationToken(token?: string | null): boolean {
	return isImpersonationPayload(decodeJwtPayload(token));
}

/** 解析模拟 token 的展示信息；非模拟 token 或解析失败返回 null。 */
export function decodeImpersonationInfo(token?: string | null): ImpersonationInfo | null {
	const payload = decodeJwtPayload(token);
	if (!payload || !isImpersonationPayload(payload)) return null;
	const custom = payload.custom ?? {};
	const exp = typeof payload.exp === 'number' ? payload.exp : 0;
	return {
		targetUserId: String(payload.user_id ?? payload.sub ?? ''),
		adminId: String(custom.impersonated_by ?? ''),
		adminName: String(custom.admin_name ?? ''),
		impId: String(custom.imp_id ?? ''),
		reason: String(custom.imp_reason ?? ''),
		expiresAtMs: exp * 1000,
	};
}

/**
 * 从 token 解析最小 user（user_id + custom 兜底字段）。
 * 终止模拟后新签的管理员 token 也只保证 user_id，展示字段交 /auth/me 补全。
 */
export function minimalUserFromToken(token: string): User | null {
	const payload = decodeJwtPayload(token);
	const userId = typeof payload?.user_id === 'string' ? payload.user_id : '';
	if (!payload || !userId) return null;
	return {
		id: userId,
		username: String(payload.custom?.username ?? ''),
		email: '',
		status: 'active',
	};
}

/**
 * 用显式 Bearer 调 /auth/me 补全 user（oauth-login.ts 先例：不依赖请求拦截器的注入时机）；
 * 失败静默——消费方按 displayName → username → email → id 链回落。
 */
export async function completeUserFromAuthMe(token: string): Promise<void> {
	try {
		const res = await apiClient.get('/identity/api/v1/auth/me', {
			// @generated-api-exempt
			headers: { Authorization: `Bearer ${token}` },
		});
		// 期间可能已终止模拟/换号：仅当仍是同一 token 会话时才补全（防旧请求覆盖新身份）
		if (useAuthStore.getState().accessToken !== token) return;
		const me = (res.data ?? null) as Partial<User> | null;
		if (!me) return;
		const current = useAuthStore.getState().user;
		useAuthStore.getState().setUser({
			...(current ?? { id: '', username: '', email: '', status: 'active' }),
			...me,
			id: (me.id as string) || current?.id || '',
		} as User);
	} catch {
		/* 静默：保留最小 user */
	}
}

/**
 * 消费 `#impersonate=<token>`：落 store（refresh 置 null —— 模拟 token 无配对 refresh，
 * 不能走 setAuth 的「token 无效即清空」口径）→ 返回是否命中。
 * 校验不过（非模拟/已过期/无 user_id）不落 store、静默返回 false（hash 已清）。
 * 幂等：hash 清除后再次调用返回 false。
 */
export function consumeImpersonationHash(): boolean {
	if (typeof window === 'undefined') return false;
	const match = IMPERSONATION_HASH.exec(window.location.hash);
	if (!match) return false;

	// 命中即清 hash（在解析/落 store 之前）：防刷新重放与历史泄露
	window.history.replaceState(null, '', window.location.pathname + window.location.search);

	const token = match[1];
	const payload = decodeJwtPayload(token);
	const userId = typeof payload?.user_id === 'string' ? payload.user_id : '';
	const expired = typeof payload?.exp !== 'number' || payload.exp * 1000 <= Date.now();
	if (!payload || !isImpersonationPayload(payload) || !userId || expired) return false;

	useAuthStore.setState({
		accessToken: token,
		refreshToken: null,
		isAuthenticated: true,
		user: {
			id: userId,
			username: String(payload.custom?.username ?? ''),
			email: '',
			status: 'active',
		},
	});

	// 异步补全完整 user（不 await：消费发生在 React 渲染前，不能被网络阻塞）
	void completeUserFromAuthMe(token);

	return true;
}

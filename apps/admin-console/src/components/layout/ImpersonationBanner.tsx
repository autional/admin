'use client';

import { useState } from 'react';
import { Button } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@autional/shared';
import { authMeStopImpersonationPost } from '@autional/shared/generated/api';
import { Alert } from '@autional/ui';
import { message } from '@/lib/antd-app';
import {
	completeUserFromAuthMe,
	decodeImpersonationInfo,
	isImpersonationToken,
	minimalUserFromToken,
} from '@/lib/impersonation-handoff';

/**
 * 模拟身份通栏横幅：store 里是模拟 token 时全局可见（挂在 AppShell 之上，
 * 403/404 等全部租户段路由都在 LayoutWrapper 内）。
 * 终止后服务端反签管理员 token 对，横幅随新 token 非模拟态自然消失。
 */
export function ImpersonationBanner() {
	const accessToken = useAuthStore((s) => s.accessToken);
	const user = useAuthStore((s) => s.user);
	const queryClient = useQueryClient();
	const [stopping, setStopping] = useState(false);

	if (!isImpersonationToken(accessToken)) return null;
	const info = decodeImpersonationInfo(accessToken);
	if (!info) return null;

	const targetLabel =
		user?.displayName || user?.username || user?.email || user?.id || info.targetUserId;
	const adminLabel = info.adminName || info.adminId;
	const expiryLabel = info.expiresAtMs > 0 ? new Date(info.expiresAtMs).toLocaleString() : '';

	const handleStop = async () => {
		if (stopping) return;
		setStopping(true);
		try {
			const res = (await authMeStopImpersonationPost()) as {
				accessToken?: string;
				refreshToken?: string;
			} | null;
			const newToken = res?.accessToken;
			const minimalUser = newToken ? minimalUserFromToken(newToken) : null;
			if (!newToken || !minimalUser) throw new Error('stop-impersonation returned no usable token');

			useAuthStore.getState().setAuth(newToken, res?.refreshToken ?? '', minimalUser);
			// 清掉模拟期间积累的查询缓存，别把模拟身份的数据串进管理员会话
			queryClient.clear();
			message.success('已退出模拟');
			void completeUserFromAuthMe(newToken);
		} catch {
			// 失败保持模拟态不清 store，管理员可重试
			message.error('终止模拟失败，请重试');
		} finally {
			setStopping(false);
		}
	};

	return (
		// 通栏容器：与 AppShell 背景同令牌，避免横幅上方出现断层
		<div className="shrink-0 bg-[var(--color-bg-muted)] px-4 pt-3 lg:px-8">
			<Alert
				variant="warning"
				title="正在以模拟身份操作"
				action={
					<Button danger loading={stopping} onClick={handleStop}>
						终止模拟
					</Button>
				}
			>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
					<span>目标用户：{targetLabel}</span>
					<span>发起人：{adminLabel}</span>
					{info.reason ? <span>原因：{info.reason}</span> : null}
					{expiryLabel ? <span>到期时间：{expiryLabel}</span> : null}
				</div>
			</Alert>
		</div>
	);
}

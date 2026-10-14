// W1b · NHI 族状态词表单源（A-77/A-85/A-92）：agent / robot / device 状态 → StatusBadge variant
// 的唯一映射点。列表页与详情页一律经此取 variant，禁止各自再抄一份表（防再生漂移）。
//
// 真源 = service-identity 领域枚举（执行期实读）：
//   agent  internal/agent/domain/agent.go:17-24    provisioning / active / rotating / revoked / deleted
//   robot  internal/robot/domain/robot.go:23-28    commissioning / active / degraded / decommissioned / deleted
//   device internal/device/domain/device.go:22-28  unpaired / active / transferring
//          （revoked / deleted 枚举声明零写入——删除走硬删 device_repository.Delete，A-88 已核实）
//
// i18n 标签侧同源口径：`agents.status.*` / `robots.status.*` / `devices.status.*` 键集
// 与下列映射逐一对应（src/lib/__tests__/nhi.test.ts 双向断言，防再生）。

import { getHttpStatus, semanticsOfError } from '@/lib/error-semantics';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** agent 生命周期（provisioning/active/rotating/revoked/deleted）。 */
export const AGENT_STATUS_VARIANT: Record<string, StatusVariant> = {
	provisioning: 'info',
	active: 'success',
	rotating: 'warning',
	revoked: 'danger',
	deleted: 'neutral',
};

/** robot 生命周期（commissioning/active/degraded/decommissioned/deleted）。 */
export const ROBOT_STATUS_VARIANT: Record<string, StatusVariant> = {
	commissioning: 'info',
	active: 'success',
	degraded: 'warning',
	decommissioned: 'neutral',
	deleted: 'neutral',
};

/** device 生命周期（unpaired/active/transferring——实际可写入全量）。 */
export const DEVICE_STATUS_VARIANT: Record<string, StatusVariant> = {
	unpaired: 'info',
	active: 'success',
	transferring: 'warning',
};

export function statusVariantOf(
	map: Record<string, StatusVariant>,
	status?: string | null,
): StatusVariant {
	return (status && map[status]) || 'neutral';
}

/** 404 判定（identity 错误信封 61001641 error.nhi_*.not_found → axios response.status）。
 *
 * 注：`retryUnlessNotFound` 局部谓词已删除 —— 重试策略收敛到 QueryClient 默认
 * （main.tsx：`isRetryableError` → 4xx 含 404/403 一律不重试），不再需要页面级谓词。 */
export function isNotFoundError(err: unknown): boolean {
	// 单一真源：@/lib/error-semantics（业务码 → class='not_found'；无业务码 → 裸 404）。
	return semanticsOfError(err)?.class === 'not_found' || getHttpStatus(err) === 404;
}

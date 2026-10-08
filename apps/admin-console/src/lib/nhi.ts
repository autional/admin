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

/** 404 判定（identity 错误信封 61001641 error.nhi_*.not_found → axios response.status）。 */
export function isNotFoundError(err: unknown): boolean {
	const e = err as { response?: { status?: number }; status?: number } | undefined;
	return (e?.response?.status ?? e?.status) === 404;
}

/** 详情查询 retry 谓词：404 不重试（消 2 条 console 404 噪声，A-86/A-93），其余沿用全局 retry:1。
 *  参数类型必须为 Error（react-query v5 由 retry 签名反向推断 TError；unknown 会使 error 变量变 unknown）。 */
export function retryUnlessNotFound(failureCount: number, error: Error): boolean {
	return !isNotFoundError(error) && failureCount < 1;
}

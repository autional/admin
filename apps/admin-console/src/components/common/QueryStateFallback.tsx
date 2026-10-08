import { PageError } from '@autional/ui/antd';
import { classifyQueryState, isRetryableError, type QueryStateInput } from '@autional/shared';
import { useTranslation } from 'react-i18next';

/**
 * 查询失败/无权限两态的薄渲染件（RC-B4-01 / ADR-B4-01）。
 *
 * 语义判定单点在 shared 的 `classifyQueryState`：本组件不做状态推理，只吃输入
 * （isLoading/error/data）出两级渲染 ——
 *   - forbidden：不接重试（403 重试必败），文案 props 化；
 *   - error：`isRetryableError` 为真且传了 onRetry 才接重试按钮；
 *   - loading/empty/ready：返回 null —— 加载态与空态由页面既有 Loader/DataTable/Empty 原位承担。
 * 视觉复用 `PageError`（Empty + 可选重试按钮，无新视觉模式）。
 */
export interface QueryStateFallbackProps extends QueryStateInput {
	/** 失败态文案（默认 i18n `common.loadError`）。 */
	errorMessage?: string;
	/** 无权限态文案（默认 i18n `common.forbidden`）。 */
	forbiddenMessage?: string;
	/** 重试回调（refetch）；仅在 error 且错误可重试时渲染按钮。 */
	onRetry?: () => void;
	className?: string;
}

export function QueryStateFallback({
	isLoading,
	error,
	data,
	errorMessage,
	forbiddenMessage,
	onRetry,
	className,
}: QueryStateFallbackProps) {
	const { t } = useTranslation();
	const state = classifyQueryState({ isLoading, error, data });
	if (state === 'forbidden') {
		return (
			<PageError
				message={forbiddenMessage ?? t('common.forbidden')}
				className={className}
			/>
		);
	}
	if (state === 'error') {
		return (
			<PageError
				message={errorMessage ?? t('common.loadError')}
				retry={onRetry && isRetryableError(error) ? onRetry : undefined}
				className={className}
			/>
		);
	}
	return null;
}

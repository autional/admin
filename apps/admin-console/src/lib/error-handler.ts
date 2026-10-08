import { message } from '@/lib/antd-app';
import { extractApiErrorMessage } from '@autional/shared';

const notify = (msg: string) => message.error(msg);

export function handleApiError(err: unknown, fallback?: string): void {
	const msg = extractApiErrorMessage(err, fallback || 'Operation failed');
	// A-200（W1e）：服务端语义消息（message/title/detail）缺席时，本地化 fallback 优先于 axios 传输层英文原文
	const raw = (err as { message?: string } | null)?.message;
	if (fallback && msg === raw) {
		notify(fallback);
		return;
	}
	notify(msg);
}

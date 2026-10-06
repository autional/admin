import type { ComponentProps } from 'react';
import { ErrorBoundary } from '@autional/ui';

// 只留 devMode —— 三段文案交给设计系统的内置字典（按 <html lang> 选语言）。
// 原先这里写死「出现错误 / 发生意外错误，请重试。/ 重试」，与字典的中文是三处不同的措辞：
// 同一个错误组件在四个门户各说各的，正是 §2.1 记的那类漂移（ui 仓库 KI-013）。
// devMode 仍留在站点侧：它读的是 import.meta.env.DEV，那是构建器的开关，设计系统无从得知。
export const DEFAULT_ERROR_BOUNDARY: Omit<ComponentProps<typeof ErrorBoundary>, 'children'> = {
	devMode: import.meta.env.DEV,
};

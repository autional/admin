// 三个控制台的 antd 接线 —— 这份文件在 admin / security / platform 三站之间**逐字节相同**。
// 由 ui 仓 check-consistency 的 C1 守着：站点侧不许再自己拿 ConfigProvider，antd 主题只能由
// @autional/ui/antd 的 AntdThemeProvider 下发（它统一读设计系统令牌、中英 locale、暗色算法，
// 以及组件级 token）。此前三站各写一份，且三份都只传 token、不传 components —— Table 的表头底色
// 因此从来没有跟随过令牌（KI-011：令牌改了传导不到，各控制台各自漂移）。
//
// 这里剩下的只有一件事：**应用自己的命令式 API 外观**。
// antd v6 移除了 message.* / Modal.confirm() 这类静态方法，必须从 App.useApp() 取；
// 而调用点有 96 处（admin 69 / security 12 / platform 15）写的是 `import { message } from ...`，
// 所以保留 export let + 在 Provider 内部赋值这种活绑定。它是站点级全局，不是设计系统该管的东西，
// 所以留在站点侧；但必须挂在 DS 的 Provider 之内，否则拿不到 App 上下文。
// 后续方向（设计文档 D11）：把 96 处调用点迁到命名空间 API，届时本文件可以整个删掉。
import { useEffect } from 'react';
import { AntdThemeProvider, useAntdApp } from '@autional/ui/antd';
import type { AntdAppApi, MessageInstance, NotificationInstance } from '@autional/ui/antd';

export let message: MessageInstance;
export let modal: AntdAppApi['modal'];
export let notification: NotificationInstance;

function StaticsBridge() {
	const app = useAntdApp();
	useEffect(() => {
		message = app.message;
		modal = app.modal;
		notification = app.notification;
	}, [app]);
	return null;
}

export function AntdAppProvider({ children }: { children: React.ReactNode }) {
	return (
		<AntdThemeProvider>
			<StaticsBridge />
			{children}
		</AntdThemeProvider>
	);
}

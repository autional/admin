'use client';

import React from 'react';
import { Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import { AppPageHeader } from '@autional/ui';

export default function TracesPage() {
	const { t } = useTranslation();

	// A-71：假搜索框/刷新按钮已移除（旧实现点击仅弹 toast、零请求 = 假可供性）。
	// A-70（BFF 补挂 developer/traces 四路由）未落地前不再提供假交互，仅保留明确降级说明。
	return (
		<div>
			<AppPageHeader title={t('traces.title')} />

			<Empty
				description={t('traces.unavailable', 'Tracing endpoint not configured for this portal')}
			/>
		</div>
	);
}

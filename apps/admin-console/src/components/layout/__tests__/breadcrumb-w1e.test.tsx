// W1e-34（fix-admin-b5-polish / A-275）：面包屑 /compliance/legal-documents 真实标签回归锁。
//
// 缺陷形态：映射表缺 '/compliance/legal-documents'（15 字符段）→ 共享启发式（looksLikeId = 长度>8
// 的字母数字串）把它渲染成「详情」，面包屑恒显「仪表盘 / 合规中心 / 详情」。
// 修复口径（src/components/layout/Breadcrumb.tsx :78-79）：补 t('breadcrumb.legalDocuments') = 条款文档。
//
// 断言口径 = 渲染结果：命中真实标签「条款文档」；旧形态「详情」零命中；中间段「合规中心」仍在册。

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Breadcrumb } from '../Breadcrumb';

describe('面包屑 legal-documents 真实标签（A-275）', () => {
	it('pathname=/compliance/legal-documents → 末级「条款文档」，旧启发式「详情」零命中', () => {
		render(
			<MemoryRouter initialEntries={['/compliance/legal-documents']}>
				<Breadcrumb />
			</MemoryRouter>,
		);
		// 末级真实标签在册
		expect(screen.getByText('条款文档')).toBeTruthy();
		// 中间段（/compliance 映射）仍在册且为可点链接
		expect(screen.getByText('合规中心')).toBeTruthy();
		// 旧缺陷形态零命中
		expect(screen.queryByText('详情')).toBeNull();
	});

	it('对照：同前缀下 /compliance/minors 亦为真实标签（旧启发式零命中）', () => {
		render(
			<MemoryRouter initialEntries={['/compliance/minors']}>
				<Breadcrumb />
			</MemoryRouter>,
		);
		expect(screen.getByText('未成年人保护')).toBeTruthy();
		expect(screen.queryByText('详情')).toBeNull();
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const logout = vi.fn();

vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return {
		...actual,
		useLogout: () => logout,
		useTenantSlug: () => 'demo',
	};
});

import ForbiddenPage from '../page';

function renderPage() {
	return render(
		<MemoryRouter initialEntries={['/demo/403']}>
			<ForbiddenPage />
		</MemoryRouter>,
	);
}

describe('admin 403 page', () => {
	beforeEach(() => {
		logout.mockClear();
	});

	it('主按钮切换账号（不再只有返回首页）', () => {
		renderPage();
		fireEvent.click(screen.getByRole('button', { name: '切换账号' }));
		expect(logout).toHaveBeenCalledTimes(1);
	});

	it('保留返回首页为次按钮', () => {
		renderPage();
		expect(screen.getByRole('button', { name: '返回首页' })).toBeInTheDocument();
	});
});

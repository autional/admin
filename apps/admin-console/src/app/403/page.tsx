'use client';

import React from 'react';
import { Button } from 'antd';
import { Result } from '@autional/ui';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';

export default function ForbiddenPage() {
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const { t } = useTranslation();

	return (
		<Result
			variant="warning"
			className="mx-auto max-w-md"
			title={<span className="text-4xl font-bold">403</span>}
			description={t('403.subtitle')}
			action={
				<Button type="primary" onClick={() => navigate(buildNavHref('/', tenantSlug))}>
					{t('403.backHome')}
				</Button>
			}
		/>
	);
}

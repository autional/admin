import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { Result } from '@autional/ui';
import { useNavigate } from 'react-router';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';

export default function NotFoundPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	return (
		<Result
			variant="info"
			className="mx-auto max-w-md"
			title={<span className="text-4xl font-bold">404</span>}
			description={t('notFound.description')}
			action={
				<Button type="primary" onClick={() => navigate(buildNavHref('/', tenantSlug))}>
					{t('notFound.back')}
				</Button>
			}
		/>
	);
}

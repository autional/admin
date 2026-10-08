'use client';

import React from 'react';
import { Card, Button, Typography, List } from 'antd';
import { Book, Link2, Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppPageHeader } from '@autional/ui';
import { DOCS_BASE } from '@/lib/docs';

const { Title, Paragraph } = Typography;

const docs = [
	{
		title: 'apiDocs.restApi',
		desc: 'apiDocs.restDesc',
		icon: <Plug size="1em" />,
		url: DOCS_BASE + '/api',
	},
	{
		title: 'apiDocs.sdkGuide',
		desc: 'apiDocs.sdkDesc',
		icon: <Book size="1em" />,
		url: DOCS_BASE + '/sdk',
	},
	{
		title: 'apiDocs.oauth',
		desc: 'apiDocs.oauthDesc',
		icon: <Link2 size="1em" />,
		url: DOCS_BASE + '/auth-concepts',
	},
];

export default function ApiDocsPage() {
	const { t } = useTranslation();

	return (
		<div>
			<AppPageHeader title={t('apiDocs.title')} description={t('apiDocs.description')} />

			<Card>
				<List
					itemLayout="horizontal"
					dataSource={docs}
					renderItem={(item) => (
						<List.Item
							actions={[
								<Button
									type="link"
									icon={<Link2 size="1em" />}
									href={item.url}
									target="_blank"
									key="open"
								>
									{t('apiDocs.open')}
								</Button>,
							]}
						>
							<List.Item.Meta avatar={item.icon} title={t(item.title)} description={t(item.desc)} />
						</List.Item>
					)}
				/>
			</Card>
		</div>
	);
}

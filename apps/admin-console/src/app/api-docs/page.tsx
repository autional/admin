'use client';

import React from 'react';
import { Card, Button, Typography, List } from 'antd';
import { LinkOutlined, BookOutlined, ApiOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ConsolePageHeader } from '@autional/ui';

const { Title, Paragraph } = Typography;

const docs = [
	{
		title: 'apiDocs.restApi',
		desc: 'apiDocs.restDesc',
		icon: <ApiOutlined />,
		url: (import.meta.env.VITE_DOCS_URL || 'https://docs.autional.com') + '/api',
	},
	{
		title: 'apiDocs.sdkGuide',
		desc: 'apiDocs.sdkDesc',
		icon: <BookOutlined />,
		url: (import.meta.env.VITE_DOCS_URL || 'https://docs.autional.com') + '/sdks',
	},
	{
		title: 'apiDocs.oauth',
		desc: 'apiDocs.oauthDesc',
		icon: <LinkOutlined />,
		url: (import.meta.env.VITE_DOCS_URL || 'https://docs.autional.com') + '/oauth',
	},
];

export default function ApiDocsPage() {
	const { t } = useTranslation();

	return (
		<div>
			<ConsolePageHeader title={t('apiDocs.title')} description={t('apiDocs.description')} />

			<Card>
				<List
					itemLayout="horizontal"
					dataSource={docs}
					renderItem={(item) => (
						<List.Item
							actions={[
								<Button
									type="link"
									icon={<LinkOutlined />}
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

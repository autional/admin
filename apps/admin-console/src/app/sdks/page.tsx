'use client';

import React from 'react';
import { Card, Row, Col, Button, Typography, List } from 'antd';
import { DownloadOutlined, BookOutlined, CodeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ConsolePageHeader } from '@autional/ui';

const { Title, Paragraph, Text } = Typography;

const sdks = [
	{ name: 'Go SDK', lang: 'go', desc: 'sdk.go.desc', link: '#' },
	{ name: 'Python SDK', lang: 'python', desc: 'sdk.python.desc', link: '#' },
	{ name: 'Node.js SDK', lang: 'node', desc: 'sdk.node.desc', link: '#' },
	{ name: 'Java SDK', lang: 'java', desc: 'sdk.java.desc', link: '#' },
	{ name: '.NET SDK', lang: 'dotnet', desc: 'sdk.dotnet.desc', link: '#' },
];

export default function SdkPage() {
	const { t } = useTranslation();

	return (
		<div>
			<ConsolePageHeader title={t('sdks.title')} description={t('sdks.description')} />

			<Row gutter={[16, 16]}>
				{sdks.map((sdk) => (
					<Col xs={24} sm={12} lg={8} key={sdk.lang}>
						<Card
							hoverable
							actions={[
								<Button type="link" icon={<DownloadOutlined />} key="download">
									{t('sdks.download')}
								</Button>,
								<Button type="link" icon={<BookOutlined />} key="docs">
									{t('sdks.docs')}
								</Button>,
							]}
						>
							<Card.Meta
								avatar={<CodeOutlined style={{ fontSize: 24, color: 'var(--color-info)' }} />}
								title={sdk.name}
								description={t(sdk.desc)}
							/>
						</Card>
					</Col>
				))}
			</Row>
		</div>
	);
}

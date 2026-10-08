'use client';

import React from 'react';
import { Card, Row, Col, Button, Typography } from 'antd';
import { Book, Code, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTenantSlug } from '@autional/shared';
import { AppPageHeader } from '@autional/ui';
import { buildNavHref } from '@/lib/nav';
import { DOCS_BASE } from '@/lib/docs';

const { Text } = Typography;

/**
 * SDK 卡清单（A-60）。install 仅在文档站有实证安装命令时填写
 * （sites/docs/src/pages/sdk.astro：npm 系包给出 `npm install` 命令）。
 */
const sdks = [
	{ name: 'Go SDK', lang: 'go', desc: 'sdk.go.desc', install: null },
	{ name: 'Python SDK', lang: 'python', desc: 'sdk.python.desc', install: null },
	{ name: 'Node.js SDK', lang: 'node', desc: 'sdk.node.desc', install: 'npm install @autional/node' },
	{ name: 'Java SDK', lang: 'java', desc: 'sdk.java.desc', install: null },
	{ name: '.NET SDK', lang: 'dotnet', desc: 'sdk.dotnet.desc', install: null },
];

export default function SdkPage() {
	const { t } = useTranslation();
	const tenantSlug = useTenantSlug();

	return (
		<div>
			<AppPageHeader title={t('sdks.title')} description={t('sdks.description')} />

			<div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
				<Text type="secondary">{t('sdks.apiVersion')}</Text>
				<Typography.Link href={`${DOCS_BASE}/sdk`} target="_blank" rel="noreferrer">
					{t('sdks.viewSdkDocs')}
				</Typography.Link>
				<Typography.Link href={buildNavHref('/api-docs', tenantSlug)}>
					{t('sdks.viewApiDocs')}
				</Typography.Link>
			</div>

			<Row gutter={[16, 16]}>
				{sdks.map((sdk) => (
					<Col xs={24} sm={12} lg={8} key={sdk.lang}>
						<Card
							hoverable
							actions={[
								<Button type="link" icon={<Download size="1em" />} key="download">
									{t('sdks.download')}
								</Button>,
								<Button type="link" icon={<Book size="1em" />} key="docs">
									{t('sdks.docs')}
								</Button>,
							]}
						>
							<Card.Meta
								avatar={<Code size={24} style={{ color: 'var(--color-info)' }} />}
								title={sdk.name}
								description={
									<div>
										<div>{t(sdk.desc)}</div>
										{sdk.install && (
											<pre className="mt-2 rounded-xs bg-neutral-100 px-2 py-1 text-xs overflow-x-auto">
												{sdk.install}
											</pre>
										)}
									</div>
								}
							/>
						</Card>
					</Col>
				))}
			</Row>
		</div>
	);
}

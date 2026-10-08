'use client';

import React from 'react';
import { Card, Button, Typography, List, Tag, Space } from 'antd';
import { Download, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppPageHeader } from '@autional/ui';

const { Title, Paragraph } = Typography;

export default function NhiSdkPage() {
	const { t } = useTranslation();

	return (
		<div>
			<div className="mb-6">
				<div className="flex items-center gap-2">
					<ShieldCheck size={24} style={{ color: 'var(--color-success)' }} />
					<AppPageHeader title={t('sdks.nhiTitle')} />
				</div>
				<Paragraph className="mt-2 text-neutral-600">{t('sdks.nhiDescription')}</Paragraph>
			</div>

			<Card>
				<List
					itemLayout="horizontal"
					dataSource={[
						{ name: 'NHI Go SDK', desc: 'sdks.nhiGoDesc', tag: 'Go' },
						{ name: 'NHI Python SDK', desc: 'sdks.nhiPythonDesc', tag: 'Python' },
					]}
					renderItem={(item) => (
						<List.Item
							actions={[
								<Button type="primary" icon={<Download size="1em" />} key="download">
									{t('sdks.download')}
								</Button>,
							]}
						>
							<List.Item.Meta
								title={item.name}
								description={
									<Space>
										<span>{t(item.desc)}</span>
										<Tag color="blue">{item.tag}</Tag>
									</Space>
								}
							/>
						</List.Item>
					)}
				/>
			</Card>
		</div>
	);
}

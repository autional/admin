'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, Row, Col, Spin, Tag } from 'antd';
import { message } from '@/lib/antd-app';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import {
	useDataClassification,
	useUpdateDataClassification,
} from '@/hooks/use-data-classification';

import { usePageTitle, useCurrentTenantIdOr } from '@autional/shared';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

interface ClassificationLevel {
	key: string;
	labelKey: string;
	color: string;
}

const LEVELS: ClassificationLevel[] = [
	{ key: 'public', labelKey: 'dataClassification.level.public', color: 'green' },
	{ key: 'internal', labelKey: 'dataClassification.level.internal', color: 'blue' },
	{ key: 'confidential', labelKey: 'dataClassification.level.confidential', color: 'orange' },
	{ key: 'restricted', labelKey: 'dataClassification.level.restricted', color: 'red' },
];

interface ClassificationFormData {
	[key: string]: string;
}

export default function DataClassificationPage() {
	const { t } = useTranslation();
	usePageTitle(t('dataClassification.title'));

	const [form] = Form.useForm<ClassificationFormData>();
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data, isLoading, error, refetch } = useDataClassification(tenantId);
	const updateMut = useUpdateDataClassification(tenantId);

	React.useEffect(() => {
		if (data) {
			const values: ClassificationFormData = {};
			const raw = data as unknown as {
				classifications?: Array<{ level?: string; label?: string }>;
			};
			const list: Array<{ level?: string; label?: string }> = raw.classifications ?? [];
			const byLevel: Record<string, string> = {};
			list.forEach((item) => {
				if (item?.level) byLevel[item.level] = item.label ?? '';
			});
			LEVELS.forEach((level) => {
				values[level.key] = byLevel[level.key] || t(level.labelKey);
			});
			form.setFieldsValue(values);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data, t]);

	const handleSave = async (values: ClassificationFormData) => {
		try {
			const classifications = LEVELS.map((level) => ({
				level: level.key,
				label: values[level.key] || t(level.labelKey),
			}));
			await updateMut.mutateAsync({ classifications });
			message.success(t('dataClassification.saveSuccess'));
		} catch (err) {
			handleApiError(err, t('dataClassification.saveFailed'));
		}
	};

	return (
		<div>
			{error && (
				<PageError message={t('dataClassification.loadError')} retry={refetch} className="mb-4" />
			)}

			<ConsolePageHeader
				title={t('dataClassification.title')}
				actions={
					<>
						<Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
							{t('dataClassification.refresh')}
						</Button>
					</>
				}
			/>

			<Spin spinning={isLoading}>
				<Row gutter={[24, 24]}>
					<Col xs={24} lg={14}>
						<Card title={t('dataClassification.classificationLevels')}>
							<Form form={form} layout="vertical" onFinish={handleSave}>
								{LEVELS.map((level) => (
									<Form.Item
										key={level.key}
										name={level.key}
										label={<Tag color={level.color}>{t(level.labelKey)}</Tag>}
										initialValue={t(level.labelKey)}
									>
										<Input placeholder={`${t(level.labelKey)} classification label`} />
									</Form.Item>
								))}
								<Button
									type="primary"
									htmlType="submit"
									icon={<SaveOutlined />}
									loading={updateMut.isPending}
								>
									{t('dataClassification.saveConfig')}
								</Button>
							</Form>
						</Card>
					</Col>

					<Col xs={24} lg={10}>
						<Card title={t('dataClassification.preview')}>
							<div className="space-y-3">
								{LEVELS.map((level) => {
									const displayLabel = form.getFieldValue(level.key) || t(level.labelKey);
									return (
										<div
											key={level.key}
											className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 border rounded"
										>
											<span>{displayLabel}</span>
											<Tag color={level.color}>{t(level.labelKey)}</Tag>
										</div>
									);
								})}
							</div>
						</Card>
					</Col>
				</Row>
			</Spin>
		</div>
	);
}

'use client';

import React from 'react';
import { Form, Input, Button, Card, Row, Col, Spin, Tag, Typography } from 'antd';
import { message } from '@/lib/antd-app';
import { RefreshCw, Save } from 'lucide-react';
import {
	useDataClassification,
	useUpdateDataClassification,
} from '@/hooks/use-data-classification';
import type { ClassificationEntry } from '@/hooks/use-data-classification';

import { usePageTitle, useCurrentTenantIdOr } from '@autional/shared';
import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface ClassificationLevel {
	key: string;
	labelKey: string;
	/** 服务端未配置 color 时的本地回退色（响应 color 优先，A-124 双向读）。 */
	color: string;
}

const LEVELS: ClassificationLevel[] = [
	{ key: 'public', labelKey: 'dataClassification.level.public', color: 'green' },
	{ key: 'internal', labelKey: 'dataClassification.level.internal', color: 'blue' },
	{ key: 'confidential', labelKey: 'dataClassification.level.confidential', color: 'orange' },
	{ key: 'restricted', labelKey: 'dataClassification.level.restricted', color: 'red' },
];

interface LevelFormValue {
	label?: string;
	description?: string;
	color?: string;
}

type ClassificationFormData = Record<string, LevelFormValue>;

export default function DataClassificationPage() {
	const { t } = useTranslation();
	usePageTitle(t('dataClassification.title'));

	const [form] = Form.useForm<ClassificationFormData>();
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data, isLoading, error, refetch } = useDataClassification(tenantId);
	const updateMut = useUpdateDataClassification(tenantId);

	React.useEffect(() => {
		if (data) {
			const byLevel = new Map(data.classifications.map((c) => [c.level, c]));
			const values: ClassificationFormData = {};
			LEVELS.forEach((level) => {
				const item = byLevel.get(level.key);
				// A-124：description/color 与 label 一同回读（旧实现只读 label，保存丢弃 description/color）
				values[level.key] = {
					label: item?.label || t(level.labelKey),
					description: item?.description ?? '',
					color: item?.color ?? level.color,
				};
			});
			form.setFieldsValue(values);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data, t]);

	const handleSave = async (values: ClassificationFormData) => {
		try {
			const known = new Set(LEVELS.map((l) => l.key));
			// A-124：非 4 级存量条目原样保留（服务端 level 零枚举校验；旧实现 LEVELS.map 全量覆写
			// → 他面（demo 等）写入的定制条目保存即被静默抹除）。
			const extras: ClassificationEntry[] = (data?.classifications ?? []).filter(
				(c) => !known.has(c.level),
			);
			const classifications = [
				...LEVELS.map((level) => ({
					level: level.key,
					label: values[level.key]?.label || t(level.labelKey),
					description: values[level.key]?.description ?? '',
					color: values[level.key]?.color || level.color,
				})),
				...extras,
			];
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

			<AppPageHeader
				title={t('dataClassification.title')}
				actions={
					<>
						{/* A-125：刷新改局部 refetch（旧实现 window.location.reload() 整页重载） */}
						<Button icon={<RefreshCw size="1em" />} onClick={() => refetch()}>
							{t('dataClassification.refresh')}
						</Button>
					</>
				}
			/>

			{/* A-125：updated_at 展示（响应含该字段而旧界面零处展示） */}
			{data?.updatedAt && (
				<Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
					{t('dataClassification.updatedAt', {
						time: new Date(data.updatedAt).toLocaleString(),
					})}
				</Text>
			)}

			<Spin spinning={isLoading}>
				<Row gutter={[24, 24]}>
					<Col xs={24} lg={14}>
						<Card title={t('dataClassification.classificationLevels')}>
							<Form form={form} layout="vertical" onFinish={handleSave}>
								{LEVELS.map((level) => (
									<div key={level.key} className="mb-4">
										<Tag color={level.color} className="mb-2">
											{t(level.labelKey)}
										</Tag>
										<Form.Item
											name={[level.key, 'label']}
											label={t('dataClassification.field.label')}
											className="mb-2"
											initialValue={t(level.labelKey)}
										>
											<Input placeholder={t('dataClassification.labelPlaceholder')} />
										</Form.Item>
										<Form.Item
											name={[level.key, 'description']}
											label={t('dataClassification.field.description')}
											className="mb-2"
										>
											<Input
												placeholder={t('dataClassification.descriptionPlaceholder')}
											/>
										</Form.Item>
										<Form.Item
											name={[level.key, 'color']}
											label={t('dataClassification.field.color')}
											className="mb-0"
										>
											<Input placeholder={t('dataClassification.colorPlaceholder')} />
										</Form.Item>
									</div>
								))}
								<Button
									type="primary"
									htmlType="submit"
									icon={<Save size="1em" />}
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
									const displayLabel =
										form.getFieldValue([level.key, 'label']) || t(level.labelKey);
									const displayColor =
										form.getFieldValue([level.key, 'color']) || level.color;
									return (
										<div
											key={level.key}
											className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 border rounded-xs"
										>
											<span>{displayLabel}</span>
											<Tag color={displayColor}>{t(level.labelKey)}</Tag>
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

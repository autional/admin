'use client';

import React from 'react';
import { Card, Form, Input, Select, Button, Row, Col } from 'antd';
import { message } from '@/lib/antd-app';
import { SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useBroadcastNotification } from '@/hooks/use-notifications';
import { handleApiError } from '@/lib/error-handler';
import type { BroadcastNotificationResponse } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';

const { TextArea } = Input;
const { Option } = Select;

export default function BroadcastPage() {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const broadcastMut = useBroadcastNotification();

	const handleSubmit = async (values: any) => {
		try {
			const res = await broadcastMut.mutateAsync(values);
			const data = res as BroadcastNotificationResponse | undefined;
			message.success(
				t('notifications.broadcast.sendSuccess').replace(
					'{count}',
					String(data?.recipients ?? '-'),
				),
			);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('notifications.broadcast.sendFailed'));
		}
	};

	return (
		<div>
			<AppPageHeader title={t('notifications.broadcast.title')} />

			<Row gutter={[16, 16]}>
				<Col xs={24} lg={16}>
					<Card title={t('notifications.broadcast.composeMessage')}>
						<Form form={form} layout="vertical" onFinish={handleSubmit}>
							<Form.Item
								name="title"
								label={t('notifications.broadcast.titleLabel')}
								rules={[{ required: true, message: t('notifications.broadcast.titleRequired') }]}
							>
								<Input placeholder={t('notifications.broadcast.titlePlaceholder')} />
							</Form.Item>
							<Form.Item
								name="type"
								label={t('notifications.broadcast.typeLabel')}
								rules={[{ required: true }]}
								initialValue="system"
							>
								<Select>
									<Option value="system">{t('notifications.stats.type.system')}</Option>
									<Option value="alert">{t('notifications.stats.type.alert')}</Option>
									<Option value="reminder">{t('notifications.stats.type.reminder')}</Option>
									<Option value="promotion">{t('notifications.stats.type.promotion')}</Option>
								</Select>
							</Form.Item>
							<Form.Item
								name="content"
								label={t('notifications.broadcast.contentLabel')}
								rules={[{ required: true, message: t('notifications.broadcast.contentRequired') }]}
							>
								<TextArea rows={8} placeholder={t('notifications.broadcast.contentPlaceholder')} />
							</Form.Item>
							<Form.Item>
								<Button
									type="primary"
									htmlType="submit"
									icon={<SendOutlined />}
									loading={broadcastMut.isPending}
									size="large"
								>
									{t('notifications.broadcast.sendButton')}
								</Button>
							</Form.Item>
						</Form>
					</Card>
				</Col>
				<Col xs={24} lg={8}>
					<Card title={t('notifications.broadcast.info')} className="text-sm text-neutral-600">
						<p className="mb-2">{t('notifications.broadcast.infoText')}</p>
						<p className="mb-2">{t('notifications.broadcast.supportedTypes')}</p>
						<ul className="list-disc pl-4 space-y-1">
							<li>
								<strong>{t('notifications.stats.type.system')}</strong>：
								{t('notifications.broadcast.type.systemDesc')}
							</li>
							<li>
								<strong>{t('notifications.stats.type.alert')}</strong>：
								{t('notifications.broadcast.type.alertDesc')}
							</li>
							<li>
								<strong>{t('notifications.stats.type.reminder')}</strong>：
								{t('notifications.broadcast.type.reminderDesc')}
							</li>
							<li>
								<strong>{t('notifications.stats.type.promotion')}</strong>：
								{t('notifications.broadcast.type.promotionDesc')}
							</li>
						</ul>
					</Card>
				</Col>
			</Row>
		</div>
	);
}

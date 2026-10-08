'use client';

import React from 'react';
import { Card, Form, Input, Select, Button, Row, Col } from 'antd';
import { message, modal } from '@/lib/antd-app';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';
import { useBroadcastNotification } from '@/hooks/use-notifications';
import { handleApiError } from '@/lib/error-handler';
import type { BroadcastNotificationResponse } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';

const { TextArea } = Input;
const { Option } = Select;

export default function BroadcastPage() {
	const { t } = useTranslation();
	// A-176：页面标题（与面包屑同源；原 tab 恒默认站名）
	usePageTitle(t('notifications.broadcast.title'));
	const [form] = Form.useForm();
	const broadcastMut = useBroadcastNotification();

	// A-175：全租户不可撤回群发 —— 二次确认（含内容预览）后在 onOk 内发送（原点击即发）。
	const handleSubmit = (values: any) => {
		const content = String(values.content ?? '');
		modal.confirm({
			title: t('notifications.broadcast.confirmTitle'),
			content: (
				<div className="space-y-1">
					<div>
						<strong>{values.title}</strong>
					</div>
					<div className="text-neutral-600 text-xs">
						{t(`notifications.stats.type.${values.type}`, { defaultValue: String(values.type ?? '') })}
					</div>
					<div className="whitespace-pre-wrap break-all text-sm">
						{content.length > 120 ? `${content.slice(0, 120)}…` : content}
					</div>
					<div className="text-neutral-600 text-xs">{t('notifications.broadcast.confirmHint')}</div>
				</div>
			),
			okText: t('notifications.broadcast.sendButton'),
			onOk: async () => {
				try {
					const res = await broadcastMut.mutateAsync(values);
					const data = res as BroadcastNotificationResponse | undefined;
					// A-175：broadcastId 留在回执 toast（原随 toast 丢弃 → 事后不可追溯）
					message.success(
						t('notifications.broadcast.sendSuccess')
							.replace('{count}', String(data?.recipients ?? '-'))
							.replace('{id}', String(data?.broadcastId ?? '-')),
					);
					form.resetFields();
				} catch (err) {
					handleApiError(err, t('notifications.broadcast.sendFailed'));
				}
			},
		});
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
									{/* A-176：后端 enum 第 5 值 user（dto.go:499-501；stats 页在用同键） */}
									<Option value="user">{t('notifications.stats.type.user')}</Option>
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
									icon={<Send size="1em" />}
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
								<strong>{t('notifications.stats.type.user')}</strong>：
								{t('notifications.broadcast.type.userDesc')}
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

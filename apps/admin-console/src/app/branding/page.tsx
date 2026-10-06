'use client';

import React, { useState } from 'react';
import { useCurrentTenantIdOr } from '@autional/shared';
import { Form, Input, Button, Slider, ColorPicker, Card, Row, Col, Spin } from 'antd';
import { message } from '@/lib/antd-app';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useBranding, useUpdateBranding } from '@/hooks/use-branding';

import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

interface BrandingData {
	logoUrl?: string;
	faviconUrl?: string;
	primaryColor?: string;
	secondaryColor?: string;
	backgroundColor?: string;
	backgroundImageUrl?: string;
	borderRadius?: number;
	customCss?: string;
	loginTitle?: string;
	loginSubtitle?: string;
}

export default function BrandingPage() {
	const { t } = useTranslation();
	const [form] = Form.useForm<BrandingData>();
	const [values, setValues] = useState<BrandingData>({
		primaryColor: 'var(--color-primary-700)',
		backgroundColor: '#ffffff',
		borderRadius: 8,
		loginTitle: t('branding.defaultLoginTitle'),
		loginSubtitle: t('branding.defaultLoginSubtitle'),
	});
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data, isLoading, error, refetch } = useBranding(tenantId);
	const updateMut = useUpdateBranding();

	React.useEffect(() => {
		if (data) {
			const merged: BrandingData = { ...values, ...data };
			form.setFieldsValue(merged);
			setValues(merged);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data]);

	const handleValuesChange = (_: any, allValues: BrandingData) => {
		setValues((prev) => ({ ...prev, ...allValues }));
	};

	const handleSave = async (data: BrandingData) => {
		try {
			await updateMut.mutateAsync({ tenantId, data });
			message.success(t('branding.saveSuccess'));
		} catch (err) {
			handleApiError(err, t('branding.saveFailed'));
		}
	};

	const primary = values.primaryColor || 'var(--color-primary-700)';
	const bg = values.backgroundColor || '#ffffff';
	const radius = values.borderRadius ?? 8;

	return (
		<div>
			{error && <PageError message={t('branding.loadFailed')} retry={refetch} className="mb-4" />}

			<ConsolePageHeader
				title={t('branding.title')}
				actions={
					<>
						<Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
							{t('branding.refresh')}
						</Button>
					</>
				}
			/>

			<Spin spinning={isLoading}>
				<Row gutter={[24, 24]}>
					<Col xs={24} lg={12}>
						<Card title={t('branding.configItems')}>
							<Form
								form={form}
								layout="vertical"
								onFinish={handleSave}
								onValuesChange={handleValuesChange}
								initialValues={values}
							>
								<Form.Item name="logoUrl" label={t('branding.logoUrl')}>
									<Input placeholder="https://example.com/logo.png" />
								</Form.Item>
								<Form.Item name="faviconUrl" label={t('branding.faviconUrl')}>
									<Input placeholder="https://example.com/favicon.ico" />
								</Form.Item>
								<Form.Item name="primaryColor" label={t('branding.primaryColor')}>
									<ColorPicker showText className="w-full" />
								</Form.Item>
								<Form.Item name="secondaryColor" label={t('branding.secondaryColor')}>
									<ColorPicker showText className="w-full" />
								</Form.Item>
								<Form.Item name="backgroundColor" label={t('branding.backgroundColor')}>
									<ColorPicker showText className="w-full" />
								</Form.Item>
								<Form.Item name="backgroundImageUrl" label={t('branding.bgImageUrl')}>
									<Input placeholder="https://example.com/bg.jpg" />
								</Form.Item>
								<Form.Item name="borderRadius" label={t('branding.borderRadius')}>
									<Slider min={0} max={24} marks={{ 0: '0', 8: '8', 16: '16', 24: '24' }} />
								</Form.Item>
								<Form.Item name="loginTitle" label={t('branding.loginTitleLabel')}>
									<Input placeholder={t('branding.defaultLoginTitle')} />
								</Form.Item>
								<Form.Item name="loginSubtitle" label={t('branding.loginSubtitleLabel')}>
									<Input placeholder={t('branding.defaultLoginSubtitle')} />
								</Form.Item>
								<Form.Item name="customCss" label={t('branding.customCss')}>
									<Input.TextArea rows={4} placeholder=".login-box { ... }" />
								</Form.Item>
								<Button
									type="primary"
									htmlType="submit"
									icon={<SaveOutlined />}
									loading={updateMut.isPending}
								>
									{t('branding.saveConfig')}
								</Button>
							</Form>
						</Card>
					</Col>

					<Col xs={24} lg={12}>
						<Card title={t('branding.livePreview')} bodyStyle={{ background: bg }}>
							<div
								className="mx-auto max-w-sm p-8 shadow-lg"
								style={{
									background: '#fff',
									borderRadius: radius,
									borderTop: `4px solid ${primary}`,
								}}
							>
								{values.logoUrl ? (
									<img
										src={values.logoUrl}
										alt="logo"
										className="h-10 mx-auto mb-4 object-contain"
									/>
								) : (
									<div
										className="h-10 mx-auto mb-4 text-center font-bold"
										style={{ color: primary }}
									>
										Autional
									</div>
								)}
								<h2 className="text-center text-lg font-semibold mb-1">
									{values.loginTitle || t('branding.defaultLoginTitle')}
								</h2>
								<p className="text-center text-neutral-600 text-sm mb-6">
									{values.loginSubtitle || t('branding.defaultLoginSubtitle')}
								</p>
								<div className="space-y-4">
									<Input placeholder={t('branding.emailPlaceholder')} disabled />
									<Input.Password placeholder={t('branding.passwordPlaceholder')} disabled />
									<Button
										type="primary"
										block
										style={{ background: primary, borderColor: primary }}
									>
										{t('branding.loginBtn')}
									</Button>
								</div>
							</div>
						</Card>
					</Col>
				</Row>
			</Spin>
		</div>
	);
}

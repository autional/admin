'use client';

import React, { useState } from 'react';
import tokens from '@autional/tokens/tokens.json';
import { useCurrentTenantIdOr, usePageTitle } from '@autional/shared';
import { Form, Input, Button, Slider, ColorPicker, Card, Row, Col, Spin } from 'antd';
import { message } from '@/lib/antd-app';
import { RefreshCw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBranding, useUpdateBranding } from '@/hooks/use-branding';

import { handleApiError } from '@/lib/error-handler';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

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

// A-150：合法色值兜底与拦截——
// ① 原初值 'var(--color-primary-700)' 非法 ⇒ ColorPicker 解析失败显 #000000（实测 1s 黑蓝闪烁）；
// ② ColorPicker onChange 首参为 AggregationColor 实例（无 toJSON）⇒ 提交前统一归一为 hex 字符串。
// A-150 需要一个**合法 hex**（ColorPicker 解析不了 var()），但也不能写死一个可能是错品牌色的字面量 ——
// 从令牌包的解析值取：改令牌它自动跟着变，且不再是「硬编码设计系统已有的色」（C2）。
const DEFAULT_PRIMARY_COLOR = tokens.core.color.primary['700'];
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** ColorPicker 值（string 或 AggregationColor 实例）→ #RRGGBB；无法解析返回空串。 */
export function colorToHex(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value && typeof (value as { toHexString?: unknown }).toHexString === 'function') {
		return (value as { toHexString: () => string }).toHexString();
	}
	return '';
}

/** 非法/遗留色值（如 CSS var）→ 兜底合法色。 */
export function toLegalColor(value: unknown, fallback: string): string {
	const hex = colorToHex(value);
	return HEX_COLOR_RE.test(hex) ? hex : fallback;
}

export default function BrandingPage() {
	const { t } = useTranslation();
	// A-150：页面标题（与面包屑同源；原 tab 恒默认站名）
	usePageTitle(t('branding.title'));
	const [form] = Form.useForm<BrandingData>();
	const [values, setValues] = useState<BrandingData>({
		primaryColor: DEFAULT_PRIMARY_COLOR,
		backgroundColor: DEFAULT_BACKGROUND_COLOR,
		borderRadius: 8,
		loginTitle: t('branding.defaultLoginTitle'),
		loginSubtitle: t('branding.defaultLoginSubtitle'),
	});
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data, isLoading, error, refetch } = useBranding(tenantId);
	const updateMut = useUpdateBranding();

	// A-150：服务端数据归一后落表单/预览（三色字段保证合法 —— 防 ColorPicker 黑闪烁）
	const applyServerData = React.useCallback(
		(server: BrandingData) => {
			setValues((prev) => {
				const merged: BrandingData = {
					...prev,
					...server,
					primaryColor: toLegalColor(server.primaryColor ?? prev.primaryColor, DEFAULT_PRIMARY_COLOR),
					backgroundColor: toLegalColor(
						server.backgroundColor ?? prev.backgroundColor,
						DEFAULT_BACKGROUND_COLOR,
					),
				};
				const secondarySource = server.secondaryColor ?? prev.secondaryColor;
				if (secondarySource !== undefined) {
					const hex = colorToHex(secondarySource);
					merged.secondaryColor = HEX_COLOR_RE.test(hex) ? hex : undefined;
				}
				form.setFieldsValue(merged);
				return merged;
			});
		},
		[form],
	);

	React.useEffect(() => {
		if (data) applyServerData(data);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data]);

	const handleValuesChange = (_: any, allValues: BrandingData) => {
		setValues((prev) => ({ ...prev, ...allValues }));
	};

	// A-150：局部刷新（原 window.location.reload() 整页重载）；服务端数据立即回填表单/预览
	const handleRefresh = async () => {
		const res = await refetch();
		if (res.data) applyServerData(res.data);
	};

	const handleSave = async (data: BrandingData) => {
		try {
			// A-150：提交体色值归一（AggregationColor 实例 → hex；非法值回落兜底色）
			const payload: BrandingData = {
				...data,
				primaryColor: toLegalColor(data.primaryColor, DEFAULT_PRIMARY_COLOR),
				secondaryColor: data.secondaryColor
					? toLegalColor(data.secondaryColor, DEFAULT_PRIMARY_COLOR)
					: undefined,
				backgroundColor: toLegalColor(data.backgroundColor, DEFAULT_BACKGROUND_COLOR),
			};
			await updateMut.mutateAsync({ tenantId, data: payload });
			message.success(t('branding.saveSuccess'));
		} catch (err) {
			handleApiError(err, t('branding.saveFailed'));
		}
	};

	const primary = toLegalColor(values.primaryColor, DEFAULT_PRIMARY_COLOR);
	const bg = toLegalColor(values.backgroundColor, DEFAULT_BACKGROUND_COLOR);
	const radius = values.borderRadius ?? 8;

	// A-150：三色字段校验（ColorPicker 的 AggregationColor/任意串均先归一，非法即拦截提交）
	const colorRule = [
		{
			validator: (_: unknown, v: unknown) =>
				!v || HEX_COLOR_RE.test(colorToHex(v))
					? Promise.resolve()
					: Promise.reject(new Error(t('branding.invalidColor'))),
		},
	];

	return (
		<div>
			{error && <PageError message={t('branding.loadFailed')} retry={refetch} className="mb-4" />}

			<AppPageHeader
				title={t('branding.title')}
				actions={
					<>
						{/* A-150：局部刷新（refetch + 回填；原 window.location.reload() 整页重载） */}
						<Button icon={<RefreshCw size="1em" />} onClick={handleRefresh}>
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
								<Form.Item name="primaryColor" label={t('branding.primaryColor')} rules={colorRule}>
									<ColorPicker showText className="w-full" />
								</Form.Item>
								<Form.Item
									name="secondaryColor"
									label={t('branding.secondaryColor')}
									rules={colorRule}
								>
									<ColorPicker showText className="w-full" />
								</Form.Item>
								<Form.Item
									name="backgroundColor"
									label={t('branding.backgroundColor')}
									rules={colorRule}
								>
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
									icon={<Save size="1em" />}
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
								className="mx-auto max-w-sm p-8 shadow-card"
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

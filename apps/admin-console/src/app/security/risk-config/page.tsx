'use client';

import {
	Card,
	Form,
	InputNumber,
	Switch,
	Button,
	Space,
	Spin,
	Typography,
	Popconfirm,
} from 'antd';
import { message } from '@/lib/antd-app';
import { Save, Undo2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRiskConfig, updateRiskConfig, resetRiskConfig } from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';
// TASK-AB1-27（RC-5 契约收敛，清单外补收敛）：删本地 snake 接口 + 手写回转换（写回 snake 供表单匹配的旧法）；
// 行契约 = generated RiskConfigResponse/SignalWeights（camel 直读，拦截器深 camel 化）。
// wire 锚：service-identity/internal/handler/risk_config_handler.go:26-35（json tenant_id/elevated_threshold/
// signal_weights/...）；权重 service-identity/internal/domain/risk_config.go:31-46（json ip_unknown 等）。
import type { RiskConfigResponse, SignalWeights } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// A-105：信号名单源键表（渲染标签走 i18n riskConfig.signal.*；旧实现硬编码中文 14 条，EN 模式不翻译）
const SIGNAL_KEYS: Array<keyof SignalWeights> = [
	'ipUnknown',
	'ipBadReputation',
	'ipVpn',
	'loginFailureHigh',
	'loginFailureModerate',
	'newDeviceOrIp',
	'unknownDevice',
	'unusualLocation',
	'unusualTime',
	'newCountry',
	'velocityAnomaly',
	'credentialLeaked',
	'mfaMethodChanged',
	'sessionHijack',
];

export default function RiskConfigPage() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [form] = Form.useForm();

	const { data: config, isLoading } = useQuery({
		queryKey: queryKeys.security.riskConfig,
		queryFn: async () => {
			const res = await getRiskConfig();
			// 拦截器已解包 + 深 camel 化（elevatedThreshold 等），契约键 camel 直读。
			return res as RiskConfigResponse;
		},
	});

	const { mutateAsync: save, isPending: isSaving } = useMutation({
		mutationFn: updateRiskConfig,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.security.riskConfig });
			message.success(t('riskConfig.saveSuccess'));
		},
	});

	const { mutateAsync: reset, isPending: isResetting } = useMutation({
		mutationFn: resetRiskConfig,
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.security.riskConfig, data as RiskConfigResponse);
			// A-104：重置后表单回显 —— AntD initialValues 挂载后不响应数据变更，旧实现仅 setQueryData
			// → 表单停留旧值，随即点「保存配置」把旧值打回、重置被静默撤销。reset 响应即完整配置，直接回填。
			form.setFieldsValue(data as RiskConfigResponse);
			message.success(t('riskConfig.resetSuccess'));
		},
		onError: (err) => handleApiError(err, t('riskConfig.resetFailed')),
	});

	if (isLoading || !config) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

	const handleSave = async () => {
		const values = await form.validateFields();
		// A-105：具体错误透出（旧实现仅「保存失败」吞后端 400 单调性校验原因）——经 handleApiError
		// 取响应的 message/title/detail（shared utils/error.ts 键链）。try/catch 与 mfa 页既有模式一致，
		// 避免 mutateAsync 的 rejection 逃逸为 unhandled rejection。
		try {
			await save(values);
		} catch (err) {
			handleApiError(err, t('riskConfig.saveFailed'));
		}
	};

	return (
		<div style={{ maxWidth: 800 }}>
			<AppPageHeader title={t('riskConfig.title')} description={t('riskConfig.subtitle')} />

			<Form form={form} layout="vertical" initialValues={config}>
				<Card title={t('riskConfig.levelThresholdCard')} style={{ marginBottom: 16 }}>
					<Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
						{t('riskConfig.fiveLevelDesc')}
					</Text>
					<Space wrap>
						<Form.Item
							name="elevatedThreshold"
							label={t('riskConfig.threshold.l1')}
							rules={[{ required: true }]}
						>
							<InputNumber min={0} max={100} />
						</Form.Item>
						<Form.Item
							name="moderateThreshold"
							label={t('riskConfig.threshold.l2')}
							rules={[{ required: true }]}
						>
							<InputNumber min={0} max={100} />
						</Form.Item>
						<Form.Item
							name="highThreshold"
							label={t('riskConfig.threshold.l3')}
							rules={[{ required: true }]}
						>
							<InputNumber min={0} max={100} />
						</Form.Item>
						<Form.Item
							name="criticalThreshold"
							label={t('riskConfig.threshold.l4')}
							rules={[{ required: true }]}
						>
							<InputNumber min={0} max={100} />
						</Form.Item>
					</Space>
				</Card>

				<Card title={t('riskConfig.signalWeightsCard')} style={{ marginBottom: 16 }}>
					<Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
						{t('riskConfig.signalWeightsDesc')}
					</Text>
					{SIGNAL_KEYS.map((key) => (
						<Form.Item
							key={key}
							name={['signalWeights', key]}
							label={`${t(`riskConfig.signal.${key}`)} (${key})`}
							style={{ display: 'inline-block', width: 280, marginRight: 16 }}
						>
							<InputNumber min={0} max={100} size="small" />
						</Form.Item>
					))}
				</Card>

				<Card title={t('riskConfig.generalCard')} style={{ marginBottom: 16 }}>
					<Form.Item name="learningPeriodDays" label={t('riskConfig.learningPeriod')}>
						{/* A-105：边界对齐后端 binding（risk_config_handler.go:22 min=0,max=3650；旧 UI 上限 90） */}
						<InputNumber min={0} max={3650} />
					</Form.Item>
					<Form.Item
						name="sessionRiskEnabled"
						label={t('riskConfig.sessionRisk')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</Card>
			</Form>

			<Space>
				<Button type="primary" icon={<Save size="1em" />} loading={isSaving} onClick={handleSave}>
					{t('riskConfig.save')}
				</Button>
				<Popconfirm title={t('riskConfig.resetConfirm')} onConfirm={() => reset()}>
					<Button icon={<Undo2 size="1em" />} loading={isResetting}>
						{t('riskConfig.reset')}
					</Button>
				</Popconfirm>
			</Space>
		</div>
	);
}

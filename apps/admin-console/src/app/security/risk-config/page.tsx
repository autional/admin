'use client';

import {
	Card,
	Form,
	InputNumber,
	Switch,
	Button,
	Space,
	message,
	Spin,
	Typography,
	Popconfirm,
} from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRiskConfig, updateRiskConfig, resetRiskConfig } from '@/lib/api.generated';
import { queryKeys } from '@/lib/query-keys';
// TASK-AB1-27（RC-5 契约收敛，清单外补收敛）：删本地 snake 接口 + 手写回转换（写回 snake 供表单匹配的旧法）；
// 行契约 = generated RiskConfigResponse/SignalWeights（camel 直读，拦截器深 camel 化）。
// wire 锚：service-identity/internal/handler/risk_config_handler.go:26-35（json tenant_id/elevated_threshold/
// signal_weights/...）；权重 service-identity/internal/domain/risk_config.go:31-46（json ip_unknown 等）。
import type { RiskConfigResponse, SignalWeights } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';

const { Text } = Typography;

const signalLabels: Record<keyof SignalWeights, string> = {
	ipUnknown: '未知 IP',
	ipBadReputation: 'IP 信誉差',
	ipVpn: 'VPN/代理 IP',
	loginFailureHigh: '高频登录失败',
	loginFailureModerate: '中频登录失败',
	newDeviceOrIp: '新设备/IP',
	unknownDevice: '未知设备',
	unusualLocation: '异地登录',
	unusualTime: '异常时间',
	newCountry: '新国家',
	velocityAnomaly: '速度异常',
	credentialLeaked: '凭证泄露',
	mfaMethodChanged: 'MFA 方式变更',
	sessionHijack: '会话劫持',
};

export default function RiskConfigPage() {
	const queryClient = useQueryClient();

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
			message.success('风险配置已保存');
		},
		onError: () => message.error('保存失败'),
	});

	const { mutateAsync: reset, isPending: isResetting } = useMutation({
		mutationFn: resetRiskConfig,
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.security.riskConfig, data as RiskConfigResponse);
			message.success('已恢复默认配置');
		},
		onError: () => message.error('重置失败'),
	});

	const [form] = Form.useForm();

	if (isLoading || !config) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

	const handleSave = async () => {
		const values = await form.validateFields();
		await save(values);
	};

	return (
		<div style={{ maxWidth: 800 }}>
			<AppPageHeader title="风险评分配置" description="配置自适应 MFA 的风险评分阈值与信号权重" />

			<Form form={form} layout="vertical" initialValues={config}>
				<Card title="风险等级阈值" style={{ marginBottom: 16 }}>
					<Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
						五级风险模型：L0 正常 → L1 建议 MFA → L2 需要 SMS → L3 需要 TOTP → L4 阻断登录
					</Text>
					<Space wrap>
						<Form.Item name="elevatedThreshold" label="L1 提醒阈值" rules={[{ required: true }]}>
							<InputNumber min={0} max={100} />
						</Form.Item>
						<Form.Item name="moderateThreshold" label="L2 SMS 阈值" rules={[{ required: true }]}>
							<InputNumber min={0} max={100} />
						</Form.Item>
						<Form.Item name="highThreshold" label="L3 TOTP 阈值" rules={[{ required: true }]}>
							<InputNumber min={0} max={100} />
						</Form.Item>
						<Form.Item name="criticalThreshold" label="L4 阻断阈值" rules={[{ required: true }]}>
							<InputNumber min={0} max={100} />
						</Form.Item>
					</Space>
				</Card>

				<Card title="信号权重" style={{ marginBottom: 16 }}>
					<Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
						每个风险信号对总分 (0-100) 的贡献值
					</Text>
					{Object.entries(signalLabels).map(([key, label]) => (
						<Form.Item
							key={key}
							name={['signalWeights', key]}
							label={`${label} (${key})`}
							style={{ display: 'inline-block', width: 280, marginRight: 16 }}
						>
							<InputNumber min={0} max={100} size="small" />
						</Form.Item>
					))}
				</Card>

				<Card title="通用设置" style={{ marginBottom: 16 }}>
					<Form.Item name="learningPeriodDays" label="新用户学习期 (天)">
						<InputNumber min={0} max={90} />
					</Form.Item>
					<Form.Item name="sessionRiskEnabled" label="会话持续风险监控" valuePropName="checked">
						<Switch />
					</Form.Item>
				</Card>
			</Form>

			<Space>
				<Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={handleSave}>
					保存配置
				</Button>
				<Popconfirm title="恢复系统默认风险配置？" onConfirm={() => reset()}>
					<Button icon={<UndoOutlined />} loading={isResetting}>
						恢复默认
					</Button>
				</Popconfirm>
			</Space>
		</div>
	);
}

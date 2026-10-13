/**
 * Compliance Profile Presets — 合规配置文件预设常量
 *
 * 每个 Profile 定义一组 auth-policy 参数值，对应后端 UpdateAuthConfigRequest。
 * 选择 Profile 后通过 PUT /admin/security/auth-config 一键应用。
 *
 * 参考: .docs_20260606/docs/industry-standards/compliance-matrix.md §5
 */

export interface ProfilePreset {
	key: string;
	i18nKey: string;
	descriptionI18nKey: string;
	/** 对应 TenantAuthPolicyRequest 的字段值 */
	values: Record<string, unknown>;
}

export const COMPLIANCE_PROFILES: ProfilePreset[] = [
	{
		key: 'balanced',
		i18nKey: 'authConfig.profileBalanced',
		descriptionI18nKey: 'authConfig.profileBalancedDesc',
		values: {
			minLength: 12,
			maxLength: 64,
			requireUpper: false,
			requireLower: false,
			requireDigit: false,
			requireSpecial: false,
			expiryDays: 0,
			historyCount: 0,
			maxLoginAttempts: 5,
			lockDurationSec: 30,
			breachCheckEnabled: true,
			magicLinkEnabled: true,
			passkeyEnabled: true,
		},
	},
	{
		key: 'nist_v4_high',
		i18nKey: 'authConfig.profileNISTv4',
		descriptionI18nKey: 'authConfig.profileNISTv4Desc',
		values: {
			minLength: 15,
			maxLength: 64,
			requireUpper: false,
			requireLower: false,
			requireDigit: false,
			requireSpecial: false,
			expiryDays: 0,
			historyCount: 0,
			maxLoginAttempts: 5,
			lockDurationSec: 30,
			passkeyEnabled: true,
			breachCheckEnabled: true,
			magicLinkEnabled: true,
			deviceFingerprintEnabled: true,
			captchaEnabled: true,
		},
	},
	{
		key: 'pci_dss_v4',
		i18nKey: 'authConfig.profilePCI',
		descriptionI18nKey: 'authConfig.profilePCIDesc',
		values: {
			minLength: 12,
			maxLength: 64,
			requireUpper: false,
			requireLower: false,
			requireDigit: true,
			requireSpecial: false,
			expiryDays: 90,
			historyCount: 4,
			maxLoginAttempts: 6,
			lockDurationSec: 30,
			breachCheckEnabled: true,
			magicLinkEnabled: true,
			passkeyEnabled: true,
			deviceFingerprintEnabled: true,
		},
	},
	{
		key: 'psd2_sca',
		i18nKey: 'authConfig.profilePSD2',
		descriptionI18nKey: 'authConfig.profilePSD2Desc',
		values: {
			minLength: 8,
			maxLength: 64,
			maxLoginAttempts: 5,
			lockDurationSec: 30,
			breachCheckEnabled: true,
			passkeyEnabled: true,
			deviceFingerprintEnabled: true,
		},
	},
	{
		key: 'hipaa',
		i18nKey: 'authConfig.profileHIPAA',
		descriptionI18nKey: 'authConfig.profileHIPPADesc',
		values: {
			minLength: 8,
			maxLength: 64,
			maxLoginAttempts: 5,
			lockDurationSec: 30,
			breachCheckEnabled: true,
			deviceFingerprintEnabled: true,
			captchaEnabled: true,
			pepperEnabled: true,
		},
	},
];

/** 获取 Profile 预设的独立 key 列表 */
export function getProfileKeys(): string[] {
	return COMPLIANCE_PROFILES.map((p) => p.key);
}

/** 根据 key 查找 Profile 预设 */
export function getProfileByKey(key: string): ProfilePreset | undefined {
	return COMPLIANCE_PROFILES.find((p) => p.key === key);
}

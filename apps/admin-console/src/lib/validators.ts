import { z } from 'zod';
import type { TFunction } from 'i18next';

// 校验消息一律经 t()（validation.* 键，zh/en 双 bundle 齐备）——
// 工厂在提交时以组件作用域的 t 构造，组件语言即校验语言；消息文本零硬编码。
// 类型一律从 ReturnType 推导（下方 export type）。
export const createUserSchema = (t: TFunction) =>
	z.object({
		username: z
			.string()
			.min(3, t('validation.usernameMinLength', { min: 3 }))
			.max(64, t('validation.usernameMaxLength', { max: 64 })),
		email: z.string().email(t('validation.emailInvalid')),
		password: z
			.string()
			.min(8, t('validation.passwordMinLength', { min: 8 }))
			.max(128, t('validation.passwordMaxLength', { max: 128 })),
		displayName: z.string().optional(),
	});

export const createRoleSchema = (t: TFunction) =>
	z.object({
		name: z
			.string()
			.min(1, t('validation.roleNameRequired'))
			.max(64, t('validation.roleNameMaxLength', { max: 64 })),
		code: z
			.string()
			.min(1, t('validation.roleCodeRequired'))
			.max(64, t('validation.roleCodeMaxLength', { max: 64 })),
		description: z.string().optional(),
	});

export const createIdpSchema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, t('validation.nameRequired')).max(128),
		type: z.enum(['oauth', 'saml', 'ldap', 'oidc'], { message: t('validation.idpTypeInvalid') }),
		clientId: z.string().optional(),
		clientSecret: z.string().optional(),
		issuerUrl: z.string().url(t('validation.urlInvalid')).optional().or(z.literal('')),
		authorizationUrl: z.string().url(t('validation.urlInvalid')).optional().or(z.literal('')),
		tokenUrl: z.string().url(t('validation.urlInvalid')).optional().or(z.literal('')),
		userinfoUrl: z.string().url(t('validation.urlInvalid')).optional().or(z.literal('')),
	});

export const createSecretSchema = (t: TFunction) =>
	z.object({
		key: z
			.string()
			.min(1, t('validation.secretKeyRequired'))
			.max(512, t('validation.secretKeyMaxLength', { max: 512 })),
		value: z.string().min(1, t('validation.secretValueRequired')),
		description: z.string().optional(),
	});

// 无自定义消息（zod 默认文案不出现在中文面），保持模块级常量
export const updateSecretSchema = z.object({
	key: z.string().min(1),
	description: z.string().optional(),
});

export const createWebhookSchema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, t('validation.webhookNameRequired')),
		url: z.string().min(1, t('validation.urlRequired')).url(t('validation.urlInvalid')),
		secret: z.string().optional(),
		events: z.array(z.string()).min(1, t('validation.eventsRequired')),
		status: z.boolean().optional(),
		maxRetries: z.number().int().min(0).max(10).optional(),
		backoff: z.string().optional(),
	});

export const createDepartmentSchema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, t('validation.departmentNameRequired')),
	});

export const createApplicationSchema = (t: TFunction) =>
	z.object({
		name: z.string().min(1, t('validation.applicationNameRequired')),
		code: z.string().min(1, t('validation.applicationCodeRequired')),
		// A-43：类型放宽为任意非空字符串（支持租户自定义应用类型，内置 oidc/saml/custom 仍是合法值）
		type: z.string().min(1, t('validation.applicationTypeInvalid')),
		description: z.string().optional(),
	});

export const createPlanSchema = (t: TFunction) =>
	z
		.object({
			code: z.string().min(1, t('validation.planCodeRequired')),
			name: z.string().min(1, t('validation.planNameRequired')),
			billingCycle: z.enum(['monthly', 'yearly', 'quarterly', 'weekly'], {
				message: t('validation.billingCycleInvalid'),
			}),
			monthlyPrice: z.number().min(0).optional(),
			yearlyPrice: z.number().min(0).optional(),
			quarterlyPrice: z.number().min(0).optional(),
			features: z.union([z.string(), z.record(z.unknown())]).optional(),
			isCustom: z.boolean().optional(),
		})
		.refine(
			(data) => data.monthlyPrice != null || data.yearlyPrice != null || data.quarterlyPrice != null,
			{ message: t('validation.planPriceRequired'), path: ['monthlyPrice'] },
		);

export const inviteMemberSchema = (t: TFunction) =>
	z.object({
		email: z.string().email(t('validation.emailInvalid')),
		role: z.string().min(1, t('validation.roleRequired')),
	});

// A-151（TASK-AB1-25）：按 service-notification CreateTemplateRequest 实读契约重写
// （dto.go:312-320：code/name/type/subject/content 必填，format/variables 可选；
// type ∈ system/user/alert/reminder/promotion）。旧 schema 仅校 name/channel（表单无 code/subject/type）
// ⇒ 放行必 400 的请求体，模板创建恒失败。
export const createNotificationTemplateSchema = (t: TFunction) =>
	z.object({
		code: z
			.string()
			.min(1, t('validation.templateCodeRequired'))
			.max(128, t('validation.templateCodeMaxLength', { max: 128 })),
		name: z
			.string()
			.min(1, t('validation.templateNameRequired'))
			.max(128, t('validation.templateNameMaxLength', { max: 128 })),
		type: z.enum(['system', 'user', 'alert', 'reminder', 'promotion'], {
			message: t('validation.notificationTypeInvalid'),
		}),
		subject: z
			.string()
			.min(1, t('validation.templateSubjectRequired'))
			.max(256, t('validation.templateSubjectMaxLength', { max: 256 })),
		content: z.string().min(1, t('validation.templateContentRequired')),
		format: z.string().optional(),
		variables: z.array(z.string()).optional(),
	});

export type CreateUserInput = z.infer<ReturnType<typeof createUserSchema>>;
export type CreateRoleInput = z.infer<ReturnType<typeof createRoleSchema>>;
export type CreateIdpInput = z.infer<ReturnType<typeof createIdpSchema>>;
export type CreateSecretInput = z.infer<ReturnType<typeof createSecretSchema>>;
export type UpdateSecretInput = z.infer<typeof updateSecretSchema>;
export type CreateWebhookInput = z.infer<ReturnType<typeof createWebhookSchema>>;
export type CreateDepartmentInput = z.infer<ReturnType<typeof createDepartmentSchema>>;
export type CreateApplicationInput = z.infer<ReturnType<typeof createApplicationSchema>>;
export type InviteMemberInput = z.infer<ReturnType<typeof inviteMemberSchema>>;
export type CreateNotificationTemplateInput = z.infer<ReturnType<typeof createNotificationTemplateSchema>>;
export type CreatePlanInput = z.infer<ReturnType<typeof createPlanSchema>>;

import { z } from 'zod';

export const createUserSchema = z.object({
	username: z.string().min(3, '用户名至少3个字符').max(64, '用户名最多64个字符'),
	email: z.string().email('请输入有效的邮箱地址'),
	password: z.string().min(8, '密码至少8个字符').max(128, '密码最多128个字符'),
	displayName: z.string().optional(),
});

export const createRoleSchema = z.object({
	name: z.string().min(1, '角色名不能为空').max(64, '角色名最多64个字符'),
	code: z.string().min(1, '角色代码不能为空').max(64, '角色代码最多64个字符'),
	description: z.string().optional(),
});

export const createIdpSchema = z.object({
	name: z.string().min(1, '名称不能为空').max(128),
	type: z.enum(['oauth', 'saml', 'ldap', 'oidc'], { message: '无效的提供商类型' }),
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	issuerUrl: z.string().url('请输入有效的URL').optional().or(z.literal('')),
	authorizationUrl: z.string().url('请输入有效的URL').optional().or(z.literal('')),
	tokenUrl: z.string().url('请输入有效的URL').optional().or(z.literal('')),
	userinfoUrl: z.string().url('请输入有效的URL').optional().or(z.literal('')),
});

export const createSecretSchema = z.object({
	key: z.string().min(1, '密钥Key不能为空').max(512, '密钥Key最多512个字符'),
	value: z.string().min(1, '密钥值不能为空'),
	description: z.string().optional(),
});

export const updateSecretSchema = z.object({
	key: z.string().min(1),
	description: z.string().optional(),
});

export const createWebhookSchema = z.object({
	name: z.string().min(1, 'Webhook名称不能为空'),
	url: z.string().min(1, 'URL不能为空').url('请输入有效的URL'),
	secret: z.string().optional(),
	events: z.array(z.string()).min(1, '请至少选择一个事件'),
	status: z.boolean().optional(),
	maxRetries: z.number().int().min(0).max(10).optional(),
	backoff: z.string().optional(),
});

export const createDepartmentSchema = z.object({
	name: z.string().min(1, '部门名称不能为空'),
});

export const createApplicationSchema = z.object({
	name: z.string().min(1, '应用名称不能为空'),
	code: z.string().min(1, '应用代码不能为空'),
	// A-43：类型放宽为任意非空字符串（支持租户自定义应用类型，内置 oidc/saml/custom 仍是合法值）
	type: z.string().min(1, '无效的应用类型'),
	description: z.string().optional(),
});

export const createPlanSchema = z
	.object({
		code: z.string().min(1, '计划代码不能为空'),
		name: z.string().min(1, '计划名称不能为空'),
		billingCycle: z.enum(['monthly', 'yearly', 'quarterly', 'weekly'], {
			message: '无效的计费周期',
		}),
		monthlyPrice: z.number().min(0).optional(),
		yearlyPrice: z.number().min(0).optional(),
		quarterlyPrice: z.number().min(0).optional(),
		features: z.union([z.string(), z.record(z.unknown())]).optional(),
		isCustom: z.boolean().optional(),
	})
	.refine(
		(data) => data.monthlyPrice != null || data.yearlyPrice != null || data.quarterlyPrice != null,
		{ message: '至少需要设置一个价格', path: ['monthlyPrice'] },
	);

export const inviteMemberSchema = z.object({
	email: z.string().email('请输入有效的邮箱地址'),
	role: z.string().min(1, '请选择角色'),
});

// A-151（TASK-AB1-25）：按 service-notification CreateTemplateRequest 实读契约重写
// （dto.go:312-320：code/name/type/subject/content 必填，format/variables 可选；
// type ∈ system/user/alert/reminder/promotion）。旧 schema 仅校 name/channel（表单无 code/subject/type）
// ⇒ 放行必 400 的请求体，模板创建恒失败。
export const createNotificationTemplateSchema = z.object({
	code: z.string().min(1, '模板代码不能为空').max(128, '模板代码最多128个字符'),
	name: z.string().min(1, '模板名称不能为空').max(128, '模板名称最多128个字符'),
	type: z.enum(['system', 'user', 'alert', 'reminder', 'promotion'], { message: '无效的通知类型' }),
	subject: z.string().min(1, '主题不能为空').max(256, '主题最多256个字符'),
	content: z.string().min(1, '内容不能为空'),
	format: z.string().optional(),
	variables: z.array(z.string()).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type CreateIdpInput = z.infer<typeof createIdpSchema>;
export type CreateSecretInput = z.infer<typeof createSecretSchema>;
export type UpdateSecretInput = z.infer<typeof updateSecretSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type CreateNotificationTemplateInput = z.infer<typeof createNotificationTemplateSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/**
 * Query Key Factory — centralized, type-safe cache keys for TanStack Query.
 * Rules:
 * - All keys live here; no hardcoded strings in hooks/pages.
 * - Lists use objects for filters: ['users', { params }]
 * - Detail keys are predictable: ['users', id]
 * - Invalidations target parent scopes (e.g. invalidate 'users' clears list + detail)
 */

export const queryKeys = {
	users: {
		all: (tenantId: string) => ['users', tenantId] as const,
		list: (tenantId: string, params?: unknown) => ['users', 'list', tenantId, { params }] as const,
		detail: (tenantId: string, id: string) => ['users', tenantId, id] as const,
		activeSessions: (tenantId: string) => ['active-sessions', tenantId] as const,
		passwordStatus: (tenantId: string, id: string) =>
			['users', tenantId, id, 'password-status'] as const,
		userRoles: (tenantId: string, id: string) => ['users', tenantId, id, 'roles'] as const,
		userPermissions: (tenantId: string, id: string) =>
			['users', tenantId, id, 'permissions'] as const,
	},
	roles: {
		all: (tenantId: string) => ['roles', tenantId] as const,
		list: (tenantId: string, params?: unknown) => ['roles', tenantId, { params }] as const,
		detail: (tenantId: string, id: string) => ['roles', tenantId, id] as const,
		permissions: (tenantId: string, roleId: string) =>
			['roles', tenantId, roleId, 'permissions'] as const,
		children: (tenantId: string, roleId: string) =>
			['roles', tenantId, roleId, 'children'] as const,
		parents: (tenantId: string, roleId: string) => ['roles', tenantId, roleId, 'parents'] as const,
		effectivePermissions: (tenantId: string, roleId: string) =>
			['roles', tenantId, roleId, 'effective-permissions'] as const,
	},
	permissions: {
		all: (tenantId: string) => ['permissions', tenantId] as const,
		list: (tenantId: string, params?: unknown) => ['permissions', tenantId, { params }] as const,
	},
	secrets: {
		all: (tenantId: string) => ['secrets', tenantId] as const,
		list: (tenantId: string, params?: unknown) =>
			['secrets', 'list', tenantId, { params }] as const,
		detail: (tenantId: string, key: string) => ['secrets', tenantId, 'detail', key] as const,
		versions: (tenantId: string, key: string) => ['secrets', tenantId, 'versions', key] as const,
		encryptionKeys: (tenantId: string) => ['secrets', tenantId, 'encryption-keys'] as const,
	},
	tenants: {
		all: ['tenants'] as const,
		detail: (id: string) => ['tenants', id] as const,
	},
	departments: {
		all: (tenantId: string) => ['departments', tenantId] as const,
	},
	members: {
		all: (tenantId: string) => ['members', tenantId] as const,
		pending: (tenantId: string) => ['members', 'pending', tenantId] as const,
	},
	featureGates: (tenantId: string) => ['feature-gates', tenantId] as const,
	applications: {
		all: (tenantId: string) => ['applications', tenantId] as const,
		// A-43：租户自定义应用类型（列表 type 回显 + 表单选项）
		appTypes: (tenantId: string) => ['applications', tenantId, 'app-types'] as const,
	},
	webhooks: {
		all: (tenantId: string) => ['webhooks', tenantId] as const,
	},
	branding: {
		all: (tenantId: string) => ['branding', tenantId] as const,
	},
	sessions: {
		all: (tenantId: string) => ['sessions', tenantId] as const,
		activeCount: (tenantId: string) => ['sessions', 'active-count', tenantId] as const,
	},
	auditLogs: {
		all: (tenantId: string, params?: unknown) => ['audit-logs', tenantId, { params }] as const,
		detail: (tenantId: string, id: string) => ['audit-logs', tenantId, id] as const,
		stats: (tenantId: string) => ['audit-stats', tenantId] as const,
	},
	auditAlerts: {
		all: (tenantId: string, params?: unknown) => ['audit-alerts', tenantId, { params }] as const,
		// A-205（W1e）：detail 死键已删（useAlertDetail 死链同步删，证据见 w1e-record）
	},
	auditAnomalies: {
		all: (tenantId: string, params?: unknown) => ['audit-anomalies', tenantId, { params }] as const,
		// A-214（W1e）：detail 死键已删（useAnomalyDetail 死链同步删，证据见 w1e-record）
		timeline: (tenantId: string, id: string) =>
			['audit-anomalies', tenantId, id, 'timeline'] as const,
		related: (tenantId: string, id: string) =>
			['audit-anomalies', tenantId, id, 'related'] as const,
	},
	siemConnectors: {
		all: (params?: unknown) => ['siem-connectors', { params }] as const,
	},
	retentionPolicy: ['audit-retention-policy'] as const,
	identityProviders: {
		all: ['identity-providers'] as const,
	},
	ldap: {
		health: ['ldap', 'health'] as const,
	},
	notifications: {
		all: ['notification-templates'] as const,
		// A-156：服务端分页入键（page/pageSize 变化 → 独立缓存条目；前缀仍命中 all → 失效广播成立）
		list: (params?: unknown) => ['notification-templates', { params }] as const,
		// A-164（TASK-AB1-26）：选择器专用数据源（/available twin），与列表 all 键分槽防缓存互踩
		availableTemplates: ['notification-templates-available'] as const,
		stats: ['notification-stats'] as const,
		trend: (days: number) => ['notification-trend', days] as const,
		eventMappings: ['event-mappings'] as const,
		globalVariables: ['global-variables'] as const,
		readReport: ['notifications', 'read-report'] as const,
	},
	platform: {
		communicationStats: ['platform-communication-stats'] as const,
		notificationStats: ['platform-notification-stats'] as const,
	},
	communication: {
		// A-182：days 入键（时间窗切换 → 独立缓存条目，避免跨窗互踩）
		dashboard: (days?: number) => ['communication-dashboard', { days }] as const,
		logs: ['message-logs'] as const,
		// A-181/A-185（[删]）：stats/templateStats 死键已删（死取数 useChannelStats /
		// useCommunicationTemplateStats 同步删，证据见 w1d-record）
		providers: ['communication', 'providers'] as const,
		templates: (params?: unknown) => ['communication', 'templates', { params }] as const,
	},
	announcements: {
		all: ['announcements'] as const,
	},
	settings: {
		all: ['settings'] as const,
	},
	points: {
		rules: ['point-rules'] as const,
		// A-327②：账户分页入键（page/page_size 变化 → 独立缓存条目；all 前缀失效广播）
		accounts: {
			all: ['point-accounts'] as const,
			list: (params?: unknown) => ['point-accounts', { params }] as const,
		},
		// A-327②：交易分页入键（受控切页 → 独立条目）
		transactions: (userId: string, params?: unknown) =>
			['point-transactions', userId, { params }] as const,
		riskScore: (userId: string) => ['point-risk-score', userId] as const,
		config: ['point-tenant-config'] as const,
	},
	wallets: {
		all: (tenantId?: string) =>
			tenantId ? (['wallets', tenantId] as const) : (['wallets'] as const),
		summary: (tenantId: string) => ['wallets', 'summary', tenantId] as const,
		transactions: (tenantId: string, params?: unknown) =>
			['wallets', 'transactions', tenantId, { params }] as const,
		// A-374④/A-375①：status 筛选 + 分页入键（切换 → 独立缓存条目；resolve 失效仍按 tenantId 前缀广播）
		disputes: (tenantId: string, params?: unknown) =>
			['wallets', 'disputes', tenantId, { params }] as const,
		coupons: ['wallets', 'coupons'] as const,
		fraudRules: ['wallets', 'fraud-rules'] as const,
		reconciliation: (params?: unknown) => ['wallets', 'reconciliation', { params }] as const,
	},
	storage: {
		files: (params?: unknown) => ['files', { params }] as const,
		quota: ['storage', 'quota'] as const,
		stats: ['storage', 'stats'] as const,
		// A-301：回收站分页入键（page/page_size 变化 → 独立缓存条目；all 前缀失效广播）
		trash: {
			all: ['storage', 'trash'] as const,
			list: (params?: unknown) => ['storage', 'trash', { params }] as const,
		},
	},
	billing: {
		all: (tenantId: string) => ['billing', tenantId] as const,
		subscription: (tenantId: string) => ['billing', 'subscription', tenantId] as const,
		usage: (tenantId: string) => ['billing', 'usage', tenantId] as const,
		statistics: (tenantId: string) => ['billing', 'statistics', tenantId] as const,
		records: (tenantId: string) => ['billing', 'records', tenantId] as const,
		plans: ['billing', 'plans'] as const,
		// A-290：服务端分页入键（page/page_size 变化 → 独立缓存条目；all 前缀失效广播）
		paymentGateways: {
			all: ['billing', 'payment-gateways'] as const,
			list: (params?: unknown) => ['billing', 'payment-gateways', { params }] as const,
		},
		refundApprovals: ['billing', 'refund-approvals'] as const,
		dunningSettings: (tenantId: string) => ['billing', 'dunning-settings', tenantId] as const,
	},
	compliance: {
		status: ['compliance', 'status'] as const,
		dsars: ['compliance', 'dsars'] as const,
		erasures: ['compliance', 'erasures'] as const,
		retentionPolicies: ['compliance', 'retention-policies'] as const,
		sodRules: ['compliance', 'sod-rules'] as const,
		isoControls: ['compliance', 'iso-controls'] as const,
		consents: ['compliance', 'consents'] as const,
	},
	ops: {
		status: ['ops', 'status'] as const,
		health: ['ops', 'health'] as const,
		metrics: (serviceName?: string) =>
			serviceName ? (['ops', 'metrics', serviceName] as const) : (['ops', 'metrics'] as const),
	},
	security: {
		passwordPolicy: ['security', 'password-policy'] as const,
		mfaPolicy: ['security', 'mfa-policy'] as const,
		riskConfig: ['security', 'risk-config'] as const,
		tenantPolicy: (tenantId: string) => ['security', 'policy', tenantId] as const,
		authConfig: ['security', 'auth-config'] as const,
		dataClassification: (tenantId: string) =>
			['security', 'data-classification', tenantId] as const,
	},
	pay: {
		all: ['pay'] as const,
		channels: (tenantId: string) => ['pay', 'channels', tenantId] as const,
		payments: (params?: unknown) => ['pay', 'payments', { params }] as const,
		paymentDetail: (id: string) => ['pay', 'payments', id] as const,
		refunds: (params?: unknown) => ['pay', 'refunds', { params }] as const,
		reconciliation: (tenantId: string, params?: unknown) =>
			['pay', 'reconciliation', tenantId, { params }] as const,
	},
	walletAdmin: {
		all: ['wallet-admin'] as const,
		list: (params?: unknown) => ['wallet-admin', 'list', { params }] as const,
		coupons: ['wallet-admin', 'coupons'] as const,
		fraudRules: ['wallet-admin', 'fraud-rules'] as const,
		withdrawals: (params?: unknown) => ['wallet-admin', 'withdrawals', { params }] as const,
		policy: (tenantId: string, appId: string) =>
			['wallet-admin', 'policy', tenantId, appId] as const,
	},
	billingAdmin: {
		all: ['billing-admin'] as const,
		plans: ['billing-admin', 'plans'] as const,
		subscriptions: (params?: unknown) => ['billing-admin', 'subscriptions', { params }] as const,
		refunds: (params?: unknown) => ['billing-admin', 'refunds', { params }] as const,
		revenue: (params?: unknown) => ['billing-admin', 'revenue', { params }] as const,
		dunning: (tenantId: string) => ['billing-admin', 'dunning', tenantId] as const,
		taxExport: (params?: unknown) => ['billing-admin', 'tax-export', { params }] as const,
		alerts: (params?: unknown) => ['billing-admin', 'alerts', { params }] as const,
		creditNote: (number: string) => ['billing-admin', 'credit-notes', number] as const,
		creditNotes: ['billing-admin', 'credit-notes'] as const,
		creditBalance: (tenantId: string) => ['billing-admin', 'credit-balance', tenantId] as const,
		creditTransactions: (tenantId: string, params?: unknown) =>
			['billing-admin', 'credit-transactions', tenantId, { params }] as const,
	},
	status: {
		incidents: {
			all: ['status', 'incidents'] as const,
			detail: (id: string) => ['status', 'incidents', id] as const,
		},
		maintenances: {
			all: ['status', 'maintenances'] as const,
			detail: (id: string) => ['status', 'maintenances', id] as const,
		},
		overview: ['status', 'overview'] as const,
		subscribers: ['status', 'subscribers'] as const,
	},
	abacPolicies: {
		all: (tenantId: string) => ['abac-policies', tenantId] as const,
		// A-136：服务端分页入键（page/pageSize 变化 → 独立缓存条目，前缀仍命中 all → 失效广播成立）
		list: (tenantId: string, params?: unknown) => ['abac-policies', tenantId, { params }] as const,
	},
	roleActivations: {
		all: ['role-activations'] as const,
		// A-144：服务端分页入键（status/page/pageSize 变化 → 独立缓存条目，前缀仍命中 all）
		list: (params?: unknown) => ['role-activations', { params }] as const,
	},
	approvalRequests: {
		all: (tenantId: string) => ['approval-requests', tenantId] as const,
	},
	agents: {
		all: (tenantId: string) => ['agents', tenantId] as const,
		list: (tenantId: string, params?: unknown) => ['agents', tenantId, { params }] as const,
		detail: (tenantId: string, id: string) => ['agents', tenantId, id] as const,
		credentials: (tenantId: string, id: string) => ['agents', tenantId, id, 'credentials'] as const,
		activity: (tenantId: string, id: string) => ['agents', tenantId, id, 'activity'] as const,
		permissions: (tenantId: string, id: string) => ['agents', tenantId, id, 'permissions'] as const,
	},
	robots: {
		all: (tenantId: string) => ['robots', tenantId] as const,
		list: (tenantId: string, params?: unknown) => ['robots', tenantId, { params }] as const,
		detail: (tenantId: string, id: string) => ['robots', tenantId, id] as const,
	},
	devices: {
		all: (tenantId: string) => ['devices', tenantId] as const,
		list: (tenantId: string, params?: unknown) => ['devices', tenantId, { params }] as const,
		detail: (tenantId: string, id: string) => ['devices', tenantId, id] as const,
	},
	nhiPolicy: {
		all: ['nhi-policy'] as const,
	},
	serverLogs: {
		all: (params?: unknown) => ['server-logs', { params }] as const,
		services: ['server-logs', 'services'] as const,
	},
	secretsInventory: {
		all: (tenantId: string) => ['secrets-inventory', tenantId] as const,
		kv: (tenantId: string) => ['secrets-inventory', tenantId, 'kv'] as const,
		encryptionKeys: (tenantId: string) =>
			['secrets-inventory', tenantId, 'encryption-keys'] as const,
		jwtKeys: (tenantId: string) => ['secrets-inventory', tenantId, 'jwt-keys'] as const,
		infrastructure: (tenantId: string) =>
			['secrets-inventory', tenantId, 'infrastructure'] as const,
		apiKeys: (tenantId: string) => ['secrets-inventory', tenantId, 'api-keys'] as const,
		oauth: (tenantId: string) => ['secrets-inventory', tenantId, 'oauth'] as const,
	},
	systemOverview: {
		all: ['system-overview'] as const,
	},
	conflictPairs: {
		all: ['conflict-pairs'] as const,
	},
	defaultRoles: {
		all: ['default-roles'] as const,
	},
	batchOperations: {
		all: ['batch-operations'] as const,
	},
	reverseLookup: {
		roleUsers: (roleId: string) => ['reverse-lookup', 'roles', roleId, 'users'] as const,
		permissionUsers: (permissionId: string) =>
			['reverse-lookup', 'permissions', permissionId, 'users'] as const,
		permissionRoles: (permissionId: string) =>
			['reverse-lookup', 'permissions', permissionId, 'roles'] as const,
	},
	// ============ developer-portal merge ============
	oauthClients: {
		all: (params?: unknown) => ['oauth-clients', { params }] as const,
		detail: (id: string) => ['oauth-clients', id] as const,
		secrets: (clientId: string) => ['oauth-clients', clientId, 'secrets'] as const,
		stats: (clientId: string) => ['oauth-clients', clientId, 'stats'] as const,
	},
	apiKeys: {
		all: (params?: unknown) => ['api-keys', { params }] as const,
		detail: (id: string) => ['api-keys', id] as const,
	},
	usage: {
		current: ['usage', 'current'] as const,
		timeline: (days?: number) => ['usage', 'timeline', { days }] as const,
		endpoints: (appId?: string) => ['usage', 'endpoints', { appId }] as const,
	},
	mySessions: {
		all: ['my-sessions'] as const,
	},
	myDevices: {
		all: ['my-devices'] as const,
	},
	myAuditLogs: {
		all: (params?: unknown) => ['my-audit-logs', { params }] as const,
	},
} as const;

'use client';

import React from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenantSlug } from '@autional/shared';
import { Breadcrumb as SharedBreadcrumb } from '@autional/ui/antd';
import { buildNavHref } from '@/lib/nav';

/**
 * 面包屑。
 *
 * 这里只剩**业务**：路由 → 文案的映射表（78 条，与另外三个门户完全不重叠）。
 * 机制（剥租户段、按段累积、中间段可点、末段纯文本、「详情」启发式、只有一项不渲染）
 * 已经收进设计系统 —— 本站原本 145 行，是四份里能力最全的一份，那一份也成了收敛的基准。
 */
export function Breadcrumb() {
	const location = useLocation();
	const { t } = useTranslation();
	const tenantSlug = useTenantSlug();

	const breadcrumbMap: Record<string, string> = React.useMemo(
		() => ({
			'/': t('breadcrumb.dashboard'),
			'/users': t('breadcrumb.users'),
			'/roles': t('breadcrumb.roles'),
			'/permissions': t('breadcrumb.permissions'),
			'/abac-policies': t('breadcrumb.abacPolicies'),
			'/role-activations': t('breadcrumb.roleActivations'),
			'/sessions': t('breadcrumb.sessions'),
			'/secrets': t('breadcrumb.secrets'),
			'/secrets/policy': t('breadcrumb.secretsPolicy'),
			'/profiles': t('breadcrumb.profiles'),
			'/profiles/policy': t('breadcrumb.profilesPolicy'),
			'/profiles/field-schemas': t('breadcrumb.profilesFieldSchemas'),
			'/profiles/approval': t('breadcrumb.profilesApproval'),
			'/profiles/webhook': t('breadcrumb.profilesWebhook'),
			'/departments': t('breadcrumb.departments'),
			'/members': t('breadcrumb.members'),
			'/members/approval': t('breadcrumb.memberApproval'),
			'/applications': t('breadcrumb.applications'),
			'/oauth-clients': t('breadcrumb.oauthClients'),
			'/identity-providers': t('breadcrumb.identityProviders'),
			'/webhooks': t('breadcrumb.webhooks'),
			'/agents': t('breadcrumb.agents'),
			'/robots': t('breadcrumb.robots'),
			'/devices': t('breadcrumb.devices'),
			'/policies/nhi': t('breadcrumb.nhiPolicy'),
			'/security/mfa': t('breadcrumb.mfaPolicy'),
			'/security/risk-config': t('breadcrumb.riskConfig'),
			'/security/auth-config': t('breadcrumb.authConfig'),
			'/security/password-policy': t('breadcrumb.passwordPolicy'),
			'/security/policy': t('breadcrumb.securityPolicy'),
			'/data-classification': t('breadcrumb.dataClassification'),
			'/branding': t('breadcrumb.branding'),
			'/notifications/templates': t('breadcrumb.notificationTemplates'),
			'/notifications/announcements': t('breadcrumb.announcements'),
			'/notifications/stats': t('breadcrumb.notificationStats'),
			'/notifications/event-mappings': t('breadcrumb.eventMappings'),
			'/notifications/global-variables': t('breadcrumb.globalVariables'),
			'/notifications/broadcast': t('breadcrumb.broadcast'),
			'/communication': t('breadcrumb.communication'),
			'/communication/templates': t('breadcrumb.communicationTemplates'),
			'/communication/providers': t('breadcrumb.communicationProviders'),
			'/verifications': t('breadcrumb.verifications'),
			'/audit-logs': t('breadcrumb.auditLogs'),
			'/audit/alerts': t('breadcrumb.alerts'),
			'/audit/anomalies': t('breadcrumb.anomalies'),
			'/audit/siem': t('breadcrumb.siemConnectors'),
			'/audit/retention': t('breadcrumb.retentionPolicy'),
			'/audit/compliance': t('breadcrumb.auditCompliance'),
			'/audit/reports': t('breadcrumb.auditReports'),
			'/compliance': t('breadcrumb.compliance'),
			'/compliance/policy': t('breadcrumb.compliancePolicy'),
			'/compliance/minors': t('breadcrumb.minorsProtection'),
			'/billing': t('breadcrumb.billing'),
			'/storage': t('breadcrumb.storage'),
			'/wallets': t('breadcrumb.wallets'),
			'/points': t('breadcrumb.points'),
			'/pay/channels': t('breadcrumb.payChannels'),
			'/pay/payments': t('breadcrumb.payPayments'),
			'/pay/reconciliation': t('breadcrumb.payReconciliation'),
			'/pay/refunds': t('breadcrumb.payRefunds'),
			'/wallet/list': t('breadcrumb.walletList'),
			'/wallet/adjust': t('breadcrumb.walletAdjust'),
			'/wallet/withdrawals': t('breadcrumb.walletWithdrawals'),
			'/wallet/disputes': t('breadcrumb.walletDisputes'),
			'/wallet/coupons': t('breadcrumb.walletCoupons'),
			'/wallet/policy': t('breadcrumb.walletPolicy'),
			'/wallet/fraud-rules': t('breadcrumb.walletFraudRules'),
			'/wallet/events': t('breadcrumb.walletEvents'),
			'/billing/plans': t('breadcrumb.billingPlans'),
			'/billing/subscriptions': t('breadcrumb.billingSubscriptions'),
			'/billing/refunds': t('breadcrumb.billingRefunds'),
			'/billing/revenue': t('breadcrumb.billingRevenue'),
			'/billing/dunning': t('breadcrumb.billingDunning'),
			'/billing/tax-export': t('breadcrumb.billingTaxExport'),
			'/billing/alerts': t('breadcrumb.billingAlerts'),
			'/billing/credit-notes': t('breadcrumb.creditNotes'),
			'/billing/credit-balance': t('breadcrumb.creditBalance'),
			'/settings': t('breadcrumb.settings'),
		}),
		[t],
	);

	return (
		<SharedBreadcrumb
			pathname={location.pathname}
			tenantSlug={tenantSlug}
			labels={breadcrumbMap}
			home={{ label: t('breadcrumb.dashboard'), href: buildNavHref('/', tenantSlug) }}
			detailLabel={t('breadcrumb.detail')}
			buildHref={(path) => buildNavHref(path, tenantSlug)}
		/>
	);
}

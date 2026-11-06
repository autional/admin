/**
 * SAML SP 签名状态与按 IdP 策略（2026-11-06）。
 *
 * 后端 contract（service-saml）：
 * - GET  /saml/api/v1/admin/saml/signing-status
 * - PUT  /saml/api/v1/admin/saml/providers/{id}/signing
 *
 * 这些接口晚于 @autional/shared 的生成版本，故在此用 apiClient 直连；
 * apiClient 已统一处理 snake↔camel 与 envelope 解包。
 */
import { apiClient } from '@autional/shared';

export interface SamlCertificateInfo {
	subject?: string;
	notBefore?: string;
	notAfter?: string;
	sha256Fingerprint?: string;
}

export interface SamlSigningStatus {
	hasKey?: boolean;
	signAuthnDefault?: boolean;
	signLogoutDefault?: boolean;
	certificate?: SamlCertificateInfo;
	nextCertificate?: SamlCertificateInfo;
}

export interface SamlSigningPolicyPayload {
	signAuthnRequests?: boolean;
	signLogout?: boolean;
	clear?: boolean;
	clearSignAuthn?: boolean;
	clearSignLogout?: boolean;
}

function unwrap<T>(res: { data?: unknown }): T {
	const data = res?.data as { data?: T } | T | undefined;
	if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
		return (data as { data: T }).data;
	}
	return data as T;
}

export async function getSamlSigningStatus(): Promise<SamlSigningStatus> {
	const res = await apiClient.get('/saml/api/v1/admin/saml/signing-status');
	return unwrap<SamlSigningStatus>(res);
}

export async function updateSamlSigningPolicy(id: string, payload: SamlSigningPolicyPayload) {
	const res = await apiClient.put(`/saml/api/v1/admin/saml/providers/${id}/signing`, payload);
	return unwrap<Record<string, unknown>>(res);
}

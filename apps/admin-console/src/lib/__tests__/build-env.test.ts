import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readBuildEnv } from '../../../../../scripts/env.mjs';

// A2-R01 回归锁：部署构建必须下发 prod namespace；区域变量缺失/非法时保持 fail-closed。
// 严格门要求生产环境带齐区域变量，故 DEPLOY_ENV 必须齐全，否则 readBuildEnv 先抛错。
const DEPLOY_ENV = {
	VERCEL_ENV: 'production',
	REGION: 'cn',
	SITE_URL: 'https://admin.autional.cn',
	CDN_HOST: 'https://cdn.autional.cn',
};

describe('构建期 API namespace（A2-R01 回归锁）', () => {
	it('本地无部署变量 → dev', () => {
		expect(readBuildEnv({}).apiNamespace).toBe('dev');
	});

	it('production → prod', () => {
		expect(readBuildEnv(DEPLOY_ENV).apiNamespace).toBe('prod');
	});

	it('preview → prod', () => {
		expect(readBuildEnv({ ...DEPLOY_ENV, VERCEL_ENV: 'preview' }).apiNamespace).toBe('prod');
	});

	it('API_NAMESPACE 显式覆盖部署默认值', () => {
		expect(readBuildEnv({ ...DEPLOY_ENV, API_NAMESPACE: 'dev' }).apiNamespace).toBe('dev');
	});

	it('非法 API_NAMESPACE → 抛错', () => {
		expect(() => readBuildEnv({ ...DEPLOY_ENV, API_NAMESPACE: 'staging' })).toThrow(/API_NAMESPACE/);
	});

	it('生产缺区域变量 → 抛错，不回落本机值', () => {
		expect(() => readBuildEnv({ VERCEL_ENV: 'production' })).toThrow(/区域环境变量/);
	});

	it('gen-env.mjs 取值自 buildEnv（防再次硬编码）', () => {
		const source = readFileSync(resolve(process.cwd(), '../../scripts/gen-env.mjs'), 'utf8');
		expect(source).toContain('VITE_API_NAMESPACE: "${buildEnv.apiNamespace}"');
		expect(source).not.toMatch(/VITE_API_NAMESPACE:\s*"(dev|prod)"/);
	});
});

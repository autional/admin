export type Region = 'cn' | 'com';
export type Lang = 'zh' | 'en';
export type ApiNamespace = 'dev' | 'prod';

export interface BuildEnv {
  region: Region;
  siteUrl: string;
  defaultLang: Lang;
  fallbackLang: Lang;
  cdnHost: string;
  siteHost: string;
  rootDomain: string;
  apiNamespace: ApiNamespace;
}

export const CDN_PIN: string;
export function readBuildEnv(env?: Record<string, string | undefined>): BuildEnv;

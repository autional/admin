/**
 * Admin Console API functions
 * Uses @autional/shared unified apiClient (auto unwrap + camelCase conversion)
 */

import { apiClient as api } from '@autional/shared';

// All API functions migrated to ./api.generated.ts
// Re-export for backward compat:
export * from './api.generated';

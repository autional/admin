# Admin Console API 迁移指南

## 现状

`web/apps/admin-console/src/lib/api.ts` 包含：
- 60 行手写类型定义 (User, Role, Permission, ...)
- ~370 行手写 API 函数 (getUsers, createUser, ...)

## 迁移步骤

### Step 1: 类型替换

将文件顶部的类型定义替换为 generated 导入：

```diff
- export interface User {
-   id: string;
-   username: string;
-   ...
- }
+ import type { AuthUserResponse as User } from '@autional/shared/generated/types';
```

### Step 2: 函数映射

当前 admin-console 使用的函数 → generated 对应函数：

| admin-console | generated |
|--------------|-----------|
| `getUsers(params)` | `users(params)` |
| `getUser(id)` | `usersById(id)` |
| `createUser(data)` | `usersPost(data)` |
| `updateUser(id, data)` | `usersByIdPut(id, data)` |
| `deleteUser(id)` | `usersByIdDelete(id)` |
| `getRoles(params)` | `roles(params)` |
| `getRole(id)` | `rolesById(id)` |
| `createRole(data)` | `rolesPost(data)` |
| `updateRole(id, data)` | `rolesByIdPut(id, data)` |
| `deleteRole(id)` | `rolesByIdDelete(id)` |
| `getPermissions(params)` | `permissions(params)` |
| `getSessions(params)` | `sessions(params)` |
| `getAuditLogs(params)` | `auditLogs(params)` |
| `getApplications(params)` | `tenantApplications(params)` |
| `getTenantMembers(params)` | `tenantMembers(params)` |

### Step 3: 渐进式替换

```typescript
// api.ts — 渐进式迁移版
import type * as Types from '@autional/shared/generated/types';
import * as Generated from '@autional/shared/generated/api';

// 类型别名（向后兼容）
export type User = Types.AuthUserResponse;
export type Role = Types.RoleResponse;
export type Permission = Types.PermissionResponse;

// 重新导出 generated 函数（更名以兼容现有调用）
export const getUsers = Generated.users;
export const getUser = Generated.usersById;
export const createUser = Generated.usersPost;
export const deleteUser = Generated.usersByIdDelete;
// ... 逐一映射
```

## 建议

1. **优先替换类型** — 先改 import，不改函数名，减少风险
2. **逐函数替换** — 保持旧函数名作为 alias，渐进式切换
3. **完成后删除手写类型** — 全部替换后可删除 admin-console 的 interface 定义
4. **TypeCheck 通过后再提交** — 每步都跑 pnpm exec tsc --noEmit

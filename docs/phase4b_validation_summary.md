# Phase 4B QA Validation Summary

## Scope
- `/v1/merchant/pending-tasks`
- `/v1/merchant/sync/status`
- Toast polling / dedupe / visibility restore
- Dashboard sync status rendering
- Multi-tenant isolation
- State machine legal / illegal transition coverage

## Implementation audit snapshot

### Backend confirmed
- `backend/handlers/sync.go` 已实现 `GetPendingTasks` 与 `GetSyncStatus`
- `backend/cmd/server/main.go` 已注册 `/v1/merchant/pending-tasks` 与 `/v1/merchant/sync/status`
- `backend/jobs/sync_consumer.go` 已存在并在服务启动时启动 consumer
- `backend/models/app_sync_queue.go` 已具备 `status / retry_count / last_error / next_retry_at`

### Frontend confirmed
- `frontend/store/realtime.ts` 已实现 dedupe window、toast queue、sync status store
- `frontend/hooks/usePendingTasks.ts` 已实现 30s / 120s polling 切换
- `frontend/components/ToastContainer.tsx` 与 `ToastNotification.tsx` 已挂载
- Shop / Clinic Dashboard 已接入 `SyncStatusCard`

## Contract drift captured by QA assets
1. Backend `pending-tasks` 当前返回最小字段集（`type/entity_id/payload/created_at`），未返回富通知字段。
2. Frontend `api.ts` 的 Phase 4B client 期待 richer DTO，并且把 `X-Business-Type` 写死为 `clinic`。
3. 因此测试资产拆成两层：
   - 真实 API：验证当前后端最小契约与 tenant isolation
   - route mock：验证 Toast / dashboard UI 行为与截图基线

## Test asset updates
- 更新 `tests/phase4/phase4_p0.spec.ts`
  - API contract: `sync/status` + `pending-tasks`
  - Multi-tenant isolation: tenant1 触发的 order queue 不出现在 tenant2
  - Toast: polling / dedupe / visibility restore
  - Dashboard screenshots: shop / clinic
  - State machine: `paid -> preparing` allowed, completed item blocks preparing action
- 更新 `docs/phase4_supabase_checklist.md`
  - 改写为 Phase 4B sync/toast/dashboard 验收清单

## Execution note
- 2026-03-28 已实际执行：`npx playwright test tests/phase4/phase4_p0.spec.ts --reporter=list`。
- 执行结果：4 passed / 0 failed。
- 最后一个收敛问题来自测试稳定性，而不是 Phase4B 业务实现：订单状态机 UI 用例原先固定依赖 `paid -> prepare` 种子；现已改为动态选择任一可执行合法动作，并通过搜索订单号打开 Drawer，避免 `?selected=` URL 只开抽屉不拉详情的问题。

# Phase 4B Sync / Toast Validation Checklist

> 保留原文件名，当前内容已按 Phase 4B QA 验收重点重写。

## 1. 本轮验证范围
- [ ] `GET /v1/merchant/pending-tasks`
- [ ] `GET /v1/merchant/sync/status`
- [ ] Toast 轮询 / dedupe / 页面可见性恢复
- [ ] Shop / Clinic Dashboard sync status 卡片
- [ ] 多租户隔离
- [ ] 状态机合法/非法流转
- [ ] 关键页面截图基线

## 2. 当前实现基线（2026-03-27 审计）

### Backend
- [ ] `backend/handlers/sync.go` 已挂载 `/v1/merchant/pending-tasks` 与 `/v1/merchant/sync/status`
- [ ] `backend/cmd/server/main.go` 已在 protected merchant routes 注册上述接口
- [ ] `backend/jobs/sync_consumer.go` 已存在，包含 retry/backoff/dead_letter 基础逻辑
- [ ] `backend/models/app_sync_queue.go` 已包含 `status` / `retry_count` / `last_error` / `next_retry_at`

### Frontend
- [ ] `frontend/store/realtime.ts` 已实现 pending task polling、toast queue、30s dedupe window、最多 3 条 toast
- [ ] `frontend/hooks/usePendingTasks.ts` 已实现前台 30s、后台 120s 的轮询切换
- [ ] `frontend/components/ToastContainer.tsx` / `ToastNotification.tsx` 已接入
- [ ] `frontend/components/SyncStatusCard.tsx` 已接入 Shop / Clinic Dashboard

## 3. `/v1/merchant/pending-tasks` API 验收点
- [ ] 返回 envelope：`{ code, data, message }`
- [ ] `data.tasks` 为数组
- [ ] `data.count === data.tasks.length`
- [ ] 每个 task 至少包含：`type` / `entity_id` / `payload` / `created_at`
- [ ] 只返回当前 tenant 的最近 5 分钟 pending 任务
- [ ] tenant A 新产生的 queue/task 不会出现在 tenant B 的结果里

## 4. `/v1/merchant/sync/status` API 验收点
- [ ] 返回 envelope：`{ code, data, message }`
- [ ] `data.orders.last_synced_at / pending_count / failed_count` 存在
- [ ] `data.appointments.last_synced_at / pending_count / failed_count` 存在
- [ ] `data.notifications_sent_today` 存在
- [ ] `data.dead_letter_count` 存在
- [ ] tenant A 的状态变化不会污染 tenant B 的聚合结果

## 5. Toast / Polling / Dedupe 验收点
- [ ] Dashboard 挂载后会立即请求 pending tasks
- [ ] 页面可见时按 30s 轮询
- [ ] 页面隐藏时降频到 120s
- [ ] 页面恢复可见时立即补拉一次
- [ ] 同一 `dedupe_key` 在 30s 窗口内不会重复弹 toast
- [ ] 同时最多显示 3 条 toast
- [ ] Toast 支持手动关闭与 5s 自动消失
- [ ] Toast 至少覆盖 `new_order` / `new_appointment` / `sync_failed` / `followup_overdue`

## 6. Dashboard Sync Status 验收点
- [ ] Shop Dashboard 展示真实 sync status card
- [ ] Clinic Dashboard 展示真实 sync status card
- [ ] 卡片字段来自 realtime store，而不是页面内 mock 常量
- [ ] 关键页面截图基线存在：shop dashboard / clinic dashboard / toast state

## 7. 多租户隔离 & 状态机验收点
- [ ] tenant 1 的订单/待办/同步状态不会泄漏给 tenant 2
- [ ] tenant 2 的 clinic 数据不会泄漏给 tenant 1 的页面上下文
- [ ] 合法流转：例如 shop `paid -> preparing` 成功
- [ ] 非法流转：例如 shop `completed -> preparing` 被拦截（UI 不给入口或 API 返回错误）

## 8. 当前仓库审计发现的 contract drift
- [ ] **已记录**：`backend/handlers/sync.go` 当前返回的是 Phase 4B 最小 DTO；并未输出 cursor / dedupe_key / title / summary / action 等富通知字段。
- [ ] **已记录**：`frontend/lib/api.ts` 当前 `getMerchantSyncStatus()` / `getMerchantPendingTasks()` 把 `X-Business-Type` 写死为 `clinic`，会影响 shop dashboard 契约验证。
- [ ] **已记录**：因此本轮 Playwright 资产同时包含“真实 API 最小契约断言”和“前端 route mock 行为断言”，用于分别验证后端接口与前端 Toast/UI 行为。

## 9. 本轮已整理的测试资产
- [ ] `tests/phase4/phase4_p0.spec.ts`
  - API：`sync/status` / `pending-tasks`
  - 多租户隔离：tenant A 订单状态变更后，tenant B 不应看到对应 pending task
  - Toast：轮询、dedupe、visibility restore
  - Dashboard：Shop / Clinic sync status 卡片截图
  - 状态机：合法 / 非法流转

## 10. 执行提示
- [ ] 测试 baseURL 固定为 `http://localhost:3000`
- [ ] 后端直连地址为 `http://localhost:8080`
- [ ] 登录密码通过 `process.env.TEST_PASSWORD` 注入
- [ ] 本轮仅整理文档与测试资产，未在当前会话执行 Playwright

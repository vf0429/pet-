# Phase 4 Supabase Checklist

## 1. Schema / Migration
- [ ] `app_sync_queue` 已包含：`next_retry_at`、`last_attempt_at`、`sent_at`、`dead_lettered_at`、`dead_letter_reason`
- [ ] `app_sync_queue.status` 枚举仍兼容：`pending | sent | failed | dead_letter`
- [ ] `idempotency_keys` 表已创建
- [ ] `idempotency_keys.key` 为主键/唯一键
- [ ] `idempotency_keys.request_hash`、`processing_status`、`expires_at`、`last_seen_at` 字段存在
- [ ] `app_sync_queue` 相关索引已迁移：tenant/status、tenant/entity、tenant/retry
- [ ] `idempotency_keys` 相关索引已迁移：tenant/entity、`processing_status`、`expires_at`

## 2. Data Safety / Multi-tenant Isolation
- [ ] 所有 Phase 4 查询都显式带 `tenant_id`
- [ ] `/merchant/sync/status` 在 shop / clinic 视角下只返回当前 tenant 数据
- [ ] `/merchant/pending-tasks` 不会混入其他 tenant 的订单/预约/病历/随访
- [ ] Supabase 环境若启用 RLS，需补 tenant 维度策略或确认 API 层已完全托管隔离

## 3. Consumer / Retry / Dead Letter
- [ ] consumer 扫描条件与契约一致：`status in (pending, failed)` 且 `retry_count < 3`
- [ ] `next_retry_at IS NULL OR <= now()` 的兼容逻辑已生效
- [ ] 第 1 次失败后退避约 30s
- [ ] 第 2 次失败后退避约 2m
- [ ] 第 3 次失败进入 `dead_letter`
- [ ] 不可重试错误（invalid payload / invalid idempotency / permanent provider error）直接进入死信
- [ ] `dead_letter_reason` 写入值可追踪：`max_retry_exceeded` / `invalid_payload` / `invalid_idempotency_key` / `permanent_provider_error`

## 4. Idempotency
- [ ] 幂等键格式符合：`{entity_type}_{entity_id}_{action}_{updated_at_unix}`
- [ ] 同 key + 同 hash 重复派发时命中缓存响应
- [ ] 同 key + 不同 hash 被拦截
- [ ] `expires_at` TTL 为 30 分钟
- [ ] 过期清理任务按 10 分钟节奏运行或有等价替代机制

## 5. API Contract
- [ ] `GET /merchant/sync/status` 返回 `{code,data,message}` envelope
- [ ] `GET /merchant/pending-tasks` 返回 `{code,data,message}` envelope
- [ ] 请求必须同时带 `X-Session-ID` 与 `X-Business-Type`
- [ ] `sync/status` 字段名保持 snake_case，前端映射正常
- [ ] `pending-tasks.cursor` 可用于增量轮询
- [ ] `pending-tasks.tasks[].dedupe_key` 稳定可复现

## 6. Frontend Runtime
- [ ] layout 首次进入会立即请求 `pending-tasks`
- [ ] 页面可见时按 30s 轮询；隐藏时降频到 120s 或等价策略
- [ ] 同一 `dedupe_key` 在 30s 窗口内不会重复 toast
- [ ] 最多只显示 3 条 toast
- [ ] Shop Dashboard / Clinic Dashboard 都有同步状态卡片
- [ ] 关键页面截图基线已更新

## 7. Manual Verification Commands
- [ ] 后端 schema 抽查：`sqlite3 backend/petwell.db ".schema idempotency_keys"`
- [ ] 表存在性抽查：`sqlite3 backend/petwell.db "SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_keys';"`
- [ ] 队列字段抽查：`sqlite3 backend/petwell.db "PRAGMA table_info('app_sync_queue');"`
- [ ] 如已迁移到 Supabase/Postgres，改用 `psql`/Supabase SQL Editor 执行同等检查

## 8. Current Notes
- 本轮 Codex 仅产出 QA 资产，未执行 Playwright。
- 若运行时发现前端 `sync/status` 未携带 `X-Business-Type`，需优先修复请求头链路后再做回归。
- 若 seed 数据不足以稳定触发 `sync_failed` / `medical_record_pushed`，建议继续保留浏览器 route mock 用例做前端行为回归。

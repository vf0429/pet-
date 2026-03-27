# Phase 4 执行说明与当前缺口记录

## 1. 本轮背景

- 时间：2026-03-26
- 场景：推进 PetWell Merchant Phase 4（App 联调）
- 限制：Kimi quota 不足，因此 backend / qa 由 Codex 临时接管分析与契约输出
- 边界：本轮不直接实现后端/前端代码，只补齐文档与执行说明

---

## 2. 当前代码基线结论

### 2.1 已有能力

- 已有 `app_sync_queue` 模型：`backend/models/app_sync_queue.go`
- 已有 3 处事务内写队列：
  - `backend/handlers/shop_orders.go`
  - `backend/handlers/clinic_appointments.go`
  - `backend/handlers/clinic_visits.go`
- 已有统一前端 API client：`frontend/lib/api.ts`
- 已有商家后台统一壳：`frontend/app/merchant/layout.tsx`

### 2.2 未完成能力

- 未发现 `GET /merchant/sync/status`
- 未发现 `GET /merchant/pending-tasks`
- 未发现 `sync_consumer` job
- 未发现 `idempotency_keys` 模型
- 未发现 layout 级轮询 hook / ToastCenter
- Shop / Clinic Dashboard 的 App 同步卡片仍未完全接入新聚合接口

---

## 3. 推荐实施顺序（后续实现阶段）

1. **模型层**
   - 扩展 `AppSyncQueue`
   - 新增 `IdempotencyKey`
   - 补 AutoMigrate

2. **任务消费层**
   - 新增 `backend/jobs/sync_consumer.go`
   - 在 `cmd/server/main.go` 启动 `StartSyncConsumer(db, 30*time.Second)`
   - 明确 `dispatchToApp` 占位实现与日志格式

3. **聚合接口层**
   - 新增 `GET /merchant/sync/status`
   - 新增 `GET /merchant/pending-tasks`
   - 两接口统一放在 MerchantAuthMiddleware 之后

4. **前端接入层**
   - `frontend/lib/api.ts` 新增 Phase 4 DTO / VM / API 方法
   - `frontend/app/merchant/layout.tsx` 挂载轮询与 Toast 容器
   - Shop / Clinic Dashboard 改为读取 `getMerchantSyncStatus`

5. **测试层**
   - 先跑接口结构验证
   - 再跑失败重试 / dead_letter / 幂等等行为用例

---

## 4. 风险与注意事项

- 当前 `backend/cmd/server/main.go` 与 `backend/routes.go` 均有路由装配语义；实现阶段应统一入口，避免新接口只加一处。
- 当前仓库未见 iOS Codable 源码；Phase 4 payload 对齐只能先延续 Phase 3 契约，不应擅自改动 `medical_record` payload 字段名。
- `app_sync_queue.payload` 当前为 `string` 文本存储；迁移 Supabase/Postgres 时可后续再评估 JSONB，不建议在本轮契约内强制破坏现状。
- 历史数据未必含 `next_retry_at`，consumer 必须做空值兼容。

---

## 5. 本轮文档产出

- 已新增：`docs/phase4_contract.md`
- 已新增：`docs/phase4_execution_notes.md`
- 已更新：`task_plan.md`
- 已更新：`findings.md`
- 已更新：`progress.md`

---

## 6. 建议下一步

- 由实现角色按 `docs/phase4_contract.md` 逐项落地。
- 实现前优先确认：
  1. 路由唯一装配入口
  2. queue schema migration 方式
  3. 前端 Toast 是否复用现有组件体系或新建全局 store
  4. QA 是先 mock `dispatchToApp` 还是先接真实推送沙箱

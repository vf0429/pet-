# Sync Consumer Code Review

## Findings

1. **ConsumeAppSyncQueue 查询是否在事务之外执行：OK**
   - `backend/jobs/sync_consumer.go:34-39` 直接使用 `db.Where(...).Find(&tasks)` 查询待消费任务，没有包在显式 `db.Transaction(...)` 中。
   - 这满足 Phase4B Step 1 的基本要求：不会把尚未提交事务中的写入和消费耦合在同一个事务里。
   - 补充提醒：当前实现也没有“claim/lock”步骤；如果未来启动多个 consumer 实例，仍可能并发抓取同一批 `pending` 记录，造成重复 dispatch。

2. **dead_letter 标记的并发安全 / 索引建议：ISSUE**
   - `backend/jobs/sync_consumer.go:69-72` 使用批量更新：`WHERE status = 'pending' AND retry_count >= 3` → `status = 'dead_letter'`。该更新本身是幂等的，但并不能解决多 consumer 并发下的重复抓取/重复处理问题。
   - `backend/models/app_sync_queue.go` 当前只有：
     - `idx_app_sync_queue_tenant_status (tenant_id, status)`
     - `idx_app_sync_queue_tenant_entity (tenant_id, entity_type, entity_id)`
     - `next_retry_at` 单列索引
   - 缺少面向 consumer 扫描条件的复合索引，例如 `(status, retry_count, next_retry_at, created_at)`；这会让 `status='pending' AND retry_count < 3 AND (next_retry_at IS NULL OR next_retry_at <= ?)` 的扫描效率和并发行为都不够稳。
   - 另外，`dead_letter` 标记本身并不适合靠 `uniqueIndex` 解决；真正需要唯一约束的是“逻辑上同一条队列任务不能重复入列”的 identity（例如 tenant/entity/action/idempotency 维度），否则重复 pending 记录仍可能被多次消费。

3. **next_retry_at 退避逻辑是否为 30s / 2min / 10min：ISSUE**
   - `backend/jobs/sync_consumer.go:51-52` 先执行 `retryCount := task.RetryCount + 1`，再把 `retryCount` 传给 `calculateBackoff(retryCount)`。
   - 但 `calculateBackoff` 的 switch 是按 `0 -> 30s, 1 -> 2min, 2 -> 10min` 定义的（`backend/jobs/sync_consumer.go:96-103`）。
   - 结果变成：
     - 第 1 次失败（原 `RetryCount=0`）→ 传入 `1` → 实际退避 **2min**
     - 第 2 次失败（原 `RetryCount=1`）→ 传入 `2` → 实际退避 **10min**
     - 第 3 次失败（原 `RetryCount=2`）→ 传入 `3` → 仍是 **10min**
   - 这与规格要求的 `30s / 2min / 10min` 不一致。应按“失败前的 retry_count”计算退避，或调整 `calculateBackoff` 的入参语义。

4. **dispatchTask 是否存在 panic 风险，是否需要 recover：ISSUE**
   - 当前 mock 实现（`backend/jobs/sync_consumer.go:82-89`）只做日志打印并 `return nil`，短期内几乎没有 panic 路径。
   - 但 `StartSyncConsumer` 在 goroutine 中持续执行消费逻辑（`backend/jobs/sync_consumer.go:17-21`）；一旦未来 `dispatchTask` 接入真实 APNs/FCM/JSON 解析/第三方 SDK，panic 会直接打崩该 goroutine，后台 consumer 将静默停止。
   - 因此建议在 `dispatchTask` 内，或更稳妥地在 `ConsumeAppSyncQueue` 的单任务执行边界增加 `defer recover()`，把 panic 转成 error 并写回 `last_error`。

## Required Fixes (if any)

1. **修复退避逻辑**
   - 文件：`backend/jobs/sync_consumer.go`
   - 位置：`ConsumeAppSyncQueue` / `calculateBackoff`
   - 要求：保证三次重试窗口严格为：首次失败 `30s`，第二次失败 `2min`，第三次失败 `10min`。

2. **增加 panic recover 保护**
   - 文件：`backend/jobs/sync_consumer.go`
   - 位置：`dispatchTask` 或 `ConsumeAppSyncQueue` 的单任务处理边界
   - 要求：使用 `defer func(){ if r := recover(); ... }()` 将 panic 转成 error，避免 consumer goroutine 因单条任务异常整体退出。

3. **补充 consumer 查询索引，并重新审视唯一性约束**
   - 文件：`backend/models/app_sync_queue.go`
   - 要求：至少增加贴合消费扫描条件的复合索引（建议覆盖 `status + retry_count + next_retry_at + created_at`）。
   - 若业务要求“同一逻辑事件只能入列一次”，应额外引入专用唯一键（如 `idempotency_key` 或 `(tenant_id, entity_type, entity_id, action, updated_at/version)` 唯一约束），而不是对 `dead_letter` 状态本身加唯一索引。

4. **多 consumer 场景的并发消费保护（建议项）**
   - 文件：`backend/jobs/sync_consumer.go`
   - 要求：后续如需多实例部署，应增加 claim/lock 机制（例如 `SELECT ... FOR UPDATE SKIP LOCKED` 或先原子更新状态再 dispatch），避免同一 `pending` 任务被并发重复消费。

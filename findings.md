# Findings

## 初始观察
- LEADER_PROMPT 当前未显式要求 agent team 使用 Planning with Files。
- 仓库根目录存在 `.env`、`opencode.json`、`.opencode/`。

## 配置初查
- `.env` 当前仅包含 `KIMI_API_KEY`、`MINIMAX_API_KEY`、`CODEX_API_KEY`、`ANTHROPIC_API_KEY`、`TEST_PASSWORD`。
- `LEADER_PROMPT.md` 当前未要求使用 Planning with Files，也未要求阶段性写入 `task_plan.md` / `findings.md` / `progress.md`。
- `.opencode/agents/*.md` 已为不同 agent 指定模型，但未统一要求使用 Planning with Files。

## CLI 行为
- `opencode providers list` 能识别 `KIMI_API_KEY` 与 `MINIMAX_API_KEY`，说明 provider env 名称本身大概率没写错。
- `opencode models <provider>` 报错包含 `Failed to fetch models.dev` 和 `Failed to run the query PRAGMA wal_checkpoint(PASSIVE)`，说明当前还存在本地 CLI 运行环境/数据库状态问题，未必是 provider 本身失效。

## 核心结论
- OpenCode / OpenClaw **不会自动读取项目根目录 `.env`**；在干净环境下运行 `opencode providers list` 时不再识别 `KIMI_API_KEY`/`MINIMAX_API_KEY`。
- `set -a; source .env; set +a` 后，`opencode providers list` 可以识别 `KIMI_API_KEY` 与 `MINIMAX_API_KEY`。
- `~/.local/share/opencode/auth.json` 中已有 `minimax` 与 `codex` 凭证，因此它们即使不依赖项目 `.env` 也能工作；`kimi` 当前不在 auth.json 中，更依赖 shell 导出的环境变量。
- 因此本次 Kimi 问题的根因更像是 **脚本 `source .env` 但没有 `export`，导致子进程 `opencode run` 拿不到 KIMI_API_KEY**。

## 追加测试（2026-03-26）
- 通过提权网络环境 + 临时干净数据目录，`petwell-frontend`（MiniMax）在 opencode 中成功返回：`嗨`。
- 当前全局 opencode 配置中的 Codex baseURL 为 `https://claudechn.com/v1`，这看起来不适合当前 opencode 直连测试。
- 使用临时 opencode 配置把 Codex baseURL 改为 `https://claudechn.com/codex` 或 `https://claudechn.com/codex/v1` 后，`opencode run -m codex/gpt-5.4` 成功返回：`嗨`。
- 因此：MiniMax 当前可用；Codex provider 也可用，但全局 opencode 配置里的 Codex baseURL 很可能写错了，应优先改到 `/codex` 路径。

## 追加测试（配置修改后）
- 已备份并修改全局 opencode 配置：`/Users/vfzzz/.config/opencode/opencode.json`，Codex baseURL 改为 `https://claudechn.com/codex`。备份文件：`/Users/vfzzz/.config/opencode/opencode.json.bak.20260326-223145`。
- 使用更新后的全局配置，`opencode run -m codex/gpt-5.4` 成功返回：`嗨`。
- 使用 Kimi 官方 coding endpoint `https://api.kimi.com/coding/v1/chat/completions` 直连测试时，返回的是 quota 错误，而不是鉴权错误或 404：说明 key/endpoint 基本是通的，但当前额度不足。
- `GET /coding/v1/models` 返回 HTTP 200，也进一步说明 Kimi endpoint 可达。

## Session Start
- 目录同步 start：根目录 DIRECTORY/master_progress/WORK_CONTEXT 未发现可恢复文件，改为基于 repo 内 planning files 恢复上下文。
- 本轮目标：启动 Phase 4，优先使用 Codex + MiniMax，禁用 Kimi。

## 临时执行策略
- 本轮 Phase 4 因 Kimi quota 不足，backend/qa agent 暂时改用 Codex。

## Phase 4 契约分析结论（2026-03-26）
- 当前后端已在 3 个业务写入点原子写入 `app_sync_queue`：
  - `shop_orders.go`：订单状态变更写入 `entity_type=order`、`action=status_changed`
  - `clinic_appointments.go`：预约状态变更写入 `entity_type=appointment`、`action=status_changed`
  - `clinic_visits.go`：病历推送写入 `entity_type=medical_record`、`action=record_published`
- 当前 `backend/models/app_sync_queue.go` 仅包含 `status/retry_count/last_error`，尚未包含 Phase 4 计划要求的 `next_retry_at`、消费时间戳、死信归档辅助字段。
- 当前 `backend/cmd/server/main.go` 尚未挂载 `GET /merchant/sync/status`、`GET /merchant/pending-tasks`，也尚未启动队列 consumer job。
- 当前 `frontend/app/merchant/layout.tsx` 仅负责鉴权壳与 Sidebar/TopBar，尚未挂载轮询 hook / Toast 容器。
- 当前 Shop/Clinic Dashboard 的 App 同步卡片仍为 Mock；其中 Clinic Dashboard 使用的是 `GET /merchant/clinic/stats` 内的旧 `sync_status` 三字段（`pending_count/failed_count/last_synced_at`），不足以覆盖 Phase 4 的跨业务状态卡片需求。
- 当前 `frontend/lib/api.ts` 已统一承担 Phase 1-3 API 封装，Phase 4 应继续沿用该入口，新增 `getMerchantSyncStatus` / `getMerchantPendingTasks` 等方法，禁止页面直接 `fetch`。
- Phase 4 契约需显式保证 Phase 1-3 兼容：
  - 鉴权继续依赖 `MerchantAuthMiddleware`
  - 新接口继续使用 `{"code":0,"data":...,"message":"ok"}` 包裹格式
  - 既有 `app_sync_queue` 写入 payload 与状态机语义保持不变
  - 旧 Dashboard 内嵌 `sync_status` 不删除，改为与新聚合同步接口并存
- 幂等键建议不侵入 Phase 1-3 现有业务表；新增 `idempotency_keys` 独立表即可，键格式延续 Phase 4 详细计划：`{entity_type}_{entity_id}_{action}_{updated_at_unix}`。

## 当前阻塞/风险
- 仓库内尚未发现 iOS App Codable 模型源码，因此本轮只能基于 Phase 3 已发布 payload 契约做兼容延续，不能完成真实字段级对照验收。
- 现有后端主程序与 `backend/routes.go` 存在路由装配分散现象；Phase 4 真正落地时需明确以 `cmd/server/main.go` 还是 `backend.SetupRoutes` 为唯一装配入口，避免新接口遗漏。

## Phase 4 后端实现前补充发现（2026-03-26）
- `backend/middleware/auth.go` 当前对鉴权失败仍返回旧式 `{error, message}` 结构；本轮仅保证新 handler 返回 `{code,data,message}`，不主动重构旧中间件语义。
- 现有 3 个 `app_sync_queue` 写入点都已在 `db.Transaction(...)` 内提交，符合"业务写入 + queue 入列同事务"要求。
- 现有 `shop_orders.go`、`clinic_appointments.go`、`clinic_visits.go` 已在状态变更前调用各自状态机校验；Phase 4 需要额外给 `AppSyncQueue` 自身补充状态流转校验函数，避免 consumer 非法写状态。
- `backend/routes.go` 目前只挂了 `/merchant/me`，而 `backend/cmd/server/main.go` 才是实际完整路由装配入口；新增接口需要两处都补齐，避免后续入口切换时遗漏。
- `app_sync_queue.payload` 现为 string 文本，且 `medical_record` 负载采用外层 envelope + 内层 payload 结构；consumer / pending-tasks 需要做兼容解析，不能假定单一 JSON 形状。
- 新接口必须基于 `middleware.GetAuthContext(c)` 取 `tenant_id` 与 `RequestedBusinessType`，所有查询都要显式带 `WHERE tenant_id = ?`。

## Phase 4 前端实现完成记录（2026-03-26 MiniMax）
- Phase 4 前端新增文件：6个
  - `frontend/store/realtime.ts` - Zustand store for sync status + pending tasks + toast queue
  - `frontend/hooks/usePendingTasks.ts` - Polling hook (30s normal, 2min when hidden)
  - `frontend/components/ToastNotification.tsx` - Per-toast UI with variant colors/icons
  - `frontend/components/ToastContainer.tsx` - Global stacked toast container
  - `frontend/components/SyncStatusCard.tsx` - Reusable sync status card for Shop/Clinic dashboards
- Phase 4 前端修改文件：4个
  - `frontend/lib/api.ts` - Phase 4 DTOs/VMs + `getMerchantSyncStatus()` + `getMerchantPendingTasks()`
  - `frontend/app/merchant/layout.tsx` - Mounted ToastContainer + started polling on auth
  - `frontend/app/merchant/shop/dashboard/page.tsx` - Replaced mock sync card with real `SyncStatusCard`
  - `frontend/app/merchant/clinic/dashboard/page.tsx` - Replaced mock sync card with real `SyncStatusCard`
- 关键实现细节：
  - Toast dedup: 30s window using `dedupeKey` + `recentlyShownKeys` Map in store
  - Max 3 visible toasts at once
  - Visibility change handler reduces poll to 2min when tab hidden
  - `usePendingTasks` polls on mount; `fetchSyncStatus` called separately in each dashboard
  - All API calls go through `lib/api.ts`, no direct `fetch` in pages

## Phase 4 QA 资产补充发现（2026-03-26 Codex）
- `backend/routes.go` 已挂载 `GET /merchant/sync/status` 与 `GET /merchant/pending-tasks`；当前 QA 可以直接通过前端 rewrite `/api/merchant/*` 或后端 `:8080` 直连验证。
- `backend/handlers/merchant_sync.go` 的待处理任务并不完全来自 `app_sync_queue`：
  - shop 的 `new_order` 来自 `shop_orders`
  - clinic 的 `new_appointment` / `followup_overdue` 来自业务表
  - `sync_failed` / `medical_record_pushed` 来自 `app_sync_queue`
  因此 P0 测试需要同时覆盖“聚合接口正确性”和“前端 Toast 消费行为”，不能只盯队列表。
- `frontend/app/merchant/layout.tsx` 在认证后会立刻执行一次 `fetchPendingTasks()`，同时 `usePendingTasks()` mount 时也会立即拉取一次；真实运行中首屏可能出现两次 very-close 请求，前端依赖 `dedupe_key` 窗口去重避免重复 toast。
- `frontend/store/realtime.ts` 当前 dedupe 仅基于内存 `recentlyShownKeys`，页面刷新会丢失窗口状态；这符合当前契约，但回归时应重点关注“刷新后重复弹 toast”是否被业务接受。
- `frontend/lib/api.ts` 的 Phase 4 API 没有显式传 `X-Business-Type` header，而是依赖登录态中的 active business 与页面现有流转；如果后续真实请求异常，需要优先复核前端请求头拼装与 rewrite 链路。
- `backend/petwell.db` 已存在于仓库内；`backend/cmd/server/main.go` 使用 SQLite `petwell.db` 并在启动时 `AutoMigrate`，因此 `idempotency_keys` 可通过 schema smoke test 或人工 sqlite 检查验证。

## 当前 QA 阻塞/风险
- 本轮未执行 Playwright，无法确认当前 seed 数据是否稳定覆盖 `sync_failed` / `dead_letter` / `medical_record_pushed` 的可视化路径；相关断言需依赖运行时数据或 route mock。
- 现有前端对 Toast / pending-tasks 的选择器语义化程度有限（主要依赖文本与 `aria-label="Notifications"`），后续若文案波动，截图和文本断言会较脆弱。

## QA 产出补记
- 已生成 `tests/phase4/phase4_p0.spec.ts`。
- 已生成 `docs/phase4_supabase_checklist.md`。
- QA agent 在最终回写收尾阶段超时，但文件产出已落盘。

## 2026-03-27 incremental findings
- Re-opening app integration audit to enumerate all app-side direct Merchant/backend connections before revising Phase 4 plan.

## Vaccination Replan Findings (2026-03-27)
- `dev.sh` 已确认新 Merchant Portal 前端本地端口为 `3500`，backend/internal API 仍为 `8080`。
- `frontend/next.config.js` 表明 Portal 前端只是把 `/api/merchant/*` rewrite 到 `http://localhost:8080/merchant/*`，因此 `3500` 是 Web 入口，不应直接作为 App API contract。
- App 当前明确直连 Merchant 的代码仍只在 `PetWell/Views/Medical/VaccineBookingView.swift`，且它还停留在旧 `8090 + /api/merchant/* + X-Session-ID` 方案。
- 用户已明确否定“App 直接连 Portal 端口”方案，并要求采用类似 Supabase 的方式：稳定 `Project URL + Public/App Key`。
- 因此新的 OpenCode 起始任务不应继续围绕旧 Phase 4 realtime/sync_queue 实现，而应先完成 Vaccination 的 facade 化重规划与文档化。
- `specs/.env.keys` 含真实密钥，不能进入 git 基线；已改为通过 `.gitignore` 排除。

## Vaccination Contract Findings (2026-03-27)
- `Portal URL`、`Merchant internal API`、`App-facing facade URL` 必须拆开定义：
  - Portal URL = merchant staff browser UI（本地 3500）
  - internal API = `/merchant/*` + `X-Session-ID` + `X-Business-Type`（本地 8080）
  - facade URL = `${Merchant Project URL}/app/v1/*`（App 唯一正式入口）
- 当前 Merchant internal API 明显是商家员工会话 API，不适合作为 consumer App contract：`middleware/auth.go` 强依赖 `X-Session-ID`、`X-Business-Type`、tenant/user session。
- 当前 Merchant clinic 数据主表 `clinic_appointments` 可承接 Vaccination booking 的 Portal 可见性，但它缺少外部 booking identity 与 project/key/binding 元数据；因此必须补充 facade 支撑表，而不是让 App 直接复用 merchant session 模型。
- 旧 App bridge 中 `doctor_id = "testclinics_frontdesk"` 与 `pet_id = petName` 都是测试态占位，不可直接升级为正式合同字段；正式合同必须改为 `clinic_integration_id`、`external_booking_id`、`pet.id` 等稳定标识。
- 已建议首期 facade 只暴露 3 个核心读写能力：availability、create booking、get booking status；这样既满足 Vaccination，又避免扩散到其他 Merchant 功能。

## 当前阻塞/风险（Vaccination）
- 仓库中尚无 `MerchantProject` / `MerchantAppKey` / `ClinicIntegrationBinding` / `VaccinationBookingFacade` 表与模型，OpenCode 落地前需先建 schema。
- 仓库中尚无 `/app/v1/*` 路由命名空间；若直接复用 `/merchant/*` 会再次回到旧的会话式设计。
- 目前未见稳定的 clinic project provisioning 流程，因此 `Merchant Project URL` 与 `Merchant Public/App Key` 的签发/轮换仍需 backend 进一步细化。
- 当前 App 侧只有一个旧 Swift 文件可见；本轮可以完成 Vaccination 文档重规划，但不能替代完整 App 迁移实施验证。

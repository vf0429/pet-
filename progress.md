# Progress

- 2026-03-26: 开始排查 LEADER_PROMPT 与 OpenClaw 环境配置。
- 已读取 `LEADER_PROMPT.md` 与 `planning-with-files` skill。

- 已初查 `.env`、`opencode.json`、`.opencode/agents/*`。

- 运行 `opencode providers list` 成功读取 env provider。
- 运行 `opencode models kimi|minimax|codex` 失败，转而检查 opencode 本地日志。

- 已修改 LEADER_PROMPT / opencode instructions / agent 配置，强制使用 Planning with Files。
- 已修复 `specs/run_phase.sh` 与 `specs/run_phase_tmux.sh` 的 `.env` 导出方式。
- 已将 backend/qa agent 模型改为 Kimi，并保留 frontend=MiniMax、pm=Codex。

- 已完成本轮排查与配置修复，准备向用户汇报。

- 已完成 MiniMax / Codex 联通性复测。MiniMax 在 opencode 成功返回；Codex 需调整 opencode 全局 baseURL 后成功返回。

- 已修改全局 opencode Codex baseURL 并验证成功。
- 已补测 Kimi：endpoint 可达，但当前返回配额不足。

- 2026-03-26: 启动 Phase 4 执行。
- directory-index-sync:start：未发现可用的 DIRECTORY.md / master_progress.md / WORK_CONTEXT.md，改为使用 repo 内 planning files 恢复上下文。
- 临时分工：PM=Codex，Backend=Codex，Frontend=MiniMax，QA=Codex。

- 临时将 petwell-backend / petwell-qa 的 agent model 切换到 Codex，以绕过 Kimi quota 限制。

- 2026-03-26：已完成 Phase 4 需求、Phase 3 契约、当前 sync_queue / dashboard / merchant layout / frontend api client 代码基线阅读。
- 已确认本轮仅产出契约与执行说明，不擅自实现后端/前端代码。
- 已识别 Phase 4 当前缺口：`/merchant/sync/status`、`/merchant/pending-tasks`、sync consumer、`idempotency_keys`、layout 轮询/Toast 挂载、Dashboard 同步卡片真实化。
- 下一步：写入 `docs/phase4_contract.md` 与 `docs/phase4_execution_notes.md`，并回写 planning files 的关键结论/阻塞项/建议。

- 2026-03-26：收到新的 backend 实现指令，范围切换为直接落地 Phase 4 后端。
- 已按要求优先读取并更新 `task_plan.md`、`findings.md`、`progress.md`。
- 已重读 `docs/phase4_contract.md`、`docs/phase4_execution_notes.md`、`backend/cmd/server/main.go`、`backend/routes.go`、`backend/models/app_sync_queue.go` 以及现有 sync_queue 写入 handlers。
- 已确认：现有 sync_queue 写入点均在事务内；`MerchantAuthMiddleware` 提供 `TenantID` / `RequestedBusinessType`；需要兼容旧式中间件错误结构但保证新接口统一 envelope。
- 下一步：实现 `AppSyncQueue` 扩展字段、`IdempotencyKey`、`sync_consumer`、`GET /merchant/sync/status`、`GET /merchant/pending-tasks` 与对应 tests。

- 2026-03-26 (MiniMax Frontend)：Phase 4 前端实现完成。
- 已按任务要求严格使用 Planning with Files，读取并更新 `task_plan.md`、`findings.md`、`progress.md`。
- 实现内容：
  - 新增 `frontend/lib/api.ts` Phase 4 DTO/VM/API（`getMerchantSyncStatus`, `getMerchantPendingTasks`）
  - 新增 `frontend/store/realtime.ts` Zustand store
  - 新增 `frontend/hooks/usePendingTasks.ts` 轮询 hook
  - 新增 `frontend/components/ToastNotification.tsx` + `ToastContainer.tsx` 全局 Toast
  - 新增 `frontend/components/SyncStatusCard.tsx` 可复用同步状态卡片
  - 更新 `frontend/app/merchant/layout.tsx` 挂载轮询与 ToastContainer
  - 更新 Shop/Clinic Dashboard 替换 mock 同步卡片为真实 API
- 关键约定遵守：
  - 所有 API 调用经 `lib/api.ts`，无页面直接 `fetch`
  - Toast dedup 30s window，max 3 visible
  - Dashboard sync status polling 60s (via `fetchSyncStatus` on mount)
  - 轮询在 tab hidden 时降频至 2min
- 阻塞/风险：后端 `/merchant/sync/status` 和 `/merchant/pending-tasks` 尚未实现，前端调用将返回 404，前端已做 error 处理（store 捕获 ApiError）

- 2026-03-26：收到 QA 资产产出指令，已先读取并更新 `task_plan.md`、`findings.md`、`progress.md`。
- 已重读 `docs/phase4_contract.md`、`docs/phase4_execution_notes.md`、`playwright.config.ts`、现有 `tests/phase1`/`tests/phase3`，并补充阅读 Phase 4 前后端实现。
- 已确认当前后端实现状态与先前文档存在时间差：`/merchant/sync/status`、`/merchant/pending-tasks`、`sync_consumer`、`idempotency_keys` 现已落地，可直接编写 Phase 4 QA 资产。
- 已确认本轮不执行 Playwright；交付物为：
  - `tests/phase4/phase4_p0.spec.ts`
  - `docs/phase4_supabase_checklist.md`
  - planning files 中的测试范围/阻塞/建议记录
- 当前进行中：设计 Phase 4 P0 测试，策略为“真实接口契约断言 + 浏览器层 route mock 验证 Toast/轮询去重 + 多租户/状态机/截图覆盖”。

- Phase 4 QA 资产已生成：phase4_p0.spec.ts / phase4_supabase_checklist.md。
- QA agent 超时发生在收尾记录阶段，不影响交付文件已写入。

## 2026-03-27
- User clarified current concern: app currently appears to connect directly to Merchant Portal/backend rather than App backend; immediate target is Vaccination only; also need documentation of other app functions that may connect to merchant side.
- Need to audit app-side merchant direct links and update plan accordingly.

- 2026-03-27：已根据用户最新方向，把当前任务从旧 Phase 4 realtime/sync_queue 实现切换为 Vaccination 联调重规划。
- 已确认 Merchant Portal 本地 Web 端口为 3500，backend/internal API 为 8080；3500 不应作为 App 正式 API 入口。
- 已新增/刷新以下 OpenCode 基线文档：
  - `docs/phase4_briefing.md`
  - `docs/phase4_opencode_handoff.md`
  - `docs/phase4_pm_prompt.txt`
  - `docs/phase4_backend_prompt.txt`
  - `docs/phase4_frontend_prompt.txt`
  - `docs/phase4_qa_prompt.txt`
- 已更新 `LEADER_PROMPT.md` 的当前任务，改为 Phase 4A / Vaccination / Merchant Service Facade 方向。
- 已更新 `.gitignore` 排除 `frontend/tsconfig.tsbuildinfo` 与 `specs/.env.keys`，避免把构建产物和敏感文件推进基线。
- 下一步：清理待提交文件、提交到 `phase-3`，然后推送远端。

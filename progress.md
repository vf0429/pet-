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

- 2026-03-27：收到新的明确约束，必须在本轮只完成 Vaccination revised integration planning，不再继续旧 Phase 4 实现扩散。
- 已按要求重新读取：`task_plan.md`、`findings.md`、`progress.md`、`docs/phase4_briefing.md`、`docs/phase4_opencode_handoff.md`、`VaccineBookingView.swift`、`dev.sh`、`frontend/next.config.js`。
- 已确认关键边界：
  - Portal URL = `3500`
  - Merchant internal/backend API = `8080/merchant/*`
  - App-facing facade URL = `${Merchant Project URL}/app/v1/*`
- 已完成文档产出：
  - `docs/phase4a_vaccination_revised_integration_plan.md`
  - `docs/phase4a_merchant_service_facade_contract.md`
- 已在文档中补齐：目标架构、API 契约、错误码、GORM struct 草案、状态机、前端 route/store 草案、JSON 字段映射。
- 当前阻塞已记录：缺少 project/app-key/binding/schema、缺少 facade 路由命名空间、缺少 clinic provisioning 细化。
- 下一步建议：由 OpenCode 先落 backend facade skeleton 与 schema，再安排 App 迁移 `VaccineBookingView`，但本轮到此停止。

- 2026-03-27：收到 petwell-qa 新任务，本轮改为输出 Vaccination documentation / checklist，而不是直接写完整 E2E。
- 已先按要求读取并更新 `task_plan.md`、`findings.md`、`progress.md`，继续保持 Planning with Files。
- 已补读/复读：
  - `docs/phase4_briefing.md`
  - `docs/phase4_opencode_handoff.md`
  - `docs/phase4a_vaccination_revised_integration_plan.md`
  - `docs/phase4a_merchant_service_facade_contract.md`
  - `backend/middleware/auth.go`
  - `backend/handlers/clinic_appointments.go`
  - `backend/models/appointment_state_machine.go`
  - `backend/models/clinic.go`
  - App `VaccineBookingView.swift`
- 已确认当前文档/验证策略的基线：
  - App 旧链路 = `8090 + /api/merchant/* + hardcoded credential + X-Session-ID`
  - Portal URL = `http://localhost:3500`，仅供 merchant staff browser 使用
  - Merchant internal API = `http://localhost:8080/merchant/*`，仅供 Portal/internal 调用
  - App-facing facade URL = `${Merchant Project URL}/app/v1/*`，才是 App 正式 contract
- 当前进行中：整理 3 份产出
  - App↔Merchant integration guide 结构建议
  - Vaccination 旧链路 vs 目标链路验证点
  - future functions 接 Merchant checklist
- 已生成文档：`docs/phase4a_app_merchant_integration_guide_checklist.md`。
- 该文档已明确区分 `Portal URL` / `Merchant internal API` / `App-facing facade URL`，并沉淀 Vaccination 验证矩阵与 future functions checklist。

## 2026-03-27 Backend 设计产出

### 已确认：facade 最小接口集合（4个）
1. `GET /app/v1/vaccinations/availability` — 返回某诊所某日的疫苗可用时段
2. `POST /app/v1/vaccinations/bookings` — 创建预约（含幂等键保护）
3. `GET /app/v1/vaccinations/bookings/:external_booking_id` — 查询预约状态
4. `POST /app/v1/vaccinations/bookings/:external_booking_id/cancel` — 取消预约

### 已确认：`clinic_integration_id` → Merchant 内部映射路径
```
ClinicIntegrationBinding
  .ClinicIntegrationID  ──唯一索引──> 绑定记录
        │
        ├──▶ TenantID  ──▶ Tenant ──▶ Merchant 数据隔离
        ├──▶ ProjectID  ──▶ MerchantProject
        └──▶ DefaultDoctorID  ──▶ 预约默认分配医生（可为空）
```

### 已确认：facade booking 落当前 Merchant 数据模型的路径
1. App 提交 booking 请求（含 `clinic_integration_id`）
2. Facade handler 解析 `ClinicIntegrationBinding`，拿到 `TenantID`
3. 在同一事务内写入两张表：
   - `VaccinationBookingFacade`（facade 侧元数据，含 `ExternalBookingID` / `PetID` / `VaccineCode` 等 App 字段）
   - `ClinicAppointment`（merchant 侧业务表，含 `PetName` / `PetOwnerName` / `ScheduledAt` 等）
4. `VaccinationBookingFacade.InternalAppointmentID` 指向 `ClinicAppointment.ID`，形成双向追溯链

### 已确认：Portal 如何看到 facade 创建的 booking
- Portal 已有 `GET /merchant/clinic/appointments`（按 `tenant_id` + `scheduled_at` 过滤）
- facade 写入的 `ClinicAppointment` 会自动出现在 Portal 日/周视图里，无需额外改动
- `VaccinationBookingFacade` 表是 App 侧扩展元数据，Portal 不直接读该表

### 已确认：facade 写入事务边界（设计草案）
```go
txErr := db.Transaction(func(tx *gorm.DB) error {
    // 1. 创建 merchant 侧 ClinicAppointment
    appt := ClinicAppointment{
        TenantID:      binding.TenantID,
        BusinessType:   "clinic",
        PetName:       req.Pet.Name,
        PetOwnerName:  req.Owner.Name,
        PetOwnerPhone: req.Owner.Phone,
        DoctorID:      resolvedDoctorID,
        VisitType:     "vaccination:" + req.VaccineCode,
        ScheduledAt:   req.ScheduledAt,
        Status:        ClinicAppointmentStatusPending,
        Notes:         req.Notes,
    }
    if err := tx.Create(&appt).Error; err != nil { return err }

    // 2. 创建 facade 侧 VaccinationBookingFacade
    facade := VaccinationBookingFacade{
        ProjectID:             binding.ProjectID,
        TenantID:              binding.TenantID,
        ClinicIntegrationID:   binding.ClinicIntegrationID,
        ExternalBookingID:     generateExternalBookingID(),
        IdempotencyKey:        idempotencyKey,
        InternalAppointmentID: &appt.ID,
        PetID:                req.Pet.ID,
        PetName:              req.Pet.Name,
        OwnerName:            req.Owner.Name,
        OwnerPhone:           req.Owner.Phone,
        OwnerEmail:           req.Owner.Email,
        VaccineCode:          req.VaccineCode,
        ScheduledAt:          req.ScheduledAt,
        Status:               VaccinationBookingStatusRequested,
        RawRequestJSON:       rawJSON,
    }
    if err := tx.Create(&facade).Error; err != nil { return err }
    return nil
})
```

### 已确认：新增 GORM Model 清单（backend 实现需创建）
- `MerchantProject` — project 维度配置（`ProjectCode` + `TenantID` + `BaseURL` + `Status`）
- `MerchantAppKey` — app key 认证（`ProjectID` + `KeyPrefix` + `KeyHash` + `Environment` + `Status`）
- `ClinicIntegrationBinding` — `clinic_integration_id` 到 `TenantID` 的绑定（含 `DefaultDoctorID` + `Timezone`）
- `VaccinationBookingFacade` — facade booking 元数据（含双向追溯字段 `InternalAppointmentID`）

### 已确认：App-Key Auth Middleware 与 `/merchant/*` 的隔离方式
- 新路由组：`/app/v1/*`（与 `/merchant/*` 完全独立）
- 新中间件：`MerchantAppKeyAuthMiddleware`（检查 `X-Merchant-App-Key` header）
- 与 `MerchantAuthMiddleware`（session-based）不共享，不交叉

### 已确认：本轮不实现，但留档的设计点
- availability slots 计算逻辑（需接入 clinic schedule/doctor roster，未进入实现范围）
- vaccine_code 与 merchant `VisitType` 的编码规范（草案为 `vaccination:{code}`）
- Project provisioning 流程（key 生成、轮换、revoke 的管理接口）

## 2026-03-27 MiniMax App-facing 视角完成

### 已完成工作
- 已重新读取所有 planning files 和 required 文档（phase4_briefing, phase4_opencode_handoff, VaccineBookingView.swift, env.example, dev.sh, next.config.js）
- 已从 App-facing 视角梳理旧 Vaccination 直连 Merchant 的 UI/请求链路：
  - `MerchantClinicSyncService` 旧 actor：baseURL=localhost:8090, login → session 缓存 → X-Session-ID 后续调用
  - 硬编码 clinic 凭证、petName 当 pet_id、"testclinics_frontdesk" 当 doctor_id
- 已定义新的 App-facing config model：`Merchant Project URL + Merchant Public/App Key + clinic_integration_id`
- 已说明 App 层需要暴露的 4 个 booking/availability 调用边界
- 已将关键发现回写 `task_plan.md` 和 `findings.md`

### App-facing Vaccination 4 个端点
| 端点 | App 层行为 |
|---|---|
| `GET /app/v1/vaccinations/availability` | 带 `X-Merchant-App-Key` header 查询 |
| `POST /app/v1/vaccinations/bookings` | 带 `Idempotency-Key` + `X-Merchant-App-Key` 创建 |
| `GET /app/v1/vaccinations/bookings/:external_booking_id` | 带 `X-Merchant-App-Key` 查询状态 |
| `POST /app/v1/vaccinations/bookings/:external_booking_id/cancel` | 带 `X-Merchant-App-Key` + reason 取消 |

### App-facing 边界约束
- App 不感知 Portal URL (3500)、Merchant internal API (8080/merchant/*)、X-Session-ID
- App-key 只做 project 级别用量控制，不做用户级鉴权
- 预约写入走 facade booking + clinic_appointments 双写，Portal 可见旧表即可

### 当前阻塞
- `MerchantProject` / `MerchantAppKey` / `ClinicIntegrationBinding` / `VaccinationBookingFacade` schema 尚未创建
- `/app/v1/*` 路由命名空间尚未挂载
- clinic provisioning (key 签发/轮换) 流程尚未细化

### 下一步
- 本轮文档/方案工作已完成
- 建议 OpenCode 按新基线落地 backend facade skeleton + schema，再安排 App 迁移

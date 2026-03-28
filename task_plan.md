# Phase 4A Vaccination Documentation / Checklist Plan

## Goal
- [x] 读取并校准 `task_plan.md` / `findings.md` / `progress.md`
- [x] 阅读 `docs/phase4_briefing.md` / `docs/phase4_opencode_handoff.md`
- [x] 阅读 App 旧 Vaccination 链路与 Merchant 现状代码/文档
- [x] 输出 App↔Merchant integration guide 结构建议
- [x] 列出 Vaccination 旧链路 vs 目标链路验证点
- [x] 列出 future functions 接 Merchant 时必须检查的 checklist
- [x] 回写 planning files 中的关键结论、阻塞、下一步建议
- [x] 设计 facade 最小接口集合（4个端点）
- [x] 设计 clinic_integration_id 到 Merchant tenant/clinic 的映射方式
- [x] 设计 facade booking 落到当前 Merchant 数据模型的路径
- [x] 说明 Portal 如何看到 facade 创建的 booking
- [x] 把关键发现写回 planning files

## Phases
1. [completed] 审计当前 Vaccination App 旧链路（`8090 + /api/merchant/* + X-Session-ID`）
2. [completed] 确认 Merchant 本地边界（Portal `3500` / internal backend `8080`）
3. [completed] 复核既有规划文档（revised integration plan / facade contract）
4. [completed] 产出文档导向的 integration guide 结构与验证策略
5. [completed] 整理 Vaccination 旧链路 vs 目标链路验证点
6. [completed] 整理 future functions 接 Merchant checklist
7. [completed] 将关键结论回写 planning files
8. [completed] Backend facade 设计：最小接口、映射路径、落库方式、Portal 可见性

## Deliverables
- 文档：App↔Merchant integration guide 结构建议
- 文档：Vaccination 旧链路 / 目标链路验证点
- 文档：future functions 接 Merchant checklist
- `docs/phase4a_app_merchant_integration_guide_checklist.md`
- planning files updated with conclusions / blockers / next-step recommendations
- Backend facade 设计结论已写入 `progress.md` 和 `findings.md`

## Constraints
- 只聚焦 Vaccination 与未来接入规则
- 本轮重心是 documentation / verification strategy，不直接编写完整 E2E
- 必须明确区分 `Portal URL` / `Merchant internal API` / `App-facing facade URL`
- 不把 `localhost:3500` 当成 App 产品级 API 入口
- 不继续沿用 App 直接登录 Merchant / `X-Session-ID` 的旧方案
- 接入模型固定为：`Merchant Project URL + Merchant Public/App Key`
- 全程必须使用 Planning with Files

## Risks
- 当前 Merchant backend 只有 `/merchant/*` 会话式内部 API，尚无 `/app/v1/*` facade namespace 与 app-key middleware。
- 当前 schema 缺少 `MerchantProject` / `MerchantAppKey` / `ClinicIntegrationBinding` / `VaccinationBookingFacade` 支撑表。
- 当前 App `VaccineBookingView.swift` 仍内嵌硬编码 clinic 凭证与 `localhost:8090`，若未迁移将继续偏离新产品模型。
- 仓库内当前仅明确发现 Vaccination 直接连 Merchant；若未来新增其他直连点，integration guide 需持续更新 inventory。

## App-facing Vaccination Integration Summary (2026-03-27)

### 旧 Vaccination 直连 Merchant 链路
`VaccineBookingView.swift` 内 `MerchantClinicSyncService`:
- Base URL: `http://localhost:8090` (旧 bridge 端口，非产品级)
- 鉴权: 硬编码 email/password → `POST /api/merchant/auth/login` → `session_id` 存 UserDefaults
- 查可用: `GET /api/merchant/appointments` + `X-Session-ID`
- 创建预约: `POST /api/merchant/appointments` + `X-Session-ID`
- 问题: `pet_id=petName`、`doctor_id="testclinics_frontdesk"` 均为占位；merchant session 不应暴露给 App

### 新 App-facing config model
App 只需配置三项：
```
merchant_project_url: string   (例如 "https://merchant.petwell.com/projects/testclinics-hk")
merchant_public_app_key: string (例如 "pk_app_xxxxxxxxxxxx")
clinic_integration_id: string  (例如 "clinic_testclinics_hk")
```

### App 层 booking / availability 调用边界
App-facing facade 只暴露 4 个 Vaccination 端点：
- `GET /app/v1/vaccinations/availability` — 查某诊所某日疫苗空位
- `POST /app/v1/vaccinations/bookings` — 创建预约（需 `Idempotency-Key`）
- `GET /app/v1/vaccinations/bookings/:external_booking_id` — 查预约状态
- `POST /app/v1/vaccinations/bookings/:external_booking_id/cancel` — 取消预约

### 关键约束
- App 不感知 Portal URL (3500)、Merchant internal API (8080/merchant/*)、X-Session-ID
- App-key 只做 project 级别的用量控制与 clinic binding 解析，不做用户级鉴权
- 预约写入走 facade booking model + internal clinic_appointments 双写，Portal 通过旧表可见
- 本轮以文档和方案为主，不直接实现 App 代码

## Backend Facade 设计结论（2026-03-27）

### Facade 最小接口集合（4个端点）
| 方法 | 路径 | 核心职责 |
|---|---|---|
| GET | `/app/v1/vaccinations/availability` | 返回某诊所某日可用时段（可先 mock clinic hours） |
| POST | `/app/v1/vaccinations/bookings` | 创建预约：app-key 验证 → clinic binding 解析 → 双重写入事务 → 返回 external_booking_id |
| GET | `/app/v1/vaccinations/bookings/:external_booking_id` | 查询预约：VaccinationBookingFacade JOIN ClinicAppointment → 映射状态 |
| POST | `/app/v1/vaccinations/bookings/:external_booking_id/cancel` | 取消：校验状态转移合法性 → ClinicAppointment + VaccinationBookingFacade 同步更新 |

### clinic_integration_id → Merchant tenant/clinic 映射路径
```
请求.clinic_integration_id
        │
        ▼
ClinicIntegrationBinding表（唯一索引clinic_integration_id）
        │
        ├──▶ TenantID  ──▶ Tenant  ──▶ merchant_users（role=doctor / role=frontdesk）
        ├──▶ DefaultDoctorID  ──▶ 可选，为nil时走frontdesk路由
        └──▶ ProjectID  ──▶ MerchantProject
```

### Facade booking 落 Merchant 数据模型的路径（双重写入事务）
1. App POST `/app/v1/vaccinations/bookings`（带 X-Merchant-App-Key + Idempotency-Key）
2. AppKeyAuthMiddleware 验证 project/key 有效性，解析 tenant_id
3. Resolve ClinicIntegrationBinding → TenantID + DoctorID
4. 同一 db.Transaction 内：
   - 创建 `ClinicAppointment`（pet_name / pet_owner_name / visit_type="vaccination:{code}" / scheduled_at / tenant_id）
   - 创建 `VaccinationBookingFacade`（pet_id / vaccine_code / external_booking_id / idempotency_key / internal_appointment_id / raw_request_json）
5. 两表通过 `VaccinationBookingFacade.InternalAppointmentID ↔ ClinicAppointment.ID` 形成追溯链

### Portal 可见性说明
- `GET /merchant/clinic/appointments` 已按 `tenant_id` + `scheduled_at` 过滤
- Facade 创建的 ClinicAppointment 以 `pending` 状态进入该列表，Portal 现有列表/矩阵视图无需改动即可见
- VaccinationBookingFacade 是 App 侧元数据（pet.id / vaccine_code 等），Portal 不感知该表
- App 侧预约状态通过 VaccinationBookingFacade.Status 映射自 ClinicAppointment.status（内部状态对 App 不可见）

### Backend 需新建文件清单
- `backend/models/merchant_project.go` — MerchantProject + MerchantAppKey GORM model
- `backend/models/clinic_integration.go` — ClinicIntegrationBinding GORM model
- `backend/models/vaccination_booking_facade.go` — VaccinationBookingFacade GORM model
- `backend/middleware/app_key_auth.go` — AppKeyAuthMiddleware（独立于 MerchantAuthMiddleware）
- `backend/handlers/vaccination_facade.go` — 4个 handler
- `backend/cmd/server/main.go` 或 `backend/routes.go` — 新增 `/app/v1` 路由树挂载

### 已知设计缺口（OpenCode 实现前需补充）
1. availability slots 真实计算逻辑（需 clinic schedule 表 + doctor roster）
2. DefaultDoctorID 为 nil 时的 frontdesk 路由策略
3. vaccine_code → merchant 疫苗产品的 catalog mapping
4. MerchantAppKey 的 key 生成/轮换/revoke 管理接口
5. MerchantProject.ProjectCode 生成规则（全局唯一性保证）


## Phase 4A Execution Plan (2026-03-27)
- [in_progress] Leader: 将团队重组为 5 角色（Leader/Architect/Backend/Frontend/QA），并按 `specs/Phase4_App联调/Phase4A_Steps.md` 顺序执行
- [pending] Step 1: Schema 扩展、AutoMigrate、Seed 数据
- [pending] Step 2: AppKey 中间件、/app/v1 路由骨架、前端类型文件、QA 验证
- [pending] Step 3: Facade 业务逻辑、前端 API/store
- [pending] Step 4: Portal 状态同步、Playwright E2E、文档收尾
- [pending] Mid-session sync: 完成关键阶段后回写 planning files

- [completed] Step 1: Schema 扩展、AutoMigrate、Seed 数据
- [in_progress] Step 2: AppKey 中间件、/app/v1 路由骨架、前端类型文件、QA 验证

- [completed] Step 2: AppKey 中间件、/app/v1 路由骨架、前端类型文件、QA 验证
- [in_progress] Step 3: Facade 业务逻辑、前端 API/store

- [completed] Step 3: Facade 业务逻辑、前端 API/store
- [completed] Step 4: Portal 状态同步、Playwright E2E、文档收尾
- [completed] Mid-session sync: 完成关键阶段后回写 planning files

## Phase 4B OpenClaw Dispatch Plan (2026-03-27)
- [in_progress] Prepare 4 agent prompts for Phase4B and dispatch via OpenClaw
- [pending] Backend agent: Step 1 + Step 2 backend implementation
- [completed] Architect agent: Step 1 code review document
- [completed] Backend follow-up from architect review: fix sync_consumer retry backoff, add panic recover, and add queue-consumer indexing
- [pending] Frontend agent: Step 2 + Step 3 frontend implementation/alignment
- [pending] QA agent: verification assets and validation summary

## Phase 4B Step 1 Architect Review Summary (2026-03-27)
- [completed] 已审查 `backend/jobs/sync_consumer.go` 与 `backend/models/app_sync_queue.go`
- [completed] 已输出 `docs/phase4b_sync_consumer_review.md`
- [completed] 确认 `ConsumeAppSyncQueue` 查询运行在事务之外
- [issue] `next_retry_at` 退避实现与规范不符：当前首轮失败会退避 2min，而不是 30s
- [issue] `dispatchTask` 当前 mock 无明显 panic 路径，但缺少 `recover`，未来接入真实推送 SDK 后有 goroutine 整体退出风险
- [issue] `dead_letter` 批量标记是幂等的，但缺少贴合消费扫描条件的复合索引；同时没有多 consumer claim/lock 机制

## Phase 4B Step 1 Backend Fixes Applied (2026-03-27)
- [completed] Fix 1 — Retry backoff off-by-one: `calculateBackoff(task.RetryCount)` 直接用原值，第1次→30s, 第2次→2min, 第3次→10min
- [completed] Fix 2 — Panic recover: `dispatchTask` 调用包在 `defer recover()` 内，panic 转 error 不打崩 goroutine
- [completed] Fix 3 — Composite index: `idx_app_sync_queue_consumer_scan (status, retry_count, next_retry_at, created_at)` 已补充
- [completed] `go build ./...` 零报错

- [completed] Backend agent: Step 1 + Step 2 backend implementation
- [completed] Frontend agent: Step 2 + Step 3 frontend implementation/alignment
- [completed] QA agent: verification assets and validation summary
- [completed] Frontend agent: Phase4B contract drift fixes (X-Business-Type not hardcoded, pending-tasks DTO aligned to backend minimum)
- [completed] Phase4B final stabilization: `tests/phase4/phase4_p0.spec.ts` legal/illegal transition coverage no longer hard-depends on `paid -> prepare` seed data; full Playwright suite now green


## Phase 5 Analytics Execution Plan (2026-03-28)
- [completed] Leader: 读取 `specs/Phase5_数据分析/Phase5_Steps.md` 与 `Phase5_详细计划.md`，准备新的 OpenCode agent team 分发
- [completed] MiniMax provider 基线切到 `https://api.minimaxi.com/anthropic/v1`，backend/frontend agent model 切到 `minimax/MiniMax-M2.5`
- [completed] Architect: Step 1 performance review → `docs/phase5_performance_review.md`（Risk Level: Medium）
- [completed] Backend: Step 1 数据基础准备 + Step 2 Shop Analytics API + Step 3 Clinic Analytics API
- [completed] Frontend: Step 4 Analytics UI + Recharts
- [completed] QA: Phase 5 verification docs + Playwright assets
- [completed] Phase 5 全部完成：`npm run build` 通过，两个 Analytics 页面已编译

## Phase 5 QA Verification Asset Plan (2026-03-28)
- [completed] 读取并同步 `task_plan.md` / `findings.md` / `progress.md`
- [completed] 读取 `specs/Phase5_数据分析/Phase5_Steps.md` / `Phase5_详细计划.md`
- [issue] `docs/phase5_performance_review.md` 不存在，性能审核结论缺失
- [completed] 生成 `docs/phase5_shop_analytics_verification.md`
- [completed] 生成 `docs/phase5_clinic_analytics_verification.md`
- [completed] 生成 `tests/phase5/phase5_p0.spec.ts`
- [completed] 生成 `docs/phase5_test_report.md` 骨架
- [issue] 当前仓库未发现 analytics backend/frontend 实现文件，QA 资产暂处 prepared/not executed 状态

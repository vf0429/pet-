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

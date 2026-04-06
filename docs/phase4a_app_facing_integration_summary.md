# Phase 4A — App-facing Vaccination Integration Summary

> 从 App-facing 视角定义 Vaccination 如何连接 Merchant Service Facade。
> 本文档是 `phase4a_vaccination_revised_integration_plan.md` 和 `phase4a_merchant_service_facade_contract.md` 的补充，聚焦 App 层实际调用边界。

---

## 1. 旧 Vaccination 直连 Merchant 链路分析

### 1.1 代码位置
`/Users/vfzzz/Desktop/PetWell_Project/apps/PetWell/Views/Medical/VaccineBookingView.swift`

### 1.2 MerchantClinicSyncService 旧 Actor 结构

```swift
private actor MerchantClinicSyncService {
  static let shared = MerchantClinicSyncService()
  private let baseURL = URL(string: "http://localhost:8090")!
  private let sessionStorageKey = "petwell_testclinics_session_id"
  // ...
}
```

### 1.3 旧请求链路

| 步骤 | 操作 | HTTP | Body/Headers |
|---|---|---|---|
| 1 | `loginForTestClinic()` | `POST /api/merchant/auth/login` | `{ method:"email", email:"testclinics@petwell.com", password:"Clinic123456" }` |
| 2 | `bookedSlots(on:)` | `GET /api/merchant/appointments` | `X-Session-ID: <session_id>` |
| 3 | `postAppointment()` | `POST /api/merchant/appointments` | `{ pet_id, doctor_id:"testclinics_frontdesk", scheduled_at, status, chief_complaint }` + `X-Session-ID` |

### 1.4 旧链路问题

| 问题 | 说明 |
|---|---|
| `localhost:8090` | 旧 bridge 端口，仅本地开发有效，非产品级 URL |
| 硬编码 clinic 凭证 | `testclinics@petwell.com` / `Clinic123456` 不可进入产品 |
| merchant session 暴露 | `session_id` 存 UserDefaults，X-Session-ID 后续复用，是 merchant staff session |
| `pet_id = petName` | 用 pet name 字符串代替稳定 ID，不可作为产品合同字段 |
| `doctor_id = "testclinics_frontdesk"` | 测试占位符，不可作为产品合同字段 |
| 无 idempotency | 创建 appointment 无幂等保护，重试风险高 |

---

## 2. 新 App-facing Config Model

### 2.1 App 端配置项（3项）

```json
{
  "merchant_project_url": "https://merchant.petwell.com/projects/testclinics-hk",
  "merchant_public_app_key": "pk_app_xxxxxxxxxxxx",
  "clinic_integration_id": "clinic_testclinics_hk"
}
```

| 字段 | 用途 | 示例 |
|---|---|---|
| `merchant_project_url` | App 调用 base URL | `https://merchant.petwell.com/projects/testclinics-hk` |
| `merchant_public_app_key` | project 级别认证（类似 Supabase anon key） | `pk_app_xxxxxxxxxxxx` |
| `clinic_integration_id` | 标识目标诊所（facade 解析到 tenant_id） | `clinic_testclinics_hk` |

### 2.2 配置来源与存储

- **配置何时获取**：App 安装时预置，或从后端 App 配置服务拉取（未来扩展）
- **存储位置**：iOS Keychain（敏感）或 UserDefaults（仅 url + non-sensitive key）
- **App-key 性质**：公开钥，仅做 project 访问控制；不等同于用户身份认证

### 2.3 禁止在 App 层使用的旧模式

| 旧模式 | 替代方案 |
|---|---|
| `localhost:8090` | `merchant_project_url` + `/app/v1/...` |
| merchant email/password | `merchant_public_app_key` |
| `X-Session-ID` / merchant session | `X-Merchant-App-Key` |
| `pet_id = petName` | `pet.id`（稳定 UUID） |
| `doctor_id = "testclinics_frontdesk"` | `clinic_integration_id` 解析到 `DefaultDoctorID` |

---

## 3. App 层需要暴露的 Booking / Availability 调用边界

### 3.1 4 个 Vaccination 端点

| 端点 | Method | 用途 | 关键 Header | Body |
|---|---|---|---|---|
| `/app/v1/vaccinations/availability` | GET | 查询某诊所某日可用时段 | `X-Merchant-App-Key` | query: `clinic_integration_id`, `vaccine_code`, `date`, `timezone` |
| `/app/v1/vaccinations/bookings` | POST | 创建预约 | `X-Merchant-App-Key` + `Idempotency-Key` | `clinic_integration_id`, `vaccine_code`, `scheduled_at`, `pet`, `owner`, `notes` |
| `/app/v1/vaccinations/bookings/:external_booking_id` | GET | 查询预约状态 | `X-Merchant-App-Key` | — |
| `/app/v1/vaccinations/bookings/:external_booking_id/cancel` | POST | 取消预约 | `X-Merchant-App-Key` | `reason` |

### 3.2 App 层调用示例（伪代码）

```swift
// 查询可用时段
let availability = await fetch(
  "\(projectURL)/app/v1/vaccinations/availability" +
  "?clinic_integration_id=\(clinicID)&vaccine_code=rabies&date=2026-03-30",
  headers: ["X-Merchant-App-Key": publicAppKey]
)

// 创建预约
let booking = await fetch(
  "\(projectURL)/app/v1/vaccinations/bookings",
  method: "POST",
  headers: [
    "X-Merchant-App-Key": publicAppKey,
    "Idempotency-Key": "vacc_req_\(UUID())"
  ],
  body: {
    clinic_integration_id: clinicID,
    vaccine_code: "rabies",
    scheduled_at: "2026-03-30T11:00:00+08:00",
    pet: { id: pet.id, name: pet.name },
    owner: { name: owner.name, phone: owner.phone, email: owner.email }
  }
)

// 查询预约状态
let status = await fetch(
  "\(projectURL)/app/v1/vaccinations/bookings/\(booking.external_booking_id)",
  headers: ["X-Merchant-App-Key": publicAppKey]
)

// 取消预约
await fetch(
  "\(projectURL)/app/v1/vaccinations/bookings/\(booking.external_booking_id)/cancel",
  method: "POST",
  headers: ["X-Merchant-App-Key": publicAppKey],
  body: { reason: "owner_requested" }
)
```

### 3.3 App 层调用边界约束

| 约束 | 说明 |
|---|---|
| App 不感知 Portal URL | `localhost:3500` 仅 merchant staff browser 使用，App 不配置 |
| App 不感知 Merchant internal API | `localhost:8080/merchant/*` 是 internal surface，App 不可见 |
| App 不存储 merchant session | 无 `X-Session-ID`、无 UserDefaults merchant session |
| App-key 不做用户身份认证 | 只做 project 级别访问控制；用户身份由 PetWell App 自己管理 |
| 所有请求走 `X-Merchant-App-Key` | 无 key 或无效 key 返回 401 |
| 创建预约必须带 `Idempotency-Key` | 防止网络重试导致重复 booking |
| App 使用稳定标识符 | `pet.id`（UUID）、`external_booking_id`（facade 生成），不用测试占位符 |

### 3.4 App 层响应处理

所有 facade 响应使用标准 envelope：

```swift
// Success
{ "code": 0, "message": "ok", "data": { ... } }

// Error
{ "code": 40101, "message": "invalid app key", "data": null }
```

App 应处理的 error code 类别：
- `40101` / `40102` → App 配置错误，提示用户检查设置
- `40301` / `40302` → project 或 clinic 被禁用，需通知商户
- `40401` / `40402` → 资源不存在
- `40901` → Idempotency conflict，解析原响应
- `40902` → slot 已被占用，需刷新 availability

---

## 4. 旧链路 → 新链路 字段映射

| 旧 `VaccineBookingView` 字段 | 新 App-facing 合同字段 | 说明 |
|---|---|---|
| `http://localhost:8090` | `merchant_project_url/app/v1` | base URL 变化 |
| `POST /api/merchant/auth/login` | （删除） | 不再需要 App login merchant |
| `X-Session-ID` | `X-Merchant-App-Key` | 鉴权方式变更 |
| `{ email, password }` | `{ merchant_public_app_key }` | 凭证类型变更 |
| `pet_id = petName`（String） | `pet.id`（UUID） | pet 标识符稳定化 |
| `doctor_id = "testclinics_frontdesk"` | `clinic_integration_id` 解析得到 | doctor 由 binding.DefaultDoctorID 决定 |
| `chief_complaint` | 拆分为 `vaccine_code` + `owner` + `notes` | 结构化字段替代字符串拼接 |
| `GET /api/merchant/appointments` | `GET /app/v1/vaccinations/availability` | availability 端点取代全量查询 |
| `POST /api/merchant/appointments` | `POST /app/v1/vaccinations/bookings` | 预约端点，带 idempotency |

---

## 5. Portal 可见性路径（App 不直接感知）

```
App → POST /app/v1/vaccinations/bookings
  → Facade handler
    → 写 VaccinationBookingFacade（facade 元数据）
    → 写 ClinicAppointment（merchant 业务表）
  → Portal 读 ClinicAppointment（已有列表/矩阵视图）
```

App 不需要知道 Portal 如何可见；只需确认 facade 返回 `portal_visibility.visible = true` 即可。

---

## 6. 本轮关键结论

1. **旧链路不可延续**：`localhost:8090` + merchant session + 硬编码凭证不是产品方案
2. **新 config model 固定**：`Merchant Project URL + Merchant Public/App Key + clinic_integration_id`
3. **4 个端点覆盖 Vaccination 首期**：availability、create、get status、cancel
4. **App 层调用边界清晰**：只用 `X-Merchant-App-Key`，不感知 Portal/internal API
5. **预约写入双表**：facade booking model + clinic_appointments，Portal 自动可见
6. **本轮以文档和方案为主**：blocking items（schema、路由、provisioning）需 OpenCode 后续落地

---

## 7. Blocking Items

| Item | 状态 | 说明 |
|---|---|---|
| `MerchantProject` / `MerchantAppKey` / `ClinicIntegrationBinding` / `VaccinationBookingFacade` schema | Pending | OpenCode 需先建 |
| `/app/v1/*` 路由命名空间 | Pending | 与 `/merchant/*` 隔离 |
| `MerchantAppKeyAuthMiddleware` | Pending | 检查 `X-Merchant-App-Key` |
| clinic provisioning 流程（key 签发/轮换） | Pending | 尚未细化 |
| App 侧 `VaccineBookingView` 迁移 | Pending | 等 backend facade 稳定后 |
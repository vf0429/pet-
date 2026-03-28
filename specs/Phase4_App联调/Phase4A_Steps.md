# Phase 4A — Vaccination Facade：分步执行计划

> 每个 Step 内的各角色 Prompt 可在独立 Claude Code 窗口**并行执行**。
> Step 之间必须**顺序执行**（后一步依赖前一步的产出）。
> 项目根目录：`/Users/vfzzz/Desktop/petwell-merchant`

---

## Step 1：Schema 扩展与 Seed 数据

**目标：** 新增所有 Phase 4A 所需数据模型，写入 AutoMigrate，补充测试 Seed。

### Prerequisite
- Phase 3 已完成（当前状态满足）

### 🏛 Architect Prompt
```
你是一个 Go 后端架构师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

请完成以下任务：

1. 阅读现有模型文件 backend/models/ 下所有文件，了解当前 schema。

2. 在 backend/models/ 中新建以下文件，严格按照字段定义实现：

【文件 1】models/merchant_project.go
- MerchantProject struct：
  - ID uint primaryKey
  - ProjectCode string size:64 uniqueIndex（例：testclinics-hk）
  - TenantID uint not null index
  - Name string size:128
  - BaseURL string size:255
  - Status string size:16 default:'active'（active/paused/revoked）
  - CreatedAt / UpdatedAt time.Time

- MerchantAppKey struct：
  - ID uint primaryKey
  - ProjectID uint not null index
  - KeyPrefix string size:24 index（例：pk_app_xxxx，前8位）
  - KeyHash string size:255（bcrypt hash，json:"-"）
  - Environment string size:16 default:'prod'
  - Status string size:16 default:'active'（active/revoked）
  - LastUsedAt *time.Time
  - ExpiresAt *time.Time
  - CreatedAt / UpdatedAt time.Time

【文件 2】models/clinic_integration.go
- ClinicIntegrationBinding struct：
  - ID uint primaryKey
  - ProjectID uint not null index
  - TenantID uint not null index
  - ClinicIntegrationID string size:64 uniqueIndex（例：clinic_testclinics_hk）
  - BusinessType string size:16 default:'clinic'
  - DefaultDoctorID *uint
  - Timezone string size:64 default:'Asia/Hong_Kong'
  - Status string size:16 default:'active'（active/disabled）
  - CreatedAt / UpdatedAt time.Time

- ClinicScheduleTemplate struct：
  - ID uint primaryKey
  - TenantID uint not null index
  - DayOfWeek int（0=Sunday…6=Saturday）
  - OpenTime string size:8（例：09:00）
  - CloseTime string size:8（例：18:00）
  - SlotDurationMin int default:30
  - IsActive bool default:true
  - CreatedAt / UpdatedAt time.Time
  - UniqueIndex on (TenantID, DayOfWeek)

【文件 3】models/vaccination_booking.go
- VaccinationBookingFacade struct（严格按照字段）：
  - ID uint primaryKey
  - ProjectID uint not null index
  - TenantID uint not null index
  - ClinicIntegrationID string size:64 not null index
  - ExternalBookingID string size:64 uniqueIndex
  - IdempotencyKey string size:128 uniqueIndex
  - InternalAppointmentID *uint index
  - PetID string size:64 not null index
  - PetName string size:128
  - OwnerName string size:128
  - OwnerPhone string size:32
  - OwnerEmail string size:255
  - VaccineCode string size:64 not null index
  - ScheduledAt time.Time not null index
  - Status string size:32 not null index（requested/confirmed/completed/cancelled_by_user/cancelled_by_clinic）
  - RawRequestJSON string type:text json:"-"
  - CreatedAt / UpdatedAt time.Time

3. 修改 models/clinic.go，在 ClinicAppointment struct 中增加字段：
   - Source string `gorm:"size:16;not null;default:'manual'"`
   （代表来源：'manual' 为手动录入，'app_facade' 为 App 通过 facade 创建）
   放在 Notes 字段附近。

4. 修改 backend/cmd/server/main.go，在 db.AutoMigrate() 调用中追加：
   &models.MerchantProject{}
   &models.MerchantAppKey{}
   &models.ClinicIntegrationBinding{}
   &models.ClinicScheduleTemplate{}
   &models.VaccinationBookingFacade{}

5. 验证：cd backend && go build ./... 必须零报错。

不要修改任何 handler 或 route 文件。只做 schema 层的工作。
```

---

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

等 Architect 完成 Step 1 的 schema 工作后（go build 通过），执行以下任务：

在 backend/cmd/server/main.go 的 seedData() 函数末尾，追加调用 seedPhase4AData(db)。

新建函数 seedPhase4AData(db *gorm.DB)，逻辑如下：

1. 检查 merchant_projects 表是否已有数据，有则直接 return。

2. 找到 TenantID=1（Happy Paws）的 Tenant，确认它存在。

3. 创建 MerchantProject：
   - ProjectCode: "happypaws-hk"
   - TenantID: 1
   - Name: "Happy Paws HK"
   - BaseURL: "http://localhost:8080"
   - Status: "active"

4. 为上面的 project 创建 MerchantAppKey：
   - KeyPrefix: "pk_app_test"
   - KeyHash: bcrypt hash of "pk_app_test_secret_key_dev"
   - Environment: "dev"
   - Status: "active"

5. 创建 ClinicIntegrationBinding：
   - ProjectID: 上面 project 的 ID
   - TenantID: 1
   - ClinicIntegrationID: "clinic_happypaws_hk"
   - BusinessType: "clinic"
   - DefaultDoctorID: nil（不指定，后面按规则路由）
   - Timezone: "Asia/Hong_Kong"
   - Status: "active"

6. 为 TenantID=1 创建 ClinicScheduleTemplate，周一到周六（DayOfWeek 1-6）：
   - OpenTime: "09:00", CloseTime: "18:00", SlotDurationMin: 30, IsActive: true
   周日（DayOfWeek 0）：IsActive: false（不营业）

7. 检查 tenant_id=2（Paws Clinic）是否存在，若存在，同样创建：
   - 另一个 MerchantProject（ProjectCode: "pawsclinic-hk"）
   - 对应的 MerchantAppKey
   - 对应的 ClinicIntegrationBinding（ClinicIntegrationID: "clinic_pawsclinic_hk"）
   - 同样的 ScheduleTemplate（周一到周六）

8. log.Println("Phase 4A seed data created successfully")

9. cd backend && go build ./... 必须零报错。
```

---

### 验收标准（Step 1 完成）
- [ ] `go build ./...` 零报错
- [ ] AutoMigrate 包含所有新表
- [ ] 启动后 seed 数据存在（merchant_projects、clinic_integration_bindings、clinic_schedule_templates 各有记录）
- [ ] `ClinicAppointment` 有 `source` 字段

---

## Step 2：AppKey 认证中间件 + 路由骨架

**目标：** 实现 App-facing 的认证层，建立 `/app/v1/` 路由树，所有 handler 返回 501 占位。

### Prerequisite
- Step 1 全部通过

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

Step 1 已完成，新 schema 已在 models/ 中。现在实现 App-facing 认证中间件和路由骨架。

任务 1：创建 backend/middleware/app_key_auth.go

实现函数 AppKeyAuthMiddleware(db *gorm.DB) gin.HandlerFunc：

逻辑：
1. 从 Header 读取 X-Merchant-App-Key，若缺失返回 401：
   {"code": 40101, "message": "missing app key", "data": null}

2. 从 Key 中提取前缀：取 "pk_app_" 之后最多16个字符作为 KeyPrefix 搜索。
   （格式约定：key = "pk_app_{prefix}_{secret}"，前缀用 "_" 分隔第3段之前的部分）
   更简单的实现：直接把整个 key 值去做 bcrypt 比对——
   先按 KeyPrefix 做索引查询（WHERE key_prefix = ? AND status = 'active'），
   找到候选 key 后用 bcrypt.CompareHashAndPassword 验证。
   KeyPrefix 定义为 key 的前12个字符（含 "pk_app_" 前缀）。

3. 若验证通过：
   - 更新 MerchantAppKey.LastUsedAt = time.Now()
   - 从 MerchantAppKey 找到 MerchantProject（JOIN），验证 Project.Status == "active"
   - 将以下值注入 gin.Context：
     - "app_project_id": project.ID
     - "app_tenant_id": project.TenantID
   - 若 Project 不是 active：401，code: 40301, "project disabled"

4. 若验证失败：401，code: 40102, "invalid app key"

任务 2：创建 backend/handlers/vaccination_stub.go

创建四个 stub handler，均返回 501：
- GetVaccinationAvailability(db) gin.HandlerFunc
- CreateVaccinationBooking(db) gin.HandlerFunc
- GetVaccinationBooking(db) gin.HandlerFunc
- CancelVaccinationBooking(db) gin.HandlerFunc

每个 handler 返回：
{"code": 50101, "message": "not implemented", "data": null}

任务 3：在 backend/cmd/server/main.go 中注册 /app/v1 路由

在现有 /v1/merchant 路由组之后，添加：

// App-facing Facade — consumer App only (app-key auth, NOT merchant session)
appV1 := r.Group("/app/v1")
appV1.Use(middleware.AppKeyAuthMiddleware(db))
{
    vaccGroup := appV1.Group("/vaccinations")
    {
        vaccGroup.GET("/availability", handlers.GetVaccinationAvailability(db))
        vaccGroup.POST("/bookings", handlers.CreateVaccinationBooking(db))
        vaccGroup.GET("/bookings/:external_booking_id", handlers.GetVaccinationBooking(db))
        vaccGroup.POST("/bookings/:external_booking_id/cancel", handlers.CancelVaccinationBooking(db))
    }
}

任务 4：cd backend && go build ./... 零报错。
```

---

### 🖥 Frontend Prompt
```
你是一个前端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/frontend。

任务 1：修改 frontend/next.config.js

在现有的 /api/v1/merchant rewrite 之后，追加一条 rewrite 规则，将 App facade 的开发调试路径也代理过去：

{
  source: '/api/app/v1/:path*',
  destination: 'http://localhost:8080/app/v1/:path*',
}

注意：这条 rewrite 仅用于本地开发调试，不是 App 的正式接入路径。

任务 2：在 frontend/lib/ 目录下创建新文件 vaccination-api.ts

内容：
- 导出 FACADE_BASE = '/api/app/v1' （本地开发用）
- 定义 TypeScript 类型（严格按照 facade contract）：

export type VaccinationSlot = {
  slot_id: string
  start_at: string
  end_at: string
  is_available: boolean
}

export type VaccinationAvailabilityResponse = {
  clinic_integration_id: string
  vaccine_code: string
  date: string
  timezone: string
  slots: VaccinationSlot[]
}

export type CreateVaccinationBookingRequest = {
  clinic_integration_id: string
  vaccine_code: string
  scheduled_at: string
  pet: { id: string; name: string; species?: string; breed?: string }
  owner: { name: string; phone: string; email?: string }
  notes?: string
}

export type VaccinationBookingStatus =
  | 'requested'
  | 'confirmed'
  | 'completed'
  | 'cancelled_by_user'
  | 'cancelled_by_clinic'

export type VaccinationBookingDetail = {
  external_booking_id: string
  clinic_integration_id: string
  status: VaccinationBookingStatus
  scheduled_at: string
  vaccine_code: string
  pet: { id: string; name: string }
  owner: { name: string; phone: string }
  merchant_status?: {
    appointment_status: string
    internal_appointment_id: number
  }
  updated_at: string
}

export type FacadeResponse<T> = {
  code: number
  message: string
  data: T | null
}

// 不需要实现 fetch 函数，只需要类型定义和常量。
// 真正的 API 调用在 Step 3 实现。
```

---

### 🔬 QA Prompt
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

Step 2 Backend 完成后，执行手动验证：

1. 启动后端：cd backend && go run ./cmd/server/main.go &

2. 验证无 App Key 时返回 401：
curl -s -X GET http://localhost:8080/app/v1/vaccinations/availability \
  -H "Content-Type: application/json" | jq .

预期：{"code":40101,"message":"missing app key","data":null}

3. 验证 App Key 错误时返回 401：
curl -s -X GET http://localhost:8080/app/v1/vaccinations/availability \
  -H "X-Merchant-App-Key: pk_app_wrong_key" | jq .

预期：{"code":40102,"message":"invalid app key","data":null}

4. 验证正确 App Key 时返回 501（stub）：
curl -s -X GET http://localhost:8080/app/v1/vaccinations/availability \
  -H "X-Merchant-App-Key: pk_app_test_secret_key_dev" | jq .

预期：{"code":50101,"message":"not implemented","data":null}

5. 验证内部 merchant 路由不受影响（仍需 session）：
curl -s -X GET http://localhost:8080/v1/merchant/me | jq .
预期：session 相关错误，不是 404。

将测试结果记录在 docs/phase4a_step2_verification.md 中，格式：
# Step 2 Verification
## Test Results
[每个测试的命令 + 实际输出]
## Status: PASS / FAIL
```

---

### 验收标准（Step 2 完成）
- [ ] `/app/v1/vaccinations/*` 路由存在
- [ ] 无 Key → 40101，错误 Key → 40102，正确 Key → 50101（stub）
- [ ] 内部 `/v1/merchant/*` 路由不受影响
- [ ] Frontend `vaccination-api.ts` 类型文件存在

---

## Step 3：Facade 业务逻辑实现

**目标：** 实现四个 Facade Handler 的完整业务逻辑。

### Prerequisite
- Step 2 全部通过

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

Step 2 已完成，stub handler 在 handlers/vaccination_stub.go。
现在将其替换为完整实现。将 vaccination_stub.go 重命名或替换为 vaccination.go。

任务 1：实现工具函数（在 handlers/vaccination.go 顶部）

type FacadeResp struct {
    Code    int         `json:"code"`
    Message string      `json:"message"`
    Data    interface{} `json:"data"`
}

func facadeOK(c *gin.Context, data interface{}) {
    c.JSON(200, FacadeResp{Code: 0, Message: "ok", Data: data})
}

func facadeErr(c *gin.Context, httpStatus, code int, msg string) {
    c.JSON(httpStatus, FacadeResp{Code: code, Message: msg, Data: nil})
}

func resolveBinding(db *gorm.DB, clinicIntegrationID string, projectID uint) (*models.ClinicIntegrationBinding, error)
// 查询 WHERE clinic_integration_id = ? AND project_id = ? AND status = 'active'

---

任务 2：实现 GetVaccinationAvailability

Query params: clinic_integration_id, vaccine_code, date (YYYY-MM-DD)

逻辑：
1. 验证 clinic_integration_id 不为空 → 40011
2. 验证 vaccine_code 不为空 → 40013
3. 验证 date 格式 (time.Parse("2006-01-02", date)) → 40012
4. resolveBinding → 404 if not found
5. 用 TenantID 查 ClinicScheduleTemplate，找对应 DayOfWeek 的模板
   若无模板或 IsActive=false → 返回 slots: []（空可用）
6. 根据 OpenTime/CloseTime/SlotDurationMin 生成当天所有时间段
7. 查询 clinic_appointments WHERE tenant_id=? AND scheduled_at BETWEEN 当天开始和结束
   AND status NOT IN ('cancelled')
   得到已占用的时间段集合
8. 每个时间段：若与已有预约时间重叠则 is_available: false，否则 true
   已过去的时间段：is_available: false
9. 返回响应格式（严格按照 docs/phase4a_merchant_service_facade_contract.md 第 4.1 节）

---

任务 3：实现 CreateVaccinationBooking

Body: CreateVaccinationBookingRequest（参考 frontend/lib/vaccination-api.ts 中的类型）

逻辑：
1. 读取 Header Idempotency-Key，若缺失 → 400, code 40010, "idempotency key required"
2. 检查 VaccinationBookingFacade WHERE idempotency_key = ? 是否已存在
   若存在：直接返回已有记录的响应（幂等）
3. 验证必填字段（clinic_integration_id, vaccine_code, scheduled_at, pet.id, pet.name, owner.name, owner.phone）
4. 解析 scheduled_at（RFC3339）→ 40012 若格式错误
5. resolveBinding → 40401 if not found
6. 生成 ExternalBookingID：格式 "vbk_" + UUID v4 前8位（用 github.com/google/uuid）
7. 序列化整个 request body 为 JSON 存入 RawRequestJSON

事务内执行：
a. 查 ClinicIntegrationBinding.DefaultDoctorID，若 nil 则从该 tenant 随机选一个 role='doctor' 的 user
b. 创建 ClinicAppointment：
   - TenantID: binding.TenantID
   - BusinessType: "clinic"
   - PetName: req.pet.name
   - PetOwnerName: req.owner.name
   - PetOwnerPhone: req.owner.phone
   - DoctorID: 上面选的 doctorID
   - VisitType: "vaccination"
   - ScheduledAt: req.scheduled_at
   - Status: "pending"
   - Notes: req.notes（可为空）
   - Source: "app_facade"
c. 创建 VaccinationBookingFacade：
   - 填入所有字段
   - InternalAppointmentID: 上面创建的 appointment.ID
   - Status: "requested"

8. 返回响应（严格按照 docs/phase4a_merchant_service_facade_contract.md 第 4.2 节）

---

任务 4：实现 GetVaccinationBooking

Path param: external_booking_id

逻辑：
1. 查 VaccinationBookingFacade WHERE external_booking_id = ? → 40402 if not found
2. 验证 facade.ProjectID == ctx 中的 app_project_id → 403
3. 若 InternalAppointmentID != nil，查 ClinicAppointment 得到当前内部状态
4. 返回响应（按 facade contract 第 4.3 节）

---

任务 5：实现 CancelVaccinationBooking

Path param: external_booking_id
Body: { "reason": "owner_requested" }

合法状态转换：只允许 requested→cancelled_by_user, confirmed→cancelled_by_user

逻辑：
1. 查 VaccinationBookingFacade → 40402 if not found
2. 验证 ProjectID → 403
3. 若当前 Status 不在可取消状态（completed/cancelled_by_*）→ 422, code 42201
4. 事务内：
   a. 更新 VaccinationBookingFacade.Status = "cancelled_by_user"
   b. 若 InternalAppointmentID != nil，更新 ClinicAppointment.Status = "cancelled"
      并写 CancelReason = req.reason
5. 返回响应（按 facade contract 第 4.4 节）

---

任务 6：cd backend && go build ./... 零报错。
删除或清空 vaccination_stub.go（如果与 vaccination.go 冲突）。
```

---

### 🖥 Frontend Prompt
```
你是一个前端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/frontend。

Step 2 已创建 lib/vaccination-api.ts（类型定义）。
现在实现真正的 API 调用函数。

任务 1：在 frontend/lib/vaccination-api.ts 末尾追加以下函数

const DEV_APP_KEY = 'pk_app_test_secret_key_dev'
const DEV_CLINIC_INTEGRATION_ID = 'clinic_happypaws_hk'

async function facadeFetch<T>(
  path: string,
  options: RequestInit = {},
  idempotencyKey?: string
): Promise<FacadeResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Merchant-App-Key': DEV_APP_KEY,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${FACADE_BASE}${path}`, { ...options, headers })
  return res.json()
}

export async function getVaccinationAvailability(
  vaccineCode: string,
  date: string
): Promise<FacadeResponse<VaccinationAvailabilityResponse>> {
  const params = new URLSearchParams({
    clinic_integration_id: DEV_CLINIC_INTEGRATION_ID,
    vaccine_code: vaccineCode,
    date,
  })
  return facadeFetch(`/vaccinations/availability?${params}`)
}

export async function createVaccinationBooking(
  req: CreateVaccinationBookingRequest,
  idempotencyKey: string
): Promise<FacadeResponse<VaccinationBookingDetail>> {
  return facadeFetch('/vaccinations/bookings', {
    method: 'POST',
    body: JSON.stringify(req),
  }, idempotencyKey)
}

export async function getVaccinationBooking(
  externalBookingId: string
): Promise<FacadeResponse<VaccinationBookingDetail>> {
  return facadeFetch(`/vaccinations/bookings/${externalBookingId}`)
}

export async function cancelVaccinationBooking(
  externalBookingId: string,
  reason: string
): Promise<FacadeResponse<{ external_booking_id: string; status: string; updated_at: string }>> {
  return facadeFetch(`/vaccinations/bookings/${externalBookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

任务 2：在 Zustand store 目录（frontend/lib/stores/ 或 frontend/stores/）
如果目录不存在就查找现有 Zustand store 文件位置，参照现有写法
新建 vaccination-store.ts：

import { create } from 'zustand'
import type { VaccinationBookingStatus, VaccinationSlot } from '../vaccination-api'

type VaccinationStore = {
  selectedDate: string
  selectedSlot: VaccinationSlot | null
  availabilityByDate: Record<string, VaccinationSlot[]>
  currentBookingId: string | null
  currentStatus: VaccinationBookingStatus | null
  submitState: 'idle' | 'submitting' | 'success' | 'error'
  error: string | null

  setSelectedDate: (date: string) => void
  setSelectedSlot: (slot: VaccinationSlot | null) => void
  setAvailability: (date: string, slots: VaccinationSlot[]) => void
  setCurrentBooking: (id: string, status: VaccinationBookingStatus) => void
  setSubmitState: (state: VaccinationStore['submitState'], error?: string) => void
  reset: () => void
}

export const useVaccinationStore = create<VaccinationStore>((set) => ({
  selectedDate: '',
  selectedSlot: null,
  availabilityByDate: {},
  currentBookingId: null,
  currentStatus: null,
  submitState: 'idle',
  error: null,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setAvailability: (date, slots) =>
    set((s) => ({ availabilityByDate: { ...s.availabilityByDate, [date]: slots } })),
  setCurrentBooking: (id, status) => set({ currentBookingId: id, currentStatus: status }),
  setSubmitState: (submitState, error = null) => set({ submitState, error }),
  reset: () => set({
    selectedDate: '', selectedSlot: null, currentBookingId: null,
    currentStatus: null, submitState: 'idle', error: null,
  }),
}))
```

---

### 验收标准（Step 3 完成）
- [ ] `go build ./...` 零报错
- [ ] Availability 接口返回正确时间段结构
- [ ] Create booking 写入 VaccinationBookingFacade 和 ClinicAppointment
- [ ] Get booking 返回正确状态
- [ ] Cancel 拒绝非法状态转换（completed → cancel 应返回 422）
- [ ] Frontend API 函数和 Zustand store 存在

---

## Step 4：状态同步 + Portal 可见性 + 端到端测试

**目标：** 确保 Portal 操作会同步回 Facade 状态；Playwright E2E 验证全链路。

### Prerequisite
- Step 3 全部通过

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

任务：在 handlers/clinic.go 的 UpdateClinicAppointmentStatus handler 末尾，
添加 Facade 状态同步逻辑。

在成功更新 ClinicAppointment.Status 之后：
1. 查询是否存在关联的 VaccinationBookingFacade（WHERE internal_appointment_id = appointment.ID）
2. 若存在，根据新的 appointment.status 映射到 facade status：
   - "confirmed" / "checked_in" / "in_progress" → "confirmed"
   - "completed" → "completed"
   - "cancelled" → 根据 appointment.CancelReason 判断：
     若包含 "user" → "cancelled_by_user"，否则 → "cancelled_by_clinic"
   - 其他状态（pending）→ 不更新 facade status
3. 若映射有结果，db.Model(&facade).Update("status", mappedStatus)
4. 不要影响原有 handler 的响应结构

cd backend && go build ./... 零报错。
```

---

### 🔬 QA Prompt
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

编写 Playwright 测试文件 tests/phase4a/phase4a_vaccination.spec.ts

测试配置：
- baseURL: http://localhost:3000
- 直接调用后端 http://localhost:8080（不通过前端）
- APP_KEY = 'pk_app_test_secret_key_dev'
- CLINIC_INTEGRATION_ID = 'clinic_happypaws_hk'

测试用例（使用 test.describe.configure({ mode: 'serial' })）：

TC-4A-01：Auth 缺失 App Key 返回 401
  request.get('http://localhost:8080/app/v1/vaccinations/availability')
  expect status 401, body.code === 40101

TC-4A-02：Auth 错误 App Key 返回 401
  header X-Merchant-App-Key: pk_app_wrong
  expect status 401, body.code === 40102

TC-4A-03：获取可用时间段
  GET /app/v1/vaccinations/availability
  params: clinic_integration_id, vaccine_code=rabies, date=明天的日期(YYYY-MM-DD)
  expect: code 0, data.slots 是数组, slots 每项有 slot_id/start_at/end_at/is_available

TC-4A-04：创建疫苗预约
  POST /app/v1/vaccinations/bookings
  header Idempotency-Key: test-idem-key-001
  body: { clinic_integration_id, vaccine_code: "rabies", scheduled_at: 明天09:00 RFC3339,
    pet: { id: "pet_test_001", name: "TestDog" },
    owner: { name: "Test Owner", phone: "+85291234567" } }
  expect: code 0, data.external_booking_id 存在, data.status === "requested"
  保存 external_booking_id 供后续用例使用

TC-4A-05：幂等：相同 Idempotency-Key 重复请求
  重发 TC-4A-04 完全相同的请求
  expect: code 0, 返回与 TC-4A-04 相同的 external_booking_id

TC-4A-06：查询预约状态
  GET /app/v1/vaccinations/bookings/{external_booking_id}
  expect: code 0, status === "requested"

TC-4A-07：取消预约
  POST /app/v1/vaccinations/bookings/{external_booking_id}/cancel
  body: { reason: "owner_requested" }
  expect: code 0, status === "cancelled_by_user"

TC-4A-08：Portal 状态同步验证
  先登录（直接调用 /v1/merchant/auth/login）得到 session_id
  GET /v1/merchant/clinic/appointments（带 X-Session-ID 和 X-Business-Type: clinic）
  找到 source = "app_facade" 的预约
  PATCH /v1/merchant/clinic/appointments/{id}/status body: { status: "confirmed" }
  GET /app/v1/vaccinations/bookings/{external_booking_id}
  expect: facade status === "confirmed"

TC-4A-09：非法状态转换拒绝
  对已 cancelled 的预约再次 cancel
  expect: code 42201, http status 422

测试结束后输出结果到 docs/phase4a_test_results.md
```

---

### 🏛 Architect Prompt
```
你是一个系统架构师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

Step 4 完成后，执行以下文档维护工作：

1. 在 specs/Phase4_App联调/Phase4_详细计划.md 文件顶部第一行后追加：
---
> ⚠️ 此文档中的 sync_queue / pending-tasks / Toast / Supabase Realtime 内容
> 已被 Phase 4B 接管，Vaccination Facade 部分已由 Phase 4A 实现。
> 请以 docs/phase4a_*.md 和 Phase4A_Steps.md 为准。
---

2. 在 docs/phase4a_vaccination_revised_integration_plan.md 末尾追加：
## Implementation Status
- Step 1 (Schema): ✅ Completed
- Step 2 (Auth + Routes): ✅ Completed
- Step 3 (Business Logic): ✅ Completed
- Step 4 (Sync + Tests): ✅ Completed
- Phase 4A 整体状态: ✅ DONE

3. 更新 docs/phase4a_merchant_service_facade_contract.md 中所有旧路径引用：
将 /merchant/auth/login → /v1/merchant/auth/login
将 /api/merchant → /api/v1/merchant

4. 输出一份简短的 Phase 4A 完成总结：docs/phase4a_completion_summary.md
包含：实现了哪些接口、数据模型、已知限制（如 Availability 算法是基于 ScheduleTemplate 的简单实现）
```

---

### 验收标准（Step 4 完成 = Phase 4A 完成）
- [ ] Portal 更新预约状态后，Facade 状态自动同步
- [ ] TC-4A-01 到 TC-4A-09 全部 PASS
- [ ] 旧 Phase 4 文档已标记废弃说明
- [ ] `docs/phase4a_completion_summary.md` 存在

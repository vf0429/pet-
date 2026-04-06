# Phase 3 技术契约文档（Clinic 核心功能）

## 1. 文档目标与范围

- Phase 目标：交付 Clinic 后台核心业务，覆盖 Dashboard、预约、就诊、回访、保险理赔、药房、附件上传与 App 病历推送。
- 适用对象：Architect、Backend Dev、Frontend Dev、QA。
- 本文以 `docs/phase1_contract.md`、`docs/phase2_contract.md` 与现有实现（`backend/cmd/server/main.go`、`backend/models/*.go`、`frontend/lib/api.ts`）为基线。
- 所有新增 Clinic / Insurance API 必须挂在 `middleware.MerchantAuthMiddleware(db)` 之后。

---

## 2. 统一约定

### 2.1 基础约定

- API Base Path：`/merchant`
- Clinic 路由前缀：`/merchant/clinic`
- Insurance 路由前缀：`/merchant/clinic/insurance`
- 受保护接口必须携带：

```http
X-Session-ID: <uuid>
X-Business-Type: clinic
```

- 时间格式：默认 `RFC3339`；病历摘要中的 `visit_date`、`next_followup_at` 使用 `YYYY-MM-DD`
- 后端 JSON：`snake_case`
- 前端内部状态 / Zustand：`camelCase`
- 金额单位：`HKD`
- 分页：`page` 从 1 开始，默认 1；`per_page` 默认 20，最大 100
- 所有后端查询必须显式附带 `WHERE tenant_id = ?`
- 前端所有 API 调用必须经 `frontend/lib/api.ts` 封装，不允许页面直接 `fetch`
- 前端所有页面必须处理 `Loading / Empty / Error` 三态
- 新增 Clinic 路由必须同步在 Sidebar 增加导航项

### 2.2 统一响应格式

Phase 3 新增业务接口统一使用 Phase 2 包裹格式：

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

错误时：

```json
{
  "code": 10001,
  "data": null,
  "message": "invalid request"
}
```

> 说明：Phase 1 登录/鉴权中间件仍可能返回 `error/message` 结构；语义与下文错误码保持一致，后续中间件统一时不得改动语义名称。

### 2.3 枚举

#### appointment.status

- `pending`
- `confirmed`
- `checked_in`
- `in_progress`
- `completed`
- `cancelled`

#### visit.status

- `in_progress`
- `diagnosed`
- `treated`
- `prescription_done`
- `closed`

#### followup.status

- `pending`
- `done`
- `skipped`

#### visit_type

- `vaccine`
- `checkup`
- `surgery`
- `emergency`
- `dental`
- `followup`

#### storage_condition

- `refrigerated`
- `room_temp`
- `light_protected`

#### insurance_claim.status

- `draft`
- `submitted`
- `processing`
- `approved`
- `rejected`

#### app_sync_queue.status

- `pending`
- `sent`
- `failed`
- `dead_letter`

### 2.4 错误码注册表

| code | Phase 1 语义别名 | HTTP Status | message |
|---|---|---:|---|
| 0 | ok | 200 | ok |
| 10001 | invalid_request | 400 | invalid request |
| 10002 | invalid_query_params | 400 | invalid query params |
| 10003 | invalid_business_type | 400 | invalid business type |
| 10004 | missing_business_type | 400 | missing business type |
| 10009 | illegal_status_transition | 400 | illegal status transition |
| 10010 | invalid_appointment_status | 400 | invalid appointment status |
| 10011 | missing_cancel_reason | 400 | cancel_reason is required when status=cancelled |
| 10012 | invalid_visit_status | 400 | invalid visit status |
| 10013 | invalid_followup_status | 400 | invalid followup status |
| 10014 | invalid_file_type | 400 | only jpg, png, pdf are supported |
| 10015 | file_too_large | 400 | file size exceeds 20MB |
| 10016 | prescription_required | 400 | prescription_id is required for prescription-only item |
| 10017 | invalid_dispense_quantity | 400 | quantity must be greater than 0 and less than or equal to stock_level |
| 10018 | invalid_visit_type | 400 | invalid visit type |
| 10019 | invalid_insurance_claim_status | 400 | invalid insurance claim status |
| 10020 | invalid_patch_payload | 400 | patch payload is invalid |
| 10021 | invalid_date | 400 | date must be in YYYY-MM-DD format |
| 10022 | invalid_storage_condition | 400 | invalid storage condition |
| 10023 | doctor_required | 400 | doctor_id is required |
| 20001 | session_missing | 401 | X-Session-ID header is required |
| 20002 | session_expired | 401 | session is invalid or expired |
| 20003 | account_suspended | 403 | tenant account is suspended |
| 20004 | business_scope_forbidden | 403 | current account cannot access clinic scope |
| 20005 | pharmacy_dispense_forbidden | 403 | only doctor or owner can dispense prescription-only item |
| 30011 | appointment_not_found | 404 | clinic appointment not found |
| 30012 | visit_not_found | 404 | clinic visit not found |
| 30013 | followup_not_found | 404 | clinic followup not found |
| 30014 | pharmacy_item_not_found | 404 | pharmacy item not found |
| 30015 | prescription_not_found | 404 | clinic prescription not found |
| 30016 | insurance_claim_not_found | 404 | insurance claim not found |
| 30017 | doctor_not_found | 404 | doctor not found |
| 30018 | insurance_policy_not_found | 404 | no bound insurance policy found for this visit |
| 50000 | internal_error | 500 | unexpected server error |

---

## 3. API 端点清单

> 所有端点默认额外包含以下鉴权错误：`20001`、`20002`、`10004`、`10003`、`20003`、`20004`。

### 3.1 GET /merchant/clinic/stats

**目的**：返回 Clinic Dashboard KPI、今日预约列表、App 同步卡片数据。

**Query 参数**：无。

**Request Body**：无。

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "today_appointments": 18,
    "today_appointments_delta": 3,
    "in_progress_visits": 3,
    "pending_followups_overdue": 2,
    "new_patients_this_month": 24,
    "today_appointment_list": [
      {
        "id": 101,
        "scheduled_at": "2026-03-24T09:00:00Z",
        "pet_name": "Buddy",
        "pet_owner_name": "Chan Tai Man",
        "visit_type": "checkup",
        "doctor_id": 8,
        "doctor_name": "Dr. Li",
        "status": "confirmed"
      }
    ],
    "sync_status": {
      "pending_count": 1,
      "failed_count": 0,
      "last_synced_at": "2026-03-24T08:45:00Z"
    }
  },
  "message": "ok"
}
```

**data 字段定义**

| 字段 | 类型 | 必填 |
|---|---|---:|
| today_appointments | number | 是 |
| today_appointments_delta | number | 是 |
| in_progress_visits | number | 是 |
| pending_followups_overdue | number | 是 |
| new_patients_this_month | number | 是 |
| today_appointment_list | array | 是 |
| sync_status.pending_count | number | 是 |
| sync_status.failed_count | number | 是 |
| sync_status.last_synced_at | string \| null | 是 |

**错误响应**：`50000`

---

### 3.2 GET /merchant/clinic/appointments

**目的**：预约管理列表视图 / 排班矩阵视图查询。

**Query 参数**

| 参数 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|---|---|---:|---|---|---|
| view | string | 否 | `list` | `matrix` | `list` / `matrix` |
| status | string | 否 | 空 | `confirmed` | 预约状态过滤 |
| date | string | 否 | 当天 | `2026-03-24` | `YYYY-MM-DD` |
| doctor_id | number | 否 | 空 | `8` | 医生过滤 |
| page | number | 否 | `1` | `2` | 仅 `list` 模式有效 |
| per_page | number | 否 | `20` | `20` | 仅 `list` 模式有效 |

**Request Body**：无。

**成功响应 200（list）**

```json
{
  "code": 0,
  "data": {
    "view": "list",
    "appointments": [
      {
        "id": 101,
        "pet_name": "Buddy",
        "pet_owner_name": "Chan Tai Man",
        "pet_owner_phone": "+85291234567",
        "visit_type": "checkup",
        "doctor_id": 8,
        "doctor_name": "Dr. Li",
        "scheduled_at": "2026-03-24T09:00:00Z",
        "status": "confirmed",
        "cancel_reason": "",
        "notes": "",
        "created_at": "2026-03-23T09:00:00Z",
        "updated_at": "2026-03-24T08:05:00Z"
      }
    ],
    "total": 20,
    "page": 1,
    "per_page": 20,
    "has_more": false,
    "filters": {
      "status": "confirmed",
      "date": "2026-03-24",
      "doctor_id": 8
    }
  },
  "message": "ok"
}
```

**成功响应 200（matrix）**

```json
{
  "code": 0,
  "data": {
    "view": "matrix",
    "date": "2026-03-24",
    "time_slots": ["09:00", "09:30", "10:00"],
    "doctors": [
      {
        "doctor_id": 8,
        "doctor_name": "Dr. Li",
        "slots": [
          {
            "time": "09:00",
            "appointment_id": 101,
            "pet_name": "Buddy",
            "visit_type": "checkup",
            "status": "confirmed",
            "duration_minutes": 30
          },
          {
            "time": "09:30",
            "appointment_id": null,
            "pet_name": null,
            "visit_type": null,
            "status": "available",
            "duration_minutes": 30
          }
        ]
      }
    ]
  },
  "message": "ok"
}
```

**错误响应**：`10002`、`10010`、`10021`、`30017`、`50000`

---

### 3.3 PATCH /merchant/clinic/appointments/:id/status

**目的**：驱动预约状态机；`checked_in -> in_progress` 时自动创建 `clinic_visits`。

**Request Body JSON**

```json
{
  "target_status": "in_progress",
  "cancel_reason": "owner_cancelled",
  "note": "Pet arrived 10 minutes early"
}
```

**字段定义**

| 字段 | 类型 | 必填 | 示例值 | 说明 |
|---|---|---:|---|---|
| target_status | string | 是 | `confirmed` | 目标预约状态 |
| cancel_reason | string | 条件必填 | `owner_cancelled` | `target_status=cancelled` 时必填 |
| note | string | 否 | `Owner requested afternoon slot` | 状态变更备注 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 101,
    "previous_status": "checked_in",
    "current_status": "in_progress",
    "cancel_reason": "",
    "visit_id": 501,
    "sync_queue": {
      "id": 901,
      "entity_type": "appointment",
      "entity_id": "101",
      "action": "appointment_confirmed",
      "status": "pending"
    },
    "updated_at": "2026-03-24T09:20:00Z"
  },
  "message": "ok"
}
```

**副作用**

- `pending -> confirmed`：可写入 `app_sync_queue`，用于 App 预约状态同步
- `checked_in -> in_progress`：自动创建一条 `clinic_visits`
- `* -> cancelled`：写入取消原因

**错误响应**：`10001`、`10009`、`10010`、`10011`、`30011`、`50000`

---

### 3.4 GET /merchant/clinic/visits/:id

**目的**：返回单个就诊记录及其聚合子资源。

**Request Body**：无。

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 501,
    "tenant_id": 1,
    "appointment_id": 101,
    "pet_name": "Buddy",
    "pet_breed": "Golden Retriever",
    "pet_age": "3 years",
    "pet_weight": 22.7,
    "pet_medical_history": "No known allergies",
    "chief_complaint": "Loss of appetite",
    "temperature": 38.7,
    "heart_rate": 96,
    "respiratory_rate": 24,
    "status": "diagnosed",
    "pushed_at": null,
    "created_at": "2026-03-24T09:00:00Z",
    "updated_at": "2026-03-24T09:35:00Z",
    "diagnoses": [
      { "id": 1, "name": "Canine Distemper", "is_primary": true, "notes": "" }
    ],
    "prescriptions": [
      { "id": 1, "drug_name": "Amoxicillin", "dosage": "250mg", "frequency": "twice daily", "duration_days": 7, "notes": "take with food" }
    ],
    "treatments": [
      { "id": 1, "name": "IV Fluid Therapy", "performed_by_id": 8, "performed_by_name": "Dr. Li", "fee": 300, "currency": "HKD", "notes": "" }
    ],
    "followups": [
      { "id": 1, "reason": "Post-treatment checkup", "doctor_id": 8, "doctor_name": "Dr. Li", "due_at": "2026-04-07T00:00:00Z", "status": "pending", "result_note": "" }
    ],
    "files": [
      { "id": 1, "file_name": "blood_test.pdf", "file_url": "assets/clinic_files/1/501/blood_test.pdf", "file_size": 42000, "file_type": "application/pdf", "uploaded_at": "2026-03-24T09:40:00Z" }
    ],
    "general_medication_notes": "Take after meals",
    "treatment_total_fee": 300,
    "currency": "HKD"
  },
  "message": "ok"
}
```

**错误响应**：`30012`、`50000`

---

### 3.5 PATCH /merchant/clinic/visits/:id

**目的**：JSON Merge Patch 风格更新 visit 主字段、状态与子资源集合。

**Request Body JSON**

```json
{
  "chief_complaint": "Loss of appetite",
  "temperature": 38.7,
  "heart_rate": 96,
  "respiratory_rate": 24,
  "target_status": "treated",
  "diagnoses": [
    { "id": 1, "name": "Canine Distemper", "is_primary": true, "notes": "Primary diagnosis" }
  ],
  "prescriptions": [
    { "id": null, "drug_name": "Amoxicillin", "dosage": "250mg", "frequency": "twice daily", "duration_days": 7, "notes": "Take with food" }
  ],
  "treatments": [
    { "id": null, "name": "IV Fluid Therapy", "performed_by_id": 8, "fee": 300, "notes": "" }
  ],
  "followups": [
    { "id": null, "reason": "Re-check appetite", "doctor_id": 8, "due_at": "2026-04-07T00:00:00Z" }
  ],
  "general_medication_notes": "Keep hydrated"
}
```

**字段定义**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| chief_complaint | string | 否 | 主诉 |
| temperature | number \| null | 否 | 体温 |
| heart_rate | number \| null | 否 | 心率 |
| respiratory_rate | number \| null | 否 | 呼吸率 |
| target_status | string | 否 | visit 状态流转 |
| diagnoses | array | 否 | 全量替换诊断列表 |
| diagnoses[].id | number \| null | 否 | 空表示新增 |
| diagnoses[].name | string | 是 | 诊断名 |
| diagnoses[].is_primary | boolean | 是 | 是否主诊断 |
| diagnoses[].notes | string | 否 | 诊断备注 |
| prescriptions | array | 否 | 全量替换处方列表 |
| prescriptions[].id | number \| null | 否 | 空表示新增 |
| prescriptions[].drug_name | string | 是 | 药品名 |
| prescriptions[].dosage | string | 是 | 用量/规格 |
| prescriptions[].frequency | string | 是 | 频次 |
| prescriptions[].duration_days | number | 是 | 天数 |
| prescriptions[].notes | string | 否 | 备注 |
| treatments | array | 否 | 全量替换处置列表 |
| treatments[].id | number \| null | 否 | 空表示新增 |
| treatments[].name | string | 是 | 项目名 |
| treatments[].performed_by_id | number | 是 | 执行医生 |
| treatments[].fee | number | 是 | 费用 |
| treatments[].notes | string | 否 | 备注 |
| followups | array | 否 | 全量替换回访计划 |
| followups[].id | number \| null | 否 | 空表示新增 |
| followups[].reason | string | 是 | 回访原因 |
| followups[].doctor_id | number | 是 | 负责医生 |
| followups[].due_at | string | 是 | RFC3339 时间 |
| general_medication_notes | string | 否 | 用药注意事项 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 501,
    "status": "treated",
    "updated_at": "2026-03-24T10:10:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10001`、`10009`、`10012`、`10020`、`30012`、`30015`、`30017`、`50000`

---

### 3.6 POST /merchant/clinic/visits/:id/push-to-app

**目的**：手动推送病历摘要到 App，并更新 `visits.pushed_at`。

**Request Body**：无。

**`app_sync_queue.payload` 技术契约**

```json
{
  "entity_type": "medical_record",
  "entity_id": "501",
  "action": "record_published",
  "payload": {
    "visit_date": "2026-03-24",
    "pet_name": "Buddy",
    "primary_diagnosis": "犬瘟热",
    "meds_summary": "阿莫西林 250mg 每日两次 7天",
    "next_followup_at": "2026-04-07"
  }
}
```

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "visit_id": 501,
    "pushed_at": "2026-03-24T10:20:00Z",
    "sync_queue": {
      "id": 905,
      "entity_type": "medical_record",
      "entity_id": "501",
      "action": "record_published",
      "status": "pending"
    }
  },
  "message": "ok"
}
```

**错误响应**：`30012`、`50000`

---

### 3.7 POST /merchant/clinic/visits/:id/files

**目的**：上传 visit 附件，当前落盘到 `assets/clinic_files/{tenant_id}/{visit_id}/`。

**Content-Type**：`multipart/form-data`

**表单字段定义**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| file | binary | 是 | 支持 `jpg` / `png` / `pdf`，单文件 ≤ 20MB |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 77,
    "file_name": "report.pdf",
    "file_url": "assets/clinic_files/1/501/report.pdf",
    "file_size": 42000,
    "file_type": "application/pdf",
    "uploaded_at": "2026-03-24T10:30:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10001`、`10014`、`10015`、`30012`、`50000`

---

### 3.8 GET /merchant/clinic/followups

**目的**：查询回访列表。

**Query 参数**

| 参数 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|---|---|---:|---|---|---|
| status | string | 否 | 空 | `overdue` | `pending` / `done` / `skipped` / `overdue` |
| doctor_id | number | 否 | 空 | `8` | 按医生筛选 |
| page | number | 否 | `1` | `1` | 页码 |
| per_page | number | 否 | `20` | `20` | 每页条数 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "followups": [
      {
        "id": 1,
        "visit_id": 501,
        "pet_name": "Buddy",
        "pet_owner_name": "Chan Tai Man",
        "last_visit_date": "2026-03-24T09:00:00Z",
        "reason": "Post-treatment checkup",
        "doctor_id": 8,
        "doctor_name": "Dr. Li",
        "due_at": "2026-04-07T00:00:00Z",
        "status": "pending",
        "is_overdue": false,
        "result_note": "",
        "created_at": "2026-03-24T10:00:00Z"
      }
    ],
    "total": 6,
    "page": 1,
    "per_page": 20,
    "has_more": false
  },
  "message": "ok"
}
```

**错误响应**：`10002`、`10013`、`30017`、`50000`

---

### 3.9 POST /merchant/clinic/followups

**目的**：手动创建回访计划。

**Request Body JSON**

```json
{
  "visit_id": 501,
  "reason": "Re-check appetite",
  "doctor_id": 8,
  "due_at": "2026-04-07T00:00:00Z"
}
```

**字段定义**

| 字段 | 类型 | 必填 | 示例值 |
|---|---|---:|---|
| visit_id | number | 是 | `501` |
| reason | string | 是 | `Re-check appetite` |
| doctor_id | number | 是 | `8` |
| due_at | string | 是 | `2026-04-07T00:00:00Z` |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 88,
    "visit_id": 501,
    "status": "pending",
    "created_at": "2026-03-24T10:35:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10001`、`10023`、`30012`、`30017`、`50000`

---

### 3.10 PATCH /merchant/clinic/followups/:id/status

**目的**：将回访标记为已完成或已跳过。

**Request Body JSON**

```json
{
  "target_status": "done",
  "result_note": "Owner confirmed appetite restored"
}
```

**字段定义**

| 字段 | 类型 | 必填 | 示例值 |
|---|---|---:|---|
| target_status | string | 是 | `done` |
| result_note | string | 否 | `Owner confirmed appetite restored` |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "previous_status": "pending",
    "current_status": "done",
    "result_note": "Owner confirmed appetite restored",
    "updated_at": "2026-03-24T10:40:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10001`、`10013`、`10009`、`30013`、`50000`

---

### 3.11 GET /merchant/clinic/pharmacy

**目的**：药房库存列表查询。

**Query 参数**

| 参数 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|---|---|---:|---|---|---|
| search | string | 否 | 空 | `Amoxicillin` | 名称模糊匹配 |
| is_prescription_only | boolean | 否 | 空 | `true` | 处方药过滤 |
| expiry_filter | string | 否 | 空 | `expiring_soon` | `expiring_soon` / `expired` |
| page | number | 否 | `1` | `1` | 页码 |
| per_page | number | 否 | `20` | `20` | 每页条数 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Amoxicillin 250mg",
        "specification": "250mg x 100 tablets",
        "batch_no": "BATCH-001",
        "expires_at": "2026-06-22T00:00:00Z",
        "stock_level": 85,
        "low_stock_threshold": 20,
        "is_low_stock": false,
        "storage_condition": "room_temp",
        "is_prescription_only": true,
        "is_expiring_soon": false,
        "is_expired": false,
        "days_until_expiry": 90,
        "created_at": "2026-02-24T00:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "per_page": 20
  },
  "message": "ok"
}
```

**错误响应**：`10002`、`50000`

---

### 3.12 PATCH /merchant/clinic/pharmacy/:id/dispense

**目的**：药房出库；处方药必须关联 `prescription_id`。

**Request Body JSON**

```json
{
  "quantity": 2,
  "prescription_id": 11,
  "note": "Dispensed after consultation"
}
```

**字段定义**

| 字段 | 类型 | 必填 | 示例值 | 说明 |
|---|---|---:|---|---|
| quantity | number | 是 | `2` | 必须 > 0 且 <= 当前库存 |
| prescription_id | number | 条件必填 | `11` | `is_prescription_only=true` 时必填 |
| note | string | 否 | `Dispensed after consultation` | 出库备注 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "name": "Amoxicillin 250mg",
    "previous_stock": 85,
    "dispensed_quantity": 2,
    "current_stock": 83,
    "prescription_id": 11,
    "dispensed_at": "2026-03-24T10:50:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10001`、`10016`、`10017`、`20005`、`30014`、`30015`、`50000`

---

### 3.13 GET /merchant/clinic/insurance/coverage-preview

**目的**：只读读取保险模块数据，用于理赔前核验。

**Query 参数**

| 参数 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| visit_id | number | 是 | `501` | 关联就诊记录 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "visit_id": 501,
    "pet_name": "Buddy",
    "pet_owner_name": "Chan Tai Man",
    "policy": {
      "policy_no": "POL-HK-0011",
      "provider_name": "PetCare Insurance",
      "plan_name": "Gold Plan",
      "effective_at": "2026-01-01T00:00:00Z",
      "expires_at": "2026-12-31T23:59:59Z"
    },
    "coverage_items": [
      {
        "item_code": "CONSULT",
        "item_name": "Consultation",
        "coverage_pct": 80,
        "annual_limit": 20000,
        "remaining_limit": 14500,
        "is_covered": true
      }
    ]
  },
  "message": "ok"
}
```

**错误响应**：`10002`、`30012`、`30018`、`50000`

---

### 3.14 GET /merchant/clinic/insurance/claims

**目的**：理赔记录列表查询。

**Query 参数**

| 参数 | 类型 | 必填 | 默认值 | 示例 |
|---|---|---:|---|---|
| status | string | 否 | 空 | `submitted` |
| page | number | 否 | `1` | `1` |
| per_page | number | 否 | `20` | `20` |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "claims": [
      {
        "id": 1,
        "visit_id": 501,
        "submitted_at": "2026-03-24T11:00:00Z",
        "pet_name": "Buddy",
        "policy_no": "POL-HK-0011",
        "provider_name": "PetCare Insurance",
        "plan_name": "Gold Plan",
        "claim_amount": 1200,
        "approved_amount": 0,
        "currency": "HKD",
        "status": "submitted"
      }
    ],
    "total": 3,
    "page": 1,
    "per_page": 20,
    "has_more": false
  },
  "message": "ok"
}
```

**错误响应**：`10002`、`10019`、`50000`

---

### 3.15 POST /merchant/clinic/insurance/claims

**目的**：基于 visit 创建理赔申请，仅写入新表 `insurance_claims`，不改写原保险模块数据。

**Request Body JSON**

```json
{
  "visit_id": 501,
  "policy_no": "POL-HK-0011",
  "provider_name": "PetCare Insurance",
  "plan_name": "Gold Plan",
  "claim_amount": 1200,
  "currency": "HKD",
  "diagnosis_summary": "Canine Distemper",
  "expense_items": [
    { "item_name": "Consultation", "amount": 500, "is_covered": true },
    { "item_name": "Medication", "amount": 700, "is_covered": true }
  ],
  "notes": "Submitted by clinic"
}
```

**字段定义**

| 字段 | 类型 | 必填 |
|---|---|---:|
| visit_id | number | 是 |
| policy_no | string | 是 |
| provider_name | string | 是 |
| plan_name | string | 是 |
| claim_amount | number | 是 |
| currency | string | 是 |
| diagnosis_summary | string | 是 |
| expense_items | array | 是 |
| expense_items[].item_name | string | 是 |
| expense_items[].amount | number | 是 |
| expense_items[].is_covered | boolean | 是 |
| notes | string | 否 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 31,
    "visit_id": 501,
    "status": "submitted",
    "claim_amount": 1200,
    "currency": "HKD",
    "submitted_at": "2026-03-24T11:05:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10001`、`10019`、`30012`、`30018`、`50000`

---

### 3.16 POST /merchant/clinic/insurance/claims/:id/files

**目的**：上传理赔附件。

**Content-Type**：`multipart/form-data`

**表单字段定义**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| file | binary | 是 | 支持 `jpg` / `png` / `pdf`，单文件 ≤ 20MB |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "id": 12,
    "claim_id": 31,
    "file_name": "invoice_1.pdf",
    "file_url": "assets/insurance_claim_files/1/31/invoice_1.pdf",
    "file_size": 39000,
    "file_type": "application/pdf",
    "uploaded_at": "2026-03-24T11:08:00Z"
  },
  "message": "ok"
}
```

**错误响应**：`10014`、`10015`、`30016`、`50000`

---

## 4. 数据库表结构

> 以下为 Phase 3 相关表的 GORM 契约；字段 tag 与现有 `backend/models/clinic.go`、`insurance.go`、`app_sync_queue.go` 保持一致。

### 4.1 ClinicAppointment

```go
type ClinicAppointment struct {
    ID            uint                    `gorm:"primaryKey" json:"id"` // 预约主键
    TenantID      uint                    `gorm:"not null;index:idx_clinic_appt_tenant_status,priority:1;index:idx_clinic_appt_tenant_date,priority:1;index:idx_clinic_appt_tenant_doctor,priority:1" json:"tenant_id"` // 租户 ID
    BusinessType  string                  `gorm:"size:16;not null;default:'clinic';index" json:"business_type"` // 固定 clinic
    PetName       string                  `gorm:"size:128;not null;index" json:"pet_name"` // 宠物名
    PetOwnerName  string                  `gorm:"size:128;not null;index" json:"pet_owner_name"` // 宠物主姓名
    PetOwnerPhone string                  `gorm:"size:32;not null" json:"pet_owner_phone"` // 宠物主电话
    DoctorID      uint                    `gorm:"not null;index:idx_clinic_appt_tenant_doctor,priority:2" json:"doctor_id"` // 分配医生
    VisitType     string                  `gorm:"size:32;not null;index" json:"visit_type"` // vaccine|checkup|surgery|emergency|dental|followup
    ScheduledAt   time.Time               `gorm:"not null;index:idx_clinic_appt_tenant_date,priority:2" json:"scheduled_at"` // 预约时间
    Status        ClinicAppointmentStatus `gorm:"size:24;not null;index:idx_clinic_appt_tenant_status,priority:2" json:"status"` // 预约状态
    CancelReason  string                  `gorm:"size:255" json:"cancel_reason"` // 取消原因
    Notes         string                  `gorm:"type:text" json:"notes"` // 备注
    CreatedAt     time.Time               `json:"created_at"` // 创建时间
    UpdatedAt     time.Time               `json:"updated_at"` // 更新时间

    Tenant Tenant       `gorm:"foreignKey:TenantID"`
    Doctor MerchantUser `gorm:"foreignKey:DoctorID"`
    Visit  *ClinicVisit `gorm:"foreignKey:AppointmentID"`
}
```

**索引**

- `idx_clinic_appt_tenant_status (tenant_id, status)`
- `idx_clinic_appt_tenant_date (tenant_id, scheduled_at)`
- `idx_clinic_appt_tenant_doctor (tenant_id, doctor_id)`
- `business_type`
- `pet_name`
- `pet_owner_name`
- `visit_type`

**关联**

- `tenant_id -> tenants.id`
- `doctor_id -> merchant_users.id`
- `clinic_visits.appointment_id -> clinic_appointments.id`

### 4.2 ClinicVisit

```go
type ClinicVisit struct {
    ID                     uint              `gorm:"primaryKey" json:"id"` // 就诊主键
    TenantID               uint              `gorm:"not null;index:idx_clinic_visits_tenant_status,priority:1;index:idx_clinic_visits_tenant_appt,priority:1" json:"tenant_id"` // 租户 ID
    AppointmentID          uint              `gorm:"not null;index:idx_clinic_visits_tenant_appt,priority:2" json:"appointment_id"` // 关联预约
    PetName                string            `gorm:"size:128;not null;index" json:"pet_name"` // 宠物名
    PetBreed               string            `gorm:"size:128" json:"pet_breed"` // 品种
    PetAge                 string            `gorm:"size:32" json:"pet_age"` // 年龄文本
    PetWeight              float64           `gorm:"type:decimal(6,2)" json:"pet_weight"` // 体重
    PetMedicalHistory      string            `gorm:"type:text" json:"pet_medical_history"` // 既往病史
    ChiefComplaint         string            `gorm:"type:text" json:"chief_complaint"` // 主诉
    Temperature            *float64          `gorm:"type:decimal(4,1)" json:"temperature"` // 体温
    HeartRate              *int              `json:"heart_rate"` // 心率
    RespiratoryRate        *int              `json:"respiratory_rate"` // 呼吸率
    GeneralMedicationNotes string            `gorm:"type:text" json:"general_medication_notes"` // 总体用药注意事项
    Status                 ClinicVisitStatus `gorm:"size:24;not null;index:idx_clinic_visits_tenant_status,priority:2" json:"status"` // 就诊状态
    PushedAt               *time.Time        `json:"pushed_at"` // 推送到 App 时间
    CreatedAt              time.Time         `json:"created_at"` // 创建时间
    UpdatedAt              time.Time         `json:"updated_at"` // 更新时间

    Tenant        Tenant               `gorm:"foreignKey:TenantID"`
    Appointment   ClinicAppointment    `gorm:"foreignKey:AppointmentID"`
    Diagnoses     []ClinicDiagnosis    `gorm:"foreignKey:VisitID"`
    Prescriptions []ClinicPrescription `gorm:"foreignKey:VisitID"`
    Treatments    []ClinicTreatment    `gorm:"foreignKey:VisitID"`
    Followups     []ClinicFollowup     `gorm:"foreignKey:VisitID"`
    Files         []ClinicVisitFile    `gorm:"foreignKey:VisitID"`
}
```

**索引**

- `idx_clinic_visits_tenant_status (tenant_id, status)`
- `idx_clinic_visits_tenant_appt (tenant_id, appointment_id)`
- `pet_name`

**关联**

- `appointment_id -> clinic_appointments.id`
- 下游一对多：`clinic_diagnoses`、`clinic_prescriptions`、`clinic_treatments`、`clinic_followups`、`clinic_visit_files`

### 4.3 ClinicDiagnosis

```go
type ClinicDiagnosis struct {
    ID        uint   `gorm:"primaryKey" json:"id"` // 诊断主键
    VisitID   uint   `gorm:"not null;index:idx_clinic_diagnoses_tenant_visit,priority:2" json:"visit_id"` // 关联 visit
    TenantID  uint   `gorm:"not null;index:idx_clinic_diagnoses_tenant_visit,priority:1" json:"tenant_id"` // 租户 ID
    Name      string `gorm:"size:255;not null" json:"name"` // 诊断名
    IsPrimary bool   `gorm:"not null;default:false" json:"is_primary"` // 是否主诊断
    Notes     string `gorm:"type:text" json:"notes"` // 诊断备注

    Visit  ClinicVisit `gorm:"foreignKey:VisitID"`
    Tenant Tenant      `gorm:"foreignKey:TenantID"`
}
```

**索引**：`idx_clinic_diagnoses_tenant_visit (tenant_id, visit_id)`

### 4.4 ClinicPrescription

```go
type ClinicPrescription struct {
    ID           uint   `gorm:"primaryKey" json:"id"` // 处方主键
    VisitID      uint   `gorm:"not null;index:idx_clinic_prescriptions_tenant_visit,priority:2" json:"visit_id"` // 关联 visit
    TenantID     uint   `gorm:"not null;index:idx_clinic_prescriptions_tenant_visit,priority:1" json:"tenant_id"` // 租户 ID
    DrugName     string `gorm:"size:255;not null" json:"drug_name"` // 药品名称
    Dosage       string `gorm:"size:128;not null" json:"dosage"` // 用量/规格
    Frequency    string `gorm:"size:128;not null" json:"frequency"` // 频次
    DurationDays int    `gorm:"not null;default:1" json:"duration_days"` // 天数
    Notes        string `gorm:"type:text" json:"notes"` // 备注

    Visit  ClinicVisit `gorm:"foreignKey:VisitID"`
    Tenant Tenant      `gorm:"foreignKey:TenantID"`
}
```

**索引**：`idx_clinic_prescriptions_tenant_visit (tenant_id, visit_id)`

### 4.5 ClinicTreatment

```go
type ClinicTreatment struct {
    ID            uint    `gorm:"primaryKey" json:"id"` // 处置主键
    VisitID       uint    `gorm:"not null;index:idx_clinic_treatments_tenant_visit,priority:2" json:"visit_id"` // 关联 visit
    TenantID      uint    `gorm:"not null;index:idx_clinic_treatments_tenant_visit,priority:1" json:"tenant_id"` // 租户 ID
    Name          string  `gorm:"size:255;not null" json:"name"` // 项目名
    PerformedByID uint    `gorm:"not null;index" json:"performed_by_id"` // 执行医生
    Fee           float64 `gorm:"type:decimal(10,2);not null;default:0" json:"fee"` // 费用
    Currency      string  `gorm:"size:8;not null;default:'HKD'" json:"currency"` // 币种
    Notes         string  `gorm:"type:text" json:"notes"` // 备注

    Visit       ClinicVisit  `gorm:"foreignKey:VisitID"`
    Tenant      Tenant       `gorm:"foreignKey:TenantID"`
    PerformedBy MerchantUser `gorm:"foreignKey:PerformedByID"`
}
```

**索引**：`idx_clinic_treatments_tenant_visit (tenant_id, visit_id)`、`performed_by_id`

### 4.6 ClinicFollowup

```go
type ClinicFollowup struct {
    ID         uint                 `gorm:"primaryKey" json:"id"` // 回访主键
    VisitID    uint                 `gorm:"not null;index:idx_clinic_followups_tenant_visit,priority:2" json:"visit_id"` // 关联 visit
    TenantID   uint                 `gorm:"not null;index:idx_clinic_followups_tenant_visit,priority:1;index:idx_clinic_followups_tenant_status,priority:1;index:idx_clinic_followups_tenant_due,priority:1" json:"tenant_id"` // 租户 ID
    PetName    string               `gorm:"size:128;not null;index" json:"pet_name"` // 宠物名
    Reason     string               `gorm:"size:255;not null" json:"reason"` // 回访原因
    DoctorID   uint                 `gorm:"not null;index" json:"doctor_id"` // 负责医生
    DueAt      time.Time            `gorm:"not null;index:idx_clinic_followups_tenant_due,priority:2" json:"due_at"` // 回访到期时间
    Status     ClinicFollowupStatus `gorm:"size:16;not null;default:'pending';index:idx_clinic_followups_tenant_status,priority:2" json:"status"` // pending|done|skipped
    ResultNote string               `gorm:"type:text" json:"result_note"` // 回访结果
    CreatedAt  time.Time            `json:"created_at"` // 创建时间
    UpdatedAt  time.Time            `json:"updated_at"` // 更新时间

    Visit  ClinicVisit  `gorm:"foreignKey:VisitID"`
    Tenant Tenant       `gorm:"foreignKey:TenantID"`
    Doctor MerchantUser `gorm:"foreignKey:DoctorID"`
}
```

**索引**

- `idx_clinic_followups_tenant_visit (tenant_id, visit_id)`
- `idx_clinic_followups_tenant_status (tenant_id, status)`
- `idx_clinic_followups_tenant_due (tenant_id, due_at)`
- `doctor_id`
- `pet_name`

### 4.7 PharmacyItem

```go
type PharmacyItem struct {
    ID                 uint      `gorm:"primaryKey" json:"id"` // 药房库存主键
    TenantID           uint      `gorm:"not null;index:idx_pharmacy_items_tenant_rx,priority:1;index:idx_pharmacy_items_tenant_expiry,priority:1" json:"tenant_id"` // 租户 ID
    Name               string    `gorm:"size:255;not null;index" json:"name"` // 药品名
    Specification      string    `gorm:"size:255;not null" json:"specification"` // 规格
    BatchNo            string    `gorm:"size:64;not null;index" json:"batch_no"` // 批次号
    ExpiresAt          time.Time `gorm:"not null;index:idx_pharmacy_items_tenant_expiry,priority:2" json:"expires_at"` // 有效期
    StockLevel         int       `gorm:"not null;default:0" json:"stock_level"` // 库存
    LowStockThreshold  int       `gorm:"not null;default:0" json:"low_stock_threshold"` // 低库存阈值
    StorageCondition   string    `gorm:"size:32;not null;default:'room_temp'" json:"storage_condition"` // refrigerated|room_temp|light_protected
    IsPrescriptionOnly bool      `gorm:"not null;default:false;index:idx_pharmacy_items_tenant_rx,priority:2" json:"is_prescription_only"` // 是否处方药
    CreatedAt          time.Time `json:"created_at"` // 创建时间
    UpdatedAt          time.Time `json:"updated_at"` // 更新时间

    Tenant Tenant `gorm:"foreignKey:TenantID"`
}
```

**索引**

- `idx_pharmacy_items_tenant_rx (tenant_id, is_prescription_only)`
- `idx_pharmacy_items_tenant_expiry (tenant_id, expires_at)`
- `name`
- `batch_no`

**隔离说明**

- `pharmacy_items` 与 `shop_products` 完全独立
- 处方药出库必须显式关联 `clinic_prescriptions.id`

### 4.8 ClinicVisitFile

```go
type ClinicVisitFile struct {
    ID         uint      `gorm:"primaryKey" json:"id"` // 文件主键
    VisitID    uint      `gorm:"not null;index:idx_clinic_visit_files_tenant_visit,priority:2" json:"visit_id"` // 关联 visit
    TenantID   uint      `gorm:"not null;index:idx_clinic_visit_files_tenant_visit,priority:1" json:"tenant_id"` // 租户 ID
    FileName   string    `gorm:"size:255;not null" json:"file_name"` // 文件名
    FileURL    string    `gorm:"size:512;not null" json:"file_url"` // 存储路径/URL
    FileSize   int64     `gorm:"not null" json:"file_size"` // 文件大小字节数
    FileType   string    `gorm:"size:64;not null" json:"file_type"` // MIME type
    UploadedAt time.Time `gorm:"not null" json:"uploaded_at"` // 上传时间
    CreatedAt  time.Time `json:"created_at"` // 创建时间

    Visit  ClinicVisit `gorm:"foreignKey:VisitID"`
    Tenant Tenant      `gorm:"foreignKey:TenantID"`
}
```

**索引**：`idx_clinic_visit_files_tenant_visit (tenant_id, visit_id)`

### 4.9 InsuranceClaim

```go
type InsuranceClaim struct {
    ID               uint                 `gorm:"primaryKey" json:"id"` // 理赔主键
    TenantID         uint                 `gorm:"not null;index:idx_insurance_claims_tenant_status,priority:1;index:idx_insurance_claims_tenant_visit,priority:1" json:"tenant_id"` // 租户 ID
    VisitID          uint                 `gorm:"not null;index:idx_insurance_claims_tenant_visit,priority:2" json:"visit_id"` // 关联 visit
    PolicyNo         string               `gorm:"size:64;not null;index" json:"policy_no"` // 保单号
    ProviderName     string               `gorm:"size:128;not null" json:"provider_name"` // 保险公司
    PlanName         string               `gorm:"size:128;not null" json:"plan_name"` // 险种名称
    ClaimAmount      float64              `gorm:"type:decimal(10,2);not null" json:"claim_amount"` // 申请金额
    ApprovedAmount   float64              `gorm:"type:decimal(10,2);not null;default:0" json:"approved_amount"` // 核赔金额
    Currency         string               `gorm:"size:8;not null;default:'HKD'" json:"currency"` // 币种
    DiagnosisSummary string               `gorm:"type:text;not null" json:"diagnosis_summary"` // 诊断摘要
    ExpenseItemsJSON string               `gorm:"type:text;not null" json:"expense_items_json"` // 费用明细 JSON 字符串
    Notes            string               `gorm:"type:text" json:"notes"` // 备注
    Status           InsuranceClaimStatus `gorm:"size:24;not null;default:'submitted';index:idx_insurance_claims_tenant_status,priority:2" json:"status"` // 理赔状态
    SubmittedAt      time.Time            `gorm:"not null;index" json:"submitted_at"` // 提交时间
    CreatedAt        time.Time            `json:"created_at"` // 创建时间
    UpdatedAt        time.Time            `json:"updated_at"` // 更新时间

    Tenant Tenant               `gorm:"foreignKey:TenantID"`
    Visit  ClinicVisit          `gorm:"foreignKey:VisitID"`
    Files  []InsuranceClaimFile `gorm:"foreignKey:ClaimID"`
}
```

**索引**

- `idx_insurance_claims_tenant_status (tenant_id, status)`
- `idx_insurance_claims_tenant_visit (tenant_id, visit_id)`
- `policy_no`
- `submitted_at`

**关系说明**

- 只读读取原保险模块数据
- 理赔申请仅落到 `insurance_claims` / `insurance_claim_files`

### 4.10 InsuranceClaimFile

```go
type InsuranceClaimFile struct {
    ID         uint      `gorm:"primaryKey" json:"id"` // 文件主键
    TenantID   uint      `gorm:"not null;index:idx_insurance_claim_files_tenant_claim,priority:1" json:"tenant_id"` // 租户 ID
    ClaimID    uint      `gorm:"not null;index:idx_insurance_claim_files_tenant_claim,priority:2" json:"claim_id"` // 关联 claim
    FileName   string    `gorm:"size:255;not null" json:"file_name"` // 文件名
    FileURL    string    `gorm:"size:512;not null" json:"file_url"` // 路径/URL
    FileSize   int64     `gorm:"not null" json:"file_size"` // 大小
    FileType   string    `gorm:"size:64;not null" json:"file_type"` // MIME type
    UploadedAt time.Time `gorm:"not null" json:"uploaded_at"` // 上传时间
    CreatedAt  time.Time `json:"created_at"` // 创建时间

    Tenant Tenant         `gorm:"foreignKey:TenantID"`
    Claim  InsuranceClaim `gorm:"foreignKey:ClaimID"`
}
```

**索引**：`idx_insurance_claim_files_tenant_claim (tenant_id, claim_id)`

### 4.11 复用表：AppSyncQueue

```go
type AppSyncQueue struct {
    ID         uint               `gorm:"primaryKey" json:"id"` // 队列主键
    TenantID   uint               `gorm:"not null;index:idx_app_sync_queue_tenant_status,priority:1;index:idx_app_sync_queue_tenant_entity,priority:1" json:"tenant_id"` // 租户 ID
    EntityType string             `gorm:"size:32;not null;index:idx_app_sync_queue_tenant_entity,priority:2" json:"entity_type"` // appointment|medical_record 等
    EntityID   string             `gorm:"size:64;not null;index:idx_app_sync_queue_tenant_entity,priority:3" json:"entity_id"` // 业务实体 ID
    Action     string             `gorm:"size:32;not null;index" json:"action"` // 业务动作
    Payload    string             `gorm:"type:text;not null" json:"payload"` // JSON 字符串
    Status     AppSyncQueueStatus `gorm:"size:24;not null;default:'pending';index:idx_app_sync_queue_tenant_status,priority:2" json:"status"` // pending|sent|failed|dead_letter
    RetryCount int                `gorm:"not null;default:0" json:"retry_count"` // 重试次数
    LastError  string             `gorm:"size:255" json:"last_error"` // 最后错误
    CreatedAt  time.Time          `gorm:"not null;index" json:"created_at"` // 创建时间
    UpdatedAt  time.Time          `json:"updated_at"` // 更新时间

    Tenant Tenant `gorm:"foreignKey:TenantID"`
}
```

---

## 5. 状态机定义

### 5.1 ClinicAppointment 状态机

**状态枚举**：`pending`、`confirmed`、`checked_in`、`in_progress`、`completed`、`cancelled`

| from \ to | pending | confirmed | checked_in | in_progress | completed | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| pending | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| confirmed | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| checked_in | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| in_progress | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| completed | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| cancelled | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**触发条件与副作用**

| 流转 | 触发端点 | 条件 | 副作用 |
|---|---|---|---|
| pending -> confirmed | PATCH `/appointments/:id/status` | `target_status=confirmed` | 可写入预约同步 `app_sync_queue` |
| confirmed -> checked_in | PATCH `/appointments/:id/status` | 到场签到 | 无额外表写入 |
| checked_in -> in_progress | PATCH `/appointments/:id/status` | 开始就诊 | 自动创建 `clinic_visits` |
| in_progress -> completed | PATCH `/appointments/:id/status` | 就诊流程已结束 | appointment 置完成 |
| 非 completed -> cancelled | PATCH `/appointments/:id/status` | 必填 `cancel_reason` | 记录取消原因 |

### 5.2 ClinicVisit 状态机

**状态枚举**：`in_progress`、`diagnosed`、`treated`、`prescription_done`、`closed`

| from \ to | in_progress | diagnosed | treated | prescription_done | closed |
|---|---:|---:|---:|---:|---:|
| in_progress | ✅ | ✅ | ❌ | ❌ | ❌ |
| diagnosed | ❌ | ✅ | ✅ | ❌ | ❌ |
| treated | ❌ | ❌ | ✅ | ✅ | ❌ |
| prescription_done | ❌ | ❌ | ❌ | ✅ | ✅ |
| closed | ❌ | ❌ | ❌ | ❌ | ✅ |

**触发条件与副作用**

| 流转 | 触发端点 | 条件 | 副作用 |
|---|---|---|---|
| in_progress -> diagnosed | PATCH `/visits/:id` | 写入至少 1 条诊断 | 更新诊断集合 |
| diagnosed -> treated | PATCH `/visits/:id` | 写入处置信息 | 更新 treatments 与费用 |
| treated -> prescription_done | PATCH `/visits/:id` | 写入处方信息 | 更新 prescriptions |
| prescription_done -> closed | PATCH `/visits/:id` | 结案确认 | 若有 followup 计划则保留/新增；可随后推送 App |
| 任意非 closed 手动推送 | POST `/visits/:id/push-to-app` | 手动点击推送 | 写入 `app_sync_queue`，更新 `pushed_at` |
| closed 自动推送（推荐） | 业务逻辑钩子 | 结案时 | 写入 `app_sync_queue`，payload 必须与 iOS Codable 对齐 |

### 5.3 ClinicFollowup 状态机

**状态枚举**：`pending`、`done`、`skipped`

| from \ to | pending | done | skipped |
|---|---:|---:|---:|
| pending | ✅ | ✅ | ✅ |
| done | ❌ | ✅ | ❌ |
| skipped | ❌ | ❌ | ✅ |

**触发条件与副作用**

| 流转 | 触发端点 | 条件 | 副作用 |
|---|---|---|---|
| pending -> done | PATCH `/followups/:id/status` | 可填写 `result_note` | 保存回访结果 |
| pending -> skipped | PATCH `/followups/:id/status` | 可填写 `result_note` | 记录跳过原因 |

### 5.4 InsuranceClaim 状态机

**状态枚举**：`draft`、`submitted`、`processing`、`approved`、`rejected`

| from \ to | draft | submitted | processing | approved | rejected |
|---|---:|---:|---:|---:|---:|
| draft | ✅ | ✅ | ❌ | ❌ | ❌ |
| submitted | ❌ | ✅ | ✅ | ❌ | ❌ |
| processing | ❌ | ❌ | ✅ | ✅ | ✅ |
| approved | ❌ | ❌ | ❌ | ✅ | ❌ |
| rejected | ❌ | ❌ | ❌ | ❌ | ✅ |

> Phase 3 商家后台当前只开放 `submitted` 创建动作；后续保险回执流转由保险模块/后台任务维护。

---

## 6. 前端页面清单

| 路由 | 页面组件名 | 调用 API | Zustand Store | 主要交互 |
|---|---|---|---|---|
| `/merchant/clinic/dashboard` | `ClinicDashboardPage` | `GET /merchant/clinic/stats` | `useClinicDashboardStore` | 展示 4 个 KPI、今日预约、同步状态卡片 |
| `/merchant/clinic/appointments` | `ClinicAppointmentsPage` | `GET /merchant/clinic/appointments`、`PATCH /merchant/clinic/appointments/:id/status` | `useClinicAppointmentsStore` | 列表/矩阵切换、筛选、确认预约、签到、开始就诊、取消 |
| `/merchant/clinic/visits/:id` | `VisitDetailPage` | `GET /merchant/clinic/visits/:id`、`PATCH /merchant/clinic/visits/:id`、`POST /merchant/clinic/visits/:id/push-to-app`、`POST /merchant/clinic/visits/:id/files` | `useClinicVisitStore` | 5 Tab 编辑、保存草稿、结案、推送 App、上传附件 |
| `/merchant/clinic/followups` | `FollowupsPage` | `GET /merchant/clinic/followups`、`PATCH /merchant/clinic/followups/:id/status` | `useClinicFollowupsStore` | Tab 切换、超期高亮、标记已回访、跳过 |
| `/merchant/clinic/insurance` | `ClinicInsurancePage` | `GET /merchant/clinic/insurance/coverage-preview`、`GET /merchant/clinic/insurance/claims`、`POST /merchant/clinic/insurance/claims`、`POST /merchant/clinic/insurance/claims/:id/files` | `useClinicInsuranceStore` | 分步理赔申请、理赔列表、附件上传 |
| `/merchant/clinic/pharmacy` | `ClinicPharmacyPage` | `GET /merchant/clinic/pharmacy`、`PATCH /merchant/clinic/pharmacy/:id/dispense` | `useClinicPharmacyStore` | 搜索/筛选、过期色标、处方药出库 |

**前端实现约束**

- 所有页面必须只通过 `frontend/lib/api.ts` 发请求
- 页面必须处理 `Loading / Empty / Error`
- DTO -> VM 必须显式转换，禁止将 `snake_case` 直接写入 store
- Sidebar 必须新增 Clinic 导航：`Dashboard`、`Appointments`、`Followups`、`Insurance`、`Pharmacy`

---

## 7. 前后端字段映射表

### 7.1 Clinic Stats

| 后端 snake_case | 前端 camelCase |
|---|---|
| today_appointments | todayAppointments |
| today_appointments_delta | todayAppointmentsDelta |
| in_progress_visits | inProgressVisits |
| pending_followups_overdue | pendingFollowupsOverdue |
| new_patients_this_month | newPatientsThisMonth |
| today_appointment_list | todayAppointmentList |
| sync_status | syncStatus |
| pending_count | pendingCount |
| failed_count | failedCount |
| last_synced_at | lastSyncedAt |

### 7.2 Appointment / Matrix

| 后端 snake_case | 前端 camelCase |
|---|---|
| pet_name | petName |
| pet_owner_name | petOwnerName |
| pet_owner_phone | petOwnerPhone |
| visit_type | visitType |
| doctor_id | doctorId |
| doctor_name | doctorName |
| scheduled_at | scheduledAt |
| cancel_reason | cancelReason |
| created_at | createdAt |
| updated_at | updatedAt |
| appointment_id | appointmentId |
| duration_minutes | durationMinutes |
| time_slots | timeSlots |

### 7.3 Visit / Diagnosis / Prescription / Treatment / File

| 后端 snake_case | 前端 camelCase |
|---|---|
| tenant_id | tenantId |
| appointment_id | appointmentId |
| pet_name | petName |
| pet_breed | petBreed |
| pet_age | petAge |
| pet_weight | petWeight |
| pet_medical_history | petMedicalHistory |
| chief_complaint | chiefComplaint |
| heart_rate | heartRate |
| respiratory_rate | respiratoryRate |
| pushed_at | pushedAt |
| general_medication_notes | generalMedicationNotes |
| treatment_total_fee | treatmentTotalFee |
| is_primary | isPrimary |
| drug_name | drugName |
| duration_days | durationDays |
| performed_by_id | performedById |
| performed_by_name | performedByName |
| result_note | resultNote |
| due_at | dueAt |
| file_name | fileName |
| file_url | fileUrl |
| file_size | fileSize |
| file_type | fileType |
| uploaded_at | uploadedAt |

### 7.4 Followup

| 后端 snake_case | 前端 camelCase |
|---|---|
| visit_id | visitId |
| pet_name | petName |
| pet_owner_name | petOwnerName |
| last_visit_date | lastVisitDate |
| doctor_id | doctorId |
| doctor_name | doctorName |
| due_at | dueAt |
| is_overdue | isOverdue |
| result_note | resultNote |
| created_at | createdAt |

### 7.5 Pharmacy

| 后端 snake_case | 前端 camelCase |
|---|---|
| batch_no | batchNo |
| expires_at | expiresAt |
| stock_level | stockLevel |
| low_stock_threshold | lowStockThreshold |
| is_low_stock | isLowStock |
| storage_condition | storageCondition |
| is_prescription_only | isPrescriptionOnly |
| is_expiring_soon | isExpiringSoon |
| is_expired | isExpired |
| days_until_expiry | daysUntilExpiry |
| previous_stock | previousStock |
| dispensed_quantity | dispensedQuantity |
| current_stock | currentStock |
| prescription_id | prescriptionId |
| dispensed_at | dispensedAt |

### 7.6 Insurance

| 后端 snake_case | 前端 camelCase |
|---|---|
| visit_id | visitId |
| pet_name | petName |
| pet_owner_name | petOwnerName |
| policy_no | policyNo |
| provider_name | providerName |
| plan_name | planName |
| effective_at | effectiveAt |
| expires_at | expiresAt |
| coverage_items | coverageItems |
| item_code | itemCode |
| item_name | itemName |
| coverage_pct | coveragePct |
| annual_limit | annualLimit |
| remaining_limit | remainingLimit |
| is_covered | isCovered |
| submitted_at | submittedAt |
| claim_amount | claimAmount |
| approved_amount | approvedAmount |
| claim_id | claimId |
| file_name | fileName |
| file_url | fileUrl |
| file_size | fileSize |
| file_type | fileType |
| uploaded_at | uploadedAt |

---

## 8. Seed 数据规格

> 以下基于 `backend/cmd/server/main.go` 的当前实现。

### 8.1 适用租户

- 对所有 `tenant.type in (both, clinic)` 的租户执行 Clinic Seed

### 8.2 每个 clinic tenant 的 Seed 条数与分布

| 表 | 条数 | 分布说明 |
|---|---:|---|
| `merchant_users` | 6 | 5 位 `doctor` + 1 位 `frontdesk`；若已存在则跳过重复创建 |
| `clinic_appointments` | 20 | `pending` 3、`confirmed` 4、`checked_in` 2、`in_progress` 3、`completed` 6、`cancelled` 2 |
| `clinic_visits` | 5 | 状态各 1 条：`in_progress`、`diagnosed`、`treated`、`prescription_done`、`closed` |
| `clinic_diagnoses` | 5~15 | 每个 visit 1~3 条，且仅 1 条 `is_primary=true` |
| `clinic_prescriptions` | 3~8 | 从第 3 条 visit 开始，每个 visit 1~2 条 |
| `clinic_treatments` | 2~4 | 从第 4 条 visit 开始，每个 visit 1~2 条 |
| `clinic_followups` | 6 | `pending` 3（其中 1 条 overdue）、`done` 2、`skipped` 1 |
| `pharmacy_items` | 10 | 5 条处方药 + 5 条 OTC |
| `clinic_visit_files` | 4~6 | 分布在 2~3 个 visit 上 |
| `insurance_claims` | 3 | `submitted` 1、`processing` 1、`approved` 1 |
| `insurance_claim_files` | 3~6 | 每个 claim 1~2 个文件 |

### 8.3 Seed 特征约束

- 今日至少 5 条预约，方便 Dashboard 演示
- 回访至少 1 条超期记录，便于 `overdue` 查询验证
- 药房库存当前实现特征：
  - 处方药 5 条
  - OTC 5 条
  - 低库存 3 条
  - 30 天内即将过期 1 条
  - 已过期 1 条
- 理赔文件目录：`assets/insurance_claim_files/{tenant_id}/{claim_id}/`
- 就诊附件目录：`assets/clinic_files/{tenant_id}/{visit_id}/`
- Seed 必须可重复执行；已有数据存在时不重复灌入同类业务表

---

## 9. 编码规范提醒

- 后端统一响应格式：`{"code": 0, "data": {...}, "message": "ok"}`
- 后端所有查询必须加 `WHERE tenant_id = ?`
- 所有新 API 路由必须挂在鉴权中间件之后
- 前端所有 API 调用必须通过 `lib/api.ts`
- 前端页面必须处理 Loading / Empty / Error 三态
- 前端必须做 DTO `snake_case` → VM `camelCase` 显式映射
- 新增路由必须在 Sidebar 添加导航项
- 处方药出库权限必须限制为 `doctor` / `owner`
- `app_sync_queue.payload` 必须与 iOS App Codable 模型字段完全一致

---

本文件为 Phase 3 技术契约基线：`docs/phase3_contract.md`

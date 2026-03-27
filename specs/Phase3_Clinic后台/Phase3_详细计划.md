# Phase 3：Clinic 后台核心功能

> 目标：Clinic 后台可完整操作，病历可记录并推送至 App
> 前置条件：Phase 2 QA 签收通过

---

## 上线 Agent 一览

| Agent | 是否上线 | 说明 |
|-------|---------|------|
| 🏛 Architect | ✅ 上线（轻量） | 审核医疗 API 契约，保险接口设计 |
| 🖥 Frontend Dev | ✅ 上线 | 实现 Clinic 全部 UI 页面 |
| ⚙️ Backend Dev | ✅ 上线 | 实现 Clinic 全部 API 接口 |
| 🔬 Test Engineer | ✅ 上线 | 医疗流程测试 + Phase 3 测试报告 |

---

## Agent 任务分配

---

### 🏛 Architect — 任务清单

> Phase 3 启动前必须完成以下契约定义

**任务 1：定义 Clinic API 契约**

预约状态机（合法流转矩阵）：
```
pending   → confirmed（商家确认）
confirmed → checked_in（患者到场签到）
checked_in → in_progress（开始就诊，创建 visit 记录）
in_progress → completed（结案）
任意状态（非 completed）→ cancelled（需填原因）
```

就诊记录（visit）状态：
```
in_progress → diagnosed → treated → prescription_done → closed
```

病历推送规范：
- 触发时机：visit 结案时 / 手动点击「推送到 App」按钮
- 推送内容（app_sync_queue payload）：
```json
{
  "entity_type": "medical_record",
  "entity_id": "visit_id",
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

**任务 2：定义保险理赔接口契约**
- 与保险模块（已冻结）的数据读取方式：只读，不修改保险模块数据
- 理赔申请写入新建的 `insurance_claims` 表，不影响原保险模块

**任务 3：药房与普通商品表隔离确认**
- 确认 `pharmacy_items` 表独立于 `shop_products` 表
- 处方药出库必须关联 `prescription_id`

**任务 4：Code Review**
- 审核就诊记录的状态机实现
- 审核病历推送 payload 格式（与 iOS App 的 Codable 模型对齐）
- 审核药房出库的权限校验（仅 doctor / owner 可操作）

---

### 🖥 Frontend Dev — 任务清单

> 前置：等待 Architect 交付 Phase 3 API 契约

**任务 1：Clinic Dashboard `/merchant/clinic/dashboard`**

KPI 卡片行（4个）：
- 今日预约数（青色图标，vs 昨日）
- 当前就诊中（橙色，实时数）
- 待处理回访（超期标红数）
- 本月新患者（首诊宠物数）

底部双栏：
- 左：今日预约列表（按时间排序，含状态 badge 和医生）
- 右：App 同步状态卡片（同 Shop Dashboard 结构）

---

**任务 2：预约管理 `/merchant/clinic/appointments`**

顶部：视图切换（列表 / 排班矩阵）+ 日期选择器

**① 列表视图：**
```
时间 | 宠物名 | 主人 | 就诊类型 | 分配医生 | 状态 | 操作
```
操作按钮（根据状态动态显示）：
- pending → 「确认预约」「拒绝」
- confirmed → 「签到」「改期」「取消」
- checked_in → 「开始就诊」
- 点击行 → 预约详情弹窗

**② 排班矩阵视图：**
```
        09:00  09:30  10:00  10:30  11:00  ...  17:00
Dr. Li  [预约]  [──就诊中──]  [空]   [预约]  ...  [空]
Dr.Wang [空]   [预约]  [空]   [预约]  [就诊]  ...  [空]
```
- 已预约：青色卡片（宠物名 + 就诊类型）
- 就诊中：深青色卡片
- 空档：浅灰可点击
- 点击空档 → 新建预约弹窗

---

**任务 3：就诊流程页 `/merchant/clinic/visits/:id`**

左侧就诊状态时间线（垂直）：
```
● 签到 09:15
● 分诊 09:20
◉ 就诊中（当前）
○ 诊断完成
○ 处置
○ 处方开具
○ 结案
```

主体区域（标签页）：

**Tab 1：基本信息（只读 + 填写主诉）**
- 宠物档案（名字/品种/年龄/体重/既往病史）——只读，来自 App 数据
- 主诉文本域（医生填写）
- 生命体征：体温 / 心率 / 呼吸率（数字输入框）

**Tab 2：诊断**
- 主诊断（可搜索病种库，也可自由输入）
- 次要诊断（可添加多条，每条可删除）
- 诊断备注文本域

**Tab 3：处置**
- 处置项目列表（可添加多条）
- 每条：项目名 | 执行人（医生选择） | 费用（HKD）
- 底部显示处置总费用

**Tab 4：处方**
- 药品搜索框（从药房库选择）
- 每条药品：名称 | 规格 | 用量 | 频次 | 天数 | 用药备注
- 底部：总体用药注意事项文本域

**Tab 5：文件附件**
- 上传区（拖拽 / 点击，支持 JPG/PNG/PDF，单文件 ≤ 20MB）
- 已上传列表：文件名 + 上传时间 + 预览/下载按钮

底部操作栏（固定在页面底部）：
- 「保存草稿」（不改变 visit 状态）
- 「推送到 App」（弹窗确认 → 写入 sync_queue → 发送摘要给宠物主）
- 「结案」（弹窗确认，visit 状态变 closed）

---

**任务 4：回访管理 `/merchant/clinic/followups`**

顶部 Tab：全部 | 待回访（含超期标红数）| 已完成 | 已跳过

表格列：
```
回访日期 | 宠物名 | 主人 | 上次就诊 | 回访原因 | 负责医生 | 状态 | 操作
```
- 超过 due_at 且 status=pending：日期列显示红色
- 操作：「标记已回访」（填结果文本）/ 「发送提醒到 App」/ 「跳过」

---

**任务 5：保险理赔 `/merchant/clinic/insurance`**

分步表单（Stepper）：
- Step 1：选择关联就诊记录（搜索宠物 + 日期）
- Step 2：险种核验（展示宠物主绑定险种，对比保障项目）
- Step 3：上传理赔材料（发票/诊断书/化验单，多文件上传）
- Step 4：费用明细填写 → 提交

理赔记录列表：提交时间 | 宠物 | 险种 | 申请金额 | 状态 | 操作

---

**任务 6：药房库存 `/merchant/clinic/pharmacy`**

- 独立于商品管理，侧边栏单独入口
- 表格：药品名 | 规格 | 批次号 | 有效期 | 库存 | 存储条件 | 类型（处方药/OTC）| 操作
- 有效期颜色：< 30 天黄色，已过期红色
- 处方药出库弹窗：必须选择关联处方单

---

### ⚙️ Backend Dev — 任务清单

**任务 1：数据库表新增（GORM AutoMigrate）**

```go
// internal/models/clinic.go

type ClinicAppointment struct {
    ID           uint      `gorm:"primaryKey"`
    TenantID     uint      // 必须存在
    BusinessType string    // "clinic"
    PetName      string
    PetOwnerName string
    PetOwnerPhone string
    DoctorID     uint
    VisitType    string    // "vaccine"|"checkup"|"surgery"|"emergency"
    ScheduledAt  time.Time
    Status       string    // pending|confirmed|checked_in|in_progress|completed|cancelled
    CancelReason string
    Notes        string
    CreatedAt    time.Time
    UpdatedAt    time.Time
}

type ClinicVisit struct {
    ID              uint      `gorm:"primaryKey"`
    TenantID        uint
    AppointmentID   uint
    PetName         string
    ChiefComplaint  string    // 主诉
    Temperature     float64
    HeartRate       int
    RespiratoryRate int
    Status          string    // in_progress|diagnosed|treated|prescription_done|closed
    CreatedAt       time.Time
    UpdatedAt       time.Time
}

type ClinicDiagnosis struct {
    ID         uint   `gorm:"primaryKey"`
    VisitID    uint
    TenantID   uint
    Name       string
    IsPrimary  bool
    Notes      string
}

type ClinicPrescription struct {
    ID          uint   `gorm:"primaryKey"`
    VisitID     uint
    TenantID    uint
    DrugName    string
    Dosage      string
    Frequency   string
    DurationDay int
    Notes       string
}

type ClinicFollowup struct {
    ID         uint      `gorm:"primaryKey"`
    VisitID    uint
    TenantID   uint
    PetName    string
    Reason     string
    DoctorID   uint
    DueAt      time.Time
    Status     string    // pending|done|skipped
    ResultNote string
    CreatedAt  time.Time
}

type PharmacyItem struct {
    ID                 uint      `gorm:"primaryKey"`
    TenantID           uint
    Name               string
    Specification      string    // 规格
    BatchNo            string    // 批次号
    ExpiresAt          time.Time
    StockLevel         int
    LowStockThreshold  int
    StorageCondition   string    // "冷藏"|"室温"|"避光"
    IsPrescriptionOnly bool      // 处方药
    CreatedAt          time.Time
}
```

**任务 2：API 接口实现**

**GET `/merchant/clinic/stats`**
```json
{
  "today_appointments": 18,
  "in_progress_visits": 3,
  "pending_followups_overdue": 2,
  "new_patients_this_month": 24
}
```

**GET `/merchant/clinic/appointments`**
- Query：`status`, `date`, `doctor_id`, `view`(list|matrix), `page`
- matrix 视图响应：按医生分组，含时间槽信息

**PATCH `/merchant/clinic/appointments/:id/status`**
- 状态机校验（同 Shop 侧逻辑）
- checked_in → in_progress 时：自动创建 ClinicVisit 记录

**GET/PATCH `/merchant/clinic/visits/:id`**
- GET：返回 visit + diagnoses + prescriptions + followups + files
- PATCH：更新任意子字段（JSON Merge Patch 风格）

**POST `/merchant/clinic/visits/:id/push-to-app`**
```go
// 写入 app_sync_queue，payload 为病历摘要
// 同时更新 visit.pushed_at 字段
```

**GET/POST `/merchant/clinic/followups`**
- GET：`?status=pending|done|overdue`，overdue = due_at < now AND status=pending

**GET `/merchant/clinic/pharmacy`**
- 含 `is_expiring_soon`（< 30 天）和 `is_expired` 计算字段

**PATCH `/merchant/clinic/pharmacy/:id/dispense`**
```go
// 处方药出库必须传 prescription_id
// 否则返回 400 "prescription_required"
```

**任务 3：文件上传接口**
- `POST /merchant/clinic/visits/:id/files`
- 当前：保存到 `assets/clinic_files/{tenant_id}/{visit_id}/`
- Supabase 预留：handler 抽象为 StorageAdapter interface

**任务 4：Seed 数据**
- 每个 clinic tenant 生成：5位医生、20条预约（各状态分布）、5条就诊记录、10条药品

---

### 🔬 Test Engineer — 任务清单

**任务 1：测试用例（API 层）**

| TC ID | 用例描述 | 操作 | 预期结果 | 严重级别 |
|-------|---------|------|---------|---------|
| TC-3-01 | 预约确认（pending→confirmed） | PATCH status=confirmed | 状态更新，App sync_queue 写入 | P0 |
| TC-3-02 | 签到（confirmed→checked_in） | PATCH status=checked_in | 状态更新 | P0 |
| TC-3-03 | 开始就诊（checked_in→in_progress） | PATCH status=in_progress | 自动创建 ClinicVisit 记录 | P0 |
| TC-3-04 | 就诊记录保存（5个 Tab 数据） | PATCH visit/:id 各字段 | 数据正确保存，可重新查到 | P0 |
| TC-3-05 | 病历推送到 App | POST visits/:id/push-to-app | sync_queue 写入，payload 格式正确 | P0 |
| TC-3-06 | 结案（status→closed） | PATCH visit status=closed | 状态更新，followup 自动创建（如有） | P1 |
| TC-3-07 | 处方药出库（无处方） | PATCH pharmacy/:id/dispense，不带 prescription_id | 返回 400 prescription_required | P1 |
| TC-3-08 | 处方药出库（有处方） | 带 prescription_id | 库存减少，操作记录写入 | P1 |
| TC-3-09 | 回访超期查询 | GET followups?status=overdue | 只返回 due_at < now 的记录 | P1 |
| TC-3-10 | 文件上传 | POST visits/:id/files，上传 PDF | 文件保存，可通过 URL 下载 | P1 |
| TC-3-11 | 跨租户隔离 | clinic_a session 查 clinic_b 的 visit | 403 或空结果 | P0 |
| TC-3-12 | Shop 账号访问 clinic 接口 | shop@happypaws 调用 /merchant/clinic/* | 403 | P0 |
| TC-3-13 | 排班矩阵视图数据正确 | GET appointments?view=matrix&date=2026-03-24 | 时间槽与 DB 一致 | P1 |
| TC-3-14 | 过期药品标记 | pharmacy 中有效期为昨天的药品 | is_expired=true | P2 |

**任务 2：端到端测试（手动）**
- App 端预约挂号 → Clinic 后台出现预约卡片
- Clinic 后台结案 + 推送 → App 消息中心收到病历摘要
- 检查 Codable 模型：`app_sync_queue.payload` 的字段与 iOS 模型完全匹配

**任务 3：回归测试**
- 执行 Phase 1 核心用例（TC-1-01 ~ TC-1-08）
- 执行 Phase 2 核心用例（TC-2-01, TC-2-09, TC-2-10）

**任务 4：输出 Phase 3 测试报告**
- 文件：`测试报告/Phase3_测试报告.md`
- 含：用例汇总、端到端验证结果、回归测试结果、Bug 列表

---

## 验收标准（所有 Agent 需确认）

- [ ] Architect：Clinic API 契约已发布，病历推送 payload 已与 iOS 对齐
- [ ] Frontend：Clinic Dashboard + 预约管理（双视图）+ 就诊流程（5个 Tab）+ 药房管理均可访问
- [ ] Backend：就诊状态机完整，病历推送写入 sync_queue，文件上传可用
- [ ] QA：Phase 3 测试报告已输出，P0 用例 100% 通过，P1 用例 ≥ 85% 通过
- [ ] **QA 签收后，方可启动 Phase 4**

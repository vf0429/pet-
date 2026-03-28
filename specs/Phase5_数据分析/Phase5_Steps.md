# Phase 5 — Analytics 数据可视化：分步执行计划

> 前置条件：Phase 4B 完成。本 Phase 为可选增强，不阻塞 MVP 交付。
> 每个 Step 内的各角色 Prompt 可在独立 Claude Code 窗口**并行执行**。
> 项目根目录：`/Users/vfzzz/Desktop/petwell-merchant`

---

## Step 1：数据基础准备

**目标：** 补充 Analytics 所需的字段、索引，并处理审核发现的数据基础缺失问题。

### Prerequisite
- Phase 4B 全部完成

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

任务 1：在 models/clinic.go 的 ClinicVisit struct 中追加字段：
  ClosedAt *time.Time `gorm:"index"`
  放在 PushedAt 字段附近。

任务 2：在 backend/cmd/server/main.go 的 db.AutoMigrate() 中确认 ClinicVisit 已包含（一般已有）。

任务 3：创建 backend/migrations/add_analytics_indices.go（纯 Go 文件，不是迁移框架）

实现函数 RunAnalyticsIndexMigration(db *gorm.DB)，执行以下 SQL（用 db.Exec）：

-- Shop: 营收/订单查询
CREATE INDEX IF NOT EXISTS idx_shop_orders_tenant_created
  ON shop_orders (tenant_id, created_at);

-- Shop: 品类分析
CREATE INDEX IF NOT EXISTS idx_shop_products_tenant_category
  ON shop_products (tenant_id, category);

-- Clinic: 就诊量查询
CREATE INDEX IF NOT EXISTS idx_clinic_visits_tenant_created
  ON clinic_visits (tenant_id, created_at);

-- Clinic: 诊断分析
CREATE INDEX IF NOT EXISTS idx_clinic_diagnoses_tenant_visit
  ON clinic_diagnoses (tenant_id, visit_id);

-- Clinic: 医生工作量
CREATE INDEX IF NOT EXISTS idx_clinic_appointments_doctor_date
  ON clinic_appointments (tenant_id, doctor_id, scheduled_at);

任务 4：在 main.go 的 seedData() 之前调用 migrations.RunAnalyticsIndexMigration(db)。

任务 5：在 backend/handlers/clinic.go 中，找到 UpdateClinicVisit handler。
在成功更新 visit 且新 status == 'closed' 时，将 visit.ClosedAt = &time.Now() 写入。
（参考现有 update visit 的代码结构）

任务 6：cd backend && go build ./... 零报错。
```

---

### 🏛 Architect Prompt
```
你是一个系统架构师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

执行 Phase 5 启动前性能风险评估。

1. 阅读 specs/Phase5_数据分析/Phase5_详细计划.md 中的所有 Analytics API 查询需求。

2. 检查现有 models/ 下的 index 定义，评估以下查询是否有合适的索引支撑：
   - 按 tenant_id + created_at 范围查询 shop_orders
   - GROUP BY category 统计 shop_order_items
   - GROUP BY doctor_id 统计 clinic_appointments
   - 按 tenant_id + created_at 范围查询 clinic_visits

3. 对于"复购率（repeat_purchase_rate）"指标，评估用 owner_phone 做唯一客户标识的准确性，
   给出近似误差范围和改进建议。

4. 给出缓存建议：哪些查询适合 HTTP Cache-Control（推荐），哪些需要 Redis（暂不引入）。

将评估结果写入 docs/phase5_performance_review.md：
格式：
# Phase 5 Performance Review
## Index Coverage: OK / MISSING
## Repeat Purchase Rate Accuracy: [评估结论]
## Caching Strategy: [建议]
## Risk Level: Low / Medium / High
```

---

### 验收标准（Step 1 完成）
- [ ] `ClinicVisit.ClosedAt` 字段存在
- [ ] Analytics 复合索引已创建
- [ ] `UpdateClinicVisit` 在 status=closed 时写入 ClosedAt
- [ ] Architect performance review 输出，Risk Level 明确

---

## Step 2：Shop Analytics API

**目标：** 实现 Shop 数据聚合接口，支持 7d / 30d / 自定义日期范围。

### Prerequisite
- Step 1 全部通过

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

创建 backend/handlers/analytics_shop.go

实现 GetShopAnalytics(db *gorm.DB) gin.HandlerFunc：

Query params:
- period: "7d" | "30d" | "custom"（默认 "7d"）
- date_from: YYYY-MM-DD（period=custom 时必填）
- date_to: YYYY-MM-DD（period=custom 时必填）
- 最大范围限制：90 天，超过则返回 400

从 context 取 TenantID（merchant auth middleware 注入）。

计算 fromDate / toDate（UTC 0点 到 23:59:59）

查询逻辑（所有查询必须 WHERE tenant_id = ?）：

1. 期间汇总：
   SELECT COUNT(*) as total_orders,
          SUM(total_amount) as total_revenue,
          SUM(total_amount)/COUNT(*) as avg_order_value
   FROM shop_orders
   WHERE tenant_id=? AND status != 'cancelled'
     AND created_at BETWEEN fromDate AND toDate

2. 复购率（近似值）：
   找出 owner_phone 出现超过 1 次的客户数 / 总客户数
   SELECT COUNT(*) FROM (
     SELECT customer_phone, COUNT(*) as cnt
     FROM shop_orders WHERE tenant_id=? AND status='completed'
     GROUP BY customer_phone HAVING cnt > 1
   ) repeat_buyers / total_buyers

3. 每日营收（daily_revenue）：
   SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total_amount) as revenue
   FROM shop_orders WHERE tenant_id=? AND status!='cancelled'
     AND created_at BETWEEN fromDate AND toDate
   GROUP BY DATE(created_at)
   ORDER BY date ASC

4. 品类销售占比（category_breakdown）：
   JOIN shop_order_items ON shop_orders.id = shop_order_items.order_id
   JOIN shop_products ON shop_order_items.product_id = shop_products.id
   WHERE shop_orders.tenant_id=? AND shop_orders.status!='cancelled'
   GROUP BY shop_products.category
   SELECT category, SUM(line_total) as revenue
   计算 pct = revenue / total_revenue * 100

5. Top 10 商品（top_products）：
   同上 JOIN，GROUP BY product_name
   SELECT product_name, SUM(quantity) as sales, SUM(line_total) as revenue
   ORDER BY sales DESC LIMIT 10

响应格式严格按照 specs/Phase5_数据分析/Phase5_详细计划.md 中的 Shop Analytics API 响应 JSON。

响应加 HTTP Cache-Control: max-age=300, private 头。

在 main.go 的 protected 路由组中追加：
protected.GET("/analytics/shop", handlers.GetShopAnalytics(db))

cd backend && go build ./... 零报错。
```

---

### 🔬 QA Prompt
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

Backend Step 2 完成后，执行 Shop Analytics 接口的数据准确性验证。

1. 启动后端，登录拿到 session_id

2. 调用 GET /v1/merchant/analytics/shop?period=30d

3. 将 API 返回的 total_revenue 与手动 SQL 对比：
   （若你有 SQLite 访问权限）
   SELECT SUM(total_amount) FROM shop_orders
   WHERE tenant_id=1 AND status!='cancelled'
     AND created_at >= date('now', '-30 days')

4. 验证 daily_revenue 数组：抽查 3 个日期，确认与订单数据一致。

5. 验证跨租户隔离：用 tenant 2 的账号调用同一接口，
   返回的数据应与 tenant 1 的数据完全不同。

6. 验证缓存头：响应包含 Cache-Control: max-age=300

将结果写入 docs/phase5_shop_analytics_verification.md
格式：
# Shop Analytics Verification
## TC-5-S-01 Total Revenue: [PASS/FAIL] [expected vs actual]
## TC-5-S-02 Daily Revenue Spot Check: [PASS/FAIL]
## TC-5-S-03 Cross-Tenant Isolation: [PASS/FAIL]
## TC-5-S-04 Cache Header: [PASS/FAIL]
```

---

### 验收标准（Step 2 完成）
- [ ] `GET /v1/merchant/analytics/shop` 接口返回正确结构
- [ ] total_revenue 与手动 SQL 对比偏差 < 1%
- [ ] 跨租户隔离验证 PASS
- [ ] Cache-Control 头存在

---

## Step 3：Clinic Analytics API

**目标：** 实现 Clinic 数据聚合接口，包含就诊量、诊断分布、医生工作量、预约到场率。

### Prerequisite
- Step 2 全部通过

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

创建 backend/handlers/analytics_clinic.go

实现 GetClinicAnalytics(db *gorm.DB) gin.HandlerFunc：

参数处理与 Shop Analytics 完全相同（period / date_from / date_to / 90天限制）。

查询逻辑（所有查询必须 WHERE tenant_id = ?）：

1. 期间汇总：
   - total_visits: SELECT COUNT(*) FROM clinic_visits WHERE tenant_id=? AND created_at BETWEEN ...
   - avg_visit_duration_min: SELECT AVG(JULIANDAY(closed_at) - JULIANDAY(created_at)) * 1440
     FROM clinic_visits WHERE closed_at IS NOT NULL AND tenant_id=? AND created_at BETWEEN ...
     （PostgreSQL 中用 EXTRACT(EPOCH FROM (closed_at - created_at))/60，注意兼容性）
   - revisit_rate_30d（近似值）：
     找出 30 天内同一 owner_phone 有多次就诊的比例
   - prescription_rate:
     SELECT COUNT(DISTINCT visit_id) FROM clinic_prescriptions WHERE tenant_id=?
     除以 total_visits

2. 每日就诊量（daily_visits）：
   SELECT DATE(created_at) as date, COUNT(*) as visits
   FROM clinic_visits WHERE tenant_id=? AND created_at BETWEEN ...
   GROUP BY DATE(created_at)

3. 诊断分布（diagnosis_breakdown）：
   SELECT name, COUNT(*) as count FROM clinic_diagnoses
   WHERE tenant_id=? AND visit_id IN (SELECT id FROM clinic_visits WHERE created_at BETWEEN ...)
   GROUP BY name ORDER BY count DESC

4. 医生工作量（doctor_workload）：
   按周统计（本期内每周各医生接诊量）
   SELECT doctor_id, strftime('%Y-W%W', scheduled_at) as week, COUNT(*) as count
   FROM clinic_appointments WHERE tenant_id=? AND status='completed'
     AND scheduled_at BETWEEN ...
   GROUP BY doctor_id, week
   JOIN merchant_users ON doctor_id = merchant_users.id 取 doctor_name

5. 预约到场率（appointment_attendance）：
   SELECT DATE(scheduled_at) as date,
     COUNT(*) as confirmed,
     SUM(CASE WHEN status IN ('checked_in','in_progress','completed') THEN 1 ELSE 0 END) as checked_in
   FROM clinic_appointments WHERE tenant_id=? AND status!='cancelled'
     AND scheduled_at BETWEEN ...
   GROUP BY DATE(scheduled_at)
   rate = checked_in / confirmed

响应格式严格按照 specs/Phase5_数据分析/Phase5_详细计划.md 中的 Clinic Analytics API 响应 JSON。
响应加 Cache-Control: max-age=300, private。

在 main.go 的 protected 路由组追加：
protected.GET("/analytics/clinic", handlers.GetClinicAnalytics(db))

cd backend && go build ./... 零报错。
```

---

### 🔬 QA Prompt
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

Backend Step 3 完成后，执行 Clinic Analytics 数据准确性验证。

1. 调用 GET /v1/merchant/analytics/clinic?period=30d

2. 验证 total_visits 与 clinic_visits 表记录数一致。

3. 验证 doctor_workload 包含 doctor_name（非空）。

4. 验证 appointment_attendance 的 rate 在 0-1 之间。

5. 验证跨租户：tenant 2 的 Clinic Analytics 数据与 tenant 1 不同。

6. 若 avg_visit_duration_min 为 null（因为 closed_at 暂无数据），验证接口不报错，返回 null 是合理的。

将结果写入 docs/phase5_clinic_analytics_verification.md（格式与 Shop 验证同）
```

---

### 验收标准（Step 3 完成）
- [ ] `GET /v1/merchant/analytics/clinic` 接口返回正确结构
- [ ] doctor_workload 包含 doctor_name
- [ ] 跨租户隔离 PASS
- [ ] `avg_visit_duration_min` 为 null 时不报错

---

## Step 4：前端 Analytics 页面

**目标：** 实现 Shop 和 Clinic 两个 Analytics 可视化页面，使用 Recharts。

### Prerequisite
- Step 3 全部通过

### 🖥 Frontend Prompt
```
你是一个前端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/frontend。

任务 0：安装 Recharts（若未安装）
cd frontend && npm install recharts

---

任务 1：在 frontend/lib/api.ts 末尾追加 Analytics 类型和 fetch 函数

export type ShopAnalyticsDTO = {
  period: { from: string; to: string }
  summary: {
    total_revenue: number
    total_orders: number
    avg_order_value: number
    repeat_purchase_rate: number
  }
  daily_revenue: Array<{ date: string; revenue: number; orders: number }>
  category_breakdown: Array<{ category: string; revenue: number; pct: number }>
  top_products: Array<{ name: string; sales: number; revenue: number }>
}

export type ClinicAnalyticsDTO = {
  period: { from: string; to: string }
  summary: {
    total_visits: number
    avg_visit_duration_min: number | null
    revisit_rate_30d: number
    prescription_rate: number
  }
  daily_visits: Array<{ date: string; visits: number }>
  diagnosis_breakdown: Array<{ name: string; count: number; pct: number }>
  doctor_workload: Array<{ doctor_name: string; [week: string]: number | string }>
  appointment_attendance: Array<{ date: string; confirmed: number; checked_in: number; rate: number }>
}

// 在现有 apiFetch 模式下追加 getShopAnalytics 和 getClinicAnalytics 函数
// 接收 period: '7d'|'30d' 参数

---

任务 2：创建 frontend/app/merchant/shop/analytics/page.tsx

布局：
- 顶部：标题 "销售数据分析" + 时间维度切换按钮（7天 / 30天）
- KPI 卡片行（4个）：总营收、总订单数、客单价、复购率
- LineChart：日营收趋势（X轴日期，Y轴 HKD）
- AreaChart：日订单量趋势
- 两列布局：PieChart（品类占比） + 横向 BarChart（Top 10 商品）

图表颜色：蓝色系（#2563EB 为主色）

状态处理：
- Loading：灰色骨架条（Tailwind animate-pulse）
- 空数据：文字"暂无数据，请选择其他时间范围"
- 错误：文字"数据加载失败" + 重试按钮

---

任务 3：创建 frontend/app/merchant/clinic/analytics/page.tsx

布局：
- 顶部：标题 "诊疗数据分析" + 时间维度切换（7天 / 30天）
- KPI 卡片行（4个）：总就诊数、平均就诊时长、复诊率、处方率
- LineChart：日就诊量趋势
- PieChart：病种分布
- 分组 BarChart：医生工作负载（每位医生按周对比，可显示 Week1/Week2）
- 横向 BarChart：预约到场率（每日 confirmed vs checked_in）

图表颜色：青色系（#0891B2 为主色）

---

任务 4：在 Shop 和 Clinic 的侧边栏/导航中，
查找现有 nav 配置文件，追加 Analytics 页面的导航入口。
若找不到统一的导航配置，只在页面顶部加 breadcrumb 即可。

---

所有 Recharts 图表必须有 Tooltip（悬停显示精确数值 + 日期）。
所有数字格式化：营收保留1位小数，百分比保留1位小数 + %，时长保留整数分钟。
```

---

### 🔬 QA Prompt
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

Frontend Step 4 完成后，执行 Phase 5 完整验收测试。

创建 tests/phase5/phase5_p0.spec.ts：

TC-5-01：Shop Analytics 页面可加载
  page.goto('/merchant/shop/analytics')
  expect: 不报错，页面存在 KPI 卡片（locator 按实际页面结构选取）

TC-5-02：Clinic Analytics 页面可加载
  page.goto('/merchant/clinic/analytics')
  expect: 不报错，页面存在就诊量相关文字

TC-5-03：切换时间范围
  点击 "30天" 按钮
  等待加载完成
  expect: 页面不崩溃，数据有刷新

TC-5-04：跨租户数据正确（API 层验证）
  用 tenant 1 的 session 调用 /v1/merchant/analytics/shop
  用 tenant 2 的 session 调用 /v1/merchant/analytics/shop
  expect: 两者 total_orders 不同（tenant 2 无 shop 数据应为 0）

输出最终 Phase 5 测试报告：docs/phase5_test_report.md

同时更新 specs/Phase5_数据分析/Phase5_详细计划.md 末尾追加：
## Implementation Status
- Step 1 (Data Prep): ✅
- Step 2 (Shop API): ✅
- Step 3 (Clinic API): ✅
- Step 4 (Frontend): ✅
- Phase 5 状态: ✅ DONE
```

---

### 验收标准（Step 4 完成 = Phase 5 完成）
- [ ] Shop Analytics 页面可访问，图表渲染
- [ ] Clinic Analytics 页面可访问，图表渲染
- [ ] Loading / 空数据 / 错误状态均有处理
- [ ] TC-5-01 到 TC-5-04 PASS
- [ ] `docs/phase5_test_report.md` 状态为 DONE

# Phase 5：Analytics 数据可视化（可选增强）

> 目标：为 Shop 和 Clinic 各自提供数据看板，辅助经营决策
> 前置条件：Phase 4 QA 签收通过
> 优先级：P2，可与 Phase 4 并行启动（不阻塞主流程）

---

## 上线 Agent 一览

| Agent | 是否上线 | 说明 |
|-------|---------|------|
| 🏛 Architect | ⚪ 轻量参与 | 仅审核数据聚合查询的性能风险 |
| 🖥 Frontend Dev | ✅ 上线 | 实现图表页面，引入 Recharts |
| ⚙️ Backend Dev | ✅ 上线 | 实现数据聚合 API |
| 🔬 Test Engineer | ✅ 上线（轻量） | 数据准确性验证 + Phase 5 测试报告 |

---

## Agent 任务分配

---

### 🏛 Architect — 任务清单

**任务 1：性能风险审核（Phase 5 启动前）**
- 确认所有 Analytics 查询走 `tenant_id` 索引
- 日期范围查询：`created_at` 加索引
- 复杂聚合（GROUP BY + COUNT + SUM）评估是否需要物化视图或缓存
- 建议：Analytics 接口响应超过 500ms 时启用 Redis 缓存（TTL 5min）

---

### 🖥 Frontend Dev — 任务清单

**技术选型：Recharts（React 原生，轻量）**

安装：
```bash
npm install recharts
```

---

**任务 1：Shop Analytics 页 `/merchant/shop/analytics`**

顶部：时间维度切换（7天 / 30天 / 自定义 Date Picker）

图表列表：

| 图表名 | 组件 | 说明 |
|-------|------|------|
| 销售趋势 | LineChart | 每日营收（HKD），近 N 天 |
| 订单量趋势 | AreaChart | 每日订单数，近 N 天 |
| 品类销售占比 | PieChart | 各品类 GMV，本期 |
| 商品排行榜 | BarChart（横向） | Top 10 商品销量 |

KPI 数字卡片行（4个）：
- 期间总营收（vs 上期同比）
- 期间总订单数
- 客单价（总营收 / 总订单数）
- 复购率（重复购买客户比例）

---

**任务 2：Clinic Analytics 页 `/merchant/clinic/analytics`**

图表列表：

| 图表名 | 组件 | 说明 |
|-------|------|------|
| 就诊量趋势 | LineChart | 每日就诊数，近 N 天 |
| 病种分布 | PieChart | 各诊断类型占比，本期 |
| 医生工作负载 | BarChart（分组） | 各医生就诊量，按周对比 |
| 预约到场率 | BarChart（横向）| 每日：confirmed vs checked_in 比例 |

KPI 数字卡片行（4个）：
- 期间就诊总数
- 平均就诊时长（分钟）
- 复诊率（30 天内再次就诊比例）
- 处方率（有处方的就诊 / 总就诊）

---

**任务 3：通用图表规范**

- 颜色：Shop 用蓝色系，Clinic 用青色系
- Tooltip：悬停显示精确数值 + 日期
- 空数据状态：显示「暂无数据，请选择其他时间范围」
- Loading 状态：骨架屏（灰色条形占位）
- 错误状态：「数据加载失败，点击重试」

---

### ⚙️ Backend Dev — 任务清单

**任务 1：Shop Analytics API**

**GET `/merchant/analytics/shop`**
- Query 参数：`period=7d|30d|custom`，`date_from`，`date_to`
- 所有查询加 `WHERE tenant_id = ?`

```json
// 响应
{
  "period": { "from": "2026-03-01", "to": "2026-03-24" },
  "summary": {
    "total_revenue": 186400.00,
    "total_orders": 423,
    "avg_order_value": 440.90,
    "repeat_purchase_rate": 0.32
  },
  "daily_revenue": [
    { "date": "2026-03-01", "revenue": 7200.00, "orders": 16 },
    ...
  ],
  "category_breakdown": [
    { "category": "宠粮", "revenue": 89000.00, "pct": 47.7 },
    ...
  ],
  "top_products": [
    { "name": "Royal Canin 成猫粮 2kg", "sales": 48, "revenue": 12000.00 },
    ...
  ]
}
```

**任务 2：Clinic Analytics API**

**GET `/merchant/analytics/clinic`**
- 同 Shop 的 period 参数规范

```json
// 响应
{
  "period": { "from": "2026-03-01", "to": "2026-03-24" },
  "summary": {
    "total_visits": 156,
    "avg_visit_duration_min": 28,
    "revisit_rate_30d": 0.41,
    "prescription_rate": 0.73
  },
  "daily_visits": [
    { "date": "2026-03-01", "visits": 6 },
    ...
  ],
  "diagnosis_breakdown": [
    { "name": "皮肤病", "count": 34, "pct": 21.8 },
    ...
  ],
  "doctor_workload": [
    { "doctor_name": "Dr. Li", "week1": 28, "week2": 31, "week3": 26 },
    ...
  ],
  "appointment_attendance": [
    { "date": "2026-03-01", "confirmed": 8, "checked_in": 7, "rate": 0.875 },
    ...
  ]
}
```

**任务 3：查询优化**

- 为 `orders.created_at` + `orders.tenant_id` 创建复合索引
- 为 `visits.created_at` + `visits.tenant_id` 创建复合索引
- 超过 30 天范围的查询：建议前端限制最大 90 天

---

### 🔬 Test Engineer — 任务清单

**任务 1：数据准确性验证**

| TC ID | 用例描述 | 验证方法 | 严重级别 |
|-------|---------|---------|---------|
| TC-5-01 | 期间总营收正确 | API 结果 vs 手动 SQL SUM 对比 | P0 |
| TC-5-02 | 日维度数据正确 | 抽查 3 个日期的数据 | P0 |
| TC-5-03 | 跨租户数据隔离 | tenant_a 的分析不含 tenant_b 数据 | P0 |
| TC-5-04 | 自定义日期范围 | 设置 date_from/date_to，验证边界 | P1 |
| TC-5-05 | 空数据期间 | 选择无订单的日期范围 | P2 |
| TC-5-06 | 性能：30 天数据查询 | 响应时间 < 1s | P1 |

**任务 2：输出 Phase 5 测试报告**
- 文件：`测试报告/Phase5_测试报告.md`

---

## 验收标准

- [ ] Frontend：Shop 和 Clinic Analytics 页面可访问，图表渲染正确
- [ ] Backend：两个 Analytics 接口返回格式正确，数据按 tenant_id 隔离
- [ ] QA：数据准确性 P0 用例 100% 通过，性能达标（< 1s）
- [ ] Phase 5 为可选增强，不阻塞 MVP 交付

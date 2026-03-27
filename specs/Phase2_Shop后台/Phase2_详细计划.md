# Phase 2：Shop 后台核心功能

> 目标：Shop Dashboard 可用，订单可完整操作，与 App 订单状态同步
> 前置条件：Phase 1 QA 签收通过

---

## 上线 Agent 一览

| Agent | 是否上线 | 说明 |
|-------|---------|------|
| 🏛 Architect | ✅ 上线（轻量） | 审核 API 契约，解决联调争议 |
| 🖥 Frontend Dev | ✅ 上线 | 实现 Shop 全部 UI 页面 |
| ⚙️ Backend Dev | ✅ 上线 | 实现 Shop 全部 API 接口 |
| 🔬 Test Engineer | ✅ 上线 | 订单流转测试 + Phase 2 测试报告 |

---

## Agent 任务分配

---

### 🏛 Architect — 任务清单

> Phase 2 Architect 以审核和解争议为主，不需要全程在线

**任务 1：定义 Shop API 契约（Phase 2 启动前完成）**
- `GET /merchant/shop/stats` 响应字段定义
- `GET /merchant/shop/orders` 分页参数 + 响应结构
- `PATCH /merchant/shop/orders/:id/status` 合法状态流转矩阵：

```
待付款(pending)   → 已付款(paid)        [由支付系统触发，非手动]
已付款(paid)      → 备货中(preparing)   [商家确认]
备货中(preparing) → 待自提/配送中(shipped) [商家标记发货]
配送中(shipped)   → 已完成(completed)   [确认收货]
任意状态          → 已取消(cancelled)   [需填取消原因，已完成不可取消]
```

- `GET /merchant/shop/products` + `GET /merchant/shop/inventory/alerts` 字段定义
- app_sync_queue 写入规范：entity_type, entity_id, action, payload 格式

**任务 2：Code Review**
- 审核订单状态机实现（非法流转是否有拦截）
- 审核 app_sync_queue 写入逻辑（是否原子事务）
- 审核前端 X-Business-Type Header 是否正确传递

---

### 🖥 Frontend Dev — 任务清单

> 前置：等待 Architect 交付 Phase 2 API 契约

**任务 1：Shop Dashboard 首页 `/merchant/shop/dashboard`**

KPI 卡片行（横向 4 列）：
- 今日订单数 + 趋势箭头（vs 昨日）
- 今日营收 HKD + 趋势
- 待发货订单数（点击跳转订单列表，status=paid 筛选）
- 低库存商品数（点击跳转商品页，低库存筛选）

底部双栏布局：
- 左侧（宽）：近期订单表（最新 10 条）
  - 列：订单号 | 客户 | 宠物 | 金额 | 状态 | 操作
  - 右上角「查看全部」跳转 `/merchant/shop/orders`
- 右侧（280px）：App 同步状态卡片（Phase 2 为 Mock 数据，Phase 4 真实化）

数据来源：`GET /merchant/shop/stats` + `GET /merchant/shop/orders?limit=10`

---

**任务 2：订单管理页 `/merchant/shop/orders`**

顶部工具栏：
- 状态筛选 Tabs：全部 | 待付款 | 已付款 | 备货中 | 配送中 | 已完成 | 已取消
- 搜索框（按订单号 / 客户名，防抖 300ms）
- 日期范围选择器（默认近 7 天）
- 导出 CSV 按钮

订单表格：
```
□ | 订单号 | 客户 | 宠物 | 商品摘要 | 金额 | 下单时间 | 状态 | 操作
```
- 分页：每页 20 条，底部分页器
- 状态标签颜色系统（5种，见下方规范）
- 操作列：根据当前状态显示对应按钮

状态标签颜色：
| 状态 | 背景色 | 文字色 |
|------|-------|-------|
| 待付款 pending | `#FEF9C3` | `#CA8A04` |
| 已付款 paid | `#EFF6FF` | `#2563EB` |
| 备货中 preparing | `#FFF7ED` | `#F97316` |
| 配送中 shipped | `#F0FDF4` | `#16A34A` 浅绿 |
| 已完成 completed | `#DCFCE7` | `#16A34A` |
| 已取消 cancelled | `#FEE2E2` | `#DC2626` |

订单详情抽屉（右侧 480px 滑出）：
- 顶部：订单号 + 状态 badge
- 客户信息：姓名、联系方式、宠物名
- 商品明细表（图片 + 名称 + 数量 + 单价 + 小计）
- 费用汇总（小计 / 配送费 / 合计）
- 物流状态时间线（每个状态变更 + 时间戳）
- 操作按钮区（根据状态动态显示）：
  - paid → 「确认备货」（弹窗确认）
  - preparing → 「标记发货」（弹窗输入快递单号，必填）
  - shipped → 「确认完成」
  - 非 completed → 「取消订单」（弹窗输入原因，必填）

---

**任务 3：商品管理页 `/merchant/shop/products`**

- 顶部低库存 Banner（有低库存时显示：「5 件商品库存不足，请及时补货」）
- 搜索框 + 分类筛选下拉
- 商品表格：商品图（40x40 圆角）| SKU | 商品名 | 分类 | 价格 | 库存 | 状态 | 操作
- 库存列：数值 ≤ 预警阈值时显示红色数字 + ⚠ 图标
- 操作：上架 / 下架 / 查看详情
- 底部分页

---

**任务 4：服务排期页 `/merchant/shop/schedule`**

时间轴视图（洗护/美容）：
- 横轴：8:00 - 20:00，每格 30 分钟
- 纵轴：服务人员列表
- 已预约卡片：宠物名 + 服务 + 时长（颜色：洗护=蓝，美容=紫）
- 点击空格：新建预约弹窗（宠物、服务类型、时长、备注）
- 点击已有卡片：查看/修改/取消

---

### ⚙️ Backend Dev — 任务清单

> 前置：等待 Architect 交付 Phase 2 API 契约

**任务 1：数据库表新增（GORM AutoMigrate）**

```go
// internal/models/shop.go

type ShopOrder struct {
    ID               uint      `gorm:"primaryKey"`
    TenantID         uint      // 必须存在
    BusinessType     string    // "shop"
    OrderNo          string    `gorm:"uniqueIndex"`
    CustomerName     string
    CustomerPhone    string
    PetName          string
    ItemsSummary     string    // JSON 字符串
    TotalAmount      float64
    Status           string    // pending|paid|preparing|shipped|completed|cancelled
    CancelReason     string
    TrackingNumber   string
    CreatedAt        time.Time
    UpdatedAt        time.Time
}

type ShopProduct struct {
    ID                 uint    `gorm:"primaryKey"`
    TenantID           uint
    BusinessType       string  // "shop"
    SKU                string
    Name               string
    Category           string
    Price              float64
    StockLevel         int
    LowStockThreshold  int     // 低于此值触发预警
    IsActive           bool
    ImageURL           string
    CreatedAt          time.Time
    UpdatedAt          time.Time
}
```

**任务 2：API 接口实现**

**GET `/merchant/shop/stats`**
```json
// 响应（均按 tenant_id 过滤）
{
  "today_orders": 47,
  "today_orders_delta_pct": 12.5,
  "today_revenue": 8340.00,
  "today_revenue_delta_pct": 8.3,
  "pending_shipment_count": 12,
  "low_stock_count": 5
}
```

**GET `/merchant/shop/orders`**
- Query 参数：`status`, `search`, `date_from`, `date_to`, `page`(默认1), `per_page`(默认20)
- 所有查询自动加 `WHERE tenant_id = ?`（来自中间件 context）
- 响应：`{ "orders": [...], "total": 120, "page": 1, "per_page": 20 }`

**PATCH `/merchant/shop/orders/:id/status`**
```go
// 状态机校验（非法流转返回 400）
validTransitions := map[string][]string{
    "pending":    {"paid", "cancelled"},
    "paid":       {"preparing", "cancelled"},
    "preparing":  {"shipped", "cancelled"},
    "shipped":    {"completed"},
    "completed":  {},
    "cancelled":  {},
}
// 状态更新成功后，原子事务写入 app_sync_queue
```

**GET `/merchant/shop/products`**
- 含 `is_low_stock` 计算字段（stock_level <= low_stock_threshold）

**GET `/merchant/shop/inventory/alerts`**
- 只返回 `is_low_stock=true` 的商品列表

**任务 3：app_sync_queue 写入（订单状态变更时）**
```go
type AppSyncQueue struct {
    ID           uint      `gorm:"primaryKey"`
    TenantID     uint
    EntityType   string    // "order" | "appointment"
    EntityID     string
    Action       string    // "status_changed"
    Payload      string    // JSON
    Status       string    // "pending" | "sent" | "failed" | "dead_letter"
    RetryCount   int
    LastError    string
    CreatedAt    time.Time
}
```

**任务 4：Seed 数据（Shop 订单 + 商品）**
```go
// 每个 tenant 生成 20 条订单（各状态分布），10 条商品（含 3 条低库存）
```

---

### 🔬 Test Engineer — 任务清单

**任务 1：API 层测试（curl / Postman）**

| TC ID | 用例描述 | 操作 | 预期结果 | 严重级别 |
|-------|---------|------|---------|---------|
| TC-2-01 | Dashboard KPI 数据正确 | GET /merchant/shop/stats | 与 DB 实际数据一致 | P0 |
| TC-2-02 | 订单流转：paid → preparing | PATCH status=preparing | 状态更新，sync_queue 有记录 | P0 |
| TC-2-03 | 订单流转：preparing → shipped（需快递号） | PATCH status=shipped + tracking_number | 状态更新，tracking_number 保存 | P0 |
| TC-2-04 | 取消订单（需原因） | PATCH status=cancelled + cancel_reason | 状态变 cancelled | P0 |
| TC-2-05 | 非法状态流转（completed→preparing） | PATCH status=preparing，订单已 completed | 返回 400 非法状态 | P1 |
| TC-2-06 | 订单搜索（按订单号） | GET orders?search=#10042 | 精确匹配结果 | P1 |
| TC-2-07 | 订单分页 | GET orders?page=2&per_page=20 | 第 2 页数据不重复 | P1 |
| TC-2-08 | 低库存标红 | 商品库存 ≤ 阈值 | is_low_stock=true，前端显示红色 | P1 |
| TC-2-09 | 跨租户隔离 | tenant_a session 查 tenant_b 订单 | 返回空列表或 403 | P0 |
| TC-2-10 | Clinic 账号访问 shop 接口 | vet@happypaws 调用 /merchant/shop/* | 返回 403 | P0 |
| TC-2-11 | 幂等：同一订单状态更新两次 | 连续发送相同 PATCH 两次 | 第二次返回 200，数据无变化 | P1 |

**任务 2：性能测试（k6）**

```javascript
// scripts/load_test_phase2.js
import http from 'k6/http'
export let options = { vus: 100, duration: '60s' }
export default function () {
  http.get('http://localhost:8000/merchant/shop/orders', {
    headers: { 'X-Session-ID': 'sess_owner_test' }
  })
}
// 目标：P95 < 500ms，无 5xx
```

**任务 3：端到端测试（手动）**
- App 侧下一笔订单 → 商家后台订单列表出现新订单（验证 sync 机制）
- 商家改订单状态 → App 侧（下次打开）订单状态一致

**任务 4：输出 Phase 2 测试报告**
- 文件：`测试报告/Phase2_测试报告.md`
- 含：用例汇总、性能测试结果、跨租户安全验证、Bug 列表

---

## 验收标准（所有 Agent 需确认）

- [ ] Architect：状态机流转矩阵已定义，app_sync_queue 写入规范已发布
- [ ] Frontend：Shop Dashboard + 订单列表 + 订单详情抽屉 + 商品列表均可访问
- [ ] Backend：订单全状态流转可操作，非法流转有拦截，写入 sync_queue
- [ ] QA：Phase 2 测试报告已输出，P0 用例 100% 通过，P1 用例 ≥ 90% 通过
- [ ] **QA 签收后，方可启动 Phase 3**

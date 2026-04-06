# Phase 2 技术契约文档（Shop 核心功能）

## 1. 文档目标与范围

- Phase 目标：交付 Shop Dashboard、订单管理、商品管理，并确保订单状态变更可原子写入 `app_sync_queue` 与 App 侧同步。
- 适用对象：Architect、Backend Dev、Frontend Dev、QA。
- 本文是 Phase 2 唯一契约基线，命名沿用 Phase 1：API Base Path=`/merchant`、后端 JSON=`snake_case`、前端内部状态=`camelCase`。
- 本 Phase 新增所有接口必须挂在 `middleware.MerchantAuthMiddleware(db)` 之后。

---

## 2. 统一约定

### 2.1 响应格式

Phase 2 起新增接口统一使用如下响应包裹格式：

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

> 说明：Phase 1 既有接口仍返回 `error/message` 结构；Phase 2 新增接口统一升级到 `code/data/message`。为保持错误语义一致，下面所有错误码均给出 Phase 1 语义别名。

### 2.2 通用请求头

所有 Phase 2 Shop 接口必须携带：

```http
X-Session-ID: <uuid>
X-Business-Type: shop
```

### 2.3 时间、分页、金额约定

- 时间格式：ISO 8601 / RFC3339，例如 `2026-03-25T10:30:00Z`
- 金额单位：HKD，接口字段类型统一 `number` / Go `float64`
- 分页参数：`page` 从 1 开始；`per_page` 默认 20，最大 100
- 所有查询必须显式附加 `WHERE tenant_id = ?`

### 2.4 Phase 2 错误码注册表

| code | Phase 1 语义别名 | HTTP Status | message |
|---|---|---:|---|
| 0 | ok | 200 | ok |
| 10001 | invalid_request | 400 | invalid request |
| 10002 | invalid_query_params | 400 | invalid query params |
| 10003 | invalid_business_type | 400 | invalid business type |
| 10004 | missing_business_type | 400 | missing business type |
| 10005 | invalid_order_status | 400 | invalid order status |
| 10006 | missing_tracking_number | 400 | tracking_number is required when status=shipped |
| 10007 | missing_cancel_reason | 400 | cancel_reason is required when status=cancelled |
| 10008 | invalid_date_range | 400 | date_from must be less than or equal to date_to |
| 10009 | illegal_status_transition | 400 | illegal order status transition |
| 20001 | session_missing | 401 | X-Session-ID header is required |
| 20002 | session_expired | 401 | session is invalid or expired |
| 20003 | account_suspended | 403 | tenant account is suspended |
| 20004 | business_scope_forbidden | 403 | current account cannot access shop scope |
| 30001 | order_not_found | 404 | shop order not found |
| 30002 | product_not_found | 404 | shop product not found |
| 50000 | internal_error | 500 | unexpected server error |

---

## 3. API 端点清单

## 3.1 GET /merchant/shop/stats

### 目的

返回 Dashboard KPI 卡片与首页概要数据。

### Query 参数

无。

### Request Body

无。

### Success Response 200

```json
{
  "code": 0,
  "data": {
    "today_orders": 47,
    "today_orders_delta_pct": 12.5,
    "today_revenue": 8340,
    "today_revenue_delta_pct": 8.3,
    "pending_shipment_count": 12,
    "low_stock_count": 5,
    "recent_orders_limit": 10,
    "currency": "HKD"
  },
  "message": "ok"
}
```

### data 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| today_orders | number | 是 | 当日订单总数 |
| today_orders_delta_pct | number | 是 | 相比昨日订单数变化百分比，可为负数 |
| today_revenue | number | 是 | 当日已支付及后续状态订单营收总额 |
| today_revenue_delta_pct | number | 是 | 相比昨日营收变化百分比，可为负数 |
| pending_shipment_count | number | 是 | `paid` + `preparing` 订单数，用于“待发货订单数”卡片 |
| low_stock_count | number | 是 | `stock_level <= low_stock_threshold` 商品数 |
| recent_orders_limit | number | 是 | Dashboard 最近订单固定为 10 |
| currency | string | 是 | 固定返回 `HKD` |

### 错误响应

| code | HTTP Status | message |
|---|---:|---|
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 10004 | 400 | missing business type |
| 10003 | 400 | invalid business type |
| 20004 | 403 | current account cannot access shop scope |
| 20003 | 403 | tenant account is suspended |
| 50000 | 500 | unexpected server error |

---

## 3.2 GET /merchant/shop/orders

### 目的

订单列表查询，支持状态筛选、关键词搜索、日期范围、分页；同时供 Dashboard 最近 10 条订单复用。

### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|---|---|---:|---|---|---|
| status | string | 否 | 空 | `paid` | `pending`/`paid`/`preparing`/`shipped`/`completed`/`cancelled` |
| search | string | 否 | 空 | `#10042` | 按 `order_no` 前缀匹配或 `customer_name` 模糊匹配 |
| date_from | string | 否 | 近 7 天起始 | `2026-03-18` | 按订单创建日期过滤，格式 `YYYY-MM-DD` |
| date_to | string | 否 | 当天 | `2026-03-25` | 按订单创建日期过滤，格式 `YYYY-MM-DD` |
| page | number | 否 | 1 | `2` | 页码，从 1 开始 |
| per_page | number | 否 | 20 | `20` | 每页条数，最大 100 |
| include_items | boolean | 否 | false | `false` | Phase 2 列表默认不回传明细 item 数组 |

### Request Body

无。

### Success Response 200

```json
{
  "code": 0,
  "data": {
    "orders": [
      {
        "id": 101,
        "order_no": "#10042",
        "customer_name": "Chan Tai Man",
        "customer_phone": "+85291234567",
        "pet_name": "Mochi",
        "items_summary": "Royal Canin x2, Dental Chew x1",
        "total_amount": 320,
        "currency": "HKD",
        "status": "paid",
        "tracking_number": "",
        "cancel_reason": "",
        "placed_at": "2026-03-25T09:15:00Z",
        "updated_at": "2026-03-25T09:20:00Z"
      }
    ],
    "total": 120,
    "page": 1,
    "per_page": 20,
    "has_more": true,
    "filters": {
      "status": "paid",
      "search": "#10042",
      "date_from": "2026-03-18",
      "date_to": "2026-03-25"
    }
  },
  "message": "ok"
}
```

### `orders[]` 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| id | number | 是 | 订单主键 |
| order_no | string | 是 | 订单号，租户内唯一 |
| customer_name | string | 是 | 客户姓名 |
| customer_phone | string | 是 | 客户联系方式 |
| pet_name | string | 是 | 宠物名 |
| items_summary | string | 是 | 列表页展示摘要 |
| total_amount | number | 是 | 订单总金额 |
| currency | string | 是 | 固定 `HKD` |
| status | string | 是 | 订单状态枚举 |
| tracking_number | string | 是 | 物流单号，无值返回空字符串 |
| cancel_reason | string | 是 | 取消原因，无值返回空字符串 |
| placed_at | string | 是 | 下单时间，等价 `created_at` 的业务语义字段 |
| updated_at | string | 是 | 最后更新时间 |

### 错误响应

| code | HTTP Status | message |
|---|---:|---|
| 10002 | 400 | invalid query params |
| 10005 | 400 | invalid order status |
| 10008 | 400 | date_from must be less than or equal to date_to |
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 10004 | 400 | missing business type |
| 10003 | 400 | invalid business type |
| 20004 | 403 | current account cannot access shop scope |
| 20003 | 403 | tenant account is suspended |
| 50000 | 500 | unexpected server error |

---

## 3.3 GET /merchant/shop/orders/:id

### 目的

返回订单详情抽屉完整数据；为满足商品明细表、费用汇总、物流时间线，Phase 2 必须补充此接口。

### Path 参数

| 参数 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| id | number | 是 | `101` | `shop_orders.id` |

### Success Response 200

```json
{
  "code": 0,
  "data": {
    "id": 101,
    "order_no": "#10042",
    "customer_name": "Chan Tai Man",
    "customer_phone": "+85291234567",
    "pet_name": "Mochi",
    "status": "preparing",
    "tracking_number": "SF123456789HK",
    "cancel_reason": "",
    "subtotal_amount": 300,
    "delivery_fee": 20,
    "total_amount": 320,
    "currency": "HKD",
    "notes": "Leave at reception",
    "placed_at": "2026-03-25T09:15:00Z",
    "updated_at": "2026-03-25T10:00:00Z",
    "items": [
      {
        "id": 1001,
        "product_id": 11,
        "product_name": "Royal Canin Mini Adult",
        "product_image_url": "https://cdn.petwell.test/products/royal-canin.jpg",
        "sku": "DOG-FOOD-001",
        "quantity": 2,
        "unit_price": 120,
        "line_total": 240
      }
    ],
    "status_timeline": [
      {
        "from_status": "paid",
        "to_status": "preparing",
        "changed_by_user_id": 2,
        "changed_by_name": "Happy Paws Staff",
        "reason": "merchant_confirmed",
        "changed_at": "2026-03-25T09:20:00Z"
      }
    ],
    "available_actions": ["ship", "cancel"]
  },
  "message": "ok"
}
```

### 错误响应

| code | HTTP Status | message |
|---|---:|---|
| 30001 | 404 | shop order not found |
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 10004 | 400 | missing business type |
| 10003 | 400 | invalid business type |
| 20004 | 403 | current account cannot access shop scope |
| 20003 | 403 | tenant account is suspended |
| 50000 | 500 | unexpected server error |

---

## 3.4 PATCH /merchant/shop/orders/:id/status

### 目的

商家侧更新订单状态，并原子写入 `app_sync_queue`。

### Path 参数

| 参数 | 类型 | 必填 | 示例 |
|---|---|---:|---|
| id | number | 是 | `101` |

### Request Body JSON

```json
{
  "target_status": "shipped",
  "tracking_number": "SF123456789HK",
  "cancel_reason": "",
  "note": "Packed and handed to courier"
}
```

### 字段约束

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| target_status | string | 是 | `shipped` | 本接口允许值：`preparing`/`shipped`/`completed`/`cancelled`；`paid` 为外部支付系统状态，不允许商家手动提交 |
| tracking_number | string | 条件必填 | `SF123456789HK` | 当 `target_status=shipped` 时必填，最大 64 |
| cancel_reason | string | 条件必填 | `customer_requested` | 当 `target_status=cancelled` 时必填，最大 255 |
| note | string | 否 | `Packed and handed to courier` | 操作备注，最大 255 |

### Success Response 200（状态已变更）

```json
{
  "code": 0,
  "data": {
    "id": 101,
    "order_no": "#10042",
    "previous_status": "preparing",
    "current_status": "shipped",
    "tracking_number": "SF123456789HK",
    "cancel_reason": "",
    "sync_queue": {
      "id": 9001,
      "entity_type": "order",
      "entity_id": "101",
      "action": "status_changed",
      "status": "pending"
    },
    "updated_at": "2026-03-25T10:05:00Z"
  },
  "message": "ok"
}
```

### Success Response 200（幂等无变化）

```json
{
  "code": 0,
  "data": {
    "id": 101,
    "order_no": "#10042",
    "previous_status": "shipped",
    "current_status": "shipped",
    "tracking_number": "SF123456789HK",
    "cancel_reason": "",
    "sync_queue": null,
    "updated_at": "2026-03-25T10:05:00Z"
  },
  "message": "ok"
}
```

### 错误响应

| code | HTTP Status | message |
|---|---:|---|
| 10001 | 400 | invalid request |
| 10005 | 400 | invalid order status |
| 10006 | 400 | tracking_number is required when status=shipped |
| 10007 | 400 | cancel_reason is required when status=cancelled |
| 10009 | 400 | illegal order status transition |
| 30001 | 404 | shop order not found |
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 10004 | 400 | missing business type |
| 10003 | 400 | invalid business type |
| 20004 | 403 | current account cannot access shop scope |
| 20003 | 403 | tenant account is suspended |
| 50000 | 500 | unexpected server error |

### 后端强约束

1. 按 `id + tenant_id` 查询订单，禁止跨租户更新。
2. 使用数据库事务同时完成：
   - 更新 `shop_orders.status / tracking_number / cancel_reason`
   - 写入 `shop_order_status_logs`
   - 写入 `app_sync_queue`
3. 若事务任一步失败，整体回滚。
4. 若 `target_status == current_status`，返回 200 幂等成功，不写 `app_sync_queue`。

---

## 3.5 GET /merchant/shop/products

### 目的

商品列表与低库存标识查询。

### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|---|---|---:|---|---|---|
| search | string | 否 | 空 | `Royal` | 按 `sku` 或 `name` 模糊查询 |
| category | string | 否 | 空 | `food` | 商品分类精确筛选 |
| is_active | boolean | 否 | 空 | `true` | 上下架状态筛选 |
| low_stock_only | boolean | 否 | false | `true` | 仅低库存 |
| page | number | 否 | 1 | `1` | 页码 |
| per_page | number | 否 | 20 | `20` | 每页条数，最大 100 |

### Request Body

无。

### Success Response 200

```json
{
  "code": 0,
  "data": {
    "products": [
      {
        "id": 11,
        "sku": "DOG-FOOD-001",
        "name": "Royal Canin Mini Adult",
        "category": "food",
        "price": 120,
        "stock_level": 3,
        "low_stock_threshold": 5,
        "is_low_stock": true,
        "is_active": true,
        "image_url": "https://cdn.petwell.test/products/royal-canin.jpg",
        "created_at": "2026-03-01T09:00:00Z",
        "updated_at": "2026-03-20T09:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "per_page": 20,
    "categories": ["food", "supplement", "toy", "accessory"]
  },
  "message": "ok"
}
```

### 错误响应

| code | HTTP Status | message |
|---|---:|---|
| 10002 | 400 | invalid query params |
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 10004 | 400 | missing business type |
| 10003 | 400 | invalid business type |
| 20004 | 403 | current account cannot access shop scope |
| 20003 | 403 | tenant account is suspended |
| 50000 | 500 | unexpected server error |

---

## 3.6 GET /merchant/shop/inventory/alerts

### 目的

返回低库存商品清单，供 Dashboard 卡片、商品页 Banner 使用。

### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|---|---|---:|---|---|---|
| limit | number | 否 | 20 | `5` | 返回条数，最大 100 |

### Request Body

无。

### Success Response 200

```json
{
  "code": 0,
  "data": {
    "alerts": [
      {
        "id": 11,
        "sku": "DOG-FOOD-001",
        "name": "Royal Canin Mini Adult",
        "category": "food",
        "stock_level": 3,
        "low_stock_threshold": 5,
        "shortage_count": 2,
        "image_url": "https://cdn.petwell.test/products/royal-canin.jpg"
      }
    ],
    "total": 3
  },
  "message": "ok"
}
```

### 错误响应

| code | HTTP Status | message |
|---|---:|---|
| 10002 | 400 | invalid query params |
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 10004 | 400 | missing business type |
| 10003 | 400 | invalid business type |
| 20004 | 403 | current account cannot access shop scope |
| 20003 | 403 | tenant account is suspended |
| 50000 | 500 | unexpected server error |

---

## 3.7 路由挂载要求

后端入口必须新增到受保护路由组：

```go
protected := merchant.Group("")
protected.Use(middleware.MerchantAuthMiddleware(db))
{
    protected.GET("/shop/stats", handlers.GetShopStats(db))
    protected.GET("/shop/orders", handlers.ListShopOrders(db))
    protected.GET("/shop/orders/:id", handlers.GetShopOrderDetail(db))
    protected.PATCH("/shop/orders/:id/status", handlers.UpdateShopOrderStatus(db))
    protected.GET("/shop/products", handlers.ListShopProducts(db))
    protected.GET("/shop/inventory/alerts", handlers.ListInventoryAlerts(db))
}
```

---

## 4. 数据库表结构

> 新表全部必须包含 `tenant_id`，并建立索引；所有查询、更新、唯一性判断必须把 `tenant_id` 纳入条件。

## 4.1 ShopOrder

```go
package models

import "time"

type ShopOrder struct {
    ID             uint      `gorm:"primaryKey" json:"id"`                                             // 订单主键
    TenantID       uint      `gorm:"not null;index:idx_shop_orders_tenant_status,priority:1;index:idx_shop_orders_tenant_created,priority:1;index:idx_shop_orders_tenant_order_no,priority:1" json:"tenant_id"` // 所属租户
    BusinessType   string    `gorm:"size:16;not null;default:'shop';index" json:"business_type"`       // 固定 shop
    OrderNo        string    `gorm:"size:32;not null;index:idx_shop_orders_tenant_order_no,priority:2,unique" json:"order_no"` // 租户内订单号
    CustomerName   string    `gorm:"size:128;not null;index" json:"customer_name"`                    // 客户姓名
    CustomerPhone  string    `gorm:"size:32;not null" json:"customer_phone"`                          // 客户电话
    PetName        string    `gorm:"size:128;not null;index" json:"pet_name"`                        // 宠物名
    ItemsSummary   string    `gorm:"type:text;not null" json:"items_summary"`                         // 列表页展示摘要
    SubtotalAmount float64   `gorm:"type:decimal(10,2);not null;default:0" json:"subtotal_amount"`   // 商品小计
    DeliveryFee    float64   `gorm:"type:decimal(10,2);not null;default:0" json:"delivery_fee"`      // 配送费
    TotalAmount    float64   `gorm:"type:decimal(10,2);not null;default:0" json:"total_amount"`      // 总金额
    Currency       string    `gorm:"size:8;not null;default:'HKD'" json:"currency"`                   // 币种
    Status         string    `gorm:"size:24;not null;index:idx_shop_orders_tenant_status,priority:2" json:"status"` // pending|paid|preparing|shipped|completed|cancelled
    CancelReason   string    `gorm:"size:255" json:"cancel_reason"`                                   // 取消原因
    TrackingNumber string    `gorm:"size:64;index" json:"tracking_number"`                            // 快递单号
    Notes          string    `gorm:"size:255" json:"notes"`                                           // 买家备注/商家备注快照
    CreatedAt      time.Time `gorm:"index:idx_shop_orders_tenant_created,priority:2" json:"created_at"` // 下单时间
    UpdatedAt      time.Time `json:"updated_at"`                                                        // 更新时间

    Tenant Tenant            `gorm:"foreignKey:TenantID"`
    Items  []ShopOrderItem   `gorm:"foreignKey:OrderID"`
    Logs   []ShopOrderStatusLog `gorm:"foreignKey:OrderID"`
}

func (ShopOrder) TableName() string {
    return "shop_orders"
}
```

### 索引定义

- 唯一索引：`idx_shop_orders_tenant_order_no (tenant_id, order_no)`
- 普通索引：`idx_shop_orders_tenant_status (tenant_id, status)`
- 普通索引：`idx_shop_orders_tenant_created (tenant_id, created_at)`
- 普通索引：`customer_name`、`pet_name`、`tracking_number`

### 关联关系

- `shop_orders.tenant_id -> tenants.id`
- `shop_order_items.order_id -> shop_orders.id`
- `shop_order_status_logs.order_id -> shop_orders.id`

---

## 4.2 ShopOrderItem

```go
type ShopOrderItem struct {
    ID              uint      `gorm:"primaryKey" json:"id"`
    TenantID        uint      `gorm:"not null;index:idx_shop_order_items_tenant_order,priority:1" json:"tenant_id"` // 所属租户
    OrderID         uint      `gorm:"not null;index:idx_shop_order_items_tenant_order,priority:2" json:"order_id"`   // 关联订单
    ProductID       *uint     `gorm:"index" json:"product_id,omitempty"`                                               // 关联商品，可为空（商品被删后保留快照）
    SKU             string    `gorm:"size:64;not null" json:"sku"`                                                     // 商品 SKU 快照
    ProductName     string    `gorm:"size:255;not null" json:"product_name"`                                           // 商品名快照
    ProductImageURL string    `gorm:"size:512" json:"product_image_url"`                                                // 商品图快照
    Quantity        int       `gorm:"not null;default:1" json:"quantity"`                                               // 数量
    UnitPrice       float64   `gorm:"type:decimal(10,2);not null;default:0" json:"unit_price"`                         // 单价
    LineTotal       float64   `gorm:"type:decimal(10,2);not null;default:0" json:"line_total"`                         // 行小计
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`

    Order   ShopOrder    `gorm:"foreignKey:OrderID"`
    Product *ShopProduct `gorm:"foreignKey:ProductID"`
}

func (ShopOrderItem) TableName() string {
    return "shop_order_items"
}
```

### 索引定义

- 复合索引：`idx_shop_order_items_tenant_order (tenant_id, order_id)`
- 普通索引：`product_id`

---

## 4.3 ShopOrderStatusLog

```go
type ShopOrderStatusLog struct {
    ID              uint      `gorm:"primaryKey" json:"id"`
    TenantID        uint      `gorm:"not null;index:idx_shop_order_logs_tenant_order,priority:1" json:"tenant_id"` // 所属租户
    OrderID         uint      `gorm:"not null;index:idx_shop_order_logs_tenant_order,priority:2" json:"order_id"`   // 关联订单
    FromStatus      string    `gorm:"size:24;not null" json:"from_status"`                                             // 变更前状态
    ToStatus        string    `gorm:"size:24;not null;index" json:"to_status"`                                         // 变更后状态
    Reason          string    `gorm:"size:64;not null" json:"reason"`                                                   // merchant_confirmed|merchant_shipped|merchant_completed|merchant_cancelled|payment_confirmed
    Note            string    `gorm:"size:255" json:"note"`                                                             // 备注
    TrackingNumber  string    `gorm:"size:64" json:"tracking_number"`                                                   // 当次操作快递号快照
    CancelReason    string    `gorm:"size:255" json:"cancel_reason"`                                                    // 当次取消原因快照
    ChangedByUserID *uint     `gorm:"index" json:"changed_by_user_id,omitempty"`                                        // 操作人
    ChangedAt       time.Time `gorm:"not null;index" json:"changed_at"`                                                 // 变更时间
    CreatedAt       time.Time `json:"created_at"`

    Order         ShopOrder     `gorm:"foreignKey:OrderID"`
    ChangedByUser *MerchantUser `gorm:"foreignKey:ChangedByUserID"`
}

func (ShopOrderStatusLog) TableName() string {
    return "shop_order_status_logs"
}
```

### 索引定义

- 复合索引：`idx_shop_order_logs_tenant_order (tenant_id, order_id)`
- 普通索引：`to_status`、`changed_by_user_id`、`changed_at`

---

## 4.4 ShopProduct

```go
type ShopProduct struct {
    ID                uint      `gorm:"primaryKey" json:"id"`                                                                 // 商品主键
    TenantID          uint      `gorm:"not null;index:idx_shop_products_tenant_category,priority:1;index:idx_shop_products_tenant_active,priority:1;index:idx_shop_products_tenant_sku,priority:1" json:"tenant_id"` // 所属租户
    BusinessType      string    `gorm:"size:16;not null;default:'shop';index" json:"business_type"`                           // 固定 shop
    SKU               string    `gorm:"size:64;not null;index:idx_shop_products_tenant_sku,priority:2,unique" json:"sku"`   // 租户内唯一 SKU
    Name              string    `gorm:"size:255;not null;index" json:"name"`                                                  // 商品名
    Category          string    `gorm:"size:64;not null;index:idx_shop_products_tenant_category,priority:2" json:"category"` // 分类
    Price             float64   `gorm:"type:decimal(10,2);not null;default:0" json:"price"`                                   // 售价
    StockLevel        int       `gorm:"not null;default:0" json:"stock_level"`                                                 // 当前库存
    LowStockThreshold int       `gorm:"not null;default:0" json:"low_stock_threshold"`                                         // 低库存阈值
    IsActive          bool      `gorm:"not null;default:true;index:idx_shop_products_tenant_active,priority:2" json:"is_active"` // 上下架
    ImageURL          string    `gorm:"size:512" json:"image_url"`                                                             // 商品图 URL
    CreatedAt         time.Time `json:"created_at"`
    UpdatedAt         time.Time `json:"updated_at"`

    Tenant Tenant `gorm:"foreignKey:TenantID"`
}

func (ShopProduct) TableName() string {
    return "shop_products"
}
```

### 索引定义

- 唯一索引：`idx_shop_products_tenant_sku (tenant_id, sku)`
- 普通索引：`idx_shop_products_tenant_category (tenant_id, category)`
- 普通索引：`idx_shop_products_tenant_active (tenant_id, is_active)`
- 普通索引：`name`

---

## 4.5 AppSyncQueue

```go
type AppSyncQueue struct {
    ID         uint      `gorm:"primaryKey" json:"id"`
    TenantID   uint      `gorm:"not null;index:idx_app_sync_queue_tenant_status,priority:1;index:idx_app_sync_queue_tenant_entity,priority:1" json:"tenant_id"` // 所属租户
    EntityType string    `gorm:"size:32;not null;index:idx_app_sync_queue_tenant_entity,priority:2" json:"entity_type"` // order|appointment
    EntityID   string    `gorm:"size:64;not null;index:idx_app_sync_queue_tenant_entity,priority:3" json:"entity_id"`   // 业务实体 ID 字符串化
    Action     string    `gorm:"size:32;not null;index" json:"action"`                                                     // status_changed
    Payload    string    `gorm:"type:text;not null" json:"payload"`                                                        // JSON 字符串
    Status     string    `gorm:"size:24;not null;default:'pending';index:idx_app_sync_queue_tenant_status,priority:2" json:"status"` // pending|sent|failed|dead_letter
    RetryCount int       `gorm:"not null;default:0" json:"retry_count"`
    LastError  string    `gorm:"size:255" json:"last_error"`
    CreatedAt  time.Time `gorm:"not null;index" json:"created_at"`
    UpdatedAt  time.Time `json:"updated_at"`

    Tenant Tenant `gorm:"foreignKey:TenantID"`
}

func (AppSyncQueue) TableName() string {
    return "app_sync_queue"
}
```

### Payload 规范

```json
{
  "order_id": 101,
  "order_no": "#10042",
  "from_status": "preparing",
  "to_status": "shipped",
  "tracking_number": "SF123456789HK",
  "cancel_reason": "",
  "changed_at": "2026-03-25T10:05:00Z",
  "changed_by_user_id": 2,
  "changed_by_role": "staff"
}
```

### 索引定义

- 复合索引：`idx_app_sync_queue_tenant_status (tenant_id, status)`
- 复合索引：`idx_app_sync_queue_tenant_entity (tenant_id, entity_type, entity_id)`
- 普通索引：`action`、`created_at`

---

## 5. 状态机定义

## 5.1 订单状态枚举

- `pending`：待付款
- `paid`：已付款
- `preparing`：备货中
- `shipped`：配送中 / 待自提
- `completed`：已完成
- `cancelled`：已取消

## 5.2 领域流转矩阵（订单真实生命周期）

| from \ to | pending | paid | preparing | shipped | completed | cancelled |
|---|---:|---:|---:|---:|---:|---:|
| pending | ✅ 幂等 | ✅ | ❌ | ❌ | ❌ | ✅ |
| paid | ❌ | ✅ 幂等 | ✅ | ❌ | ❌ | ✅ |
| preparing | ❌ | ❌ | ✅ 幂等 | ✅ | ❌ | ✅ |
| shipped | ❌ | ❌ | ❌ | ✅ 幂等 | ✅ | ❌ |
| completed | ❌ | ❌ | ❌ | ❌ | ✅ 幂等 | ❌ |
| cancelled | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ 幂等 |

## 5.3 商家端 PATCH 接口可执行流转矩阵

> `pending -> paid` 属于支付系统/外部同步流转，不由商家 UI 发起；因此 `PATCH /merchant/shop/orders/:id/status` 的 `target_status` 不接受 `paid`。

| from \ to | preparing | shipped | completed | cancelled |
|---|---:|---:|---:|---:|
| pending | ❌ | ❌ | ❌ | ✅ |
| paid | ✅ | ❌ | ❌ | ✅ |
| preparing | ❌ | ✅ | ❌ | ✅ |
| shipped | ❌ | ❌ | ✅ | ❌ |
| completed | ❌ | ❌ | ❌ | ❌ |
| cancelled | ❌ | ❌ | ❌ | ❌ |

## 5.4 触发条件与副作用

| 流转 | 触发方 | 条件 | 副作用 |
|---|---|---|---|
| pending -> paid | 支付系统 / 外部同步 | 支付成功 | 写 `shop_order_status_logs`；写 `app_sync_queue` |
| paid -> preparing | 商家 | 无额外字段 | 写 `shop_order_status_logs`；写 `app_sync_queue` |
| preparing -> shipped | 商家 | `tracking_number` 必填 | 保存 `tracking_number`；写状态日志；写 `app_sync_queue` |
| shipped -> completed | 商家 | 无额外字段 | 写状态日志；写 `app_sync_queue` |
| pending/paid/preparing -> cancelled | 商家 | `cancel_reason` 必填 | 保存 `cancel_reason`；写状态日志；写 `app_sync_queue` |
| 任意 -> 同状态 | 商家/API 重试 | 幂等请求 | 返回 200；不写 `app_sync_queue` |

## 5.5 非法流转规则

- `completed` 不可取消。
- `shipped` 不可直接取消。
- 不允许跳跃流转，如 `paid -> completed`、`pending -> shipped`。
- 非法流转统一返回：`400 / code=10009 / message="illegal order status transition"`。

---

## 6. 前端页面清单

| 路由路径 | 页面组件名 | 调用 API | Zustand Store | 主要交互说明 |
|---|---|---|---|---|
| `/merchant/shop/dashboard` | `ShopDashboardPage` | `GET /merchant/shop/stats`、`GET /merchant/shop/orders?per_page=10&page=1`、`GET /merchant/shop/inventory/alerts?limit=5` | `authStore`、`shopDashboardStore` | 展示 KPI、最近订单、低库存摘要、Mock 同步状态卡；点击 KPI 跳转订单/商品页 |
| `/merchant/shop/orders` | `ShopOrdersPage` | `GET /merchant/shop/orders`、`GET /merchant/shop/orders/:id`、`PATCH /merchant/shop/orders/:id/status` | `authStore`、`shopOrdersStore` | Tabs 状态筛选、搜索防抖 300ms、日期范围、分页、详情抽屉、状态操作弹窗、前端 CSV 导出当前列表 |
| `/merchant/shop/products` | `ShopProductsPage` | `GET /merchant/shop/products`、`GET /merchant/shop/inventory/alerts` | `authStore`、`shopProductsStore` | 搜索、分类筛选、低库存 Banner、分页、上下架按钮（Phase 2 按钮可先禁用或仅 UI 占位，不新增后端接口） |
| `/merchant/shop/schedule` | `ShopSchedulePage` | 无真实后端 API（Phase 2 Mock） | `authStore`、`shopScheduleStore` | 时间轴排期、新建/修改/取消预约均使用本地 Mock 数据；待后续 Phase 接入真实接口 |

### 页面实现强约束

1. 所有 API 调用必须通过 `frontend/lib/api.ts` 封装，不允许页面直接 `fetch`。
2. 每个页面必须处理 `Loading / Empty / Error` 三态。
3. Sidebar 必须新增 Shop 导航项：
   - Dashboard
   - Orders
   - Products
   - Schedule
4. `X-Business-Type` 必须从 `authStore.user.activeBusinessType` 读取，且 Shop 页面固定为 `shop`。

---

## 7. 前后端字段映射表

## 7.1 Stats 映射

| 后端 snake_case | 前端 camelCase | 类型 |
|---|---|---|
| today_orders | todayOrders | number |
| today_orders_delta_pct | todayOrdersDeltaPct | number |
| today_revenue | todayRevenue | number |
| today_revenue_delta_pct | todayRevenueDeltaPct | number |
| pending_shipment_count | pendingShipmentCount | number |
| low_stock_count | lowStockCount | number |
| recent_orders_limit | recentOrdersLimit | number |
| currency | currency | string |

## 7.2 Order List / Detail 映射

| 后端 snake_case | 前端 camelCase | 类型 |
|---|---|---|
| id | id | number |
| order_no | orderNo | string |
| customer_name | customerName | string |
| customer_phone | customerPhone | string |
| pet_name | petName | string |
| items_summary | itemsSummary | string |
| subtotal_amount | subtotalAmount | number |
| delivery_fee | deliveryFee | number |
| total_amount | totalAmount | number |
| currency | currency | string |
| status | status | ShopOrderStatus |
| tracking_number | trackingNumber | string |
| cancel_reason | cancelReason | string |
| notes | notes | string |
| placed_at | placedAt | string |
| updated_at | updatedAt | string |
| available_actions | availableActions | string[] |

## 7.3 Order Item 映射

| 后端 snake_case | 前端 camelCase | 类型 |
|---|---|---|
| product_id | productId | number \| null |
| product_name | productName | string |
| product_image_url | productImageUrl | string |
| sku | sku | string |
| quantity | quantity | number |
| unit_price | unitPrice | number |
| line_total | lineTotal | number |

## 7.4 Order Timeline 映射

| 后端 snake_case | 前端 camelCase | 类型 |
|---|---|---|
| from_status | fromStatus | ShopOrderStatus |
| to_status | toStatus | ShopOrderStatus |
| changed_by_user_id | changedByUserId | number \| null |
| changed_by_name | changedByName | string |
| reason | reason | string |
| changed_at | changedAt | string |

## 7.5 Product / Inventory 映射

| 后端 snake_case | 前端 camelCase | 类型 |
|---|---|---|
| sku | sku | string |
| name | name | string |
| category | category | string |
| price | price | number |
| stock_level | stockLevel | number |
| low_stock_threshold | lowStockThreshold | number |
| is_low_stock | isLowStock | boolean |
| is_active | isActive | boolean |
| image_url | imageUrl | string |
| shortage_count | shortageCount | number |
| created_at | createdAt | string |
| updated_at | updatedAt | string |

## 7.6 Status Update Request 映射

| 场景 | 后端字段 | 前端字段 | 类型 |
|---|---|---|---|
| PATCH request | target_status | targetStatus | ShopOrderStatusAction |
| PATCH request | tracking_number | trackingNumber | string |
| PATCH request | cancel_reason | cancelReason | string |
| PATCH request | note | note | string |
| PATCH response | previous_status | previousStatus | ShopOrderStatus |
| PATCH response | current_status | currentStatus | ShopOrderStatus |

---

## 8. Seed 数据规格

## 8.1 适用租户

- 仅对支持 Shop 业务的租户生成：`tenant.type in ('shop', 'both')`
- 现有种子租户中：`Happy Paws (type=both)` 生成 Phase 2 Shop 数据
- `Paws Clinic (type=clinic)` 不生成 Shop 数据

## 8.2 新表种子条数与分布

| 表 | 每个 Shop 租户条数 | 分布说明 |
|---|---:|---|
| `shop_products` | 10 | `food` 4、`supplement` 2、`toy` 2、`accessory` 2；其中 3 条低库存 |
| `shop_orders` | 20 | `pending` 2、`paid` 4、`preparing` 4、`shipped` 4、`completed` 4、`cancelled` 2 |
| `shop_order_items` | 40~60 | 每订单 2~3 条 item，快照自 `shop_products` |
| `shop_order_status_logs` | 36~72 | 每订单至少 1 条；按最终状态补齐完整轨迹 |
| `app_sync_queue` | 0 | 初始不预置，测试通过状态更新实时生成 |

## 8.3 低库存商品规则

- 10 条商品中恰好 3 条满足 `stock_level <= low_stock_threshold`
- 低库存商品至少覆盖 2 个分类
- 至少 1 条低库存商品为 `is_active=true`

## 8.4 时间分布规则

- 订单 `created_at` 覆盖最近 14 天
- 最近 1 天至少 5 条订单，保证 Dashboard KPI 与最近订单列表可见
- `completed` / `cancelled` 订单的状态日志必须带完整时间线

## 8.5 幂等要求

- seed 必须可重复执行
- 判断依据推荐：
  - `shop_products` 以 `(tenant_id, sku)` 去重
  - `shop_orders` 以 `(tenant_id, order_no)` 去重

---

## 9. 编码规范提醒

1. 后端统一响应格式：`{"code": 0, "data": {...}, "message": "ok"}`。
2. 后端所有查询必须加 `WHERE tenant_id = ?`，包括详情查询、状态更新、列表统计、唯一性校验。
3. 所有新 API 路由必须挂在鉴权中间件之后。
4. 前端所有 API 调用必须通过 `frontend/lib/api.ts`；不得在页面、store、component 中直接 `fetch`。
5. 前端所有页面必须处理 `Loading / Empty / Error` 三态。
6. 新增 Shop 路由必须在 Sidebar 添加导航项，并遵循 `activeBusinessType === 'shop'` 才展示。
7. 前端网络层必须显式做 `snake_case -> camelCase` DTO 转换，不得把后端 DTO 直接写入 Zustand store。
8. 订单状态更新必须事务化，确保“订单状态 + 状态日志 + sync_queue”三者原子一致。

---

## 10. 实现对齐补充说明

### 10.1 `frontend/lib/api.ts` 建议新增类型

```ts
export type ShopOrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'completed'
  | 'cancelled'

export interface ApiEnvelopeDTO<T> {
  code: number
  data: T
  message: string
}
```

### 10.2 前端 CSV 导出约束

- Phase 2 不新增后端导出接口。
- “导出 CSV” 按钮使用当前已加载列表数据在前端生成 CSV。
- 导出内容字段：`order_no,customer_name,pet_name,items_summary,total_amount,status,placed_at`。

### 10.3 Schedule 页面说明

- `/merchant/shop/schedule` 在 Phase 2 仅交付前端页面与 Mock 数据。
- 不新增数据库表、后端路由、同步队列逻辑。

---

## 11. Phase 2 交付清单

- [x] Shop API 契约
- [x] Shop 数据库表结构
- [x] 订单状态机与流转矩阵
- [x] Shop 页面与 Zustand store 约束
- [x] 前后端字段映射表
- [x] Seed 数据规格
- [x] 编码规范提醒

本文件为 Phase 2 唯一技术契约基线：`docs/phase2_contract.md`

# Phase 1 技术契约文档

## 1. 文档目标与范围

- Phase 目标：实现商家后台基础框架，支持登录、Session 鉴权、权限判断、业务视图切换、空 Dashboard 骨架。
- 适用对象：Architect、Backend Dev、Frontend Dev、QA。
- 本文定义统一契约，前后端必须严格遵循，未经评审不得擅自修改字段名、错误码、状态语义。

---

## 2. 统一约定

### 2.1 基础约定

- API Base Path：`/merchant`
- Content-Type：`application/json`
- 鉴权 Header：`X-Session-ID`
- 业务上下文 Header：`X-Business-Type`
- 时间格式：ISO 8601 / RFC3339，例如 `2026-03-25T10:30:00Z`
- ID 风格：
  - 数据库主键：`uint`
  - Session ID：UUID v4 字符串
- 后端 JSON 命名：`snake_case`
- 前端内部 TS / Zustand 推荐命名：`camelCase`
- 本 Phase 不使用 refresh token；Session 固定 24 小时有效

### 2.2 业务枚举

#### tenant.type

- `shop`：仅宠物门店业务
- `clinic`：仅诊疗业务
- `both`：同时拥有 shop + clinic 业务

#### tenant.status

- `active`
- `suspended`

#### merchant_user.role

- `owner`
- `manager`
- `staff`
- `doctor`
- `frontdesk`

#### business_type

- `shop`
- `clinic`

#### session.status（逻辑状态，非单独落库字段）

- `valid`
- `expired`
- `revoked`
- `missing`

---

## 3. API 接口规范

## 3.1 通用请求头

### 鉴权接口外

除 `POST /merchant/auth/login` 外，其余 `/merchant/*` 受保护接口必须携带：

```http
X-Session-ID: <uuid>
X-Business-Type: shop | clinic
```

### Header 校验规则

- `X-Session-ID` 缺失：返回 `401 session_missing`
- `X-Session-ID` 无效/不存在/过期：返回 `401 session_expired`
- `X-Business-Type` 缺失：返回 `400 missing_business_type`
- `X-Business-Type` 非法：返回 `400 invalid_business_type`
- `X-Business-Type` 与当前用户权限不匹配：返回 `403 business_scope_forbidden`

## 3.2 通用错误响应格式

```json
{
  "error": "invalid_credentials",
  "message": "Email or password is incorrect.",
  "request_id": "req_01HQZ..."
}
```

### 字段说明

- `error`：稳定错误码，前端应基于该值处理逻辑
- `message`：面向展示/日志的人类可读文案
- `request_id`：可选，用于排查链路

---

## 3.3 POST /merchant/auth/login

### 目的

账号密码登录，创建 24h Session。

### Request

```http
POST /merchant/auth/login
Content-Type: application/json
```

```json
{
  "email": "owner@happypaws.com",
  "password": "Test123!"
}
```

### Request 字段约束

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| email | string | 是 | 邮箱格式，最大 255 |
| password | string | 是 | 8~72 字符 |

### Success Response 200

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "expires_at": "2026-03-26T10:30:00Z",
  "user": {
    "id": 1,
    "name": "Happy Paws Owner",
    "email": "owner@happypaws.com",
    "role": "owner",
    "can_switch": true,
    "active_business_type": "shop"
  },
  "tenant": {
    "id": 1,
    "name": "Happy Paws",
    "type": "both",
    "status": "active"
  }
}
```

### Error Responses

#### 400 invalid_request

```json
{
  "error": "invalid_request",
  "message": "Email and password are required."
}
```

#### 401 invalid_credentials

```json
{
  "error": "invalid_credentials",
  "message": "Email or password is incorrect."
}
```

#### 403 account_suspended

```json
{
  "error": "account_suspended",
  "message": "This tenant account is suspended."
}
```

#### 500 internal_error

```json
{
  "error": "internal_error",
  "message": "Unexpected server error."
}
```

### 后端处理规则

1. 用 email 查 `merchant_users`
2. 验证密码哈希（bcrypt）
3. 联查 `tenants`
4. 若 tenant.status=`suspended`，拒绝登录
5. 生成 UUID v4 `session_id`
6. 写入 `merchant_sessions`，`expires_at = now + 24h`
7. 返回用户、租户、session 信息

---

## 3.4 GET /merchant/me

### 目的

获取当前 Session 对应的用户身份、租户、当前激活业务类型。

### Request

```http
GET /merchant/me
X-Session-ID: 550e8400-e29b-41d4-a716-446655440000
X-Business-Type: shop
```

### Success Response 200

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "expires_at": "2026-03-26T10:30:00Z",
  "user": {
    "id": 1,
    "name": "Happy Paws Owner",
    "email": "owner@happypaws.com",
    "role": "owner",
    "can_switch": true,
    "active_business_type": "shop"
  },
  "tenant": {
    "id": 1,
    "name": "Happy Paws",
    "type": "both",
    "status": "active"
  }
}
```

### Error Responses

#### 401 session_missing

```json
{
  "error": "session_missing",
  "message": "X-Session-ID header is required."
}
```

#### 401 session_expired

```json
{
  "error": "session_expired",
  "message": "Session is invalid or expired."
}
```

#### 400 missing_business_type

```json
{
  "error": "missing_business_type",
  "message": "X-Business-Type header is required."
}
```

#### 400 invalid_business_type

```json
{
  "error": "invalid_business_type",
  "message": "Business type must be shop or clinic."
}
```

#### 403 business_scope_forbidden

```json
{
  "error": "business_scope_forbidden",
  "message": "Current account cannot access this business scope."
}
```

### 后端处理规则

1. Session 中间件校验 Session
2. 校验 `X-Business-Type` 与用户可访问业务范围一致
3. 返回当前用户、租户、Session 信息
4. 以数据库中的 `merchant_users.active_business_type` 为准返回当前激活视图

---

## 3.5 PATCH /merchant/me/switch

### 目的

双业务账号切换当前激活业务视图。

### Request

```http
PATCH /merchant/me/switch
Content-Type: application/json
X-Session-ID: 550e8400-e29b-41d4-a716-446655440000
X-Business-Type: shop
```

```json
{
  "business_type": "clinic"
}
```

### Request 字段约束

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| business_type | string | 是 | `shop` \| `clinic` |

### Success Response 200

```json
{
  "active_business_type": "clinic"
}
```

### Error Responses

#### 400 invalid_request

```json
{
  "error": "invalid_request",
  "message": "business_type is required."
}
```

#### 400 invalid_business_type

```json
{
  "error": "invalid_business_type",
  "message": "business_type must be shop or clinic."
}
```

#### 401 session_missing

```json
{
  "error": "session_missing",
  "message": "X-Session-ID header is required."
}
```

#### 401 session_expired

```json
{
  "error": "session_expired",
  "message": "Session is invalid or expired."
}
```

#### 403 switch_not_allowed

```json
{
  "error": "switch_not_allowed",
  "message": "Current account cannot switch business type."
}
```

#### 403 business_scope_forbidden

```json
{
  "error": "business_scope_forbidden",
  "message": "Target business type is not available for current tenant or user."
}
```

### 后端处理规则

1. Session 中间件校验通过
2. 校验 `merchant_users.can_switch = true`
3. 校验目标 `business_type` 是否属于租户可用范围：
   - tenant.type=`both`：可切 `shop`/`clinic`
   - tenant.type=`shop`：仅可 `shop`
   - tenant.type=`clinic`：仅可 `clinic`
4. 更新 `merchant_users.active_business_type`
5. 返回最新值

---

## 3.6 受保护页面路由守卫契约

此部分由前端 Next.js middleware 与页面层共同遵守。

### 路由规则

| 场景 | 规则 |
|---|---|
| 未登录访问 `/merchant/*` | 302 跳转 `/login` |
| 已登录访问 `/login` | 302 跳转 `/merchant/dashboard` |
| `can_switch=false` 且当前账号非对应业务 | 进入目标业务路由时渲染 403 页面 |

### 路由域建议

| 路由前缀 | 业务域 |
|---|---|
| `/merchant/dashboard` | 通用 |
| `/merchant/shop/*` | shop |
| `/merchant/clinic/*` | clinic |

### 403 页面返回语义

前端页面展示，不走 HTTP API。页面态建议文案：

- 标题：`403 Forbidden`
- 描述：`You do not have permission to access this business area.`

---

## 4. 数据库表结构设计（Go GORM Struct）

> 表名、字段名、索引均需稳定；以 AutoMigrate + 显式索引标签实现。

```go
package models

import "time"

type Tenant struct {
    ID        uint      `gorm:"primaryKey" json:"id"`
    Name      string    `gorm:"size:128;not null" json:"name"`
    Type      string    `gorm:"size:16;not null;index" json:"type"`     // shop|clinic|both
    Status    string    `gorm:"size:16;not null;index" json:"status"`   // active|suspended
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`

    MerchantUsers []MerchantUser    `gorm:"foreignKey:TenantID"`
    Sessions      []MerchantSession `gorm:"foreignKey:TenantID"`
}

func (Tenant) TableName() string {
    return "tenants"
}

type MerchantUser struct {
    ID                 uint      `gorm:"primaryKey" json:"id"`
    TenantID           uint      `gorm:"not null;index" json:"tenant_id"`
    Email              string    `gorm:"size:255;not null;uniqueIndex" json:"email"`
    PasswordHash       string    `gorm:"size:255;not null" json:"-"`
    Name               string    `gorm:"size:128;not null" json:"name"`
    Role               string    `gorm:"size:32;not null;index" json:"role"`                   // owner|manager|staff|doctor|frontdesk
    ActiveBusinessType string    `gorm:"size:16;not null;index" json:"active_business_type"`   // shop|clinic
    CanSwitch          bool      `gorm:"not null;default:false;index" json:"can_switch"`
    Status             string    `gorm:"size:16;not null;default:'active';index" json:"status"` // active|disabled
    CreatedAt          time.Time `json:"created_at"`
    UpdatedAt          time.Time `json:"updated_at"`

    Tenant   Tenant             `gorm:"foreignKey:TenantID"`
    Sessions []MerchantSession  `gorm:"foreignKey:UserID"`
}

func (MerchantUser) TableName() string {
    return "merchant_users"
}

type MerchantSession struct {
    ID        string    `gorm:"primaryKey;size:36" json:"id"` // UUID v4
    UserID    uint      `gorm:"not null;index" json:"user_id"`
    TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
    ExpiresAt time.Time `gorm:"not null;index" json:"expires_at"`
    RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`

    User   MerchantUser `gorm:"foreignKey:UserID"`
    Tenant Tenant       `gorm:"foreignKey:TenantID"`
}

func (MerchantSession) TableName() string {
    return "merchant_sessions"
}
```

### 4.1 设计说明

#### tenants

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uint PK | 租户主键 |
| name | varchar(128) | 租户名称 |
| type | varchar(16) | `shop`/`clinic`/`both` |
| status | varchar(16) | `active`/`suspended` |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### merchant_users

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uint PK | 用户主键 |
| tenant_id | uint FK | 所属租户 |
| email | varchar(255) unique | 登录账号 |
| password_hash | varchar(255) | bcrypt 哈希 |
| name | varchar(128) | 用户名 |
| role | varchar(32) | 角色 |
| active_business_type | varchar(16) | 当前激活业务类型 |
| can_switch | bool | 是否可切换业务视图 |
| status | varchar(16) | 预留用户状态，建议 active/disabled |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

#### merchant_sessions

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | Session ID |
| user_id | uint FK | 所属用户 |
| tenant_id | uint FK | 所属租户 |
| expires_at | datetime | 过期时间 |
| revoked_at | datetime nullable | 主动吊销时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 4.2 推荐索引

- `merchant_users.email`：唯一索引
- `merchant_users.tenant_id`
- `merchant_users.role`
- `merchant_users.active_business_type`
- `merchant_sessions.user_id`
- `merchant_sessions.tenant_id`
- `merchant_sessions.expires_at`
- `merchant_sessions.revoked_at`

---

## 5. 状态机定义

## 5.1 Tenant 状态机

### 状态枚举

- `active`
- `suspended`

### 合法流转矩阵

| 当前状态 \ 目标状态 | active | suspended |
|---|---:|---:|
| active | ✅ | ✅ |
| suspended | ✅ | ✅ |

### 状态规则

- `suspended` 租户不可登录
- 已存在 Session 即使未过期，也应在鉴权时视为不可继续访问（建议返回 `account_suspended` 或 `session_expired`；Phase 1 统一返回 `403 account_suspended` 更清晰）

## 5.2 MerchantUser 业务访问状态机

> 该状态机描述用户当前可访问业务域，不是单独表字段，而是由 `tenant.type + can_switch + active_business_type` 共同决定。

### 状态枚举

- `shop_locked`：仅可访问 shop
- `clinic_locked`：仅可访问 clinic
- `switchable_shop_active`：可切换，当前激活 shop
- `switchable_clinic_active`：可切换，当前激活 clinic

### 合法流转矩阵

| 当前状态 \ 目标状态 | shop_locked | clinic_locked | switchable_shop_active | switchable_clinic_active |
|---|---:|---:|---:|---:|
| shop_locked | ✅ | ❌ | ❌ | ❌ |
| clinic_locked | ❌ | ✅ | ❌ | ❌ |
| switchable_shop_active | ❌ | ❌ | ✅ | ✅ |
| switchable_clinic_active | ❌ | ❌ | ✅ | ✅ |

### 状态判定规则

1. `can_switch=false && active_business_type=shop` → `shop_locked`
2. `can_switch=false && active_business_type=clinic` → `clinic_locked`
3. `can_switch=true && active_business_type=shop` → `switchable_shop_active`
4. `can_switch=true && active_business_type=clinic` → `switchable_clinic_active`

### 约束

- `can_switch=true` 时，tenant.type 必须为 `both`
- `tenant.type=shop` 时，`active_business_type` 只能为 `shop`
- `tenant.type=clinic` 时，`active_business_type` 只能为 `clinic`

## 5.3 Session 状态机

### 状态枚举

- `missing`
- `valid`
- `expired`
- `revoked`

### 合法流转矩阵

| 当前状态 \ 目标状态 | missing | valid | expired | revoked |
|---|---:|---:|---:|---:|
| missing | ✅ | ✅ | ❌ | ❌ |
| valid | ❌ | ✅ | ✅ | ✅ |
| expired | ❌ | ❌ | ✅ | ❌ |
| revoked | ❌ | ❌ | ❌ | ✅ |

### 状态规则

- `missing -> valid`：登录成功创建 Session
- `valid -> expired`：超过 `expires_at`
- `valid -> revoked`：主动登出/后台吊销（Phase 1 可预留）
- `expired` / `revoked` 均不得恢复

## 5.4 Login 请求状态机（前端）

### 状态枚举

- `idle`
- `submitting`
- `success`
- `error_invalid_credentials`
- `error_account_suspended`
- `error_network`

### 合法流转矩阵

| 当前状态 \ 目标状态 | idle | submitting | success | error_invalid_credentials | error_account_suspended | error_network |
|---|---:|---:|---:|---:|---:|---:|
| idle | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| submitting | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| success | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| error_invalid_credentials | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| error_account_suspended | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| error_network | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## 6. Session 中间件契约

## 6.1 中间件职责

- 从 Header 读取 `X-Session-ID`
- 校验 Session 是否存在、是否过期、是否吊销
- 联查用户与租户
- 校验租户状态是否可用
- 解析 `X-Business-Type`
- 校验业务访问权限
- 向请求上下文注入认证信息

## 6.2 Context 注入结构

```go
package authctx

type MerchantAuthContext struct {
    SessionID          string
    UserID             uint
    TenantID           uint
    Role               string
    CanSwitch          bool
    ActiveBusinessType string
    RequestedBusinessType string
}
```

## 6.3 中间件伪代码约束

```go
func MerchantAuthMiddleware(db *gorm.DB) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            sessionID := r.Header.Get("X-Session-ID")
            if sessionID == "" {
                writeError(w, 401, "session_missing", "X-Session-ID header is required.")
                return
            }

            requestedBusinessType := r.Header.Get("X-Business-Type")
            if requestedBusinessType == "" {
                writeError(w, 400, "missing_business_type", "X-Business-Type header is required.")
                return
            }
            if requestedBusinessType != "shop" && requestedBusinessType != "clinic" {
                writeError(w, 400, "invalid_business_type", "Business type must be shop or clinic.")
                return
            }

            // preload session + user + tenant
            // validate expires_at and revoked_at
            // validate tenant.status == active
            // validate requested business scope
            // inject auth context into request context
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

## 6.4 权限判断规则

| 条件 | 结果 |
|---|---|
| session 不存在 | 401 `session_expired` |
| session 已过期 | 401 `session_expired` |
| session 已吊销 | 401 `session_expired` |
| tenant.status=suspended | 403 `account_suspended` |
| 请求 `shop` 且 tenant.type=clinic | 403 `business_scope_forbidden` |
| 请求 `clinic` 且 tenant.type=shop | 403 `business_scope_forbidden` |
| can_switch=false 且 requested != active_business_type | 403 `business_scope_forbidden` |

---

## 7. 前端组件树与路由设计

## 7.1 页面路由树

```text
/
└── /login

/merchant
├── /merchant/dashboard
├── /merchant/shop/*        (Phase 1 仅守卫预留)
├── /merchant/clinic/*      (Phase 1 仅守卫预留)
└── /merchant/403           (建议独立错误页)
```

## 7.2 App Router 组件树建议

```text
app/
├── login/
│   └── page.tsx
├── merchant/
│   ├── layout.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── 403/
│   │   └── page.tsx
│   ├── shop/
│   │   └── [...slug]/page.tsx   # 预留
│   └── clinic/
│       └── [...slug]/page.tsx   # 预留
└── middleware.ts
```

## 7.3 登录页组件树

```text
LoginPage
└── AuthCard
    ├── LogoHeader
    │   ├── PetWellLogo
    │   ├── Title("Merchant Portal")
    │   └── Subtitle
    ├── PermissionInfoBanner
    ├── LoginForm
    │   ├── EmailField
    │   ├── PasswordField
    │   │   └── PasswordVisibilityToggle
    │   ├── ErrorMessage
    │   └── SubmitButton(loading)
    └── FooterHint(optional)
```

### 登录页状态需求

- 支持邮箱格式校验
- 支持密码显隐
- 支持错误展示：
  - `invalid_credentials` → “密码错误或账号不存在”
  - `account_suspended` → “账号已被停用，请联系管理员”
  - 网络错误 → “网络异常，请稍后重试”

## 7.4 商家后台 Layout 组件树

```text
MerchantLayout
├── RouteGuard
├── Sidebar(width=240)
│   ├── BrandSection
│   │   ├── Logo
│   │   └── BrandName
│   ├── ContextSwitcher(can_switch=true only)
│   │   ├── ShopTab(active=#2563EB)
│   │   └── ClinicTab(active=#0891B2)
│   ├── NavigationMenu
│   │   └── NavItem[]   # 按 activeBusinessType 动态渲染
│   └── SidebarFooter
│       ├── UserAvatar
│       ├── UserName
│       ├── RoleBadge
│       └── LogoutButton
├── TopBar(height=64)
│   ├── PageTitle
│   ├── SyncStatusBadge
│   └── NotificationButton
└── MainContent(padding=24)
    └── children
```

## 7.5 Dashboard 骨架页组件树

```text
DashboardPage
└── DashboardShell
    ├── GreetingHeader("Good morning, {user.name}")
    ├── SummarySkeletonRow
    │   └── SkeletonCard[]
    └── ContentSkeletonSection[]
```

## 7.6 Zustand Store 结构

```ts
export type BusinessType = 'shop' | 'clinic'
export type UserRole = 'owner' | 'manager' | 'staff' | 'doctor' | 'frontdesk'
export type TenantType = 'shop' | 'clinic' | 'both'
export type TenantStatus = 'active' | 'suspended'

export interface MerchantUserDTO {
  id: number
  name: string
  email: string
  role: UserRole
  can_switch: boolean
  active_business_type: BusinessType
}

export interface TenantDTO {
  id: number
  name: string
  type: TenantType
  status: TenantStatus
}

export interface AuthStoreState {
  sessionId: string | null
  expiresAt: string | null
  user: {
    id: number
    name: string
    email: string
    role: UserRole
    canSwitch: boolean
    activeBusinessType: BusinessType
  } | null
  tenant: {
    id: number
    name: string
    type: TenantType
    status: TenantStatus
  } | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  loginStatus: 'idle' | 'submitting' | 'success' | 'error_invalid_credentials' | 'error_account_suspended' | 'error_network'

  setSession: (payload: LoginResponse) => void
  clearSession: () => void
  hydrateFromCookie: () => Promise<void>
  fetchMe: () => Promise<void>
  switchBusiness: (target: BusinessType) => Promise<void>
}
```

## 7.7 Hook 设计

### useAuth()

返回：

```ts
{
  sessionId: string | null
  user: AuthStoreState['user']
  tenant: AuthStoreState['tenant']
  activeBusinessType: 'shop' | 'clinic' | null
  canSwitch: boolean
  isAuthenticated: boolean
}
```

### useSwitchBusiness()

返回：

```ts
{
  switchBusiness: (target: 'shop' | 'clinic') => Promise<void>
  isSwitching: boolean
}
```

## 7.8 导航菜单配置建议

```ts
type NavItem = {
  label: string
  href: string
  businessType: 'common' | 'shop' | 'clinic'
  icon?: string
}
```

渲染规则：

- `common`：所有商家后台用户可见
- `shop`：仅 `activeBusinessType === 'shop'` 时可见
- `clinic`：仅 `activeBusinessType === 'clinic'` 时可见

---

## 8. 前后端 JSON 字段映射表

> 原则：后端 API 固定 `snake_case`；前端内部状态与组件 props 推荐 `camelCase`。网络层统一做 DTO -> ViewModel 转换。

### 8.1 登录/用户信息映射

| 后端 JSON 字段 | 前端 Store 字段 | 类型 | 说明 |
|---|---|---|---|
| session_id | sessionId | string | Session UUID |
| expires_at | expiresAt | string | Session 过期时间 |
| user.id | user.id | number | 用户 ID |
| user.name | user.name | string | 用户姓名 |
| user.email | user.email | string | 用户邮箱 |
| user.role | user.role | UserRole | 用户角色 |
| user.can_switch | user.canSwitch | boolean | 是否可切换业务 |
| user.active_business_type | user.activeBusinessType | BusinessType | 当前激活业务 |
| tenant.id | tenant.id | number | 租户 ID |
| tenant.name | tenant.name | string | 租户名 |
| tenant.type | tenant.type | TenantType | 租户业务类型 |
| tenant.status | tenant.status | TenantStatus | 租户状态 |

### 8.2 切换接口映射

| 场景 | 后端字段 | 前端字段 | 类型 |
|---|---|---|---|
| PATCH request | business_type | businessType（发送前转 snake_case） | BusinessType |
| PATCH response | active_business_type | activeBusinessType | BusinessType |

### 8.3 Header 映射

| HTTP Header | 前端来源 | 说明 |
|---|---|---|
| X-Session-ID | authStore.sessionId | 所有受保护请求必带 |
| X-Business-Type | authStore.user.activeBusinessType | 所有受保护请求必带 |

### 8.4 TypeScript DTO 定义建议

```ts
export interface LoginResponse {
  session_id: string
  expires_at: string
  user: {
    id: number
    name: string
    email: string
    role: 'owner' | 'manager' | 'staff' | 'doctor' | 'frontdesk'
    can_switch: boolean
    active_business_type: 'shop' | 'clinic'
  }
  tenant: {
    id: number
    name: string
    type: 'shop' | 'clinic' | 'both'
    status: 'active' | 'suspended'
  }
}

export interface SwitchBusinessRequest {
  business_type: 'shop' | 'clinic'
}

export interface SwitchBusinessResponse {
  active_business_type: 'shop' | 'clinic'
}
```

---

## 9. 前后端实现对齐要求

## 9.1 Backend 必须满足

- 所有响应字段使用 `snake_case`
- 所有错误响应至少返回 `error` 与 `message`
- Session 中间件必须统一处理 Header 校验
- 业务权限判断不得仅依赖前端，后端必须强校验
- Seed 数据幂等，可重复执行

## 9.2 Frontend 必须满足

- API client 自动注入 `X-Session-ID`、`X-Business-Type`
- Cookie 中仅存 `session_id`，用户与租户信息以 `/merchant/me` 或登录响应为准
- 路由守卫与接口权限判断双保险
- 不得硬编码 tenant 数据
- 所有 DTO 到 Store 的字段必须显式转换，不直接把 snake_case 对象写入 camelCase store

## 9.3 QA 重点校验

- 单边账号不可切换业务域
- 双边账号切换后 Sidebar、Header、请求 Header 同步更新
- Session 失效后所有受保护页面重新跳转 `/login`
- tenant 隔离不能被手工篡改 header/id 绕过

---

## 10. 推荐种子数据契约

```text
Tenant 1: Happy Paws (type=both, status=active)
  owner@happypaws.com / Test123!   -> role=owner,     can_switch=true,  active_business_type=shop
  shop@happypaws.com  / Test123!   -> role=staff,     can_switch=false, active_business_type=shop
  vet@happypaws.com   / Test123!   -> role=doctor,    can_switch=false, active_business_type=clinic

Tenant 2: Paws Clinic (type=clinic, status=active)
  admin@pawsclinic.com / Test123!  -> role=manager,   can_switch=false, active_business_type=clinic
```

---

## 11. Phase 1 交付清单

- [x] API 端点契约
- [x] 数据库 GORM 结构
- [x] 状态机定义
- [x] 前端组件树与路由
- [x] Zustand Store 结构
- [x] 前后端 JSON 字段映射表

本文件为 Phase 1 唯一技术契约基线：`docs/phase1_contract.md`

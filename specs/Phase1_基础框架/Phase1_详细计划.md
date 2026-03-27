# Phase 1：基础框架

> 目标：能登录、权限判断正确、看到空的 Dashboard 骨架
> 前置条件：无（第一个 Phase）

---

## 上线 Agent 一览

| Agent | 是否上线 | 说明 |
|-------|---------|------|
| 🏛 Architect | ✅ 上线 | 主导，定义数据模型和 API 契约 |
| 🖥 Frontend Dev | ✅ 上线 | 实现登录页 + Layout 骨架 |
| ⚙️ Backend Dev | ✅ 上线 | 实现 Auth + Session + 中间件 |
| 🔬 Test Engineer | ✅ 上线 | 权限隔离测试 + Phase 1 测试报告 |

---

## Agent 任务分配

---

### 🏛 Architect — 任务清单

> 职责：统筹全局，所有人动代码前必须先拿到 Architect 定义的契约文档

**任务 1：定义数据模型（输出：数据模型文档）**
- 定义 `tenants` 表结构（id, name, type, status）
- 定义 `merchant_users` 表结构（含 role, can_switch, active_business_type）
- 定义 `sessions` 表结构（含过期时间）
- 明确枚举值范围：role 可选值、business_type 可选值

**任务 2：定义 API 契约（输出：API 契约文档）**
- `POST /merchant/auth/login` 请求/响应 JSON 格式（含所有错误码）
- `GET /merchant/me` 响应格式
- `PATCH /merchant/me/switch` 请求/响应格式
- Session 中间件：Header 名称、过期规则、错误响应格式

**任务 3：定义前端全局状态结构（输出：类型定义文件）**
```typescript
// 输出给 Frontend Dev 使用
interface GlobalState {
  session_id: string
  user: { id, name, email, role, can_switch }
  active_business_type: "shop" | "clinic"
  tenant: { id, name, type }
}
```

**任务 4：Code Review**
- Backend Dev 完成后，审核 Session 中间件安全性
- Frontend Dev 完成后，审核路由守卫逻辑是否完整
- 确认两端 JSON 字段命名严格匹配（snake_case vs camelCase）

**交付物：** `Phase1_API契约.md`（由 Architect 写，其他 Agent 遵守）

---

### 🖥 Frontend Dev — 任务清单

> 前置：等待 Architect 交付 API 契约和全局状态类型定义

**任务 1：登录页 `/login`**
- PetWell Logo + "Merchant Portal" 副标题
- Email 输入框（格式校验）
- Password 输入框（show/hide toggle）
- 蓝色信息提示栏：「您的访问权限由账号级别决定」
- "Sign In" 按钮（含 loading 状态）
- 三种错误提示文案：密码错误 / 账号不存在 / 网络异常
- 调用 `POST /merchant/auth/login`，成功后存 session_id 到 Cookie

**任务 2：全局 Layout 组件**
- 左侧 Sidebar（240px 固定宽）
  - Logo + 品牌名
  - Context Switcher（仅 `can_switch=true` 渲染，默认隐藏）
    - Shop Tab：激活时蓝色 `#2563EB`
    - Clinic Tab：激活时青色 `#0891B2`
  - 导航菜单区（按 active_business_type 动态渲染）
  - 底部：用户头像 + 姓名 + 角色 badge + 登出按钮
- 顶部 TopBar（64px）
  - 当前页面标题（prop 传入）
  - App 同步状态 badge（绿色 ✓ 占位，Phase 4 真实化）
  - 通知铃铛按钮（占位）
- 主内容区：slot/children 容器，带 24px padding

**任务 3：路由守卫**
- 未登录访问 `/merchant/*` → 跳转 `/login`
- 已登录访问 `/login` → 跳转 `/merchant/dashboard`
- `can_switch=false` + `business_type=clinic` 访问 `/merchant/shop/*` → 403 页面
- 使用 Next.js middleware 实现（`middleware.ts`）

**任务 4：全局状态管理**
- 使用 Zustand 存储 GlobalState
- `useAuth()` hook：提供 session_id、user、active_business_type
- `useSwitchBusiness()` hook：调用 PATCH 接口，更新全局 active_business_type

**任务 5：Dashboard 骨架页（占位）**
- `/merchant/dashboard` 路由
- 显示骨架屏（灰色闪烁占位块）
- 顶部显示问候语：「Good morning, {user.name}」

**注意事项：**
- 所有 API 请求必须带 `X-Session-ID` Header
- 所有 API 请求必须带 `X-Business-Type: shop|clinic` Header（来自全局状态）
- 不得在前端硬编码任何租户数据

---

### ⚙️ Backend Dev — 任务清单

> 前置：等待 Architect 交付 API 契约和数据模型文档

**任务 1：数据库表（GORM AutoMigrate）**

```go
// internal/models/merchant.go

type Tenant struct {
    ID        uint      `gorm:"primaryKey"`
    Name      string
    Type      string    // "shop" | "clinic" | "both"
    Status    string    // "active" | "suspended"
    CreatedAt time.Time
}

type MerchantUser struct {
    ID                 uint   `gorm:"primaryKey"`
    TenantID           uint
    Email              string `gorm:"uniqueIndex"`
    PasswordHash       string
    Name               string
    Role               string // "owner"|"manager"|"staff"|"doctor"|"frontdesk"
    ActiveBusinessType string // "shop" | "clinic"
    CanSwitch          bool
    CreatedAt          time.Time
}

type MerchantSession struct {
    ID        string    `gorm:"primaryKey"` // UUID v4
    UserID    uint
    TenantID  uint
    ExpiresAt time.Time
    CreatedAt time.Time
}
```

**任务 2：POST `/merchant/auth/login`**
- bcrypt 密码验证
- 生成 UUID session_id，写入 sessions 表，过期时间 24h
- 响应包含：session_id, user{id,name,email,role,can_switch,active_business_type}, tenant{id,name,type}
- 错误码：`invalid_credentials`(401) / `account_suspended`(403)

**任务 3：GET `/merchant/me`**
- 读取 `X-Session-ID` Header
- 查 sessions 表，验证有效期
- 返回 user + tenant 信息
- Session 不存在或过期 → 401 `{ "error": "session_expired" }`

**任务 4：PATCH `/merchant/me/switch`**
- 验证 can_switch = true，否则 403
- 更新 merchant_users.active_business_type
- 返回 `{ "active_business_type": "clinic" }`

**任务 5：Session 中间件**
```go
// internal/middleware/merchant_auth.go
func MerchantAuthMiddleware(db *gorm.DB) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            sessionID := r.Header.Get("X-Session-ID")
            // 1. 查 session，验证过期
            // 2. 将 tenant_id、user_id、active_business_type 注入 context
            // 3. 无效 → 401
        })
    }
}
```

**任务 6：Seed 数据**
```go
// cmd/server/seed_merchant.go（幂等，可重复运行）
Tenant 1: Happy Paws (type=both)
  owner@happypaws.com / Test123!  → can_switch=true
  shop@happypaws.com  / Test123!  → can_switch=false, active_business_type=shop
  vet@happypaws.com   / Test123!  → can_switch=false, active_business_type=clinic

Tenant 2: Paws Clinic (type=clinic)
  admin@pawsclinic.com / Test123! → can_switch=false
```

**任务 7：注册路由**
```go
// cmd/server/main.go 新增
r.Post("/merchant/auth/login", NewMerchantLoginHandler(db))
r.Group(func(r chi.Router) {
    r.Use(MerchantAuthMiddleware(db))
    r.Get("/merchant/me", NewMerchantMeHandler(db))
    r.Patch("/merchant/me/switch", NewMerchantSwitchHandler(db))
})
```

---

### 🔬 Test Engineer — 任务清单

> 前置：Backend Dev 完成 Seed 数据写入后即可开始

**任务 1：编写测试用例（可参照下表执行）**

| TC ID | 用例描述 | 操作 | 预期结果 | 严重级别 |
|-------|---------|------|---------|---------|
| TC-1-01 | 单边 shop 账号正常登录 | POST /merchant/auth/login，shop@happypaws.com | 返回 session，can_switch=false | P0 |
| TC-1-02 | 双边 owner 账号正常登录 | POST /merchant/auth/login，owner@happypaws.com | 返回 session，can_switch=true | P0 |
| TC-1-03 | 双边账号切换视图 | PATCH /merchant/me/switch {business_type:clinic} | active_business_type=clinic，Sidebar 变青色 | P0 |
| TC-1-04 | 单边账号尝试切换 | shop 账号 PATCH /merchant/me/switch | 返回 403 | P0 |
| TC-1-05 | 错误密码登录 | 错误密码 POST login | 返回 401 invalid_credentials | P0 |
| TC-1-06 | 未登录访问 Dashboard | 无 session，GET /merchant/me | 返回 401 | P0 |
| TC-1-07 | 跨租户数据隔离 | tenant_a session 调用时手动传 tenant_b 的 ID | 返回 403 或空数据 | P0 |
| TC-1-08 | 单边账号访问另一侧路由 | shop 账号访问 /merchant/clinic/* | 403 页面 | P0 |
| TC-1-09 | Session 过期 | 手动删除 session 记录后请求 /merchant/me | 返回 401 session_expired | P1 |
| TC-1-10 | 前端路由守卫：未登录跳转 | 直接浏览器访问 /merchant/dashboard | 跳转到 /login | P0 |

**任务 2：执行测试并记录结果**
- 使用 curl / Postman 执行 API 层测试（TC-1-01 ~ TC-1-09）
- 使用浏览器手动执行前端测试（TC-1-10）
- 记录每条用例：实际结果 / 通过 or 失败

**任务 3：输出 Phase 1 测试报告**
- 文件：`测试报告/Phase1_测试报告.md`（使用统一模板）
- 包含：用例汇总、Bug 列表（含严重级别）、安全测试结果、结论
- **P0 用例 100% 通过方可签收**

---

## 验收标准（所有 Agent 需确认）

- [ ] Architect：API 契约文档已发布，两端字段命名一致
- [ ] Frontend：三种账号类型均可登录，Context Switcher 显示逻辑正确，路由守卫有效
- [ ] Backend：Session 中间件拦截有效，Seed 数据可重复运行
- [ ] QA：Phase 1 测试报告已输出，P0 用例 100% 通过，无未关闭的 P0 Bug
- [ ] **QA 签收后，方可启动 Phase 2**

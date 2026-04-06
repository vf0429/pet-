# PetWell Merchant Portal — Universal Leader Prompt

> **使用方法**：复制下方 `---` 之间的内容，粘贴到任何 AI Agent（Claude Code / OpenCode / GPT / Cursor）即可。
> 只需修改底部的 `[当前任务]` 部分。

---

## 你是谁

你是 PetWell 商家后台项目的 **Project Leader**。你负责理解项目全貌、规划任务、指挥开发，确保交付质量。

---

## 项目全貌

### 基本信息

| 项目 | 值 |
|------|-----|
| 项目路径 | `/Users/vfzzz/Desktop/petwell-merchant` |
| 前端 | Next.js 15 + React 19 + Zustand 5 + Tailwind 3（Portal 本地端口 3500） |
| 后端 | Go 1.22 + Gin 1.10 + GORM 1.25（端口 8080） |
| 数据库 | SQLite（petwell.db），GORM AutoMigrate |
| 认证 | Session-based，Header: `X-Session-ID` + `X-Business-Type` |
| 启动 | `./dev.sh` 同时启动前后端 |
| 测试账号 | owner@happypaws.com / Test123! |

### 架构概览

```
petwell-merchant/
├── backend/
│   ├── cmd/server/main.go          # 入口
│   ├── handlers/                    # HTTP handlers（按模块分文件）
│   ├── middleware/auth.go           # Session 鉴权中间件
│   ├── models/                      # GORM 模型 + 状态机
│   ├── routes.go                    # 路由注册
│   └── go.mod
├── frontend/
│   ├── app/
│   │   ├── login/page.tsx           # 登录页
│   │   └── merchant/
│   │       ├── layout.tsx           # 商家后台布局（Sidebar + TopBar）
│   │       ├── dashboard/page.tsx   # 通用 Dashboard
│   │       ├── shop/               # Shop 模块页面
│   │       │   ├── dashboard/
│   │       │   ├── orders/
│   │       │   ├── products/
│   │       │   └── schedule/
│   │       └── clinic/             # Clinic 模块页面（Phase 3+）
│   ├── components/
│   │   ├── Sidebar.tsx              # 侧边栏导航
│   │   ├── TopBar.tsx               # 顶部栏
│   │   ├── KPICard.tsx              # KPI 统计卡片
│   │   ├── StatusBadge.tsx          # 状态标签
│   │   └── OrderDetailDrawer.tsx    # 订单详情抽屉
│   ├── lib/api.ts                   # API 客户端（所有请求封装）
│   ├── store/
│   │   ├── auth.ts                  # 认证状态（useAuthStore）
│   │   └── shop.ts                  # Shop 业务状态
│   └── middleware.ts                # Next.js 路由守卫
├── docs/                            # 契约文档（每个 Phase 一份）
│   ├── phase1_contract.md           # Phase 1：认证 + 多租户 + Layout
│   ├── phase2_contract.md           # Phase 2：Shop Dashboard + 订单 + 商品
│   └── phase3_contract.md           # Phase 3：Clinic 全部功能
├── dev.sh                           # 一键启动脚本
└── LEADER_PROMPT.md                 # 本文件
```

### 多租户 & 认证机制

- 每个 Tenant 有 type：`shop` / `clinic` / `both`
- 用户通过 `X-Business-Type` header 切换业务上下文
- 所有数据查询必须 `WHERE tenant_id = ?`
- Session 24h 有效，存 SQLite

### 已完成 Phase 清单

| Phase | 内容 | 状态 | 契约 |
|-------|------|------|------|
| Phase 1 | 认证、多租户、Layout 骨架 | ✅ 完成 | docs/phase1_contract.md |
| Phase 2 | Shop Dashboard、订单管理、商品管理 | ✅ 完成 | docs/phase2_contract.md |
| Phase 3 | Clinic 后台（预约/就诊/回访/药房/保险） | 🔄 契约已出 | docs/phase3_contract.md |
| Phase 4 | App 联调（实时同步 + 端到端测试） | ⏳ 未开始 | — |
| Phase 5 | 数据分析（Analytics 可视化） | ⏳ 未开始 | — |

### 当前后端 API 路由

```
POST   /merchant/auth/login              # 登录
GET    /merchant/me                       # 获取当前用户
PATCH  /merchant/me/switch                # 切换业务类型

# Shop
GET    /merchant/shop/stats               # Shop 统计
GET    /merchant/shop/orders              # 订单列表
GET    /merchant/shop/orders/:id          # 订单详情
PATCH  /merchant/shop/orders/:id/status   # 订单状态变更
GET    /merchant/shop/products            # 商品列表
GET    /merchant/shop/inventory/alerts    # 低库存预警
```

### 代码规范

| 规范 | 值 |
|------|-----|
| 后端 JSON 命名 | `snake_case` |
| 前端 TS/Zustand | `camelCase` |
| API Base Path | `/merchant` |
| 响应格式 | `{ "code": 0, "data": {}, "message": "ok" }` |
| 时间格式 | ISO 8601 / RFC3339 |
| 金额 | HKD, float64 |
| 分页 | `page`（从1）, `per_page`（默认20, 最大100） |

### 需求文档位置

完整的分阶段设计方案在：
```
/Users/vfzzz/Desktop/PetWell 商家后台设计方案/
├── Phase1_基础框架/
├── Phase2_Shop后台/
├── Phase3_Clinic后台/Phase3_详细计划.md
├── Phase4_App联调/
├── Phase5_数据分析/
└── README.md
```

---

## 你的工作流程

### 0. 启动前检查（必须执行）
1. **必须启用 Planning with Files 工作流**
   - 在项目根目录先创建/更新：
     - `task_plan.md`
     - `findings.md`
     - `progress.md`
   - 任务拆解、关键发现、报错、阶段结果都必须持续写入这 3 个文件
   - 每完成一个子阶段（如契约、后端、前端、QA）后立即更新一次
   - 如果中断恢复，必须先读取这 3 个文件再继续执行
2. **启动 Agent Team 前先确认环境变量已导出到当前 shell**
   - 不要假设项目根目录 `.env` 会被 OpenClaw / OpenCode 自动加载
   - 启动前应显式执行：
```bash
set -a
source /Users/vfzzz/Desktop/petwell-merchant/.env
set +a
```
3. 如果某个 provider 无法调用，先检查：
   - API key 是否已导出到当前进程环境
   - Agent 使用的 provider/model 是否与团队分工一致
   - 是否已有中断记录写入 `progress.md` / `findings.md`

### 第一步：理解任务
1. 阅读下方 `[当前任务]` 了解本次目标
2. 阅读对应 Phase 的需求文档和契约文档
3. 如果没有契约文档，先生成一份（参考已有契约格式）

### 第二步：规划
1. 拆分为 **后端任务** 和 **前端任务**
2. 确定依赖关系和执行顺序
3. 后端通常先行（前端依赖 API）

### 第三步：执行
按顺序实现：
1. **数据库模型** → 2. **Seed 数据** → 3. **API Handlers** → 4. **路由注册** → 5. **前端页面** → 6. **Store 封装** → 7. **侧边栏导航更新**
2. 每完成一个步骤或发生一次关键错误，必须把结果写入 `progress.md`
3. 每出现新的接口/状态机/环境配置发现，必须写入 `findings.md`
4. 阶段状态变化（pending / in_progress / complete / blocked）必须同步到 `task_plan.md`

### 第四步：验证
1. 后端：curl 测试每个 API
2. 前端：每个页面能访问、数据加载正常
3. 状态机流转正确
4. 多租户隔离有效

---

## 关键原则

1. **契约优先**：字段名、错误码、状态枚举以契约文档为准
2. **参考已有代码**：新模块的代码风格必须与已有模块一致
   - 后端参考：`backend/handlers/shop_*.go`、`backend/models/shop_*.go`
   - 前端参考：`frontend/app/merchant/shop/`、`frontend/store/shop.ts`
3. **不破坏已有功能**：不修改已完成 Phase 的代码（除非修 bug）
4. **Mock 数据标记**：任何硬编码/mock 数据在前端必须显示醒目的 `MOCK` 标签（amber 色）
5. **多租户隔离**：所有 DB 查询必须 `WHERE tenant_id = ?`
6. **所有新接口**必须挂在 `MerchantAuthMiddleware` 之后

---

## [当前任务]

<!-- ========== 每次使用时只需修改这部分 ========== -->

**Phase**: 4A — Vaccination App 联调重规划 / OpenCode Kickoff

**目标**: 冻结当前 Phase 3 基线，围绕 Vaccination 重新定义 App ↔ Merchant 接入方式，并把任务正式派发给 OpenCode。

**核心方向**:
- 仅聚焦 Vaccination，不扩散到其他 Merchant 功能实现
- 不再把 App 直接连接 Merchant Portal 端口视为目标方案
- 采用类似 Supabase 的接入模型：`Merchant Project URL + Merchant Public/App Key`
- App 首期连接 `Merchant Service Facade`，Portal 3500 仅作为商家 Web 入口

**必须先阅读**:
1. `task_plan.md`
2. `findings.md`
3. `progress.md`
4. `docs/phase4_briefing.md`
5. `docs/phase4_opencode_handoff.md`
6. `/Users/vfzzz/Desktop/PetWell_Project/apps/PetWell/Views/Medical/VaccineBookingView.swift`
7. `/Users/vfzzz/Desktop/petwell-merchant/dev.sh`
8. `/Users/vfzzz/Desktop/petwell-merchant/frontend/next.config.js`

**具体任务**:
1. PM / Architect：审计 Vaccination 旧链路，输出 revised integration plan 与 facade contract draft
2. Backend / Integration：设计 Merchant Service Facade、`clinic_integration_id` 映射、Merchant 落库路径
3. Frontend / App-facing：明确 App 未来只使用 project URL/key，不直接持有 Portal session/端口逻辑
4. QA / Documentation：产出 App↔Merchant integration guide，列出其他 future functions 的标准接入模板
5. 全体要求：严格使用 `task_plan.md` / `findings.md` / `progress.md` 作为 Planning with Files 工作记忆

**验收标准**:
- [ ] OpenCode 收到完整 handoff brief，且 task scope 仅为 Vaccination
- [ ] revised integration plan 明确区分 Portal URL、Merchant backend/internal API、App-facing facade URL
- [ ] facade contract draft 明确 `Merchant Project URL + Merchant Public/App Key` 模式
- [ ] 文档明确记录当前旧链路（App 直连 Merchant）与目标链路（App → facade）
- [ ] 产出一份其他 App functions 未来接 Merchant 的标准文档
- [ ] 中断后可通过 Planning with Files 无缝续跑

<!-- ========== 修改示例 ========== -->
<!--
Phase 4 示例：
**Phase**: 4 — App 联调
**目标**: 实现 sync_queue 消费、WebSocket 推送、端到端测试
**契约文档**: docs/phase4_contract.md（如不存在，先生成）
**需求文档**: /Users/vfzzz/Desktop/PetWell 商家后台设计方案/Phase4_App联调/
**具体任务**: ...
**验收标准**: ...

Phase 5 示例：
**Phase**: 5 — 数据分析
**目标**: 营收报表、趋势图表、导出功能
...

自定义任务示例：
**Phase**: N/A — Bug 修复
**目标**: 修复 Orders 页面分页不正确的问题
**具体任务**: 检查后端分页逻辑 + 前端分页组件
...
-->

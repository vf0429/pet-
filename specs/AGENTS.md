# PetWell 商家后台 — Agent 团队完整指南

## 整体架构

```
设计文档目录：/Users/vfzzz/Desktop/PetWell 商家后台设计方案/
代码输出目录：/Users/vfzzz/Desktop/petwell-merchant/
```

**分支策略（累积式）：**
```
main (空基础)
 └─ phase-1   (仅 Phase 1)
     └─ phase-2   (Phase 1 + 2)
         └─ phase-3   (Phase 1 + 2 + 3)
             └─ phase-4   (Phase 1 ~ 4，MVP 完成)
                 └─ phase-5   (全量，含分析看板)
```

---

## 模型能力排序与分工原则

> **codex > kimi > minimax**（由难到易，按任务复杂度分配）

| Agent | 模型 | 职责 | 为什么用这个模型 |
|-------|------|------|----------------|
| `petwell-pm` | **codex** | 系统架构、API 契约、状态机设计 | 最复杂，需要全局视野和精确推理 |
| `petwell-backend` | **kimi** | Go 代码、GORM、业务逻辑、状态机实现 | 需要深度代码理解和复杂逻辑推导 |
| `petwell-qa` | **kimi** | Playwright E2E 测试、多租户隔离测试 | 测试设计需要理解安全边界和业务语义 |
| `petwell-frontend` | **minimax** | Next.js 页面、Zustand、TailwindCSS | 前端相对结构化，快速生成能力为主 |

---

## 各 Phase 分工详情

### Phase 1 — 基础框架（认证 + 多租户 + Layout）

| 角色 | Agent | 模型 | 核心任务 |
|------|-------|------|---------|
| 🏛 Architect（主导） | `petwell-pm` | codex | 定义 tenants/users/sessions 表、Auth API 契约、全局 TS 类型 |
| ⚙️ Backend | `petwell-backend` | kimi | Login/Me/Switch API、Session 中间件、RBAC 权限校验 |
| 🖥 Frontend | `petwell-frontend` | minimax | 登录页、全局 Layout、Sidebar、路由守卫 |
| 🔬 QA（主导） | `petwell-qa` | kimi | 跨租户隔离测试（P0）、权限拦截测试、Session 过期测试 |

### Phase 2 — Shop 后台

| 角色 | Agent | 模型 | 核心任务 |
|------|-------|------|---------|
| 🏛 Architect（轻量） | `petwell-pm` | codex | 订单状态机矩阵、app_sync_queue 规范 |
| ⚙️ Backend | `petwell-backend` | kimi | 订单CRUD+状态流转、商品库存、sync_queue 事务写入 |
| 🖥 Frontend | `petwell-frontend` | minimax | Shop Dashboard、订单列表+详情抽屉、商品管理 |
| 🔬 QA | `petwell-qa` | kimi | 订单全生命周期测试、非法流转拦截测试、库存告警测试 |

### Phase 3 — Clinic 后台

| 角色 | Agent | 模型 | 核心任务 |
|------|-------|------|---------|
| 🏛 Architect（轻量） | `petwell-pm` | codex | 就诊状态机、处方管理规范、iOS payload 对齐 |
| ⚙️ Backend | `petwell-backend` | kimi | 预约/就诊/处方/随访/药房 全套 API，文件上传 |
| 🖥 Frontend | `petwell-frontend` | minimax | Clinic Dashboard、就诊5Tab流程、药房库存、随访跟踪 |
| 🔬 QA | `petwell-qa` | kimi | 就诊流程 E2E、处方开药测试、文件上传测试、保险理赔测试 |

### Phase 4 — App 联调（最复杂）

| 角色 | Agent | 模型 | 核心任务 |
|------|-------|------|---------|
| 🏛 Architect（主导） | `petwell-pm` | codex | 端到端数据流时序图、幂等键规范、Supabase 迁移方案 |
| ⚙️ Backend | `petwell-backend` | kimi | sync_queue 消费 cron（30s）、幂等键中间件、死信队列 |
| 🖥 Frontend | `petwell-frontend` | minimax | 轮询机制、全局 Toast 通知系统、同步状态卡片真实化 |
| 🔬 QA（主力） | `petwell-qa` | kimi | 端到端同步测试、网络断连恢复测试、幂等性验证、50 VU 压测 |

### Phase 5 — 数据分析（可选）

| 角色 | Agent | 模型 | 核心任务 |
|------|-------|------|---------|
| 🏛 Architect（极轻量） | `petwell-pm` | codex | 仅做聚合查询性能风险审核 |
| ⚙️ Backend | `petwell-backend` | kimi | Shop+Clinic 聚合 API、Redis 缓存（TTL 5min） |
| 🖥 Frontend | `petwell-frontend` | minimax | Recharts 图表页（销售趋势、诊断分布、医生工作量） |
| 🔬 QA | `petwell-qa` | kimi | 数据准确性验证、图表渲染测试 |

---

## 执行流程（每个 Phase）

```
1. Architect 读需求文档 → 输出 docs/phase{N}_contract.md
                ↓
2. Backend 读契约 → 写 Go 代码到 backend/
                ↓
3. Frontend 读契约 → 写 Next.js 代码到 frontend/
                ↓
4. QA 读契约 + 测试用例 → 写 Playwright 测试到 tests/phase{N}/
                ↓
5. 自动运行 Playwright（Chromium 无头浏览器）
                ↓
    ✅ 全部通过 → git commit → push 到 phase-{N} 分支
    ❌ 有失败  → 阻断推送 → 修复 → 重新跑
```

---

## 一键执行

```bash
# 配置 GitHub 远端（只需一次）
echo 'GITHUB_REMOTE=https://github.com/你的用户名/petwell-merchant.git' \
  >> "/Users/vfzzz/Desktop/PetWell 商家后台设计方案/.env"

# 执行各 Phase（按顺序）
cd "/Users/vfzzz/Desktop/PetWell 商家后台设计方案"
./run_phase.sh 1   # 完成后自动推送到 branch: phase-1
./run_phase.sh 2   # 完成后自动推送到 branch: phase-2（含 Phase 1）
./run_phase.sh 3
./run_phase.sh 4   # Phase 4 完成 = MVP 交付
./run_phase.sh 5   # 可选：数据分析看板
```

---

## 手动调用单个 Agent（OpenCode 交互模式）

```bash
cd "/Users/vfzzz/Desktop/PetWell 商家后台设计方案"
set -a
source "/Users/vfzzz/Desktop/petwell-merchant/.env"
set +a
opencode   # 进入 TUI

# 然后在 OpenCode 内：
/agent petwell-pm       # 召唤架构师
/agent petwell-backend  # 召唤后端工程师
/agent petwell-frontend # 召唤前端工程师
/agent petwell-qa       # 召唤测试工程师
```

---

## 代码仓库结构

```
petwell-merchant/
├── backend/
│   ├── models/       # GORM 模型（所有表含 tenant_id）
│   ├── handlers/     # API 处理函数
│   ├── middleware/   # Session 鉴权 + 租户隔离
│   └── tests/        # Go 单元测试
├── frontend/
│   ├── app/          # Next.js 15 App Router 页面
│   ├── components/   # TailwindCSS 组件
│   ├── store/        # Zustand stores
│   └── lib/          # API 客户端（api.ts）
├── docs/             # Architect 输出的契约文档
├── tests/            # Playwright E2E 测试
│   ├── phase1/
│   ├── phase2/
│   └── ...
├── playwright.config.ts
└── test-results/     # 测试结果（不提交 git）
```

---

## Git 分支验收标准

| 分支 | 内容 | 推送条件 |
|------|------|---------|
| `phase-1` | Auth + Layout | Playwright P0 全绿 + 跨租户隔离通过 |
| `phase-2` | P1 + Shop | 订单全生命周期测试 + 状态机测试全绿 |
| `phase-3` | P1+P2 + Clinic | 就诊流程 E2E + 处方测试全绿 |
| `phase-4` | P1~P3 + Sync | 端到端同步测试 + 50VU 压测无 5xx |
| `phase-5` | 全量 + Analytics | 图表渲染测试 + 数据准确性验证 |

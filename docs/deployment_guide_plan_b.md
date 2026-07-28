# PetWell Merchant Portal — 部署执行手册（Plan B / 2026-04-19）

> **用途**：这是按当前仓库状态裁剪后的可执行版本，用于把 `apps/petwell-merchant` 部署成一个可用于三端联调的 **R2 Merchant 服务**。
>
> **当前目标**：先完成 **Horizon 1 / integration-ready**，即把共享 R2 服务部署出来，打通 `R3 -> R1 -> R2 -> R1 -> R3` 的真实线上链路；**不是**一次性完成三档租户隔离的正式商用版。
>
> **推荐拓扑**：Supabase（PostgreSQL） + Fly.io（Go backend） + Vercel（Next.js frontend）
>
> **最后更新**：2026-04-19

---

## 0. 先看结论

### 当前仓库里已经完成的内容
以下部署前代码准备 **已经落地**，不要重复做：

- `backend/cmd/server/main.go`
  - 已支持 `PORT`
  - 已启用 `CORSMiddleware()`
- `backend/middleware/cors.go`
- `backend/Dockerfile`
- `backend/fly.toml`
- `frontend/next.config.js`
  - 已支持 `BACKEND_URL`

### 这份手册真正要你做的事
1. 选择并确认部署分支
2. 创建 Supabase 项目
3. 用 Fly.io 部署 `backend/`
4. 用 Vercel 部署 `frontend/`
5. 配置域名 / HTTPS
6. **把 R1 指向新部署的 R2**
7. 跑一次真实链路验证

### 本轮不是硬前置的内容
以下内容 **不是当前三端联调的 blocker**，可以后补：

- Supabase Realtime 前端订阅接入
- 商用级三档租户隔离完整落地
- 所有生产数据初始化自动化

### 一页版执行 Checklist

> 下面这份是最短可执行版。  
> 如果你只想照着做，不想来回看全文，就直接按这个顺序打勾。

#### A. 部署前
- [ ] 我当前在 `phase-6` 分支
- [ ] `git status --short` 没有会误带进部署的临时改动
- [ ] backend 已跑过：
  - [ ] `go test ./...`
  - [ ] `go build ./...`
- [ ] frontend 已跑过：
  - [ ] `npm install`
  - [ ] `npm run build`

#### B. Supabase
- [ ] 已创建新加坡区域的 Supabase 项目
- [ ] 已保存数据库密码
- [ ] 已拿到 `DATABASE_URL`

#### C. Fly.io backend
- [ ] 已登录 Fly.io
- [ ] 已创建或确认应用 `petwell-merchant-api`
- [ ] 已设置 `DATABASE_URL`
- [ ] 已设置 `ALLOWED_ORIGINS`
- [ ] 如果这轮先追求联调速度：已设置 `ALLOW_DEMO_SEED=true`
- [ ] 已执行 `fly deploy`
- [ ] `fly status` 正常
- [ ] `fly logs` 没有启动致命错误
- [ ] `https://petwell-merchant-api.fly.dev/v1/merchant/auth/login` 能返回路由存在的响应（如 405）
- [ ] Supabase 里已经出现核心表

#### D. Vercel frontend
- [ ] 已导入 `frontend` 子目录
- [ ] 已设置 `BACKEND_URL`
- [ ] 已完成 Deploy
- [ ] 能打开 `/login`

#### E. 域名
- [ ] 已绑定 `merchant.petwell.com`
- [ ] 已绑定 `api.petwell.com`
- [ ] 域名切换后已同步更新：
  - [ ] Fly 的 `ALLOWED_ORIGINS`
  - [ ] Vercel 的 `BACKEND_URL`

#### F. R1 对接
- [ ] 已在 R1 配置 `MERCHANT_FACADE_BASE_URL`
- [ ] 已在 R1 配置 `MERCHANT_FACADE_APP_KEY`
- [ ] 如需要，已配置 `BOOKING_SYNC_SHARED_SECRET`

#### G. 真链路验证
- [ ] create booking 成功
- [ ] list booking 成功
- [ ] detail booking 成功
- [ ] cancel booking 成功
- [ ] 至少完成一次 `R3 -> R1 -> R2 -> R1 -> R3` 闭环验证

#### H. 收尾
- [ ] 如果现在还是 demo seed / demo key，已记录后续替换计划
- [ ] 已确认这次结果属于 **integration-ready**，不是最终商用完成态

---

## 1. 适用范围与边界

### 本文档适用于
- 当前仓库：`/Users/vfzzz/Desktop/PetWell_Project/apps/petwell-merchant`
- 当前主执行分支：`phase-6`
- 当前联调目标：**共享 R2 服务上线**

### 本文档不负责
- R1 Zeabur 实际发布操作细节
- 三档隔离（shared table / per-schema / per-db）正式商用编排
- Realtime 页面级功能全面接入

---

## 2. 部署前检查

### 2.1 确认分支与代码状态

```bash
cd /Users/vfzzz/Desktop/PetWell_Project/apps/petwell-merchant

git branch --show-current
# 期望看到：phase-6

git status --short
# 确认没有会误带进部署的临时改动
```

### 2.2 本地最小验证

```bash
# backend
cd /Users/vfzzz/Desktop/PetWell_Project/apps/petwell-merchant/backend
go test ./...
go build ./...

# frontend
cd /Users/vfzzz/Desktop/PetWell_Project/apps/petwell-merchant/frontend
npm install
npm run build
```

> 说明：`next lint` 当前不是硬前置，因为该项目可能出现交互式初始化提示。

### 2.3 需要的账号
- Supabase
- Fly.io
- Vercel
- GitHub

### 2.4 建议的部署结果
- 前端：`https://merchant.petwell.com`
- 后端：`https://api.petwell.com`
- Fly 默认后端域名（过渡期可用）：`https://petwell-merchant-api.fly.dev`

---

## 3. 第一步：创建 Supabase 项目

### 3.1 创建项目
1. 打开 <https://app.supabase.com>
2. 点击 **New Project**
3. 填写：
   - **Project name**: `petwell-merchant`
   - **Region**: `Southeast Asia (Singapore)`
   - **Database password**: 用密码管理器生成并保存
4. 等待项目初始化完成

### 3.2 记录数据库连接串
在 **Project Settings -> Database** 找到连接信息，拼成：

```text
postgresql://postgres:<PASSWORD>@db.xxxxx.supabase.co:5432/postgres
```

后面会作为 Fly secret 的 `DATABASE_URL`。

### 3.3 当前建议
**本轮先把 Supabase 当作 PostgreSQL 使用即可。**
Realtime、Storage、Auth 都不是这次三端联调闭环的硬前置。

---

## 4. 第二步：决定“首轮数据初始化”方式

当前后端在 **hosted database** 上默认 **不会自动 seed demo 数据**。

代码逻辑是：
- `DATABASE_URL` 为空：本地 SQLite，会自动 seed
- `DATABASE_URL` 有值：托管 PostgreSQL，默认 **不 seed**
- 只有设置 `ALLOW_DEMO_SEED=true` 时，托管 PostgreSQL 才会 seed

### 4.1 你有两个选择

#### 方案 A：联调最快路径（推荐用于当前 integration-ready）
首次部署时临时设置：

```text
ALLOW_DEMO_SEED=true
```

作用：
- 自动建表
- 自动写入 Happy Paws HK 相关 demo 数据
- 能最快把 R2 跑起来做三端联调

风险：
- 会带入 demo key / demo tenant 思路
- **不适合作为正式商用长期状态**

#### 方案 B：正式初始化路径（更干净，但更慢）
- 不开 `ALLOW_DEMO_SEED`
- 由你手动准备 tenant / project / app key / clinic binding / schedule 数据

如果你当前目标是：
> 先让 merchant 端上线并配合三端联调

**建议先走方案 A**，等链路闭环后再清理成正式 bootstrap 数据。

---

## 5. 第三步：Fly.io 部署后端

### 5.1 登录 Fly

```bash
brew install flyctl
fly auth login
```

### 5.2 创建应用

```bash
cd /Users/vfzzz/Desktop/PetWell_Project/apps/petwell-merchant/backend
fly apps create petwell-merchant-api --org personal
fly regions set sin
```

> 如果 app 已存在，就跳过 `fly apps create`。

### 5.3 设置 Secrets

#### 最小必填

```bash
fly secrets set DATABASE_URL="postgresql://postgres:<PASSWORD>@db.xxxxx.supabase.co:5432/postgres"
fly secrets set ALLOWED_ORIGINS="https://merchant.petwell.com,https://petwell-merchant.vercel.app"
```

#### 如果走“联调最快路径”

```bash
fly secrets set ALLOW_DEMO_SEED="true"
```

#### 如果你已经准备好正式 tenant / app key 数据
则不要设置 `ALLOW_DEMO_SEED`，或者显式关闭：

```bash
fly secrets set ALLOW_DEMO_SEED="false"
```

### 5.4 部署后端

```bash
cd /Users/vfzzz/Desktop/PetWell_Project/apps/petwell-merchant/backend
fly deploy
```

### 5.5 部署后检查

```bash
fly status
fly logs
```

### 5.6 后端健康确认
直接访问或 curl：

```bash
curl -i https://petwell-merchant-api.fly.dev/v1/merchant/auth/login
```

预期：
- 返回 `405 Method Not Allowed` 或类似“路径存在但方法不对”的响应
- 这说明服务已起来，路由也在

### 5.7 确认 Supabase 已建表
打开 Supabase Dashboard -> Table Editor，确认至少已经出现这些表：

- `tenants`
- `merchant_projects`
- `merchant_app_keys`
- `clinic_integration_bindings`
- `clinic_appointments`
- `app_sync_queues`

如果一个都没有：
- 先看 `fly logs`
- 再看 `DATABASE_URL` 是否配置错误

---

## 6. 第四步：Vercel 部署前端

### 6.1 导入项目
1. 打开 <https://vercel.com>
2. **Add New Project**
3. 导入当前仓库
4. 关键配置：
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`

### 6.2 设置环境变量
至少配置：

| Key | Value |
|---|---|
| `BACKEND_URL` | `https://petwell-merchant-api.fly.dev` |

> 如果你已经绑定了自定义后端域名，则直接用 `https://api.petwell.com`。

### 6.3 部署
点击 **Deploy**。

### 6.4 前端验证
部署完成后访问：

```text
https://petwell-merchant.vercel.app/login
```

如果你之后绑定了自定义域名，再改用：

```text
https://merchant.petwell.com/login
```

---

## 7. 第五步：绑定域名与 HTTPS

### 7.1 前端域名
在 Vercel 里绑定：

```text
merchant.petwell.com
```

DNS：

```text
merchant.petwell.com -> cname.vercel-dns.com
```

### 7.2 后端域名
在 Fly.io 里绑定：

```bash
fly certs create api.petwell.com
```

DNS：

```text
api.petwell.com -> petwell-merchant-api.fly.dev
```

### 7.3 域名切换后同步更新

#### Fly secret

```bash
fly secrets set ALLOWED_ORIGINS="https://merchant.petwell.com"
```

#### Vercel env

```text
BACKEND_URL=https://api.petwell.com
```

重新部署前端一次，确保 rewrites 指向正式后端域名。

---

## 8. 第六步：补 R2 的 bootstrap 数据

这一部分决定 R1 能不能真正打到 R2。

### 8.1 当前三端联调至少需要的记录
你最终至少需要有以下实体：

1. `tenant`
2. `merchant_project`
3. `merchant_app_key`
4. `clinic_integration_binding`
5. 足够的 clinic / schedule / booking 测试数据

### 8.2 当前联调约定（已知）
当前联调文档与测试里已经出现过这些值：

- `project_code = happypaws-hk`
- `clinic_integration_id = clinic_happypaws_hk`
- demo app key：`pk_app_test_secret_key_dev`

### 8.3 强约束
- **如果只是当前集成验证**：可以短期用 demo seed 快速起服务
- **如果进入正式外部可用环境**：不要长期保留 demo key；必须换成新的 production app key

---

## 9. 第七步：把 R1 接到新部署的 R2

> 这是当前旧版部署文档最缺的一步，但对三端联调是关键步骤。

R2 部署完之后，还必须配置 R1（`Petwell_Backend`）的环境变量。

### 9.1 R1 必填 env

```text
MERCHANT_FACADE_BASE_URL=https://api.petwell.com
MERCHANT_FACADE_APP_KEY=<你的 R2 app key>
```

### 9.2 可选 env

```text
BOOKING_SYNC_SHARED_SECRET=<shared secret>
```

### 9.3 如果暂时还没上自定义域名
那就先用 Fly 默认域名：

```text
MERCHANT_FACADE_BASE_URL=https://petwell-merchant-api.fly.dev
```

### 9.4 R1 侧验证目标
部署后，R1 不应再表现成“merchant 未配置”。

至少要做到：
- `POST /api/bookings` 不再因为 merchant base URL / app key 缺失而失败
- R1 可以真实请求到 R2 app-facing facade

---

## 10. 第八步：跑真实链路验证

### 10.1 最小通过标准
按顺序验证：

1. **R2 backend 在线**
2. **R2 frontend 在线**
3. **R1 能访问 R2 facade**
4. **create booking 成功**
5. **list / detail 成功**
6. **cancel 成功**

### 10.2 你真正关心的闭环
目标不是“merchant 页面能打开”而已，而是：

```text
R3 App -> R1 -> R2 -> R1 -> R3
```

只要这条链里任意一段没通，就不能算三端联调完成。

### 10.3 推荐验证顺序

#### A. 先验证 R2 自己活着
- Fly logs 正常
- `/v1/merchant/auth/login` 路由存在

#### B. 再验证 R1 -> R2
- 给 R1 配好 `MERCHANT_FACADE_BASE_URL`
- 给 R1 配好 `MERCHANT_FACADE_APP_KEY`
- 从 R1 跑 booking create/read/cancel

#### C. 最后验证 App 侧
- App 发 booking
- R1 落镜像/回读
- 状态能正常返回给 R3

---

## 11. Realtime：当前处理原则

Supabase Realtime 在这次部署里：

- **不是必须先做**
- 可以在 R2 基础部署完成后再补

只有当你明确要做“merchant portal 多角色实时刷新”时，再继续接：

- `@supabase/supabase-js`
- `useRealtimeSync`
- Supabase publication / replication 配置

当前这部分不要阻塞三端联调主线。

---

## 12. 推荐执行顺序（直接照着做）

```text
1. 确认当前部署分支是 phase-6
2. 本地跑 go test ./... / go build ./... / npm run build
3. 新建 Supabase 新加坡项目
4. 记录 DATABASE_URL
5. Fly 上设置 DATABASE_URL + ALLOWED_ORIGINS
6. 当前联调若求快：临时加 ALLOW_DEMO_SEED=true
7. fly deploy
8. 确认 Fly 服务在线 + Supabase 已建表
9. Vercel 导入 frontend 子目录，设置 BACKEND_URL
10. 部署前端
11. 绑定 merchant.petwell.com / api.petwell.com
12. 更新 Fly 的 ALLOWED_ORIGINS 与 Vercel 的 BACKEND_URL
13. 去 R1 配 MERCHANT_FACADE_BASE_URL / MERCHANT_FACADE_APP_KEY
14. 跑 create / list / detail / cancel 真链路验证
15. 验证通过后，再决定是否去掉 demo seed、换正式 app key、补 Realtime
```

---

## 13. 完成定义

满足以下条件，才算这轮部署完成：

- [ ] R2 backend 已部署并可访问
- [ ] R2 frontend 已部署并可访问
- [ ] Supabase 已连通且表已建立
- [ ] R1 已成功指向新 R2
- [ ] 真实 booking create 成功
- [ ] 真实 booking list/detail 成功
- [ ] 真实 booking cancel 成功
- [ ] 至少完成一次 `R3 -> R1 -> R2 -> R1 -> R3` 闭环验证

---

## 14. 当前已知风险

1. **demo seed 风险**
   - `ALLOW_DEMO_SEED=true` 适合联调提速，不适合长期正式环境
2. **R1 配置遗漏风险**
   - 只部署 R2 不改 R1，三端链路不会自动闭环
3. **clinic integration binding 风险**
   - 当前联调仍依赖 `clinic_happypaws_hk` 这类 integration id 对齐
4. **Realtime 误判风险**
   - 不要把“Realtime 还没接”误认为“Merchant 还不能部署”

---

## 15. 一句话版本

> 这份手册的正确执行方式是：
> **先把共享 R2 服务部署起来，再把 R1 指过去，最后跑真实 booking 闭环。**
> 当前不要让 Realtime 和三档隔离设计阻塞这条主线。

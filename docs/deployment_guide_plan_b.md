# PetWell Merchant Portal — 部署指南（方案 B）

> **架构**: Supabase（PostgreSQL + Realtime）+ Fly.io（Go 后端）+ Vercel（Next.js 前端）
>
> **目标月费**: $5~30 USD
>
> **预计部署时间**: 2~3 小时（首次）
>
> **最后更新**: 2026-03-29

---

## 目录

1. [架构总览](#1-架构总览)
2. [准备工作](#2-准备工作)
3. [第一步：Supabase 数据库](#3-第一步supabase-数据库)
4. [第二步：代码改动（部署前必须完成）](#4-第二步代码改动部署前必须完成)
5. [第三步：Fly.io 部署后端](#5-第三步flyio-部署后端)
6. [第四步：Vercel 部署前端](#6-第四步vercel-部署前端)
7. [第五步：域名与 HTTPS](#7-第五步域名与-https)
8. [第六步：Supabase Realtime 集成](#8-第六步supabase-realtime-集成)
9. [环境变量汇总](#9-环境变量汇总)
10. [测试清单](#10-测试清单)
11. [日常运维](#11-日常运维)
12. [故障排查](#12-故障排查)
13. [成本明细](#13-成本明细)
14. [扩容路径](#14-扩容路径)

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        互 联 网                                   │
│                                                                   │
│  医生电脑 ───┐    Owner 电脑 ───┐    前台电脑 ───┐                │
│              ▼                  ▼                ▼                │
│         ┌─────────────────────────────────────────┐              │
│         │          Vercel (Next.js 前端)           │              │
│         │   https://merchant.petwell.com           │              │
│         │   全球 CDN, 自动 HTTPS, 零运维            │              │
│         └────────────────┬────────────────────────┘              │
│                          │  API 请求（Next.js Rewrites 代理）      │
│                          ▼                                        │
│         ┌─────────────────────────────────────────┐              │
│         │         Fly.io (Go 后端)                 │              │
│         │   petwell-api.fly.dev (新加坡节点)        │              │
│         │   自动 HTTPS, 容器化, 自动重启             │              │
│         └────────────────┬────────────────────────┘              │
│                          │  DATABASE_URL                          │
│                          ▼                                        │
│         ┌─────────────────────────────────────────┐              │
│         │       Supabase (新加坡 Region)            │              │
│         │                                          │              │
│         │   PostgreSQL ─── 主数据库                  │              │
│         │   Realtime ───── 多角色实时同步            │              │
│         │   Storage ────── 病例附件/X光片            │              │
│         │   自动备份 ────── 每日 Point-in-Time       │              │
│         └──────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

### 数据流向

```
前台点击"签到"
    │
    ▼
Vercel (Next.js) ──POST──▶ Fly.io (Go API)
                                │
                                ├──▶ Supabase PostgreSQL  (写入 status = checked_in)
                                │
                                └──▶ Supabase Realtime     (自动广播变更)
                                          │
                                          ├──▶ 医生浏览器  (实时收到更新, 无需刷新)
                                          └──▶ Owner 浏览器 (实时收到更新, 无需刷新)
```

---

## 2. 准备工作

### 2.1 需要注册的账号

| 平台 | 地址 | 用途 | 是否需要信用卡 |
|------|------|------|:------------:|
| **Supabase** | https://supabase.com | 数据库 + 实时同步 | 免费层不需要 |
| **Fly.io** | https://fly.io | Go 后端托管 | 需要（验证用，有免费额度） |
| **Vercel** | https://vercel.com | Next.js 前端托管 | 免费层不需要 |
| **GitHub** | https://github.com | 代码仓库（三个平台都从这里自动部署） | 不需要 |

### 2.2 本地工具

```bash
# 确认已安装
go version          # 需要 1.22+
node --version      # 需要 18+
npm --version       # 需要 9+
git --version       # 任意版本

# 需要新装的 CLI
# Fly.io CLI
brew install flyctl
fly auth login

# Vercel CLI (可选, 也可以在网页操作)
npm i -g vercel

# Supabase CLI (可选, 也可以在网页操作)
brew install supabase/tap/supabase
```

### 2.3 代码仓库

确保项目已推送到 GitHub：

```bash
cd /Users/vfzzz/Desktop/petwell-merchant
git remote -v   # 确认有 GitHub remote
git push origin main
```

---

## 3. 第一步：Supabase 数据库

### 3.1 创建项目

1. 登录 https://app.supabase.com
2. 点击 **New Project**
3. 填写：
   - **Name**: `petwell-merchant`
   - **Database Password**: 记下来，后面要用（建议用密码管理器生成强密码）
   - **Region**: `Southeast Asia (Singapore)` ← **必须选新加坡，离香港最近**
   - **Plan**: Free（后续可升级）
4. 等待项目初始化（约 2 分钟）

### 3.2 获取连接信息

项目创建完成后，进入 **Project Settings → Database**：

```
# 你会看到类似这样的连接信息：
Host:     db.xxxxxxxxxxxx.supabase.co
Port:     5432
Database: postgres
User:     postgres
Password: [你刚才设的密码]
```

拼接成 `DATABASE_URL`：

```
postgresql://postgres:[你的密码]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

> **安全提示**: 这个 URL 包含数据库密码，绝对不要提交到 Git。只通过环境变量传递。

### 3.3 确认连接

在本地验证能否连通（可选）：

```bash
# 临时测试
DATABASE_URL="postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres" \
  cd backend && go run cmd/server/main.go

# 日志应该显示：
# Using PostgreSQL database
# Server starting on :8080
```

看到 `Using PostgreSQL database` 即表示连接成功。此时 GORM 的 `AutoMigrate` 会自动建表。

### 3.4 开启 Realtime

1. 进入 Supabase Dashboard → **Database → Replication**
2. 在 `supabase_realtime` 这一行点击编辑
3. 勾选以下表：
   - `clinic_appointments`
   - `clinic_visits`
4. 保存

这样当这些表的数据变化时，Supabase 会自动向所有订阅的前端推送变更。

### 3.5 获取 Realtime 凭证

进入 **Project Settings → API**，记录：

```
Project URL:    https://xxxxxxxxxxxx.supabase.co
anon (public) key: eyJhbGciOiJIUzI1NiIs...（很长的字符串）
```

这两个值后续前端要用，用于订阅 Realtime 变更。

---

## 4. 第二步：代码改动（部署前必须完成）

### 4.1 后端：端口从环境变量读取

**文件**: `backend/cmd/server/main.go`

找到：
```go
log.Println("Server starting on :8080")
jobs.StartSyncConsumer(db, 30*time.Second)
if err := r.Run(":8080"); err != nil {
    log.Fatal("Failed to start server:", err)
}
```

改为：
```go
port := os.Getenv("PORT")
if port == "" {
    port = "8080"
}
log.Printf("Server starting on :%s", port)
jobs.StartSyncConsumer(db, 30*time.Second)
if err := r.Run(":" + port); err != nil {
    log.Fatal("Failed to start server:", err)
}
```

### 4.2 后端：添加 CORS 中间件

**新建文件**: `backend/middleware/cors.go`

```go
package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSMiddleware handles Cross-Origin Resource Sharing for production deployments
// where frontend and backend are on different domains.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// In production, validate against allowed origins
		allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
		if allowedOrigins == "" {
			// Development fallback
			allowedOrigins = "http://localhost:3500,http://localhost:3000"
		}

		allowed := false
		for _, o := range strings.Split(allowedOrigins, ",") {
			if strings.TrimSpace(o) == origin {
				allowed = true
				break
			}
		}

		if allowed {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, X-Session-ID, X-Business-Type, X-Merchant-App-Key, Idempotency-Key")
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
```

**在 `main.go` 中启用**：

```go
r := gin.Default()
r.Use(middleware.CORSMiddleware())  // ← 加在所有路由之前
```

### 4.3 后端：创建 Dockerfile

**新建文件**: `backend/Dockerfile`

```dockerfile
# ── Build stage ──
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server/main.go

# ── Run stage ──
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/server .

# Fly.io will set PORT via environment variable
ENV PORT=8080
EXPOSE 8080

CMD ["./server"]
```

### 4.4 后端：创建 fly.toml

**新建文件**: `backend/fly.toml`

```toml
app = "petwell-merchant-api"
primary_region = "sin"  # Singapore

[build]
  dockerfile = "Dockerfile"

[env]
  GIN_MODE = "release"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false   # 诊所需要全天可用, 不要自动停机
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 100
    soft_limit = 80

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

### 4.5 前端：API 代理地址改成环境变量

**文件**: `frontend/next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080'
    return [
      {
        source: '/api/v1/merchant/:path*',
        destination: `${backendUrl}/v1/merchant/:path*`,
      },
      {
        source: '/api/app/v1/:path*',
        destination: `${backendUrl}/app/v1/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
```

### 4.6 前端：安装 Supabase 客户端

```bash
cd frontend
npm install @supabase/supabase-js
```

### 4.7 前端：创建 Supabase 实时同步客户端

**新建文件**: `frontend/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// 这个客户端只用于 Realtime 订阅，不用于数据读写
// 所有数据读写仍然走 Go 后端 API
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null
```

**新建文件**: `frontend/hooks/useRealtimeSync.ts`

```typescript
'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * 订阅 Supabase Realtime 数据库变更，自动触发回调刷新数据。
 *
 * 使用方式：
 *   useRealtimeSync('clinic_appointments', () => { fetchAppointments() })
 *   useRealtimeSync('clinic_visits', () => { fetchVisit(visitId) })
 */
export function useRealtimeSync(
  table: string,
  onDataChange: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!supabase || !enabled) return

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        {
          event: '*',        // INSERT, UPDATE, DELETE 都监听
          schema: 'public',
          table: table,
        },
        (_payload) => {
          // 数据库有变化 → 重新拉取数据
          onDataChange()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, onDataChange, enabled])
}
```

### 4.8 前端：在预约列表页集成实时同步

**文件**: `frontend/app/merchant/clinic/appointments/page.tsx`

在组件内加上一行：

```typescript
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

export default function AppointmentsPage() {
  // ... 现有代码 ...

  const { fetchAppointments } = useClinicAppointmentsStore()

  // 当其他角色修改了预约状态，自动刷新列表
  useRealtimeSync('clinic_appointments', fetchAppointments)

  // ... 其他现有代码 ...
}
```

### 4.9 创建环境变量模板

**新建文件**: `.env.example`

```bash
# ──────────────────────────────────────
# PetWell Merchant Portal — 环境变量模板
# ──────────────────────────────────────

# ── 后端 (Go / Fly.io) ──
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
PORT=8080
GIN_MODE=release
ALLOWED_ORIGINS=https://merchant.petwell.com

# ── 前端 (Next.js / Vercel) ──
BACKEND_URL=https://petwell-merchant-api.fly.dev
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 4.10 更新 .gitignore

确保敏感文件不会被提交：

```gitignore
# Environment variables (NEVER commit)
.env
.env.local
.env.production

# SQLite dev database
backend/petwell.db

# Build artifacts
frontend/.next/
backend/server
```

---

## 5. 第三步：Fly.io 部署后端

### 5.1 初始化 Fly.io 应用

```bash
cd backend

# 登录 (首次)
fly auth login

# 创建应用 (fly.toml 已准备好)
fly apps create petwell-merchant-api --org personal

# 选择新加坡区域
fly regions set sin
```

### 5.2 设置环境变量（Secrets）

```bash
# 数据库连接（从 Supabase 获取的 DATABASE_URL）
fly secrets set DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# 前端域名（CORS 白名单）
fly secrets set ALLOWED_ORIGINS="https://merchant.petwell.com,https://petwell-merchant.vercel.app"
```

> **重要**：Secrets 通过 Fly.io 加密存储，不会暴露在日志或代码中。

### 5.3 部署

```bash
cd backend
fly deploy
```

首次部署大约需要 3~5 分钟。完成后：

```bash
# 确认运行状态
fly status

# 查看日志
fly logs

# 打开浏览器验证
# 访问 https://petwell-merchant-api.fly.dev/v1/merchant/auth/login
# 应该返回 405 (Method Not Allowed) — 说明后端已在运行
```

### 5.4 确认数据库迁移

首次启动时，GORM 的 `AutoMigrate` 会自动在 Supabase PostgreSQL 中建表。

验证方式：
1. 回到 Supabase Dashboard → **Table Editor**
2. 应该能看到所有表（`tenants`, `merchant_users`, `clinic_appointments`, 等）
3. 同时会有种子数据（测试账号、预约等）

---

## 6. 第四步：Vercel 部署前端

### 6.1 连接 GitHub 仓库

1. 登录 https://vercel.com
2. 点击 **Add New Project**
3. 从 GitHub 导入 `petwell-merchant` 仓库
4. 配置：
   - **Framework Preset**: Next.js（自动识别）
   - **Root Directory**: `frontend`  ← **重要！项目前端在子目录**
   - **Build Command**: `npm run build`（默认）
   - **Output Directory**: `.next`（默认）

### 6.2 设置环境变量

在 Vercel 项目的 **Settings → Environment Variables** 中添加：

| Key | Value | Environment |
|-----|-------|-------------|
| `BACKEND_URL` | `https://petwell-merchant-api.fly.dev` | Production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Production |

> **注意**: `NEXT_PUBLIC_` 前缀的变量会暴露给浏览器，这是正常的。
> Supabase anon key 本身就是设计为公开的，安全性通过 Row Level Security (RLS) 保证。

### 6.3 部署

点击 **Deploy**。Vercel 会自动：

1. 安装依赖（`npm install`）
2. 构建项目（`npm run build`）
3. 部署到全球 CDN
4. 自动分配 HTTPS 域名：`petwell-merchant.vercel.app`

### 6.4 验证

访问 `https://petwell-merchant.vercel.app/login`，应该能看到登录页面。

用测试账号登录：
- Email: `owner@happypaws.com`
- Password: `Test123!`

---

## 7. 第五步：域名与 HTTPS

### 7.1 自定义域名（可选，建议）

如果你有自己的域名（比如 `petwell.com`），可以配置：

**前端域名**：`merchant.petwell.com`

1. 在 Vercel → Settings → Domains → 添加 `merchant.petwell.com`
2. 在你的域名 DNS 服务商添加 CNAME 记录：
   ```
   merchant.petwell.com → cname.vercel-dns.com
   ```
3. Vercel 自动签发 SSL 证书

**后端域名**：`api.petwell.com`

1. 在 Fly.io：
   ```bash
   fly certs create api.petwell.com
   ```
2. 在 DNS 添加 CNAME：
   ```
   api.petwell.com → petwell-merchant-api.fly.dev
   ```
3. Fly.io 自动签发 SSL

### 7.2 配置自定义域名后更新环境变量

**Fly.io Secrets**:
```bash
fly secrets set ALLOWED_ORIGINS="https://merchant.petwell.com"
```

**Vercel Environment Variables**:
```
BACKEND_URL = https://api.petwell.com
```

---

## 8. 第六步：Supabase Realtime 集成

### 8.1 工作原理

```
Go 后端写入 PostgreSQL
        │
        ▼
Supabase 检测到 clinic_appointments 表的 UPDATE
        │
        ▼
Supabase Realtime 通过 WebSocket 推送到所有订阅的浏览器
        │
        ▼
前端 useRealtimeSync hook 收到通知 → 自动调用 fetchAppointments()
        │
        ▼
医生/前台/Owner 的页面自动刷新，无需手动操作
```

### 8.2 Supabase 端配置

需要确保 Realtime 能读取你的表数据。进入 Supabase Dashboard：

1. **Database → Replication**：确认 `clinic_appointments` 和 `clinic_visits` 已开启
2. **Authentication → Policies**：因为我们只用 Realtime 订阅（不通过 Supabase 读写数据），需要添加一个允许 anon 用户监听的策略。进入 **SQL Editor**，执行：

```sql
-- 允许 Realtime 订阅（只监听变更通知，不暴露数据内容）
-- 实际的数据读取仍然走 Go 后端 API（有完整的角色权限控制）
ALTER PUBLICATION supabase_realtime ADD TABLE clinic_appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE clinic_visits;
```

### 8.3 前端已完成的集成

在第 4.7 ~ 4.8 步中已经创建了 `useRealtimeSync` hook。只需要在需要实时更新的页面调用即可。

**目前建议集成的页面**：

| 页面 | 监听的表 | 效果 |
|------|---------|------|
| 预约列表 | `clinic_appointments` | 前台签到 → 医生自动看到 |
| Visit 详情 | `clinic_visits` | 医生写病例 → Owner 自动看到 |
| Clinic Dashboard | `clinic_appointments` | 统计数据实时更新 |

---

## 9. 环境变量汇总

### Fly.io (Go 后端) — 通过 `fly secrets set`

| 变量 | 值 | 必填 |
|------|---|:---:|
| `DATABASE_URL` | `postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres` | 是 |
| `PORT` | `8080`（Fly.io 自动设置） | 自动 |
| `GIN_MODE` | `release`（fly.toml 已设置） | 自动 |
| `ALLOWED_ORIGINS` | `https://merchant.petwell.com` | 是 |

### Vercel (Next.js 前端) — 通过 Vercel Dashboard

| 变量 | 值 | 必填 |
|------|---|:---:|
| `BACKEND_URL` | `https://petwell-merchant-api.fly.dev` | 是 |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | 是 |

### 本地开发 — `.env.local`

```bash
# 本地开发时无需设置这些，保持默认值即可：
# DATABASE_URL 为空 → 自动使用 SQLite
# BACKEND_URL 为空 → 自动使用 localhost:8080
# NEXT_PUBLIC_SUPABASE_URL 为空 → 自动禁用 Realtime

# 如果想本地连 Supabase 测试：
# DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
# NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 10. 测试清单

### 部署后必须验证的项目

```
一、基础连通性
□ 前端页面能打开（Vercel 域名）
□ 登录能成功（owner@happypaws.com / Test123!）
□ 登录后能看到 Dashboard 数据
□ 切换 Shop / Clinic 模式正常

二、多角色流程
□ 用 Chrome Profile A 登录 Owner
□ 用 Chrome Profile B 登录 Doctor（doctor1@clinic1.test / Clinic123!）
□ 用 Chrome Profile C 登录 Frontdesk（frontdesk@clinic1.test / Clinic123!）

三、签到→就诊→结案闭环
□ Frontdesk 签到 → Doctor 页面自动刷新看到 checked_in（Realtime）
□ Doctor 开始就诊 → Visit 自动创建，跳转到详情页
□ Doctor 点"直接结案" → Visit 变 closed + Appointment 变 completed
□ Frontdesk 和 Owner 页面自动看到 completed

四、权限验证
□ Frontdesk 尝试"开始就诊" → 返回 403
□ Doctor 尝试"签到" → 返回 403
□ Owner 能执行所有操作

五、数据持久化
□ 关闭浏览器重新打开 → 数据还在
□ Fly.io 重启后 → 数据还在（数据在 Supabase，不在 Fly.io 容器里）
```

---

## 11. 日常运维

### 11.1 日常部署（代码更新）

```bash
# 后端更新
cd backend
git push origin main   # GitHub 不会自动部署到 Fly.io
fly deploy             # 手动部署（或配置 GitHub Actions 自动部署）

# 前端更新
git push origin main   # Vercel 自动部署（默认 main 分支推送即触发）
```

### 11.2 配置 Fly.io 自动部署（可选）

**新建文件**: `.github/workflows/deploy-backend.yml`

```yaml
name: Deploy Backend to Fly.io
on:
  push:
    branches: [main]
    paths: ['backend/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: cd backend && flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

获取 FLY_API_TOKEN：
```bash
fly tokens create deploy -x 999999h
# 将输出的 token 添加到 GitHub → Settings → Secrets → FLY_API_TOKEN
```

### 11.3 数据库备份

**Supabase 免费层**：自动每日备份，保留 7 天。

**手动备份**（建议每周一次）：

```bash
# 从 Supabase Dashboard → Settings → Database → Connection string 获取地址
pg_dump "postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres" \
  --format=custom \
  --file=backup_$(date +%Y%m%d).dump
```

### 11.4 监控

**Fly.io**：
```bash
fly logs           # 实时日志
fly status         # 应用状态
fly dashboard      # 打开 Web 监控面板
```

**Supabase**：Dashboard → Reports → Database Health

**Vercel**：Dashboard → Deployments → 查看每次部署状态

---

## 12. 故障排查

### 问题：前端能打开但 API 请求 504 / 502

```bash
# 检查后端是否在运行
fly status
fly logs --app petwell-merchant-api

# 常见原因：
# 1. DATABASE_URL 配错 → 后端启动失败
# 2. Fly.io 机器被自动停了 → 检查 fly.toml 的 auto_stop_machines = false
```

### 问题：登录成功但页面数据为空

```bash
# 检查 Supabase 是否有数据
# 进入 Supabase Dashboard → Table Editor → tenants
# 如果是空的，说明种子数据没有运行
# 解决：重新部署后端（首次启动会自动 seed）
fly deploy
```

### 问题：Realtime 不工作（修改后其他角色不会自动刷新）

```
1. 检查 Vercel 环境变量 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY 是否设置
2. 检查 Supabase Replication 是否开启了对应的表
3. 打开浏览器 DevTools → Console，看是否有 WebSocket 连接错误
4. 打开 DevTools → Network → WS，确认有到 supabase.co 的 WebSocket 连接
```

### 问题：CORS 报错（浏览器 Console 显示 Access-Control-Allow-Origin）

```bash
# 检查 ALLOWED_ORIGINS 是否包含了前端域名
fly secrets list
# 应该包含：ALLOWED_ORIGINS=https://merchant.petwell.com

# 确保包含完整的协议 (https://) 且没有尾部斜杠
```

---

## 13. 成本明细

### 免费层（0~3 家诊所测试期）

| 服务 | 免费额度 | 费用 |
|------|---------|:----:|
| Supabase | 500MB 数据库, 5GB 带宽, 1GB 存储 | $0 |
| Fly.io | 3 台 shared-cpu-1x VM, 160GB 出站 | $0* |
| Vercel | 100GB 带宽, 无限部署 | $0 |
| **合计** | | **$0/月** |

> *Fly.io 免费额度需要绑定信用卡才能使用

### 正式运营（3~20 家诊所）

| 服务 | 配置 | 费用 |
|------|------|:----:|
| Supabase Pro | 8GB 数据库, 250GB 带宽, 100GB 存储 | $25/月 |
| Fly.io | 1x shared-cpu-1x 256MB（全天运行） | $5/月 |
| Vercel | Hobby plan（免费） | $0/月 |
| **合计** | | **$30/月** |

### 规模增长（20~100 家诊所）

| 服务 | 配置 | 费用 |
|------|------|:----:|
| Supabase Pro | 同上，但存储和带宽会增长 | $25~50/月 |
| Fly.io | 2x shared-cpu-1x 512MB（高可用） | $15/月 |
| Vercel Pro | 自定义域名, 更多带宽 | $20/月 |
| **合计** | | **$60~85/月** |

---

## 14. 扩容路径

```
现在（测试）         →  6个月后（正式）           →  1年后（规模化）

SQLite 本地          →  Supabase Free             →  Supabase Pro
localhost            →  Fly.io 1台 (新加坡)       →  Fly.io 2台 (高可用)
本地浏览器           →  Vercel Hobby              →  Vercel Pro
无 Realtime          →  Supabase Realtime         →  同
无域名               →  自定义域名 + HTTPS        →  同
无监控               →  Fly.io Dashboard          →  Sentry + Datadog
```

当需要更高的可用性（SLA 99.9%+）或更复杂的需求（多区域部署、读写分离）时，可以从方案 B 平滑迁移到方案 C（AWS/GCP），因为：

- Go 后端已容器化（Dockerfile），直接部署到 ECS / Cloud Run
- PostgreSQL 迁移到 RDS / Cloud SQL，Supabase 支持导出
- Next.js 部署到 CloudFront + S3 或继续用 Vercel

**不需要重写代码，只需要改部署配置。**

---

## 附录：操作顺序总结

```
第一次部署，按这个顺序执行：

 1. [注册] Supabase / Fly.io / Vercel 账号
 2. [Supabase] 创建项目 → 选新加坡 → 记录 DATABASE_URL
 3. [代码] 完成第 4 步所有代码改动 → git push
 4. [Fly.io] fly apps create → fly secrets set → fly deploy
 5. [验证] 访问 fly.dev 地址确认后端运行
 6. [Supabase] 确认表已自动创建 → 开启 Realtime
 7. [Vercel] 导入项目 → 设环境变量 → Deploy
 8. [验证] 访问 vercel.app 地址 → 登录 → 走一遍完整流程
 9. [域名] （可选）配置自定义域名
10. [测试] 按第 10 节的测试清单逐项验证
```

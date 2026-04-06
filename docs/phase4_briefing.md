# Phase 4A OpenCode Handoff Briefing

> 本文档是当前 Phase 3 branch 的冻结基线说明，供 OpenCode 在此基础上继续推进 Vaccination 联调重规划。
> 代码根目录：`/Users/vfzzz/Desktop/petwell-merchant`

---

## 当前目标

本轮不是继续实现旧的 Phase 4 sync_queue / toast / realtime 方向，而是先完成 **Vaccination 联调重规划**，并明确 App 与 Merchant 的真实连接方式。

### 首期范围
- 只聚焦 **Vaccination**
- 只做 **规划 / 契约 / handoff / documentation**
- 不在本轮要求直接完成 App 或 Merchant 代码实现

### 已确认的方向
- Merchant Portal 本地 Web 入口现在是 **3500**
- Merchant backend/internal API 本地仍是 **8080**
- App 不应把 `localhost:3500` 或其他本地端口视为真实产品接入方式
- App 未来应改为类似 Supabase 的接入模型：
  - `Merchant Project URL`
  - `Merchant Public/App Key`
- Vaccination 首期连接路径固定为：
  - `App -> Merchant Service Facade -> Merchant Backend/Storage -> Merchant Portal UI`

---

## 当前现状（必须承认，不可跳过）

### App 现有旧链路
在 `/Users/vfzzz/Desktop/PetWell_Project/apps/PetWell/Views/Medical/VaccineBookingView.swift` 中，Vaccination 仍保留旧桥接方案：
- 直接连 `http://localhost:8090`
- 直接调用：
  - `POST /api/merchant/auth/login`
  - `GET /api/merchant/appointments`
  - `POST /api/merchant/appointments`
- 直接使用 merchant 测试账号与 `X-Session-ID`

### Merchant 当前本地开发形态
- `dev.sh`：前端 3500，后端 8080
- `frontend/next.config.js`：`/api/merchant/*` rewrite 到 `http://localhost:8080/merchant/*`

结论：
- 3500 是 **Portal Web URL**，不是 App 真实 API 入口
- 当前 App 旧链路与新 Merchant 结构已经脱节

---

## OpenCode 必须完成的交付物

### 1. Vaccination revised integration plan
要回答清楚：
- 当前旧链路是什么
- 为什么不能继续使用 App 直连 Portal/端口
- 为什么选择 Merchant Service Facade
- facade 首期如何只覆盖 Vaccination

### 2. facade contract draft
至少定义：
- `Merchant Project URL`
- `Merchant Public/App Key`
- `clinic_integration_id`
- vaccination availability / create booking / get booking status 的最小接口草案
- 幂等键与外部 booking ID 方案

### 3. Merchant 落库 / Portal 可见性说明
明确：
- facade 创建的 booking 如何落到当前 Merchant 数据模型
- Portal 如何看到这条 booking
- 哪些点需要桥接或兼容旧数据

### 4. App↔Merchant integration guide
必须额外产出一份文档，服务未来其他功能接入。至少覆盖：
- 当前 inventory（谁直连，谁不直连）
- 标准接入模式
- 标识符要求
- 鉴权模式
- 本地调试规则
- 迁移规则

---

## 执行要求

1. **必须启用 Planning with Files**
   - 先读取并持续更新：
     - `task_plan.md`
     - `findings.md`
     - `progress.md`
2. **不得继续沿用“App 直接连 Portal 端口”作为目标设计**
3. **不得把 3500 当成 App 正式 API contract 的一部分**
4. **不得跳过现状审计，直接画最终图**
5. **本轮主要产出文档/规划，不强求立即写业务代码**

---

## 建议分工

- `petwell-pm`：主导现状审计、revised plan、facade contract
- `petwell-backend`：Merchant Service Facade、映射模型、落库路径建议
- `petwell-frontend`：App-facing config model（project URL/key）与未来调用边界
- `petwell-qa`：integration guide 与 future functions checklist

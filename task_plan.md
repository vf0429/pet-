# Phase 3 Freeze + OpenCode Kickoff Plan

## Goal
- [x] 保留当前 Phase 3 branch 上已存在的 Phase 4 探索资产
- [x] 把当前任务重定向为 Vaccination 联调重规划
- [x] 为 OpenCode 准备可直接执行的 handoff brief
- [ ] 提交并推送当前基线到 `phase-3`
- [ ] 基于该基线启动 OpenCode

## Phases
1. [completed] 审计当前 App 与 Merchant 的真实连接方式
2. [completed] 确认 Merchant Portal 本地端口与 backend/internal API 分层
3. [completed] 决定首期架构：`Merchant Project URL + Merchant Public/App Key + Merchant Service Facade`
4. [completed] 生成 OpenCode briefing / handoff / prompt 基线
5. [in_progress] 整理 git 基线并推送到 `phase-3`
6. [pending] 启动 OpenCode，分派 PM / Backend / Frontend / QA 任务

## OpenCode deliverables
- Vaccination revised integration plan
- Merchant Service Facade contract draft
- Merchant persistence + Portal visibility note
- App↔Merchant integration guide for future functions

## Constraints
- 只聚焦 Vaccination
- 不把 `localhost:3500` 当成 App 产品级 API 入口
- 不继续沿用 App 直接登录 Merchant / `X-Session-ID` 的旧方案
- 全程必须使用 Planning with Files

## Risks
- 当前仓库内仍保留旧 Phase 4 sync/realtime 方向文档，OpenCode 必须以新的 briefing/handoff 为准，避免误入旧任务。
- 推送前需要排除本地构建产物与敏感文件（如 `frontend/tsconfig.tsbuildinfo`、`specs/.env.keys`）。

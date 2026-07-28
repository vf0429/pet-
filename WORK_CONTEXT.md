# WORK_CONTEXT — petwell-merchant

**TASK_ID:** TASK-20260406-2223
**更新时间:** 2026-04-06 22:23
**完整记录:** [→ 根目录 master_progress.md](../../master_progress.md)

## 当前任务
规划 Pawrd Merchant 板块品牌更名，并设计统一 `.command` 启动方式与新的 Swift 医生端目录。

## 状态速览
- ✅ 已完成：扫描目录结构、启动脚本、rename 命中分布
- ✅ 已完成：新增 merchant / merchant mobile `.command` 启动入口
- ✅ 已完成：创建 `apps/swift code/merchant-mobile` 初始骨架
- ✅ 已完成：backend module / imports / 本地 DB 更名为 Pawrd 标识
- ✅ 已完成：Merchant Mobile Xcode 工程创建并本地构建通过
- 🔄 进行中：继续推进移动端真实业务接线
- ⏳ 待处理：评估是否连根目录 `petwell-merchant/` 一起重命名

## 本次涉及的关键文件
- `.codex-work/task_plan.md` — 本地任务规划
- `.codex-work/findings.md` — 风险与范围发现
- `.codex-work/progress.md` — 会话进度
- `../launch_merchant.command` — Web 端启动入口
- `../launch_merchant_mobile.command` — 医生端入口
- `backend/go.mod` — 已切换为 `pawrd-merchant-backend`
- `backend/cmd/server/main.go` — 本地数据库改为 `pawrd.db`
- `../swift code/merchant-mobile/App/` — SwiftUI App 骨架
- `../swift code/merchant-mobile/PawrdMerchantMobile.xcodeproj` — 可打开/可构建的 iOS 工程
- `WORK_CONTEXT.md` — 子 repo 快照

## 注意事项
- `petwell` 命中包含工程标识、历史文档和部署域名，不能直接全量替换。

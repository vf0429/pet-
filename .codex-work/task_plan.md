# Task Plan

## Task ID
TASK-20260406-2223

## Goal
为 `petwell-merchant` 板块制定一份安全的改造计划：
1. 将当前 merchant 板块中需要对外展示或长期保留的 `petwell/PetWell/Petwell` 品牌标识逐步迁移为 `Pawrd`
2. 统一通过 `.command` 文件启动对应开发环境
3. 在 `apps/` 下新增一个 `swift code/` 目录，承载 merchant 手机端 Swift 代码，方便医生随时处理排班等事务
4. 明确方案 4（同步下单 + 异步状态回传）在多仓联调下的实施计划，并预留各仓库 GitHub 路径

## Scope
- `apps/petwell-merchant/` 目录本体
- `apps/` 下现有启动脚本（如 `launch_petwell.command`）
- 新增 `apps/swift code/`（待创建）
- 与 merchant 直接相关的文档、脚本、前后端项目标识

## Non-Goals
- 本轮先不直接改生产域名、线上部署资源名、第三方集成名
- 本轮先不把医生移动端并入现有 `apps/PetWell/` 主 App
- 本轮先不做无边界的全仓库全文替换

## Phases
- [x] 1. 盘点当前 merchant 结构、启动方式与 planning 上下文
- [x] 2. 统计 `petwell/PetWell/Petwell` 命中位置并识别高风险区域
- [ ] 3. 确定重命名边界（品牌文案 / repo 名 / package 名 / Go module / DB 文件 / 历史文档）
- [ ] 4. 设计 command 启动统一方案（merchant web、merchant mobile、现有 iOS）
- [ ] 5. 设计 `apps/swift code/` 的目录结构、工程命名与与 merchant backend 的联动方式
- [x] 6. 制定实施顺序、回滚策略与验收清单
- [x] 7. 第二阶段工程标识改名（backend module / imports / local db）
- [x] 8. 为 `swift code/merchant-mobile/` 补充可开发的 SwiftUI 代码骨架
- [x] 9. 创建可打开、可本地构建的 `PawrdMerchantMobile.xcodeproj`
- [x] 10. 输出方案 2 / 方案 4 正式架构对比文档
- [x] 11. 输出方案 4 的三端/多仓联调计划模板（含 GitHub 路径占位）

## Proposed Workstreams

### A. 品牌改名（petwell → Pawrd）
- UI 文案 / 页面标题 / README / Prompt / docs 标题
- package name / binary name / Go module / 本地 DB 文件名
- 目录名 `petwell-merchant/` 是否一起迁移，需要单独评估
- 历史 planning/log 文档建议只做必要说明，不全量改旧记录

### B. 启动方式统一
- 保留“一个入口一个 `.command` 文件”原则
- 优先新增：
  - `launch_merchant.command`：启动 merchant web（必要时前后端一起）
  - `launch_merchant_mobile.command`：启动新 Swift merchant app
- 现有 `launch_petwell.command` 保持兼容，但后续可评估更名

### C. 新 Swift 手机端
- 目录：`apps/swift code/`
- 建议子目录：
  - `merchant-mobile/`：SwiftUI app
  - `docs/`：接口、页面、路由说明
  - `scripts/`：启动/构建辅助脚本
- 第一阶段先实现骨架：登录、今日排班、待处理预约、快捷入口
- 当前已落地基础 SwiftUI 文件：
  - `App/PawrdMerchantMobileApp.swift`
  - `App/RootView.swift`
  - `App/MainTabView.swift`
  - `Features/LoginView.swift`
  - `Features/TodayScheduleView.swift`
  - `Features/AppointmentsView.swift`
  - `Features/QuickActionsView.swift`
  - `Services/MerchantAppState.swift`
  - `Models/MerchantModels.swift`
- 当前已落地工程文件：
  - `PawrdMerchantMobile.xcodeproj/project.pbxproj`
  - `PawrdMerchantMobile.xcodeproj/xcshareddata/xcschemes/PawrdMerchantMobile.xcscheme`

## Initial Decisions
- 改名分两层做：先改“品牌显示层”，再评估“工程标识层”
- 启动脚本要放在 `apps/` 根目录，便于双击使用
- 新医生端作为独立 Swift 工程更稳妥，不直接塞进现有 `PetWell` 消费者 App

## Risks
- Go module / import path 批量替换容易导致编译错误
- 历史文档与日志大量包含 `PetWell`，不宜全量重写
- 目录名含空格（`swift code`）对脚本、CLI、Xcode path 有一定风险，但可通过引用路径规避
- Swift 代码骨架目前还不是完整 Xcode 工程，后续仍需补 `Package.swift` 或 `.xcodeproj`

## Open Questions
- `petwell-merchant/` 目录本身是否本轮就改名？
- 是否要继续把根目录 `petwell-merchant/` 也重命名为 `pawrd-merchant/`？
- 是否要为移动端直接生成 `.xcodeproj` / `.xcworkspace`？
- 用户侧后端最终推送到哪个 GitHub 仓库？
- 用户侧前端/客户端最终推送到哪个 GitHub 仓库？
- Merchant Mobile 是否独立仓库，还是并入现有某个仓库管理？

## Errors
- 暂无

# Findings

## Session focus
- 当前新任务不是继续 i18n，而是为 `petwell-merchant` 制定品牌改名 + 启动脚本统一 + 新 Swift 医生端目录的执行计划。
- 本次先做 planning 与边界识别，未开始批量修改代码。

## Current repo shape
- `petwell-merchant/` 是一个混合仓：
  - `frontend/`：Next.js 15 + React 19
  - `backend/`：Go + GORM + SQLite
  - `.codex-work/`：已有本地 planning 文档
- 当前已有启动脚本 `apps/launch_petwell.command` 与 `apps/launch_petwell.sh`，主要服务 `apps/PetWell/` iOS 工程，不是 merchant 专用。

## Rename scan findings
- `rg` 扫描显示 `petwell/PetWell/Petwell` 命中很多，主要分成 6 类：
  1. **工程标识**：`package.json`、`package-lock.json`、`backend/go.mod`
  2. **Go import path**：`petwell-merchant-backend/...`
  3. **本地资源名**：`backend/petwell.db`
  4. **品牌文案**：`LEADER_PROMPT.md`、`specs/README.md`、部署文档标题
  5. **历史记录/日志/规划**：`progress.md`、`findings.md`、phase prompt/log
  6. **域名/API 占位**：`merchant.petwell.com`、`petwell-merchant-api.fly.dev`、`cdn.petwell.test`
- 结论：**不能直接全量无脑替换**，至少要分“显示文案 / 工程标识 / 外部依赖 / 历史归档”四层处理。

## Rename risk map
- 低风险：
  - 页面标题、按钮文案、README/PRD 标题、command 文件名
- 中风险：
  - `package.json` name、数据库文件名、脚本 echo 文案
- 高风险：
  - `backend/go.mod` module 名
  - 所有 Go import path
  - 部署域名、API base URL、历史 phase prompt 中的绝对路径

## Startup findings
- `launch_petwell.command` 已是成熟模板：
  - 固定 `apps` 根目录
  - 指向 `PetWell/Pawrd.xcworkspace`
  - 自动打开 Simulator、build、install、launch
- 可以复用其结构为 merchant 新增 `.command`，但需要根据目标类型拆分：
  - Web 项目：更适合开 Terminal 并运行 `npm run dev` / `go run`
  - Swift app：继续沿用 xcodebuild + simctl 模式

## Merchant mobile direction
- 用户明确要求在 `apps/` 下新增 `swift code/` 文件夹，作为 merchant 手机端代码区。
- 从需求描述看，这不是面向宠物主的主 App，而是医生/诊所员工使用的工作 App。
- 适合做成独立 SwiftUI 工程，优先能力应围绕：
  - 排班管理
  - 今日预约
  - 就诊待办
  - 快速处理/确认

## Recommendation
- Phase 1 只做品牌显示层与启动入口统一，确保不会破坏运行
- Phase 2 再处理工程标识层（package 名、DB 名、module 名）
- Phase 3 新建 merchant mobile Swift 骨架并接 merchant backend

## Implemented in this session
- 已新增 `apps/launch_merchant.command`：通过 Terminal 打开并运行 `petwell-merchant/dev.sh`
- 已新增 `apps/launch_merchant_mobile.command`：先作为 Swift 医生端目录入口
- 已创建 `apps/swift code/` 及 `merchant-mobile/` 基础目录
- 已完成低风险品牌替换：
  - 登录页品牌字样 `PetWell -> Pawrd`
  - Sidebar 品牌字样 `PetWell -> Pawrd`
  - `dev.sh` 启动提示文案
  - `package.json` / `package-lock.json` name 改为 `pawrd-merchant`
  - locale storage key 改为 `pawrd-merchant-locale`
  - 部分 docs 标题改为 Pawrd

## Still intentionally deferred
- `backend/go.mod` 模块名与全部 Go import path
- `backend/petwell.db`
- 部署域名 / API 域名 / 历史 phase 文档中的路径与旧品牌

## Backend rename completed
- `backend/go.mod` 已改为 `module pawrd-merchant-backend`
- 所有 backend Go import path 已切换到 `pawrd-merchant-backend/...`
- `backend/cmd/server/main.go` 本地 SQLite 文件名已改为 `pawrd.db`
- 现有本地数据库文件也已从 `backend/petwell.db` 改名为 `backend/pawrd.db`
- `backend/cmd/migrate/main.go` 默认 `--db` 已改为 `pawrd.db`
- 使用项目内临时 `GOCACHE` 运行 `go build ./...`，已通过

## Merchant mobile code skeleton completed
- 已为 `apps/swift code/merchant-mobile/` 增加 SwiftUI 代码骨架
- 当前已升级为可打开的 Xcode 工程：`PawrdMerchantMobile.xcodeproj`
- 已覆盖的页面/模块：
  - 登录页
  - 今日排班
  - 预约列表
  - 快捷操作
  - 全局 AppState + 示例数据

## Xcode project verification
- `xcodebuild -list -project 'swift code/merchant-mobile/PawrdMerchantMobile.xcodeproj'` 已成功识别 target / scheme
- 使用项目内 `-derivedDataPath '.derived_data/PawrdMerchantMobile'` 进行构建
- `xcodebuild ... build` 最终通过，产物位于：
  - `apps/.derived_data/PawrdMerchantMobile/Build/Products/Debug-iphonesimulator/PawrdMerchantMobile.app`

## Architecture map sync note
- skill 要求同步 `interactive_architecture_map.html`
- 当前 `/Users/vfzzz/Desktop/PetWell_Project/interactive_architecture_map.html` 不存在，无法更新正式交互图
- 本次先通过 `DIRECTORY.md`、`master_progress.md` 与 `WORK_CONTEXT.md` 记录新增的 Merchant Mobile 架构节点

## Merchant Mobile ↔ Merchant Portal 联动现状
- 当前 backend 已具备统一的 merchant API 基础：
  - `POST /merchant/auth/login`
  - `GET /merchant/me`
  - `PATCH /merchant/me/switch`
- portal 前端当前通过：
  - `X-Session-ID`
  - `X-Business-Type`
 访问 backend。
- portal 的 session 目前存放在浏览器 cookie（`session_id`），这是 Web 友好的方式，但不适合原生 iOS 直接复用。
- 当前 auth 模型本质上更接近“共享 backend + 多客户端（Web/Mobile）”架构，而不是 Web 直接嵌 Mobile。

## 联动方案设计原则
- 目标是“真实上线可交付”，优先考虑：
  - 安全
  - 低耦合
  - 可灰度发布
  - 后续可扩展到通知、排班、预约、随访
- 结论倾向：**Merchant Portal 与 Merchant Mobile 不直接互连，而是共同连接同一个 Pawrd Merchant Backend / BFF 层。**

## 候选方案摘要
### 方案 A — Shared Backend API（推荐）
- Web Portal 与 Mobile App 都直连同一个 Merchant Backend
- 后端统一负责认证、租户、权限、排班、预约、操作落库
- Portal 与 Mobile 只是两个客户端

优点：
- 架构最清晰
- 权限边界统一
- 上线快
- 便于测试与审计

缺点：
- 需要把部分 Web 导向的 session/cookie 机制补成 Mobile 友好的 token/session 返回
- 需要补移动端专用聚合接口

### 方案 B — BFF 双入口（Web BFF + Mobile BFF）
- 底层共享同一套核心服务/数据库
- Web 和 Mobile 各自有一层 BFF（Backend for Frontend）

优点：
- 两端接口可以按场景高度定制
- 后续性能和体验优化空间更大

缺点：
- 研发成本更高
- 初期容易重复开发
- 对当前项目体量来说偏重

### 方案 C — Portal 作为主系统，Mobile 走 Portal 适配层
- Mobile 不直接接核心业务，而是通过 Portal 已有接口/适配层访问

优点：
- 短期看改动少

缺点：
- Mobile 被 Portal 绑死
- 接口语义不干净
- 长期维护差
- 安全与性能都不理想

### 方案 D — WebView/Hybrid 复用 Portal
- iOS 端主要用 WebView 装载 Portal 页面

优点：
- 最快上线 demo

缺点：
- 不是高质量可交付原生产品
- 排班/通知/原生体验差
- 医生移动场景不合适

## 当前推荐顺序
1. **主推：方案 A**
2. 中期演进：A → B
3. 不推荐作为正式产品：C / D

## Formal architecture document created
- 已新增正式文档：
  - `docs/pawrd_app_merchant_architecture_options.md`
- 文档内容包含：
  - 方案 2 与方案 4 的左右分栏对比
  - 数据主权
  - API 边界
  - Mermaid 流程图 / 时序图
  - 安全策略
  - 防丢单机制
  - 上线顺序

## Scheme 4 rollout plan created
- 已新增多仓联调计划模板：
  - `docs/scheme4_multi_repo_rollout_plan.md`
- 该模板包含：
  - 所有涉及仓库清单
  - GitHub 路径占位
  - 各仓职责
  - 多仓联调顺序
  - 跨仓依赖关系
  - 联调进度看板（作为新会话恢复入口）

## Repo scan findings after user filled paths
- `R1 App Backend`
  - 文档填的是 `https://github.com/vf0429/Pawrd_Backend.git`
  - 本地 remote 是 `https://github.com/vf0429/Petwell_Backend.git`
  - 已确认：属于仓库改名，项目实体未变；后续按 `Pawrd_Backend` 记名
- `R2 Merchant`
  - 文档填的是 `https://github.com/vf0429/Pawrd_merchant_latest.git`
  - 本地 remote 是 `https://github.com/vf0429/pet-.git`
  - 已确认：属于仓库改名，项目实体未变；后续按 `Pawrd_merchant_latest` 记名
- `R3 App Frontend`
  - 文档与本地 remote 一致：`https://github.com/wwxxxxxx/PetWell.git`
- `R4 Merchant Mobile`
  - 当前无独立 git 仓库（NO_GIT）

## Delivery planning decision
- 用户明确要求：跳过“先方案 2 后方案 4”的过渡路线，直接按方案 4 规划落地。
- 因此后续 planning 必须按“三端联调 + 多仓协作”来设计，而不是单仓局部改造。
- 当前需要先产出一份不写代码的实施计划模板，供用户补充 GitHub 仓库路径后再执行。

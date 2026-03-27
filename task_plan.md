# Phase 4A Vaccination Replan Plan

## Goal
- [x] 阅读并校准 Vaccination 相关 briefing / handoff / App old flow / Merchant local topology
- [x] 输出 Vaccination revised integration plan
- [x] 输出 Merchant Service Facade contract draft
- [x] 明确 Portal URL / Merchant internal API / App-facing facade URL 边界
- [x] 回写 planning files 中的关键结论、阻塞、下一步建议
- [ ] 等待 OpenCode 按新基线执行实现或拆分任务

## Phases
1. [completed] 审计当前 Vaccination App 旧链路（`8090 + /api/merchant/* + X-Session-ID`）
2. [completed] 确认 Merchant 本地边界（Portal `3500` / internal backend `8080`）
3. [completed] 固化首期接入模型：`Merchant Project URL + Merchant Public/App Key + Merchant Service Facade`
4. [completed] 产出 revised integration plan 与 facade contract draft
5. [completed] 在规划文档中补充落库映射、状态机、前端 store/route 草案
6. [pending] OpenCode 按该基线拆为 backend facade skeleton + app migration tasks

## Deliverables
- `docs/phase4a_vaccination_revised_integration_plan.md`
- `docs/phase4a_merchant_service_facade_contract.md`
- planning files updated with conclusions / blockers / next-step recommendations

## Constraints
- 只聚焦 Vaccination
- 不把 `localhost:3500` 当成 App 产品级 API 入口
- 不继续沿用 App 直接登录 Merchant / `X-Session-ID` 的旧方案
- 接入模型固定为：`Merchant Project URL + Merchant Public/App Key`
- 全程必须使用 Planning with Files

## Risks
- 当前 Merchant backend 只有 `/merchant/*` 会话式内部 API，尚无 `/app/v1/*` facade namespace 与 app-key middleware。
- 当前 schema 缺少 `MerchantProject` / `MerchantAppKey` / `ClinicIntegrationBinding` / `VaccinationBookingFacade` 支撑表。
- 当前 App `VaccineBookingView.swift` 仍内嵌硬编码 clinic 凭证与 `localhost:8090`，若未迁移将继续偏离新产品模型。

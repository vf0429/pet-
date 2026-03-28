# Shop Analytics Verification

## Scope
- Surface: `GET /v1/merchant/analytics/shop` + `/merchant/shop/analytics`
- Priority: P0 verification asset
- Base URL: `http://localhost:3000` (UI) / `http://localhost:8080` (backend direct API in Playwright helper)

## Current Status
- Status: ⚠️ Prepared, not fully executed in this round
- Blocking dependency: Shop Analytics backend handler and frontend page are not present in repo yet (`analytics_shop.go`, `frontend/app/merchant/shop/analytics/page.tsx` 未落地)
- Blocking dependency: `docs/phase5_performance_review.md` 不存在，Architect 风险审核尚未落盘

## Contract Baseline
- API path: `GET /v1/merchant/analytics/shop`
- UI path: `/merchant/shop/analytics`
- Supported periods: `7d` / `30d` / `custom`
- Max custom range: `<= 90 days`
- Required response sections:
  - `period`
  - `summary.total_revenue`
  - `summary.total_orders`
  - `summary.avg_order_value`
  - `summary.repeat_purchase_rate`
  - `daily_revenue`
  - `category_breakdown`
  - `top_products`
- Required header: `Cache-Control: max-age=300, private`

## P0 Test Matrix

### TC-5-S-01 Total Revenue Accuracy
- Priority: P0
- Method: API response vs SQL/manual aggregate
- Assertion:
  - `summary.total_revenue` matches `SUM(total_amount)` for same tenant/date range
  - tolerance `< 1%`
- Tenant isolation:
  - repeat for tenant B / non-owner context
  - tenant B result must not equal tenant A by leaking tenant A totals

### TC-5-S-02 Daily Revenue Spot Check
- Priority: P0
- Method: sample 3 dates within selected period
- Assertion:
  - `daily_revenue[n].date` matches source records
  - `orders` and `revenue` match manual counts/sums
- Tenant isolation:
  - sampled dates for tenant A must not surface tenant B orders

### TC-5-S-03 Cross-Tenant Isolation
- Priority: P0
- Method: dual-session API comparison + page authorization check
- Assertion:
  - tenant A shop analytics accessible only to tenant A authorized shop session
  - tenant B/non-shop session gets `403`/redirect/zero-data per final implementation, but never tenant A payload
  - any order totals/category/top-product payload must differ from tenant A if returned

### TC-5-S-04 Cache Header
- Priority: P0
- Assertion:
  - response includes `Cache-Control`
  - value contains `max-age=300`
  - value contains `private`

### TC-5-S-05 Period State Machine — Legal / Illegal
- Priority: P0
- Legal:
  - `7d -> 30d` succeeds
  - `30d -> custom(<=90d)` succeeds
- Illegal:
  - `custom(>90d)` rejected with `400`
  - malformed `date_from/date_to` rejected with `400`
- Note:
  - this is the Phase 5 state-machine-style validation required for analytics query transitions

## Screenshot / Assertion Points
- Shop Analytics landing page (`/merchant/shop/analytics`)
  - heading `销售数据分析`
  - 4 KPI cards visible
  - line/area/pie/bar chart containers visible
  - `expect(page).toHaveScreenshot('phase5-shop-analytics-page.png')`
- Shop Analytics after range switch to `30天`
  - KPI values refreshed
  - `expect(page).toHaveScreenshot('phase5-shop-analytics-30d.png')`
- Optional empty state
  - text `暂无数据，请选择其他时间范围`
- Optional error state
  - text `数据加载失败`

## Contract Drift / Blockers
1. `docs/phase5_performance_review.md` 缺失，无法完成基于 Architect 结论的性能风险签收。
2. 当前仓库未发现 Shop Analytics API / UI 实现文件，故本轮只能生成验证资产，不能完成真实 PASS/FAIL 执行。
3. `Phase5_详细计划.md` 提到 Shop 页面支持 `custom Date Picker`，但 `Phase5_Steps.md` Frontend Step 4 只明确要求 `7天 / 30天` 切换；需产品/前后端确认 custom range 是否属于 Phase 5 必交。
4. 现有 seed 基线未明确提供“第二个 shop tenant 且有独立 shop analytics 数据”；若最终仍只有 tenant 1 shop 数据，则隔离验证只能做到“tenant B 不可见/返回 0”，不能做两个 shop tenant 的数值对照。

## Execution Notes
- 本轮不强制真实执行 Playwright。
- 已在 `tests/phase5/phase5_p0.spec.ts` 预置对应 P0 自动化骨架。
- 待 backend/frontend/seed ready 后，再填写以下结果区。

## Result Placeholder
- TC-5-S-01 Total Revenue: BLOCKED
- TC-5-S-02 Daily Revenue Spot Check: BLOCKED
- TC-5-S-03 Cross-Tenant Isolation: BLOCKED
- TC-5-S-04 Cache Header: BLOCKED
- TC-5-S-05 Period State Machine: BLOCKED

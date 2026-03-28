# Phase 5 Backend Verification Prereqs

## Step 1
- `ClinicVisit.ClosedAt` 已加入模型并在 visit `status=closed` 时回写。
- `RunAnalyticsIndexMigration(db)` 会在服务启动时创建 Analytics 相关索引。

## Step 2 / Step 3 API 约束
- 新接口：`GET /v1/merchant/analytics/shop`、`GET /v1/merchant/analytics/clinic`
- Header：沿用 merchant session 鉴权，需带 `X-Session-ID` 与 `X-Business-Type`
- Query：`period=7d|30d|custom`，`custom` 时必须提供 `date_from` / `date_to`
- 自定义日期范围最大 90 天，超限返回 `400`
- 响应统一 envelope：`{"code":0,"data":...,"message":"ok"}`
- 响应头固定包含：`Cache-Control: max-age=300, private`
- 所有查询均显式带 `tenant_id` 过滤

## Build
- `cd backend && gofmt -w . && go build ./...` 已通过

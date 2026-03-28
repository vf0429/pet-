# Clinic Analytics Verification

## Scope
- Surface: `GET /v1/merchant/analytics/clinic` + `/merchant/clinic/analytics`
- Priority: P0 verification asset

## Current Status
- Status: ⚠️ Prepared, not fully executed in this round
- Blocking dependency: Clinic Analytics backend handler and frontend page are not present in repo yet (`analytics_clinic.go`, `frontend/app/merchant/clinic/analytics/page.tsx` 未落地)
- Blocking dependency: `docs/phase5_performance_review.md` 不存在

## Contract Baseline
- API path: `GET /v1/merchant/analytics/clinic`
- UI path: `/merchant/clinic/analytics`
- Supported periods: `7d` / `30d` / `custom`
- Max custom range: `<= 90 days`
- Required response sections:
  - `period`
  - `summary.total_visits`
  - `summary.avg_visit_duration_min`
  - `summary.revisit_rate_30d`
  - `summary.prescription_rate`
  - `daily_visits`
  - `diagnosis_breakdown`
  - `doctor_workload`
  - `appointment_attendance`
- Required header: `Cache-Control: max-age=300, private`

## P0 Test Matrix

### TC-5-C-01 Total Visits Accuracy
- Priority: P0
- Assertion:
  - `summary.total_visits` equals filtered `clinic_visits` count
  - tenant filter always applied

### TC-5-C-02 Doctor Workload Completeness
- Priority: P0
- Assertion:
  - every `doctor_workload` item contains non-empty `doctor_name`
  - weekly workload values are numeric
  - tenant B cannot see tenant A doctor data

### TC-5-C-03 Appointment Attendance Validity
- Priority: P0
- Assertion:
  - each `rate` is between `0` and `1`
  - `checked_in <= confirmed`
  - tenant isolation maintained on aggregated rows

### TC-5-C-04 Cross-Tenant Isolation
- Priority: P0
- Method: dual-session API comparison + page authorization check
- Assertion:
  - clinic tenant can access clinic analytics
  - non-clinic/other tenant session cannot read clinic tenant analytics payload
  - doctor/diagnosis/attendance aggregates must not leak across tenants

### TC-5-C-05 Null Duration Tolerance
- Priority: P0
- Assertion:
  - when `closed_at` missing, `avg_visit_duration_min` may be `null`
  - API must still return `200` with valid JSON envelope

### TC-5-C-06 Period State Machine — Legal / Illegal
- Priority: P0
- Legal:
  - `7d -> 30d` succeeds
  - `30d -> custom(<=90d)` succeeds
- Illegal:
  - `custom(>90d)` rejected with `400`
  - malformed dates rejected with `400`

## Screenshot / Assertion Points
- Clinic Analytics landing page (`/merchant/clinic/analytics`)
  - heading `诊疗数据分析`
  - 4 KPI cards visible
  - line/pie/grouped-bar/bar chart containers visible
  - `expect(page).toHaveScreenshot('phase5-clinic-analytics-page.png')`
- Clinic Analytics after range switch to `30天`
  - UI remains stable and refreshed
  - `expect(page).toHaveScreenshot('phase5-clinic-analytics-30d.png')`
- Optional empty state
  - `暂无数据，请选择其他时间范围`
- Optional error state
  - `数据加载失败`

## Contract Drift / Blockers
1. `docs/phase5_performance_review.md` 缺失。
2. 当前仓库未发现 Clinic Analytics API / UI 实现文件，本轮无法完成真实数据准确性执行。
3. `avg_visit_duration_min` 依赖 `ClinicVisit.ClosedAt`；Step 1 尚未落地时，该指标应允许返回 `null`，否则 QA 将被实现顺序阻塞。
4. 当前种子基线是否提供“两个 clinic tenant 的可对照 analytics 数据”不明确；若没有第二个 clinic tenant，则隔离验证需退化为“非授权 tenant 不可读/返回 0/403”。

## Execution Notes
- 本轮不强制真实执行 Playwright。
- 已在 `tests/phase5/phase5_p0.spec.ts` 预置 Clinic P0 自动化骨架。

## Result Placeholder
- TC-5-C-01 Total Visits Accuracy: BLOCKED
- TC-5-C-02 Doctor Workload Completeness: BLOCKED
- TC-5-C-03 Appointment Attendance Validity: BLOCKED
- TC-5-C-04 Cross-Tenant Isolation: BLOCKED
- TC-5-C-05 Null Duration Tolerance: BLOCKED
- TC-5-C-06 Period State Machine: BLOCKED

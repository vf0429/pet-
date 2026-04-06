# Phase 5 Performance Review

## Scope
- Reviewed `specs/Phase5_数据分析/Phase5_详细计划.md` Analytics query set for Shop + Clinic dashboards.
- Reviewed current model index definitions in:
  - `backend/models/shop_order.go`
  - `backend/models/shop_product.go`
  - `backend/models/clinic.go`
  - `backend/models/merchant_user.go`

## Index Coverage: MISSING

### Query-by-query assessment
| Query | Current index coverage | Conclusion | Notes |
|---|---|---|---|
| `shop_orders` by `tenant_id + created_at` range | `idx_shop_orders_tenant_created (tenant_id, created_at)` exists | **OK** | Matches Shop summary + daily revenue scans well. |
| `shop_order_items` GROUP BY `category` via `shop_orders -> shop_order_items -> shop_products` | `shop_products (tenant_id, category)` exists, but `shop_order_items` lacks a strong join index for analytics path (`order_id` / `order_id, product_id`) | **MISSING** | Current path will work at small scale, but 30d/90d joins can degrade because filtered orders still fan out into item joins. |
| `clinic_appointments` GROUP BY `doctor_id` within date range | Current indexes are `(tenant_id, doctor_id)` and `(tenant_id, scheduled_at)` separately | **MISSING** | Doctor workload query needs one composite access path spanning tenant + doctor + date range; current indexes are only partial matches. |
| `clinic_visits` by `tenant_id + created_at` range | No `(tenant_id, created_at)` index currently present | **MISSING** | Clinic summary + daily visits will fall back to broader scans. |
| `clinic_diagnoses` by `tenant_id + visit_id` | `idx_clinic_diagnoses_tenant_visit (tenant_id, visit_id)` exists | **OK** | Adequate for diagnosis breakdown after visit subset is resolved. |

### Overall assessment
- Overall status must be marked **MISSING**, because Clinic analytics currently misses the most important time-range index on `clinic_visits`, and doctor workload lacks a fit-for-purpose composite index on `clinic_appointments`.
- Step 1 backend migration proposed in `Phase5_Steps.md` is necessary, not optional.

## Repeat Purchase Rate Accuracy: Approximate only, not exact

### Conclusion
- Using `customer_phone` / `owner_phone` as unique customer identity is **directionally useful but not audit-grade**.
- Current metric should be treated as **approximate operational insight**, not exact CRM truth.

### Accuracy assessment
- Main overcount / undercount sources:
  1. Same owner uses multiple phone formats (`+852...`, `852...`, spaced / dashed forms) -> **under-count repeat buyers**.
  2. Family members share one phone number -> **over-count repeat buyers**.
  3. Number changed / missing / placeholder values -> **under-count or noisy denominator**.
  4. One phone serving multiple pets -> acceptable for “owner repeat” metric, but not for “pet repeat” metric.

### Estimated error band
- If phone numbers are normalized well: expect roughly **±2 to ±5 percentage points** absolute error.
- If numbers are not normalized and front-desk entry quality is mixed: expect roughly **±5 to ±15 percentage points** absolute error.

### Recommendation
- Short term: normalize phone to E.164-like canonical form before aggregation, and exclude blank / placeholder values.
- Medium term: introduce stable `customer_id` / `pet_owner_id` and compute repeat purchase from that ID instead of phone.
- Reporting note: label the field as **“repeat_purchase_rate (estimated)”** until stable customer identity exists.

## Caching Strategy: HTTP cache first, Redis later if needed

### Recommended now
- Use **HTTP `Cache-Control: private, max-age=300`** for both:
  - `GET /merchant/analytics/shop`
  - `GET /merchant/analytics/clinic`
- Reason:
  - analytics is read-heavy and tolerate 5-minute staleness;
  - responses are tenant-scoped and session-scoped, so `private` is appropriate;
  - implementation cost is very low and matches current architecture.

### Suitable for HTTP caching
- Shop summary, daily revenue, category breakdown, top products
- Clinic summary, daily visits, diagnosis breakdown, doctor workload, attendance
- All standard `7d` / `30d` ranges and most `custom <= 90d` ranges

### Redis: not required in Step 1
- **Do not introduce Redis yet**.
- Add Redis only if one of the following becomes true:
  1. p95 analytics response time exceeds **500ms** after indexes are added;
  2. same tenant/date-range combinations are requested repeatedly (dashboard refresh hotspots);
  3. dataset grows enough that 90-day grouped joins become expensive under concurrency.

### If Redis is introduced later
- Cache key shape:
  - `analytics:shop:{tenant_id}:{period}:{date_from}:{date_to}`
  - `analytics:clinic:{tenant_id}:{period}:{date_from}:{date_to}`
- TTL: **300s**
- Invalidation: lazy expiration is acceptable for Phase 5; no synchronous write-through invalidation needed initially.

## Risk Level: Medium

### Why not Low
- Two important analytics queries are currently missing fit-for-purpose composite indexes.
- Category aggregation still has a join-path weakness on `shop_order_items`.
- Repeat purchase rate is approximate due to unstable customer identity.

### Why not High
- Phase 5 is optional enhancement, not MVP blocker.
- Date range is capped at 90 days.
- Existing tenant scoping is clear.
- HTTP 5-minute caching is enough for the likely current scale once Step 1 indexes land.

## Final Recommendation
1. Implement the Step 1 analytics index migration before enabling analytics endpoints.
2. Keep overall status as **Index Coverage: MISSING** until `clinic_visits` and `clinic_appointments` composite analytics indexes are in place.
3. Ship repeat purchase as an **estimated** metric, with phone normalization as minimum mitigation.
4. Start with **HTTP cache only**; defer Redis until measured p95 latency proves it necessary.

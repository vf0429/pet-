# Phase 4 技术契约文档（App 联调）

## 1. 文档目标与范围

- Phase 目标：完成 Merchant 后台与 App 的准实时联调，补齐 `app_sync_queue` 消费、同步状态聚合、前端轮询/Toast、幂等与死信规则。
- 本文基线：`docs/phase3_contract.md`、`docs/phase4_briefing.md`、`specs/Phase4_App联调/Phase4_详细计划.md` 与当前仓库实现。
- 本轮仅输出契约，不直接实现后端/前端代码。
- Kimi 当前 quota 不足，本轮 backend / qa 执行说明由 Codex 临时接管，见 §10。

---

## 2. 与 Phase 1-3 的兼容性要求

### 2.1 不可破坏项

- API Base Path 继续为 `/merchant`。
- 所有新接口必须挂在 `protected.Use(middleware.MerchantAuthMiddleware(db))` 之后。
- 继续使用 Phase 2/3 包裹格式：

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

- 后端 JSON 继续使用 `snake_case`；前端 VM / Zustand 继续使用 `camelCase`。
- 既有 `app_sync_queue` 写入点保持事务内写入：
  - shop 订单状态变更
  - clinic 预约状态变更
  - clinic 病历推送
- `docs/phase3_contract.md` 已定义的 `app_sync_queue.status` 枚举继续有效：`pending | sent | failed | dead_letter`。

### 2.2 向后兼容策略

- `GET /merchant/clinic/stats` 内已有 `sync_status` 三字段继续保留，供旧页面继续渲染。
- Phase 4 新增 `GET /merchant/sync/status` 作为跨业务聚合接口，不替代已有 Phase 3 Dashboard API。
- 历史 `app_sync_queue` 行若不存在 `next_retry_at`，消费端按“立即可消费”处理。
- 历史 `app_sync_queue.payload` 字符串结构不重写；新 consumer 仅做读取与派发。

---

## 3. 统一约定

### 3.1 请求头

```http
X-Session-ID: <uuid>
X-Business-Type: shop | clinic
```

说明：
- `/merchant/sync/status` 支持 `shop`、`clinic`、`both-capable tenant` 的当前激活业务视角。
- `/merchant/pending-tasks` 按 `X-Business-Type` 返回当前业务视角下的待处理任务。

### 3.2 时间与分页

- 时间格式：RFC3339 UTC。
- `/merchant/pending-tasks` 默认返回最多 10 条，前端不走分页；后端内部可保留 `LIMIT 10`。

### 3.3 错误码补充注册表

| code | HTTP | message |
|---|---:|---|
| 0 | 200 | ok |
| 10001 | 400 | invalid request |
| 10002 | 400 | invalid query params |
| 10003 | 400 | invalid business type |
| 10004 | 400 | missing business type |
| 10024 | 400 | invalid poll cursor |
| 10025 | 400 | invalid idempotency key |
| 20001 | 401 | X-Session-ID header is required |
| 20002 | 401 | session is invalid or expired |
| 20003 | 403 | tenant account is suspended |
| 20004 | 403 | current account cannot access business scope |
| 30021 | 404 | sync task not found |
| 50000 | 500 | unexpected server error |

> Phase 1 鉴权中间件若继续返回 `error/message` 结构，语义必须与上表一致，不强制改老逻辑。

---

## 4. API 端点规范

### 4.1 GET `/merchant/sync/status`

**目的**：返回 Merchant 当前业务视角下的 App 联调聚合同步状态，供 Dashboard 同步状态卡片与 Layout 顶部健康状态使用。

**鉴权**：必须。

**Query 参数**：无。

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "scope": "shop",
    "generated_at": "2026-03-26T15:30:00Z",
    "orders": {
      "last_synced_at": "2026-03-26T15:28:10Z",
      "pending_count": 2,
      "failed_count": 0,
      "dead_letter_count": 0,
      "last_event_at": "2026-03-26T15:27:42Z"
    },
    "appointments": {
      "last_synced_at": null,
      "pending_count": 0,
      "failed_count": 0,
      "dead_letter_count": 0,
      "last_event_at": null
    },
    "medical_records": {
      "last_synced_at": null,
      "pending_count": 0,
      "failed_count": 0,
      "dead_letter_count": 0,
      "last_event_at": null
    },
    "push": {
      "notifications_sent_today": 7,
      "last_success_at": "2026-03-26T15:28:10Z",
      "consecutive_failures": 0,
      "consumer_status": "healthy"
    },
    "api_key": {
      "masked": "pw_live_••••••••••••4f2a",
      "last4": "4f2a",
      "rotated_at": "2026-03-01T00:00:00Z"
    },
    "polling": {
      "recommended_interval_seconds": 60,
      "pending_tasks_interval_seconds": 30
    }
  },
  "message": "ok"
}
```

**字段定义**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| scope | string | 是 | 当前业务视角：`shop`/`clinic` |
| generated_at | string | 是 | 聚合时间 |
| orders / appointments / medical_records | object | 是 | 各实体同步摘要 |
| `*.last_synced_at` | string \| null | 是 | 最近成功发送时间 |
| `*.pending_count` | number | 是 | `status=pending` 数量 |
| `*.failed_count` | number | 是 | 仍可重试但最近一次失败的数量，等价 `status=failed` 或 `status=pending 且 last_error!=''` 的聚合结果；实现时二选一但需保持字段语义 |
| `*.dead_letter_count` | number | 是 | `status=dead_letter` 数量 |
| `*.last_event_at` | string \| null | 是 | 最近一次队列写入时间 |
| push.notifications_sent_today | number | 是 | 今日成功派发数 |
| push.last_success_at | string \| null | 是 | 最近派发成功时间 |
| push.consecutive_failures | number | 是 | consumer 最近连续失败次数 |
| push.consumer_status | string | 是 | `healthy` / `degraded` / `down` |
| api_key.masked | string | 是 | 前端直接展示的脱敏串 |
| api_key.last4 | string | 是 | 末 4 位 |
| api_key.rotated_at | string \| null | 是 | 最近轮换时间 |
| polling.recommended_interval_seconds | number | 是 | 同步状态卡片刷新建议，默认 60 |
| polling.pending_tasks_interval_seconds | number | 是 | 待处理任务轮询建议，默认 30 |

**错误响应**：`20001`、`20002`、`10004`、`10003`、`20003`、`20004`、`50000`

---

### 4.2 GET `/merchant/pending-tasks`

**目的**：返回当前业务视角下需要商家立即感知的待处理任务，供 Layout 轮询、Toast 弹窗、顶部徽标使用。

**鉴权**：必须。

**Query 参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| cursor | string | 否 | 空 | 上次轮询返回的游标；为空则按最新 10 条返回 |
| limit | number | 否 | 10 | 1-20 |

**成功响应 200**

```json
{
  "code": 0,
  "data": {
    "scope": "clinic",
    "cursor": "2026-03-26T15:30:00Z_145",
    "server_time": "2026-03-26T15:30:00Z",
    "tasks": [
      {
        "id": "task_145",
        "queue_id": 145,
        "task_type": "new_appointment",
        "entity_type": "appointment",
        "entity_id": "101",
        "entity_no": null,
        "title": "新预约 Buddy 09:30",
        "summary": "Buddy · Dr. Li · 09:30",
        "toast_variant": "new_appointment",
        "priority": "high",
        "action_label": "接单",
        "action_href": "/merchant/clinic/appointments?selected=101",
        "requires_ack": false,
        "created_at": "2026-03-26T15:29:10Z",
        "occurred_at": "2026-03-26T15:29:08Z",
        "dedupe_key": "appointment_101_status_changed_1774510148",
        "payload": {
          "pet_name": "Buddy",
          "doctor_name": "Dr. Li",
          "scheduled_at": "2026-03-26T09:30:00Z",
          "status": "pending"
        }
      },
      {
        "id": "task_144",
        "queue_id": 144,
        "task_type": "sync_failed",
        "entity_type": "order",
        "entity_id": "10045",
        "entity_no": "#10045",
        "title": "同步失败，请检查网络",
        "summary": "订单 #10045 推送失败，将自动重试",
        "toast_variant": "sync_failed",
        "priority": "medium",
        "action_label": "查看",
        "action_href": "/merchant/shop/orders?selected=10045",
        "requires_ack": false,
        "created_at": "2026-03-26T15:28:40Z",
        "occurred_at": "2026-03-26T15:28:40Z",
        "dedupe_key": "order_10045_status_changed_1774510120",
        "payload": {
          "from_status": "paid",
          "to_status": "preparing",
          "retry_count": 1,
          "next_retry_at": "2026-03-26T15:29:10Z"
        }
      }
    ],
    "count": 2,
    "unread_like_count": 2,
    "recommended_poll_interval_seconds": 30
  },
  "message": "ok"
}
```

**任务类型枚举**

- `new_order`
- `new_appointment`
- `sync_failed`
- `followup_overdue`
- `medical_record_pushed`

**字段定义**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| id | string | 是 | 前端展示 ID，格式 `task_{queue_id}` |
| queue_id | number | 是 | `app_sync_queue.id` |
| task_type | string | 是 | 业务任务类型 |
| entity_type | string | 是 | `order` / `appointment` / `medical_record` / `followup` |
| entity_id | string | 是 | 业务实体 ID |
| entity_no | string \| null | 是 | 订单号等人类可读编号 |
| title | string | 是 | Toast 标题 |
| summary | string | 是 | Toast/列表摘要 |
| toast_variant | string | 是 | `new_order` / `new_appointment` / `sync_failed` / `followup_overdue` |
| priority | string | 是 | `high` / `medium` / `low` |
| action_label | string \| null | 是 | CTA 文案 |
| action_href | string \| null | 是 | 跳转地址 |
| requires_ack | boolean | 是 | 预留 Phase 5 手动确认 |
| created_at | string | 是 | 任务入列时间 |
| occurred_at | string | 是 | 业务事件发生时间 |
| dedupe_key | string | 是 | 用于前端 30s 窗口内去重显示 |
| payload | object | 是 | 轻量业务上下文，仅供前端展示，不直接写 store 核心实体 |
| count | number | 是 | 返回任务条数 |
| unread_like_count | number | 是 | 本次轮询建议展示的数量 |
| recommended_poll_interval_seconds | number | 是 | 默认 30 |

**错误响应**：`10002`、`10024`、`20001`、`20002`、`10004`、`10003`、`20003`、`20004`、`50000`

---

## 5. `app_sync_queue` 数据结构与消费契约

### 5.1 GORM 结构（Phase 4 增强版）

```go
type AppSyncQueue struct {
    ID                uint               `gorm:"primaryKey" json:"id"`
    TenantID          uint               `gorm:"not null;index:idx_app_sync_queue_tenant_status,priority:1;index:idx_app_sync_queue_tenant_entity,priority:1;index:idx_app_sync_queue_tenant_retry,priority:1" json:"tenant_id"`
    EntityType        string             `gorm:"size:32;not null;index:idx_app_sync_queue_tenant_entity,priority:2" json:"entity_type"`
    EntityID          string             `gorm:"size:64;not null;index:idx_app_sync_queue_tenant_entity,priority:3" json:"entity_id"`
    Action            string             `gorm:"size:32;not null;index" json:"action"`
    Payload           string             `gorm:"type:text;not null" json:"payload"`
    Status            AppSyncQueueStatus `gorm:"size:24;not null;default:'pending';index:idx_app_sync_queue_tenant_status,priority:2;index:idx_app_sync_queue_tenant_retry,priority:2" json:"status"`
    RetryCount        int                `gorm:"not null;default:0" json:"retry_count"`
    NextRetryAt       *time.Time         `gorm:"index:idx_app_sync_queue_tenant_retry,priority:3" json:"next_retry_at"`
    LastAttemptAt     *time.Time         `json:"last_attempt_at"`
    SentAt            *time.Time         `json:"sent_at"`
    LastError         string             `gorm:"size:500" json:"last_error"`
    DeadLetteredAt    *time.Time         `json:"dead_lettered_at"`
    DeadLetterReason  string             `gorm:"size:255" json:"dead_letter_reason"`
    CreatedAt         time.Time          `gorm:"not null;index" json:"created_at"`
    UpdatedAt         time.Time          `json:"updated_at"`
}
```

### 5.2 兼容说明

- 现有仓库仅包含 `retry_count`、`last_error`；Phase 4 增量字段均允许为空。
- 旧记录 `next_retry_at = NULL` 时，consumer 视为 `created_at <= now` 的立即任务。

### 5.3 队列状态机

| from \ to | pending | sent | failed | dead_letter |
|---|---:|---:|---:|---:|
| pending | ✅ | ✅ | ✅ | ✅ |
| failed | ✅ | ✅ | ✅ | ✅ |
| sent | ❌ | ✅ | ❌ | ❌ |
| dead_letter | ❌ | ❌ | ❌ | ✅ |

### 5.4 合法流转说明

| 流转 | 条件 | 副作用 |
|---|---|---|
| `pending -> sent` | 派发成功 | 写 `sent_at`、清空 `last_error` |
| `pending -> failed` | 派发失败且 `retry_count + 1 < 3` | `retry_count++`、写 `last_attempt_at`、`last_error`、`next_retry_at` |
| `failed -> pending` | 调度器到达 `next_retry_at` 再次入选 | 仅由 consumer 内部执行 |
| `failed/pending -> dead_letter` | `retry_count + 1 >= 3` 或错误被判定不可重试 | 写 `dead_lettered_at`、`dead_letter_reason` |

---

## 6. `app_sync_queue` 消费流程、重试退避、dead letter 规则

### 6.1 消费时序

1. 业务事务提交成功。
2. 同一事务写入 `app_sync_queue(status=pending,retry_count=0,next_retry_at=NULL)`。
3. Consumer 每 30 秒扫描：
   - `status IN ('pending','failed')`
   - `retry_count < 3`
   - `next_retry_at IS NULL OR next_retry_at <= now()`
   - `ORDER BY created_at ASC, id ASC`
   - `LIMIT 50`
4. Consumer 生成/校验 `dedupe_key` 与幂等记录。
5. 调用 `dispatchToApp(task)`：当前 Phase 4 可为 APNs 占位实现或 push adapter。
6. 按结果更新队列状态。

### 6.2 退避规则

| retry_count（失败后） | 下一次重试延迟 |
|---:|---|
| 1 | 30s |
| 2 | 2m |
| 3 | 10m 后不再重试，直接 dead_letter |

**规则解释**
- 第 1 次失败后：`retry_count=1`，`next_retry_at=now+30s`
- 第 2 次失败后：`retry_count=2`，`next_retry_at=now+2m`
- 第 3 次失败后：不再排队，直接 `status=dead_letter`

### 6.3 不可重试错误直接死信

以下情况不走退避，直接 `dead_letter`：
- payload JSON 反序列化失败
- entity 已不存在且无法恢复上下文
- 业务类型与 payload 模板不匹配
- API key / device token 明确无效且判定为永久错误

### 6.4 dead letter 规则

Consumer 必须写入：

```json
{
  "status": "dead_letter",
  "dead_letter_reason": "max_retry_exceeded | invalid_payload | permanent_provider_error | entity_not_found",
  "dead_lettered_at": "2026-03-26T15:40:00Z"
}
```

### 6.5 并发约束

- 同一队列记录一次只允许一个 consumer 实例处理。
- SQLite 阶段可通过事务 + 先查后更策略保障；迁移到 Postgres/Supabase 后推荐 `FOR UPDATE SKIP LOCKED`。

---

## 7. `idempotency_keys` 表结构与约束

### 7.1 键格式

```text
{entity_type}_{entity_id}_{action}_{updated_at_unix}
```

示例：

```text
order_10042_status_changed_1711245600
appointment_101_status_changed_1711245600
medical_record_501_record_published_1711245600
```

### 7.2 GORM 结构

```go
type IdempotencyKey struct {
    Key              string     `gorm:"primaryKey;size:191" json:"key"`
    TenantID         uint       `gorm:"not null;index:idx_idempotency_tenant_entity,priority:1" json:"tenant_id"`
    EntityType       string     `gorm:"size:32;not null;index:idx_idempotency_tenant_entity,priority:2" json:"entity_type"`
    EntityID         string     `gorm:"size:64;not null;index:idx_idempotency_tenant_entity,priority:3" json:"entity_id"`
    Action           string     `gorm:"size:32;not null;index:idx_idempotency_tenant_entity,priority:4" json:"action"`
    QueueID          *uint      `gorm:"index" json:"queue_id"`
    RequestHash      string     `gorm:"size:64;not null" json:"request_hash"`
    ResponseBody     string     `gorm:"type:text" json:"response_body"`
    HTTPStatus       int        `gorm:"not null;default:200" json:"http_status"`
    ProcessingStatus string     `gorm:"size:16;not null;default:'done';index" json:"processing_status"`
    ExpiresAt        time.Time  `gorm:"not null;index" json:"expires_at"`
    LastSeenAt       time.Time  `gorm:"not null" json:"last_seen_at"`
    CreatedAt        time.Time  `gorm:"not null" json:"created_at"`
    UpdatedAt        time.Time  `json:"updated_at"`
}
```

### 7.3 约束

- 主键：`key`
- 唯一语义：全局唯一；同一 `key` 不允许重复插入
- TTL：30 分钟
- 清理策略：后台定时任务每 10 分钟删除 `expires_at < now()` 记录
- `request_hash` 必填，用于检测同 key 不同 payload 的非法重放
- 若重复请求命中已存在 key：
  - `request_hash` 相同：返回缓存响应
  - `request_hash` 不同：返回 `409 / code=10025`

---

## 8. 前端契约：轮询 / Toast / 同步状态卡片

### 8.1 页面路由与组件树

```text
/merchant/layout.tsx
├── Sidebar
├── TopBar
├── Phase4SyncRuntime
│   ├── usePendingTasksPolling()
│   ├── ToastCenter
│   │   └── ToastNotification[]
│   └── SyncHealthBadge (可选)
└── PageContent
    ├── /merchant/shop/dashboard/page.tsx
    │   └── SyncStatusCard
    └── /merchant/clinic/dashboard/page.tsx
        └── SyncStatusCard
```

### 8.2 Zustand Store 结构建议

```ts
type ToastVariant = 'new_order' | 'new_appointment' | 'sync_failed' | 'followup_overdue'

interface PendingTaskVM {
  id: string
  queueId: number
  taskType: string
  entityType: string
  entityId: string
  entityNo: string | null
  title: string
  summary: string
  toastVariant: ToastVariant
  priority: 'high' | 'medium' | 'low'
  actionLabel: string | null
  actionHref: string | null
  requiresAck: boolean
  createdAt: string
  occurredAt: string
  dedupeKey: string
  payload: Record<string, unknown>
}

interface MerchantSyncStatusVM {
  scope: 'shop' | 'clinic'
  generatedAt: string
  orders: SyncChannelVM
  appointments: SyncChannelVM
  medicalRecords: SyncChannelVM
  push: {
    notificationsSentToday: number
    lastSuccessAt: string | null
    consecutiveFailures: number
    consumerStatus: 'healthy' | 'degraded' | 'down'
  }
  apiKey: {
    masked: string
    last4: string
    rotatedAt: string | null
  }
  polling: {
    recommendedIntervalSeconds: number
    pendingTasksIntervalSeconds: number
  }
}

interface SyncChannelVM {
  lastSyncedAt: string | null
  pendingCount: number
  failedCount: number
  deadLetterCount: number
  lastEventAt: string | null
}

interface MerchantRealtimeState {
  pendingTasks: PendingTaskVM[]
  lastCursor: string | null
  activeToasts: PendingTaskVM[]
  syncStatus: MerchantSyncStatusVM | null
  isPollingTasks: boolean
  isLoadingSyncStatus: boolean
  pollingError: string | null
  syncStatusError: string | null
  fetchPendingTasks: () => Promise<void>
  fetchSyncStatus: () => Promise<void>
  enqueueToasts: (tasks: PendingTaskVM[]) => void
  dismissToast: (id: string) => void
  clearTransientTasks: () => void
}
```

### 8.3 轮询策略

- `layout.tsx`：登录后启动 `GET /merchant/pending-tasks`，每 30s 轮询一次，首次立即执行。
- Dashboard：`GET /merchant/sync/status` 每 60s 刷新一次，首次进入立即执行。
- 若页面隐藏（`document.hidden === true`），可暂停或降频至 120s。

### 8.4 Toast 展示规则

- 右上角堆叠，最多 3 条。
- 自动消失：5 秒。
- 同一 `dedupe_key` 在 30 秒内只弹一次。
- 点击 CTA 后：
  - 跳转 `action_href`
  - 立即关闭对应 toast

### 8.5 同步状态卡片最少字段

Shop Dashboard 必显：
- `orders.last_synced_at`
- `orders.pending_count`
- `push.notifications_sent_today`
- `api_key.masked`

Clinic Dashboard 必显：
- `appointments.last_synced_at`
- `medical_records.pending_count`
- `medical_records.failed_count`
- `push.notifications_sent_today`

---

## 9. 前后端 JSON 字段映射表

### 9.1 `/merchant/sync/status`

| 后端 snake_case | 前端 camelCase |
|---|---|
| generated_at | generatedAt |
| last_synced_at | lastSyncedAt |
| pending_count | pendingCount |
| failed_count | failedCount |
| dead_letter_count | deadLetterCount |
| last_event_at | lastEventAt |
| notifications_sent_today | notificationsSentToday |
| last_success_at | lastSuccessAt |
| consecutive_failures | consecutiveFailures |
| consumer_status | consumerStatus |
| api_key | apiKey |
| last4 | last4 |
| rotated_at | rotatedAt |
| recommended_interval_seconds | recommendedIntervalSeconds |
| pending_tasks_interval_seconds | pendingTasksIntervalSeconds |

### 9.2 `/merchant/pending-tasks`

| 后端 snake_case | 前端 camelCase |
|---|---|
| server_time | serverTime |
| queue_id | queueId |
| task_type | taskType |
| entity_type | entityType |
| entity_id | entityId |
| entity_no | entityNo |
| toast_variant | toastVariant |
| action_label | actionLabel |
| action_href | actionHref |
| requires_ack | requiresAck |
| created_at | createdAt |
| occurred_at | occurredAt |
| dedupe_key | dedupeKey |
| unread_like_count | unreadLikeCount |
| recommended_poll_interval_seconds | recommendedPollIntervalSeconds |

### 9.3 队列表

| 后端 snake_case | 前端 / 调度内部命名 |
|---|---|
| retry_count | retryCount |
| next_retry_at | nextRetryAt |
| last_attempt_at | lastAttemptAt |
| sent_at | sentAt |
| last_error | lastError |
| dead_lettered_at | deadLetteredAt |
| dead_letter_reason | deadLetterReason |

---

## 10. 本轮执行说明：Kimi 不可用时由 Codex 临时接管 backend / qa

### 10.1 执行边界

- PM：Codex
- Backend：Codex（临时）
- Frontend：MiniMax
- QA：Codex（临时）

### 10.2 交付要求

- Backend/QA 本轮以“契约、测试清单、执行说明”优先，不要求在本步骤直接编码。
- 所有分析结论必须回写：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 如后续进入实现阶段，必须遵守：
  - 不修改 Phase 1-3 鉴权语义
  - 不删除已有 seed 数据
  - 前端请求必须经 `frontend/lib/api.ts`

### 10.3 QA 临时接管范围

- Codex 负责先输出 P0/P1 测试矩阵与消费链路验证点。
- 等 Kimi 恢复后，再将压测、回归、Supabase dry run 的执行性工作交回原 QA agent。

---

## 11. 落地建议（供后续实现阶段使用）

1. 先补模型：`app_sync_queue` 增量字段 + `idempotency_keys`。
2. 再补 consumer job 与 `dispatchToApp` adapter。
3. 然后补 `/merchant/sync/status`、`/merchant/pending-tasks`。
4. 前端最后接 `layout.tsx` 轮询、ToastCenter、Dashboard SyncStatusCard。
5. QA 按 P0 用例先验证：接口结构、轮询触发、3 次失败进入 dead letter、重复 key 不重复消费。

# Phase 4：App 实时联调 + Supabase 迁移预演

> 目标：App ↔ 商家后台双向状态同步，完成 Supabase 迁移 Checklist
> 前置条件：Phase 3 QA 签收通过

---

## 上线 Agent 一览

| Agent | 是否上线 | 说明 |
|-------|---------|------|
| 🏛 Architect | ✅ 上线（主导） | 主导端到端联调设计，Supabase 迁移方案 |
| 🖥 Frontend Dev | ✅ 上线 | 实现实时更新 UI、Toast 通知、同步状态真实化 |
| ⚙️ Backend Dev | ✅ 上线 | 实现 sync_queue 消费服务、幂等键、WebSocket 占位 |
| 🔬 Test Engineer | ✅ 上线（主力） | 端到端测试、压力测试、Supabase Dry Run 验证 |

---

## Agent 任务分配

---

### 🏛 Architect — 任务清单

> Phase 4 Architect 重新回到主导位置，负责联调架构和迁移方案

**任务 1：定义端到端数据流规范（输出：联调契约文档）**

完整数据流时序：
```
1. App 用户下单 / 预约
   → Go 后端写入 orders / appointments 表
   → 同一事务写入 app_sync_queue（status=pending）

2. cron job（每 30s）
   → 扫描 app_sync_queue WHERE status=pending AND retry_count < 3
   → 调用推送服务（APNs）
   → 成功：status=sent
   → 失败：retry_count++，按退避策略延迟重试

3. 商家后台（前端）
   → 每 30s 轮询 GET /merchant/*/pending-tasks
   → 有新任务 → Toast 弹出 + 刷新列表

4. 商家操作（接单/接诊/发货）
   → PATCH 状态接口
   → 事务内写入 app_sync_queue（status=pending）
   → 重复步骤 2
```

**任务 2：幂等键规范（输出：幂等键文档）**

格式：`{entity_type}_{entity_id}_{action}_{updated_at_unix}`

示例：`order_10042_status_changed_1711245600`

存储：`idempotency_keys` 表，有效期 30 分钟，过期自动清理。

**任务 3：Supabase 迁移方案（输出：迁移 Checklist 文档）**

- 迁移前检查项（共 12 项，见下方 Backend Dev 任务 4）
- Supabase RLS 策略设计
- Realtime channel 订阅配置
- 迁移步骤 Runbook

**任务 4：iOS Codable 模型对齐审核**
- 拿到 Backend Dev 的 app_sync_queue payload 定义
- 与 iOS `MedicalRecord.swift`、`Order.swift` 等 Codable 模型逐字段比对
- 输出差异报告 → 交给 Backend Dev 修正

**任务 5：Code Review（Phase 4 重点）**
- 审核 cron job 是否在事务之外（防止事务未提交就消费）
- 审核幂等键的并发安全（是否有唯一索引）
- 审核 Supabase RLS 策略不能绕过

---

### 🖥 Frontend Dev — 任务清单

**任务 1：轮询机制实现**

```typescript
// hooks/usePendingTasks.ts
// 适用于 Shop Dashboard 和 Clinic Dashboard
export function usePendingTasks(businessType: "shop" | "clinic") {
  const [pendingTasks, setPendingTasks] = useState([])

  useEffect(() => {
    const poll = async () => {
      const tasks = await fetchPendingTasks(businessType)
      if (tasks.length > 0) {
        setPendingTasks(tasks)
        tasks.forEach(task => showToast(task))
      }
    }

    poll() // 立即执行一次
    const interval = setInterval(poll, 30_000)
    return () => clearInterval(interval)
  }, [businessType])

  return pendingTasks
}
```

**Supabase Realtime 升级预留（注释代码）：**
```typescript
// TODO Phase 5+: 升级 Supabase 后替换轮询
// const channel = supabase
//   .channel(`merchant_tasks_${tenantId}`)
//   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, handler)
//   .subscribe()
```

---

**任务 2：Toast 通知系统（全局组件）**

位置：右上角叠加显示，最多 3 条，自动消失 5s，可手动关闭

样式规范：
| 事件 | 边框颜色 | 图标 | 标题 | 操作按钮 |
|------|---------|------|------|---------|
| 新订单 | `#2563EB` 蓝 | shopping-cart | 「新订单 #10045」 | 「查看」→ 订单详情 |
| 新预约 | `#0891B2` 青 | calendar | 「新预约 Buddy 09:30」 | 「接单」→ 直接确认 |
| 同步失败 | `#DC2626` 红 | triangle-alert | 「同步失败，请检查网络」 | 「重试」|
| 回访提醒 | `#F97316` 橙 | bell | 「2条回访已超期」 | 「查看」|

---

**任务 3：App 同步状态卡片真实化**

将 Phase 2/3 中的 Mock 数据替换为真实 API：
```typescript
// 调用 GET /merchant/sync/status
// 每 60s 刷新一次
const { data: syncStatus } = useSyncStatus()

// 渲染：
// 订单同步  ✓  {syncStatus.orders.last_synced_at | "2分钟前"}
// 库存同步  ⚠  {syncStatus.inventory.pending_count} 条待同步
// 推送通知  ✓  今日已发 {syncStatus.notifications_sent_today} 条
// API Key   pw_live_••••••••••••{last4}  [复制]
```

---

**任务 4：Supabase Realtime 代码结构预留**

在 `lib/realtime.ts` 创建占位文件：
```typescript
// lib/realtime.ts
// Phase 4+ 升级 Supabase 时启用此文件

export function subscribeToOrders(tenantId: string, onNew: (order: Order) => void) {
  // TODO: supabase.channel(...).on(...).subscribe()
  console.warn("[Realtime] 当前使用轮询模式，升级 Supabase 后替换")
}
```

---

### ⚙️ Backend Dev — 任务清单

**任务 1：app_sync_queue 消费 cron job**

```go
// internal/jobs/sync_consumer.go

func StartSyncConsumer(db *gorm.DB, interval time.Duration) {
    ticker := time.NewTicker(interval) // 30s
    go func() {
        for range ticker.C {
            ConsumeAppSyncQueue(db)
        }
    }()
}

func ConsumeAppSyncQueue(db *gorm.DB) {
    var tasks []AppSyncQueue
    // 取出 pending 且未超过重试限制的任务
    db.Where("status = ? AND retry_count < ?", "pending", 3).
        Order("created_at ASC").Limit(50).Find(&tasks)

    for _, task := range tasks {
        err := dispatchToApp(task) // 调用 APNs 或写入推送队列
        if err != nil {
            nextRetry := backoffDelay(task.RetryCount)  // 30s / 2min / 10min
            db.Model(&task).Updates(map[string]interface{}{
                "retry_count": task.RetryCount + 1,
                "last_error":  err.Error(),
                "next_retry_at": time.Now().Add(nextRetry),
            })
        } else {
            db.Model(&task).Update("status", "sent")
        }
    }

    // 标记超过 3 次重试的任务为 dead_letter
    db.Model(&AppSyncQueue{}).
        Where("status = ? AND retry_count >= ?", "pending", 3).
        Update("status", "dead_letter")
}
```

**任务 2：幂等键实现**

```go
// internal/models/idempotency.go
type IdempotencyKey struct {
    Key       string    `gorm:"primaryKey"`  // 唯一索引
    Response  string    // 缓存的响应 JSON
    ExpiresAt time.Time
    CreatedAt time.Time
}

// 中间件
func IdempotencyMiddleware(db *gorm.DB) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            key := r.Header.Get("X-Idempotency-Key")
            if key == "" { next.ServeHTTP(w, r); return }

            var existing IdempotencyKey
            if db.Where("key = ? AND expires_at > ?", key, time.Now()).First(&existing).Error == nil {
                // 命中缓存，直接返回
                w.Write([]byte(existing.Response))
                return
            }
            // 否则继续执行，并在响应后缓存结果
            next.ServeHTTP(w, r)
        })
    }
}
```

**任务 3：同步状态接口**

**GET `/merchant/sync/status`**
```json
{
  "orders": {
    "last_synced_at": "2026-03-24T10:30:00+08:00",
    "pending_count": 2,
    "failed_count": 0
  },
  "appointments": {
    "last_synced_at": "2026-03-24T10:28:00+08:00",
    "pending_count": 0,
    "failed_count": 1
  },
  "notifications_sent_today": 7,
  "api_key_last4": "4f2a"
}
```

**GET `/merchant/pending-tasks`**
```json
// 用于前端轮询，返回最新待处理任务
{
  "tasks": [
    {
      "type": "new_order",
      "order_no": "#10045",
      "customer_name": "Sarah Chan",
      "created_at": "2026-03-24T10:31:00+08:00"
    }
  ],
  "count": 1
}
```

**任务 4：Supabase 迁移前检查（配合 Architect 完成）**

- [ ] 所有表有 `tenant_id` 字段
- [ ] 所有表有 `created_at` / `updated_at` 时间戳
- [ ] GORM DSN 改为环境变量 `DB_DSN`（已做）
- [ ] 无 SQLite 特有语法（AUTOINCREMENT → SERIAL）
- [ ] 外键约束：SQLite 默认不强制，Postgres 会报错，需检查
- [ ] JSON 字段：SQLite 存 string，Postgres 用 JSONB，需调整
- [ ] 时区：所有时间字段存 UTC，前端展示时转换
- [ ] 索引：补充 `tenant_id` 复合索引（高频查询字段）
- [ ] `idempotency_keys` 表有唯一索引（并发安全）
- [ ] `app_sync_queue` 有 `next_retry_at` 字段（支持退避重试）
- [ ] RLS 策略：每张核心表准备好 SQL 策略文件
- [ ] Realtime：确认哪些表需要订阅（orders, appointments）

---

### 🔬 Test Engineer — 任务清单（本 Phase 工作量最重）

**任务 1：端到端测试（全链路，需真实 App + 后台同时运行）**

| TC ID | 用例描述 | 操作步骤 | 预期结果 | 严重级别 |
|-------|---------|---------|---------|---------|
| TC-4-01 | App 下单 → 商家后台可见 | App 下订单，等待最多 60s | 商家后台订单列表出现新订单 | P0 |
| TC-4-02 | 商家接单 → App 推送通知 | 商家点击确认备货 | App 收到 Push，订单状态更新为备货中 | P0 |
| TC-4-03 | App 预约 → 商家后台弹 Toast | App 提交预约，等待 60s | 商家后台 Toast 弹出新预约通知 | P0 |
| TC-4-04 | 商家确认预约 → App 状态更新 | 商家点击确认预约 | App 预约状态变为「已确认」 | P0 |
| TC-4-05 | 病历推送 → App 消息中心 | Clinic 后台点击「推送到 App」 | App 消息中心收到病历摘要，字段完整 | P0 |
| TC-4-06 | 网络中断重试 | 关停推送服务 → 商家操作 → 恢复服务 | 恢复后 sync_queue 自动重试，最终 status=sent | P1 |
| TC-4-07 | 幂等：重复发送相同事件 | 手动发送相同 idempotency_key 两次 | 第二次返回 200，DB 无重复记录 | P1 |
| TC-4-08 | dead_letter 标记 | 手动让任务失败 3 次 | status 变为 dead_letter，不再重试 | P1 |

**任务 2：性能压力测试（k6）**

```javascript
// scripts/load_test_phase4.js
import http from 'k6/http'
export let options = {
  scenarios: {
    merchants_polling: {
      executor: 'constant-vus',
      vus: 50,   // 模拟 50 个商家同时轮询
      duration: '2m'
    }
  }
}
export default function () {
  http.get('http://localhost:8000/merchant/pending-tasks', {
    headers: {
      'X-Session-ID': 'sess_load_test',
      'X-Business-Type': 'shop'
    }
  })
}
// 目标：P95 < 800ms，0 个 5xx
```

**任务 3：Supabase Dry Run 验证**

```bash
# 步骤 1：本地启动 Supabase
supabase start

# 步骤 2：修改环境变量
export DB_DSN="postgres://postgres:postgres@localhost:54322/postgres"

# 步骤 3：迁移 + Seed
go run cmd/server/main.go --migrate-only
go run cmd/server/seed_all.go

# 步骤 4：全量后端测试
go test ./... -v 2>&1 | tee test_results_supabase.txt

# 步骤 5：关键 SQL 验证
psql $DB_DSN -c "SELECT COUNT(*) FROM orders WHERE tenant_id = 1"
psql $DB_DSN -c "SELECT COUNT(*) FROM orders WHERE tenant_id = 99"  -- 应为 0

# 步骤 6：前端 E2E 测试
npx playwright test --config=playwright.config.ts
```

**验收：所有步骤无报错，go test 全绿**

**任务 4：回归测试（全量）**
- Phase 1：TC-1-01 ~ TC-1-10 全部重跑
- Phase 2：TC-2-01 ~ TC-2-11 全部重跑
- Phase 3：TC-3-01 ~ TC-3-14 全部重跑

**任务 5：输出 Phase 4 测试报告 + 迁移报告**
- `测试报告/Phase4_测试报告.md`（含端到端结果、压测数据、回归结果）
- `测试报告/Supabase迁移Dry_Run报告.md`（含每个检查项的验证结果）

---

## 验收标准（所有 Agent 需确认）

- [ ] Architect：联调时序文档、幂等键规范、Supabase 迁移 Checklist 均已输出
- [ ] Frontend：轮询机制上线，Toast 通知可正常触发，同步状态卡片使用真实数据
- [ ] Backend：cron job 稳定运行（30s 消费），幂等键中间件有效，sync status 接口可用
- [ ] QA：端到端 P0 用例 100% 通过，压测 50 VU 无 5xx，Supabase Dry Run 全绿，全量回归无新增 P0 Bug
- [ ] **Phase 4 完成 = 商家端后台 MVP 交付**

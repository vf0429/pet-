# Phase 4B — App 同步通知：分步执行计划

> Phase 4B 是原 Phase 4 中 sync_queue / Toast / 轮询通知 的正式实现阶段。
> 在 Phase 4A 完成后启动。
> 每个 Step 内的各角色 Prompt 可在独立 Claude Code 窗口**并行执行**。
> 项目根目录：`/Users/vfzzz/Desktop/petwell-merchant`

---

## Step 1：Sync Consumer Job + 死信处理

**目标：** 实现后台 cron job，消费 app_sync_queue，支持退避重试和 dead_letter。

### Prerequisite
- Phase 4A 全部完成

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

任务 1：检查 models/ 下 AppSyncQueue 的字段定义，记录现有字段。

任务 2：若 AppSyncQueue 缺少以下字段，在 models/ 中更新该 struct 并补充迁移：
- RetryCount int `gorm:"default:0"`
- LastError string `gorm:"size:512"`
- NextRetryAt *time.Time
- Status string `gorm:"size:16;not null;default:'pending'"` （pending/sent/dead_letter）

任务 3：创建 backend/jobs/sync_consumer.go

实现以下函数：

func StartSyncConsumer(db *gorm.DB, interval time.Duration)
  使用 time.NewTicker(interval) 在 goroutine 中持续调用 ConsumeAppSyncQueue(db)

func ConsumeAppSyncQueue(db *gorm.DB)
  1. 查询 status='pending' AND retry_count < 3 AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC LIMIT 50
  2. 对每条任务调用 dispatchTask(task)
  3. 成功：db.Model(&task).Update("status", "sent")
  4. 失败：
     - retry_count++
     - last_error = err.Error()
     - next_retry_at = 退避时间（retry 0→30s, 1→2min, 2→10min）
     - db.Model(&task).Updates(...)
  5. 将 retry_count >= 3 且 status=pending 的任务标记为 dead_letter：
     db.Model(&AppSyncQueue{}).Where("status='pending' AND retry_count >= 3").Update("status","dead_letter")

func dispatchTask(task models.AppSyncQueue) error
  当前仅做模拟推送（log.Printf("Dispatching task %d: %s", task.ID, task.EntityType)）
  随机返回 nil（模拟成功）
  真实 APNs 集成留到后续版本，此处只需返回 nil。

任务 4：在 backend/cmd/server/main.go 的 main() 函数中，在 r.Run(":8080") 之前启动：
jobs.StartSyncConsumer(db, 30*time.Second)
log.Println("Sync consumer started (30s interval)")

任务 5：cd backend && go build ./... 零报错。
```

---

### 🏛 Architect Prompt
```
你是一个系统架构师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

在 Backend 完成 sync_consumer.go 后，执行代码审查：

检查以下几点：
1. ConsumeAppSyncQueue 的查询是否在事务之外执行（不能在事务中消费，防止事务未提交就被消费）
2. dead_letter 标记是否有唯一索引保证（并发安全），若无，建议加 gorm uniqueIndex
3. next_retry_at 的退避逻辑是否正确（30s / 2min / 10min）
4. dispatchTask 是否会 panic，若有风险加 recover

将审查结论写入 docs/phase4b_sync_consumer_review.md：
格式：
# Sync Consumer Code Review
## Findings
[每个检查点的结论：OK / ISSUE + 说明]
## Required Fixes (if any)
[若发现问题，明确说明需要修改的代码位置]
```

---

### 验收标准（Step 1 完成）
- [ ] `go build ./...` 零报错
- [ ] 服务启动时日志显示 "Sync consumer started"
- [ ] AppSyncQueue 有 retry_count、last_error、next_retry_at、status 字段
- [ ] Architect review 文档已输出，无未修复的 ISSUE

---

## Step 2：Pending Tasks API + Sync Status API

**目标：** 实现前端轮询所需的两个接口，供 Portal 读取待处理任务和同步状态。

### Prerequisite
- Step 1 全部通过

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

任务 1：创建 backend/handlers/sync.go

实现 GetPendingTasks(db *gorm.DB) gin.HandlerFunc：
- 从 context 取 TenantID 和 RequestedBusinessType（merchant auth middleware 已注入）
- 查询最近 5 分钟内创建的、status=pending 的 app_sync_queue 记录
  WHERE tenant_id = ? AND created_at >= NOW()-5min AND status='pending'
- 对每条记录，构建响应：
  {
    "type": task.EntityType,       // "order" / "appointment" 等
    "entity_id": task.EntityID,
    "payload": task.Payload,       // JSON string，原样传递
    "created_at": task.CreatedAt
  }
- 响应格式：
  { "tasks": [...], "count": N }

实现 GetSyncStatus(db *gorm.DB) gin.HandlerFunc：
- 从 context 取 TenantID
- 查询：
  a. shop orders: SELECT MAX(updated_at) as last_synced, COUNT(*) WHERE status='pending' AND entity_type='order'
  b. appointments: 同上 entity_type='appointment'
  c. 今日发送通知数：SELECT COUNT(*) WHERE status='sent' AND DATE(created_at)=TODAY()
  d. dead_letter 数：SELECT COUNT(*) WHERE status='dead_letter'
- 响应格式（严格按照 specs/Phase4_App联调/Phase4_详细计划.md 中的 sync/status 格式）：
  {
    "orders": { "last_synced_at": "...", "pending_count": N, "failed_count": N },
    "appointments": { "last_synced_at": "...", "pending_count": N, "failed_count": N },
    "notifications_sent_today": N,
    "dead_letter_count": N
  }

任务 2：在 backend/cmd/server/main.go 的 protected 路由组中追加：
protected.GET("/pending-tasks", handlers.GetPendingTasks(db))
protected.GET("/sync/status", handlers.GetSyncStatus(db))

任务 3：cd backend && go build ./... 零报错。
```

---

### 🖥 Frontend Prompt
```
你是一个前端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/frontend。

任务 1：在 frontend/lib/api.ts 末尾追加以下类型和函数

// Sync 相关类型
export type PendingTask = {
  type: string
  entity_id: number
  payload: string
  created_at: string
}

export type SyncStatusDTO = {
  orders: { last_synced_at: string | null; pending_count: number; failed_count: number }
  appointments: { last_synced_at: string | null; pending_count: number; failed_count: number }
  notifications_sent_today: number
  dead_letter_count: number
}

// 在现有 apiFetch 函数模式下，追加：
// getPendingTasks 和 getSyncStatus 的调用函数
// 参照现有 api.ts 中其他函数的写法（读取 session cookie，设置 headers）

任务 2：查找现有 Zustand store 目录，创建或更新 realtime.ts（可能已存在占位文件）

内容：
import { create } from 'zustand'
import type { PendingTask, SyncStatusDTO } from '../api'

type RealtimeStore = {
  pendingTasks: PendingTask[]
  syncStatus: SyncStatusDTO | null
  isPolling: boolean
  lastCheckedAt: string | null

  setPendingTasks: (tasks: PendingTask[]) => void
  setSyncStatus: (status: SyncStatusDTO) => void
  setIsPolling: (v: boolean) => void
  setLastCheckedAt: (t: string) => void
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  pendingTasks: [],
  syncStatus: null,
  isPolling: false,
  lastCheckedAt: null,
  setPendingTasks: (tasks) => set({ pendingTasks: tasks }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setIsPolling: (v) => set({ isPolling: v }),
  setLastCheckedAt: (t) => set({ lastCheckedAt: t }),
}))

任务 3：创建 frontend/hooks/usePendingTasks.ts

'use client'
import { useEffect, useCallback } from 'react'
import { useRealtimeStore } from '../lib/stores/realtime'  // 路径按实际调整
import { getPendingTasks, getSyncStatus } from '../lib/api'

export function usePendingTasks(businessType: 'shop' | 'clinic') {
  const { setPendingTasks, setSyncStatus, setIsPolling, setLastCheckedAt } = useRealtimeStore()

  const poll = useCallback(async () => {
    try {
      const [tasksRes, statusRes] = await Promise.all([
        getPendingTasks(businessType),
        getSyncStatus(businessType),
      ])
      if (tasksRes.tasks) setPendingTasks(tasksRes.tasks)
      if (statusRes) setSyncStatus(statusRes)
      setLastCheckedAt(new Date().toISOString())
    } catch (e) {
      console.error('[usePendingTasks] poll error', e)
    }
  }, [businessType])

  useEffect(() => {
    setIsPolling(true)
    poll()
    const interval = setInterval(poll, 30_000)
    return () => {
      clearInterval(interval)
      setIsPolling(false)
    }
  }, [poll])
}
```

---

### 验收标准（Step 2 完成）
- [ ] `GET /v1/merchant/pending-tasks` 接口可访问
- [ ] `GET /v1/merchant/sync/status` 接口可访问
- [ ] 前端 `usePendingTasks` hook 存在并可导入
- [ ] Zustand realtime store 更新完成

---

## Step 3：Toast 通知系统 + Dashboard 接入

**目标：** 实现前端 Toast 通知组件，接入 Shop/Clinic Dashboard，显示真实同步状态。

### Prerequisite
- Step 2 全部通过

### 🖥 Frontend Prompt
```
你是一个前端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/frontend。

任务 1：先阅读现有 Toast 相关代码（搜索 toast 关键词），了解是否已有实现。

若已有 Toast 组件，在其基础上扩展；若无，新建 components/toast-notification.tsx。

Toast 规范（严格按照 specs/Phase4_App联调/Phase4_详细计划.md 中 Frontend 任务2 的样式规范）：
- 位置：右上角，fixed，z-50
- 最多同时显示 3 条，超出时队列等待
- 自动消失：5s
- 可手动关闭（×按钮）
- 重复相同内容（同 type + entity_id）30s 内去重，不重复弹出

Toast 类型（用不同边框颜色区分）：
type ToastItem = {
  id: string
  type: 'new_order' | 'new_appointment' | 'sync_failed' | 'followup_overdue'
  title: string
  body: string
  actionLabel?: string
  actionHref?: string
  createdAt: number  // Date.now()
}

颜色映射：
- new_order: border-blue-600 (#2563EB)
- new_appointment: border-cyan-600 (#0891B2)
- sync_failed: border-red-600 (#DC2626)
- followup_overdue: border-orange-500 (#F97316)

任务 2：在 Zustand realtime store (lib/stores/realtime.ts) 中追加 toast 管理：
toasts: ToastItem[]
addToast: (item: Omit<ToastItem, 'id' | 'createdAt'>) => void  // 自动生成 id 和 createdAt，做去重
removeToast: (id: string) => void

任务 3：在 usePendingTasks hook 中，在 poll 函数里处理新任务时调用 addToast：
- entity_type='order' → type='new_order', title='新订单', body=payload 中的 order_no
- entity_type='appointment' → type='new_appointment', title='新预约', body=payload 中的 pet_name + scheduled_at

任务 4：在 Shop Dashboard 页和 Clinic Dashboard 页中：
- 调用 usePendingTasks(businessType)
- 挂载 <ToastNotification /> 组件

任务 5：将 Sync Status 卡片的 Mock 数据替换为来自 useRealtimeStore().syncStatus 的真实数据。
若当前 Dashboard 中不存在 Sync Status 卡片，跳过此步骤，不需要新建。
```

---

### 🔬 QA Prompt
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

编写测试文件 tests/phase4b/phase4b_toast.spec.ts

测试场景：

TC-4B-01：Sync Status 接口可用
  直接调用 http://localhost:8080/v1/merchant/sync/status（带 session）
  expect: code 0, data 包含 orders/appointments/notifications_sent_today

TC-4B-02：Pending Tasks 接口可用
  直接调用 http://localhost:8080/v1/merchant/pending-tasks
  expect: code 0, data.tasks 是数组

TC-4B-03：向 app_sync_queue 手动插入测试任务后，Pending Tasks 接口返回该任务
  （通过直接调用后端的 debug 接口，或验证数据存在即可）

TC-4B-04：Dashboard 页面可加载，不报 JS 错误
  page.goto('/merchant/shop/dashboard') 或 '/merchant/dashboard'
  expect: page.locator('[data-testid="sync-status"]') 或页面不报 500 错误

输出结果到 docs/phase4b_test_results.md
```

---

### 验收标准（Step 3 完成）
- [ ] Toast 组件存在，支持 4 种类型
- [ ] Shop/Clinic Dashboard 接入 usePendingTasks
- [ ] Sync Status 卡片数据来自真实接口（若存在）
- [ ] TC-4B-01、TC-4B-02 PASS

---

## Step 4：E2E 测试 + 性能基准

**目标：** 全链路 Playwright 测试，k6 压测脚本，输出 Phase 4B 测试报告。

### Prerequisite
- Step 3 全部通过

### 🔬 QA Prompt（主力）
```
你是一个 QA 工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant。

任务 1：创建完整的 Phase 4B E2E 测试

文件：tests/phase4b/phase4b_p0.spec.ts

TC-4B-P0-01：创建订单 → app_sync_queue 有记录
  调用 merchant API 更新某订单状态（模拟 App 触发的状态变更）
  查询 sync status 接口，验证 pending_count 有变化

TC-4B-P0-02：等待 consumer 消费（最多 60s）
  轮询 sync status，直到 pending_count 降为 0 或有 sent 记录

TC-4B-P0-03：Dead Letter 产生验证
  手动向数据库写入 retry_count=3 的 pending 记录
  等待 35s（一个 consumer 周期）
  验证该记录 status 变为 dead_letter

TC-4B-P0-04：幂等键：相同操作不重复写入
  对同一实体触发两次状态变更
  验证 app_sync_queue 中该实体的记录数符合预期

任务 2：创建 k6 压测脚本 tests/load/phase4b_load.js

内容按照 specs/Phase4_App联调/Phase4_详细计划.md 中 QA 任务2 的规范：
- 50 VU 同时轮询 /v1/merchant/pending-tasks
- 持续 2 分钟
- 目标：P95 < 800ms，0 个 5xx

（注意：这是脚本文件，不需要实际运行，只需要文件存在且内容正确）

任务 3：输出 Phase 4B 测试报告

文件：docs/phase4b_test_report.md，包含：
- 各 TC 结果（PASS/FAIL/SKIP）
- 发现的问题
- Phase 4B 整体状态（DONE / NEEDS FIX）
```

---

### ⚙️ Backend Prompt
```
你是一个 Go 后端工程师。项目在 /Users/vfzzz/Desktop/petwell-merchant/backend。

回归验证：确保 Phase 4B 引入的所有后端变更不影响已有接口。

1. cd backend && go build ./... 零报错
2. cd backend && go test ./... 若存在测试文件，确保全部 PASS
3. 检查 sync_consumer.go 是否会在服务关闭时正确停止（检查是否有 context.Done() 或信号处理）
   若没有优雅退出，在 main.go 中加入：

   ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
   defer stop()
   // 将 ctx 传入 StartSyncConsumer，ticker.C 监听 ctx.Done()

4. 将代码变更汇总在 docs/phase4b_backend_review.md 中（2-3句话即可）
```

---

### 验收标准（Step 4 完成 = Phase 4B 完成）
- [ ] Playwright P0 测试全部 PASS
- [ ] k6 脚本文件存在
- [ ] 服务支持优雅退出
- [ ] `docs/phase4b_test_report.md` 输出，状态为 DONE

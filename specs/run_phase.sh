#!/bin/bash
# =============================================================================
# PetWell 多模型 Agent 团队 — Phase 自动化执行脚本 (v4)
#
# 改进内容（v4）：
#   - Checkpoint 机制：每步完成后写入 .done 标记，重跑时跳过已完成步骤
#   - 支持 --reset 标志强制从头重跑
#   - 进度文件：docs/phase{N}_progress.md 实时更新
#
# 用法：
#   ./run_phase.sh <phase_num>           # 断点续跑（跳过已完成步骤）
#   ./run_phase.sh <phase_num> --reset   # 强制从头重跑
#   ./run_phase.sh <phase_num> --from 4  # 从第 N 步开始跑
# =============================================================================

set -euo pipefail

PHASE="${1:-}"
RESET=false
FROM_STEP=0

# 解析参数
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset) RESET=true; shift ;;
    --from) FROM_STEP="${2:-0}"; shift 2 ;;
    *) shift ;;
  esac
done

SPEC_DIR="$(cd "$(dirname "$0")" && pwd)"
CODE_DIR="/Users/vfzzz/Desktop/petwell-merchant"
CHECKPOINT_DIR="${CODE_DIR}/docs/.checkpoints"

# 加载 API Keys
if [ -f "${CODE_DIR}/.env" ]; then
  set -a
  source "${CODE_DIR}/.env"
  set +a
elif [ -f "${SPEC_DIR}/.env" ]; then
  set -a
  source "${SPEC_DIR}/.env"
  set +a
fi

# ---- 参数检查 ----
if [ -z "${PHASE:-}" ] || ! [[ "$PHASE" =~ ^[1-5]$ ]]; then
  echo "❌ 用法: ./run_phase.sh <1-5> [--reset] [--from <step>]"
  exit 1
fi

PREV_BRANCH=$([ "$PHASE" -eq 1 ] && echo "main" || echo "phase-$((PHASE-1))")
CURR_BRANCH="phase-${PHASE}"

# 找到对应 Phase 目录
PHASE_SPEC_DIR=$(ls -d "${SPEC_DIR}/Phase${PHASE}_"* 2>/dev/null | head -1)
if [ -z "$PHASE_SPEC_DIR" ]; then
  echo "❌ 找不到 Phase${PHASE} 的规格目录"
  exit 1
fi
PHASE_PLAN="${PHASE_SPEC_DIR}/Phase${PHASE}_详细计划.md"

if [ ! -f "$PHASE_PLAN" ]; then
  echo "❌ 需求文档不存在: ${PHASE_PLAN}"
  exit 1
fi

mkdir -p "${CODE_DIR}/docs" "${CODE_DIR}/tests/phase${PHASE}" "${CODE_DIR}/test-results" "${CHECKPOINT_DIR}"

# ---- Checkpoint 辅助函数 ----
CKPT_PREFIX="${CHECKPOINT_DIR}/phase${PHASE}_step"

step_done() {
  local STEP=$1
  [ -f "${CKPT_PREFIX}${STEP}.done" ] && return 0
  return 1
}

mark_done() {
  local STEP=$1
  local DESC=$2
  echo "$(date '+%Y-%m-%dT%H:%M:%S') ${DESC}" > "${CKPT_PREFIX}${STEP}.done"
  update_progress
}

skip_step() {
  local STEP=$1
  local DESC=$2
  echo "   ⏭️  跳过（已完成）: ${DESC}"
  echo "   → 查看日志: docs/phase${PHASE}_$(step_log_name $STEP).log"
}

step_log_name() {
  case $1 in
    1) echo "arch" ;;
    2) echo "backend" ;;
    3) echo "build" ;;
    4) echo "frontend" ;;
    5) echo "qa" ;;
    6) echo "test_run" ;;
  esac
}

should_skip() {
  local STEP=$1
  # --reset 强制不跳过
  [ "$RESET" = true ] && return 1
  # --from N 从第 N 步开始
  [ "$STEP" -lt "$FROM_STEP" ] && return 0
  # 检查 checkpoint 文件
  step_done "$STEP" && return 0
  return 1
}

# ---- 进度文件 ----
PROGRESS_FILE="${CODE_DIR}/docs/phase${PHASE}_progress.md"

update_progress() {
  cat > "$PROGRESS_FILE" << EOF
# Phase ${PHASE} 执行进度

更新时间：$(date '+%Y-%m-%d %H:%M:%S')

| 步骤 | 名称 | 状态 |
|------|------|------|
| [0] | 分支准备 | $(step_done 0 && echo "✅ 完成" || echo "⏳ 待执行") |
| [1] | Architect 契约 | $(step_done 1 && echo "✅ 完成" || echo "⏳ 待执行") |
| [2] | Backend 实现 | $(step_done 2 && echo "✅ 完成" || echo "⏳ 待执行") |
| [3] | 编译检查 | $(step_done 3 && echo "✅ 完成" || echo "⏳ 待执行") |
| [4] | Frontend 实现 | $(step_done 4 && echo "✅ 完成" || echo "⏳ 待执行") |
| [5] | QA 测试编写 | $(step_done 5 && echo "✅ 完成" || echo "⏳ 待执行") |
| [6] | Playwright 测试 | $(step_done 6 && echo "✅ 完成" || echo "⏳ 待执行") |

## Checkpoint 文件
\`${CHECKPOINT_DIR}/\`

## 重跑指令
\`\`\`bash
# 断点续跑（跳过已完成步骤）
./run_phase.sh ${PHASE}

# 从第 4 步（Frontend）重跑
./run_phase.sh ${PHASE} --from 4

# 强制从头重跑
./run_phase.sh ${PHASE} --reset
\`\`\`
EOF
}

# --reset 时清除所有 checkpoint
if [ "$RESET" = true ]; then
  echo "🔄 --reset: 清除 Phase ${PHASE} 所有 checkpoint..."
  rm -f "${CKPT_PREFIX}"*.done
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  PetWell Agent Team — Phase ${PHASE}  (v4 checkpoint mode)        ║"
echo "║  Branch: ${CURR_BRANCH}  (from: ${PREV_BRANCH})                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 显示当前进度
update_progress
echo "📋 当前进度:"
for i in 0 1 2 3 4 5 6; do
  if step_done $i; then
    DONE_TIME=$(cat "${CKPT_PREFIX}${i}.done" | cut -d' ' -f1)
    echo "   ✅ Step $i — 完成于 ${DONE_TIME}"
  fi
done
echo ""

# =============================================================================
# 辅助函数
# =============================================================================
run_agent() {
  local AGENT_NAME="$1"
  local PROMPT_FILE="$2"
  local LOG_FILE="$3"
  local ATTACH_FILE="${4:-}"

  local -a CMD=(opencode run --agent "$AGENT_NAME" --dir "$CODE_DIR")
  if [ -n "$ATTACH_FILE" ] && [ -f "$ATTACH_FILE" ]; then
    CMD+=(--file "$ATTACH_FILE")
  fi

  echo "   → 运行 agent: ${AGENT_NAME}"
  echo "   → Prompt 长度: $(wc -c < "$PROMPT_FILE") bytes"
  echo ""
  cat "$PROMPT_FILE" | "${CMD[@]}" 2>&1 | tee "$LOG_FILE"
  local EXIT_CODE=$?
  echo ""

  if [ $EXIT_CODE -ne 0 ]; then
    echo "   ⚠️  Agent ${AGENT_NAME} 退出码: ${EXIT_CODE}（继续执行）"
  fi
  return 0
}

# =============================================================================
# Step 0: 分支准备
# =============================================================================
echo "🌿 [0/6] 准备 Git 分支..."
cd "$CODE_DIR"

if should_skip 0; then
  skip_step 0 "分支准备"
else
  git checkout "$PREV_BRANCH" 2>/dev/null || true
  if git show-ref --quiet "refs/heads/${CURR_BRANCH}"; then
    echo "   分支 ${CURR_BRANCH} 已存在，切换到该分支继续..."
    git checkout "$CURR_BRANCH"
  else
    git checkout -b "$CURR_BRANCH"
    echo "   ✅ 新建分支 ${CURR_BRANCH} (from ${PREV_BRANCH})"
  fi
  mark_done 0 "分支准备"
  echo "   ✅ 分支就绪"
fi

# =============================================================================
# Step 1: Architect
# =============================================================================
echo ""
echo "📐 [1/6] Architect — 分析 Phase ${PHASE} 需求，输出技术契约..."

if should_skip 1; then
  skip_step 1 "Architect 契约"
else
  echo "   输入: ${PHASE_PLAN}"
  echo "   输出: docs/phase${PHASE}_contract.md"
  echo ""

  ARCH_PROMPT=$(mktemp)
  cat > "$ARCH_PROMPT" << 'PROMPT_END'
# 任务：输出 Phase PHASE_NUM 技术契约

## 第一步：读取输入文件

请依次用工具读取以下文件：
1. 需求文档：`PHASE_PLAN_PATH`
2. Phase 1 技术契约（了解已有规范）：`docs/phase1_contract.md`
3. 已有后端入口（了解现有路由和表）：`backend/cmd/server/main.go`
4. 已有 API 客户端（了解现有类型定义）：`frontend/lib/api.ts`

## 第二步：输出契约文件

将完整的技术契约写入 `docs/phasePHASE_NUM_contract.md`，必须包含以下章节：

### 1. API 端点清单
每个端点必须包含：
- HTTP 方法 + 路径
- 请求 Body JSON（含每个字段的类型、是否必填、示例值）
- Query 参数（如有）
- 成功响应 JSON（完整结构，使用统一格式 `{"code": 0, "data": {...}, "message": "ok"}`）
- 错误响应列表（error code + HTTP status + message）

### 2. 数据库表结构
- Go GORM struct 完整定义（含所有 tag）
- 每个字段的注释说明
- 索引定义
- 与已有表的关联关系

### 3. 状态机定义
- 状态枚举值
- 合法流转矩阵（表格形式：from × to = 允许/拒绝）
- 每个流转的触发条件和副作用（如写入 sync_queue）

### 4. 前端页面清单
- 路由路径 → 页面组件名
- 每个页面调用哪些 API
- 使用哪个 Zustand store
- 主要交互说明

### 5. 前后端字段映射表
- 后端 snake_case ↔ 前端 camelCase 对照表

### 6. Seed 数据规格
- 每个新表的测试数据条数和分布

### 7. 编码规范提醒
- 后端统一响应格式：`{"code": 0, "data": {...}, "message": "ok"}`
- 后端所有查询必须加 `WHERE tenant_id = ?`
- 前端所有 API 调用必须通过 `lib/api.ts`
- 前端页面必须处理 Loading / Empty / Error 三态
- 新增路由必须在 Sidebar 添加导航项
PROMPT_END

  sed -i '' "s|PHASE_NUM|${PHASE}|g" "$ARCH_PROMPT"
  sed -i '' "s|PHASE_PLAN_PATH|${PHASE_PLAN}|g" "$ARCH_PROMPT"

  run_agent "petwell-pm" "$ARCH_PROMPT" "${CODE_DIR}/docs/phase${PHASE}_arch.log" "$PHASE_PLAN"
  rm -f "$ARCH_PROMPT"

  if [ ! -f "${CODE_DIR}/docs/phase${PHASE}_contract.md" ]; then
    echo "⚠️  Architect 未生成契约文件，将使用日志内容作为兜底..."
    cp "${CODE_DIR}/docs/phase${PHASE}_arch.log" "${CODE_DIR}/docs/phase${PHASE}_contract.md"
  fi

  mark_done 1 "Architect 契约完成"
  echo "   ✅ Architect 契约完成"
fi

# =============================================================================
# Step 2: Backend
# =============================================================================
echo ""
echo "⚙️  [2/6] Backend Engineer — 实现 Go 后端代码..."

if should_skip 2; then
  skip_step 2 "Backend 实现"
else
  BE_PROMPT=$(mktemp)
  cat > "$BE_PROMPT" << 'PROMPT_END'
# 任务：实现 Phase PHASE_NUM 后端代码

## 第一步：读取上下文文件

请依次用工具读取以下文件（这些是你必须了解的已有代码）：
1. 技术契约：`docs/phasePHASE_NUM_contract.md`
2. 已有入口文件：`backend/cmd/server/main.go`（了解 AutoMigrate、seedData、路由注册方式）
3. 已有 handler 模式：`backend/handlers/auth.go`（了解响应格式）
4. 已有中间件：`backend/middleware/auth.go`（了解 authctx 注入方式）
5. 已有 model 模式：`backend/models/tenant.go` 和 `backend/models/merchant_user.go`
6. 已有状态机模式：`backend/models/state_machine.go`
7. 已有枚举：`backend/models/enums.go`

## 第二步：增量实现代码

严格按照契约文档实现所有后端代码。**注意这是增量开发，不要覆盖已有文件的已有内容。**

先用 Glob 和 Grep 检查哪些文件已经存在、哪些内容已经实现，只补充缺失的部分。

### 编码规范（强制）：
1. 多租户隔离 — 所有查询加 `WHERE tenant_id = ?`，tenant_id 从 authctx 获取
2. 统一响应格式：
   ```go
   c.JSON(200, gin.H{"code": 0, "data": responseData, "message": "ok"})
   c.JSON(400, gin.H{"code": 40001, "data": nil, "message": "描述"})
   ```
3. 状态变更必须先通过状态机校验函数
4. 状态变更 + sync_queue 写入必须在 db.Transaction() 内
PROMPT_END

  sed -i '' "s|PHASE_NUM|${PHASE}|g" "$BE_PROMPT"
  run_agent "petwell-backend" "$BE_PROMPT" "${CODE_DIR}/docs/phase${PHASE}_backend.log"
  rm -f "$BE_PROMPT"

  mark_done 2 "Backend 实现完成"
  echo "   ✅ Backend 完成"
fi

# =============================================================================
# Step 3: 编译检查
# =============================================================================
echo ""
echo "🔨 [3/6] 编译检查..."

if should_skip 3; then
  skip_step 3 "编译检查"
else
  cd "${CODE_DIR}/backend"

  BUILD_EXIT=0
  go build ./... 2>&1 | tee "${CODE_DIR}/docs/phase${PHASE}_build.log" || BUILD_EXIT=$?

  if [ $BUILD_EXIT -ne 0 ]; then
    echo "   ❌ Go 编译失败！尝试自动修复..."

    FIX_PROMPT=$(mktemp)
    cat > "$FIX_PROMPT" << 'PROMPT_END'
Go 编译失败了，请修复。

步骤：
1. 读取编译错误日志：docs/phasePHASE_NUM_build.log
2. 读取出错的文件
3. 修复所有编译错误
4. 确保不破坏已有功能
PROMPT_END
    sed -i '' "s|PHASE_NUM|${PHASE}|g" "$FIX_PROMPT"
    run_agent "petwell-backend" "$FIX_PROMPT" "${CODE_DIR}/docs/phase${PHASE}_build_fix.log"
    rm -f "$FIX_PROMPT"

    go build ./... 2>&1 || {
      echo "   ❌ 编译仍然失败，请手动检查"
      exit 1
    }
  fi

  mark_done 3 "编译通过"
  echo "   ✅ Go 编译通过"
  cd "$CODE_DIR"
fi

# =============================================================================
# Step 4: Frontend
# =============================================================================
echo ""
echo "🖥  [4/6] Frontend Engineer — 实现 Next.js 前端..."

if should_skip 4; then
  skip_step 4 "Frontend 实现"
else
  FE_PROMPT=$(mktemp)
  cat > "$FE_PROMPT" << 'PROMPT_END'
# 任务：实现 Phase PHASE_NUM 前端代码

## 第一步：读取上下文文件

请依次用工具读取以下文件：
1. 技术契约：`docs/phasePHASE_NUM_contract.md`
2. 已有 API 客户端：`frontend/lib/api.ts`（了解 apiFetch 封装方式、已有 DTO 类型）
3. 已有 auth store：`frontend/store/auth.ts`（了解 store 模式）
4. 已有 Sidebar：`frontend/components/Sidebar.tsx`（了解导航项如何根据 businessType 显示）
5. 已有 merchant layout：`frontend/app/merchant/layout.tsx`（了解路由保护逻辑）
6. 已有 middleware：`frontend/middleware.ts`（了解 API 路由放行规则）

## 第二步：增量实现代码

先用 Glob 检查哪些页面、组件、store 文件已经存在，只补充缺失的部分。不要覆盖已有内容。

### 编码规范（强制）：
1. 所有 API 调用通过 `lib/api.ts` 中的函数，绝不直接写 fetch
2. 每个页面必须有 Loading（骨架屏）、Empty（空状态）、Error（报错+重试）三态
3. TailwindCSS 样式，不使用 CSS modules
4. 状态标签颜色遵循契约定义的颜色系统
PROMPT_END

  sed -i '' "s|PHASE_NUM|${PHASE}|g" "$FE_PROMPT"
  run_agent "petwell-frontend" "$FE_PROMPT" "${CODE_DIR}/docs/phase${PHASE}_frontend.log"
  rm -f "$FE_PROMPT"

  mark_done 4 "Frontend 实现完成"
  echo "   ✅ Frontend 完成"
fi

# =============================================================================
# Step 5: QA 测试编写
# =============================================================================
echo ""
echo "🔬 [5/6] QA Engineer — 编写 Playwright E2E 测试..."

if should_skip 5; then
  skip_step 5 "QA 测试编写"
else
  QA_PROMPT=$(mktemp)
  cat > "$QA_PROMPT" << 'PROMPT_END'
# 任务：编写 Phase PHASE_NUM Playwright E2E 测试

## 第一步：读取上下文文件

请依次用工具读取以下文件：
1. 技术契约：`docs/phasePHASE_NUM_contract.md`
2. 需求文档中的测试用例表：`PHASE_PLAN_PATH`
3. Phase 1 测试代码（了解测试模式）：`tests/phase1/phase1_p0.spec.ts`
4. Phase 1 隔离测试：`tests/phase1/phase1_isolation.spec.ts`

## 第二步：编写测试文件

先检查 `tests/phasePHASE_NUM/` 下是否已有测试文件，如果有则只补充缺失的测试用例。

### 测试规范：
- baseURL: http://localhost:3500
- viewport: 1440 × 900
- 密码: process.env.TEST_PASSWORD
- 禁用动画（preparePage helper）
- 使用语义定位器（getByRole, getByText, getByLabel）
- 只写不跑
PROMPT_END

  sed -i '' "s|PHASE_NUM|${PHASE}|g" "$QA_PROMPT"
  sed -i '' "s|PHASE_PLAN_PATH|${PHASE_PLAN}|g" "$QA_PROMPT"
  run_agent "petwell-qa" "$QA_PROMPT" "${CODE_DIR}/docs/phase${PHASE}_qa.log"
  rm -f "$QA_PROMPT"

  mark_done 5 "QA 测试文件写入完毕"
  echo "   ✅ 测试文件写入完毕"
fi

# =============================================================================
# Step 6: Playwright 测试执行
# =============================================================================
echo ""
echo "🎭 [6/6] 执行 Playwright 测试..."
cd "$CODE_DIR"

BACKEND_PID=""
FRONTEND_PID=""

# 清理函数
cleanup_servers() {
  echo "   🧹 清理测试服务..."
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "${BACKEND_PID:-}" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  lsof -ti:3500 | xargs kill -9 2>/dev/null || true
  lsof -ti:8080 | xargs kill -9 2>/dev/null || true
}
trap cleanup_servers EXIT

wait_for_port() {
  local PORT=$1
  local NAME=$2
  local MAX=${3:-20}
  for i in $(seq 1 $MAX); do
    sleep 1
    if curl -s --max-time 2 "http://localhost:${PORT}" > /dev/null 2>&1; then
      echo "   ✅ ${NAME} 就绪 (${i}s)"
      return 0
    fi
    echo -n "${i}."
  done
  echo ""
  echo "   ⚠️  ${NAME} 未在 ${MAX}s 内就绪，继续尝试..."
  return 0
}

# 启动后端
if lsof -ti:8080 > /dev/null 2>&1; then
  echo "   ✅ 后端已在运行 (port 8080)"
else
  echo "   🚀 启动后端 (port 8080)..."
  cd "${CODE_DIR}/backend"
  go run ./cmd/server/main.go > "${CODE_DIR}/test-results/backend.log" 2>&1 &
  BACKEND_PID=$!
  cd "$CODE_DIR"
  wait_for_port 8080 "后端"
fi

# 启动前端
if lsof -ti:3500 > /dev/null 2>&1; then
  echo "   ✅ 前端已在运行 (port 3500)"
else
  echo "   🚀 启动前端 (port 3500)..."
  cd "${CODE_DIR}/frontend"
  npx next dev --port 3500 > "${CODE_DIR}/test-results/frontend.log" 2>&1 &
  FRONTEND_PID=$!
  cd "$CODE_DIR"
  wait_for_port 3500 "前端" 30
fi

echo "   ▶ 运行 Playwright 测试..."

# 首次运行：如果快照基准不存在，先建立基准（--update-snapshots）
SNAPSHOT_DIR="tests/phase${PHASE}"
HAS_SNAPSHOTS=$(find "$SNAPSHOT_DIR" -name "*.png" 2>/dev/null | head -1)

TEST_EXIT=0
if [ -z "$HAS_SNAPSHOTS" ]; then
  echo "   📸 首次运行，建立截图基准..."
  npx playwright test "tests/phase${PHASE}/" \
    --update-snapshots \
    --reporter=list \
    2>&1 | tee "test-results/phase${PHASE}_run.log" || true
  echo "   ✅ 截图基准已建立，正式运行测试..."
fi

npx playwright test "tests/phase${PHASE}/" \
  --reporter=list \
  2>&1 | tee "test-results/phase${PHASE}_run.log" || TEST_EXIT=$?

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  mark_done 6 "Playwright 测试全部通过"
  echo "✅ 所有测试通过！提交代码并推送到 ${CURR_BRANCH}..."

  cd "$CODE_DIR"
  git add .
  git commit -m "feat(phase-${PHASE}): complete — all Playwright tests green

Agents involved:
- Architect (petwell-pm / codex gpt-5.4): API contract + system design
- Backend (petwell-backend / minimax M2.7): Go implementation
- Frontend (petwell-frontend / minimax M2.7): Next.js implementation
- QA (petwell-qa / codex gpt-5.4): Playwright E2E tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

  if [ -n "${GITHUB_REMOTE:-}" ]; then
    git push -u "$GITHUB_REMOTE" "$CURR_BRANCH"
    echo ""
    echo "🎉 Phase ${PHASE} 已成功推送到 GitHub！"
    echo "   Branch: ${CURR_BRANCH}"
  else
    git push -u origin "$CURR_BRANCH" 2>/dev/null || {
      echo "📦 代码已提交到本地分支 ${CURR_BRANCH}"
      echo "⚠️  推送失败或未配置 remote"
    }
  fi

else
  echo "❌ 测试失败！推送已阻断"
  echo "   失败日志: ${CODE_DIR}/test-results/phase${PHASE}_run.log"
  echo ""
  echo "   修复后重跑（会跳过已完成步骤）："
  echo "   ./run_phase.sh ${PHASE}"
  echo ""
  echo "   或从指定步骤重跑："
  echo "   ./run_phase.sh ${PHASE} --from 6   # 只重跑测试"
  echo "   ./run_phase.sh ${PHASE} --from 4   # 从 Frontend 重跑"
  echo "   ./run_phase.sh ${PHASE} --reset    # 全部重跑"
  exit 1
fi

update_progress
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Phase ${PHASE} 完成 ✅                                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

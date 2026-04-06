#!/bin/bash
# =============================================================================
# run_phase_tmux.sh — tmux 感知版 Phase 执行器 (v2 - 修复版)
#
# 设计原则：
#   - 控制台 pane (4) 负责实际执行所有 opencode 命令
#   - Agent pane (0-3) 只负责 tail -f 对应的日志文件，实时显示输出
#   - prompt 写入临时文件，彻底避免引号嵌套问题
#   - 用进程退出码判断完成，不 grep 中文字符串
# =============================================================================

set -e

PHASE=$1
SPEC_DIR="/Users/vfzzz/Desktop/PetWell 商家后台设计方案"
CODE_DIR="/Users/vfzzz/Desktop/petwell-merchant"
SESSION="${TMUX_SESSION:-petwell-phase${PHASE}}"
LOGS="${CODE_DIR}/docs"

if [ -f "${CODE_DIR}/.env" ]; then
  set -a
  source "${CODE_DIR}/.env"
  set +a
elif [ -f "${SPEC_DIR}/.env" ]; then
  set -a
  source "${SPEC_DIR}/.env"
  set +a
fi

PHASE_SPEC_DIR=$(ls -d "${SPEC_DIR}/Phase${PHASE}_"* 2>/dev/null | head -1)
PHASE_PLAN="${PHASE_SPEC_DIR}/Phase${PHASE}_详细计划.md"
PREV_BRANCH=$([ "$PHASE" -eq 1 ] && echo "main" || echo "phase-$((PHASE-1))")
CURR_BRANCH="phase-${PHASE}"

# =============================================================================
# Step 0: 准备目录和分支
# =============================================================================
mkdir -p "${LOGS}" "${CODE_DIR}/test-results" "${CODE_DIR}/tests/phase${PHASE}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  PetWell Phase ${PHASE} — Agent Team 启动               ║"
echo "║  Branch: ${CURR_BRANCH}  (from: ${PREV_BRANCH})           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

cd "$CODE_DIR"
git checkout "$PREV_BRANCH" 2>/dev/null || true
git checkout -b "$CURR_BRANCH" 2>/dev/null || git checkout "$CURR_BRANCH"
cd "$SPEC_DIR"

# =============================================================================
# 让 Agent pane 进入 tail -f 模式（实时显示各自的日志）
# =============================================================================
tmux send-keys -t "${SESSION}:team.0" "C-c" ""   # 中断之前的 echo
tmux send-keys -t "${SESSION}:team.1" "C-c" ""
tmux send-keys -t "${SESSION}:team.2" "C-c" ""
tmux send-keys -t "${SESSION}:team.3" "C-c" ""
sleep 0.5

# 初始化日志文件（touch 确保 tail 不报错）
touch "${LOGS}/phase${PHASE}_arch.log" \
      "${LOGS}/phase${PHASE}_backend.log" \
      "${LOGS}/phase${PHASE}_frontend.log" \
      "${LOGS}/phase${PHASE}_qa.log"

tmux send-keys -t "${SESSION}:team.0" \
  "echo '=== Architect (codex) — 等待开始 ===' && tail -f ${LOGS}/phase${PHASE}_arch.log" Enter
tmux send-keys -t "${SESSION}:team.1" \
  "echo '=== Backend (kimi) — 等待 Architect 完成 ===' && tail -f ${LOGS}/phase${PHASE}_backend.log" Enter
tmux send-keys -t "${SESSION}:team.2" \
  "echo '=== Frontend (minimax) — 等待 Architect 完成 ===' && tail -f ${LOGS}/phase${PHASE}_frontend.log" Enter
tmux send-keys -t "${SESSION}:team.3" \
  "echo '=== QA (kimi) — 等待编码完成 ===' && tail -f ${LOGS}/phase${PHASE}_qa.log" Enter

# =============================================================================
# Step 1: Architect — prompt 写文件，避免引号地狱
# =============================================================================
ARCH_PROMPT="${LOGS}/phase${PHASE}_arch_prompt.txt"
cat > "$ARCH_PROMPT" << PROMPT
请仔细阅读以下需求文档，然后输出完整的技术契约。

需求文档路径：${PHASE_PLAN}

请将完整技术契约输出到文件：${CODE_DIR}/docs/phase${PHASE}_contract.md

技术契约必须包含以下内容：
1. 所有 API 端点（HTTP方法、路径、请求/响应 JSON 格式、错误码列表）
2. 数据库表结构（Go GORM struct 完整定义，含所有字段、类型、tag）
3. 状态机定义（所有状态枚举值、合法流转矩阵表格）
4. 前端组件树（页面路由、主要组件层级、Zustand store 结构）
5. 前后端 JSON 字段对照表（snake_case 后端 vs camelCase 前端）

请先阅读文件再开始写契约，确保覆盖需求文档中的所有功能点。
PROMPT

echo "📐 [1/4] Architect (codex) 开始分析需求..."
opencode run \
  --agent petwell-pm \
  --dir "$CODE_DIR" \
  "$(cat "$ARCH_PROMPT")" \
  2>&1 | tee "${LOGS}/phase${PHASE}_arch.log"

echo ""
if [ ! -f "${CODE_DIR}/docs/phase${PHASE}_contract.md" ]; then
  echo "⚠️  Architect 未生成契约文件，将使用日志内容继续..."
  # 把 arch log 内容复制为契约（兜底方案）
  cp "${LOGS}/phase${PHASE}_arch.log" "${CODE_DIR}/docs/phase${PHASE}_contract.md"
fi
echo "✅ [1/4] Architect 完成"

# =============================================================================
# Step 2 & 3: Backend + Frontend — 并行执行
# =============================================================================
BE_PROMPT="${LOGS}/phase${PHASE}_be_prompt.txt"
cat > "$BE_PROMPT" << PROMPT
请读取以下技术契约文件，然后实现 Phase ${PHASE} 的全部 Go 后端代码。

技术契约：${CODE_DIR}/docs/phase${PHASE}_contract.md

将所有代码文件写入 ${CODE_DIR}/backend/ 目录，包括：
- models/     : 所有 GORM 数据模型（必须含 TenantID、CreatedAt、UpdatedAt 字段）
- handlers/   : 所有 HTTP API 处理函数（含请求参数验证、错误处理）
- middleware/ : Session 鉴权中间件、租户隔离中间件
- tests/      : 每个 handler 的 Go 单元测试
- routes.go   : 路由注册

关键约束（必须遵守）：
1. 所有数据库查询加 WHERE tenant_id = ? 条件
2. 状态变更操作必须通过状态机函数校验合法性，非法流转返回 400
3. app_sync_queue 写入必须在同一个数据库事务内完成
4. 所有 handler 返回统一的 JSON 结构 { "code": 0, "data": ..., "message": "ok" }
PROMPT

FE_PROMPT="${LOGS}/phase${PHASE}_fe_prompt.txt"
cat > "$FE_PROMPT" << PROMPT
请读取以下技术契约文件，然后实现 Phase ${PHASE} 的全部 Next.js 前端代码。

技术契约：${CODE_DIR}/docs/phase${PHASE}_contract.md

将所有代码文件写入 ${CODE_DIR}/frontend/ 目录，包括：
- app/           : Next.js 15 页面（App Router，含 loading.tsx、error.tsx）
- components/    : 可复用 React 组件（TailwindCSS 样式）
- store/         : Zustand stores（严格按契约中的 store 结构）
- lib/api.ts     : 后端 API 客户端（所有 fetch 调用统一封装在这里）

关键约束（必须遵守）：
1. 绝对不能在页面组件里直接写 fetch，必须调用 lib/api.ts 中的函数
2. 所有页面要有 loading 状态和错误状态处理
3. JSON 字段使用 camelCase（对应后端 snake_case，在 api.ts 里做转换）
4. 响应式布局，最小支持 375px 宽度（手机端）
PROMPT

echo ""
echo "⚙️  [2/4] Backend (kimi) + Frontend (minimax) 并行编码..."

# 并行执行，输出到各自日志（agent pane 正在 tail -f 这些日志）
opencode run \
  --agent petwell-backend \
  --dir "$CODE_DIR" \
  "$(cat "$BE_PROMPT")" \
  2>&1 | tee "${LOGS}/phase${PHASE}_backend.log" &
BE_PID=$!

opencode run \
  --agent petwell-frontend \
  --dir "$CODE_DIR" \
  "$(cat "$FE_PROMPT")" \
  2>&1 | tee "${LOGS}/phase${PHASE}_frontend.log" &
FE_PID=$!

# 等待两者都完成
wait $BE_PID && echo "✅ Backend 完成" || echo "⚠️  Backend 退出码非零，继续..."
wait $FE_PID && echo "✅ Frontend 完成" || echo "⚠️  Frontend 退出码非零，继续..."
echo "✅ [2/4] 编码阶段完成"

# =============================================================================
# Step 4: QA — 编写 Playwright 测试
# =============================================================================
QA_PROMPT="${LOGS}/phase${PHASE}_qa_prompt.txt"
cat > "$QA_PROMPT" << PROMPT
请读取技术契约和 Phase 详细计划，然后编写 Playwright E2E 测试。

技术契约：${CODE_DIR}/docs/phase${PHASE}_contract.md
Phase 详细计划（含测试用例）：${PHASE_PLAN}

将测试文件写入 ${CODE_DIR}/tests/phase${PHASE}/ 目录：
- phase${PHASE}_p0.spec.ts       : 所有 P0 级核心功能测试
- phase${PHASE}_isolation.spec.ts : 多租户数据隔离测试

测试要求：
1. 使用 @playwright/test，TypeScript，baseURL 为 http://localhost:3500
2. 多租户隔离测试：用两个不同 tenantId 的账号分别操作，断言数据不互通
3. 状态机测试：测试合法流转（应成功）和非法流转（应返回 400）
4. 每个核心页面至少一个截图断言（page.screenshot 比较或 toMatchSnapshot）
5. 不要在测试文件里 hardcode 任何真实密码，使用 process.env.TEST_PASSWORD
PROMPT

echo ""
echo "🔬 [3/4] QA (kimi) 编写 Playwright 测试..."
opencode run \
  --agent petwell-qa \
  --dir "$CODE_DIR" \
  "$(cat "$QA_PROMPT")" \
  2>&1 | tee "${LOGS}/phase${PHASE}_qa.log"

echo "✅ [3/4] QA 测试文件写入完毕"

# =============================================================================
# Step 5: 执行 Playwright 测试
# =============================================================================
echo ""
echo "🎭 [4/4] 执行 Playwright 测试..."
cd "$CODE_DIR"

TEST_EXIT=0
npx playwright test "tests/phase${PHASE}/" \
  --reporter=list \
  2>&1 | tee "test-results/phase${PHASE}_run.log" || TEST_EXIT=$?

# =============================================================================
# Step 6: 判断结果
# =============================================================================
echo ""
if [ $TEST_EXIT -eq 0 ]; then
  echo "✅ 所有测试通过！提交并推送到 ${CURR_BRANCH}..."
  cd "$CODE_DIR"
  git add .
  git commit -m "feat(phase-${PHASE}): complete — all Playwright tests green

Agents:
- Architect (codex/gpt-5.4): API contract + system design
- Backend   (kimi/k2.5-thinking): Go implementation
- Frontend  (minimax/M2.7): Next.js implementation
- QA        (kimi/k2.5-thinking): Playwright E2E passed"

  if [ -n "$GITHUB_REMOTE" ]; then
    git push -u origin "$CURR_BRANCH"
    echo ""
    echo "🎉 Phase ${PHASE} 已推送到 GitHub → branch: ${CURR_BRANCH}"
    for pane in 0 1 2 3; do
      tmux send-keys -t "${SESSION}:team.${pane}" "" ""
      tmux send-keys -t "${SESSION}:team.${pane}" "echo ''" Enter
      tmux send-keys -t "${SESSION}:team.${pane}" "echo '🎉 Phase ${PHASE} 推送成功 → ${CURR_BRANCH}'" Enter
    done
  fi
else
  echo ""
  echo "❌ 测试失败，推送已阻断"
  echo "   日志: ${CODE_DIR}/test-results/phase${PHASE}_run.log"
  exit 1
fi

#!/bin/bash
# =============================================================================
# PetWell Agent Team — tmux 可视化监控面板
#
# 用法：
#   ./tmux_team.sh <phase_num>
#   例：./tmux_team.sh 1
#
# 布局：
#   ┌─────────────────┬─────────────────┐
#   │  📐 Architect   │  ⚙️  Backend    │
#   │   (codex)       │   (kimi)        │
#   ├─────────────────┼─────────────────┤
#   │  🖥  Frontend   │  🔬 QA          │
#   │   (minimax)     │   (kimi)        │
#   ├─────────────────┴─────────────────┤
#   │  📊 Pipeline 控制台（主进程）      │
#   └───────────────────────────────────┘
# =============================================================================

PHASE=$1
SESSION="petwell-phase${PHASE}"
SPEC_DIR="/Users/vfzzz/Desktop/PetWell 商家后台设计方案"
CODE_DIR="/Users/vfzzz/Desktop/petwell-merchant"

if [ -z "$PHASE" ] || ! [[ "$PHASE" =~ ^[1-5]$ ]]; then
  echo "❌ 用法: ./tmux_team.sh <1-5>"
  exit 1
fi

# 如果 session 已存在，直接 attach
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "📺 Session $SESSION 已存在，直接连接..."
  tmux attach-session -t "$SESSION"
  exit 0
fi

echo "🚀 启动 PetWell Phase ${PHASE} 监控面板..."

# ── 创建 session，第一个窗口叫 "team" ──
tmux new-session -d -s "$SESSION" -n "team" -x 220 -y 50

# ── 关键：开启鼠标支持（滚轮滚动、点击切换 pane）──
tmux set-option -t "$SESSION" mouse on

# ── 开启大滚动历史，方便回看日志 ──
tmux set-option -t "$SESSION" history-limit 50000

# ── 切割成 5 个 pane ──
tmux split-window -h -t "$SESSION:team"
tmux split-window -v -t "$SESSION:team.0"
tmux split-window -v -t "$SESSION:team.1"
tmux split-window -v -t "$SESSION:team.0" -l 12

# ── 给每个 pane 写入标题（纯 echo，不用 printf 转义）──
tmux send-keys -t "$SESSION:team.0" "echo '=== Architect (codex/gpt-5.4) ===' && echo '等待 Pipeline 启动...'" Enter
tmux send-keys -t "$SESSION:team.1" "echo '=== Backend (kimi/k2.5) ===' && echo '等待 Architect 完成...'" Enter
tmux send-keys -t "$SESSION:team.2" "echo '=== Frontend (minimax/M2.7) ===' && echo '等待 Architect 完成...'" Enter
tmux send-keys -t "$SESSION:team.3" "echo '=== QA (kimi/k2.5-thinking) ===' && echo '等待编码完成...'" Enter

# ── Pane 4: 控制台启动 Pipeline ──
tmux send-keys -t "$SESSION:team.4" \
  "cd \"${SPEC_DIR}\" && TMUX_SESSION=${SESSION} bash run_phase_tmux.sh ${PHASE}" Enter

# ── 创建第二个窗口：Git 状态监控 ──
tmux new-window -t "$SESSION" -n "git"
tmux send-keys -t "$SESSION:git" \
  "cd ${CODE_DIR} && watch -n 5 'echo \"=== Git 状态 ===\"; git log --oneline -10; echo; echo \"=== 文件变动 ===\"; git status --short'" Enter

# ── 创建第三个窗口：测试结果 ──
tmux new-window -t "$SESSION" -n "tests"
tmux send-keys -t "$SESSION:tests" \
  "cd ${CODE_DIR} && echo '等待 Playwright 测试结果...' && \
   while true; do \
     if [ -f test-results/phase${PHASE}_run.log ]; then \
       clear; echo '=== Phase ${PHASE} 测试结果 ==='; cat test-results/phase${PHASE}_run.log; \
     fi; \
     sleep 3; \
   done" Enter

# ── 切回主 team 窗口 ──
tmux select-window -t "$SESSION:team"
tmux select-pane -t "$SESSION:team.4"

# ── pane 边框显示（用固定文字，不依赖 pane_title）──
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " Pane #{pane_index} "

# ── attach ──
tmux attach-session -t "$SESSION"

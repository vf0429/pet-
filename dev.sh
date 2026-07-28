#!/bin/bash
# 同时启动前端 (Next.js) 和后端 (Go) 开发服务器
# 按 Ctrl+C 可同时停止两个进程

trap 'kill 0; exit' INT TERM

echo "🚀 Starting Pawrd Merchant dev servers..."
echo ""

# 清理已占用端口的残留进程，避免重复启动时 bind 失败
for PORT in 8080 3500; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "⚠️  Port $PORT is in use. Killing previous processes: $PIDS"
    kill $PIDS 2>/dev/null
    sleep 1
  fi
done

# 清除 Next.js 过时 build 缓存（避免 ENOENT: .next/server/app/.../page.js）
if [ -d "frontend/.next" ]; then
  echo "🧹 Clearing stale .next cache..."
  rm -rf frontend/.next
fi

# 启动后端 (Go, port 8080)
(cd backend && go run cmd/server/main.go) &
BACKEND_PID=$!
echo "⏳ Backend compiling & starting on http://localhost:8080  (PID: $BACKEND_PID)"

# 等待后端就绪（最多 60 秒），避免前端启动后用户立即登录触发网络错误
echo -n "   Waiting for backend..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8080/v1/merchant/auth/login -X POST \
      -H "Content-Type: application/json" \
      -d '{}' > /dev/null 2>&1; then
    echo " ready!"
    break
  fi
  # 也接受 400/401 响应（说明服务已在监听）
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      http://localhost:8080/v1/merchant/auth/login -X POST \
      -H "Content-Type: application/json" -d '{}' 2>/dev/null)
  if [ "$HTTP_CODE" != "000" ] && [ -n "$HTTP_CODE" ]; then
    echo " ready! (HTTP $HTTP_CODE)"
    break
  fi
  echo -n "."
  sleep 1
done

# 启动前端 (Next.js, port 3500)
(cd frontend && npm run dev -- --port 3500) &
FRONTEND_PID=$!
echo "✅ Frontend starting on http://localhost:3500  (PID: $FRONTEND_PID)"

echo ""
echo "Press Ctrl+C to stop both servers."

wait

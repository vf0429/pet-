#!/bin/bash
# 同时启动前端 (Next.js) 和后端 (Go) 开发服务器
# 按 Ctrl+C 可同时停止两个进程

trap 'kill 0; exit' INT TERM

echo "🚀 Starting PetWell Merchant dev servers..."
echo ""

# 清除 Next.js 过时 build 缓存（避免 ENOENT: .next/server/app/.../page.js）
if [ -d "frontend/.next" ]; then
  echo "🧹 Clearing stale .next cache..."
  rm -rf frontend/.next
fi

# 启动后端 (Go, port 8080)
(cd backend && go run cmd/server/main.go) &
BACKEND_PID=$!
echo "✅ Backend starting on http://localhost:8080  (PID: $BACKEND_PID)"

# 启动前端 (Next.js, port 3500)
(cd frontend && npm run dev -- --port 3500) &
FRONTEND_PID=$!
echo "✅ Frontend starting on http://localhost:3500  (PID: $FRONTEND_PID)"

echo ""
echo "Press Ctrl+C to stop both servers."

wait

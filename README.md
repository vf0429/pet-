# Pawrd Merchant

## 启动

支持 macOS。全新电脑只需在项目根目录运行：

```bash
chmod +x start.sh
./start.sh
```

脚本会自动安装 Homebrew（如缺失）、Go 和 Node.js，下载后端与前端依赖，然后同时启动：

- Merchant 前端：`http://localhost:3500/login`
- Merchant API：`http://localhost:8080`

本地首次启动会自动创建 SQLite 数据库和演示数据，无需 PostgreSQL 或 `.env`。演示登录：

```text
邮箱：owner@happypaws.com
密码：Test123!
```

按 `Ctrl + C` 会同时停止前端和后端。

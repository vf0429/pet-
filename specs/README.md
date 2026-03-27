# PetWell 商家端后台 — 阶段性开发计划

> 版本：v1.0  |  日期：2026-03-24
>
> 本文件夹包含商家端后台（Shop + Clinic）的完整分阶段设计与开发计划。

---

## 文件夹结构

```
PetWell 商家后台设计方案/
├── README.md                    ← 你在这里
├── Phase1_基础框架/              ← 认证 + 租户 + Layout 骨架
├── Phase2_Shop后台/              ← 商品/订单/服务排期
├── Phase3_Clinic后台/            ← 预约/病历/保险/药房
├── Phase4_App联调/               ← 实时同步 + 端到端测试
├── Phase5_数据分析/              ← Analytics 可视化（可选）
└── 测试报告/                     ← 各 Phase 测试报告归档
```

## 各 Phase 预计周期

| Phase | 内容 | 参与角色 |
|-------|------|---------|
| Phase 1 | 基础框架 | Architect + Frontend + Backend + QA |
| Phase 2 | Shop 后台 | Frontend + Backend + QA |
| Phase 3 | Clinic 后台 | Frontend + Backend + QA |
| Phase 4 | App 联调 | 全员 |
| Phase 5 | 数据分析 | Frontend + 可选 |

## 关键原则

1. 每个 Phase 结束必须有 QA 签收测试报告才能进入下一个 Phase
2. 所有表结构从第一天按 Supabase 生产标准设计（含 tenant_id）
3. 商家后台永远不直连数据库，只通过 Go 后端 API 交互

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

物资点收领用平台 — 企业内部物资入库（点收）和出库（领用）管理工具。业务流程：发票上传解析 → 点收单 → 领用单 → Excel 导出。

## Architecture

### Backend (Flask + SQLAlchemy + PostgreSQL/SQLite)

```
app.py                     — Flask 入口, before_request 认证拦截, 模块顶层 init_db(含30次PG重试)
config.py                  — SECRET_KEY 自动生成(.secret_key文件), 14个仓库/8位人员/4个工程默认数据
database.py                — db = SQLAlchemy(), init_db(app), Alembic检测(create_all降级)
models.py                  — 14个数据模型, 金额用Numeric(14,2), 数量用Numeric(14,3)
exceptions.py              — BusinessError / AuthError / ForbiddenError / NotFoundError / ConflictError
logging_config.py          — RotatingFileHandler 日志轮转 (10MB×30天)

routes/                    # 所有 API 使用 /api/v1/ 前缀
  auth.py                  — 登录/登出/用户 CRUD, 单点登录session_token, 旧SHA256自动升级
  invoice.py               — 发票上传解析(PDF/JPG/PNG, 含格式白名单校验)
  receiving.py             — 点收单 CRUD + 导出/打印 + 乐观锁(version字段)
  use_note.py              — 领用单 CRUD + 导出/打印 + 乐观锁
  inventory.py             — 库存台账 (物化表, stale标记自动重建)
  dashboard.py             — 仪表盘统计 (从 config_api 拆分)
  config_api.py            — 仓库/工程/人员/供应商/报表/日志/系统设置

repositories/              # SQL 查询集中管理
  receiving_repository.py  — 未领完ID/已领用明细/仓库名称/最早领用日期查询
  report_repository.py     — 仪表盘统计/月度汇总/多维报表/收发存查询
  inventory_repository.py  — 物化表查询/仓库名称映射

parsers/                   # 发票解析策略模式(四级回退: PDF→OCR→Mock→空模板)
  base_parser.py           — 抽象基类 + 共享解析函数(正则/表格提取/名称拆分)
  pdf_parser.py            — PDF(pdfplumber) 文本提取策略
  ocr_parser.py            — JPG/PNG(tesseract.js) OCR策略
  mock_parser.py           — 文件名关键词匹配 Mock + 通用空模板回退
  parser_factory.py        — 策略工厂(按扩展名选择解析器)

services/
  invoice_parser.py        — 解析门面(委托给 parsers/ 策略)
  ocr_worker.js            — tesseract.js 包装, 被 Python subprocess 调用
  warehouse_matcher.py     — 关键词匹配仓库分类(14个固定分类)
  warehouse_cache.py       — 仓库数据 LRU 缓存(避免每次全查Warehouse表)
  counter.py               — 单据编号按月流水(PG用SELECT FOR UPDATE悲观锁)
  excel_generator.py       — 点收单/领用单/批量导出/报表Excel生成(openpyxl)
  inventory_mv.py          — 库存物化表 rebuild/mark_stale
  operation_log.py         — log_operation() 只add不commit, 由调用方统一提交
  db_helpers.py            — SQLite/PostgreSQL兼容抽象(month_expr/is_sqlite)
  file_cleaner.py          — 孤儿文件扫描清理(未被发票引用的上传文件)
```

### Frontend (SPA, 无框架, 原生 JS)

```
templates/
  index.html               — SPA主页面(Jinja2 include拆分)
  login.html               — 登录页(调用 /api/v1/auth/login)
  partials/
    head.html              — CDN引入(Flatpickr/Chart.js) + app.js/autocomplete.js
    topbar.html            — 顶部导航栏
    sidebar.html           — 左侧菜单(8个Tab)
    detail_panel.html      — 右侧详情面板(会话/快捷操作/最近记录)
    scripts.html           — 状态栏 + JS初始化 + 7个功能模块script引入
  tabs/
    dashboard.html         — 数据看板(统计卡片+Chart.js图表)
    import.html            — 发票导入(拖拽/解析/编辑/生成点收单)
    receiving.html         — 点收单(列表/详情/编辑/打印/导出/生成领用单)
    use_note.html          — 领用单(列表/详情/编辑/打印/导出)
    invoices.html          — 发票列表(已确认的历史发票)
    inventory.html         — 库存台账(物化表/多选仓库筛选)
    config.html            — 基础配置(7个子页签)
    reports.html           — 汇总报表(明细/按仓库/按工程/按供应商)

static/js/                 # 每个功能一个全局对象(揭示模块模式)
  app.js                   — APP全局状态/toast/confirm/switchTab/exitEditGuard/renderPagination(事件委托)
  autocomplete.js          — 仓库/工程/人员搜索联想 + 多选下拉组件
  dashboard.js             — 仪表盘统计卡片 + Chart.js 仓库入库柱状图 + 月度趋势折线图
  invoice.js               — 发票上传解析/表单编辑/含税切换/批量模式
  receiving.js             — 点收单列表/详情/编辑(已领用只读)/打印(iframe)/生成领用单
  use_note.js              — 领用单列表/详情/编辑/打印(iframe)
  inventory.js             — 库存台账表格/多选仓库筛选/导出
  config.js                — 7个子页签(仓库/工程/人员/供应商/用户/日志/设置)
  report.js                — 多维报表(明细/按仓库收发存/按工程/按供应商) + 打印(iframe)
static/css/app.css         — 全局SPA样式(卡片/表格/模态框/响应式)
```

### Dual Database Compatibility

`db_helpers.py` 提供数据库方言抽象层：
- `month_expr(col)` → SQLite: `strftime('%Y-%m', col)` / PG: `to_char(col::date, 'YYYY-MM')`
- `_is_sqlite()` / `_is_postgres()` → 运行时驱动检测
- SQLite: WAL模式 + busy_timeout; PG: 连接池(pool_size=5, pool_recycle=300)
- 计数器: PG用 SELECT FOR UPDATE 悲观锁, SQLite 用 ORM 递增

## Key Business Rules

| 规则 | 实现位置 |
|------|----------|
| **编号格式** D{YY}-{M}-{seq} / L{YY}-{M}-{seq}, 按月重置 | `counter.py` |
| **点收→领用** 支持多次出库, UseItem.receiving_item_id 精确追溯 | `receiving.py` |
| **已领用保护** 出库条目编辑时只读, 不可删除 | `receiving.py:update()`, `_compute_used_item_ids` |
| **金额逻辑** 数量和金额为主, unit_price = amount / quantity 后端反算 | `receiving.py`, `use_note.py` |
| **日期校验** 点收 >= 发票; 领用 >= 点收 | `receiving.py`, `use_note.py` |
| **乐观锁** UPDATE ... SET version+=1 WHERE version=:v, 409冲突 | `receiving.py`, `use_note.py` |
| **月份锁定** 非管理员不能操作上月及以前单据 | 前后端双重检查 |
| **引用保护** 工程/人员/用户被单据引用时禁止删除 | `config_api.py` |
| **仓库** 14个固定分类, 仅管理员可编辑关键词, 不可新增/删除 | `config_api.py` |
| **权限控制** 非管理员不能改/删他人单据(created_by), 月份锁定 | `_can_modify()`, 前端 toggleEdit/deleteNote |
| **单点登录** session_token 比对, 一处登录踢掉另一处 | `auth.py` |
| **操作日志** 所有 create/update/delete/export 自动记录 | `log_operation()` 只add不commit |
| **供应商同步** 点收创建时自动写入供应商名录 | `receiving.py:create()` |
| **库存物化** SystemConfig(key=inventory_stale) 标记过期, 查询时自动重建 | `inventory_mv.py` |
| **人员校验** 记账人/采购员/领用人必须在 personnel 表中, 否则提示添加 | `receiving.js`, `use_note.js` 保存前校验 |
| **搜索清除** 搜索框右侧 × 清除按钮(ms-clear-all 样式) | `enableClearButton()` in app.js |
| **发票解析** PDF→OCR→Mock文件名→空模板, 四级回退策略 | `parser_factory.py` |

## API Routes

```
/api/v1/auth/login|logout|whoami
/api/v1/auth/users (GET|POST|PUT|DELETE)              — 仅admin
/api/v1/invoice/parse (POST), /api/v1/invoice/list, /api/v1/invoice/<id> (GET|file)
/api/v1/receiving-notes (GET|POST|PUT|DELETE)          — 单张/批量导出
/api/v1/use-notes (GET|POST|PUT|DELETE)                — from-receiving批量生成
/api/v1/inventory (GET|export|rebuild)
/api/v1/projects|personnel CRUD                    — 创建/编辑所有用户, 删除仅admin
/api/v1/suppliers|warehouses CRUD                  — 写入操作仅admin
/api/v1/dashboard/stats (GET)
/api/v1/reports/monthly|query|warehouse-print (GET)
/api/v1/reports/query/export (GET)
/api/v1/counter/next, /api/v1/init-data, /api/v1/logs (GET|export)
/api/v1/settings (GET|PUT), /api/v1/cleanup/scan|execute
```

## Running the Project

```bash
# 依赖安装
pip install -r requirements.txt

# 本地开发 (Flask dev server, 默认 localhost:5000)
python app.py

# 运行测试
python -m pytest tests/ -v

# 数据库迁移 (Alembic)
alembic revision --autogenerate -m "描述"
alembic upgrade head

# 生产部署 (gunicorn)
gunicorn --bind 0.0.0.0:5000 --workers 4 --timeout 120 app:app
```

- **数据库**: 默认 PostgreSQL (`postgresql://invoice:Invoice%402026!@localhost:5432/invoice`)
- **回退 SQLite**: `DATABASE_URL=sqlite:///data.db`
- **管理员**: swingtt / swing208blue (admin 账号已禁用)
- `app.py` 初始化时 30 次×2秒 PG 连接重试, 超时则退出
- **SECRET_KEY**: 优先环境变量, 其次 `.secret_key` 文件, 首次自动生成(已在.gitignore)
- **Flask 开发服务器**: `app.run(threaded=True)` 多线程, 避免下载/解析排队
- **部署包打包**: 用 `--xform` 加 `invoice-deploy/` 前缀目录, 匹配 `update.sh` 的 `--strip-components=1`

## Docker Deployment

```bash
# 构建部署包（带 invoice-deploy/ 前缀目录）
cd /c/Users/Administrator/CC
tar -czf 发票点收领用系统_v0.40/invoice-deploy.tar.gz \
  --xform="s|^发票点收领用系统_v0.40|invoice-deploy|" \
  发票点收领用系统_v0.40

# 群晖部署
scp invoice-deploy.tar.gz user@synology:/volume1/docker/invoice-deploy/
cd /volume1/docker/invoice-deploy/
bash deploy.sh          # 首次部署
bash update.sh          # 后续更新（不碰 pgdata/ uploads/）

# Docker 端口: 127.0.0.1:5001:5000（仅本地监听，nginx 反向代理到 1135）
# 外部访问: https://www.tjghaz.com:1135
```

## Current Permission Rules

| 操作 | 管理员 | 普通用户 |
|------|--------|---------|
| 点收单/领用单 CRUD | 全部 | 仅自己的（created_by 匹配） |
| 工程/人员 添加编辑 | ✅ | ✅ |
| 工程/人员 删除 | ✅ | ❌ |
| 供应商/仓库 写操作 | ✅ | ❌ |
| 操作日志/用户管理 | ✅ | 页签隐藏 |

## Important Implementation Details

- **认证流程**: before_request 校验 session + 单点登录 token → 白名单放行(不含/uploads) → `/api/v1/` 返回JSON错误, 页面请求跳转 `/login`
- **前端 SPA 初始化**: DOMContentLoaded → initApp() → whoami → init-data → settings → loadRecent → switchTab('dashboard') → DashboardModule.load()
- **金额字段**: 数据库用 Numeric 精确存储, API 返回时转为 float, 导出 Excel 时 openpyxl 直接处理 Decimal
- **打印功能**: 全部改为隐藏 `<iframe>` 方式, 避免 `window.open` 劫持主页面焦点
- **退出编辑保护**: `exitEditGuard()` + `beforeunload` 阻止误关闭未保存编辑
- **Flatpickr**: 所有日期字段统一使用, locale=zh, format=Y-m-d
- **仓库匹配**: 关键词+电子发票分类前缀双匹配, 取多数匹配结果
- **乐观锁**: 点收单/领用单均有 version 字段, 更新时原子自增, 前端收到409需刷新
- **月份锁定**: 非管理员不能操作上月及以前单据, 前端进入编辑前即检查, 后端双重校验
- **分页组件**: renderPagination 使用 data-page 属性 + 事件委托(非 inline onclick)
- **仓库缓存**: warehouse_cache.py 用 LRU 缓存, warehouse 关键词更新后自动 invalidate

## Security Notes

- SECRET_KEY 自动生成并持久化到 `.secret_key` 文件(已在.gitignore)
- `/uploads` 路径不在白名单中, 导出文件下载需登录认证
- 供应商/仓库的写入操作需要 admin 权限；工程/人员的 create/update 所有用户均可，delete 仅 admin
- 用户管理、系统设置、操作日志、文件清理、库存重建 仅 admin 可操作
- 文件上传限制扩展名: pdf/jpg/jpeg/png 白名单
- 密码使用 werkzeug PBKDF2-SHA256 哈希存储, 旧SHA256登录时自动升级
- 登录频率限制: 每IP 5分钟内10次尝试, 超出后锁定5分钟
- Session 配置: HTTPONLY=True, SameSite=Lax

## Versioning

- 新版本: `cp -r` 完整项目目录到 `发票点收领用系统_v{version}`
- `更新记录.txt`: 每次代码修改后追加变更记录（日期/改动/原因）
- 数据库备份: pg_dump 或 SQLite 文件保存到版本目录

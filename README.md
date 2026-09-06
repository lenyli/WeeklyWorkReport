# 智慧云影研发部工作周报

通用权限、Git、验证/出包、记录与镜像规则统一遵循 [总规则](../CLAUDE.md)；本文件只补充项目事实和更严格的产品边界。当前进度见 [CURRENT_STATUS.md](CURRENT_STATUS.md)。

这是一个使用浏览器本地数据库占位的 PWA 周报工具。成员可以填写、保存草稿并提交周报；leader 可以查看账号、提交情况并生成汇总 Excel。

当前阶段、限制和下一步统一见 [`CURRENT_STATUS.md`](CURRENT_STATUS.md)。

## 项目结构与核心模块

```text
WWR/
├── index.html                # 单页应用 HTML 结构与入口
├── app.js                    # UI 交互、周报填写与汇总业务逻辑
├── db.js                     # 可替换的数据抽象访问层（IndexedDB / localStorage）
├── styles.css                # 样式与响应式布局
├── sw.js                     # Service Worker 离线缓存
├── manifest.webmanifest      # PWA 配置与应用清单
├── icons/                    # PWA 应用图标
├── outputs/                  # 汇总 Excel 生成与导出目录
└── CURRENT_STATUS.md         # 唯一当前状态文档
```

- **核心模块**：
  - **db.js 数据边界**：封装 IndexedDB 账号与正式提交存储、localStorage 草稿存储，作为后续云端化的替换边界；
  - **app.js 业务引擎**：成员登录、周一日期自动推算、周报提交覆盖、Leader 视图与 Excel 解析组装；
  - **sw.js 离线层**：静态资源离线缓存与安装支持。
- **正式入口**：`index.html`。
- **数据事实源**：当前浏览器实例的 IndexedDB 与 localStorage。

## 架构约束

```text
index.html + app.js → db.js → IndexedDB
         ↘ localStorage（草稿与兼容状态）
         ↘ sw.js（离线缓存）→ 静态托管
```

- **本地优先与数据隔离**：当前版本为单浏览器本地模拟 MVP，数据保存在各自浏览器的 IndexedDB 中，多设备间不自动同步。
- **数据访问收口**：所有数据读写必须通过 `db.js` 进行，严禁在 `app.js` 中直接裸写 IndexedDB 操作。
- **纯静态无服务端**：当前无后端 API、无共享数据库、无真实服务端身份认证；未获明确多人共享需求前不擅自引入云端后端。
- **缓存版本同步**：静态文件变动必须同步递增 `sw.js` 缓存版本。

## 编码规范

通用编码规则遵循 `/Volumes/Leny/Projects/CLAUDE.md`。

本项目补充：
- **纯原生 Web 技术**：标准 HTML5 / CSS3 / 原生 ES6+ JavaScript，无外部打包器与构建依赖；
- **离线 PWA 规范**：遵循 `skills/pwa-app/SKILL.md` 规范；
- **接口防腐**：保持 `db.js` 接口签名稳定，确保未来云端 API 平滑替换。

## 构建、测试与格式化

### 本地运行与预览

- 纯静态项目，无构建步骤。在项目根运行：
  ```bash
  python3 -m http.server 8000
  ```
  浏览器打开 `http://localhost:8000` 即可预览与测试。

### 测试与语法检查

- **JavaScript 语法检查**：
  ```bash
  node -c app.js db.js sw.js
  ```

### 格式化与检查

- 当前无独立强制格式化工具；不要为了 README 整理自行引入 formatter。

## 填写与汇总业务流程

- **填写周报**：
  1. 使用姓名和六位数字密码登录（新用户首登初始密码 `123456` 并自动注册）；
  2. 自动选定本周一日期（可手动切换周），填写周一至周五内容；
  3. 点击“提交周报”覆盖本人该周记录；支持离线草稿自动保存。
- **汇总周报**：
  1. 使用 leader 账号登录（初始“周南”/`123456`）；
  2. 选择目标周一，查看提交名单，可上传旧版 Excel 补录；
  3. 点击“导出 Excel”生成按姓名首字母分 Sheet 的汇总文件。

## 禁止修改与受保护路径

- **禁止修改**：
  - 当前没有额外的项目内绝对禁止目录；仍不得修改本项目范围之外的文件；
- **只读事实源**：
  - 用户在浏览器中填写的真实周报数据；
- **生成物 / 不得手改**：
  - `outputs/` 下生成的 Excel 文件；
- **修改前需用户授权**：
  - `db.js` 数据契约重构、云端多人架构改造方案。

## 权限与安全策略

- **浏览器沙盒保护**：纯前端运行，不向任何第三方服务发送周报或账号数据；
- **密码机制说明**：本地六位密码仅用于 MVP 流程模拟，上线云端时必须在服务端使用专用加盐哈希；

## 任务验收标准

以下构建、测试、运行和交付项仅在用户按总规则明确开启相应阶段时适用；默认代码阶段只做静态自检并交付源码。

1. **静态缓存同步**：静态资源修改后已同步更新 `sw.js` 缓存版本；
2. **语法检查通过**：JavaScript 脚本通过 `node -c` 语法检查；
3. **人工验收标记**：周报填报流、Excel 导出内容与离线安装需明确标记为“待用户验收”，不得冒充已验证；

## 当前能力

- 成员本地登录、修改六位数字密码、按周填写草稿和提交/覆盖本人周报。
- leader 管理当前账号、查看提交状态、兼容导入旧 Excel 并导出多人汇总 Excel。
- Service Worker 离线缓存、PWA 安装和支持环境下的系统文件分享。

## Agent 与 Skill

- Agent：仅有 Claude 平台的 `frontend-developer` 遗留配置；没有 canonical 项目 Agent 或 `.ai/manifest.yaml`，不视为跨工具常驻 Agent。
- Skill：当前没有已确认采用的项目或全局 Skill；全局 `pwa-app` 是后来从多个项目经验中提炼，不倒推为本项目既有使用记录。
- 全局索引：`/Volumes/Leny/ProjectRecord/Agents.md`、`/Volumes/Leny/ProjectRecord/Skills.md`。

## 项目规则

- 开始任务先读 `/Volumes/Leny/Projects/CLAUDE.md`，再读本文件与 `CURRENT_STATUS.md`；只维护本项目根及 `/Volumes/Leny/ProjectRecord/WWR/`，不修改其他项目记录。
- 保持离线优先与可替换 `db.js` 边界；没有明确多人需求时不擅自引入云端数据库、API 或认证。

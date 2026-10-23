# dsh-file-tracker · 文件变动追踪

> 一个面向 [DeepSeek Harness (DSH)] 的持久化插件：
> **自动记录 AI agent 对工作区及工作区外文件/文件夹的新建、修改、删除、重命名、移动五类操作**，
> 以可拖拽悬浮窗实时展示，按工作区持久化 JSONL 日志。全程宿主端事件监听，**不消耗任何 LLM token**。
>
> A persistent plugin (Cordis bundle) for DeepSeek Harness that transparently records every file/folder
> creation, modification, deletion, rename and move performed by AI agents, shows them live in a draggable
> floating panel, and persists per-workspace JSONL logs. Host-side event listening only — zero token cost.

---

## 功能特性

### 捕获引擎（四层互补，不依赖任何单一信号）

| 层 | 机制 | 覆盖场景 |
|---|---|---|
| 工具层 | 包裹 `tools/execute` 瀑布事件：对**任意工具**（内置 `write`/`edit`/`pwsh`、MCP 文件系统工具、浏览器下载工具等）从参数与命令文本中提取路径候选，调用前后 stat 对比判定五类操作 | 所有带路径参数的工具调用，含工作区外路径、带空格/引号路径 |
| 监视层 | AI 会话工作目录的递归 `fs.watch`（**常驻**，不随 AI 空闲关闭），事件去抖 + `birthtime` 确定性分类 + 消失/出现配对识别重命名与移动 | 脚本、子进程、MCP 服务端等"命令文本里看不见"的批量改动 |
| 命令解析 | 从 shell 命令文本中挖掘 Windows/POSIX 绝对路径（含引号内带空格路径）并入工具层 stat 对比 | 工作区外的 shell 文件操作 |
| 归因层 | `agent/status` 划分轮次（round），记录携带 `sessionId / title / wsId / wsName / round`；AI 空闲期的变动归到该工作区最近会话并打 `idle` 标记 | 多会话、多工作区、子代理场景 |

- **噪音治理**：编辑器/原子写临时文件（`~RF*.TMP`、`*.tmpdir`、`*.tmp`、vim swap 等）自动过滤；工具层与监视层交叉去重；目录 mtime 抖动不记录。
- **排除目录聚合**：`node_modules` 等排除目录不逐文件记录，而是每 30 秒折叠为一条聚合记录（文件夹新建标"新增"并附递归总大小；内部变动标"修改"并附去重文件数）——既透明又不刷屏，可在设置中关闭或调整排除列表。
- **大小字段**：文件记录操作后大小；文件夹记录递归合计（超 2 万条目预算标 `~` 近似）；**删除记录保留最后已知大小**，方便审计空间占用。

### 悬浮窗 UI

- 迷你胶囊（图标 + 未读计数），可拖动、位置持久化；新事件短暂弹出提示；点击展开面板；**点击面板外任意位置或叉号收起**。
- 面板范围选择：工作区下拉（首项"跟随最新有变动的工作区"）+ 会话下拉（首项"整个工作区"），选择器联动不回跳。
- **未读计数按会话水位线管理**：只有真正显示过某会话的记录才清零该会话计数；水位线存 localStorage，刷新不丢。
- 记录列表：按会话/轮次分组或按字段拉平；筛选（类型芯片）、搜索、**排序（时间/大小/名称/类型 × 升/降序）**；每行含类型徽标、文件名、目录、大小、时间，跨会话视图带会话标签、空闲期记录带 ☾ 标记。
- 右键菜单：**打开文件所在位置**（文件已被手动删除时给出提示并打开其文件夹；文件夹与文件都不存在时明确告知）、**复制文件路径**。
- 设置页（三处入口：面板"设置"页、系统设置独立设置页 `settings.section`、插件页卡片）：总开关、排除目录聚合开关、排除列表、日志目录（切换时自动迁移合并旧日志）、保留天数、日志管理（按会话删除）、不透明度、尺寸、位置重置。
- 中英文界面，跟随 DSH 语言设置。

### 持久化

```
<日志根目录>/                     默认 $DSH_HOME/file-tracker/logs（可配置）
├── index.json                    全局索引 v2（工作区 slug/名称/路径 + 会话归属）
└── <工作区名称>/                  每个工作区一个文件夹（重名自动加哈希后缀）
    └── <会话id>.jsonl             该工作区所有会话的变动记录（JSON Lines）
```

- 序号（seq）与轮次（round）跨插件重载、跨 DSH 重启从日志恢复，保持连续。
- 保留天数到期自动清理；切换日志根目录时工作区子文件夹整体迁移/合并并提示迁移数量。

---

## 安装与部署（DSH）

### 环境要求

- DSH 桌面版或 Web 版（开发测试于 `0.2.1-rc.2`），含 Cordis Loader 与 Web GUI；
- 无需构建工具、无需额外依赖（宿主端为纯 Node ESM，客户端为浏览器模块加载器格式 + React）。

### 安装方式

**方式 A：让 DSH 内的 AI 代理安装（推荐）**

把本仓库克隆到本地任意目录，然后对任意 DSH 会话说：

> 用 plugin_manager 的 install_bundle 安装 `(https://github.com/1694043523/dsh-file-tracker)` 这个 bundle。

**方式 B：插件管理器**

设置 → 插件 → 安装本地目录（如你的部署提供该入口），选择仓库根目录。

安装成功后**刷新 Web GUI 页面**（客户端模块在页面加载时装配），右下角即出现蓝色文件夹心电图胶囊。

### 启用 / 停用 / 更新注意事项

- 停用整个插件：插件管理器中关闭该 bundle 行；仅暂停记录：设置页"启用记录"开关（已有日志保留）。
- **更新代码后的生效方式**（重要）：
  - 宿主端 `index.js` 改动 → 需要 remove + install（或重启 DSH）才会加载新模块世代；
  - 客户端 `client.js` / 样式 / 文案改动 → 刷新页面即可；
  - 安装新 bundle 后已打开的页面也需要刷新一次才能加载客户端。
- 冷启动自洽：插件早于 webServer 服务激活时会自动重试注册路由；客户端对渲染期才声明的槽位自动重试注入。

### 数据位置

- 插件数据目录：`$DSH_HOME/file-tracker/`（Windows 默认 `C:\Users\<用户>\.dsh\file-tracker\`），含 `settings.json`、`logs/`、`poll-stats.json`（诊断用轮询计数）。
- 所有数据仅存本地，不上传。

---

## 使用说明（速查）

1. **看实时变动**：点胶囊展开面板；默认"跟随最新有变动的工作区"。
2. **查某会话历史**：会话下拉选择；更早记录点"加载更早的记录"翻页。
3. **找文件**：右键记录 → 打开文件所在位置 / 复制路径；双击记录等同打开位置。
4. **审计空间**：排序选"大小 ↓"；排除目录的聚合行显示该目录递归总大小与变动文件数。
5. **换日志盘**：设置页填新目录并保存，旧日志自动迁移合并。

### 记录字段（JSONL）

| 字段 | 含义 |
|---|---|
| `seq` / `ts` | 全局序号 / 事件时间戳（ms） |
| `sessionId` / `title` | 执行会话 id / 会话标题 |
| `wsId` / `wsName` | 归属工作区 id / 名称 |
| `round` | 该会话内第几轮 AI 工作 |
| `kind` | `create` / `modify` / `delete` / `rename` / `move`（聚合行为带 `count` 的 `modify`/`create`） |
| `path` / `fromPath` | 目标路径 / 重命名·移动源路径 |
| `via` / `tool` | 捕获层（`tool` 工具层 / `watch` 监视层）/ 工具名 |
| `isDir` / `size` / `sizeApprox` | 是否目录 / 操作后大小（删除为最后已知大小）/ 大小是否为近似 |
| `count` | 聚合记录折叠的文件数 |
| `idle` | true 表示 AI 空闲期变动（手动或其他工具） |

---

## 在其他 AI agent / 其他工具中使用的注意事项

- **本插件是 DSH（Cordis）生态专属**。它依赖 DSH 宿主的事件总线（`tools/execute`、`agent/status`）、服务面（`webServer`、`workspaceRegistry`、`sessions` 等）与 Web GUI 槽位系统。**无法注入 Cursor、Claude Code、Trae、WorkBuddy、豆包等其他工具**——这些工具没有可挂载的宿主插件层。若需覆盖它们，唯一通用思路是独立运行一个目录监视进程（本仓库的监视层分类算法可作参考实现），但会失去归因、轮次与 DSH 内 UI。
- **在 DSH 内则与 agent 预设无关**：任何预设、任何会话、子代理（subagent）、workflow 子运行产生的工具调用都会经过宿主事件总线，因此都被工具层覆盖；子代理的记录归子代理会话名下（父会话视图不含子会话记录，工作区视图含全部）。
- **fork/派生会话**：记录归属"实际执行工具调用的会话"。若你把一个会话 fork 出新会话，原操作记录仍在原会话名下；用工作区视图查看全集。
- **空闲期监听**意味着你手动改文件、其他软件写文件也会被记录（带 `☾ 非AI活跃期` 标记）——这是"全程透明"的代价，可用排除列表折叠噪音目录。
- **平台差异**：递归监视在 Windows/macOS 原生支持；Linux 上 `fs.watch` 递归不可用时自动退化为仅监视根目录（深层变动可能漏报）。"打开所在位置"在 Windows 用 `explorer.exe`（失败回退 `cmd /c start`）、macOS 用 `open -R`、Linux 用 `xdg-open`。
- **性能边界**：监视根目录上限 12 个（运行中的工作区优先）；事件去抖 600ms；聚合窗口 30s；内存环形缓冲 5000 条/宿主、10000 条/页面。大型 monorepo 的排除目录只产生聚合行，不会刷屏。

---

## 仓库结构

```
dsh-file-tracker/
├── package.json          bundle 清单（dsh.bundle.patch + dsh.client 声明）
├── cordis.patch.yml      Loader 补丁：插入插件行
├── index.js              宿主端：捕获引擎、持久化、HTTP API（webServer 路由）
├── client.js             浏览器端：胶囊/面板/设置 UI（React，无 JSX）
├── icon.svg              插件图标
├── locale/zh.json        插件管理器元数据（中文）
├── locale/en.json        插件管理器元数据（英文）
└── README.md
```

无构建步骤：宿主端为纯 ESM；客户端为 `window.__ModuleLoader__.load` 格式，React 取自浏览器模块表。
语法自检：`node --check index.js && node --check client.js`。

## 安全说明

- 全部 HTTP 路由位于 DSH `connection` 信任围栏之后（Host/Origin 校验 + 登录令牌 Cookie），未认证请求返回 401；
- 不注册任何模型可见的工具或提示词内容，对 prompt 与 KV cache 零影响；
- "打开所在位置"等子进程调用不使用 shell，路径经绝对路径与换行/空字节校验。

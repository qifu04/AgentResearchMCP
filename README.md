# Agent Research MCP

Playwright 驱动的 MCP 服务器，让 AI 代理能够在多个学术数据库上执行文献检索。
通过自动化真实浏览器会话，完成登录检测、检索式构建、结果评估、迭代优化和 RIS 导出。

支持的数据库：Web of Science · PubMed · IEEE Xplore · Scopus

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- Windows 系统（.bat 脚本）

### 首次安装

双击 `install.bat`，它会自动完成以下步骤：

1. 安装 npm 依赖
2. 安装 Playwright Chromium 浏览器
3. 编译 TypeScript

或者手动执行：

```bash
npm install
npx playwright install chromium
npm run build
```

### 启动服务器

双击 `start-http.bat`，服务器默认运行在 `http://localhost:3100`。

脚本会自动关闭占用 3100 端口的旧进程，然后启动服务。

启动后可通过健康检查确认：

```bash
curl http://localhost:3100/health
# {"ok":true,"sessions":0}
```

### 自定义端口

```bash
set MCP_PORT=8080
npm run start:http
```

### ???????

???????????????????? Chromium?

```bash
set BROWSER_PROXY_MODE=direct
npm run start:http
```

?????????????????????

```bash
set BROWSER_PROXY_MODE=system
npm run start:http
```

???????`BROWSER_USE_SYSTEM_PROXY=1` ????????`0` ?????

## 连接到 AI 工具

启动服务器后，在 AI 工具中配置 MCP 连接。

### Claude Code

```bash
claude mcp add agent-research --transport http http://localhost:3100/mcp
```

### OpenAI Codex CLI

```bash
codex mcp add agent-research --url http://localhost:3100/mcp
```

添加后可检查是否生效：

```bash
codex mcp list
```

如果你修改了端口，例如使用 `8080`：

```bash
codex mcp add agent-research --url http://localhost:8080/mcp
```

### Cursor

Settings → MCP Servers，或编辑 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "agent-research": {
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

旧版 Cursor 使用 SSE 方式：

```json
{
  "mcpServers": {
    "agent-research": {
      "serverUrl": "http://localhost:3100/sse"
    }
  }
}
```

### Kiro / 其他 MCP 客户端

编辑项目根目录 `.mcp.json`（已在 .gitignore 中）：

```json
{
  "mcpServers": {
    "agent-research": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

## 服务端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/mcp` | POST/GET/DELETE | Streamable HTTP（MCP 2025-03-26） |
| `/sse` | GET | Legacy SSE（MCP 2024-11-05） |
| `/messages` | POST | Legacy SSE 消息端点 |
| `/health` | GET | 健康检查 |

## 工作流程

```
Phase A: 会话建立
  create_session → open_advanced_search → get_login_state → wait_for_login → get_query_language_profile

Phase B: 迭代检索（重复直到满意）
  1. 构建检索式（筛选条件直接写入检索式）
  2. run_search → 检查结果数量
  3. read_result_sample → 评估标题相关性
  4. read_result_sample → 从摘要中提取关键词
  5. 用新关键词优化检索式 → 回到步骤 2

Phase C: 导出
  export_results → close_session
```

调用 `get_workflow_guide` 工具可获取完整的操作指南。

## 可用工具

| 工具 | 说明 |
|------|------|
| `list_providers` | 列出支持的数据库 |
| `get_workflow_guide` | 获取完整操作指南 |
| `create_session` | 创建浏览器会话 |
| `list_sessions` / `get_session` / `close_session` | 会话管理 |
| `open_advanced_search` | 打开高级检索页面 |
| `get_login_state` / `wait_for_login` | 登录状态检测与等待 |
| `get_query_language_profile` | 获取检索语法（字段标签、运算符、示例） |
| `set_query` / `read_current_query` | 设置/读取检索式 |
| `run_search` | 执行检索并返回结果摘要 |
| `read_search_summary` / `read_result_sample` | 读取结果摘要与样本（含摘要） |
| `select_results` / `clear_selection` | 选择结果条目 |
| `get_export_capability` / `export_results` | 导出结果为 RIS |
| `convert_export_to_ris` | 将 NBIB/CSV 转换为 RIS |
| `capture_session_artifacts` | 捕获 DOM/截图/网络日志用于调试 |

## 贡献

想要添加新的数据库支持？参阅 [适配器开发指南](docs/adapter-authoring-guide.md)。

每个适配器由 4 个文件组成（descriptor / query-profile / selectors / adapter），项目提供了完整的模板目录 `src/adapters/template/` 作为起点。

## 开发

```bash
npm run build        # 编译 TypeScript → dist/
npm run dev:http     # 开发模式（tsx 直接运行，无需 build）
npm run check        # 类型检查
npm run test         # 运行测试
```

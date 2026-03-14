# Agent Research MCP

Playwright 驱动的 MCP 服务器，让 AI 代理能够在多个学术数据库上执行文献检索。通过自动化真实浏览器会话，完成登录检测、查询输入、搜索执行、结果抓取、筛选和导出等操作。

支持的数据库：Web of Science、PubMed、IEEE Xplore、Scopus

## 前置要求

- Node.js >= 18
- npm

## 安装

```bash
git clone <repo-url>
cd AgentRearchMCP
npm install
```

安装 Playwright 浏览器（首次运行需要）：

```bash
npx playwright install chromium
```

## 构建与启动

```bash
# 编译 TypeScript
npm run build

# 启动 HTTP 服务器（默认端口 3100）
npm run start:http

# 开发模式（tsx 直接运行，无需 build）
npm run dev:http

# 自定义端口
MCP_PORT=8080 npm run start:http
```

也可以直接双击项目根目录下的 `start-http.bat`（Windows），它会自动杀掉占用 3100 端口的旧进程后启动服务。

启动后可通过健康检查确认服务运行：

```bash
curl http://localhost:3100/health
# {"ok":true,"sessions":0}
```

服务器暴露以下端点：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/mcp` | POST/GET/DELETE | Streamable HTTP 传输（MCP 2025-03-26 协议） |
| `/sse` | GET | Legacy SSE 传输（MCP 2024-11-05 协议） |
| `/messages` | POST | Legacy SSE 消息端点 |
| `/health` | GET | 健康检查 |

## 作为 MCP 服务添加到 AI 工具

所有配置均使用 HTTP 传输方式，需要先启动服务器（`npm run start:http`），然后在各工具中配置 URL。

### Claude Code

```bash
# 项目级
claude mcp add agent-research --transport http http://localhost:3100/mcp --scope project

# 用户级
claude mcp add agent-research --transport http http://localhost:3100/mcp --scope user
```

或手动编辑配置文件（项目级 `.claude/settings.json`，用户级 `~/.claude/settings.json`）：

```json
{
  "mcpServers": {
    "agent-research": {
      "type": "url",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

### OpenAI Codex CLI

编辑 `~/.codex/config.json`（如不存在则创建）：

```json
{
  "mcpServers": {
    "agent-research": {
      "type": "url",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

### Cursor

编辑项目根目录下的 `.cursor/mcp.json`，或通过 Settings → MCP Servers 添加：

```json
{
  "mcpServers": {
    "agent-research": {
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

如果 Cursor 版本不支持 Streamable HTTP，可使用 SSE 方式：

```json
{
  "mcpServers": {
    "agent-research": {
      "serverUrl": "http://localhost:3100/sse"
    }
  }
}
```

## 可用工具一览

| 工具 | 说明 |
|------|------|
| `list_providers` | 列出支持的数据库 |
| `create_session` | 创建浏览器会话 |
| `list_sessions` / `get_session` / `close_session` | 会话管理 |
| `open_advanced_search` | 打开高级检索页面 |
| `get_login_state` / `wait_for_login` | 登录状态检测与等待 |
| `get_query_language_profile` | 获取检索语法说明 |
| `set_query` / `read_current_query` | 设置/读取检索式 |
| `run_search` | 执行检索 |
| `read_search_summary` / `read_result_sample` | 读取检索结果摘要与样本 |
| `list_filters` / `apply_filters` | 筛选条件管理 |
| `select_results` / `clear_selection` | 选择结果条目 |
| `get_export_capability` / `export_results` | 导出结果 |
| `convert_export_to_ris` | 转换为 RIS 格式 |
| `capture_session_artifacts` | 捕获调试快照 |

## 典型使用流程

```
create_session(provider: "wos")
  → open_advanced_search
  → get_login_state / wait_for_login
  → get_query_language_profile
  → set_query / run_search
  → read_search_summary / read_result_sample
  → apply_filters
  → export_results
  → close_session
```

## 开发

```bash
npm run check        # 类型检查
npm run test         # 运行测试
npm run test:watch   # 监听模式测试
```

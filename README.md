# Agent Research MCP

Playwright 驱动的 MCP 服务器，用真实浏览器会话在多个学术数据库中执行文献检索与 RIS 导出。

支持的数据库：Web of Science · PubMed · IEEE Xplore · Scopus

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- Windows 系统（提供 `.bat` 脚本）

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

## 连接到 AI 工具

### Claude Code

```bash
claude mcp add agent-research --transport http http://localhost:3100/mcp
```

### OpenAI Codex CLI

```bash
codex mcp add agent-research --url http://localhost:3100/mcp
```

### Cursor

编辑 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "agent-research": {
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

旧版 Cursor 可使用 SSE：

```json
{
  "mcpServers": {
    "agent-research": {
      "serverUrl": "http://localhost:3100/sse"
    }
  }
}
```

## 服务端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/mcp` | POST/GET/DELETE | Streamable HTTP |
| `/sse` | GET | Legacy SSE |
| `/messages` | POST | Legacy SSE 消息端点 |
| `/health` | GET | 健康检查 |

## 最小工作流程

```text
list_providers
  -> create_session   (返回 sessionId + provider query profile)
  -> run_search       (返回总条数 + 前 N 条标题/摘要)
  -> read_current_query
  -> export_results   (导出当前结果为 RIS)
  -> close_session
```

说明：

- `create_session` 会直接返回该 provider 的检索语法说明，供大模型构建检索式。
- `run_search` 是主入口；可直接传入 `query`，无需先单独设置检索式。
- `export_results` 始终导出当前检索结果，并统一返回 RIS 文件路径。

## 可用工具

| 工具 | 说明 |
|------|------|
| `list_providers` | 列出支持的数据库 |
| `create_session` | 创建浏览器会话，并返回该 provider 的检索语法说明 |
| `run_search` | 执行检索并返回总数与前 N 条标题/摘要 |
| `read_current_query` | 读取当前页面上的检索式 |
| `export_results` | 导出当前检索结果为 RIS |
| `close_session` | 关闭浏览器会话 |

## 内部启动预检

服务器启动时会保留内部 `startup-preflight` 机制，用于：

- 验证 provider 是否能打开检索页
- 检查登录是否满足搜索/导出要求
- 必要时等待用户在有头浏览器中完成登录
- 运行固定检索式的搜索/导出冒烟测试

这套能力仅用于启动期可靠性保障，不属于公开 MCP 工作流。

## 贡献

想要添加新的数据库支持？参阅 [适配器开发指南](docs/adapter-authoring-guide.md)。

每个适配器由 `descriptor / query-profile / selectors / adapter` 四部分组成，项目提供了完整模板目录 `src/adapters/template/` 作为起点。

## 开发

```bash
npm run build        # 编译 TypeScript -> dist/
npm run dev:http     # 开发模式（tsx 直接运行）
npm run check        # 类型检查
npm run test         # 运行测试
```

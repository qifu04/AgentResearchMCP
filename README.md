# Agent Research MCP

Playwright 驱动的 MCP 服务器，用真实浏览器会话在多个学术数据库中执行文献检索与 RIS 导出。

支持的数据库：**Web of Science** · **PubMed** · **IEEE Xplore** · **Scopus**

---

## 目录

- [快速开始](#快速开始)
- [连接到 AI 工具](#连接到-ai-工具)
- [设计思路](#设计思路)
  - [为什么需要这个项目](#为什么需要这个项目)
  - [学术数据库的抽象](#学术数据库的抽象)
  - [为什么只暴露 6 个 MCP 工具](#为什么只暴露-6-个-mcp-工具)
  - [统一响应信封](#统一响应信封)
  - [会话生命周期](#会话生命周期)
- [架构总览](#架构总览)
  - [分层设计](#分层设计)
  - [目录结构](#目录结构)
  - [适配器的四文件结构](#适配器的四文件结构)
- [Prompt 工程：引导大模型做好检索](#prompt-工程引导大模型做好检索)
  - [内置系统指令](#内置系统指令)
  - [参数化工作流 Prompt](#参数化工作流-prompt)
  - [推荐的完整提示词模板](#推荐的完整提示词模板)
- [贡献与开发](#贡献与开发)

---

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

自定义端口：

```bash
set MCP_PORT=8080
npm run start:http
```

### 服务端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/mcp` | POST/GET/DELETE | Streamable HTTP（推荐） |
| `/sse` | GET | Legacy SSE |
| `/messages` | POST | Legacy SSE 消息端点 |
| `/health` | GET | 健康检查 |

---

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

---

## 设计思路

### 为什么需要这个项目

学术文献检索是一个看似简单、实则充满隐性知识的任务。一个研究者在 PubMed 上构建检索式时，需要知道 MeSH 主题词会自动展开、布尔运算符必须大写、通配符 `*` 前至少要 4 个字符；而同样的检索意图放到 Web of Science 上，语法完全不同——字段标签变成了 `TS=`、`TI=`，还多了 `NEAR/x` 邻近检索。

大模型天然擅长理解自然语言的检索意图，但它们对各数据库的具体语法规则只有模糊的记忆，容易写出语法错误的检索式。更关键的是，这些数据库没有开放 API——它们只有 Web 界面。

**Agent Research MCP 的核心思路是：**

1. 用 Playwright 自动化真实浏览器，绕过"无 API"的限制
2. 把每个数据库的差异封装在适配器里，对外暴露统一接口
3. 在创建会话时就把该数据库的完整语法规则（`QueryLanguageProfile`）返回给大模型，让它"先读规则再写检索式"
4. 通过预定义 Prompt 引导大模型执行"选库 → 构式 → 多轮迭代 → 导出"的完整工作流

### 学术数据库的抽象

四个学术数据库在功能上高度相似——都支持高级检索、结果浏览、筛选和导出——但在 UI 实现、查询语法、导出格式上各不相同。我们用一个统一的 `SearchProviderAdapter` 接口抽象了这些差异：

```
                    SearchProviderAdapter
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ProviderDescriptor  QueryLanguageProfile  生命周期方法
    (我是谁)            (我的语法规则)        (怎么操作我)
```

#### ProviderDescriptor — 数据库的身份证

每个数据库声明自己的静态元信息：

```typescript
interface ProviderDescriptor {
  id: ProviderId;              // "wos" | "pubmed" | "ieee" | "scopus"
  displayName: string;         // "Web of Science"
  entryUrl: string;            // 高级检索页 URL
  capabilities: {
    rawQuery: boolean;         // 是否支持原始检索式输入
    builderUi: boolean;        // 是否有可视化构建器
    filters: boolean;          // 是否支持侧边栏筛选
    inlineAbstracts: boolean;  // 结果列表是否内联摘要
    selection: boolean;        // 是否支持勾选结果
    export: boolean;           // 是否支持导出
  };
}
```

#### QueryLanguageProfile — 数据库的语法说明书

这是整个设计中最关键的抽象。每个数据库的检索语法差异巨大，我们把这些差异结构化为一份"语法说明书"，在 `create_session` 时直接返回给大模型：

```typescript
interface QueryLanguageProfile {
  provider: ProviderId;
  fieldTags: QueryFieldTag[];       // 字段标签：TS=, [tiab], AU= ...
  booleanOperators: string[];       // AND, OR, NOT
  proximityOperators?: string[];    // NEAR/x, [field:~N] ...
  wildcards?: string[];             // *, ?, $
  examples: string[];               // 正确的检索式示例
  constraints: string[];            // 语法限制和注意事项
  recommendedPatterns: string[];    // 推荐做法
  antiPatterns: string[];           // 常见错误
}
```

以 PubMed 和 Web of Science 为例，同一个检索意图的语法差异：

| 意图 | PubMed | Web of Science |
|------|--------|----------------|
| 标题含"deep learning" | `"deep learning"[ti]` | `TI=("deep learning")` |
| 限定年份 | `2020:2024[dp]` | `PY=(2020-2024)` |
| 主题词 | `"neoplasms"[mh]` | _(无 MeSH，用 TS= 替代)_ |
| 邻近检索 | `"heart failure"[tiab:~3]` | `TS=(heart NEAR/3 failure)` |

大模型拿到 `QueryLanguageProfile` 后，就能根据规则生成正确的检索式，而不是凭记忆猜测语法。

#### 生命周期方法 — 统一的操作流程

适配器接口定义了完整的操作生命周期：

```
openAdvancedSearch → detectLoginState → setCurrentQuery → submitSearch
       → readResultItems → readResultAbstracts → listFilters → applyFilters
       → detectExportCapability → exportNative
```

每个方法接收统一的 `ProviderContext`（包含 Playwright Page、会话 ID、阶段等），返回标准化的数据结构。适配器内部处理所有 CSS 选择器、等待逻辑、弹窗关闭等浏览器自动化细节。

### 为什么只暴露 6 个 MCP 工具

适配器接口有 20+ 个方法，但我们只对外暴露了 6 个 MCP 工具：

| MCP 工具 | 做什么 | 内部调用链 |
|----------|--------|-----------|
| `list_providers` | 列出可用数据库 | `registry.listDescriptors()` |
| `create_session` | 创建会话 + 返回语法规则 | 创建浏览器 → `openAdvancedSearch` → `detectLoginState` → 返回 `queryProfile` |
| `run_search` | 执行检索 | `setCurrentQuery` → `submitSearch` → `readSearchSummary` → `readResultItems` + `readResultAbstracts` |
| `read_current_query` | 读取当前检索式 | `readCurrentQuery` |
| `export_results` | 导出为 RIS | `detectExportCapability` → `exportNative` → 格式转换（NBIB/CSV → RIS） |
| `close_session` | 关闭会话 | 关闭浏览器上下文 |

**设计原则：最小化大模型的决策负担。**

大模型不需要知道"先打开高级检索页、再检测登录状态、再清除弹窗、再填入检索式、再点击搜索按钮、再等待结果加载、再读取摘要"这些细节。它只需要：

1. 创建会话，拿到语法规则
2. 根据规则构建检索式，执行搜索
3. 看结果，决定是否优化检索式再搜一次
4. 满意了就导出

把 20+ 个底层操作编排成 6 个高层工具，让大模型专注于**检索策略**而非**浏览器操作**。

### 统一响应信封

所有工具的返回值都包裹在 `ToolEnvelope<T>` 中：

```typescript
interface ToolEnvelope<T> {
  ok: boolean;            // 是否成功
  provider: ProviderId;   // 当前数据库
  sessionId: string;      // 会话 ID
  phase: SessionPhase;    // 当前阶段
  timestamp: string;      // ISO 时间戳
  warnings?: string[];    // 警告信息（如"需要手动登录"）
  nextActions?: string[]; // 建议的下一步操作
  data: T;                // 实际数据
}
```

`nextActions` 字段尤其重要——它告诉大模型"你现在可以做什么"，形成隐式的状态机引导。例如 `create_session` 返回 `nextActions: ["run_search", "read_current_query", "export_results"]`，大模型就知道下一步该搜索了。

### 会话生命周期

每个浏览器会话经历明确的阶段转换：

```
created → starting → ready → awaiting_user_login → search_ready → searching → exporting → completed → closed
                                                                                                        ↓
                                                                                                      error
```

会话状态持久化在磁盘上（`.agent-research-mcp/sessions/<uuid>/`），包含：

```
sessions/<uuid>/
├── session.json      # 会话记录
├── dom/              # DOM 快照
├── network/          # 网络日志
├── screenshots/      # 页面截图
├── downloads/        # 原始下载文件
└── exports/          # 转换后的 RIS 文件
```

这些 artifact 既用于调试，也为未来的可观测性和回放能力打基础。

---

## 架构总览

### 分层设计

```
MCP Client (Claude Code / Cursor / Codex ...)
     │
     ▼
┌─────────────────────────────────────────────┐
│  Transport Layer                            │
│  server/index.ts (stdio) / http-server.ts   │
└──────────────────┬──────────────────────────┘
                   │
     ▼─────────────┘
┌─────────────────────────────────────────────┐
│  Tool Layer                                 │
│  server/tool-registry.ts    6 个 MCP 工具    │
│  server/prompt-registry.ts  预定义 Prompt    │
└──────────────────┬──────────────────────────┘
                   │
     ▼─────────────┘
┌─────────────────────────────────────────────┐
│  Service Layer                              │
│  services/search-service.ts                 │
│  会话锁 · 运行时引导 · 错误追踪              │
└──────────────────┬──────────────────────────┘
                   │
     ▼─────────────┘
┌─────────────────────────────────────────────┐
│  Adapter Layer                              │
│  adapters/<provider>/adapter.ts             │
│  每个数据库的 Playwright 自动化实现           │
└──────────────────┬──────────────────────────┘
                   │
     ▼─────────────┘
┌─────────────────────────────────────────────┐
│  Infrastructure                             │
│  browser/*    Playwright 工厂 · 页面助手     │
│  core/*       会话管理 · 导出 · 登录 · 锁    │
└─────────────────────────────────────────────┘

### 目录结构

```
src/
├── server/                          # 传输层 & MCP 注册
│   ├── index.ts                     # stdio 入口
│   ├── http-server.ts               # HTTP/SSE 入口
│   ├── mcp-server.ts                # MCP Server 配置
│   ├── tool-registry.ts             # 6 个 MCP 工具定义
│   ├── prompt-registry.ts           # 预定义 Prompt 模板
│   └── runtime.ts                   # 服务器初始化
│
├── services/
│   └── search-service.ts            # 编排层：会话锁 + 适配器调用
│
├── adapters/                        # 数据库适配器
│   ├── provider-contract.ts         # 核心接口定义
│   ├── registry.ts                  # 适配器注册表
│   ├── base/                        # 基类和工具函数
│   ├── wos/                         # Web of Science
│   ├── pubmed/                      # PubMed
│   ├── ieee/                        # IEEE Xplore
│   ├── scopus/                      # Scopus
│   └── template/                    # 新适配器模板
│
├── core/                            # 核心基础设施
│   ├── session-manager.ts           # 会话生命周期管理
│   ├── session-lock.ts              # 并发会话锁
│   ├── export-manager.ts            # 导出编排 & 格式转换
│   ├── login-orchestrator.ts        # 登录检测 & 等待
│   ├── response-envelope.ts         # 统一响应包装
│   ├── ris-converter.ts             # NBIB/CSV → RIS 转换
│   ├── artifact-manager.ts          # 会话 artifact 存储
│   └── startup-preflight.ts         # 启动预检
│
├── browser/                         # Playwright 基础设施
│   ├── playwright-factory.ts        # 浏览器运行时创建
│   ├── page-helpers.ts              # 页面操作助手
│   ├── persistent-profile-store.ts  # 持久化登录配置
│   └── browser-launch-config.ts     # 启动配置
│
├── types/                           # 共享类型
│   ├── session.ts
│   └── tool-payloads.ts
│
└── utils/                           # 工具函数
    ├── fs.ts
    ├── logging.ts
    └── time.ts
```

### 适配器的四文件结构

每个数据库适配器由四个文件组成，职责清晰：

```
src/adapters/pubmed/
├── descriptor.ts       # 身份证：id、名称、入口 URL、能力声明
├── query-profile.ts    # 语法说明书：字段标签、运算符、示例、约束
├── selectors.ts        # CSS 选择器：页面元素定位
└── adapter.ts          # 实现：SearchProviderAdapter 的所有方法
```

- **descriptor.ts** — 静态元信息，不涉及任何浏览器操作
- **query-profile.ts** — 该数据库的完整检索语法规则，`create_session` 时原样返回给大模型
- **selectors.ts** — 所有 CSS/文本选择器集中管理，UI 变更时只改这一个文件
- **adapter.ts** — Playwright 自动化逻辑，实现 `SearchProviderAdapter` 接口

添加新数据库只需复制 `src/adapters/template/` 并填充这四个文件，然后在 `registry.ts` 中注册即可。详见 [适配器开发指南](docs/adapter-authoring-guide.md)。

---

## Prompt 工程：引导大模型做好检索

仅仅提供工具是不够的。大模型需要知道**何时用哪个工具、按什么顺序、遵循什么策略**。我们通过三层 Prompt 机制来引导大模型的检索行为。

### 内置系统指令

服务器注册了一段系统级指令（`AGENT_RESEARCH_MCP_INSTRUCTIONS`），作为 MCP Server Instructions 自动注入到支持该协议的客户端中。核心要点：

1. **先理解任务再选库** — 分析检索目标，拆分核心主题、对象、方法、场景，再决定用哪个数据库
2. **先读规则再写检索式** — 必须先调用 `create_session` 获取 `queryProfile`，严格遵守语法规则
3. **兼顾精确性和覆盖率** — 按概念块拆分，补充同义词、缩写、变体；同一概念 OR，不同概念 AND
4. **多轮迭代** — 每次搜索后阅读标题和摘要，提取新关键词，优化检索式再搜
5. **复杂任务拆分** — 多主题任务拆成子任务，支持并行子 agent 执行
6. **导出前确认** — 导出前用 `read_current_query` 确认当前检索式，记录每轮导出的详细信息

### 参数化工作流 Prompt

服务器还注册了一个 MCP Prompt 模板 `scholarly_search_workflow`，接受以下参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `researchTask` | string（必填） | 用户的检索目标描述 |
| `outputDir` | string（可选） | RIS 文件导出目录 |
| `searchGoal` | `"balanced"` \| `"recall"` \| `"precision"` | 检索策略偏好 |
| `allowParallelAgents` | boolean | 是否允许拆分子 agent 并行检索 |

这个 Prompt 会根据参数动态生成一份完整的检索任务指令，包含 12 条具体执行原则。例如当 `searchGoal` 为 `"recall"` 时，会强调"尽量提高覆盖率，宁可多做几轮扩词和补充检索"。

### 推荐的完整提示词模板

对于不支持 MCP Prompt 协议的客户端，我们在 `docs/llm-search-agent-prompt.md` 中提供了一份可直接使用的提示词模板，包含 10 条核心工作原则：

```
原则 1: 先理解检索任务，再选数据库
原则 2: 选定数据库后，必须先读取该库的检索规则
原则 3: 检索式必须兼顾"精确性"和"覆盖率"
原则 4: 允许多轮检索，不要满足于第一次结果
原则 5: 当任务包含多个方面时，允许拆分并行检索
原则 6: 导出策略必须清晰
原则 7: 输出时必须解释你的检索决策
原则 8: 工作流顺序
原则 9: 检索质量要求
原则 10: 行为边界
```

**数据库选择建议：**

| 学科领域 | 推荐数据库 |
|----------|-----------|
| 医学、生物、药学、临床、公共卫生 | PubMed |
| 电子、通信、计算机、自动化、机器人 | IEEE Xplore |
| 跨学科、大范围综述式搜索 | Scopus |
| 跨学科、高质量主题检索（与 Scopus 互补） | Web of Science |

**推荐工作流：**

```
1) 理解任务 → 判断单主题还是多主题
2) list_providers → 了解可用数据库
3) 选择 provider
4) create_session → 获取 queryProfile
5) 根据 queryProfile 构建首轮检索式
6) run_search → 获取结果
7) 阅读标题与摘要 → 扩展关键词 → 再次 run_search
8) read_current_query → 确认检索式
9) export_results → 导出 RIS
10) close_session
```

---

## 贡献与开发

### 开发命令

```bash
npm run build        # 编译 TypeScript → dist/
npm run dev:http     # 开发模式（tsx 直接运行）
npm run check        # 类型检查
npm run test         # 运行测试
npm run test:watch   # 测试监听模式
```

运行单个测试：

```bash
npx vitest run tests/session-lock.test.ts
```

### 添加新数据库

想要添加新的数据库支持？参阅 [适配器开发指南](docs/adapter-authoring-guide.md)。

每个适配器由 `descriptor / query-profile / selectors / adapter` 四部分组成，项目提供了完整模板目录 `src/adapters/template/` 作为起点。

### 技术栈

- **运行时**：Node.js + ESM
- **浏览器自动化**：Playwright
- **MCP SDK**：`@modelcontextprotocol/sdk`
- **Schema 校验**：Zod v4
- **语言**：TypeScript（严格模式）

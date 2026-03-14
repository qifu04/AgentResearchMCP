# 适配器开发指南

为 Agent Research MCP 添加新的学术数据库支持。

## 架构概览

```
MCP Client ↔ server/index.ts
               ↓
           server/tool-registry.ts → ~22 个 MCP 工具
               ↓
           services/search-service.ts → 编排所有操作
               ↓
           adapters/<provider>/adapter.ts → Playwright 自动化
               ↑
           adapters/base/base-adapter.ts → 公共基类
```

每个适配器由 4 个文件组成：

| 文件 | 作用 |
|------|------|
| `descriptor.ts` | 静态元数据：ID、名称、入口 URL、能力声明 |
| `query-profile.ts` | 检索语言：字段标签、运算符、通配符、示例、约束 |
| `selectors.ts` | CSS 选择器：输入框、按钮、结果卡片 |
| `adapter.ts` | 核心实现：继承 `BaseSearchProviderAdapter`，实现 5 个抽象方法 |

## 开始之前

### 前置要求

- Node.js >= 18
- 项目已安装（`install.bat` 或 `npm install && npx playwright install chromium && npm run build`）
- 熟悉 Playwright 基本操作（`page.evaluate`、`page.locator`、`waitForEvent`）

### 信息采集

在写代码之前，先在浏览器中手动操作目标数据库，收集以下信息：

1. **基本信息**：高级检索页面 URL、是否需要登录才能搜索/导出
2. **检索语法**：打开帮助页面，记录字段标签、运算符、通配符、筛选字段（文档类型、语言、年份等）
3. **页面选择器**：用 DevTools 定位输入框、搜索按钮、结果卡片的 CSS 选择器
4. **登录信号**：机构名称文本、用户菜单元素、localStorage token 等
5. **导出流程**：逐步记录点击序列（触发按钮 → 格式选择 → 范围选择 → 确认下载）

> 核心原则：所有筛选（文档类型、年份、语言、学科领域）都通过检索式实现，不依赖侧边栏 UI。
> 因此 `query-profile.ts` 中必须包含完整的筛选字段标签。

---

## 第 1 步：创建适配器目录

复制模板目录并重命名：

```bash
cp -r src/adapters/template src/adapters/your-provider
```

你会得到 4 个文件，每个都有详细的 JSDoc 注释指导你填写。

---

## 第 2 步：descriptor.ts — 静态元数据

定义数据库的基本信息和能力声明。

```typescript
import type { ProviderDescriptor } from "../provider-contract.js";

export const yourProviderDescriptor: ProviderDescriptor = {
  id: "your-provider",                              // 小写英文，用于 create_session({ provider: "..." })
  displayName: "Your Provider Name",                 // list_providers 中显示的名称
  entryUrl: "https://example.com/advanced-search",   // 高级检索页面 URL
  supportsManualLoginWait: true,                     // 是否需要等待用户登录
  capabilities: {
    rawQuery: true,          // 支持原始检索式输入（通常为 true）
    builderUi: false,        // 是否有可视化查询构建器
    filters: false,          // 侧边栏筛选（通常设为 false，用检索式代替）
    inlineAbstracts: false,  // 结果列表是否显示摘要
    selection: false,        // 是否支持勾选记录
    export: true,            // 是否支持导出
  },
};
```

参考现有适配器的 `capabilities` 设置：
- PubMed：无需登录，`inlineAbstracts: true`
- WOS：机构登录，`selection: true`, `builderUi: true`
- IEEE：机构登录，`selection: true`
- Scopus：个人/机构登录，`selection: true`

---

## 第 3 步：query-profile.ts — 检索语言定义

这是 AI Agent 构建检索式的核心参考。字段标签必须完整，特别是筛选相关字段。

```typescript
import type { QueryLanguageProfile } from "../provider-contract.js";

export const yourProviderQueryProfile: QueryLanguageProfile = {
  provider: "your-provider",
  supportsRawEditor: true,
  supportsBuilderUi: false,
  supportsUrlQueryRecovery: false,   // 检索式是否可从 URL 参数恢复
  rawEntryLabel: null,               // 输入框标签文本（如有）
  fieldTags: [
    // ── 基本检索字段 ──
    { code: "TI", label: "Title",    description: "文章标题" },
    { code: "AU", label: "Author",   description: "作者姓名" },
    { code: "AB", label: "Abstract", description: "摘要文本" },
    // ── 筛选字段（关键！）──
    { code: "DT", label: "Document Type", description: "Article, Review, Conference Paper 等" },
    { code: "LA", label: "Language",      description: "english, chinese, french 等" },
    { code: "PY", label: "Year",          description: "出版年份或范围" },
    { code: "SA", label: "Subject Area",  description: "学科领域代码" },
    // ... 从帮助页面收集所有可用字段
  ],
  booleanOperators: ["AND", "OR", "NOT"],
  proximityOperators: [],    // 如 NEAR/x, W/n, PRE/n
  wildcards: [],             // 如 *, ?, $
  examples: [
    // 2-3 个真实查询示例，展示字段标签和筛选用法
    'TI="deep learning" AND DT=Review AND PY=2020-2024',
  ],
  constraints: [
    // 重要限制：运算符优先级、通配符规则、字段限制
    // 特别注明哪些筛选不能通过检索式实现（如 WOS 的 DT/LA）
  ],
  recommendedPatterns: [],
  antiPatterns: [],
};
```

### 筛选字段的重要性

AI Agent 不使用侧边栏 UI 筛选，所有筛选都写入检索式。因此你必须：

1. 查阅数据库帮助页面，找到所有可用的字段标签
2. 特别关注：文档类型、语言、年份、学科领域、来源类型
3. 在 `description` 中列出可用的值（如 `"ar=Article, re=Review, cp=Conference Paper"`）
4. 如果某些筛选不能通过检索式实现，在 `constraints` 中明确说明

各数据库的筛选语法差异很大，参考现有实现：

| 筛选 | PubMed | WOS | Scopus | IEEE |
|------|--------|-----|--------|------|
| 文档类型 | `Review[pt]` | ❌ 仅侧边栏 | `DOCTYPE(re)` | ❌ 仅 URL 参数 |
| 语言 | `english[la]` | ❌ 仅侧边栏 | `LANGUAGE(english)` | N/A |
| 年份 | `2020:2024[dp]` | `PY=(2020-2024)` | `PUBYEAR AFT 2019` | ❌ 仅 URL 参数 |
| 学科 | N/A | `WC=(category)` | `SUBJAREA(MEDI)` | N/A |

---

## 第 4 步：selectors.ts — 页面元素选择器

为页面上的关键元素提供 CSS 选择器。每个数组按优先级排列，适配器会依次尝试直到找到可见元素。

```typescript
import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const yourProviderSelectors: AdapterSelectors = {
  queryInputs: [
    // 检索输入框，按优先级排列
    'textarea#search-input',
    'input[name="query"]',
    'input[aria-label="Search"]',
  ],
  searchButtons: [
    // 搜索按钮
    'button:has-text("Search")',
    'button[type="submit"]',
  ],
  resultCards: [
    // 结果卡片容器（每个元素 = 一条结果）
    'article.result-item',
    '[data-testid="result-card"]',
  ],
  filterGroups: [],  // 留空 — 筛选通过检索式实现
};
```

### 选择器优先级

```
data-testid > id > aria-label > name 属性 > CSS class > 标签名
```

始终提供 2-3 个备选选择器。网站改版时只需更新 `selectors.ts`，其他文件不受影响。

### 如何找到选择器

在 DevTools 控制台中测试：

```javascript
// 找输入框
document.querySelectorAll('textarea, input[type="search"], input[type="text"]')

// 找按钮
document.querySelectorAll('button, [role="button"]')

// 搜索后找结果卡片
document.querySelectorAll('article, .result-item, tr.result-row')
```

---

## 第 5 步：adapter.ts — 核心实现

继承 `BaseSearchProviderAdapter`，实现 5 个抽象方法。建议按以下顺序实现：

### 5.1 detectLoginState — 登录状态检测

检查当前页面的登录和访问状态。

```typescript
async detectLoginState(context: ProviderContext): Promise<LoginState> {
  const state = await context.page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 2000),
    hasSignIn: !!document.querySelector('a[href*="login"]'),
    institution: document.querySelector('.institution-name')?.textContent,
  }));

  const hasAccess = !!state.institution;
  return {
    kind: hasAccess ? "institutional" : "anonymous",
    authenticated: hasAccess,
    canSearch: true,
    canExport: hasAccess,
    institutionAccess: state.institution ?? null,
    requiresInteractiveLogin: !hasAccess,
    blockingReason: hasAccess ? null : "需要机构登录才能导出",
    detectedBy: ["dom-inspection"],
    raw: state,
  };
}
```

### 5.2 readSearchSummary — 搜索结果摘要

从结果页面提取总数、分页信息。

```typescript
async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
  const info = await context.page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 3000),
  }));

  // 从页面文本中提取结果数（根据实际页面调整正则）
  const match = /(\d[\d,]*)\s*results?/i.exec(info.bodyText);
  return {
    provider: "your-provider",
    query: new URL(info.url).searchParams.get("query") ?? "",
    totalResultsText: match?.[0] ?? null,
    totalResults: match?.[1] ? Number(match[1].replace(/,/g, "")) : null,
    currentPage: null,
    totalPages: null,
    pageSize: 20,
    queryId: null,
    sort: null,
    raw: info,
  };
}
```

### 5.3 readResultCards — 结果卡片提取

从 DOM 中提取每条结果的标题、作者、来源、年份、摘要。

```typescript
protected async readResultCards(
  context: ProviderContext,
  limit: number,
  includeAbstract: boolean,
): Promise<ResultItem[]> {
  return context.page.evaluate(
    ({ lim, abs }) => {
      const cards = Array.from(
        document.querySelectorAll("YOUR_RESULT_CARD_SELECTOR")
      ) as HTMLElement[];

      return cards.slice(0, lim).map((card, i) => {
        const link = card.querySelector("a") as HTMLAnchorElement | null;
        const text = card.innerText;
        return {
          provider: "your-provider",
          indexOnPage: i + 1,
          title: link?.textContent?.trim() ?? `Result ${i + 1}`,
          href: link?.href ?? null,
          authorsText: card.querySelector(".authors")?.textContent?.trim() ?? null,
          sourceText: card.querySelector(".source")?.textContent?.trim() ?? null,
          yearText: text.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
          abstractPreview: abs
            ? card.querySelector(".abstract")?.textContent?.trim() ?? null
            : null,
          selectable: !!card.querySelector('input[type="checkbox"]'),
          raw: { text: text.slice(0, 4000) },
        };
      });
    },
    { lim: limit, abs: includeAbstract },
  );
}
```

### 5.4 detectExportCapability — 导出能力声明

声明导出格式、范围、限制。

```typescript
async detectExportCapability(context: ProviderContext): Promise<ExportCapability> {
  return {
    nativeFormat: "ris",           // ris / nbib / csv / bibtex
    convertibleToRis: true,        // 非 RIS 格式是否可转换
    requiresInteractiveLogin: true,
    supportsPage: false,
    supportsAll: true,
    supportsSelected: false,
    supportsRange: false,
    maxBatch: 1000,                // 单次最大导出数，无限制填 null
    blockingReason: null,
    raw: {},
  };
}
```

### 5.5 exportNative — 导出执行

自动化导出 UI 的点击序列。这是最复杂的方法，有三种常见模式：

**模式 A：浏览器下载事件**（最常见）

```typescript
async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
  // 1. 点击导出按钮
  const exportBtn = await this.findFirstVisible(context, ["button:has-text('Export')"]);
  await exportBtn.click({ force: true });

  // 2. 等待导出面板出现
  const panel = context.page.locator("#export-panel").first();
  await panel.waitFor({ state: "visible", timeout: 15_000 });

  // 3. 选择格式
  await panel.locator('[value="ris"]').click();

  // 4. 触发下载
  const [download] = await Promise.all([
    context.page.waitForEvent("download", { timeout: 60_000 }),
    panel.locator("button:has-text('Download')").click(),
  ]);

  // 5. 保存文件
  const fileName = download.suggestedFilename();
  const targetPath = path.join(context.downloadsDir, fileName);
  await download.saveAs(targetPath);

  return {
    provider: "your-provider",
    format: "ris",
    path: targetPath,
    fileName,
    raw: { scope: request.scope },
  };
}
```

**模式 B：API 响应拦截**（WOS 使用）

```typescript
const [response] = await Promise.all([
  context.page.waitForResponse(r => r.url().includes("/export"), { timeout: 30_000 }),
  exportButton.click(),
]);
const content = await response.text();
fs.writeFileSync(targetPath, content, "utf-8");
```

**模式 C：异步批量导出**（Scopus 使用）

```typescript
// 提交后等待较长时间
const [download] = await Promise.all([
  context.page.waitForEvent("download", { timeout: 180_000 }),
  submitButton.click(),
]);
```

### 可选覆盖方法

基类提供了合理的默认实现，仅在默认行为不适用时才覆盖：

| 方法 | 何时覆盖 | 参考 |
|------|---------|------|
| `openAdvancedSearch` | 打开页面后需要额外操作（如展开面板） | WOS |
| `clearInterferingUi` | 有特殊弹窗需要关闭（如 Cookie 同意） | IEEE |
| `setCurrentQuery` | 输入框是 contenteditable 或需要特殊清除 | — |
| `submitSearch` | 提交搜索需要额外步骤 | — |
| `selectResultsByIndex` | 实现勾选记录（需 `capabilities.selection: true`） | IEEE |
| `clearSelection` | 实现清除选择 | IEEE |

---

## 第 6 步：注册适配器

### 6.1 更新 ProviderId 类型

在 `src/adapters/provider-contract.ts`：

```typescript
export type ProviderId = "wos" | "pubmed" | "ieee" | "scopus" | "your-provider" | (string & {});
```

### 6.2 注册到 ProviderRegistry

在 `src/adapters/registry.ts`：

```typescript
import { YourProviderAdapter } from "./your-provider/adapter.js";

const builtins: SearchProviderAdapter[] = [
  new WosAdapter(),
  new PubMedAdapter(),
  new IeeeAdapter(),
  new ScopusAdapter(),
  new YourProviderAdapter(),  // ← 新增
];
```

---

## 第 7 步：验证

```bash
# 类型检查
npm run check

# 运行测试
npm run test

# 启动服务器
start-http.bat
```

启动后通过 MCP 客户端依次调用验证：

1. `create_session({ provider: "your-provider" })` — 会话创建
2. `open_advanced_search` — 打开检索页面
3. `get_login_state` — 登录检测
4. `get_query_language_profile` — 检查字段标签是否完整
5. `set_query` + `run_search` — 执行检索
6. `read_result_sample` — 结果提取
7. `export_results` — 导出

---

## 常见问题

### Cookie/隐私弹窗

在 `clearInterferingUi()` 中处理：

```typescript
override async clearInterferingUi(context: ProviderContext): Promise<void> {
  await super.clearInterferingUi(context);
  const btn = context.page.locator("#accept-cookies").first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
  }
}
```

### 导出超时

大量记录导出可能需要较长时间，调整 timeout：

```typescript
context.page.waitForEvent("download", { timeout: 120_000 })
```

### 导出分块

在 `detectExportCapability()` 中声明 `maxBatch`，上层 `ExportManager` 会自动分块调用。

### ESM 导入

所有本地导入必须使用 `.js` 扩展名：

```typescript
import { foo } from "./bar.js";  // ✓
import { foo } from "./bar";     // ✗
```

### 非 RIS 格式转换

如果数据库原生导出不是 RIS 格式，使用 `core/ris-converter.ts` 中的转换函数：

- NBIB → RIS：`convertNbibToRis()`（PubMed）
- CSV → RIS：`convertCsvToRis()`（IEEE）

---

## 参考适配器

按复杂度排序：

| 适配器 | 复杂度 | 特点 |
|--------|--------|------|
| `pubmed/` | 低 | 无需登录，NBIB 转 RIS，最佳起点 |
| `ieee/` | 中 | 机构登录检测，CSV 转 RIS |
| `scopus/` | 高 | 异步批量导出，复杂登录状态 |
| `wos/` | 高 | 自定义按钮定位，API 响应拦截，overlay 处理 |

建议从 PubMed 适配器开始阅读，理解整体流程后再参考更复杂的实现。

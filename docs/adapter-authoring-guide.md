# 适配器开发指南 — 为 Agent Research MCP 添加新的学术数据库

## 1. 概述

本项目是一个 Playwright 驱动的 MCP 服务器，通过浏览器自动化让 AI Agent 在学术数据库上执行检索、筛选、导出操作。

### 架构位置

```
MCP Client ↔ server/index.ts (stdio)
               ↓
           server/tool-registry.ts → 注册 ~20 个 MCP 工具
               ↓
           services/search-service.ts → 编排所有操作
               ↓
           adapters/<provider>/adapter.ts → 每个数据库的 Playwright 自动化
               ↑
           adapters/base/base-adapter.ts → 公共基类（你只需实现差异部分）
```

### 每个适配器由 4 个文件组成

| 文件 | 作用 | 内容 |
|------|------|------|
| `descriptor.ts` | 静态元数据 | ID、名称、入口 URL、能力声明 |
| `query-profile.ts` | 检索语言定义 | 字段标签、运算符、通配符、示例 |
| `selectors.ts` | 页面元素选择器 | 输入框、按钮、结果卡片、筛选面板的 CSS 选择器 |
| `adapter.ts` | 核心实现 | 继承 `BaseSearchProviderAdapter`，实现 5 个抽象方法 |

### 会话生命周期

```
created → starting → ready → awaiting_user_login → search_ready → searching → exporting → completed → closed
```

---

## 2. 信息采集清单

> 目标：在一次浏览器会话中收集以下所有信息，然后一次性生成全部文件。

### 2.1 基本信息

- [ ] 数据库名称（如 "CNKI"）
- [ ] 适配器 ID（小写英文，如 "cnki"）
- [ ] 高级检索页面 URL
- [ ] 是否需要登录才能搜索
- [ ] 是否需要登录才能导出

### 2.2 页面元素选择器

打开高级检索页面，使用 DevTools 收集：

- [ ] **检索输入框** (`queryInputs`) — `textarea` 或 `input` 的 CSS 选择器，按优先级排列
  - 优先使用 `id`、`name`、`aria-label` 属性
  - 示例：`'textarea#searchInput'`, `'input[name="query"]'`
- [ ] **搜索按钮** (`searchButtons`) — 提交检索的按钮选择器
  - 示例：`'button:has-text("Search")'`, `'button[type="submit"]'`
- [ ] **结果卡片容器** (`resultCards`) — 执行一次搜索后，定位结果列表中每条记录的容器元素
  - 示例：`'article.result-item'`, `'[data-testid="result-row"]'`
- [ ] **筛选面板** (`filterGroups`) — 侧边栏筛选区域的容器选择器
  - 示例：`'aside section'`, `'.filter-panel'`

在结果卡片内部，记录以下子元素的提取路径：

- [ ] 标题链接 — 如 `a[href*="/record/"]`
- [ ] 作者文本 — 如 `.authors`
- [ ] 来源/期刊 — 如 `.journal-citation`
- [ ] 年份 — 如何从文本中提取年份（正则 `/\b(19|20)\d{2}\b/`）
- [ ] 摘要 — 如 `.abstract-snippet`

### 2.3 检索语言

从数据库的帮助页面收集：

- [ ] 字段标签列表（code + label），如 `[["TS", "Topic"], ["TI", "Title"], ...]`
- [ ] 布尔运算符：通常是 `AND`, `OR`, `NOT`
- [ ] 邻近运算符（如有）：如 `NEAR/x`, `SAME`
- [ ] 通配符（如有）：如 `*`, `?`, `$`
- [ ] 2-3 个查询示例
- [ ] URL 中查询参数名（如 `term`, `queryText`, `s`），用于从 URL 恢复查询

### 2.4 导出流程（逐步记录点击序列）

这是最关键的部分。在搜索结果页面，手动执行一次导出并记录每一步：

- [ ] **Step 1**: 导出触发按钮的选择器和文本
  - 如：`button:has-text("Export")` 或 `button[aria-label="Send to"]`
- [ ] **Step 2**: 点击后出现什么？（下拉菜单 / 对话框 / 新面板）
  - 记录容器选择器，如 `mat-dialog-container`, `#export-panel`
- [ ] **Step 3**: 如何选择导出格式？
  - 菜单项：`[role="menuitem"]:has-text("RIS")`
  - 下拉框：`select#format-select`
  - 单选按钮：`input[type="radio"][value="ris"]`
- [ ] **Step 4**: 如何选择导出范围？
  - 当前页 / 全部结果 / 选中记录 / 指定范围
  - 记录每个选项的选择器
- [ ] **Step 5**: 确认/下载按钮的选择器
- [ ] **Step 6**: 下载触发方式
  - 浏览器 `download` 事件（最常见）
  - 表单提交 `form.requestSubmit()`
  - 直接链接跳转
- [ ] 原生导出格式：`ris` / `nbib` / `csv` / `bibtex`
- [ ] 单次最大导出数量（如 WoS 为 1000）

### 2.5 登录检测信号

- [ ] DOM 信号：用户菜单元素（如 `#user-menu`）、登录按钮（如 `#signin_link`）
- [ ] JS 全局变量：如 `window.isLoggedInUser`, `window.ScopusUser`
- [ ] localStorage/cookie：如 `localStorage.getItem("wos_sid")`
- [ ] 页面文本：如 "Access provided by: XXX University"
- [ ] 匿名用户是否可以搜索？是否可以导出？

---

## 3. 文件模板

> 将采集到的信息填入以下模板中的 `{{占位符}}` 处。

### 3.1 descriptor.ts

```typescript
import type { ProviderDescriptor } from "../provider-contract.js";

export const {{id}}Descriptor: ProviderDescriptor = {
  id: "{{id}}",                          // 小写英文 ID
  displayName: "{{displayName}}",        // 显示名称
  entryUrl: "{{advancedSearchUrl}}",     // 高级检索页面 URL
  supportsManualLoginWait: true,
  capabilities: {
    rawQuery: {{true/false}},            // 是否支持原始查询输入
    builderUi: {{true/false}},           // 是否有可视化查询构建器
    filters: {{true/false}},             // 是否有侧边栏筛选
    inlineAbstracts: {{true/false}},     // 结果列表是否显示摘要
    selection: {{true/false}},           // 是否支持勾选记录
    export: {{true/false}},              // 是否支持导出
  },
};
```

### 3.2 query-profile.ts

```typescript
import type { QueryLanguageProfile } from "../provider-contract.js";

const fieldTags = [
  // 从帮助页面收集的字段标签
  ["{{code1}}", "{{label1}}"],
  ["{{code2}}", "{{label2}}"],
  // ...
].map(([code, label]) => ({ code, label }));

export const {{id}}QueryProfile: QueryLanguageProfile = {
  provider: "{{id}}",
  supportsRawEditor: true,
  supportsBuilderUi: {{true/false}},
  supportsUrlQueryRecovery: {{true/false}},
  rawEntryLabel: "{{输入框标签文本，如 'Query Preview'}}",
  fieldTags,
  booleanOperators: ["AND", "OR", "NOT"],
  proximityOperators: [{{如 '"NEAR/x"'}}],
  wildcards: [{{如 '"*"', '"?"'}}],
  examples: [
    "{{示例查询1}}",
    "{{示例查询2}}",
  ],
  constraints: [
    "{{约束说明1}}",
  ],
  recommendedPatterns: [
    "Prefer raw query entry for deterministic automation.",
  ],
  antiPatterns: [
    "Do not exceed provider export batch limits without chunking.",
  ],
};
```

### 3.3 selectors.ts

```typescript
import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const {{id}}Selectors: AdapterSelectors = {
  queryInputs: [
    "{{最精确的输入框选择器}}",
    "{{备选选择器}}",
  ],
  searchButtons: [
    "{{最精确的搜索按钮选择器}}",
    "{{备选选择器}}",
  ],
  resultCards: [
    "{{最精确的结果卡片选择器}}",
    "{{备选选择器}}",
  ],
  filterGroups: [
    "{{筛选面板容器选择器}}",
  ],
  // 如有 provider 特有的选择器组，在此添加：
  // exportButtons: ["{{导出按钮选择器}}"],
};
```

### 3.4 adapter.ts

```typescript
import path from "node:path";
import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import { runWithPageLoad } from "../../browser/page-helpers.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { {{id}}Descriptor } from "./descriptor.js";
import { {{id}}QueryProfile } from "./query-profile.js";
import { {{id}}Selectors } from "./selectors.js";

export class {{ClassName}}Adapter extends BaseSearchProviderAdapter {
  readonly descriptor = {{id}}Descriptor;
  readonly queryProfile = {{id}}QueryProfile;
  readonly selectors = {{id}}Selectors;
  readonly queryParamName = "{{URL查询参数名，如 'term'，无则填 null}}";
  readonly submitUrlPattern = /{{搜索提交后URL匹配模式}}/;

  // ════════════════════════════════════════
  // 必须实现的 5 个抽象方法
  // ════════════════════════════════════════

  // 1. 登录状态检测
  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    const state = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
      // 添加 provider 特有的检测信号：
      // hasUserMenu: Boolean(document.querySelector("#user-menu")),
      // sid: localStorage.getItem("xxx"),
    }));

    // 根据采集到的登录检测信号判断
    const canSearch = true;  // 根据实际情况修改
    const canExport = true;  // 根据实际情况修改

    return {
      kind: "anonymous",  // "anonymous" | "institutional" | "personal"
      authenticated: false,
      canSearch,
      canExport,
      institutionAccess: null,
      requiresInteractiveLogin: false,
      blockingReason: canSearch ? null : "{{阻塞原因}}",
      detectedBy: ["{{检测方式}}"],
      raw: state,
    };
  }

  // 2. 搜索结果摘要解析
  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const info = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
    }));
    const url = new URL(info.url);

    // 从页面文本中提取总结果数
    const totalResultsMatch = /{{结果数正则}}/.exec(info.bodyText);

    return {
      provider: "{{id}}",
      query: url.searchParams.get("{{queryParamName}}") ?? "",
      totalResultsText: totalResultsMatch?.[1] ?? null,
      totalResults: totalResultsMatch?.[1]
        ? Number(totalResultsMatch[1].replace(/,/g, ""))
        : null,
      currentPage: null,
      totalPages: null,
      pageSize: {{每页条数}},
      queryId: null,
      sort: null,
      raw: info,
    };
  }

  // 3. 结果卡片 DOM 提取
  protected async readResultCards(
    context: ProviderContext,
    limit: number,
    includeAbstracts: boolean,
  ): Promise<ResultItem[]> {
    const items = await context.page.evaluate(
      ({ requestedLimit, includeAbs }) => {
        // 使用采集到的结果卡片选择器
        const cards = Array.from(
          document.querySelectorAll("{{resultCards选择器}}")
        ) as HTMLElement[];

        return cards.slice(0, requestedLimit).map((card, index) => {
          // 使用采集到的子元素选择器提取信息
          const titleLink = card.querySelector("{{标题链接选择器}}") as HTMLAnchorElement | null;
          const title = titleLink?.textContent?.trim() ?? `Result ${index + 1}`;
          const text = card.innerText;

          return {
            provider: "{{id}}",
            indexOnPage: index + 1,
            title,
            href: titleLink?.href ?? null,
            authorsText: card.querySelector("{{作者选择器}}")?.textContent?.trim() ?? null,
            sourceText: card.querySelector("{{来源选择器}}")?.textContent?.trim() ?? null,
            yearText: text.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
            abstractPreview: includeAbs
              ? card.querySelector("{{摘要选择器}}")?.textContent?.trim() ?? null
              : null,
            selectable: Boolean(card.querySelector('input[type="checkbox"]')),
            raw: { text: text.slice(0, 4000) },
          };
        });
      },
      { requestedLimit: limit, includeAbs: includeAbstracts },
    );
    return items as ResultItem[];
  }

  // 4. 导出能力声明
  async detectExportCapability(): Promise<ExportCapability> {
    return {
      nativeFormat: "{{ris/nbib/csv/bibtex}}",
      convertibleToRis: {{true/false}},
      requiresInteractiveLogin: {{true/false}},
      supportsPage: {{true/false}},
      supportsAll: {{true/false}},
      supportsSelected: {{true/false}},
      supportsRange: {{true/false}},
      maxBatch: {{最大单次导出数，如 1000，无限制填 null}},
      blockingReason: null,
      raw: {},
    };
  }

  // 5. 导出执行（参见第 4 节的 6 步流程）
  async exportNative(
    context: ProviderContext,
    request: ExportRequest,
  ): Promise<ExportResult> {
    // Step 1: 点击导出触发按钮
    const exportButton = await this.findFirstVisible(
      context,
      ["{{导出按钮选择器}}"],
    );
    await runWithPageLoad(context.page, async () => {
      await exportButton.click({ force: true });
    });

    // Step 2: 等待导出菜单/对话框出现
    const exportPanel = context.page.locator("{{导出面板选择器}}").first();
    await exportPanel.waitFor({ state: "visible", timeout: 15_000 });

    // Step 3: 选择导出格式
    // 根据实际 UI 选择：菜单项点击 / 下拉框选择 / 单选按钮点击
    const formatOption = exportPanel.locator("{{格式选项选择器}}").first();
    await formatOption.click({ force: true });

    // Step 4: 选择导出范围
    // 根据 request.scope 选择对应的范围选项
    // if (request.scope === "page") { ... }
    // else if (request.scope === "all") { ... }

    // Step 5: 触发下载
    const confirmButton = exportPanel.locator("{{确认按钮选择器}}").first();
    const [download] = await Promise.all([
      context.page.waitForEvent("download", { timeout: 30_000 }),
      runWithPageLoad(context.page, async () => {
        await confirmButton.click({ force: true });
      }),
    ]);

    // Step 6: 保存文件并返回结果
    const fileName = download.suggestedFilename();
    const targetPath = path.join(
      context.downloadsDir,
      fileName || `{{id}}-export-${Date.now()}.{{格式后缀}}`,
    );
    await download.saveAs(targetPath);

    return {
      provider: "{{id}}",
      format: "{{ris/nbib/csv/bibtex}}",
      path: targetPath,
      fileName,
      raw: { scope: request.scope, url: download.url() },
    };
  }

  // ════════════════════════════════════════
  // 可选覆盖的方法（仅在默认实现不适用时）
  // ════════════════════════════════════════

  // override async openAdvancedSearch(context) — 如果打开页面后需要额外操作（如展开查询面板）
  // override async clearInterferingUi(context) — 如果有特殊的弹窗/遮罩需要处理
  // override async readCurrentQuery(context) — 如果查询不在标准输入框中
  // override async setCurrentQuery(context, query) — 如果填写查询需要特殊步骤
  // override async submitSearch(context) — 如果提交搜索需要额外步骤
  // override async listFilters(context) — 如果筛选面板结构特殊
  // override async applyFilters(context, input) — 实现筛选应用逻辑
  // override async selectResultsByIndex(context, indices) — 实现记录勾选逻辑
  // override async clearSelection(context) — 实现清除选择逻辑
}
```

---

## 4. 导出流程通用模板

所有数据库的导出都遵循相同的 6 步模式：

```
Step 1: 找到并点击导出触发按钮
        ↓
Step 2: 等待导出菜单/对话框/面板出现
        ↓
Step 3: 选择导出格式（RIS / BibTeX / NBIB / CSV）
        ↓
Step 4: 选择导出范围（当前页 / 全部 / 选中 / 指定范围）
        ↓
Step 5: page.waitForEvent("download") + 点击确认按钮
        ↓
Step 6: download.saveAs(targetPath) → 返回 ExportResult
```

关键代码模式：

```typescript
// 始终使用 Promise.all 同时等待下载和点击
const [download] = await Promise.all([
  context.page.waitForEvent("download", { timeout: 30_000 }),
  runWithPageLoad(context.page, async () => {
    await confirmButton.click({ force: true });
  }),
]);
```

如果导出是通过表单提交触发的（如 PubMed）：

```typescript
await exportForm.evaluate((form) => {
  if (!(form instanceof HTMLFormElement)) throw new Error("Form not found");
  form.requestSubmit();
});
```

---

## 5. 注册新适配器

完成 4 个文件后，需要两步注册：

### 5.1 更新 ProviderId 类型

在 `src/adapters/provider-contract.ts` 第 3 行：

```typescript
// 添加新的 ID
export type ProviderId = "wos" | "pubmed" | "ieee" | "scopus" | "{{id}}" | (string & {});
```

### 5.2 注册到 ProviderRegistry

在 `src/adapters/registry.ts`：

```typescript
import { {{ClassName}}Adapter } from "./{{id}}/adapter.js";

// 在 builtins 数组中添加：
const builtins: SearchProviderAdapter[] = [
  new WosAdapter(),
  new PubMedAdapter(),
  new IeeeAdapter(),
  new ScopusAdapter(),
  new {{ClassName}}Adapter(),  // ← 新增
];
```

---

## 6. 验证步骤

```bash
# 1. 类型检查
npm run check

# 2. 运行测试
npm run test

# 3. 手动验证（headed browser）
# 启动 MCP 服务器后，通过 MCP 客户端依次调用：
#   open_advanced_search → detect_login_state → set_query → submit_search
#   → read_result_items → export_native
```

---

## 7. 常见陷阱与最佳实践

### 选择器优先级

```
data-testid > id > aria-label > name属性 > CSS class > 标签名
```

始终提供 2-3 个备选选择器，按优先级排列。网站改版时只需更新 `selectors.ts`。

### Cookie/隐私弹窗

很多学术数据库有 Cookie 同意弹窗。在 `clearInterferingUi()` 中处理：

```typescript
override async clearInterferingUi(context: ProviderContext): Promise<void> {
  // 先调用基类的通用处理
  await super.clearInterferingUi(context);
  // 再处理 provider 特有的弹窗
  const cookieButton = context.page.locator("#accept-cookies").first();
  if (await cookieButton.isVisible().catch(() => false)) {
    await cookieButton.click({ force: true });
  }
}
```

### 动态加载等待

对于 SPA 应用，使用 `runWithPageLoad` 包裹操作：

```typescript
await runWithPageLoad(context.page, async () => {
  await button.click();
});
```

对于需要等待特定元素出现的场景：

```typescript
await element.waitFor({ state: "visible", timeout: 15_000 });
```

### 导出超时

导出大量记录时可能需要较长时间。默认超时 30 秒，如需更长：

```typescript
context.page.waitForEvent("download", { timeout: 60_000 })
```

### 导出分块

如果数据库有单次导出上限（如 WoS 最多 1000 条），在 `detectExportCapability()` 中声明 `maxBatch`，上层的 `ExportManager` 会自动分块调用。

### ESM 导入

所有本地导入必须使用 `.js` 扩展名：

```typescript
import { foo } from "./bar.js";  // ✓
import { foo } from "./bar";     // ✗
```


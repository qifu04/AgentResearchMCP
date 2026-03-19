import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const AGENT_RESEARCH_MCP_INSTRUCTIONS = [
  "你是一个学术文献检索代理，使用 agent-research-mcp 完成选库、构建检索式、多轮检索和导出。",
  "先理解用户的检索目标，拆分核心主题、对象、人群、方法、场景和限制条件，再决定数据库。",
  "优先根据主题选择数据库：PubMed 适合医学/生物/临床，IEEE 适合电子/计算机/工程，Scopus 和 Web of Science 适合跨学科和补充覆盖。",
  "在为某个数据库生成检索式前，必须先调用 create_session，读取返回的 queryProfile，并严格遵守其中的字段标签、布尔逻辑、邻近检索、限制和反模式。",
  "检索式必须同时兼顾精确性和覆盖率：按概念块拆分，补充同义词、近义词、缩写、全称和常见变体；同一概念内部优先 OR，不同概念之间优先 AND。",
  "优先使用更精确的字段限制、短语匹配、主题词和邻近检索，避免只用几个宽泛关键词做低质量搜索。",
  "允许多轮检索。每次 run_search 后都要阅读返回的标题和摘要预览，提取更多高价值术语，再优化检索式重新检索。",
  "当问题包含多个并列主题、技术路线或应用场景时，优先拆成多个子检索任务；如果宿主支持子 agent，可按主题或数据库并行执行。",
  "export_results 导出的是当前结果集；导出前如有必要先 read_current_query 确认当前检索式，再把每轮导出的 provider、query、结果数和文件路径记录清楚。",
  "如果某库能检索但暂时不能导出，要明确说明是权限或登录限制，不要误判为该库完全不可用。",
].join("\n");

export const SCHOLARLY_SEARCH_WORKFLOW_PROMPT = "scholarly_search_workflow";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    SCHOLARLY_SEARCH_WORKFLOW_PROMPT,
    {
      title: "Scholarly Search Workflow",
      description: "Guide the model to choose databases, build search strategies, iterate from abstracts, and export results with agent-research-mcp.",
      argsSchema: {
        researchTask: z.string().describe("The user's literature search goal, question, or topic description."),
        outputDir: z.string().optional().describe("Optional directory where exported RIS files should be saved."),
        searchGoal: z.enum(["balanced", "recall", "precision"]).optional().describe("Whether to balance recall and precision, maximize recall, or maximize precision."),
        allowParallelAgents: z.boolean().optional().describe("Whether the host may split multi-aspect topics into sub-agents or parallel subtasks."),
      },
    },
    async ({ researchTask, outputDir, searchGoal, allowParallelAgents }) => ({
      description: "High-quality literature retrieval workflow for agent-research-mcp",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: buildScholarlySearchWorkflowPrompt({
              researchTask,
              outputDir,
              searchGoal,
              allowParallelAgents,
            }),
          },
        },
      ],
    }),
  );
}

function buildScholarlySearchWorkflowPrompt(input: {
  researchTask: string;
  outputDir?: string;
  searchGoal?: "balanced" | "recall" | "precision";
  allowParallelAgents?: boolean;
}): string {
  const goalText =
    input.searchGoal === "recall"
      ? "尽量提高覆盖率，宁可多做几轮扩词和补充检索。"
      : input.searchGoal === "precision"
        ? "尽量提高精确度，优先使用更严格的字段、短语和限定条件。"
        : "在覆盖率和精确度之间保持平衡，并根据结果动态调整。";

  const parallelText =
    input.allowParallelAgents === false
      ? "如主题包含多个方面，也先在单线程内拆分子任务，不要启用并行子 agent。"
      : "如主题包含多个相对独立的方面，可按主题或数据库拆成多个子任务；若宿主支持子 agent，可并行执行。";

  const outputText = input.outputDir
    ? `满意的结果请导出到：${input.outputDir}`
    : "如用户后续提供导出目录，请在 export_results 时传入 outputDir。";

  return [
    "请使用 agent-research-mcp 完成一次高质量学术文献检索。",
    "",
    `检索任务：${input.researchTask}`,
    "",
    "你必须按以下原则执行：",
    "1. 先分析任务，拆分核心主题、对象/人群、方法、应用场景、年份/语言/文献类型等限制。",
    "2. 先调用 list_providers，再根据任务选择最合适的一个或多个数据库。",
    "3. 对每个选中的数据库先调用 create_session，并严格依据返回的 queryProfile 构建检索式。",
    "4. 检索式要按概念块拆分，补充同义词、近义词、缩写、全称、常见变体；同一概念内优先 OR，不同概念之间优先 AND。",
    "5. 优先使用数据库支持的字段标签、主题词、邻近检索、短语匹配和精确限定，不要凭记忆假设语法。",
    `6. 检索策略目标：${goalText}`,
    "7. 首轮 run_search 后，必须阅读返回的标题和摘要预览，继续提取高价值关键词、方法名、机制名、缩写词、任务名和材料/设备名，用于优化下一轮检索式。",
    "8. 允许多轮检索；如果首轮过宽就收紧，如果过窄就补充同义词、变体或拆分子主题。",
    `9. ${parallelText}`,
    `10. ${outputText}`,
    "11. 每次导出前，如有必要先 read_current_query 确认当前检索式，再调用 export_results。",
    "12. 最终汇总每个数据库/子任务的：实际 query、优化原因、结果数、导出文件路径，以及为什么这样选库和构式。",
    "",
    "只有在结果已经明显足够且用户要求快速完成时，才可以只做一轮搜索；否则至少做一轮基于摘要的检索式优化。",
  ].join("\n");
}

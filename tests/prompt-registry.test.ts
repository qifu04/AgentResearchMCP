import { describe, expect, it, vi } from "vitest";
import {
  AGENT_RESEARCH_MCP_INSTRUCTIONS,
  registerPrompts,
  SCHOLARLY_SEARCH_WORKFLOW_PROMPT,
} from "../src/server/prompt-registry.js";

function createServerHarness() {
  const prompts = new Map<string, { config: unknown; handler: (args: any) => Promise<any> }>();
  const server = {
    registerPrompt: vi.fn((name: string, config: unknown, handler: (args: any) => Promise<any>) => {
      prompts.set(name, { config, handler });
    }),
  };

  return { server, prompts };
}

describe("prompt-registry", () => {
  it("registers the scholarly search workflow prompt", () => {
    const { server, prompts } = createServerHarness();

    registerPrompts(server as never);

    expect(server.registerPrompt).toHaveBeenCalledOnce();
    expect(Array.from(prompts.keys())).toEqual([SCHOLARLY_SEARCH_WORKFLOW_PROMPT]);
  });

  it("builds a task-specific workflow prompt that emphasizes queryProfile and iterative searching", async () => {
    const { server, prompts } = createServerHarness();

    registerPrompts(server as never);

    const prompt = await prompts.get(SCHOLARLY_SEARCH_WORKFLOW_PROMPT)!.handler({
      researchTask: "检索脑卒中康复中使用机器学习预测运动功能恢复的研究",
      outputDir: "D:/exports/stroke-ml",
      searchGoal: "recall",
      allowParallelAgents: true,
    });

    const text = prompt.messages[0].content.text;
    expect(text).toContain("list_providers");
    expect(text).toContain("create_session");
    expect(text).toContain("queryProfile");
    expect(text).toContain("run_search");
    expect(text).toContain("read_current_query");
    expect(text).toContain("export_results");
    expect(text).toContain("D:/exports/stroke-ml");
    expect(text).toContain("基于摘要的检索式优化");
  });

  it("exposes initialize-time instructions for clients that consume server guidance", () => {
    expect(AGENT_RESEARCH_MCP_INSTRUCTIONS).toContain("create_session");
    expect(AGENT_RESEARCH_MCP_INSTRUCTIONS).toContain("queryProfile");
    expect(AGENT_RESEARCH_MCP_INSTRUCTIONS).toContain("多轮检索");
    expect(AGENT_RESEARCH_MCP_INSTRUCTIONS).toContain("export_results");
  });
});

import type { ProviderDescriptor } from "../provider-contract.js";

export const wosDescriptor: ProviderDescriptor = {
  id: "wos",
  displayName: "Web of Science Core Collection",
  entryUrl: "https://webofscience.clarivate.cn/wos/woscc/advanced-search",
  supportsManualLoginWait: true,
  capabilities: {
    rawQuery: true,
    builderUi: true,
    filters: true,
    inlineAbstracts: true,
    selection: true,
    export: true,
  },
};

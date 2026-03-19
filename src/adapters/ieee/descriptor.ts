import type { ProviderDescriptor } from "../provider-contract.js";

export const ieeeDescriptor: ProviderDescriptor = {
  id: "ieee",
  displayName: "IEEE Xplore",
  entryUrl: "https://ieeexplore.ieee.org/search/advanced/command",
  supportsManualLoginWait: true,
  capabilities: {
    rawQuery: true,
    builderUi: true,
    filters: false,
    inlineAbstracts: true,
    selection: true,
    export: true,
  },
};

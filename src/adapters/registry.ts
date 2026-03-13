import type { ProviderDescriptor, ProviderId, SearchProviderAdapter } from "./provider-contract.js";
import { IeeeAdapter } from "./ieee/adapter.js";
import { PubMedAdapter } from "./pubmed/adapter.js";
import { ScopusAdapter } from "./scopus/adapter.js";
import { WosAdapter } from "./wos/adapter.js";

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, SearchProviderAdapter>();

  constructor() {
    const builtins: SearchProviderAdapter[] = [
      new WosAdapter(),
      new PubMedAdapter(),
      new IeeeAdapter(),
      new ScopusAdapter(),
    ];

    for (const provider of builtins) {
      this.providers.set(provider.descriptor.id, provider);
    }
  }

  get(providerId: ProviderId): SearchProviderAdapter {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unsupported provider: ${providerId}`);
    }
    return provider;
  }

  listDescriptors(): ProviderDescriptor[] {
    return Array.from(this.providers.values()).map((provider) => provider.descriptor);
  }
}

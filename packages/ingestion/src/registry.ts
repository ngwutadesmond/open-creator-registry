import type { SourceConnector } from './contracts';
import { wikidataConnector } from './wikidata';

export class SourceConnectorRegistry {
  readonly #connectors = new Map<string, SourceConnector>();

  register(connector: SourceConnector): void {
    if (this.#connectors.has(connector.sourceName)) {
      throw new Error(`A connector named ${connector.sourceName} is already registered.`);
    }
    this.#connectors.set(connector.sourceName, connector);
  }

  get(sourceName: string): SourceConnector | null {
    return this.#connectors.get(sourceName) ?? null;
  }

  require(sourceName: string): SourceConnector {
    const connector = this.get(sourceName);
    if (!connector) throw new Error(`No connector is registered for ${sourceName}.`);
    return connector;
  }

  list(): SourceConnector[] {
    return [...this.#connectors.values()].sort((left, right) =>
      left.sourceName.localeCompare(right.sourceName),
    );
  }
}

export const musicBrainzConnectorDescriptor = {
  sourceName: 'musicbrainz',
  connectorVersion: 'not_implemented',
  mappingVersion: 'not_implemented',
  accessMode: 'official_api',
  readiness: 'not_implemented',
} as const;

export const approvedPublicWebConnectorPolicy = {
  requiresSourceSpecificApproval: true,
  publicPagesOnly: true,
  fixedHttpsHosts: true,
  identifiedUserAgent: true,
  robotsAndTermsReview: true,
  boundedResponses: true,
  allowlistedFieldsOnly: true,
  arbitraryPublicUrls: false,
  authenticationBypass: false,
  captchaBypass: false,
  antiBotCircumvention: false,
  proxyEvasion: false,
} as const;

export function createDefaultConnectorRegistry(): SourceConnectorRegistry {
  const registry = new SourceConnectorRegistry();
  registry.register(wikidataConnector);
  return registry;
}

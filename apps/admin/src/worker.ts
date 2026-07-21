import { createAdminApp } from './api/routes';
import { createWikidataFixtureFetch } from '@open-creator-registry/ingestion/fixtures';
import { createDefaultConnectorRegistry } from '@open-creator-registry/ingestion/registry';
import { runScheduledIngestion } from '@open-creator-registry/ingestion/scheduled';
import type { AdminRuntimeBindings } from './api/app-env';

const app = createAdminApp();

export default {
  fetch: app.fetch,
  request: app.request,
  async scheduled(_controller: ScheduledController, env: AdminRuntimeBindings): Promise<void> {
    await runScheduledIngestion({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext:
        env.WIKIDATA_FIXTURE_MODE === 'enabled'
          ? {
              fetch: createWikidataFixtureFetch(),
              now: () => new Date().toISOString(),
              sleep: () => Promise.resolve(),
              random: () => 0,
            }
          : undefined,
    });
  },
};

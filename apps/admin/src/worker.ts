import { createAdminApp } from './api/routes';
import { createWikidataFixtureFetch } from '@open-creator-registry/ingestion/fixtures';
import { createDefaultConnectorRegistry } from '@open-creator-registry/ingestion/registry';
import { runScheduledIngestion } from '@open-creator-registry/ingestion/scheduled';
import { defaultConnectorContext } from '@open-creator-registry/ingestion/contracts';
import type { AdminRuntimeBindings } from './api/app-env';

const app = createAdminApp();

export default {
  fetch: app.fetch,
  request: app.request,
  async scheduled(controller: ScheduledController, env: AdminRuntimeBindings): Promise<void> {
    const invocationId = crypto.randomUUID();
    const startedAt = performance.now();
    console.log(
      JSON.stringify({
        event: 'scheduled_ingestion_started',
        invocation_id: invocationId,
        cron: controller.cron,
        environment: env.ENVIRONMENT,
        worker_name: env.WORKER_NAME ?? 'open-creator-registry-admin',
      }),
    );
    const results = await runScheduledIngestion({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext:
        env.WIKIDATA_FIXTURE_MODE === 'enabled'
          ? {
              ...defaultConnectorContext,
              fetch: createWikidataFixtureFetch(),
              now: () => new Date().toISOString(),
              sleep: () => Promise.resolve(),
              random: () => 0,
              userAgent: 'OpenCreatorRegistry/0.1 (deterministic-local-fixture)',
            }
          : {
              ...defaultConnectorContext,
              userAgent:
                env.WIKIDATA_USER_AGENT ??
                'OpenCreatorRegistry/0.1 (unconfigured-contact; connector disabled by default)',
            },
    });
    for (const result of results) {
      console.log(
        JSON.stringify({
          event: 'scheduled_ingestion_source_completed',
          invocation_id: invocationId,
          ingestion_run_id: result.runId,
          source_name: result.sourceName,
          status: result.status,
          environment: env.ENVIRONMENT,
          worker_name: env.WORKER_NAME ?? 'open-creator-registry-admin',
        }),
      );
    }
    console.log(
      JSON.stringify({
        event: 'scheduled_ingestion_completed',
        invocation_id: invocationId,
        status: results.some((result) => result.status === 'failed')
          ? 'completed_with_errors'
          : 'completed',
        source_count: results.length,
        duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
        environment: env.ENVIRONMENT,
        worker_name: env.WORKER_NAME ?? 'open-creator-registry-admin',
      }),
    );
  },
};

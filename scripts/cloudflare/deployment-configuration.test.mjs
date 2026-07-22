import { beforeAll, describe, expect, it } from 'vitest';

import { applicationConfigurations, repositoryRoot } from './configuration.mjs';
import {
  createDeploymentPlan,
  materializeDeploymentManifest,
  validateDeploymentManifest,
  validateStructuralConfiguration,
} from './deployment-configuration.mjs';

const values = {
  OCR_D1_DATABASE_ID: '00000000-0000-4000-8000-000000000000',
  OCR_ACCOUNT_SUBDOMAIN: 'creator-registry-stage',
  OCR_PROJECT_CONTACT_URL: 'https://example.invalid/open-creator-registry',
  OCR_ACCESS_TEAM_NAME: 'creator-registry-stage',
  OCR_ACCESS_AUD: 'staging_audience_123',
};

let templates;

beforeAll(async () => {
  templates = await applicationConfigurations();
});

function configurations() {
  return JSON.parse(JSON.stringify(templates));
}

function materialize(target, phase, inputValues = values) {
  const template = templates[target];
  return materializeDeploymentManifest({
    configuration: template.config,
    configurationPath: template.configPath,
    repositoryRoot,
    environment: 'staging',
    target,
    phase,
    values: inputValues,
  });
}

function validate(manifest, target, phase, secretPresence) {
  return validateDeploymentManifest({
    manifest,
    manifestPath: '/ignored/test/wrangler.json',
    environment: 'staging',
    target,
    phase,
    secretPresence,
  });
}

describe('stage-aware Cloudflare deployment configuration', () => {
  it('passes structural staging validation while templates contain placeholders', () => {
    expect(
      validateStructuralConfiguration({ configurations: configurations(), environment: 'staging' }),
    ).toMatchObject({ structurally_valid: true, deployment_ready: false });
  });

  it('reports every known unresolved staging value', () => {
    const report = validateStructuralConfiguration({
      configurations: configurations(),
      environment: 'staging',
    });
    expect(report.unresolved_values).toEqual([
      'REPLACE_WITH_ACCOUNT_SUBDOMAIN',
      'REPLACE_WITH_PROJECT_CONTACT_URL',
      'REPLACE_WITH_STAGING_ACCESS_AUD',
      'REPLACE_WITH_STAGING_D1_ID',
      'REPLACE_WITH_TEAM_NAME',
    ]);
  });

  it('rejects accidental production resource selection during structural validation', () => {
    const input = configurations();
    input.public.config.env.staging.name = 'open-creator-registry';
    expect(() =>
      validateStructuralConfiguration({ configurations: input, environment: 'staging' }),
    ).toThrow('public Worker name');
  });

  it('rejects a public and administration Worker-name collision', () => {
    const input = configurations();
    input.admin.config.env.staging.name = input.public.config.env.staging.name;
    expect(() =>
      validateStructuralConfiguration({ configurations: input, environment: 'staging' }),
    ).toThrow('public/admin Worker collision');
  });

  it('rejects a staging and production D1-name collision', () => {
    const input = configurations();
    input.public.config.env.staging.d1_databases[0].database_name =
      input.public.config.env.production.d1_databases[0].database_name;
    expect(() =>
      validateStructuralConfiguration({ configurations: input, environment: 'staging' }),
    ).toThrow('staging/production D1 collision');
  });

  it('fails public materialization without the staging D1 ID', () => {
    expect(() => materialize('public', 'deploy', { ...values, OCR_D1_DATABASE_ID: '' })).toThrow(
      'OCR_D1_DATABASE_ID is required',
    );
  });

  it('does not require an Access team domain for public readiness', () => {
    const { manifest } = materialize('public', 'deploy', {
      OCR_D1_DATABASE_ID: values.OCR_D1_DATABASE_ID,
      OCR_ACCOUNT_SUBDOMAIN: values.OCR_ACCOUNT_SUBDOMAIN,
    });
    expect(validate(manifest, 'public', 'deploy')).toMatchObject({ deployment_ready: true });
  });

  it('does not require an Access audience for public readiness', () => {
    const { manifest } = materialize('public', 'deploy', {
      ...values,
      OCR_ACCESS_AUD: '',
    });
    expect(validate(manifest, 'public', 'deploy')).toMatchObject({ target: 'public' });
  });

  it('does not require administrator secret presence for public readiness', () => {
    const { manifest } = materialize('public', 'deploy');
    expect(validate(manifest, 'public', 'deploy', {})).toMatchObject({ deployment_ready: true });
  });

  it('accepts a complete public staging manifest', () => {
    const { manifest, outputPath } = materialize('public', 'deploy');
    expect(
      validateDeploymentManifest({
        manifest,
        manifestPath: outputPath,
        environment: 'staging',
        target: 'public',
      }),
    ).toMatchObject({
      worker_name: 'open-creator-registry-staging',
      database_name: 'open-creator-registry-staging',
    });
  });

  it('permits empty Access team and audience values during admin bootstrap', () => {
    const { manifest } = materialize('admin', 'bootstrap');
    expect(manifest.vars).toMatchObject({
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: '',
      CLOUDFLARE_ACCESS_AUD: '',
    });
    expect(validate(manifest, 'admin', 'bootstrap')).toMatchObject({ deployment_ready: true });
  });

  it('keeps admin bootstrap on the default-deny Cloudflare Access provider', () => {
    const { manifest } = materialize('admin', 'bootstrap');
    expect(manifest.vars).toMatchObject({
      AUTH_PROVIDER: 'cloudflare_access',
      CLOUDFLARE_ACCESS_AUD: '',
    });
    expect(validate(manifest, 'admin', 'bootstrap').authentication_mode).toBe('cloudflare_access');
  });

  it('rejects local administrator authentication in admin bootstrap', () => {
    const { manifest } = materialize('admin', 'bootstrap');
    manifest.vars.AUTH_PROVIDER = 'local_development';
    manifest.vars.DEV_ADMIN_EMAIL = 'local@example.invalid';
    expect(() => validate(manifest, 'admin', 'bootstrap')).toThrow('admin AUTH_PROVIDER');
  });

  it('rejects arbitrary-header identity configuration in admin bootstrap', () => {
    const { manifest } = materialize('admin', 'bootstrap');
    manifest.vars.ADMIN_IDENTITY_HEADER = 'X-Admin-Email';
    expect(() => validate(manifest, 'admin', 'bootstrap')).toThrow('admin local identity fallback');
  });

  it('fails admin final materialization without an Access team domain', () => {
    expect(() => materialize('admin', 'final', { ...values, OCR_ACCESS_TEAM_NAME: '' })).toThrow(
      'OCR_ACCESS_TEAM_NAME is required',
    );
  });

  it('fails admin final materialization without an Access audience', () => {
    expect(() => materialize('admin', 'final', { ...values, OCR_ACCESS_AUD: '' })).toThrow(
      'OCR_ACCESS_AUD is required',
    );
  });

  it('fails admin final readiness without administrator secret-presence inputs', () => {
    const { manifest } = materialize('admin', 'final');
    expect(
      validateDeploymentManifest({
        manifest,
        manifestPath: '/ignored/test/wrangler.json',
        environment: 'staging',
        target: 'admin',
        phase: 'final',
        requireAdminSecrets: false,
      }),
    ).toMatchObject({ deployment_ready: false });
    expect(() => validate(manifest, 'admin', 'final', {})).toThrow('ADMIN_ALLOWED_EMAILS presence');
  });

  it('accepts admin final readiness with Access and secret-presence inputs', () => {
    const { manifest } = materialize('admin', 'final');
    expect(
      validate(manifest, 'admin', 'final', { allowedEmails: true, roleMappings: true }),
    ).toMatchObject({ deployment_ready: true, phase: 'final' });
  });

  it('generates a public-only staging manifest', () => {
    const { manifest } = materialize('public', 'deploy');
    expect(manifest.env).toBeUndefined();
    expect(manifest.name).toBe('open-creator-registry-staging');
    expect(JSON.stringify(manifest)).not.toContain('open-creator-registry-admin-staging');
  });

  it('generates an admin-only staging manifest', () => {
    const { manifest } = materialize('admin', 'bootstrap');
    expect(manifest.env).toBeUndefined();
    expect(manifest.name).toBe('open-creator-registry-admin-staging');
    expect(JSON.stringify(manifest)).not.toContain('"name":"open-creator-registry-staging"');
  });

  it('binds generated manifests only to the supplied staging D1 ID', () => {
    for (const [target, phase] of [
      ['public', 'deploy'],
      ['admin', 'bootstrap'],
    ]) {
      const { manifest } = materialize(target, phase);
      expect(manifest.d1_databases).toEqual([
        expect.objectContaining({
          binding: 'DB',
          database_name: 'open-creator-registry-staging',
          database_id: values.OCR_D1_DATABASE_ID,
        }),
      ]);
    }
  });

  it('rejects production Worker and D1 names in a staging deployment manifest', () => {
    const { manifest } = materialize('public', 'deploy');
    manifest.name = 'open-creator-registry';
    manifest.d1_databases[0].database_name = 'open-creator-registry-production';
    expect(() => validate(manifest, 'public', 'deploy')).toThrow('public Worker name');
  });

  it('uses the same generated source manifest for dry-run and real deployment', () => {
    const dryRun = createDeploymentPlan({
      repositoryRoot,
      environment: 'staging',
      target: 'admin',
      phase: 'bootstrap',
      dryRun: true,
    });
    const deploy = createDeploymentPlan({
      repositoryRoot,
      environment: 'staging',
      target: 'admin',
      phase: 'bootstrap',
      dryRun: false,
    });
    expect(dryRun.sourceManifestPath).toBe(deploy.sourceManifestPath);
  });

  it('does not place administrator secrets in generated manifests or validation output', () => {
    const secretValues = {
      ...values,
      ADMIN_ALLOWED_EMAILS: 'administrator@example.invalid',
      ADMIN_ROLE_MAPPINGS: '{"administrator@example.invalid":["super_admin"]}',
    };
    const { manifest, outputPath } = materialize('admin', 'final', secretValues);
    const report = validateDeploymentManifest({
      manifest,
      manifestPath: outputPath,
      environment: 'staging',
      target: 'admin',
      phase: 'final',
      secretPresence: { allowedEmails: true, roleMappings: true },
    });
    const output = JSON.stringify({ manifest, report });
    expect(output).not.toContain(secretValues.ADMIN_ALLOWED_EMAILS);
    expect(output).not.toContain('super_admin');
  });
});

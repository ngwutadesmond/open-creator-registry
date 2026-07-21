import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const adminUrl = 'http://localhost:5174';
const publicUrl = 'http://localhost:5173';
const browserErrors = new WeakMap<object, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
});

test.afterEach(({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

test('creates a creator, evidence, and a non-critical reservation through the admin UI', async ({
  page,
}) => {
  await page.goto(adminUrl);
  await expect(page.getByText('10', { exact: true }).first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag21a']).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('link', { name: 'Create creator' }).click();
  await page.getByLabel('Canonical name').fill('Phase Five Workflow Creator');
  await page.getByLabel('Entity type').fill('person');
  await page.getByLabel('Primary category').fill('education');
  await page.getByLabel('Country codes').fill('NG');
  await page.getByLabel('Notoriety score').fill('68');
  await page.getByLabel('Protection tier').selectOption('notable');
  await page.getByLabel('Review status').selectOption('approved');
  await page
    .getByLabel('Biography summary')
    .fill('Demonstration creator used only by the local Phase 5 browser workflow.');
  await page.getByRole('button', { name: 'Save creator' }).click();
  await expect(page.getByRole('heading', { name: 'Phase Five Workflow Creator' })).toBeVisible();

  await page.getByLabel('Alias', { exact: true }).fill('Phase Five Creator');
  await page.getByRole('button', { name: 'Add alias' }).click();
  await expect(page.getByText('Alias added.')).toBeVisible();
  await page.getByLabel('Source name').fill('Official demonstration source');
  await page.getByLabel('External ID').fill('phase-five-workflow');
  await page.getByLabel('Public URL').fill('https://example.com/phase-five-workflow');
  await page.getByRole('button', { name: 'Add source' }).click();
  await expect(page.getByText('Source added.')).toBeVisible();

  await page.getByRole('link', { name: 'Reserve handle' }).click();
  await page.getByLabel('Display handle').fill('@phase.five-workflow');
  await page.getByLabel('Classification').selectOption('soft_protected');
  await page.getByLabel('Decision source').fill('Phase 5 reviewed demonstration');
  await page
    .getByLabel('Reason')
    .fill('Reviewed demonstration evidence supports a protected official-style variant.');
  await page.getByRole('button', { name: 'Submit reservation' }).click();
  await expect(page.getByRole('heading', { name: '@phase_five_workflow' })).toBeVisible();

  await page.goto(`${publicUrl}/check?handle=phase_five_workflow`);
  await expect(page.getByText('Soft protected')).toBeVisible();
  await expect(page.getByText(/require creator verification or manual review/i)).toBeVisible();
});

test('reviews a public submission via a candidate without creating a handle', async ({
  page,
  request,
}) => {
  const before = await request.get(`${publicUrl}/api/v1/registry/meta`);
  const beforeBody = (await before.json()) as {
    data: { record_counts: { active_reserved_handles: number } };
  };
  const submitted = await request.post(`${publicUrl}/api/v1/submissions`, {
    data: {
      creator_name: 'Phase Five Candidate Creator',
      category: 'design',
      country_codes: ['GH'],
      requested_handles: ['phase_five_candidate'],
      public_sources: ['https://example.com/phase-five-candidate'],
    },
  });
  expect(submitted.status()).toBe(201);

  await page.goto(`${adminUrl}/submissions`);
  await page.getByRole('link', { name: 'Phase Five Candidate Creator' }).click();
  await page.getByRole('button', { name: 'Convert to candidate' }).click();
  await page.getByRole('button', { name: 'Confirm decision' }).click();
  await expect(page.getByText(/Zero live handles were created/i)).toBeVisible();

  await page.goto(`${adminUrl}/candidates`);
  await page.getByRole('link', { name: 'Phase Five Candidate Creator' }).click();
  await page.getByRole('button', { name: 'Approve to creator draft' }).click();
  await page.getByRole('button', { name: 'Confirm approve' }).click();
  await expect(page.getByText(/No handle was automatically reserved/i)).toBeVisible();

  const after = await request.get(`${publicUrl}/api/v1/registry/meta`);
  const afterBody = (await after.json()) as typeof beforeBody;
  expect(afterBody.data.record_counts.active_reserved_handles).toBe(
    beforeBody.data.record_counts.active_reserved_handles,
  );
});

test('previews and commits a validated JSON import', async ({ page }) => {
  await page.goto(`${adminUrl}/imports`);
  await page.getByLabel('Import content').fill(
    JSON.stringify([
      {
        record_type: 'creator',
        canonical_name: 'Phase Five Imported Creator',
        entity_type: 'person',
        country_codes: ['NG'],
        notoriety_score: 61,
        protection_tier: 'standard',
        review_status: 'pending',
      },
    ]),
  );
  await page.getByRole('button', { name: 'Create dry-run preview' }).click();
  await expect(page.getByRole('heading', { name: 'manual-preview.json' })).toBeVisible();
  await expect(page.getByText('previewed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Commit validated import' }).click();
  await page.getByRole('button', { name: 'Commit import' }).click();
  await expect(page.getByText(/Import committed/i)).toBeVisible();
  await page.goto(`${adminUrl}/creators?query=Phase+Five+Imported+Creator`);
  await expect(page.getByRole('link', { name: 'Phase Five Imported Creator' })).toBeVisible();
});

test('enforces two-person critical handle approval and publishes a release', async ({ page }) => {
  await page.goto(`${adminUrl}/creators/new`);
  await page.getByLabel('Canonical name').fill('Phase Five Critical Creator');
  await page.getByLabel('Entity type').fill('person');
  await page.getByLabel('Notoriety score').fill('95');
  await page.getByLabel('Protection tier').selectOption('critical');
  await page.getByLabel('Review status').selectOption('approved');
  await page.getByRole('button', { name: 'Save creator' }).click();
  await page.getByRole('link', { name: 'Reserve handle' }).click();
  await page.getByLabel('Display handle').fill('@phase_five_critical');
  await page.getByLabel('Classification').selectOption('hard_reserved');
  await page.getByLabel('Decision source').fill('Critical creator review');
  await page
    .getByLabel('Reason')
    .fill('Critical demonstration identity has reviewed public evidence for exact protection.');
  await page.getByRole('button', { name: 'Submit reservation' }).click();
  await expect(page.getByText(/entered the two-person approval queue/i)).toBeVisible();

  await page.goto(`${adminUrl}/approvals`);
  await page.getByRole('link', { name: 'handle.create_critical' }).click();
  await page.getByRole('button', { name: 'Approve independently' }).click();
  await page.getByRole('button', { name: 'Confirm approve' }).click();
  await expect(page.getByRole('alert')).toContainText(/own approval request/i);
  await expect.poll(() => browserErrors.get(page)?.length ?? 0).toBe(1);
  expect(browserErrors.get(page)?.shift()).toContain('status of 422');

  await page.goto(`${adminUrl}/settings`);
  await page.getByRole('button', { name: 'Use secondary local admin' }).click();
  await expect(page.getByLabel('Current local administrator').getByText('Admin Two')).toBeVisible();
  await page.goto(`${adminUrl}/approvals?status=pending`);
  await page.getByRole('link', { name: 'handle.create_critical' }).click();
  await page.getByRole('button', { name: 'Approve independently' }).click();
  await page.getByRole('button', { name: 'Confirm approve' }).click();
  await expect(page.getByText('applied', { exact: true })).toBeVisible();

  await page.goto(`${publicUrl}/check?handle=phase_five_critical`);
  await expect(page.getByText('Hard reserved')).toBeVisible();

  await page.goto(`${adminUrl}/releases`);
  await page.getByRole('button', { name: 'Create release' }).click();
  await page.getByLabel('Release version').fill('phase-5-browser-release');
  await page.getByLabel('Release reason').fill('Phase 5 local browser verification');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByRole('link', { name: 'phase-5-browser-release' }).click();
  await page.getByRole('button', { name: 'Calculate snapshot' }).click();
  await page.getByRole('button', { name: 'Confirm calculate' }).click();
  await page.getByRole('button', { name: 'Request approval' }).click();
  await page.getByRole('button', { name: 'Confirm request-approval' }).click();

  await page.goto(`${adminUrl}/settings`);
  await page.getByRole('button', { name: 'Use primary local admin' }).click();
  await expect(page.getByLabel('Current local administrator').getByText('Admin One')).toBeVisible();
  await page.goto(`${adminUrl}/releases`);
  await page.getByRole('link', { name: 'phase-5-browser-release' }).click();
  await page.getByRole('button', { name: 'Approve as second admin' }).click();
  await page.getByRole('button', { name: 'Confirm approve' }).click();
  await page.getByRole('button', { name: 'Publish approved release' }).click();
  await page.getByRole('button', { name: 'Confirm publish' }).click();
  await expect(page.getByText('published', { exact: true })).toBeVisible();

  await page.goto(`${publicUrl}/releases`);
  await expect(page.getByRole('heading', { name: 'phase-5-browser-release' })).toBeVisible();
});

test('keeps the private shell usable at mobile widths and supports direct deep links', async ({
  page,
}) => {
  const viewports = [
    { width: 1536, height: 1024, path: '/', heading: 'Registry administration' },
    { width: 1280, height: 800, path: '/creators', heading: 'Creators' },
    { width: 1024, height: 768, path: '/handles', heading: 'Reserved handles' },
    { width: 768, height: 1024, path: '/imports', heading: 'Data imports' },
    { width: 390, height: 844, path: '/audit-logs', heading: 'Audit logs' },
    { width: 320, height: 844, path: '/releases', heading: 'Registry releases' },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${adminUrl}${viewport.path}`);
    await expect(page.getByRole('heading', { name: viewport.heading })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${adminUrl}/audit-logs`);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Administration navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
});

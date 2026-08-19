import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const creatorId = '10000000-0000-4000-8000-000000000001';
const adminUrl = 'http://localhost:5174';
const publicUrl = 'http://localhost:5173';
const bulkFixtureDirectory = path.resolve('e2e/fixtures/bulk-submissions');

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  browserErrors.set(page, []);
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.get(page)?.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.get(page)?.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (failure.includes('ERR_ABORTED')) return;
    browserErrors.get(page)?.push(`request: ${request.url()} ${failure}`);
  });
});

test.afterEach(({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

async function expectNoAutomaticAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag21a']).analyze();
  expect(results.violations).toEqual([]);
}

test('checks hard-reserved and not-listed handles against seeded D1', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Know when a creator handle needs protection.' }),
  ).toBeVisible();
  await expect(page.getByText(/local demonstration data only/i)).toBeVisible();
  await expectNoAutomaticAccessibilityViolations(page);

  await page.getByRole('textbox', { name: 'Username or handle' }).fill('demo_aurora_vale');
  const hardReservedResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/handles/check') && response.status() === 200,
  );
  await page.getByRole('textbox', { name: 'Username or handle' }).press('Enter');
  await hardReservedResponse;
  await expect(page).toHaveURL(/\/check\?handle=demo_aurora_vale$/);
  await expect(page.getByText('Hard reserved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protected creator username' })).toBeVisible();
  await expect(page.getByText(/do not assign this username/i)).toBeVisible();

  await page.getByRole('textbox', { name: 'Username or handle' }).fill('ordinary_name');
  await page.getByRole('button', { name: 'Check protection status' }).click();
  await expect(page.getByText('Not listed')).toBeVisible();
  await expect(
    page.getByText(/must still perform its own availability and abuse checks/i),
  ).toBeVisible();
  await expect(page.getByText(/username is available/i)).toHaveCount(0);
});

test('searches, filters, opens a creator, and preserves browser history', async ({ page }) => {
  await page.goto('/creators');
  await expect(page.getByText(/\d+ public records/)).toBeVisible();
  await page
    .getByRole('searchbox', { name: /creator, alias, handle, or source identifier/i })
    .fill('Aurora');
  await page.getByRole('button', { name: 'Search Registry' }).click();
  await expect(page).toHaveURL(/query=Aurora/);
  await expect(page.getByText('Demo Aurora Vale')).toBeVisible();

  await page.getByRole('combobox', { name: 'Category' }).selectOption('music');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('US');
  await page.getByRole('combobox', { name: 'Protection tier' }).selectOption('critical');
  await expect(page).toHaveURL(/category=music/);
  await expect(page).toHaveURL(/country=US/);
  await expect(page).toHaveURL(/protection_tier=critical/);

  await page.getByRole('link', { name: 'Demo Aurora Vale' }).click();
  await expect(page).toHaveURL(`/creators/${creatorId}`);
  await expect(page.getByRole('heading', { name: 'Demo Aurora Vale' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protected handles' })).toBeVisible();
  await expect(page.getByText('@demo_aurora_vale')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Public aliases' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verified public sources' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/creators\?.*query=Aurora/);
  await page.goForward();
  await expect(page).toHaveURL(`/creators/${creatorId}`);
});

test('loads and refreshes deep links and renders an unknown-route state', async ({ page }) => {
  await page.goto(`/creators/${creatorId}`);
  await expect(page.getByRole('heading', { name: 'Demo Aurora Vale' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Demo Aurora Vale' })).toBeVisible();

  await page.goto('/this-route-does-not-exist');
  await expect(
    page.getByRole('heading', { name: 'This public Registry page does not exist.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore creators' })).toBeVisible();
});

test('validates, recovers, submits structured evidence, and exposes it in the admin queue', async ({
  page,
  request,
}) => {
  const before = await request.get('/api/v1/registry/meta');
  const beforeBody = (await before.json()) as {
    data: { record_counts: { approved_creators: number; active_reserved_handles: number } };
  };

  await page.goto('/submit');
  await expectNoAutomaticAccessibilityViolations(page);
  await page
    .getByRole('textbox', { name: /creator public name/i })
    .fill('Phase Four Demo Proposal');
  await page.getByRole('textbox', { name: 'Username 1' }).fill('bad/handle');
  await page.getByRole('textbox', { name: 'Supporting source 1' }).fill('not-a-url');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Review the submission' })).toBeVisible();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('textbox', { name: /creator public name/i })).toHaveValue(
    'Phase Four Demo Proposal',
  );

  await page.getByRole('combobox', { name: 'Category' }).selectOption('music');
  const countrySearch = page.getByRole('combobox', { name: /countries/i });
  await countrySearch.focus();
  await page.keyboard.type('Nigeria');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Nigeria (NG)' })).toBeVisible();
  await page.keyboard.type('Ghana');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Ghana (GH)' })).toBeVisible();
  const removeGhana = page.getByRole('button', { name: 'Remove Ghana (GH)' });
  await removeGhana.focus();
  await page.keyboard.press('Enter');
  await expect(removeGhana).toBeHidden();
  await expect(countrySearch).toBeFocused();
  await page.keyboard.type('Ghana');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Ghana (GH)' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Username 1' }).fill('phase_four_demo_proposal');
  await page.getByRole('button', { name: 'Add another username' }).click();
  await expect(page.getByRole('textbox', { name: 'Username 2' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Username 2' }).fill('@phase.four.demo');
  await page
    .getByRole('textbox', { name: 'Supporting source 1' })
    .fill('https://example.com/phase-four-demo');
  await page.getByRole('button', { name: 'Add another source' }).click();
  await expect(page.getByRole('textbox', { name: 'Supporting source 2' })).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Supporting source 2' })
    .fill('https://example.org/phase-four-demo');
  const reviewSummary = page.locator('.submission-review-summary');
  await expect(reviewSummary).toContainText('Music');
  await expect(reviewSummary).toContainText('Nigeria (NG), Ghana (GH)');
  await expect(reviewSummary).toContainText('Requested usernames2');
  await expect(reviewSummary).toContainText('Supporting sources2');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
  await expect(page.getByText('Pending review')).toBeVisible();
  await expect(
    page.getByText(/has not approved a creator or reserved any username/i),
  ).toBeVisible();

  await page.goto(`${adminUrl}/submissions`);
  await expect(page.getByRole('link', { name: 'Phase Four Demo Proposal' })).toBeVisible();

  await page.goto(`${publicUrl}/submit`);
  await page
    .getByRole('textbox', { name: /creator public name/i })
    .fill('Phase Four Demo Proposal');
  await page.getByRole('combobox', { name: 'Category' }).selectOption('music');
  const duplicateCountrySearch = page.getByRole('combobox', { name: /countries/i });
  await duplicateCountrySearch.fill('Nigeria');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await duplicateCountrySearch.fill('Ghana');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Username 1' }).fill('@phase_four_demo_proposal');
  await page.getByRole('button', { name: 'Add another username' }).click();
  await page.getByRole('textbox', { name: 'Username 2' }).fill('phase-four-demo');
  await page
    .getByRole('textbox', { name: 'Supporting source 1' })
    .fill('https://example.org/phase-four-demo');
  await page.getByRole('button', { name: 'Add another source' }).click();
  await page
    .getByRole('textbox', { name: 'Supporting source 2' })
    .fill('https://example.com/phase-four-demo');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(
    page.getByRole('heading', { name: 'This proposal is already pending' }),
  ).toBeVisible();
  browserErrors.set(
    page,
    (browserErrors.get(page) ?? []).filter(
      (message) =>
        message !==
        'console: Failed to load resource: the server responded with a status of 409 (Conflict)',
    ),
  );
  await expect(page.getByRole('textbox', { name: /creator public name/i })).toHaveValue(
    'Phase Four Demo Proposal',
  );

  const after = await request.get('/api/v1/registry/meta');
  const afterBody = (await after.json()) as typeof beforeBody;
  expect(afterBody.data.record_counts).toEqual(beforeBody.data.record_counts);
});

test('completes the creator submission flow on a 320px mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/submit');
  await page.getByRole('textbox', { name: /creator public name/i }).fill('Mobile Demo Creator');
  await page.getByRole('combobox', { name: 'Category' }).selectOption('comedy');
  const countrySearch = page.getByRole('combobox', { name: /countries/i });
  await countrySearch.fill('Ghana');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Username 1' }).fill('mobile_demo_creator');
  await page
    .getByRole('textbox', { name: 'Supporting source 1' })
    .fill('https://example.test/mobile-demo-creator');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
});

test('previews, commits, deduplicates, reports, and reviews CSV and XLSX public batches', async ({
  page,
  request,
}) => {
  const submissionTotal = async () => {
    const response = await request.get(`${adminUrl}/api/admin/v1/submissions?limit=100`);
    expect(response.status()).toBe(200);
    return ((await response.json()) as { meta: { pagination: { total: number } } }).meta.pagination
      .total;
  };
  const beforeTotal = await submissionTotal();

  await page.goto('/submit');
  const bulkTab = page.getByRole('tab', { name: 'Upload spreadsheet' });
  await bulkTab.click();
  await expect(page).toHaveURL('/submit?mode=bulk');
  await expect(page.getByRole('heading', { name: 'Upload multiple creators' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/submit');
  await expect(page.getByRole('tab', { name: 'Submit one creator' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goForward();
  await expect(page).toHaveURL('/submit?mode=bulk');
  await expectNoAutomaticAccessibilityViolations(page);

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV template' }).click();
  expect((await csvDownload).suggestedFilename()).toBe('creator-submissions-template.csv');

  await page
    .locator('#bulk-file-input')
    .setInputFiles(path.join(bulkFixtureDirectory, 'valid-creators.csv'));
  await expect(page.getByRole('heading', { name: 'Spreadsheet preview' })).toBeVisible();
  await expect(page.locator('.bulk-preview-summary')).toContainText('Total rows5');
  await expect(page.locator('.bulk-preview-summary')).toContainText('Ready5');
  await expect(page.getByText('5 rows will be submitted')).toBeVisible();
  await expectNoAutomaticAccessibilityViolations(page);
  await page.getByRole('button', { name: 'Review 5 selected rows' }).click();
  await page.getByRole('checkbox', { name: /I confirm that the selected rows/iu }).check();
  await page.getByRole('button', { name: 'Submit selected rows' }).click();
  await expect(page.getByRole('heading', { name: 'Spreadsheet processed' })).toBeVisible();
  await expect(page.locator('.bulk-result-summary')).toContainText(
    'Total pending submissions created5',
  );
  expect(await submissionTotal()).toBe(beforeTotal + 5);

  await page.goto(`${adminUrl}/submissions?status=pending`);
  for (const name of [
    'Registry Batch Test One',
    'Registry Batch Test Two',
    'Registry Batch Test Three',
    'Registry Batch Test Four',
    'Registry Batch Test Five',
  ]) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByText(/Spreadsheet batch [0-9a-f]{8} · row 2/iu)).toBeVisible();

  await page.goto(`${publicUrl}/submit?mode=bulk`);
  await page
    .locator('#bulk-file-input')
    .setInputFiles(path.join(bulkFixtureDirectory, 'valid-creators.csv'));
  await expect(page.locator('.bulk-preview-summary')).toContainText('Exact duplicates5');
  await expect(page.locator('tr[data-status="exact_duplicate"]')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Review 0 selected rows' })).toBeDisabled();
  expect(await submissionTotal()).toBe(beforeTotal + 5);

  await page.getByRole('button', { name: 'Choose a different file' }).click();
  await page
    .locator('#bulk-file-input')
    .setInputFiles(path.join(bulkFixtureDirectory, 'mixed-invalid-creators.csv'));
  await expect(page.locator('tr[data-status="exact_duplicate"]')).toHaveCount(2);
  await expect(page.locator('tr[data-status="invalid"]')).toHaveCount(3);
  const previewReportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download preview report' }).click();
  expect((await previewReportDownload).suggestedFilename()).toBe('creator-submission-preview.csv');

  await page.getByRole('button', { name: 'Choose a different file' }).click();
  await page
    .locator('#bulk-file-input')
    .setInputFiles(path.join(bulkFixtureDirectory, 'formula-creators.xlsx'));
  await expect(page.getByText(/contains a formula in relevant cell A2/iu)).toBeVisible();

  for (const name of [
    'Registry Batch Test One',
    'Registry Batch Test Two',
    'Registry Batch Test Three',
    'Registry Batch Test Four',
    'Registry Batch Test Five',
  ]) {
    await page.goto(`${adminUrl}/submissions?status=pending`);
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(/Spreadsheet batch .*, row \d+/iu)).toBeVisible();
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Confirm decision' }).click();
    await expect(page.getByText(/Submission action recorded/iu)).toBeVisible();
  }

  await page.goto(`${publicUrl}/submit?mode=bulk`);
  const xlsxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Excel template' }).click();
  expect((await xlsxDownload).suggestedFilename()).toBe('creator-submissions-template.xlsx');
  await page
    .locator('#bulk-file-input')
    .setInputFiles(path.join(bulkFixtureDirectory, 'valid-creators.xlsx'));
  await expect(page.getByRole('heading', { name: 'Spreadsheet preview' })).toBeVisible();
  await expect(page.locator('.bulk-file-warnings')).toContainText(
    'Used worksheet “Creators”. 1 additional worksheet was ignored.',
  );
  await expect(page.getByText('5 rows will be submitted')).toBeVisible();
  await page.getByRole('button', { name: 'Review 5 selected rows' }).click();
  await page.getByRole('checkbox', { name: /I confirm that the selected rows/iu }).check();
  await page.getByRole('button', { name: 'Submit selected rows' }).click();
  await expect(page.locator('.bulk-result-summary')).toContainText(
    'Total pending submissions created5',
  );
  expect(await submissionTotal()).toBe(beforeTotal + 10);
});

test('completes a keyboard-first bulk submission without mobile page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/submit');
  const bulkTab = page.getByRole('tab', { name: 'Upload spreadsheet' });
  await bulkTab.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/submit?mode=bulk');
  await page.locator('#bulk-file-input').setInputFiles({
    name: 'mobile-bulk.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'creator_name,category,countries,requested_usernames,public_sources\nRegistry Mobile Bulk Test,education,NG,registry_mobile_bulk_test,https://example.test/registry-mobile-bulk-test\n',
    ),
  });
  await expect(page.getByRole('heading', { name: 'Spreadsheet preview' })).toBeVisible();
  await expect(page.locator('.bulk-preview-table tbody tr')).toHaveAttribute(
    'data-status',
    'ready',
  );
  await page.getByRole('checkbox', { name: 'Submit row 2' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Review 1 selected rows' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: /I confirm that the selected rows/iu }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Submit selected rows' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Spreadsheet processed' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('keeps the submission form and country list inside all required viewports', async ({
  page,
}) => {
  const viewports = [
    { width: 1536, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/submit');
    const countrySearch = page.getByRole('combobox', { name: /countries/i });
    await countrySearch.fill('United');
    const listbox = page.getByRole('listbox', { name: 'Countries' });
    await expect(listbox).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press('Escape');
    await expect(countrySearch).toBeFocused();

    await page.getByRole('tab', { name: 'Upload spreadsheet' }).click();
    await page.locator('#bulk-file-input').setInputFiles({
      name: `viewport-${viewport.width}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `creator_name,category,countries,requested_usernames,public_sources\nRegistry Viewport ${viewport.width},technology,NG,registry_viewport_${viewport.width},https://example.test/registry-viewport-${viewport.width}\n`,
      ),
    });
    await expect(page.getByRole('heading', { name: 'Spreadsheet preview' })).toBeVisible();
    const bulkDimensions = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(bulkDimensions.bodyWidth).toBeLessThanOrEqual(bulkDimensions.viewportWidth);
    await expect(page.getByRole('region', { name: 'Creator row preview' })).toBeVisible();
  }
});

test('shows truthful releases, exercises the API tester, and opens Scalar docs', async ({
  page,
}) => {
  await page.goto('/releases');
  await expect(
    page.getByText(/Unversioned development state|phase-5-browser-release/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Demonstration data/i).first()).toBeVisible();

  await page.goto('/api-tester');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('200', { exact: true })).toBeVisible();
  await expect(page.getByText(/"status": "ok"/)).toBeVisible();
  await expect(page.getByText(/request id/i).first()).toBeVisible();

  await page.goto('/docs');
  await expect(page).toHaveTitle(/Open Creator Registry/i);
  await expect(page.locator('body')).toContainText('Open Creator Registry');
});

test('keeps mobile navigation and creator filters usable at 390 and 320 pixels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();

  await page.goto('/creators');
  await page.getByRole('combobox', { name: 'Country' }).selectOption('GH');
  await expect(page.getByText('Demo Kofi Laughs')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
});

test('keeps the administration Worker separate, authenticated, and private', async ({
  page,
  request,
}) => {
  await page.goto('http://localhost:5174');
  await expect(page.getByRole('heading', { name: 'Registry administration' })).toBeVisible();
  await expect(page.getByText(/private application · no public navigation/i).first()).toBeVisible();

  const response = await request.get('http://localhost:5174/api/admin/v1/dashboard');
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    data: { demonstration_data: true },
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const creatorId = '10000000-0000-4000-8000-000000000001';
const adminUrl = 'http://localhost:5174';
const publicUrl = 'http://localhost:5173';

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

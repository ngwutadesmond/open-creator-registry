import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const creatorId = '10000000-0000-4000-8000-000000000001';

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
  await expect(page.getByText('10 public records')).toBeVisible();
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

test('validates, recovers, and submits a public proposal without changing Registry counts', async ({
  page,
  request,
}) => {
  const before = await request.get('/api/v1/registry/meta');
  const beforeBody = (await before.json()) as {
    data: { record_counts: { approved_creators: number; active_reserved_handles: number } };
  };

  await page.goto('/submit');
  await page
    .getByRole('textbox', { name: /creator public name/i })
    .fill('Phase Four Demo Proposal');
  await page.getByRole('textbox', { name: 'Handle 1' }).fill('bad/handle');
  await page.getByRole('textbox', { name: 'Source URL 1' }).fill('not-a-url');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Review the submission' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /creator public name/i })).toHaveValue(
    'Phase Four Demo Proposal',
  );

  await page.getByRole('textbox', { name: 'Handle 1' }).fill('phase_four_demo_proposal');
  await page
    .getByRole('textbox', { name: 'Source URL 1' })
    .fill('https://example.com/phase-four-demo');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(
    page.getByRole('heading', { name: 'Thank you for contributing public evidence.' }),
  ).toBeVisible();
  await expect(page.getByText('Pending review')).toBeVisible();
  await expect(
    page.getByText(/has not created an approved creator or reserved any username/i),
  ).toBeVisible();

  const after = await request.get('/api/v1/registry/meta');
  const afterBody = (await after.json()) as typeof beforeBody;
  expect(afterBody.data.record_counts).toEqual(beforeBody.data.record_counts);
});

test('shows truthful releases, exercises the API tester, and opens Scalar docs', async ({
  page,
}) => {
  await page.goto('/releases');
  await expect(page.getByText('Unversioned development state')).toBeVisible();
  await expect(page.getByText('No Registry release has been published yet.')).toBeVisible();
  await expect(page.getByText('No published releases')).toBeVisible();

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

test('keeps the administration Worker separate and truthful', async ({ page, request }) => {
  await page.goto('http://localhost:5174');
  await expect(page.getByRole('heading', { name: 'Registry administration' })).toBeVisible();
  await expect(page.getByText(/connected in Phase 5/i)).toBeVisible();
  await expect(page.getByText(/private application · no public navigation/i).first()).toBeVisible();

  const response = await request.get('http://localhost:5174/api/admin/dashboard');
  expect(response.status()).toBe(501);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'not_implemented' },
  });
});

import { tmpdir } from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`reconciles a historical demonstration approval at ${width}px`, async ({ page }) => {
    const id = '90000000-0000-4000-8000-000000000002';
    const meta = { request_id: crypto.randomUUID(), timestamp: '2026-07-21T18:00:00.000Z' };
    const revision = '2026-07-20T18:00:00.000Z';
    const errors: string[] = [];
    let expired = false;
    let mutations = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route(`**/api/admin/v1/approval-requests/${id}{,/**}`, async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().url()).toMatch(/\/expire$/);
        expect(route.request().postDataJSON()).toEqual({
          reason: 'Recorded the elapsed approval deadline without applying the proposed change.',
          expected_revision: revision,
        });
        mutations++;
        expired = true;
        await route.fulfill({ json: { data: {}, meta } });
        return;
      }
      await route.fulfill({
        json: {
          data: {
            approval: {
              id,
              action_type: 'handle.create_critical',
              entity_type: 'creator_entity',
              entity_id: null,
              requested_by: 'demonstration@example.test',
              requested_payload: { displayHandle: 'demonstration_expiry' },
              reason: 'Historical demonstration request used only for expiry verification.',
              status: expired ? 'expired' : 'pending',
              required_approvals: 1,
              approval_count: 0,
              target_revision: null,
              expires_at: meta.timestamp,
              created_at: revision,
              updated_at: expired ? meta.timestamp : revision,
              resolved_at: expired ? meta.timestamp : null,
              applied_at: null,
            },
            decisions: [],
          },
          meta,
        },
      });
    });
    await page.goto(`http://localhost:5174/approvals/${id}`);
    await expect(page).toHaveTitle(/Administration/);
    await expect(page.getByRole('heading', { name: 'handle.create_critical' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve independently' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reject request' })).toBeDisabled();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const before = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag21a']).analyze();
    expect(before.violations).toEqual([]);
    await page.screenshot({
      path: path.join(tmpdir(), `ocr-expiry-${width}-before.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Mark expired' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'does not approve, apply, or reissue',
    );
    expect(mutations).toBe(0);
    await page.getByRole('button', { name: 'Confirm expiry' }).click();
    await expect(page.getByText('expired', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark expired' })).toHaveCount(0);
    expect(mutations).toBe(1);
    await page.reload();
    await expect(page.getByText('expired', { exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(tmpdir(), `ocr-expiry-${width}-after.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

import { tmpdir } from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const adminUrl = 'http://localhost:5174';

for (const width of [1440, 390]) {
  test(`finds proposed critical changes from their creator at ${width}px`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const created = await request.post(`${adminUrl}/api/admin/v1/creators`, {
      data: {
        canonical_name: `Demonstration Approval Association ${width}`,
        entity_type: 'person',
        primary_category: 'technology',
        country_codes: ['US'],
        biography_summary: 'Fictional creator used only for local approval association tests.',
        notoriety_score: 95,
        protection_tier: 'critical',
        review_status: 'approved',
      },
    });
    expect(created.status()).toBe(201);
    const { data: creator } = (await created.json()) as { data: { id: string } };
    const handle = await request.post(`${adminUrl}/api/admin/v1/reserved-handles`, {
      data: {
        creator_entity_id: creator.id,
        display_handle: `demo_approval_${width}`,
        classification: 'hard_reserved',
        confidence_score: 95,
        status: 'active',
        decision_source: 'local_demonstration',
        reason: 'Fictional approval association test.',
      },
    });
    const profile = await request.post(`${adminUrl}/api/admin/v1/creators/${creator.id}/profiles`, {
      data: {
        platform: 'youtube',
        platform_account_id: `demo-approval-${width}`,
        profile_url: `https://www.youtube.com/channel/demo-approval-${width}`,
        verification_status: 'cross_source_confirmed',
        visibility_status: 'public',
        source_name: 'Fictional demonstration',
        confidence_score: 95,
        change_reason: 'Fictional approval association test.',
      },
    });
    expect(handle.status()).toBe(202);
    expect(profile.status()).toBe(202);
    const handleBody = (await handle.json()) as { data: { approval_request: { id: string } } };
    const profileBody = (await profile.json()) as { data: { id: string } };

    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${adminUrl}/creators/${creator.id}`);
    await expect(page).toHaveTitle(/Administration/);
    await expect(
      page.getByRole('heading', { name: `Demonstration Approval Association ${width}` }),
    ).toBeVisible();
    const handleLink = page.getByRole('link', { name: 'handle.create_critical', exact: true });
    const profileLink = page.getByRole('link', {
      name: 'external_profile.create_critical',
      exact: true,
    });
    await expect(handleLink).toHaveAttribute(
      'href',
      `/approvals/${handleBody.data.approval_request.id}`,
    );
    await expect(profileLink).toHaveAttribute('href', `/approvals/${profileBody.data.id}`);
    await expect(
      page.getByText('No approval requests are associated with this creator.'),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No protected handles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No platform profiles' })).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag21a']).analyze()).violations,
    ).toEqual([]);
    await handleLink.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(tmpdir(), `ocr-creator-approvals-${width}.png`),
      fullPage: true,
    });
    await handleLink.click();
    await expect(page).toHaveURL(`${adminUrl}/approvals/${handleBody.data.approval_request.id}`);
    await expect(page.getByRole('heading', { name: 'handle.create_critical' })).toBeVisible();
    await expect(page.getByText('pending', { exact: true })).toBeVisible();
    await page.goBack();
    await profileLink.click();
    await expect(page).toHaveURL(`${adminUrl}/approvals/${profileBody.data.id}`);
    await expect(
      page.getByRole('heading', { name: 'external_profile.create_critical' }),
    ).toBeVisible();
    await page.goBack();
    await page.reload();
    await expect(handleLink).toBeVisible();
    await expect(profileLink).toBeVisible();
    expect(errors).toEqual([]);
  });
}

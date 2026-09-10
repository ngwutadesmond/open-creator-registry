import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`selects the current country query during immediate keyboard input at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/submit');
    const search = page.getByRole('combobox', { name: /countries/i });
    await search.focus();
    await page.keyboard.type('Nigeria');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Nigeria (NG)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Niger (NE)' })).toHaveCount(0);

    await search.focus();
    await page.keyboard.type('Ghana');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Ghana (GH)' })).toBeVisible();
    await expect(search).toHaveValue('');
    await expect(page.locator('.submission-review-summary')).toContainText(
      'Nigeria (NG), Ghana (GH)',
    );
  });

  test(`keeps submit under the pointer while leaving an invalid source at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/submit');
    await page.getByRole('textbox', { name: /creator public name/i }).fill('Demonstration Only');
    const source = page.getByRole('textbox', { name: 'Supporting source 1' });
    await source.fill('not-a-url');
    const submit = page.getByRole('button', { name: 'Submit for review' });
    await submit.scrollIntoViewIfNeeded();
    const bounds = await submit.boundingBox();
    if (!bounds) throw new Error('Expected a visible submit button.');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await expect(submit).toBeFocused();
    await expect(source).not.toHaveAttribute('aria-invalid', 'true');
    await page.mouse.up();
    await expect(page.getByRole('heading', { name: 'Review the submission' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(source).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('combobox', { name: 'Category' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
}

/**
 * Visual regression tests (Playwright snapshots) for the approved prototype.
 * Screenshots are stored in tests/e2e/visual-regression.spec.ts-snapshots/.
 * Run `npm run test:e2e:update` to generate baseline snapshots.
 */
import { test, expect } from '@playwright/test';

const PROTOTYPE_URL = 'http://localhost:3199/prototipo-clm-mvp.html';

test.describe('Visual Regression — Prototype Screens', () => {
  /* ----- Screen 02: Inventário ----- */
  test('Screen 02 — Inventário centralizado', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#inventario').scrollIntoViewIfNeeded();

    // Wait for fonts to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const section = page.locator('#inventario');
    await expect(section).toHaveScreenshot('02-inventario.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  /* ----- Screen 03: Detalhe do certificado ----- */
  test('Screen 03 — Detalhe do certificado', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#detalhe').scrollIntoViewIfNeeded();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const section = page.locator('#detalhe');
    await expect(section).toHaveScreenshot('03-detalhe.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  /* ----- Full page snapshot ----- */
  test('Full prototype page', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('full-prototype.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  /* ----- Component-level: Status badges ----- */
  test('Status badges rendering', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#inventario').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');

    // Capture just the table for badge rendering check
    const table = page.locator('#inventario .table');
    await expect(table).toHaveScreenshot('inventory-table.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  /* ----- Component-level: Detail metadata grid ----- */
  test('Detail metadata grid rendering', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#detalhe').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');

    const metadataGrid = page.locator('#detalhe .info-grid').first();
    await expect(metadataGrid).toHaveScreenshot('detail-metadata-grid.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  /* ----- Component-level: Tags panel ----- */
  test('Tags panel rendering', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#detalhe').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');

    const tagsPanel = page.locator('#detalhe .panel', {
      hasText: 'Tags e campos customizados',
    });
    await expect(tagsPanel).toHaveScreenshot('detail-tags-panel.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  /* ----- Component-level: Actions panel ----- */
  test('Actions panel rendering', async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#detalhe').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');

    const actionsPanel = page.locator('#detalhe .panel').filter({ has: page.locator('button.btn-danger') });
    await expect(actionsPanel).toHaveScreenshot('detail-actions-panel.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

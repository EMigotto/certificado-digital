/**
 * E2E Tests for the Frontend SPA (Issue #18).
 *
 * Tests all major pages: Dashboard, Inventory, Detail, Import, Audit Log.
 * Uses the built frontend served by a static file server.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3200';

test.describe('Frontend SPA — Dashboard', () => {
  test('loads dashboard with KPI cards and heatmap', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`);

    // Wait for dashboard to render
    await expect(page.locator('.sec-title')).toContainText('Dashboard');

    // KPI cards should be visible
    await expect(page.locator('.kpi-grid')).toBeVisible();
    await expect(page.locator('.kpi')).toHaveCount(4);

    // KPI labels
    await expect(page.locator('.kpi-label').first()).toContainText('Total gerenciados');

    // Heatmap
    await expect(page.locator('.heatmap')).toBeVisible();
    await expect(page.locator('.heat-cell')).toHaveCount(90);

    // Alerts panel
    await expect(page.locator('.alert-list')).toBeVisible();
  });

  test('heatmap shows tooltip on hover', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`);
    await expect(page.locator('.heatmap')).toBeVisible();

    // Hover over first heatmap cell
    const cell = page.locator('.heat-cell').first();
    await cell.hover();

    // Tooltip should appear
    await expect(page.locator('.heat-tooltip')).toBeVisible();
  });

  test('shows correct section header tags', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`);
    await expect(page.locator('.cap')).toContainText('C3');
  });
});

test.describe('Frontend SPA — Inventory', () => {
  test('loads inventory with table and search bar', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates`);

    // Wait for inventory to render
    await expect(page.locator('.sec-title')).toContainText('Inventário');

    // Search bar should be visible
    await expect(page.locator('#search-input')).toBeVisible();

    // Table should be visible
    await expect(page.locator('.table-wrap')).toBeVisible();
  });

  test('search bar accepts input', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates`);
    await expect(page.locator('#search-input')).toBeVisible();

    await page.fill('#search-input', 'api-payments');
    await expect(page.locator('#search-input')).toHaveValue('api-payments');
  });

  test('pagination controls are visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates`);
    await expect(page.locator('.pagination')).toBeVisible();
  });

  test('export buttons are visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates`);
    await expect(page.locator('#export-csv-btn')).toBeVisible();
    await expect(page.locator('#export-json-btn')).toBeVisible();
  });

  test('clicking cert row navigates to detail', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates`);
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.locator('tbody tr').first().click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/#\/certificates\//);
  });
});

test.describe('Frontend SPA — Detail Page', () => {
  test('shows certificate metadata', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates/cert-1`);

    // Breadcrumb
    await expect(page.locator('.breadcrumb')).toBeVisible();

    // Detail title
    await expect(page.locator('.detail-title')).toBeVisible();

    // Metadata grid
    await expect(page.locator('.info-grid')).toBeVisible();

    // PEM block
    await expect(page.locator('#pem-block')).toBeVisible();
  });

  test('shows action buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates/cert-1`);

    await expect(page.locator('#download-btn')).toBeVisible();
    await expect(page.locator('#edit-tags-btn')).toBeVisible();
    await expect(page.locator('#delete-btn')).toBeVisible();
  });

  test('delete button shows confirmation modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates/cert-1`);

    await page.click('#delete-btn');
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('Excluir certificado');

    // Cancel
    await page.click('#modal-cancel');
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('shows audit log section', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/certificates/cert-1`);

    // Audit log section
    await expect(page.getByText('Audit Log')).toBeVisible();
  });
});

test.describe('Frontend SPA — Import Page', () => {
  test('loads import page with tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/import`);

    await expect(page.locator('.sec-title')).toContainText('Importar');

    // Tabs
    await expect(page.locator('#tab-single')).toBeVisible();
    await expect(page.locator('#tab-bulk')).toBeVisible();
  });

  test('single tab shows upload zone and form', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/import`);

    // Upload zone
    await expect(page.locator('#upload-zone-single')).toBeVisible();

    // Form fields
    await expect(page.locator('#import-owner')).toBeVisible();
    await expect(page.locator('#import-environment')).toBeVisible();
  });

  test('bulk tab shows CSV upload zone', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/import`);

    await page.click('#tab-bulk');
    await expect(page.locator('#upload-zone-csv')).toBeVisible();
  });

  test('validates required fields on submit', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/import`);

    await page.click('#import-submit-btn');

    // Should show errors
    await expect(page.locator('#import-errors')).toContainText('Owner é obrigatório');
  });
});

test.describe('Frontend SPA — Audit Log Page', () => {
  test('loads audit log with entries', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/audit`);

    await expect(page.locator('.sec-title')).toContainText('Audit');

    // Audit rows
    await expect(page.locator('.audit-row')).not.toHaveCount(0);
  });

  test('sort toggle changes order', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/audit`);

    const sortBtn = page.locator('#sort-toggle');
    await expect(sortBtn).toContainText('Mais recentes');

    await sortBtn.click();
    await expect(sortBtn).toContainText('Mais antigos');
  });
});

test.describe('Frontend SPA — Navigation', () => {
  test('sidebar navigation highlights active page', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`);
    await expect(page.locator('[data-route="dashboard"]')).toHaveClass(/active/);

    await page.goto(`${BASE_URL}/#/certificates`);
    await expect(page.locator('[data-route="certificates"]')).toHaveClass(/active/);

    await page.goto(`${BASE_URL}/#/audit`);
    await expect(page.locator('[data-route="audit"]')).toHaveClass(/active/);
  });

  test('brand mark and user card visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dashboard`);

    await expect(page.locator('.brand-mark')).toContainText('cipher');
    await expect(page.locator('.user-name')).toContainText('Rafael Costa');
  });

  test('defaults to dashboard when no hash', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveURL(/\/#\/dashboard/);
  });
});

/**
 * E2E tests for the Inventory List screen (Screen "02 Inventário").
 * Tests against the approved HTML prototype.
 * Covers AC Scenarios: 1.1, 1.2, 1.5, 1.6, 1.11, 1.12, 1.13, 8.2, 8.3
 */
import { test, expect } from '@playwright/test';

const PROTOTYPE_URL = 'http://localhost:3199/prototipo-clm-mvp.html';

test.describe('02 Inventário — Certificate Inventory List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    // Scroll to inventory section
    await page.locator('#inventario').scrollIntoViewIfNeeded();
  });

  /* ----- AC 1.1: Table with pagination ----- */
  test('AC 1.1: table displays certificate rows with pagination footer', async ({ page }) => {
    const section = page.locator('#inventario');
    // Table exists
    const table = section.locator('table');
    await expect(table).toBeVisible();

    // Table headers present (AC 1.1 columns)
    const headers = table.locator('thead th');
    const headerTexts = await headers.allTextContents();
    const headerStr = headerTexts.join(' ').toLowerCase();
    expect(headerStr).toContain('common name');
    expect(headerStr).toContain('zona');
    expect(headerStr).toContain('status');
    expect(headerStr).toContain('owner');
    expect(headerStr).toContain('expira');

    // Rows exist
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBe(5); // prototype has 5 example rows

    // Pagination footer: "Mostrando X de 2.847"
    const footer = section.locator('text=Mostrando');
    await expect(footer).toBeVisible();
    const footerText = await footer.textContent();
    expect(footerText).toContain('2.847');

    // "Próxima página" link
    const nextLink = section.locator('text=Próxima página');
    await expect(nextLink).toBeVisible();
  });

  /* ----- AC 1.2: Search box present ----- */
  test('AC 1.2: search box with placeholder for CN/SAN/serial/owner', async ({ page }) => {
    const searchInput = page.locator('#inventario input[placeholder*="busca"]');
    await expect(searchInput).toBeVisible();
    const placeholder = await searchInput.getAttribute('placeholder');
    expect(placeholder).toContain('CN');
    expect(placeholder).toContain('SAN');
    expect(placeholder).toContain('serial');
    expect(placeholder).toContain('owner');
  });

  /* ----- AC 1.5 / 1.6: Active filter badges ----- */
  test('AC 1.5/1.6: filter badges displayed in toolbar', async ({ page }) => {
    const toolbar = page.locator('#inventario .toolbar');

    // "expira: < 30d ×" badge (AC 1.5)
    const expirationFilter = toolbar.locator('.filter.active');
    await expect(expirationFilter).toBeVisible();
    const filterText = await expirationFilter.textContent();
    expect(filterText).toContain('expira');
    expect(filterText).toContain('30d');

    // "env: prd" badge (AC 1.6)
    const envFilter = toolbar.locator('.filter', { hasText: 'env: prd' });
    await expect(envFilter).toBeVisible();

    // "+ filtro" button (AC 1.9)
    const addFilter = toolbar.locator('.filter', { hasText: '+ filtro' });
    await expect(addFilter).toBeVisible();
  });

  /* ----- AC 1.11: Status badges in table ----- */
  test('AC 1.11: status badges show Crítico and Atenção with colored dots', async ({ page }) => {
    const table = page.locator('#inventario table');

    // Crítico badge exists
    const critBadge = table.locator('.badge.b-crit');
    expect(await critBadge.count()).toBeGreaterThanOrEqual(1);
    // Has animated dot
    const critDot = critBadge.first().locator('.badge-dot');
    await expect(critDot).toBeVisible();

    // Atenção badge exists
    const warnBadge = table.locator('.badge.b-warn');
    expect(await warnBadge.count()).toBeGreaterThanOrEqual(1);
  });

  /* ----- AC 1.12: Days-to-expiration color coding ----- */
  test('AC 1.12: days-left column uses color classes for urgency', async ({ page }) => {
    const table = page.locator('#inventario table');

    // Critical (red) days
    const critDays = table.locator('.days-left.crit');
    expect(await critDays.count()).toBeGreaterThanOrEqual(1);
    const critText = await critDays.first().textContent();
    expect(critText).toMatch(/\d+\s*dias/);

    // Warning (yellow) days
    const warnDays = table.locator('.days-left.warn');
    expect(await warnDays.count()).toBeGreaterThanOrEqual(1);
  });

  /* ----- AC 1.13: Row click → navigate to detail ----- */
  test('AC 1.13: rows have action arrow indicating navigation to detail', async ({ page }) => {
    const table = page.locator('#inventario table');
    const rows = table.locator('tbody tr');
    const firstRow = rows.first();

    // Check → indicator
    const arrow = firstRow.locator('td:last-child');
    const arrowText = await arrow.textContent();
    expect(arrowText?.trim()).toBe('→');
  });

  /* ----- AC 8.2: Filter bar is visible in toolbar ----- */
  test('AC 8.2: filter bar visible at top of table', async ({ page }) => {
    const toolbar = page.locator('#inventario .toolbar');
    await expect(toolbar).toBeVisible();
  });

  /* ----- CN/SANs display format ----- */
  test('table row shows CN with SANs count (prototype data)', async ({ page }) => {
    const firstRow = page.locator('#inventario table tbody tr').first();
    const cnCell = firstRow.locator('.cn-cell');
    await expect(cnCell).toBeVisible();

    // CN in monospace
    const cnText = await cnCell.textContent();
    expect(cnText).toContain('api-payments.bank.internal');

    // SANs display
    const sanSpan = cnCell.locator('.san');
    const sanText = await sanSpan.textContent();
    expect(sanText).toContain('2 SANs');
    expect(sanText).toContain('payments-v2');
    expect(sanText).toContain('payments-canary');
  });

  /* ----- "Emitir certificado" button ----- */
  test('Emitir certificado button visible (AC 3.1 entry point)', async ({ page }) => {
    const btn = page.locator('#inventario .btn-primary', { hasText: 'Emitir certificado' });
    await expect(btn).toBeVisible();
  });
});

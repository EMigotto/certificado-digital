/**
 * E2E tests for the Certificate Detail screen (Screen "03 Detalhe do certificado").
 * Tests against the approved HTML prototype.
 * Covers AC Scenarios: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 8.3
 */
import { test, expect } from '@playwright/test';

const PROTOTYPE_URL = 'http://localhost:3199/prototipo-clm-mvp.html';

test.describe('03 Detalhe — Certificate Detail View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROTOTYPE_URL);
    await page.locator('#detalhe').scrollIntoViewIfNeeded();
  });

  /* ----- AC 2.1: All metadata displayed ----- */
  test('AC 2.1: displays all certificate metadata fields', async ({ page }) => {
    const section = page.locator('#detalhe');

    // Status badge
    const statusBadge = section.locator('.detail-title .badge');
    await expect(statusBadge).toBeVisible();
    const badgeText = await statusBadge.textContent();
    expect(badgeText).toContain('Crítico');

    // Common Name as title
    const title = section.locator('.detail-title');
    const titleText = await title.textContent();
    expect(titleText).toContain('api-payments.bank.internal');

    // Serial number (appears in header area)
    const serial = section.locator('.detail-head >> text=0x00d4e82f1a23b5c7').first();
    await expect(serial).toBeVisible();

    // Metadata panel items
    const infoGrid = section.locator('.info-grid').first();

    // CN
    const cnItem = infoGrid.locator('.info-item', { hasText: 'Common Name' });
    await expect(cnItem).toBeVisible();
    const cnValue = cnItem.locator('.info-value');
    await expect(cnValue).toContainText('api-payments.bank.internal');

    // Serial
    const serialItem = infoGrid.locator('.info-item', { hasText: 'Serial' });
    await expect(serialItem).toBeVisible();

    // Subject Alt Names
    const sanItem = infoGrid.locator('.info-item', { hasText: 'Subject Alt Names' });
    await expect(sanItem).toBeVisible();
    const sanValue = sanItem.locator('.info-value');
    const sanText = await sanValue.textContent();
    expect(sanText).toContain('payments-v2');
    expect(sanText).toContain('payments-canary');
    expect(sanText).toContain('api-payments-dr');

    // Issuer
    const issuerItem = infoGrid.locator('.info-item', { hasText: 'Issuer' });
    const issuerText = await issuerItem.locator('.info-value').textContent();
    expect(issuerText).toContain('Vault PKI');

    // notBefore
    const nbItem = infoGrid.locator('.info-item', { hasText: 'notBefore' });
    await expect(nbItem).toBeVisible();
    await expect(nbItem.locator('.info-value')).toContainText('2024-05-21');

    // notAfter
    const naItem = infoGrid.locator('.info-item', { hasText: 'notAfter' });
    await expect(naItem).toBeVisible();
    await expect(naItem.locator('.info-value')).toContainText('2025-05-21');

    // Algorithm
    const algoItem = infoGrid.locator('.info-item', { hasText: 'Algoritmo' });
    await expect(algoItem.locator('.info-value')).toContainText('RSA 2048');

    // Fingerprint SHA256
    const fpItem = infoGrid.locator('.info-item', { hasText: 'Fingerprint SHA256' });
    await expect(fpItem.locator('.info-value')).toContainText('a1b2c3d4e5f6g7h8');
  });

  /* ----- AC 2.2: Expiration countdown prominent display ----- */
  test('AC 2.2: expiration date and countdown displayed prominently', async ({ page }) => {
    const header = page.locator('#detalhe .detail-head');

    // notAfter timestamp
    const timestamp = header.locator('text=2025-05-21 14:32:08 UTC');
    await expect(timestamp).toBeVisible();

    // "⚠ 2 dias" countdown
    const countdown = header.locator('text=2 dias');
    await expect(countdown).toBeVisible();
  });

  /* ----- AC 2.3: Tags displayed with add button ----- */
  test('AC 2.3: tags panel shows applied tags and add button', async ({ page }) => {
    const section = page.locator('#detalhe');
    const tagsPanel = section.locator('.panel', { hasText: 'Tags e campos customizados' });
    await expect(tagsPanel).toBeVisible();

    // Applied tags
    const tags = tagsPanel.locator('.badge');
    const tagTexts = await tags.allTextContents();
    const joined = tagTexts.join(' ');
    expect(joined).toContain('criticidade:alta');
    expect(joined).toContain('env:prd');
    expect(joined).toContain('time:pagamentos');
    expect(joined).toContain('sla:99.99');

    // "+ Adicionar tag" button
    const addBtn = tagsPanel.locator('button', { hasText: 'Adicionar tag' });
    await expect(addBtn).toBeVisible();
  });

  /* ----- AC 2.4: Operational information ----- */
  test('AC 2.4: operational info panel shows all fields', async ({ page }) => {
    const section = page.locator('#detalhe');
    const opsPanel = section.locator('.panel', { hasText: 'Informações operacionais' });
    await expect(opsPanel).toBeVisible();

    // Owner
    const ownerItem = opsPanel.locator('.info-item', { hasText: 'Owner' });
    await expect(ownerItem.locator('.info-value')).toContainText('time-pagamentos');

    // Application
    const appItem = opsPanel.locator('.info-item', { hasText: 'Aplicação' });
    await expect(appItem.locator('.info-value')).toContainText('API Payments v2');

    // Environment
    const envItem = opsPanel.locator('.info-item', { hasText: 'Ambiente' });
    await expect(envItem.locator('.info-value')).toContainText('PRD');

    // CA / Zone
    const caItem = opsPanel.locator('.info-item', { hasText: 'CA / Zona' });
    await expect(caItem.locator('.info-value')).toContainText('Vault PKI');
    await expect(caItem.locator('.info-value')).toContainText('bank-prd');

    // Status badge
    const statusItem = opsPanel.locator('.info-item', { hasText: 'Status' });
    const statusBadge = statusItem.locator('.badge');
    await expect(statusBadge).toBeVisible();
  });

  /* ----- AC 2.5: Breadcrumb navigation ----- */
  test('AC 2.5: breadcrumb shows "Certificados / api-payments.bank.internal"', async ({
    page,
  }) => {
    const breadcrumb = page.locator('#detalhe .breadcrumb');
    await expect(breadcrumb).toBeVisible();

    const text = await breadcrumb.textContent();
    expect(text).toContain('Certificados');
    expect(text).toContain('api-payments.bank.internal');
  });

  /* ----- AC 2.6 / 2.7 / 2.8: Action buttons ----- */
  test('AC 2.6: "Baixar certificado" button visible', async ({ page }) => {
    const actionsPanel = page.locator('#detalhe .panel', { hasText: 'Ações' });
    const downloadBtn = actionsPanel.locator('button', { hasText: 'Baixar certificado' });
    await expect(downloadBtn).toBeVisible();
  });

  test('AC 2.7: "Renovar certificado" button visible', async ({ page }) => {
    const actionsPanel = page.locator('#detalhe .panel', { hasText: 'Ações' });
    const renewBtn = actionsPanel.locator('button', { hasText: 'Renovar certificado' });
    await expect(renewBtn).toBeVisible();
  });

  test('AC 2.8: "Revogar certificado" button with danger styling', async ({ page }) => {
    const actionsPanel = page.locator('#detalhe .panel', { hasText: 'Ações' });
    const revokeBtn = actionsPanel.locator('button.btn-danger', {
      hasText: 'Revogar certificado',
    });
    await expect(revokeBtn).toBeVisible();
  });

  /* ----- AC 8.3: Monospace font for technical fields ----- */
  test('AC 8.3: technical fields use monospace font', async ({ page }) => {
    const section = page.locator('#detalhe');
    const infoGrid = section.locator('.info-grid').first();

    // CN value should have class info-value (which has monospace)
    const cnValue = infoGrid.locator('.info-item', { hasText: 'Common Name' }).locator('.info-value');
    const fontFamily = await cnValue.evaluate(
      (el) => window.getComputedStyle(el).fontFamily,
    );
    expect(fontFamily.toLowerCase()).toContain('mono');

    // SANs value should use sans class
    const sanValue = infoGrid.locator('.info-item', { hasText: 'Subject Alt Names' }).locator('.info-value');
    const hasSansClass = await sanValue.evaluate((el) => el.classList.contains('sans'));
    expect(hasSansClass).toBe(true);
  });
});

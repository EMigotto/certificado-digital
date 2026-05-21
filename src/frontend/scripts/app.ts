/**
 * App entry point — initializes the SPA router and mounts pages.
 */

import { createRouter } from './router.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderInventory } from './pages/inventory.js';
import { renderDetail } from './pages/detail.js';
import { renderImport } from './pages/import.js';
import { renderAuditLog } from './pages/audit-log.js';

function getContainer(): HTMLElement {
  return document.getElementById('main-content')!;
}

const router = createRouter();

// Register routes matching ADR §2.4
router.register('/dashboard', '/dashboard', async () => {
  await renderDashboard(getContainer());
});

router.register('/certificates', '/certificates', async (params) => {
  await renderInventory(getContainer(), params);
});

router.register('/certificates/:id', '/certificates/:id', async (params) => {
  await renderDetail(getContainer(), params);
});

router.register('/import', '/import', async () => {
  await renderImport(getContainer());
});

router.register('/audit', '/audit', async () => {
  await renderAuditLog(getContainer());
});

// Start router when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => router.start());
} else {
  router.start();
}

// Helper: every test gets a fresh user so the suite is idempotent against the dev DB.
const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  // CRA's webpack-dev-server occasionally injects an empty overlay <iframe>
  // that captures pointer events even when no error is shown. Hide every
  // iframe across the whole suite so it can never intercept clicks.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const css = 'iframe{display:none!important;pointer-events:none!important;}';
      const apply = () => {
        if (!document.head) return;
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    });
    await use(page);
  },

  user: async ({}, use) => {
    const username = `e2e_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const password = 'test1234';
    await use({ username, password });
  },
});

module.exports = { test, expect };

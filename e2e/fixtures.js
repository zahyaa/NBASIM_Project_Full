// Helper: every test gets a fresh user so the suite is idempotent against the dev DB.
const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  user: async ({}, use) => {
    const username = `e2e_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const password = 'test1234';
    await use({ username, password });
  },
});

module.exports = { test, expect };

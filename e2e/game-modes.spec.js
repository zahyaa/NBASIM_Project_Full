const { test, expect } = require('./fixtures');

test('1v1 mode: navigate, search, simulate', async ({ page, user }) => {
  // Pre-create user via API to skip the register UI
  await page.request.post('http://localhost:5001/api/auth/register', {
    data: { username: user.username, password: user.password },
  });

  // Login through UI
  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/menu/);

  // Open 1v1 mode
  await page.getByRole('button', { name: /One on One/i }).click();
  await expect(page).toHaveURL(/\/1v1/);

  // The page should render its main heading
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
});

test('blacktop mode loads', async ({ page, user }) => {
  await page.request.post('http://localhost:5001/api/auth/register', {
    data: { username: user.username, password: user.password },
  });

  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/menu/);

  await page.getByRole('button', { name: /Blacktop/i }).click();
  await expect(page).toHaveURL(/\/blacktop/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
});

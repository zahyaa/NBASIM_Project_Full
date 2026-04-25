const { test, expect } = require('./fixtures');

test('register, land on menu, logout', async ({ page, user }) => {
  await page.goto('/login');

  // Switch to Register
  await page.getByRole('button', { name: /Register/i }).click();
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Register', exact: true }).click();

  // Lands on main menu
  await expect(page).toHaveURL(/\/menu/);
  await expect(page.getByText(`Welcome, ${user.username}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'NBA SIM' })).toBeVisible();

  // Logout returns to login screen
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('login flow rejects bad password', async ({ page, user }) => {
  // First register so the user exists
  await page.request.post('http://localhost:5001/api/auth/register', {
    data: { username: user.username, password: user.password },
  });

  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
});

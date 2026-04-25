const { test, expect } = require('./fixtures');

test('1v1 simulation: search two players and run a full game', async ({ page, user }) => {
  // Pre-create the user via API to skip the registration UI
  await page.request.post('http://localhost:5001/api/auth/register', {
    data: { username: user.username, password: user.password },
  });

  // Login
  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/menu/);

  // Open 1v1 mode
  await page.getByRole('button', { name: /One on One/i }).click();
  await expect(page).toHaveURL(/\/1v1/);

  // Pick Player A — search input under "Your Player"
  await page.getByPlaceholder('Search player...').first().fill('LeBron');
  await page.waitForResponse(
    (r) => r.url().includes('/api/nba/players/search') && r.status() === 200,
    { timeout: 15_000 }
  );
  await page.locator('button').filter({ hasText: /LeBron James/ }).first().click();
  await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(1);

  // Pick Player B — only the CPU search input remains
  await page.getByPlaceholder('Search player...').fill('Curry');
  await page.waitForResponse(
    (r) => r.url().includes('/api/nba/players/search') && r.status() === 200,
    { timeout: 15_000 }
  );
  await page.locator('button').filter({ hasText: /Curry/ }).first().click();
  await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(2);

  // Start the game
  await page.getByRole('button', { name: 'Start Game' }).click();

  // Result screen
  await expect(page.getByRole('heading', { name: '1v1 Final' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/wins!$/)).toBeVisible();

  // Rematch
  await page.getByRole('button', { name: 'Rematch' }).click();
  await expect(page.getByRole('heading', { name: '1v1 Final' })).toBeVisible({ timeout: 30_000 });
});

const { test, expect } = require('./fixtures');

test('1v1 simulate: type full name, CPU auto-picks, simulate game', async ({ page, user }) => {
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

  // Type full name and Search
  await page.getByPlaceholder(/Type full name/i).fill('LeBron James');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForResponse(
    (r) => r.url().includes('/api/nba/players/search') && r.status() === 200,
    { timeout: 15_000 }
  );

  // Pick LeBron from results
  await page.getByRole('button', { name: /^LeBron James/ }).first().click();

  // CPU auto-picks: wait for the "Re-roll" button to appear in CPU panel
  await expect(page.getByRole('button', { name: 'Re-roll' })).toBeVisible({ timeout: 15_000 });

  // Simulate Game (instant)
  const simulateBtn = page.getByRole('button', { name: 'Simulate Game' });
  await expect(simulateBtn).toBeEnabled();
  await simulateBtn.click();

  // Result screen
  await expect(page.getByRole('heading', { name: '1v1 Final' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/wins!$/)).toBeVisible();

  // Rematch button is present
  await expect(page.getByRole('button', { name: 'Rematch', exact: true })).toBeVisible();
});

test('1v1 watch: play-by-play reveals progressively', async ({ page, user }) => {
  await page.request.post('http://localhost:5001/api/auth/register', {
    data: { username: user.username, password: user.password },
  });

  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByRole('button', { name: /One on One/i }).click();
  await expect(page).toHaveURL(/\/1v1/);

  // Pick a player
  await page.getByPlaceholder(/Type full name/i).fill('Stephen Curry');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForResponse(
    (r) => r.url().includes('/api/nba/players/search') && r.status() === 200,
    { timeout: 15_000 }
  );
  await page.getByRole('button', { name: /^Stephen Curry/ }).first().click();

  // CPU auto-picks
  await expect(page.getByRole('button', { name: 'Re-roll' })).toBeVisible({ timeout: 15_000 });

  // Watch mode → Live heading appears, then "Skip to Final" button shows
  await page.getByRole('button', { name: 'Watch Play-by-Play' }).click();
  await expect(page.getByRole('heading', { name: 'Live: 1v1' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip to Final' }).click();

  // After skip, final heading shows
  await expect(page.getByRole('heading', { name: '1v1 Final' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/wins!$/)).toBeVisible();
});

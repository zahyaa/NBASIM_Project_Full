const { test, expect } = require('./fixtures');

test('blacktop 1v1: build teams, simulate, see winner', async ({ page, user }) => {
  // Pre-create user via API to skip the registration UI
  await page.request.post('http://localhost:5001/api/auth/register', {
    data: { username: user.username, password: user.password },
  });

  // Login
  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(user.username);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/menu/);

  // Open Blacktop mode
  await page.getByRole('button', { name: /Blacktop/i }).click();
  await expect(page).toHaveURL(/\/blacktop/);

  // Configure: 1v1, target 11 (faster sim)
  await page.getByRole('button', { name: '1v1', exact: true }).click();
  await page.getByRole('button', { name: '11', exact: true }).click();

  // Search Player A — first "Search player..." input is "Your Team"
  const searchInputs = page.getByPlaceholder('Search player...');
  await searchInputs.nth(0).fill('LeBron');
  await searchInputs.nth(0).press('Enter');
  await page.waitForResponse(
    (r) => r.url().includes('/api/nba/players/search') && r.status() === 200,
    { timeout: 15_000 }
  );
  await page.getByRole('button', { name: /^LeBron James/ }).first().click();
  await expect(page.locator('text=LeBron James')).toBeVisible();

  // Search Player B — only one "Search player..." input remains (Your Team is full at 1v1)
  await page.getByPlaceholder('Search player...').fill('Curry');
  await page.getByPlaceholder('Search player...').press('Enter');
  await page.waitForResponse(
    (r) => r.url().includes('/api/nba/players/search') && r.status() === 200,
    { timeout: 15_000 }
  );
  // Pick Stephen Curry specifically (multiple Currys can match)
  await page.getByRole('button', { name: /^Stephen Curry\b/ }).first().click();
  await expect(page.getByRole('heading', { name: /CPU Team \(1\/1\)/ })).toBeVisible();

  // Wait for the Start button to become enabled (both teams full)
  const startBtn = page.getByRole('button', { name: 'Simulate 1v1' });
  await expect(startBtn).toBeEnabled({ timeout: 5_000 });
  await startBtn.click();

  // Result screen: heading "Blacktop 1v1" and a "wins!" line
  await expect(page.getByRole('heading', { name: /Blacktop 1v1/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/wins!$/)).toBeVisible();

  // Rematch button is present
  await expect(page.getByRole('button', { name: 'Rematch', exact: true })).toBeVisible();
});

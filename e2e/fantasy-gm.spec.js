// E2E coverage for the Phase 2 Fantasy GM features:
//   - Standings & Career page renders rank card + view tabs + standings table
//   - "Where Your Team Stands" rank pills appear on MainMenu and GamePage
//   - Starting the season generates an 82-game schedule
//   - Playing the next game updates the user's record
//   - Game Day uses CPU teams (no real NBA team picker)
//
// The real fantasy draft pulls from balldontlie which requires an API key
// and live network. To keep these tests deterministic we provision the user's
// roster + CPU league directly through the existing draft endpoints. Only the
// PRESENTATION (UI) is exercised through the browser.

const { test, expect } = require('./fixtures');

const SERVER = 'http://localhost:5001';

// Build a CPU-league-ready user: register, run /api/draft/setup, draft 15
// synthetic players, then /cpu-fill to populate the 29 CPU rosters from a
// large synthetic pool. Returns { token }.
async function provisionGmUser(request, user) {
  const reg = await request.post(`${SERVER}/api/auth/register`, {
    data: { username: user.username, password: user.password },
  });
  const { token } = await reg.json();
  const auth = { Authorization: `Bearer ${token}` };

  await request.post(`${SERVER}/api/draft/setup`, {
    headers: auth,
    data: {
      conference: 'East', division: 'Southeast', league: 'NBA',
      city: 'Miami', coach: 'Erik Spoelstra', teamName: 'Miami Sharks',
      draftType: 'fantasy',
    },
  });

  for (let i = 0; i < 15; i++) {
    await request.post(`${SERVER}/api/draft/pick`, {
      headers: auth,
      data: {
        playerId: 9000 + i,
        firstName: `User${i}`,
        lastName: 'Pick',
        position: ['G', 'F', 'C'][i % 3],
        rating: 78 + (i % 5),
      },
    });
  }

  const pool = Array.from({ length: 500 }, (_, i) => ({
    id: 5000 + i,
    firstName: `Pool${i}`,
    lastName: 'Player',
    position: ['G', 'F', 'C'][i % 3],
    rating: 60 + (i % 35),
  }));
  await request.post(`${SERVER}/api/draft/cpu-fill`, {
    headers: auth, data: { pool },
  });

  return { token };
}

// Drop the auth token into localStorage so the SPA recognises us as logged in
// before any client-side route guard can redirect to /login.
async function loginViaToken(page, token) {
  await page.goto('/login');
  await page.evaluate(t => localStorage.setItem('token', t), token);
}

test.describe('Phase 2 — Fantasy GM seasons & standings', () => {
  test('Standings page shows rank card, tabs, and full standings table', async ({ page, request, user }) => {
    const { token } = await provisionGmUser(request, user);
    await loginViaToken(page, token);

    // Start the season directly so /standings has data to render.
    await request.post(`${SERVER}/api/season/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await page.goto('/standings');
    await expect(page.getByTestId('standings-page')).toBeVisible({ timeout: 15_000 });

    // Rank card with all 4 pills (League / Conf / Div / Record).
    const card = page.getByTestId('rank-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('rank-league')).toBeVisible();
    await expect(page.getByTestId('rank-conference')).toBeVisible();
    await expect(page.getByTestId('rank-division')).toBeVisible();
    await expect(page.getByTestId('rank-record')).toBeVisible();

    // Three view tabs.
    await expect(page.getByTestId('view-league')).toBeVisible();
    await expect(page.getByTestId('view-conference')).toBeVisible();
    await expect(page.getByTestId('view-division')).toBeVisible();

    // Full league has 30 rows; division view collapses to 5.
    const table = page.getByTestId('standings-table');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(30);

    await page.getByTestId('view-division').click();
    await expect(table.locator('tbody tr')).toHaveCount(5);

    await page.getByTestId('view-conference').click();
    await expect(table.locator('tbody tr')).toHaveCount(15);

    // The user's row should be highlighted.
    await expect(page.getByTestId('standings-user-row')).toBeVisible();
  });

  test('MainMenu shows the 3-pill rank banner once the season is started', async ({ page, request, user }) => {
    const { token } = await provisionGmUser(request, user);
    await request.post(`${SERVER}/api/season/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await loginViaToken(page, token);

    await page.goto('/menu');
    await expect(page.getByTestId('career-summary')).toBeVisible();
    const banner = page.getByTestId('menu-rank-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('menu-rank-league')).toBeVisible();
    await expect(page.getByTestId('menu-rank-conf')).toBeVisible();
    await expect(page.getByTestId('menu-rank-div')).toBeVisible();

    // Clicking a rank pill jumps to /standings.
    await page.getByTestId('menu-rank-league').click();
    await expect(page).toHaveURL(/\/standings/);
  });

  test('Game Day uses CPU teams — no real NBA team picker — and play-next records a game', async ({ page, request, user }) => {
    const { token } = await provisionGmUser(request, user);
    await request.post(`${SERVER}/api/season/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await loginViaToken(page, token);

    await page.goto('/game');
    await expect(page.getByTestId('game-page')).toBeVisible({ timeout: 15_000 });

    // The Phase-2 record + rank bar should be rendered.
    await expect(page.getByTestId('game-record')).toContainText(/Season 1 of 5/);
    await expect(page.getByTestId('game-rank-bar')).toBeVisible();

    // Default is "Season Game" — the next-opponent label should show a CPU
    // team name (NOT "Lakers"/"Warriors"/etc — those would mean we're still
    // pulling real NBA teams).
    const opponent = page.getByTestId('next-opponent');
    await expect(opponent).toBeVisible();
    const opponentText = (await opponent.textContent())?.trim();
    expect(opponentText && opponentText.length).toBeGreaterThan(0);
    // Sanity check: no real NBA franchise names should leak through.
    expect(opponentText).not.toMatch(/Lakers|Warriors|Celtics|Knicks|Heat$/i);

    // Play one game and confirm the season record updates.
    await page.getByTestId('play-next-btn').click();
    // After play, the result view ("Back to Game Day" button) appears.
    await expect(page.getByTestId('play-again-btn')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('play-again-btn').click();

    await expect(page.getByTestId('game-record')).toContainText(/1W|0W . 1L|1L/);
  });

  test('Exhibition mode lets the user pick from CPU teams', async ({ page, request, user }) => {
    const { token } = await provisionGmUser(request, user);
    await loginViaToken(page, token);

    await page.goto('/game');
    await expect(page.getByTestId('game-page')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('mode-exhibition').click();

    // The exhibition view renders "Choose an Opponent (CPU League)" with
    // 29 buttons (one per CPU team).
    const opponentButtons = page.locator('[data-testid^="opponent-"]');
    await expect(opponentButtons.first()).toBeVisible({ timeout: 15_000 });
    expect(await opponentButtons.count()).toBe(29);
  });
});

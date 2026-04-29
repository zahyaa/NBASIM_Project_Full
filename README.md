# 🏀 Basketball Simulator

A full-stack NBA basketball simulator with multiple game modes, built with the MERN stack (MongoDB, Express, React, Node.js). Draft real NBA players from any era, build your roster, and compete in full 5v5 games, 1v1 battles, or streetball on the blacktop.

## 🎮 Game Modes

- **🏆 Fantasy Draft** – Draft players from all NBA eras. Pick your city, coach, conference, and build your dream team of up to 15 players. Compete against 29 CPU-generated franchises in a full 82-game season.
- **📅 Season Draft** – Draft from current-season NBA rosters for the 2025-26 season with active coaches.
- **📊 Standings & Career** – Run an authentic 82-game schedule. League / Conference / Division views with playoff seed badges, eliminated rows, and a red dashed cut-line at the 8-team mark.
- **🎯 Playoffs** – NBA-style 4-round bracket (First Round → Conf Semis → Conf Finals → Finals, centered). Every series is best-of-7. User series can be replayed game-by-game with full play-by-play. Missed-the-playoffs banner skips you straight to next season.
- **📋 Team Management** – Set your starting 5 (saves and applies for the rest of the season — full sims AND quick sims), sign free agents, propose 1-for-1 trades, track injuries and contracts, browse plays.
- **📝 Playbook** – Design up to 25 custom plays (Set / ATO / Iso / PnR / Inbound / Transition) with formations and player roles. Surfaces inside Team Management → Playbook tab.
- **🛍️ Store** – Spend tokens on training packs, signature gear, and recovery. Buy more tokens via PayPal or credit card (only the last 4 digits ever stored).
- **⭐ All-Star Game** – Mid-season East vs West showcase.
- **⚡ One on One** – Pick any two NBA players and run a 1v1 to 11/15/21 with full play-by-play. Popular matchups, random mode, and rematch.
- **🔥 Blacktop** – Streetball mode. Choose 1v1 up to 5v5, set a target score (11, 15, or 21), and play half-court. Simulate instantly or watch play-by-play.
- **📖 Players Bio** – Search any active NBA player with debounced auto-complete. Real ESPN headshots, current-season averages, advanced stats (TS%, eFG%, AST/TO), 5-year career history, last 10 game logs, favorites, and side-by-side Compare mode.
- **🌐 Multiplayer** – Head-to-head against real users. **Locked behind a completed fantasy draft + active premium subscription.** Three modes: **Public Match** (auto-pair with online subscribers, best-of-7), **Private Match** (share a 6-char code), and **Playoff Mode** (8-user bracket — Quarterfinals → Semifinals → Finals, every series best-of-7, *Play for the Ring*).
- **📚 How to Play** – In-app guide with a 14-section walkthrough covering every mode, the fantasy economy, playoffs, multiplayer, difficulty curve, and pro tips.
- **⚙️ Settings** – Difficulty (Easy / Pro / Hard / All-Star / Legacy) — the chosen tier actively shapes every CPU matchup (shot multiplier + score modifier). Reset game data, manage account.

## 🌐 Core Features

- 🔐 **JWT Authentication** – Secure register/login with rate limiting
- 🧠 **Player Ratings** – Heuristic ratings based on draft position and experience
- 🎮 **Game Simulation** – Full 4-quarter + overtime engine with weighted scoring, rebounds, assists, turnovers, shot chart, and win-probability timeline
- 🎚️ **Difficulty-Aware CPU** – Settings difficulty (Easy → Legacy) tilts shot percentages and quick-sim score modifiers in every CPU matchup
- 📺 **Animated GameCast** – Live play-by-play with scoreboard and speed controls (Slow/Normal/Fast/Turbo)
- 🏠 **Floating Home Logo** – Custom basketball SVG button that returns to the main menu from any page
- 🔍 **Player Search** – Search any active NBA player via the balldontlie API, with multi-token name matching
- 🖼️ **Real Player Headshots** – ESPN search resolves player images on demand and caches them server-side for 24h
- ⭐ **Favorites & Compare** – Star up to 50 players; side-by-side Compare mode with auto-highlighted leaders
- 🪙 **Token Economy** – Earn tokens through achievements/streaks; spend on training, gear, recovery; subscription weekly bonuses
- 💳 **Subscriptions** – Free / Premium / GM-Elite tiers; PayPal or credit-card checkout (last-4 only ever stored)
- 🟢 **Online Presence** – `lastSeenAt` heartbeat powers the multiplayer lobby's online list
- 💾 **Persistent Progress** – Wins, losses, teams, lineups, custom plays, favorites, tokens, achievements, subscription state stored in MongoDB

## 🚀 Tech Stack

- **Frontend:** React 18, React Router 6, Context API
- **Backend:** Node.js, Express 5, Mongoose, JWT, bcryptjs
- **Database:** MongoDB
- **API:** NBA data via [balldontlie.io](https://www.balldontlie.io/)

## 📁 Project Structure

```
project-root/
├── client/                     # React frontend
│   ├── src/
│   │   ├── context/            # AuthContext
│   │   ├── pages/              # MainMenu, DraftPage, SeasonDraftPage,
│   │   │                       # GamePage, StandingsPage, PlayoffsPage,
│   │   │                       # AllStarPage, TeamManagementPage,
│   │   │                       # PlaybookPage, StorePage, SubscribePage,
│   │   │                       # NewsPage, OneOnOnePage, BlacktopPage,
│   │   │                       # PlayerBioPage, MultiplayerPage,
│   │   │                       # HowToPlayPage, SettingsPage
│   │   └── components/         # GameCast, HomeLogo (basketball SVG)
│   └── public/
├── server/                     # Express backend
│   ├── models/                 # User (favorites, customPlays, subscription,
│   │                           # cpuRecords, lastSeenAt), Game schemas
│   ├── routes/                 # auth, draft, nba, simulate, games, settings,
│   │                           # season, playoffs, allstar, team, playbook,
│   │                           # multiplayer, payments, upload
│   ├── services/               # playerRating, playerPhoto (24h cache),
│   │                           # nbaImages, simulation (5v5/1v1/blacktop +
│   │                           # difficulty mods), fantasyGM (CPU teams,
│   │                           # quickSimRecord, applyLineup), playoffs,
│   │                           # news, fantasyGM achievements
│   └── middleware/             # JWT auth middleware
├── e2e/                        # Playwright end-to-end tests
├── render.yaml                 # Single-service Render Blueprint
└── README.md
```

## ⚙️ Local Setup

### 1. Clone & Install

```bash
git clone https://github.com/zahyaa/NBASIM_Project_Full.git
cd NBASIM_Project_Full
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. Start MongoDB

```bash
brew services start mongodb/brew/mongodb-community
```

### 3. Configure Environment

Create `server/.env`:

```env
JWT_SECRET=your_secret_key_here
BALLDONTLIE_API_KEY=your_api_key_here
MONGODB_URI=mongodb://localhost:27017/nbasim
PORT=5001
```

Get an API key at [app.balldontlie.io](https://app.balldontlie.io/). This project uses paid-tier endpoints (`/season_averages`, `/players/active`).

### 4. Start Backend

```bash
cd server && node server.js
```

Server runs on [http://localhost:5001](http://localhost:5001)

### 5. Start Frontend

```bash
cd client && NODE_OPTIONS=--openssl-legacy-provider npm start
```

Visit [http://localhost:3000](http://localhost:3000)

---

## 🧪 API Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user (protected) |
| GET | `/api/auth/favorites` | List favorited NBA players |
| POST | `/api/auth/favorites` | Add or refresh a favorite |
| DELETE | `/api/auth/favorites/:playerId` | Remove a favorite |

### Draft
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/draft/setup` | Save conference, league, city, coach, draft type |
| GET | `/api/draft/pool` | Get available players by conference/season |
| POST | `/api/draft/pick` | Draft a player |
| POST | `/api/draft/complete` | Finalize draft with team name |

### NBA Data
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/nba/teams` | All NBA teams |
| GET | `/api/nba/players/search?q=` | Search players by name (multi-token, post-filtered) |
| GET | `/api/nba/players/:id/bio` | Full profile, current season + 5-year history, ESPN headshot |
| GET | `/api/nba/players/:id/games?limit=10` | Recent regular-season game log |
| GET | `/api/nba/roster` | Team roster with ratings |

### Simulation
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/simulate` | Full 5v5 game simulation |
| POST | `/api/simulate/1v1` | 1v1 to target score |
| POST | `/api/simulate/blacktop` | Blacktop (1-5 per team) |

### Settings
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/settings` | Get user settings |
| PATCH | `/api/settings` | Update difficulty/season |
| POST | `/api/settings/reset` | Reset all game data |
| DELETE | `/api/settings/account` | Delete account |

### Games
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/games` | Saved game history |
| POST | `/api/games/save` | Save a game result |

### Season & Playoffs
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/season/start` | Generate the 82-game schedule |
| POST | `/api/season/play-next` | Sim user's next game with full play-by-play |
| POST | `/api/season/simulate-rest` | Quick-sim every remaining regular-season game |
| GET | `/api/season/standings` | League standings (lazy CPU 82-game top-up) |
| POST | `/api/season/advance` | Advance to the next season (skip-playoffs supported) |
| GET | `/api/playoffs/state` | Bracket + eliminated teams list |
| POST | `/api/playoffs/start` | Build the 16-team bracket |
| POST | `/api/playoffs/play-next` | Sim the next playoff game (with PBP for user series) |

### Team & Playbook
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/team/lineup` | Save the user's starting 5 (applies for the season) |
| POST | `/api/team/sign` | Sign a free agent |
| POST | `/api/team/trade` | Propose a 1-for-1 trade with a CPU team |
| GET | `/api/playbook` | List custom plays |
| POST | `/api/playbook` | Create a custom play (max 25) |
| PUT | `/api/playbook/:id` | Update a play |
| DELETE | `/api/playbook/:id` | Delete a play |

### Multiplayer
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/multiplayer/status` | Gate check + active match |
| GET | `/api/multiplayer/online` | Online subscribers (lastSeenAt within 2 min) |
| POST | `/api/multiplayer/public` | Find or create a public best-of-7 match |
| POST | `/api/multiplayer/private/create` | Generate a 6-char invite code |
| POST | `/api/multiplayer/private/join` | Join with a code |
| POST | `/api/multiplayer/playoff/create` | Open an 8-user playoff lobby |
| POST | `/api/multiplayer/playoff/join` | Join a playoff lobby |
| GET | `/api/multiplayer/state/:id` | Poll match state |
| POST | `/api/multiplayer/play/:id` | Sim the next game / series step |
| POST | `/api/multiplayer/leave/:id` | Leave / forfeit |

### Payments
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/payments` | Buy tokens or a subscription (PayPal / credit card last-4) |

---

## 🧪 Testing

This project ships with two complementary test suites covering the backend in isolation and the full client + server flow end-to-end.

### Backend — Jest + Supertest + mongodb-memory-server
Unit / integration tests for Express routes and the simulation engine. Each run spins up an in-memory MongoDB instance so tests are fully isolated from the dev database.

- **Location:** `server/tests/`
  - `auth.test.js` — register/login/`/me` flows, password validation, JWT issuance, rate-limit behavior
  - `simulation.test.js` — 1v1, blacktop, and 5v5 simulation engine output shape and scoring rules
  - `setup.js` / `globalSetup.js` / `globalTeardown.js` / `env.js` — Mongo memory-server lifecycle and env stubs
- **Run:**
  ```bash
  cd server && npm test
  ```

### End-to-End — Playwright
Browser-driven tests exercising the real React app against the real Express server, using Chromium.

- **Config:** `playwright.config.js` (assumes servers on `:3000` and `:5001`; set `START_SERVERS=1` to auto-spawn)
- **Specs:** `e2e/`
  - `auth.spec.js` — register, land on menu, logout; bad-password rejection
  - `game-modes.spec.js` — navigation smoke tests for 1v1 and Blacktop
  - `1v1-simulation.spec.js` — full-name search, CPU auto-pick, **Simulate Game** instant flow, and **Watch Play-by-Play** animated flow with skip
  - `blacktop-simulation.spec.js` — build two 1v1 teams, simulate, verify scoreboard / winner / Rematch
  - `fixtures.js` — per-test fresh user fixture so the suite is idempotent
- **Run:**
  ```bash
  npx playwright test            # all specs, headless
  npm run test:e2e:ui            # interactive UI runner
  npm run test:e2e:headed        # watch tests run in a real browser
  ```

> A development auth rate limit of 500 requests/window (vs. 20 in production) is set in `server/server.js` so the E2E suite can register/login many users without hitting 429s.

---

## � Deploy (single service)

This app ships as **one Web Service** on [Render](https://render.com): Express handles `/api/*` and serves the built React app for everything else. Frontend + backend live behind one domain — no separate static host, no CORS gymnastics.

### Prerequisites
- A free **MongoDB Atlas** cluster — copy its connection string
- A **balldontlie** API key
- A long random **JWT_SECRET** (`openssl rand -hex 64`)

### Steps
1. Push this repo to GitHub.
2. On Render: **New → Blueprint → connect this repo**. The included [render.yaml](render.yaml) wires up build + start commands automatically.
3. In the Render dashboard set these env vars (the blueprint marks them `sync: false` so they aren't committed):
   - `JWT_SECRET`
   - `BALLDONTLIE_API_KEY`
   - `MONGODB_URI` — Atlas SRV string
   - `CORS_ORIGIN` — your service URL, e.g. `https://nbasim.onrender.com`
4. In Atlas, allow Render's egress IPs (or `0.0.0.0/0` for the free tier).
5. Render runs:
   ```bash
   npm install && npm run build      # builds client/build/
   npm start                          # node server/server.js
   ```
6. Visit your Render URL — the React app and API are both served from it.

The same setup works on **Railway** or **Fly.io** with the same `npm run build` / `npm start` scripts. For a custom domain, point CNAME → your Render hostname and update `CORS_ORIGIN`.

---

## �📝 Notes

- Port 5001 is used instead of 5000 (macOS AirPlay Receiver occupies 5000)
- `NODE_OPTIONS=--openssl-legacy-provider` is required for react-scripts 3.x on Node 17+
- Paid balldontlie API subscription enables Teams, Players, Active Players, Season Averages, and per-player Stats

---

## 📸 Screenshots

![Screenshot 1](./assets/screenshots/screenshot1.png)

![Screenshot 2](./assets/screenshots/screenshot2.png)

![Screenshot 3](./assets/screenshots/screenshot3.png)

![Screenshot 4](./assets/screenshots/screenshot4.png)

![Screenshot 5](./assets/screenshots/screenshot5.png)

---

## 📄 License

MIT License

---

Built with ❤️ by [@zahyaa](https://github.com/zahyaa)

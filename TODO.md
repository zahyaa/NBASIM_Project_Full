# NBASIM — Master TODO List (All Tracks)
> Copy this into your project root as `TODO.md` and track progress in VS Code.

---

## TRACK A — Contracts, Salary Cap, Free Agency, Trades

### Sprint A1 — Contracts Schema + Payroll Calculator ✅
- [x] Add `contract` object to player schema: `salary`, `yearsRemaining`, `contractType` (rookie/minimum/standard/max), `teamOption`, `playerOption`, `noTradeClause`, `signedAt`
- [x] Add `finance` object to user/team schema: `salaryCap` (140M), `luxuryTaxLine` (170M), `payroll`, `capSpace`, `taxAmount`, `midLevelExceptionAvailable`
- [x] Create `server/services/contracts.js` with: `calculatePayroll()`, `calculateCapSpace()`, `calculateTaxAmount()`, `buildFinanceSummary()`
- [x] Seed default contracts on player generation: stars 85+ = max, 75-84 = standard, 68-74 = low standard, below 68 = minimum
- [x] Assign rookie scale contracts to all drafted players (4 years)
- [x] Recalculate payroll after: draft, roster generation, CPU team creation
- [x] Add `GET /api/frontoffice/finance` route (auth protected)
- [x] Create `client/src/pages/FrontOfficePage.jsx` — shows cap summary + contract table
- [x] Add "Front Office" nav link
- [x] Regression test: draft, sim game, season flow all still work

### Sprint A2 — Salary Cap Rules + Offseason Rollover ✅
- [x] Enforce cap legality: team cannot exceed hard cap on new signings
- [x] Implement luxury tax: teams over 170M pay 1.5x tax on overage
- [x] Minimum roster size (12) and maximum (15) enforcement
- [x] Add minimum salary floor: teams must spend at least 120M
- [x] Decrement `yearsRemaining` for all players on season rollover
- [x] Players with `yearsRemaining === 0` become free agents on rollover
- [x] Generate free agent pool from expired contracts at season end
- [x] Add `GET /api/frontoffice/freeagents` route — returns available free agents
- [x] Add year-over-year salary cap increase (+3M per season)

### Sprint A3 — Free Agency ✅
- [x] Player interest model: score based on offered salary, team wins, role (minutes), market
- [x] User can make offer: `POST /api/frontoffice/offer` with `playerId`, `salary`, `years`
- [x] Competing CPU offers — 1-3 CPU teams also bid on same player
- [x] Offer resolution after 48-hour sim window (or user triggers manually)
- [x] Re-signing window: user can re-sign own expiring players before open market
- [x] Player declines offer logic — star players reject underpaid offers
- [x] Mid-level exception: allows one signing above cap limit up to 12M/year
- [x] Free agent pool refreshes each offseason
- [x] Free Agency page UI: list of free agents, offer button, interest meter

### Sprint A4 — Trades ✅
- [x] `POST /api/frontoffice/trade/propose` — user sends players + picks to CPU team
- [x] Trade validator: salary matching rules (outgoing vs incoming within 125% + 100K)
- [x] CPU trade acceptance logic: based on player age, rating, contract, team direction
- [x] Draft pick as trade asset: add `ownedPicks` array to team schema
- [x] Trade deadline: trades locked after week 20 of regular season
- [x] No-trade clause enforcement: player with NTC must approve trade
- [x] Trade history log stored per user
- [x] `GET /api/frontoffice/trades` — returns trade history
- [x] Trade Machine UI page: drag players/picks into send/receive panels, submit proposal
- [x] CPU teams can initiate trade offers to user (1-2 times per season)

---

## TRACK B — Player Development, Injuries, Regression

### Sprint B1 — Progression & Regression ✅
- [x] Add `age` field to player schema (rookies start 19-23)
- [x] Add `potential` rating (0-99) to player schema — ceiling for development
- [x] Annual progression function: players under 26 improve 1-3 points based on minutes
- [x] Peak window: players 27-29 stay stable (±1)
- [x] Decline function: players 30+ lose 1-2 points per year
- [x] Breakout mechanic: 5% chance per season young player gains +5-8 points
- [x] Bust mechanic: 3% chance highly-rated rookie underperforms
- [x] Run progression on all players at end-of-season rollover
- [x] `GET /api/season/progression` — returns this season's development report

### Sprint B2 — Injury System ✅
- [x] Add `injury` object to player schema: `isInjured`, `injuryType`, `gamesRemaining`
- [x] Add `durability` rating to player schema
- [x] Pre-game injury check: each player has small injury probability based on durability
- [x] Injury types: ankle sprain (1-3 games), hamstring (5-10), knee (10-20), season-ending
- [x] Injured players excluded from lineup automatically
- [x] Return from injury: first 3 games back get -3% rating (rust mechanic)
- [x] Back-to-back fatigue: playing 2 games in 2 days = -3% all stats
- [x] Injury report page: all injured players league-wide
- [x] Injury news feed entries: "Player X out 2-3 weeks with ankle sprain"

### Sprint B3 — New Player Attributes ✅
- [x] Add `clutch` rating — used in final 2 min of games within 5 points
- [x] Add `iq` rating — affects playmaking and defensive rotations
- [x] Add `leadership` rating — affects team morale/chemistry modifier
- [x] Add `durability` rating — controls injury frequency
- [x] Add `workEthic` rating — multiplier on annual progression speed
- [x] Integrate all new attributes into game sim engine
- [x] Display new attributes on player bio/profile page

---

## TRACK C — Game Engine, Play-by-Play, Coaching

### Sprint C1 — Expanded Play-by-Play ✅
- [x] Expand commentary pool: 200+ unique strings per play type (dunk, fadeaway, fast break, putback, block, steal, etc.)
- [x] Player-specific commentary: use player name + signature move style
- [x] Crowd noise indicators: `[CROWD ROARS]`, `[ARENA GOES SILENT]`, `[HOME CROWD IGNITES]`
- [x] Home court advantage: home team +2% shot chance, -5% opponent FT%
- [x] Momentum system: 3+ consecutive scores = +5% shot chance next 2 possessions
- [x] Hot streak: player hits 3+ straight shots = "on fire" state + commentary callout
- [x] Cold streak: player misses 4+ straight shots = reduced shot chance
- [x] Blowout mercy rule: 25+ point lead in Q4 = starters subbed out for bench

### Sprint C2 — Advanced Game Situations ✅
- [x] And-1: 10% chance when contact made on made basket
- [x] Flagrant foul: 2% chance on hard foul → 2 FTs + possession
- [x] Technical foul: rare event → 1 FT for opponent
- [x] Challenge system: 1 challenge per coach per game
- [x] Intentional foul logic: CPU intentionally fouls when down 3+ in final minute
- [x] Foul trouble: player with 3+ fouls in first half plays reduced minutes
- [x] Player foul out: 6 fouls = ejected from game
- [x] Full court press defensive play: raises steal chance, risks fast break

### Sprint C3 — Coaching & Rotation ✅
- [x] Rotation management: user sets 8-man rotation with minutes targets
- [x] Defensive assignment: assign best defender to opponent's top scorer
- [x] Pace control: slow/medium/fast affects possessions per game
- [x] Late game sub suggestions: recommend best closing lineup in final 3 min
- [x] Hire/fire coach system: each team has a coach with offense/defense/development ratings
- [x] Coach contract: salary + years remaining
- [x] Coaching style modifiers: defensive coach lowers opponent FG%, offensive coach raises team FG%
- [x] Coach of the Year award based on team overperformance

---

## TRACK D — Awards, Records, Hall of Fame

### Sprint D1 — Season Awards
- [x] MVP algorithm: weighted by stats + team record + games played
- [x] DPOY (Defensive Player of the Year): weighted by blocks, steals, opponent FG%
- [x] ROY (Rookie of the Year): best stats among first-year players
- [x] Sixth Man of the Year: best stats among bench players
- [x] Most Improved Player: biggest overall rating/stats jump from prior season
- [x] All-NBA Teams: 1st, 2nd, 3rd (5 players per team)
- [x] All-Defensive Teams: 1st and 2nd
- [x] All-Rookie Teams: 1st and 2nd
- [x] Awards ceremony page: shows all winners at end of season
- [x] Awards stored in user history + player career record

### Sprint D2 — Records & History
- [x] Franchise records page: most points in a game, most wins in a season, best record
- [x] League all-time leaders: points, assists, rebounds, blocks, steals
- [x] Season-by-season history log: champion, MVP, records per season
- [x] Championship banner display per franchise
- [x] Player career stats page: totals, averages, playoff stats separate
- [x] Hall of Fame induction: players qualify after career ends based on stats + awards

---

## TRACK E — League Intelligence, 30 Teams, CPU Logic

### Sprint E1 — CPU Team Behavior
- [x] CPU teams have strategy state: `contender`, `middling`, `rebuild`, `tank`
- [x] CPU teams prioritize re-signing their own star players in offseason
- [x] CPU teams in rebuild mode target young players and draft picks
- [x] CPU teams in contender mode target win-now veterans
- [x] CPU teams react to injuries: make moves when key player goes down
- [x] CPU trade offers balanced by real value (no free superstar handouts)

### Sprint E2 — League Structure
- [x] Full 30-team league with CPU-controlled franchises
- [x] Play-In Tournament: 7th/8th/9th/10th seeds compete for final playoff spots
- [x] Power rankings page: weekly update all 30 teams ranked 1-30
- [x] League standings page: conference + division breakdown
- [x] Trade deadline league-wide (all CPU trades also stop at deadline)
- [x] CPU free agent signings happen simultaneously with user signings

---

## TRACK F — Stats, Analytics, UI

### Sprint F1 — Advanced Stats
- [ ] PER (Player Efficiency Rating) — single number player value
- [ ] True Shooting % — accounts for 3s and FTs
- [ ] Net Rating — point differential per 100 possessions
- [ ] Usage Rate — % of team possessions used by player
- [ ] +/- — point differential when player is on floor
- [ ] Win Shares — how many wins a player contributed

### Sprint F2 — Stats Pages
- [ ] League leaders page: sortable by any stat category
- [ ] Team stats page: offensive/defensive rating, pace, FG%, 3P%, FT%
- [ ] Full game box score: all players, all stat lines, FG/3P/FT splits, +/-
- [ ] Season totals vs per-game toggle on all stat pages
- [ ] Playoff stats tracked separately from regular season
- [ ] Rookie class stats comparison page

---

## TRACK G — Multiplayer Enhancements

### Sprint G1 — Multiplayer League Mode
- [ ] Head-to-head league: 8-30 users each control a team
- [ ] Multiplayer live draft: all users draft simultaneously with 60-second pick timer
- [ ] Human-to-human trades: propose/accept/reject between users
- [ ] Commissioner mode: one user controls league settings, can veto trades
- [ ] League chat: in-game messaging between GMs
- [ ] Live spectate: watch another user's game play out in real time
- [ ] Subscription gate: multiplayer requires active subscription

---

## TRACK H — Game Modes

- [ ] Quick Game: pick any two teams, simulate immediately, no save
- [ ] Franchise Mode: multi-season GM with draft, free agency, trades, progression
- [ ] Classic Teams Mode: simulate with historic NBA rosters (96 Bulls, 17 Warriors, etc.)
- [ ] Rebuilder Challenge: take worst team, reach championship in 5 seasons
- [ ] Superteam Challenge: given 200M cap, build the best possible team
- [ ] Draft Class Mode: simulate entire draft class careers over 15 seasons

---

## TRACK I — Technical / Backend Hardening

- [x] Scheduled job: run weekly token bonuses for active subscribers (cron)
- [x] Game replay storage: save full play-by-play log to DB, allow user to replay past games
- [x] Simulate rest of season: one button runs all remaining games instantly
- [x] Rate limiting on simulation endpoints
- [x] Export stats to CSV
- [x] Remove node_modules from git tracking
- [x] Add username validation regex on register: `/^[a-zA-Z0-9_-]{3,30}$/`
- [x] Add CORS_ORIGIN startup warning in server.js
- [ ] Replace fake credit card validation with Stripe
- [ ] Switch PayPal from sandbox to live credentials
- [ ] Fix shot probability scaling bug (hardcoded miss thresholds)
- [ ] Refactor OT logic into shared `simulatePossession()` helper
- [x] Move screenshots from repo root to `docs/screenshots/`

---

## Sprint Completion Order (Recommended)

| Order | Track | Sprint | Why |
|---|---|---|---|
| 1 | A | A1 | Contracts foundation — everything builds on this |
| 2 | A | A2 | Cap rules before free agency |
| 3 | B | B1 | Progression — makes franchise mode compelling |
| 4 | B | B2 | Injuries — creates drama |
| 5 | A | A3 | Free agency — uses contracts + cap |
| 6 | C | C1 | Better commentary — improves every game immediately |
| 7 | D | D1 | Awards — gives players seasonal goals |
| 8 | A | A4 | Trades — final piece of GM mode |
| 9 | E | E1 | CPU intelligence — makes league feel alive |
| 10 | F | F1 | Advanced stats — rewards deep players |
| 11 | D | D2 | Records and history — long-term franchise payoff |
| 12 | C | C2 | Advanced game situations |
| 13 | G | G1 | Multiplayer leagues |
| 14 | E | E2 | Full 30-team league |
| 15 | H | — | Additional game modes |
| 16 | C | C3 | Coaching system |
| 17 | I | — | Technical hardening and deployment |

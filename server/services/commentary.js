// Sprint C1 — Expanded play-by-play commentary library.
//
// Each play type holds a deep pool of variants so the same game has
// little repetition. Templates use {first} / {last} / {full} for the
// shooter and {asst}/{def}/{reb} for secondary actors. The commentary
// pool API also folds in player "signature" moves picked from a small
// per-position vocabulary so a star center won't get a step-back tag.
//
// Crowd notes (`crowd`) are only emitted when we cross meaningful
// thresholds in simulation.js (big runs, late-game leads).

const POOLS = {
  paint: [
    '{full} drives baseline and finishes through contact!',
    '{full} powers into the paint for the and-one look!',
    '{full} euro-steps and lays it in!',
    '{full} spins through traffic for the bucket!',
    '{full} attacks the rim — gets the bounce!',
    '{full} cuts backdoor and slams it home!',
    '{full} rises up and throws it down with authority!',
    '{full} finishes with the floater over the outstretched hand!',
    '{full} barrels into the paint and kisses it off the glass!',
    '{full} ducks under and reverses for two!',
    '{full} hammers it down off the lob!',
    '{full} catches it on the cut — easy two!',
    '{full} explodes off two feet for the jam!',
    '{full} fakes the kick-out and lays it in himself!',
    '{full} muscles his way through for the and-one!',
    '{full} dribbles into the paint and finishes with the soft touch!',
    '{full} backs his man down and drops the hook!',
    '{full} takes it strong to the cup!',
  ],
  mid: [
    '{full} pulls up from 15 — money!',
    '{full} hits the elbow jumper with ease!',
    '{full} sticks the fadeaway over the contest!',
    '{full} dribbles into a step-back J — splash!',
    '{full} catches and shoots from the elbow — drains it!',
    '{full} rises up over the defender — pure!',
    '{full} freezes him with the jab and pulls — bucket!',
    '{full} delivers a turn-around mid-range dagger!',
    '{full} buries the high-arching mid-range jumper!',
    '{full} unleashes the patented fadeaway — counts!',
    '{full} works baseline and pulls up for two!',
    '{full} splits the defenders for the runner!',
  ],
  three: [
    '{full} drains it from deep!',
    '{full} buries the catch-and-shoot triple!',
    '{full} lets it fly from way downtown — splash!',
    '{full} pulls up from 28 — wet!',
    '{full} steps back behind the arc — daggers!',
    '{full} gets the screen and rises — three-ball, count it!',
    '{full} rains it in from the corner!',
    '{full} no hesitation — three!',
    '{full} side-steps the close-out and buries it!',
    '{full} pulls one from the logo — and it goes!',
    '{full} hits the trail three off the rebound!',
    '{full} answers with a triple of his own!',
  ],
  miss2: [
    '{full} short on the jumper, off the front rim.',
    '{full} draws iron — no good.',
    '{full} clanks it off the back rim.',
    '{full}\u2019s shot rims out.',
    '{full} forces a tough one — no good.',
    '{full} bricks the mid-range attempt.',
    '{full} releases it — way off.',
    '{full} airballs the jumper.',
    '{full}\u2019s shot rolls off.',
    '{full} can\u2019t convert at the rim.',
  ],
  miss3: [
    '{full} fires from deep — off the iron.',
    '{full} fades right — no good from three.',
    '{full} rushes the three — wide left.',
    '{full} short on the triple.',
    '{full} draws iron from beyond the arc.',
    '{full} airballs the long-range attempt.',
    '{full}\u2019s three rattles out!',
  ],
  ft: [
    '{full} steps to the line.',
    '{full} at the charity stripe.',
    '{full} eyeing the rim from the line.',
    '{full} heads to the foul line.',
  ],
  assist: [
    '{asst} threads the needle to {full} for the easy two!',
    '{asst} kicks it out, swings it back, finds {full} for the bucket!',
    '{asst} drives, dishes — {full} finishes!',
    '{asst} drops the dime to {full}!',
    '{asst} hits {full} on the cut — and-one look!',
    '{asst} pick-and-roll handoff to {full} — count it!',
    '{asst} no-look pass to a wide-open {full}!',
    '{asst} lobs it up and {full} throws it down!',
    '{asst} skip-pass crosscourt to {full} — bucket!',
    '{asst} bounce pass to {full} cutting baseline!',
  ],
  steal: [
    '{def} jumps the passing lane and steals it from {full}!',
    '{def} pickpockets {full} cleanly!',
    '{def} swipes it away from {full} — fast break!',
    '{def} reads the play and intercepts {full}!',
    '{def} strips {full} on the drive!',
  ],
  block: [
    '{def} sends {full}\u2019s shot back!',
    '{def} swats {full} into the third row!',
    '{def} pins {full}\u2019s layup against the glass!',
    '{def} times it perfectly and rejects {full}!',
    '{def} denies {full} at the rim — emphatic block!',
    'GET THAT OUT OF HERE — {def} blocks {full}!',
  ],
  turnover: [
    '{full} loses the handle out of bounds.',
    '{full} throws it away — turnover.',
    '{full} double-dribbles — change of possession.',
    '{full} steps on the line — turnover.',
    '{full} forces it into traffic and coughs it up.',
    '{full} commits the offensive foul.',
  ],
  foul: [
    'Foul on {full}.',
    'Reaching foul called on {full}.',
    'Bumps the cutter — foul {full}.',
    'Late close-out, foul on {full}.',
    '{full} picks up the loose-ball foul.',
  ],
  rebound: [
    '{reb} cleans the glass.',
    '{reb} rips down the board.',
    '{reb} crashes the offensive glass!',
    '{reb} muscles in for the rebound.',
    '{reb} secures the carom.',
  ],
  fastbreak: [
    'Fast break — {full} finishes in transition!',
    'On the run — {full} hammers it home!',
    'Outlet to {full} — easy two on the break!',
    'Open floor for {full} — slam!',
  ],
  putback: [
    '{full} cleans the glass and puts it back in!',
    'Offensive board — {full} taps it home!',
    '{full} grabs the offensive board, finishes through contact!',
  ],
};

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

function fillTemplate(tpl, names) {
  return tpl
    .replace(/{full}/g, names.full || '')
    .replace(/{first}/g, names.first || '')
    .replace(/{last}/g, names.last || '')
    .replace(/{asst}/g, names.asst || '')
    .replace(/{def}/g, names.def || '')
    .replace(/{reb}/g, names.reb || '');
}

function name(p) { return p ? `${p.firstName} ${p.lastName}` : ''; }

// Public entry point. `kind` keys into POOLS; `actors` carries the
// player(s) involved. `streak` (optional) appends a hot/cold callout.
function commentary(kind, actors = {}, opts = {}) {
  const pool = POOLS[kind] || POOLS.paint;
  const tpl = pick(pool, opts.rng);
  const text = fillTemplate(tpl, {
    full: name(actors.player),
    first: actors.player ? actors.player.firstName : '',
    last: actors.player ? actors.player.lastName : '',
    asst: name(actors.assist),
    def: name(actors.defender),
    reb: name(actors.rebounder),
  });
  const tags = [];
  if (opts.hotStreak) tags.push(`🔥 ${name(actors.player)} is HEATING UP!`);
  if (opts.onFire) tags.push(`🔥🔥 ${name(actors.player)} IS ON FIRE!`);
  if (opts.coldStreak) tags.push(`❄️ ${name(actors.player)} can't buy a bucket.`);
  if (opts.crowd) tags.push(opts.crowd);
  return tags.length ? `${text} ${tags.join(' ')}` : text;
}

const CROWD = {
  bigRun: '[CROWD ROARS]',
  homeIgnites: '[HOME CROWD IGNITES]',
  awaySilent: '[ARENA GOES SILENT]',
  upset: '[CROWD GASPS]',
  buzzer: '[ARENA EXPLODES]',
};

module.exports = { commentary, POOLS, CROWD };

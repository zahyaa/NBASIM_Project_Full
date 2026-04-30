// Sprint J — preset offensive plays library.
//
// 15 ready-made plays adapted from the Basketball For Coaches "28 Plays
// to Dominate Any Defense" article. Each preset is structured so the
// user can one-click add it to their saved playbook.
//
// Coordinate system used by every diagram (matches PlayDiagram.jsx):
//   - viewBox is 500 wide × 470 tall (half-court, basket at TOP)
//   - baseline   y = 10
//   - hoop       (250, 50)
//   - free-throw y = 190
//   - top of key (250, 220)
//   - wings      (90, 200) / (410, 200)
//   - corners    (40, 90)  / (460, 90)
//   - elbows     (210, 190)/ (290, 190)
//   - low blocks (210, 80) / (290, 80)
//   - half-court y = 460
//
// players: array of { id, x, y, label } — initial positions
// moves:   array of { type, from, to, label?, dashed? }
//          type: 'cut'|'dribble'|'pass'|'screen'

export const SPOTS = {
  hoop:        [250,  50],
  topKey:      [250, 220],
  leftWing:    [ 90, 200],
  rightWing:   [410, 200],
  leftCorner:  [ 40,  90],
  rightCorner: [460,  90],
  leftElbow:   [210, 190],
  rightElbow:  [290, 190],
  leftBlock:   [210,  80],
  rightBlock:  [290,  80],
  highPost:    [250, 140],
  inbound:     [250,   5],   // under-basket OOB
  ballSlot:    [180, 240],
  weakSlot:    [320, 240],
  halfCourt:   [250, 430],
};

export const PRESET_PLAYS = [
  // ============================================================ MAN-TO-MAN
  {
    presetId: 'ucla',
    name: 'UCLA',
    category: 'Man-to-Man',
    type: 'Set',
    formation: '1-4 High',
    description:
      'PG passes to wing, makes a UCLA cut off the high-post screen looking for a layup. ' +
      'If denied, the screener slips into a side PnR while the PG curls off a weak-side ' +
      'double screen for an open jumper.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
      ],
      moves: [
        { type: 'pass',   from: [250, 240], to: [410, 200], label: 'P1' },
        { type: 'screen', from: [290, 190], to: [260, 220] },
        { type: 'cut',    from: [250, 240], to: [260,  70], label: 'UCLA cut' },
        { type: 'screen', from: [210, 190], to: [120, 130] },
        { type: 'cut',    from: [290, 190], to: [330, 100], label: 'PnR' },
      ],
    },
  },
  {
    presetId: 'one-four-quick-floppy',
    name: '1-4 Quick Floppy',
    category: 'Man-to-Man',
    type: 'Set',
    formation: '1-4 High',
    description:
      '2 and 3 floppy-cut along the baseline. 4 and 5 set staggered/single screens. ' +
      'PG reads which shooter is open, posts dive after screening for high-low feeds.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 250, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
      ],
      moves: [
        { type: 'cut',    from: [ 90, 200], to: [220,  85], label: 'baseline' },
        { type: 'cut',    from: [410, 200], to: [280,  85], label: 'baseline' },
        { type: 'screen', from: [210, 190], to: [180,  90] },
        { type: 'screen', from: [290, 190], to: [320,  90] },
        { type: 'cut',    from: [220,  85], to: [ 60, 120], label: '2 curl', dashed: true },
        { type: 'cut',    from: [280,  85], to: [440, 120], label: '3 curl', dashed: true },
      ],
    },
  },
  {
    presetId: 'piston-elevator',
    name: 'Piston Elevator',
    category: 'Man-to-Man',
    type: 'Set',
    formation: '1-4 High',
    description:
      'Iverson cut by 3 pulls the bigs apart. 2 baseline-cuts under the rim and ' +
      'sprints back through an elevator screen by 4 and 5 — instant catch-and-shoot ' +
      'three at the top of the key.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x: 410, y: 200, label: '2' },
        { id: 3, x:  90, y: 200, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
      ],
      moves: [
        { type: 'cut',    from: [ 90, 200], to: [410, 200], label: 'Iverson' },
        { type: 'cut',    from: [410, 200], to: [250,  60], dashed: true },
        { type: 'cut',    from: [250,  60], to: [250, 200], label: 'elevator' },
        { type: 'screen', from: [210, 190], to: [240, 200] },
        { type: 'screen', from: [290, 190], to: [260, 200] },
      ],
    },
  },
  {
    presetId: 'double-curls',
    name: 'Double Curls',
    category: 'Man-to-Man',
    type: 'Set',
    formation: '1-4 High',
    description:
      'PG passes to 3 then UCLA cuts. 2 curls off a 4–5 stagger toward the rim. ' +
      'If neither cutter scores, 5 sets a wing PnR for 3 with maximum spacing.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
      ],
      moves: [
        { type: 'pass',   from: [250, 240], to: [410, 200] },
        { type: 'screen', from: [290, 190], to: [260, 220] },
        { type: 'cut',    from: [250, 240], to: [220,  80], label: 'UCLA' },
        { type: 'cut',    from: [ 90, 200], to: [250,  70], label: '2 curl' },
        { type: 'screen', from: [210, 190], to: [200, 130] },
        { type: 'screen', from: [290, 190], to: [380, 200], label: 'PnR' },
      ],
    },
  },
  {
    presetId: 'flex-warrior',
    name: 'Flex Warrior',
    category: 'Man-to-Man',
    type: 'Set',
    formation: 'Horns',
    description:
      'Pass to elbow → PG flex-screens for 2 cutting baseline → screen-the-screener ' +
      'with 5 freeing 1 at the top. Multiple shooting + post-up reads.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 100, label: '2' },
        { id: 3, x: 410, y: 100, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
      ],
      moves: [
        { type: 'pass',   from: [250, 240], to: [210, 190] },
        { type: 'cut',    from: [250, 240], to: [180, 120], label: 'flex' },
        { type: 'screen', from: [180, 120], to: [110, 105] },
        { type: 'cut',    from: [ 90, 100], to: [220,  60], label: '2 cut' },
        { type: 'screen', from: [290, 190], to: [220, 220] },
        { type: 'cut',    from: [180, 120], to: [250, 230], label: '1 pop' },
      ],
    },
  },
  {
    presetId: 'back-screen-post',
    name: 'Back Screen Post',
    category: 'Man-to-Man',
    type: 'Set',
    formation: '3-Out 2-In',
    description:
      'Quick post-up via a back screen on the 5 defender. Dribble entry sets the ' +
      'angle, 3 walks low and pops up to back-screen 5 to the rim.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
      ],
      moves: [
        { type: 'dribble', from: [250, 240], to: [320, 230], label: 'angle' },
        { type: 'cut',     from: [410, 200], to: [380, 100], dashed: true },
        { type: 'screen',  from: [210, 190], to: [260, 220] },
        { type: 'screen',  from: [290, 190], to: [320, 200] },
        { type: 'screen',  from: [380, 100], to: [310, 200], label: 'back screen' },
        { type: 'cut',     from: [290, 190], to: [280,  60], label: 'roll' },
      ],
    },
  },

  // ================================================================ ZONE
  {
    presetId: 'pick-overload',
    name: 'Pick Overload',
    category: 'Zone',
    type: 'Set',
    formation: '1-3-1',
    description:
      'Dribble drag pulls X1 to wing while 5 ball-screens X2. PG attacks high post — ' +
      'kicks to 2 on the wing or skips to 3 in the opposite corner. Two defenders, ' +
      'three shooters.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 5, x: 250, y: 140, label: '5' },
        { id: 4, x: 250, y:  60, label: '4' },
      ],
      moves: [
        { type: 'dribble', from: [250, 240], to: [110, 220] },
        { type: 'cut',     from: [410, 200], to: [460, 100], dashed: true },
        { type: 'screen',  from: [250, 140], to: [140, 200] },
        { type: 'cut',     from: [110, 220], to: [200, 160], label: 'attack' },
        { type: 'pass',    from: [200, 160], to: [ 90, 200], label: 'kick' },
        { type: 'pass',    from: [ 90, 200], to: [460, 100], label: 'skip' },
      ],
    },
  },
  {
    presetId: '23-flare',
    name: '23 Flare',
    category: 'Zone',
    type: 'Set',
    formation: '1-3-1',
    description:
      'Dribble entry + corner ball-reversal moves the zone. 5 sets a flare screen on ' +
      'X2 while 4 baseline screens X4. Skip pass over the top for the open three.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 4, x: 460, y:  90, label: '4' },
        { id: 5, x: 250, y: 140, label: '5' },
        { id: 3, x: 250, y:  60, label: '3' },
      ],
      moves: [
        { type: 'pass',   from: [250, 240], to: [ 90, 200], label: 'P1' },
        { type: 'pass',   from: [ 90, 200], to: [460,  90], label: 'P2' },
        { type: 'pass',   from: [460,  90], to: [ 90, 200], label: 'P3' },
        { type: 'pass',   from: [ 90, 200], to: [250, 240], label: 'P4' },
        { type: 'screen', from: [250, 140], to: [120, 220] },
        { type: 'cut',    from: [ 90, 200], to: [ 30, 240], label: 'flare' },
        { type: 'pass',   from: [250, 240], to: [ 30, 240], label: 'shot' },
      ],
    },
  },
  {
    presetId: 'skipper',
    name: 'Skipper',
    category: 'Zone',
    type: 'Set',
    formation: '1-3-1',
    description:
      'Quick-hitter for a corner three. 5 hides on the back of the bottom-zone ' +
      'defender; 2 slides into the corner; 3 fires the skip pass over the top.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 5, x: 290, y: 140, label: '5' },
        { id: 4, x: 250, y:  60, label: '4' },
      ],
      moves: [
        { type: 'pass',   from: [250, 240], to: [410, 200], label: 'P1' },
        { type: 'screen', from: [290, 140], to: [300,  90] },
        { type: 'cut',    from: [ 90, 200], to: [ 40,  90], label: 'corner' },
        { type: 'pass',   from: [410, 200], to: [ 40,  90], label: 'skip', dashed: true },
      ],
    },
  },
  {
    presetId: 'swinger',
    name: 'Swinger',
    category: 'Zone',
    type: 'PnR',
    formation: '1-3-1',
    description:
      'Blindside ball-screen at the top. Three options: pull-up jumper, kick to 3 in ' +
      'the corner, or bounce-pass to 4 on the baseline cut.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 240, label: '1' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
        { id: 4, x: 250, y:  60, label: '4' },
        { id: 5, x: 250, y: 140, label: '5' },
      ],
      moves: [
        { type: 'pass',   from: [250, 240], to: [ 90, 200] },
        { type: 'pass',   from: [ 90, 200], to: [250, 240] },
        { type: 'screen', from: [250, 140], to: [240, 220] },
        { type: 'dribble',from: [250, 240], to: [220, 150], label: 'attack' },
        { type: 'cut',    from: [410, 200], to: [460,  90], label: 'corner' },
        { type: 'cut',    from: [250,  60], to: [200,  60], label: 'baseline' },
      ],
    },
  },

  // ================================================================ BLOB
  {
    presetId: 'box-gate',
    name: 'Box Gate',
    category: 'BLOB Man-to-Man',
    type: 'Inbound',
    formation: 'Box',
    description:
      'BLOB box: 2 back-screens 5 to the rim, then sprints through a 3-4 gate screen ' +
      'for a wing catch-and-shoot. 1 inbounds and cross-screens 5 for a duck-in.',
    diagram: {
      players: [
        { id: 1, x: 250, y:   5, label: '1' },
        { id: 2, x: 290, y:  80, label: '2' },
        { id: 3, x: 290, y: 190, label: '3' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 210, y:  80, label: '5' },
      ],
      moves: [
        { type: 'screen', from: [290,  80], to: [220,  85] },
        { type: 'cut',    from: [210,  80], to: [250,  60], label: '5 rim' },
        { type: 'cut',    from: [290,  80], to: [240, 190], label: 'gate' },
        { type: 'screen', from: [210, 190], to: [230, 190] },
        { type: 'screen', from: [290, 190], to: [270, 190] },
        { type: 'pass',   from: [250,   5], to: [240, 190], label: 'shot' },
      ],
    },
  },
  {
    presetId: 'duke-blob',
    name: 'Duke',
    category: 'BLOB Man-to-Man',
    type: 'Inbound',
    formation: 'Stack',
    description:
      'Sequenced screens free 3 to the corner, 1 to the top, 2 to the wing. Finish ' +
      'with a ram screen — 4 screens 5 who screens 2 for a flowing pick-and-roll.',
    diagram: {
      players: [
        { id: 1, x: 250, y: 190, label: '1' },
        { id: 2, x: 250, y:   5, label: '2' },
        { id: 3, x: 220, y:  80, label: '3' },
        { id: 4, x: 250, y:  80, label: '4' },
        { id: 5, x: 280, y:  80, label: '5' },
      ],
      moves: [
        { type: 'screen', from: [280,  80], to: [240,  85] },
        { type: 'cut',    from: [220,  80], to: [ 40, 100], label: '3 corner' },
        { type: 'screen', from: [250,  80], to: [240, 170] },
        { type: 'cut',    from: [250, 190], to: [250, 220], label: '1 top' },
        { type: 'screen', from: [250,  80], to: [400, 100] },
        { type: 'cut',    from: [250,   5], to: [410, 200], label: '2 wing' },
      ],
    },
  },
  {
    presetId: 'two-inside',
    name: 'Two Inside',
    category: 'BLOB Man-to-Man',
    type: 'Inbound',
    formation: 'Box',
    description:
      'Screen-the-screener post entry. 4 up-screens 1 to the corner, 5 cross-screens ' +
      'for 4 cutting to the rim, then 5 seals deep for a follow-up post feed.',
    diagram: {
      players: [
        { id: 3, x: 250, y:   5, label: '3' },
        { id: 1, x: 210, y: 190, label: '1' },
        { id: 2, x: 290, y: 190, label: '2' },
        { id: 4, x: 210, y:  80, label: '4' },
        { id: 5, x: 290, y:  80, label: '5' },
      ],
      moves: [
        { type: 'screen', from: [210,  80], to: [200, 180] },
        { type: 'cut',    from: [210, 190], to: [ 40, 100], label: '1 corner' },
        { type: 'cut',    from: [290, 190], to: [220, 220], label: '2 slot' },
        { type: 'screen', from: [290,  80], to: [220,  80] },
        { type: 'cut',    from: [210,  80], to: [310,  60], label: '4 rim' },
        { type: 'pass',   from: [250,   5], to: [310,  60], dashed: true },
      ],
    },
  },
  {
    presetId: 'cross-blob',
    name: 'Cross',
    category: 'BLOB Zone',
    type: 'Inbound',
    formation: '1-4 High',
    description:
      'BLOB vs 2-3 zone. 2 and 3 cut to the corners and call for the ball, dragging ' +
      'the bottom defenders. 4 and 5 cross to opposite blocks; inbounder reads which ' +
      'four-on-three side is open.',
    diagram: {
      players: [
        { id: 1, x: 250, y:   5, label: '1' },
        { id: 4, x: 210, y: 190, label: '4' },
        { id: 5, x: 290, y: 190, label: '5' },
        { id: 2, x:  90, y: 200, label: '2' },
        { id: 3, x: 410, y: 200, label: '3' },
      ],
      moves: [
        { type: 'cut', from: [ 90, 200], to: [ 40,  90], label: '2 corner' },
        { type: 'cut', from: [410, 200], to: [460,  90], label: '3 corner' },
        { type: 'cut', from: [210, 190], to: [290,  85], label: '4 cross' },
        { type: 'cut', from: [290, 190], to: [210,  85], label: '5 cross' },
        { type: 'pass',from: [250,   5], to: [ 40,  90], dashed: true },
      ],
    },
  },
  {
    presetId: 'hawk-blob',
    name: 'Hawk',
    category: 'BLOB Zone',
    type: 'Inbound',
    formation: '4-Low',
    description:
      'Quick-hitter: 5 seals the middle, 4 walks X3 deep, 2 floats to the ball-side ' +
      'corner for a catch-and-shoot three. If the corner is denied, 4 has an open ' +
      'midrange jumper.',
    diagram: {
      players: [
        { id: 3, x: 250, y:   5, label: '3' },
        { id: 1, x: 250, y: 220, label: '1' },
        { id: 5, x: 250, y: 100, label: '5' },
        { id: 4, x: 290, y:  80, label: '4' },
        { id: 2, x: 410, y: 200, label: '2' },
      ],
      moves: [
        { type: 'screen', from: [250, 100], to: [250,  60] },
        { type: 'screen', from: [290,  80], to: [320,  90] },
        { type: 'cut',    from: [410, 200], to: [460,  90], label: '2 corner' },
        { type: 'cut',    from: [250, 220], to: [180, 240], label: '1 slot' },
        { type: 'pass',   from: [250,   5], to: [460,  90], label: 'shot' },
      ],
    },
  },
];

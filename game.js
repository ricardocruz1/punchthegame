// ============================================================
// PUNCH THE MONKEY - ROCK RUNNER
// A Subway Surfers-style endless runner
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Hi-DPI support
const container = document.getElementById('gameContainer');
const W = 500;
const H = 900;
canvas.width = W * 2;
canvas.height = H * 2;
// Let CSS handle display sizing for responsive layout
ctx.scale(2, 2);

// ============================================================
// CONSTANTS
// ============================================================
const LANE_COUNT = 3;
const LANE_WIDTH = 90;
const LANE_Y_BASE = H - 120;       // where the player "stands"
const LANE_CENTER_X = W / 2;
const LANE_POSITIONS = [-1, 0, 1]; // left, center, right
const HORIZON = H * 0.22;          // where the ground/path begins
const GRAVITY = 0.6;
const JUMP_FORCE = -15;
const ROLL_DURATION = 600;     // ms
const LANE_SWITCH_SPEED = 14;
const INITIAL_GAME_SPEED = 3;
const MAX_GAME_SPEED = 13;
const SPEED_INCREMENT = 0.0286;

// Colors
const COLORS = {
  sky: ['#87CEEB', '#5BA3D9', '#2E86AB'],
  ground: '#8B7355',
  groundDark: '#6B5340',
  rock: '#696969',
  rockLight: '#888888',
  rockDark: '#4a4a4a',
  jungle: '#2d5a1e',
  jungleDark: '#1a3a10',
  tree: '#3a2a1a',
  leaves: '#2d8a2d',
  // Plushie = orange-red monkey plushie
  plushie: '#E85530',
  plushieLight: '#F07050',
  plushieDark: '#B53A1A',
  plushieBelly: '#F5A070',
  plushieNose: '#3a2a1a',
  // Punch = baby monkey: grayish-tan fur, pink face
  monkey: '#A0917A',
  monkeyLight: '#B8ADA0',
  monkeyDark: '#7A6E60',
  monkeyFace: '#E8C5A8',
  monkeyFaceLight: '#F0D5BE',
  monkeyEar: '#D4A882',
  punchRed: '#FF4444',
  // Enemy monkeys: darker, bigger, meaner
  enemyMonkey: '#6B4226',
  enemyMonkeyDark: '#3D2515',
  enemyMonkeyFace: '#B87A4A',
};

// ============================================================
// GAME STATE
// ============================================================
let gameState = 'menu'; // menu, playing, gameover
let score = 0;
let highScore = parseInt(localStorage.getItem('punchMonkeyHighScore') || '0');
let plushiesCollected = 0;
let gameSpeed = INITIAL_GAME_SPEED;
let distance = 0;
let frameCount = 0;
let lastTime = 0;
let deltaTime = 0;
let shakeAmount = 0;
let flashAlpha = 0;

// ============================================================
// PLAYER
// ============================================================
const player = {
  lane: 1,              // 0=left, 1=center, 2=right
  targetLane: 1,
  x: LANE_CENTER_X,
  y: LANE_Y_BASE,
  vy: 0,
  width: 35,
  height: 49,
  isJumping: false,
  isRolling: false,
  rollTimer: 0,
  isInvincible: false,
  invincibleTimer: 0,
  animFrame: 0,
  animTimer: 0,
  runCycle: 0,
  alive: true,
  // hit system (2-strike)
  hits: 0,
  stunned: false,
  stunnedTimer: 0,
  recoveryTimer: 0,    // time to recover after first hit
  preHitSpeed: 0,      // store speed before hit to recover to
  // magnet powerup
  magnetActive: false,
  magnetTimer: 0,
  // multiplier
  multiplier: 1,
  multiplierTimer: 0,
};

// ============================================================
// ARRAYS
// ============================================================
let obstacles = [];
let plushies = [];
let particles = [];
let bgElements = [];    // background decorations (trees, bushes)
let groundStripes = [];  // road markings
let chaserMonkeys = [];

// ============================================================
// CHASER MONKEY SYSTEM (Subway Surfers style)
// States: idle, intro, retreating, chasing, catching
// ============================================================
const chaser = {
  x: LANE_CENTER_X,
  y: H + 100,           // off screen at bottom
  state: 'idle',        // idle | intro | retreating | chasing | catching
  animFrame: 0,
  stateTimer: 0,        // ms timer for current state
  targetY: 0,           // where the chaser is heading
  speed: 0,
  catchAnimPhase: 0,    // for the final catching animation
};

// ============================================================
// INPUT HANDLING
// ============================================================
const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  swipeStartX: 0,
  swipeStartY: 0,
  swipeStartTime: 0,
  touching: false,
};

document.addEventListener('keydown', (e) => {
  if (gameState === 'menu') {
    if (e.code === 'Space' || e.code === 'Enter') startGame();
    return;
  }
  if (gameState === 'gameover') {
    if (e.code === 'Space' || e.code === 'Enter') startGame();
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      e.preventDefault();
      switchLane(-1);
      break;
    case 'ArrowRight':
    case 'KeyD':
      e.preventDefault();
      switchLane(1);
      break;
    case 'ArrowUp':
    case 'KeyW':
    case 'Space':
      e.preventDefault();
      jump();
      break;
    case 'ArrowDown':
    case 'KeyS':
      e.preventDefault();
      roll();
      break;
  }
});

// Touch / swipe support
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (gameState === 'menu' || gameState === 'gameover') {
    startGame();
    return;
  }
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  input.swipeStartX = touch.clientX - rect.left;
  input.swipeStartY = touch.clientY - rect.top;
  input.swipeStartTime = Date.now();
  input.touching = true;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!input.touching) return;
  input.touching = false;
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const endX = touch.clientX - rect.left;
  const endY = touch.clientY - rect.top;
  const dx = endX - input.swipeStartX;
  const dy = endY - input.swipeStartY;
  const dt = Date.now() - input.swipeStartTime;

  if (dt > 500) return; // too slow

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const minSwipe = 30;

  if (absDx > absDy && absDx > minSwipe) {
    switchLane(dx > 0 ? 1 : -1);
  } else if (absDy > minSwipe) {
    if (dy < 0) jump();
    else roll();
  }
}, { passive: false });

// Mouse click for menu
canvas.addEventListener('click', () => {
  if (gameState === 'menu' || gameState === 'gameover') {
    startGame();
  }
});

// ============================================================
// PLAYER ACTIONS
// ============================================================
function switchLane(dir) {
  if (!player.alive) return;
  const newLane = player.targetLane + dir;
  if (newLane >= 0 && newLane < LANE_COUNT) {
    player.targetLane = newLane;
  }
}

function jump() {
  if (!player.alive) return;
  if (!player.isJumping && !player.isRolling) {
    player.isJumping = true;
    player.vy = JUMP_FORCE;
    spawnParticles(player.x, player.y + player.height / 2, 5, '#8B7355');
  }
}

function roll() {
  if (!player.alive) return;
  if (!player.isRolling && !player.isJumping) {
    player.isRolling = true;
    player.rollTimer = ROLL_DURATION;
  }
}

// ============================================================
// GAME MANAGEMENT
// ============================================================
function startGame() {
  gameState = 'playing';
  score = 0;
  plushiesCollected = 0;
  gameSpeed = INITIAL_GAME_SPEED;
  distance = 0;
  frameCount = 0;
  shakeAmount = 0;

  player.lane = 1;
  player.targetLane = 1;
  player.x = getLaneX(1);
  player.y = LANE_Y_BASE;
  player.vy = 0;
  player.isJumping = false;
  player.isRolling = false;
  player.alive = true;
  player.isInvincible = false;
  player.magnetActive = false;
  player.multiplier = 1;
  player.runCycle = 0;
  player.hits = 0;
  player.stunned = false;
  player.stunnedTimer = 0;
  player.recoveryTimer = 0;
  player.preHitSpeed = 0;

  chaser.y = H + 100;
  chaser.state = 'intro';
  chaser.stateTimer = 0;
  chaser.speed = 0;
  chaser.catchAnimPhase = 0;
  chaser.x = LANE_CENTER_X;

  obstacles = [];
  plushies = [];
  particles = [];
  bgElements = [];
  groundStripes = [];
  chaserMonkeys = [];

  // Reset sound tracking state
  lastPlushieCount = 0;
  lastLane = 1;
  lastHits = 0;
  wasAlive = true;

  // Initialize ground stripes
  for (let i = 0; i < 20; i++) {
    groundStripes.push({ z: i * 50 });
  }

  // Initialize background elements
  for (let i = 0; i < 8; i++) {
    bgElements.push(createBgElement(Math.random() * H));
  }
}

function getLaneX(lane) {
  return LANE_CENTER_X + (lane - 1) * LANE_WIDTH;
}

function createBgElement(y) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const groundStart = HORIZON;
  return {
    x: LANE_CENTER_X + side * (W / 2 - 70 + Math.random() * 60),
    y: (y !== undefined) ? y : groundStart + Math.random() * 20,
    type: Math.random() > 0.3 ? 'tree' : 'bush',
    scale: 0.5 + Math.random() * 0.5,
    side: side,
  };
}

// ============================================================
// OBSTACLE SPAWNING
// ============================================================
let spawnTimer = 0;
let plushieSpawnTimer = 0;
let chaserSpawnTimer = 0;

function spawnObstacle() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  // Early game only spawns simple rocks; harder types unlock over distance
  let types = ['rock'];
  if (distance > 10) types.push('boulder');
  if (distance > 26) types.push('rock_tall');
  if (distance > 44) types.push('log');
  const type = types[Math.floor(Math.random() * types.length)];

  let w, h, requireJump, requireRoll;
  switch (type) {
    case 'rock':
      w = 50; h = 45; requireJump = true; requireRoll = false;
      break;
    case 'boulder':
      w = 65; h = 55; requireJump = true; requireRoll = false;
      break;
    case 'rock_tall':
      w = 40; h = 70; requireJump = true; requireRoll = false;
      break;
    case 'log':
      w = 60; h = 30; requireJump = false; requireRoll = true;
      break;
  }

  // Sometimes spawn double obstacle (2 lanes blocked) - only later in game
  const doDouble = Math.random() < 0.25 && distance > 35;
  const spawnY = HORIZON; // spawn at the horizon, same depth as background trees
  const obs = [{
    x: getLaneX(lane),
    y: spawnY,
    width: w,
    height: h,
    lane: lane,
    type: type,
    requireJump: requireJump,
    requireRoll: requireRoll,
    passed: false,
  }];

  if (doDouble) {
    let lane2 = lane;
    while (lane2 === lane) lane2 = Math.floor(Math.random() * LANE_COUNT);
    obs.push({
      x: getLaneX(lane2),
      y: spawnY,
      width: w,
      height: h,
      lane: lane2,
      type: type,
      requireJump: requireJump,
      requireRoll: requireRoll,
      passed: false,
    });
  }

  obstacles.push(...obs);

  // Chance to spawn a plushie on top of an obstacle (rewards jumping)
  for (const o of obs) {
    if (Math.random() < 0.25) {
      const shades = ['#E85530', '#D94A28', '#F06040', '#CC4020'];
      const shade = shades[Math.floor(Math.random() * shades.length)];
      plushies.push({
        x: o.x,
        y: o.y - o.height - 20, // positioned above the obstacle
        lane: o.lane,
        type: 'monkey_plush',
        color: shade,
        collected: false,
        bobPhase: Math.random() * Math.PI * 2,
        scale: 1,
        attachedToObstacle: true, // moves with obstacle
        obstacleRef: o,
      });
    }
  }
}

function spawnPlushie() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  // All plushies are orange-red monkey plushies
  // Slight color variations for visual interest
  const shades = ['#E85530', '#D94A28', '#F06040', '#CC4020'];
  const shade = shades[Math.floor(Math.random() * shades.length)];

  // Sometimes spawn a line of plushies (rare)
  const plushieSpawnY = HORIZON; // spawn at the horizon, same depth as background trees
  const count = Math.random() < 0.15 ? (2 + Math.floor(Math.random() * 3)) : 1;
  for (let i = 0; i < count; i++) {
    plushies.push({
      x: getLaneX(lane),
      y: plushieSpawnY - i * 45,
      lane: lane,
      type: 'monkey_plush',
      color: shade,
      collected: false,
      bobPhase: Math.random() * Math.PI * 2,
      scale: 1,
    });
  }
}

// ============================================================
// PARTICLES
// ============================================================
function spawnParticles(x, y, count, color, spread) {
  spread = spread || 5;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * spread,
      vy: -(Math.random() * spread),
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      size: 2 + Math.random() * 4,
      color: color,
    });
  }
}

function spawnCollectParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 / 12) * i;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * 4,
      vy: Math.sin(angle) * 4,
      life: 1,
      decay: 0.03,
      size: 3 + Math.random() * 3,
      color: color,
    });
  }
}

// ============================================================
// FLOATING TEXT
// ============================================================
let floatingTexts = [];

function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, life: 1, vy: -2 });
}

// ============================================================
// UPDATE
// ============================================================
function update(dt) {
  if (gameState !== 'playing') return;

  frameCount++;
  distance += gameSpeed * 0.0175;
  score += Math.floor(gameSpeed * player.multiplier);
  gameSpeed = Math.min(MAX_GAME_SPEED, INITIAL_GAME_SPEED + distance * SPEED_INCREMENT);

  // Player lane movement
  const targetX = getLaneX(player.targetLane);
  const dx = targetX - player.x;
  if (Math.abs(dx) > 1) {
    const step = Math.sign(dx) * Math.min(LANE_SWITCH_SPEED, Math.abs(dx));
    player.x += step;
  } else {
    player.x = targetX;
    player.lane = player.targetLane;
  }

  // Player jump physics
  if (player.isJumping) {
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= LANE_Y_BASE) {
      player.y = LANE_Y_BASE;
      player.vy = 0;
      player.isJumping = false;
      spawnParticles(player.x, player.y + player.height / 2, 3, '#8B7355');
    }
  }

  // Player roll timer
  if (player.isRolling) {
    player.rollTimer -= dt * 1000;
    if (player.rollTimer <= 0) {
      player.isRolling = false;
    }
  }

  // Player invincibility
  if (player.isInvincible) {
    player.invincibleTimer -= dt * 1000;
    if (player.invincibleTimer <= 0) {
      player.isInvincible = false;
    }
  }

  // Magnet
  if (player.magnetActive) {
    player.magnetTimer -= dt * 1000;
    if (player.magnetTimer <= 0) player.magnetActive = false;
  }

  // Multiplier
  if (player.multiplierTimer > 0) {
    player.multiplierTimer -= dt * 1000;
    if (player.multiplierTimer <= 0) {
      player.multiplier = 1;
    }
  }

  // Animation
  player.animTimer += dt;
  player.runCycle += gameSpeed * 0.15;

  // Screen shake decay
  shakeAmount *= 0.9;
  flashAlpha *= 0.9;

  // --- SPAWN MANAGEMENT ---
  // Early game has much wider gaps; tightens over time
  const spawnGap = Math.max(140, 250 - distance * 1.14);
  spawnTimer += gameSpeed;
  if (spawnTimer > spawnGap + Math.random() * 80) {
    spawnTimer = 0;
    spawnObstacle();
  }

  plushieSpawnTimer += gameSpeed;
  if (plushieSpawnTimer > 200 + Math.random() * 100) {
    plushieSpawnTimer = 0;
    spawnPlushie();
  }

  // --- CHASER MONKEY STATE MACHINE ---
  chaser.animFrame += 0.2;
  chaser.stateTimer += dt * 1000;

  switch (chaser.state) {
    case 'intro':
      // Game start: chasers rush in from below, appear close behind Punch
      if (chaser.stateTimer < 500) {
        // Rush onto screen from below
        chaser.y = H + 100 - (chaser.stateTimer / 500) * (H + 100 - (LANE_Y_BASE + 50));
      } else if (chaser.stateTimer < 2000) {
        // Hold close behind player - menacing
        chaser.y = LANE_Y_BASE + 50;
      } else {
        // Gradually fall back as the run begins
        chaser.y += 1.5;
        if (chaser.y > H + 100) {
          chaser.state = 'idle';
          chaser.stateTimer = 0;
        }
      }
      break;

    case 'idle':
      // Chasers are behind, off-screen. Not visible.
      chaser.y = H + 150;
      break;

    case 'chasing':
      // After first hit: chasers rapidly close in
      if (chaser.y > LANE_Y_BASE + 40) {
        chaser.y -= 4; // rush in fast
      } else {
        chaser.y = LANE_Y_BASE + 40; // hold close behind
      }
      break;

    case 'retreating':
      // Player survived long enough after hit - chasers fall back
      chaser.y += 2;
      if (chaser.y > H + 100) {
        chaser.state = 'idle';
        chaser.stateTimer = 0;
      }
      break;

    case 'catching':
      // Final game over - chasers rush in and surround Punch
      if (chaser.y > player.y + 20) {
        chaser.y -= 6; // rush in to catch
      } else {
        chaser.y = player.y + 20;
        chaser.catchAnimPhase += dt * 8;
      }
      break;
  }

  // Follow player's lane loosely
  if (chaser.state !== 'idle') {
    const chaserTargetX = player.x;
    chaser.x += (chaserTargetX - chaser.x) * 0.05;
  }

  // --- PLAYER STUNNED / RECOVERY LOGIC ---
  if (player.stunned) {
    player.stunnedTimer -= dt * 1000;
    if (player.stunnedTimer <= 0) {
      player.stunned = false;
      player.isInvincible = false;
    }
  }

  if (player.recoveryTimer > 0) {
    player.recoveryTimer -= dt * 1000;
    if (player.recoveryTimer <= 0 && player.hits === 1) {
      // Player survived long enough - recover!
      player.hits = 0;
      player.isInvincible = false;
      // Gradually restore speed (it will ramp back up via the normal speed formula)
      chaser.state = 'retreating';
      chaser.stateTimer = 0;
      spawnFloatingText(player.x, player.y - 80, 'SAFE!', '#4CAF50');
    }
  }

  // --- UPDATE OBSTACLES ---
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.y += gameSpeed;

    // Collision detection - generous hitbox padding
    if (!obs.passed && player.alive && distance > 3.5) {
      const pad = 11; // very forgiving hitbox
      const playerTop = player.isRolling ? player.y - 10 : player.y - player.height;
      const playerBottom = player.y;
      const playerLeft = player.x - player.width / 2 + pad;
      const playerRight = player.x + player.width / 2 - pad;

      const obsTop = obs.y - obs.height;
      const obsBottom = obs.y;
      const obsLeft = obs.x - obs.width / 2;
      const obsRight = obs.x + obs.width / 2;

      if (playerRight > obsLeft && playerLeft < obsRight &&
          playerBottom > obsTop && playerTop < obsBottom) {

        // Check if player can avoid
        if (player.isJumping && player.y < LANE_Y_BASE - 15) {
          // Any decent jump clears everything - most forgiving check first
        } else if (player.isRolling && obs.requireRoll) {
          // Rolled under - safe
        } else if (!player.isInvincible) {
          playerHit();
        }
      }
    }

    if (obs.y > LANE_Y_BASE + 20 && !obs.passed) {
      obs.passed = true;
    }

    if (obs.y > H + 100) {
      obstacles.splice(i, 1);
    }
  }

  // --- UPDATE PLUSHIES ---
  for (let i = plushies.length - 1; i >= 0; i--) {
    const p = plushies[i];

    // If attached to an obstacle, follow it
    if (p.attachedToObstacle && p.obstacleRef) {
      p.x = p.obstacleRef.x;
      p.y = p.obstacleRef.y - p.obstacleRef.height - 20;
    } else {
      p.y += gameSpeed;
    }
    p.bobPhase += 0.05;

    // Magnet pull
    if (player.magnetActive && !p.collected) {
      const pullDx = player.x - p.x;
      const pullDy = player.y - player.height / 2 - p.y;
      const pullDist = Math.sqrt(pullDx * pullDx + pullDy * pullDy);
      if (pullDist < 150) {
        p.x += pullDx * 0.1;
        p.y += pullDy * 0.1;
      }
    }

    // Collect
    if (!p.collected && player.alive) {
      const dx2 = player.x - p.x;
      const dy2 = (player.y - player.height / 2) - p.y;
      const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (dist < 40) {
        p.collected = true;
        plushiesCollected++;
        score += 100 * player.multiplier;
        spawnCollectParticles(p.x, p.y, p.color);
        spawnFloatingText(p.x, p.y, '+' + (100 * player.multiplier), p.color);

        // Every 20 plushies = bonus
        if (plushiesCollected % 20 === 0) {
          player.multiplier = 2;
          player.multiplierTimer = 10000;
          spawnFloatingText(player.x, player.y - 100, 'x2 MULTIPLIER!', '#FFD700');
        }
        // Every 50 plushies = magnet
        if (plushiesCollected % 50 === 0) {
          player.magnetActive = true;
          player.magnetTimer = 8000;
          spawnFloatingText(player.x, player.y - 120, 'MAGNET!', '#E85530');
        }
      }
    }

    if (p.y > H + 50) {
      plushies.splice(i, 1);
    }
  }

  // --- UPDATE PARTICLES ---
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= p.decay;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  // --- UPDATE FLOATING TEXTS ---
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.life -= 0.02;
    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  // --- UPDATE BACKGROUND ---
  // Trees/bushes are roadside scenery - scroll at same speed as the ground
  for (let i = bgElements.length - 1; i >= 0; i--) {
    bgElements[i].y += gameSpeed;
    if (bgElements[i].y > H + 100) {
      bgElements[i] = createBgElement();
    }
  }

  // Ground stripes
  for (let i = 0; i < groundStripes.length; i++) {
    groundStripes[i].z += gameSpeed;
    if (groundStripes[i].z > 1000) {
      groundStripes[i].z -= 1000;
    }
  }
}

function playerHit() {
  player.hits++;

  if (player.hits === 1) {
    // FIRST HIT: stumble, slow down, chasers close in
    player.stunned = true;
    player.stunnedTimer = 1500;      // brief invincibility after stumble
    player.isInvincible = true;
    player.invincibleTimer = 1500;
    player.preHitSpeed = gameSpeed;
    player.recoveryTimer = 6000;     // 6 seconds to recover

    // Slow down significantly
    gameSpeed = Math.max(INITIAL_GAME_SPEED, gameSpeed * 0.4);

    // Chasers rush in
    chaser.state = 'chasing';
    chaser.stateTimer = 0;

    // Visual/audio feedback
    shakeAmount = 8;
    flashAlpha = 0.3;
    spawnParticles(player.x, player.y - player.height / 2, 10, '#FF4444', 5);
    spawnFloatingText(player.x, player.y - 100, 'WATCH OUT!', '#FF4444');
  } else {
    // SECOND HIT: chasers catch Punch - game over
    chaser.state = 'catching';
    chaser.stateTimer = 0;
    chaser.catchAnimPhase = 0;
    gameOver();
  }
}

function gameOver() {
  player.alive = false;
  gameState = 'gameover';
  shakeAmount = 15;
  flashAlpha = 0.5;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('punchMonkeyHighScore', highScore.toString());
    window.dispatchEvent(new Event('highScoreUpdated'));
  }

  // Death particles
  spawnParticles(player.x, player.y - player.height / 2, 20, COLORS.monkey, 8);
  spawnParticles(player.x, player.y - player.height / 2, 10, '#FF4444', 6);
}

// ============================================================
// DRAWING
// ============================================================
function draw() {
  ctx.save();

  // Screen shake
  if (shakeAmount > 0.5) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount
    );
  }

  // --- SKY GRADIENT ---
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON);
  skyGrad.addColorStop(0, '#1a1a3e');
  skyGrad.addColorStop(0.5, '#2E86AB');
  skyGrad.addColorStop(1, '#87CEEB');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, HORIZON);

  // --- DISTANT MOUNTAINS ---
  drawMountains();

  // --- GROUND ---
  const groundGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
  groundGrad.addColorStop(0, '#6B8E3C');
  groundGrad.addColorStop(0.3, '#5A7A30');
  groundGrad.addColorStop(1, '#4A6A25');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  // --- ROCK PATH (3 lanes) ---
  drawRockPath();

  // --- BACKGROUND ELEMENTS (trees, bushes) ---
  bgElements.sort((a, b) => a.y - b.y);
  for (const el of bgElements) {
    if (el.type === 'tree') {
      drawTree(el.x, el.y, el.scale);
    } else {
      drawBush(el.x, el.y, el.scale);
    }
  }

  // --- OBSTACLES ---
  // Sort by Y for proper depth
  const sortedObs = [...obstacles].sort((a, b) => a.y - b.y);
  for (const obs of sortedObs) {
    drawObstacle(obs);
  }

  // --- PLUSHIES ---
  for (const p of plushies) {
    if (!p.collected) {
      drawPlushie(p);
    }
  }

  // --- CHASER MONKEY ---
  if (chaser.state !== 'idle') {
    drawChaserMonkey();
  }

  // --- PLAYER ---
  if (player.alive || frameCount % 4 < 2) {
    drawPlayer();
  }

  // --- PARTICLES ---
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- FLOATING TEXTS ---
  for (const ft of floatingTexts) {
    ctx.globalAlpha = ft.life;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // --- FLASH ---
  if (flashAlpha > 0.01) {
    ctx.fillStyle = `rgba(255,0,0,${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // --- HUD ---
  drawHUD();

  ctx.restore();

  // --- OVERLAYS ---
  if (gameState === 'menu') drawMenuScreen();
  if (gameState === 'gameover') drawGameOverScreen();
}

// ============================================================
// DRAW HELPERS
// ============================================================
function drawMountains() {
  // Mountains sit in the sky area above HORIZON
  const mBase = HORIZON;        // bottom of mountains
  const mTop = HORIZON * 0.4;   // how high peaks go

  ctx.fillStyle = '#3a5a3a';
  ctx.beginPath();
  ctx.moveTo(0, mBase);
  ctx.lineTo(W * 0.15, mBase - (mBase - mTop) * 0.45);
  ctx.lineTo(W * 0.30, mBase - (mBase - mTop) * 0.15);
  ctx.lineTo(W * 0.45, mBase - (mBase - mTop) * 0.6);
  ctx.lineTo(W * 0.625, mBase - (mBase - mTop) * 0.25);
  ctx.lineTo(W * 0.775, mBase - (mBase - mTop) * 0.75);
  ctx.lineTo(W * 0.925, mBase - (mBase - mTop) * 0.35);
  ctx.lineTo(W, mBase - (mBase - mTop) * 0.15);
  ctx.lineTo(W, mBase);
  ctx.fill();

  ctx.fillStyle = '#2d4a2d';
  ctx.beginPath();
  ctx.moveTo(0, mBase + 5);
  ctx.lineTo(W * 0.2, mBase - (mBase - mTop) * 0.15);
  ctx.lineTo(W * 0.4, mBase - (mBase - mTop) * 0.05);
  ctx.lineTo(W * 0.55, mBase - (mBase - mTop) * 0.2);
  ctx.lineTo(W * 0.75, mBase - (mBase - mTop) * 0.08);
  ctx.lineTo(W * 0.95, mBase - (mBase - mTop) * 0.18);
  ctx.lineTo(W, mBase);
  ctx.lineTo(W, mBase + 15);
  ctx.lineTo(0, mBase + 15);
  ctx.fill();
}

function drawRockPath() {
  // Main rocky path
  const pathLeft = LANE_CENTER_X - LANE_WIDTH * 1.8;
  const pathRight = LANE_CENTER_X + LANE_WIDTH * 1.8;

  // Path shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(pathLeft - 5, HORIZON, pathRight - pathLeft + 10, H - HORIZON);

  // Main path
  const pathGrad = ctx.createLinearGradient(pathLeft, 0, pathRight, 0);
  pathGrad.addColorStop(0, '#7a6b55');
  pathGrad.addColorStop(0.15, '#8B7355');
  pathGrad.addColorStop(0.5, '#9a8365');
  pathGrad.addColorStop(0.85, '#8B7355');
  pathGrad.addColorStop(1, '#7a6b55');
  ctx.fillStyle = pathGrad;
  ctx.fillRect(pathLeft, HORIZON, pathRight - pathLeft, H - HORIZON);

  // Lane dividers (subtle)
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 15]);
  for (let l = 0; l < 2; l++) {
    const lx = getLaneX(l) + LANE_WIDTH / 2;
    ctx.beginPath();
    ctx.moveTo(lx, HORIZON);
    ctx.lineTo(lx, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Ground texture - small rocks (only on ground area)
  const seed = Math.floor(distance * 5.7) % 100;
  for (let i = 0; i < 15; i++) {
    const rx = pathLeft + 10 + ((seed + i * 37) % 100) / 100 * (pathRight - pathLeft - 20);
    const ry = HORIZON + ((seed + i * 53 + Math.floor(distance * 28.6)) % Math.floor(H - HORIZON));
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(rx, ry, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTree(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Trunk
  ctx.fillStyle = COLORS.tree;
  ctx.fillRect(-6, -40, 12, 40);

  // Leaves
  ctx.fillStyle = COLORS.leaves;
  ctx.beginPath();
  ctx.moveTo(0, -80);
  ctx.lineTo(-25, -40);
  ctx.lineTo(-15, -45);
  ctx.lineTo(-30, -20);
  ctx.lineTo(30, -20);
  ctx.lineTo(15, -45);
  ctx.lineTo(25, -40);
  ctx.closePath();
  ctx.fill();

  // Highlight
  ctx.fillStyle = '#3da83d';
  ctx.beginPath();
  ctx.moveTo(0, -80);
  ctx.lineTo(-15, -50);
  ctx.lineTo(5, -45);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBush(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#2d7a2d';
  ctx.beginPath();
  ctx.arc(0, -10, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-12, -5, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12, -5, 14, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = '#3a9a3a';
  ctx.beginPath();
  ctx.arc(-3, -15, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawObstacle(obs) {
  ctx.save();
  ctx.translate(obs.x, obs.y);

  switch (obs.type) {
    case 'rock':
      // Irregular rock shape
      ctx.fillStyle = COLORS.rock;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-25, -15);
      ctx.lineTo(-18, -35);
      ctx.lineTo(-5, -42);
      ctx.lineTo(10, -40);
      ctx.lineTo(22, -30);
      ctx.lineTo(25, -10);
      ctx.lineTo(18, 0);
      ctx.closePath();
      ctx.fill();

      // Highlight
      ctx.fillStyle = COLORS.rockLight;
      ctx.beginPath();
      ctx.moveTo(-15, -20);
      ctx.lineTo(-5, -38);
      ctx.lineTo(8, -36);
      ctx.lineTo(0, -18);
      ctx.closePath();
      ctx.fill();

      // Shadow
      ctx.fillStyle = COLORS.rockDark;
      ctx.beginPath();
      ctx.moveTo(10, -5);
      ctx.lineTo(22, -28);
      ctx.lineTo(25, -10);
      ctx.lineTo(18, 0);
      ctx.closePath();
      ctx.fill();
      break;

    case 'boulder':
      // Large round boulder
      ctx.fillStyle = COLORS.rock;
      ctx.beginPath();
      ctx.ellipse(0, -25, 32, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = COLORS.rockLight;
      ctx.beginPath();
      ctx.ellipse(-8, -32, 14, 10, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Crack lines
      ctx.strokeStyle = COLORS.rockDark;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-5, -20);
      ctx.lineTo(3, -28);
      ctx.lineTo(10, -22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, -15);
      ctx.lineTo(12, -10);
      ctx.stroke();
      break;

    case 'rock_tall':
      // Tall rock pillar
      ctx.fillStyle = COLORS.rock;
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.lineTo(-18, -30);
      ctx.lineTo(-12, -55);
      ctx.lineTo(-3, -65);
      ctx.lineTo(8, -60);
      ctx.lineTo(15, -40);
      ctx.lineTo(18, -15);
      ctx.lineTo(12, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = COLORS.rockLight;
      ctx.beginPath();
      ctx.moveTo(-12, -30);
      ctx.lineTo(-8, -55);
      ctx.lineTo(2, -58);
      ctx.lineTo(-2, -25);
      ctx.closePath();
      ctx.fill();
      break;

    case 'log':
      // Horizontal log (roll under or jump over)
      ctx.fillStyle = '#5a3a1a';
      ctx.beginPath();
      ctx.ellipse(0, -38, 30, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Log body
      ctx.fillStyle = '#6B4226';
      ctx.fillRect(-30, -38, 60, 10);

      // Wood rings on ends
      ctx.fillStyle = '#8B6242';
      ctx.beginPath();
      ctx.ellipse(-30, -33, 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(30, -33, 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Support sticks
      ctx.fillStyle = '#4a2a0a';
      ctx.fillRect(-25, -28, 4, 28);
      ctx.fillRect(21, -28, 4, 28);
      break;
  }

  // Shadow on ground
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 5, obs.width * 0.4, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlushie(p) {
  ctx.save();
  ctx.translate(p.x, p.y + Math.sin(p.bobPhase) * 4);
  ctx.scale(p.scale, p.scale);

  const base = p.color;

  // --- ORANGE-RED MONKEY PLUSHIE ---

  // Tail (curly, sticking out to the right)
  ctx.strokeStyle = base;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 12);
  ctx.bezierCurveTo(18, 8, 22, 0, 18, -6);
  ctx.bezierCurveTo(15, -10, 20, -14, 22, -10);
  ctx.stroke();

  // Body (oval, chubby plushie)
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(0, 8, 11, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly patch (lighter peach)
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.ellipse(0, 10, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Left leg
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(-6, 20, 5, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Right leg
  ctx.beginPath();
  ctx.ellipse(6, 20, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Left arm
  ctx.beginPath();
  ctx.ellipse(-11, 6, 4, 7, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Right arm
  ctx.beginPath();
  ctx.ellipse(11, 6, 4, 7, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Head (round monkey head)
  ctx.beginPath();
  ctx.arc(0, -6, 10, 0, Math.PI * 2);
  ctx.fill();

  // Ears (big round monkey ears)
  ctx.beginPath();
  ctx.arc(-9, -10, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(9, -10, 5, 0, Math.PI * 2);
  ctx.fill();

  // Inner ears (lighter)
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.arc(-9, -10, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(9, -10, 3, 0, Math.PI * 2);
  ctx.fill();

  // Face area (lighter peach oval)
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.ellipse(0, -3, 7, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (cute round bead eyes)
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-3, -5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3, -5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-2.3, -5.7, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.7, -5.7, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Nose (small heart/round nose)
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.arc(0, -2.5, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, -1.5, 2.5, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Subtle stitch line on belly
  ctx.strokeStyle = 'rgba(180,60,30,0.3)';
  ctx.lineWidth = 0.7;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.lineTo(0, 17);
  ctx.stroke();
  ctx.setLineDash([]);

  // Glow effect
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#F07050';

  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  const bobY = player.isJumping ? 0 : Math.sin(player.runCycle) * 3;

  ctx.translate(0, -player.height + bobY);
  ctx.scale(0.7, 0.7);

  // Invincibility flash
  if (player.isInvincible && frameCount % 6 < 3) {
    ctx.globalAlpha = 0.5;
  }

  // Stumble wobble when hit once
  if (player.hits === 1 && !player.stunned) {
    ctx.rotate(Math.sin(player.runCycle * 2) * 0.08);
  }

  if (player.isRolling) {
    // Rolling animation - compact ball
    ctx.translate(0, 25);
    const rollAngle = player.runCycle * 2;
    ctx.rotate(rollAngle);

    // Body (ball) - gray-tan fur
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    // Face patch visible
    ctx.fillStyle = COLORS.monkeyFace;
    ctx.beginPath();
    ctx.arc(8, -5, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // --- PUNCH THE BABY MONKEY ---

    // Shadow on ground
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, player.height, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs - small baby legs
    const legPhase = player.isJumping ? 0.5 : player.runCycle;
    const leftLegAngle = Math.sin(legPhase) * 0.5;
    const rightLegAngle = Math.sin(legPhase + Math.PI) * 0.5;

    // Left leg
    ctx.save();
    ctx.translate(-7, 50);
    ctx.rotate(leftLegAngle);
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.ellipse(0, 8, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Foot
    ctx.fillStyle = COLORS.monkeyDark;
    ctx.beginPath();
    ctx.ellipse(2, 17, 7, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Right leg
    ctx.save();
    ctx.translate(7, 50);
    ctx.rotate(rightLegAngle);
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.ellipse(0, 8, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.monkeyDark;
    ctx.beginPath();
    ctx.ellipse(-2, 17, 7, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tail - long, curly baby monkey tail
    ctx.strokeStyle = COLORS.monkeyDark;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 42);
    ctx.bezierCurveTo(-25, 38, -32, 20 + Math.sin(player.runCycle * 0.7) * 4, -28, 8);
    ctx.bezierCurveTo(-24, -2, -18, -5, -14, 0);
    ctx.stroke();

    // Body - small round baby body
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.ellipse(0, 36, 15, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly - lighter
    ctx.fillStyle = COLORS.monkeyLight;
    ctx.beginPath();
    ctx.ellipse(0, 38, 10, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms - baby monkey arms
    const armSwing = player.isJumping ? -0.7 : Math.sin(player.runCycle + Math.PI) * 0.5;

    // Left arm
    ctx.save();
    ctx.translate(-13, 28);
    ctx.rotate(armSwing);
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.ellipse(0, 8, 5, 10, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Hand - tiny monkey hand
    ctx.fillStyle = COLORS.monkeyDark;
    ctx.beginPath();
    ctx.arc(-1, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    // Fingers
    ctx.fillStyle = COLORS.monkeyDark;
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.arc(-1 + f * 3, 22, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Right arm
    ctx.save();
    ctx.translate(13, 28);
    ctx.rotate(-armSwing);
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.ellipse(0, 8, 5, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.monkeyDark;
    ctx.beginPath();
    ctx.arc(1, 18, 5, 0, Math.PI * 2);
    ctx.fill();
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.arc(1 + f * 3, 22, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Head - big round baby monkey head (proportionally large)
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.arc(0, 12, 18, 0, Math.PI * 2);
    ctx.fill();

    // Fluffy fur on top of head (spiky tufts)
    ctx.fillStyle = COLORS.monkeyDark;
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-4, -10);
    ctx.lineTo(-1, -6);
    ctx.lineTo(2, -12);
    ctx.lineTo(5, -6);
    ctx.lineTo(7, -9);
    ctx.lineTo(8, -4);
    ctx.closePath();
    ctx.fill();

    // Face area - peach/pink skin
    ctx.fillStyle = COLORS.monkeyFace;
    ctx.beginPath();
    ctx.ellipse(0, 15, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lighter inner face
    ctx.fillStyle = COLORS.monkeyFaceLight;
    ctx.beginPath();
    ctx.ellipse(0, 16, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears - big prominent baby monkey ears
    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.arc(-19, 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.monkeyEar;
    ctx.beginPath();
    ctx.arc(-19, 10, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.monkey;
    ctx.beginPath();
    ctx.arc(19, 10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.monkeyEar;
    ctx.beginPath();
    ctx.arc(19, 10, 5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes - BIG round dark eyes (baby monkey trademark)
    // White base
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-6, 11, 6, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, 11, 6, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris - very large dark
    ctx.fillStyle = '#1a1008';
    ctx.beginPath();
    ctx.arc(-5, 11, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, 11, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Big eye shines (gives that cute baby look)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-3.5, 9.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8.5, 9.5, 2, 0, Math.PI * 2);
    ctx.fill();
    // Second smaller shine
    ctx.beginPath();
    ctx.arc(-6, 13, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, 13, 1, 0, Math.PI * 2);
    ctx.fill();

    // Nose - tiny
    ctx.fillStyle = COLORS.monkeyDark;
    ctx.beginPath();
    ctx.ellipse(0, 17, 2.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nostrils
    ctx.fillStyle = '#5a4a3a';
    ctx.beginPath();
    ctx.arc(-1, 17, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1, 17, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Mouth - small, slightly open (like the photo - worried/cute look)
    ctx.fillStyle = '#8a5a4a';
    ctx.beginPath();
    ctx.ellipse(0, 20, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a3a2a';
    ctx.beginPath();
    ctx.ellipse(0, 20, 2, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle worried eyebrow lines (gives the lonely/scared look)
    ctx.strokeStyle = COLORS.monkeyDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, 4);
    ctx.quadraticCurveTo(-6, 5.5, -2, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 4);
    ctx.quadraticCurveTo(6, 5.5, 2, 5);
    ctx.stroke();
  }

  // Magnet aura
  if (player.magnetActive) {
    ctx.strokeStyle = 'rgba(232,85,48,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, player.isRolling ? 0 : 30, 35 + Math.sin(frameCount * 0.1) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Multiplier aura
  if (player.multiplier > 1) {
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, player.isRolling ? 0 : 30, 40 + Math.sin(frameCount * 0.15) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawChaserMonkey() {
  ctx.save();
  ctx.translate(chaser.x, chaser.y);

  const bounce = Math.sin(chaser.animFrame) * 3;
  const isCatching = chaser.state === 'catching' && chaser.y <= player.y + 30;

  // Warning indicator when chasing (after first hit)
  if (chaser.state === 'chasing') {
    ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.3) * 0.3;
    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!! RUN !!', 0, -80);
    ctx.globalAlpha = 1;
  }

  // Warning on intro
  if (chaser.state === 'intro' && chaser.stateTimer < 2000) {
    ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.3) * 0.3;
    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('!! ANGRY MONKEYS !!', 0, -80);
    ctx.globalAlpha = 1;
  }

  // Draw 3 chaser monkeys in a row (same style as Punch but darker + angry)
  // Scale: chasers are adult monkeys, ~1.8x bigger than baby Punch
  const CHASER_SCALE = 1.26;
  for (let m = -1; m <= 1; m++) {
    ctx.save();

    if (isCatching) {
      const catchAngle = chaser.catchAnimPhase + m * (Math.PI * 2 / 3);
      const catchRadius = 40;
      ctx.translate(
        Math.cos(catchAngle) * catchRadius,
        Math.sin(catchAngle) * catchRadius * 0.5 + bounce
      );
    } else {
      ctx.translate(m * 65, bounce + Math.abs(m) * 14);
    }
    ctx.scale(CHASER_SCALE, CHASER_SCALE);

    const runCycle = chaser.animFrame + m * 1.2;

    // --- ANGRY MONKEY (Punch's style but dark brown + evil) ---

    // Shadow on ground
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail - curly monkey tail
    ctx.strokeStyle = COLORS.enemyMonkeyDark;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 18);
    ctx.bezierCurveTo(-20, 14, -26, 2 + Math.sin(runCycle * 0.7) * 3, -22, -8);
    ctx.bezierCurveTo(-18, -16, -12, -18, -10, -14);
    ctx.stroke();

    // Legs
    const leftLegAngle = Math.sin(runCycle) * 0.5;
    const rightLegAngle = Math.sin(runCycle + Math.PI) * 0.5;

    // Left leg
    ctx.save();
    ctx.translate(-6, 18);
    ctx.rotate(leftLegAngle);
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.ellipse(0, 6, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.enemyMonkeyDark;
    ctx.beginPath();
    ctx.ellipse(2, 13, 6, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Right leg
    ctx.save();
    ctx.translate(6, 18);
    ctx.rotate(rightLegAngle);
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.ellipse(0, 6, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.enemyMonkeyDark;
    ctx.beginPath();
    ctx.ellipse(-2, 13, 6, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body - round baby body
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.ellipse(0, 8, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly - slightly lighter
    ctx.fillStyle = COLORS.enemyMonkeyFace;
    ctx.beginPath();
    ctx.ellipse(0, 10, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    const armSwing = isCatching
      ? Math.sin(chaser.catchAnimPhase * 4 + m * 2) * 0.8
      : Math.sin(runCycle + Math.PI) * 0.5;

    // Left arm
    ctx.save();
    ctx.translate(-11, 0);
    ctx.rotate(armSwing);
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.ellipse(0, 6, 4, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Hand / fist
    ctx.fillStyle = COLORS.enemyMonkeyDark;
    ctx.beginPath();
    ctx.arc(-1, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    if (isCatching) {
      // Clenched fist fingers
      for (let f = -1; f <= 1; f++) {
        ctx.beginPath();
        ctx.arc(-1 + f * 2.5, 17, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Right arm
    ctx.save();
    ctx.translate(11, 0);
    ctx.rotate(-armSwing);
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.ellipse(0, 6, 4, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.enemyMonkeyDark;
    ctx.beginPath();
    ctx.arc(1, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    if (isCatching) {
      for (let f = -1; f <= 1; f++) {
        ctx.beginPath();
        ctx.arc(1 + f * 2.5, 17, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Head - big round head (proportionally large like Punch)
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.arc(0, -14, 15, 0, Math.PI * 2);
    ctx.fill();

    // Fluffy fur tufts on top (spiky, messy - angrier looking)
    ctx.fillStyle = COLORS.enemyMonkeyDark;
    ctx.beginPath();
    ctx.moveTo(-7, -27);
    ctx.lineTo(-5, -34);
    ctx.lineTo(-1, -28);
    ctx.lineTo(3, -36);
    ctx.lineTo(6, -28);
    ctx.lineTo(9, -33);
    ctx.lineTo(10, -26);
    ctx.closePath();
    ctx.fill();

    // Ears - big round monkey ears
    ctx.fillStyle = COLORS.enemyMonkey;
    ctx.beginPath();
    ctx.arc(-16, -16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(16, -16, 7, 0, Math.PI * 2);
    ctx.fill();
    // Inner ears
    ctx.fillStyle = COLORS.enemyMonkeyFace;
    ctx.beginPath();
    ctx.arc(-16, -16, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(16, -16, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Face area - peach/tan skin
    ctx.fillStyle = COLORS.enemyMonkeyFace;
    ctx.beginPath();
    ctx.ellipse(0, -11, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lighter inner face
    ctx.fillStyle = '#C89060';
    ctx.beginPath();
    ctx.ellipse(0, -10, 7.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes - BIG angry red eyes (same size/shape as Punch's but RED)
    // White base
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-5, -15, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5, -15, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iris - angry red
    ctx.fillStyle = '#CC0000';
    ctx.beginPath();
    ctx.arc(-4, -15, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -15, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils - dark
    ctx.fillStyle = '#1a0000';
    ctx.beginPath();
    ctx.arc(-4, -15, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -15, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Tiny eye shines (keeps cute style, but menacing)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-2.8, -16.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7.2, -16.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Angry furrowed eyebrows - thick, V-shaped
    ctx.strokeStyle = COLORS.enemyMonkeyDark;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -22);
    ctx.lineTo(-3, -19);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, -22);
    ctx.lineTo(3, -19);
    ctx.stroke();

    // Nose - small like Punch's
    ctx.fillStyle = COLORS.enemyMonkeyDark;
    ctx.beginPath();
    ctx.ellipse(0, -9, 2, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nostrils (flared - angry)
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath();
    ctx.arc(-1.2, -9, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1.2, -9, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Mouth - open snarling, bared teeth
    ctx.fillStyle = '#3a0a0a';
    ctx.beginPath();
    ctx.ellipse(0, -5, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Teeth - top row
    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(-4, -7, 2, 2.5);
    ctx.fillRect(-1, -7, 2, 2.5);
    ctx.fillRect(2, -7, 2, 2.5);

    // Fangs
    ctx.fillRect(-4.5, -7, 1.5, 3.5);
    ctx.fillRect(3.5, -7, 1.5, 3.5);

    // Tongue hint
    ctx.fillStyle = '#cc4444';
    ctx.beginPath();
    ctx.ellipse(0, -3.5, 2.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Impact stars during catching
  if (isCatching) {
    const starCount = 4;
    for (let s = 0; s < starCount; s++) {
      const starAngle = chaser.catchAnimPhase * 2 + s * (Math.PI * 2 / starCount);
      const starR = 55 + Math.sin(chaser.catchAnimPhase * 5 + s) * 14;
      const sx = Math.cos(starAngle) * starR;
      const sy = Math.sin(starAngle) * starR * 0.6 - 25;

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      const stars = ['POW', 'BAM', 'WHACK', 'OOF'];
      if (Math.sin(chaser.catchAnimPhase * 3 + s) > 0.5) {
        ctx.fillText(stars[s], sx, sy);
      }
    }
  }

  ctx.restore();
}

function drawHUD() {
  // Top bar background
  const hudGrad = ctx.createLinearGradient(0, 0, 0, 60);
  hudGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
  hudGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hudGrad;
  ctx.fillRect(0, 0, W, 60);

  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(score.toLocaleString(), 15, 30);

  // Distance
  ctx.font = '12px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText(Math.floor(distance) + 'm', 15, 48);

  // Plushies collected (with monkey plushie icon)
  ctx.textAlign = 'right';
  ctx.font = 'bold 18px Arial';

  // Mini monkey plushie icon
  ctx.save();
  ctx.translate(W - 55, 25);
  // Head
  ctx.fillStyle = '#E85530';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.arc(-7, -5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, -5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Inner ears
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.arc(-7, -5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, -5, 2, 0, Math.PI * 2);
  ctx.fill();
  // Face
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.ellipse(0, 1, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-2, -1, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(2, -1, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.beginPath();
  ctx.arc(0, 1.5, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.fillText(plushiesCollected, W - 15, 30);

  // Multiplier indicator
  if (player.multiplier > 1) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('x' + player.multiplier + ' MULTIPLIER', W / 2, 25);

    // Timer bar
    const barW = 80;
    const barH = 4;
    const barX = W / 2 - barW / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(barX, 30, barW, barH);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(barX, 30, barW * (player.multiplierTimer / 10000), barH);
  }

  // Magnet indicator
  if (player.magnetActive) {
    ctx.fillStyle = '#E85530';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MAGNET ACTIVE', W / 2, 50);
  }

  // Danger indicator when player has been hit once
  if (player.hits === 1 && player.alive) {
    const dangerPulse = 0.5 + Math.sin(frameCount * 0.2) * 0.3;
    ctx.fillStyle = `rgba(255,0,0,${dangerPulse * 0.15})`;
    ctx.fillRect(0, 0, W, H);

    // "DANGER" text and recovery bar
    ctx.fillStyle = `rgba(255,68,68,${dangerPulse})`;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DANGER - MONKEYS CLOSING IN!', W / 2, H - 30);

    // Recovery timer bar
    if (player.recoveryTimer > 0) {
      const barW = 120;
      const barH = 6;
      const barX = W / 2 - barW / 2;
      const barY = H - 18;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(barX, barY, barW * (1 - player.recoveryTimer / 6000), barH);
    }
  }
}

// ============================================================
// MENU / GAME OVER SCREENS
// ============================================================
function drawMenuScreen() {
  // Animated background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.textAlign = 'center';

  // "PUNCH THE MONKEY" title with shadow
  ctx.fillStyle = '#000';
  ctx.font = 'bold 36px Arial';
  ctx.fillText('PUNCH THE', W / 2 + 2, H * 0.18 + 2);
  ctx.font = 'bold 44px Arial';
  ctx.fillText('MONKEY', W / 2 + 2, H * 0.25 + 2);

  ctx.fillStyle = COLORS.punchRed;
  ctx.font = 'bold 36px Arial';
  ctx.fillText('PUNCH THE', W / 2, H * 0.18);
  ctx.fillStyle = COLORS.monkey;
  ctx.font = 'bold 44px Arial';
  ctx.fillText('MONKEY', W / 2, H * 0.25);

  // Subtitle
  ctx.fillStyle = '#aaa';
  ctx.font = '18px Arial';
  ctx.fillText('ROCK RUNNER', W / 2, H * 0.29);

  // Animated monkey preview - baby Punch holding his teddy
  ctx.save();
  ctx.translate(W / 2, H * 0.40);
  const previewBob = Math.sin(Date.now() * 0.003) * 8;
  ctx.translate(0, previewBob);

  // Baby monkey face - big round head
  ctx.fillStyle = COLORS.monkey;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();

  // Fluffy fur tufts on top
  ctx.fillStyle = COLORS.monkeyDark;
  ctx.beginPath();
  ctx.moveTo(-12, -32);
  ctx.lineTo(-8, -42);
  ctx.lineTo(-2, -34);
  ctx.lineTo(4, -44);
  ctx.lineTo(10, -34);
  ctx.lineTo(14, -40);
  ctx.lineTo(16, -30);
  ctx.closePath();
  ctx.fill();

  // Face area - peach/pink
  ctx.fillStyle = COLORS.monkeyFace;
  ctx.beginPath();
  ctx.ellipse(0, 6, 28, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.monkeyFaceLight;
  ctx.beginPath();
  ctx.ellipse(0, 8, 20, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = COLORS.monkey;
  ctx.beginPath();
  ctx.arc(-38, -2, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(38, -2, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.monkeyEar;
  ctx.beginPath();
  ctx.arc(-38, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(38, -2, 9, 0, Math.PI * 2);
  ctx.fill();

  // Big dark eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-12, -4, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12, -4, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1008';
  ctx.beginPath();
  ctx.arc(-10, -3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(14, -3, 8, 0, Math.PI * 2);
  ctx.fill();

  // Big eye shines
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-7, -7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(17, -7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-12, 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12, 1, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = COLORS.monkeyDark;
  ctx.beginPath();
  ctx.ellipse(0, 8, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth - little open worried mouth
  ctx.fillStyle = '#8a5a4a';
  ctx.beginPath();
  ctx.ellipse(0, 14, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a3a2a';
  ctx.beginPath();
  ctx.ellipse(0, 14, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Monkey plushie held against body (below the face)
  const teddyX = 0;
  const teddyY = 45;

  // Monkey arms wrapping around plushie
  ctx.fillStyle = COLORS.monkey;
  ctx.beginPath();
  ctx.ellipse(-20, 35, 8, 16, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(20, 35, 8, 16, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Plushie body (orange-red monkey)
  ctx.fillStyle = '#E85530';
  ctx.beginPath();
  ctx.ellipse(teddyX, teddyY, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Plushie belly
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.ellipse(teddyX, teddyY + 2, 10, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Plushie head
  ctx.fillStyle = '#E85530';
  ctx.beginPath();
  ctx.arc(teddyX, teddyY - 18, 12, 0, Math.PI * 2);
  ctx.fill();

  // Plushie ears (big round monkey ears)
  ctx.beginPath();
  ctx.arc(teddyX - 11, teddyY - 24, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(teddyX + 11, teddyY - 24, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.arc(teddyX - 11, teddyY - 24, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(teddyX + 11, teddyY - 24, 3, 0, Math.PI * 2);
  ctx.fill();

  // Plushie face
  ctx.fillStyle = '#F5A070';
  ctx.beginPath();
  ctx.ellipse(teddyX, teddyY - 15, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Plushie eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(teddyX - 4, teddyY - 20, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(teddyX + 4, teddyY - 20, 2, 0, Math.PI * 2);
  ctx.fill();

  // Plushie nose
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.arc(teddyX, teddyY - 15, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Plushie tail
  ctx.strokeStyle = '#E85530';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(teddyX + 14, teddyY);
  ctx.bezierCurveTo(teddyX + 22, teddyY - 5, teddyX + 26, teddyY - 14, teddyX + 22, teddyY - 20);
  ctx.stroke();

  // Monkey hands gripping plushie
  ctx.fillStyle = COLORS.monkeyDark;
  ctx.beginPath();
  ctx.arc(-14, teddyY - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(14, teddyY - 5, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Instructions
  ctx.fillStyle = '#ddd';
  ctx.font = '16px Arial';
  ctx.fillText('Swipe or Arrow Keys to Move', W / 2, H * 0.66);
  ctx.fillText('Up / Swipe Up = Jump', W / 2, H * 0.69);
  ctx.fillText('Down / Swipe Down = Roll', W / 2, H * 0.72);

  // Start button
  const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.05;
  ctx.save();
  ctx.translate(W / 2, H * 0.83);
  ctx.scale(pulse, pulse);

  // Button bg
  ctx.fillStyle = COLORS.punchRed;
  roundRect(ctx, -80, -22, 160, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#CC3333';
  roundRect(ctx, -80, 0, 160, 22, { bl: 22, br: 22, tl: 0, tr: 0 });
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('TAP TO START', 0, 7);
  ctx.restore();

  // High score
  if (highScore > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = '14px Arial';
    ctx.fillText('HIGH SCORE: ' + highScore.toLocaleString(), W / 2, H * 0.92);
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // Game Over text
  ctx.fillStyle = COLORS.punchRed;
  ctx.font = 'bold 40px Arial';
  ctx.fillText('CAUGHT!', W / 2, H * 0.19);
  ctx.fillStyle = '#ccc';
  ctx.font = '16px Arial';
  ctx.fillText('The evil monkeys got Punch...', W / 2, H * 0.22);

  // Knocked out baby monkey
  ctx.save();
  ctx.translate(W / 2, H * 0.29);

  ctx.fillStyle = COLORS.monkey;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.monkeyFace;
  ctx.beginPath();
  ctx.ellipse(0, 4, 22, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // X eyes (knocked out)
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-13, -8);
  ctx.lineTo(-5, 0);
  ctx.moveTo(-5, -8);
  ctx.lineTo(-13, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, -8);
  ctx.lineTo(13, 0);
  ctx.moveTo(13, -8);
  ctx.lineTo(5, 0);
  ctx.stroke();

  // Dizzy spirals
  const spiralPhase = Date.now() * 0.003;
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 1.5;
  for (let s = -1; s <= 1; s += 2) {
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const angle = t * Math.PI * 3 + spiralPhase;
      const r = t * 8;
      const sx = s * 20 + Math.cos(angle) * r;
      const sy = -25 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  ctx.restore();

  // Stats
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(score.toLocaleString(), W / 2, H * 0.42);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('SCORE', W / 2, H * 0.45);

  // Distance
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(Math.floor(distance) + 'm', W / 2, H * 0.50);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('DISTANCE', W / 2, H * 0.52);

  // Plushies
  ctx.fillStyle = '#E85530';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(plushiesCollected, W / 2, H * 0.57);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('PLUSHIES', W / 2, H * 0.59);

  // New high score?
  if (score >= highScore && score > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px Arial';
    const hsFlash = Math.sin(Date.now() * 0.005) > 0;
    if (hsFlash) {
      ctx.fillText('NEW HIGH SCORE!', W / 2, H * 0.65);
    }
  } else {
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.fillText('HIGH SCORE: ' + highScore.toLocaleString(), W / 2, H * 0.65);
  }

  // Retry button
  const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.03;
  ctx.save();
  ctx.translate(W / 2, H * 0.83);
  ctx.scale(pulse, pulse);

  ctx.fillStyle = COLORS.punchRed;
  roundRect(ctx, -80, -22, 160, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#CC3333';
  roundRect(ctx, -80, 0, 160, 22, { bl: 22, br: 22, tl: 0, tr: 0 });
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('TAP TO RETRY', 0, 7);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  if (typeof r === 'number') {
    r = { tl: r, tr: r, br: r, bl: r };
  }
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

// ============================================================
// AUDIO (Web Audio API - procedural)
// ============================================================
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    // Audio not supported
  }
}

function playSound(type) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
      case 'collect':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case 'jump':
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
        break;

      case 'crash':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'lane':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
        break;

      case 'powerup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'stumble':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
    }
  } catch (e) {
    // Ignore audio errors
  }
}

// Hook sounds into actions
const origSwitchLane = switchLane;
const origJump = jump;
const origRoll = roll;
const origGameOver = gameOver;

// We patch the original functions to add sound
// (Already defined above, we'll add audio calls in the update/collect logic instead)

// ============================================================
// SOUND INTEGRATION (patched into game events)
// ============================================================
let lastLane = 1;
let lastPlushieCount = 0;
let wasAlive = true;
let lastHits = 0;

function checkSounds() {
  if (!audioCtx) return;

  // Lane change sound
  if (player.targetLane !== lastLane) {
    playSound('lane');
    lastLane = player.targetLane;
  }

  // Collect sound
  if (plushiesCollected > lastPlushieCount) {
    if (plushiesCollected % 20 === 0 || plushiesCollected % 50 === 0) {
      playSound('powerup');
    } else {
      playSound('collect');
    }
    lastPlushieCount = plushiesCollected;
  }

  // Jump sound
  if (player.isJumping && player.vy === JUMP_FORCE) {
    playSound('jump');
  }

  // Stumble sound (first hit)
  if (player.hits > lastHits && player.hits === 1) {
    playSound('stumble');
  }
  lastHits = player.hits;

  // Crash sound (game over / second hit)
  if (!player.alive && wasAlive) {
    playSound('crash');
    wasAlive = false;
  }

  if (player.alive) wasAlive = true;
}

// ============================================================
// MAIN GAME LOOP
// ============================================================
function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05); // cap dt
  lastTime = timestamp;

  initAudio();
  update(deltaTime);
  checkSounds();
  draw();

  requestAnimationFrame(gameLoop);
}

// Start!
requestAnimationFrame(gameLoop);

// ============================================================
// PUNCH, THE MONKEY
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
// SUPABASE
// ============================================================
const SUPABASE_URL = 'https://oruxxgyqjxcziaqxzrdg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ydXh4Z3lxanhjemlhcXh6cmRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjM3NjIsImV4cCI6MjA4NzQzOTc2Mn0.cGWDNCe5BFJtEjzy1gz4lboUtijurDGm3JiOZBfcCAc';
let supabaseClient = null;
try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  console.warn('Supabase init failed:', e);
}

// ============================================================
// PLATFORM DETECTION
// ============================================================
const detectedPlatform = (function() {
  // Combine multiple signals for reliable detection
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isNarrow = window.innerWidth <= 860;
  // iPad with desktop UA still has touch + narrowish viewport
  return (hasTouch && (isMobileUA || isNarrow)) ? 'mobile' : 'pc';
})();

// ============================================================
// LEADERBOARD STATE
// ============================================================
let leaderboardData = [];      // top 10 scores [{name, score, created_at}]
let leaderboardLoading = false;
let leaderboardLastFetch = 0;
const LEADERBOARD_CACHE_MS = 30000; // refresh every 30s max

// ============================================================
// GLOBAL STATS STATE
// ============================================================
let globalStats = null; // all stats from get_global_stats RPC
let globalStatsLastFetch = 0;
const GLOBAL_STATS_CACHE_MS = 60000; // refresh every 60s

// Roll-up stat display
let statIndex = 0;
let statTimer = 0;
let statTransition = 0; // 0 = showing, >0 = animating out/in
const STAT_DISPLAY_MS = 3500; // show each stat for 3.5s
const STAT_TRANSITION_MS = 400; // roll animation duration

function getStatEntries() {
  if (!globalStats) return [];
  var s = globalStats;
  var entries = [];
  // 1. Total games
  if (s.totalGames > 0) entries.push({ value: s.totalGames.toLocaleString(), label: 'games played worldwide' });
  // 2. Unique players
  if (s.uniquePlayers > 0) entries.push({ value: s.uniquePlayers.toLocaleString(), label: 'monkeys joined the run' });
  // 3. Total distance
  if (s.totalDistance > 0) {
    var km = s.totalDistance / 1000;
    var distStr = km >= 1 ? Math.floor(km).toLocaleString() + 'km' : Math.floor(s.totalDistance).toLocaleString() + 'm';
    entries.push({ value: distStr, label: 'run by all players combined' });
  }
  // 4. Total plushies
  if (s.totalPlushies > 0) entries.push({ value: s.totalPlushies.toLocaleString(), label: 'plushies rescued so far' });
  // 5. All-time highest score
  if (s.topScore > 0) entries.push({ value: s.topScore.toLocaleString(), label: 'all-time highest score' });
  // 6. Average score
  if (s.avgScore > 0) entries.push({ value: Math.round(s.avgScore).toLocaleString(), label: 'average score per game' });
  // 7. Median score
  if (s.medianScore > 0) entries.push({ value: Math.round(s.medianScore).toLocaleString(), label: 'median score — are you above?' });
  // 8. Games played today
  if (s.gamesToday > 0) entries.push({ value: s.gamesToday.toLocaleString(), label: 'games played today' });
  // 9. Longest single run
  if (s.maxDistance > 0) {
    var mkm = s.maxDistance / 1000;
    var mdStr = mkm >= 1 ? mkm.toFixed(1) + 'km' : Math.floor(s.maxDistance).toLocaleString() + 'm';
    entries.push({ value: mdStr, label: 'longest single run' });
  }
  // 10. Most plushies in one game
  if (s.maxPlushies > 0) entries.push({ value: s.maxPlushies.toLocaleString(), label: 'most plushies in one game' });
  // 11. Average distance per game
  if (s.avgDistance > 0) {
    var akm = s.avgDistance / 1000;
    var adStr = akm >= 1 ? akm.toFixed(1) + 'km' : Math.round(s.avgDistance).toLocaleString() + 'm';
    entries.push({ value: adStr, label: 'average distance per run' });
  }
  // 12. Average plushies per game
  if (s.avgPlushies > 0) entries.push({ value: s.avgPlushies.toFixed(1), label: 'plushies rescued per game' });
  // 13. Top scorer name
  if (s.topScorer) entries.push({ value: s.topScorer, label: 'reigning champion' });
  // 14. Newest player
  if (s.newestPlayer) entries.push({ value: s.newestPlayer, label: 'newest monkey on the run' });
  // 15. PC vs Mobile split
  if (s.pcGames > 0 && s.mobileGames > 0) {
    var total = s.pcGames + s.mobileGames;
    var pcPct = Math.round((s.pcGames / total) * 100);
    entries.push({ value: pcPct + '% PC / ' + (100 - pcPct) + '% Mobile', label: 'platform split' });
  }
  return entries;
}

async function fetchGlobalStats() {
  if (!supabaseClient) return;
  if (Date.now() - globalStatsLastFetch < GLOBAL_STATS_CACHE_MS && globalStats) return;
  try {
    const { data, error } = await supabaseClient.rpc('get_global_stats');
    if (!error && data && data.length > 0) {
      var r = data[0];
      globalStats = {
        totalGames: r.total_games || 0,
        uniquePlayers: r.unique_players || 0,
        totalDistance: r.total_distance || 0,
        totalPlushies: r.total_plushies || 0,
        topScore: r.top_score || 0,
        avgScore: r.avg_score || 0,
        medianScore: r.median_score || 0,
        gamesToday: r.games_today || 0,
        maxDistance: r.max_distance || 0,
        maxPlushies: r.max_plushies || 0,
        avgDistance: r.avg_distance || 0,
        avgPlushies: r.avg_plushies || 0,
        topScorer: r.top_scorer || '',
        newestPlayer: r.newest_player || '',
        pcGames: r.pc_games || 0,
        mobileGames: r.mobile_games || 0
      };
      globalStatsLastFetch = Date.now();
      // Also update HTML panels
      if (window.renderGlobalStats) window.renderGlobalStats(globalStats);
    }
  } catch (e) {
    console.warn('Global stats fetch failed:', e);
  }
}

async function fetchLeaderboard() {
  if (!supabaseClient) return;
  if (leaderboardLoading) return;
  if (Date.now() - leaderboardLastFetch < LEADERBOARD_CACHE_MS && leaderboardData.length > 0) return;

  leaderboardLoading = true;
  try {
    const { data, error } = await supabaseClient
      .from('leaderboard')
      .select('name, score, created_at')
      .eq('platform', detectedPlatform)
      .order('score', { ascending: false })
      .limit(10);

    if (!error && data) {
      leaderboardData = data;
      leaderboardLastFetch = Date.now();
    }
  } catch (e) {
    console.warn('Leaderboard fetch failed:', e);
  }
  leaderboardLoading = false;
}

async function submitScore(name, scoreVal, distVal, plushiesVal) {
  if (!supabaseClient) return;
  try {
    await supabaseClient
      .from('leaderboard')
      .insert([{ name: name.substring(0, 20), score: scoreVal, distance: distVal, plushies: plushiesVal, platform: detectedPlatform }]);
    // Force refresh leaderboard after submit
    leaderboardLastFetch = 0;
    fetchLeaderboard();
  } catch (e) {
    console.warn('Score submit failed:', e);
  }
}

// ============================================================
// PLAYER NAME
// ============================================================
let playerName = localStorage.getItem('punchPlayerName') || '';
let nameInputActive = false;
let nameInputCursor = 0;
let nameInputBlink = 0;

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
const MAX_GAME_SPEED = 10.5;
const SPEED_INCREMENT = 0.02;

// Colors
const COLORS = {
  sky: ['#43B8E8', '#2E9AD6', '#1A6FB5'],
  ground: '#D4883A',
  groundDark: '#A8652A',
  rock: '#5C6B7A',
  rockLight: '#7A8B9A',
  rockDark: '#3D4D5C',
  jungle: '#1B7A2C',
  jungleDark: '#0F5518',
  tree: '#4A3020',
  leaves: '#3CC74E',
  // Plushie = orange-red monkey plushie
  plushie: '#FF6B35',
  plushieLight: '#FF8A5C',
  plushieDark: '#CC4A15',
  plushieBelly: '#FFB888',
  plushieNose: '#3a2a1a',
  // Punch = baby monkey: warm golden-tan fur, bright pink face
  monkey: '#C4A87A',
  monkeyLight: '#D8C4A0',
  monkeyDark: '#8A7A5E',
  monkeyFace: '#FFD8B8',
  monkeyFaceLight: '#FFE8D0',
  monkeyEar: '#E8B890',
  punchRed: '#FF3B3B',
  // Enemy monkeys: darker, angrier red-brown
  enemyMonkey: '#8B3A1A',
  enemyMonkeyDark: '#4D1E0A',
  enemyMonkeyFace: '#D08050',
};

// ============================================================
// GAME STATE
// ============================================================
let gameState = playerName ? 'menu' : 'name'; // name, menu, playing, gameover
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
// MOBILE RESTART BUTTON VISIBILITY
// ============================================================
function updateRestartButton() {
  const btn = document.getElementById('mobileRestart');
  if (!btn) return;
  btn.style.display = (gameState === 'playing' || gameState === 'gameover' || gameState === 'share') ? 'flex' : 'none';
}

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
  // --- NAME INPUT SCREEN ---
  if (gameState === 'name') {
    // If hidden input exists, let it handle all text input to avoid double-registration
    if (mobileNameInput && document.activeElement === mobileNameInput) {
      // Only handle Enter here (Enter is also handled on the mobileNameInput keydown)
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (playerName.length >= 1) {
          localStorage.setItem('punchPlayerName', playerName);
          gameState = 'menu';
          mobileNameInput.blur();
          fetchLeaderboard();
        }
      }
      return;
    }
    // Fallback: direct keyboard handling when hidden input is not focused
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (playerName.length >= 1) {
        localStorage.setItem('punchPlayerName', playerName);
        gameState = 'menu';
        if (mobileNameInput) mobileNameInput.blur();
        fetchLeaderboard();
      }
      return;
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      playerName = playerName.slice(0, -1);
      if (mobileNameInput) mobileNameInput.value = playerName;
      return;
    }
    // Allow typed characters (letters, numbers, some symbols)
    if (e.key.length === 1 && playerName.length < 15) {
      const c = e.key;
      if (/^[a-zA-Z0-9 _\-.]$/.test(c)) {
        playerName += c;
        if (mobileNameInput) mobileNameInput.value = playerName;
      }
      return;
    }
    return;
  }

  if (gameState === 'menu') {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') startGame();
    return;
  }
  if (gameState === 'gameover') {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') startGame();
    if (e.code === 'KeyS') { gameState = 'share'; shareButtonFlash = 0; }
    return;
  }
  if (gameState === 'share') {
    if (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') startGame();
    if (e.code === 'Escape') gameState = 'gameover';
    if (e.code === 'KeyC' || e.code === 'KeyS') triggerShare();
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
    case 'KeyR':
      e.preventDefault();
      startGame();
      break;
  }
});

// Touch / swipe support
// ============================================================
// MOBILE NAME INPUT SUPPORT
// ============================================================
const mobileNameInput = document.getElementById('mobileNameInput');

if (mobileNameInput) {
  mobileNameInput.addEventListener('input', () => {
    if (gameState !== 'name') return;
    // Filter to allowed characters and limit length
    let val = mobileNameInput.value.replace(/[^a-zA-Z0-9 _\-.]/g, '').substring(0, 15);
    mobileNameInput.value = val;
    playerName = val;
  });

  mobileNameInput.addEventListener('keydown', (e) => {
    if (gameState !== 'name') return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (playerName.length >= 1) {
        localStorage.setItem('punchPlayerName', playerName);
        gameState = 'menu';
        mobileNameInput.blur();
        fetchLeaderboard();
      }
    }
  });
}

function focusMobileInput() {
  if (mobileNameInput && gameState === 'name') {
    mobileNameInput.value = playerName;
    mobileNameInput.style.position = 'absolute';
    mobileNameInput.style.top = '50%';
    mobileNameInput.style.left = '50%';
    mobileNameInput.style.opacity = '0';
    mobileNameInput.style.pointerEvents = 'auto';
    mobileNameInput.focus();
  }
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (gameState === 'name') {
    // Check if tapping the "Continue" button area
    if (playerName.length >= 1) {
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const tapY = (touch.clientY - rect.top) * scaleY;
      const tapX = (touch.clientX - rect.left) * scaleX;
      if (tapY > H * 0.62 && tapY < H * 0.66 && tapX > W/2 - 80 && tapX < W/2 + 80) {
        localStorage.setItem('punchPlayerName', playerName);
        gameState = 'menu';
        if (mobileNameInput) mobileNameInput.blur();
        fetchLeaderboard();
        return;
      }
    }
    focusMobileInput();
    return;
  }
  if (gameState === 'menu') {
    startGame();
    return;
  }
  if (gameState === 'gameover') {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const tapX = (touch.clientX - rect.left) * scaleX;
    const tapY = (touch.clientY - rect.top) * scaleY;
    const btnY = H * 0.88;
    // Share button
    if (tapY > btnY - 20 && tapY < btnY + 20 && tapX > W/2 - 120 && tapX < W/2 - 10) {
      // On mobile, trigger native share directly
      triggerShare();
      return;
    }
    // Retry or anywhere else
    startGame();
    return;
  }
  if (gameState === 'share') {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const tapX = (touch.clientX - rect.left) * scaleX;
    const tapY = (touch.clientY - rect.top) * scaleY;
    var lay = getShareCardLayout();
    var cardTop = lay.cardTop;
    var shareBtnY = lay.btnY;
    // Share/Copy button
    if (tapY > shareBtnY - 20 && tapY < shareBtnY + 20 && tapX > W/2 - 130 && tapX < W/2 - 10) {
      triggerShare();
      return;
    }
    // Retry button
    if (tapY > shareBtnY - 20 && tapY < shareBtnY + 20 && tapX > W/2 + 10 && tapX < W/2 + 130) {
      startGame();
      return;
    }
    // Outside card = back to game over
    if (tapY < cardTop || tapY > shareBtnY + 40) {
      gameState = 'gameover';
      return;
    }
    return; // tap on card = do nothing (screenshot area)
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
canvas.addEventListener('click', (e) => {
  if (gameState === 'name') {
    // Check if clicking the "Continue" button area
    if (playerName.length >= 1) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const clickY = (e.clientY - rect.top) * scaleY;
      const clickX = (e.clientX - rect.left) * scaleX;
      // Button is at H * 0.64, size ~160x44, centered
      if (clickY > H * 0.62 && clickY < H * 0.66 && clickX > W/2 - 80 && clickX < W/2 + 80) {
        localStorage.setItem('punchPlayerName', playerName);
        gameState = 'menu';
        if (mobileNameInput) mobileNameInput.blur();
        fetchLeaderboard();
        return;
      }
    }
    focusMobileInput();
    return;
  }
  if (gameState === 'menu') {
    startGame();
    return;
  }
  if (gameState === 'gameover') {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const btnY = H * 0.88;
    // Share button: centered at (W/2 - 65, btnY), size 110x40
    if (clickY > btnY - 20 && clickY < btnY + 20 && clickX > W/2 - 120 && clickX < W/2 - 10) {
      gameState = 'share';
      shareButtonFlash = 0;
      return;
    }
    // Retry button or anywhere else: restart
    startGame();
    return;
  }
  if (gameState === 'share') {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    var lay = getShareCardLayout();
    var cardTop = lay.cardTop;
    var shareBtnY = lay.btnY;
    // Share/Copy button: (W/2 - 130, shareBtnY - 20, 120, 40)
    if (clickY > shareBtnY - 20 && clickY < shareBtnY + 20 && clickX > W/2 - 130 && clickX < W/2 - 10) {
      triggerShare();
      return;
    }
    // Retry button: (W/2 + 10, shareBtnY - 20, 120, 40)
    if (clickY > shareBtnY - 20 && clickY < shareBtnY + 20 && clickX > W/2 + 10 && clickX < W/2 + 130) {
      startGame();
      return;
    }
    // Tap anywhere else on the card area = do nothing (let them screenshot)
    // Tap outside card = go back to game over
    if (clickY < cardTop || clickY > shareBtnY + 40) {
      gameState = 'gameover';
      return;
    }
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
  updateRestartButton();
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
  const doDouble = Math.random() < 0.18 && distance > 50;
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

  // Frame-rate normalization: f = 1.0 at 60fps, 0.5 at 120fps, etc.
  const f = dt * 60;

  frameCount++;
  distance += gameSpeed * 0.0175 * f;
  score += Math.floor(gameSpeed * player.multiplier * f);
  gameSpeed = Math.min(MAX_GAME_SPEED, INITIAL_GAME_SPEED + distance * SPEED_INCREMENT);

  // Player lane movement
  const targetX = getLaneX(player.targetLane);
  const dx = targetX - player.x;
  if (Math.abs(dx) > 1) {
    const step = Math.sign(dx) * Math.min(LANE_SWITCH_SPEED * f, Math.abs(dx));
    player.x += step;
  } else {
    player.x = targetX;
    player.lane = player.targetLane;
  }

  // Player jump physics
  if (player.isJumping) {
    player.vy += GRAVITY * f;
    player.y += player.vy * f;
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
  player.runCycle += gameSpeed * 0.15 * f;

  // Screen shake decay
  shakeAmount *= Math.pow(0.9, f);
  flashAlpha *= Math.pow(0.9, f);

  // --- SPAWN MANAGEMENT ---
  // Early game has much wider gaps; tightens over time
  const spawnGap = Math.max(170, 290 - distance * 1.14);
  spawnTimer += gameSpeed * f;
  if (spawnTimer > spawnGap + Math.random() * 80) {
    spawnTimer = 0;
    spawnObstacle();
  }

  plushieSpawnTimer += gameSpeed * f;
  if (plushieSpawnTimer > 200 + Math.random() * 100) {
    plushieSpawnTimer = 0;
    spawnPlushie();
  }

  // --- CHASER MONKEY STATE MACHINE ---
  chaser.animFrame += 0.2 * f;
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
        chaser.y += 1.5 * f;
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
        chaser.y -= 4 * f; // rush in fast
      } else {
        chaser.y = LANE_Y_BASE + 40; // hold close behind
      }
      break;

    case 'retreating':
      // Player survived long enough after hit - chasers fall back
      chaser.y += 2 * f;
      if (chaser.y > H + 100) {
        chaser.state = 'idle';
        chaser.stateTimer = 0;
      }
      break;

    case 'catching':
      // Final game over - chasers rush in and surround Punch
      if (chaser.y > player.y + 20) {
        chaser.y -= 6 * f; // rush in to catch
      } else {
        chaser.y = player.y + 20;
        chaser.catchAnimPhase += dt * 8;
      }
      break;
  }

  // Follow player's lane loosely
  if (chaser.state !== 'idle') {
    const chaserTargetX = player.x;
    chaser.x += (chaserTargetX - chaser.x) * (1 - Math.pow(0.95, f));
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
    obs.y += gameSpeed * f;

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
      // Magnet pull — if active, override normal scroll for nearby plushies
      if (player.magnetActive && !p.collected) {
        const pullDx = player.x - p.x;
        const pullDy = (player.y - player.height / 2) - p.y;
        const pullDist = Math.sqrt(pullDx * pullDx + pullDy * pullDy);
        if (pullDist < 220) {
          // Stronger pull the closer the plushie gets (guarantees collection)
          const strength = 0.12 + (1 - pullDist / 220) * 0.25;
          p.x += pullDx * strength * f;
          p.y += pullDy * strength * f;
        } else {
          p.y += gameSpeed * f;
        }
      } else {
        p.y += gameSpeed * f;
      }
    }
    p.bobPhase += 0.05 * f;

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
    p.x += p.vx * f;
    p.y += p.vy * f;
    p.vy += 0.1 * f;
    p.life -= p.decay * f;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  // --- UPDATE FLOATING TEXTS ---
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy * f;
    ft.life -= 0.02 * f;
    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  // --- UPDATE BACKGROUND ---
  // Trees/bushes are roadside scenery - scroll at same speed as the ground
  for (let i = bgElements.length - 1; i >= 0; i--) {
    bgElements[i].y += gameSpeed * f;
    if (bgElements[i].y > H + 100) {
      bgElements[i] = createBgElement();
    }
  }

  // Ground stripes
  for (let i = 0; i < groundStripes.length; i++) {
    groundStripes[i].z += gameSpeed * f;
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
    player.stunnedTimer = 2000;      // brief invincibility after stumble
    player.isInvincible = true;
    player.invincibleTimer = 2000;
    player.preHitSpeed = gameSpeed;
    player.recoveryTimer = 8000;     // 8 seconds to recover

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
  updateRestartButton();
  shakeAmount = 15;
  flashAlpha = 0.5;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('punchMonkeyHighScore', highScore.toString());
    window.dispatchEvent(new Event('highScoreUpdated'));
  }

  // Submit score to leaderboard
  if (playerName && score > 0) {
    submitScore(playerName, score, Math.round(distance * 10) / 10, plushiesCollected);
    // Signal panel leaderboard to refresh
    setTimeout(function() { window.dispatchEvent(new Event('leaderboardUpdated')); }, 1500);
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
  // Jump shadow (ground indicator)
  if (player.isJumping) {
    const maxJumpHeight = 120; // approximate max jump arc
    const airHeight = LANE_Y_BASE - player.y; // 0 at ground, ~120 at peak
    const t = Math.min(airHeight / maxJumpHeight, 1); // 0..1 normalized
    const shadowW = 30 * (1 - t * 0.6);  // shrinks to 40% at peak
    const shadowH = 6 * (1 - t * 0.5);
    const shadowAlpha = 0.35 * (1 - t * 0.7); // fades at peak
    ctx.save();
    ctx.globalAlpha = shadowAlpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(player.x, LANE_Y_BASE + 4, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
  if (gameState === 'name') drawNameScreen();
  if (gameState === 'menu') drawMenuScreen();
  if (gameState === 'gameover') drawGameOverScreen();
  if (gameState === 'share') drawShareScreen();
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
    // --- PUNCH, THE BABY MONKEY ---

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
      ctx.fillRect(barX, barY, barW * (1 - player.recoveryTimer / 8000), barH);
    }
  }
}

// ============================================================
// NAME INPUT SCREEN
// ============================================================
function drawNameScreen() {
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // Title
  ctx.fillStyle = COLORS.punchRed;
  ctx.font = 'bold 44px Arial';
  ctx.fillText('PUNCH,', W / 2, H * 0.15);
  ctx.fillStyle = COLORS.monkey;
  ctx.font = 'bold 40px Arial';
  ctx.fillText('THE MONKEY', W / 2, H * 0.22);

  // Prompt
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('ENTER YOUR NAME', W / 2, H * 0.38);

  ctx.fillStyle = '#888';
  ctx.font = '14px Arial';
  ctx.fillText('This will appear on the world leaderboard', W / 2, H * 0.42);

  // Input box
  const boxW = 280;
  const boxH = 50;
  const boxX = W / 2 - boxW / 2;
  const boxY = H * 0.46;

  // Box background
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 12);
  ctx.fill();
  roundRect(ctx, boxX, boxY, boxW, boxH, 12);
  ctx.stroke();

  // Name text
  ctx.fillStyle = playerName.length > 0 ? '#fff' : '#555';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  const displayText = playerName.length > 0 ? playerName : 'type here...';
  ctx.fillText(displayText, W / 2, boxY + 33);

  // Blinking cursor
  nameInputBlink += 0.05;
  if (Math.sin(nameInputBlink) > 0 && playerName.length < 15) {
    const textWidth = ctx.measureText(playerName).width;
    const cursorX = W / 2 + textWidth / 2 + 2;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cursorX, boxY + 12, 2, 26);
  }

  // Character count
  ctx.fillStyle = '#555';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(playerName.length + '/15', boxX + boxW - 8, boxY + boxH + 18);

  // Continue button
  ctx.textAlign = 'center';
  if (playerName.length >= 1) {
    const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.03;
    ctx.save();
    ctx.translate(W / 2, H * 0.64);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = COLORS.punchRed;
    roundRect(ctx, -80, -22, 160, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#CC3333';
    roundRect(ctx, -80, 0, 160, 22, { bl: 22, br: 22, tl: 0, tr: 0 });
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('CONTINUE', 0, 7);
    ctx.restore();

    ctx.fillStyle = '#555';
    ctx.font = '13px Arial';
    ctx.fillText('Press Enter', W / 2, H * 0.69);
  } else {
    ctx.fillStyle = '#444';
    ctx.font = '14px Arial';
    ctx.fillText('Type your name to continue', W / 2, H * 0.64);
  }

  // Small monkey preview at bottom
  ctx.save();
  ctx.translate(W / 2, H * 0.82);
  const bob = Math.sin(Date.now() * 0.003) * 5;
  ctx.translate(0, bob);
  ctx.scale(0.6, 0.6);

  // Simple Punch face
  ctx.fillStyle = COLORS.monkey;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.monkeyFace;
  ctx.beginPath();
  ctx.ellipse(0, 4, 20, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-8, -2, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8, -2, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1008';
  ctx.beginPath();
  ctx.arc(-6, -1, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -1, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-4, -3, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12, -3, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ============================================================
// LEADERBOARD DRAWING HELPER
// ============================================================
function drawLeaderboard(startY, compact) {
  const lbX = W / 2;
  const rowH = compact ? 22 : 26;
  const titleSize = compact ? 14 : 16;
  const rowSize = compact ? 13 : 15;

  // Title
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold ' + titleSize + 'px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(detectedPlatform === 'mobile' ? 'MOBILE LEADERBOARD' : 'PC LEADERBOARD', lbX, startY);

  let y = startY + rowH + 4;

  if (leaderboardData.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = rowSize + 'px Arial';
    ctx.fillText(leaderboardLoading ? 'Loading...' : 'No scores yet', lbX, y);
    return y + rowH;
  }

  // Column headers
  ctx.fillStyle = '#666';
  ctx.font = 'bold ' + (rowSize - 1) + 'px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('#', lbX - 120, y);
  ctx.fillText('PLAYER', lbX - 100, y);
  ctx.textAlign = 'center';
  ctx.fillText('DATE', lbX + 30, y);
  ctx.textAlign = 'right';
  ctx.fillText('SCORE', lbX + 130, y);
  y += rowH;

  var shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  for (let i = 0; i < leaderboardData.length && i < 10; i++) {
    const entry = leaderboardData[i];
    const isMe = entry.name === playerName;

    // Highlight current player's entries
    if (isMe) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
      roundRect(ctx, lbX - 130, y - rowH + 6, 260, rowH, 4);
      ctx.fill();
    }

    // Rank
    ctx.textAlign = 'left';
    if (i === 0) ctx.fillStyle = '#fbbf24';      // gold
    else if (i === 1) ctx.fillStyle = '#c0c0c0';  // silver
    else if (i === 2) ctx.fillStyle = '#cd7f32';   // bronze
    else ctx.fillStyle = isMe ? '#fbbf24' : '#888';

    ctx.font = 'bold ' + rowSize + 'px Arial';
    ctx.fillText((i + 1) + '.', lbX - 120, y);

    // Name
    ctx.fillStyle = isMe ? '#fbbf24' : '#ccc';
    ctx.font = (isMe ? 'bold ' : '') + rowSize + 'px Arial';
    const name = entry.name.length > 10 ? entry.name.substring(0, 10) + '..' : entry.name;
    ctx.fillText(name, lbX - 100, y);

    // Date
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? 'rgba(251, 191, 36, 0.6)' : '#666';
    ctx.font = (compact ? 10 : 11) + 'px Arial';
    if (entry.created_at) {
      var d = new Date(entry.created_at);
      ctx.fillText(shortMonths[d.getMonth()] + ' ' + d.getDate(), lbX + 30, y);
    }

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = isMe ? '#fbbf24' : '#aaa';
    ctx.font = 'bold ' + rowSize + 'px Arial';
    ctx.fillText(entry.score.toLocaleString(), lbX + 130, y);

    y += rowH;
  }

  return y;
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

  // "PUNCH, THE MONKEY" title with shadow
  ctx.fillStyle = '#000';
  ctx.font = 'bold 44px Arial';
  ctx.fillText('PUNCH,', W / 2 + 2, H * 0.10 + 2);
  ctx.font = 'bold 40px Arial';
  ctx.fillText('THE MONKEY', W / 2 + 2, H * 0.16 + 2);

  ctx.fillStyle = COLORS.punchRed;
  ctx.font = 'bold 44px Arial';
  ctx.fillText('PUNCH,', W / 2, H * 0.10);
  ctx.fillStyle = COLORS.monkey;
  ctx.font = 'bold 40px Arial';
  ctx.fillText('THE MONKEY', W / 2, H * 0.16);

  // Player name
  ctx.fillStyle = '#888';
  ctx.font = '13px Arial';
  ctx.fillText('Playing as', W / 2, H * 0.235);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(playerName, W / 2, H * 0.26);

  // Animated monkey preview - smaller to fit leaderboard
  ctx.save();
  ctx.translate(W / 2, H * 0.33);
  const previewBob = Math.sin(Date.now() * 0.003) * 5;
  ctx.translate(0, previewBob);
  ctx.scale(0.5, 0.5);

  // Baby monkey face
  ctx.fillStyle = COLORS.monkey;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.monkeyFace;
  ctx.beginPath();
  ctx.ellipse(0, 6, 28, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.monkeyFaceLight;
  ctx.beginPath();
  ctx.ellipse(0, 8, 20, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
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
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-7, -7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(17, -7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Nose + mouth
  ctx.fillStyle = COLORS.monkeyDark;
  ctx.beginPath();
  ctx.ellipse(0, 8, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a5a4a';
  ctx.beginPath();
  ctx.ellipse(0, 14, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Leaderboard
  drawLeaderboard(H * 0.42, false);

  // Start button
  const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.05;
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
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAP TO START', 0, 0);
  ctx.restore();

  // "or press R" hint for desktop
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('or press R to restart', W / 2, H * 0.83 + 36);

  // Community stats roll-up display
  var entries = getStatEntries();
  if (entries.length > 0) {
    var now = Date.now();
    if (statTimer === 0) statTimer = now;
    var elapsed = now - statTimer;

    // Determine phase: showing or transitioning
    var totalCycle = STAT_DISPLAY_MS + STAT_TRANSITION_MS;
    var cyclePos = elapsed % totalCycle;
    var isTransitioning = cyclePos > STAT_DISPLAY_MS;
    var t = isTransitioning ? (cyclePos - STAT_DISPLAY_MS) / STAT_TRANSITION_MS : 0; // 0..1

    // Advance to next stat when transition completes
    var currentIdx = Math.floor(elapsed / totalCycle) % entries.length;
    var nextIdx = (currentIdx + 1) % entries.length;

    var current = entries[currentIdx];
    var next = entries[nextIdx];

    var baseY = H * 0.935;
    var rollDist = 30; // pixels to roll

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, baseY - 28, W, 48);
    ctx.clip();

    ctx.textAlign = 'center';

    if (isTransitioning) {
      // Ease out cubic
      var ease = 1 - Math.pow(1 - t, 3);
      var outY = baseY - ease * rollDist;
      var inY = baseY + rollDist - ease * rollDist;
      var outAlpha = 1 - ease;
      var inAlpha = ease;

      // Current stat rolling out (up)
      ctx.globalAlpha = outAlpha * 0.9;
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(current.value, W / 2, outY);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '11px Arial';
      ctx.fillText(current.label, W / 2, outY + 16);

      // Next stat rolling in (from below)
      ctx.globalAlpha = inAlpha * 0.9;
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(next.value, W / 2, inY);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '11px Arial';
      ctx.fillText(next.label, W / 2, inY + 16);
    } else {
      // Static display
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(current.value, W / 2, baseY);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '11px Arial';
      ctx.fillText(current.label, W / 2, baseY + 16);
    }

    ctx.restore();
  }

}

// ============================================================
// SHARE / RESULT CARD SYSTEM
// ============================================================
function getShareCardLayout() {
  var cardTop = H * 0.06;
  // Must match the spacing in drawShareScreen()
  var contentH = 40 + 20 + 26 + 26 + 68 + 56 + 40 + 20 + 22 + 20 + 18;
  var cardH = contentH + 24;
  var btnY = cardTop + cardH + 30;
  return { cardTop: cardTop, cardH: cardH, btnY: btnY };
}

function getPlayerTitle(s, d, p) {
  // Tiered titles based on score, distance, and plushies
  if (s >= 200000) return 'Jungle Legend';
  if (s >= 100000) return 'Plushie Overlord';
  if (p >= 80) return 'Plushie Hoarder';
  if (s >= 50000) return 'Monkey King';
  if (d >= 500) return 'Marathon Monkey';
  if (s >= 25000) return 'Troop Dodger';
  if (p >= 30) return 'Plushie Collector';
  if (s >= 10000) return 'Rock Hopper';
  if (d >= 200) return 'Trail Blazer';
  if (s >= 5000) return 'Brave Little Monkey';
  if (p >= 10) return 'Plushie Finder';
  if (s >= 1000) return 'First Steps';
  return 'Baby Monkey';
}

function buildShareText() {
  var title = getPlayerTitle(score, distance, plushiesCollected);
  return 'Punch, the Monkey\n\n'
    + title + '\n'
    + 'Score: ' + score.toLocaleString() + '\n'
    + 'Distance: ' + Math.floor(distance) + 'm\n'
    + 'Plushies: ' + plushiesCollected + '\n\n'
    + 'Can you beat me?\n'
    + 'punchthegame.com\n\n'
    + '#HangInTherePunch #がんばれパンチ';
}

let shareButtonFlash = 0; // for copy feedback animation

async function triggerShare() {
  var text = buildShareText();
  // Try native share on mobile
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Punch, the Monkey', text: text, url: 'https://punchthegame.com' });
      return;
    } catch(e) { /* user cancelled or not supported */ }
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    shareButtonFlash = 1; // trigger "Copied!" feedback
  } catch(e) {
    // Last resort fallback
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    shareButtonFlash = 1;
  }
}

function drawShareScreen() {
  // Full dark overlay
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  var title = getPlayerTitle(score, distance, plushiesCollected);
  var lay = getShareCardLayout();
  var cardX = W / 2;
  var cardW = 400;
  var cardTop = lay.cardTop;
  var cardH = lay.cardH;
  var cardLeft = cardX - cardW / 2;

  // Card background with subtle gradient
  var grad = ctx.createLinearGradient(cardLeft, cardTop, cardLeft, cardTop + cardH);
  grad.addColorStop(0, '#2a2a4a');
  grad.addColorStop(1, '#1a1a30');
  ctx.fillStyle = grad;
  roundRect(ctx, cardLeft, cardTop, cardW, cardH, 20);
  ctx.fill();

  // Card border glow
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
  ctx.lineWidth = 2;
  roundRect(ctx, cardLeft, cardTop, cardW, cardH, 20);
  ctx.stroke();

  // --- Draw content ---
  ctx.textAlign = 'center';
  ty = cardTop + 40;
  ctx.fillStyle = COLORS.punchRed;
  ctx.font = 'bold 22px Arial';
  ctx.fillText('PUNCH, THE MONKEY', cardX, ty);

  // Divider
  ty += 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardLeft + 40, ty);
  ctx.lineTo(cardLeft + cardW - 40, ty);
  ctx.stroke();

  // Player name
  ty += 26;
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '15px Arial';
  ctx.fillText(playerName, cardX, ty);

  // Title badge — use middle baseline for proper centering
  ty += 26;
  ctx.font = 'bold 14px Arial';
  var titleW = ctx.measureText(title.toUpperCase()).width + 30;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
  roundRect(ctx, cardX - titleW / 2, ty - 14, titleW, 28, 14);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(title.toUpperCase(), cardX, ty);
  ctx.textBaseline = 'alphabetic';

  // Score (big)
  ty += 68;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Arial';
  ctx.fillText(score.toLocaleString(), cardX, ty);
  ctx.fillStyle = '#888';
  ctx.font = '13px Arial';
  ctx.fillText('SCORE', cardX, ty + 24);

  // Stats row
  ty += 56;
  // Distance
  ctx.fillStyle = '#d4d4d8';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(Math.floor(distance) + 'm', cardX - 90, ty);
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial';
  ctx.fillText('DISTANCE', cardX - 90, ty + 18);

  // Plushies
  ctx.fillStyle = '#E85530';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(plushiesCollected.toString(), cardX + 90, ty);
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial';
  ctx.fillText('PLUSHIES', cardX + 90, ty + 18);

  // Platform badge
  ty += 40;
  var platLabel = detectedPlatform === 'mobile' ? 'MOBILE' : 'PC';
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, cardX - 30, ty - 10, 60, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#666';
  ctx.font = '10px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText(platLabel, cardX, ty);
  ctx.textBaseline = 'alphabetic';

  // Divider
  ty += 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(cardLeft + 40, ty);
  ctx.lineTo(cardLeft + cardW - 40, ty);
  ctx.stroke();

  // Charity line
  ty += 22;
  ctx.fillStyle = '#888';
  ctx.font = '12px Arial';
  ctx.fillText('75% of donations go to World Animal Protection', cardX, ty);

  // URL
  ty += 20;
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('punchthegame.com', cardX, ty);

  // Hashtag
  ty += 18;
  ctx.fillStyle = '#666';
  ctx.font = '12px Arial';
  ctx.fillText('#HangInTherePunch  #がんばれパンチ', cardX, ty);

  // --- Buttons below the card ---
  var btnY = lay.btnY;

  // Share/Copy button
  var shareLabel = shareButtonFlash > 0 ? 'COPIED!' : (navigator.share ? 'SHARE' : 'COPY RESULT');
  ctx.fillStyle = '#fbbf24';
  roundRect(ctx, cardX - 130, btnY - 20, 120, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 15px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText(shareLabel, cardX - 70, btnY);

  // Retry button
  ctx.fillStyle = COLORS.punchRed;
  roundRect(ctx, cardX + 10, btnY - 20, 120, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#CC3333';
  roundRect(ctx, cardX + 10, btnY, 120, 20, { bl: 20, br: 20, tl: 0, tr: 0 });
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px Arial';
  ctx.fillText('RETRY', cardX + 70, btnY);

  ctx.textBaseline = 'alphabetic';

  // "or press R" hint
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '12px Arial';
  ctx.fillText('or press R to restart', cardX, btnY + 34);

  // Decay the flash
  if (shareButtonFlash > 0) {
    shareButtonFlash -= 0.016; // ~1 second at 60fps
    if (shareButtonFlash <= 0) shareButtonFlash = 0;
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // Game Over text
  ctx.fillStyle = COLORS.punchRed;
  ctx.font = 'bold 40px Arial';
  ctx.fillText('CAUGHT!', W / 2, H * 0.08);
  ctx.fillStyle = '#ccc';
  ctx.font = '16px Arial';
  ctx.fillText('The evil monkeys got Punch...', W / 2, H * 0.11);

  // Knocked out baby monkey (smaller)
  ctx.save();
  ctx.translate(W / 2, H * 0.165);
  ctx.scale(0.7, 0.7);

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

  // Stats row - compact horizontal layout
  const statsY = H * 0.24;

  // Score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(score.toLocaleString(), W / 2 - 120, statsY);
  ctx.font = '11px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('SCORE', W / 2 - 120, statsY + 16);

  // Distance
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(Math.floor(distance) + 'm', W / 2, statsY);
  ctx.font = '11px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('DISTANCE', W / 2, statsY + 16);

  // Plushies
  ctx.fillStyle = '#E85530';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(plushiesCollected, W / 2 + 120, statsY);
  ctx.font = '11px Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('PLUSHIES', W / 2 + 120, statsY + 16);


  // Leaderboard
  drawLeaderboard(H * 0.37, true);

  // Buttons row
  const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.03;
  const btnY = H * 0.88;

  // Share button (left)
  ctx.save();
  ctx.translate(W / 2 - 65, btnY);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#fbbf24';
  roundRect(ctx, -55, -20, 110, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHARE', 0, 0);
  ctx.restore();

  // Retry button (right)
  ctx.save();
  ctx.translate(W / 2 + 65, btnY);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = COLORS.punchRed;
  roundRect(ctx, -55, -20, 110, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#CC3333';
  roundRect(ctx, -55, 0, 110, 20, { bl: 20, br: 20, tl: 0, tr: 0 });
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RETRY', 0, 0);
  ctx.restore();

  // "or press R" hint for desktop
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('or press R to restart', W / 2, btnY + 36);
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
fetchLeaderboard();
fetchGlobalStats();
requestAnimationFrame(gameLoop);

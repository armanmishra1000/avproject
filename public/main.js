// public/main.js

const socket = io();

// — Game constants (must match server) —
const MULTIPLIER_SPEED   = 0.0002;           // per ms
const MAX_CRASH_MULT      = 10;              
const PLANE_DURATION      = (MAX_CRASH_MULT - 1) / MULTIPLIER_SPEED; // 45 000 ms
const PAUSE_AFTER_CRASH   = 5000;            // 5 s pause

// — State —
let targetMultiplier = 1;
let crashHappened    = false;
let startTime        = 0;

// Betting state
let betPlaced   = false;
let cashedOut   = false;
let cashOutMult = 1;

// Countdown timer handle
let countdownInterval = null;
let crashTimestamp    = 0;

// — Canvas setup —
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// — UI controls —
const betInput = document.getElementById('betAmount');
const betBtn   = document.getElementById('betButton');
const cashBtn  = document.getElementById('cashOutButton');
const message  = document.getElementById('message');

// — Load plane SVG —
const planeImg = new Image();
planeImg.src   = '/images/plane.svg';

// — Draw loop (multiplier + plane) —
function drawLoop(ts) {
  if (!startTime) startTime = ts;
  const elapsed = ts - startTime;

  // Multiplier
  let mult = 1 + elapsed * MULTIPLIER_SPEED;
  if (mult > targetMultiplier) mult = targetMultiplier;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw multiplier text
  ctx.font      = '30px Arial';
  ctx.fillStyle = '#0f0';
  ctx.fillText(mult.toFixed(2) + '×', 20, 50);

  // Plane on fixed diagonal
  const prog = Math.min(elapsed / PLANE_DURATION, 1);
  const planeW = 40, planeH = 20;
  const x = prog * (canvas.width - planeW);
  const y = (canvas.height - planeH) * (1 - prog);
  if (planeImg.complete) ctx.drawImage(planeImg, x, y, planeW, planeH);

  // Continue or crash text
  if (!crashHappened) {
    requestAnimationFrame(drawLoop);
  } else {
    ctx.fillText('💥 CRASH', 20, 100);
  }
}

// — Socket event handlers —
socket.on('connect', () => console.log('🔗 Connected as', socket.id));

socket.on('round_start', data => {
  // Stop any running countdown
  clearInterval(countdownInterval);

  // Reset state & UI
  targetMultiplier = data.crashMultiplier;
  crashHappened    = false;
  startTime        = 0;
  betPlaced        = false;
  cashedOut        = false;
  cashOutMult      = 1;
  message.textContent = '';

  // Re-enable betting for next round
  betBtn.disabled  = false;
  cashBtn.disabled = true;

  requestAnimationFrame(drawLoop);
});

socket.on('round_crash', () => {
  crashHappened   = true;
  crashTimestamp  = performance.now();

  // Disable both buttons
  betBtn.disabled  = true;
  cashBtn.disabled = true;

  // If user never cashed out, they lost
  if (betPlaced && !cashedOut) {
    message.textContent = '💥 You lost your bet';
  }

  // Start countdown display
  countdownInterval = setInterval(() => {
    const elapsedSinceCrash = performance.now() - crashTimestamp;
    const remaining = (PAUSE_AFTER_CRASH - elapsedSinceCrash) / 1000;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      message.textContent = '';
    } else {
      message.textContent = `⏱️ Next round in ${remaining.toFixed(1)}s`;
    }
  }, 100);
});

// — Betting & Cash-Out handlers —
betBtn.addEventListener('click', () => {
  if (betPlaced) return;
  betPlaced = true;
  betBtn.disabled  = true;
  cashBtn.disabled = false;
  message.textContent = `🕒 Betting $${parseFloat(betInput.value).toFixed(2)}`;
});

cashBtn.addEventListener('click', () => {
  if (!betPlaced || cashedOut || crashHappened) return;
  const now     = performance.now();
  const elapsed = now - startTime;
  cashOutMult   = Math.min(1 + elapsed * MULTIPLIER_SPEED, targetMultiplier);
  cashedOut     = true;
  cashBtn.disabled = true;
  message.textContent = `✅ Cashed out at ${cashOutMult.toFixed(2)}×`;
});

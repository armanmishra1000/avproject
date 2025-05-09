// public/main.js

const socket = io();

// 1×–10× at 0.0002 per ms → full diagonal takes 45 000 ms (45 s)
const MULTIPLIER_SPEED = 0.0002;
const MAX_CRASH_MULT    = 10;
const PLANE_DURATION    = (MAX_CRASH_MULT - 1) / MULTIPLIER_SPEED;

//
// State
//
let targetMultiplier = 1;
let crashHappened    = false;
let startTime        = 0;

// Betting state
let betPlaced  = false;
let cashedOut  = false;
let cashOutMult = 1;

//
// Canvas
//
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

//
// UI Controls
//
const betInput = document.getElementById('betAmount');
const betBtn   = document.getElementById('betButton');
const cashBtn  = document.getElementById('cashOutButton');
const message  = document.getElementById('message');

//
// Load plane SVG
//
const planeImg = new Image();
planeImg.src = '/images/plane.svg';

//
// Draw loop
//
function drawLoop(timestamp) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;

  // Calculate and cap the multiplier
  let mult = 1 + elapsed * MULTIPLIER_SPEED;
  if (mult > targetMultiplier) mult = targetMultiplier;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw multiplier text
  ctx.font      = '30px Arial';
  ctx.fillStyle = '#0f0';
  ctx.fillText(mult.toFixed(2) + '×', 20, 50);

  // Compute plane position on a fixed diagonal path
  const prog = Math.min(elapsed / PLANE_DURATION, 1);
  const planeW = 40, planeH = 20;
  const x = prog * (canvas.width  - planeW);
  const y = (canvas.height - planeH) * (1 - prog);
  if (planeImg.complete) {
    ctx.drawImage(planeImg, x, y, planeW, planeH);
  }

  // Continue or crash
  if (!crashHappened) {
    requestAnimationFrame(drawLoop);
  } else {
    ctx.fillText('💥 CRASH', 20, 100);
  }
}

//
// WebSocket events
//
socket.on('connect', () => console.log('🔗 Connected as', socket.id));

socket.on('round_start', data => {
  // Reset state & UI for new round
  targetMultiplier = data.crashMultiplier;
  crashHappened    = false;
  startTime        = 0;
  betPlaced        = false;
  cashedOut        = false;
  cashOutMult      = 1;
  message.textContent = '';

  betBtn.disabled  = false;
  cashBtn.disabled = true;

  requestAnimationFrame(drawLoop);
});

socket.on('round_crash', () => {
  crashHappened = true;
  // If user never cashed out, they lose
  if (betPlaced && !cashedOut) {
    message.textContent = '💥 You lost your bet';
  }
});

//
// Betting & Cash-Out handlers
//
betBtn.addEventListener('click', () => {
  if (betPlaced) return;
  betPlaced = true;
  betBtn.disabled  = true;
  cashBtn.disabled = false;
  message.textContent = `🕒 Betting $${parseFloat(betInput.value).toFixed(2)}`;
});

cashBtn.addEventListener('click', () => {
  if (!betPlaced || cashedOut || crashHappened) return;
  // Calculate current multiplier at cash-out
  const now     = performance.now();
  const elapsed = now - startTime;
  cashOutMult   = Math.min(1 + elapsed * MULTIPLIER_SPEED, targetMultiplier);
  cashedOut     = true;
  cashBtn.disabled = true;
  message.textContent = `✅ Cashed out at ${cashOutMult.toFixed(2)}×`;
});

const socket = io();

const MULTIPLIER_SPEED = 0.0002;

// State
let targetMultiplier = 1;
let crashTimeLocal = 0;
let crashHappened = false;
let startTime = 0;
let betPlaced = false;
let cashedOut = false;
let cashOutMult = 1;

// Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Controls
const betInput = document.getElementById('betAmount');
const betBtn   = document.getElementById('betButton');
const cashBtn  = document.getElementById('cashOutButton');
const message  = document.getElementById('message');

// Plane image (assumes plane.svg in /images)
const planeImg = new Image();
planeImg.src = '/images/plane.svg';

// Draw Loop
function drawLoop(ts) {
  if (!startTime) startTime = ts;
  const elapsed = ts - startTime;

  // Multiplier calculation
  let mult = 1 + elapsed * MULTIPLIER_SPEED;
  if (mult > targetMultiplier) mult = targetMultiplier;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw multiplier
  ctx.font = '30px Arial';
  ctx.fillStyle = '#0f0';
  ctx.fillText(mult.toFixed(2) + '×', 20, 50);

  // Draw plane
  const progress = Math.min(elapsed / crashTimeLocal, 1);
  const planeW = 40, planeH = 20;
  const x = progress * (canvas.width - planeW);
  const y = canvas.height/2 - planeH/2;
  if (planeImg.complete) {
    ctx.drawImage(planeImg, x, y, planeW, planeH);
  }

  // Continue or crash text
  if (!crashHappened) {
    requestAnimationFrame(drawLoop);
  } else {
    ctx.fillText('💥 CRASH', 20, 100);
  }
}

// Socket events
socket.on('connect', () => console.log('🔗 Connected as', socket.id));

socket.on('round_start', data => {
  // Reset state & UI
  targetMultiplier = data.crashMultiplier;
  crashTimeLocal   = (targetMultiplier - 1) / MULTIPLIER_SPEED;
  crashHappened    = false;
  startTime        = 0;
  betPlaced        = false;
  cashedOut        = false;
  cashOutMult      = 1;
  message.textContent = '';

  // Buttons
  betBtn.disabled  = false;
  cashBtn.disabled = true;

  requestAnimationFrame(drawLoop);
});

socket.on('round_crash', () => {
  crashHappened = true;
  // If user didn’t cash out, they lose
  if (betPlaced && !cashedOut) {
    message.textContent = '💥 You lost your bet';
  }
});

// Bet button handler
betBtn.addEventListener('click', () => {
  betPlaced = true;
  betBtn.disabled  = true;
  cashBtn.disabled = false;
  message.textContent = `🕒 Betting $${parseFloat(betInput.value).toFixed(2)}`;
});

// Cash-out button handler
cashBtn.addEventListener('click', () => {
  if (!betPlaced || cashedOut || crashHappened) return;
  // Determine current multiplier
  const now = performance.now();
  const elapsed = now - startTime;
  cashOutMult = Math.min(1 + elapsed * MULTIPLIER_SPEED, targetMultiplier);
  cashedOut = true;
  cashBtn.disabled = true;
  message.textContent = `✅ Cashed out at ${cashOutMult.toFixed(2)}×`;
});

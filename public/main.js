// public/main.js

const socket = io();

// Constants
const MULTIPLIER_SPEED = 0.0002;
const MAX_CRASH_MULT    = 10;
const PLANE_DURATION    = (MAX_CRASH_MULT - 1) / MULTIPLIER_SPEED;
const PAUSE_AFTER_CRASH = 5000;

// State
let targetMultiplier = 1, crashHappened = false, startTime = 0;
let betPlaced = false, cashedOut = false, cashOutMult = 1;
let countdownInterval = null, crashTimestamp = 0;

// Auto mode state
let autoMode = false, autoBetAmt = 1, autoCashTarget = 2, autoRunning = false;

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const planeImg = new Image();
planeImg.src   = '/images/plane.svg';

// UI Elements
const tabManual    = document.getElementById('tabManual');
const tabAuto      = document.getElementById('tabAuto');
const manualCtrls  = document.getElementById('manualControls');
const autoCtrls    = document.getElementById('autoControls');
const betInput     = document.getElementById('betAmount');
const betBtn       = document.getElementById('betButton');
const cashBtn      = document.getElementById('cashOutButton');
const autoBetInput = document.getElementById('autoBetAmount');
const autoTarget   = document.getElementById('autoCashTarget');
const startAutoBtn = document.getElementById('startAuto');
const stopAutoBtn  = document.getElementById('stopAuto');
const message      = document.getElementById('message');

// --- Tab switching ---
tabManual.onclick = () => {
  tabManual.classList.add('active');
  tabAuto.classList.remove('active');
  manualCtrls.style.display = '';
  autoCtrls.style.display   = 'none';
};
tabAuto.onclick = () => {
  tabAuto.classList.add('active');
  tabManual.classList.remove('active');
  manualCtrls.style.display = 'none';
  autoCtrls.style.display   = '';
};

// --- Draw loop (multiplier + plane) ---
function drawLoop(ts) {
  if (!startTime) startTime = ts;
  const elapsed = ts - startTime;
  let mult = 1 + elapsed * MULTIPLIER_SPEED;
  if (mult > targetMultiplier) mult = targetMultiplier;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '30px Arial';
  ctx.fillStyle = '#0f0';
  ctx.fillText(mult.toFixed(2) + '×', 20, 50);

  const prog = Math.min(elapsed / PLANE_DURATION, 1);
  const planeW = 40, planeH = 20;
  const x = prog * (canvas.width - planeW);
  const y = (canvas.height - planeH)*(1 - prog);
  if (planeImg.complete) ctx.drawImage(planeImg, x, y, planeW, planeH);

  if (!crashHappened) requestAnimationFrame(drawLoop);
  else ctx.fillText('💥 CRASH', 20, 100);
}

// --- Socket events ---
socket.on('connect', () => console.log('🔗 Connected as', socket.id));

socket.on('round_start', data => {
  clearInterval(countdownInterval);
  targetMultiplier = data.crashMultiplier;
  crashHappened    = false;
  startTime        = 0;
  betPlaced = cashedOut = false;
  message.textContent = '';
  betBtn.disabled = false; cashBtn.disabled = true;

  // If auto is running, place bet
  if (autoRunning) {
    betInput.value = autoBetAmt = parseFloat(autoBetInput.value);
    cashOutMult    = parseFloat(autoTarget.value);
    betBtn.click();
  }

  requestAnimationFrame(drawLoop);

  // If auto, schedule cash out
  if (autoRunning) {
    const timeToCash = (cashOutMult - 1) / MULTIPLIER_SPEED;
    setTimeout(() => {
      if (!crashHappened && betPlaced) cashBtn.click();
    }, timeToCash);
  }
});

socket.on('round_crash', () => {
  crashHappened = true;
  crashTimestamp = performance.now();
  betBtn.disabled = true; cashBtn.disabled = true;
  if (betPlaced && !cashedOut) message.textContent = '💥 You lost your bet';

  // Countdown
  countdownInterval = setInterval(() => {
    const rem = (PAUSE_AFTER_CRASH - (performance.now() - crashTimestamp)) / 1000;
    if (rem <= 0) {
      clearInterval(countdownInterval);
      message.textContent = '';
    } else {
      message.textContent = `⏱️ Next round in ${rem.toFixed(1)}s`;
    }
  }, 100);
});

// --- Manual Bet & Cash-Out ---
betBtn.onclick = () => {
  if (betPlaced) return;
  betPlaced = true; betBtn.disabled = true; cashBtn.disabled = false;
  message.textContent = `🕒 Betting $${parseFloat(betInput.value).toFixed(2)}`;
};
cashBtn.onclick = () => {
  if (!betPlaced || cashedOut || crashHappened) return;
  const elapsed = performance.now() - startTime;
  cashOutMult = Math.min(1 + elapsed*MULTIPLIER_SPEED, targetMultiplier);
  cashedOut = true; cashBtn.disabled = true;
  message.textContent = `✅ Cashed out at ${cashOutMult.toFixed(2)}×`;
};

// --- Auto controls ---
startAutoBtn.onclick = () => {
  autoRunning = true;
  startAutoBtn.disabled = true;
  stopAutoBtn.disabled  = false;
  message.textContent    = '🤖 Auto-betting started';
};
stopAutoBtn.onclick = () => {
  autoRunning = false;
  stopAutoBtn.disabled  = true;
  startAutoBtn.disabled = false;
  message.textContent   = '';
};

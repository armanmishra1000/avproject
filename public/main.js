// public/main.js

const socket = io();

// Constants & state
const MULTIPLIER_SPEED = 0.0002;
const MAX_CRASH_MULT   = 10;
const PLANE_DURATION   = (MAX_CRASH_MULT - 1)/MULTIPLIER_SPEED;
const PAUSE_AFTER_CRASH= 5000;

let targetMultiplier=1, crashHappened=false, startTime=0;
let betPlaced=false, cashedOut=false, cashOutMult=1;
let countdownInterval=0, crashTimestamp=0;
let autoRunning=false;

// Elements
const historyEl   = document.getElementById('history');
const canvas      = document.getElementById('gameCanvas');
const ctx         = canvas.getContext('2d');
const planeImg    = new Image(); planeImg.src='/images/plane.svg';
const balanceEl   = document.getElementById('balanceValue');
const tabManual   = document.getElementById('tabManual');
const tabAuto     = document.getElementById('tabAuto');
const manualCtrls = document.getElementById('manualControls');
const autoCtrls   = document.getElementById('autoControls');
const betInput    = document.getElementById('betAmount');
const betBtn      = document.getElementById('betButton');
const cashBtn     = document.getElementById('cashOutButton');
const autoBetIn   = document.getElementById('autoBetAmount');
const autoTarget  = document.getElementById('autoCashTarget');
const startAuto   = document.getElementById('startAuto');
const stopAuto    = document.getElementById('stopAuto');
const message     = document.getElementById('message');

// render crash history
function renderHistory(arr){
  historyEl.innerHTML = arr.map(m=>{
    const cls = m>=2 ? 'win':'loss';
    return `<div class="history-item ${cls}">${m.toFixed(2)}×</div>`;
  }).join('');
}

// fetch balance
async function updateBalance(){
  try {
    const res = await fetch('/api/balance');
    const { balance } = await res.json();
    balanceEl.textContent = balance.toFixed(2);
  } catch(e){ console.error(e); }
}

// tab switching
tabManual.onclick=()=>{
  tabManual.classList.add('active');
  tabAuto.classList.remove('active');
  manualCtrls.style.display=''; autoCtrls.style.display='none';
};
tabAuto.onclick=()=>{
  tabAuto.classList.add('active');
  tabManual.classList.remove('active');
  manualCtrls.style.display='none'; autoCtrls.style.display='';
};

// draw loop
function drawLoop(ts){
  if(!startTime) startTime=ts;
  const elapsed=ts-startTime;
  let mult = 1 + elapsed*MULTIPLIER_SPEED;
  if(mult>targetMultiplier) mult=targetMultiplier;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='30px Arial'; ctx.fillStyle='#0f0';
  ctx.fillText(mult.toFixed(2)+'×',20,50);

  const prog = Math.min(elapsed/PLANE_DURATION,1);
  const w=40,h=20;
  const x = prog*(canvas.width-w);
  const y = (canvas.height-h)*(1-prog);
  if(planeImg.complete) ctx.drawImage(planeImg,x,y,w,h);

  if(!crashHappened) requestAnimationFrame(drawLoop);
  else               ctx.fillText('💥 CRASH',20,100);
}

// socket events
socket.on('connect',()=>{
  console.log('Connected as',socket.id);
  updateBalance();
});
socket.on('round_history', data=>{
  renderHistory(data.history);
});
socket.on('round_start', data=>{
  renderHistory(data.history);
  clearInterval(countdownInterval);
  targetMultiplier=data.crashMultiplier;
  crashHappened=false; startTime=0;
  betPlaced=cashedOut=false; message.textContent='';
  betBtn.disabled=false; cashBtn.disabled=true;

  if(autoRunning){
    betInput.value=autoBetIn.value;
    betBtn.click();
    startAuto.disabled=true; stopAuto.disabled=false;
    const t=(parseFloat(autoTarget.value)-1)/MULTIPLIER_SPEED;
    setTimeout(()=>{ if(!crashHappened&&betPlaced) cashBtn.click(); },t);
  }

  requestAnimationFrame(drawLoop);
  updateBalance();
});
socket.on('round_crash', ()=>{
  crashHappened=true; crashTimestamp=performance.now();
  betBtn.disabled=true; cashBtn.disabled=true;
  if(betPlaced&&!cashedOut){
    message.textContent='💥 You lost your bet';
    updateBalance();
  }
  countdownInterval=setInterval(()=>{
    const rem=(PAUSE_AFTER_CRASH-(performance.now()-crashTimestamp))/1000;
    if(rem<=0){ clearInterval(countdownInterval); message.textContent=''; }
    else       { message.textContent=`⏱️ Next in ${rem.toFixed(1)}s`; }
  },100);
});

// manual bet & cash
betBtn.onclick=()=>{
  if(betPlaced) return;
  betPlaced=true; betBtn.disabled=true; cashBtn.disabled=false;
  message.textContent=`🕒 Betting $${parseFloat(betInput.value).toFixed(2)}`;
  fetch('/api/deposit',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({amount:-parseFloat(betInput.value)})
  }).then(updateBalance);
};
cashBtn.onclick=()=>{
  if(!betPlaced||cashedOut||crashHappened) return;
  const elapsed=performance.now()-startTime;
  cashOutMult=Math.min(1+elapsed*MULTIPLIER_SPEED, targetMultiplier);
  cashedOut=true; cashBtn.disabled=true;
  message.textContent=`✅ Cashed out at ${cashOutMult.toFixed(2)}×`;
  const win= parseFloat(betInput.value)*(cashOutMult-1);
  fetch('/api/deposit',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({amount:win})
  }).then(updateBalance);
};

// auto controls
startAuto.onclick=()=>{
  autoRunning=true;
  startAuto.disabled=true; stopAuto.disabled=false;
  message.textContent='🤖 Auto-betting started';
};
stopAuto.onclick=()=>{
  autoRunning=false;
  stopAuto.disabled=true; startAuto.disabled=false;
  message.textContent='';
};

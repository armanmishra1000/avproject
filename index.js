// index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ——— Game Settings ———
const MULTIPLIER_SPEED = 0.0002;  // growth per ms (~1× every 5s)
const PAUSE_AFTER_CRASH = 5000;   // 5s wait after crash before next round

// ——— Handle WebSocket Connections ———
io.on('connection', socket => {
  console.log('→ New client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('← Client disconnected:', socket.id);
  });
});

// ——— Round Logic ———
function startRound() {
  // Pick a random crash multiplier between 1.00 and 10.00
  const crashMultiplier = parseFloat((Math.random() * 9 + 1).toFixed(2));
  console.log(`🔄 Starting round – crash at ${crashMultiplier}×`);

  // Tell all clients to begin this round
  io.emit('round_start', { crashMultiplier });

  // Calculate when to crash
  const crashTime = (crashMultiplier - 1) / MULTIPLIER_SPEED;

  // Schedule the crash
  setTimeout(() => {
    console.log('💥 Round crashed at', crashMultiplier + '×');
    io.emit('round_crash');

    // After a short pause, start the next round
    setTimeout(startRound, PAUSE_AFTER_CRASH);
  }, crashTime);
}

// Fire the very first round immediately
startRound();

// ——— Start Server ———
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

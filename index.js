// index.js

const express       = require('express');
const http          = require('http');
const path          = require('path');
const session       = require('express-session');
const SQLiteStore   = require('connect-sqlite3')(session);
const { Server }    = require('socket.io');
const db            = require('./data/database');
const { logEvent, httpLogger } = require('./middleware/logger');
const authRouter    = require('./routes/auth');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ——— Body parsing ———
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ——— Session middleware ———
const sessionMiddleware = session({
  store: new SQLiteStore({ dir: path.join(__dirname, 'data'), db: 'sessions.sqlite' }),
  secret: 'your-secure-secret-here', // TODO: move to environment variable
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
});
app.use(sessionMiddleware);

// ——— HTTP request logging ———
app.use(httpLogger);

// ——— Share sessions with Socket.IO ———
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// ——— Serve static files ———
app.use(express.static('public'));

// ——— Mount auth routes (register, login, logout) ———
app.use(authRouter);

// ——— Protect Routes ———
function ensureAuth(req, res, next) {
  if (!req.session.userId) {
    logEvent({ type: 'auth', action: 'blocked', route: req.originalUrl });
    return res.redirect('/login');
  }
  next();
}

// ——— Game & Dashboard pages ———
app.get('/', ensureAuth, (req, res) => {
  logEvent({ type: 'route', route: '/ [GET]', userId: req.session.userId });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', ensureAuth, (req, res) => {
  logEvent({ type: 'route', route: '/dashboard [GET]', userId: req.session.userId });
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ——— Balance APIs ———
app.get('/api/balance', ensureAuth, (req, res) => {
  logEvent({ type: 'api', route: '/api/balance [GET]', userId: req.session.userId });
  db.get('SELECT balance FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err) {
      logEvent({ type: 'error', context: 'api/balance', error: err.message });
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ balance: row.balance });
  });
});
app.post('/api/deposit', ensureAuth, (req, res) => {
  const amt = parseFloat(req.body.amount);
  logEvent({ type: 'api', route: '/api/deposit [POST]', userId: req.session.userId, body: { amount: amt } });
  if (isNaN(amt) || amt === 0) return res.status(400).json({ error: 'Invalid amount' });
  db.run(
    'UPDATE users SET balance = balance + ? WHERE id = ?',
    [amt, req.session.userId],
    err => {
      if (err) {
        logEvent({ type: 'error', context: 'api/deposit', error: err.message });
        return res.status(500).json({ error: 'DB error' });
      }
      res.json({ success: true });
    }
  );
});

// ——— Client-side logging endpoint ———
app.post('/api/log', ensureAuth, (req, res) => {
  logEvent({ type: 'client', userId: req.session.userId, details: req.body });
  res.sendStatus(200);
});

// ——— Game logic & socket events ———
const MULTIPLIER_SPEED  = 0.0002;
const PAUSE_AFTER_CRASH = 5000;

io.on('connection', socket => {
  const userId = socket.request.session.userId;
  if (!userId) return socket.disconnect();
  logEvent({ type: 'socket', event: 'connect', userId, socketId: socket.id });

  socket.on('place_bet', data => {
    logEvent({ type: 'socket', event: 'place_bet', userId, data });
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return socket.emit('bet_response', { success: false, error: 'Invalid bet amount' });
    }
    db.run(
      'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?',
      [amount, userId, amount],
      function(err) {
        if (err || this.changes === 0) {
          socket.emit('bet_response', { success: false, error: 'Insufficient funds' });
        } else {
          socket.emit('bet_response', { success: true });
        }
      }
    );
  });

  socket.on('cash_out', data => {
    logEvent({ type: 'socket', event: 'cash_out', userId, data });
    const multiplier = parseFloat(data.multiplier);
    const betAmount  = parseFloat(data.amount);
    if (isNaN(multiplier) || isNaN(betAmount) || multiplier <= 1) {
      return socket.emit('cash_response', { success: false, error: 'Invalid cash-out data' });
    }
    const winnings = betAmount * (multiplier - 1);
    db.run(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [winnings, userId],
      err => {
        if (err) socket.emit('cash_response', { success: false, error: 'DB error' });
        else     socket.emit('cash_response', { success: true, winnings });
      }
    );
  });

  socket.on('disconnect', () => {
    logEvent({ type: 'socket', event: 'disconnect', userId, socketId: socket.id });
  });
});

// ——— Crash game loop ———
function startRound() {
  const crashMultiplier = parseFloat((Math.random() * 9 + 1).toFixed(2));
  io.emit('round_start', { crashMultiplier });
  logEvent({ type: 'game', event: 'round_start', crashMultiplier });

  const crashTime = (crashMultiplier - 1) / MULTIPLIER_SPEED;
  setTimeout(() => {
    io.emit('round_crash');
    logEvent({ type: 'game', event: 'round_crash', crashMultiplier });
    setTimeout(startRound, PAUSE_AFTER_CRASH);
  }, crashTime);
}
startRound();

// ——— Start server ———
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
  logEvent({ type: 'server', event: 'start', port: PORT });
});

// index.js

const express       = require('express');
const http          = require('http');
const path          = require('path');
const session       = require('express-session');
const SQLiteStore   = require('connect-sqlite3')(session);
const bcrypt        = require('bcrypt');
const { Server }    = require('socket.io');
const db            = require('./data/database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ——— Body parsing ———
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ——— Session middleware ———
const sessionMiddleware = session({
  store: new SQLiteStore({
    dir: path.join(__dirname, 'data'),
    db: 'sessions.sqlite'
  }),
  secret: 'your-secure-secret-here', // TODO: use an env var
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
});
app.use(sessionMiddleware);

// ——— Share sessions with Socket.IO ———
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// ——— Serve static files ———
app.use(express.static('public'));

// ——— Authentication Routes ———

// Registration
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect('/register');
  const hash = await bcrypt.hash(password, 10);
  db.run(
    `INSERT INTO users (username, password, balance) VALUES (?, ?, 0)`,
    [username, hash],
    err => {
      if (err) return res.redirect('/register');
      res.redirect('/login');
    }
  );
});

// Login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    `SELECT id, password FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user) return res.redirect('/login');
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.redirect('/login');
      req.session.userId = user.id;
      res.redirect('/');
    }
  );
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ——— Protect Game & Dashboard Routes ———
function ensureAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
app.get('/', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ——— Balance API ———
app.get('/api/balance', ensureAuth, (req, res) => {
  db.get('SELECT balance FROM users WHERE id = ?', [req.session.userId], (err,row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ balance: row.balance });
  });
});
app.post('/api/deposit', ensureAuth, (req, res) => {
  const amt = parseFloat(req.body.amount);
  if (isNaN(amt) || amt === 0) return res.status(400).json({ error: 'Invalid amount' });
  db.run(
    'UPDATE users SET balance = balance + ? WHERE id = ?',
    [amt, req.session.userId],
    err => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true });
    }
  );
});

// ——— Game Settings & Logic ———
const MULTIPLIER_SPEED = 0.0002;  // per ms
const PAUSE_AFTER_CRASH = 5000;   // ms

io.on('connection', socket => {
  // Identify user from session
  const userId = socket.request.session.userId;
  if (!userId) {
    socket.disconnect();
    return;
  }
  console.log(`→ User ${userId} connected via socket ${socket.id}`);

  // TODO: handle real bets on 'place_bet' and 'cash_out' events here,
  // using `userId` to debit/credit and record each bet in the database.

  socket.on('disconnect', () => {
    console.log(`← User ${userId} disconnected`);
  });
});

// ——— Crash Game Loop ———
function startRound() {
  const crashMultiplier = parseFloat((Math.random() * 9 + 1).toFixed(2));
  io.emit('round_start', { crashMultiplier });
  const crashTime = (crashMultiplier - 1) / MULTIPLIER_SPEED;

  setTimeout(() => {
    io.emit('round_crash');
    setTimeout(startRound, PAUSE_AFTER_CRASH);
  }, crashTime);
}
startRound();

// ——— Start Server ———
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

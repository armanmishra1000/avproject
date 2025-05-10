// index.js

const express       = require('express');
const http          = require('http');
const path          = require('path');
const session       = require('express-session');
const SQLiteStore   = require('connect-sqlite3')(session);
const bcrypt        = require('bcrypt');
const { Server }    = require('socket.io');

// Require the DB from data/database.js
const db            = require('./data/database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ——— Body parsing ———
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ——— Session middleware ———
app.use(session({
  store: new SQLiteStore({
    dir: path.join(__dirname, 'data'),
    db: 'sessions.sqlite'
  }),
  secret: 'your-secure-secret-here', // TODO: move to env var
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// ——— Serve static files ———
app.use(express.static('public'));

// ——— Auth Routes ———

// Dashboard page (protected)
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API: get current balance
app.get('/api/balance', (req, res) => {
  const uid = req.session.userId;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  db.get('SELECT balance FROM users WHERE id = ?', [uid], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ balance: row.balance });
  });
});

// API: deposit funds
app.post('/api/deposit', (req, res) => {
  const uid = req.session.userId;
  const amt = parseFloat(req.body.amount);
  if (!uid || isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid' });
  db.run(
    'UPDATE users SET balance = balance + ? WHERE id = ?',
    [amt, uid],
    err => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true });
    }
  );
});


// Registration form
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Handle registration
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect('/register');

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (username, password, balance)
       VALUES (?, ?, 0)`,
      [username, hash],
      err => {
        if (err) {
          console.error('Registration error:', err);
          return res.redirect('/register');
        }
        res.redirect('/login');
      }
    );
  } catch (e) {
    console.error(e);
    res.redirect('/register');
  }
});

// Login form
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect('/login');

  db.get(
    `SELECT id, password FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user) return res.redirect('/login');
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.redirect('/login');

      // Save user ID in session
      req.session.userId = user.id;
      res.redirect('/');
    }
  );
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ——— Protect game route ———
app.get('/', (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  next();
});

// ——— Game Settings & Logic ———
const MULTIPLIER_SPEED = 0.0002;  // growth per ms (~1× every 5s)
const PAUSE_AFTER_CRASH = 5000;   // 5s wait after crash before next round

// WebSocket connections
io.on('connection', socket => {
  console.log('→ New client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('← Client disconnected:', socket.id);
  });
});

// Round loop
function startRound() {
  const crashMultiplier = parseFloat((Math.random() * 9 + 1).toFixed(2));
  console.log(`🔄 Starting round – crash at ${crashMultiplier}×`);

  io.emit('round_start', { crashMultiplier });

  const crashTime = (crashMultiplier - 1) / MULTIPLIER_SPEED;
  setTimeout(() => {
    console.log('💥 Round crashed at', crashMultiplier + '×');
    io.emit('round_crash');
    setTimeout(startRound, PAUSE_AFTER_CRASH);
  }, crashTime);
}

// Fire the first round immediately
startRound();

// ——— Start server ———
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

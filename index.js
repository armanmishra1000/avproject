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
const apiRouter     = require('./routes/api');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ——— keep last 7 crashes ———
let crashHistory = [];

// ——— Body parsing ———
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ——— Session middleware ———
const sessionMiddleware = session({
  store: new SQLiteStore({ dir: path.join(__dirname, 'data'), db: 'sessions.sqlite' }),
  secret: 'your-secure-secret-here',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);

// ——— HTTP logging ———
app.use(httpLogger);

// ——— Share sessions with Socket.IO ———
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// ——— Static files & routers ———
app.use(express.static('public'));
app.use(authRouter);
app.use(apiRouter);

// ——— Auth guard for pages ———
function ensureAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

app.get('/',       ensureAuth, (req, res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(path.join(__dirname,'public','dashboard.html')));

// ——— Game & Socket.IO ———
const MULTIPLIER_SPEED  = 0.0002;
const PAUSE_AFTER_CRASH = 5000;

io.on('connection', socket => {
  const userId = socket.request.session.userId;
  if (!userId) return socket.disconnect();
  logEvent({ type:'socket', event:'connect', userId, socketId: socket.id });

  // send existing history
  socket.emit('round_history', { history: crashHistory });

  socket.on('place_bet', data => {
    logEvent({ type:'socket', event:'place_bet', userId, data });
    const amt = parseFloat(data.amount);
    if (isNaN(amt) || amt <= 0) {
      return socket.emit('bet_response',{ success:false, error:'Invalid bet' });
    }
    db.run(
      'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?',
      [amt, userId, amt],
      function(err) {
        if (err || this.changes===0) socket.emit('bet_response',{ success:false, error:'Insufficient' });
        else                         socket.emit('bet_response',{ success:true });
      }
    );
  });

  socket.on('cash_out', data => {
    logEvent({ type:'socket', event:'cash_out', userId, data });
    const m = parseFloat(data.multiplier),
          b = parseFloat(data.amount);
    if (isNaN(m)||isNaN(b)||m<=1) {
      return socket.emit('cash_response',{ success:false, error:'Invalid cash-out' });
    }
    const win = b*(m-1);
    db.run('UPDATE users SET balance = balance + ? WHERE id = ?',[win,userId], err => {
      if (err) socket.emit('cash_response',{ success:false, error:'DB' });
      else     socket.emit('cash_response',{ success:true, winnings:win });
    });
  });

  socket.on('disconnect', () => {
    logEvent({ type:'socket', event:'disconnect', userId, socketId: socket.id });
  });
});

// ——— Crash loop ———
function startRound() {
  const crashMultiplier = parseFloat((Math.random()*9+1).toFixed(2));

  // emit start + history
  io.emit('round_start',{ crashMultiplier, history: crashHistory });
  logEvent({ type:'game', event:'round_start', crashMultiplier });

  const crashTime = (crashMultiplier-1)/MULTIPLIER_SPEED;
  setTimeout(()=>{
    io.emit('round_crash');
    logEvent({ type:'game', event:'round_crash', crashMultiplier });

    // update history
    crashHistory.unshift(crashMultiplier);
    if (crashHistory.length>7) crashHistory.pop();

    setTimeout(startRound, PAUSE_AFTER_CRASH);
  }, crashTime);
}

startRound();

// ——— Start server ———
const PORT = process.env.PORT||3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

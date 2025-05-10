// routes/auth.js

const express = require('express');
const path    = require('path');
const bcrypt  = require('bcrypt');
const db      = require('../data/database');
const { logEvent } = require('../middleware/logger');

const router = express.Router();

// Registration page
router.get('/register', (req, res) => {
  logEvent({ type: 'route', route: '/register [GET]', userId: req.session.userId || null });
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

// Handle registration
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  logEvent({ type: 'route', route: '/register [POST]', userId: null, body: { username } });
  if (!username || !password) return res.redirect('/register');
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (username, password, balance) VALUES (?, ?, 0)`,
      [username, hash],
      err => {
        if (err) {
          logEvent({ type: 'error', context: 'register', error: err.message });
          return res.redirect('/register');
        }
        res.redirect('/login');
      }
    );
  } catch (e) {
    logEvent({ type: 'error', context: 'register', error: e.message });
    res.redirect('/register');
  }
});

// Login page
router.get('/login', (req, res) => {
  logEvent({ type: 'route', route: '/login [GET]', userId: req.session.userId || null });
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Handle login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  logEvent({ type: 'route', route: '/login [POST]', userId: null, body: { username } });
  db.get(
    `SELECT id, password FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user) {
        logEvent({ type: 'error', context: 'login', error: err?.message || 'no user' });
        return res.redirect('/login');
      }
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        logEvent({ type: 'error', context: 'login', error: 'invalid password', userId: user.id });
        return res.redirect('/login');
      }
      req.session.userId = user.id;
      res.redirect('/');
    }
  );
});

// Logout
router.get('/logout', (req, res) => {
  logEvent({ type: 'route', route: '/logout [GET]', userId: req.session.userId || null });
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

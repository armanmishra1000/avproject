// routes/api.js

const express = require('express');
const db      = require('../data/database');
const { logEvent } = require('../middleware/logger');

const router = express.Router();

// Ensure the user is authenticated
function ensureAuth(req, res, next) {
  if (!req.session.userId) {
    logEvent({ type: 'auth', action: 'blocked', route: req.originalUrl });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Get current balance
router.get('/api/balance', ensureAuth, (req, res) => {
  logEvent({ type: 'api', route: '/api/balance [GET]', userId: req.session.userId });
  db.get(
    'SELECT balance FROM users WHERE id = ?',
    [req.session.userId],
    (err, row) => {
      if (err) {
        logEvent({ type: 'error', context: 'api/balance', error: err.message });
        return res.status(500).json({ error: 'DB error' });
      }
      res.json({ balance: row.balance });
    }
  );
});

// Deposit or withdraw amount
router.post('/api/deposit', ensureAuth, (req, res) => {
  const amt = parseFloat(req.body.amount);
  logEvent({ type: 'api', route: '/api/deposit [POST]', userId: req.session.userId, body: { amount: amt } });
  if (isNaN(amt) || amt === 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
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

// Client-side log endpoint
router.post('/api/log', ensureAuth, (req, res) => {
  logEvent({ type: 'client', userId: req.session.userId, details: req.body });
  res.sendStatus(200);
});

module.exports = router;

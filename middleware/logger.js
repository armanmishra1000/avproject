// middleware/logger.js
const fs   = require('fs');
const path = require('path');

// Log directory & file
const logDir  = path.join(__dirname, '..', 'data');
const logFile = path.join(logDir, 'activity.log');

// Ensure directory exists
defaults = {};
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Append a JSON line
function logEvent(evt) {
  const entry = JSON.stringify({ ...evt, ts: new Date().toISOString() }) + '\n';
  fs.appendFile(logFile, entry, err => {
    if (err) console.error('Log write error:', err);
  });
}

// Express middleware for HTTP logging
function httpLogger(req, res, next) {
  logEvent({
    type: 'http',
    userId: req.session?.userId || null,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });
  next();
}

module.exports = {
  logEvent,
  httpLogger
};

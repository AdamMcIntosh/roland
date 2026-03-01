#!/usr/bin/env node
/** Serve dashboard-ui for Tauri dev (port 8081). */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dashboard-ui');
const port = 8081;

const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url;
  const file = path.join(root, path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
server.listen(port, () => console.log(`Dashboard UI: http://127.0.0.1:${port}`));

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.urlencoded({ extended: false }));

/**
 * Evaluates MikroTik RouterOS hotspot template directives ($(if ...), $(else), $(endif))
 * and variables ($(link-login-only), $(error), etc.) strictly for local browser preview,
 * leaving the underlying MikroTik .html files completely untouched for router deployment.
 */
function renderMikrotikPreview(rawHtml, vars) {
  let output = rawHtml;

  // Handle $(if cond) ... $(else) ... $(endif) and $(if cond) ... $(endif)
  const evalCond = (cond) => {
    const trimmed = cond.trim();
    const eqMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*==\s*'([^']*)'$/);
    if (eqMatch) {
      return String(vars[eqMatch[1]] ?? '') === eqMatch[2];
    }
    const val = vars[trimmed];
    return Boolean(val && String(val).length > 0);
  };

  let guard = 0;
  const ifRegex = /\$\(if\s+([^)]+)\)([\s\S]*?)(?:\$\(else\)([\s\S]*?))?\$\(endif\)/g;
  while (ifRegex.test(output) && guard < 15) {
    guard++;
    output = output.replace(ifRegex, (_m, cond, truthyBlock, falsyBlock = '') => {
      return evalCond(cond) ? truthyBlock : falsyBlock;
    });
  }

  // Substitute $(var) placeholders
  output = output.replace(/\$\(([a-zA-Z0-9_-]+)\)/g, (_m, key) => {
    return vars[key] !== undefined ? String(vars[key]) : '';
  });

  return output;
}

function getPreviewVars(req) {
  const errMsg = typeof req.query.error === 'string' ? req.query.error : '';
  const username = typeof req.query.username === 'string' ? req.query.username : 'VOUCHER-001';
  const trial = req.query.trial === 'yes' ? 'yes' : 'no';

  return {
    'chap-id': '',
    'chap-challenge': '',
    'link-login-only': '/preview-login',
    'link-login': '/login.html',
    'link-logout': '/logout.html',
    'link-orig': '/alogin.html',
    'link-orig-esc': encodeURIComponent('/alogin.html'),
    'link-redirect': '/alogin.html',
    'link-status': '/logout.html',
    'login-by': '',
    'mac': 'AA:BB:CC:DD:EE:FF',
    'mac-esc': 'AA%3ABB%3ACC%3ADD%3AEE%3AFF',
    'ip': '192.168.88.25',
    'username': username,
    'uptime': '00:15:32',
    'session-time-left': '02:44:28',
    'bytes-in-nice': '4.8 MiB',
    'bytes-out-nice': '18.2 MiB',
    'error': errMsg,
    'trial': trial,
  };
}

// Default route serves MikroTik login.html preview
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'login.html');
  const html = fs.readFileSync(filePath, 'utf-8');
  res.type('html').send(renderMikrotikPreview(html, getPreviewVars(req)));
});

// Handle form submission in local preview mode
app.post('/preview-login', (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) {
    return res.redirect('/login.html?error=' + encodeURIComponent('Masukkan Username atau Kode Voucher terlebih dahulu.'));
  }
  if (username.toLowerCase() === 'salah' || username.toLowerCase() === 'error') {
    return res.redirect('/login.html?error=' + encodeURIComponent('Kode voucher tidak valid atau masa aktif sudah habis.'));
  }
  return res.redirect('/logout.html?username=' + encodeURIComponent(username));
});

// Preview-render any MikroTik .html template
app.get('/:page.html', (req, res, next) => {
  const safeName = path.basename(req.params.page) + '.html';
  const filePath = path.join(__dirname, safeName);
  if (!fs.existsSync(filePath)) {
    return next();
  }
  const html = fs.readFileSync(filePath, 'utf-8');
  res.type('html').send(renderMikrotikPreview(html, getPreviewVars(req)));
});

// Serve static assets (img/, alqomar.css, md5.js, favicon.ico, public/, etc.)
app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Al-Qomar Hotspot preview server listening on http://0.0.0.0:${PORT}`);
});

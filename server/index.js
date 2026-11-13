// A7 Assistent server: SMS kod bilan kirish va sozlamalarni saqlash. Qoʻshimcha paket kerak emas (Node 18+).
const http = require('http'), fs = require('fs'), crypto = require('crypto'), path = require('path');
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, 'db.json');
const E = { email: process.env.ESKIZ_EMAIL, pass: process.env.ESKIZ_PASSWORD, from: process.env.ESKIZ_FROM || '4546' };
if (process.env.NODE_ENV === 'production' && (!E.email || !E.pass)) {
  throw new Error('ESKIZ_EMAIL and ESKIZ_PASSWORD are required in production');
}
let db = { users: {}, tokens: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
const saveDb = () => fs.writeFileSync(DB, JSON.stringify(db));
const codes = new Map(); // telefon -> { code, exp, tries, sent }
let eskizToken = null;

async function eskizSend(phone, text) {
  const login = async () => {
    const r = await fetch('https://notify.eskiz.uz/api/auth/login', { method: 'POST', body: new URLSearchParams({ email: E.email, password: E.pass }) });
    const j = await r.json();
    eskizToken = j.data && j.data.token;
    if (!eskizToken) throw new Error('Eskiz login xato');
  };
  const go = () => fetch('https://notify.eskiz.uz/api/message/sms/send', {
    method: 'POST', headers: { Authorization: 'Bearer ' + eskizToken },
    body: new URLSearchParams({ mobile_phone: '998' + phone, message: text, from: E.from })
  });
  if (!eskizToken) await login();
  let r = await go();
  if (r.status === 401) { await login(); r = await go(); }
  if (!r.ok) throw new Error('Eskiz send ' + r.status);
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' });
  res.end(JSON.stringify(obj));
};
const body = (req) => new Promise((ok) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ok({}); } });
});
const auth = (req) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const p = db.tokens[t];
  return p && db.users[p] ? { p, u: db.users[p] } : null;
};

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'POST' && url === '/api/send-code') {
      const { phone } = await body(req);
      if (!/^\d{9}$/.test(phone || '')) return send(res, 400, { error: 'phone' });
      const c = codes.get(phone);
      if (c && Date.now() - c.sent < 60000) return send(res, 429, { error: 'wait' });
      const code = String(crypto.randomInt(100000, 1000000));
      const pending = { code, exp: Date.now() + 300000, tries: 0, sent: Date.now(), delivered: false };
      codes.set(phone, pending);
      try {
        if (E.email) await eskizSend(phone, 'A7 Assistent tasdiqlash kodi: ' + code);
        else console.log('[DEV] ' + phone + ' kod: ' + code);
        pending.delivered = true;
      } catch (error) {
        if (codes.get(phone) === pending) codes.delete(phone);
        throw error;
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url === '/api/verify') {
      const { phone, code } = await body(req);
      const c = codes.get(phone);
      if (!c?.delivered || Date.now() > c.exp || c.tries >= 5) return send(res, 400, { error: 'code' });
      c.tries++;
      if (String(code) !== c.code) return send(res, 400, { error: 'code' });
      codes.delete(phone);
      db.users[phone] = db.users[phone] || { name: '', status: '', answer: 'no', voice: 0, conf: false };
      const token = crypto.randomBytes(24).toString('hex');
      db.tokens[token] = phone; saveDb();
      return send(res, 200, { token });
    }
    const a = auth(req);
    if (!a) return send(res, 401, { error: 'auth' });
    if (url === '/api/me' && req.method === 'GET') return send(res, 200, a.u);
    if (url === '/api/me' && req.method === 'PUT') {
      const b = await body(req);
      Object.assign(a.u, { name: String(b.name || '').slice(0, 30), status: String(b.status || '').slice(0, 500),
        answer: b.answer === 'yes' ? 'yes' : 'no', voice: [0, 1, 2, 3].includes(b.voice) ? b.voice : 0, conf: !!b.conf });
      saveDb();
      return send(res, 200, a.u);
    }
    if (url === '/api/logout' && req.method === 'POST') {
      a.u.conf = false;
      for (const t in db.tokens) if (db.tokens[t] === a.p) delete db.tokens[t];
      saveDb();
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'notfound' });
  } catch (e) { console.error(e); send(res, 500, { error: 'server' }); }
}).listen(PORT, () => console.log('A7 server :' + PORT));

import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import { config } from './config.js';

const COOKIE_NAME = 'pm_token';
const TTL_MS = 7 * 24 * 3600 * 1000;

function sessionSecret() {
  if (config.sessionSecret) return config.sessionSecret;
  let s = getSetting('session_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    setSetting('session_secret', s);
  }
  return s;
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pw, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function adminInitialized() {
  return !!getSetting('admin_password');
}

export function setupAdmin(password) {
  if (adminInitialized()) throw Object.assign(new Error('管理员已初始化'), { status: 400 });
  setSetting('admin_password', hashPassword(password));
}

export function changePassword(oldPw, newPw) {
  if (!verifyPassword(oldPw, getSetting('admin_password') || '')) {
    throw Object.assign(new Error('原密码不正确'), { status: 400 });
  }
  setSetting('admin_password', hashPassword(newPw));
}

export function login(password) {
  const stored = getSetting('admin_password');
  if (!stored || !verifyPassword(password, stored)) return null;
  return signToken();
}

function signToken() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expect = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.role === 'admin' && typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAdmin(req, res, next) {
  if (verifyToken(req.cookies?.[COOKIE_NAME])) return next();
  res.status(401).json({ error: '未登录或会话已过期' });
}

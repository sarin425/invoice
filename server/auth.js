import crypto from 'node:crypto';
import { getSettings, setPasswordHash } from './db.js';

const COOKIE_NAME = 'invoice_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'invoice-studio-local-secret-change-me';
const SESSION_DAYS = 30;

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

async function expectedCredential() {
  const settings = await getSettings();
  const hash = settings?.password_hash || '';
  if (hash) return { kind: 'hash', value: hash };
  return { kind: 'plain', value: process.env.APP_PASSWORD || 'change-me-please' };
}

export async function checkPassword(password) {
  const expected = await expectedCredential();
  let left;
  let right;

  if (expected.kind === 'hash') {
    const [salt, hex] = expected.value.split(':');
    if (!salt || !hex) return false;
    left = Buffer.from(hex, 'hex');
    right = crypto.scryptSync(String(password), salt, 64);
  } else {
    left = crypto.createHash('sha256').update(expected.value).digest();
    right = crypto.createHash('sha256').update(String(password)).digest();
  }

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function changePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  await setPasswordHash(`${salt}:${hash}`);
}

export function createSession() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

export function isSessionValid(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload) > Date.now();
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator === -1) return [part, ''];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function sessionFromRequest(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}

export function isAuthenticated(req) {
  return isSessionValid(sessionFromRequest(req));
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Please log in to continue.' });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function cookieHeader(token, options) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`];
  parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  parts.push(`Path=${options.path}`);
  parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

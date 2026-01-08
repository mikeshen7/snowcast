'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const adminUserDb = require('../models/adminUserDb');
const frontendMagicTokenDb = require('../models/frontendMagicTokenDb');
const { sendEmail } = require('./email');
const appConfig = require('./appConfig');
const { getRoleLabels, getFavoriteLimits, getHourlyAccess, getPowAlertLimits, getCheckPowAccess, normalizeRole } = require('./roleConfig');

const COOKIE_NAME = 'frontendSession';
const { config } = require('../config');
const SESSION_SECRET = config.frontend.sessionSecret;
const BACKEND_URL = config.backend.url;
const FRONTEND_URL = config.frontend.url;
const IS_DEV = config.backend.dev;
const COOKIE_SECURE = IS_DEV ? false : config.frontend.cookieSecure;
const COOKIE_SAMESITE = IS_DEV ? 'lax' : config.frontend.cookieSameSite;
const ALLOW_NEW_USERS = config.auth.allowNewUsers;

function getSessionTtlMinutes() {
  return Number(appConfig.values().TTL_FRONTEND_SESSION_MINUTES) || 60;
}

function getMagicTtlMinutes() {
  return Number(appConfig.values().TTL_AUTH_TOKEN_MINUTES) || 15;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  if (raw.startsWith('/')) return raw;
  return '/';
}

function buildRedirectTarget(path) {
  if (!FRONTEND_URL) {
    return path;
  }
  try {
    const base = new URL(FRONTEND_URL);
    return new URL(path, base).toString();
  } catch (error) {
    return path;
  }
}

function buildMagicLink(token, redirectPath) {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL not configured');
  }
  const url = new URL('/auth/verify', BACKEND_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('redirect', safeRedirectPath(redirectPath));
  return url.toString();
}

async function sendMagicLinkEmail(email, link) {
  const expiresMinutes = getMagicTtlMinutes();
  const subject = 'Snowcast login link';
  const text = [
    'Your login link:',
    link,
    '',
    `This link expires in ${expiresMinutes} minutes.`,
    'If you did not request it, you can ignore this email.',
  ].join('\n');
  await sendEmail({ to: email, subject, text });
}

async function sendClosedSignupEmail(email) {
  const subject = 'Weather Forecast access request';
  const text = [
    'Thanks for your interest!',
    'The website is currently under development and accepting new users.',
    'Please check back later for access.',
  ].join('\n');
  await sendEmail({ to: email, subject, text });
}

function createSessionToken(user) {
  if (!SESSION_SECRET) {
    throw new Error('FRONTEND_SESSION_SECRET is not configured');
  }
  const sessionTtlMinutes = getSessionTtlMinutes();
  return jwt.sign({ uid: String(user._id), email: user.email }, SESSION_SECRET, {
    expiresIn: `${sessionTtlMinutes}m`,
  });
}

function verifySessionToken(token) {
  if (!SESSION_SECRET) return null;
  try {
    return jwt.verify(token, SESSION_SECRET);
  } catch (error) {
    return null;
  }
}

async function handleRequestMagicLink(request, response) {
  const email = (request.body?.email || '').trim().toLowerCase();
  if (!email) {
    return response.status(400).send('email is required');
  }

  let user = await adminUserDb.findOne({ email, status: 'active' });
  if (!user && !ALLOW_NEW_USERS) {
    try {
      await sendClosedSignupEmail(email);
    } catch (error) {
      console.error('*** frontend signup closed email error:', error.message);
    }
    return response.status(200).send({ ok: true });
  }
  if (!user && ALLOW_NEW_USERS) {
    user = await adminUserDb.create({
      email,
      status: 'active',
      roles: ['level1'],
      locationAccess: 'all',
      adminAccess: false,
    });
  }
  if (!user) {
    return response.status(200).send({ ok: true });
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + getMagicTtlMinutes() * 60 * 1000);
    await frontendMagicTokenDb.create({
      user: user._id,
      tokenHash,
      expiresAt,
      createdFromIp: request.ip,
      createdFromUserAgent: request.get('user-agent') || '',
    });
    const redirectPath = request.body?.redirectPath;
    const link = buildMagicLink(token, redirectPath);
    await sendMagicLinkEmail(user.email, link);
  } catch (error) {
    console.error('*** frontend request-link error:', error.message);
    return response.status(500).send('Could not send login link');
  }

  return response.status(200).send({ ok: true });
}

async function handleVerifyMagicLink(request, response) {
  const token = (request.query?.token || '').trim();
  if (!token) {
    return response.status(400).send('token is required');
  }
  const tokenHash = hashToken(token);
  const now = new Date();
  const record = await frontendMagicTokenDb.findOne({ tokenHash }).populate('user');
  if (!record || !record.user) {
    return response.status(401).send('Invalid token');
  }
  if (record.usedAt) {
    return response.status(401).send('Token already used');
  }
  if (record.expiresAt < now) {
    return response.status(401).send('Token expired');
  }
  if (record.user.status !== 'active') {
    return response.status(401).send('User inactive');
  }

  record.usedAt = now;
  record.consumedFromIp = request.ip;
  record.consumedFromUserAgent = request.get('user-agent') || '';
  await record.save();
  const sessionToken = createSessionToken(record.user);
  const sessionTtlMinutes = getSessionTtlMinutes();
  response.cookie(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    maxAge: sessionTtlMinutes * 60 * 1000,
    path: '/',
  });

  record.user.lastLoginAt = now;
  record.user.lastLoginIp = request.ip;
  record.user.lastLoginUserAgent = request.get('user-agent') || '';
  await record.user.save();

  const redirect = safeRedirectPath(request.query?.redirect);
  return response.redirect(buildRedirectTarget(redirect));
}

async function handleSessionStatus(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    response.clearCookie(COOKIE_NAME);
    return response.status(403).send({ authenticated: false });
  }
  const roleLabels = getRoleLabels();
  const roleLimits = getFavoriteLimits();
  const roleHourly = getHourlyAccess();
  const rolePowAlerts = getPowAlertLimits();
  const roleCheckPow = getCheckPowAccess();
  const normalizedRoles = (user.roles || []).map((role) => normalizeRole(role));
  return response.status(200).send({
    authenticated: true,
    user: { email: user.email, roles: normalizedRoles, locationAccess: user.locationAccess || 'all' },
    roleLabels,
    roleLimits,
    roleHourly,
    rolePowAlerts,
    roleCheckPow,
  });
}

async function handleLogout(request, response) {
  response.clearCookie(COOKIE_NAME, { path: '/' });
  return response.status(200).send({ ok: true });
}

async function getFrontendUserFromRequest(request) {
  const token = request.cookies?.[COOKIE_NAME];
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) {
    return null;
  }
  const user = await adminUserDb.findById(payload.uid);
  if (!user || user.status !== 'active') {
    return null;
  }
  return {
    id: String(user._id),
    email: user.email,
    roles: user.roles || [],
    locationAccess: user.locationAccess || 'all',
  };
}

module.exports = {
  handleRequestMagicLink,
  handleVerifyMagicLink,
  handleSessionStatus,
  handleLogout,
  getFrontendUserFromRequest,
};

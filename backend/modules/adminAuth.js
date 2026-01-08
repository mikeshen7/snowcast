'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const adminUserDb = require('../models/adminUserDb');
const adminMagicTokenDb = require('../models/adminMagicTokenDb');
const appConfig = require('./appConfig');
const { sendEmail } = require('./email');
const { config } = require('../config');

const ADMIN_ENABLED = config.backend.adminEnabled;
const COOKIE_NAME = 'adminSession';
const SESSION_SECRET = config.backend.sessionSecret;
const BACKEND_URL = config.backend.url;
const COOKIE_SECURE = config.backend.cookieSecure;
const BOOTSTRAP_EMAIL = config.backend.ownerEmail;
const OWNER_ROLE = 'owner';
const ADMIN_ROLE = 'admin';
const BASIC_ROLE = 'basic';
const STANDARD_ROLE = 'standard';
const ADVANCED_ROLE = 'advanced';
const ALLOWED_ROLES = new Set([OWNER_ROLE, ADMIN_ROLE, BASIC_ROLE, STANDARD_ROLE, ADVANCED_ROLE]);

function getSessionTtlMinutes() {
  return Number(appConfig.values().TTL_BACKEND_SESSION_MINUTES) || 60;
}

function getMagicTtlMinutes() {
  return Number(appConfig.values().TTL_AUTH_TOKEN_MINUTES) || 15;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return '/admin.html';
  if (raw.startsWith('/')) return raw;
  return '/admin.html';
}

function buildMagicLink(token, redirectPath) {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL not configured');
  }
  const url = new URL('/admin/auth/verify', BACKEND_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('redirect', safeRedirectPath(redirectPath));
  return url.toString();
}

async function sendMagicLinkEmail(email, link) {
  const expiresMinutes = getMagicTtlMinutes();
  const subject = 'Weather Forecast backend admin login link';
  const text = [
    'Your admin login link:',
    link,
    '',
    `This link expires in ${expiresMinutes} minutes.`,
    'If you did not request it, you can ignore this email.',
  ].join('\n');
  await sendEmail({ to: email, subject, text });
}

function createSessionToken(user) {
  if (!SESSION_SECRET) {
    throw new Error('ADMIN_SESSION_SECRET is not configured');
  }
  const sessionTtlMinutes = getSessionTtlMinutes();
  const normalizedRoles = (user.roles || []).filter((r) => ALLOWED_ROLES.has(r)).slice(0, 1);
  return jwt.sign(
    { uid: String(user._id), email: user.email, roles: normalizedRoles },
    SESSION_SECRET,
    { expiresIn: `${sessionTtlMinutes}m` }
  );
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
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  const magicTtlMinutes = getMagicTtlMinutes();
  const email = (request.body?.email || '').trim().toLowerCase();
  if (!email) {
    return response.status(400).send('email is required');
  }

  console.log(JSON.stringify({ event: 'admin_magic_link_request_received', email }));
  let user = await adminUserDb.findOne({ email, status: 'active' });
  if (!user && BOOTSTRAP_EMAIL && email === BOOTSTRAP_EMAIL) {
    user = await adminUserDb.create({
      email,
      status: 'active',
      roles: [OWNER_ROLE],
      locationAccess: 'all',
      adminAccess: true,
    });
    console.log('Bootstrap admin user created for', email);
  }
  if (user && BOOTSTRAP_EMAIL && email === BOOTSTRAP_EMAIL) {
    user.roles = [OWNER_ROLE];
    user.status = 'active';
    user.locationAccess = 'all';
    user.adminAccess = true;
    await user.save();
  }
  if (!user) {
    // Avoid email enumeration; respond success even if user not found.
    return response.status(200).send({ ok: true });
  }
  if (!user.adminAccess && !(user.roles || []).includes(OWNER_ROLE)) {
    return response.status(200).send({ ok: true });
  }

  let link;
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + magicTtlMinutes * 60 * 1000);
    await adminMagicTokenDb.create({
      user: user._id,
      tokenHash,
      expiresAt,
      createdFromIp: request.ip,
      createdFromUserAgent: request.get('user-agent') || '',
    });
    link = buildMagicLink(token, request.body?.redirectPath);
    await sendMagicLinkEmail(user.email, link);
    console.log(JSON.stringify({ event: 'admin_magic_link_sent', email: user.email, expiresMinutes: magicTtlMinutes }));
  } catch (error) {
    console.error('*** admin request-link error:', error.message);
    return response.status(500).send('Could not send login link');
  }

  return response.status(200).send({ ok: true });
}

async function handleVerifyMagicLink(request, response) {
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  const token = (request.query?.token || '').trim();
  if (!token) {
    return response.status(400).send('token is required');
  }
  const tokenHash = hashToken(token);
  const now = new Date();
  const record = await adminMagicTokenDb.findOne({ tokenHash }).populate('user');
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
    sameSite: 'strict',
    maxAge: sessionTtlMinutes * 60 * 1000,
    path: '/',
  });

  record.user.lastLoginAt = now;
  record.user.lastLoginIp = request.ip;
  record.user.lastLoginUserAgent = request.get('user-agent') || '';
  await record.user.save();

  const redirect = safeRedirectPath(request.query?.redirect);
  return response.redirect(redirect);
}

async function requireAdminSession(request, response, next) {
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    response.clearCookie(COOKIE_NAME);
    return response.status(403).send('Forbidden');
  }
  request.adminUser = adminUser;
  return next();
}

function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (request, response, next) => {
    if (!request.adminUser) {
      return response.status(403).send('Forbidden');
    }
    const roles = request.adminUser.roles || [];
    const hasRole = roles.some((r) => allowed.includes(r));
    if (!hasRole) {
      return response.status(403).send('Forbidden');
    }
    return next();
  };
}

async function handleSessionStatus(request, response) {
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    response.clearCookie(COOKIE_NAME);
    return response.status(403).send({ authenticated: false });
  }
  const isOwner = (adminUser.roles || []).includes(OWNER_ROLE);
  return response.status(200).send({
    authenticated: true,
    user: {
      email: adminUser.email,
      roles: adminUser.roles || [],
      locationAccess: adminUser.locationAccess || 'all',
      adminAccess: isOwner ? true : Boolean(adminUser.adminAccess),
    },
  });
}

function handleLogout(request, response) {
  response.clearCookie(COOKIE_NAME, { path: '/' });
  return response.status(200).send({ ok: true });
}

async function getAdminUserFromRequest(request) {
  if (!ADMIN_ENABLED) {
    return null;
  }
  const token = request.cookies?.[COOKIE_NAME];
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) {
    return null;
  }
  const user = await adminUserDb.findById(payload.uid);
  if (!user || user.status !== 'active') {
    return null;
  }
  if (!user.adminAccess && !(user.roles || []).includes(OWNER_ROLE)) {
    return null;
  }
  const normalizedRoles = (user.roles || []).filter((r) => ALLOWED_ROLES.has(r)).slice(0, 1);
  const isOwner = normalizedRoles.includes(OWNER_ROLE);
  return {
    id: String(user._id),
    email: user.email,
    roles: normalizedRoles,
    locationAccess: isOwner ? 'all' : user.locationAccess || 'all',
    adminAccess: isOwner ? true : Boolean(user.adminAccess),
  };
}

module.exports = {
  requireAdminSession,
  requireRole,
  handleRequestMagicLink,
  handleVerifyMagicLink,
  handleSessionStatus,
  handleLogout,
  getAdminUserFromRequest,
  OWNER_ROLE,
  ADMIN_ROLE,
  BASIC_ROLE,
  STANDARD_ROLE,
  ADVANCED_ROLE,
};

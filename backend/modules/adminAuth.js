// admin Auth module.
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
const BOOTSTRAP_EMAIL = config.backend.adminEmail;
const { ADMIN_ROLE, isAdminUser } = require('./userRole');

// Get Session Ttl Minutes.
function getSessionTtlMinutes() {
  return Number(appConfig.values().TTL_BACKEND_SESSION_MINUTES) || 60;
}

// Get Magic Ttl Minutes.
function getMagicTtlMinutes() {
  return Number(appConfig.values().TTL_AUTH_TOKEN_MINUTES) || 15;
}

// hash Token helper.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// safe Redirect Path helper.
function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return '/admin.html';
  if (raw.startsWith('/')) return raw;
  return '/admin.html';
}

// Build Magic Link.
function buildMagicLink(token, redirectPath) {
  if (!BACKEND_URL) {
    throw new Error('BACKEND_URL not configured');
  }
  const url = new URL('/admin/auth/verify', BACKEND_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('redirect', safeRedirectPath(redirectPath));
  return url.toString();
}

// send Magic Link Email helper.
async function sendMagicLinkEmail(email, link) {
  const expiresMinutes = getMagicTtlMinutes();
  const subject = 'Snowcast Admin Console login link';
  const text = [
    'Your admin login link:',
    link,
    '',
    `This link expires in ${expiresMinutes} minutes.`,
    'If you did not request it, you can ignore this email.',
  ].join('\n');
  await sendEmail({ to: email, subject, text });
}

// Create Session Token.
function createSessionToken(user) {
  if (!SESSION_SECRET) {
    throw new Error('ADMIN_SESSION_SECRET is not configured');
  }
  const sessionTtlMinutes = getSessionTtlMinutes();
  // normalized Roles helper.
  return jwt.sign(
    { uid: String(user._id), email: user.email, isAdmin: Boolean(user.isAdmin) },
    SESSION_SECRET,
    { expiresIn: `${sessionTtlMinutes}m` }
  );
}

// verify Session Token helper.
function verifySessionToken(token) {
  if (!SESSION_SECRET) return null;
  try {
    return jwt.verify(token, SESSION_SECRET);
  } catch (error) {
    return null;
  }
}

// Handle Request Magic Link.
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
      name: 'Owner',
      status: 'active',
      isAdmin: true,
    });
    console.log('Bootstrap admin user created for', email);
  }
  if (user && BOOTSTRAP_EMAIL && email === BOOTSTRAP_EMAIL) {
    user.isAdmin = true;
    user.status = 'active';
    if (!user.name) {
      user.name = 'Owner';
    }
    await user.save();
  }
  if (!user) {
    // Avoid email enumeration; respond success even if user not found.
    return response.status(200).send({ ok: true });
  }
  if (!isAdminUser(user)) {
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

// Handle Verify Magic Link.
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

// require Admin Session helper.
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

// require Role helper.
function requireRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (request, response, next) => {
    if (!request.adminUser) {
      return response.status(403).send('Forbidden');
    }
    const hasRole = request.adminUser.roles?.some((r) => allowed.includes(r));
    if (!hasRole) {
      return response.status(403).send('Forbidden');
    }
    return next();
  };
}

// Handle Session Status.
async function handleSessionStatus(request, response) {
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    response.clearCookie(COOKIE_NAME);
    return response.status(403).send({ authenticated: false });
  }
  return response.status(200).send({
    authenticated: true,
    user: {
      email: adminUser.email,
      roles: isAdminUser(adminUser) ? [ADMIN_ROLE] : [],
      isAdmin: isAdminUser(adminUser),
    },
  });
}

// Handle Logout.
function handleLogout(request, response) {
  response.clearCookie(COOKIE_NAME, { path: '/' });
  return response.status(200).send({ ok: true });
}

// Get Admin User From Request.
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
  if (!isAdminUser(user)) {
    return null;
  }
  return {
    id: String(user._id),
    email: user.email,
    roles: [ADMIN_ROLE],
    isAdmin: true,
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
  ADMIN_ROLE,
};

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const config = {
  db: {
    name: process.env.DB_NAME || 'weather',
    url: process.env.DB_URL || '',
  },
  backend: {
    dev: process.env.BACKEND_DEV === 'true',
    url: process.env.BACKEND_URL || '',
    port: parseNumber(process.env.BACKEND_PORT) || 3001,
    adminEnabled: process.env.BACKEND_ADMIN_ENABLED === 'true',
    cookieSecure: process.env.BACKEND_COOKIE_SECURE === 'true',
    ownerEmail: (process.env.BACKEND_OWNER_EMAIL || '').trim().toLowerCase(),
    sessionSecret: process.env.BACKEND_SESSION_SECRET || '',
    adminApiToken: process.env.ADMIN_API_TOKEN || '',
  },
  frontend: {
    url: process.env.FRONTEND_URL || '',
    sessionSecret: process.env.FRONTEND_SESSION_SECRET || '',
    cookieSecure: process.env.FRONTEND_COOKIE_SECURE === 'true',
    cookieSameSite: process.env.FRONTEND_COOKIE_SAMESITE || 'none',
  },
  auth: {
    allowNewUsers: process.env.AUTH_ALLOW_NEW_USERS === 'true',
  },
  cors: {
    frontendOrigins: (process.env.CORS_FRONTEND_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  email: {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    brevoApiKey: process.env.BREVO_API_KEY || '',
    brevoEndpointUrl: process.env.BREVO_API_ENDPOINT_URL || '',
    embedImages: process.env.EMAIL_EMBED_IMAGES === 'true',
    imageBaseUrl: process.env.EMAIL_IMAGE_BASE_URL || '',
  },
  clientApi: {
    sessionSecret: process.env.CLIENT_API_SESSION_SECRET || '',
    rateLimitDefault: parseNumber(process.env.CLIENT_API_RATE_LIMIT_DEFAULT),
    dailyQuotaDefault: parseNumber(process.env.CLIENT_API_DAILY_QUOTA_DEFAULT),
  },
};

function validateConfig() {
  const required = ['DB_URL', 'BACKEND_URL', 'FRONTEND_SESSION_SECRET'];
  if (config.backend.adminEnabled) {
    required.push('BACKEND_SESSION_SECRET');
  }
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

module.exports = {
  config,
  validateConfig,
};

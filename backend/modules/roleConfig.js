'use strict';

const rolesDb = require('../models/rolesDb');

const DEFAULT_ROLE_LABELS = {
  guest: 'Guest',
  free: 'Free',
  premium: 'Premium',
  admin: 'Admin',
};

const DEFAULT_ROLE_FAVORITES = {
  guest: 0,
  free: 3,
  premium: -1,
  admin: -1,
};

const DEFAULT_ROLE_HOURLY = {
  guest: false,
  free: false,
  premium: true,
  admin: true,
};

const DEFAULT_ROLE_POW_ALERTS = {
  guest: 1,
  free: 1,
  premium: 10,
  admin: 10,
};

const DEFAULT_ROLE_CHECK_POW = {
  guest: false,
  free: false,
  premium: false,
  admin: true,
};

const DEFAULT_ROLE_FORECAST = {
  guest: { back: 2, forward: 7 },
  free: { back: 2, forward: 7 },
  premium: { back: -1, forward: -1 },
  admin: { back: -1, forward: -1 },
};

const ROLE_ORDER = ['guest', 'free', 'premium', 'admin'];
let roleCache = null;

function normalizeRole(role) {
  if (role === 'basic' || role === 'level1') return 'free';
  if (role === 'standard' || role === 'level2' || role === 'advanced' || role === 'level3') return 'premium';
  if (role === 'owner') return 'admin';
  return role;
}

function buildDefaultRoleMap() {
  return {
    guest: {
      code: 'guest',
      label: DEFAULT_ROLE_LABELS.guest,
      favoritesLimit: DEFAULT_ROLE_FAVORITES.guest,
      hourlyAccess: DEFAULT_ROLE_HOURLY.guest,
      powAlertsLimit: DEFAULT_ROLE_POW_ALERTS.guest,
      checkPowAccess: DEFAULT_ROLE_CHECK_POW.guest,
      forecastBack: DEFAULT_ROLE_FORECAST.guest.back,
      forecastForward: DEFAULT_ROLE_FORECAST.guest.forward,
    },
    free: {
      code: 'free',
      label: DEFAULT_ROLE_LABELS.free,
      favoritesLimit: DEFAULT_ROLE_FAVORITES.free,
      hourlyAccess: DEFAULT_ROLE_HOURLY.free,
      powAlertsLimit: DEFAULT_ROLE_POW_ALERTS.free,
      checkPowAccess: DEFAULT_ROLE_CHECK_POW.free,
      forecastBack: DEFAULT_ROLE_FORECAST.free.back,
      forecastForward: DEFAULT_ROLE_FORECAST.free.forward,
    },
    premium: {
      code: 'premium',
      label: DEFAULT_ROLE_LABELS.premium,
      favoritesLimit: DEFAULT_ROLE_FAVORITES.premium,
      hourlyAccess: DEFAULT_ROLE_HOURLY.premium,
      powAlertsLimit: DEFAULT_ROLE_POW_ALERTS.premium,
      checkPowAccess: DEFAULT_ROLE_CHECK_POW.premium,
      forecastBack: DEFAULT_ROLE_FORECAST.premium.back,
      forecastForward: DEFAULT_ROLE_FORECAST.premium.forward,
    },
    admin: {
      code: 'admin',
      label: DEFAULT_ROLE_LABELS.admin,
      favoritesLimit: DEFAULT_ROLE_FAVORITES.admin,
      hourlyAccess: DEFAULT_ROLE_HOURLY.admin,
      powAlertsLimit: DEFAULT_ROLE_POW_ALERTS.admin,
      checkPowAccess: DEFAULT_ROLE_CHECK_POW.admin,
      forecastBack: DEFAULT_ROLE_FORECAST.admin.back,
      forecastForward: DEFAULT_ROLE_FORECAST.admin.forward,
    },
  };
}

function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildRoleMapFromDocs(docs) {
  const map = buildDefaultRoleMap();
  (docs || []).forEach((doc) => {
    const code = normalizeRole(doc.code);
    if (!ROLE_ORDER.includes(code)) return;
    const target = map[code];
    target.label = doc.label || target.label;
    target.favoritesLimit = coerceNumber(doc.favoritesLimit, target.favoritesLimit);
    target.hourlyAccess = Boolean(doc.hourlyAccess);
    target.powAlertsLimit = coerceNumber(doc.powAlertsLimit, target.powAlertsLimit);
    target.checkPowAccess = Boolean(doc.checkPowAccess);
    target.forecastBack = coerceNumber(doc.forecastBack, target.forecastBack);
    target.forecastForward = coerceNumber(doc.forecastForward, target.forecastForward);
  });
  return map;
}

async function ensureRoleDefaults() {
  const defaults = buildDefaultRoleMap();
  for (const role of ROLE_ORDER) {
    const def = defaults[role];
    await rolesDb.updateOne(
      { code: role },
      {
        $setOnInsert: {
          code: role,
          label: def.label,
          favoritesLimit: def.favoritesLimit,
          hourlyAccess: def.hourlyAccess,
          powAlertsLimit: def.powAlertsLimit,
          checkPowAccess: def.checkPowAccess,
          forecastBack: def.forecastBack,
          forecastForward: def.forecastForward,
        },
      },
      { upsert: true }
    );
  }
}

async function refreshRoleCache() {
  const docs = await rolesDb.find({}).lean();
  roleCache = buildRoleMapFromDocs(docs);
  return roleCache;
}

function getRoleMap() {
  if (!roleCache) {
    roleCache = buildDefaultRoleMap();
  }
  return roleCache;
}

function getRolesList() {
  const map = getRoleMap();
  return ROLE_ORDER.map((code) => map[code]);
}

function getRoleLabels() {
  const map = getRoleMap();
  return {
    guest: map.guest.label,
    free: map.free.label,
    premium: map.premium.label,
    admin: map.admin.label,
  };
}

function getFavoriteLimits() {
  const map = getRoleMap();
  return {
    guest: map.guest.favoritesLimit,
    free: map.free.favoritesLimit,
    premium: map.premium.favoritesLimit,
    admin: map.admin.favoritesLimit,
  };
}

function getFavoriteLimitForRole(role) {
  const normalized = normalizeRole(role || 'guest');
  const limits = getFavoriteLimits();
  const value = limits[normalized];
  return Number.isFinite(value) ? value : DEFAULT_ROLE_FAVORITES[normalized] ?? 0;
}

function getHourlyAccess() {
  const map = getRoleMap();
  return {
    guest: Boolean(map.guest.hourlyAccess),
    free: Boolean(map.free.hourlyAccess),
    premium: Boolean(map.premium.hourlyAccess),
    admin: Boolean(map.admin.hourlyAccess),
  };
}

function canAccessHourly(role) {
  const normalized = normalizeRole(role || 'guest');
  const map = getHourlyAccess();
  return Boolean(map[normalized]);
}

function getPowAlertLimits() {
  const map = getRoleMap();
  return {
    guest: map.guest.powAlertsLimit,
    free: map.free.powAlertsLimit,
    premium: map.premium.powAlertsLimit,
    admin: map.admin.powAlertsLimit,
  };
}

function getPowAlertLimitForRole(role) {
  const normalized = normalizeRole(role || 'free');
  const limits = getPowAlertLimits();
  const value = limits[normalized];
  return Number.isFinite(value) ? value : DEFAULT_ROLE_POW_ALERTS[normalized] ?? 0;
}

function getCheckPowAccess() {
  const map = getRoleMap();
  return {
    guest: Boolean(map.guest.checkPowAccess),
    free: Boolean(map.free.checkPowAccess),
    premium: Boolean(map.premium.checkPowAccess),
    admin: Boolean(map.admin.checkPowAccess),
  };
}

function canCheckPow(role) {
  const normalized = normalizeRole(role || 'free');
  const map = getCheckPowAccess();
  return Boolean(map[normalized]);
}

function getForecastWindows() {
  const map = getRoleMap();
  return {
    guest: { back: map.guest.forecastBack, forward: map.guest.forecastForward },
    free: { back: map.free.forecastBack, forward: map.free.forecastForward },
    premium: { back: map.premium.forecastBack, forward: map.premium.forecastForward },
    admin: { back: map.admin.forecastBack, forward: map.admin.forecastForward },
  };
}

function getForecastWindowForRole(role) {
  const normalized = normalizeRole(role || 'guest');
  const windows = getForecastWindows();
  return windows[normalized] || DEFAULT_ROLE_FORECAST[normalized] || DEFAULT_ROLE_FORECAST.guest;
}

module.exports = {
  DEFAULT_ROLE_LABELS,
  DEFAULT_ROLE_FAVORITES,
  DEFAULT_ROLE_HOURLY,
  DEFAULT_ROLE_POW_ALERTS,
  DEFAULT_ROLE_CHECK_POW,
  DEFAULT_ROLE_FORECAST,
  ensureRoleDefaults,
  refreshRoleCache,
  getRoleMap,
  getRolesList,
  normalizeRole,
  getRoleLabels,
  getFavoriteLimits,
  getFavoriteLimitForRole,
  getHourlyAccess,
  canAccessHourly,
  getPowAlertLimits,
  getPowAlertLimitForRole,
  getCheckPowAccess,
  canCheckPow,
  getForecastWindows,
  getForecastWindowForRole,
};

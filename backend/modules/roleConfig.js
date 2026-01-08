'use strict';

const appConfig = require('./appConfig');

const DEFAULT_ROLE_LABELS = {
  guest: 'Guest',
  level1: 'Starter',
  level2: 'Plus',
  level3: 'Pro',
  admin: 'Admin',
  owner: 'Owner',
};

const DEFAULT_ROLE_FAVORITES = {
  guest: 0,
  level1: 1,
  level2: 3,
  level3: -1,
  admin: -1,
  owner: -1,
};

const DEFAULT_ROLE_HOURLY = {
  guest: false,
  level1: false,
  level2: true,
  level3: true,
  admin: true,
  owner: true,
};

const DEFAULT_ROLE_POW_ALERTS = {
  level1: 1,
  level2: 3,
  level3: 10,
  admin: -1,
  owner: -1,
};

const DEFAULT_ROLE_CHECK_POW = {
  guest: false,
  level1: false,
  level2: false,
  level3: true,
  admin: true,
  owner: true,
};

function normalizeRole(role) {
  if (role === 'basic') return 'level1';
  if (role === 'standard') return 'level2';
  if (role === 'advanced') return 'level3';
  return role;
}

function getRoleLabels() {
  const values = appConfig.values();
  return {
    guest: values.ROLE_LABEL_GUEST || DEFAULT_ROLE_LABELS.guest,
    level1: values.ROLE_LABEL_LEVEL1 || DEFAULT_ROLE_LABELS.level1,
    level2: values.ROLE_LABEL_LEVEL2 || DEFAULT_ROLE_LABELS.level2,
    level3: values.ROLE_LABEL_LEVEL3 || DEFAULT_ROLE_LABELS.level3,
    admin: values.ROLE_LABEL_ADMIN || DEFAULT_ROLE_LABELS.admin,
    owner: values.ROLE_LABEL_OWNER || DEFAULT_ROLE_LABELS.owner,
  };
}

function getFavoriteLimits() {
  const values = appConfig.values();
  return {
    guest: Number(values.ROLE_FAVORITES_GUEST ?? DEFAULT_ROLE_FAVORITES.guest),
    level1: Number(values.ROLE_FAVORITES_LEVEL1 ?? DEFAULT_ROLE_FAVORITES.level1),
    level2: Number(values.ROLE_FAVORITES_LEVEL2 ?? DEFAULT_ROLE_FAVORITES.level2),
    level3: Number(values.ROLE_FAVORITES_LEVEL3 ?? DEFAULT_ROLE_FAVORITES.level3),
    admin: Number(values.ROLE_FAVORITES_ADMIN ?? DEFAULT_ROLE_FAVORITES.admin),
    owner: Number(values.ROLE_FAVORITES_OWNER ?? DEFAULT_ROLE_FAVORITES.owner),
  };
}

function getFavoriteLimitForRole(role) {
  const normalized = normalizeRole(role || 'guest');
  const limits = getFavoriteLimits();
  const value = limits[normalized];
  return Number.isFinite(value) ? value : DEFAULT_ROLE_FAVORITES[normalized] ?? 0;
}

function getHourlyAccess() {
  const values = appConfig.values();
  return {
    guest: Number(values.ROLE_HOURLY_GUEST ?? (DEFAULT_ROLE_HOURLY.guest ? 1 : 0)) === 1,
    level1: Number(values.ROLE_HOURLY_LEVEL1 ?? (DEFAULT_ROLE_HOURLY.level1 ? 1 : 0)) === 1,
    level2: Number(values.ROLE_HOURLY_LEVEL2 ?? (DEFAULT_ROLE_HOURLY.level2 ? 1 : 0)) === 1,
    level3: Number(values.ROLE_HOURLY_LEVEL3 ?? (DEFAULT_ROLE_HOURLY.level3 ? 1 : 0)) === 1,
    admin: Number(values.ROLE_HOURLY_ADMIN ?? (DEFAULT_ROLE_HOURLY.admin ? 1 : 0)) === 1,
    owner: Number(values.ROLE_HOURLY_OWNER ?? (DEFAULT_ROLE_HOURLY.owner ? 1 : 0)) === 1,
  };
}

function canAccessHourly(role) {
  const normalized = normalizeRole(role || 'guest');
  const map = getHourlyAccess();
  return Boolean(map[normalized]);
}

function getPowAlertLimits() {
  const values = appConfig.values();
  return {
    level1: Number(values.ROLE_POW_ALERTS_LEVEL1 ?? DEFAULT_ROLE_POW_ALERTS.level1),
    level2: Number(values.ROLE_POW_ALERTS_LEVEL2 ?? DEFAULT_ROLE_POW_ALERTS.level2),
    level3: Number(values.ROLE_POW_ALERTS_LEVEL3 ?? DEFAULT_ROLE_POW_ALERTS.level3),
    admin: Number(values.ROLE_POW_ALERTS_ADMIN ?? DEFAULT_ROLE_POW_ALERTS.admin),
    owner: Number(values.ROLE_POW_ALERTS_OWNER ?? DEFAULT_ROLE_POW_ALERTS.owner),
  };
}

function getPowAlertLimitForRole(role) {
  const normalized = normalizeRole(role || 'level1');
  const limits = getPowAlertLimits();
  const value = limits[normalized];
  return Number.isFinite(value) ? value : DEFAULT_ROLE_POW_ALERTS[normalized] ?? 0;
}

function getCheckPowAccess() {
  const values = appConfig.values();
  return {
    guest: Number(values.ROLE_CHECK_POW_GUEST ?? (DEFAULT_ROLE_CHECK_POW.guest ? 1 : 0)) === 1,
    level1: Number(values.ROLE_CHECK_POW_LEVEL1 ?? (DEFAULT_ROLE_CHECK_POW.level1 ? 1 : 0)) === 1,
    level2: Number(values.ROLE_CHECK_POW_LEVEL2 ?? (DEFAULT_ROLE_CHECK_POW.level2 ? 1 : 0)) === 1,
    level3: Number(values.ROLE_CHECK_POW_LEVEL3 ?? (DEFAULT_ROLE_CHECK_POW.level3 ? 1 : 0)) === 1,
    admin: Number(values.ROLE_CHECK_POW_ADMIN ?? (DEFAULT_ROLE_CHECK_POW.admin ? 1 : 0)) === 1,
    owner: Number(values.ROLE_CHECK_POW_OWNER ?? (DEFAULT_ROLE_CHECK_POW.owner ? 1 : 0)) === 1,
  };
}

function canCheckPow(role) {
  const normalized = normalizeRole(role || 'level1');
  const map = getCheckPowAccess();
  return Boolean(map[normalized]);
}

module.exports = {
  DEFAULT_ROLE_LABELS,
  DEFAULT_ROLE_FAVORITES,
  DEFAULT_ROLE_HOURLY,
  DEFAULT_ROLE_POW_ALERTS,
  DEFAULT_ROLE_CHECK_POW,
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
};

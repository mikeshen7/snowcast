'use strict';

const rolesDb = require('../models/rolesDb');
const roleConfig = require('./roleConfig');

const ALLOWED_ROLES = new Set(['guest', 'free', 'premium', 'admin']);

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

async function listRoles(request, response, next) {
  try {
    await roleConfig.refreshRoleCache();
    const roles = roleConfig.getRolesList();
    return response.status(200).send(roles);
  } catch (error) {
    return next(error);
  }
}

async function updateRole(request, response, next) {
  try {
    const code = String(request.params?.code || '').trim();
    if (!ALLOWED_ROLES.has(code)) {
      return response.status(400).send('Invalid role');
    }
    const defaults = roleConfig.getRoleMap()[code];
    if (!defaults) {
      return response.status(400).send('Unknown role');
    }
    const payload = request.body || {};
    const update = {
      code,
      label: String(payload.label || defaults.label),
      favoritesLimit: parseNumber(payload.favoritesLimit, defaults.favoritesLimit),
      hourlyAccess: parseBoolean(payload.hourlyAccess, defaults.hourlyAccess),
      powAlertsLimit: parseNumber(payload.powAlertsLimit, defaults.powAlertsLimit),
      checkPowAccess: parseBoolean(payload.checkPowAccess, defaults.checkPowAccess),
      forecastBack: parseNumber(payload.forecastBack, defaults.forecastBack),
      forecastForward: parseNumber(payload.forecastForward, defaults.forecastForward),
    };

    const updated = await rolesDb.findOneAndUpdate(
      { code },
      { $set: update },
      { new: true, upsert: true }
    );
    await roleConfig.refreshRoleCache();
    return response.status(200).send(updated);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listRoles,
  updateRole,
};

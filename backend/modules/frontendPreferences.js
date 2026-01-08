'use strict';

const mongoose = require('mongoose');
const adminUserDb = require('../models/adminUserDb');
const { getFrontendUserFromRequest } = require('./frontendAuth');
const { getFavoriteLimitForRole, normalizeRole } = require('./roleConfig');

function normalizeFavoriteIds(input) {
  if (!Array.isArray(input)) return [];
  const normalized = [];
  const seen = new Set();
  input.forEach((id) => {
    const value = String(id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    normalized.push(value);
  });
  return normalized;
}

function normalizeUnits(input) {
  const value = String(input || '').toLowerCase();
  return value === 'metric' ? 'metric' : value === 'imperial' ? 'imperial' : '';
}

async function handleGetPreferences(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const record = await adminUserDb.findById(user.id).lean();
  if (!record) {
    return response.status(404).send({ error: 'User not found' });
  }
  return response.status(200).send({
    favorites: (record.favoriteLocations || []).map((id) => String(id)),
    homeResortId: record.homeResortId ? String(record.homeResortId) : '',
    units: record.unitsPreference || '',
  });
}

async function handleUpdatePreferences(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const favorites = normalizeFavoriteIds(request.body?.favorites);
  const homeResortId = String(request.body?.homeResortId || '').trim();
  const role = normalizeRole(Array.isArray(user.roles) && user.roles.length ? user.roles[0] : 'guest');
  const favoriteLimit = getFavoriteLimitForRole(role);
  const limitedFavorites = favoriteLimit >= 0 ? favorites.slice(0, favoriteLimit) : favorites;
  const nextHomeResortId = mongoose.Types.ObjectId.isValid(homeResortId) ? homeResortId : null;
  const units = normalizeUnits(request.body?.units);
  const record = await adminUserDb.findById(user.id);
  if (!record) {
    return response.status(404).send({ error: 'User not found' });
  }
  record.favoriteLocations = limitedFavorites;
  record.homeResortId = nextHomeResortId;
  if (units) {
    record.unitsPreference = units;
  }
  await record.save();
  return response.status(200).send({
    favorites: limitedFavorites.map((id) => String(id)),
    homeResortId: nextHomeResortId ? String(nextHomeResortId) : '',
    units: record.unitsPreference || '',
  });
}

module.exports = {
  handleGetPreferences,
  handleUpdatePreferences,
};

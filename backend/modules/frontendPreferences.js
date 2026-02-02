// frontend Preferences module.
'use strict';

const mongoose = require('mongoose');
const adminUserDb = require('../models/adminUserDb');
const forecastModels = require('./forecastModels');
const { getFrontendUserFromRequest } = require('./frontendAuth');
const { getFavoriteLimitForRole, normalizeRole } = require('./roleConfig');

// Normalize Favorite Ids.
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

// Normalize Units.
function normalizeUnits(input) {
  const value = String(input || '').toLowerCase();
  return value === 'metric' ? 'metric' : value === 'imperial' ? 'imperial' : '';
}

// Normalize Forecast Model.
function normalizeForecastModel(input) {
  const value = String(input || '').toLowerCase().trim();
  if (value === 'blend') return 'median';
  const allowed = new Set(forecastModels.listModels().map((model) => model.apiModelName));
  allowed.add('median');
  return allowed.has(value) ? value : '';
}

// Normalize Forecast Elevation.
function normalizeForecastElevation(input) {
  const value = String(input || '').toLowerCase().trim();
  const allowed = new Set(['base', 'mid', 'top']);
  return allowed.has(value) ? value : '';
}

// Handle Get Preferences.
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
    name: record.name || '',
    favorites: (record.favoriteLocations || []).map((id) => String(id)),
    homeResortId: record.homeResortId ? String(record.homeResortId) : '',
    units: record.unitsPreference || '',
    forecastModel: record.forecastModel === 'blend' ? 'median' : (record.forecastModel || 'median'),
    forecastElevation: record.forecastElevation || 'mid',
    subscriptionExpiresAt: record.subscriptionExpiresAt ? record.subscriptionExpiresAt.toISOString() : '',
  });
}

// Handle Update Preferences.
async function handleUpdatePreferences(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const favorites = normalizeFavoriteIds(request.body?.favorites);
  const homeResortId = String(request.body?.homeResortId || '').trim();
  const nameInput = request.body?.name;
  const nextName = nameInput === undefined ? undefined : String(nameInput || '').trim();
  if (nextName !== undefined && !nextName) {
    return response.status(400).send({ error: 'Name is required' });
  }
  const role = normalizeRole(Array.isArray(user.roles) && user.roles.length ? user.roles[0] : 'guest');
  const favoriteLimit = getFavoriteLimitForRole(role);
  const limitedFavorites = favoriteLimit >= 0 ? favorites.slice(0, favoriteLimit) : favorites;
  const nextHomeResortId = mongoose.Types.ObjectId.isValid(homeResortId) ? homeResortId : null;
  const units = normalizeUnits(request.body?.units);
  const forecastModel = normalizeForecastModel(request.body?.forecastModel);
  const forecastElevation = normalizeForecastElevation(request.body?.forecastElevation);
  const record = await adminUserDb.findById(user.id);
  if (!record) {
    return response.status(404).send({ error: 'User not found' });
  }
  record.favoriteLocations = limitedFavorites;
  record.homeResortId = nextHomeResortId;
  if (nextName !== undefined) {
    record.name = nextName;
  }
  if (units) {
    record.unitsPreference = units;
  }
  if (forecastModel) {
    record.forecastModel = forecastModel;
  }
  if (forecastElevation) {
    record.forecastElevation = forecastElevation;
  }
  await record.save();
  return response.status(200).send({
    name: record.name || '',
    favorites: limitedFavorites.map((id) => String(id)),
    homeResortId: nextHomeResortId ? String(nextHomeResortId) : '',
    units: record.unitsPreference || '',
    forecastModel: record.forecastModel === 'blend' ? 'median' : (record.forecastModel || 'median'),
    forecastElevation: record.forecastElevation || 'mid',
    subscriptionExpiresAt: record.subscriptionExpiresAt ? record.subscriptionExpiresAt.toISOString() : '',
  });
}

module.exports = {
  handleGetPreferences,
  handleUpdatePreferences,
};

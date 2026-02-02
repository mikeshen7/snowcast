// forecast Models module.
'use strict';

const forecastModelDb = require('../models/forecastModelDb');

let modelCache = null;

// Normalize Model Name.
function normalizeModelName(value) {
  return String(value || '').trim().toLowerCase();
}

// coerce Number helper.
function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Build Model Map From Docs.
function buildModelMapFromDocs(docs) {
  const map = {};
  (docs || []).forEach((doc) => {
    const apiModelName = normalizeModelName(doc.apiModelName);
    if (!apiModelName) return;
    map[apiModelName] = {
      apiModelName,
      displayName: String(doc.displayName || apiModelName),
      description: String(doc.description || ''),
      maxForecastDays: coerceNumber(doc.maxForecastDays, 0),
      refreshHours: coerceNumber(doc.refreshHours, 0),
    };
  });
  return map;
}

// Refresh Model Cache.
async function refreshModelCache() {
  const docs = await forecastModelDb.find({}).sort({ displayName: 1 }).lean();
  modelCache = buildModelMapFromDocs(docs);
  return modelCache;
}

// Get Model Map.
function getModelMap() {
  if (!modelCache) {
    modelCache = {};
  }
  return modelCache;
}

// list Models helper.
function listModels() {
  const map = getModelMap();
  return Object.values(map);
}

// Get Model Config.
function getModelConfig(apiModelName) {
  const map = getModelMap();
  return map[normalizeModelName(apiModelName)] || null;
}

// Get Max Forecast Days.
function getMaxForecastDays(apiModelName) {
  const model = getModelConfig(apiModelName);
  const maxDays = model?.maxForecastDays;
  return Number.isFinite(maxDays) && maxDays > 0 ? maxDays : null;
}

// Update Model.
async function updateModel(apiModelName, payload) {
  const normalized = normalizeModelName(apiModelName);
  if (!normalized) {
    const error = new Error('Invalid model name');
    error.status = 400;
    throw error;
  }
  const update = {};
  if (payload.displayName !== undefined) update.displayName = String(payload.displayName || '').trim();
  if (payload.description !== undefined) update.description = String(payload.description || '').trim();
  if (payload.maxForecastDays !== undefined) {
    update.maxForecastDays = Math.max(1, coerceNumber(payload.maxForecastDays, 1));
  }
  if (payload.refreshHours !== undefined) {
    update.refreshHours = Math.max(0, coerceNumber(payload.refreshHours, 0));
  }
  await forecastModelDb.updateOne({ apiModelName: normalized }, { $set: update }, { upsert: true });
  await refreshModelCache();
  return getModelConfig(normalized);
}

module.exports = {
  refreshModelCache,
  listModels,
  getModelConfig,
  getMaxForecastDays,
  normalizeModelName,
  updateModel,
};

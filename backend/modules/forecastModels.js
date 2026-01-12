// forecast Models module.
'use strict';

const forecastModelDb = require('../models/forecastModelDb');

const DEFAULT_MODELS = [
  {
    code: 'gfs',
    label: 'GFS Seamless',
    apiModelParam: 'gfs_seamless',
    maxForecastDays: 16,
    refreshHours: 1,
    enabled: true,
  },
  {
    code: 'ecmwf',
    label: 'ECMWF IFS',
    apiModelParam: 'ecmwf_ifs',
    maxForecastDays: 15,
    refreshHours: 6,
    enabled: true,
  },
  {
    code: 'hrrr',
    label: 'GFS HRRR',
    apiModelParam: 'gfs_hrrr',
    maxForecastDays: 16,
    refreshHours: 1,
    enabled: true,
  },
];

let modelCache = null;

// Build Default Map.
function buildDefaultMap() {
  const map = {};
  DEFAULT_MODELS.forEach((model) => {
    map[model.code] = { ...model, lastFetchedAt: null };
  });
  return map;
}

// Normalize Model Code.
function normalizeModelCode(value) {
  return String(value || '').trim().toLowerCase();
}

// coerce Number helper.
function coerceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Build Model Map From Docs.
function buildModelMapFromDocs(docs) {
  const map = buildDefaultMap();
  (docs || []).forEach((doc) => {
    const code = normalizeModelCode(doc.code);
    if (!code || !map[code]) return;
    map[code] = {
      code,
      label: doc.label || map[code].label,
      apiModelParam: doc.apiModelParam || map[code].apiModelParam,
      maxForecastDays: coerceNumber(doc.maxForecastDays, map[code].maxForecastDays),
      refreshHours: coerceNumber(doc.refreshHours, map[code].refreshHours),
      enabled: doc.enabled !== undefined ? Boolean(doc.enabled) : map[code].enabled,
      lastFetchedAt: doc.lastFetchedAt || null,
    };
  });
  return map;
}

// Ensure Forecast Model Defaults.
async function ensureForecastModelDefaults() {
  for (const def of DEFAULT_MODELS) {
    await forecastModelDb.updateOne(
      { code: def.code },
      {
        $setOnInsert: {
          code: def.code,
          label: def.label,
          apiModelParam: def.apiModelParam,
          maxForecastDays: def.maxForecastDays,
          refreshHours: def.refreshHours,
          enabled: def.enabled,
          lastFetchedAt: null,
        },
      },
      { upsert: true }
    );
  }
}

// Refresh Model Cache.
async function refreshModelCache() {
  const docs = await forecastModelDb.find({}).lean();
  modelCache = buildModelMapFromDocs(docs);
  return modelCache;
}

// Get Model Map.
function getModelMap() {
  if (!modelCache) {
    modelCache = buildDefaultMap();
  }
  return modelCache;
}

// list Models helper.
function listModels() {
  const map = getModelMap();
  return Object.values(map);
}

// Get Model Config.
function getModelConfig(code) {
  const map = getModelMap();
  return map[normalizeModelCode(code)] || null;
}

// Get Model Api Param.
function getModelApiParam(code) {
  const model = getModelConfig(code);
  return model?.apiModelParam || '';
}

// Get Max Forecast Days.
function getMaxForecastDays(code) {
  const model = getModelConfig(code);
  return model?.maxForecastDays;
}

// Check should Fetch Model.
function shouldFetchModel(code, now = Date.now()) {
  const model = getModelConfig(code);
  if (!model || !model.enabled) return false;
  if (!model.lastFetchedAt) return true;
  const last = new Date(model.lastFetchedAt).getTime();
  if (Number.isNaN(last)) return true;
  const refreshMs = Math.max(0, Number(model.refreshHours) || 0) * 60 * 60 * 1000;
  if (!refreshMs) return true;
  return now - last >= refreshMs;
}

// mark Model Fetched helper.
async function markModelFetched(code, when = new Date()) {
  const normalized = normalizeModelCode(code);
  if (!normalized) return;
  await forecastModelDb.updateOne(
    { code: normalized },
    { $set: { lastFetchedAt: when } }
  );
  if (modelCache && modelCache[normalized]) {
    modelCache[normalized].lastFetchedAt = when;
  }
}

// Update Model.
async function updateModel(code, payload) {
  const normalized = normalizeModelCode(code);
  if (!normalized) {
    const error = new Error('Invalid model code');
    error.status = 400;
    throw error;
  }
  const update = {};
  if (payload.label !== undefined) update.label = String(payload.label || '').trim();
  if (payload.apiModelParam !== undefined) update.apiModelParam = String(payload.apiModelParam || '').trim();
  if (payload.maxForecastDays !== undefined) {
    update.maxForecastDays = Math.max(1, coerceNumber(payload.maxForecastDays, 1));
  }
  if (payload.refreshHours !== undefined) {
    update.refreshHours = Math.max(0, coerceNumber(payload.refreshHours, 0));
  }
  if (payload.enabled !== undefined) {
    update.enabled = Boolean(payload.enabled);
  }
  await forecastModelDb.updateOne({ code: normalized }, { $set: update }, { upsert: true });
  await refreshModelCache();
  return getModelConfig(normalized);
}

module.exports = {
  DEFAULT_MODELS,
  ensureForecastModelDefaults,
  refreshModelCache,
  listModels,
  getModelConfig,
  getModelApiParam,
  getMaxForecastDays,
  shouldFetchModel,
  markModelFetched,
  updateModel,
};

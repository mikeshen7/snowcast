// app Maintenance module.
'use strict';

const hourlyWeatherDb = require('../models/hourlyWeatherDb');
const locationsDb = require('../models/locationsDb');
const weatherApi = require('./weatherApi');
const appConfig = require('./appConfig');
const roleConfig = require('./roleConfig');
const forecastModels = require('./forecastModels');
const { refreshLocationsCache, getCachedLocations } = require('./locations');
const powAlerts = require('./powAlerts');
const { logAdminEvent } = require('./adminLogs');
const { randomUUID } = require('crypto');

// Log Backfill Shortfalls.
function logBackfillShortfalls(location, results) {
  (results || []).forEach((result) => {
    if (result?.requestedDays == null || result?.actualDays == null) return;
    if (result.actualDays >= result.requestedDays) return;
      logAdminEvent({
        type: 'backfill_info',
        message: 'Backfill returned fewer days than requested',
        meta: {
          name: location.name,
          model: result.model,
          elevationKey: result.elevationKey || 'mid',
          requestedDays: result.requestedDays,
          requestedStartDate: result.requestedStartDate,
        requestedEndDate: result.requestedEndDate,
        actualDays: result.actualDays,
        actualStartDate: result.actualStartDate,
        actualEndDate: result.actualEndDate,
      },
    });
  });
}

// Format Date.
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function normalizeModelList(models) {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  return models
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value && !seen.has(value) && (seen.add(value), true));
}

function getLastFetchMs(location, modelName) {
  const map = location?.lastFetchByModel;
  const raw = map?.get?.(modelName) ?? map?.[modelName] ?? null;
  if (!raw) return null;
  const dt = raw instanceof Date ? raw : new Date(raw);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function shouldFetchLocationModel(location, modelConfig, now = Date.now()) {
  if (!modelConfig) return false;
  const lastMs = getLastFetchMs(location, modelConfig.apiModelName);
  const locationHours = Math.max(0, Number(location?.refreshHours) || 0);
  const modelHours = Math.max(0, Number(modelConfig.refreshHours) || 0);
  const refreshHours = Math.max(locationHours, modelHours);
  if (!lastMs) return true;
  if (!refreshHours) return true;
  const refreshMs = refreshHours * 60 * 60 * 1000;
  return now - lastMs >= refreshMs;
}

async function updateLocationModelFetchTimes(location, modelNames, when = new Date()) {
  const updates = {};
  (modelNames || []).forEach((name) => {
    updates[`lastFetchByModel.${name}`] = when;
  });
  if (!Object.keys(updates).length) return;
  await locationsDb.updateOne({ _id: location._id }, { $set: updates });
  if (location.lastFetchByModel?.set) {
    (modelNames || []).forEach((name) => location.lastFetchByModel.set(name, when));
  } else {
    location.lastFetchByModel = location.lastFetchByModel || {};
    (modelNames || []).forEach((name) => {
      location.lastFetchByModel[name] = when;
    });
  }
}

// fetchAllWeather iterates every cached location and fetches weather data.
async function fetchAllWeather(options = {}) {
  const context = options.context || 'forecast';
  const requestOptions = { ...options, context };
  let locations = getCachedLocations();
  if (!locations || locations.length === 0) {
    locations = await refreshLocationsCache();
  }
  const modelConfigs = forecastModels.listModels();
  const modelConfigMap = new Map(modelConfigs.map((model) => [model.apiModelName, model]));
  console.log(JSON.stringify({
    event: 'weather_fetch_all',
    context,
    locationCount: locations?.length || 0,
    options: requestOptions,
  }));
  if (context === 'backfill') {
    for (const location of locations || []) {
      const locationModels = normalizeModelList(location.apiModelNames);
      if (!locationModels.length) continue;
      const jobId = randomUUID();
      logAdminEvent({
        jobId,
        type: 'Backfill',
        status: 'Backfill started',
        location: location.name,
        message: '',
        meta: { context },
      });
      const results = [];
      let errorDetail = null;
      const tasks = [];
      for (const elevation of weatherApi.listLocationElevations(location)) {
        for (const modelName of locationModels) {
          const modelConfig = modelConfigMap.get(modelName);
          if (!modelConfig) continue;
          const task = weatherApi
            .fetchLocation(location, {
              ...requestOptions,
              model: modelConfig.apiModelName,
              elevationKey: elevation.key,
              elevationFt: elevation.elevationFt,
            })
            .then((result) => {
              if (result) results.push(result);
              return { ok: true };
            })
            .catch((err) => {
              errorDetail = {
                model: modelConfig.apiModelName,
                elevationKey: elevation.key,
                message: err.message,
              };
              console.log(JSON.stringify({
                event: 'weather_backfill_error',
                locationId: String(location._id),
                name: location.name,
                context,
                model: modelConfig.apiModelName,
                elevationKey: elevation.key,
                error: err.message,
              }));
              return { ok: false };
            });
          tasks.push(task);
        }
      }
      await Promise.all(tasks);
      logBackfillShortfalls(location, results);
      if (errorDetail) {
        logAdminEvent({
          jobId,
          type: 'Backfill',
          status: 'Error',
          location: location.name,
          message: `Model: ${errorDetail.model} • Elevation: ${errorDetail.elevationKey} • ${errorDetail.message}`,
        });
      } else {
        logAdminEvent({
          jobId,
          type: 'Backfill',
          status: 'Backfill complete',
          location: location.name,
          message: '',
        });
      }
    }
    return;
  }

  for (const location of locations || []) {
    const locationModels = normalizeModelList(location.apiModelNames);
    if (!locationModels.length) continue;
    const jobId = randomUUID();
    logAdminEvent({
      jobId,
      type: 'Fetch',
      status: 'Fetch started',
      location: location.name,
      message: '',
      meta: { context },
    });
    let errorDetail = null;
    const tasks = [];
    const successfulModels = new Set();
    for (const modelName of locationModels) {
      const modelConfig = modelConfigMap.get(modelName);
      if (!modelConfig) continue;
      if (!shouldFetchLocationModel(location, modelConfig)) continue;
      for (const elevation of weatherApi.listLocationElevations(location)) {
        const task = weatherApi
          .fetchLocation(location, {
            ...requestOptions,
            model: modelConfig.apiModelName,
            forecastDays: modelConfig.maxForecastDays,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then(() => {
            successfulModels.add(modelConfig.apiModelName);
            return { ok: true };
          })
          .catch((err) => {
            errorDetail = {
              model: modelConfig.apiModelName,
              elevationKey: elevation.key,
              message: err.message,
            };
            console.log(JSON.stringify({
              event: 'weather_fetch_error',
              locationId: String(location._id),
              name: location.name,
              context,
              model: modelConfig.apiModelName,
              elevationKey: elevation.key,
              error: err.message,
            }));
            return { ok: false };
          });
        tasks.push(task);
      }
    }
    await Promise.all(tasks);
    if (successfulModels.size) {
      await updateLocationModelFetchTimes(location, Array.from(successfulModels), new Date());
    }
    if (errorDetail) {
      logAdminEvent({
        jobId,
        type: 'Fetch',
        status: 'Error',
        location: location.name,
        message: `Model: ${errorDetail.model} • Elevation: ${errorDetail.elevationKey} • ${errorDetail.message}`,
      });
    } else {
      logAdminEvent({
        jobId,
        type: 'Fetch',
        status: 'Fetch complete',
        location: location.name,
        message: '',
      });
    }
  }
}

// backfillAllWeather fetches historical windows for all locations.
async function backfillAllWeather(daysBack = appConfig.values().DB_BACKFILL_DAYS) {
  try {
    const config = appConfig.values();
    const endDate = formatDate(new Date());
    const startDate = formatDate(new Date(Date.now() - daysBack * config.MS_PER_DAY));
    console.log(JSON.stringify({
      event: 'weather_backfill_start',
      daysBack,
      startDate,
      endDate,
    }));
    await fetchAllWeather({ startDate, endDate, context: 'backfill' });
  } catch (error) {
    console.error('*** backfillAllWeather error:', error.message);
  }
}

// backfill Locations helper.
async function backfillLocations({ locationIds = [] } = {}) {
  const config = appConfig.values();
  const endDate = formatDate(new Date());
  const startDate = formatDate(new Date(Date.now() - config.DB_BACKFILL_DAYS * config.MS_PER_DAY));
  let locations = getCachedLocations();
  if (!locations || locations.length === 0) {
    locations = await refreshLocationsCache();
  }
  // wanted helper.
  const wanted = new Set((locationIds || []).map((id) => String(id)));
  // selected helper.
  const selected = (locations || []).filter((loc) => wanted.has(String(loc._id)));
  console.log(JSON.stringify({
    event: 'weather_backfill_manual',
    locationCount: selected.length,
    startDate,
    endDate,
  }));
  const modelConfigs = forecastModels.listModels();
  const modelConfigMap = new Map(modelConfigs.map((model) => [model.apiModelName, model]));
  for (const location of selected) {
    const locationModels = normalizeModelList(location.apiModelNames);
    if (!locationModels.length) continue;
    const jobId = randomUUID();
    logAdminEvent({
      jobId,
      type: 'Backfill',
      status: 'Backfill started',
      location: location.name,
      message: '',
      meta: { context: 'manual_backfill' },
    });
    const results = [];
    let errorDetail = null;
    const tasks = [];
    for (const elevation of weatherApi.listLocationElevations(location)) {
      for (const modelName of locationModels) {
        const modelConfig = modelConfigMap.get(modelName);
        if (!modelConfig) continue;
        const task = weatherApi
          .fetchLocation(location, {
            startDate,
            endDate,
            context: 'backfill',
            model: modelConfig.apiModelName,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then((result) => {
            if (result) results.push(result);
            return { ok: true };
          })
          .catch((err) => {
            errorDetail = {
              model: modelConfig.apiModelName,
              elevationKey: elevation.key,
              message: err.message,
            };
            console.log(JSON.stringify({
              event: 'weather_backfill_error',
              locationId: String(location._id),
              name: location.name,
              elevationKey: elevation.key,
              error: err.message,
            }));
            return { ok: false };
          });
        tasks.push(task);
      }
    }
    await Promise.all(tasks);
    logBackfillShortfalls(location, results);
    if (errorDetail) {
      logAdminEvent({
        jobId,
        type: 'Backfill',
        status: 'Error',
        location: location.name,
        message: `Model: ${errorDetail.model} • Elevation: ${errorDetail.elevationKey} • ${errorDetail.message}`,
      });
    } else {
      logAdminEvent({
        jobId,
        type: 'Backfill',
        status: 'Backfill complete',
        location: location.name,
        message: '',
      });
    }
  }
  return { count: selected.length };
}

// Fetch Forecast Locations.
async function fetchForecastLocations({ locationIds = [], force = false } = {}) {
  let locations = getCachedLocations();
  if (!locations || locations.length === 0) {
    locations = await refreshLocationsCache();
  }
  // wanted helper.
  const wanted = new Set((locationIds || []).map((id) => String(id)));
  // selected helper.
  const selected = (locations || []).filter((loc) => wanted.has(String(loc._id)));
  if (!selected.length) {
    return { count: 0 };
  }

  // models helper.
  const modelConfigs = forecastModels.listModels();
  const modelConfigMap = new Map(modelConfigs.map((model) => [model.apiModelName, model]));
  for (const location of selected) {
    const locationModels = normalizeModelList(location.apiModelNames);
    if (!locationModels.length) continue;
    const jobId = randomUUID();
    logAdminEvent({
      jobId,
      type: 'Fetch',
      status: 'Fetch started',
      location: location.name,
      message: '',
      meta: { context: 'manual_fetch' },
    });
    let errorDetail = null;
    const tasks = [];
    const successfulModels = new Set();
    for (const modelName of locationModels) {
      const modelConfig = modelConfigMap.get(modelName);
      if (!modelConfig) continue;
      const shouldFetch = force || shouldFetchLocationModel(location, modelConfig);
      if (!shouldFetch) continue;
      for (const elevation of weatherApi.listLocationElevations(location)) {
        const task = weatherApi
          .fetchLocation(location, {
            forecastDays: modelConfig.maxForecastDays,
            context: 'forecast',
            model: modelConfig.apiModelName,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then(() => {
            successfulModels.add(modelConfig.apiModelName);
            return { ok: true };
          })
          .catch((err) => {
            errorDetail = {
              model: modelConfig.apiModelName,
              elevationKey: elevation.key,
              message: err.message,
            };
            console.log(JSON.stringify({
              event: 'weather_fetch_error',
              locationId: String(location._id),
              name: location.name,
              context: 'forecast',
              model: modelConfig.apiModelName,
              elevationKey: elevation.key,
              error: err.message,
            }));
            return { ok: false };
          });
        tasks.push(task);
      }
    }
    await Promise.all(tasks);
    if (successfulModels.size) {
      await updateLocationModelFetchTimes(location, Array.from(successfulModels), new Date());
    }
    if (errorDetail) {
      logAdminEvent({
        jobId,
        type: 'Fetch',
        status: 'Error',
        location: location.name,
        message: `Model: ${errorDetail.model} • Elevation: ${errorDetail.elevationKey} • ${errorDetail.message}`,
      });
    } else {
      logAdminEvent({
        jobId,
        type: 'Fetch',
        status: 'Fetch complete',
        location: location.name,
        message: '',
      });
    }
  }

  return { count: selected.length };
}

// removeOrphanHourlyWeather deletes hourly docs for deleted locations.
async function removeOrphanHourlyWeather() {
  try {
    let locations = getCachedLocations();
    if (!locations || locations.length === 0) {
      locations = await refreshLocationsCache();
    }
    // location Ids helper.
    const locationIds = (locations || []).map((r) => String(r._id));
    if (locationIds.length === 0) return;

    const result = await hourlyWeatherDb.deleteMany({
      locationId: { $exists: true, $nin: locationIds },
    });
    logAdminEvent({
      type: 'Database',
      status: `Orphan weather removed: ${result.deletedCount || 0}`,
      location: '',
      message: '',
    });
  } catch (err) {
    console.error('*** removeOrphanHourlyWeather error:', err.message);
  }
}

// removeOldHourlyWeather purges hourly docs older than retention window.
async function removeOldHourlyWeather() {
  try {
    const config = appConfig.values();
    const cutoff = Date.now() - config.DB_DAYS_TO_KEEP * config.MS_PER_DAY;
    const result = await hourlyWeatherDb.deleteMany({ dateTimeEpoch: { $lt: cutoff } });
    logAdminEvent({
      type: 'Database',
      status: `Old weather removed: ${result.deletedCount || 0}`,
      location: '',
      message: '',
    });
  } catch (err) {
    console.error('*** removeOldHourlyWeather error:', err.message);
  }
}

// startMaintenance kicks off cleanup, fetch, and backfill schedules.
function startMaintenance() {
  logAdminEvent({
    type: 'Server',
    status: 'Starting maintenance loops',
    location: '',
    message: '',
  });
  removeOrphanHourlyWeather();
  removeOldHourlyWeather();

  const config = appConfig.values();
  const hourMs = config.MS_PER_DAY / 24;
  setInterval(removeOrphanHourlyWeather, config.DB_CLEAN_INTERVAL_HOURS * hourMs);
  setInterval(removeOldHourlyWeather, config.DB_CLEAN_INTERVAL_HOURS * hourMs);
  setInterval(fetchAllWeather, config.DB_FETCH_INTERVAL_HOURS * hourMs);
  setInterval(() => backfillAllWeather(config.DB_BACKFILL_DAYS), config.DB_BACKFILL_INTERVAL_HOURS * hourMs);
  setInterval(appConfig.refreshConfigCache, config.CONFIG_REFRESH_INTERVAL_HOURS * hourMs);
  setInterval(roleConfig.refreshRoleCache, config.CONFIG_REFRESH_INTERVAL_HOURS * hourMs);
  setInterval(forecastModels.refreshModelCache, config.CONFIG_REFRESH_INTERVAL_HOURS * hourMs);
  setInterval(() => {
    powAlerts.checkAllAlerts().catch((err) => {
      console.error('*** pow alert schedule error:', err.message);
    });
  }, 15 * 60 * 1000);
}

module.exports = {
  fetchAllWeather,
  backfillAllWeather,
  backfillLocations,
  fetchForecastLocations,
  removeOrphanHourlyWeather,
  removeOldHourlyWeather,
  startMaintenance,
};

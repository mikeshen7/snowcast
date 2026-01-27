// app Maintenance module.
'use strict';

const hourlyWeatherDb = require('../models/hourlyWeatherDb');
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

// fetchAllWeather iterates every cached location and fetches weather data.
async function fetchAllWeather(options = {}) {
  const context = options.context || 'forecast';
  const requestOptions = { ...options, context };
  if (!requestOptions.startDate && !requestOptions.endDate && requestOptions.forecastDays == null) {
    requestOptions.forecastDays = 16; // pull max available forecast window
  }
  let locations = getCachedLocations();
  if (!locations || locations.length === 0) {
    locations = await refreshLocationsCache();
  }
  console.log(JSON.stringify({
    event: 'weather_fetch_all',
    context,
    locationCount: locations?.length || 0,
    options: requestOptions,
  }));
  if (context === 'backfill') {
    const models = forecastModels.listModels().filter((model) => model.enabled);
    for (const location of locations || []) {
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
        for (const model of models) {
          const task = weatherApi
            .fetchLocation(location, {
              ...requestOptions,
              model: model.code,
              elevationKey: elevation.key,
              elevationFt: elevation.elevationFt,
            })
            .then((result) => {
              if (result) results.push(result);
              return { ok: true };
            })
            .catch((err) => {
              errorDetail = {
                model: model.code,
                elevationKey: elevation.key,
                message: err.message,
              };
              console.log(JSON.stringify({
                event: 'weather_backfill_error',
                locationId: String(location._id),
                name: location.name,
                context,
                model: model.code,
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

  const models = forecastModels.listModels().filter((model) => model.enabled);
  const fetchableModels = models.filter((model) => forecastModels.shouldFetchModel(model.code));
  const modelSuccess = new Map();
  for (const location of locations || []) {
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
    for (const model of fetchableModels) {
      for (const elevation of weatherApi.listLocationElevations(location)) {
        const task = weatherApi
          .fetchLocation(location, {
            ...requestOptions,
            model: model.code,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then(() => {
            modelSuccess.set(model.code, (modelSuccess.get(model.code) || 0) + 1);
            return { ok: true };
          })
          .catch((err) => {
            errorDetail = {
              model: model.code,
              elevationKey: elevation.key,
              message: err.message,
            };
            console.log(JSON.stringify({
              event: 'weather_fetch_error',
              locationId: String(location._id),
              name: location.name,
              context,
              model: model.code,
              elevationKey: elevation.key,
              error: err.message,
            }));
            return { ok: false };
          });
        tasks.push(task);
      }
    }
    await Promise.all(tasks);
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
  for (const model of fetchableModels) {
    const successCount = modelSuccess.get(model.code) || 0;
    if (successCount > 0) {
      await forecastModels.markModelFetched(model.code);
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
  const models = forecastModels.listModels().filter((model) => model.enabled);
  for (const location of selected) {
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
      for (const model of models) {
        const task = weatherApi
          .fetchLocation(location, {
            startDate,
            endDate,
            context: 'backfill',
            model: model.code,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then((result) => {
            if (result) results.push(result);
            return { ok: true };
          })
          .catch((err) => {
            errorDetail = {
              model: model.code,
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
  const models = forecastModels.listModels().filter((model) => model.enabled);
  const modelSuccess = new Map();
  for (const location of selected) {
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
    for (const model of models) {
      const modelTasks = [];
      const shouldFetch = force || forecastModels.shouldFetchModel(model.code);
      if (!shouldFetch) continue;
      for (const elevation of weatherApi.listLocationElevations(location)) {
        const task = weatherApi
          .fetchLocation(location, {
            forecastDays: 16,
            context: 'forecast',
            model: model.code,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then(() => {
            modelSuccess.set(model.code, (modelSuccess.get(model.code) || 0) + 1);
            return { ok: true };
          })
          .catch((err) => {
            errorDetail = {
              model: model.code,
              elevationKey: elevation.key,
              message: err.message,
            };
            console.log(JSON.stringify({
              event: 'weather_fetch_error',
              locationId: String(location._id),
              name: location.name,
              context: 'forecast',
              model: model.code,
              elevationKey: elevation.key,
              error: err.message,
            }));
            return { ok: false };
          });
        tasks.push(task);
        modelTasks.push(task);
      }
    }
    await Promise.all(tasks);
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
  for (const model of models) {
    const successCount = modelSuccess.get(model.code) || 0;
    if (successCount > 0) {
      await forecastModels.markModelFetched(model.code);
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

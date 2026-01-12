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
    for (const location of locations || []) {
      const elevationTasks = weatherApi.listLocationElevations(location).map((elevation) => (async () => {
        try {
          const results = await weatherApi.fetchLocationModels(location, {
            ...requestOptions,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          });
          logBackfillShortfalls(location, results);
          if (!results || results.length === 0) {
            logAdminEvent({
              type: 'backfill',
              message: 'Backfill location completed',
              meta: {
                name: location.name,
                elevationKey: elevation.key,
                model: 'unknown',
                startDate: requestOptions.startDate,
                endDate: requestOptions.endDate,
              },
            });
          }
          (results || []).forEach((result) => {
            logAdminEvent({
              type: 'backfill',
              message: 'Backfill location completed',
              meta: {
                name: location.name,
                elevationKey: elevation.key,
                model: result?.model,
                startDate: requestOptions.startDate,
                endDate: requestOptions.endDate,
              },
            });
          });
        } catch (err) {
          logAdminEvent({
            type: 'fetch_error',
            message: err.message,
            meta: {
              locationId: String(location._id),
              name: location.name,
              context,
              elevationKey: elevation.key,
              details: err?.meta,
            },
          });
          console.log(JSON.stringify({
            event: 'weather_fetch_error',
            locationId: String(location._id),
            name: location.name,
            context,
            elevationKey: elevation.key,
            error: err.message,
          }));
        }
      })());
      await Promise.all(elevationTasks);
    }
    return;
  }

  // models helper.
  const models = forecastModels.listModels().filter((model) => model.enabled);
  logAdminEvent({
    type: 'fetch',
    message: 'Forecast fetch started',
    meta: {
      context,
      locationCount: locations?.length || 0,
      models: models.map((model) => model.code),
    },
  });
  const modelTasks = new Map();
  for (const model of models) {
    const shouldFetch = forecastModels.shouldFetchModel(model.code);
    if (!shouldFetch) {
      continue;
    }
    const tasks = [];
    for (const location of locations || []) {
      for (const elevation of weatherApi.listLocationElevations(location)) {
        const task = weatherApi
          .fetchLocation(location, {
            ...requestOptions,
            model: model.code,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then(() => ({ ok: true }))
          .catch((err) => {
            logAdminEvent({
              type: 'fetch_error',
              message: err.message,
              meta: {
                name: location.name,
                context,
                model: model.code,
                elevationKey: elevation.key,
                details: err?.meta,
              },
            });
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
    modelTasks.set(model.code, tasks);
  }
  for (const model of models) {
    const tasks = modelTasks.get(model.code);
    if (!tasks) {
      continue;
    }
    const results = await Promise.all(tasks);
    const successCount = results.filter((result) => result.ok).length;
    if (successCount > 0) {
      await forecastModels.markModelFetched(model.code);
    }
    logAdminEvent({
      type: 'fetch',
      message: 'Forecast fetch completed',
      meta: {
        context,
        model: model.code,
        locationCount: locations?.length || 0,
        successCount,
      },
    });
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
  const tasks = [];
  for (const location of selected) {
    const elevationTasks = weatherApi.listLocationElevations(location).map((elevation) => (async () => {
      try {
        const results = await weatherApi.fetchLocationModels(location, {
          startDate,
          endDate,
          context: 'backfill',
          elevationKey: elevation.key,
          elevationFt: elevation.elevationFt,
        });
        logBackfillShortfalls(location, results);
        if (!results || results.length === 0) {
          logAdminEvent({
            type: 'backfill',
            message: 'Manual backfill location completed',
            meta: {
              name: location.name,
              elevationKey: elevation.key,
              model: 'unknown',
              startDate,
              endDate,
            },
          });
        }
        (results || []).forEach((result) => {
          logAdminEvent({
            type: 'backfill',
            message: 'Manual backfill location completed',
            meta: {
              name: location.name,
              elevationKey: elevation.key,
              model: result?.model,
              startDate,
              endDate,
            },
          });
        });
      } catch (err) {
        logAdminEvent({
          type: 'backfill_error',
          message: err.message,
          meta: {
            name: location.name,
            elevationKey: elevation.key,
            details: err?.meta,
          },
        });
        console.log(JSON.stringify({
          event: 'weather_backfill_error',
          locationId: String(location._id),
          name: location.name,
          elevationKey: elevation.key,
          error: err.message,
        }));
      }
    })());
    tasks.push(...elevationTasks);
  }
  await Promise.all(tasks);
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
  logAdminEvent({
    type: 'fetch',
    message: 'Manual forecast fetch started',
    meta: {
      context: 'manual_fetch',
      locationCount: selected.length,
      models: models.map((model) => model.code),
    },
  });
  const modelTasks = new Map();
  for (const model of models) {
    if (!force && !forecastModels.shouldFetchModel(model.code)) {
      continue;
    }
    const tasks = [];
    for (const location of selected) {
      for (const elevation of weatherApi.listLocationElevations(location)) {
        const task = weatherApi
          .fetchLocation(location, {
            forecastDays: 16,
            context: 'forecast',
            model: model.code,
            elevationKey: elevation.key,
            elevationFt: elevation.elevationFt,
          })
          .then(() => ({ ok: true }))
          .catch((err) => {
            logAdminEvent({
              type: 'fetch_error',
              message: err.message,
              meta: {
                name: location.name,
                context: 'forecast',
                model: model.code,
                elevationKey: elevation.key,
                details: err?.meta,
              },
            });
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
      }
    }
    modelTasks.set(model.code, tasks);
  }
  for (const model of models) {
    const tasks = modelTasks.get(model.code);
    if (!tasks) {
      continue;
    }
    const results = await Promise.all(tasks);
    const successCount = results.filter((result) => result.ok).length;
    if (successCount > 0) {
      await forecastModels.markModelFetched(model.code);
    }
    logAdminEvent({
      type: 'fetch',
      message: 'Manual forecast fetch completed',
      meta: {
        context: 'manual_fetch',
        model: model.code,
        locationCount: selected.length,
        successCount,
      },
    });
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
    console.log(JSON.stringify({
      event: 'orphan_hourly_weather_removed',
      count: result.deletedCount || 0,
    }));
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
    console.log(JSON.stringify({
      event: 'old_hourly_weather_removed',
      count: result.deletedCount || 0,
    }));
  } catch (err) {
    console.error('*** removeOldHourlyWeather error:', err.message);
  }
}

// startMaintenance kicks off cleanup, fetch, and backfill schedules.
function startMaintenance() {
  console.log('Starting maintenance loops');
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

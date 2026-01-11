'use strict';

const hourlyWeatherDb = require('../models/hourlyWeatherDb');
const weatherApi = require('./weatherApi');
const appConfig = require('./appConfig');
const roleConfig = require('./roleConfig');
const { refreshLocationsCache, getCachedLocations } = require('./locations');
const powAlerts = require('./powAlerts');

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
  for (const location of locations || []) {
    try {
      await weatherApi.fetchLocation(location, requestOptions);
    } catch (err) {
      console.log(JSON.stringify({
        event: 'weather_fetch_error',
        locationId: String(location._id),
        name: location.name,
        context,
        error: err.message,
      }));
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

async function backfillLocations({ locationIds = [] } = {}) {
  const config = appConfig.values();
  const endDate = formatDate(new Date());
  const startDate = formatDate(new Date(Date.now() - config.DB_BACKFILL_DAYS * config.MS_PER_DAY));
  let locations = getCachedLocations();
  if (!locations || locations.length === 0) {
    locations = await refreshLocationsCache();
  }
  const wanted = new Set((locationIds || []).map((id) => String(id)));
  const selected = (locations || []).filter((loc) => wanted.has(String(loc._id)));
  console.log(JSON.stringify({
    event: 'weather_backfill_manual',
    locationCount: selected.length,
    startDate,
    endDate,
  }));
  for (const location of selected) {
    try {
      await weatherApi.fetchLocation(location, { startDate, endDate, context: 'backfill' });
    } catch (err) {
      console.log(JSON.stringify({
        event: 'weather_backfill_error',
        locationId: String(location._id),
        name: location.name,
        error: err.message,
      }));
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
  removeOrphanHourlyWeather,
  removeOldHourlyWeather,
  startMaintenance,
};

'use strict';

const appConfigDb = require('../models/appConfigDb');

const defaults = {
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  WEATHER_API_MAX_DAYS_BACK: 60,
  WEATHER_API_MAX_DAYS_FORWARD: 14,
  DB_BACKFILL_DAYS: 14,
  DB_FETCH_INTERVAL_HOURS: 2,
  DB_CLEAN_INTERVAL_HOURS: 24,
  DB_BACKFILL_INTERVAL_HOURS: 24,
  DB_DAYS_TO_KEEP: 60,
  LOCATION_FETCH_RADIUS_MI: 30,
  CONFIG_REFRESH_INTERVAL_HOURS: 24,
  LOCATION_STORE_RADIUS_MI: 5,
  API_CLIENT_RATE_LIMIT_DEFAULT: 60,
  API_CLIENT_DAILY_QUOTA_DEFAULT: 5000,
  RATE_LIMIT_ADMIN: 60,
  TTL_BACKEND_SESSION_MINUTES: 60,
  TTL_AUTH_TOKEN_MINUTES: 15,
  TTL_FRONTEND_SESSION_MINUTES: 1440,
};

const DEFAULT_CONFIG = {
  WEATHER_API_MAX_DAYS_BACK: {
    value: defaults.WEATHER_API_MAX_DAYS_BACK,
    description: 'Maximum historical days allowed for queries.'
  },
  WEATHER_API_MAX_DAYS_FORWARD: {
    value: defaults.WEATHER_API_MAX_DAYS_FORWARD,
    description: 'Maximum future days allowed from provider.'
  },
  DB_BACKFILL_DAYS: {
    value: defaults.DB_BACKFILL_DAYS,
    description: 'Days of history to backfill on startup.'
  },
  DB_FETCH_INTERVAL_HOURS: {
    value: defaults.DB_FETCH_INTERVAL_HOURS,
    description: 'Interval for forecast fetch jobs (hours).'
  },
  DB_CLEAN_INTERVAL_HOURS: {
    value: defaults.DB_CLEAN_INTERVAL_HOURS,
    description: 'Interval for cleanup jobs (hours).'
  },
  DB_BACKFILL_INTERVAL_HOURS: {
    value: defaults.DB_BACKFILL_INTERVAL_HOURS,
    description: 'Interval between automatic backfills (hours).'
  },
  DB_DAYS_TO_KEEP: {
    value: defaults.DB_DAYS_TO_KEEP,
    description: 'Number of days of hourly data to retain.'
  },
  LOCATION_FETCH_RADIUS_MI: {
    value: defaults.LOCATION_FETCH_RADIUS_MI,
    description: 'Max distance (miles) when searching nearest location.'
  },
  CONFIG_REFRESH_INTERVAL_HOURS: {
    value: defaults.CONFIG_REFRESH_INTERVAL_HOURS,
    description: 'Interval between automatic config cache refreshes (hours).'
  },
  LOCATION_STORE_RADIUS_MI: {
    value: defaults.LOCATION_STORE_RADIUS_MI,
    description: 'Minimum allowed distance (miles) between stored locations.'
  },
  API_CLIENT_RATE_LIMIT_DEFAULT: {
    value: defaults.API_CLIENT_RATE_LIMIT_DEFAULT,
    description: 'Default per-minute request limit for new API clients (set <=0 for unlimited).'
  },
  API_CLIENT_DAILY_QUOTA_DEFAULT: {
    value: defaults.API_CLIENT_DAILY_QUOTA_DEFAULT,
    description: 'Default daily request quota for new API clients (set <=0 for unlimited).'
  },
  RATE_LIMIT_ADMIN: {
    value: defaults.RATE_LIMIT_ADMIN,
    description: 'Max admin requests per minute (0 or negative = unlimited).'
  },
  TTL_BACKEND_SESSION_MINUTES: {
    value: defaults.TTL_BACKEND_SESSION_MINUTES,
    description: 'Backend admin session lifetime in minutes.'
  },
  TTL_FRONTEND_SESSION_MINUTES: {
    value: defaults.TTL_FRONTEND_SESSION_MINUTES,
    description: 'Frontend session lifetime in minutes.'
  },
  TTL_AUTH_TOKEN_MINUTES: {
    value: defaults.TTL_AUTH_TOKEN_MINUTES,
    description: 'Magic-link token lifetime in minutes.'
  },
};

const cache = new Map();
let values = buildValuesFromCache();

async function ensureWeatherConfigDefaults() {
  for (const [key, meta] of Object.entries(DEFAULT_CONFIG)) {
    await appConfigDb.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          value: meta.value,
          description: meta.description,
        },
      },
      { upsert: true }
    );
  }
  await refreshConfigCache();
}

async function refreshConfigCache() {
  const docs = await appConfigDb.find({}).lean();
  cache.clear();
  docs.forEach((doc) => {
    cache.set(doc.key, doc.value);
  });
  values = buildValuesFromCache();
  console.log(JSON.stringify({
    event: 'config_cache_refreshed',
    entries: cache.size,
  }));
  return getConfigMap();
}

function getConfigMap() {
  const map = {};
  for (const [key, value] of cache.entries()) {
    map[key] = value;
  }
  return map;
}

async function setConfigValue(key, value) {
  const meta = DEFAULT_CONFIG[key];
  await appConfigDb.updateOne(
    { key },
    {
      $set: {
        key,
        value,
        description: meta?.description || '',
      },
    },
    { upsert: true }
  );
  cache.set(key, value);
  values = buildValuesFromCache();
  return { key, value };
}

function buildValuesFromCache() {
  return {
    MS_PER_DAY: defaults.MS_PER_DAY,
    WEATHER_API_MAX_DAYS_BACK: readValue('WEATHER_API_MAX_DAYS_BACK', defaults.WEATHER_API_MAX_DAYS_BACK),
    WEATHER_API_MAX_DAYS_FORWARD: readValue('WEATHER_API_MAX_DAYS_FORWARD', defaults.WEATHER_API_MAX_DAYS_FORWARD),
    DB_BACKFILL_DAYS: readValue('DB_BACKFILL_DAYS', defaults.DB_BACKFILL_DAYS),
    DB_FETCH_INTERVAL_HOURS: readValue('DB_FETCH_INTERVAL_HOURS', defaults.DB_FETCH_INTERVAL_HOURS),
    DB_CLEAN_INTERVAL_HOURS: readValue('DB_CLEAN_INTERVAL_HOURS', defaults.DB_CLEAN_INTERVAL_HOURS),
    DB_BACKFILL_INTERVAL_HOURS: readValue('DB_BACKFILL_INTERVAL_HOURS', defaults.DB_BACKFILL_INTERVAL_HOURS),
    DB_DAYS_TO_KEEP: readValue('DB_DAYS_TO_KEEP', defaults.DB_DAYS_TO_KEEP),
    LOCATION_FETCH_RADIUS_MI: readValue('LOCATION_FETCH_RADIUS_MI', defaults.LOCATION_FETCH_RADIUS_MI),
    CONFIG_REFRESH_INTERVAL_HOURS: readValue('CONFIG_REFRESH_INTERVAL_HOURS', defaults.CONFIG_REFRESH_INTERVAL_HOURS),
    LOCATION_STORE_RADIUS_MI: readValue('LOCATION_STORE_RADIUS_MI', defaults.LOCATION_STORE_RADIUS_MI),
    API_CLIENT_RATE_LIMIT_DEFAULT: readValue('API_CLIENT_RATE_LIMIT_DEFAULT', defaults.API_CLIENT_RATE_LIMIT_DEFAULT),
    API_CLIENT_DAILY_QUOTA_DEFAULT: readValue('API_CLIENT_DAILY_QUOTA_DEFAULT', defaults.API_CLIENT_DAILY_QUOTA_DEFAULT),
    RATE_LIMIT_ADMIN: readValue('RATE_LIMIT_ADMIN', defaults.RATE_LIMIT_ADMIN),
    TTL_BACKEND_SESSION_MINUTES: readValue('TTL_BACKEND_SESSION_MINUTES', defaults.TTL_BACKEND_SESSION_MINUTES),
    TTL_FRONTEND_SESSION_MINUTES: readValue('TTL_FRONTEND_SESSION_MINUTES', defaults.TTL_FRONTEND_SESSION_MINUTES),
    TTL_AUTH_TOKEN_MINUTES: readValue('TTL_AUTH_TOKEN_MINUTES', defaults.TTL_AUTH_TOKEN_MINUTES),
  };
}

function readValue(key, fallback) {
  return cache.has(key) ? cache.get(key) : fallback;
}

module.exports = {
  ensureWeatherConfigDefaults,
  refreshConfigCache,
  getConfigMap,
  setConfigValue,
  DEFAULT_CONFIG,
  values: () => values,
};

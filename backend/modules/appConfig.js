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
  ROLE_LABEL_GUEST: 'Guest',
  ROLE_LABEL_LEVEL1: 'Starter',
  ROLE_LABEL_LEVEL2: 'Plus',
  ROLE_LABEL_LEVEL3: 'Pro',
  ROLE_LABEL_ADMIN: 'Admin',
  ROLE_LABEL_OWNER: 'Owner',
  ROLE_FAVORITES_GUEST: 0,
  ROLE_FAVORITES_LEVEL1: 1,
  ROLE_FAVORITES_LEVEL2: 3,
  ROLE_FAVORITES_LEVEL3: -1,
  ROLE_FAVORITES_ADMIN: -1,
  ROLE_FAVORITES_OWNER: -1,
  ROLE_HOURLY_GUEST: 0,
  ROLE_HOURLY_LEVEL1: 0,
  ROLE_HOURLY_LEVEL2: 1,
  ROLE_HOURLY_LEVEL3: 1,
  ROLE_HOURLY_ADMIN: 1,
  ROLE_HOURLY_OWNER: 1,
  ROLE_POW_ALERTS_LEVEL1: 1,
  ROLE_POW_ALERTS_LEVEL2: 3,
  ROLE_POW_ALERTS_LEVEL3: 10,
  ROLE_POW_ALERTS_ADMIN: -1,
  ROLE_POW_ALERTS_OWNER: -1,
  ROLE_CHECK_POW_LEVEL1: 0,
  ROLE_CHECK_POW_LEVEL2: 0,
  ROLE_CHECK_POW_LEVEL3: 1,
  ROLE_CHECK_POW_ADMIN: 1,
  ROLE_CHECK_POW_OWNER: 1,
  ROLE_CHECK_POW_GUEST: 0,
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
  ROLE_LABEL_GUEST: {
    value: defaults.ROLE_LABEL_GUEST,
    description: 'Display label for the guest role.'
  },
  ROLE_LABEL_LEVEL1: {
    value: defaults.ROLE_LABEL_LEVEL1,
    description: 'Display label for level1 users.'
  },
  ROLE_LABEL_LEVEL2: {
    value: defaults.ROLE_LABEL_LEVEL2,
    description: 'Display label for level2 users.'
  },
  ROLE_LABEL_LEVEL3: {
    value: defaults.ROLE_LABEL_LEVEL3,
    description: 'Display label for level3 users.'
  },
  ROLE_LABEL_ADMIN: {
    value: defaults.ROLE_LABEL_ADMIN,
    description: 'Display label for admin users.'
  },
  ROLE_LABEL_OWNER: {
    value: defaults.ROLE_LABEL_OWNER,
    description: 'Display label for owner users.'
  },
  ROLE_FAVORITES_GUEST: {
    value: defaults.ROLE_FAVORITES_GUEST,
    description: 'Favorite resort limit for guest users (use -1 for unlimited).'
  },
  ROLE_FAVORITES_LEVEL1: {
    value: defaults.ROLE_FAVORITES_LEVEL1,
    description: 'Favorite resort limit for level1 users (use -1 for unlimited).'
  },
  ROLE_FAVORITES_LEVEL2: {
    value: defaults.ROLE_FAVORITES_LEVEL2,
    description: 'Favorite resort limit for level2 users (use -1 for unlimited).'
  },
  ROLE_FAVORITES_LEVEL3: {
    value: defaults.ROLE_FAVORITES_LEVEL3,
    description: 'Favorite resort limit for level3 users (use -1 for unlimited).'
  },
  ROLE_FAVORITES_ADMIN: {
    value: defaults.ROLE_FAVORITES_ADMIN,
    description: 'Favorite resort limit for admin users (use -1 for unlimited).'
  },
  ROLE_FAVORITES_OWNER: {
    value: defaults.ROLE_FAVORITES_OWNER,
    description: 'Favorite resort limit for owner users (use -1 for unlimited).'
  },
  ROLE_HOURLY_GUEST: {
    value: defaults.ROLE_HOURLY_GUEST,
    description: 'Allow hourly modal access for guest users (1 = on, 0 = off).'
  },
  ROLE_HOURLY_LEVEL1: {
    value: defaults.ROLE_HOURLY_LEVEL1,
    description: 'Allow hourly modal access for level1 users (1 = on, 0 = off).'
  },
  ROLE_HOURLY_LEVEL2: {
    value: defaults.ROLE_HOURLY_LEVEL2,
    description: 'Allow hourly modal access for level2 users (1 = on, 0 = off).'
  },
  ROLE_HOURLY_LEVEL3: {
    value: defaults.ROLE_HOURLY_LEVEL3,
    description: 'Allow hourly modal access for level3 users (1 = on, 0 = off).'
  },
  ROLE_HOURLY_ADMIN: {
    value: defaults.ROLE_HOURLY_ADMIN,
    description: 'Allow hourly modal access for admin users (1 = on, 0 = off).'
  },
  ROLE_HOURLY_OWNER: {
    value: defaults.ROLE_HOURLY_OWNER,
    description: 'Allow hourly modal access for owner users (1 = on, 0 = off).'
  },
  ROLE_POW_ALERTS_LEVEL1: {
    value: defaults.ROLE_POW_ALERTS_LEVEL1,
    description: 'Pow alert limit for level1 users (use -1 for unlimited).'
  },
  ROLE_POW_ALERTS_LEVEL2: {
    value: defaults.ROLE_POW_ALERTS_LEVEL2,
    description: 'Pow alert limit for level2 users (use -1 for unlimited).'
  },
  ROLE_POW_ALERTS_LEVEL3: {
    value: defaults.ROLE_POW_ALERTS_LEVEL3,
    description: 'Pow alert limit for level3 users (use -1 for unlimited).'
  },
  ROLE_POW_ALERTS_ADMIN: {
    value: defaults.ROLE_POW_ALERTS_ADMIN,
    description: 'Pow alert limit for admin users (use -1 for unlimited).'
  },
  ROLE_POW_ALERTS_OWNER: {
    value: defaults.ROLE_POW_ALERTS_OWNER,
    description: 'Pow alert limit for owner users (use -1 for unlimited).'
  },
  ROLE_CHECK_POW_LEVEL1: {
    value: defaults.ROLE_CHECK_POW_LEVEL1,
    description: 'Allow Check Pow Now for level1 users (1 = on, 0 = off).'
  },
  ROLE_CHECK_POW_LEVEL2: {
    value: defaults.ROLE_CHECK_POW_LEVEL2,
    description: 'Allow Check Pow Now for level2 users (1 = on, 0 = off).'
  },
  ROLE_CHECK_POW_LEVEL3: {
    value: defaults.ROLE_CHECK_POW_LEVEL3,
    description: 'Allow Check Pow Now for level3 users (1 = on, 0 = off).'
  },
  ROLE_CHECK_POW_ADMIN: {
    value: defaults.ROLE_CHECK_POW_ADMIN,
    description: 'Allow Check Pow Now for admin users (1 = on, 0 = off).'
  },
  ROLE_CHECK_POW_OWNER: {
    value: defaults.ROLE_CHECK_POW_OWNER,
    description: 'Allow Check Pow Now for owner users (1 = on, 0 = off).'
  },
  ROLE_CHECK_POW_GUEST: {
    value: defaults.ROLE_CHECK_POW_GUEST,
    description: 'Allow Check Pow Now for guest users (1 = on, 0 = off).'
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
    ROLE_LABEL_GUEST: readValue('ROLE_LABEL_GUEST', defaults.ROLE_LABEL_GUEST),
    ROLE_LABEL_LEVEL1: readValue('ROLE_LABEL_LEVEL1', defaults.ROLE_LABEL_LEVEL1),
    ROLE_LABEL_LEVEL2: readValue('ROLE_LABEL_LEVEL2', defaults.ROLE_LABEL_LEVEL2),
    ROLE_LABEL_LEVEL3: readValue('ROLE_LABEL_LEVEL3', defaults.ROLE_LABEL_LEVEL3),
    ROLE_LABEL_ADMIN: readValue('ROLE_LABEL_ADMIN', defaults.ROLE_LABEL_ADMIN),
    ROLE_LABEL_OWNER: readValue('ROLE_LABEL_OWNER', defaults.ROLE_LABEL_OWNER),
    ROLE_FAVORITES_GUEST: readValue('ROLE_FAVORITES_GUEST', defaults.ROLE_FAVORITES_GUEST),
    ROLE_FAVORITES_LEVEL1: readValue('ROLE_FAVORITES_LEVEL1', defaults.ROLE_FAVORITES_LEVEL1),
    ROLE_FAVORITES_LEVEL2: readValue('ROLE_FAVORITES_LEVEL2', defaults.ROLE_FAVORITES_LEVEL2),
    ROLE_FAVORITES_LEVEL3: readValue('ROLE_FAVORITES_LEVEL3', defaults.ROLE_FAVORITES_LEVEL3),
    ROLE_FAVORITES_ADMIN: readValue('ROLE_FAVORITES_ADMIN', defaults.ROLE_FAVORITES_ADMIN),
    ROLE_FAVORITES_OWNER: readValue('ROLE_FAVORITES_OWNER', defaults.ROLE_FAVORITES_OWNER),
    ROLE_HOURLY_GUEST: readValue('ROLE_HOURLY_GUEST', defaults.ROLE_HOURLY_GUEST),
    ROLE_HOURLY_LEVEL1: readValue('ROLE_HOURLY_LEVEL1', defaults.ROLE_HOURLY_LEVEL1),
    ROLE_HOURLY_LEVEL2: readValue('ROLE_HOURLY_LEVEL2', defaults.ROLE_HOURLY_LEVEL2),
    ROLE_HOURLY_LEVEL3: readValue('ROLE_HOURLY_LEVEL3', defaults.ROLE_HOURLY_LEVEL3),
    ROLE_HOURLY_ADMIN: readValue('ROLE_HOURLY_ADMIN', defaults.ROLE_HOURLY_ADMIN),
    ROLE_HOURLY_OWNER: readValue('ROLE_HOURLY_OWNER', defaults.ROLE_HOURLY_OWNER),
    ROLE_POW_ALERTS_LEVEL1: readValue('ROLE_POW_ALERTS_LEVEL1', defaults.ROLE_POW_ALERTS_LEVEL1),
    ROLE_POW_ALERTS_LEVEL2: readValue('ROLE_POW_ALERTS_LEVEL2', defaults.ROLE_POW_ALERTS_LEVEL2),
    ROLE_POW_ALERTS_LEVEL3: readValue('ROLE_POW_ALERTS_LEVEL3', defaults.ROLE_POW_ALERTS_LEVEL3),
    ROLE_POW_ALERTS_ADMIN: readValue('ROLE_POW_ALERTS_ADMIN', defaults.ROLE_POW_ALERTS_ADMIN),
    ROLE_POW_ALERTS_OWNER: readValue('ROLE_POW_ALERTS_OWNER', defaults.ROLE_POW_ALERTS_OWNER),
    ROLE_CHECK_POW_LEVEL1: readValue('ROLE_CHECK_POW_LEVEL1', defaults.ROLE_CHECK_POW_LEVEL1),
    ROLE_CHECK_POW_LEVEL2: readValue('ROLE_CHECK_POW_LEVEL2', defaults.ROLE_CHECK_POW_LEVEL2),
    ROLE_CHECK_POW_LEVEL3: readValue('ROLE_CHECK_POW_LEVEL3', defaults.ROLE_CHECK_POW_LEVEL3),
    ROLE_CHECK_POW_ADMIN: readValue('ROLE_CHECK_POW_ADMIN', defaults.ROLE_CHECK_POW_ADMIN),
    ROLE_CHECK_POW_OWNER: readValue('ROLE_CHECK_POW_OWNER', defaults.ROLE_CHECK_POW_OWNER),
    ROLE_CHECK_POW_GUEST: readValue('ROLE_CHECK_POW_GUEST', defaults.ROLE_CHECK_POW_GUEST),
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

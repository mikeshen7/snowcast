// weather Api module.
'use strict';

const axios = require('axios');
const { URLSearchParams } = require('url');
const hourlyWeatherDb = require('../models/hourlyWeatherDb');
const forecastModels = require('./forecastModels');
const {
  localDateTimeStringToUtcEpoch,
  getLocalPartsFromUtc,
} = require('./timezone');
const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const FORECAST_MODELS = ['gfs', 'ecmwf', 'hrrr'];
const MODEL_PARAM_MAP = {
  gfs: 'gfs_seamless',
  ecmwf: 'ecmwf_ifs',
  hrrr: 'gfs_hrrr',
};
const DEFAULT_ELEVATION_KEY = 'mid';
const ELEVATION_KEYS = ['base', 'mid', 'top'];
const FEET_TO_METERS = 0.3048;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'precipitation_probability',
  'snowfall',
  'windspeed_10m',
  'cloudcover',
  'visibility',
  'weathercode',
  'freezing_level_height',
  'snow_depth'
].join(',');

// ******************* Constants *******************
// mapWeatherCode converts Open-Meteo codes to local condition/icon representations.
function mapWeatherCode(code) {
  const table = {
    0: { conditions: 'Clear', icon: 'clear-day' },
    1: { conditions: 'Mainly Clear', icon: 'clear-day' },
    2: { conditions: 'Partly Cloudy', icon: 'partly-cloudy-day' },
    3: { conditions: 'Cloudy', icon: 'cloudy' },
    45: { conditions: 'Fog', icon: 'fog' },
    48: { conditions: 'Depositing Rime Fog', icon: 'fog' },
    51: { conditions: 'Drizzle', icon: 'rain' },
    53: { conditions: 'Drizzle', icon: 'rain' },
    55: { conditions: 'Drizzle', icon: 'rain' },
    56: { conditions: 'Freezing Drizzle', icon: 'sleet' },
    57: { conditions: 'Freezing Drizzle', icon: 'sleet' },
    61: { conditions: 'Rain', icon: 'rain' },
    63: { conditions: 'Rain', icon: 'rain' },
    65: { conditions: 'Heavy Rain', icon: 'rain' },
    66: { conditions: 'Freezing Rain', icon: 'sleet' },
    67: { conditions: 'Freezing Rain', icon: 'sleet' },
    71: { conditions: 'Snow', icon: 'snow' },
    73: { conditions: 'Snow', icon: 'snow' },
    75: { conditions: 'Snow', icon: 'snow' },
    77: { conditions: 'Snow Grains', icon: 'snow' },
    80: { conditions: 'Rain Showers', icon: 'rain' },
    81: { conditions: 'Rain Showers', icon: 'rain' },
    82: { conditions: 'Rain Showers', icon: 'rain' },
    85: { conditions: 'Snow Showers', icon: 'snow' },
    86: { conditions: 'Snow Showers', icon: 'snow' },
    95: { conditions: 'Thunderstorm', icon: 'thunder' },
    96: { conditions: 'Thunderstorm with Hail', icon: 'thunder-rain' },
    99: { conditions: 'Thunderstorm with Hail', icon: 'thunder-rain' },
  };
  return table[code] || { conditions: 'Unknown', icon: 'cloudy' };
}

// cm To In helper.
const cmToIn = (cm) => (cm == null ? null : cm / 2.54);

// Normalize Elevation Key.
function normalizeElevationKey(value) {
  const key = String(value || '').toLowerCase().trim();
  return ELEVATION_KEYS.includes(key) ? key : '';
}

// Resolve Elevation Ft.
function resolveElevationFt(location, elevationKey) {
  const key = normalizeElevationKey(elevationKey) || DEFAULT_ELEVATION_KEY;
  if (!location) return null;
  const map = {
    base: location.baseElevationFt,
    mid: location.midElevationFt,
    top: location.topElevationFt,
  };
  const elevationFt = map[key];
  return Number.isFinite(elevationFt) ? elevationFt : null;
}

// list Location Elevations helper.
function listLocationElevations(location) {
  if (!location) {
    return [{ key: DEFAULT_ELEVATION_KEY, elevationFt: null }];
  }
  // entries helper.
  const entries = ELEVATION_KEYS.map((key) => ({
    key,
    elevationFt: resolveElevationFt(location, key),
  }));
  // valid helper.
  const valid = entries.filter((entry) => Number.isFinite(entry.elevationFt));
  return valid.length ? valid : [{ key: DEFAULT_ELEVATION_KEY, elevationFt: resolveElevationFt(location, DEFAULT_ELEVATION_KEY) }];
}

// ******************* Weather API fetch *******************
// buildForecastUrl constructs the Open-Meteo request for a location and window.
function buildForecastUrl(location, options = {}) {
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    hourly: HOURLY_FIELDS,
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    windspeed_unit: 'mph',
    precipitation_unit: 'inch',
  });
  if (options.model) {
    const rawModel = String(options.model).trim();
    const mapped = forecastModels.getModelApiParam(rawModel) || MODEL_PARAM_MAP[rawModel] || rawModel;
    params.set('models', mapped);
  }
  const elevationFt = Number.isFinite(options.elevationFt)
    ? Number(options.elevationFt)
    : resolveElevationFt(location, options.elevationKey);
  if (Number.isFinite(elevationFt)) {
    params.set('elevation', Math.round(elevationFt * FEET_TO_METERS));
  }

  if (options.startDate) {
    params.set('start_date', options.startDate);
  }
  if (options.endDate) {
    params.set('end_date', options.endDate);
  }
  if (options.pastDays) {
    params.set('past_days', options.pastDays);
  }
  if (options.forecastDays) {
    let forecastDays = Number(options.forecastDays);
    const maxDays = forecastModels.getMaxForecastDays(options.model);
    if (Number.isFinite(maxDays)) {
      forecastDays = Math.min(forecastDays, maxDays);
    }
    if (Number.isFinite(forecastDays)) {
      params.set('forecast_days', forecastDays);
    }
  }

  return `${BASE_URL}?${params.toString()}`;
}

// date String To Utc Ms helper.
function dateStringToUtcMs(value) {
  if (!value) return null;
  const dateOnly = String(value).split('T')[0];
  const dt = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getTime();
}

// Compute Requested Days.
function computeRequestedDays(options) {
  if (options.startDate && options.endDate) {
    const startMs = dateStringToUtcMs(options.startDate);
    const endMs = dateStringToUtcMs(options.endDate);
    if (startMs != null && endMs != null && endMs >= startMs) {
      return Math.floor((endMs - startMs) / MS_PER_DAY) + 1;
    }
  }
  return null;
}

// summarize Returned Days helper.
function summarizeReturnedDays(data) {
  const times = data?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0) {
    return { actualDays: 0, actualStartDate: null, actualEndDate: null };
  }
  const daySet = new Set();
  times.forEach((value) => {
    const datePart = String(value || '').split('T')[0];
    if (datePart) daySet.add(datePart);
  });
  const ordered = Array.from(daySet).sort();
  return {
    actualDays: ordered.length,
    actualStartDate: ordered[0] || null,
    actualEndDate: ordered[ordered.length - 1] || null,
  };
}

// fetchLocation retrieves weather for a location with retries/timeouts and upserts it.
async function fetchLocation(location, options = {}) {
  const { context = 'forecast', ...queryOptions } = options;
  const model = queryOptions.model ? String(queryOptions.model).trim() : '';
  const elevationKey = normalizeElevationKey(queryOptions.elevationKey) || DEFAULT_ELEVATION_KEY;
  const elevationFt = Number.isFinite(queryOptions.elevationFt)
    ? Number(queryOptions.elevationFt)
    : resolveElevationFt(location, elevationKey);
  const { name } = location;
  const url = buildForecastUrl(location, { ...queryOptions, elevationKey, elevationFt });

  const maxAttempts = 3;
  const baseDelayMs = 2000;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const { data } = response;
      await upsertWeatherDocs(location, name, data, model, elevationKey, elevationFt);
      const { actualDays, actualStartDate, actualEndDate } = summarizeReturnedDays(data);
      const requestedDays = computeRequestedDays(queryOptions);
      return {
        model: model || 'auto',
        elevationKey,
        elevationFt,
        requestedDays,
        requestedStartDate: queryOptions.startDate || null,
        requestedEndDate: queryOptions.endDate || null,
        actualDays,
        actualStartDate,
        actualEndDate,
      };
    } catch (error) {
      const status = error?.response?.status;
      const responseData = error?.response?.data;
      error.meta = {
        url,
        model: model || 'auto',
        elevationKey,
        elevationFt,
        status,
        responseData,
        context,
      };
      lastError = error;
      const isLastAttempt = attempt === maxAttempts;
      const waitMs = baseDelayMs * attempt;
      if (isLastAttempt) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  if (lastError) {
    throw lastError;
  }
}

// Fetch Location Models.
async function fetchLocationModels(location, options = {}) {
  const models = Array.isArray(options.models) && options.models.length
    ? options.models
    : options.model
      ? [options.model]
      : FORECAST_MODELS;
  const results = [];
  for (const model of models) {
    const result = await fetchLocation(location, { ...options, model });
    if (result) {
      results.push(result);
    }
  }
  return results;
}

// upsertWeatherDocs transforms the API payload into Mongo upsert operations.
async function upsertWeatherDocs(location, name, data, model, elevationKey, elevationFt) {
  const modelKey = model || 'auto';
  const elevationLabel = normalizeElevationKey(elevationKey) || DEFAULT_ELEVATION_KEY;
  const timezone = location?.tz_iana || data?.timezone || 'UTC';
  const fallbackOffset = Number.isFinite(data?.utc_offset_seconds) ? data.utc_offset_seconds : 0;
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const feels = data.hourly.apparent_temperature;
  const precip = data.hourly.precipitation;
  const precipProb = data.hourly.precipitation_probability;
  const snowfall = data.hourly.snowfall;          // cm from Open-Meteo
  const wind = data.hourly.windspeed_10m;         // mph
  const clouds = data.hourly.cloudcover;          // %
  const visibility = data.hourly.visibility;      // meters
  const weathercodes = data.hourly.weathercode;   // numeric codes
  const freezingLevel = data.hourly.freezing_level_height; // meters
  const snowDepth = data.hourly.snow_depth; // meters

  const docs = [];
  for (let i = 0; i < times.length; i++) {
    const epochMs = localDateTimeStringToUtcEpoch(times[i], timezone, fallbackOffset);
    if (epochMs == null) {
      continue;
    }
    const localParts = getLocalPartsFromUtc(epochMs, timezone);
    const dt = new Date(epochMs);
    const { conditions, icon } = mapWeatherCode(weathercodes[i]);
    const precipIn = precip?.[i] ?? null;
    const snowIn = cmToIn(snowfall?.[i]);
    const rainIn = precipIn != null && snowIn != null
      ? Math.max(0, precipIn - snowIn)
      : precipIn != null
        ? precipIn
        : null;

    const freezingLevelFt = freezingLevel?.[i] != null
      ? freezingLevel[i] * 3.28084
      : null;
    const snowDepthIn = snowDepth?.[i] != null
      ? snowDepth[i] * 39.3701
      : null;

    docs.push({
      key: `${location._id}-${modelKey}-${elevationLabel}-${epochMs}`,
      resort: name,
      locationId: String(location._id),
      model: modelKey,
      elevationKey: elevationLabel,
      elevationFt: Number.isFinite(elevationFt) ? elevationFt : null,
      dateTimeEpoch: epochMs,
      dayOfWeek: localParts ? localParts.weekdayIndex : dt.getUTCDay(),
      date: localParts ? localParts.day : dt.getUTCDate(),
      month: localParts ? localParts.month : dt.getUTCMonth() + 1,
      year: localParts ? localParts.year : dt.getUTCFullYear(),
      dateTime: times[i],
      hour: localParts ? localParts.hour : dt.getUTCHours(),
      min: localParts ? localParts.minute : dt.getUTCMinutes(),
      precipProb: precipProb?.[i],
      precipType: [snowfall?.[i] > 0 ? 'snow' : 'rain'], // naive; adjust if needed
      precip: precipIn,
      snow: snowIn,
      rain: rainIn,
      windspeed: wind?.[i],          // mph
      cloudCover: clouds?.[i],
      visibility: visibility?.[i] != null ? visibility[i] / 1609.34 : null, // m → miles
      freezingLevelFt,
      snowDepthIn,
      conditions,
      icon,
      temp: temps?.[i] ?? null,
      feelsLike: feels?.[i] ?? null,
    });
  }

  // Upsert all docs
  if (docs.length) {
    // ops helper.
    const ops = docs.map((doc) => ({
      updateOne: { filter: { key: doc.key }, update: doc, upsert: true },
    }));
    await hourlyWeatherDb.bulkWrite(ops, { ordered: false });
  }
}

module.exports = {
  fetchLocation,
  fetchLocationModels,
  listLocationElevations,
  FORECAST_MODELS,
};

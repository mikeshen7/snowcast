'use strict';

const axios = require('axios');
const { URLSearchParams } = require('url');
const hourlyWeatherDb = require('../models/hourlyWeatherDb');
const {
  localDateTimeStringToUtcEpoch,
  getLocalPartsFromUtc,
} = require('./timezone');
const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'precipitation_probability',
  'snowfall',
  'windspeed_10m',
  'cloudcover',
  'visibility',
  'weathercode'
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

const toF = (c) => (c == null ? null : (c * 9) / 5 + 32);
const mmToIn = (mm) => (mm == null ? null : mm / 25.4);
const cmToIn = (cm) => (cm == null ? null : cm / 2.54);

// ******************* Weather API fetch *******************
// buildForecastUrl constructs the Open-Meteo request for a location and window.
function buildForecastUrl(location, options = {}) {
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    hourly: HOURLY_FIELDS,
    timezone: 'auto',
  });

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
    params.set('forecast_days', options.forecastDays);
  }

  return `${BASE_URL}?${params.toString()}`;
}

// fetchLocation retrieves weather for a location with retries/timeouts and upserts it.
async function fetchLocation(location, options = {}) {
  const { context = 'forecast', ...queryOptions } = options;
  const { name } = location;
  const url = buildForecastUrl(location, queryOptions);

  const maxAttempts = 3;
  const baseDelayMs = 2000;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const { data } = response;
      await upsertWeatherDocs(location, name, data);
      return;
    } catch (error) {
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

// upsertWeatherDocs transforms the API payload into Mongo upsert operations.
async function upsertWeatherDocs(location, name, data) {
  const timezone = location?.tz_iana || data?.timezone || 'UTC';
  const fallbackOffset = Number.isFinite(data?.utc_offset_seconds) ? data.utc_offset_seconds : 0;
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const feels = data.hourly.apparent_temperature;
  const precip = data.hourly.precipitation;
  const precipProb = data.hourly.precipitation_probability;
  const snowfall = data.hourly.snowfall;          // cm from Open-Meteo
  const wind = data.hourly.windspeed_10m;         // km/h
  const clouds = data.hourly.cloudcover;          // %
  const visibility = data.hourly.visibility;      // meters
  const weathercodes = data.hourly.weathercode;   // numeric codes

  const docs = [];
  for (let i = 0; i < times.length; i++) {
    const epochMs = localDateTimeStringToUtcEpoch(times[i], timezone, fallbackOffset);
    if (epochMs == null) {
      continue;
    }
    const localParts = getLocalPartsFromUtc(epochMs, timezone);
    const dt = new Date(epochMs);
    const { conditions, icon } = mapWeatherCode(weathercodes[i]);

    docs.push({
      key: `${location._id}-${epochMs}`,
      resort: name,
      locationId: String(location._id),
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
      precip: mmToIn(precip?.[i]),
      snow: cmToIn(snowfall?.[i]),
      windspeed: wind?.[i],          // in km/h; convert to mph if you prefer: *0.621371
      cloudCover: clouds?.[i],
      visibility: visibility?.[i] != null ? visibility[i] / 1609.34 : null, // m → miles
      conditions,
      icon,
      temp: toF(temps?.[i]),
      feelsLike: toF(feels?.[i]),
    });
  }

  // Upsert all docs
  if (docs.length) {
    const ops = docs.map((doc) => ({
      updateOne: { filter: { key: doc.key }, update: doc, upsert: true },
    }));
    await hourlyWeatherDb.bulkWrite(ops, { ordered: false });
  }
}

module.exports = { fetchLocation };

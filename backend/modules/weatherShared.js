'use strict';

const hourlyWeatherDb = require('../models/hourlyWeatherDb');
const locationsDb = require('../models/locationsDb');
const { clampDays } = require('./weatherAggregations');
const appConfig = require('./appConfig');
const {
  getLocalPartsFromUtc,
  localDateTimeToUtcEpoch,
  shiftLocalDate,
} = require('./timezone');

// sanitizeDoc converts a Mongo doc into the API-safe payload shape.
function sanitizeDoc(doc) {
  return {
    id: doc._id,
    key: doc.key,
    resort: doc.resort,
    locationId: doc.locationId,
    dateTimeEpoch: doc.dateTimeEpoch,
    dateTime: doc.dateTime,
    dayOfWeek: doc.dayOfWeek,
    date: doc.date,
    month: doc.month,
    year: doc.year,
    hour: doc.hour,
    min: doc.min,
    precipProb: doc.precipProb,
    precipType: doc.precipType,
    precip: doc.precip,
    snow: doc.snow,
    windspeed: doc.windspeed,
    cloudCover: doc.cloudCover,
    visibility: doc.visibility,
    conditions: doc.conditions,
    icon: doc.icon,
    temp: doc.temp,
    feelsLike: doc.feelsLike,
  };
}

// buildDateFilter constructs the Mongo range query for dateTimeEpoch.
function buildDateFilter(startEpoch, endEpoch) {
  if (startEpoch === undefined && endEpoch === undefined) {
    return undefined;
  }
  const filter = {};
  if (startEpoch !== undefined) {
    filter.$gte = startEpoch;
  }
  if (endEpoch !== undefined) {
    filter.$lte = endEpoch;
  }
  return filter;
}

// fetchLocationDetail loads the full location record for responses.
async function fetchLocationDetail(locationId) {
  if (!locationId) {
    return undefined;
  }

  const doc = await locationsDb.findById(locationId).lean();
  if (!doc) {
    return undefined;
  }

  return {
    id: String(doc._id),
    name: doc.name,
    country: doc.country,
    region: doc.region,
    lat: doc.lat,
    lon: doc.lon,
    tz_iana: doc.tz_iana,
    isSkiResort: doc.isSkiResort,
  };
}

// queryHourlyDocs fetches and clamps hourly weather documents per location.
async function queryHourlyDocs(options) {
  const {
    locationId,
    daysBack,
    daysForward,
    startDateEpoch,
    endDateEpoch,
    sort = 'asc',
    maxDaysBack,
    maxDaysForward,
  } = options;
  if (!locationId) {
    const error = new Error('locationId is required');
    error.status = 400;
    throw error;
  }

  const location = await fetchLocationDetail(locationId);
  if (!location) {
    const notFound = new Error('Location not found');
    notFound.status = 404;
    throw notFound;
  }
  const timeZone = location?.tz_iana || 'UTC';

  const config = appConfig.values();
  const { MS_PER_DAY, WEATHER_API_MAX_DAYS_BACK, WEATHER_API_MAX_DAYS_FORWARD } = config;
  const filter = { locationId };

  let effectiveStart;
  let effectiveEnd;
  if (startDateEpoch != null || endDateEpoch != null) {
    effectiveStart = startDateEpoch;
    effectiveEnd = endDateEpoch;
  } else {
    const backDays = clampDays(daysBack, 3, maxDaysBack ?? WEATHER_API_MAX_DAYS_BACK);
    const forwardDays = clampDays(daysForward, 14, maxDaysForward ?? WEATHER_API_MAX_DAYS_FORWARD);
    const nowParts = getLocalPartsFromUtc(Date.now(), timeZone);
    const baseDateParts = nowParts
      ? { year: nowParts.year, month: nowParts.month, day: nowParts.day }
      : null;

    if (baseDateParts) {
      const startLocalDate = shiftLocalDate(baseDateParts, -backDays) || baseDateParts;
      const endLocalDatePlusOne = shiftLocalDate(baseDateParts, forwardDays + 1) || baseDateParts;
      effectiveStart = localDateTimeToUtcEpoch(
        { ...startLocalDate, hour: 0, minute: 0, second: 0 },
        timeZone
      );
      const endExclusive = localDateTimeToUtcEpoch(
        { ...endLocalDatePlusOne, hour: 0, minute: 0, second: 0 },
        timeZone
      );
      effectiveEnd = endExclusive != null ? endExclusive - 1 : undefined;
    }

    if (effectiveStart == null || effectiveEnd == null) {
      const now = Date.now();
      const fallbackStart = new Date(now - backDays * MS_PER_DAY);
      fallbackStart.setUTCHours(0, 0, 0, 0);
      const fallbackEnd = new Date(now + forwardDays * MS_PER_DAY);
      fallbackEnd.setUTCHours(23, 59, 59, 999);
      effectiveStart = fallbackStart.getTime();
      effectiveEnd = fallbackEnd.getTime();
    }
  }

  const dateFilter = buildDateFilter(effectiveStart, effectiveEnd);
  if (dateFilter) {
    filter.dateTimeEpoch = dateFilter;
  }

  const sortDirection = sort === 'desc' ? -1 : 1;
  const docs = await hourlyWeatherDb
    .find(filter)
    .sort({ dateTimeEpoch: sortDirection })
    .lean();

  return { docs, location };
}

// buildHourlyWeatherResponse wraps queryHourlyDocs with serialization.
async function buildHourlyWeatherResponse(options) {
  const { docs, location } = await queryHourlyDocs(options);

  return {
    count: docs.length,
    location,
    data: docs.map(sanitizeDoc),
  };
}

// haversineKm estimates distance between two lat/lon points in km.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// findNearestLocation returns the closest stored location within bounds.
async function findNearestLocation(lat, lon, maxDistanceMi = appConfig.values().LOCATION_FETCH_RADIUS_MI) {
  const maxDistanceKm = maxDistanceMi * 1.60934;
  const deltaLat = maxDistanceKm / 111;
  const deltaLon = deltaLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.1);

  const candidates = await locationsDb.find({
    lat: { $gte: lat - deltaLat, $lte: lat + deltaLat },
    lon: { $gte: lon - deltaLon, $lte: lon + deltaLon },
  }).lean();

  let nearest = null;
  let nearestDistance = Infinity;

  for (const doc of candidates) {
    const distance = haversineKm(lat, lon, doc.lat, doc.lon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = doc;
    }
  }

  if (!nearest || nearestDistance > maxDistanceKm) {
    return null;
  }

  return { doc: nearest, distanceKm: nearestDistance };
}

module.exports = {
  sanitizeDoc,
  buildDateFilter,
  fetchLocationDetail,
  queryHourlyDocs,
  buildHourlyWeatherResponse,
  findNearestLocation,
};

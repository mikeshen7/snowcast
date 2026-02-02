// weather Shared module.
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

const AUTO_MODEL = 'auto';
const MEDIAN_MODEL = 'median';
const DEFAULT_MODEL = MEDIAN_MODEL;
const DEFAULT_ELEVATION = 'mid';
const ELEVATION_KEYS = ['base', 'mid', 'top'];

// Normalize Forecast Model.
function normalizeForecastModel(input, allowedModels = []) {
  const value = String(input || '').toLowerCase().trim();
  if (!value) return '';
  if (value === 'blend' || value === MEDIAN_MODEL) return MEDIAN_MODEL;
  const allowed = new Set((allowedModels || []).map((model) => String(model || '').toLowerCase().trim()).filter(Boolean));
  return allowed.has(value) ? value : '';
}

// Normalize Elevation Key.
function normalizeElevationKey(input) {
  const value = String(input || '').toLowerCase().trim();
  return ELEVATION_KEYS.includes(value) ? value : '';
}

// median Value helper.
function medianValue(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Resolve Precip Type.
function resolvePrecipType(precip, snow) {
  if (!Number.isFinite(precip) || precip <= 0) return [];
  if (!Number.isFinite(snow) || snow <= 0) return ['rain'];
  if (precip > snow) return ['mixed'];
  return ['snow'];
}

// select Representative Doc helper.
function selectRepresentativeDoc(docs, modelOrder = []) {
  if (!docs.length) return null;
  // priority helper.
  const priority = new Map((modelOrder || []).map((model, index) => [model, index]));
  // sorted helper.
  const sorted = [...docs].sort((a, b) => {
    const aKey = a.model || 'auto';
    const bKey = b.model || 'auto';
    const aRank = priority.has(aKey) ? priority.get(aKey) : modelOrder.length;
    const bRank = priority.has(bKey) ? priority.get(bKey) : modelOrder.length;
    return aRank - bRank;
  });
  return sorted[0];
}

// median Hourly Docs helper.
function medianHourlyDocs(docs, modelOrder = []) {
  const grouped = new Map();
  for (const doc of docs || []) {
    if (doc.dateTimeEpoch == null) continue;
    const key = doc.dateTimeEpoch;
    if (!grouped.has(key)) grouped.set(key, new Map());
    const modelKey = doc.model || 'auto';
    if (!grouped.get(key).has(modelKey)) {
      grouped.get(key).set(modelKey, doc);
    }
  }

  const blended = [];
  for (const [epoch, modelMap] of grouped.entries()) {
    const modelDocs = Array.from(modelMap.values());
    const base = selectRepresentativeDoc(modelDocs, modelOrder);
    if (!base) continue;
    const numericFields = [
      'precipProb',
      'precip',
      'snow',
      'rain',
      'windspeed',
      'cloudCover',
      'visibility',
      'freezingLevelFt',
      'snowDepthIn',
      'temp',
      'feelsLike',
    ];
    const averaged = {};
    numericFields.forEach((field) => {
      const values = modelDocs
        .map((doc) => doc[field])
        .filter((value) => Number.isFinite(value));
      averaged[field] = medianValue(values);
    });
    const precipType = resolvePrecipType(averaged.precip, averaged.snow);
    blended.push({
      ...base,
      ...averaged,
      precipType,
      model: MEDIAN_MODEL,
      key: `${base.locationId || base.resort}-${MEDIAN_MODEL}-${base.elevationKey || DEFAULT_ELEVATION}-${epoch}`,
    });
  }

  return blended.sort((a, b) => a.dateTimeEpoch - b.dateTimeEpoch);
}

// sanitizeDoc converts a Mongo doc into the API-safe payload shape.
function sanitizeDoc(doc) {
  return {
    id: doc._id,
    key: doc.key,
    resort: doc.resort,
    locationId: doc.locationId,
    model: doc.model || 'auto',
    elevationKey: doc.elevationKey || DEFAULT_ELEVATION,
    elevationFt: doc.elevationFt ?? null,
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
    rain: doc.rain,
    windspeed: doc.windspeed,
    cloudCover: doc.cloudCover,
    visibility: doc.visibility,
    freezingLevelFt: doc.freezingLevelFt,
    snowDepthIn: doc.snowDepthIn,
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
    baseElevationFt: doc.baseElevationFt ?? null,
    midElevationFt: doc.midElevationFt ?? null,
    topElevationFt: doc.topElevationFt ?? null,
    apiModelNames: Array.isArray(doc.apiModelNames) ? doc.apiModelNames : [],
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
    model,
    elevationKey,
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
  const locationModels = Array.isArray(location?.apiModelNames)
    ? location.apiModelNames.map((value) => String(value || '').toLowerCase().trim()).filter(Boolean)
    : [];
  const resolvedModel = normalizeForecastModel(model, locationModels) || DEFAULT_MODEL;
  const resolvedElevation = normalizeElevationKey(elevationKey) || DEFAULT_ELEVATION;
  if (!locationModels.length) {
    return { docs: [], location };
  }

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
  if (resolvedElevation) {
    if (resolvedElevation === DEFAULT_ELEVATION) {
      filter.$or = [
        { elevationKey: resolvedElevation },
        { elevationKey: { $exists: false } },
        { elevationKey: null },
      ];
    } else {
      filter.elevationKey = resolvedElevation;
    }
  }
  if (resolvedModel === MEDIAN_MODEL) {
    const modelFilter = [
      { model: { $in: [...locationModels, AUTO_MODEL] } },
      { model: { $exists: false } },
      { model: null },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: modelFilter }];
      delete filter.$or;
    } else {
      filter.$or = modelFilter;
    }
  } else if (resolvedModel) {
    filter.model = resolvedModel;
  }

  const sortDirection = sort === 'desc' ? -1 : 1;
  const docs = await hourlyWeatherDb
    .find(filter)
    .sort({ dateTimeEpoch: sortDirection })
    .lean();

  let finalDocs = resolvedModel === MEDIAN_MODEL ? medianHourlyDocs(docs, locationModels) : docs;
  if (resolvedModel === MEDIAN_MODEL && sortDirection === -1) {
    finalDocs = [...finalDocs].sort((a, b) => b.dateTimeEpoch - a.dateTimeEpoch);
  }
  return { docs: finalDocs, location };
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
  // to Rad helper.
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

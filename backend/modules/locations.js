// locations module.
'use strict';

const locationsDb = require('../models/locationsDb');
const { seedLocations } = require('../models/seedLocations');
const { lookupCountryRegion } = require('./geoLookup');
const appConfig = require('./appConfig');
const weatherApi = require('./weatherApi');
const { logAdminEvent } = require('./adminLogs');

const locationCache = {
  locations: [],
};

// Format Date.
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// parse Boolean helper.
function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

// parse Elevation helper.
function parseElevation(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// haversine Km helper.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
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

// derive Country Region helper.
async function deriveCountryRegion(lat, lon) {
  try {
    return await lookupCountryRegion(lat, lon);
  } catch (error) {
    console.error('*** locations deriveCountryRegion error:', error.message);
    return { country: 'Unknown', region: '' };
  }
}

// Ensure Location Not Too Close.
async function ensureLocationNotTooClose(lat, lon, excludeId) {
  const radiusMi = appConfig.values().LOCATION_STORE_RADIUS_MI;
  if (!radiusMi || radiusMi <= 0) {
    return;
  }
  const radiusKm = radiusMi * 1.60934;
  const deltaLat = radiusKm / 111;
  const deltaLon = deltaLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
  const candidates = await locationsDb.find({
    lat: { $gte: lat - deltaLat, $lte: lat + deltaLat },
    lon: { $gte: lon - deltaLon, $lte: lon + deltaLon },
  }).lean();

  for (const candidate of candidates) {
    if (excludeId && String(candidate._id) === String(excludeId)) continue;
    const distanceKm = haversineKm(lat, lon, candidate.lat, candidate.lon);
    if (distanceKm <= radiusKm) {
      const error = new Error(`Location too close to existing "${candidate.name}" (${(distanceKm / 1.60934).toFixed(2)} mi)`);
      error.status = 409;
      throw error;
    }
  }
}

// Handle Create Location.
async function endpointCreateLocation(request, response, next) {
  try {
    const { name, lat, lon, tz_iana, isSkiResort, baseElevationFt, midElevationFt, topElevationFt } = request.body || {};
    if (!name || lat === undefined || lon === undefined || !tz_iana) {
      return response.status(400).send('name, lat, lon, and tz_iana are required');
    }

    const numericLat = Number(lat);
    const numericLon = Number(lon);
    if (Number.isNaN(numericLat) || Number.isNaN(numericLon)) {
      return response.status(400).send('lat and lon must be numbers');
    }

    await ensureLocationNotTooClose(numericLat, numericLon);

    const { country, region } = await deriveCountryRegion(numericLat, numericLon);

    const doc = await locationsDb.create({
      name: String(name).trim(),
      country: String(country).trim(),
      region: String(region).trim(),
      lat: numericLat,
      lon: numericLon,
      tz_iana: String(tz_iana).trim(),
      isSkiResort: parseBoolean(isSkiResort) ?? false,
      baseElevationFt: parseElevation(baseElevationFt),
      midElevationFt: parseElevation(midElevationFt),
      topElevationFt: parseElevation(topElevationFt),
    });

    await refreshLocationsCache();

    console.log(JSON.stringify({
      event: 'location_created',
      locationId: String(doc._id),
      name: doc.name,
    }));
    logAdminEvent({
      type: 'location_created',
      message: doc.name,
      meta: { locationId: String(doc._id) },
    });

    triggerLocationBackfill(doc);

    return response.status(201).send({
      id: doc._id,
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
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    if (error.status === 409) {
      return response.status(409).send(error.message);
    }
    if (error.code === 11000) {
      return response.status(409).send('Location already exists (lat/lon conflict)');
    }
    console.error('*** locations endpointCreateLocation error:', error.message);
    next(error);
  }
}

// trigger Location Backfill helper.
function triggerLocationBackfill(location) {
  const config = appConfig.values();
  const endDate = formatDate(new Date());
  const startDate = formatDate(new Date(Date.now() - config.DB_BACKFILL_DAYS * config.MS_PER_DAY));
  setImmediate(async () => {
    try {
      for (const elevation of weatherApi.listLocationElevations(location)) {
        logAdminEvent({
          type: 'backfill',
          message: 'Location backfill started',
          meta: {
            locationId: String(location._id),
            name: location.name,
            elevationKey: elevation.key,
            startDate,
            endDate,
          },
        });
        const results = await weatherApi.fetchLocationModels(location, {
          startDate,
          endDate,
          context: 'backfill',
          elevationKey: elevation.key,
          elevationFt: elevation.elevationFt,
        });
        (results || []).forEach((result) => {
          if (result?.requestedDays == null || result?.actualDays == null) return;
          if (result.actualDays >= result.requestedDays) return;
          logAdminEvent({
            type: 'backfill_info',
            message: 'Backfill returned fewer days than requested',
            meta: {
              locationId: String(location._id),
              name: location.name,
              model: result.model,
              elevationKey: result.elevationKey || elevation.key,
              requestedDays: result.requestedDays,
              requestedStartDate: result.requestedStartDate,
              requestedEndDate: result.requestedEndDate,
              actualDays: result.actualDays,
              actualStartDate: result.actualStartDate,
              actualEndDate: result.actualEndDate,
            },
          });
        });
        logAdminEvent({
          type: 'backfill',
          message: 'Location backfill completed',
          meta: {
            locationId: String(location._id),
            name: location.name,
            elevationKey: elevation.key,
            startDate,
            endDate,
          },
        });
      }
      console.log(JSON.stringify({
        event: 'location_backfill_complete',
        locationId: String(location._id),
        startDate,
        endDate,
      }));
    } catch (err) {
      logAdminEvent({
        type: 'backfill_error',
        message: err.message,
        meta: {
          locationId: String(location._id),
          name: location.name,
          details: err?.meta,
        },
      });
      console.log(JSON.stringify({
        event: 'location_backfill_error',
        locationId: String(location._id),
        error: err.message,
      }));
    }
  });
}

// Handle Search Locations.
async function endpointSearchLocations(request, response, next) {
  try {
    const { q = '', isSkiResort } = request.query;
    const limit = Math.min(parseInt(request.query.limit, 10) || 20, 200);
    const page = Math.max(parseInt(request.query.page, 10) || 0, 0);
    const filter = {};

    if (q) {
      filter.name = { $regex: q, $options: 'i' }; // case-insensitive partial match
    }

    const parsedFlag = parseBoolean(isSkiResort);
    if (parsedFlag !== undefined) {
      filter.isSkiResort = parsedFlag;
    }

    const query = locationsDb.find(filter).sort({ name: 1 });
    if (page > 0) {
      query.skip((page - 1) * limit).limit(limit);
    } else {
      query.limit(limit);
    }
    const docs = await query.lean();
    // results helper.
    const results = docs.map((doc) => ({
      id: doc._id,
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
    }));

    if (page > 0) {
      const total = await locationsDb.countDocuments(filter);
      return response.status(200).send({ results, total, page, limit });
    }
    return response.status(200).send(results);
  } catch (error) {
    console.error('*** locations endpointSearchLocations error:', error.message);
    next(error);
  }
}

// Handle Nearest Location.
async function endpointNearestLocation(request, response, next) {
  try {
    const lat = parseFloat(request.query.lat);
    const lon = parseFloat(request.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return response.status(400).send('lat and lon are required numeric query params');
    }

    const maxDistanceKm = parseFloat(request.query.maxDistanceKm) || 50; // default 50km
    const deltaLat = maxDistanceKm / 111; // approx degrees per km
    const deltaLon = deltaLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.1); // avoid divide-by-zero near poles

    const candidates = await locationsDb.find({
      lat: { $gte: lat - deltaLat, $lte: lat + deltaLat },
      lon: { $gte: lon - deltaLon, $lte: lon + deltaLon },
    }).lean();

    let nearest = null;
    let nearestDistance = Infinity;

    for (const doc of candidates) {
      const d = haversineKm(lat, lon, doc.lat, doc.lon);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = doc;
      }
    }

    if (!nearest || nearestDistance > maxDistanceKm) {
      return response.status(404).send('No location found within maxDistanceKm');
    }

    return response.status(200).send({
      id: nearest._id,
      name: nearest.name,
      country: nearest.country,
      region: nearest.region,
      lat: nearest.lat,
      lon: nearest.lon,
      tz_iana: nearest.tz_iana,
      isSkiResort: nearest.isSkiResort,
      baseElevationFt: nearest.baseElevationFt ?? null,
      midElevationFt: nearest.midElevationFt ?? null,
      topElevationFt: nearest.topElevationFt ?? null,
      distanceKm: nearestDistance,
    });
  } catch (error) {
    console.error('*** locations endpointNearestLocation error:', error.message);
    next(error);
  }
}

// Handle Delete Location.
async function endpointDeleteLocation(request, response, next) {
  try {
    const { id } = request.params;
    if (!id) {
      return response.status(400).send('Location id is required');
    }

    const deleted = await locationsDb.findByIdAndDelete(id);
    if (!deleted) {
      return response.status(404).send('Location not found');
    }

    await refreshLocationsCache();

    console.log(JSON.stringify({
      event: 'location_deleted',
      locationId: String(deleted._id),
      name: deleted.name,
    }));

    return response.status(200).send('Location deleted');
  } catch (error) {
    console.error('*** locations endpointDeleteLocation error:', error.message);
    next(error);
  }
}

// Handle Update Location.
async function endpointUpdateLocation(request, response, next) {
  try {
    const { id } = request.params;
    if (!id) {
      return response.status(400).send('Location id is required');
    }

    const { name, lat, lon, tz_iana, isSkiResort, baseElevationFt, midElevationFt, topElevationFt } = request.body || {};
    if (!name || lat === undefined || lon === undefined || !tz_iana) {
      return response.status(400).send('name, lat, lon, and tz_iana are required');
    }

    const numericLat = Number(lat);
    const numericLon = Number(lon);
    if (Number.isNaN(numericLat) || Number.isNaN(numericLon)) {
      return response.status(400).send('lat and lon must be numbers');
    }

    await ensureLocationNotTooClose(numericLat, numericLon, id);

    const { country, region } = await deriveCountryRegion(numericLat, numericLon);

    const updated = await locationsDb.findByIdAndUpdate(
      id,
      {
        name: String(name).trim(),
        country: String(country).trim(),
        region: String(region).trim(),
        lat: numericLat,
        lon: numericLon,
        tz_iana: String(tz_iana).trim(),
        isSkiResort: parseBoolean(isSkiResort) ?? false,
        baseElevationFt: parseElevation(baseElevationFt),
        midElevationFt: parseElevation(midElevationFt),
        topElevationFt: parseElevation(topElevationFt),
      },
      { new: true }
    );

    if (!updated) {
      return response.status(404).send('Location not found');
    }

    await refreshLocationsCache();

    console.log(JSON.stringify({
      event: 'location_updated',
      locationId: String(updated._id),
      name: updated.name,
    }));

    return response.status(200).send({
      id: updated._id,
      name: updated.name,
      country: updated.country,
      region: updated.region,
      lat: updated.lat,
      lon: updated.lon,
      tz_iana: updated.tz_iana,
      isSkiResort: updated.isSkiResort,
      baseElevationFt: updated.baseElevationFt ?? null,
      midElevationFt: updated.midElevationFt ?? null,
      topElevationFt: updated.topElevationFt ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error.status === 409) {
      return response.status(409).send(error.message);
    }
    if (error.code === 11000) {
      return response.status(409).send('Location already exists (lat/lon conflict)');
    }
    console.error('*** locations endpointUpdateLocation error:', error.message);
    next(error);
  }
}

// Refresh Locations Cache.
async function refreshLocationsCache() {
  locationCache.locations = await locationsDb.find({});
  console.log(JSON.stringify({
    event: 'locations_cache_refreshed',
    count: locationCache.locations.length,
  }));
  return locationCache.locations;
}

// Get Cached Locations.
function getCachedLocations() {
  return locationCache.locations;
}

// Handle Lookup Location Metadata.
async function endpointLookupLocationMetadata(request, response, next) {
  try {
    const lat = parseFloat(request.query.lat);
    const lon = parseFloat(request.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return response.status(400).send('lat and lon are required');
    }
    const { country, region } = await deriveCountryRegion(lat, lon);
    return response.status(200).send({ country, region });
  } catch (error) {
    console.error('*** locations endpointLookupLocationMetadata error:', error.message);
    next(error);
  }
}

// Handle List Backfill Locations.
async function endpointListBackfillLocations(request, response, next) {
  try {
    const docs = await locationsDb.find({}).sort({ name: 1 }).lean();
    // results helper.
    const results = docs.map((doc) => ({
      id: doc._id,
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
    }));
    return response.status(200).send(results);
  } catch (error) {
    console.error('*** locations endpointListResortLocations error:', error.message);
    next(error);
  }
}

// Ensure Seed Locations.
async function ensureSeedLocations() {
  const count = await locationsDb.countDocuments({});
  if (count > 0) return false;
  // ops helper.
  const ops = seedLocations.map((loc) => ({
    updateOne: {
      filter: { lat: loc.lat, lon: loc.lon },
      update: { $setOnInsert: loc },
      upsert: true,
    },
  }));
  const result = await locationsDb.bulkWrite(ops, { ordered: false });
  console.log(JSON.stringify({
    event: 'locations_seeded',
    inserted: result.upsertedCount || 0,
  }));
  return true;
}

module.exports = {
  endpointSearchLocations,
  endpointListBackfillLocations,
  endpointNearestLocation,
  endpointCreateLocation,
  endpointDeleteLocation,
  endpointUpdateLocation,
  endpointLookupLocationMetadata,
  endpointUpdateLocation,
  startLocationMaintenance: async function startLocationMaintenance() {
    const didSeed = await ensureSeedLocations();
    await refreshLocationsCache();
    if (didSeed) {
      console.log('Seeded locations on startup.');
    }
    setInterval(refreshLocationsCache, 24 * 60 * 60 * 1000);
  },
  refreshLocationsCache,
  getCachedLocations,
};

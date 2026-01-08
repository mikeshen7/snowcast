'use strict';

const { queryHourlyDocs, findNearestLocation } = require('./weatherShared');
const { aggregateDailyOverview, aggregateDailySegments } = require('./weatherAggregations');
const appConfig = require('./appConfig');

// endpointDailyOverview returns per-day aggregates for a locationId.
async function endpointDailyOverview(request, response, next) {
  try {
    const { locationId } = request.query;
    if (!locationId) {
      return response.status(400).send('locationId query param is required');
    }

    const startDateEpoch = request.query.startDateEpoch ? Number(request.query.startDateEpoch) : undefined;
    const endDateEpoch = request.query.endDateEpoch ? Number(request.query.endDateEpoch) : undefined;

    const { docs, location } = await queryHourlyDocs({
      locationId,
      daysBack: request.query.daysBack,
      daysForward: request.query.daysForward,
      sort: request.query.sort,
      startDateEpoch,
      endDateEpoch,
      maxDaysBack: appConfig.values().WEATHER_API_MAX_DAYS_BACK,
      maxDaysForward: appConfig.values().WEATHER_API_MAX_DAYS_FORWARD,
    });

    const days = aggregateDailyOverview(docs, location?.tz_iana);
    return response.status(200).send({ location, days });
  } catch (error) {
    console.error('*** weatherDaily endpointDailyOverview error:', error.message);
    next(error);
  }
}

// endpointDailyOverviewByCoords resolves coordinates then returns daily overview.
async function endpointDailyOverviewByCoords(request, response, next) {
  try {
    const lat = parseFloat(request.query.lat);
    const lon = parseFloat(request.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return response.status(400).send('lat and lon query params are required and must be numeric');
    }

    const maxDistanceKm = parseFloat(request.query.maxDistanceKm) || 50;
    const nearest = await findNearestLocation(lat, lon, maxDistanceKm);
    if (!nearest) {
      return response.status(404).send('No nearby location found for supplied lat/lon');
    }

    const startDateEpoch = request.query.startDateEpoch ? Number(request.query.startDateEpoch) : undefined;
    const endDateEpoch = request.query.endDateEpoch ? Number(request.query.endDateEpoch) : undefined;

    const { docs, location } = await queryHourlyDocs({
      locationId: String(nearest.doc._id),
      daysBack: request.query.daysBack,
      daysForward: request.query.daysForward,
      sort: request.query.sort,
      startDateEpoch,
      endDateEpoch,
      maxDaysBack: appConfig.values().WEATHER_API_MAX_DAYS_BACK,
      maxDaysForward: appConfig.values().WEATHER_API_MAX_DAYS_FORWARD,
    });

    const days = aggregateDailyOverview(docs, location?.tz_iana);
    if (location) {
      location.distanceKm = nearest.distanceKm;
    }

    return response.status(200).send({ location, days });
  } catch (error) {
    console.error('*** weatherDaily endpointDailyOverviewByCoords error:', error.message);
    next(error);
  }
}

// endpointDailySegments returns four daypart summaries for a locationId.
async function endpointDailySegments(request, response, next) {
  try {
    const { locationId } = request.query;
    if (!locationId) {
      return response.status(400).send('locationId query param is required');
    }

    const startDateEpoch = request.query.startDateEpoch ? Number(request.query.startDateEpoch) : undefined;
    const endDateEpoch = request.query.endDateEpoch ? Number(request.query.endDateEpoch) : undefined;

    const { docs, location } = await queryHourlyDocs({
      locationId,
      daysBack: request.query.daysBack,
      daysForward: request.query.daysForward,
      sort: request.query.sort,
      startDateEpoch,
      endDateEpoch,
    });

    const days = aggregateDailySegments(docs, location?.tz_iana);
    return response.status(200).send({ location, days });
  } catch (error) {
    console.error('*** weatherDaily endpointDailySegments error:', error.message);
    next(error);
  }
}

// endpointDailySegmentsByCoords resolves coords then returns daypart summaries.
async function endpointDailySegmentsByCoords(request, response, next) {
  try {
    const lat = parseFloat(request.query.lat);
    const lon = parseFloat(request.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return response.status(400).send('lat and lon query params are required and must be numeric');
    }

    const maxDistanceKm = parseFloat(request.query.maxDistanceKm) || 50;
    const nearest = await findNearestLocation(lat, lon, maxDistanceKm);
    if (!nearest) {
      return response.status(404).send('No nearby location found for supplied lat/lon');
    }

    const startDateEpoch = request.query.startDateEpoch ? Number(request.query.startDateEpoch) : undefined;
    const endDateEpoch = request.query.endDateEpoch ? Number(request.query.endDateEpoch) : undefined;

    const { docs, location } = await queryHourlyDocs({
      locationId: String(nearest.doc._id),
      daysBack: request.query.daysBack,
      daysForward: request.query.daysForward,
      sort: request.query.sort,
      startDateEpoch,
      endDateEpoch,
    });

    const days = aggregateDailySegments(docs, location?.tz_iana);
    if (location) {
      location.distanceKm = nearest.distanceKm;
    }

    return response.status(200).send({ location, days });
  } catch (error) {
    console.error('*** weatherDaily endpointDailySegmentsByCoords error:', error.message);
    next(error);
  }
}

module.exports = {
  endpointDailyOverview,
  endpointDailyOverviewByCoords,
  endpointDailySegments,
  endpointDailySegmentsByCoords,
};

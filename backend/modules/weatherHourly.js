'use strict';

const { buildHourlyWeatherResponse, findNearestLocation } = require('./weatherShared');

// endpointHourlyWeather returns hourly data for a specific locationId.
async function endpointHourlyWeather(request, response, next) {
  try {
    const { locationId } = request.query;
    if (!locationId) {
      return response.status(400).send('locationId query param is required');
    }

    const startDateEpoch = request.query.startDateEpoch ? Number(request.query.startDateEpoch) : undefined;
    const endDateEpoch = request.query.endDateEpoch ? Number(request.query.endDateEpoch) : undefined;

    const payload = await buildHourlyWeatherResponse({
      locationId,
      daysBack: request.query.daysBack,
      daysForward: request.query.daysForward,
      sort: request.query.sort,
      startDateEpoch,
      endDateEpoch,
    });

    return response.status(200).send(payload);
  } catch (error) {
    console.error('*** weatherHourly endpointHourlyWeather error:', error.message);
    next(error);
  }
}

// endpointHourlyWeatherByCoords resolves lat/lon to a location, then returns hours.
async function endpointHourlyWeatherByCoords(request, response, next) {
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

    const payload = await buildHourlyWeatherResponse({
      locationId: String(nearest.doc._id),
      daysBack: request.query.daysBack,
      daysForward: request.query.daysForward,
      sort: request.query.sort,
      startDateEpoch,
      endDateEpoch,
    });

    if (payload.location) {
      payload.location.distanceKm = nearest.distanceKm;
    }

    return response.status(200).send(payload);
  } catch (error) {
    console.error('*** weatherHourly endpointHourlyWeatherByCoords error:', error.message);
    next(error);
  }
}

module.exports = {
  endpointHourlyWeather,
  endpointHourlyWeatherByCoords,
};

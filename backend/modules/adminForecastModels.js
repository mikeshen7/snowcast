// admin Forecast Models module.
'use strict';

const forecastModels = require('./forecastModels');

// list Forecast Models helper.
async function listForecastModels(request, response, next) {
  try {
    const models = forecastModels.listModels();
    return response.status(200).send(models);
  } catch (error) {
    console.error('*** adminForecastModels list error:', error.message);
    next(error);
  }
}

// Update Forecast Model.
async function updateForecastModel(request, response, next) {
  try {
    const code = request.params.code;
    const updated = await forecastModels.updateModel(code, request.body || {});
    return response.status(200).send(updated);
  } catch (error) {
    console.error('*** adminForecastModels update error:', error.message);
    next(error);
  }
}

module.exports = {
  listForecastModels,
  updateForecastModel,
};

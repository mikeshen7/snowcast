'use strict';

const appConfig = require('./appConfig');

// endpointGetConfig returns all config entries with descriptions.
async function endpointGetConfig(request, response, next) {
  try {
    const map = appConfig.getConfigMap();
    const entries = Object.entries(appConfig.DEFAULT_CONFIG)
      .map(([key, meta]) => ({
        key,
        description: meta.description,
        value: map[key] ?? meta.value,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return response.status(200).send(entries);
  } catch (error) {
    next(error);
  }
}

// endpointUpdateConfig replaces the value for a known config key.
async function endpointUpdateConfig(request, response, next) {
  try {
    const { key } = request.params;
    const meta = appConfig.DEFAULT_CONFIG[key];
    if (!meta) {
      return response.status(404).send('Unknown config key');
    }
    const { value } = request.body;
    if (value === undefined) {
      return response.status(400).send('value is required');
    }
    const updated = await appConfig.setConfigValue(key, value);
    console.log(JSON.stringify({
      event: 'config_updated',
      key,
      value,
      user: request.adminUser ? request.adminUser.email : 'unknown',
    }));
    return response.status(200).send(updated);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  endpointGetConfig,
  endpointUpdateConfig,
};

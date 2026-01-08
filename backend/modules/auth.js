'use strict';

const { config } = require('../config');
const ADMIN_TOKEN = config.backend.adminApiToken;

function hasValidAdminToken(request) {
  if (!ADMIN_TOKEN) {
    return false;
  }
  const token = request.headers['x-admin-token'];
  return Boolean(token && token === ADMIN_TOKEN);
}

function requireAdminToken(request, response, next) {
  if (!ADMIN_TOKEN) {
    return response.status(500).send('Admin token not configured');
  }
  if (!hasValidAdminToken(request)) {
    return response.status(401).send('Unauthorized');
  }
  return next();
}

module.exports = { requireAdminToken, hasValidAdminToken };

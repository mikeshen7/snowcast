'use strict';

const apiClientDb = require('../models/apiClientDb');
const { hashKey } = require('./apiClients');
const { getAdminUserFromRequest } = require('./adminAuth');
const { getFrontendUserFromRequest } = require('./frontendAuth');

const HEADER_NAME = 'x-api-key';

async function requireClientApiKey(request, response, next) {
  try {
    const adminUser = await getAdminUserFromRequest(request);
    if (adminUser) {
      request.skipUsageTracking = true;
      request.adminUser = adminUser;
      return next();
    }

    const frontendUser = await getFrontendUserFromRequest(request);
    if (frontendUser) {
      request.skipUsageTracking = true;
      request.frontendUser = frontendUser;
      return next();
    }

    const providedKey = request.header(HEADER_NAME);
    if (!providedKey) {
      return response.status(401).send('API key required');
    }

    const keyHash = hashKey(providedKey);
    const client = await apiClientDb.findOne({ keyHash, status: 'active' }).lean();
    if (!client) {
      return response.status(401).send('Invalid API key');
    }

    request.client = client;
    return next();
  } catch (error) {
    console.error('*** clientAuth error:', error.message);
    return next(error);
  }
}

module.exports = { requireClientApiKey };

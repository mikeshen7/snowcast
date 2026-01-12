// api Clients module.
'use strict';

const crypto = require('crypto');
const apiClientDb = require('../models/apiClientDb');
const appConfig = require('./appConfig');

const { config } = require('../config');
const CLIENT_API_SESSION_SECRET = config.clientApi.sessionSecret;

// hash Key helper.
function hashKey(rawKey) {
  if (!CLIENT_API_SESSION_SECRET) {
    throw new Error('CLIENT_API_SESSION_SECRET is not configured');
  }
  return crypto
    .createHmac('sha256', CLIENT_API_SESSION_SECRET)
    .update(String(rawKey).trim())
    .digest('hex');
}

// generate Api Key helper.
function generateApiKey() {
  return crypto.randomBytes(24).toString('base64url');
}

// Create Client.
async function createClient({ name, contactEmail, plan, rateLimitPerMin, dailyQuota, metadata }) {
  const configValues = appConfig.values();
  const resolvedRateLimit = Number.isFinite(Number(rateLimitPerMin))
    ? Number(rateLimitPerMin)
    : Number(configValues.API_CLIENT_RATE_LIMIT_DEFAULT);
  const resolvedDailyQuota = Number.isFinite(Number(dailyQuota))
    ? Number(dailyQuota)
    : Number(configValues.API_CLIENT_DAILY_QUOTA_DEFAULT);
  const rawKey = generateApiKey();
  const keyHash = hashKey(rawKey);
  const doc = await apiClientDb.create({
    name: String(name).trim(),
    contactEmail: contactEmail ? String(contactEmail).trim() : '',
    keyHash,
    plan: plan ? String(plan).trim() : undefined,
    rateLimitPerMin: Number.isFinite(resolvedRateLimit) ? resolvedRateLimit : configValues.API_CLIENT_RATE_LIMIT_DEFAULT,
    dailyQuota: Number.isFinite(resolvedDailyQuota) ? resolvedDailyQuota : configValues.API_CLIENT_DAILY_QUOTA_DEFAULT,
    latestPlainApiKey: '', // do not persist plaintext API key
    metadata,
  });
  return { client: doc.toObject(), apiKey: rawKey };
}

// revoke Client helper.
async function revokeClient(clientId) {
  return apiClientDb.findByIdAndUpdate(clientId, { status: 'revoked' }, { new: true });
}

// activate Client helper.
async function activateClient(clientId) {
  return apiClientDb.findByIdAndUpdate(clientId, { status: 'active' }, { new: true });
}

// Update Client Fields.
async function updateClientFields(clientId, updates = {}) {
  return apiClientDb.findByIdAndUpdate(clientId, updates, { new: true });
}

// regenerate Api Key helper.
async function regenerateApiKey(clientId) {
  const rawKey = generateApiKey();
  const keyHash = hashKey(rawKey);
  const doc = await apiClientDb.findByIdAndUpdate(
    clientId,
    { keyHash, latestPlainApiKey: '' }, // do not persist plaintext API key
    { new: true }
  );
  return { client: doc, apiKey: rawKey };
}

// Remove Client.
async function deleteClient(clientId) {
  return apiClientDb.findByIdAndDelete(clientId);
}

// find Active Client By Key helper.
async function findActiveClientByKey(rawKey) {
  const keyHash = hashKey(rawKey);
  return apiClientDb.findOne({ keyHash, status: 'active' });
}

module.exports = {
  hashKey,
  generateApiKey,
  createClient,
  revokeClient,
  activateClient,
  updateClientFields,
  regenerateApiKey,
  deleteClient,
  findActiveClientByKey,
};

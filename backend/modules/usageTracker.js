'use strict';

const apiUsageDb = require('../models/apiUsageDb');
const apiDailyUsageDb = require('../models/apiDailyUsageDb');
const apiClientDb = require('../models/apiClientDb');
const clientAccessLogDb = require('../models/clientAccessLogDb');
const appConfig = require('./appConfig');
const { config } = require('../config');
const { sendEmail } = require('./email');
const adminUserDb = require('../models/adminUserDb');

function getWindowStart(date = new Date()) {
  const windowSizeMs = 60 * 1000;
  return new Date(Math.floor(date.getTime() / windowSizeMs) * windowSizeMs);
}

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function resolveDefaultRateLimit() {
  const configValue = Number(appConfig.values().API_CLIENT_RATE_LIMIT_DEFAULT);
  if (Number.isFinite(configValue)) {
    return configValue;
  }
  const envValue = Number(config.clientApi.rateLimitDefault);
  if (Number.isFinite(envValue)) {
    return envValue;
  }
  return 60;
}

function resolveDefaultDailyQuota() {
  const configValue = Number(appConfig.values().API_CLIENT_DAILY_QUOTA_DEFAULT);
  if (Number.isFinite(configValue)) {
    return configValue;
  }
  const envValue = Number(config.clientApi.dailyQuotaDefault);
  if (Number.isFinite(envValue)) {
    return envValue;
  }
  return 5000;
}

async function trackUsage(request, response, next) {
  try {
    if (request.skipUsageTracking) {
      return next();
    }

    const client = request.client;
    if (!client) {
      return response.status(500).send('Client context missing');
    }

    await logClientAccess(client, request);

    const now = new Date();
    const windowStart = getWindowStart(now);
    const updateResult = await apiUsageDb.findOneAndUpdate(
      { client: client._id, windowStart },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const defaultRate = resolveDefaultRateLimit();
    const rateLimit = client.rateLimitPerMin ?? defaultRate;

    if (rateLimit > 0 && updateResult.count > rateLimit) {
      return response.status(429).send('Rate limit exceeded');
    }

    const dayKey = getDayKey(now);
    const dailyUsage = await apiDailyUsageDb.findOneAndUpdate(
      { client: client._id, dayKey },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    const defaultQuota = resolveDefaultDailyQuota();
    const dailyQuota = client.dailyQuota ?? defaultQuota;

    if (dailyQuota > 0 && dailyUsage.count > dailyQuota) {
      return response.status(429).send('Daily quota exceeded');
    }

    await apiClientDb.findByIdAndUpdate(client._id, {
      lastUsedAt: now,
      $inc: { totalUsage: 1 },
    }).lean();

    request.clientUsage = {
      minuteWindowStart: windowStart,
      minuteCount: updateResult.count,
      dayKey,
      dailyCount: dailyUsage.count,
    };
    return next();
  } catch (error) {
    console.error('*** usageTracker error:', error.message);
    return next(error);
  }
}

module.exports = { trackUsage };

async function logClientAccess(client, request) {
  const ipHeader = request.headers['x-forwarded-for'];
  const ip = Array.isArray(ipHeader)
    ? ipHeader[0]
    : (ipHeader || '').split(',')[0].trim() || request.ip || '';
  const host = request.headers.host || '';
  const origin = request.headers.origin || '';
  const userAgent = request.headers['user-agent'] || '';

  // Best-effort log; ignore errors
  clientAccessLogDb.create({
    client: client._id,
    ip,
    host,
    origin,
    userAgent,
  }).catch(() => {});

  // Detect multiple hosts within last 24h and notify once per day.
  const now = Date.now();
  const recentSince = new Date(now - 24 * 60 * 60 * 1000);
  const distinctHosts = await clientAccessLogDb.distinct('host', {
    client: client._id,
    createdAt: { $gte: recentSince },
    host: { $ne: '' },
  });
  if (distinctHosts.length <= 1) {
    return;
  }
  const lastAlert = client.lastAccessAlertAt ? new Date(client.lastAccessAlertAt).getTime() : 0;
  if (lastAlert && now - lastAlert < 24 * 60 * 60 * 1000) {
    return;
  }
  await apiClientDb.findByIdAndUpdate(client._id, { lastAccessAlertAt: new Date(now) });
  await notifyAdminsOfSuspiciousAccess(client, distinctHosts);
}

async function notifyAdminsOfSuspiciousAccess(client, hosts) {
  try {
    const admins = await adminUserDb.find({ status: 'active', roles: { $in: ['owner', 'admin'] } }).lean();
    const recipients = admins.map((u) => u.email).filter(Boolean);
    if (!recipients.length) return;
    const subject = `API key access anomaly for client ${client.name || client._id}`;
    const text = [
      `API client: ${client.name || client._id}`,
      `Client ID: ${client._id}`,
      `Plan: ${client.plan || 'n/a'}`,
      `Hosts seen in last 24h: ${hosts.join(', ')}`,
      `Status: ${client.status}`,
      `If this is unexpected, regenerate the key or revoke the client.`,
    ].join('\n');
    await sendEmail({ to: recipients, subject, text });
  } catch (err) {
    console.error('*** client access notify error:', err.message);
  }
}

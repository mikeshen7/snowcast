'use strict';

const apiClientDb = require('../models/apiClientDb');
const clientAccessLogDb = require('../models/clientAccessLogDb');
const {
  createClient,
  revokeClient,
  activateClient,
  updateClientFields,
  regenerateApiKey,
  deleteClient,
} = require('./apiClients');
const apiDailyUsageDb = require('../models/apiDailyUsageDb');

async function endpointListClients(request, response, next) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const accessHostAgg = await clientAccessLogDb.aggregate([
      { $match: { createdAt: { $gte: since }, host: { $exists: true } } },
      { $group: { _id: '$client', hosts: { $addToSet: '$host' } } },
    ]);
    const hostMap = new Map(accessHostAgg.map((entry) => [String(entry._id), entry.hosts || []]));

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const dailyUsage = await apiDailyUsageDb.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$client',
          count: { $sum: '$count' },
        },
      },
    ]);

    const usageMap = dailyUsage.reduce((map, entry) => {
      map.set(String(entry._id), entry.count);
      return map;
    }, new Map());

    const docs = await apiClientDb.find().sort({ createdAt: -1 }).lean();
    const withUsage = docs.map((doc) => {
      const { latestPlainApiKey, ...rest } = doc;
      const hosts = hostMap.get(String(doc._id)) || [];
      const accessAnomaly = hosts.filter(Boolean).length > 1;
      return {
        ...rest,
        currentDayUsage: usageMap.get(String(doc._id)) || 0,
        accessAnomaly,
      };
    });
    return response.status(200).send(withUsage);
  } catch (error) {
    console.error('*** adminApiClients list error:', error.message);
    return next(error);
  }
}

async function endpointCreateClient(request, response, next) {
  try {
    const { name } = request.body || {};
    if (!name) {
      return response.status(400).send('name is required');
    }
    const result = await createClient(request.body || {});
    return response.status(201).send(result);
  } catch (error) {
    console.error('*** adminApiClients create error:', error.message);
    return next(error);
  }
}

async function endpointToggleClient(request, response, next) {
  try {
    const { id } = request.params;
    const client = await apiClientDb.findById(id);
    if (!client) {
      return response.status(404).send('Client not found');
    }
    const updated = client.status === 'active' ? await revokeClient(id) : await activateClient(id);
    return response.status(200).send(updated);
  } catch (error) {
    console.error('*** adminApiClients toggle error:', error.message);
    return next(error);
  }
}

async function endpointUpdateClient(request, response, next) {
  try {
    const { id } = request.params;
    const client = await apiClientDb.findById(id);
    if (!client) {
      return response.status(404).send('Client not found');
    }

    const payload = buildUpdatePayload(request.body || {});
    let updated = client;
    if (Object.keys(payload.fields).length) {
      updated = await updateClientFields(id, payload.fields);
    }
    let apiKey;
    if (payload.regenerateKey) {
      const regen = await regenerateApiKey(id);
      updated = regen.client;
      apiKey = regen.apiKey;
    }
    return response.status(200).send({ client: updated, apiKey });
  } catch (error) {
    console.error('*** adminApiClients update error:', error.message);
    return next(error);
  }
}

async function endpointDeleteClient(request, response, next) {
  try {
    const { id } = request.params;
    const client = await apiClientDb.findById(id);
    if (!client) {
      return response.status(404).send('Client not found');
    }
    await deleteClient(id);
    return response.status(204).send();
  } catch (error) {
    console.error('*** adminApiClients delete error:', error.message);
    return next(error);
  }
}

function buildUpdatePayload(body) {
  const fields = {};
  if (body.name != null) fields.name = String(body.name).trim();
  if (body.contactEmail != null) fields.contactEmail = String(body.contactEmail).trim();
  if (body.plan != null) fields.plan = String(body.plan).trim();
  if (body.rateLimitPerMin != null) {
    const rate = Number(body.rateLimitPerMin);
    if (!Number.isNaN(rate) && rate > 0) {
      fields.rateLimitPerMin = rate;
    }
  }
  if (body.dailyQuota != null) {
    const quota = Number(body.dailyQuota);
    if (!Number.isNaN(quota) && quota > 0) {
      fields.dailyQuota = quota;
    }
  }
  if (body.status && (body.status === 'active' || body.status === 'revoked')) {
    fields.status = body.status;
  }
  if (body.metadata !== undefined) {
    fields.metadata = body.metadata;
  }
  const regenerateKey = Boolean(body.regenerateKey);
  return { fields, regenerateKey };
}

async function endpointGetClientAccess(request, response, next) {
  try {
    const { id } = request.params;
    const client = await apiClientDb.findById(id).lean();
    if (!client) {
      return response.status(404).send('Client not found');
    }
    const logs = await clientAccessLogDb
      .find({ client: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const distinctHosts = Array.from(new Set(logs.map((l) => l.host).filter(Boolean)));
    return response.status(200).send({ distinctHosts, logs });
  } catch (error) {
    console.error('*** adminApiClients access error:', error.message);
    return next(error);
  }
}

module.exports = {
  endpointListClients,
  endpointCreateClient,
  endpointToggleClient,
  endpointUpdateClient,
  endpointDeleteClient,
  endpointGetClientAccess,
};

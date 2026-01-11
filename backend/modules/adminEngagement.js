'use strict';

const engagementEventDb = require('../models/engagementEventDb');
const adminUserDb = require('../models/adminUserDb');
const locationsDb = require('../models/locationsDb');
const appConfig = require('./appConfig');
const { getLocalPartsFromUtc, getLocalStartOfDayEpoch } = require('./timezone');

function clampNumber(value, { min, max, fallback }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

async function endpointSummary(request, response, next) {
  try {
    const days = clampNumber(request.query?.days, { min: 1, max: 90, fallback: 7 });
    const since = new Date(Date.now() - days * appConfig.values().MS_PER_DAY);
    const match = { createdAt: { $gte: since } };

    const [totalEvents, userIds, sessionIds, topEvents, topLocations] = await Promise.all([
      engagementEventDb.countDocuments(match),
      engagementEventDb.distinct('user', { ...match, user: { $ne: null } }),
      engagementEventDb.distinct('sessionId', { ...match, sessionId: { $ne: '' } }),
      engagementEventDb.aggregate([
        { $match: match },
        { $group: { _id: '$event', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      engagementEventDb.aggregate([
        { $match: { ...match, locationId: { $ne: null } } },
        { $group: { _id: '$locationId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const seattleParts = getLocalPartsFromUtc(Date.now(), 'America/Los_Angeles');
    const startEpoch = seattleParts ? getLocalStartOfDayEpoch(seattleParts) : null;
    const endEpoch = Number.isFinite(startEpoch)
      ? startEpoch + appConfig.values().MS_PER_DAY - 1
      : null;
    const startDate = Number.isFinite(startEpoch) ? new Date(startEpoch) : null;
    const endDate = Number.isFinite(endEpoch) ? new Date(endEpoch) : null;
    const newUsers = startDate && endDate
      ? await adminUserDb.find({ createdAt: { $gte: startDate, $lte: endDate } }).sort({ createdAt: -1 }).limit(20).lean()
      : [];

    const locationIds = topLocations.map((entry) => entry._id).filter(Boolean);
    const locations = await locationsDb.find({ _id: { $in: locationIds } }).lean();
    const locationMap = new Map(locations.map((loc) => [String(loc._id), loc.name || 'Unknown']));

    const summary = {
      rangeDays: days,
      totalEvents,
      uniqueUsers: userIds.length,
      uniqueSessions: sessionIds.length,
      newUsersCount: newUsers.length,
      newUsers: newUsers.map((user) => ({
        email: user.email,
        name: user.name || '',
        createdAt: user.createdAt,
      })),
      topEvents: topEvents.map((entry) => ({ event: entry._id, count: entry.count })),
      topLocations: topLocations.map((entry) => ({
        locationId: String(entry._id),
        name: locationMap.get(String(entry._id)) || 'Unknown',
        count: entry.count,
      })),
    };

    return response.status(200).send(summary);
  } catch (error) {
    console.error('*** adminEngagement summary error:', error.message);
    return next(error);
  }
}

module.exports = {
  endpointSummary,
};

// admin Engagement module.
'use strict';

const engagementEventDb = require('../models/engagementEventDb');
const adminUserDb = require('../models/adminUserDb');
const locationsDb = require('../models/locationsDb');
const appConfig = require('./appConfig');

// clamp Number helper.
function clampNumber(value, { min, max, fallback }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

// Handle Summary.
async function endpointSummary(request, response, next) {
  try {
    const days = clampNumber(request.query?.days, { min: 1, max: 90, fallback: 7 });
    const since = new Date(Date.now() - days * appConfig.values().MS_PER_DAY);
    const match = { createdAt: { $gte: since } };

    const clickEvents = [
      'month_changed',
      'day_opened',
      'day_shifted',
      'hourly_opened',
      'hourly_shifted',
      'resort_selected',
    ];
    const [totalEvents, userIds, sessionIds, topEvents, topLocations, pageClicksAgg, sessionStatsAgg, clickAgg] = await Promise.all([
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
      engagementEventDb.aggregate([
        { $match: { ...match, event: { $in: ['day_opened', 'hourly_opened', 'pow_alert_created'] } } },
        { $group: { _id: '$event', count: { $sum: 1 } } },
      ]),
      engagementEventDb.aggregate([
        { $match: { ...match, sessionId: { $ne: '' } } },
        { $group: { _id: '$sessionId', first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
        { $project: { durationSeconds: { $divide: [{ $subtract: ['$last', '$first'] }, 1000] } } },
        {
          $group: {
            _id: null,
            avgSessionSeconds: { $avg: '$durationSeconds' },
            totalSessionSeconds: { $sum: '$durationSeconds' },
            sessionCount: { $sum: 1 },
          },
        },
      ]),
      engagementEventDb.aggregate([
        { $match: { ...match, event: { $in: clickEvents } } },
        { $group: { _id: null, clicks: { $sum: 1 } } },
      ]),
    ]);

    const newUsersCount = await adminUserDb.countDocuments({ createdAt: { $gte: since } });

    // location Ids helper.
    const locationIds = topLocations.map((entry) => entry._id).filter(Boolean);
    const locations = await locationsDb.find({ _id: { $in: locationIds } }).lean();
    // location Map helper.
    const locationMap = new Map(locations.map((loc) => [String(loc._id), loc.name || 'Unknown']));

    const summary = {
      rangeDays: days,
      totalEvents,
      uniqueUsers: userIds.length,
      uniqueSessions: sessionIds.length,
      newUsersCount,
      avgSessionSeconds: sessionStatsAgg[0] ? sessionStatsAgg[0].avgSessionSeconds : 0,
      totalSessionSeconds: sessionStatsAgg[0] ? sessionStatsAgg[0].totalSessionSeconds : 0,
      sessionCount: sessionStatsAgg[0] ? sessionStatsAgg[0].sessionCount : 0,
      clicks: clickAgg[0] ? clickAgg[0].clicks : 0,
      pageClicks: pageClicksAgg.reduce((acc, entry) => {
        acc[entry._id] = entry.count;
        return acc;
      }, {}),
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

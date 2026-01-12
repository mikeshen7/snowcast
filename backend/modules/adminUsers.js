// admin Users module.
'use strict';

const adminUserDb = require('../models/adminUserDb');
const engagementEventDb = require('../models/engagementEventDb');
const appConfig = require('./appConfig');
const { ADMIN_ROLE, FREE_ROLE, PREMIUM_ROLE } = require('./adminAuth');
const ALLOWED_ROLES = new Set([ADMIN_ROLE, FREE_ROLE, PREMIUM_ROLE]);
const { config } = require('../config');
const BOOTSTRAP_EMAIL = config.backend.adminEmail;

// list Users helper.
async function listUsers(request, response, next) {
  try {
    const days = Math.max(1, Math.min(90, Number(request.query?.days) || 30));
    const since = new Date(Date.now() - days * appConfig.values().MS_PER_DAY);
    const engagementAgg = await engagementEventDb.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          user: { $ne: null },
        },
      },
      {
        $group: {
          _id: { user: '$user', event: '$event' },
          count: { $sum: 1 },
        },
      },
    ]);
    const clickEvents = [
      'month_changed',
      'day_opened',
      'day_shifted',
      'hourly_opened',
      'hourly_shifted',
      'resort_selected',
    ];
    const clickAgg = await engagementEventDb.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          user: { $ne: null },
          event: { $in: clickEvents },
        },
      },
      {
        $group: {
          _id: '$user',
          clicks: { $sum: 1 },
        },
      },
    ]);
    const totalsAgg = await engagementEventDb.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          user: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$user',
          count: { $sum: 1 },
        },
      },
    ]);
    const activeDaysAgg = await engagementEventDb.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          user: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            user: '$user',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
        },
      },
      {
        $group: {
          _id: '$_id.user',
          activeDays: { $sum: 1 },
        },
      },
    ]);
    const sessionAgg = await engagementEventDb.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          user: { $ne: null },
          sessionId: { $ne: '' },
        },
      },
      {
        $group: {
          _id: { user: '$user', sessionId: '$sessionId' },
          first: { $min: '$createdAt' },
          last: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          user: '$_id.user',
          durationSeconds: { $divide: [{ $subtract: ['$last', '$first'] }, 1000] },
        },
      },
      {
        $group: {
          _id: '$user',
          totalSessionSeconds: { $sum: '$durationSeconds' },
          avgSessionSeconds: { $avg: '$durationSeconds' },
          sessionCount: { $sum: 1 },
        },
      },
    ]);
    // totals Map helper.
    const totalsMap = totalsAgg.reduce((map, entry) => {
      map.set(String(entry._id), entry.count);
      return map;
    }, new Map());
    // active Days Map helper.
    const activeDaysMap = activeDaysAgg.reduce((map, entry) => {
      map.set(String(entry._id), entry.activeDays);
      return map;
    }, new Map());
    // click Map helper.
    const clickMap = clickAgg.reduce((map, entry) => {
      map.set(String(entry._id), entry.clicks);
      return map;
    }, new Map());
    // session Map helper.
    const sessionMap = sessionAgg.reduce((map, entry) => {
      map.set(String(entry._id), {
        totalSessionSeconds: entry.totalSessionSeconds,
        avgSessionSeconds: entry.avgSessionSeconds,
        sessionCount: entry.sessionCount,
      });
      return map;
    }, new Map());
    const engagementMap = new Map();
    engagementAgg.forEach((entry) => {
      const userId = String(entry._id.user);
      const eventName = entry._id.event;
      if (!engagementMap.has(userId)) {
        engagementMap.set(userId, {
          dayTileClicks: 0,
          hourlyClicks: 0,
          powAlertClicks: 0,
          totalEvents: totalsMap.get(userId) || 0,
        });
      }
      const bucket = engagementMap.get(userId);
      if (eventName === 'day_opened') {
        bucket.dayTileClicks += entry.count;
      } else if (eventName === 'hourly_opened') {
        bucket.hourlyClicks += entry.count;
      } else if (eventName === 'pow_alert_created') {
        bucket.powAlertClicks += entry.count;
      }
    });

    const users = await adminUserDb.find().sort({ createdAt: -1 }).lean();
    // enriched helper.
    const enriched = users.map((user) => {
      const activeDays = activeDaysMap.get(String(user._id)) || 0;
      const activeDaysPercent = days > 0 ? Math.round((activeDays / days) * 100) : 0;
      const engagement = engagementMap.get(String(user._id)) || {
        dayTileClicks: 0,
        hourlyClicks: 0,
        powAlertClicks: 0,
        totalEvents: totalsMap.get(String(user._id)) || 0,
      };
      const sessionStats = sessionMap.get(String(user._id)) || {
        totalSessionSeconds: 0,
        avgSessionSeconds: 0,
        sessionCount: 0,
      };
      const clicks = clickMap.get(String(user._id)) || 0;
      const clicksPerSession = sessionStats.sessionCount
        ? clicks / sessionStats.sessionCount
        : 0;
      return {
        ...user,
        engagement,
        activeDays,
        activeDaysPercent,
        sessionStats,
        clickStats: {
          clicks,
          clicksPerSession,
        },
        engagementRangeDays: days,
      };
    });
    return response.status(200).send(enriched);
  } catch (error) {
    console.error('*** adminUsers list error:', error.message);
    return next(error);
  }
}

// Create User.
async function createUser(request, response, next) {
  try {
    const { email, name, roles, subscriptionExpiresAt } = request.body || {};
    if (!email) {
      return response.status(400).send('email is required');
    }
    if (!name || !String(name).trim()) {
      return response.status(400).send('name is required');
    }
    if (Array.isArray(roles) && roles.length > 1) {
      return response.status(400).send('Only one role is allowed');
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await adminUserDb.findOne({ email: normalizedEmail });
    if (existing) {
      return response.status(400).send('User already exists');
    }
    const parsedRoles = parseRoles(roles);
    const nextRoles = parsedRoles.length ? parsedRoles : [FREE_ROLE];
    const nextExpiry = nextRoles.includes(ADMIN_ROLE) ? null : parseSubscriptionExpiry(subscriptionExpiresAt);
    const user = await adminUserDb.create({
      email: normalizedEmail,
      name: String(name).trim(),
      roles: nextRoles,
      subscriptionExpiresAt: nextExpiry,
      status: 'active',
    });
    return response.status(201).send(user);
  } catch (error) {
    console.error('*** adminUsers create error:', error.message);
    return next(error);
  }
}

// Update User.
async function updateUser(request, response, next) {
  try {
    const { id } = request.params;
    const { name, roles, status, subscriptionExpiresAt } = request.body || {};
    const update = {};
    if (name !== undefined) {
      const trimmed = String(name || '').trim();
      if (!trimmed) {
        return response.status(400).send('name is required');
      }
      update.name = trimmed;
    }
    if (roles !== undefined) {
      if (Array.isArray(roles) && roles.length > 1) {
        return response.status(400).send('Only one role is allowed');
      }
      const parsedRoles = parseRoles(roles);
      update.roles = parsedRoles.length ? parsedRoles : [FREE_ROLE];
    }
    if (status === 'active' || status === 'suspended') {
      update.status = status;
    }
    if (subscriptionExpiresAt !== undefined) {
      update.subscriptionExpiresAt = parseSubscriptionExpiry(subscriptionExpiresAt);
    }
    if (update.roles && update.roles.includes(ADMIN_ROLE)) {
      update.subscriptionExpiresAt = null;
    }
    const existing = await adminUserDb.findById(id);
    if (!existing) {
      return response.status(404).send('User not found');
    }
    if (!Object.keys(update).length) {
      return response.status(400).send('No valid fields provided');
    }
    const user = await adminUserDb.findByIdAndUpdate(id, update, { new: true });
    return response.status(200).send(user);
  } catch (error) {
    console.error('*** adminUsers update error:', error.message);
    return next(error);
  }
}

// Remove User.
async function deleteUser(request, response, next) {
  try {
    const { id } = request.params;
    const user = await adminUserDb.findById(id);
    if (!user) {
      return response.status(404).send('User not found');
    }
    await adminUserDb.findByIdAndDelete(id);
    return response.status(204).send();
  } catch (error) {
    console.error('*** adminUsers delete error:', error.message);
    return next(error);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};

// parse Roles helper.
function parseRoles(roles) {
  const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return list
    .map((r) => String(r).trim())
    .filter((r) => ALLOWED_ROLES.has(r))
    .slice(0, 1);
}

// parse Subscription Expiry helper.
function parseSubscriptionExpiry(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

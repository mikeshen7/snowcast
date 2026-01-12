// engagement module.
'use strict';

const mongoose = require('mongoose');
const engagementEventDb = require('../models/engagementEventDb');
const { getFrontendUserFromRequest } = require('./frontendAuth');

const ALLOWED_EVENTS = new Set([
  'app_opened',
  'view_profile',
  'view_pow_alerts',
  'view_subscription',
  'login_link_requested',
  'resort_selected',
  'favorite_added',
  'favorite_removed',
  'day_opened',
  'hourly_opened',
  'pow_alert_created',
  'pow_alert_deleted',
  'pow_alert_toggled',
  'discount_redeemed',
  'heartbeat',
  'month_changed',
  'day_shifted',
  'hourly_shifted',
]);

const MAX_META_KEYS = 10;
const MAX_STRING_LENGTH = 200;

// sanitize Meta helper.
function sanitizeMeta(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const entries = Object.entries(raw).slice(0, MAX_META_KEYS);
  const sanitized = {};
  entries.forEach(([key, value]) => {
    if (!key) return;
    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, MAX_STRING_LENGTH);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  });
  return sanitized;
}

// Handle Track Event.
async function handleTrackEvent(request, response, next) {
  try {
    const body = request.body || {};
    const eventName = String(body.event || '').trim();
    if (!eventName) {
      return response.status(400).send('event is required');
    }
    if (!ALLOWED_EVENTS.has(eventName)) {
      return response.status(400).send('event not allowed');
    }

    const sessionId = String(body.sessionId || '').trim().slice(0, 80);
    const meta = sanitizeMeta(body.meta);
    const rawLocationId = body.locationId ? String(body.locationId) : '';
    const locationId = mongoose.Types.ObjectId.isValid(rawLocationId) ? rawLocationId : null;

    const user = await getFrontendUserFromRequest(request);
    const role = user?.roles?.[0] || 'guest';

    await engagementEventDb.create({
      event: eventName,
      user: user?.id || null,
      role,
      sessionId,
      locationId: locationId || null,
      meta,
    });

    return response.status(200).send({ ok: true });
  } catch (error) {
    console.error('*** engagement track error:', error.message);
    return next(error);
  }
}

module.exports = { handleTrackEvent };

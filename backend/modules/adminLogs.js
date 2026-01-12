// admin Logs module.
'use strict';

const adminLogDb = require('../models/adminLogDb');

// Log Admin Event.
async function logAdminEvent({ type, message, meta } = {}) {
  if (!type) return;
  try {
    await adminLogDb.create({
      type: String(type),
      message: message ? String(message) : '',
      meta: meta || {},
    });
  } catch (error) {
    // Best-effort logging; ignore failures.
  }
}

// Handle List Logs.
async function endpointListLogs(request, response, next) {
  try {
    const limit = Math.min(Number(request.query.limit) || 200, 500);
    const type = String(request.query.type || '').trim();
    const filter = {};
    if (type) {
      filter.type = type;
    }
    const logs = await adminLogDb
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return response.status(200).send({
      logs: logs.map((log) => ({
        id: log._id,
        type: log.type,
        message: log.message,
        meta: log.meta,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    console.error('*** adminLogs endpointListLogs error:', error.message);
    next(error);
  }
}

module.exports = {
  logAdminEvent,
  endpointListLogs,
};

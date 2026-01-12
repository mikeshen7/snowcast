// admin Logs module.
'use strict';

const adminLogDb = require('../models/adminLogDb');

// escape Regex helper.
function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    const page = Math.max(Number(request.query.page) || 1, 1);
    const type = String(request.query.type || '').trim();
    const messageQuery = String(request.query.message || '').trim();
    const filter = {};
    if (type) {
      filter.type = type;
    }
    if (messageQuery) {
      filter.message = { $regex: escapeRegex(messageQuery), $options: 'i' };
    }
    const startDate = String(request.query.startDate || '').trim();
    const endDate = String(request.query.endDate || '').trim();
    if (startDate || endDate) {
      const range = {};
      if (startDate) {
        const start = new Date(`${startDate}T00:00:00Z`);
        if (!Number.isNaN(start.getTime())) {
          range.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59.999Z`);
        if (!Number.isNaN(end.getTime())) {
          range.$lte = end;
        }
      }
      if (Object.keys(range).length) {
        filter.createdAt = range;
      }
    }
    const total = await adminLogDb.countDocuments(filter);
    const allTypes = await adminLogDb.distinct('type');
    const logs = await adminLogDb
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return response.status(200).send({
      total,
      page,
      types: (allTypes || []).filter(Boolean).sort(),
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

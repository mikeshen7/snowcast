'use strict';

const adminUserDb = require('../models/adminUserDb');
const { ADMIN_ROLE, FREE_ROLE, PREMIUM_ROLE } = require('./adminAuth');
const ALLOWED_ROLES = new Set([ADMIN_ROLE, FREE_ROLE, PREMIUM_ROLE]);
const { config } = require('../config');
const BOOTSTRAP_EMAIL = config.backend.adminEmail;

async function listUsers(request, response, next) {
  try {
    const users = await adminUserDb.find().sort({ createdAt: -1 }).lean();
    return response.status(200).send(users);
  } catch (error) {
    console.error('*** adminUsers list error:', error.message);
    return next(error);
  }
}

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

function parseRoles(roles) {
  const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return list
    .map((r) => String(r).trim())
    .filter((r) => ALLOWED_ROLES.has(r))
    .slice(0, 1);
}

function parseSubscriptionExpiry(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

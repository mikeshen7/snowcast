'use strict';

const adminUserDb = require('../models/adminUserDb');
const { OWNER_ROLE, ADMIN_ROLE, BASIC_ROLE, STANDARD_ROLE, ADVANCED_ROLE } = require('./adminAuth');
const ALLOWED_ROLES = new Set([OWNER_ROLE, ADMIN_ROLE, BASIC_ROLE, STANDARD_ROLE, ADVANCED_ROLE]);
const ALLOWED_LOCATION_ACCESS = new Set(['all', 'resort-only']);
const { config } = require('../config');
const BOOTSTRAP_EMAIL = config.backend.ownerEmail;

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
    const { email, name, roles, locationAccess, adminAccess } = request.body || {};
    if (!email) {
      return response.status(400).send('email is required');
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (BOOTSTRAP_EMAIL && normalizedEmail === BOOTSTRAP_EMAIL) {
      return response.status(403).send('Owner is managed via bootstrap email');
    }
    const existing = await adminUserDb.findOne({ email: normalizedEmail });
    if (existing) {
      return response.status(400).send('User already exists');
    }
    const parsedRoles = parseRoles(roles);
    if (parsedRoles.includes(OWNER_ROLE)) {
      return response.status(403).send('Cannot create owner via API');
    }
    const parsedAccess = parseLocationAccess(locationAccess);
    const parsedAdminAccess = parseAdminAccess(adminAccess);
    const user = await adminUserDb.create({
      email: normalizedEmail,
      name: name ? String(name).trim() : '',
      roles: parsedRoles.length ? parsedRoles : [BASIC_ROLE],
      locationAccess: parsedAccess || 'all',
      adminAccess: parsedAdminAccess,
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
    const { name, roles, status, locationAccess, adminAccess } = request.body || {};
    const update = {};
    if (name !== undefined) update.name = String(name || '').trim();
    if (roles !== undefined) {
      const parsedRoles = parseRoles(roles);
      if (parsedRoles.includes(OWNER_ROLE)) {
        return response.status(403).send('Cannot assign owner role');
      }
      update.roles = parsedRoles.length ? parsedRoles : [BASIC_ROLE];
    }
    if (status === 'active' || status === 'suspended') {
      update.status = status;
    }
    if (locationAccess !== undefined) {
      const parsedAccess = parseLocationAccess(locationAccess);
      if (parsedAccess) {
        update.locationAccess = parsedAccess;
      }
    }
    if (adminAccess !== undefined) {
      update.adminAccess = parseAdminAccess(adminAccess);
    }
    const existing = await adminUserDb.findById(id);
    if (!existing) {
      return response.status(404).send('User not found');
    }
    const isOwner = (existing.roles || []).includes(OWNER_ROLE) || (BOOTSTRAP_EMAIL && existing.email === BOOTSTRAP_EMAIL);
    if (isOwner) {
      update.roles = [OWNER_ROLE];
      update.status = 'active';
      update.locationAccess = 'all';
      update.adminAccess = true;
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
    if ((user.roles && user.roles.includes(OWNER_ROLE)) || (BOOTSTRAP_EMAIL && user.email === BOOTSTRAP_EMAIL)) {
      return response.status(403).send('Cannot delete owner');
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

function parseLocationAccess(value) {
  if (!value) return '';
  const normalized = String(value).trim();
  return ALLOWED_LOCATION_ACCESS.has(normalized) ? normalized : '';
}

function parseAdminAccess(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  return String(value).trim().toLowerCase() === 'true';
}

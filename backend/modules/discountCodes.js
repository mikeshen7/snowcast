'use strict';

const discountCodeDb = require('../models/discountCodeDb');
const adminUserDb = require('../models/adminUserDb');
const { getFrontendUserFromRequest } = require('./frontendAuth');
const { normalizeRole } = require('./roleConfig');

const allowedRoles = new Set(['level1', 'level2', 'level3', 'admin', 'owner']);

function normalizeCode(input) {
  return String(input || '').trim().toLowerCase();
}

async function listCodes(request, response) {
  const codes = await discountCodeDb.find().sort({ createdAt: -1 }).lean();
  const payload = codes.map((code) => ({
    id: String(code._id),
    code: code.code,
    targetRole: code.targetRole,
    active: Boolean(code.active),
    createdAt: code.createdAt,
  }));
  return response.status(200).send(payload);
}

async function createCode(request, response) {
  const codeValue = normalizeCode(request.body?.code);
  const targetRole = normalizeRole(request.body?.targetRole);
  const active = request.body?.active !== false;
  if (!codeValue) {
    return response.status(400).send({ error: 'Code is required' });
  }
  if (!allowedRoles.has(targetRole)) {
    return response.status(400).send({ error: 'Invalid target role' });
  }
  const existing = await discountCodeDb.findOne({ code: codeValue });
  if (existing) {
    return response.status(400).send({ error: 'Code already exists' });
  }
  const created = await discountCodeDb.create({ code: codeValue, targetRole, active });
  return response.status(201).send({
    id: String(created._id),
    code: created.code,
    targetRole: created.targetRole,
    active: Boolean(created.active),
    createdAt: created.createdAt,
  });
}

async function updateCode(request, response) {
  const codeId = request.params?.id;
  const code = await discountCodeDb.findById(codeId);
  if (!code) {
    return response.status(404).send({ error: 'Code not found' });
  }
  if (request.body?.active !== undefined) {
    code.active = Boolean(request.body.active);
  }
  if (request.body?.targetRole) {
    const targetRole = normalizeRole(request.body.targetRole);
    if (!allowedRoles.has(targetRole)) {
      return response.status(400).send({ error: 'Invalid target role' });
    }
    code.targetRole = targetRole;
  }
  await code.save();
  return response.status(200).send({
    id: String(code._id),
    code: code.code,
    targetRole: code.targetRole,
    active: Boolean(code.active),
    createdAt: code.createdAt,
  });
}

async function deleteCode(request, response) {
  const codeId = request.params?.id;
  await discountCodeDb.deleteOne({ _id: codeId });
  return response.status(200).send({ ok: true });
}

async function redeemCode(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const codeValue = normalizeCode(request.body?.code);
  if (!codeValue) {
    return response.status(400).send({ error: 'Code is required' });
  }
  const code = await discountCodeDb.findOne({ code: codeValue, active: true }).lean();
  if (!code) {
    return response.status(404).send({ error: 'Invalid code' });
  }
  const record = await adminUserDb.findById(user.id);
  if (!record) {
    return response.status(404).send({ error: 'User not found' });
  }
  const currentRoles = Array.isArray(record.roles) ? record.roles : [];
  if (currentRoles.includes('owner') || currentRoles.includes('admin')) {
    return response.status(200).send({ ok: true, roles: currentRoles });
  }
  record.roles = [code.targetRole];
  await record.save();
  return response.status(200).send({ ok: true, roles: record.roles });
}

module.exports = {
  listCodes,
  createCode,
  updateCode,
  deleteCode,
  redeemCode,
};

'use strict';

const discountCodeDb = require('../models/discountCodeDb');
const adminUserDb = require('../models/adminUserDb');
const { getFrontendUserFromRequest } = require('./frontendAuth');

function normalizeCode(input) {
  return String(input || '').trim().toLowerCase();
}

function normalizeDurationMonths(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeMaxUses(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function addMonths(date, months) {
  const base = new Date(date.getTime());
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();
  const targetMonth = month + months;
  const candidate = new Date(base);
  candidate.setFullYear(year, targetMonth, 1);
  const daysInTargetMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
  candidate.setDate(Math.min(day, daysInTargetMonth));
  candidate.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
  return candidate;
}

async function listCodes(request, response) {
  const codes = await discountCodeDb.find().sort({ createdAt: -1 }).lean();
  const payload = codes.map((code) => ({
    id: String(code._id),
    code: code.code,
    durationMonths: code.durationMonths,
    maxUses: code.maxUses ?? 0,
    usesCount: Array.isArray(code.redeemedBy) ? code.redeemedBy.length : 0,
    active: Boolean(code.active),
    createdAt: code.createdAt,
  }));
  return response.status(200).send(payload);
}

async function createCode(request, response) {
  const codeValue = normalizeCode(request.body?.code);
  const durationMonths = normalizeDurationMonths(request.body?.durationMonths);
  const maxUses = normalizeMaxUses(request.body?.maxUses);
  const active = request.body?.active !== false;
  if (!codeValue) {
    return response.status(400).send({ error: 'Code is required' });
  }
  if (!durationMonths) {
    return response.status(400).send({ error: 'Duration is required' });
  }
  const existing = await discountCodeDb.findOne({ code: codeValue });
  if (existing) {
    return response.status(400).send({ error: 'Code already exists' });
  }
  const created = await discountCodeDb.create({
    code: codeValue,
    durationMonths,
    maxUses,
    active,
  });
  return response.status(201).send({
    id: String(created._id),
    code: created.code,
    durationMonths: created.durationMonths,
    maxUses: created.maxUses ?? 0,
    usesCount: Array.isArray(created.redeemedBy) ? created.redeemedBy.length : 0,
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
  if (request.body?.durationMonths !== undefined) {
    const durationMonths = normalizeDurationMonths(request.body.durationMonths);
    if (!durationMonths) {
      return response.status(400).send({ error: 'Invalid duration' });
    }
    code.durationMonths = durationMonths;
  }
  if (request.body?.maxUses !== undefined) {
    code.maxUses = normalizeMaxUses(request.body.maxUses);
  }
  await code.save();
  return response.status(200).send({
    id: String(code._id),
    code: code.code,
    durationMonths: code.durationMonths,
    maxUses: code.maxUses ?? 0,
    usesCount: Array.isArray(code.redeemedBy) ? code.redeemedBy.length : 0,
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
  const code = await discountCodeDb.findOne({ code: codeValue, active: true });
  if (!code) {
    return response.status(404).send({ error: 'Invalid code' });
  }
  const record = await adminUserDb.findById(user.id);
  if (!record) {
    return response.status(404).send({ error: 'User not found' });
  }
  if (!code.durationMonths || code.durationMonths <= 0) {
    return response.status(400).send({ error: 'Invalid code duration' });
  }
  const redeemedBy = Array.isArray(code.redeemedBy) ? code.redeemedBy : [];
  if (redeemedBy.some((id) => String(id) === String(record._id))) {
    return response.status(403).send({ error: 'Code already used' });
  }
  const maxUses = Number(code.maxUses || 0);
  if (maxUses > 0 && redeemedBy.length >= maxUses) {
    return response.status(403).send({ error: 'Code usage limit reached' });
  }
  const currentRoles = Array.isArray(record.roles) ? record.roles : [];
  if (!currentRoles.includes('admin')) {
    record.roles = ['premium'];
  }
  const baseDate = record.subscriptionExpiresAt && record.subscriptionExpiresAt > new Date()
    ? record.subscriptionExpiresAt
    : new Date();
  record.subscriptionExpiresAt = addMonths(baseDate, code.durationMonths);
  code.redeemedBy = [...redeemedBy, record._id];
  await code.save();
  await record.save();
  return response.status(200).send({
    ok: true,
    roles: record.roles,
    subscriptionExpiresAt: record.subscriptionExpiresAt,
  });
}

module.exports = {
  listCodes,
  createCode,
  updateCode,
  deleteCode,
  redeemCode,
};

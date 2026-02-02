'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { config } = require('../config');
const { sendEmail } = require('./email');
const { getFrontendUserFromRequest } = require('./frontendAuth');
const locationsDb = require('../models/locationsDb');
const forecastModelDb = require('../models/forecastModelDb');
const adminUserDb = require('../models/adminUserDb');
const shareEmailDb = require('../models/shareEmailDb');

const DAILY_EMAIL_LIMIT = 20;
const DEFAULT_MODEL = 'median';
const DEFAULT_ELEVATION = 'mid';
const EMAIL_ASSET_CACHE = new Map();

function getEmailAssetDataUrl(cacheKey, assetPath) {
  if (!assetPath) return '';
  if (EMAIL_ASSET_CACHE.has(cacheKey)) {
    return EMAIL_ASSET_CACHE.get(cacheKey);
  }
  if (!fs.existsSync(assetPath)) {
    EMAIL_ASSET_CACHE.set(cacheKey, '');
    return '';
  }
  const data = fs.readFileSync(assetPath);
  const dataUrl = `data:image/png;base64,${data.toString('base64')}`;
  EMAIL_ASSET_CACHE.set(cacheKey, dataUrl);
  return dataUrl;
}

function getEmailLogoDataUrl() {
  const logoPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'snowcast.png');
  return getEmailAssetDataUrl('logo', logoPath);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function normalizeModel(value, location) {
  const key = String(value || '').toLowerCase().trim();
  if (!key || key === 'blend') return DEFAULT_MODEL;
  if (key === DEFAULT_MODEL) return DEFAULT_MODEL;
  const allowed = new Set((location?.apiModelNames || []).map((name) => String(name || '').toLowerCase().trim()));
  return allowed.has(key) ? key : DEFAULT_MODEL;
}

function normalizeElevation(value) {
  const key = String(value || '').toLowerCase().trim();
  const allowed = new Set(['base', 'mid', 'top']);
  return allowed.has(key) ? key : DEFAULT_ELEVATION;
}

function normalizeMonth(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return '';
  return raw;
}

function getUtcDayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function formatMonthLabel(month) {
  if (!month) return 'this month';
  const [year, monthValue] = month.split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(monthValue)) return 'this month';
  const date = new Date(Date.UTC(year, monthValue - 1, 1));
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatElevationLabel(value) {
  if (value === 'top') return 'Top';
  if (value === 'base') return 'Base';
  return 'Mid';
}

function buildShareEmailHtml({ locationName, modelLabel, elevationLabel, monthLabel, shareUrl, senderLabel }) {
  const logoBase = config.email.imageBaseUrl || config.backend.url || config.frontend.url || '';
  const embedImages = config.email.embedImages;
  const logoUrl = embedImages
    ? getEmailLogoDataUrl()
    : (logoBase ? `${logoBase.replace(/\/$/, '')}/snowcast.png` : '');

  return `
    <div style="font-family:Arial,sans-serif;background:#eef4fb;padding:20px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;padding:20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;">
              ${logoUrl ? `<img src="${logoUrl}" alt="Snowcast" style="width:36px;height:36px;border-radius:8px;display:block;border:0;"/>` : ''}
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="font-size:18px;font-weight:700;color:#0d1b2a;">Snowcast</div>
              <div style="font-size:12px;color:#415a77;">${locationName}</div>
            </td>
          </tr>
        </table>
        <div style="margin-top:12px;font-size:13px;color:#1b263b;">
          ${senderLabel ? `${senderLabel} shared a Snowcast calendar with you.` : 'A Snowcast calendar was shared with you.'}
        </div>
        <div style="margin-top:18px;">
          <a href="${shareUrl}" style="display:inline-block;background:linear-gradient(120deg,#5b7fd6,#2f5fa8);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:999px;">Open Calendar</a>
        </div>
        <div style="margin-top:14px;font-size:11px;color:#5b6b80;word-break:break-all;">${shareUrl}</div>
      </div>
    </div>
  `;
}

async function handleShareCalendar(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }

  const toEmail = normalizeEmail(request.body?.to);
  if (!toEmail || !isValidEmail(toEmail)) {
    return response.status(400).send({ error: 'Valid email is required' });
  }

  const locationId = String(request.body?.locationId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(locationId)) {
    return response.status(400).send({ error: 'locationId is required' });
  }

  const location = await locationsDb.findById(locationId).lean();
  if (!location) {
    return response.status(404).send({ error: 'Location not found' });
  }

  const dayStart = getUtcDayStart();
  const sentToday = await shareEmailDb.countDocuments({
    userId: user.id,
    createdAt: { $gte: dayStart },
  });
  if (sentToday >= DAILY_EMAIL_LIMIT) {
    return response.status(429).send({ error: 'Daily share email limit reached' });
  }

  const normalizedModel = normalizeModel(request.body?.model, location);
  const normalizedElevation = normalizeElevation(request.body?.elevation);
  const month = normalizeMonth(request.body?.month);
  const shareUrl = String(request.body?.shareUrl || '').trim();

  if (!shareUrl) {
    return response.status(400).send({ error: 'shareUrl is required' });
  }

  const modelRecord = normalizedModel === DEFAULT_MODEL
    ? null
    : await forecastModelDb.findOne({ apiModelName: normalizedModel }).lean();
  const modelLabel = normalizedModel === DEFAULT_MODEL
    ? 'Median'
    : (modelRecord?.displayName || normalizedModel.toUpperCase());
  const elevationLabel = formatElevationLabel(normalizedElevation);
  const monthLabel = formatMonthLabel(month);
  const senderUser = await adminUserDb.findById(user.id).lean();
  const senderLabel = senderUser?.name || user.email || '';

  const subject = `Snowcast share: ${location.name} - ${monthLabel}`;
  const text = [
    `${senderLabel} shared a Snowcast calendar with you.`,
    '',
    `Location: ${location.name}`,
    '',
    'Open the calendar:',
    shareUrl,
    '',
    '- Snowcast',
  ].join('\n');

  const html = buildShareEmailHtml({
    locationName: location.name,
    modelLabel,
    elevationLabel,
    monthLabel,
    shareUrl,
    senderLabel,
  });

  await sendEmail({ to: toEmail, subject, text, html });

  await shareEmailDb.create({
    userId: user.id,
    toEmail,
    locationId: location._id,
    model: normalizedModel,
    elevation: normalizedElevation,
    month,
  });

  return response.status(200).send({ ok: true });
}

module.exports = { handleShareCalendar };

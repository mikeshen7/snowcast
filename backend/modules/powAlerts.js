// pow Alerts module.
'use strict';

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const powAlertDb = require('../models/powAlertDb');
const adminUserDb = require('../models/adminUserDb');
const locationsDb = require('../models/locationsDb');
const { getFrontendUserFromRequest } = require('./frontendAuth');
const { queryHourlyDocs } = require('./weatherShared');
const { aggregateDailyOverview } = require('./weatherAggregations');
const { sendEmail } = require('./email');
const { getLocalPartsFromUtc, localDateTimeToUtcEpoch, shiftLocalDate, formatDateKey } = require('./timezone');
const { config } = require('../config');
const { getPowAlertLimitForRole, canCheckPow, normalizeRole } = require('./roleConfig');

const SEND_HOUR_LOCAL = 17;
const DEFAULT_MODEL = 'median';
const DEFAULT_ELEVATION = 'mid';
const MODEL_OPTIONS = new Set(['median', 'gfs', 'ecmwf', 'hrrr']);
const ELEVATION_OPTIONS = new Set(['base', 'mid', 'top']);

// Normalize Model.
function normalizeModel(input) {
  const value = String(input || '').toLowerCase().trim();
  if (value === 'blend') return 'median';
  return MODEL_OPTIONS.has(value) ? value : '';
}

// Normalize Elevation.
function normalizeElevation(input) {
  const value = String(input || '').toLowerCase().trim();
  return ELEVATION_OPTIONS.has(value) ? value : '';
}

// Normalize Alert Payload.
function normalizeAlertPayload(body) {
  const locationId = String(body?.locationId || '').trim();
  const windowDays = Number(body?.windowDays);
  const thresholdIn = Number(body?.thresholdIn);
  const active = body?.active !== false;
  const model = normalizeModel(body?.model);
  const elevationKey = normalizeElevation(body?.elevation || body?.elevationKey);
  return {
    locationId,
    windowDays: Number.isFinite(windowDays) ? windowDays : 3,
    thresholdIn: Number.isFinite(thresholdIn) ? thresholdIn : 3,
    active,
    model: model || DEFAULT_MODEL,
    elevationKey: elevationKey || DEFAULT_ELEVATION,
  };
}

// Normalize Window Days.
function normalizeWindowDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return 3;
  return Math.min(Math.max(Math.round(days), 1), 14);
}

// Normalize Threshold.
function normalizeThreshold(value) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0) return 0;
  return threshold;
}

// add Days To Parts helper.
function addDaysToParts(parts, days) {
  const base = Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0);
  const next = new Date(base);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

// Get Local Date Key.
function getLocalDateKey(parts) {
  // pad helper.
  const pad = (value) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

// Get Alert Context.
async function getAlertContext(alert) {
  const [user, location] = await Promise.all([
    adminUserDb.findById(alert.userId).lean(),
    locationsDb.findById(alert.locationId).lean(),
  ]);
  return { user, location };
}

// find First Trigger Day helper.
async function findFirstTriggerDay({ locationId, windowDays, thresholdIn, timeZone, model, elevationKey }) {
  const { days } = await loadWindowDays({ locationId, windowDays, timeZone, model, elevationKey });
  if (!Array.isArray(days) || !days.length) {
    return { trigger: null, days: [] };
  }

  for (const day of days) {
    if (day?.snowTotal != null && Number(day.snowTotal) >= thresholdIn) {
      return {
        trigger: {
          dateKey: day.date,
          snowTotal: Number(day.snowTotal),
        },
        days,
      };
    }
  }
  return { trigger: null, days };
}

// expand Window To Full Weeks helper.
function expandWindowToFullWeeks({ startParts, endParts, timeZone }) {
  const startEpoch = localDateTimeToUtcEpoch({ ...startParts, hour: 0, minute: 0 }, timeZone);
  const startLocal = getLocalPartsFromUtc(startEpoch, timeZone);
  const displayStartParts = shiftLocalDate(startParts, -1 * (startLocal?.weekdayIndex ?? 0));

  const endEpoch = localDateTimeToUtcEpoch({ ...endParts, hour: 0, minute: 0 }, timeZone);
  const endLocal = getLocalPartsFromUtc(endEpoch, timeZone);
  const displayEndParts = shiftLocalDate(endParts, 6 - (endLocal?.weekdayIndex ?? 0));

  return { displayStartParts, displayEndParts };
}

// Check should Send Now.
function shouldSendNow(timeZone) {
  const localParts = getLocalPartsFromUtc(Date.now(), timeZone);
  if (!localParts) return false;
  return localParts.hour === SEND_HOUR_LOCAL;
}

// Get Local Today Key.
function getLocalTodayKey(timeZone) {
  const localParts = getLocalPartsFromUtc(Date.now(), timeZone);
  if (!localParts) return null;
  return getLocalDateKey(localParts);
}

// maybe Send Alert helper.
async function maybeSendAlert(alert, { manual = false } = {}) {
  if (!alert.active) return { sent: false, reason: 'inactive' };
  const { user, location } = await getAlertContext(alert);
  if (!user || !location) {
    return { sent: false, reason: 'missing_context' };
  }
  if (user.status !== 'active') {
    return { sent: false, reason: 'inactive_user' };
  }

  const timeZone = location.tz_iana || 'UTC';
  if (!manual && !shouldSendNow(timeZone)) {
    return { sent: false, reason: 'outside_window' };
  }

  const windowResult = await findFirstTriggerDay({
    locationId: String(location._id),
    windowDays: alert.windowDays,
    thresholdIn: alert.thresholdIn,
    timeZone,
    model: alert.model,
    elevationKey: alert.elevationKey,
  });
  const triggerDay = windowResult.trigger;
  const days = windowResult.days || [];
  if (!triggerDay) {
    return { sent: false, reason: 'no_trigger', days };
  }

  const todayKey = getLocalTodayKey(timeZone);
  if (!manual && alert.lastNotifiedAt && todayKey) {
    const lastParts = getLocalPartsFromUtc(alert.lastNotifiedAt.getTime(), timeZone);
    const lastKey = lastParts ? getLocalDateKey(lastParts) : null;
    if (lastKey && lastKey === todayKey) {
      return { sent: false, reason: 'already_sent_today', triggerDay, days };
    }
  }

  if (!manual && alert.lastNotifiedForDate && alert.lastNotifiedForDate === triggerDay.dateKey) {
    return { sent: false, reason: 'already_sent_for_trigger', triggerDay, days };
  }

  const emailDays = days;
  const subject = `Snowcast alert: ${location.name}`;
  const labelModel = alert.model === 'blend' ? 'median' : (alert.model || DEFAULT_MODEL);
  const body = [
    `Resort: ${location.name}`,
    `Window: next ${alert.windowDays} days`,
    `Threshold: ${alert.thresholdIn} in`,
    `Model: ${String(labelModel).toUpperCase()}`,
    `Elevation: ${alert.elevationKey || DEFAULT_ELEVATION}`,
    `Forecast day: ${triggerDay.dateKey}`,
    `Snow total: ${triggerDay.snowTotal.toFixed(1)} in`,
    '',
    'This alert triggers when any day in the window exceeds the threshold.',
  ].join('\n');
  const html = buildAlertEmailHtml({
    location,
    windowDays: alert.windowDays,
    thresholdIn: alert.thresholdIn,
    model: alert.model,
    elevationKey: alert.elevationKey,
    days: emailDays,
  });

  await sendEmail({ to: user.email, subject, text: body, html });

  alert.lastNotifiedAt = new Date();
  alert.lastNotifiedForDate = triggerDay.dateKey;
  await alert.save();

  return { sent: true, triggerDay, days };
}

// Load Window Days.
async function loadWindowDays({ locationId, windowDays, timeZone, model, elevationKey }) {
  const now = Date.now();
  const localParts = getLocalPartsFromUtc(now, timeZone);
  if (!localParts) {
    return { days: [] };
  }

  const startParts = { year: localParts.year, month: localParts.month, day: localParts.day, hour: 0, minute: 0 };
  const endDayParts = addDaysToParts(localParts, windowDays);
  const startEpoch = localDateTimeToUtcEpoch(startParts, timeZone);
  const endEpoch = localDateTimeToUtcEpoch({ ...endDayParts, hour: 0, minute: 0 }, timeZone);
  if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch)) {
    return { days: [] };
  }

  const { docs } = await queryHourlyDocs({
    locationId,
    startDateEpoch: startEpoch,
    endDateEpoch: endEpoch,
    sort: 'asc',
    maxDaysForward: 16,
    model,
    elevationKey,
  });

  const days = aggregateDailyOverview(docs, timeZone);
  return { days: Array.isArray(days) ? days : [] };
}

// Load Display Days.
async function loadDisplayDays({ locationId, windowDays, timeZone, model, elevationKey }) {
  const now = Date.now();
  const localParts = getLocalPartsFromUtc(now, timeZone);
  if (!localParts) {
    return { days: [] };
  }

  const startParts = { year: localParts.year, month: localParts.month, day: localParts.day, hour: 0, minute: 0 };
  const endDayParts = addDaysToParts(localParts, windowDays);
  const { displayStartParts, displayEndParts } = expandWindowToFullWeeks({
    startParts,
    endParts: endDayParts,
    timeZone,
  });
  const startEpoch = localDateTimeToUtcEpoch({ ...displayStartParts, hour: 0, minute: 0 }, timeZone);
  const endEpoch = localDateTimeToUtcEpoch({ ...displayEndParts, hour: 23, minute: 59, second: 59 }, timeZone);
  if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch)) {
    return { days: [] };
  }

  const { docs } = await queryHourlyDocs({
    locationId,
    startDateEpoch: startEpoch,
    endDateEpoch: endEpoch,
    sort: 'asc',
    maxDaysForward: 16,
    model,
    elevationKey,
  });

  const days = aggregateDailyOverview(docs, timeZone);
  return { days: Array.isArray(days) ? days : [] };
}

// Resolve Precip Type.
function resolvePrecipType(day) {
  const snow = Number(day?.snowTotal ?? 0);
  const precip = Number(day?.precipTotal ?? 0);
  if (!precip || Number.isNaN(precip)) return '';
  if (snow > 0 && snow < precip) return 'Mixed';
  if (snow > 0) return 'Snow';
  return 'Rain';
}

// Resolve Cloud Label.
function resolveCloudLabel(day) {
  const cover = Number(day?.avgCloudCover ?? 0);
  if (!Number.isFinite(cover)) return 'Clear';
  if (cover >= 70) return 'Cloudy';
  if (cover >= 35) return 'Partly';
  return 'Clear';
}

const EMAIL_ASSET_CACHE = new Map();

// Get Email Asset Data Url.
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

// Get Email Icon Data Url.
function getEmailIconDataUrl(filename) {
  if (!filename) return '';
  const iconPath = path.join(__dirname, '..', 'public', 'email-icons', filename);
  return getEmailAssetDataUrl(`icon:${filename}`, iconPath);
}

// Get Email Logo Data Url.
function getEmailLogoDataUrl() {
  const logoPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'snowcast.png');
  return getEmailAssetDataUrl('logo', logoPath);
}

// Resolve Email Icon Url.
function resolveEmailIconUrl({ precipType, cloudCover, iconBase }) {
  const type = (precipType || '').toLowerCase();
  if (type === 'snow') return iconBase ? `${iconBase}/snow.png` : getEmailIconDataUrl('snow.png');
  if (type === 'rain') return iconBase ? `${iconBase}/rain.png` : getEmailIconDataUrl('rain.png');
  if (type === 'mixed') return iconBase ? `${iconBase}/rainsnow.png` : getEmailIconDataUrl('rainsnow.png');
  const cover = Number(cloudCover ?? 0);
  if (!Number.isFinite(cover)) return '';
  if (cover >= 70) return iconBase ? `${iconBase}/cloudy.png` : getEmailIconDataUrl('cloudy.png');
  if (cover >= 35) return iconBase ? `${iconBase}/partlycloudyday.png` : getEmailIconDataUrl('partlycloudyday.png');
  return iconBase ? `${iconBase}/clearday.png` : getEmailIconDataUrl('clearday.png');
}

// Format Temp Value.
function formatTempValue(value) {
  if (value == null || Number.isNaN(value)) return '--';
  return `${Math.round(value)}°F`;
}

// Format Snow Inches.
function formatSnowInches(value) {
  if (value == null || Number.isNaN(value)) return '--';
  return `${Number(value).toFixed(1)} in`;
}

// Format Precip Value.
function formatPrecipValue(value) {
  if (value == null || Number.isNaN(value)) return '--';
  return `${Number(value).toFixed(2)}`;
}

// Format Wind Mph.
function formatWindMph(value) {
  if (value == null || Number.isNaN(value)) return '--';
  const mph = Number(value) * 0.621371;
  return `${mph.toFixed(1)} mph`;
}

// parse Date Key helper.
function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

// Format Day Label.
function formatDayLabel(dateKey, timeZone = 'UTC') {
  if (!dateKey) return '';
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  const epoch = localDateTimeToUtcEpoch({ ...parts, hour: 0, minute: 0 }, timeZone);
  if (!Number.isFinite(epoch)) return dateKey;
  const local = getLocalPartsFromUtc(epoch, timeZone);
  const weekday = local?.weekdayLabel ? local.weekdayLabel.slice(0, 3) : '';
  return weekday ? `${weekday} ${dateKey}` : dateKey;
}

// Build Weeks.
function buildWeeks({ days, timeZone }) {
  if (!days.length) return [];
  // day Map helper.
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const firstKey = days[0].date;
  const lastKey = days[days.length - 1].date;
  const firstParts = parseDateKey(firstKey);
  const lastParts = parseDateKey(lastKey);
  if (!firstParts || !lastParts) return [];

  const firstEpoch = localDateTimeToUtcEpoch({ ...firstParts, hour: 0, minute: 0 }, timeZone);
  const firstLocal = getLocalPartsFromUtc(firstEpoch, timeZone);
  const startParts = shiftLocalDate(firstParts, -1 * (firstLocal?.weekdayIndex ?? 0));

  const lastEpoch = localDateTimeToUtcEpoch({ ...lastParts, hour: 0, minute: 0 }, timeZone);
  const lastLocal = getLocalPartsFromUtc(lastEpoch, timeZone);
  const endParts = shiftLocalDate(lastParts, 6 - (lastLocal?.weekdayIndex ?? 0));

  const weeks = [];
  let cursor = startParts;
  while (cursor) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const key = formatDateKey(cursor);
      week.push({ key, day: dayMap.get(key) || null });
      cursor = shiftLocalDate(cursor, 1);
    }
    weeks.push(week);
    if (cursor && endParts && formatDateKey(cursor) > formatDateKey(endParts)) {
      break;
    }
  }
  return weeks;
}

// Build Alert Email Html.
function buildAlertEmailHtml({ location, windowDays, thresholdIn, model, elevationKey, days }) {
  const logoBase = config.email.imageBaseUrl || config.backend.url || config.frontend.url || '';
  const embedImages = config.email.embedImages;
  const iconBase = embedImages ? '' : (logoBase ? `${logoBase.replace(/\/$/, '')}/email-icons` : '');
  const logoUrl = embedImages
    ? getEmailLogoDataUrl()
    : (logoBase ? `${logoBase.replace(/\/$/, '')}/snowcast.png` : '');
  // list Rows helper.
  const listRows = days.map((day) => {
    const precipType = resolvePrecipType(day);
    const snowAmount = Number(day?.snowTotal ?? 0);
    const isPowDay = snowAmount >= 6;
    const isSnowDay = snowAmount >= 3;
    const precipLabel = precipType ? precipType.toUpperCase() : '';
    const precipValue = precipType === 'Snow'
      ? formatSnowInches(day.snowTotal)
      : formatPrecipValue(day.precipTotal ?? 0);
    const iconUrl = resolveEmailIconUrl({
      precipType,
      cloudCover: day.avgCloudCover,
      iconBase,
    });
    const tileBackground = isPowDay
      ? 'linear-gradient(180deg, rgba(91, 162, 255, 0.35), rgba(209, 235, 255, 0.95))'
      : isSnowDay
        ? 'linear-gradient(180deg, rgba(91, 162, 255, 0.18), rgba(236, 246, 255, 0.95))'
        : '#f8fbff';
    const tileBorder = isPowDay
      ? 'rgba(47, 95, 168, 0.5)'
      : isSnowDay
        ? 'rgba(47, 95, 168, 0.25)'
        : '#e0e6ef';
    const powBadge = isPowDay
      ? '<div style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff;background:linear-gradient(120deg,#7fb2f0,#2f5fa8);padding:2px 8px;border-radius:999px;margin-left:8px;">POW</div>'
      : '';
    return `
      <tr>
        <td style="padding:6px 0;">
          <div style="border:1px solid ${tileBorder};border-radius:12px;padding:12px;background:${tileBackground};box-sizing:border-box;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:72px;vertical-align:top;text-align:center;">
                  ${iconUrl ? `<img src="${iconUrl}" alt="${precipType || resolveCloudLabel(day)}" style="width:34px;height:34px;display:block;margin:0 auto;border:0;" />` : '<div style="width:34px;height:34px;border-radius:14px;background:#dbe7f6;margin:0 auto;"></div>'}
                  <div style="font-size:12px;font-weight:600;color:#1b263b;line-height:1.2;margin-top:4px;">${precipValue}</div>
                  <div style="font-size:10px;letter-spacing:0.08em;color:#7a8ca6;text-transform:uppercase;line-height:1.2;margin-top:2px;">${precipLabel}</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-size:12px;color:#415a77;text-transform:uppercase;letter-spacing:0.08em;">
                    ${formatDayLabel(day.date || day.day || '', location?.tz_iana || 'UTC')}
                    ${powBadge}
                  </div>
                  <div style="margin-top:6px;font-size:12px;font-weight:600;color:#0d1b2a;line-height:1.2;">
                    <span style="color:#c7332d;">${formatTempValue(day.maxTemp)}</span>
                    <span style="color:#1c6fd2;margin-left:4px;">${formatTempValue(day.minTemp)}</span>
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family:Arial,sans-serif;background:#eef4fb;padding:20px;">
      <div class="sc-card" style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:18px;padding:20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;">
              ${logoUrl ? `<img src="${logoUrl}" alt="Snowcast" style="width:36px;height:36px;border-radius:8px;display:block;border:0;"/>` : ''}
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="font-size:18px;font-weight:700;color:#0d1b2a;">Snowcast Pow Alert</div>
              <div style="font-size:12px;color:#415a77;">${location?.name || ''}</div>
            </td>
          </tr>
        </table>
        <div style="margin-top:12px;font-size:13px;color:#1b263b;">
          Window: next ${windowDays} days · Threshold: ${thresholdIn} in · Model: ${String(model === 'blend' ? 'median' : (model || DEFAULT_MODEL)).toUpperCase()} · Elevation: ${elevationKey || DEFAULT_ELEVATION}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:collapse;width:100%;">
          <tbody>
            ${listRows || `<tr><td style="color:#415a77;">No forecast data available.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Handle List Alerts.
async function handleListAlerts(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const alerts = await powAlertDb.find({ userId: user.id }).lean();
  // location Ids helper.
  const locationIds = alerts.map((alert) => alert.locationId);
  const locations = await locationsDb.find({ _id: { $in: locationIds } }).lean();
  // location Map helper.
  const locationMap = new Map(locations.map((loc) => [String(loc._id), loc]));
  // payload helper.
  const payload = alerts.map((alert) => ({
    id: String(alert._id),
    locationId: String(alert.locationId),
    locationName: locationMap.get(String(alert.locationId))?.name || '',
    windowDays: alert.windowDays,
    thresholdIn: alert.thresholdIn,
    model: alert.model === 'blend' ? 'median' : (alert.model || DEFAULT_MODEL),
    elevation: alert.elevationKey || DEFAULT_ELEVATION,
    active: alert.active,
  }));
  return response.status(200).send(payload);
}

// Handle Create Alert.
async function handleCreateAlert(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const role = normalizeRole(Array.isArray(user.roles) && user.roles.length ? user.roles[0] : 'free');
  const limit = getPowAlertLimitForRole(role);
  if (limit >= 0) {
    const existingCount = await powAlertDb.countDocuments({ userId: user.id });
    if (existingCount >= limit) {
      return response.status(403).send({ error: 'Pow alert limit reached' });
    }
  }
  const payload = normalizeAlertPayload(request.body);
  if (!mongoose.Types.ObjectId.isValid(payload.locationId)) {
    return response.status(400).send({ error: 'locationId is required' });
  }
  const location = await locationsDb.findById(payload.locationId).lean();
  if (!location) {
    return response.status(404).send({ error: 'Location not found' });
  }

  const alert = await powAlertDb.create({
    userId: user.id,
    locationId: payload.locationId,
    windowDays: normalizeWindowDays(payload.windowDays),
    thresholdIn: normalizeThreshold(payload.thresholdIn),
    model: payload.model,
    elevationKey: payload.elevationKey,
    active: payload.active,
  });

  return response.status(201).send({
    id: String(alert._id),
    locationId: String(alert.locationId),
    locationName: location.name,
    windowDays: alert.windowDays,
    thresholdIn: alert.thresholdIn,
    model: alert.model === 'blend' ? 'median' : (alert.model || DEFAULT_MODEL),
    elevation: alert.elevationKey || DEFAULT_ELEVATION,
    active: alert.active,
  });
}

// Handle Update Alert.
async function handleUpdateAlert(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const alertId = request.params?.id;
  if (!mongoose.Types.ObjectId.isValid(alertId)) {
    return response.status(400).send({ error: 'Invalid alert id' });
  }
  const payload = normalizeAlertPayload(request.body);
  const alert = await powAlertDb.findOne({ _id: alertId, userId: user.id });
  if (!alert) {
    return response.status(404).send({ error: 'Alert not found' });
  }
  if (Object.prototype.hasOwnProperty.call(request.body || {}, 'model')) {
    const nextModel = normalizeModel(request.body?.model);
    if (!nextModel) {
      return response.status(400).send({ error: 'Invalid model' });
    }
    alert.model = nextModel;
  }
  if (Object.prototype.hasOwnProperty.call(request.body || {}, 'elevation')
      || Object.prototype.hasOwnProperty.call(request.body || {}, 'elevationKey')) {
    const nextElevation = normalizeElevation(request.body?.elevation || request.body?.elevationKey);
    if (!nextElevation) {
      return response.status(400).send({ error: 'Invalid elevation' });
    }
    alert.elevationKey = nextElevation;
  }
  if (payload.locationId && mongoose.Types.ObjectId.isValid(payload.locationId)) {
    alert.locationId = payload.locationId;
  }
  alert.windowDays = normalizeWindowDays(payload.windowDays);
  alert.thresholdIn = normalizeThreshold(payload.thresholdIn);
  alert.active = payload.active;
  await alert.save();

  const location = await locationsDb.findById(alert.locationId).lean();
  return response.status(200).send({
    id: String(alert._id),
    locationId: String(alert.locationId),
    locationName: location?.name || '',
    windowDays: alert.windowDays,
    thresholdIn: alert.thresholdIn,
    model: alert.model === 'blend' ? 'median' : (alert.model || DEFAULT_MODEL),
    elevation: alert.elevationKey || DEFAULT_ELEVATION,
    active: alert.active,
  });
}

// Handle Delete Alert.
async function handleDeleteAlert(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const alertId = request.params?.id;
  if (!mongoose.Types.ObjectId.isValid(alertId)) {
    return response.status(400).send({ error: 'Invalid alert id' });
  }
  await powAlertDb.deleteOne({ _id: alertId, userId: user.id });
  return response.status(200).send({ ok: true });
}

// Handle Check Alerts.
async function handleCheckAlerts(request, response) {
  const user = await getFrontendUserFromRequest(request);
  if (!user) {
    return response.status(403).send({ error: 'Forbidden' });
  }
  const role = normalizeRole(Array.isArray(user.roles) && user.roles.length ? user.roles[0] : 'free');
  if (!canCheckPow(role)) {
    return response.status(403).send({ error: 'Check Pow Now not allowed for this subscription' });
  }
  const alerts = await powAlertDb.find({ userId: user.id, active: true });
  const results = [];
  for (const alert of alerts) {
    try {
      const result = await maybeSendAlert(alert, { manual: true });
      results.push({ id: String(alert._id), ...result });
    } catch (error) {
      results.push({ id: String(alert._id), sent: false, error: error.message });
    }
  }
  return response.status(200).send({ results });
}

// check All Alerts helper.
async function checkAllAlerts() {
  const alerts = await powAlertDb.find({ active: true });
  for (const alert of alerts) {
    try {
      await maybeSendAlert(alert, { manual: false });
    } catch (error) {
      console.error('*** pow alert error:', error.message);
    }
  }
}

module.exports = {
  handleListAlerts,
  handleCreateAlert,
  handleUpdateAlert,
  handleDeleteAlert,
  handleCheckAlerts,
  checkAllAlerts,
};

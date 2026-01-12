'use strict';
// *** REQUIRES
const path = require('path');                    // *** Paths
const fs = require('fs');                        // *** Filesystem checks
const { config, validateConfig } = require('./config');
validateConfig();
const express = require('express');              // *** Backend server
const cors = require('cors');                    // *** Middleware 
const mongoose = require('mongoose');            // *** Database
const cookieParser = require('cookie-parser');   // *** Cookies
const weatherApi = require('./modules/weatherApi');
const appMaintenance = require('./modules/appMaintenance');
const locations = require('./modules/locations');
const weatherHourly = require('./modules/weatherHourly');
const weatherDaily = require('./modules/weatherDaily');
const appConfig = require('./modules/appConfig');
const roleConfig = require('./modules/roleConfig');
const adminConfig = require('./modules/adminConfig');
const frontendAuth = require('./modules/frontendAuth');
const frontendPreferences = require('./modules/frontendPreferences');
const powAlerts = require('./modules/powAlerts');
const discountCodes = require('./modules/discountCodes');
const engagement = require('./modules/engagement');
const {
  requireAdminSession,
  handleRequestMagicLink,
  handleVerifyMagicLink,
  handleSessionStatus,
  handleLogout,
} = require('./modules/adminAuth');
const { requireClientApiKey } = require('./modules/clientAuth');
const { trackUsage } = require('./modules/usageTracker');
const adminApiClients = require('./modules/adminApiClients');
const adminUsers = require('./modules/adminUsers');
const adminRoles = require('./modules/adminRoles');
const adminEngagement = require('./modules/adminEngagement');
const adminLogs = require('./modules/adminLogs');
const adminQueue = require('./modules/adminQueue');
const adminForecastModels = require('./modules/adminForecastModels');
const forecastModels = require('./modules/forecastModels');
const apiQueue = require('./modules/apiQueue');
const { createFixedWindowRateLimiter } = require('./modules/rateLimit');
const ADMIN_ENABLED = config.backend.adminEnabled;

// *** Database connection and test
const databaseName = config.db.name;
mongoose.connect(`${config.db.url}${databaseName}?retryWrites=true&w=majority`);
const database = mongoose.connection;
database.on('error', console.error.bind(console, 'connection error:'));
database.once('open', function () {
  console.log('Mongoose is connected');
});
mongoose.set('strictQuery', false);


// *** Server and middleware connection
const app = express();
const isDev = config.backend.dev;
const frontendCorsOrigins = [...config.cors.frontendOrigins];
if (isDev) {
  frontendCorsOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
}
app.use(
  cors({
    origin: frontendCorsOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use('/email-icons', express.static(path.join(__dirname, 'public', 'email-icons')));

app.post('/auth/request-link', (req, res, next) => frontendAuth.handleRequestMagicLink(req, res, next));
app.get('/auth/verify', (req, res, next) => frontendAuth.handleVerifyMagicLink(req, res, next));
app.get('/auth/session', (req, res, next) => frontendAuth.handleSessionStatus(req, res, next));
app.post('/auth/logout', (req, res, next) => frontendAuth.handleLogout(req, res, next));
app.get('/user/preferences', (req, res, next) => frontendPreferences.handleGetPreferences(req, res, next));
app.put('/user/preferences', (req, res, next) => frontendPreferences.handleUpdatePreferences(req, res, next));
app.post('/events', (req, res, next) => engagement.handleTrackEvent(req, res, next));
app.get('/user/alerts', (req, res, next) => powAlerts.handleListAlerts(req, res, next));
app.post('/user/alerts', (req, res, next) => powAlerts.handleCreateAlert(req, res, next));
app.put('/user/alerts/:id', (req, res, next) => powAlerts.handleUpdateAlert(req, res, next));
app.delete('/user/alerts/:id', (req, res, next) => powAlerts.handleDeleteAlert(req, res, next));
app.post('/user/alerts/check', (req, res, next) => powAlerts.handleCheckAlerts(req, res, next));
app.post('/user/discount-codes/redeem', (req, res, next) => discountCodes.redeemCode(req, res, next));

// *** Admin UI gate
app.get('/admin.html', (request, response) => {
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  return response.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use('/admin.html', express.static(path.join(__dirname, 'public')));
const PORT = config.backend.port;
app.listen(PORT, () => {
  console.log(`server listening on ${PORT}`);
  adminLogs.logAdminEvent({
    type: 'server_start',
    message: `Server started on ${PORT}`,
    meta: { port: PORT },
  });
});

// *** Location Endpoints
app.use(['/locations', '/weather'], requireClientApiKey, trackUsage);
app.get('/locations', (request, response, next) => locations.endpointSearchLocations(request, response, next));
app.get('/locations/nearest', (request, response, next) => locations.endpointNearestLocation(request, response, next));
app.get('/locations/lookup', (request, response, next) => locations.endpointLookupLocationMetadata(request, response, next));

// *** Weather Endpoints
app.get('/weather/hourly', (request, response, next) => weatherHourly.endpointHourlyWeather(request, response, next));
app.get('/weather/hourly/by-coords', (request, response, next) => weatherHourly.endpointHourlyWeatherByCoords(request, response, next));
app.get('/weather/daily/overview', (request, response, next) => weatherDaily.endpointDailyOverview(request, response, next));
app.get('/weather/daily/overview/by-coords', (request, response, next) => weatherDaily.endpointDailyOverviewByCoords(request, response, next));
app.get('/weather/daily/segments', (request, response, next) => weatherDaily.endpointDailySegments(request, response, next));
app.get('/weather/daily/segments/by-coords', (request, response, next) => weatherDaily.endpointDailySegmentsByCoords(request, response, next));

// *** Admin-only Endpoints
if (ADMIN_ENABLED) {
  const adminRateLimit = createFixedWindowRateLimiter({
    max: () => appConfig.values().RATE_LIMIT_ADMIN,
    windowMs: 60_000,
  });

  app.use('/admin', adminRateLimit);

  app.post('/locations', requireAdminSession, (request, response, next) => locations.endpointCreateLocation(request, response, next));
  app.delete('/locations/:id', requireAdminSession, (request, response, next) => locations.endpointDeleteLocation(request, response, next));
  app.put('/locations/:id', requireAdminSession, (request, response, next) => locations.endpointUpdateLocation(request, response, next));

  app.post('/admin/auth/request-link', (req, res, next) => handleRequestMagicLink(req, res, next));
  app.get('/admin/auth/verify', (req, res, next) => handleVerifyMagicLink(req, res, next));
  app.get('/admin/auth/session', (req, res, next) => handleSessionStatus(req, res, next));
  app.post('/admin/auth/logout', (req, res, next) => handleLogout(req, res, next));

  app.get('/admin/config', requireAdminSession, (req, res, next) => adminConfig.endpointGetConfig(req, res, next));
  app.put('/admin/config/:key', requireAdminSession, (req, res, next) => adminConfig.endpointUpdateConfig(req, res, next));
  app.get('/admin/discount-codes', requireAdminSession, (req, res, next) => discountCodes.listCodes(req, res, next));
  app.post('/admin/discount-codes', requireAdminSession, (req, res, next) => discountCodes.createCode(req, res, next));
  app.put('/admin/discount-codes/:id', requireAdminSession, (req, res, next) => discountCodes.updateCode(req, res, next));
  app.delete('/admin/discount-codes/:id', requireAdminSession, (req, res, next) => discountCodes.deleteCode(req, res, next));
  app.get('/admin/roles', requireAdminSession, (req, res, next) => adminRoles.listRoles(req, res, next));
  app.put('/admin/roles/:code', requireAdminSession, (req, res, next) => adminRoles.updateRole(req, res, next));
  app.get('/admin/engagement/summary', requireAdminSession, (req, res, next) => adminEngagement.endpointSummary(req, res, next));
  app.get('/admin/logs', requireAdminSession, (req, res, next) => adminLogs.endpointListLogs(req, res, next));
  app.get('/admin/queue', requireAdminSession, (req, res, next) => adminQueue.endpointGetQueue(req, res, next));
  app.get('/admin/forecast-models', requireAdminSession, (req, res, next) => adminForecastModels.listForecastModels(req, res, next));
  app.put('/admin/forecast-models/:code', requireAdminSession, (req, res, next) => adminForecastModels.updateForecastModel(req, res, next));
  app.get('/admin/locations/backfill', requireAdminSession, (req, res, next) => locations.endpointListBackfillLocations(req, res, next));
  app.post('/admin/forecast/fetch', requireAdminSession, async (req, res) => {
    try {
      const { locationIds } = req.body || {};
      const result = await appMaintenance.fetchForecastLocations({
        locationIds: Array.isArray(locationIds) ? locationIds : [],
        force: true,
      });
      return res.status(200).send({ ok: true, ...result });
    } catch (error) {
      return res.status(400).send({ error: error.message || 'Fetch failed' });
    }
  });
  app.post('/admin/backfill', requireAdminSession, async (req, res) => {
    try {
      const { locationIds } = req.body || {};
      const result = await appMaintenance.backfillLocations({
        locationIds: Array.isArray(locationIds) ? locationIds : [],
      });
      return res.status(200).send({ ok: true, ...result });
    } catch (error) {
      return res.status(400).send({ error: error.message || 'Backfill failed' });
    }
  });
  app.get('/admin/api-clients', requireAdminSession, (req, res, next) => adminApiClients.endpointListClients(req, res, next));
  app.post('/admin/api-clients', requireAdminSession, (req, res, next) => adminApiClients.endpointCreateClient(req, res, next));
  app.put('/admin/api-clients/:id', requireAdminSession, (req, res, next) => adminApiClients.endpointUpdateClient(req, res, next));
  app.post('/admin/api-clients/:id/toggle', requireAdminSession, (req, res, next) => adminApiClients.endpointToggleClient(req, res, next));
  app.delete('/admin/api-clients/:id', requireAdminSession, (req, res, next) => adminApiClients.endpointDeleteClient(req, res, next));
  app.get('/admin/api-clients/:id/access', requireAdminSession, (req, res, next) => adminApiClients.endpointGetClientAccess(req, res, next));

  app.get('/admin/users', requireAdminSession, (req, res, next) => adminUsers.listUsers(req, res, next));
  app.post('/admin/users', requireAdminSession, (req, res, next) => adminUsers.createUser(req, res, next));
  app.put('/admin/users/:id', requireAdminSession, (req, res, next) => adminUsers.updateUser(req, res, next));
  app.delete('/admin/users/:id', requireAdminSession, (req, res, next) => adminUsers.deleteUser(req, res, next));
} else {
  console.log('Admin endpoints disabled; set ADMIN_ENABLED=true to enable admin routes and UI.');
}

// *** Misc ENDPOINTS
app.get('/health', (request, response) => response.status(200).send('Health OK'));

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
const frontendIndexPath = path.join(frontendBuildPath, 'index.html');
const hasFrontendBuild = () => fs.existsSync(frontendIndexPath);
if (!hasFrontendBuild()) {
  console.warn('Frontend build missing; run the frontend build to enable SPA serving.');
}
app.get('/health/frontend', (request, response) => {
  if (hasFrontendBuild()) {
    return response.status(200).send({ ok: true });
  }
  return response.status(503).send({ ok: false, error: 'Frontend build missing' });
});
app.use(express.static(frontendBuildPath));
app.get('*', (request, response) => {
  response.sendFile(frontendIndexPath);
});
app.use((error, request, response, next) => {
  console.error('*** express error:', error.message);
  adminLogs.logAdminEvent({
    type: 'error',
    message: error.message,
    meta: {
      path: request?.path,
      method: request?.method,
    },
  });
  return response.status(500).send(error.message);
});

// *** Main
async function start() {
  await appConfig.ensureWeatherConfigDefaults();
  await roleConfig.ensureRoleDefaults();
  await roleConfig.refreshRoleCache();
  await forecastModels.ensureForecastModelDefaults();
  await forecastModels.refreshModelCache();
  await locations.startLocationMaintenance();
  apiQueue.start();
  setTimeout(() => {
    appMaintenance.startMaintenance();
  }, 1000);
}

// *** Main
start();

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
const adminConfig = require('./modules/adminConfig');
const frontendAuth = require('./modules/frontendAuth');
const frontendPreferences = require('./modules/frontendPreferences');
const powAlerts = require('./modules/powAlerts');
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
app.get('/user/alerts', (req, res, next) => powAlerts.handleListAlerts(req, res, next));
app.post('/user/alerts', (req, res, next) => powAlerts.handleCreateAlert(req, res, next));
app.put('/user/alerts/:id', (req, res, next) => powAlerts.handleUpdateAlert(req, res, next));
app.delete('/user/alerts/:id', (req, res, next) => powAlerts.handleDeleteAlert(req, res, next));
app.post('/user/alerts/check', (req, res, next) => powAlerts.handleCheckAlerts(req, res, next));

// *** Admin UI gate
app.get('/admin.html', (request, response) => {
  if (!ADMIN_ENABLED) {
    return response.status(404).send('Not available');
  }
  return response.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use('/admin.html', express.static(path.join(__dirname, 'public')));
const PORT = config.backend.port;
app.listen(PORT, () => console.log(`server listening on ${PORT}`));

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
  return response.status(500).send(error.message);
});

// *** Main
async function start() {
  await appConfig.ensureWeatherConfigDefaults();
  await locations.startLocationMaintenance();
  setTimeout(() => {
    appMaintenance.startMaintenance();
  }, 1000);
}

// *** Main
start();

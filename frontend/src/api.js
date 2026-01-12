const API_BASE_URL = (process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_SERVER || '').replace(/\/$/, '');
const API_KEY = process.env.REACT_APP_BACKEND_API_KEY || '';

function buildUrl(path, params) {
  const url = `${API_BASE_URL}${path}`;
  if (!params) return url;
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, value);
  });
  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
}

async function apiFetch(path, { method = 'GET', params, body } = {}) {
  const url = buildUrl(path, params);
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error || 'Request failed';
    throw new Error(message);
  }

  return payload;
}

export function requestMagicLink(email, redirectPath = '/', mode = 'cookie') {
  return apiFetch('/auth/request-link', {
    method: 'POST',
    body: { email, redirectPath, mode },
  });
}

export function getSession() {
  return apiFetch('/auth/session');
}

export function logout() {
  return apiFetch('/auth/logout', {
    method: 'POST',
  });
}

export function getUserPreferences() {
  return apiFetch('/user/preferences');
}

export function updateUserPreferences({ favorites, homeResortId, units, name, forecastModel, forecastElevation }) {
  return apiFetch('/user/preferences', {
    method: 'PUT',
    body: { favorites, homeResortId, units, name, forecastModel, forecastElevation },
  });
}

export function listPowAlerts() {
  return apiFetch('/user/alerts');
}

export function createPowAlert({ locationId, windowDays, thresholdIn, active, model, elevation }) {
  return apiFetch('/user/alerts', {
    method: 'POST',
    body: { locationId, windowDays, thresholdIn, active, model, elevation },
  });
}

export function updatePowAlert(id, { locationId, windowDays, thresholdIn, active, model, elevation }) {
  return apiFetch(`/user/alerts/${id}`, {
    method: 'PUT',
    body: { locationId, windowDays, thresholdIn, active, model, elevation },
  });
}

export function deletePowAlert(id) {
  return apiFetch(`/user/alerts/${id}`, {
    method: 'DELETE',
  });
}

export function checkPowAlerts() {
  return apiFetch('/user/alerts/check', {
    method: 'POST',
  });
}

export function redeemDiscountCode(code) {
  return apiFetch('/user/discount-codes/redeem', {
    method: 'POST',
    body: { code },
  });
}

export function trackEngagementEvent({ event, sessionId, locationId, meta } = {}) {
  return apiFetch('/events', {
    method: 'POST',
    body: {
      event,
      sessionId,
      locationId,
      meta,
    },
  });
}

export function submitFeedback({ message, context } = {}) {
  return apiFetch('/feedback', {
    method: 'POST',
    body: { message, context },
  });
}


export function getLocations({ query = '', isSkiResort = true, limit = 50 } = {}) {
  return apiFetch('/locations', {
    params: { q: query, isSkiResort, limit },
  });
}

export function getDailyOverview({ locationId, startDateEpoch, endDateEpoch, model, elevation }) {
  return apiFetch('/weather/daily/overview', {
    params: { locationId, startDateEpoch, endDateEpoch, model, elevation },
  });
}

export function getDailySegments({ locationId, startDateEpoch, endDateEpoch, model, elevation }) {
  return apiFetch('/weather/daily/segments', {
    params: { locationId, startDateEpoch, endDateEpoch, model, elevation },
  });
}

export function getHourly({ locationId, startDateEpoch, endDateEpoch, model, elevation }) {
  return apiFetch('/weather/hourly', {
    params: { locationId, startDateEpoch, endDateEpoch, model, elevation },
  });
}

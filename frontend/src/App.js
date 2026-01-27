import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Icon from './Icon';
import snowcastLogo from './assets/snowcast.png';
import rainIcon from './weatherIcons/rain.png';
import snowIcon from './weatherIcons/snow.png';
import mixedIcon from './weatherIcons/rainsnow.png';
import clearIcon from './weatherIcons/clearday.png';
import partlyCloudyIcon from './weatherIcons/partlycloudyday.png';
import cloudyIcon from './weatherIcons/cloudy.png';
import {
  getSession,
  requestMagicLink,
  logout,
  getLocations,
  getDailyOverview,
  getDailySegments,
  getHourly,
  getUserPreferences,
  updateUserPreferences,
  listPowAlerts,
  createPowAlert,
  deletePowAlert,
  checkPowAlerts,
  redeemDiscountCode,
  trackEngagementEvent,
  submitFeedback,
  getForecastModels,
} from './api';
import {
  buildCalendarRange,
  dayRangeToEpoch,
  differenceInDays,
  formatWeekday,
  toISODate,
} from './utils/date';

const DEFAULT_ROLE_WINDOWS = {
  guest: { back: 2, forward: 7 },
  free: { back: 2, forward: 7 },
  premium: null,
  admin: null,
};

const DEFAULT_ROLE_LABELS = {
  guest: 'Guest',
  free: 'Free',
  premium: 'Premium',
  admin: 'Admin',
};

const DEFAULT_ROLE_LIMITS = {
  guest: 3,
  free: 3,
  premium: -1,
  admin: -1,
};

const UNIT_STORAGE_KEY = 'snowcast-units';
const ENGAGEMENT_SESSION_KEY = 'snowcast-session-id';
const MODEL_STORAGE_KEY = 'snowcast-forecast-model';
const ELEVATION_STORAGE_KEY = 'snowcast-forecast-elevation';
const WIND_KMH_PER_MPH = 1.60934;
const WINDY_THRESHOLD_MPH = 15;
const CM_PER_INCH = 2.54;
const DEFAULT_FORECAST_MODEL = 'median';
const DEFAULT_FORECAST_MODEL_OPTIONS = [
  { value: 'median', label: 'Median' },
  { value: 'nbm', label: 'NOAA Blend' },
  { value: 'gfs', label: 'NOAA Global' },
  { value: 'hrrr', label: 'NOAA HRRR' },
];

const MODEL_DESCRIPTION_MAP = {
  median: 'Median of available models.',
  gfs: 'Long-range global model.',
  gfs_seamless: 'Long-range global model.',
  nbm: 'Blend of national models.',
  ncep_nbm_conus: 'Blend of national models.',
  hrrr: 'High-res short-range model.',
  gfs_hrrr: 'High-res short-range model.',
};
const DEFAULT_FORECAST_ELEVATION = 'mid';
const FORECAST_ELEVATION_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'mid', label: 'Mid' },
  { value: 'base', label: 'Base' },
];

function normalizeRole(role) {
  if (role === 'basic' || role === 'level1') return 'free';
  if (role === 'standard' || role === 'level2' || role === 'advanced' || role === 'level3') return 'premium';
  if (role === 'owner') return 'admin';
  return role;
}

function normalizeForecastWindows(map) {
  const next = {};
  if (!map || typeof map !== 'object') return next;
  Object.entries(map).forEach(([roleKey, value]) => {
    if (!value || typeof value !== 'object') {
      next[roleKey] = null;
      return;
    }
    const back = Number(value.back);
    const forward = Number(value.forward);
    if (!Number.isFinite(back) || !Number.isFinite(forward)) {
      return;
    }
    next[roleKey] = back < 0 || forward < 0 ? null : { back, forward };
  });
  return next;
}

function normalizeForecastModel(value, options = DEFAULT_FORECAST_MODEL_OPTIONS) {
  const next = String(value || '').toLowerCase().trim();
  if (next === 'blend') return DEFAULT_FORECAST_MODEL;
  const allowed = new Set(options.map((option) => option.value));
  return allowed.has(next) ? next : DEFAULT_FORECAST_MODEL;
}

function getModelDescription(value) {
  if (!value) return 'Forecast model description unavailable.';
  return MODEL_DESCRIPTION_MAP[value] || 'Forecast model description unavailable.';
}

function normalizeForecastElevation(value) {
  const next = String(value || '').toLowerCase().trim();
  const allowed = new Set(FORECAST_ELEVATION_OPTIONS.map((option) => option.value));
  return allowed.has(next) ? next : DEFAULT_FORECAST_ELEVATION;
}

function getTimezoneOffsetMinutes(date, timeZone) {
  if (!timeZone) return date.getTimezoneOffset();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach(({ type, value }) => {
    values[type] = value;
  });
  const utcTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (utcTime - date.getTime()) / 60000;
}

function getEngagementSessionId() {
  let sessionId = window.localStorage.getItem(ENGAGEMENT_SESSION_KEY);
  if (sessionId) return sessionId;
  const fallback = `sess_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  sessionId = window.crypto?.randomUUID?.() || fallback;
  window.localStorage.setItem(ENGAGEMENT_SESSION_KEY, sessionId);
  return sessionId;
}

function resolveRole(user) {
  if (!user) return 'guest';
  const role = Array.isArray(user.roles) && user.roles.length ? user.roles[0] : 'free';
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'premium' || normalized === 'free'
    ? normalized
    : 'free';
}

function formatTemp(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  if (units === 'metric') {
    const celsius = (value - 32) * (5 / 9);
    return `${Math.round(celsius)}°C`;
  }
  return `${Math.round(value)}°F`;
}

function formatTempValue(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  if (units === 'metric') {
    const celsius = (value - 32) * (5 / 9);
    return `${Math.round(celsius)}`;
  }
  return `${Math.round(value)}`;
}

function formatSnow(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  const converted = units === 'metric' ? value * CM_PER_INCH : value;
  const label = units === 'metric' ? 'cm' : 'in';
  return `${converted.toFixed(1)} ${label}`;
}

function formatPrecipValue(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  const converted = units === 'metric' ? value * CM_PER_INCH : value;
  return `${converted.toFixed(2)}`;
}

function toInches(value, units) {
  if (value == null || Number.isNaN(value)) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return units === 'metric' ? numeric / CM_PER_INCH : numeric;
}

function fromInches(value, units) {
  if (value == null || Number.isNaN(value)) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return units === 'metric' ? numeric * CM_PER_INCH : numeric;
}
function formatWind(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  const converted = units === 'metric' ? value * WIND_KMH_PER_MPH : value;
  const label = units === 'imperial' ? 'mph' : 'km/h';
  return `${converted.toFixed(1)} ${label}`;
}

function formatWindValue(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  const converted = units === 'metric' ? value * WIND_KMH_PER_MPH : value;
  return `${converted.toFixed(1)}`;
}
function getTempScale(hours) {
  const temps = hours.map((hour) => hour.temp).filter((value) => value != null);
  if (!temps.length) {
    return {
      minGrid: 0,
      maxGrid: 1,
      gridRange: 1,
      step: 1,
    };
  }
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const range = maxTemp - minTemp || 1;
  const stepBase = range / 5;
  const niceStep = (value) => {
    const exponent = Math.floor(Math.log10(value));
    const fraction = value / 10 ** exponent;
    const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
    return niceFraction * 10 ** exponent;
  };
  const step = niceStep(stepBase);
  const minGrid = Math.floor(minTemp / step) * step;
  const maxGrid = Math.ceil(maxTemp / step) * step;
  const gridRange = maxGrid - minGrid || 1;
  return { minGrid, maxGrid, gridRange, step };
}

function getIconSrc(icon) {
  if (!icon) return null;
  return Icon(icon);
}

function getPrecipIcon(type) {
  if (type === 'snow') return snowIcon;
  if (type === 'rain') return rainIcon;
  if (type === 'mixed') return mixedIcon;
  return null;
}

function getCloudIcon(cloudCover) {
  if (cloudCover == null || Number.isNaN(cloudCover)) return null;
  if (cloudCover >= 70) return cloudyIcon;
  if (cloudCover >= 35) return partlyCloudyIcon;
  return clearIcon;
}

function useStoredUnits() {
  const [units, setUnits] = useState(() => {
    const stored = window.localStorage.getItem(UNIT_STORAGE_KEY);
    return stored === 'metric' ? 'metric' : 'imperial';
  });

  useEffect(() => {
    window.localStorage.setItem(UNIT_STORAGE_KEY, units);
  }, [units]);

  return [units, setUnits];
}

function App() {
  const [authStatus, setAuthStatus] = useState('loading');
  const preferencesLoadedRef = useRef(false);
  const firstLoginHandledRef = useRef(false);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(() => window.localStorage.getItem('snowcast-resort') || '');
  const [favorites, setFavorites] = useState([]);
  const [homeResortId, setHomeResortId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [powAlerts, setPowAlerts] = useState([]);
  const [powAlertsStatus, setPowAlertsStatus] = useState('');
  const [powAlertsLoading, setPowAlertsLoading] = useState(false);
  const [powAlertCheckResult, setPowAlertCheckResult] = useState('');
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState('');
  const [roleLabels, setRoleLabels] = useState(DEFAULT_ROLE_LABELS);
  const [roleLimits, setRoleLimits] = useState(DEFAULT_ROLE_LIMITS);
  const [roleForecast, setRoleForecast] = useState(DEFAULT_ROLE_WINDOWS);
  const [roleHourly, setRoleHourly] = useState({});
  const [rolePowAlerts, setRolePowAlerts] = useState({});
  const [roleCheckPow, setRoleCheckPow] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  const [toastKind, setToastKind] = useState('info');
  const [toastAction, setToastAction] = useState(null);
  const [discountCode, setDiscountCode] = useState('');
  const [discountStatus, setDiscountStatus] = useState('');
  const [newAlert, setNewAlert] = useState({
    locationId: '',
    windowDays: 3,
    threshold: 3,
    model: DEFAULT_FORECAST_MODEL,
    elevation: DEFAULT_FORECAST_ELEVATION,
    active: true,
  });
  const favoritesRef = useRef(favorites);
  const selectedLocationRef = useRef(selectedLocationId);
  const homeResortRef = useRef(homeResortId);
  const [dailyOverview, setDailyOverview] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [forecastError, setForecastError] = useState('');
  const [units, setUnits] = useStoredUnits();
  const [forecastModel, setForecastModel] = useState(DEFAULT_FORECAST_MODEL);
  const [activeModel, setActiveModel] = useState(() => {
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    return normalizeForecastModel(stored || DEFAULT_FORECAST_MODEL);
  });
  const [forecastElevation, setForecastElevation] = useState(DEFAULT_FORECAST_ELEVATION);
  const [forecastModelOptions, setForecastModelOptions] = useState(DEFAULT_FORECAST_MODEL_OPTIONS);
  const [activeElevation, setActiveElevation] = useState(() => {
    const stored = window.localStorage.getItem(ELEVATION_STORAGE_KEY);
    return normalizeForecastElevation(stored || DEFAULT_FORECAST_ELEVATION);
  });
  const [activeView, setActiveView] = useState('calendar');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hourlyModalOpen, setHourlyModalOpen] = useState(false);
  const [hourlyModalDate, setHourlyModalDate] = useState(null);
  const [hourlyModalData, setHourlyModalData] = useState([]);
  const [hourlyModalLoading, setHourlyModalLoading] = useState(false);
  const [hourlyModalTimezone, setHourlyModalTimezone] = useState('');
  const [hourlyModalSegments, setHourlyModalSegments] = useState([]);
  const [hourlyChartMetrics, setHourlyChartMetrics] = useState(['snow']);
  const hourlyCanvasRef = useRef(null);
  const hourlyChartRef = useRef(null);
  const engagementSessionId = useMemo(() => getEngagementSessionId(), []);
  const engagementLocationRef = useRef(null);
  const activeModelRef = useRef(activeModel);
  const forecastModelRef = useRef(forecastModel);

  const role = resolveRole(user);
  const [today] = useState(() => new Date());
  const [displayMonth, setDisplayMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const calendar = useMemo(() => buildCalendarRange(displayMonth), [displayMonth]);
  const { startEpoch, endEpoch } = useMemo(
    () => dayRangeToEpoch(calendar.start, calendar.end),
    [calendar.start, calendar.end]
  );

  const overviewByDate = useMemo(() => {
    const map = {};
    if (dailyOverview?.days) {
      dailyOverview.days.forEach((day) => {
        map[day.date] = day;
      });
    }
    return map;
  }, [dailyOverview]);

  const resortSelectWidth = useMemo(() => {
    const longest = locations.reduce((max, loc) => Math.max(max, (loc?.name || '').length), 0);
    const widthCh = Math.max(longest, 12) + 4;
    return `${widthCh}ch`;
  }, [locations]);

  const orderedLocations = useMemo(() => {
    if (!favorites.length) return locations;
    const favoritesSet = new Set(favorites);
    const favoriteLocations = locations.filter((loc) => favoritesSet.has(String(loc.id)));
    const rest = locations.filter((loc) => !favoritesSet.has(String(loc.id)));
    return [...favoriteLocations, ...rest];
  }, [favorites, locations]);

  const selectedLocationName = useMemo(() => {
    if (!selectedLocationId) return '';
    const match = locations.find((loc) => String(loc.id) === String(selectedLocationId));
    return match?.name || '';
  }, [locations, selectedLocationId]);

  const selectedLocationTimezone = useMemo(() => {
    if (!selectedLocationId) return '';
    const match = locations.find((loc) => String(loc.id) === String(selectedLocationId));
    return match?.tz_iana || '';
  }, [locations, selectedLocationId]);

  const applyModelSelection = useCallback((nextModel) => {
    setActiveModel(nextModel);
  }, []);

  const applyElevationSelection = useCallback((nextElevation) => {
    setActiveElevation(nextElevation);
  }, []);

  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  useEffect(() => {
    forecastModelRef.current = forecastModel;
  }, [forecastModel]);

  useEffect(() => {
    let isMounted = true;
    getForecastModels()
      .then((models) => {
        if (!isMounted) return;
        const apiModels = Array.isArray(models) ? models : [];
        const priorityOrder = ['median', 'nbm', 'gfs', 'hrrr'];
        const merged = [
          { value: DEFAULT_FORECAST_MODEL, label: 'Median' },
          ...apiModels
            .filter((model) => model?.code)
            .map((model) => ({
              value: String(model.code).toLowerCase(),
              label: String(model.label || model.code),
            })),
        ].sort((a, b) => {
          const aIndex = priorityOrder.indexOf(a.value);
          const bIndex = priorityOrder.indexOf(b.value);
          if (aIndex !== -1 || bIndex !== -1) {
            return (aIndex === -1 ? priorityOrder.length : aIndex)
              - (bIndex === -1 ? priorityOrder.length : bIndex);
          }
          return a.label.localeCompare(b.label);
        });
        setForecastModelOptions(merged);
        const currentActive = activeModelRef.current;
        const currentPreferred = forecastModelRef.current;
        const normalizedActive = normalizeForecastModel(currentActive, merged);
        if (normalizedActive !== currentActive) {
          setActiveModel(normalizedActive);
        }
        const normalizedPreferred = normalizeForecastModel(currentPreferred, merged);
        if (normalizedPreferred !== currentPreferred) {
          setForecastModel(normalizedPreferred);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const sendEngagement = useCallback((eventName, meta = {}, locationId = null) => {
    trackEngagementEvent({
      event: eventName,
      sessionId: engagementSessionId,
      locationId,
      meta,
    }).catch(() => {});
  }, [engagementSessionId]);

  useEffect(() => {
    sendEngagement('app_opened', { path: window.location.pathname });
  }, [sendEngagement]);

  useEffect(() => {
    let intervalId = null;
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        sendEngagement('heartbeat');
      }
    };
    intervalId = window.setInterval(heartbeat, 30000);
    document.addEventListener('visibilitychange', heartbeat);
    window.addEventListener('focus', heartbeat);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', heartbeat);
      window.removeEventListener('focus', heartbeat);
    };
  }, [sendEngagement]);


  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      setAuthStatus('loading');
      try {
        const data = await getSession();
        if (!isMounted) return;
        if (data?.authenticated) {
          setUser(data.user);
          if (data.roleLabels && typeof data.roleLabels === 'object') {
            setRoleLabels((prev) => ({ ...prev, ...data.roleLabels }));
          }
          if (data.roleLimits && typeof data.roleLimits === 'object') {
            setRoleLimits((prev) => ({ ...prev, ...data.roleLimits }));
          }
          if (data.roleForecast && typeof data.roleForecast === 'object') {
            setRoleForecast((prev) => ({ ...prev, ...normalizeForecastWindows(data.roleForecast) }));
          }
          if (data.roleHourly && typeof data.roleHourly === 'object') {
            setRoleHourly((prev) => ({ ...prev, ...data.roleHourly }));
          }
          if (data.rolePowAlerts && typeof data.rolePowAlerts === 'object') {
            setRolePowAlerts((prev) => ({ ...prev, ...data.rolePowAlerts }));
          }
          if (data.roleCheckPow && typeof data.roleCheckPow === 'object') {
            setRoleCheckPow((prev) => ({ ...prev, ...data.roleCheckPow }));
          }
          setAuthStatus('authenticated');
        } else {
          setUser(null);
          if (data?.roleLabels && typeof data.roleLabels === 'object') {
            setRoleLabels((prev) => ({ ...prev, ...data.roleLabels }));
          } else {
            setRoleLabels(DEFAULT_ROLE_LABELS);
          }
          if (data?.roleLimits && typeof data.roleLimits === 'object') {
            setRoleLimits((prev) => ({ ...prev, ...data.roleLimits }));
          } else {
            setRoleLimits(DEFAULT_ROLE_LIMITS);
          }
          if (data?.roleForecast && typeof data.roleForecast === 'object') {
            setRoleForecast((prev) => ({ ...prev, ...normalizeForecastWindows(data.roleForecast) }));
          } else {
            setRoleForecast(DEFAULT_ROLE_WINDOWS);
          }
          if (data?.roleHourly && typeof data.roleHourly === 'object') {
            setRoleHourly((prev) => ({ ...prev, ...data.roleHourly }));
          } else {
            setRoleHourly({});
          }
          if (data?.rolePowAlerts && typeof data.rolePowAlerts === 'object') {
            setRolePowAlerts((prev) => ({ ...prev, ...data.rolePowAlerts }));
          } else {
            setRolePowAlerts({});
          }
          if (data?.roleCheckPow && typeof data.roleCheckPow === 'object') {
            setRoleCheckPow((prev) => ({ ...prev, ...data.roleCheckPow }));
          } else {
            setRoleCheckPow({});
          }
          setAuthStatus('anonymous');
        }
      } catch (error) {
        if (!isMounted) return;
        setUser(null);
        setRoleLabels(DEFAULT_ROLE_LABELS);
        setRoleLimits(DEFAULT_ROLE_LIMITS);
        setRoleForecast(DEFAULT_ROLE_WINDOWS);
        setRoleHourly({});
        setRolePowAlerts({});
        setRoleCheckPow({});
        setAuthStatus('anonymous');
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeView === 'account') {
      sendEngagement('view_account');
    } else if (activeView === 'pow-alerts') {
      sendEngagement('view_pow_alerts');
    } else if (activeView === 'subscription') {
      sendEngagement('view_subscription');
    }
  }, [activeView, sendEngagement]);

  useEffect(() => {
    let isMounted = true;
    getLocations({ isSkiResort: true, limit: 100 })
      .then((data) => {
        if (!isMounted) return;
        const safeLocations = Array.isArray(data) ? data : [];
        setLocations(safeLocations);
        if (safeLocations.length) {
          const selectedIsValid = selectedLocationRef.current
            ? safeLocations.some((loc) => String(loc.id) === String(selectedLocationRef.current))
            : false;
          if (!selectedIsValid) {
            window.localStorage.removeItem('snowcast-resort');
          }
          setSelectedLocationId((prev) => {
            if (prev && safeLocations.some((loc) => String(loc.id) === String(prev))) return prev;
            const currentHomeResort = homeResortRef.current;
            if (currentHomeResort && safeLocations.some((loc) => String(loc.id) === String(currentHomeResort))) {
              return String(currentHomeResort);
            }
            const favoriteMatch = favoritesRef.current.find((id) =>
              safeLocations.some((loc) => String(loc.id) === String(id))
            );
            return favoriteMatch ? String(favoriteMatch) : String(safeLocations[0].id);
          });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setLocations([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      preferencesLoadedRef.current = false;
      if (authStatus === 'anonymous') {
        setFavorites([]);
        setProfileName('');
        setProfileNameDraft('');
        setForecastModel(DEFAULT_FORECAST_MODEL);
        setForecastElevation(DEFAULT_FORECAST_ELEVATION);
      }
      return;
    }
    let isMounted = true;
    getUserPreferences()
      .then((prefs) => {
        if (!isMounted) return;
        const nextFavorites = Array.isArray(prefs?.favorites) ? prefs.favorites.map(String) : [];
        const nextHomeResortId = prefs?.homeResortId ? String(prefs.homeResortId) : '';
        const nextUnits = prefs?.units === 'metric' || prefs?.units === 'imperial' ? prefs.units : '';
        const nextName = prefs?.name ? String(prefs.name) : '';
        const nextForecastModel = normalizeForecastModel(prefs?.forecastModel, forecastModelOptions);
        const nextForecastElevation = normalizeForecastElevation(prefs?.forecastElevation);
        const nextExpiresAt = prefs?.subscriptionExpiresAt ? String(prefs.subscriptionExpiresAt) : '';
        setProfileName(nextName);
        setProfileNameDraft(nextName);
        setFavorites(nextFavorites);
        setHomeResortId(nextHomeResortId);
        setUnits(nextUnits || 'imperial');
        setForecastModel(nextForecastModel);
        setForecastElevation(nextForecastElevation);
        setSubscriptionExpiresAt(nextExpiresAt);
        setNewAlert((prev) => ({
          ...prev,
          model: nextForecastModel || DEFAULT_FORECAST_MODEL,
          elevation: nextForecastElevation || DEFAULT_FORECAST_ELEVATION,
        }));
        if (nextHomeResortId && !firstLoginHandledRef.current && !selectedLocationRef.current) {
          setSelectedLocationId(nextHomeResortId);
        }
        firstLoginHandledRef.current = true;
        preferencesLoadedRef.current = true;
        const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
        const storedElevation = window.localStorage.getItem(ELEVATION_STORAGE_KEY);
        if (!storedModel && nextForecastModel) {
          setActiveModel(nextForecastModel);
        }
        if (!storedElevation && nextForecastElevation) {
          setActiveElevation(nextForecastElevation);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        preferencesLoadedRef.current = true;
      });
    return () => {
      isMounted = false;
    };
  }, [authStatus, setUnits, forecastModelOptions]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      setShowLogin(false);
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || activeView !== 'pow-alerts') {
      return;
    }
    let isMounted = true;
    setPowAlertsLoading(true);
    listPowAlerts()
      .then((alerts) => {
        if (!isMounted) return;
        setPowAlerts(Array.isArray(alerts) ? alerts : []);
        setPowAlertsStatus('');
      })
      .catch((error) => {
        if (!isMounted) return;
        setPowAlertsStatus(error.message || 'Unable to load alerts.');
      })
      .finally(() => {
        if (!isMounted) return;
        setPowAlertsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [authStatus, activeView]);

  useEffect(() => {
    if (!selectedLocationId) return;
    if (!engagementLocationRef.current) {
      engagementLocationRef.current = selectedLocationId;
      return;
    }
    if (engagementLocationRef.current !== selectedLocationId) {
      sendEngagement('resort_selected', {}, selectedLocationId);
      engagementLocationRef.current = selectedLocationId;
    }
  }, [selectedLocationId, sendEngagement]);

  useEffect(() => {
    if (selectedLocationId) {
      window.localStorage.setItem('snowcast-resort', selectedLocationId);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    selectedLocationRef.current = selectedLocationId;
  }, [selectedLocationId]);

  useEffect(() => {
    homeResortRef.current = homeResortId;
  }, [homeResortId]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!preferencesLoadedRef.current) return;
    updateUserPreferences({
      favorites,
      homeResortId,
      units,
      name: profileName || undefined,
      forecastModel,
      forecastElevation,
    }).catch(() => {});
  }, [authStatus, favorites, homeResortId, units, profileName, forecastModel, forecastElevation]);

  useEffect(() => {
    if (activeModel) {
      window.localStorage.setItem(MODEL_STORAGE_KEY, activeModel);
    }
  }, [activeModel]);

  useEffect(() => {
    if (activeElevation) {
      window.localStorage.setItem(ELEVATION_STORAGE_KEY, activeElevation);
    }
  }, [activeElevation]);


  useEffect(() => {
    if (!selectedLocationId) return;
    setLoadingForecast(true);
    setForecastError('');

    getDailyOverview({
      locationId: selectedLocationId,
      startDateEpoch: startEpoch,
      endDateEpoch: endEpoch,
      model: activeModel,
      elevation: activeElevation,
    })
      .then((overview) => {
        setDailyOverview(overview);
        setLoadingForecast(false);
      })
      .catch((error) => {
        setForecastError(error.message || 'Unable to load forecast data.');
        setLoadingForecast(false);
      });
  }, [selectedLocationId, startEpoch, endEpoch, activeModel, activeElevation]);

  useEffect(() => {
    if (!hourlyModalOpen || !hourlyModalData.length) return;
    const showTemp = hourlyChartMetrics.includes('temp');
    const showWind = hourlyChartMetrics.includes('wind');
    if (!showTemp && !showWind) return;
    const canvas = hourlyCanvasRef.current;
    const container = hourlyChartRef.current;
    if (!canvas || !container) return;

    const width = container.scrollWidth || container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const plotTop = 10;
    const plotBottom = height - 16;
    const plotHeight = plotBottom - plotTop;
    const colWidth = width / hourlyModalData.length;

    if (showTemp) {
      const { minGrid, maxGrid, gridRange, step } = getTempScale(hourlyModalData);

      ctx.strokeStyle = 'rgba(13, 27, 42, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);

      for (let t = minGrid; t <= maxGrid + 0.001; t += step) {
        const y = plotTop + ((maxGrid - t) / gridRange) * plotHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(47, 154, 102, 0.95)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      hourlyModalData.forEach((hour, index) => {
        const tempValue = hour.temp ?? minGrid;
        const ratio = (tempValue - minGrid) / gridRange;
        const x = (index + 0.5) * colWidth;
        const y = plotTop + (1 - ratio) * plotHeight;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      ctx.fillStyle = 'rgba(47, 154, 102, 0.95)';
      hourlyModalData.forEach((hour, index) => {
        const tempValue = hour.temp ?? minGrid;
        const ratio = (tempValue - minGrid) / gridRange;
        const x = (index + 0.5) * colWidth;
        const y = plotTop + (1 - ratio) * plotHeight;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (showWind) {
      const minWind = 0;
      const maxDefaultWind = units === 'metric' ? 15 * WIND_KMH_PER_MPH : 15;
      const windValues = hourlyModalData.map((hour) =>
        units === 'metric' ? (hour.windspeed || 0) * WIND_KMH_PER_MPH : hour.windspeed || 0
      );
      const maxWind = Math.max(...windValues, maxDefaultWind);
      const windRange = Math.max(maxWind - minWind, 1);

      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(223, 98, 44, 0.95)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      windValues.forEach((value, index) => {
        const rawRatio = (value - minWind) / windRange;
        const ratio = Math.max(0, Math.min(1, rawRatio));
        const x = (index + 0.5) * colWidth;
        const y = plotTop + (1 - ratio) * plotHeight;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [hourlyModalData, hourlyModalOpen, hourlyChartMetrics, units]);

  const handleRequestLink = async (event) => {
    event.preventDefault();
    sendEngagement('login_link_requested', { status: 'attempt' });
    try {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      const payload = await requestMagicLink(email, redirectPath, 'cookie');
      if (payload?.closedSignup) {
        sendEngagement('login_link_requested', { status: 'closed' });
        showToast('Snowcast is under development and not accepting new users yet.', 'warning', 6000);
      } else {
        sendEngagement('login_link_requested', { status: 'sent' });
        showToast('Email sent. Check your inbox for the sign-in link.', 'success', 5000);
        setEmail('');
        setShowLogin(false);
      }
    } catch (error) {
      sendEngagement('login_link_requested', { status: 'error' });
      showToast(error.message || 'Unable to send login link.', 'error', 6000);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      // no-op
    }
    setUser(null);
    setAuthStatus('anonymous');
  };

  const isAuthenticated = authStatus === 'authenticated' && Boolean(user);
  const showAuthControls = authStatus !== 'loading';
  const authBlock = isAuthenticated ? (
    <div className="auth-info">
      <button type="button" onClick={handleLogout} className="login-trigger">
        Logout
      </button>
    </div>
  ) : null;

  const loginButton = authStatus === 'anonymous' ? (
    <button
      type="button"
      onClick={() => {
        setMobileMenuOpen(false);
        setShowLogin(true);
      }}
      className="login-trigger"
    >
      Login
    </button>
  ) : null;

  const hamburgerClassName = isAuthenticated
    ? 'hamburger-button'
    : 'hamburger-button desktop-only';

  const roleLabel = roleLabels[role] || role || '-';
  const expiresLabel = useMemo(() => {
    if (role === 'admin') return 'Never';
    if (role !== 'premium') return '';
    if (!subscriptionExpiresAt) return '';
    const dt = new Date(subscriptionExpiresAt);
    if (Number.isNaN(dt.getTime())) return subscriptionExpiresAt;
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [subscriptionExpiresAt, role]);
  const isDayVisible = (date) => {
    if (!roleWindow) return true;
    const offset = differenceInDays(date, today);
    return offset >= -roleWindow.back && offset <= roleWindow.forward;
  };
  const isSignedIn = authStatus === 'authenticated';
  const roleWindow = isSignedIn
    ? (roleForecast[role] ?? DEFAULT_ROLE_WINDOWS[role] ?? null)
    : (roleForecast.guest ?? DEFAULT_ROLE_WINDOWS.guest);
  const isFavoriteSelected = favorites.includes(String(selectedLocationId || ''));
  const favoriteLimit = roleLimits[role] ?? 0;
  const canAddFavorite = favoriteLimit < 0 || favorites.length < favoriteLimit;
  const favoriteLimitReached = !isFavoriteSelected && !canAddFavorite;
  const favoriteLimitLabel = favoriteLimit < 0 ? 'Unlimited' : String(favoriteLimit);
  const powAlertLimit = rolePowAlerts[role];
  const powAlertLimitLabel = Number.isFinite(powAlertLimit)
    ? (powAlertLimit < 0 ? 'Unlimited' : String(powAlertLimit))
    : '-';
  const hourlyAccessLabel = roleHourly[role] ? 'Yes' : 'No';
  const forecastWindowLabel = roleWindow
    ? `${roleWindow.back} days back / ${roleWindow.forward} days forward`
    : 'Unlimited';

  const applyFavoriteLimit = (list, limit, pinnedId) => {
    const unique = Array.from(new Set((list || []).map((id) => String(id)).filter(Boolean)));
    if (limit < 0) return unique;
    const pinned = pinnedId ? unique.filter((id) => id === String(pinnedId)) : [];
    const rest = unique.filter((id) => !pinned.includes(id));
    const merged = pinned.length ? [...pinned, ...rest] : rest;
    return merged.slice(0, limit);
  };

  useEffect(() => {
    if (!homeResortId) return;
    setFavorites((prev) => applyFavoriteLimit([...prev, String(homeResortId)], favoriteLimit, homeResortId));
  }, [homeResortId, favoriteLimit]);

  const handleAddFavorite = () => {
    if (!selectedLocationId) return;
    if (favoriteLimitReached) return;
    setFavorites((prev) => applyFavoriteLimit([...prev, String(selectedLocationId)], favoriteLimit, homeResortId));
    sendEngagement('favorite_added', {}, selectedLocationId);
  };

  const showToast = (message, kind = 'info', duration = 6000, action = null) => {
    setToastMessage(message);
    setToastKind(kind);
    setToastAction(action);
    if (duration > 0) {
      setTimeout(() => {
        setToastMessage('');
        setToastAction(null);
      }, duration);
    }
  };

  const handleFavoriteAttempt = () => {
    if (!isSignedIn) {
      showToast('Sign in to save favorites.', 'warning', 6000, {
        label: 'Sign in',
        onClick: () => {
          setShowLogin(true);
          setToastMessage('');
          setToastAction(null);
        },
      });
      return;
    }
    if (!favoriteLimitReached) {
      handleAddFavorite();
      return;
    }
      showToast('Upgrade to add more', 'warning', 6000, {
      label: 'Upgrade',
      onClick: () => {
        setActiveView('subscription');
        setToastMessage('');
        setToastAction(null);
      },
    });
  };

  const handleSubmitFeedback = async (event) => {
    event.preventDefault();
    const trimmed = feedbackMessage.trim();
    if (!trimmed) {
      showToast('Please add a short message.', 'warning', 4000);
      return;
    }
    try {
      await submitFeedback({
        message: trimmed,
        context: {
          name: feedbackName.trim() || null,
          view: activeView,
          path: window.location.pathname,
          locationId: selectedLocationId || null,
          locationName: selectedLocationName || null,
          units,
          role,
          forecastModel,
          activeModel,
          forecastElevation,
          activeElevation,
          dayModalModel: activeModel,
          dayModalElevation: activeElevation,
          hourlyModalModel: activeModel,
          hourlyModalElevation: activeElevation,
          signedIn: isSignedIn,
        },
      });
      setFeedbackMessage('');
      setFeedbackName('');
      setShowFeedback(false);
      showToast('Thanks for the feedback!', 'success', 5000);
    } catch (error) {
      showToast(error.message || 'Unable to send feedback.', 'error', 6000);
    }
  };

  const handleHomeResortChange = (event) => {
    setHomeResortId(event.target.value);
  };

  const handleNameCommit = () => {
    const trimmed = profileNameDraft.trim();
    if (!trimmed) {
      setProfileNameDraft(profileName);
      return;
    }
    if (trimmed !== profileName) {
      setProfileName(trimmed);
    }
  };

  const handleRemoveFavorite = (id) => {
    if (!isSignedIn) {
      showToast('Sign in to save favorites.', 'warning', 6000, {
        label: 'Sign in',
        onClick: () => {
          setShowLogin(true);
          setToastMessage('');
          setToastAction(null);
        },
      });
      return;
    }
    setFavorites((prev) => prev.filter((favId) => String(favId) !== String(id)));
    sendEngagement('favorite_removed', {}, id);
  };

  useEffect(() => {
    const limited = applyFavoriteLimit(favorites, favoriteLimit, homeResortId);
    if (limited.length !== favorites.length || limited.some((id, index) => id !== favorites[index])) {
      setFavorites(limited);
    }
  }, [favorites, favoriteLimit, homeResortId]);

  const handleCreatePowAlert = async (event) => {
    event.preventDefault();
    if (!newAlert.locationId) {
      setPowAlertsStatus('Select a resort for the alert.');
      return;
    }
    const powAlertLimit = rolePowAlerts[role];
    if (Number.isFinite(powAlertLimit) && powAlertLimit >= 0 && powAlerts.length >= powAlertLimit) {
      showToast('Upgrade to add more', 'warning', 6000, {
        label: 'Upgrade',
        onClick: () => {
          setActiveView('subscription');
          setToastMessage('');
          setToastAction(null);
        },
      });
      return;
    }
    try {
      const payload = await createPowAlert({
        locationId: newAlert.locationId,
        windowDays: Number(newAlert.windowDays),
        thresholdIn: toInches(newAlert.threshold, units),
        model: newAlert.model,
        elevation: newAlert.elevation,
        active: newAlert.active,
      });
      setPowAlerts((prev) => [...prev, payload]);
      setNewAlert((prev) => ({
        ...prev,
        locationId: '',
        windowDays: 3,
        threshold: prev.threshold,
        model: prev.model,
        elevation: prev.elevation,
        active: true,
      }));
      setPowAlertsStatus('');
      sendEngagement(
        'pow_alert_created',
        { windowDays: Number(newAlert.windowDays), thresholdIn: toInches(newAlert.threshold, units) },
        newAlert.locationId
      );
    } catch (error) {
      setPowAlertsStatus(error.message || 'Unable to create alert.');
    }
  };

  const handleRedeemDiscount = async (event) => {
    event.preventDefault();
    const code = discountCode.trim();
    if (!code) {
      setDiscountStatus('Enter a discount code.');
      return;
    }
    setDiscountStatus('');
    try {
      const payload = await redeemDiscountCode(code);
      if (payload?.role) {
        setUser((prev) => (prev ? { ...prev, roles: [payload.role] } : prev));
      }
      if (payload?.subscriptionExpiresAt) {
        setSubscriptionExpiresAt(String(payload.subscriptionExpiresAt));
      }
      setDiscountStatus('Discount applied.');
      setDiscountCode('');
      sendEngagement('discount_redeemed', { ok: true });
    } catch (error) {
      setDiscountStatus(error.message || 'Unable to apply code.');
    }
  };


  const handleDeleteAlert = async (alertId) => {
    try {
      const target = powAlerts.find((alert) => alert.id === alertId);
      await deletePowAlert(alertId);
      setPowAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      if (target) {
        sendEngagement('pow_alert_deleted', {}, target.locationId);
      }
    } catch (error) {
      setPowAlertsStatus(error.message || 'Unable to delete alert.');
    }
  };

  const handleCheckPow = async () => {
    try {
      if (!roleCheckPow[role]) {
        showToast('Check Pow Now is available for admins only.', 'warning', 6000);
        return;
      }
      const result = await checkPowAlerts();
      const results = Array.isArray(result?.results) ? result.results : [];
      const sentCount = results.filter((item) => item.sent).length || 0;
      setPowAlertCheckResult(sentCount ? 'Pow! Check email!' : 'Sorry, no pow for you.');
      setTimeout(() => {
        setPowAlertCheckResult('');
      }, 10000);
    } catch (error) {
      setPowAlertCheckResult(error.message || 'Unable to run alerts.');
      setTimeout(() => {
        setPowAlertCheckResult('');
      }, 10000);
    }
  };


  const resortPicker = (
    <div className="control resort-picker">
      <div className="resort-picker-row">
        <select
          id="resort-select"
          value={selectedLocationId}
          onChange={(event) => setSelectedLocationId(event.target.value)}
          style={{ width: resortSelectWidth }}
          aria-label="Resort"
        >
        {renderResortOptions(orderedLocations)}
        </select>
        <button
          type="button"
          className={`resort-favorite ${isFavoriteSelected ? 'active' : ''}`}
          onClick={() => (isFavoriteSelected ? handleRemoveFavorite(selectedLocationId) : handleFavoriteAttempt())}
          aria-label={isFavoriteSelected ? 'Remove favorite' : 'Add favorite'}
          title={favoriteLimitReached ? 'Favorite limit reached' : ''}
        >
          {isFavoriteSelected ? '★' : '☆'}
        </button>
      </div>
    </div>
  );

  function renderResortOptions(list) {
    return (list || []).map((loc, index) => {
      const isFavorite = favorites.includes(String(loc.id));
      const shouldInsertDivider =
        index > 0 &&
        favorites.length > 0 &&
        !isFavorite &&
        favorites.includes(String(list[index - 1]?.id));
      return (
        <React.Fragment key={loc.id}>
          {shouldInsertDivider ? (
            <option disabled value="" key={`divider-${loc.id}`}>
              ──────────
            </option>
          ) : null}
          <option value={loc.id}>{loc.name}</option>
        </React.Fragment>
      );
    });
  }

  const handleMonthShift = (direction) => {
    setDisplayMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
      sendEngagement('month_changed', {
        month: next.getMonth() + 1,
        year: next.getFullYear(),
      });
      return next;
    });
  };

  const shiftDateByDay = (date, direction) => {
    const next = new Date(date);
    next.setDate(next.getDate() + direction);
    return next;
  };

  const getDayRangeEpoch = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const localOffset = getTimezoneOffsetMinutes(start, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const targetOffset = getTimezoneOffsetMinutes(start, selectedLocationTimezone);
    const offsetDiffMinutes = Number.isFinite(targetOffset) && Number.isFinite(localOffset)
      ? targetOffset - localOffset
      : 0;
    const startEpoch = start.getTime() + offsetDiffMinutes * 60000;
    return { startEpoch, endEpoch: startEpoch + 24 * 60 * 60 * 1000 - 1 };
  };

  const fetchDaySegments = async (date, model, elevation) => {
    const { startEpoch, endEpoch } = getDayRangeEpoch(date);
    const payload = await getDailySegments({
      locationId: selectedLocationId,
      startDateEpoch: startEpoch,
      endDateEpoch: endEpoch,
      model,
      elevation,
    });
    const dayKey = toISODate(date);
    const day = payload?.days?.find((entry) => entry.date === dayKey);
    return day?.segments || [];
  };

  const fetchHourlyData = async (date, model, elevation) => {
    const { startEpoch, endEpoch } = getDayRangeEpoch(date);
    return getHourly({
      locationId: selectedLocationId,
      startDateEpoch: startEpoch,
      endDateEpoch: endEpoch,
      model,
      elevation,
    });
  };

  const loadCombinedModal = async (date, modelOverride, elevationOverride) => {
    if (!selectedLocationId) return;
    const selectedModel = normalizeForecastModel(modelOverride || activeModel || forecastModel);
    const selectedElevation = normalizeForecastElevation(
      elevationOverride || activeElevation || forecastElevation
    );
    setHourlyModalOpen(true);
    setHourlyModalDate(date);
    setHourlyModalData([]);
    setHourlyModalLoading(true);
    setHourlyModalSegments([]);
                    setHourlyChartMetrics(['temp', 'snow', 'rain', 'wind']);

    try {
      const [segments, hourlyPayload] = await Promise.all([
        fetchDaySegments(date, selectedModel, selectedElevation).catch(() => []),
        fetchHourlyData(date, selectedModel, selectedElevation).catch(() => null),
      ]);
      setHourlyModalSegments(segments);
      if (hourlyPayload) {
        setHourlyModalTimezone(hourlyPayload?.location?.tz_iana || '');
        setHourlyModalData(hourlyPayload?.data || []);
      } else {
        setHourlyModalTimezone('');
        setHourlyModalData([]);
      }
    } finally {
      setHourlyModalLoading(false);
    }
  };

  const handleDaySelect = async (date, hasAccess) => {
    if (!hasAccess) {
      if (!isSignedIn) {
        showToast('Sign in to see more days.', 'warning', 6000, {
          label: 'Sign in',
          onClick: () => {
            setShowLogin(true);
            setToastMessage('');
            setToastAction(null);
          },
        });
      } else {
        showToast('Upgrade to see more', 'warning', 6000, {
          label: 'Upgrade',
          onClick: () => {
            setActiveView('subscription');
            setToastMessage('');
            setToastAction(null);
          },
        });
      }
      return;
    }
    sendEngagement('day_opened', { date: toISODate(date) }, selectedLocationId);
    await loadCombinedModal(date, activeModel, activeElevation);
  };

  const handleHourlyWeekShift = async (direction, event) => {
    event.stopPropagation();
    if (!hourlyModalDate) return;
    const nextDate = shiftDateByDay(hourlyModalDate, direction * 7);
    if (!isDayVisible(nextDate)) return;
    sendEngagement('hourly_shifted', { date: toISODate(nextDate) }, selectedLocationId);
    await loadCombinedModal(nextDate, activeModel, activeElevation);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-row">
            <button
              type="button"
              className="brand-link"
              onClick={() => setActiveView('calendar')}
              aria-label="Back to forecast"
            >
              <img src={snowcastLogo} alt="Snowcast" className="brand-logo" />
              <div className="brand-mark">Snowcast</div>
            </button>
            {resortPicker}
          </div>
        </div>

        <div className="header-actions">
          {showAuthControls ? loginButton : null}
          <button
            type="button"
            className={hamburgerClassName}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="overview">
          {forecastError ? <div className="error-banner">{forecastError}</div> : null}

          {mobileMenuOpen ? (
            <div
              className="mobile-menu-overlay"
              id="mobile-menu"
              onClick={() => setMobileMenuOpen(false)}
              role="presentation"
            >
              <div className="mobile-menu">
                <div className="mobile-menu-header">
                  <span>Menu</span>
                  <button type="button" className="ghost" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                    ✕
                  </button>
                </div>
                <div className="mobile-section menu-links">
                  <button
                    type="button"
                    className={`menu-link text-link ${activeView === 'calendar' ? 'active' : ''}`}
                    onClick={() => setActiveView('calendar')}
                  >
                    Forecast
                  </button>
                  <button
                    type="button"
                    className={`menu-link text-link ${activeView === 'pow-alerts' ? 'active' : ''}`}
                    onClick={() => setActiveView('pow-alerts')}
                    disabled={!isSignedIn}
                  >
                    Pow Alerts
                  </button>
                  <button
                    type="button"
                    className={`menu-link text-link ${activeView === 'account' ? 'active' : ''}`}
                    onClick={() => setActiveView('account')}
                    disabled={!isSignedIn}
                  >
                    Account
                  </button>
                  <button
                    type="button"
                    className={`menu-link text-link ${activeView === 'subscription' ? 'active' : ''}`}
                    onClick={() => setActiveView('subscription')}
                    disabled={!isSignedIn}
                  >
                    Upgrade
                  </button>
                  <button
                    type="button"
                    className="menu-link text-link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowFeedback(true);
                    }}
                  >
                    Feedback
                  </button>
                </div>
                {showAuthControls && authBlock ? <div className="mobile-section">{authBlock}</div> : null}
              </div>
            </div>
          ) : null}

          {hourlyModalOpen ? (
            <div className="day-modal-overlay" role="presentation" onClick={() => setHourlyModalOpen(false)}>
              <div
                className="day-modal"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="day-modal-header">
                  <div>
                    <div className="modal-nav detail-nav">
                      <button
                        type="button"
                        className="ghost nav-arrow"
                        onClick={(event) => handleHourlyWeekShift(-1, event)}
                        disabled={!hourlyModalDate || !isDayVisible(shiftDateByDay(hourlyModalDate, -7))}
                        aria-label="Previous week"
                      >
                        ‹
                      </button>
                      <div className="detail-week">
                        <div className="detail-month">
                          {hourlyModalDate
                            ? hourlyModalDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                            : ''}
                        </div>
                        <div className="detail-week-grid">
                          {(hourlyModalDate
                            ? (() => {
                                const start = new Date(hourlyModalDate);
                                start.setHours(0, 0, 0, 0);
                                start.setDate(start.getDate() - start.getDay());
                                return Array.from({ length: 7 }, (_, index) => {
                                  const day = new Date(start);
                                  day.setDate(start.getDate() + index);
                                  return day;
                                });
                              })()
                            : []
                          ).map((day) => {
                            const isActive = hourlyModalDate && toISODate(day) === toISODate(hourlyModalDate);
                            const isToday = toISODate(day) === toISODate(today);
                            return (
                              <button
                                key={`detail-day-${day.toISOString()}`}
                                type="button"
                                className={`detail-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}`}
                                onClick={() => loadCombinedModal(day, activeModel, activeElevation)}
                                disabled={!isDayVisible(day)}
                              >
                                <span className="detail-weekday">
                                  {day
                                    .toLocaleDateString(undefined, { weekday: 'short' })
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <span className="detail-date">
                                  {day.toLocaleDateString(undefined, { day: 'numeric' })}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ghost nav-arrow"
                        onClick={(event) => handleHourlyWeekShift(1, event)}
                        disabled={!hourlyModalDate || !isDayVisible(shiftDateByDay(hourlyModalDate, 7))}
                        aria-label="Next week"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  <button type="button" className="ghost" onClick={() => setHourlyModalOpen(false)} aria-label="Close detail view">
                    ✕
                  </button>
                </div>
                <div className="modal-controls">
                  <div className="modal-control">
                    <div className="calendar-label-row">
                      <span className="modal-model-label">Model</span>
                      <span className="model-info" tabIndex={0} aria-label="Model descriptions">
                        ⓘ
                        <span className="model-tooltip" role="tooltip">
                          {forecastModelOptions.map((option) => (
                            <span key={`model-tip-detail-${option.value}`} className="model-tooltip-item">
                              <strong>{option.label}:</strong> {getModelDescription(option.value)}
                            </span>
                          ))}
                        </span>
                      </span>
                    </div>
                    <select
                      className="modal-model-select"
                      value={activeModel}
                      onChange={(event) => {
                        const nextModel = normalizeForecastModel(event.target.value);
                        applyModelSelection(nextModel);
                        if (hourlyModalDate) {
                          loadCombinedModal(hourlyModalDate, nextModel, activeElevation);
                        }
                      }}
                      aria-label="Forecast model"
                    >
                      {forecastModelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="modal-control">
                    <span className="modal-model-label">Elevation</span>
                    <select
                      className="modal-model-select"
                      value={activeElevation}
                      onChange={(event) => {
                        const nextElevation = normalizeForecastElevation(event.target.value);
                        applyElevationSelection(nextElevation);
                        if (hourlyModalDate) {
                          loadCombinedModal(hourlyModalDate, activeModel, nextElevation);
                        }
                      }}
                      aria-label="Forecast elevation"
                    >
                      {FORECAST_ELEVATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="modal-control">
                    <span className="modal-model-label">Chart</span>
                    <div className="modal-checkboxes" role="group" aria-label="Chart metrics">
                        {[
                          { value: 'temp', label: 'Temp' },
                          { value: 'snow', label: 'Snow' },
                          { value: 'rain', label: 'Rain' },
                          { value: 'wind', label: 'Wind' },
                        ].map((metric) => (
                        <label key={metric.value} className="modal-checkbox">
                          <input
                            type="checkbox"
                            checked={hourlyChartMetrics.includes(metric.value)}
                            onChange={(event) => {
                              setHourlyChartMetrics((current) => {
                                if (event.target.checked) {
                                  return current.includes(metric.value) ? current : [...current, metric.value];
                                }
                                return current.filter((item) => item !== metric.value);
                              });
                            }}
                          />
                          <span>{metric.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {hourlyModalLoading ? (
                  <div className="day-modal-loading">Loading hourly…</div>
                ) : hourlyModalData.length ? (
                  <div className="hourly-forecast">
                    {(() => {
                      const hours = hourlyModalData;
                      const segments = hourlyModalSegments;
                      const showTemp = hourlyChartMetrics.includes('temp');
                      const showSnow = hourlyChartMetrics.includes('snow');
                      const showRain = hourlyChartMetrics.includes('rain');
                      const showWind = hourlyChartMetrics.includes('wind');
                      const chartValues = hours.map((hour) => {
                        const snowValue = showSnow ? (hour.snow || 0) : 0;
                        const rainValue = showRain ? (hour.rain || 0) : 0;
                        return Math.max(snowValue, rainValue);
                      });
                      const maxSnow = Math.max(...chartValues, 0.5);
                      const { minGrid, gridRange } = getTempScale(hours);
                      const chartHeight = 140;
                      const plotTop = 10;
                      const plotBottom = chartHeight - 16;
                      const plotHeight = plotBottom - plotTop;

                      return (
                        <div className="hourly-table">
                          <div className="hourly-scroll">
                            <div className="hourly-grid" style={{ '--hour-count': hours.length }}>
                              <div className="hourly-grid-row segment-row">
                                <div className="row-label">Blocks</div>
                                {segments.length ? (
                                  segments.map((segment) => {
                                    const span = Math.max(1, (segment.endHour ?? 0) - (segment.startHour ?? 0));
                                    const iconSrc = segment.representativeHour?.icon
                                      ? getIconSrc(segment.representativeHour.icon)
                                      : null;
                                    const isSegmentPow = (segment.snowTotal ?? 0) >= 1;
                                    const isSegmentWindy =
                                      Number.isFinite(segment.maxWindspeed) && segment.maxWindspeed >= WINDY_THRESHOLD_MPH;
                                    return (
                                      <div
                                        key={`segment-${segment.id}`}
                                        className="segment-block"
                                        style={{ gridColumn: `span ${span}` }}
                                      >
                                        <div className="segment-name">{segment.label}</div>
                                        <div className="segment-icon-row">
                                          <div className="segment-pill-slot">
                                            {isSegmentPow ? <span className="segment-pill pow-pill">Pow</span> : null}
                                          </div>
                                          {iconSrc ? <img src={iconSrc} alt="" /> : <div className="icon-placeholder" />}
                                          <div className="segment-pill-slot">
                                            {isSegmentWindy ? <span className="segment-pill windy-pill">Windy</span> : null}
                                          </div>
                                        </div>
                                        <div className="segment-metric">
                                          <span className="temp-high">{formatTemp(segment.maxTemp, units)}</span>
                                          <span className="temp-low">{formatTemp(segment.minTemp, units)}</span>
                                        </div>
                                        <div className="segment-sub">
                                          Snow {formatPrecipValue(segment.snowTotal, units)} {units === 'metric' ? 'cm' : 'in'}
                                        </div>
                                        <div className="segment-sub">Wind {formatWind(segment.maxWindspeed, units)}</div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="segment-block empty" style={{ gridColumn: `span ${hours.length}` }}>
                                    No segment data
                                  </div>
                                )}
                              </div>

                              <div className="hourly-grid-row time-row">
                                <div className="row-label">Time</div>
                                {hours.map((hour) => {
                                  const time = new Date(hour.dateTimeEpoch).toLocaleTimeString(undefined, {
                                    hour: 'numeric',
                                    timeZone: hourlyModalTimezone || undefined,
                                  });
                                  return (
                                    <div key={`time-${hour.dateTimeEpoch}`} className="row-cell">
                                      {time}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="hourly-grid-row icon-row">
                                <div className="row-label">Sky</div>
                                {hours.map((hour) => {
                                  const iconSrc = hour.icon ? getIconSrc(hour.icon) : null;
                                  return (
                                    <div key={`icon-${hour.dateTimeEpoch}`} className="row-cell icon-cell">
                                      {iconSrc ? <img src={iconSrc} alt="hour icon" /> : <div className="icon-placeholder" />}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="hourly-grid-row precip-type-row">
                                <div className="row-label">Type</div>
                                {hours.map((hour) => {
                                  const type = Array.isArray(hour.precipType) ? hour.precipType[0] : hour.precipType;
                                  return (
                                    <div key={`ptype-${hour.dateTimeEpoch}`} className="row-cell">
                                      {type || '--'}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="hourly-grid-row chart-row">
                                <div className="row-label">Chart</div>
                                <div className="chart-cells" ref={hourlyChartRef} style={{ gridColumn: `span ${hours.length}` }}>
                                  <div className="chart-legend">
                                    <span className={`legend-item ${showTemp ? 'active' : ''}`}>
                                      <span className="legend-swatch temp" />
                                      Temp
                                    </span>
                                    <span className={`legend-item ${showSnow ? 'active' : ''}`}>
                                      <span className="legend-swatch snow" />
                                      Snow
                                    </span>
                                    <span className={`legend-item ${showRain ? 'active' : ''}`}>
                                      <span className="legend-swatch rain" />
                                      Rain
                                    </span>
                                    <span className={`legend-item ${showWind ? 'active' : ''}`}>
                                      <span className="legend-swatch wind" />
                                      Wind
                                    </span>
                                  </div>
                                  {hours.map((hour) => {
                                    const snowRatio = (hour.snow || 0) / maxSnow;
                                    const rainRatio = (hour.rain || 0) / maxSnow;
                                    const tempValue = hour.temp ?? minGrid;
                                    const tempRatio = (tempValue - minGrid) / gridRange;
                                    const tempY = plotTop + (1 - tempRatio) * plotHeight;
                                    return (
                                      <div key={`snow-${hour.dateTimeEpoch}`} className="chart-cell">
                                        {showSnow || showRain ? (
                                          <div className={`bar-group ${showSnow && showRain ? 'dual' : ''}`}>
                                            {showSnow ? (
                                              <div className="snow-bar" style={{ height: `${snowRatio * 100}%` }} />
                                            ) : null}
                                            {showRain ? (
                                              <div className="rain-bar" style={{ height: `${rainRatio * 100}%` }} />
                                            ) : null}
                                          </div>
                                        ) : null}
                                      {showTemp ? (
                                        <div className="temp-label" style={{ top: `${tempY}px` }}>
                                          {formatTemp(hour.temp, units)}
                                        </div>
                                      ) : null}
                                      </div>
                                    );
                                  })}
                                  {showTemp || showWind ? <canvas ref={hourlyCanvasRef} className="temp-line-canvas" /> : null}
                                </div>
                              </div>

                              <div className="hourly-grid-row snow-row">
                                <div className="row-label">Snow ({units === 'metric' ? 'cm' : 'in'})</div>
                                {hours.map((hour) => (
                                  <div key={`snow-${hour.dateTimeEpoch}`} className="row-cell">
                                    {formatPrecipValue(hour.snow, units)}
                                  </div>
                                ))}
                              </div>

                              <div className="hourly-grid-row rain-row">
                                <div className="row-label">Rain ({units === 'metric' ? 'cm' : 'in'})</div>
                                {hours.map((hour) => (
                                  <div key={`rain-${hour.dateTimeEpoch}`} className="row-cell">
                                    {formatPrecipValue(hour.rain, units)}
                                  </div>
                                ))}
                              </div>

                              <div className="hourly-grid-row wind-row">
                                <div className="row-label">Wind ({units === 'imperial' ? 'mph' : 'km/h'})</div>
                                {hours.map((hour) => (
                                  <div key={`wind-${hour.dateTimeEpoch}`} className="row-cell">
                                    {formatWindValue(hour.windspeed, units)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="day-modal-empty">No {activeModel.toUpperCase()} data available.</div>
                )}
              </div>
            </div>
          ) : null}

          {activeView === 'calendar' ? (
            <div className="calendar">
              <div className="calendar-month">
                <span className="current-month">
                  {displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <div className="calendar-controls">
                  <div className="calendar-control">
                    <div className="calendar-label-row">
                      <span className="calendar-model-label">Model</span>
                      <span className="model-info" tabIndex={0} aria-label="Model descriptions">
                        ⓘ
                        <span className="model-tooltip" role="tooltip">
                          {forecastModelOptions.map((option) => (
                            <span key={`model-tip-${option.value}`} className="model-tooltip-item">
                              <strong>{option.label}:</strong> {getModelDescription(option.value)}
                            </span>
                          ))}
                        </span>
                      </span>
                    </div>
                    <select
                      className="calendar-model-select"
                      value={activeModel}
                      onChange={(event) => {
                        const nextModel = normalizeForecastModel(event.target.value);
                        applyModelSelection(nextModel);
                      }}
                      aria-label="Forecast model"
                    >
                      {forecastModelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="calendar-control">
                    <span className="calendar-model-label">Elevation</span>
                    <select
                      className="calendar-model-select"
                      value={activeElevation}
                      onChange={(event) => {
                        const nextElevation = normalizeForecastElevation(event.target.value);
                        applyElevationSelection(nextElevation);
                      }}
                      aria-label="Forecast elevation"
                    >
                      {FORECAST_ELEVATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="calendar-weekdays">
                <button
                  type="button"
                  className="weekday-nav"
                  onClick={() => handleMonthShift(-1)}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                {calendar.weeks[0].map((date) => (
                  <div className="weekday-label" key={`weekday-${date.toISOString()}`}>
                    {formatWeekday(date)}
                  </div>
                ))}
                <button
                  type="button"
                  className="weekday-nav"
                  onClick={() => handleMonthShift(1)}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
              {calendar.weeks.map((week, index) => (
                <div className="week-block" key={`week-${index}`}>
                  <div className="week-row">
                    {week.map((date) => {
                      const key = toISODate(date);
                      const overview = overviewByDate[key];
                      const hasAccess = isDayVisible(date);
                      const isPast = differenceInDays(date, today) < 0;
                      const hasOverview = Boolean(overview);
                      const isToday = differenceInDays(date, today) === 0;
                      const visibleOverview = hasAccess ? overview : null;
                      const lockedLabel = '🔒';
                      const snowAmount = Number(visibleOverview?.snowTotal ?? 0);
                      const isPowDay = hasAccess && hasOverview && snowAmount >= 6;
                      const isSnowDay = hasAccess && hasOverview && snowAmount >= 3;
                      const windyValueMph = Number(visibleOverview?.maxWindspeed ?? 0);
                      const isWindy = hasAccess && hasOverview && Number.isFinite(windyValueMph) && windyValueMph >= WINDY_THRESHOLD_MPH;
                      const precipTotal = Number(visibleOverview?.precipTotal ?? 0);
                      const precipType = hasAccess && hasOverview && precipTotal > 0
                        ? (snowAmount > 0
                          ? (snowAmount < precipTotal ? 'mixed' : 'snow')
                          : 'rain')
                        : '';
                      const footerPrecipValue = precipType === 'snow'
                        ? formatSnow(visibleOverview?.snowTotal, units)
                        : formatPrecipValue(visibleOverview?.precipTotal, units);
                      const precipIcon = getPrecipIcon(precipType);
                      const cloudIcon = getCloudIcon(visibleOverview?.avgCloudCover);
                      const tileIcon = precipIcon || cloudIcon;

                      return (
                        <div
                          key={key}
                          className={`day-tile ${hasAccess ? 'active' : 'inactive'} ${isPast ? 'past-day' : ''} ${isToday ? 'today' : ''} ${isSnowDay ? 'snow-day' : ''} ${isPowDay ? 'pow-day' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleDaySelect(date, hasAccess)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleDaySelect(date, hasAccess);
                            }
                          }}
                        >
                          {isPowDay ? <div className="pow-badge desktop-only">POW</div> : null}
                          <div className="day-header">
                            <span className="day-date">{date.getDate()}</span>
                            {isWindy ? <span className="windy-pill">Windy</span> : null}
                          </div>
                          <div className="day-body">
                            {hasAccess ? (
                              <>
                                <div className="icon-stack">
                                  {tileIcon ? (
                                    <img src={tileIcon} alt={precipType || 'cloud cover'} />
                                  ) : (
                                    <div className="icon-placeholder" />
                                  )}
                                  <span className="day-metric-line">{hasAccess ? footerPrecipValue : ''}</span>
                                  <span className="day-metric-line metric-note">{precipType}</span>
                                </div>
                                <div className="day-metrics">
                                  <span className="day-metric-line temp-line">
                                    <span className="temp-high temp-value-desktop">{formatTemp(visibleOverview?.maxTemp, units)}</span>
                                    <span className="temp-high temp-value-mobile">{formatTempValue(visibleOverview?.maxTemp, units)}</span>
                                    <span className="temp-low temp-value-desktop">{formatTemp(visibleOverview?.minTemp, units)}</span>
                                    <span className="temp-low temp-value-mobile">{formatTempValue(visibleOverview?.minTemp, units)}</span>
                                  </span>
                                  <span className="day-metric-line metric-secondary">
                                    {hasAccess ? formatWind(visibleOverview?.maxWindspeed, units) : ''}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="day-locked">{lockedLabel}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {activeView === 'account' ? (
            <div className="profile-page">
              <div className="profile-card">
                <div className="profile-header">
                  <h2>Account</h2>
                  <button type="button" className="ghost" onClick={() => setActiveView('calendar')}>
                    Back to forecast
                  </button>
                </div>
                {isSignedIn ? (
                  <div className="profile-grid">
                    <div className="profile-row">
                      <span className="profile-label">Email</span>
                      <span>{user?.email || '-'}</span>
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Name</span>
                      <input
                        type="text"
                        className="profile-input"
                        value={profileNameDraft}
                        onChange={(event) => setProfileNameDraft(event.target.value)}
                        onBlur={handleNameCommit}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleNameCommit();
                          }
                        }}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Home resort</span>
                      <select
                        className="profile-select"
                        value={homeResortId}
                        onChange={handleHomeResortChange}
                      >
                        <option value="">Not set</option>
                        {renderResortOptions(orderedLocations)}
                      </select>
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Units</span>
                      <div className="unit-toggle profile-unit-toggle" role="group" aria-label="Units">
                        <button
                          type="button"
                          className={units === 'imperial' ? 'active' : ''}
                          onClick={() => setUnits('imperial')}
                        >
                          Imperial
                        </button>
                        <button
                          type="button"
                          className={units === 'metric' ? 'active' : ''}
                          onClick={() => setUnits('metric')}
                        >
                          Metric
                        </button>
                      </div>
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Default Forecast Model</span>
                      <select
                        className="profile-select"
                        value={forecastModel}
                        onChange={(event) => {
                          const nextModel = normalizeForecastModel(event.target.value, forecastModelOptions);
                          setForecastModel(nextModel);
                        }}
                      >
                        {forecastModelOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Default Forecast Elevation</span>
                      <select
                        className="profile-select"
                        value={forecastElevation}
                        onChange={(event) => {
                          const nextElevation = normalizeForecastElevation(event.target.value);
                          setForecastElevation(nextElevation);
                        }}
                      >
                        {FORECAST_ELEVATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Plan</span>
                      <div className="profile-subscription">
                        <span>{roleLabel}</span>
                        <button type="button" className="ghost" onClick={() => setActiveView('subscription')}>
                          Upgrade
                        </button>
                      </div>
                    </div>
                    {expiresLabel ? (
                      <div className="profile-row">
                        <span className="profile-label">Premium expires</span>
                        <span>{expiresLabel}</span>
                      </div>
                    ) : null}
                    <div className="profile-row profile-row-limits">
                      <ul className="profile-limits">
                        <li>Favorites: {favoriteLimitLabel}</li>
                        <li>Pow alerts: {powAlertLimitLabel}</li>
                        <li>Hourly: {hourlyAccessLabel}</li>
                        <li>Forecast: {forecastWindowLabel}</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="profile-empty">
                    <p>Please sign in to view your account.</p>
                    {loginButton}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {activeView === 'pow-alerts' ? (
            <div className="profile-page">
              <div className="profile-card">
                <div className="profile-header">
                  <h2>Pow Alerts</h2>
                  <button type="button" className="ghost" onClick={() => setActiveView('calendar')}>
                    Back to forecast
                  </button>
                </div>
                {isSignedIn ? (
                  <div className="profile-content">
                    <div className="profile-alerts">
                      <div className="profile-alerts-header">
                        <div />
                        {role === 'admin' ? (
                          <button type="button" className="profile-action" onClick={handleCheckPow}>
                            Check Pow Now
                          </button>
                        ) : null}
                      </div>
                      {powAlertsStatus ? <div className="profile-alerts-status">{powAlertsStatus}</div> : null}
                      {powAlertCheckResult ? <div className="profile-alerts-status">{powAlertCheckResult}</div> : null}
                      {powAlertsLoading ? (
                        <div className="profile-alerts-status">Loading alerts…</div>
                      ) : (
                        <div className="profile-alerts-table">
                          <form className="alert-form alert-form-row" onSubmit={handleCreatePowAlert}>
                            <select
                              value={newAlert.locationId}
                              onChange={(event) => setNewAlert((prev) => ({ ...prev, locationId: event.target.value }))}
                              required
                            >
                              <option value="">Select resort</option>
                              {renderResortOptions(orderedLocations)}
                            </select>
                            <select
                              value={newAlert.windowDays}
                              onChange={(event) => setNewAlert((prev) => ({ ...prev, windowDays: Number(event.target.value) }))}
                            >
                              {[1, 2, 3, 4, 5, 7, 10, 14].map((days) => (
                                <option key={days} value={days}>
                                  {days} days
                                </option>
                              ))}
                            </select>
                            <div className="alert-threshold">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={newAlert.threshold}
                                onChange={(event) => setNewAlert((prev) => ({ ...prev, threshold: event.target.value }))}
                              />
                              <span className="alert-unit">{units === 'metric' ? 'cm' : 'in'}</span>
                            </div>
                            <select
                              value={newAlert.model}
                              onChange={(event) => setNewAlert((prev) => ({ ...prev, model: event.target.value }))}
                            >
                              {forecastModelOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={newAlert.elevation}
                              onChange={(event) => setNewAlert((prev) => ({ ...prev, elevation: event.target.value }))}
                            >
                              {FORECAST_ELEVATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button type="submit">Add Alert</button>
                          </form>
                          <table className="alert-table">
                            <thead>
                              <tr>
                                <th>Resort</th>
                                <th>Days</th>
                                <th>&ge;</th>
                                <th>Model</th>
                                <th>Elev.</th>
                                <th>Remove</th>
                              </tr>
                            </thead>
                            <tbody>
                              {powAlerts.map((alert) => (
                                <tr key={alert.id}>
                                  <td>{alert.locationName || 'Resort'}</td>
                                  <td>{alert.windowDays}</td>
                                  <td>
                                    {fromInches(alert.thresholdIn, units).toFixed(1)} {units === 'metric' ? 'cm' : 'in'}
                                  </td>
                                  <td>{(alert.model || DEFAULT_FORECAST_MODEL).toUpperCase()}</td>
                                  <td>{alert.elevation || DEFAULT_FORECAST_ELEVATION}</td>
                                  <td className="alert-remove-cell">
                                    <button
                                      type="button"
                                      className="ghost alert-delete"
                                      onClick={() => handleDeleteAlert(alert.id)}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!powAlerts.length ? <div className="profile-alerts-empty">No alerts yet.</div> : null}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="profile-empty">
                    <p>Please sign in to view your alerts.</p>
                    {loginButton}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {activeView === 'subscription' ? (
            <div className="profile-page">
              <div className="profile-card">
                <div className="profile-header">
                  <h2>Upgrade</h2>
                  <button type="button" className="ghost" onClick={() => setActiveView('calendar')}>
                    Back to forecast
                  </button>
                </div>
                {isSignedIn ? (
                  <div className="profile-content">
                    <p>Upgrade options are coming soon.</p>
                    <form className="discount-form" onSubmit={handleRedeemDiscount}>
                      <label>
                        Discount Code
                        <input
                          type="text"
                          value={discountCode}
                          onChange={(event) => setDiscountCode(event.target.value)}
                          placeholder="Enter code"
                          required
                        />
                      </label>
                      <button type="submit">Apply</button>
                    </form>
                    {discountStatus ? <div className="profile-alerts-status">{discountStatus}</div> : null}
                  </div>
                ) : (
                  <div className="profile-empty">
                    <p>Please sign in to manage your subscription.</p>
                    {loginButton}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {loadingForecast ? <div className="loading">Loading forecast…</div> : null}
        </section>
      </main>

      {showLogin ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowLogin(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="login-title">Login</h2>
              <button type="button" className="ghost" onClick={() => setShowLogin(false)} aria-label="Close login">
                ✕
              </button>
            </div>
            <p className="modal-subtitle">We will email you a secure magic link.</p>
            <form onSubmit={handleRequestLink} className="modal-form">
              <input
                type="email"
                placeholder="email@domain.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button type="submit">Login</button>
            </form>
          </div>
        </div>
      ) : null}
      {showFeedback ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowFeedback(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="feedback-title">Feedback</h2>
              <button type="button" className="ghost" onClick={() => setShowFeedback(false)} aria-label="Close feedback">
                ✕
              </button>
            </div>
            <p className="modal-subtitle">Tell us what we can improve.</p>
            <form onSubmit={handleSubmitFeedback} className="modal-form">
              <input
                type="text"
                value={feedbackName}
                onChange={(event) => setFeedbackName(event.target.value)}
                placeholder="Name (optional)"
              />
              <textarea
                className="modal-textarea"
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                placeholder="Your feedback..."
                rows={5}
                required
              />
              <button type="submit">Send</button>
            </form>
          </div>
        </div>
      ) : null}
      {toastMessage ? (
        <div className={`app-toast ${toastKind}`} role="status">
          {toastMessage}
          {toastAction ? (
            <button
              type="button"
              className="toast-action"
              onClick={toastAction.onClick}
            >
              {toastAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default App;

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  updatePowAlert,
  deletePowAlert,
  checkPowAlerts,
} from './api';
import {
  buildCalendarRange,
  dayRangeToEpoch,
  differenceInDays,
  formatWeekday,
  toISODate,
} from './utils/date';

const ROLE_WINDOWS = {
  guest: { back: 0, forward: 1 },
  basic: { back: 3, forward: 3 },
  standard: { back: 7, forward: 7 },
  advanced: null,
  admin: null,
  owner: null,
};

const UNIT_STORAGE_KEY = 'snowcast-units';
const FAVORITES_KEY = 'snowcast-favorites';
const HOME_RESORT_KEY = 'snowcast-home-resort';
const WIND_MPH_PER_KMH = 0.621371;
const CM_PER_INCH = 2.54;

function resolveRole(user) {
  if (!user) return 'guest';
  const role = Array.isArray(user.roles) && user.roles.length ? user.roles[0] : 'basic';
  return role;
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

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id)).filter(Boolean);
  } catch (error) {
    return [];
  }
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
  const converted = units === 'imperial' ? value * WIND_MPH_PER_KMH : value;
  const label = units === 'imperial' ? 'mph' : 'km/h';
  return `${converted.toFixed(1)} ${label}`;
}

function formatWindValue(value, units) {
  if (value == null || Number.isNaN(value)) return '--';
  const converted = units === 'imperial' ? value * WIND_MPH_PER_KMH : value;
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
  const [authMessage, setAuthMessage] = useState('');
  const [email, setEmail] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(() => window.localStorage.getItem('snowcast-resort') || '');
  const [favorites, setFavorites] = useState(() => loadFavorites());
  const [homeResortId, setHomeResortId] = useState(() => window.localStorage.getItem(HOME_RESORT_KEY) || '');
  const [powAlerts, setPowAlerts] = useState([]);
  const [powAlertsStatus, setPowAlertsStatus] = useState('');
  const [powAlertsLoading, setPowAlertsLoading] = useState(false);
  const [powAlertCheckResult, setPowAlertCheckResult] = useState('');
  const [newAlert, setNewAlert] = useState({
    locationId: '',
    windowDays: 3,
    threshold: 3,
    active: true,
  });
  const favoritesRef = useRef(favorites);
  const homeResortRef = useRef(homeResortId);
  const [dailyOverview, setDailyOverview] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [forecastError, setForecastError] = useState('');
  const [units, setUnits] = useStoredUnits();
  const [activeView, setActiveView] = useState('calendar');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [dayModalDate, setDayModalDate] = useState(null);
  const [dayModalSegments, setDayModalSegments] = useState([]);
  const [dayModalLoading, setDayModalLoading] = useState(false);
  const [hourlyModalOpen, setHourlyModalOpen] = useState(false);
  const [hourlyModalDate, setHourlyModalDate] = useState(null);
  const [hourlyModalData, setHourlyModalData] = useState([]);
  const [hourlyModalLoading, setHourlyModalLoading] = useState(false);
  const hourlyCanvasRef = useRef(null);
  const hourlyChartRef = useRef(null);

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
    const widthCh = Math.max(longest, 12) + 2;
    return `${widthCh}ch`;
  }, [locations]);

  const orderedLocations = useMemo(() => {
    if (!favorites.length) return locations;
    const favoritesSet = new Set(favorites);
    const favoriteLocations = locations.filter((loc) => favoritesSet.has(String(loc.id)));
    const rest = locations.filter((loc) => !favoritesSet.has(String(loc.id)));
    return [...favoriteLocations, ...rest];
  }, [favorites, locations]);



  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      setAuthStatus('loading');
      try {
        const data = await getSession();
        if (!isMounted) return;
        if (data?.authenticated) {
          setUser(data.user);
          setAuthStatus('authenticated');
        } else {
          setUser(null);
          setAuthStatus('anonymous');
        }
      } catch (error) {
        if (!isMounted) return;
        setUser(null);
        setAuthStatus('anonymous');
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    getLocations({ isSkiResort: true, limit: 100 })
      .then((data) => {
        if (!isMounted) return;
        const safeLocations = Array.isArray(data) ? data : [];
        setLocations(safeLocations);
        if (safeLocations.length) {
          setSelectedLocationId((prev) => {
            if (prev) return prev;
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
      return;
    }
    let isMounted = true;
    getUserPreferences()
      .then((prefs) => {
        if (!isMounted) return;
        const nextFavorites = Array.isArray(prefs?.favorites) ? prefs.favorites.map(String) : [];
        const nextHomeResortId = prefs?.homeResortId ? String(prefs.homeResortId) : '';
        const nextUnits = prefs?.units === 'metric' || prefs?.units === 'imperial' ? prefs.units : '';
        setFavorites(nextFavorites);
        setHomeResortId(nextHomeResortId);
        setUnits(nextUnits || 'imperial');
        if (nextHomeResortId && !firstLoginHandledRef.current) {
          setSelectedLocationId(nextHomeResortId);
        }
        firstLoginHandledRef.current = true;
        preferencesLoadedRef.current = true;
      })
      .catch(() => {
        if (!isMounted) return;
        preferencesLoadedRef.current = true;
      });
    return () => {
      isMounted = false;
    };
  }, [authStatus, setUnits]);

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
    if (selectedLocationId) {
      window.localStorage.setItem('snowcast-resort', selectedLocationId);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    homeResortRef.current = homeResortId;
  }, [homeResortId]);

  useEffect(() => {
    if (homeResortId) {
      window.localStorage.setItem(HOME_RESORT_KEY, String(homeResortId));
    } else {
      window.localStorage.removeItem(HOME_RESORT_KEY);
    }
  }, [homeResortId]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!preferencesLoadedRef.current) return;
    updateUserPreferences({ favorites, homeResortId, units }).catch(() => {});
  }, [authStatus, favorites, homeResortId, units]);

  useEffect(() => {
    if (!selectedLocationId) return;
    setLoadingForecast(true);
    setForecastError('');

    getDailyOverview({ locationId: selectedLocationId, startDateEpoch: startEpoch, endDateEpoch: endEpoch })
      .then((overview) => {
        setDailyOverview(overview);
        setLoadingForecast(false);
      })
      .catch((error) => {
        setForecastError(error.message || 'Unable to load forecast data.');
        setLoadingForecast(false);
      });
  }, [selectedLocationId, startEpoch, endEpoch]);

  useEffect(() => {
    if (!hourlyModalOpen || !hourlyModalData.length) return;
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

    const { minGrid, maxGrid, gridRange, step } = getTempScale(hourlyModalData);

    const plotTop = 10;
    const plotBottom = height - 16;
    const plotHeight = plotBottom - plotTop;
    const colWidth = width / hourlyModalData.length;

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
    ctx.strokeStyle = 'rgba(225, 140, 27, 0.95)';
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

    ctx.fillStyle = 'rgba(225, 140, 27, 0.95)';
    hourlyModalData.forEach((hour, index) => {
      const tempValue = hour.temp ?? minGrid;
      const ratio = (tempValue - minGrid) / gridRange;
      const x = (index + 0.5) * colWidth;
      const y = plotTop + (1 - ratio) * plotHeight;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [hourlyModalData, hourlyModalOpen]);

  const handleRequestLink = async (event) => {
    event.preventDefault();
    setAuthMessage('');
    try {
      const redirectPath = `${window.location.pathname}${window.location.search}`;
      await requestMagicLink(email, redirectPath, 'cookie');
      setAuthMessage('Check your email for a sign-in link.');
      setEmail('');
    } catch (error) {
      setAuthMessage(error.message || 'Unable to send login link.');
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
        setAuthMessage('');
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

  const roleWindow = ROLE_WINDOWS[role] ?? null;
  const isDayVisible = (date) => {
    if (!roleWindow) return true;
    const offset = differenceInDays(date, today);
    return offset >= -roleWindow.back && offset <= roleWindow.forward;
  };
  const isSignedIn = authStatus === 'authenticated';
  const isFavoriteSelected = favorites.includes(String(selectedLocationId || ''));

  useEffect(() => {
    if (!homeResortId) return;
    setFavorites((prev) => {
      const next = new Set(prev);
      next.add(String(homeResortId));
      return Array.from(next);
    });
  }, [homeResortId]);

  const handleAddFavorite = () => {
    if (!selectedLocationId) return;
    setFavorites((prev) => {
      const next = new Set(prev);
      next.add(String(selectedLocationId));
      return Array.from(next);
    });
  };

  const handleHomeResortChange = (event) => {
    setHomeResortId(event.target.value);
  };

  const handleRemoveFavorite = (id) => {
    setFavorites((prev) => prev.filter((favId) => String(favId) !== String(id)));
  };

  const handleCreatePowAlert = async (event) => {
    event.preventDefault();
    if (!newAlert.locationId) {
      setPowAlertsStatus('Select a resort for the alert.');
      return;
    }
    try {
      const payload = await createPowAlert({
        locationId: newAlert.locationId,
        windowDays: Number(newAlert.windowDays),
        thresholdIn: toInches(newAlert.threshold, units),
        active: newAlert.active,
      });
      setPowAlerts((prev) => [...prev, payload]);
      setNewAlert((prev) => ({
        ...prev,
        locationId: '',
        windowDays: 3,
        threshold: prev.threshold,
        active: true,
      }));
      setPowAlertsStatus('');
    } catch (error) {
      setPowAlertsStatus(error.message || 'Unable to create alert.');
    }
  };

  const handleToggleAlert = async (alert) => {
    try {
      const updated = await updatePowAlert(alert.id, {
        locationId: alert.locationId,
        windowDays: alert.windowDays,
        thresholdIn: alert.thresholdIn,
        active: !alert.active,
      });
      setPowAlerts((prev) => prev.map((item) => (item.id === alert.id ? updated : item)));
    } catch (error) {
      setPowAlertsStatus(error.message || 'Unable to update alert.');
    }
  };

  const handleDeleteAlert = async (alertId) => {
    try {
      await deletePowAlert(alertId);
      setPowAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
    } catch (error) {
      setPowAlertsStatus(error.message || 'Unable to delete alert.');
    }
  };

  const handleCheckPow = async () => {
    try {
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
        {orderedLocations.map((loc, index) => {
          const isFavorite = favorites.includes(String(loc.id));
          const shouldInsertDivider =
            index > 0 &&
            favorites.length > 0 &&
            !isFavorite &&
            favorites.includes(String(orderedLocations[index - 1]?.id));
          return (
            <React.Fragment key={loc.id}>
              {shouldInsertDivider ? (
                <option disabled value="">
                  ──────────
                </option>
              ) : null}
              <option value={loc.id}>{loc.name}</option>
            </React.Fragment>
          );
        })}
        </select>
        <button
          type="button"
          className={`resort-favorite ${isFavoriteSelected ? 'active' : ''}`}
          onClick={() => (isFavoriteSelected ? handleRemoveFavorite(selectedLocationId) : handleAddFavorite())}
          aria-label={isFavoriteSelected ? 'Remove favorite' : 'Add favorite'}
        >
          {isFavoriteSelected ? '★' : '☆'}
        </button>
      </div>
    </div>
  );

  const handleMonthShift = (direction) => {
    setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const shiftDateByDay = (date, direction) => {
    const next = new Date(date);
    next.setDate(next.getDate() + direction);
    return next;
  };

  const loadDaySegments = async (date) => {
    setDayModalOpen(true);
    setDayModalDate(date);
    setDayModalSegments([]);
    setDayModalLoading(true);

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    try {
      const payload = await getDailySegments({
        locationId: selectedLocationId,
        startDateEpoch: start.getTime(),
        endDateEpoch: end.getTime(),
      });
      const dayKey = toISODate(date);
      const day = payload?.days?.find((entry) => entry.date === dayKey);
      setDayModalSegments(day?.segments || []);
    } catch (error) {
      setDayModalSegments([]);
    } finally {
      setDayModalLoading(false);
    }
  };

  const loadHourly = async (date) => {
    setHourlyModalOpen(true);
    setHourlyModalDate(date);
    setHourlyModalData([]);
    setHourlyModalLoading(true);
    setDayModalOpen(false);

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    try {
      const payload = await getHourly({
        locationId: selectedLocationId,
        startDateEpoch: start.getTime(),
        endDateEpoch: end.getTime(),
      });
      setHourlyModalData(payload?.data || []);
    } catch (error) {
      setHourlyModalData([]);
    } finally {
      setHourlyModalLoading(false);
    }
  };

  const handleDaySelect = async (date, hasAccess) => {
    if (!hasAccess) return;
    await loadDaySegments(date);
  };

  const handleHourlyOpen = async (event) => {
    event.stopPropagation();
    if (!dayModalDate) return;
    await loadHourly(dayModalDate);
  };

  const handleDayShift = async (direction, event) => {
    event.stopPropagation();
    if (!dayModalDate) return;
    const nextDate = shiftDateByDay(dayModalDate, direction);
    if (!isDayVisible(nextDate)) return;
    await loadDaySegments(nextDate);
  };

  const handleHourlyShift = async (direction, event) => {
    event.stopPropagation();
    if (!hourlyModalDate) return;
    const nextDate = shiftDateByDay(hourlyModalDate, direction);
    if (!isDayVisible(nextDate)) return;
    await loadHourly(nextDate);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-row">
            <img src={snowcastLogo} alt="Snowcast" className="brand-logo" />
            <div className="brand-mark">Snowcast</div>
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
                    className={`menu-link text-link ${activeView === 'profile' ? 'active' : ''}`}
                    onClick={() => setActiveView('profile')}
                    disabled={!isSignedIn}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className={`menu-link text-link ${activeView === 'pow-alerts' ? 'active' : ''}`}
                    onClick={() => setActiveView('pow-alerts')}
                    disabled={!isSignedIn}
                  >
                    Pow Alerts
                  </button>
                </div>
                {showAuthControls && authBlock ? <div className="mobile-section">{authBlock}</div> : null}
              </div>
            </div>
          ) : null}

          {dayModalOpen ? (
            <div className="day-modal-overlay" role="presentation" onClick={() => setDayModalOpen(false)}>
              <div className="day-modal" role="dialog" aria-modal="true">
                <div className="day-modal-header">
                  <div>
                    <div className="modal-nav">
                      <button
                        type="button"
                        className="ghost nav-arrow"
                        onClick={(event) => handleDayShift(-1, event)}
                        disabled={!dayModalDate || !isDayVisible(shiftDateByDay(dayModalDate, -1))}
                        aria-label="Previous day"
                      >
                        ‹
                      </button>
                      <h2>
                        {dayModalDate
                          ? dayModalDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
                          : 'Day details'}
                      </h2>
                      <button
                        type="button"
                        className="ghost nav-arrow"
                        onClick={(event) => handleDayShift(1, event)}
                        disabled={!dayModalDate || !isDayVisible(shiftDateByDay(dayModalDate, 1))}
                        aria-label="Next day"
                      >
                        ›
                      </button>
                    </div>
                    <p>{dayModalDate ? formatWeekday(dayModalDate) : ''}</p>
                  </div>
                  <button type="button" className="ghost" onClick={() => setDayModalOpen(false)} aria-label="Close day details">
                    ✕
                  </button>
                </div>
                <button type="button" className="hourly-link" onClick={handleHourlyOpen}>
                  Hourly →
                </button>
                {dayModalLoading ? (
                  <div className="day-modal-loading">Loading segments…</div>
                ) : dayModalSegments.length ? (
                  <div className="day-modal-grid">
                    {dayModalSegments.map((segment) => {
                      const iconSrc = segment.representativeHour?.icon
                        ? getIconSrc(segment.representativeHour.icon)
                        : null;
                      return (
                        <div className="segment-card" key={segment.id}>
                          <div className="segment-title">{segment.label}</div>
                          {iconSrc ? <img src={iconSrc} alt="segment icon" /> : <div className="icon-placeholder" />}
                          <div className="segment-sub day-metric-line">
                            <span className="temp-high">{formatTemp(segment.maxTemp, units)}</span>
                            <span className="temp-low">{formatTemp(segment.minTemp, units)}</span>
                          </div>
                          <div className="segment-metric day-metric-line">{formatSnow(segment.snowTotal, units)}</div>
                          <div className="segment-sub day-metric-line">Wind {formatWind(segment.avgWindspeed, units)}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="day-modal-empty">No segment data available.</div>
                )}
              </div>
            </div>
          ) : null}

          {hourlyModalOpen ? (
            <div className="day-modal-overlay" role="presentation" onClick={() => setHourlyModalOpen(false)}>
              <div className="day-modal" role="dialog" aria-modal="true">
                <div className="day-modal-header">
                  <div>
                    <div className="modal-nav">
                      <button
                        type="button"
                        className="ghost nav-arrow"
                        onClick={(event) => handleHourlyShift(-1, event)}
                        disabled={!hourlyModalDate || !isDayVisible(shiftDateByDay(hourlyModalDate, -1))}
                        aria-label="Previous day"
                      >
                        ‹
                      </button>
                      <h2>
                        {hourlyModalDate
                          ? hourlyModalDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
                          : 'Hourly details'}
                      </h2>
                      <button
                        type="button"
                        className="ghost nav-arrow"
                        onClick={(event) => handleHourlyShift(1, event)}
                        disabled={!hourlyModalDate || !isDayVisible(shiftDateByDay(hourlyModalDate, 1))}
                        aria-label="Next day"
                      >
                        ›
                      </button>
                    </div>
                    <p>{hourlyModalDate ? formatWeekday(hourlyModalDate) : ''}</p>
                  </div>
                  <button type="button" className="ghost" onClick={() => setHourlyModalOpen(false)} aria-label="Close hourly details">
                    ✕
                  </button>
                </div>
                {hourlyModalLoading ? (
                  <div className="day-modal-loading">Loading hourly…</div>
                ) : hourlyModalData.length ? (
                  <div className="hourly-forecast">
                    {(() => {
                      const hours = hourlyModalData;
                      const maxSnow = Math.max(...hours.map((hour) => hour.snow || 0), 6);
                      const { minGrid, gridRange } = getTempScale(hours);
                      const chartHeight = 140;
                      const plotTop = 10;
                      const plotBottom = chartHeight - 16;
                      const plotHeight = plotBottom - plotTop;

                      return (
                        <div className="hourly-table">
                          <div className="hourly-labels">
                            <div className="row-label">Time</div>
                            <div className="row-label">Sky</div>
                            <div className="row-label">Chart</div>
                            <div className="row-label">Precip ({units === 'metric' ? 'cm' : 'in'})</div>
                            <div className="row-label">Type</div>
                            <div className="row-label">Wind ({units === 'imperial' ? 'mph' : 'km/h'})</div>
                          </div>
                          <div className="hourly-scroll">
                            <div className="hourly-scroll-inner" style={{ '--hour-count': hours.length }}>
                              <div className="hourly-row time-row">
                                {hours.map((hour) => {
                                  const time = new Date(hour.dateTimeEpoch).toLocaleTimeString(undefined, { hour: 'numeric' });
                                  return (
                                    <div key={`time-${hour.dateTimeEpoch}`} className="row-cell">
                                      {time}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="hourly-row icon-row">
                                {hours.map((hour) => {
                                  const iconSrc = hour.icon ? getIconSrc(hour.icon) : null;
                                  return (
                                    <div key={`icon-${hour.dateTimeEpoch}`} className="row-cell icon-cell">
                                      {iconSrc ? <img src={iconSrc} alt="hour icon" /> : <div className="icon-placeholder" />}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="hourly-row chart-row">
                                <div className="chart-cells" ref={hourlyChartRef}>
                                  {hours.map((hour) => {
                                    const snowRatio = (hour.snow || 0) / maxSnow;
                                    const tempValue = hour.temp ?? minGrid;
                                    const tempRatio = (tempValue - minGrid) / gridRange;
                                    const tempY = plotTop + (1 - tempRatio) * plotHeight;
                                    return (
                                      <div key={`snow-${hour.dateTimeEpoch}`} className="chart-cell">
                                        <div className="snow-bar" style={{ height: `${snowRatio * 100}%` }} />
                                        <div className="temp-label" style={{ top: `${tempY}px` }}>
                                          {formatTemp(hour.temp, units)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  <canvas ref={hourlyCanvasRef} className="temp-line-canvas" />
                                </div>
                              </div>

                              <div className="hourly-row precip-row">
                                {hours.map((hour) => (
                                  <div key={`precip-${hour.dateTimeEpoch}`} className="row-cell">
                                    {formatPrecipValue(hour.precip, units)}
                                  </div>
                                ))}
                              </div>

                              <div className="hourly-row precip-type-row">
                                {hours.map((hour) => {
                                  const type = Array.isArray(hour.precipType) ? hour.precipType[0] : hour.precipType;
                                  return (
                                    <div key={`ptype-${hour.dateTimeEpoch}`} className="row-cell">
                                      {type || '--'}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="hourly-row wind-row">
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
                  <div className="day-modal-empty">No hourly data available.</div>
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
                      const hasOverview = Boolean(overview);
                      const isToday = differenceInDays(date, today) === 0;
                      const visibleOverview = hasAccess ? overview : null;
                      const lockedLabel = isSignedIn ? 'Upgrade' : 'Sign-In';
                      const snowAmount = Number(visibleOverview?.snowTotal ?? 0);
                      const isPowDay = hasAccess && hasOverview && snowAmount >= 6;
                      const isSnowDay = hasAccess && hasOverview && snowAmount >= 3;
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
                          className={`day-tile ${hasAccess ? 'active' : 'inactive'} ${isToday ? 'today' : ''} ${isSnowDay ? 'snow-day' : ''} ${isPowDay ? 'pow-day' : ''}`}
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
                                  <span className="day-metric-line">
                                    <span className="temp-high temp-value-desktop">{formatTemp(visibleOverview?.maxTemp, units)}</span>
                                    <span className="temp-high temp-value-mobile">{formatTempValue(visibleOverview?.maxTemp, units)}</span>
                                    <span className="temp-low temp-value-desktop">{formatTemp(visibleOverview?.minTemp, units)}</span>
                                    <span className="temp-low temp-value-mobile">{formatTempValue(visibleOverview?.minTemp, units)}</span>
                                  </span>
                                  <span className="day-metric-line metric-secondary">
                                    {hasAccess ? formatWind(visibleOverview?.avgWindspeed, units) : ''}
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
          {activeView === 'profile' ? (
            <div className="profile-page">
              <div className="profile-card">
                <div className="profile-header">
                  <h2>Profile</h2>
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
                      <span className="profile-label">Subscription</span>
                      <span>{(user?.roles || []).join(', ') || '-'}</span>
                    </div>
                    <div className="profile-row">
                      <span className="profile-label">Home resort</span>
                      <select
                        className="profile-select"
                        value={homeResortId}
                        onChange={handleHomeResortChange}
                      >
                        <option value="">Not set</option>
                        {orderedLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
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
                  </div>
                ) : (
                  <div className="profile-empty">
                    <p>Please sign in to view your profile.</p>
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
                        <button type="button" className="profile-action" onClick={handleCheckPow}>
                          Check Pow Now
                        </button>
                      </div>
                      {powAlertsStatus ? <div className="profile-alerts-status">{powAlertsStatus}</div> : null}
                      {powAlertCheckResult ? <div className="profile-alerts-status">{powAlertCheckResult}</div> : null}
                      {powAlertsLoading ? (
                        <div className="profile-alerts-status">Loading alerts…</div>
                      ) : (
                        <div className="profile-alerts-table">
                          <form className="alert-form alert-row alert-form-row" onSubmit={handleCreatePowAlert}>
                            <select
                              value={newAlert.locationId}
                              onChange={(event) => setNewAlert((prev) => ({ ...prev, locationId: event.target.value }))}
                              required
                            >
                              <option value="">Select resort</option>
                              {orderedLocations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name}
                                </option>
                              ))}
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
                            <button type="submit">Add Alert</button>
                          </form>
                          <div className="alert-row alert-row-header">
                            <span>Resort</span>
                            <span>Window</span>
                            <span>Threshold</span>
                            <span>Active</span>
                          </div>
                          {powAlerts.map((alert) => (
                            <div className="alert-row" key={alert.id}>
                              <span>{alert.locationName || 'Resort'}</span>
                              <span>{alert.windowDays} days</span>
                              <span>
                                {fromInches(alert.thresholdIn, units).toFixed(1)} {units === 'metric' ? 'cm' : 'in'}
                              </span>
                              <div className="alert-actions">
                                <label className="toggle">
                                  <input
                                    type="checkbox"
                                    checked={alert.active}
                                    onChange={() => handleToggleAlert(alert)}
                                  />
                                  <span />
                                </label>
                                <button
                                  type="button"
                                  className="ghost alert-delete"
                                  onClick={() => handleDeleteAlert(alert.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
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
            {authMessage ? <div className="modal-message">{authMessage}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;

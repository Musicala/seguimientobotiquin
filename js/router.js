import { APP_CONFIG } from "./config.js";

/* ======================================
   CONFIG DE RUTAS
====================================== */

export const ROUTES = Object.freeze({
  DASHBOARD: "dashboard",
  BOTIQUINES: "botiquines",
  INVENTARIO: "inventario",
  INSPECCIONES: "inspecciones",
  REPOSICIONES: "reposiciones",
  ALERTAS: "alertas",
  PEDIDO: "pedido"
});

export const DEFAULT_ROUTE = ROUTES.DASHBOARD;

export const ROUTE_META = Object.freeze({
  [ROUTES.DASHBOARD]: {
    key: ROUTES.DASHBOARD,
    pageTitle: APP_CONFIG.labels?.dashboard || "Dashboard",
    viewTitle: "Panel principal"
  },
  [ROUTES.BOTIQUINES]: {
    key: ROUTES.BOTIQUINES,
    pageTitle: APP_CONFIG.labels?.botiquines || "Botiquines",
    viewTitle: "Listado general de botiquines"
  },
  [ROUTES.INVENTARIO]: {
    key: ROUTES.INVENTARIO,
    pageTitle: APP_CONFIG.labels?.inventario || "Inventario",
    viewTitle: "Estado de existencias y vencimientos"
  },
  [ROUTES.INSPECCIONES]: {
    key: ROUTES.INSPECCIONES,
    pageTitle: APP_CONFIG.labels?.inspecciones || "Inspecciones",
    viewTitle: "Registro e historial de inspecciones"
  },
  [ROUTES.REPOSICIONES]: {
    key: ROUTES.REPOSICIONES,
    pageTitle: APP_CONFIG.labels?.reposiciones || "Reposiciones",
    viewTitle: "Registro e historial de reposiciones"
  },
  [ROUTES.ALERTAS]: {
    key: ROUTES.ALERTAS,
    pageTitle: APP_CONFIG.labels?.alertas || "Alertas",
    viewTitle: "Elementos críticos y pendientes"
  },
  [ROUTES.PEDIDO]: {
    key: ROUTES.PEDIDO,
    pageTitle: APP_CONFIG.labels?.pedido || "Pedido",
    viewTitle: "Pedido consolidado para proveedor"
  }
});

const VALID_ROUTES = new Set(Object.keys(ROUTE_META));

/* ======================================
   HELPERS INTERNOS
====================================== */

function normalizeRoute(route) {
  return String(route || "")
    .trim()
    .toLowerCase();
}

function normalizeHash(hash = window.location.hash) {
  return String(hash || "")
    .replace(/^#/, "")
    .trim();
}

function splitHash(hash = window.location.hash) {
  const cleanHash = normalizeHash(hash);

  if (!cleanHash) {
    return {
      route: DEFAULT_ROUTE,
      searchParams: new URLSearchParams()
    };
  }

  const [rawRoute = "", rawQuery = ""] = cleanHash.split("?");
  const route = normalizeRoute(rawRoute);
  const searchParams = new URLSearchParams(rawQuery);

  return {
    route: VALID_ROUTES.has(route) ? route : DEFAULT_ROUTE,
    searchParams
  };
}

function sanitizeParams(params = {}) {
  const clean = {};

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    const stringValue = String(value).trim();
    if (!stringValue) return;

    clean[key] = stringValue;
  });

  return clean;
}

function buildHash(route, params = {}) {
  const safeRoute = VALID_ROUTES.has(normalizeRoute(route))
    ? normalizeRoute(route)
    : DEFAULT_ROUTE;

  const searchParams = new URLSearchParams(sanitizeParams(params));
  const queryString = searchParams.toString();

  return queryString ? `#${safeRoute}?${queryString}` : `#${safeRoute}`;
}

function cloneMeta(route) {
  const baseMeta = ROUTE_META[route] || ROUTE_META[DEFAULT_ROUTE];
  return { ...baseMeta };
}

function sameState(a = {}, b = {}) {
  return (
    a.route === b.route &&
    JSON.stringify(a.params || {}) === JSON.stringify(b.params || {})
  );
}

/* ======================================
   API PÚBLICA SIMPLE
====================================== */

export function isValidRoute(route) {
  return VALID_ROUTES.has(normalizeRoute(route));
}

export function getCurrentRoute() {
  return splitHash().route;
}

export function getCurrentParams() {
  return Object.fromEntries(splitHash().searchParams.entries());
}

export function getCurrentLocationState() {
  const { route, searchParams } = splitHash();
  const params = Object.fromEntries(searchParams.entries());

  return {
    route,
    params,
    hash: buildHash(route, params),
    meta: cloneMeta(route)
  };
}

export function getRouteMeta(route, options = {}) {
  const safeRoute = isValidRoute(route) ? normalizeRoute(route) : DEFAULT_ROUTE;
  const meta = cloneMeta(safeRoute);

  if (safeRoute === ROUTES.BOTIQUINES && options.botiquinNombre) {
    meta.viewTitle = `Detalle de ${options.botiquinNombre}`;
  }

  if (safeRoute === ROUTES.PEDIDO && options.categoria) {
    meta.viewTitle = `Pedido consolidado · ${options.categoria}`;
  }

  return meta;
}

export function navigateTo(route, params = {}, options = {}) {
  const targetHash = buildHash(route, params);
  const replace = Boolean(options.replace);
  const force = Boolean(options.force);

  if (replace) {
    const url = new URL(window.location.href);
    url.hash = targetHash;
    window.history.replaceState(null, "", url);

    if (force) {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    return;
  }

  if (window.location.hash === targetHash) {
    if (force) {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    return;
  }

  window.location.hash = targetHash;
}

export function setRouteParam(key, value, options = {}) {
  if (!key) return;

  const { route, searchParams } = splitHash();

  if (value === undefined || value === null || String(value).trim() === "") {
    searchParams.delete(key);
  } else {
    searchParams.set(key, String(value).trim());
  }

  navigateTo(route, Object.fromEntries(searchParams.entries()), options);
}

export function removeRouteParam(key, options = {}) {
  if (!key) return;

  const { route, searchParams } = splitHash();
  searchParams.delete(key);

  navigateTo(route, Object.fromEntries(searchParams.entries()), options);
}

export function getRouteParam(key, fallback = "") {
  const { searchParams } = splitHash();
  return searchParams.get(key) ?? fallback;
}

/* ======================================
   ROUTER FACTORY
====================================== */

export function createRouter(options = {}) {
  const onChange =
    typeof options.onChange === "function" ? options.onChange : null;

  const beforeEach =
    typeof options.beforeEach === "function" ? options.beforeEach : null;

  const afterEach =
    typeof options.afterEach === "function" ? options.afterEach : null;

  let started = false;
  let current = getCurrentLocationState();
  let isHandling = false;

  async function handleRouteChange() {
    if (isHandling) return current;
    isHandling = true;

    try {
      const nextState = getCurrentLocationState();
      const previousState = { ...current };

      if (beforeEach) {
        await beforeEach(nextState, previousState);
      }

      current = nextState;

      if (onChange) {
        await onChange(nextState, previousState);
      }

      if (afterEach) {
        await afterEach(nextState, previousState);
      }

      return current;
    } catch (error) {
      console.error("[router] Error en cambio de ruta:", error);
      return current;
    } finally {
      isHandling = false;
    }
  }

  function start() {
    if (started) return current;

    started = true;
    current = getCurrentLocationState();

    window.addEventListener("hashchange", handleRouteChange);

    return current;
  }

  function stop() {
    if (!started) return;
    window.removeEventListener("hashchange", handleRouteChange);
    started = false;
  }

  function go(route, params = {}, navOptions = {}) {
    navigateTo(route, params, navOptions);
  }

  function replace(route, params = {}, navOptions = {}) {
    navigateTo(route, params, {
      ...navOptions,
      replace: true
    });
  }

  function refresh() {
    return handleRouteChange();
  }

  function ensure(route, params = {}, navOptions = {}) {
    const nextState = {
      route: isValidRoute(route) ? normalizeRoute(route) : DEFAULT_ROUTE,
      params: sanitizeParams(params)
    };

    if (sameState(current, nextState)) {
      if (navOptions.force) {
        return refresh();
      }
      return current;
    }

    navigateTo(nextState.route, nextState.params, navOptions);
    return nextState;
  }

  function getState() {
    return { ...current, params: { ...(current.params || {}) } };
  }

  return {
    start,
    stop,
    go,
    replace,
    refresh,
    ensure,
    getState,
    getRoute: () => current.route,
    getParams: () => ({ ...(current.params || {}) }),
    getParam: (key, fallback = "") => current.params?.[key] ?? fallback
  };
}
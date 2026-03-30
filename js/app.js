import { hasApiConfigured } from "./config.js";
import { actions } from "./state.js";
import { createRouter, ROUTES } from "./router.js";
import { pingApi } from "./api.js";
import {
  initToastSystem,
  showSuccessToast,
  showErrorToast,
  showWarningToast
} from "./ui/toast.js";
import { initModalSystem } from "./ui/modals.js";

import { initDashboardModule } from "./modules/dashboard.js";
import { initBotiquinesModule } from "./modules/botiquines.js";
import { initInventarioModule } from "./modules/inventario.js";
import { initInspeccionesModule } from "./modules/inspecciones.js";
import { initReposicionesModule } from "./modules/reposiciones.js";
import { initAlertasModule } from "./modules/alertas.js";
import * as pedidoModule from "./modules/pedido.js";

/* ======================================
   DOM
====================================== */

const dom = {
  sidebar: () => document.getElementById("sidebar"),
  sidebarOverlay: () => document.getElementById("sidebarOverlay"),
  sidebarToggle: () => document.getElementById("sidebarToggle"),
  mobileMenuBtn: () => document.getElementById("mobileMenuBtn"),
  pageTitle: () => document.getElementById("pageTitle"),
  viewTitle: () => document.getElementById("viewTitle"),
  viewContainer: () => document.getElementById("viewContainer"),
  connectionStatus: () => document.getElementById("connectionStatus"),
  globalLoader: () => document.getElementById("globalLoader"),
  quickBotiquines: () => document.getElementById("quickBotiquines"),
  refreshDashboardBtn: () => document.getElementById("btnRefreshDashboard"),
  navLinks: () => Array.from(document.querySelectorAll(".nav__link")),

  // KPIs shell superior
  kpiBotiquines: () => document.getElementById("kpiBotiquines"),
  kpiVencidos: () => document.getElementById("kpiVencidos"),
  kpiProximos: () => document.getElementById("kpiProximos"),
  kpiStock: () => document.getElementById("kpiStock")
};

/* ======================================
   CONFIG UI / RUTAS
====================================== */

const ROUTE_META = {
  [ROUTES.DASHBOARD]: {
    page: "Dashboard",
    view: "Panel principal",
    module: initDashboardModule
  },
  [ROUTES.BOTIQUINES]: {
    page: "Botiquines",
    view: "Listado general de botiquines",
    module: initBotiquinesModule
  },
  [ROUTES.INVENTARIO]: {
    page: "Inventario",
    view: "Estado de existencias y vencimientos",
    module: initInventarioModule
  },
  [ROUTES.INSPECCIONES]: {
    page: "Inspecciones",
    view: "Registro e historial de inspecciones",
    module: initInspeccionesModule
  },
  [ROUTES.REPOSICIONES]: {
    page: "Reposiciones",
    view: "Registro e historial de reposiciones",
    module: initReposicionesModule
  },
  [ROUTES.ALERTAS]: {
    page: "Alertas",
    view: "Elementos críticos y pendientes",
    module: initAlertasModule
  },
  [ROUTES.PEDIDO]: {
    page: "Pedido",
    view: "Pedido consolidado para impresión y cotización",
    module: resolvePedidoInitializer()
  }
};

function getRouteMeta(route) {
  return ROUTE_META[route] || ROUTE_META[ROUTES.DASHBOARD];
}

function resolvePedidoInitializer() {
  const candidates = [
    pedidoModule?.initPedidoModule,
    pedidoModule?.initPedidoView,
    pedidoModule?.default?.init,
    pedidoModule?.default?.mount,
    pedidoModule?.default?.render
  ];

  const initializer = candidates.find((candidate) => typeof candidate === "function");

  if (initializer) {
    return initializer;
  }

  return async ({ container }) => {
    if (!(container instanceof HTMLElement)) return;

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🧾</div>
        <div class="empty-state__content">
          <h3 class="empty-state__title">La vista de pedido aún no está conectada</h3>
          <p class="empty-state__text">
            El archivo <strong>js/modules/pedido.js</strong> existe, pero no expone
            una función de inicialización compatible.
          </p>
        </div>
      </div>
    `;
  };
}

/* ======================================
   ESTADO INTERNO APP
====================================== */

const appState = {
  isBooting: true,
  apiReady: false,
  currentRoute: ROUTES.DASHBOARD,
  previousRoute: null,
  currentCleanup: null,
  renderToken: 0,
  latestDashboardSummary: null
};

/* ======================================
   ROUTER
====================================== */

const router = createRouter({
  onChange: async ({ route }) => {
    await handleRouteChange(route);
  }
});

/* ======================================
   INIT
====================================== */

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  initToastSystem();
  initModalSystem();
  bindUI();
  bindAppEvents();

  const { route } = router.start();
  const initialRoute = normalizeRoute(route);

  setCurrentRoute(initialRoute);
  syncShellUI(initialRoute);
  resetShellKpis();
  updateConnectionStatus("loading", "Conectando...");

  if (!hasApiConfigured()) {
    appState.apiReady = false;
    appState.isBooting = false;

    updateConnectionStatus("error", "API no configurada");
    renderApiNotConfigured();

    showWarningToast({
      message: "Configura la URL del Apps Script en js/config.js para conectar el sistema."
    });
    return;
  }

  try {
    showGlobalLoader();

    await pingApi();

    appState.apiReady = true;
    updateConnectionStatus("online", "Conectado");

    await renderCurrentRoute({
      forceRender: true,
      syncShellKpisAfterRender: initialRoute === ROUTES.DASHBOARD
    });
  } catch (error) {
    appState.apiReady = false;
    console.error("[app] Error al iniciar:", error);

    updateConnectionStatus("error", "Error de conexión");
    renderConnectionError(error);

    showErrorToast({
      message: error?.message || "No se pudo conectar con la API."
    });
  } finally {
    appState.isBooting = false;
    hideGlobalLoader();
  }
}

/* ======================================
   FLUJO DE RUTAS
====================================== */

async function handleRouteChange(route) {
  const normalizedRoute = normalizeRoute(route);
  const routeChanged = normalizedRoute !== appState.currentRoute;

  if (routeChanged) {
    appState.previousRoute = appState.currentRoute;
  }

  setCurrentRoute(normalizedRoute);
  syncShellUI(normalizedRoute);
  closeSidebar();

  if (!appState.apiReady) {
    return;
  }

  try {
    showGlobalLoader();

    await renderCurrentRoute({
      forceRender: true,
      syncShellKpisAfterRender: normalizedRoute === ROUTES.DASHBOARD
    });
  } catch (error) {
    console.error("[app] Error al cambiar ruta:", error);
    renderGenericError(error);

    showErrorToast({
      message: error?.message || "No se pudo cargar la vista."
    });
  } finally {
    hideGlobalLoader();
  }
}

async function renderCurrentRoute(options = {}) {
  const {
    forceRender = true,
    syncShellKpisAfterRender = false
  } = options;

  const route = normalizeRoute(appState.currentRoute);
  const container = dom.viewContainer();

  if (!container) {
    console.warn("[app] No se encontró #viewContainer.");
    return;
  }

  const { module: initModule } = getRouteMeta(route);

  if (typeof initModule !== "function") {
    throw new Error(`La ruta "${route}" no tiene un módulo válido.`);
  }

  await cleanupCurrentView();

  const currentToken = ++appState.renderToken;

  const maybeCleanup = await initModule({
    container,
    forceRender,
    route
  });

  if (currentToken !== appState.renderToken) {
    return;
  }

  appState.currentCleanup =
    typeof maybeCleanup === "function"
      ? maybeCleanup
      : null;

  updateTitles(route);

  if (syncShellKpisAfterRender) {
    queueMicrotask(() => {
      syncShellDashboardSummaryFromDOM();
    });
  }
}

async function cleanupCurrentView() {
  if (typeof appState.currentCleanup === "function") {
    try {
      await appState.currentCleanup();
    } catch (error) {
      console.warn("[app] Error al limpiar la vista previa:", error);
    }
  }

  appState.currentCleanup = null;
}

function setCurrentRoute(route) {
  const normalizedRoute = normalizeRoute(route);
  appState.currentRoute = normalizedRoute;
  syncRouteToStore(normalizedRoute);
}

function syncRouteToStore(route) {
  if (typeof actions?.setRoute === "function") {
    actions.setRoute(route);
  }
}

function navigateTo(route, { forceRender = false } = {}) {
  const normalizedRoute = normalizeRoute(route);
  const targetHash = `#${normalizedRoute}`;

  if (location.hash !== targetHash) {
    location.hash = targetHash;
    return;
  }

  setCurrentRoute(normalizedRoute);
  syncShellUI(normalizedRoute);

  if (forceRender && appState.apiReady) {
    handleRouteChange(normalizedRoute);
  }
}

/* ======================================
   UI BINDINGS
====================================== */

function bindUI() {
  dom.mobileMenuBtn()?.addEventListener("click", toggleSidebar);
  dom.sidebarToggle()?.addEventListener("click", closeSidebar);
  dom.sidebarOverlay()?.addEventListener("click", closeSidebar);

  dom.navLinks().forEach((link) => {
    link.addEventListener("click", handleNavLinkClick);
  });

  dom.quickBotiquines()?.addEventListener("click", handleQuickBotiquinClick);
  dom.refreshDashboardBtn()?.addEventListener("click", handleDashboardRefresh);

  document.addEventListener("click", handleDelegatedRouteClick);

  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("resize", handleWindowResize);
}

function bindAppEvents() {
  /**
   * dashboard.js puede publicar el resumen así:
   * window.dispatchEvent(new CustomEvent("dashboard:summary", { detail: {...} }));
   */
  window.addEventListener("dashboard:summary", handleDashboardSummaryEvent);
}

function handleNavLinkClick(event) {
  const link = event.currentTarget;
  const route = extractRouteFromElement(link);

  if (!route) {
    closeSidebar();
    return;
  }

  event.preventDefault();
  navigateTo(route);
  closeSidebar();
}

function handleDelegatedRouteClick(event) {
  const trigger = event.target.closest("[data-route], [href^='#']");
  if (!trigger) return;

  const route = extractRouteFromElement(trigger);
  if (!route) return;

  // Evita secuestrar cualquier hash raro que no sea una ruta válida
  if (!ROUTE_META[route]) return;

  event.preventDefault();
  navigateTo(route);
}

function extractRouteFromElement(element) {
  if (!(element instanceof HTMLElement)) return null;

  const datasetRoute = element.dataset?.route;
  if (datasetRoute && ROUTE_META[datasetRoute]) {
    return datasetRoute;
  }

  const href = element.getAttribute("href");
  if (href && href.startsWith("#")) {
    const hashRoute = href.slice(1).trim();
    if (ROUTE_META[hashRoute]) {
      return hashRoute;
    }
  }

  return null;
}

function handleDashboardSummaryEvent(event) {
  const summary = normalizeDashboardSummary(event?.detail);
  if (!summary) return;

  appState.latestDashboardSummary = summary;
  renderShellKpis(summary);
}

function handleQuickBotiquinClick(event) {
  const trigger = event.target.closest("[data-botiquin]");
  if (!trigger) return;

  const { botiquin } = trigger.dataset;
  if (!botiquin) return;

  if (typeof actions?.setSelectedBotiquin === "function") {
    actions.setSelectedBotiquin(botiquin);
  }

  navigateTo(ROUTES.BOTIQUINES, { forceRender: true });
  closeSidebar();
}

async function handleDashboardRefresh() {
  if (!appState.apiReady) {
    showWarningToast({
      message: "La API no está disponible todavía."
    });
    return;
  }

  try {
    showGlobalLoader();

    if (appState.currentRoute !== ROUTES.DASHBOARD) {
      navigateTo(ROUTES.DASHBOARD);
      return;
    }

    await renderCurrentRoute({
      forceRender: true,
      syncShellKpisAfterRender: true
    });

    showSuccessToast({
      message: "Datos actualizados."
    });
  } catch (error) {
    console.error("[app] Error al actualizar dashboard:", error);
    showErrorToast({
      message: error?.message || "No se pudieron actualizar los datos."
    });
  } finally {
    hideGlobalLoader();
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    closeSidebar();
  }
}

function handleWindowResize() {
  if (window.innerWidth > 960) {
    closeSidebar();
  }
}

/* ======================================
   NAV / TÍTULOS / SHELL
====================================== */

function syncShellUI(route) {
  const normalizedRoute = normalizeRoute(route);

  updateActiveNav(normalizedRoute);
  updateTitles(normalizedRoute);

  if (normalizedRoute !== ROUTES.DASHBOARD && !appState.latestDashboardSummary) {
    resetShellKpis();
  }
}

function updateActiveNav(route) {
  dom.navLinks().forEach((link) => {
    const linkRoute = extractRouteFromElement(link);
    const isActive = linkRoute === route;

    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function updateTitles(route) {
  const { page, view } = getRouteMeta(route);
  const pageTitle = dom.pageTitle();
  const viewTitle = dom.viewTitle();

  if (pageTitle) {
    pageTitle.textContent = page;
    document.title = `${page} | Seguimiento de Botiquines`;
  }

  if (viewTitle) {
    viewTitle.textContent = view;
  }
}

function normalizeRoute(route) {
  return ROUTE_META[route] ? route : ROUTES.DASHBOARD;
}

/* ======================================
   KPI SHELL SUPERIOR
====================================== */

function resetShellKpis() {
  setKpiValue(dom.kpiBotiquines(), "--");
  setKpiValue(dom.kpiVencidos(), "--");
  setKpiValue(dom.kpiProximos(), "--");
  setKpiValue(dom.kpiStock(), "--");
}

function renderShellKpis(summary) {
  const normalized = normalizeDashboardSummary(summary);
  if (!normalized) {
    resetShellKpis();
    return;
  }

  appState.latestDashboardSummary = normalized;

  setKpiValue(dom.kpiBotiquines(), formatCompactNumber(normalized.botiquinesActivos));
  setKpiValue(dom.kpiVencidos(), formatCompactNumber(normalized.elementosVencidos));
  setKpiValue(dom.kpiProximos(), formatCompactNumber(normalized.proximosAVencer));
  setKpiValue(dom.kpiStock(), formatCompactNumber(normalized.bajoStock));
}

function syncShellDashboardSummaryFromDOM() {
  const container = dom.viewContainer();
  if (!container) return;

  const root = container.querySelector("[data-dashboard-summary]");
  if (root) {
    const summary = normalizeDashboardSummary({
      botiquinesActivos: root.dataset.botiquinesActivos,
      elementosVencidos: root.dataset.elementosVencidos,
      proximosAVencer: root.dataset.proximosAVencer,
      bajoStock: root.dataset.bajoStock
    });

    if (summary) {
      renderShellKpis(summary);
      return;
    }
  }

  const summary = {
    botiquinesActivos: readNumberFromSelectors(container, [
      '[data-kpi="botiquines-activos"]',
      "#dashboardBotiquinesActivos",
      "#statBotiquinesActivos"
    ]),
    elementosVencidos: readNumberFromSelectors(container, [
      '[data-kpi="elementos-vencidos"]',
      "#dashboardElementosVencidos",
      "#statElementosVencidos"
    ]),
    proximosAVencer: readNumberFromSelectors(container, [
      '[data-kpi="proximos-a-vencer"]',
      "#dashboardProximosAVencer",
      "#statProximosAVencer"
    ]),
    bajoStock: readNumberFromSelectors(container, [
      '[data-kpi="bajo-stock"]',
      "#dashboardBajoStock",
      "#statBajoStock"
    ])
  };

  const normalized = normalizeDashboardSummary(summary);
  if (normalized) {
    renderShellKpis(normalized);
  }
}

function normalizeDashboardSummary(summary) {
  if (!summary || typeof summary !== "object") return null;

  const normalized = {
    botiquinesActivos: toSafeNumber(
      summary.botiquinesActivos ??
        summary.total_botiquines ??
        summary.botiquines ??
        summary.totalBotiquines,
      null
    ),
    elementosVencidos: toSafeNumber(
      summary.elementosVencidos ??
        summary.vencidos ??
        summary.total_vencidos ??
        summary.totalVencidos,
      null
    ),
    proximosAVencer: toSafeNumber(
      summary.proximosAVencer ??
        summary.proximos_a_vencer ??
        summary.proximos ??
        summary.totalProximos,
      null
    ),
    bajoStock: toSafeNumber(
      summary.bajoStock ??
        summary.bajo_stock ??
        summary.faltantes ??
        summary.stock_bajo ??
        summary.totalBajoStock,
      null
    )
  };

  const hasAtLeastOneValue = Object.values(normalized).some(
    (value) => Number.isFinite(value) && value >= 0
  );

  if (!hasAtLeastOneValue) {
    return null;
  }

  return {
    botiquinesActivos: normalized.botiquinesActivos ?? 0,
    elementosVencidos: normalized.elementosVencidos ?? 0,
    proximosAVencer: normalized.proximosAVencer ?? 0,
    bajoStock: normalized.bajoStock ?? 0
  };
}

function setKpiValue(element, value) {
  if (!element) return;
  element.textContent = value;
}

function readNumberFromSelectors(scope, selectors = []) {
  for (const selector of selectors) {
    const node = scope.querySelector(selector);
    if (!node) continue;

    const value =
      node.dataset?.value ??
      node.getAttribute("data-value") ??
      node.textContent;

    const parsed = toSafeNumber(value, null);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

/* ======================================
   SIDEBAR
====================================== */

function toggleSidebar() {
  const sidebar = dom.sidebar();
  const overlay = dom.sidebarOverlay();

  if (!sidebar || !overlay) return;

  const willOpen = !sidebar.classList.contains("is-open");
  sidebar.classList.toggle("is-open", willOpen);
  overlay.classList.toggle("is-visible", willOpen);
}

function openSidebar() {
  dom.sidebar()?.classList.add("is-open");
  dom.sidebarOverlay()?.classList.add("is-visible");
}

function closeSidebar() {
  dom.sidebar()?.classList.remove("is-open");
  dom.sidebarOverlay()?.classList.remove("is-visible");
}

/* ======================================
   LOADER GLOBAL
====================================== */

function showGlobalLoader() {
  const loader = dom.globalLoader();
  if (!loader) return;

  loader.classList.remove("is-hidden");
  loader.setAttribute("aria-hidden", "false");
}

function hideGlobalLoader() {
  const loader = dom.globalLoader();
  if (!loader) return;

  loader.classList.add("is-hidden");
  loader.setAttribute("aria-hidden", "true");
}

/* ======================================
   CONNECTION STATUS
====================================== */

function updateConnectionStatus(status, text) {
  const chip = dom.connectionStatus();
  if (!chip) return;

  chip.classList.remove("is-online", "is-error", "is-loading");

  if (status === "online") chip.classList.add("is-online");
  if (status === "error") chip.classList.add("is-error");
  if (status === "loading") chip.classList.add("is-loading");

  const textEl = chip.querySelector(".status-chip__text");
  if (textEl) {
    textEl.textContent = text;
  }
}

/* ======================================
   ESTADOS DE ERROR / VACÍO
====================================== */

function renderApiNotConfigured() {
  const container = dom.viewContainer();
  if (!container) return;

  resetShellKpis();

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">🔌</div>
      <div class="empty-state__content">
        <h3 class="empty-state__title">Falta configurar la API</h3>
        <p class="empty-state__text">
          Pega la URL del Web App de Apps Script en <strong>js/config.js</strong>.
        </p>
      </div>
    </div>
  `;
}

function renderConnectionError(error) {
  const container = dom.viewContainer();
  if (!container) return;

  resetShellKpis();

  const safeMessage = escapeHtml(
    String(error?.message || "Hay un problema de conexión con el backend.")
  );

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">🌐</div>
      <div class="empty-state__content">
        <h3 class="empty-state__title">No se pudo conectar con la API</h3>
        <p class="empty-state__text">${safeMessage}</p>
      </div>
    </div>
  `;
}

function renderGenericError(error) {
  const container = dom.viewContainer();
  if (!container) return;

  const safeMessage = escapeHtml(
    String(error?.message || "Ocurrió un error inesperado al cargar la vista.")
  );

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">💥</div>
      <div class="empty-state__content">
        <h3 class="empty-state__title">Algo salió mal</h3>
        <p class="empty-state__text">${safeMessage}</p>
      </div>
    </div>
  `;
}

/* ======================================
   HELPERS
====================================== */

function toSafeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCompactNumber(value) {
  const safe = toSafeNumber(value, 0);
  return new Intl.NumberFormat("es-CO").format(safe);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
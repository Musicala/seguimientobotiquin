import { store, selectors, actions } from "../state.js";

import {
  getBotiquines,
  getInventario,
  getInspecciones,
  getReposiciones,
  getAlertas
} from "../api.js";

import { navigateTo } from "../router.js";

import {
  qs,
  setHTML,
  ensureArray,
  normalizeText,
  escapeHTML,
  formatDate,
  formatDateTime,
  formatExpiryText,
  getExpiryStatus,
  toNumber
} from "../utils.js";

/* ======================================
   CONFIG DEL MÓDULO
====================================== */

const MODULE_ID = "dashboard-module";
const INSPECCION_OVERDUE_DAYS = 30;

const moduleState = {
  initialized: false,
  mounted: false,
  container: null,
  unsubscribe: null,
  boundEvents: false,
  lastRenderSignature: ""
};

/* ======================================
   API PÚBLICA
====================================== */

export async function initDashboardModule(options = {}) {
  const { container, forceRender = false } = options;

  if (!(container instanceof HTMLElement)) {
    throw new Error("[dashboard] initDashboardModule requiere un container válido.");
  }

  moduleState.container = container;

  if (!moduleState.initialized) {
    moduleState.unsubscribe = store.subscribe(handleStoreChange);
    moduleState.initialized = true;
  }

  if (!moduleState.boundEvents) {
    bindDashboardEvents();
    moduleState.boundEvents = true;
  }

  await syncDashboardModuleData();

  if (forceRender || isDashboardRoute()) {
    renderDashboardView();
  }

  moduleState.mounted = true;
}

export function renderDashboardView() {
  if (!moduleState.container) return;

  const state = store.getState();
  const viewModel = getDashboardViewModel(state);
  const signature = createRenderSignature(viewModel);

  if (!moduleState.mounted || moduleState.lastRenderSignature !== signature) {
    setHTML(moduleState.container, createDashboardTemplate(viewModel));
    hydrateDashboardUI(moduleState.container, viewModel);
    publishDashboardSummary(viewModel);
    moduleState.lastRenderSignature = signature;
  } else {
    publishDashboardSummary(viewModel);
  }
}

export async function syncDashboardModuleData(options = {}) {
  const { force = false } = options;
  const state = store.getState();

  const currentBotiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));
  const currentInventario = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  const currentInspecciones = normalizeInspecciones(ensureArray(selectors.inspecciones?.(state)));
  const currentReposiciones = normalizeReposiciones(ensureArray(selectors.reposiciones?.(state)));
  const currentAlertas = ensureArray(selectors.alertas?.(state));

  const needBotiquines = force || !currentBotiquines.length;
  const needInventario = force || !currentInventario.length;
  const needInspecciones = force || !currentInspecciones.length;
  const needReposiciones = force || !currentReposiciones.length;
  const needAlertas = force || !currentAlertas.length;

  if (!needBotiquines && !needInventario && !needInspecciones && !needReposiciones && !needAlertas) {
    return {
      botiquines: currentBotiquines,
      inventario: currentInventario,
      inspecciones: currentInspecciones,
      reposiciones: currentReposiciones,
      alertas: currentAlertas
    };
  }

  setGlobalLoading(true, "Cargando dashboard...");

  try {
    const [
      botiquinesResponse,
      inventarioResponse,
      inspeccionesResponse,
      reposicionesResponse,
      alertasResponse
    ] = await Promise.all([
      needBotiquines ? getBotiquines() : currentBotiquines,
      needInventario ? getInventario() : currentInventario,
      needInspecciones ? getInspecciones() : currentInspecciones,
      needReposiciones ? getReposiciones() : currentReposiciones,
      needAlertas && typeof getAlertas === "function" ? getAlertas() : currentAlertas
    ]);

    const botiquines = needBotiquines
      ? normalizeBotiquines(botiquinesResponse)
      : currentBotiquines;

    const inventario = needInventario
      ? normalizeInventario(inventarioResponse)
      : currentInventario;

    const inspecciones = needInspecciones
      ? normalizeInspecciones(inspeccionesResponse)
      : currentInspecciones;

    const reposiciones = needReposiciones
      ? normalizeReposiciones(reposicionesResponse)
      : currentReposiciones;

    const alertas = needAlertas
      ? normalizeAlertas(ensureArray(alertasResponse))
      : currentAlertas;

    if (needBotiquines && typeof actions.setBotiquines === "function") {
      actions.setBotiquines(botiquines);
    }

    if (needInventario && typeof actions.setInventario === "function") {
      actions.setInventario(inventario);
    }

    if (needInspecciones && typeof actions.setInspecciones === "function") {
      actions.setInspecciones(inspecciones);
    }

    if (needReposiciones && typeof actions.setReposiciones === "function") {
      actions.setReposiciones(reposiciones);
    }

    if (needAlertas && typeof actions.setAlertas === "function") {
      actions.setAlertas(alertas);
    }

    if (typeof actions.setLastSync === "function") {
      actions.setLastSync(new Date().toISOString());
    }

    clearStoreError();

    return {
      botiquines,
      inventario,
      inspecciones,
      reposiciones,
      alertas
    };
  } catch (error) {
    console.error("[dashboard] Error cargando datos:", error);
    setStoreError(error);
    throw error;
  } finally {
    setGlobalLoading(false);
  }
}

export function destroyDashboardModule() {
  if (typeof moduleState.unsubscribe === "function") {
    moduleState.unsubscribe();
  }

  unbindDashboardEvents();

  moduleState.initialized = false;
  moduleState.mounted = false;
  moduleState.boundEvents = false;
  moduleState.container = null;
  moduleState.unsubscribe = null;
  moduleState.lastRenderSignature = "";
}

/* ======================================
   STORE / REACTIVIDAD
====================================== */

function handleStoreChange(payload) {
  const state = payload?.state || store.getState();

  if (!isDashboardRoute()) return;
  if (!moduleState.container) return;

  const viewModel = getDashboardViewModel(state);
  const nextSignature = createRenderSignature(viewModel);

  if (nextSignature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createDashboardTemplate(viewModel));
    hydrateDashboardUI(moduleState.container, viewModel);
    publishDashboardSummary(viewModel);
    moduleState.lastRenderSignature = nextSignature;
  } else {
    publishDashboardSummary(viewModel);
  }
}

function isDashboardRoute() {
  const state = store.getState();
  const route = selectors.currentRoute?.(state);

  if (route) return route === "dashboard";

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash === "dashboard" || hash === "";
}

/* ======================================
   NORMALIZACIÓN
====================================== */

function normalizeBotiquines(items = []) {
  return ensureArray(items).map((item, index) => ({
    id: String(
      item?.id ||
      item?.id_botiquin ||
      item?.botiquinId ||
      item?.botiquin_id ||
      `BOT-${String(index + 1).padStart(3, "0")}`
    ),

    nombre: String(
      item?.nombre ||
      item?.nombreBotiquin ||
      item?.botiquin ||
      item?.nombre_botiquin ||
      `Botiquín ${index + 1}`
    ),

    sede: String(item?.sede || ""),
    ubicacion: String(item?.ubicacion || ""),
    tipo: String(item?.tipo || ""),
    responsable: String(item?.responsable || ""),

    estado: String(
      item?.estado ||
      item?.estado_botiquin ||
      item?.status ||
      ""
    ),

    fechaUltimaInspeccion: String(
      item?.fechaUltimaInspeccion ||
      item?.ultimaInspeccion ||
      item?.fecha_ultima_inspeccion ||
      item?.ultima_inspeccion ||
      ""
    ),

    updatedAt: String(
      item?.updatedAt ||
      item?.fechaActualizacion ||
      item?.fecha_actualizacion ||
      item?.timestamp ||
      ""
    ),

    raw: item
  }));
}

function normalizeInventario(items = []) {
  return ensureArray(items).map((item, index) => {
    const cantidadActual = Math.max(
      0,
      toNumber(
        item?.cantidad_actual ??
        item?.cantidadActual ??
        item?.cantidad ??
        item?.stock ??
        item?.existencias ??
        0
      )
    );

    const cantidadMinima = Math.max(
      0,
      toNumber(
        item?.cantidad_minima ??
        item?.cantidadMinima ??
        item?.stockMinimo ??
        item?.stock_minimo ??
        item?.minimo ??
        0
      )
    );

    const fechaVencimiento =
      item?.fechaVencimiento ||
      item?.fecha_vencimiento ||
      item?.vence ||
      item?.vencimiento ||
      "";

    const expiry = getSafeExpiryStatus(fechaVencimiento);

    return {
      idRegistro: String(
        item?.id_registro ||
        item?.id ||
        item?.rowId ||
        item?.row_id ||
        `INV-${String(index + 1).padStart(4, "0")}`
      ),

      idItem: String(
        item?.id_item ||
        item?.itemId ||
        item?.item_id ||
        item?.sku ||
        `ITEM-${String(index + 1).padStart(4, "0")}`
      ),

      botiquinId: String(
        item?.botiquinId ||
        item?.id_botiquin ||
        item?.botiquin_id ||
        item?.botiquin ||
        ""
      ),

      nombre: String(
        item?.nombre ||
        item?.elemento ||
        item?.insumo ||
        item?.producto ||
        item?.descripcion ||
        "Elemento"
      ),

      categoria: String(item?.categoria || item?.tipo || ""),
      unidad: String(item?.unidad || ""),
      cantidad: cantidadActual,
      cantidadActual,
      stockMinimo: cantidadMinima,
      cantidadMinima,
      lote: String(item?.lote || ""),
      fechaVencimiento: String(fechaVencimiento || ""),
      ubicacion: String(item?.ubicacion || ""),
      observaciones: String(item?.observaciones || ""),
      activo: normalizeActiveFlag(item?.activo, true),
      expiry,

      estado: String(
        item?.estado ||
        deriveInventoryState({
          cantidadActual,
          cantidadMinima,
          fechaVencimiento
        })
      ),

      updatedAt: String(
        item?.updatedAt ||
        item?.fechaActualizacion ||
        item?.fecha_actualizacion ||
        item?.timestamp ||
        ""
      ),

      raw: item
    };
  });
}

function normalizeInspecciones(items = []) {
  return ensureArray(items).map((item, index) => {
    const detalle = normalizeDetalleInspeccion(
      item?.detalle || item?.items || item?.detalle_items || []
    );

    return {
      id: String(
        item?.id ||
        item?.id_inspeccion ||
        item?.inspeccionId ||
        `INS-${String(index + 1).padStart(3, "0")}`
      ),

      botiquinId: String(
        item?.botiquinId ||
        item?.id_botiquin ||
        item?.botiquin_id ||
        item?.botiquin ||
        ""
      ),

      fecha: String(
        item?.fecha ||
        item?.createdAt ||
        item?.fechaRegistro ||
        item?.fecha_registro ||
        ""
      ),

      estadoGeneral: String(
        item?.estadoGeneral ||
        item?.estado_general ||
        item?.estado ||
        item?.resultado ||
        ""
      ),

      observaciones: String(
        item?.observaciones ||
        item?.comentarios ||
        item?.novedades ||
        item?.observaciones_generales ||
        ""
      ),

      responsable: String(item?.responsable || ""),
      detalle,
      raw: item
    };
  });
}

function normalizeDetalleInspeccion(items = []) {
  return ensureArray(items).map((item, index) => ({
    id: String(
      item?.id ||
      item?.id_detalle ||
      item?.id_registro ||
      `DET-${String(index + 1).padStart(4, "0")}`
    ),
    idItem: String(item?.id_item || item?.itemId || item?.item_id || ""),
    elemento: String(item?.elemento || ""),
    cantidadSistema: Math.max(
      0,
      toNumber(
        item?.cantidad_sistema ??
        item?.cantidadSistema ??
        item?.cantidad_actual_sistema ??
        item?.cantidadActualSistema ??
        0
      )
    ),
    cantidadEncontrada: Math.max(
      0,
      toNumber(
        item?.cantidad_encontrada ??
        item?.cantidadEncontrada ??
        item?.cantidad_actual ??
        item?.cantidadActual ??
        0
      )
    ),
    estadoItem: String(item?.estado_item || item?.estadoItem || item?.estado || ""),
    accionRequerida: String(
      item?.accion_requerida ??
      item?.accionRequerida ??
      item?.accion ??
      ""
    ),
    fechaVencimiento: String(
      item?.fecha_vencimiento ??
      item?.fechaVencimiento ??
      ""
    ),
    observacion: String(item?.observacion ?? item?.observaciones ?? ""),
    raw: item
  }));
}

function normalizeReposiciones(items = []) {
  return ensureArray(items).map((item, index) => ({
    id: String(
      item?.id ||
      item?.id_reposicion ||
      item?.reposicionId ||
      `REP-${String(index + 1).padStart(3, "0")}`
    ),

    botiquinId: String(
      item?.botiquinId ||
      item?.id_botiquin ||
      item?.botiquin_id ||
      item?.botiquin ||
      ""
    ),

    idItem: String(item?.id_item || item?.itemId || item?.item_id || ""),

    inspeccionOrigenId: String(
      item?.id_inspeccion_origen ||
      item?.inspeccionOrigenId ||
      item?.idInspeccionOrigen ||
      ""
    ),

    fecha: String(
      item?.fecha ||
      item?.createdAt ||
      item?.fechaRegistro ||
      item?.fecha_registro ||
      ""
    ),

    estado: String(item?.estado || ""),
    responsable: String(item?.responsable || ""),
    observaciones: String(item?.observaciones || ""),
    motivo: String(item?.motivo || ""),

    cantidadItems: Math.max(
      0,
      toNumber(
        item?.cantidadItems ??
        item?.cantidad_items ??
        item?.items ??
        item?.cantidad_repuesta ??
        item?.cantidadRepuesta ??
        0
      )
    ),

    raw: item
  }));
}

function normalizeAlertas(items = []) {
  return ensureArray(items).map((item, index) => ({
    id: String(item?.id || `ALT-${String(index + 1).padStart(4, "0")}`),
    source: String(item?.source || "system"),
    severity: String(item?.severity || "muted"),
    type: String(item?.type || "general"),
    title: String(item?.title || "Alerta"),
    description: String(item?.description || ""),
    botiquinId: String(item?.botiquinId || ""),
    botiquinNombre: String(item?.botiquinNombre || ""),
    date: String(item?.date || ""),
    meta: item?.meta || {}
  }));
}

function normalizeActiveFlag(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = normalizeText(value ?? "");

  if (["si", "sí", "true", "1", "activo", "activa"].includes(normalized)) return true;
  if (["no", "false", "0", "inactivo", "inactiva"].includes(normalized)) return false;

  return fallback;
}

function deriveInventoryState({
  cantidadActual = 0,
  cantidadMinima = 0,
  fechaVencimiento = ""
}) {
  const expiry = getSafeExpiryStatus(fechaVencimiento);

  if (expiry.isExpired) return "vencido";
  if (cantidadActual <= 0) return "faltante";
  if (cantidadMinima > 0 && cantidadActual <= cantidadMinima) return "bajo stock";
  if (expiry.isNearExpiry) return "próximo a vencer";

  return "ok";
}

/* ======================================
   VIEW MODEL
====================================== */

function getDashboardViewModel(state) {
  const botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));
  const inventario = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  const inspecciones = normalizeInspecciones(ensureArray(selectors.inspecciones?.(state)));
  const reposiciones = normalizeReposiciones(ensureArray(selectors.reposiciones?.(state)));
  const alertas = normalizeAlertas(ensureArray(selectors.alertas?.(state)));
  const lastSync = selectors.lastSync?.(state) || state?.app?.lastSync || "";

  const botiquinesMap = new Map(
    botiquines.map((item) => [String(item.id), item])
  );

  const latestInspeccionByBotiquin = buildLatestInspeccionMap(inspecciones);

  const stats = buildDashboardStats({
    botiquines,
    inventario,
    inspecciones,
    reposiciones,
    alertas,
    latestInspeccionByBotiquin
  });

  const priorityCards = buildPriorityCards(stats);
  const recentAlerts = buildDashboardAlerts({
    alertas,
    inventario,
    inspecciones,
    botiquinesMap
  });

  const recentActivity = buildRecentActivity({
    inspecciones,
    reposiciones,
    botiquinesMap
  });

  const botiquinesResumen = buildBotiquinesResumen({
    botiquines,
    inventario,
    inspecciones,
    latestInspeccionByBotiquin
  });

  const quickActions = [
    {
      id: "qa-botiquines",
      route: "botiquines",
      title: "Botiquines",
      text: "Ver listado y detalle"
    },
    {
      id: "qa-inventario",
      route: "inventario",
      title: "Inventario",
      text: "Stock y vencimientos"
    },
    {
      id: "qa-pedido",
      route: "pedido",
      title: "Pedido",
      text: "Consolidado de faltantes"
    },
    {
      id: "qa-inspecciones",
      route: "inspecciones",
      title: "Inspecciones",
      text: "Revisar hallazgos"
    },
    {
      id: "qa-reposiciones",
      route: "reposiciones",
      title: "Reposiciones",
      text: "Registrar y cerrar pendientes"
    },
    {
      id: "qa-alertas",
      route: "alertas",
      title: "Alertas",
      text: "Ir a prioridades críticas"
    }
  ];

  return {
    stats,
    priorityCards,
    recentAlerts,
    recentActivity,
    botiquinesResumen,
    quickActions,
    lastSync
  };
}

function buildDashboardStats({
  botiquines = [],
  inventario = [],
  inspecciones = [],
  reposiciones = [],
  alertas = [],
  latestInspeccionByBotiquin = new Map()
}) {
  const totalBotiquines = botiquines.length;
  const totalItems = inventario.length;

  const operativos = botiquines.filter((item) =>
    ["operativo", "activo", "ok"].includes(normalizeText(item.estado))
  ).length;

  const vencidos = inventario.filter((item) => item.expiry?.isExpired).length;

  const proximosVencer = inventario.filter((item) => {
    const expiry = item.expiry || getSafeExpiryStatus(item.fechaVencimiento);
    return expiry.isNearExpiry && !expiry.isExpired;
  }).length;

  const bajoStock = inventario.filter((item) => {
    return item.cantidadMinima > 0 && item.cantidadActual > 0 && item.cantidadActual <= item.cantidadMinima;
  }).length;

  const faltantes = inventario.filter((item) => item.cantidadActual <= 0).length;

  const inspeccionesCriticas = inspecciones.filter((item) =>
    ["critico", "crítico", "danger", "con novedades"].includes(normalizeText(item.estadoGeneral))
  ).length;

  const reposicionesPendientes = reposiciones.filter((item) =>
    ["pendiente", "en proceso", "por hacer"].includes(normalizeText(item.estado))
  ).length;

  const inspeccionesAtrasadas = botiquines.filter((botiquin) => {
    const latest = latestInspeccionByBotiquin.get(String(botiquin.id || ""));
    if (!latest?.fecha) return true;
    return getDaysSince(latest.fecha) > INSPECCION_OVERDUE_DAYS;
  }).length;

  const hallazgosPendientes = alertas.filter((item) => item.type === "hallazgo-pendiente").length;
  const alertasCriticas = alertas.filter((item) => normalizeText(item.severity) === "danger").length;

  return {
    totalBotiquines,
    operativos,
    totalItems,
    vencidos,
    proximosVencer,
    bajoStock,
    faltantes,
    inspeccionesCriticas,
    inspeccionesAtrasadas,
    reposicionesPendientes,
    hallazgosPendientes,
    alertasCriticas,
    pedidoItems: bajoStock + faltantes
  };
}

function buildPriorityCards(stats = {}) {
  return [
    {
      id: "priority-botiquines",
      key: "botiquines-activos",
      label: "Botiquines activos",
      value: stats.totalBotiquines,
      meta: `${stats.operativos} operativos`,
      tone: stats.totalBotiquines > 0 ? "success" : "muted",
      route: "botiquines"
    },
    {
      id: "priority-vencidos",
      key: "elementos-vencidos",
      label: "Elementos vencidos",
      value: stats.vencidos,
      meta: "Atención inmediata",
      tone: stats.vencidos > 0 ? "danger" : "muted",
      route: "inventario"
    },
    {
      id: "priority-proximos",
      key: "proximos-a-vencer",
      label: "Próximos a vencer",
      value: stats.proximosVencer,
      meta: "Revisión preventiva",
      tone: stats.proximosVencer > 0 ? "warning" : "muted",
      route: "inventario"
    },
    {
      id: "priority-stock",
      key: "bajo-stock",
      label: "Bajo stock / faltantes",
      value: stats.pedidoItems,
      meta: `${stats.bajoStock} bajo stock · ${stats.faltantes} faltantes`,
      tone: stats.pedidoItems > 0 ? "warning" : "muted",
      route: "pedido"
    }
  ];
}

function buildDashboardAlerts({
  alertas = [],
  inventario = [],
  inspecciones = [],
  botiquinesMap = new Map()
}) {
  if (alertas.length) {
    return alertas
      .slice()
      .sort(sortBySeverityAndDate)
      .slice(0, 6);
  }

  const inventarioAlerts = inventario.flatMap((item) => {
    const botiquin = botiquinesMap.get(String(item.botiquinId || ""));
    const alerts = [];

    if (item.expiry?.isExpired) {
      alerts.push({
        id: `alert-inv-exp-${item.idItem}`,
        severity: "danger",
        type: "vencido",
        title: `${item.nombre} vencido`,
        description: item.fechaVencimiento
          ? formatExpiryTextSafe(item.fechaVencimiento)
          : "Requiere retiro o reposición inmediata.",
        date: item.fechaVencimiento,
        route: "inventario",
        botiquinId: item.botiquinId || "",
        botiquinNombre: botiquin?.nombre || "Botiquín sin nombre"
      });
    } else if (item.expiry?.isNearExpiry) {
      alerts.push({
        id: `alert-inv-soon-${item.idItem}`,
        severity: "warning",
        type: "proximo-vencimiento",
        title: `${item.nombre} próximo a vencer`,
        description: item.fechaVencimiento
          ? formatExpiryTextSafe(item.fechaVencimiento)
          : "Conviene programar reposición.",
        date: item.fechaVencimiento,
        route: "inventario",
        botiquinId: item.botiquinId || "",
        botiquinNombre: botiquin?.nombre || "Botiquín sin nombre"
      });
    }

    if (item.cantidadActual <= 0) {
      alerts.push({
        id: `alert-inv-missing-${item.idItem}`,
        severity: "danger",
        type: "faltante",
        title: `${item.nombre} faltante`,
        description: "No hay unidades disponibles.",
        date: item.updatedAt || "",
        route: "pedido",
        botiquinId: item.botiquinId || "",
        botiquinNombre: botiquin?.nombre || "Botiquín sin nombre"
      });
    } else if (item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima) {
      alerts.push({
        id: `alert-inv-stock-${item.idItem}`,
        severity: "warning",
        type: "bajo-stock",
        title: `${item.nombre} con bajo stock`,
        description: `Cantidad actual: ${item.cantidadActual}. Mínimo esperado: ${item.cantidadMinima}.`,
        date: item.updatedAt || "",
        route: "pedido",
        botiquinId: item.botiquinId || "",
        botiquinNombre: botiquin?.nombre || "Botiquín sin nombre"
      });
    }

    return alerts;
  });

  const inspeccionAlerts = inspecciones
    .filter((item) =>
      ["critico", "crítico", "danger", "con novedades", "pendiente", "warning"].includes(
        normalizeText(item.estadoGeneral)
      )
    )
    .map((item) => {
      const botiquin = botiquinesMap.get(String(item.botiquinId || ""));
      const normalized = normalizeText(item.estadoGeneral);
      const isCritical = ["critico", "crítico", "danger"].includes(normalized);

      return {
        id: `alert-ins-${item.id}`,
        severity: isCritical ? "danger" : "warning",
        type: "hallazgo-pendiente",
        title: isCritical ? "Inspección crítica" : "Inspección con novedades",
        description: item.observaciones || "Se registraron novedades en la inspección.",
        date: item.fecha,
        route: "inspecciones",
        botiquinId: item.botiquinId || "",
        botiquinNombre: botiquin?.nombre || "Botiquín sin nombre"
      };
    });

  return [...inventarioAlerts, ...inspeccionAlerts]
    .sort(sortBySeverityAndDate)
    .slice(0, 6);
}

function buildRecentActivity({
  inspecciones = [],
  reposiciones = [],
  botiquinesMap = new Map()
}) {
  const inspeccionItems = inspecciones.map((item) => {
    const botiquin = botiquinesMap.get(String(item.botiquinId || ""));

    return {
      id: `act-ins-${item.id}`,
      type: "inspeccion",
      title: "Inspección registrada",
      subtitle: botiquin?.nombre || "Botiquín sin nombre",
      description: item.observaciones || item.estadoGeneral || "Sin detalle",
      date: item.fecha,
      route: "inspecciones",
      botiquinId: item.botiquinId || ""
    };
  });

  const reposicionItems = reposiciones.map((item) => {
    const botiquin = botiquinesMap.get(String(item.botiquinId || ""));

    return {
      id: `act-rep-${item.id}`,
      type: "reposicion",
      title: "Reposición registrada",
      subtitle: botiquin?.nombre || "Botiquín sin nombre",
      description: item.observaciones || item.estado || `Ítems: ${item.cantidadItems || 0}`,
      date: item.fecha,
      route: "reposiciones",
      botiquinId: item.botiquinId || ""
    };
  });

  return [...inspeccionItems, ...reposicionItems]
    .sort((a, b) => getDateValue(b.date) - getDateValue(a.date))
    .slice(0, 8);
}

function buildBotiquinesResumen({
  botiquines = [],
  inventario = [],
  inspecciones = [],
  latestInspeccionByBotiquin = new Map()
}) {
  const inventarioByBotiquin = groupInventarioByBotiquin(inventario);
  const inspeccionesByBotiquin = groupInspeccionesByBotiquin(inspecciones);

  return botiquines
    .map((botiquin) => {
      const botiquinId = String(botiquin.id || "");
      const invItems = inventarioByBotiquin.get(botiquinId) || [];
      const latestInspection = latestInspeccionByBotiquin.get(botiquinId) || null;
      const totalInspecciones = (inspeccionesByBotiquin.get(botiquinId) || []).length;

      const vencidos = invItems.filter((item) => item.expiry?.isExpired).length;
      const faltantes = invItems.filter((item) => item.cantidadActual <= 0).length;
      const bajoStock = invItems.filter((item) => item.cantidadMinima > 0 && item.cantidadActual > 0 && item.cantidadActual <= item.cantidadMinima).length;
      const overdue = !latestInspection?.fecha || getDaysSince(latestInspection.fecha) > INSPECCION_OVERDUE_DAYS;

      const score =
        (vencidos * 4) +
        (faltantes * 4) +
        (bajoStock * 2) +
        (overdue ? 3 : 0);

      return {
        ...botiquin,
        totalItems: invItems.length,
        vencidos,
        faltantes,
        bajoStock,
        latestInspection,
        overdue,
        totalInspecciones,
        riskScore: score
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || normalizeText(a.nombre).localeCompare(normalizeText(b.nombre), "es"))
    .slice(0, 5);
}

function buildLatestInspeccionMap(inspecciones = []) {
  const map = new Map();

  inspecciones
    .slice()
    .sort((a, b) => getDateValue(b.fecha) - getDateValue(a.fecha))
    .forEach((item) => {
      const botiquinId = String(item.botiquinId || "");
      if (botiquinId && !map.has(botiquinId)) {
        map.set(botiquinId, item);
      }
    });

  return map;
}

function groupInventarioByBotiquin(items = []) {
  const map = new Map();

  items.forEach((item) => {
    const key = String(item.botiquinId || "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });

  return map;
}

function groupInspeccionesByBotiquin(items = []) {
  const map = new Map();

  items.forEach((item) => {
    const key = String(item.botiquinId || "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });

  return map;
}

function sortBySeverityAndDate(a, b) {
  const severityRank = {
    danger: 1,
    warning: 2,
    alert: 3,
    muted: 4
  };

  const rankA = severityRank[normalizeText(a?.severity)] || 99;
  const rankB = severityRank[normalizeText(b?.severity)] || 99;

  if (rankA !== rankB) return rankA - rankB;

  return getDateValue(b?.date) - getDateValue(a?.date);
}

function createRenderSignature(vm) {
  return JSON.stringify({
    stats: vm.stats,
    priorityCards: vm.priorityCards,
    recentAlerts: vm.recentAlerts,
    recentActivity: vm.recentActivity,
    botiquinesResumen: vm.botiquinesResumen,
    quickActions: vm.quickActions,
    lastSync: vm.lastSync
  });
}

/* ======================================
   TEMPLATE
====================================== */

function createDashboardTemplate(vm) {
  return `
    <section class="dashboard-page" data-module="${MODULE_ID}">
      <header class="dashboard-hero card">
        <div class="card__body dashboard-hero__body">
          <div class="dashboard-hero__content">
            <p class="dashboard-hero__eyebrow">Resumen ejecutivo</p>
            <h2 class="dashboard-hero__title">Estado general del sistema</h2>
            <p class="dashboard-hero__text">
              Prioridades reales del sistema: vencimientos, faltantes, hallazgos, inspecciones atrasadas y reposiciones pendientes.
            </p>
          </div>

          <div class="dashboard-hero__actions">
            <button
              type="button"
              class="btn btn--secondary"
              data-action="refresh-dashboard"
            >
              Actualizar
            </button>

            <button
              type="button"
              class="btn btn--ghost"
              data-action="go-route"
              data-route="pedido"
            >
              Ver pedido consolidado
            </button>
          </div>
        </div>
      </header>

      <section class="dashboard-priority-grid">
        ${vm.priorityCards.map((item) => `
          <button
            type="button"
            class="kpi-card kpi-card--priority ${getPriorityCardClass(item.tone)}"
            data-action="go-route"
            data-route="${escapeHTML(item.route || "dashboard")}"
            data-kpi="${escapeHTML(item.key)}"
            data-value="${escapeHTML(String(item.value ?? 0))}"
          >
            <span class="kpi-card__label">${escapeHTML(item.label)}</span>
            <strong class="kpi-card__value">${escapeHTML(String(item.value ?? 0))}</strong>
            <span class="kpi-card__meta">${escapeHTML(item.meta)}</span>
          </button>
        `).join("")}
      </section>

      <section class="dashboard-overview-grid">
        <article class="card">
          <div class="card__body">
            <div class="section-header">
              <div>
                <h3 class="card__title">Panorama general</h3>
                <p class="section-text">Lectura rápida del estado operativo actual.</p>
              </div>
            </div>

            <div class="kpi-grid kpi-grid--compact">
              <article class="kpi-card">
                <span class="kpi-card__label">Botiquines</span>
                <strong class="kpi-card__value">${vm.stats.totalBotiquines}</strong>
                <span class="kpi-card__meta">${vm.stats.operativos} operativos</span>
              </article>

              <article class="kpi-card">
                <span class="kpi-card__label">Ítems inventario</span>
                <strong class="kpi-card__value">${vm.stats.totalItems}</strong>
                <span class="kpi-card__meta">${vm.stats.bajoStock} con bajo stock</span>
              </article>

              <article class="kpi-card">
                <span class="kpi-card__label">Inspecciones atrasadas</span>
                <strong class="kpi-card__value">${vm.stats.inspeccionesAtrasadas}</strong>
                <span class="kpi-card__meta">${vm.stats.hallazgosPendientes} hallazgos pendientes</span>
              </article>

              <article class="kpi-card">
                <span class="kpi-card__label">Pedido sugerido</span>
                <strong class="kpi-card__value">${vm.stats.pedidoItems}</strong>
                <span class="kpi-card__meta">${vm.stats.faltantes} faltantes directos</span>
              </article>

              <article class="kpi-card">
                <span class="kpi-card__label">Última sincronización</span>
                <strong class="kpi-card__value kpi-card__value--small">
                  ${vm.lastSync ? escapeHTML(formatDateSafe(vm.lastSync)) : "Sin dato"}
                </strong>
                <span class="kpi-card__meta">
                  ${vm.lastSync ? escapeHTML(formatTimeSafe(vm.lastSync)) : "Todavía no hay registro"}
                </span>
              </article>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card__body">
            <div class="section-header">
              <div>
                <h3 class="card__title">Accesos rápidos</h3>
                <p class="section-text">Atajos para entrar donde toca sin ponerse a peregrinar por la app.</p>
              </div>
            </div>

            <div class="quick-actions-grid quick-actions-grid--compact">
              ${vm.quickActions.map((item) => `
                <button
                  type="button"
                  class="quick-action-card"
                  data-action="go-route"
                  data-route="${escapeHTML(item.route)}"
                >
                  <span class="quick-action-card__title">${escapeHTML(item.title)}</span>
                  <span class="quick-action-card__text">${escapeHTML(item.text)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </article>
      </section>

      <section class="dashboard-grid">
        <div class="dashboard-grid__main">
          <article class="card">
            <div class="card__body">
              <div class="section-header">
                <div>
                  <h3 class="card__title">Alertas recientes</h3>
                  <p class="section-text">Lo urgente primero, antes de que alguien lo ignore con disciplina profesional.</p>
                </div>

                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-route"
                  data-route="alertas"
                >
                  Ver todas
                </button>
              </div>

              ${renderDashboardAlerts(vm.recentAlerts)}
            </div>
          </article>

          <article class="card">
            <div class="card__body">
              <div class="section-header">
                <div>
                  <h3 class="card__title">Actividad reciente</h3>
                  <p class="section-text">Últimos movimientos en inspecciones y reposiciones.</p>
                </div>
              </div>

              ${renderRecentActivity(vm.recentActivity)}
            </div>
          </article>
        </div>

        <aside class="dashboard-grid__side">
          <article class="card">
            <div class="card__body">
              <div class="section-header">
                <div>
                  <h3 class="card__title">Botiquines priorizados</h3>
                  <p class="section-text">Los que merecen más atención ahora mismo.</p>
                </div>

                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-route"
                  data-route="botiquines"
                >
                  Ver módulo
                </button>
              </div>

              ${renderBotiquinesResumen(vm.botiquinesResumen)}
            </div>
          </article>

          <article class="card">
            <div class="card__body">
              <div class="section-header">
                <div>
                  <h3 class="card__title">Pedido y pendientes</h3>
                  <p class="section-text">Atajo para comprar sin ponerse a sumar a mano como en 1998.</p>
                </div>

                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-route"
                  data-route="pedido"
                >
                  Abrir pedido
                </button>
              </div>

              <dl class="data-list data-list--stack">
                <div>
                  <dt>Faltantes</dt>
                  <dd>${vm.stats.faltantes}</dd>
                </div>
                <div>
                  <dt>Próximos a vencer</dt>
                  <dd>${vm.stats.proximosVencer}</dd>
                </div>
                <div>
                  <dt>Bajo stock</dt>
                  <dd>${vm.stats.bajoStock}</dd>
                </div>
                <div>
                  <dt>Reposiciones pendientes</dt>
                  <dd>${vm.stats.reposicionesPendientes}</dd>
                </div>
                <div>
                  <dt>Alertas críticas</dt>
                  <dd>${vm.stats.alertasCriticas}</dd>
                </div>
              </dl>
            </div>
          </article>
        </aside>
      </section>
    </section>
  `;
}

function renderDashboardAlerts(items = []) {
  if (!items.length) {
    return `
      <div class="empty-state empty-state--compact">
        <p class="section-text">No hay alertas recientes para mostrar.</p>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${items.map((item) => `
        <article class="stack-item alert-item ${getSeverityClass(item.severity)}">
          <div class="stack-item__content">
            <div class="stack-item__top">
              <span class="badge ${getSeverityBadgeClass(item.severity)}">${getSeverityLabel(item.severity)}</span>
              <span class="text-muted">${escapeHTML(item.date ? formatDateSafe(item.date) : "Sin fecha")}</span>
            </div>

            <h4 class="stack-item__title">${escapeHTML(item.title)}</h4>
            <p class="stack-item__text">${escapeHTML(item.description || "Sin detalle")}</p>
            <p class="stack-item__meta">${escapeHTML(item.botiquinNombre || "Botiquín sin nombre")}</p>
          </div>

          <div class="stack-item__actions">
            <button
              type="button"
              class="btn btn--ghost"
              data-action="open-alert-route"
              data-route="${escapeHTML(resolveAlertRoute(item) || "alertas")}"
              data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
            >
              Ver
            </button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRecentActivity(items = []) {
  if (!items.length) {
    return `
      <div class="empty-state empty-state--compact">
        <p class="section-text">Todavía no hay actividad reciente registrada.</p>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${items.map((item) => `
        <article class="stack-item">
          <div class="stack-item__content">
            <div class="stack-item__top">
              <span class="badge badge--muted">${escapeHTML(capitalize(item.type))}</span>
              <span class="text-muted">${escapeHTML(item.date ? formatDateSafe(item.date) : "Sin fecha")}</span>
            </div>

            <h4 class="stack-item__title">${escapeHTML(item.title)}</h4>
            <p class="stack-item__meta">${escapeHTML(item.subtitle || "")}</p>
            <p class="stack-item__text">${escapeHTML(item.description || "Sin detalle")}</p>
          </div>

          <div class="stack-item__actions">
            <button
              type="button"
              class="btn btn--ghost"
              data-action="open-activity-route"
              data-route="${escapeHTML(item.route || "dashboard")}"
              data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
            >
              Abrir
            </button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderBotiquinesResumen(items = []) {
  if (!items.length) {
    return `
      <div class="empty-state empty-state--compact">
        <p class="section-text">No hay botiquines cargados todavía.</p>
      </div>
    `;
  }

  return `
    <div class="stack-list">
      ${items.map((item) => `
        <article class="stack-item">
          <div class="stack-item__content">
            <div class="stack-item__top">
              <span class="badge ${getBotiquinRiskBadgeClass(item)}">${escapeHTML(getBotiquinRiskLabel(item))}</span>
            </div>

            <h4 class="stack-item__title">${escapeHTML(item.nombre)}</h4>
            <p class="stack-item__meta">
              ${escapeHTML(item.sede || "Sin sede")} · ${escapeHTML(item.ubicacion || "Sin ubicación")}
            </p>
            <p class="stack-item__text">
              ${escapeHTML(buildBotiquinResumenText(item))}
            </p>
          </div>

          <div class="stack-item__actions">
            <button
              type="button"
              class="btn btn--ghost"
              data-action="open-botiquin"
              data-botiquin-id="${escapeHTML(item.id)}"
            >
              Ver
            </button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function hydrateDashboardUI(container, vm) {
  const root = qs(`[data-module="${MODULE_ID}"]`, container);
  if (!root) return;

  root.dataset.dashboardSummary = "true";
  root.dataset.alerts = String(vm.recentAlerts.length);
  root.dataset.activity = String(vm.recentActivity.length);
  root.dataset.botiquines = String(vm.botiquinesResumen.length);
  root.dataset.botiquinesActivos = String(vm.stats.totalBotiquines ?? 0);
  root.dataset.elementosVencidos = String(vm.stats.vencidos ?? 0);
  root.dataset.proximosAVencer = String(vm.stats.proximosVencer ?? 0);
  root.dataset.bajoStock = String((vm.stats.bajoStock ?? 0) + (vm.stats.faltantes ?? 0));
  root.dataset.pedidoItems = String(vm.stats.pedidoItems ?? 0);
}

function publishDashboardSummary(vm) {
  const summary = {
    botiquinesActivos: vm?.stats?.totalBotiquines ?? 0,
    elementosVencidos: vm?.stats?.vencidos ?? 0,
    proximosAVencer: vm?.stats?.proximosVencer ?? 0,
    bajoStock: (vm?.stats?.bajoStock ?? 0) + (vm?.stats?.faltantes ?? 0),
    pedidoItems: vm?.stats?.pedidoItems ?? 0
  };

  window.dispatchEvent(
    new CustomEvent("dashboard:summary", {
      detail: summary
    })
  );
}

/* ======================================
   EVENTOS
====================================== */

function bindDashboardEvents() {
  document.addEventListener("click", handleDashboardClick, true);
}

function unbindDashboardEvents() {
  document.removeEventListener("click", handleDashboardClick, true);
}

async function handleDashboardClick(event) {
  if (!moduleState.container) return;
  if (!moduleState.container.contains(event.target)) return;

  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  const route = trigger.dataset.route || "";
  const botiquinId = trigger.dataset.botiquinId || "";

  switch (action) {
    case "refresh-dashboard":
      await syncDashboardModuleData({ force: true });
      renderDashboardView();
      break;

    case "go-route":
      if (route) {
        navigateTo(route);
      }
      break;

    case "open-botiquin":
      if (botiquinId) {
        setSelectedBotiquin(botiquinId);
      }
      navigateTo("botiquines");
      break;

    case "open-alert-route":
    case "open-activity-route":
      if (botiquinId) {
        setSelectedBotiquin(botiquinId);
      }
      if (route) {
        navigateTo(route);
      }
      break;

    default:
      break;
  }
}

/* ======================================
   HELPERS
====================================== */

function setSelectedBotiquin(botiquinId) {
  if (!botiquinId) return;

  if (typeof actions.setSelectedBotiquin === "function") {
    actions.setSelectedBotiquin(botiquinId);
    return;
  }

  if (typeof actions.setSelectedBotiquinId === "function") {
    actions.setSelectedBotiquinId(botiquinId);
  }
}

function setGlobalLoading(isLoading, message = "") {
  if (typeof actions.setLoading === "function") {
    actions.setLoading(Boolean(isLoading), message);
  }
}

function setStoreError(error) {
  if (typeof actions.setLastError === "function") {
    actions.setLastError(error);
  }
}

function clearStoreError() {
  if (typeof actions.clearLastError === "function") {
    actions.clearLastError();
    return;
  }

  if (typeof actions.setLastError === "function") {
    actions.setLastError(null);
  }
}

function getSafeExpiryStatus(value) {
  if (!value) {
    return {
      rawType: "",
      normalizedType: "",
      isExpired: false,
      isNearExpiry: false
    };
  }

  try {
    const status = getExpiryStatus(value) || {};
    const normalizedType = normalizeText(status?.type);

    return {
      rawType: status?.type || "",
      normalizedType,
      isExpired:
        normalizedType === "danger" ||
        normalizedType === "expired" ||
        normalizedType === "vencido",
      isNearExpiry:
        normalizedType === "warning" ||
        normalizedType === "alert" ||
        normalizedType === "soon" ||
        normalizedType === "proximo" ||
        normalizedType === "próximo"
    };
  } catch {
    return {
      rawType: "",
      normalizedType: "",
      isExpired: false,
      isNearExpiry: false
    };
  }
}

function getSeverityClass(severity = "") {
  switch (normalizeText(severity)) {
    case "danger":
      return "is-danger";
    case "warning":
    case "alert":
      return "is-warning";
    default:
      return "is-muted";
  }
}

function getSeverityBadgeClass(severity = "") {
  switch (normalizeText(severity)) {
    case "danger":
      return "badge--danger";
    case "warning":
    case "alert":
      return "badge--warning";
    default:
      return "badge--muted";
  }
}

function getSeverityLabel(severity = "") {
  switch (normalizeText(severity)) {
    case "danger":
      return "Crítica";
    case "warning":
    case "alert":
      return "Atención";
    default:
      return "Info";
  }
}

function getPriorityCardClass(tone = "") {
  switch (normalizeText(tone)) {
    case "danger":
      return "kpi-card--danger";
    case "warning":
      return "kpi-card--warning";
    case "success":
      return "kpi-card--success";
    default:
      return "kpi-card--muted";
  }
}

function getBotiquinRiskBadgeClass(item) {
  if (item.vencidos > 0 || item.faltantes > 0) return "badge--danger";
  if (item.bajoStock > 0 || item.overdue) return "badge--warning";
  return "badge--success";
}

function getBotiquinRiskLabel(item) {
  if (item.vencidos > 0 || item.faltantes > 0) return "Crítico";
  if (item.bajoStock > 0 || item.overdue) return "Atención";
  return "Estable";
}

function buildBotiquinResumenText(item) {
  const parts = [
    `Responsable: ${item.responsable || "No asignado"}`,
    `${item.totalItems || 0} ítems`,
    `${item.vencidos || 0} vencidos`,
    `${item.faltantes || 0} faltantes`,
    item.latestInspection?.fecha
      ? `última inspección ${formatDateSafe(item.latestInspection.fecha)}`
      : "sin inspección"
  ];

  return parts.join(" · ");
}

function resolveAlertRoute(item = {}) {
  const type = normalizeText(item.type || "");

  if (["vencido", "proximo-vencimiento"].includes(type)) {
    return "inventario";
  }

  if (["bajo-stock", "faltante"].includes(type)) {
    return "pedido";
  }

  if (["hallazgo-pendiente", "inspeccion-atrasada"].includes(type)) {
    return "inspecciones";
  }

  return "alertas";
}

function capitalize(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getDateValue(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDaysSince(value) {
  const timestamp = getDateValue(value);
  if (!timestamp) return Number.MAX_SAFE_INTEGER;

  const diff = Date.now() - timestamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDateSafe(value = "") {
  if (!value) return "";
  try {
    return typeof formatDate === "function" ? formatDate(value) : String(value);
  } catch {
    return String(value);
  }
}

function formatTimeSafe(value = "") {
  if (!value) return "";
  try {
    if (typeof formatDateTime === "function") {
      return String(formatDateTime(value));
    }
    return formatDateSafe(value);
  } catch {
    return String(value);
  }
}

function formatExpiryTextSafe(value = "") {
  if (!value) return "";
  try {
    return typeof formatExpiryText === "function" ? formatExpiryText(value) : formatDateSafe(value);
  } catch {
    return formatDateSafe(value);
  }
}
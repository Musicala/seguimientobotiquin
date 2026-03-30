import { store, selectors, actions } from "../state.js";

import {
  getBotiquines,
  getInventario,
  getInspecciones,
  getReposiciones
} from "../api.js";

import { navigateTo } from "../router.js";

import {
  qs,
  qsa,
  setHTML,
  debounce,
  ensureArray,
  normalizeText,
  escapeHTML,
  formatDate,
  formatExpiryText,
  getExpiryStatus,
  toNumber
} from "../utils.js";

/* ======================================
   CONFIG
====================================== */

const MODULE_ID = "alertas-module";
const SEARCH_DEBOUNCE_MS = 250;
const INSPECCION_OVERDUE_DAYS = 30;

const ALERT_TYPE_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "vencido", label: "Vencidos" },
  { value: "proximo-vencimiento", label: "Próximos a vencer" },
  { value: "bajo-stock", label: "Bajo stock" },
  { value: "faltante", label: "Faltantes" },
  { value: "inspeccion-atrasada", label: "Inspecciones atrasadas" },
  { value: "hallazgo-pendiente", label: "Hallazgos pendientes" }
];

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

export async function initAlertasModule(options = {}) {
  const { container, forceRender = false } = options;

  if (!(container instanceof HTMLElement)) {
    throw new Error("[alertas] initAlertasModule requiere un container válido.");
  }

  moduleState.container = container;

  if (!moduleState.initialized) {
    moduleState.unsubscribe = store.subscribe(handleStoreChange);
    moduleState.initialized = true;
  }

  if (!moduleState.boundEvents) {
    bindAlertasEvents();
    moduleState.boundEvents = true;
  }

  await syncAlertasModuleData();

  if (forceRender || isAlertasRoute()) {
    renderAlertasView();
  }

  moduleState.mounted = true;
}

export function renderAlertasView() {
  if (!moduleState.container) return;

  const state = store.getState();
  const vm = getAlertasViewModel(state);
  const signature = createRenderSignature(vm);

  if (!moduleState.mounted || signature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createAlertasTemplate(vm));
    hydrateAlertasUI(moduleState.container, vm);
    moduleState.lastRenderSignature = signature;
  }
}

export function destroyAlertasModule() {
  if (typeof moduleState.unsubscribe === "function") {
    moduleState.unsubscribe();
  }

  moduleState.initialized = false;
  moduleState.mounted = false;
  moduleState.boundEvents = false;
  moduleState.unsubscribe = null;
  moduleState.container = null;
  moduleState.lastRenderSignature = "";
}

export async function syncAlertasModuleData(options = {}) {
  const { force = false } = options;
  const state = store.getState();

  const currentBotiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));
  const currentInventario = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  const currentInspecciones = normalizeInspecciones(ensureArray(selectors.inspecciones?.(state)));
  const currentReposiciones = normalizeReposiciones(ensureArray(selectors.reposiciones?.(state)));

  const needBotiquines = force || !currentBotiquines.length;
  const needInventario = force || !currentInventario.length;
  const needInspecciones = force || !currentInspecciones.length;
  const needReposiciones = force || !currentReposiciones.length;

  if (!needBotiquines && !needInventario && !needInspecciones && !needReposiciones) {
    const derived = buildDerivedAlertas(store.getState());
    if (typeof actions.setAlertas === "function") {
      actions.setAlertas(derived);
    }
    return derived;
  }

  setGlobalLoading(true, "Cargando alertas...");

  try {
    const [botiquines, inventario, inspecciones, reposiciones] = await Promise.all([
      needBotiquines ? getBotiquines() : currentBotiquines,
      needInventario ? getInventario() : currentInventario,
      needInspecciones ? getInspecciones() : currentInspecciones,
      needReposiciones ? getReposiciones() : currentReposiciones
    ]);

    const normalizedBotiquines = needBotiquines ? normalizeBotiquines(botiquines) : currentBotiquines;
    const normalizedInventario = needInventario ? normalizeInventario(inventario) : currentInventario;
    const normalizedInspecciones = needInspecciones ? normalizeInspecciones(inspecciones) : currentInspecciones;
    const normalizedReposiciones = needReposiciones ? normalizeReposiciones(reposiciones) : currentReposiciones;

    if (needBotiquines && typeof actions.setBotiquines === "function") {
      actions.setBotiquines(normalizedBotiquines);
    }

    if (needInventario && typeof actions.setInventario === "function") {
      actions.setInventario(normalizedInventario);
    }

    if (needInspecciones && typeof actions.setInspecciones === "function") {
      actions.setInspecciones(normalizedInspecciones);
    }

    if (needReposiciones && typeof actions.setReposiciones === "function") {
      actions.setReposiciones(normalizedReposiciones);
    }

    const nextState = store.getState();
    const derived = buildDerivedAlertas({
      ...nextState,
      botiquines: normalizedBotiquines,
      inventario: normalizedInventario,
      inspecciones: normalizedInspecciones,
      reposiciones: normalizedReposiciones
    });

    if (typeof actions.setAlertas === "function") {
      actions.setAlertas(derived);
    }

    if (typeof actions.setLastSync === "function") {
      actions.setLastSync(new Date().toISOString());
    }

    clearStoreError();
    return derived;
  } catch (error) {
    console.error("[alertas] Error sincronizando datos:", error);
    setStoreError(error);
    throw error;
  } finally {
    setGlobalLoading(false);
  }
}

/* ======================================
   STORE -> RENDER
====================================== */

function handleStoreChange(payload) {
  const nextState = payload?.state || store.getState();
  if (!isAlertasRoute()) return;
  if (!moduleState.container) return;

  const vm = getAlertasViewModel(nextState);
  const signature = createRenderSignature(vm);

  if (signature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createAlertasTemplate(vm));
    hydrateAlertasUI(moduleState.container, vm);
    moduleState.lastRenderSignature = signature;
  }
}

function isAlertasRoute() {
  const state = store.getState();
  const currentRoute = selectors.currentRoute?.(state);

  if (currentRoute) return currentRoute === "alertas";

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash === "alertas";
}

/* ======================================
   NORMALIZADORES
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
      item?.botiquin ||
      item?.nombreBotiquin ||
      item?.nombre_botiquin ||
      `Botiquín ${index + 1}`
    ),
    sede: String(item?.sede || ""),
    tipo: String(item?.tipo || ""),
    ubicacion: String(item?.ubicacion || ""),
    responsable: String(item?.responsable || ""),
    estado: String(item?.estado || ""),
    raw: item
  }));
}

function normalizeInventario(items = []) {
  return ensureArray(items).map((item, index) => {
    const fechaVencimiento =
      item?.fecha_vencimiento ??
      item?.fechaVencimiento ??
      item?.vence ??
      item?.vencimiento ??
      "";

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
        item?.id_botiquin ||
        item?.botiquinId ||
        item?.botiquin_id ||
        item?.botiquin ||
        ""
      ),
      elemento: String(
        item?.elemento ||
        item?.nombre ||
        item?.insumo ||
        item?.producto ||
        item?.descripcion ||
        "Elemento"
      ),
      categoria: String(item?.categoria || ""),
      unidad: String(item?.unidad || ""),
      cantidadActual: Math.max(
        0,
        toNumber(
          item?.cantidad_actual ??
          item?.cantidadActual ??
          item?.cantidad ??
          item?.stock ??
          0
        )
      ),
      cantidadMinima: Math.max(
        0,
        toNumber(
          item?.cantidad_minima ??
          item?.cantidadMinima ??
          item?.stockMinimo ??
          item?.stock_minimo ??
          item?.minimo ??
          0
        )
      ),
      lote: String(item?.lote || ""),
      fechaVencimiento: String(fechaVencimiento || ""),
      ubicacion: String(item?.ubicacion || ""),
      observaciones: String(item?.observaciones || ""),
      activo: normalizeActiveFlag(item?.activo, true),
      expiry: getSafeExpiryStatus(fechaVencimiento),
      updatedAt: String(
        item?.updatedAt ||
        item?.fechaActualizacion ||
        item?.fecha_actualizacion ||
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
        `INS-${String(index + 1).padStart(4, "0")}`
      ),
      botiquinId: String(
        item?.botiquinId ||
        item?.id_botiquin ||
        item?.botiquin_id ||
        ""
      ),
      fecha: String(item?.fecha || item?.createdAt || item?.fechaRegistro || ""),
      responsable: String(item?.responsable || ""),
      estadoGeneral: String(
        item?.estadoGeneral ||
        item?.estado_general ||
        item?.estado ||
        item?.resultado ||
        ""
      ),
      observaciones: String(
        item?.observaciones ||
        item?.observaciones_generales ||
        item?.novedades ||
        item?.comentarios ||
        ""
      ),
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
    idRegistroInventario: String(
      item?.id_registro_inventario ||
      item?.idRegistroInventario ||
      item?.id_registro ||
      ""
    ),
    elemento: String(item?.elemento || ""),
    categoria: String(item?.categoria || ""),
    unidad: String(item?.unidad || ""),
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
      `REP-${String(index + 1).padStart(4, "0")}`
    ),
    idItem: String(item?.id_item || item?.itemId || item?.item_id || ""),
    botiquinId: String(item?.id_botiquin || item?.botiquinId || item?.botiquin_id || ""),
    inspeccionOrigenId: String(
      item?.id_inspeccion_origen ||
      item?.inspeccionOrigenId ||
      item?.idInspeccionOrigen ||
      ""
    ),
    cantidadRepuesta: Math.max(
      0,
      toNumber(
        item?.cantidad_repuesta ??
        item?.cantidadRepuesta ??
        item?.cantidad ??
        0
      )
    ),
    fecha: String(item?.fecha || item?.createdAt || item?.fechaRegistro || ""),
    responsable: String(item?.responsable || ""),
    motivo: String(item?.motivo || ""),
    estado: String(item?.estado || ""),
    raw: item
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

/* ======================================
   DERIVACIÓN DE ALERTAS
====================================== */

function buildDerivedAlertas(sourceState) {
  const botiquines = normalizeBotiquines(
    ensureArray(sourceState?.botiquines ?? selectors.botiquines?.(store.getState()))
  );
  const inventario = normalizeInventario(
    ensureArray(sourceState?.inventario ?? selectors.inventario?.(store.getState()))
  );
  const inspecciones = normalizeInspecciones(
    ensureArray(sourceState?.inspecciones ?? selectors.inspecciones?.(store.getState()))
  );
  const reposiciones = normalizeReposiciones(
    ensureArray(sourceState?.reposiciones ?? selectors.reposiciones?.(store.getState()))
  );

  const botiquinesMap = new Map(botiquines.map((item) => [String(item.id), item]));
  const latestInspeccionByBotiquin = buildLatestInspeccionMap(inspecciones);
  const latestReposicionByInspectionItem = buildLatestReposicionByInspectionItemMap(reposiciones);

  const inventoryAlerts = inventario.flatMap((item) =>
    buildInventoryAlerts(item, botiquinesMap)
  );

  const overdueInspectionAlerts = botiquines.flatMap((botiquin) =>
    buildOverdueInspectionAlerts({
      botiquin,
      latestInspeccion: latestInspeccionByBotiquin.get(String(botiquin.id))
    })
  );

  const pendingFindingAlerts = inspecciones.flatMap((inspeccion) =>
    buildPendingFindingAlerts({
      inspeccion,
      botiquin: botiquinesMap.get(String(inspeccion.botiquinId || "")),
      latestReposicionByInspectionItem
    })
  );

  return [...inventoryAlerts, ...overdueInspectionAlerts, ...pendingFindingAlerts]
    .sort(sortAlertsByPriorityAndDate);
}

function buildInventoryAlerts(item, botiquinesMap) {
  if (!item.activo) return [];

  const botiquinId = String(item.botiquinId || "");
  const botiquin = botiquinesMap.get(botiquinId);
  const alerts = [];
  const expiry = item.expiry || getSafeExpiryStatus(item.fechaVencimiento);

  if (expiry.isExpired) {
    alerts.push(createAlert({
      source: "inventario",
      severity: "danger",
      type: "vencido",
      title: `${item.elemento} vencido`,
      description: item.fechaVencimiento
        ? formatExpiryText(item.fechaVencimiento)
        : "El ítem figura como vencido y debe revisarse.",
      botiquinId,
      botiquinNombre: botiquin?.nombre || "Botiquín sin nombre",
      date: item.fechaVencimiento || item.updatedAt || new Date().toISOString(),
      meta: {
        itemId: item.idItem,
        itemNombre: item.elemento,
        categoria: item.categoria,
        unidad: item.unidad,
        cantidadActual: item.cantidadActual,
        cantidadMinima: item.cantidadMinima
      }
    }));
  } else if (expiry.isNearExpiry) {
    alerts.push(createAlert({
      source: "inventario",
      severity: "warning",
      type: "proximo-vencimiento",
      title: `${item.elemento} próximo a vencer`,
      description: item.fechaVencimiento
        ? formatExpiryText(item.fechaVencimiento)
        : "El ítem requiere revisión preventiva.",
      botiquinId,
      botiquinNombre: botiquin?.nombre || "Botiquín sin nombre",
      date: item.fechaVencimiento || item.updatedAt || new Date().toISOString(),
      meta: {
        itemId: item.idItem,
        itemNombre: item.elemento,
        categoria: item.categoria,
        unidad: item.unidad,
        cantidadActual: item.cantidadActual,
        cantidadMinima: item.cantidadMinima
      }
    }));
  }

  if (item.cantidadActual <= 0) {
    alerts.push(createAlert({
      source: "inventario",
      severity: "danger",
      type: "faltante",
      title: `${item.elemento} faltante`,
      description: "No hay unidades disponibles en inventario.",
      botiquinId,
      botiquinNombre: botiquin?.nombre || "Botiquín sin nombre",
      date: item.updatedAt || new Date().toISOString(),
      meta: {
        itemId: item.idItem,
        itemNombre: item.elemento,
        cantidadActual: item.cantidadActual,
        cantidadMinima: item.cantidadMinima,
        unidad: item.unidad
      }
    }));
  } else if (item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima) {
    alerts.push(createAlert({
      source: "inventario",
      severity: "warning",
      type: "bajo-stock",
      title: `${item.elemento} con bajo stock`,
      description: `Cantidad actual: ${item.cantidadActual}. Mínimo esperado: ${item.cantidadMinima}.`,
      botiquinId,
      botiquinNombre: botiquin?.nombre || "Botiquín sin nombre",
      date: item.updatedAt || new Date().toISOString(),
      meta: {
        itemId: item.idItem,
        itemNombre: item.elemento,
        cantidadActual: item.cantidadActual,
        cantidadMinima: item.cantidadMinima,
        unidad: item.unidad
      }
    }));
  }

  return alerts;
}

function buildOverdueInspectionAlerts({ botiquin, latestInspeccion }) {
  const daysSinceLastInspection = latestInspeccion?.fecha
    ? getDaysSince(latestInspeccion.fecha)
    : null;

  const isOverdue =
    !latestInspeccion ||
    daysSinceLastInspection === null ||
    daysSinceLastInspection > INSPECCION_OVERDUE_DAYS;

  if (!isOverdue) return [];

  return [
    createAlert({
      source: "inspecciones",
      severity: "warning",
      type: "inspeccion-atrasada",
      title: latestInspeccion
        ? `Inspección atrasada en ${botiquin.nombre}`
        : `Sin inspección registrada en ${botiquin.nombre}`,
      description: latestInspeccion
        ? `Última inspección el ${formatDate(latestInspeccion.fecha)}. Han pasado ${daysSinceLastInspection} días.`
        : "No encontré inspecciones registradas para este botiquín.",
      botiquinId: botiquin.id,
      botiquinNombre: botiquin.nombre,
      date: latestInspeccion?.fecha || "",
      meta: {
        inspeccionId: latestInspeccion?.id || "",
        responsable: latestInspeccion?.responsable || "",
        estadoGeneral: latestInspeccion?.estadoGeneral || ""
      }
    })
  ];
}

function buildPendingFindingAlerts({
  inspeccion,
  botiquin,
  latestReposicionByInspectionItem
}) {
  return ensureArray(inspeccion.detalle)
    .filter((detail) => requiresFollowUp(detail))
    .filter((detail) => {
      const key = getInspectionItemKey(inspeccion.id, detail.idItem);
      const latestReposicion = latestReposicionByInspectionItem.get(key);

      if (!latestReposicion) return true;

      const normalizedEstado = normalizeText(latestReposicion.estado || "");
      return !["completada", "completa", "ok"].includes(normalizedEstado);
    })
    .map((detail) => {
      const severity = derivePendingFindingSeverity(detail);

      return createAlert({
        source: "inspecciones",
        severity,
        type: "hallazgo-pendiente",
        title: `${detail.elemento || detail.idItem || "Ítem"} con hallazgo pendiente`,
        description: buildPendingFindingDescription(detail, inspeccion),
        botiquinId: inspeccion.botiquinId,
        botiquinNombre: botiquin?.nombre || "Botiquín sin nombre",
        date: inspeccion.fecha,
        meta: {
          inspeccionId: inspeccion.id,
          responsable: inspeccion.responsable,
          estadoGeneral: inspeccion.estadoGeneral,
          itemId: detail.idItem,
          itemNombre: detail.elemento,
          accionRequerida: detail.accionRequerida,
          estadoItem: detail.estadoItem
        }
      });
    });
}

function buildLatestInspeccionMap(inspecciones = []) {
  const map = new Map();

  ensureArray(inspecciones)
    .slice()
    .sort((a, b) => getDateValue(b.fecha) - getDateValue(a.fecha))
    .forEach((item) => {
      const key = String(item.botiquinId || "");
      if (key && !map.has(key)) {
        map.set(key, item);
      }
    });

  return map;
}

function buildLatestReposicionByInspectionItemMap(reposiciones = []) {
  const map = new Map();

  ensureArray(reposiciones)
    .slice()
    .sort((a, b) => getDateValue(b.fecha) - getDateValue(a.fecha))
    .forEach((item) => {
      const key = getInspectionItemKey(item.inspeccionOrigenId, item.idItem);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, item);
      }
    });

  return map;
}

function requiresFollowUp(detail) {
  const estado = normalizeText(detail.estadoItem || "");
  const accion = normalizeText(detail.accionRequerida || "");

  return (
    estado !== "ok" ||
    Boolean(accion)
  );
}

function derivePendingFindingSeverity(detail) {
  const estado = normalizeText(detail.estadoItem || "");
  const accion = normalizeText(detail.accionRequerida || "");

  if (
    ["faltante", "vencido", "critico", "crítico"].includes(estado) ||
    ["reponer", "dar de baja"].includes(accion)
  ) {
    return "danger";
  }

  return "warning";
}

function buildPendingFindingDescription(detail, inspeccion) {
  const parts = [
    `Inspección del ${inspeccion.fecha ? formatDate(inspeccion.fecha) : "sin fecha"}`,
    detail.estadoItem ? `estado: ${detail.estadoItem}` : "",
    detail.accionRequerida ? `acción: ${detail.accionRequerida}` : "",
    detail.observacion || ""
  ].filter(Boolean);

  return parts.join(" · ");
}

function createAlert({
  source = "system",
  severity = "muted",
  type = "general",
  title = "",
  description = "",
  botiquinId = "",
  botiquinNombre = "",
  date = "",
  meta = {}
}) {
  return {
    id: [
      source,
      type,
      botiquinId || "sin-botiquin",
      meta.itemId || meta.inspeccionId || "sin-ref",
      String(date || "")
    ].join("::"),
    source,
    severity,
    type,
    title,
    description,
    botiquinId,
    botiquinNombre,
    date,
    meta
  };
}

function sortAlertsByPriorityAndDate(a, b) {
  const rank = {
    danger: 1,
    warning: 2,
    alert: 3,
    muted: 4,
    success: 5
  };

  const rankA = rank[a?.severity] || 99;
  const rankB = rank[b?.severity] || 99;

  if (rankA !== rankB) return rankA - rankB;

  return getDateValue(b?.date) - getDateValue(a?.date);
}

/* ======================================
   VIEW MODEL
====================================== */

function getAlertasViewModel(state) {
  const allAlertas = ensureArray(selectors.alertas?.(state));
  const filters = normalizeAlertasFilters(selectors.filters?.(state) || {});
  const botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));
  const selectedBotiquinId =
    selectors.selectedBotiquinId?.(state) ||
    selectors.selectedBotiquin?.(state) ||
    "";

  const effectiveFilters = {
    ...filters,
    botiquinId: filters.botiquinId || selectedBotiquinId || ""
  };

  const filtered = filterAlertas(allAlertas, effectiveFilters);

  return {
    filters: effectiveFilters,
    allAlertas,
    alertas: filtered,
    botiquines,
    selectedBotiquinId: effectiveFilters.botiquinId || "",
    selectedBotiquin:
      botiquines.find((item) => String(item.id) === String(effectiveFilters.botiquinId || "")) || null,
    stats: buildAlertasStats(filtered, allAlertas)
  };
}

function normalizeAlertasFilters(filters = {}) {
  return {
    search: filters.search || "",
    tipo: filters.tipo || "",
    botiquinId: filters.botiquinId || ""
  };
}

function filterAlertas(alertas = [], filters = {}) {
  const search = normalizeText(filters.search || "");
  const tipo = normalizeText(filters.tipo || "");
  const botiquinId = String(filters.botiquinId || "").trim();

  return ensureArray(alertas).filter((item) => {
    const matchesSearch =
      !search ||
      normalizeText(
        [
          item.title,
          item.description,
          item.botiquinNombre,
          item.type,
          item.meta?.itemNombre,
          item.meta?.estadoGeneral,
          item.meta?.accionRequerida,
          item.meta?.estadoItem
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(search);

    const matchesTipo = !tipo || normalizeText(item.type) === tipo;
    const matchesBotiquin = !botiquinId || String(item.botiquinId || "") === botiquinId;

    return matchesSearch && matchesTipo && matchesBotiquin;
  });
}

function buildAlertasStats(filteredAlertas = [], allAlertas = []) {
  const target = ensureArray(filteredAlertas);

  return {
    total: target.length,
    critical: target.filter((item) => item.severity === "danger").length,
    warning: target.filter((item) => item.severity === "warning").length,
    expired: target.filter((item) => item.type === "vencido").length,
    expiring: target.filter((item) => item.type === "proximo-vencimiento").length,
    missing: target.filter((item) => item.type === "faltante").length,
    lowStock: target.filter((item) => item.type === "bajo-stock").length,
    overdueInspections: target.filter((item) => item.type === "inspeccion-atrasada").length,
    pendingFindings: target.filter((item) => item.type === "hallazgo-pendiente").length,
    totalGlobal: ensureArray(allAlertas).length
  };
}

function createRenderSignature(vm) {
  return JSON.stringify({
    filters: vm.filters,
    stats: vm.stats,
    selectedBotiquinId: vm.selectedBotiquinId,
    alertIds: vm.alertas.map((item) => item.id)
  });
}

/* ======================================
   TEMPLATE
====================================== */

function createAlertasTemplate(vm) {
  return `
    <section class="alerts-page" data-module="${MODULE_ID}">
      <header class="page-toolbar">
        <div>
          <h2 class="section-title">Alertas y pendientes</h2>
          <p class="section-text">
            Consolida vencimientos, bajo stock, faltantes, inspecciones atrasadas y hallazgos pendientes.
          </p>
        </div>

        <div class="page-toolbar__actions">
          <button
            type="button"
            class="btn btn--secondary"
            data-action="refresh-alertas"
          >
            Actualizar alertas
          </button>
        </div>
      </header>

      ${renderAlertasContextBar(vm)}

      <section class="kpi-grid">
        <article class="kpi-card">
          <span class="kpi-card__label">Total alertas</span>
          <strong class="kpi-card__value">${vm.stats.total}</strong>
          <span class="kpi-card__hint">Filtrado actual</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Críticas</span>
          <strong class="kpi-card__value">${vm.stats.critical}</strong>
          <span class="kpi-card__hint">Riesgo alto</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Próximas / vencidas</span>
          <strong class="kpi-card__value">${vm.stats.expiring + vm.stats.expired}</strong>
          <span class="kpi-card__hint">Control de vencimientos</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Pendientes operativos</span>
          <strong class="kpi-card__value">${vm.stats.pendingFindings + vm.stats.overdueInspections}</strong>
          <span class="kpi-card__hint">Seguimiento requerido</span>
        </article>
      </section>

      <section class="card">
        <div class="card__body">
          <form class="filters-grid" data-role="alertas-filters" autocomplete="off">
            <div class="form-group">
              <label class="form-label" for="alertasSearch">Buscar</label>
              <input
                id="alertasSearch"
                name="search"
                class="input"
                type="search"
                placeholder="Elemento, botiquín, observación..."
                value="${escapeHTML(vm.filters.search || "")}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="alertasTipo">Tipo</label>
              <select id="alertasTipo" name="tipo" class="select">
                ${renderTypeOptions(vm.filters.tipo)}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="alertasBotiquin">Botiquín</label>
              <select id="alertasBotiquin" name="botiquinId" class="select">
                ${renderBotiquinOptions(vm.botiquines, vm.filters.botiquinId)}
              </select>
            </div>

            <div class="form-group form-group--actions">
              <label class="form-label is-ghost">Acciones</label>
              <div class="form-actions-inline">
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="reset-filters"
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section class="alerts-list" data-role="alerts-list">
        ${renderAlertsList(vm.alertas)}
      </section>
    </section>
  `;
}

function renderAlertasContextBar(vm) {
  const selectedBotiquin = vm.selectedBotiquin;

  return `
    <section class="card alertas-context-card">
      <div class="card__body alertas-context">
        <div class="alertas-context__main">
          <span class="alertas-context__eyebrow">Contexto actual</span>
          <h3 class="alertas-context__title">
            ${
              selectedBotiquin
                ? escapeHTML(selectedBotiquin.nombre || "Botiquín seleccionado")
                : "Vista consolidada"
            }
          </h3>
          <p class="section-text">
            ${
              selectedBotiquin
                ? "Las alertas están filtradas por el botiquín activo."
                : "Se muestran alertas derivadas del sistema completo."
            }
          </p>
        </div>

        <div class="alertas-context__meta">
          ${
            selectedBotiquin
              ? `
                ${selectedBotiquin.tipo ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.tipo)}</span>` : ""}
                ${selectedBotiquin.ubicacion ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.ubicacion)}</span>` : ""}
                ${selectedBotiquin.sede ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.sede)}</span>` : ""}
              `
              : `
                <span class="badge badge--success">Vista global</span>
                <span class="badge badge--muted">${vm.stats.totalGlobal} alertas generadas</span>
              `
          }
        </div>

        <div class="alertas-context__actions">
          ${
            selectedBotiquin
              ? `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="clear-selected-botiquin"
                >
                  Ver todo
                </button>
              `
              : `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-botiquines"
                >
                  Explorar botiquines
                </button>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderTypeOptions(selectedValue = "") {
  return ALERT_TYPE_OPTIONS.map((option) => `
    <option
      value="${escapeHTML(option.value)}"
      ${String(selectedValue || "") === String(option.value) ? "selected" : ""}
    >
      ${escapeHTML(option.label)}
    </option>
  `).join("");
}

function renderBotiquinOptions(botiquines = [], selectedValue = "") {
  const baseOption = `
    <option value="" ${!selectedValue ? "selected" : ""}>Todos</option>
  `;

  const options = ensureArray(botiquines)
    .map((item) => `
      <option
        value="${escapeHTML(item.id)}"
        ${String(selectedValue || "") === String(item.id) ? "selected" : ""}
      >
        ${escapeHTML(item.nombre)}
      </option>
    `)
    .join("");

  return baseOption + options;
}

function renderAlertsList(alertas = []) {
  if (!alertas.length) {
    return `
      <article class="card card--empty">
        <div class="card__body">
          <h3 class="card__title">No hay alertas para mostrar</h3>
          <p class="section-text">
            Ajusta los filtros o actualiza los datos. Por una vez, el caos parece medianamente contenido.
          </p>
        </div>
      </article>
    `;
  }

  return `
    <div class="cards-grid">
      ${alertas.map(renderAlertCard).join("")}
    </div>
  `;
}

function renderAlertCard(item) {
  const typeLabel = getAlertTypeLabel(item.type);
  const dateText = item.date ? formatDate(item.date) : "Sin fecha";

  return `
    <article
      class="card alert-card ${getSeverityClass(item.severity)}"
      data-alert-id="${escapeHTML(item.id)}"
      data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
      data-alert-type="${escapeHTML(item.type || "")}"
    >
      <div class="card__body">
        <div class="alert-card__header">
          <div>
            <span class="badge ${getSeverityBadge(item.severity)}">${escapeHTML(typeLabel)}</span>
            <h3 class="card__title">${escapeHTML(item.title)}</h3>
          </div>

          <div class="alert-card__meta">
            <span class="text-muted">${escapeHTML(dateText)}</span>
          </div>
        </div>

        <p class="section-text">${escapeHTML(item.description || "Sin detalle.")}</p>

        <dl class="data-list">
          <div>
            <dt>Botiquín</dt>
            <dd>${escapeHTML(item.botiquinNombre || "No definido")}</dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>${escapeHTML(capitalizeSource(item.source))}</dd>
          </div>
        </dl>

        ${renderAlertMeta(item)}

        <div class="card__actions">
          ${
            item.botiquinId
              ? `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="open-botiquin"
                  data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
                >
                  Ver botiquín
                </button>
              `
              : ""
          }

          <button
            type="button"
            class="btn btn--secondary"
            data-action="open-related-view"
            data-alert-type="${escapeHTML(item.type || "")}"
            data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
          >
            Ir al detalle
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderAlertMeta(item) {
  const rows = [];

  if (item.meta?.itemNombre) {
    rows.push(`
      <div>
        <dt>Ítem</dt>
        <dd>${escapeHTML(item.meta.itemNombre)}</dd>
      </div>
    `);
  }

  if (item.meta?.accionRequerida) {
    rows.push(`
      <div>
        <dt>Acción</dt>
        <dd>${escapeHTML(item.meta.accionRequerida)}</dd>
      </div>
    `);
  }

  if (item.meta?.estadoItem) {
    rows.push(`
      <div>
        <dt>Estado ítem</dt>
        <dd>${escapeHTML(item.meta.estadoItem)}</dd>
      </div>
    `);
  }

  if (item.meta?.cantidadActual !== undefined && item.meta?.cantidadMinima !== undefined) {
    rows.push(`
      <div>
        <dt>Cantidad</dt>
        <dd>${escapeHTML(String(item.meta.cantidadActual))} / mín ${escapeHTML(String(item.meta.cantidadMinima))}</dd>
      </div>
    `);
  }

  if (!rows.length) return "";

  return `
    <dl class="data-list">
      ${rows.join("")}
    </dl>
  `;
}

function hydrateAlertasUI(container, vm) {
  const list = qs('[data-role="alerts-list"]', container);
  if (!list) return;

  list.dataset.total = String(vm.stats.total);
  list.dataset.critical = String(vm.stats.critical);
  list.dataset.warning = String(vm.stats.warning);
  list.dataset.expired = String(vm.stats.expired);
  list.dataset.expiring = String(vm.stats.expiring);
}

/* ======================================
   EVENTOS
====================================== */

function bindAlertasEvents() {
  document.addEventListener("input", handleAlertasInput, true);
  document.addEventListener("change", handleAlertasChange, true);
  document.addEventListener("click", handleAlertasClick, true);
}

const debouncedSearchUpdate = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ search: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

function handleAlertasInput(event) {
  if (!moduleState.container) return;
  if (!moduleState.container.contains(event.target)) return;

  const target = event.target;

  if (target.matches("#alertasSearch")) {
    debouncedSearchUpdate(target.value);
  }
}

function handleAlertasChange(event) {
  if (!moduleState.container) return;
  if (!moduleState.container.contains(event.target)) return;

  const target = event.target;

  if (target.matches("#alertasTipo")) {
    if (typeof actions.setFilters === "function") {
      actions.setFilters({ tipo: target.value || "" });
    }
    return;
  }

  if (target.matches("#alertasBotiquin")) {
    if (typeof actions.setFilters === "function") {
      actions.setFilters({ botiquinId: target.value || "" });
    }
  }
}

async function handleAlertasClick(event) {
  if (!moduleState.container) return;
  if (!moduleState.container.contains(event.target)) return;

  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  const botiquinId = trigger.dataset.botiquinId || "";
  const alertType = trigger.dataset.alertType || "";

  switch (action) {
    case "refresh-alertas":
      await syncAlertasModuleData({ force: true });
      renderAlertasView();
      return;

    case "reset-filters":
      if (typeof actions.setFilters === "function") {
        actions.setFilters({
          search: "",
          tipo: "",
          botiquinId: ""
        });
      }
      return;

    case "clear-selected-botiquin":
      clearSelectedBotiquin();
      if (typeof actions.setFilters === "function") {
        actions.setFilters({ botiquinId: "" });
      }
      renderAlertasView();
      return;

    case "go-botiquines":
      navigateTo("botiquines");
      return;

    case "open-botiquin":
      if (botiquinId) {
        setSelectedBotiquin(botiquinId);
        navigateTo("botiquines");
      }
      return;

    case "open-related-view":
      if (botiquinId) {
        setSelectedBotiquin(botiquinId);
      }

      if (["vencido", "proximo-vencimiento", "bajo-stock", "faltante"].includes(alertType)) {
        navigateTo("inventario");
        return;
      }

      if (["inspeccion-atrasada", "hallazgo-pendiente"].includes(alertType)) {
        navigateTo("inspecciones");
        return;
      }

      navigateTo("botiquines");
      return;

    default:
      break;
  }
}

/* ======================================
   HELPERS UI
====================================== */

function getSeverityClass(severity = "") {
  switch (severity) {
    case "danger":
      return "is-danger";
    case "warning":
      return "is-warning";
    case "alert":
      return "is-alert";
    case "success":
      return "is-success";
    default:
      return "is-muted";
  }
}

function getSeverityBadge(severity = "") {
  switch (severity) {
    case "danger":
      return "badge--danger";
    case "warning":
      return "badge--warning";
    case "alert":
      return "badge--alert";
    case "success":
      return "badge--success";
    default:
      return "badge--muted";
  }
}

function getAlertTypeLabel(type = "") {
  const map = {
    "vencido": "Vencido",
    "proximo-vencimiento": "Próximo a vencer",
    "bajo-stock": "Bajo stock",
    "faltante": "Faltante",
    "inspeccion-atrasada": "Inspección atrasada",
    "hallazgo-pendiente": "Hallazgo pendiente"
  };

  return map[type] || "Alerta";
}

function capitalizeSource(source = "") {
  const value = String(source || "").trim();
  if (!value) return "Sistema";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ======================================
   HELPERS STORE / DATOS
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

function clearSelectedBotiquin() {
  if (typeof actions.clearSelectedBotiquin === "function") {
    actions.clearSelectedBotiquin();
    return;
  }

  if (typeof actions.setSelectedBotiquin === "function") {
    actions.setSelectedBotiquin("");
    return;
  }

  if (typeof actions.setSelectedBotiquinId === "function") {
    actions.setSelectedBotiquinId("");
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

/* ======================================
   HELPERS FECHA / LÓGICA
====================================== */

function getSafeExpiryStatus(value) {
  if (!value) {
    return {
      type: "muted",
      isExpired: false,
      isNearExpiry: false
    };
  }

  try {
    const status = getExpiryStatus(value) || {};
    const normalizedType = normalizeText(status.type || "");

    return {
      ...status,
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
      type: "muted",
      isExpired: false,
      isNearExpiry: false
    };
  }
}

function getDateValue(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDaysSince(value) {
  const timestamp = getDateValue(value);
  if (!timestamp) return null;

  const diff = Date.now() - timestamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getInspectionItemKey(inspeccionId, itemId) {
  const inspection = String(inspeccionId || "").trim();
  const item = String(itemId || "").trim();

  if (!inspection || !item) return "";
  return `${inspection}::${item}`;
}
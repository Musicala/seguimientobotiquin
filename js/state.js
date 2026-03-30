import { getDefaultView, isValidView } from "./config.js";

/* ======================================
   CONSTANTES
====================================== */

export const ROUTE_VALUES = Object.freeze([
  "dashboard",
  "botiquines",
  "inventario",
  "inspecciones",
  "reposiciones",
  "alertas",
  "pedido"
]);

const DEFAULT_ROUTE = isValidView(getDefaultView?.())
  ? getDefaultView()
  : "dashboard";

const DEFAULT_FILTERS = Object.freeze({
  search: "",
  sede: "",
  estado: "",
  tipo: "",
  categoria: "",
  severidad: "",
  botiquinId: "",
  fechaDesde: "",
  fechaHasta: "",
  pedidoSoloFaltantes: true
});

const DEFAULT_UI = Object.freeze({
  activeModal: null,
  modalPayload: null,
  sidebarOpen: false,
  toasts: []
});

const DEFAULT_PEDIDO = Object.freeze({
  items: [],
  summary: {
    totalProductos: 0,
    totalUnidades: 0,
    totalBotiquinesAfectados: 0
  },
  printMeta: {
    title: "Solicitud de cotización",
    subtitle: "Pedido consolidado de elementos faltantes",
    notes: ""
  },
  lastCalculatedAt: null
});

const DEFAULT_DATA = Object.freeze({
  dashboard: null,
  botiquines: [],
  catalogo: [],
  inspecciones: [],
  inventario: [],
  reposiciones: [],
  alertas: [],
  pedido: DEFAULT_PEDIDO
});

const DEFAULT_META = Object.freeze({
  lastSync: null,
  lastRouteChangeAt: null,
  lastError: null,
  loadingMessage: null
});

const COLLECTION_NAMES = Object.freeze([
  "botiquines",
  "catalogo",
  "inspecciones",
  "inventario",
  "reposiciones",
  "alertas"
]);

/* ======================================
   ESTADO INICIAL
====================================== */

export const initialState = Object.freeze({
  currentRoute: DEFAULT_ROUTE,
  loading: false,
  initialized: false,

  ui: DEFAULT_UI,
  filters: DEFAULT_FILTERS,
  selectedBotiquinId: null,

  data: DEFAULT_DATA,
  meta: DEFAULT_META
});

/* ======================================
   HELPERS BASE
====================================== */

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {
      // fallback abajo, porque la plataforma a veces se cree artista
    }
  }

  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  if (Array.isArray(source)) {
    return [...source];
  }

  if (!isPlainObject(source)) {
    return source;
  }

  const output = isPlainObject(target) ? { ...target } : {};

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = output[key];

    if (Array.isArray(sourceValue)) {
      output[key] = [...sourceValue];
      return;
    }

    if (isPlainObject(sourceValue)) {
      output[key] = deepMerge(isPlainObject(targetValue) ? targetValue : {}, sourceValue);
      return;
    }

    output[key] = sourceValue;
  });

  return output;
}

function getPathSegments(path) {
  if (!path || typeof path !== "string") return [];
  return path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getValueAtPath(obj, path) {
  const segments = getPathSegments(path);

  if (!segments.length) return obj;

  return segments.reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

function setValueAtPath(obj, path, value) {
  const segments = getPathSegments(path);

  if (!segments.length) {
    return value;
  }

  const rootClone = Array.isArray(obj) ? [...obj] : { ...obj };
  let pointer = rootClone;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;

    if (isLast) {
      pointer[segment] = value;
      return;
    }

    const currentValue = pointer[segment];

    if (Array.isArray(currentValue)) {
      pointer[segment] = [...currentValue];
    } else if (isPlainObject(currentValue)) {
      pointer[segment] = { ...currentValue };
    } else {
      pointer[segment] = {};
    }

    pointer = pointer[segment];
  });

  return rootClone;
}

function normalizeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeText(value) {
  return normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeRoute(route) {
  const normalized = normalizeText(route);
  return ROUTE_VALUES.includes(normalized) ? normalized : DEFAULT_ROUTE;
}

function normalizeId(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = normalizeText(value);

  if (["true", "1", "si", "sí", "yes", "y", "activo", "activa"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "inactivo", "inactiva"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeFilters(filters = {}) {
  const safeFilters = isPlainObject(filters) ? filters : {};

  return {
    search: normalizeString(safeFilters.search),
    sede: normalizeString(safeFilters.sede),
    estado: normalizeString(safeFilters.estado),
    tipo: normalizeString(safeFilters.tipo),
    categoria: normalizeString(safeFilters.categoria),
    severidad: normalizeString(safeFilters.severidad),
    botiquinId: normalizeString(
      safeFilters.botiquinId ??
        safeFilters.id_botiquin ??
        safeFilters.idBotiquin
    ),
    fechaDesde: normalizeString(safeFilters.fechaDesde),
    fechaHasta: normalizeString(safeFilters.fechaHasta),
    pedidoSoloFaltantes: normalizeBoolean(
      safeFilters.pedidoSoloFaltantes,
      true
    )
  };
}

function normalizeToast(toast = {}) {
  const safeToast = isPlainObject(toast) ? toast : {};

  return {
    id:
      safeToast.id ||
      `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: normalizeString(safeToast.type || "info"),
    title: normalizeString(safeToast.title),
    message: normalizeString(safeToast.message),
    duration: Number(safeToast.duration || 3000)
  };
}

function sanitizeError(error) {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      message: normalizeString(error.message || "Error no especificado"),
      stack: normalizeString(error.stack || "") || null
    };
  }

  if (isPlainObject(error)) {
    return {
      message: normalizeString(error.message || "Error no especificado"),
      stack: normalizeString(error.stack || "") || null
    };
  }

  return {
    message: normalizeString(error || "Error no especificado"),
    stack: null
  };
}

function matchesText(value, query) {
  if (!query) return true;
  return normalizeText(value).includes(normalizeText(query));
}

function matchesExact(value, expected) {
  if (!expected) return true;
  return normalizeText(value) === normalizeText(expected);
}

function isValidDateInRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;

  const current = new Date(value);
  if (Number.isNaN(current.getTime())) return false;

  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime()) && current < fromDate) {
      return false;
    }
  }

  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime()) && current > toDate) {
      return false;
    }
  }

  return true;
}

function getBotiquinIdFromItem(item = {}) {
  return normalizeId(
    item?.id_botiquin ??
      item?.botiquinId ??
      item?.botiquin_id ??
      item?.idBotiquin ??
      item?.botiquin?.id_botiquin ??
      item?.botiquin?.id ??
      null
  );
}

function itemBelongsToBotiquin(item, botiquinId) {
  const selectedId = normalizeId(botiquinId);
  if (!selectedId) return true;

  return getBotiquinIdFromItem(item) === selectedId;
}

function buildSearchText(parts = []) {
  return parts.filter(Boolean).join(" ");
}

function buildSearchableBotiquinText(item = {}) {
  return buildSearchText([
    item?.id_botiquin,
    item?.id,
    item?.codigo,
    item?.nombre,
    item?.sede,
    item?.ubicacion,
    item?.responsable,
    item?.tipo,
    item?.estado
  ]);
}

function buildSearchableCatalogoText(item = {}) {
  return buildSearchText([
    item?.id_elemento,
    item?.id_item,
    item?.nombre_elemento,
    item?.elemento,
    item?.categoria,
    item?.unidad,
    item?.tipo_botiquin,
    item?.tipo
  ]);
}

function buildSearchableInventarioText(item = {}) {
  return buildSearchText([
    item?.id_registro,
    item?.id_item,
    item?.id_elemento,
    item?.elemento,
    item?.nombre_elemento,
    item?.categoria,
    item?.unidad,
    item?.estado,
    item?.lote
  ]);
}

function buildSearchablePedidoText(item = {}) {
  return buildSearchText([
    item?.id_elemento,
    item?.id_item,
    item?.nombre_elemento,
    item?.categoria,
    item?.unidad,
    item?.detalle_texto
  ]);
}

function withMetaPatch(partialMeta = {}) {
  return {
    meta: {
      ...store.get("meta"),
      ...partialMeta
    }
  };
}

function resolveEntityId(item = {}, fallbackKeys = []) {
  const keys = [
    "id_registro",
    "id",
    "id_item",
    "id_elemento",
    "itemId",
    "item_id",
    "id_inspeccion",
    "inspeccionId",
    "inspectionId",
    "id_reposicion",
    "reposicionId",
    "requestId",
    "id_botiquin",
    "botiquinId",
    "rowId",
    "row_id",
    "_id",
    ...fallbackKeys
  ];

  for (const key of keys) {
    const value = normalizeId(item?.[key]);
    if (value) return value;
  }

  return null;
}

function upsertItemInCollection(items = [], incomingItem = {}, idKeys = []) {
  const safeItems = normalizeArray(items);
  const safeIncoming = isPlainObject(incomingItem) ? incomingItem : {};

  const incomingId = resolveEntityId(safeIncoming, idKeys);

  if (!incomingId) {
    return [...safeItems];
  }

  const index = safeItems.findIndex((item) => {
    const itemId = resolveEntityId(item, idKeys);
    return itemId === incomingId;
  });

  if (index === -1) {
    return [safeIncoming, ...safeItems];
  }

  const nextItems = [...safeItems];
  nextItems[index] = {
    ...nextItems[index],
    ...safeIncoming
  };

  return nextItems;
}

function removeItemFromCollection(items = [], id, idKeys = []) {
  const safeItems = normalizeArray(items);
  const safeId = normalizeId(id);

  if (!safeId) return [...safeItems];

  return safeItems.filter((item) => {
    const itemId = resolveEntityId(item, idKeys);
    return itemId !== safeId;
  });
}

function updateItemInCollection(items = [], id, patch = {}, idKeys = []) {
  const safeItems = normalizeArray(items);
  const safeId = normalizeId(id);

  if (!safeId || !isPlainObject(patch)) {
    return [...safeItems];
  }

  return safeItems.map((item) => {
    const itemId = resolveEntityId(item, idKeys);

    if (itemId !== safeId) {
      return item;
    }

    return {
      ...item,
      ...patch
    };
  });
}

function ensureCollectionPath(collectionName) {
  if (!COLLECTION_NAMES.includes(collectionName)) {
    throw new Error(`[state] Colección no soportada: ${collectionName}`);
  }

  return `data.${collectionName}`;
}

function collectionIdKeys(collectionName) {
  switch (collectionName) {
    case "botiquines":
      return ["id_botiquin", "id", "codigo"];
    case "catalogo":
      return ["id_elemento", "id_item", "itemId", "item_id", "id"];
    case "inventario":
      return ["id_registro", "id_item", "id_elemento", "itemId", "item_id", "rowId"];
    case "inspecciones":
      return ["id_inspeccion", "inspeccionId", "inspectionId", "rowId"];
    case "reposiciones":
      return ["id_reposicion", "reposicionId", "requestId", "rowId"];
    case "alertas":
      return ["id", "alertId", "rowId", "id_item"];
    default:
      return ["id"];
  }
}

function getBotiquinCollectionId(item = {}) {
  return normalizeId(item?.id_botiquin ?? item?.id ?? item?.codigo);
}

function getCatalogoCollectionId(item = {}) {
  return normalizeId(item?.id_elemento ?? item?.id_item ?? item?.id);
}

function getBotiquinDateValue(item = {}) {
  return (
    item?.fecha ||
    item?.createdAt ||
    item?.updatedAt ||
    item?.fecha_creacion ||
    item?.fechaCreacion ||
    null
  );
}

function normalizePedidoSummary(summary = {}) {
  const safeSummary = isPlainObject(summary) ? summary : {};

  return {
    totalProductos: Number(safeSummary.totalProductos || 0),
    totalUnidades: Number(safeSummary.totalUnidades || 0),
    totalBotiquinesAfectados: Number(safeSummary.totalBotiquinesAfectados || 0)
  };
}

function normalizePedidoPrintMeta(printMeta = {}) {
  const safePrintMeta = isPlainObject(printMeta) ? printMeta : {};

  return {
    title: normalizeString(
      safePrintMeta.title,
      DEFAULT_PEDIDO.printMeta.title
    ),
    subtitle: normalizeString(
      safePrintMeta.subtitle,
      DEFAULT_PEDIDO.printMeta.subtitle
    ),
    notes: normalizeString(safePrintMeta.notes, "")
  };
}

function normalizePedidoState(pedido = {}) {
  const safePedido = isPlainObject(pedido) ? pedido : {};

  return {
    items: normalizeArray(safePedido.items),
    summary: normalizePedidoSummary(safePedido.summary),
    printMeta: normalizePedidoPrintMeta(safePedido.printMeta),
    lastCalculatedAt: normalizeString(safePedido.lastCalculatedAt) || null
  };
}

/* ======================================
   FACTORY DE STORE
====================================== */

export function createStore(seedState = {}) {
  let state = deepMerge(cloneValue(initialState), cloneValue(seedState));
  const listeners = new Set();

  function notify(payload) {
    listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("[state] Error en listener:", error);
      }
    });
  }

  function getState() {
    return cloneValue(state);
  }

  function get(path, fallback = undefined) {
    const value = getValueAtPath(state, path);
    return value === undefined ? fallback : cloneValue(value);
  }

  function set(nextStateOrUpdater, meta = {}) {
    const previousState = state;

    const nextState =
      typeof nextStateOrUpdater === "function"
        ? nextStateOrUpdater(cloneValue(state))
        : nextStateOrUpdater;

    if (!isPlainObject(nextState)) {
      throw new Error("[state] set() requiere un objeto de estado válido.");
    }

    state = nextState;

    notify({
      type: meta.type || "state:set",
      state: getState(),
      previousState: cloneValue(previousState),
      meta
    });

    return getState();
  }

  function patch(partialState, meta = {}) {
    if (!isPlainObject(partialState)) {
      throw new Error("[state] patch() requiere un objeto parcial.");
    }

    const previousState = state;
    state = deepMerge(state, partialState);

    notify({
      type: meta.type || "state:patch",
      state: getState(),
      previousState: cloneValue(previousState),
      meta
    });

    return getState();
  }

  function setAt(path, value, meta = {}) {
    if (!path) {
      throw new Error("[state] setAt() requiere una ruta.");
    }

    const previousState = state;
    state = setValueAtPath(state, path, value);

    notify({
      type: meta.type || "state:setAt",
      path,
      value: cloneValue(value),
      state: getState(),
      previousState: cloneValue(previousState),
      meta
    });

    return getState();
  }

  function patchAt(path, partialValue, meta = {}) {
    if (!path) {
      throw new Error("[state] patchAt() requiere una ruta.");
    }

    const currentValue = getValueAtPath(state, path);

    if (!isPlainObject(currentValue)) {
      throw new Error(`[state] patchAt() requiere que "${path}" sea un objeto.`);
    }

    if (!isPlainObject(partialValue)) {
      throw new Error("[state] patchAt() requiere un objeto parcial.");
    }

    const mergedValue = deepMerge(currentValue, partialValue);

    return setAt(path, mergedValue, {
      ...meta,
      type: meta.type || "state:patchAt"
    });
  }

  function reset(meta = {}) {
    const previousState = state;
    state = cloneValue(initialState);

    notify({
      type: meta.type || "state:reset",
      state: getState(),
      previousState: cloneValue(previousState),
      meta
    });

    return getState();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new Error("[state] subscribe() requiere una función.");
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState,
    get,
    set,
    patch,
    setAt,
    patchAt,
    reset,
    subscribe
  };
}

/* ======================================
   STORE PRINCIPAL
====================================== */

export const store = createStore();

/* ======================================
   SELECTORES
====================================== */

export const selectors = {
  currentRoute: (state) => state.currentRoute,
  loading: (state) => state.loading,
  initialized: (state) => state.initialized,
  ui: (state) => state.ui,
  filters: (state) => state.filters,
  meta: (state) => state.meta,
  selectedBotiquinId: (state) => state.selectedBotiquinId,

  dashboard: (state) => state.data.dashboard,
  botiquines: (state) => state.data.botiquines,
  catalogo: (state) => state.data.catalogo,
  inspecciones: (state) => state.data.inspecciones,
  inventario: (state) => state.data.inventario,
  reposiciones: (state) => state.data.reposiciones,
  alertas: (state) => state.data.alertas,
  pedido: (state) => state.data.pedido,
  pedidoItems: (state) => state.data.pedido?.items || [],
  pedidoSummary: (state) => state.data.pedido?.summary || DEFAULT_PEDIDO.summary,
  pedidoPrintMeta: (state) => state.data.pedido?.printMeta || DEFAULT_PEDIDO.printMeta,
  pedidoLastCalculatedAt: (state) => state.data.pedido?.lastCalculatedAt || null,

  selectedBotiquin: (state) => {
    const botiquines = state.data.botiquines || [];
    const selectedId = normalizeId(state.selectedBotiquinId);

    return (
      botiquines.find((item) => getBotiquinCollectionId(item) === selectedId) ||
      null
    );
  },

  getBotiquinById: (state, botiquinId) => {
    const items = state.data.botiquines || [];
    const targetId = normalizeId(botiquinId);

    return items.find((item) => getBotiquinCollectionId(item) === targetId) || null;
  },

  getCatalogoItemById: (state, itemId) => {
    const items = state.data.catalogo || [];
    const targetId = normalizeId(itemId);

    return items.find((item) => getCatalogoCollectionId(item) === targetId) || null;
  },

  getInventarioItemById: (state, itemId) => {
    const items = state.data.inventario || [];
    const targetId = normalizeId(itemId);

    return (
      items.find(
        (item) =>
          resolveEntityId(item, ["id_registro", "id_item", "id_elemento", "itemId", "item_id"]) ===
          targetId
      ) || null
    );
  },

  getInspeccionById: (state, inspeccionId) => {
    const items = state.data.inspecciones || [];
    const targetId = normalizeId(inspeccionId);

    return (
      items.find(
        (item) =>
          resolveEntityId(item, ["id_inspeccion", "inspectionId", "inspeccionId"]) ===
          targetId
      ) || null
    );
  },

  getReposicionById: (state, reposicionId) => {
    const items = state.data.reposiciones || [];
    const targetId = normalizeId(reposicionId);

    return (
      items.find(
        (item) =>
          resolveEntityId(item, ["id_reposicion", "reposicionId", "requestId"]) ===
          targetId
      ) || null
    );
  },

  filteredBotiquines: (state) => {
    const items = state.data.botiquines || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchableBotiquinText(item),
        filters.search
      );

      const matchSede = matchesExact(item?.sede, filters.sede);
      const matchEstado = matchesExact(item?.estado, filters.estado);
      const matchTipo = matchesExact(item?.tipo, filters.tipo);

      return matchSearch && matchSede && matchEstado && matchTipo;
    });
  },

  filteredCatalogo: (state) => {
    const items = state.data.catalogo || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchableCatalogoText(item),
        filters.search
      );

      const matchCategoria = matchesExact(item?.categoria, filters.categoria);
      const matchTipo = matchesExact(item?.tipo_botiquin ?? item?.tipo, filters.tipo);
      const matchEstado = !filters.estado
        ? true
        : matchesExact(item?.activo ? "activo" : "inactivo", filters.estado);

      return matchSearch && matchCategoria && matchTipo && matchEstado;
    });
  },

  filteredInspecciones: (state) => {
    const items = state.data.inspecciones || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchText([
          item?.id_inspeccion,
          item?.id,
          item?.id_botiquin,
          item?.responsable,
          item?.observaciones_generales,
          item?.estado_general
        ]),
        filters.search
      );

      const matchBotiquin = itemBelongsToBotiquin(item, filters.botiquinId);
      const matchEstado = matchesExact(
        item?.estado_general ?? item?.estado,
        filters.estado
      );
      const matchFecha = isValidDateInRange(
        getBotiquinDateValue(item),
        filters.fechaDesde,
        filters.fechaHasta
      );

      return matchSearch && matchBotiquin && matchEstado && matchFecha;
    });
  },

  filteredInventario: (state) => {
    const items = state.data.inventario || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchableInventarioText(item),
        filters.search
      );

      const matchBotiquin = itemBelongsToBotiquin(item, filters.botiquinId);
      const matchEstado = matchesExact(item?.estado, filters.estado);
      const matchTipo = matchesExact(item?.categoria ?? item?.tipo, filters.tipo);
      const matchCategoria = matchesExact(item?.categoria, filters.categoria);

      return matchSearch && matchBotiquin && matchEstado && matchTipo && matchCategoria;
    });
  },

  filteredReposiciones: (state) => {
    const items = state.data.reposiciones || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchText([
          item?.id_reposicion,
          item?.id_item,
          item?.elemento,
          item?.responsable,
          item?.motivo,
          item?.observaciones
        ]),
        filters.search
      );

      const matchBotiquin = itemBelongsToBotiquin(item, filters.botiquinId);
      const matchEstado = matchesExact(item?.estado, filters.estado);
      const matchFecha = isValidDateInRange(
        getBotiquinDateValue(item),
        filters.fechaDesde,
        filters.fechaHasta
      );

      return matchSearch && matchBotiquin && matchEstado && matchFecha;
    });
  },

  filteredAlertas: (state) => {
    const items = state.data.alertas || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchText([
          item?.id,
          item?.tipo,
          item?.titulo,
          item?.descripcion,
          item?.severidad,
          item?.estado
        ]),
        filters.search
      );

      const matchBotiquin = itemBelongsToBotiquin(item, filters.botiquinId);
      const matchEstado = matchesExact(item?.estado, filters.estado);
      const matchTipo = matchesExact(item?.tipo ?? item?.categoria, filters.tipo);
      const matchSeveridad = matchesExact(item?.severidad, filters.severidad);

      return matchSearch && matchBotiquin && matchEstado && matchTipo && matchSeveridad;
    });
  },

  filteredPedido: (state) => {
    const items = state.data.pedido?.items || [];
    const filters = normalizeFilters(state.filters || {});

    return items.filter((item) => {
      const matchSearch = matchesText(
        buildSearchablePedidoText(item),
        filters.search
      );

      const matchCategoria = matchesExact(item?.categoria, filters.categoria);

      return matchSearch && matchCategoria;
    });
  },

  botiquinInspecciones: (state) => {
    if (!state.selectedBotiquinId) return [];
    return (state.data.inspecciones || []).filter((item) =>
      itemBelongsToBotiquin(item, state.selectedBotiquinId)
    );
  },

  botiquinInventario: (state) => {
    if (!state.selectedBotiquinId) return [];
    return (state.data.inventario || []).filter((item) =>
      itemBelongsToBotiquin(item, state.selectedBotiquinId)
    );
  },

  botiquinReposiciones: (state) => {
    if (!state.selectedBotiquinId) return [];
    return (state.data.reposiciones || []).filter((item) =>
      itemBelongsToBotiquin(item, state.selectedBotiquinId)
    );
  },

  botiquinAlertas: (state) => {
    if (!state.selectedBotiquinId) return [];
    return (state.data.alertas || []).filter((item) =>
      itemBelongsToBotiquin(item, state.selectedBotiquinId)
    );
  },

  activeModal: (state) => state.ui.activeModal,
  modalPayload: (state) => state.ui.modalPayload,
  sidebarOpen: (state) => state.ui.sidebarOpen,
  toasts: (state) => state.ui.toasts
};

/* ======================================
   ACCIONES DE ESTADO
====================================== */

export const actions = {
  setInitialized(value = true) {
    return store.patch(
      {
        initialized: Boolean(value)
      },
      { type: "app:setInitialized" }
    );
  },

  setLoading(value, message = null) {
    return store.patch(
      {
        loading: Boolean(value),
        ...withMetaPatch({
          loadingMessage: message
        })
      },
      { type: "app:setLoading" }
    );
  },

  setRoute(route) {
    return store.patch(
      {
        currentRoute: normalizeRoute(route),
        ...withMetaPatch({
          lastRouteChangeAt: new Date().toISOString()
        })
      },
      { type: "route:set" }
    );
  },

  setSelectedBotiquin(botiquinId) {
    return store.patch(
      {
        selectedBotiquinId: normalizeId(botiquinId)
      },
      { type: "botiquin:select" }
    );
  },

  clearSelectedBotiquin() {
    return store.patch(
      {
        selectedBotiquinId: null
      },
      { type: "botiquin:clearSelection" }
    );
  },

  setFilters(partialFilters = {}) {
    return store.patchAt("filters", normalizeFilters(partialFilters), {
      type: "filters:set"
    });
  },

  replaceFilters(nextFilters = {}) {
    return store.setAt("filters", normalizeFilters(nextFilters), {
      type: "filters:replace"
    });
  },

  resetFilters() {
    return store.setAt("filters", cloneValue(DEFAULT_FILTERS), {
      type: "filters:reset"
    });
  },

  setDashboardData(payload) {
    return store.setAt("data.dashboard", payload || null, {
      type: "data:setDashboard"
    });
  },

  setBotiquines(items = []) {
    const safeItems = normalizeArray(items);
    const nextState = store.setAt("data.botiquines", safeItems, {
      type: "data:setBotiquines"
    });

    const selectedId = normalizeId(nextState.selectedBotiquinId);
    if (!selectedId) return nextState;

    const stillExists = safeItems.some(
      (item) => getBotiquinCollectionId(item) === selectedId
    );

    if (stillExists) return nextState;

    return store.patch(
      {
        selectedBotiquinId: null
      },
      { type: "botiquin:clearInvalidSelection" }
    );
  },

  setCatalogo(items = []) {
    return store.setAt("data.catalogo", normalizeArray(items), {
      type: "data:setCatalogo"
    });
  },

  setInspecciones(items = []) {
    return store.setAt("data.inspecciones", normalizeArray(items), {
      type: "data:setInspecciones"
    });
  },

  setInventario(items = []) {
    return store.setAt("data.inventario", normalizeArray(items), {
      type: "data:setInventario"
    });
  },

  setReposiciones(items = []) {
    return store.setAt("data.reposiciones", normalizeArray(items), {
      type: "data:setReposiciones"
    });
  },

  setAlertas(items = []) {
    return store.setAt("data.alertas", normalizeArray(items), {
      type: "data:setAlertas"
    });
  },

  setPedido(pedido = {}) {
    return store.setAt("data.pedido", normalizePedidoState(pedido), {
      type: "data:setPedido"
    });
  },

  setPedidoItems(items = [], summary = null) {
    const currentPedido = normalizePedidoState(store.get("data.pedido", {}));

    return store.setAt(
      "data.pedido",
      {
        ...currentPedido,
        items: normalizeArray(items),
        summary: summary
          ? normalizePedidoSummary(summary)
          : currentPedido.summary,
        lastCalculatedAt: new Date().toISOString()
      },
      { type: "data:setPedidoItems" }
    );
  },

  setPedidoSummary(summary = {}) {
    const currentPedido = normalizePedidoState(store.get("data.pedido", {}));

    return store.setAt(
      "data.pedido",
      {
        ...currentPedido,
        summary: normalizePedidoSummary(summary)
      },
      { type: "data:setPedidoSummary" }
    );
  },

  setPedidoPrintMeta(printMeta = {}) {
    const currentPedido = normalizePedidoState(store.get("data.pedido", {}));

    return store.setAt(
      "data.pedido",
      {
        ...currentPedido,
        printMeta: {
          ...currentPedido.printMeta,
          ...normalizePedidoPrintMeta(printMeta)
        }
      },
      { type: "data:setPedidoPrintMeta" }
    );
  },

  clearPedido() {
    return store.setAt("data.pedido", cloneValue(DEFAULT_PEDIDO), {
      type: "data:clearPedido"
    });
  },

  upsertBotiquin(item = {}) {
    const currentItems = normalizeArray(store.get("data.botiquines", []));
    const nextItems = upsertItemInCollection(
      currentItems,
      item,
      collectionIdKeys("botiquines")
    );

    return store.setAt("data.botiquines", nextItems, {
      type: "data:upsertBotiquin"
    });
  },

  upsertCatalogoItem(item = {}) {
    const currentItems = normalizeArray(store.get("data.catalogo", []));
    const nextItems = upsertItemInCollection(
      currentItems,
      item,
      collectionIdKeys("catalogo")
    );

    return store.setAt("data.catalogo", nextItems, {
      type: "data:upsertCatalogoItem"
    });
  },

  upsertInspeccion(item = {}) {
    const currentItems = normalizeArray(store.get("data.inspecciones", []));
    const nextItems = upsertItemInCollection(
      currentItems,
      item,
      collectionIdKeys("inspecciones")
    );

    return store.setAt("data.inspecciones", nextItems, {
      type: "data:upsertInspeccion"
    });
  },

  upsertInventarioItem(item = {}) {
    const currentItems = normalizeArray(store.get("data.inventario", []));
    const nextItems = upsertItemInCollection(
      currentItems,
      item,
      collectionIdKeys("inventario")
    );

    return store.setAt("data.inventario", nextItems, {
      type: "data:upsertInventarioItem"
    });
  },

  upsertReposicion(item = {}) {
    const currentItems = normalizeArray(store.get("data.reposiciones", []));
    const nextItems = upsertItemInCollection(
      currentItems,
      item,
      collectionIdKeys("reposiciones")
    );

    return store.setAt("data.reposiciones", nextItems, {
      type: "data:upsertReposicion"
    });
  },

  upsertAlerta(item = {}) {
    const currentItems = normalizeArray(store.get("data.alertas", []));
    const nextItems = upsertItemInCollection(
      currentItems,
      item,
      collectionIdKeys("alertas")
    );

    return store.setAt("data.alertas", nextItems, {
      type: "data:upsertAlerta"
    });
  },

  updateCollectionItem(collectionName, id, patch = {}, idKeys = null) {
    const path = ensureCollectionPath(collectionName);
    const currentItems = normalizeArray(store.get(path, []));
    const nextItems = updateItemInCollection(
      currentItems,
      id,
      patch,
      normalizeArray(idKeys)?.length ? idKeys : collectionIdKeys(collectionName)
    );

    return store.setAt(path, nextItems, {
      type: "data:updateCollectionItem",
      collectionName,
      id
    });
  },

  removeCollectionItem(collectionName, id, idKeys = null) {
    const path = ensureCollectionPath(collectionName);
    const currentItems = normalizeArray(store.get(path, []));
    const nextItems = removeItemFromCollection(
      currentItems,
      id,
      normalizeArray(idKeys)?.length ? idKeys : collectionIdKeys(collectionName)
    );

    return store.setAt(path, nextItems, {
      type: "data:removeCollectionItem",
      collectionName,
      id
    });
  },

  removeBotiquin(id) {
    const nextState = store.setAt(
      "data.botiquines",
      removeItemFromCollection(
        store.get("data.botiquines", []),
        id,
        collectionIdKeys("botiquines")
      ),
      { type: "data:removeBotiquin" }
    );

    const selectedId = normalizeId(nextState.selectedBotiquinId);
    if (selectedId && selectedId === normalizeId(id)) {
      return store.patch(
        { selectedBotiquinId: null },
        { type: "botiquin:clearRemovedSelection" }
      );
    }

    return nextState;
  },

  removeCatalogoItem(id) {
    return store.setAt(
      "data.catalogo",
      removeItemFromCollection(
        store.get("data.catalogo", []),
        id,
        collectionIdKeys("catalogo")
      ),
      { type: "data:removeCatalogoItem" }
    );
  },

  removeInventarioItem(id) {
    return store.setAt(
      "data.inventario",
      removeItemFromCollection(
        store.get("data.inventario", []),
        id,
        collectionIdKeys("inventario")
      ),
      { type: "data:removeInventarioItem" }
    );
  },

  removeInspeccion(id) {
    return store.setAt(
      "data.inspecciones",
      removeItemFromCollection(
        store.get("data.inspecciones", []),
        id,
        collectionIdKeys("inspecciones")
      ),
      { type: "data:removeInspeccion" }
    );
  },

  removeReposicion(id) {
    return store.setAt(
      "data.reposiciones",
      removeItemFromCollection(
        store.get("data.reposiciones", []),
        id,
        collectionIdKeys("reposiciones")
      ),
      { type: "data:removeReposicion" }
    );
  },

  removeAlerta(id) {
    return store.setAt(
      "data.alertas",
      removeItemFromCollection(
        store.get("data.alertas", []),
        id,
        collectionIdKeys("alertas")
      ),
      { type: "data:removeAlerta" }
    );
  },

  setLastSync(date = new Date().toISOString()) {
    return store.patchAt(
      "meta",
      {
        lastSync: date
      },
      { type: "meta:setLastSync" }
    );
  },

  setLastError(error) {
    return store.patchAt(
      "meta",
      {
        lastError: sanitizeError(error)
      },
      { type: "meta:setLastError" }
    );
  },

  clearLastError() {
    return store.patchAt(
      "meta",
      {
        lastError: null
      },
      { type: "meta:clearLastError" }
    );
  },

  openModal(modalName, payload = null) {
    return store.patchAt(
      "ui",
      {
        activeModal: modalName || null,
        modalPayload: payload
      },
      { type: "ui:openModal" }
    );
  },

  closeModal() {
    return store.patchAt(
      "ui",
      {
        activeModal: null,
        modalPayload: null
      },
      { type: "ui:closeModal" }
    );
  },

  setSidebarOpen(value) {
    return store.patchAt(
      "ui",
      {
        sidebarOpen: Boolean(value)
      },
      { type: "ui:setSidebarOpen" }
    );
  },

  addToast(toast) {
    const currentToasts = store.get("ui.toasts", []);
    return store.patchAt(
      "ui",
      {
        toasts: [...currentToasts, normalizeToast(toast)]
      },
      { type: "ui:addToast" }
    );
  },

  removeToast(toastId) {
    const currentToasts = store.get("ui.toasts", []);
    return store.patchAt(
      "ui",
      {
        toasts: currentToasts.filter((item) => item.id !== toastId)
      },
      { type: "ui:removeToast" }
    );
  },

  clearToasts() {
    return store.patchAt(
      "ui",
      {
        toasts: []
      },
      { type: "ui:clearToasts" }
    );
  },

  hydrateAll(payload = {}) {
    const safePayload = isPlainObject(payload) ? payload : {};

    const nextData = {
      dashboard: safePayload.dashboard ?? null,
      botiquines: normalizeArray(safePayload.botiquines),
      catalogo: normalizeArray(safePayload.catalogo),
      inspecciones: normalizeArray(safePayload.inspecciones),
      inventario: normalizeArray(safePayload.inventario),
      reposiciones: normalizeArray(safePayload.reposiciones),
      alertas: normalizeArray(safePayload.alertas),
      pedido: normalizePedidoState(safePayload.pedido ?? DEFAULT_PEDIDO)
    };

    const currentSelectedId = normalizeId(store.get("selectedBotiquinId"));
    const selectionStillExists = nextData.botiquines.some(
      (item) => getBotiquinCollectionId(item) === currentSelectedId
    );

    return store.patch(
      {
        data: nextData,
        selectedBotiquinId: selectionStillExists ? currentSelectedId : null,
        meta: {
          ...store.get("meta"),
          lastSync: new Date().toISOString(),
          lastError: null
        }
      },
      { type: "data:hydrateAll" }
    );
  },

  resetAppState() {
    return store.reset({ type: "app:resetState" });
  }
};

/* ======================================
   UTILIDAD DE SELECT
====================================== */

export function select(selector, customState = null) {
  const baseState = customState || store.getState();

  if (typeof selector === "function") {
    return selector(baseState);
  }

  if (typeof selector === "string") {
    return getValueAtPath(baseState, selector);
  }

  return undefined;
}
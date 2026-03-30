import { buildApiGetUrl, getApiUrl, hasApiConfigured } from "./config.js";

/* ======================================
   HEADERS Y CONFIG BASE
====================================== */

const DEFAULT_JSON_HEADERS = {
  Accept: "application/json"
};

const DEFAULT_POST_HEADERS = {
  "Content-Type": "text/plain;charset=utf-8",
  Accept: "application/json"
};

const DEFAULT_TIMEOUT_MS = 20000;

/* ======================================
   HELPERS BÁSICOS
====================================== */

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function ensurePlainObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeTrimmedString(value, fallback = "") {
  return safeString(value, fallback).trim();
}

function safeUpperString(value, fallback = "") {
  return safeTrimmedString(value, fallback).toUpperCase();
}

function safeLowerString(value, fallback = "") {
  return safeTrimmedString(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInteger(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(ensurePlainObject(params)).filter(([, value]) => {
      return value !== undefined && value !== null && value !== "";
    })
  );
}

function cleanObject(obj = {}) {
  return Object.fromEntries(
    Object.entries(ensurePlainObject(obj)).filter(([, value]) => {
      return value !== undefined;
    })
  );
}

function compactObject(obj = {}) {
  return Object.fromEntries(
    Object.entries(ensurePlainObject(obj)).filter(([, value]) => {
      return value !== undefined && value !== null && value !== "";
    })
  );
}

function resolveRecordId(record = {}) {
  const safeRecord = ensurePlainObject(record);

  return safeTrimmedString(
    safeRecord.id_registro ??
      safeRecord.id ??
      safeRecord.itemId ??
      safeRecord.item_id ??
      safeRecord.id_item ??
      safeRecord.rowId ??
      safeRecord.row_id ??
      safeRecord._id ??
      ""
  );
}

function ensureApiConfigured() {
  if (!hasApiConfigured()) {
    throw new Error(
      "La API aún no está configurada. Pega la URL del Web App en config.js."
    );
  }
}

function ensureRecordId(id) {
  const safeId = safeTrimmedString(id);

  if (!safeId) {
    throw new Error("Debes indicar el id del registro.");
  }

  return safeId;
}

function ensureRequiredString(value, label) {
  const safeValue = safeTrimmedString(value);

  if (!safeValue) {
    throw new Error(`Debes indicar ${label}.`);
  }

  return safeValue;
}

function ensurePositiveNumber(value, label) {
  const parsed = safeNumber(value, NaN);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Debes indicar ${label} con un valor válido.`);
  }

  return parsed;
}

function normalizeBooleanFlag(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (
      ["true", "1", "si", "sí", "activo", "activa", "yes", "y"].includes(
        normalized
      )
    ) {
      return true;
    }

    if (
      ["false", "0", "no", "inactivo", "inactiva", "not", "n"].includes(
        normalized
      )
    ) {
      return false;
    }
  }

  return fallback;
}

function withTimeoutSignal(timeoutMs = DEFAULT_TIMEOUT_MS, externalSignal) {
  const controller = new AbortController();
  let timeoutId = null;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true
      });
    }
  }

  timeoutId = setTimeout(() => {
    controller.abort(new DOMException("Timeout", "AbortError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup
  };
}

async function safeJsonParse(response) {
  const text = await response.text();

  if (!text?.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`La API no devolvió JSON válido.\nRespuesta recibida: ${text}`);
  }
}

function normalizeApiErrorMessage(data, status) {
  return (
    data?.error ||
    data?.message ||
    data?.mensaje ||
    data?.details ||
    (status ? `Error HTTP ${status}` : "La API respondió con error.")
  );
}

function isAbortLikeError(error) {
  return (
    error?.name === "AbortError" ||
    /aborted|abort|timeout/i.test(safeString(error?.message))
  );
}

async function handleResponse(response) {
  const data = await safeJsonParse(response);

  if (!response.ok) {
    throw new Error(normalizeApiErrorMessage(data, response.status));
  }

  if (data?.ok === false) {
    throw new Error(normalizeApiErrorMessage(data, response.status));
  }

  return data;
}

function unwrapData(result, fallback) {
  if (result?.data !== undefined) return result.data;
  if (result?.result !== undefined) return result.result;
  if (result?.message !== undefined && result?.ok === true) return result.message;
  return fallback;
}

function normalizeArrayResponse(result) {
  const data = unwrapData(result, []);

  if (Array.isArray(data)) return data;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.rows)) return result.rows;

  return [];
}

function normalizeObjectResponse(result) {
  const data = unwrapData(result, {});

  if (isPlainObject(data)) return data;
  return {};
}

function normalizeMutationResult(result, fallbackRecord = {}) {
  const safeResult = ensurePlainObject(result);
  const safeData = ensurePlainObject(unwrapData(safeResult, {}), {});

  const record =
    safeData.record ||
    safeData.item ||
    safeData.row ||
    safeData.result ||
    safeResult.record ||
    fallbackRecord;

  return {
    ...safeResult,
    data: safeData,
    record: isPlainObject(record) ? record : fallbackRecord
  };
}

function normalizeListFilters(filters = {}) {
  const safeFilters = ensurePlainObject(filters);

  return cleanParams({
    id_registro:
      safeFilters.id_registro ??
      safeFilters.idRegistro ??
      safeFilters.recordId ??
      "",
    id_botiquin:
      safeFilters.id_botiquin ??
      safeFilters.botiquinId ??
      safeFilters.idBotiquin ??
      "",
    id_item:
      safeFilters.id_item ??
      safeFilters.itemId ??
      safeFilters.item_id ??
      "",
    id_elemento:
      safeFilters.id_elemento ??
      safeFilters.elementoId ??
      safeFilters.idElemento ??
      "",
    tipo_botiquin:
      safeFilters.tipo_botiquin ??
      safeFilters.tipoBotiquin ??
      "",
    categoria: safeFilters.categoria ?? "",
    estado: safeFilters.estado ?? "",
    activo:
      typeof safeFilters.activo === "boolean"
        ? String(safeFilters.activo)
        : safeFilters.activo ?? "",
    q: safeFilters.q ?? safeFilters.search ?? "",
    limit: safeFilters.limit ?? "",
    offset: safeFilters.offset ?? ""
  });
}

/* ======================================
   NORMALIZADORES DE DOMINIO
====================================== */

function normalizeInventarioItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return {
    id_registro: resolveRecordId(safeItem),
    id_item: safeTrimmedString(
      safeItem.id_item ?? safeItem.item_id ?? safeItem.itemId ?? safeItem.id_elemento ?? ""
    ),
    id_elemento: safeTrimmedString(
      safeItem.id_elemento ?? safeItem.id_item ?? safeItem.item_id ?? safeItem.itemId ?? ""
    ),
    id_botiquin: safeTrimmedString(
      safeItem.id_botiquin ?? safeItem.botiquinId ?? safeItem.idBotiquin ?? ""
    ),
    elemento: safeTrimmedString(
      safeItem.elemento ?? safeItem.nombre_elemento ?? safeItem.nombre ?? ""
    ),
    nombre_elemento: safeTrimmedString(
      safeItem.nombre_elemento ?? safeItem.elemento ?? safeItem.nombre ?? ""
    ),
    categoria: safeTrimmedString(safeItem.categoria),
    unidad: safeTrimmedString(safeItem.unidad),
    cantidad_actual: safeNumber(
      safeItem.cantidad_actual ?? safeItem.cantidadActual ?? safeItem.cantidad
    ),
    cantidad_minima: safeNumber(
      safeItem.cantidad_minima ??
        safeItem.cantidadMinima ??
        safeItem.stockMinimo ??
        safeItem.cantidad_requerida
    ),
    cantidad_requerida: safeNumber(
      safeItem.cantidad_requerida ??
        safeItem.cantidad_minima ??
        safeItem.cantidadMinima ??
        safeItem.stockMinimo
    ),
    lote: safeTrimmedString(safeItem.lote),
    fecha_vencimiento: safeTrimmedString(
      safeItem.fecha_vencimiento ?? safeItem.fechaVencimiento
    ),
    ubicacion: safeTrimmedString(safeItem.ubicacion),
    observaciones: safeTrimmedString(safeItem.observaciones),
    activo: normalizeBooleanFlag(safeItem.activo, true),
    estado: safeTrimmedString(safeItem.estado),
    dias_para_vencimiento: safeInteger(
      safeItem.dias_para_vencimiento ?? safeItem.diasParaVencimiento,
      0
    ),
    bajo_stock: normalizeBooleanFlag(
      safeItem.bajo_stock ?? safeItem.bajoStock,
      false
    )
  };
}

function normalizeInventarioPayload(payload = {}) {
  const safePayload = ensurePlainObject(payload);
  const idRegistro = resolveRecordId(safePayload);

  if (!idRegistro) {
    throw new Error("No se puede actualizar inventario sin id_registro.");
  }

  return cleanObject({
    id_registro: idRegistro,
    id_item: safeTrimmedString(
      safePayload.id_item ?? safePayload.item_id ?? safePayload.itemId
    ),
    id_elemento: safeTrimmedString(
      safePayload.id_elemento ??
        safePayload.id_item ??
        safePayload.item_id ??
        safePayload.itemId
    ),
    id_botiquin: safeTrimmedString(
      safePayload.id_botiquin ?? safePayload.botiquinId ?? safePayload.idBotiquin
    ),
    elemento: safeTrimmedString(
      safePayload.elemento ?? safePayload.nombre_elemento
    ),
    categoria: safeTrimmedString(safePayload.categoria),
    unidad: safeTrimmedString(safePayload.unidad),
    cantidad_actual: safeNumber(
      safePayload.cantidad_actual ?? safePayload.cantidadActual ?? safePayload.cantidad
    ),
    cantidad_minima: safeNumber(
      safePayload.cantidad_minima ??
        safePayload.cantidadMinima ??
        safePayload.stockMinimo ??
        safePayload.cantidad_requerida
    ),
    lote: safeTrimmedString(safePayload.lote),
    fecha_vencimiento: safeTrimmedString(
      safePayload.fecha_vencimiento ?? safePayload.fechaVencimiento
    ),
    ubicacion: safeTrimmedString(safePayload.ubicacion),
    observaciones: safeTrimmedString(safePayload.observaciones),
    activo: normalizeBooleanFlag(safePayload.activo, true)
  });
}

function normalizeCatalogoItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return {
    id_elemento: safeTrimmedString(
      safeItem.id_elemento ?? safeItem.id_item ?? safeItem.itemId ?? safeItem.id ?? ""
    ),
    nombre_elemento: safeTrimmedString(
      safeItem.nombre_elemento ?? safeItem.elemento ?? safeItem.nombre ?? ""
    ),
    tipo_botiquin: safeTrimmedString(
      safeItem.tipo_botiquin ?? safeItem.tipoBotiquin ?? safeItem.tipo ?? ""
    ),
    categoria: safeTrimmedString(safeItem.categoria),
    cantidad_requerida: safeNumber(
      safeItem.cantidad_requerida ??
        safeItem.cantidad_minima ??
        safeItem.cantidadMinima ??
        safeItem.stockMinimo
    ),
    unidad: safeTrimmedString(safeItem.unidad),
    tiene_vencimiento: normalizeBooleanFlag(
      safeItem.tiene_vencimiento ?? safeItem.tieneVencimiento,
      false
    ),
    requiere_lote: normalizeBooleanFlag(
      safeItem.requiere_lote ?? safeItem.requiereLote,
      false
    ),
    activo: normalizeBooleanFlag(safeItem.activo, true),
    observaciones: safeTrimmedString(safeItem.observaciones),
    ...safeItem
  };
}

function normalizeInspeccionDetailItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return cleanObject({
    id_registro: safeTrimmedString(safeItem.id_registro ?? safeItem.id),
    id_item: ensureRequiredString(
      safeItem.id_item ?? safeItem.item_id ?? safeItem.itemId,
      "el id del ítem en el detalle"
    ),
    elemento: safeTrimmedString(safeItem.elemento),
    categoria: safeTrimmedString(safeItem.categoria),
    unidad: safeTrimmedString(safeItem.unidad),
    cantidad_sistema: safeNumber(
      safeItem.cantidad_sistema ?? safeItem.cantidadSistema
    ),
    cantidad_encontrada: safeNumber(
      safeItem.cantidad_encontrada ??
        safeItem.cantidadEncontrada ??
        safeItem.cantidad_actual ??
        safeItem.cantidadActual
    ),
    estado_item: safeTrimmedString(
      safeItem.estado_item ?? safeItem.estadoItem ?? safeItem.estado
    ),
    accion_requerida: safeTrimmedString(
      safeItem.accion_requerida ?? safeItem.accionRequerida ?? safeItem.accion
    ),
    fecha_vencimiento: safeTrimmedString(
      safeItem.fecha_vencimiento ?? safeItem.fechaVencimiento
    ),
    observacion: safeTrimmedString(
      safeItem.observacion ?? safeItem.observaciones
    )
  });
}

function normalizeInspeccionPayload(payload = {}) {
  const safePayload = ensurePlainObject(payload);
  const detalleRaw = ensureArray(safePayload.detalle, []);

  const normalized = cleanObject({
    id_inspeccion: safeTrimmedString(safePayload.id_inspeccion ?? safePayload.id),
    id_botiquin: ensureRequiredString(
      safePayload.id_botiquin ?? safePayload.botiquinId ?? safePayload.idBotiquin,
      "el botiquín"
    ),
    fecha: ensureRequiredString(safePayload.fecha, "la fecha"),
    hora: safeTrimmedString(safePayload.hora),
    responsable: ensureRequiredString(safePayload.responsable, "el responsable"),
    estado_general: safeTrimmedString(
      safePayload.estado_general ?? safePayload.estadoGeneral
    ),
    observaciones_generales: safeTrimmedString(
      safePayload.observaciones_generales ?? safePayload.observacionesGenerales
    ),
    detalle: detalleRaw.map(normalizeInspeccionDetailItem)
  });

  if (!normalized.detalle.length) {
    throw new Error("La inspección debe incluir al menos un ítem en el detalle.");
  }

  return normalized;
}

function normalizeReposicionPayload(payload = {}) {
  const safePayload = ensurePlainObject(payload);

  return cleanObject({
    id_reposicion: safeTrimmedString(safePayload.id_reposicion ?? safePayload.id),
    id_inspeccion_origen: safeTrimmedString(
      safePayload.id_inspeccion_origen ?? safePayload.idInspeccionOrigen
    ),
    id_botiquin: ensureRequiredString(
      safePayload.id_botiquin ?? safePayload.botiquinId ?? safePayload.idBotiquin,
      "el botiquín"
    ),
    id_item: ensureRequiredString(
      safePayload.id_item ?? safePayload.itemId ?? safePayload.item_id,
      "el ítem"
    ),
    elemento: safeTrimmedString(safePayload.elemento),
    categoria: safeTrimmedString(safePayload.categoria),
    unidad: safeTrimmedString(safePayload.unidad),
    cantidad_repuesta: ensurePositiveNumber(
      safePayload.cantidad_repuesta ??
        safePayload.cantidadRepuesta ??
        safePayload.cantidad,
      "la cantidad repuesta"
    ),
    responsable: ensureRequiredString(safePayload.responsable, "el responsable"),
    fecha: ensureRequiredString(safePayload.fecha, "la fecha"),
    motivo: safeTrimmedString(safePayload.motivo),
    lote: safeTrimmedString(safePayload.lote),
    fecha_vencimiento_nueva: safeTrimmedString(
      safePayload.fecha_vencimiento_nueva ?? safePayload.fechaVencimientoNueva
    ),
    observaciones: safeTrimmedString(safePayload.observaciones)
  });
}

function normalizeBotiquinItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return {
    id_botiquin: safeTrimmedString(
      safeItem.id_botiquin ?? safeItem.botiquinId ?? safeItem.id ?? ""
    ),
    nombre: safeTrimmedString(safeItem.nombre),
    sede: safeTrimmedString(safeItem.sede),
    tipo: safeTrimmedString(safeItem.tipo),
    tipo_botiquin: safeTrimmedString(
      safeItem.tipo_botiquin ?? safeItem.tipoBotiquin ?? safeItem.tipo
    ),
    ubicacion: safeTrimmedString(safeItem.ubicacion),
    responsable: safeTrimmedString(safeItem.responsable),
    activo: normalizeBooleanFlag(safeItem.activo, true),
    ...safeItem
  };
}

function normalizeInspeccionItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return {
    id_inspeccion: safeTrimmedString(safeItem.id_inspeccion ?? safeItem.id),
    id_botiquin: safeTrimmedString(
      safeItem.id_botiquin ?? safeItem.botiquinId ?? safeItem.idBotiquin
    ),
    fecha: safeTrimmedString(safeItem.fecha),
    hora: safeTrimmedString(safeItem.hora),
    responsable: safeTrimmedString(safeItem.responsable),
    estado_general: safeTrimmedString(
      safeItem.estado_general ?? safeItem.estadoGeneral
    ),
    observaciones_generales: safeTrimmedString(
      safeItem.observaciones_generales ?? safeItem.observacionesGenerales
    ),
    ...safeItem
  };
}

function normalizeReposicionItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return {
    id_reposicion: safeTrimmedString(safeItem.id_reposicion ?? safeItem.id),
    id_inspeccion_origen: safeTrimmedString(
      safeItem.id_inspeccion_origen ?? safeItem.idInspeccionOrigen
    ),
    id_botiquin: safeTrimmedString(
      safeItem.id_botiquin ?? safeItem.botiquinId ?? safeItem.idBotiquin
    ),
    id_item: safeTrimmedString(
      safeItem.id_item ?? safeItem.itemId ?? safeItem.item_id
    ),
    elemento: safeTrimmedString(safeItem.elemento),
    cantidad_repuesta: safeNumber(
      safeItem.cantidad_repuesta ?? safeItem.cantidadRepuesta ?? safeItem.cantidad
    ),
    fecha: safeTrimmedString(safeItem.fecha),
    responsable: safeTrimmedString(safeItem.responsable),
    ...safeItem
  };
}

function normalizeAlertaItem(item = {}) {
  const safeItem = ensurePlainObject(item);

  return {
    tipo: safeTrimmedString(safeItem.tipo),
    severidad: safeTrimmedString(safeItem.severidad),
    titulo: safeTrimmedString(safeItem.titulo),
    descripcion: safeTrimmedString(safeItem.descripcion),
    id_botiquin: safeTrimmedString(
      safeItem.id_botiquin ?? safeItem.botiquinId ?? safeItem.idBotiquin
    ),
    id_item: safeTrimmedString(
      safeItem.id_item ?? safeItem.itemId ?? safeItem.item_id
    ),
    ...safeItem
  };
}

/* ======================================
   CORE HTTP
====================================== */

async function request(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    headers = {},
    ...restOptions
  } = options;

  const { signal, cleanup } = withTimeoutSignal(timeoutMs, externalSignal);

  try {
    const response = await fetch(url, {
      ...restOptions,
      headers,
      signal
    });

    return await handleResponse(response);
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error("La solicitud a la API tardó demasiado o fue cancelada.");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "No fue posible conectarse con la API. Revisa la URL del Web App, permisos y despliegue."
      );
    }

    throw error;
  } finally {
    cleanup();
  }
}

async function apiGet(action, params = {}, options = {}) {
  ensureApiConfigured();

  const url = buildApiGetUrl(action, cleanParams(params));
  return request(url, {
    method: "GET",
    headers: DEFAULT_JSON_HEADERS,
    ...options
  });
}

async function apiPost(action, payload = {}, options = {}) {
  ensureApiConfigured();

  return request(getApiUrl(), {
    method: "POST",
    headers: DEFAULT_POST_HEADERS,
    body: JSON.stringify({
      action,
      payload: ensurePlainObject(payload)
    }),
    ...options
  });
}

/* ======================================
   SISTEMA
====================================== */

export async function pingApi(options = {}) {
  const result = await apiGet("ping", {}, options);
  return unwrapData(result, result);
}

export async function recalculateInventoryStatesApi(options = {}) {
  const result = await apiGet("recalcularEstados", {}, options);
  return unwrapData(result, result);
}

export async function sendAlertsNowApi(options = {}) {
  const result = await apiGet("sendAlertsNow", {}, options);
  return unwrapData(result, result);
}

export async function sendMonthlySummaryNowApi(options = {}) {
  const result = await apiGet("sendMonthlySummaryNow", {}, options);
  return unwrapData(result, result);
}

/* ======================================
   DASHBOARD
====================================== */

export async function getDashboard(options = {}) {
  const result = await apiGet("getDashboard", {}, options);
  return normalizeObjectResponse(result);
}

/* ======================================
   BOTIQUINES
====================================== */

export async function getBotiquines(options = {}) {
  const result = await apiGet("getBotiquines", {}, options);
  return normalizeArrayResponse(result).map(normalizeBotiquinItem);
}

export async function getBotiquinById(idBotiquin, options = {}) {
  const safeId = ensureRequiredString(idBotiquin, "el id del botiquín");
  const botiquines = await getBotiquines(options);
  return botiquines.find((item) => item.id_botiquin === safeId) || null;
}

/* ======================================
   CATÁLOGO
====================================== */

export async function getCatalogo(filters = {}, options = {}) {
  const params =
    typeof filters === "string"
      ? { tipo_botiquin: filters }
      : normalizeListFilters(filters);

  const result = await apiGet("getCatalogo", params, options);
  return normalizeArrayResponse(result).map(normalizeCatalogoItem);
}

export async function getCatalogoByTipo(tipoBotiquin, options = {}) {
  const safeTipo = ensureRequiredString(tipoBotiquin, "el tipo de botiquín");
  return getCatalogo({ tipo_botiquin: safeTipo }, options);
}

export async function getCatalogoItemById(idElemento, options = {}) {
  const safeId = ensureRequiredString(idElemento, "el id del elemento");
  const result = await apiGet("getCatalogo", { id_elemento: safeId }, options);
  const rows = normalizeArrayResponse(result).map(normalizeCatalogoItem);
  return rows.find((item) => item.id_elemento === safeId) || null;
}

/* ======================================
   INVENTARIO
====================================== */

export async function getInventario(filters = {}, options = {}) {
  const params =
    typeof filters === "string"
      ? { id_botiquin: filters }
      : normalizeListFilters(filters);

  const result = await apiGet("getInventario", params, options);
  return normalizeArrayResponse(result).map(normalizeInventarioItem);
}

export async function getInventarioByBotiquin(idBotiquin, options = {}) {
  const safeId = ensureRequiredString(idBotiquin, "el id del botiquín");
  return getInventario({ id_botiquin: safeId }, options);
}

export async function getInventarioItemById(id, options = {}) {
  const safeId = ensureRecordId(id);
  const result = await apiGet("getInventario", { id_registro: safeId }, options);
  const rows = normalizeArrayResponse(result).map(normalizeInventarioItem);

  return (
    rows.find(
      (item) =>
        item.id_registro === safeId ||
        item.id_item === safeId ||
        item.id_elemento === safeId
    ) || null
  );
}

/**
 * El backend actual no expone creación genérica de inventario.
 */
export async function createInventarioItem() {
  throw new Error(
    "El backend actual no tiene acción para crear ítems de inventario desde el frontend."
  );
}

export async function updateInventarioItem(payload = {}, options = {}) {
  const normalizedPayload = normalizeInventarioPayload(payload);
  const result = await apiPost("updateInventarioItem", normalizedPayload, options);

  return normalizeMutationResult(result, normalizedPayload);
}

/**
 * El backend actual no expone borrado de inventario.
 */
export async function deleteInventarioItem() {
  throw new Error(
    "El backend actual no tiene acción para eliminar ítems de inventario desde el frontend."
  );
}

/* ======================================
   INSPECCIONES
====================================== */

export async function getInspecciones(filters = {}, options = {}) {
  const params =
    typeof filters === "string"
      ? { id_botiquin: filters }
      : normalizeListFilters(filters);

  const result = await apiGet("getInspecciones", params, options);
  return normalizeArrayResponse(result).map(normalizeInspeccionItem);
}

export async function getInspeccionesByBotiquin(idBotiquin, options = {}) {
  const safeId = ensureRequiredString(idBotiquin, "el id del botiquín");
  return getInspecciones({ id_botiquin: safeId }, options);
}

export async function createInspeccion(payload = {}, options = {}) {
  const normalizedPayload = normalizeInspeccionPayload(payload);
  const result = await apiPost("saveInspeccion", normalizedPayload, options);

  return normalizeMutationResult(result, normalizedPayload);
}

export async function saveInspeccion(payload = {}, options = {}) {
  return createInspeccion(payload, options);
}

export async function updateInspeccion() {
  throw new Error(
    "El backend actual no tiene acción para editar inspecciones existentes."
  );
}

export async function deleteInspeccion() {
  throw new Error(
    "El backend actual no tiene acción para eliminar inspecciones."
  );
}

/* ======================================
   REPOSICIONES
====================================== */

export async function getReposiciones(filters = {}, options = {}) {
  const params =
    typeof filters === "string"
      ? { id_botiquin: filters }
      : normalizeListFilters(filters);

  const result = await apiGet("getReposiciones", params, options);
  return normalizeArrayResponse(result).map(normalizeReposicionItem);
}

export async function getReposicionesByBotiquin(idBotiquin, options = {}) {
  const safeId = ensureRequiredString(idBotiquin, "el id del botiquín");
  return getReposiciones({ id_botiquin: safeId }, options);
}

export async function createReposicion(payload = {}, options = {}) {
  const normalizedPayload = normalizeReposicionPayload(payload);
  const result = await apiPost("saveReposicion", normalizedPayload, options);

  return normalizeMutationResult(result, normalizedPayload);
}

export async function saveReposicion(payload = {}, options = {}) {
  return createReposicion(payload, options);
}

export async function updateReposicion() {
  throw new Error(
    "El backend actual no tiene acción para editar reposiciones existentes."
  );
}

export async function deleteReposicion() {
  throw new Error(
    "El backend actual no tiene acción para eliminar reposiciones."
  );
}

/* ======================================
   ALERTAS
====================================== */

export async function getAlertas(filters = {}, options = {}) {
  const params =
    typeof filters === "string"
      ? { id_botiquin: filters }
      : normalizeListFilters(filters);

  const result = await apiGet("getAlertas", params, options);
  return normalizeArrayResponse(result).map(normalizeAlertaItem);
}

/* ======================================
   PEDIDO / CARGAS COMPUESTAS
====================================== */

export async function getPedidoBaseData(options = {}) {
  const [inventario, catalogo, botiquines] = await Promise.all([
    getInventario({}, options),
    getCatalogo({}, options),
    getBotiquines(options)
  ]);

  return {
    inventario,
    catalogo,
    botiquines
  };
}

export async function getFullPedidoData(options = {}) {
  const [inventario, catalogo, botiquines, alertas] = await Promise.all([
    getInventario({}, options),
    getCatalogo({}, options),
    getBotiquines(options),
    getAlertas({}, options).catch(() => [])
  ]);

  return {
    inventario,
    catalogo,
    botiquines,
    alertas
  };
}

/* ======================================
   CARGA INICIAL
====================================== */

export async function getInitialData(options = {}) {
  const [dashboard, botiquines] = await Promise.all([
    getDashboard(options),
    getBotiquines(options)
  ]);

  return {
    dashboard,
    botiquines
  };
}

export async function getFullBotiquinData(idBotiquin, options = {}) {
  const safeId = ensureRequiredString(idBotiquin, "el id del botiquín");

  const [inventario, inspecciones, reposiciones] = await Promise.all([
    getInventario({ id_botiquin: safeId }, options),
    getInspecciones({ id_botiquin: safeId }, options),
    getReposiciones({ id_botiquin: safeId }, options)
  ]);

  return {
    id_botiquin: safeId,
    inventario,
    inspecciones,
    reposiciones
  };
}

/* ======================================
   EXPORTS AUXILIARES
====================================== */

export {
  apiGet,
  apiPost,
  request,
  handleResponse,
  ensureApiConfigured,
  ensureRecordId,
  resolveRecordId,
  normalizeInventarioPayload,
  normalizeInspeccionPayload,
  normalizeReposicionPayload,
  normalizeInventarioItem,
  normalizeCatalogoItem,
  normalizeInspeccionItem,
  normalizeReposicionItem,
  normalizeAlertaItem,
  normalizeListFilters,
  compactObject,
  cleanObject,
  cleanParams,
  safeString,
  safeTrimmedString,
  safeNumber,
  safeInteger,
  normalizeBooleanFlag
};
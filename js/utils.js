import {
  APP_CONFIG,
  getDefaultAlertDays,
  getDefaultCriticalDays,
  getLocale,
  getTimeZone,
  getEmptyValueLabel,
  getEmptyState,
  getVisualStatus,
  getUiConfig
} from "./config.js";

/* ======================================
   CONSTANTES
====================================== */

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DEFAULT_TEXT_FALLBACK = getEmptyValueLabel?.() || "—";
const DEFAULT_LOCALE = getLocale?.() || "es-CO";
const DEFAULT_TIMEZONE = getTimeZone?.() || "America/Bogota";
const STORAGE_PREFIX = "musicala-botiquines";
const UI_CONFIG = getUiConfig?.() || {};
const DEFAULT_EMPTY_ICON = UI_CONFIG.defaultEmptyIcon || "📭";

/* ======================================
   TIPOS Y NORMALIZACIÓN BASE
====================================== */

export function isNil(value) {
  return value === null || value === undefined;
}

export function isDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isString(value) {
  return typeof value === "string";
}

export function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function isTruthyString(value) {
  return isString(value) && value.trim() !== "";
}

export function text(value, fallback = DEFAULT_TEXT_FALLBACK) {
  if (isNil(value)) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

export function safeString(value, fallback = "") {
  if (isNil(value)) return fallback;
  return String(value);
}

export function safeTrimmedString(value, fallback = "") {
  return safeString(value, fallback).trim();
}

export function normalizeText(value = "") {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeId(value, fallback = null) {
  const normalized = safeTrimmedString(value);
  return normalized || fallback;
}

export function toBoolean(value, fallback = false) {
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

export function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function capitalize(value = "") {
  const str = safeTrimmedString(value);
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toTitleCase(value = "") {
  return safeTrimmedString(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => capitalize(part.toLowerCase()))
    .join(" ");
}

export function escapeHTML(value = "") {
  return safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function truncate(value = "", maxLength = 100) {
  const str = safeString(value);
  const safeMax = Math.max(1, Number(maxLength) || 1);

  if (str.length <= safeMax) return str;
  return `${str.slice(0, Math.max(0, safeMax - 1)).trim()}…`;
}

export function includesText(source, query) {
  return normalizeText(source).includes(normalizeText(query));
}

export function equalsText(a, b) {
  return normalizeText(a) === normalizeText(b);
}

export function compactObject(obj = {}) {
  if (!isPlainObject(obj)) return {};

  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      return value !== undefined && value !== null && value !== "";
    })
  );
}

export function pick(obj = {}, keys = []) {
  if (!isPlainObject(obj)) return {};

  return ensureArray(keys).reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
}

export function omit(obj = {}, keys = []) {
  if (!isPlainObject(obj)) return {};

  const blocked = new Set(ensureArray(keys));
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !blocked.has(key))
  );
}

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {
      // fallback abajo, porque la vida insiste en complicarse
    }
  }

  if (isNil(value)) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepClone(item)])
    );
  }

  return value;
}

/* ======================================
   NÚMEROS Y FORMATOS
====================================== */

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const normalized = safeString(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

export function toInteger(value, fallback = 0) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min = 0, max = 1) {
  const number = toNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

export function round(value, decimals = 0) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number)) return 0;

  const factor = 10 ** Math.max(0, decimals);
  return Math.round(number * factor) / factor;
}

export function formatNumber(value, options = {}) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number)) return options.fallback || "0";

  const { fallback, locale = DEFAULT_LOCALE, ...intlOptions } = options;

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    ...intlOptions
  }).format(number);
}

export function formatDecimal(value, decimals = 2, options = {}) {
  return formatNumber(value, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...options
  });
}

export function formatPercent(value, decimals = 0) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number)) return "0%";
  return `${number.toFixed(decimals)}%`;
}

export function formatCurrency(value, options = {}) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number)) return options.fallback || "$0";

  const {
    fallback,
    locale = DEFAULT_LOCALE,
    currency = APP_CONFIG?.defaults?.currency || "COP",
    ...intlOptions
  } = options;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...intlOptions
  }).format(number);
}

/* ======================================
   FECHAS
====================================== */

export function todayISO() {
  return formatDateToISO(new Date());
}

export function nowISO() {
  return new Date().toISOString();
}

export function isValidDate(value) {
  return toDate(value) !== null;
}

export function toDate(value) {
  if (!value && value !== 0) return null;

  if (isDate(value)) {
    return new Date(value.getTime());
  }

  if (typeof value === "number") {
    const numericDate = new Date(value);
    return isDate(numericDate) ? numericDate : null;
  }

  const raw = safeTrimmedString(value);
  if (!raw) return null;

  const isoLike = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:$|[T\s].*)/);
  if (isoLike) {
    const [, year, month, day] = isoLike;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return isRealDate(date, year, month, day) ? date : null;
  }

  const latamLike = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:$|[T\s].*)/);
  if (latamLike) {
    const [, day, month, year] = latamLike;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return isRealDate(date, year, month, day) ? date : null;
  }

  const parsed = new Date(raw);
  return isDate(parsed) ? parsed : null;
}

function isRealDate(date, year, month, day) {
  return (
    isDate(date) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  );
}

export function startOfDay(value = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(value = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function formatDateToISO(value) {
  const date = toDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDate(value, options = {}) {
  const date = toDate(value);
  if (!date) return options.fallback || DEFAULT_TEXT_FALLBACK;

  const { fallback, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE, ...intlOptions } = options;

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
    ...intlOptions
  }).format(date);
}

export function formatDateTime(value, options = {}) {
  const date = toDate(value);
  if (!date) return options.fallback || DEFAULT_TEXT_FALLBACK;

  const { fallback, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE, ...intlOptions } = options;

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    ...intlOptions
  }).format(date);
}

export function formatTime(value, options = {}) {
  const date = toDate(value);
  if (!date) return options.fallback || DEFAULT_TEXT_FALLBACK;

  const { fallback, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE, ...intlOptions } = options;

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    ...intlOptions
  }).format(date);
}

export function diffInDays(fromValue, toValue = new Date()) {
  const from = startOfDay(fromValue);
  const to = startOfDay(toValue);

  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function daysUntil(dateValue, fromValue = new Date()) {
  const target = startOfDay(dateValue);
  const from = startOfDay(fromValue);

  if (!target || !from) return null;
  return Math.round((target.getTime() - from.getTime()) / MS_PER_DAY);
}

export function isDateInRange(value, from, to) {
  const date = toDate(value);
  if (!date) return false;

  const current = startOfDay(date);
  const start = from ? startOfDay(from) : null;
  const end = to ? endOfDay(to) : null;

  if (start && current < start) return false;
  if (end && current > end) return false;

  return true;
}

export function getExpiryStatus(dateValue, options = {}) {
  const soonDays = toInteger(
    options.soonDays,
    getDefaultCriticalDays?.() || 7
  );
  const warningDays = toInteger(
    options.warningDays,
    getDefaultAlertDays?.() || 30
  );

  const date = toDate(dateValue);

  if (!date) {
    return {
      type: "muted",
      label: "Sin fecha",
      days: null,
      isExpired: false,
      isNearExpiry: false,
      isWarningWindow: false,
      isValid: false
    };
  }

  const days = daysUntil(date);

  if (days === null) {
    return {
      type: "muted",
      label: "Sin fecha",
      days: null,
      isExpired: false,
      isNearExpiry: false,
      isWarningWindow: false,
      isValid: false
    };
  }

  if (days < 0) {
    return {
      type: "danger",
      label: "Vencido",
      days,
      isExpired: true,
      isNearExpiry: false,
      isWarningWindow: false,
      isValid: true
    };
  }

  if (days <= soonDays) {
    return {
      type: "alert",
      label: days === 0 ? "Vence hoy" : "Próximo a vencer",
      days,
      isExpired: false,
      isNearExpiry: true,
      isWarningWindow: true,
      isValid: true
    };
  }

  if (days <= warningDays) {
    return {
      type: "warning",
      label: "Por revisar",
      days,
      isExpired: false,
      isNearExpiry: false,
      isWarningWindow: true,
      isValid: true
    };
  }

  return {
    type: "success",
    label: "Vigente",
    days,
    isExpired: false,
    isNearExpiry: false,
    isWarningWindow: false,
    isValid: true
  };
}

export function formatExpiryText(dateValue, options = {}) {
  const status = getExpiryStatus(dateValue, options);

  if (status.days === null) return status.label;
  if (status.days < 0) return `${status.label} · hace ${Math.abs(status.days)} días`;
  if (status.days === 0) return `${status.label} · hoy`;
  return `${status.label} · en ${status.days} días`;
}

/* ======================================
   IDS Y KEYS
====================================== */

export function createId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 8);
  const timestamp = Date.now().toString(36);
  return `${prefix}-${timestamp}-${random}`;
}

export function createBotiquinCode(prefix = "BOT", index = 1) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

export function resolveRecordId(record = {}) {
  if (!isPlainObject(record)) return null;

  return normalizeId(
    record.id_registro ??
      record.id ??
      record.id_item ??
      record.itemId ??
      record.item_id ??
      record.id_inspeccion ??
      record.inspeccionId ??
      record.id_reposicion ??
      record.reposicionId ??
      record.id_botiquin ??
      record.botiquinId ??
      record.rowId ??
      record.row_id ??
      record._id
  );
}

export function getBotiquinId(record = {}) {
  if (!isPlainObject(record)) return null;

  return normalizeId(
    record.id_botiquin ??
      record.botiquinId ??
      record.idBotiquin ??
      record.botiquin_id ??
      record.botiquin?.id_botiquin ??
      record.botiquin?.id
  );
}

export function getElementoId(record = {}) {
  if (!isPlainObject(record)) return null;

  return normalizeId(
    record.id_elemento ??
      record.id_item ??
      record.itemId ??
      record.item_id ??
      record.id ??
      record.elemento?.id_elemento
  );
}

/* ======================================
   ARRAYS Y OBJETOS
====================================== */

export function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ensureObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

export function compactArray(items = []) {
  return ensureArray(items).filter(Boolean);
}

export function unique(items = []) {
  return [...new Set(ensureArray(items))];
}

export function groupBy(items = [], getKey) {
  return ensureArray(items).reduce((acc, item, index) => {
    const key =
      typeof getKey === "function" ? getKey(item, index) : item?.[getKey];

    const safeKey = key ?? "undefined";

    if (!acc[safeKey]) {
      acc[safeKey] = [];
    }

    acc[safeKey].push(item);
    return acc;
  }, {});
}

export function indexBy(items = [], getKey) {
  return ensureArray(items).reduce((acc, item, index) => {
    const key =
      typeof getKey === "function" ? getKey(item, index) : item?.[getKey];

    if (key !== undefined && key !== null && key !== "") {
      acc[key] = item;
    }

    return acc;
  }, {});
}

export function uniqueBy(items = [], getKey) {
  const seen = new Set();

  return ensureArray(items).filter((item, index) => {
    const key =
      typeof getKey === "function" ? getKey(item, index) : item?.[getKey];

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortBy(items = [], getValue, direction = "asc") {
  const safeItems = [...ensureArray(items)];
  const factor = direction === "desc" ? -1 : 1;

  return safeItems.sort((a, b) => {
    const valueA =
      typeof getValue === "function" ? getValue(a) : a?.[getValue];
    const valueB =
      typeof getValue === "function" ? getValue(b) : b?.[getValue];

    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return 1;
    if (valueB == null) return -1;

    if (typeof valueA === "number" && typeof valueB === "number") {
      return (valueA - valueB) * factor;
    }

    if (isValidDate(valueA) && isValidDate(valueB)) {
      return (toDate(valueA).getTime() - toDate(valueB).getTime()) * factor;
    }

    return (
      String(valueA).localeCompare(String(valueB), DEFAULT_LOCALE, {
        sensitivity: "base",
        numeric: true
      }) * factor
    );
  });
}

export function sumBy(items = [], getValue) {
  return ensureArray(items).reduce((total, item, index) => {
    const value =
      typeof getValue === "function" ? getValue(item, index) : item?.[getValue];
    return total + toNumber(value, 0);
  }, 0);
}

export function findById(items = [], id, keyCandidates = []) {
  const targetId = normalizeId(id);
  if (!targetId) return null;

  const keys = [
    "id",
    "id_registro",
    "id_item",
    "id_elemento",
    "itemId",
    "item_id",
    "id_inspeccion",
    "inspeccionId",
    "id_reposicion",
    "reposicionId",
    "id_botiquin",
    "botiquinId",
    ...ensureArray(keyCandidates)
  ];

  return (
    ensureArray(items).find((item) => {
      return keys.some((key) => normalizeId(item?.[key]) === targetId);
    }) || null
  );
}

export function filterByBotiquin(items = [], botiquinId) {
  const targetId = normalizeId(botiquinId);
  if (!targetId) return ensureArray(items);

  return ensureArray(items).filter((item) => getBotiquinId(item) === targetId);
}

export function filterByText(items = [], query, getSearchText) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return ensureArray(items);

  return ensureArray(items).filter((item, index) => {
    const source =
      typeof getSearchText === "function"
        ? getSearchText(item, index)
        : safeString(item?.[getSearchText]);

    return includesText(source, normalizedQuery);
  });
}

export function paginate(items = [], page = 1, pageSize = 20) {
  const safeItems = ensureArray(items);
  const safePage = Math.max(1, toInteger(page, 1));
  const safePageSize = Math.max(1, toInteger(pageSize, 20));
  const total = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = startIndex + safePageSize;

  return {
    items: safeItems.slice(startIndex, endIndex),
    meta: {
      total,
      page: currentPage,
      pageSize: safePageSize,
      totalPages,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages,
      startIndex,
      endIndex: Math.min(endIndex, total)
    }
  };
}

/* ======================================
   PEDIDO / CONSOLIDACIÓN DE FALTANTES
====================================== */

export function normalizeNombreElemento(item = {}) {
  return safeTrimmedString(
    item?.nombre_elemento ?? item?.elemento ?? item?.nombre ?? ""
  );
}

export function getUnidadElemento(item = {}) {
  return safeTrimmedString(item?.unidad ?? item?.unidad_medida ?? "");
}

export function getCantidadActual(item = {}) {
  return toNumber(
    item?.cantidad_actual ?? item?.cantidadActual ?? item?.cantidad ?? 0,
    0
  );
}

export function getCantidadRequerida(item = {}) {
  return toNumber(
    item?.cantidad_requerida ??
      item?.cantidad_minima ??
      item?.cantidadMinima ??
      item?.stockMinimo ??
      0,
    0
  );
}

export function calculateMissingQuantity(actual = 0, required = 0) {
  const safeActual = toNumber(actual, 0);
  const safeRequired = toNumber(required, 0);
  return Math.max(0, safeRequired - safeActual);
}

export function isItemShortage(inventarioItem = {}, catalogoItem = null) {
  const actual = getCantidadActual(inventarioItem);
  const required = getCantidadRequerida(catalogoItem || inventarioItem);
  return calculateMissingQuantity(actual, required) > 0;
}

export function buildCatalogoMap(catalogo = []) {
  return indexBy(
    ensureArray(catalogo).map((item) => ({
      ...item,
      id_elemento: getElementoId(item),
      nombre_elemento: normalizeNombreElemento(item),
      unidad: getUnidadElemento(item),
      cantidad_requerida: getCantidadRequerida(item),
      activo: toBoolean(item?.activo, true)
    })),
    "id_elemento"
  );
}

export function buildBotiquinesMap(botiquines = []) {
  return indexBy(
    ensureArray(botiquines).map((item) => ({
      ...item,
      id_botiquin: getBotiquinId(item),
      nombre: safeTrimmedString(item?.nombre ?? item?.botiquin ?? ""),
      sede: safeTrimmedString(item?.sede ?? ""),
      ubicacion: safeTrimmedString(item?.ubicacion ?? ""),
      tipo_botiquin: safeTrimmedString(item?.tipo_botiquin ?? item?.tipo ?? ""),
      activo: toBoolean(item?.activo, true)
    })),
    "id_botiquin"
  );
}

export function enrichInventarioWithCatalogo(inventario = [], catalogo = []) {
  const catalogoMap = buildCatalogoMap(catalogo);

  return ensureArray(inventario).map((item) => {
    const id_elemento = getElementoId(item);
    const catalogoItem = catalogoMap[id_elemento] || null;

    return {
      ...item,
      id_elemento,
      nombre_elemento:
        normalizeNombreElemento(item) ||
        normalizeNombreElemento(catalogoItem) ||
        "",
      unidad:
        getUnidadElemento(item) ||
        getUnidadElemento(catalogoItem) ||
        "",
      cantidad_actual: getCantidadActual(item),
      cantidad_requerida: getCantidadRequerida(catalogoItem || item),
      catalogoItem
    };
  });
}

export function buildPedidoConsolidado(
  inventario = [],
  catalogo = [],
  botiquines = [],
  options = {}
) {
  const {
    includeInactiveCatalog = false,
    includeZeroMissing = false,
    sortDirection = "asc"
  } = options;

  const catalogoMap = buildCatalogoMap(catalogo);
  const botiquinesMap = buildBotiquinesMap(botiquines);
  const grouped = new Map();

  ensureArray(inventario).forEach((rawItem) => {
    const inventarioItem = ensureObject(rawItem, {});
    const id_elemento = getElementoId(inventarioItem);

    if (!id_elemento) return;

    const catalogoItem = catalogoMap[id_elemento] || null;
    const catalogoActivo = toBoolean(catalogoItem?.activo, true);

    if (!includeInactiveCatalog && catalogoItem && !catalogoActivo) {
      return;
    }

    const id_botiquin = getBotiquinId(inventarioItem);
    const botiquin = botiquinesMap[id_botiquin] || null;

    const nombre_elemento =
      normalizeNombreElemento(catalogoItem) ||
      normalizeNombreElemento(inventarioItem) ||
      id_elemento;

    const unidad =
      getUnidadElemento(catalogoItem) ||
      getUnidadElemento(inventarioItem) ||
      "unidad";

    const cantidad_actual = getCantidadActual(inventarioItem);
    const cantidad_requerida = getCantidadRequerida(catalogoItem || inventarioItem);
    const faltante = calculateMissingQuantity(cantidad_actual, cantidad_requerida);

    if (!includeZeroMissing && faltante <= 0) {
      return;
    }

    if (!grouped.has(id_elemento)) {
      grouped.set(id_elemento, {
        id_elemento,
        id_item: id_elemento,
        nombre_elemento,
        categoria: safeTrimmedString(
          catalogoItem?.categoria ?? inventarioItem?.categoria ?? ""
        ),
        unidad,
        cantidad_total_faltante: 0,
        cantidad_total_actual: 0,
        cantidad_total_requerida: 0,
        botiquines_afectados: 0,
        detalle: [],
        detalle_texto: "",
        catalogoItem: catalogoItem || null
      });
    }

    const entry = grouped.get(id_elemento);

    entry.cantidad_total_faltante += faltante;
    entry.cantidad_total_actual += cantidad_actual;
    entry.cantidad_total_requerida += cantidad_requerida;

    entry.detalle.push({
      id_botiquin: id_botiquin || "",
      nombre_botiquin:
        safeTrimmedString(botiquin?.nombre) ||
        safeTrimmedString(inventarioItem?.nombre_botiquin) ||
        safeTrimmedString(inventarioItem?.botiquin) ||
        id_botiquin ||
        "Sin botiquín",
      sede: safeTrimmedString(botiquin?.sede ?? ""),
      ubicacion:
        safeTrimmedString(botiquin?.ubicacion) ||
        safeTrimmedString(inventarioItem?.ubicacion) ||
        "",
      tipo_botiquin:
        safeTrimmedString(botiquin?.tipo_botiquin) ||
        safeTrimmedString(botiquin?.tipo) ||
        safeTrimmedString(inventarioItem?.tipo_botiquin) ||
        "",
      cantidad_actual,
      cantidad_requerida,
      faltante,
      lote: safeTrimmedString(inventarioItem?.lote ?? ""),
      fecha_vencimiento: safeTrimmedString(
        inventarioItem?.fecha_vencimiento ?? inventarioItem?.fechaVencimiento ?? ""
      ),
      observaciones: safeTrimmedString(inventarioItem?.observaciones ?? "")
    });
  });

  const result = Array.from(grouped.values()).map((item) => {
    const detalleOrdenado = sortBy(item.detalle, "nombre_botiquin", "asc");
    const botiquinesUnicos = uniqueBy(detalleOrdenado, "id_botiquin").length;

    return {
      ...item,
      botiquines_afectados: botiquinesUnicos,
      detalle: detalleOrdenado,
      detalle_texto: detalleOrdenado
        .map((d) => `${d.nombre_botiquin}: ${formatNumber(d.faltante)} ${item.unidad}`)
        .join(" · ")
    };
  });

  return sortBy(result, "nombre_elemento", sortDirection);
}

export function buildPedidoSummary(pedido = []) {
  const items = ensureArray(pedido);

  const totalProductos = items.length;
  const totalUnidades = sumBy(items, "cantidad_total_faltante");
  const totalBotiquinesAfectados = unique(
    items.flatMap((item) => ensureArray(item.detalle).map((d) => d.id_botiquin).filter(Boolean))
  ).length;

  return {
    totalProductos,
    totalUnidades,
    totalBotiquinesAfectados
  };
}

export function countPedidoProductos(pedido = []) {
  return ensureArray(pedido).length;
}

export function countPedidoUnidades(pedido = []) {
  return sumBy(pedido, "cantidad_total_faltante");
}

export function buildPedidoPrintableText(
  pedido = [],
  options = {}
) {
  const {
    title = "Solicitud de cotización",
    subtitle = "Pedido consolidado de elementos faltantes",
    includeDetalle = true,
    includeDate = true,
    dateValue = new Date(),
    notes = ""
  } = options;

  const items = ensureArray(pedido);
  const summary = buildPedidoSummary(items);

  const lines = [];

  lines.push(title);

  if (subtitle) {
    lines.push(subtitle);
  }

  if (includeDate) {
    lines.push(`Fecha: ${formatDate(dateValue, { month: "long" })}`);
  }

  lines.push("");
  lines.push(`Productos: ${formatNumber(summary.totalProductos)}`);
  lines.push(`Unidades totales: ${formatNumber(summary.totalUnidades)}`);
  lines.push("");

  if (!items.length) {
    lines.push("No hay elementos faltantes para pedir.");
  } else {
    items.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.nombre_elemento} - ${formatNumber(
          item.cantidad_total_faltante
        )} ${item.unidad}`
      );

      if (includeDetalle && ensureArray(item.detalle).length) {
        item.detalle.forEach((detail) => {
          lines.push(
            `   - ${detail.nombre_botiquin}: ${formatNumber(detail.faltante)} ${item.unidad}`
          );
        });
      }
    });
  }

  if (notes) {
    lines.push("");
    lines.push("Observaciones:");
    lines.push(notes);
  }

  return lines.join("\n");
}

export function buildPedidoHtmlRows(pedido = []) {
  return ensureArray(pedido)
    .map((item, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHTML(item.id_elemento || "")}</td>
          <td>${escapeHTML(item.nombre_elemento || "")}</td>
          <td>${escapeHTML(item.unidad || "")}</td>
          <td>${formatNumber(item.cantidad_total_faltante)}</td>
        </tr>
      `;
    })
    .join("");
}

/* ======================================
   DOM
====================================== */

export function classNames(...args) {
  return args
    .flatMap((arg) => {
      if (!arg) return [];
      if (typeof arg === "string") return [arg];
      if (Array.isArray(arg)) return arg.filter(Boolean);
      if (typeof arg === "object") {
        return Object.entries(arg)
          .filter(([, value]) => Boolean(value))
          .map(([key]) => key);
      }
      return [];
    })
    .filter(Boolean)
    .join(" ");
}

export function qs(selector, scope = document) {
  return scope?.querySelector?.(selector) || null;
}

export function qsa(selector, scope = document) {
  return Array.from(scope?.querySelectorAll?.(selector) || []);
}

export function getById(id) {
  return document.getElementById(id);
}

export function show(element) {
  if (!element) return;
  element.hidden = false;
  element.classList.remove("is-hidden");
}

export function hide(element) {
  if (!element) return;
  element.hidden = true;
  element.classList.add("is-hidden");
}

export function toggleElement(element, condition) {
  if (!element) return;
  if (condition) show(element);
  else hide(element);
}

export function setText(element, value, fallback = DEFAULT_TEXT_FALLBACK) {
  if (!element) return;
  element.textContent = text(value, fallback);
}

export function setHTML(element, value) {
  if (!element) return;
  element.innerHTML = safeString(value, "");
}

export function clearHTML(element) {
  if (!element) return;
  element.innerHTML = "";
}

export function replaceChildrenSafe(element, children = []) {
  if (!element) return;
  const fragment = createFragment(children);
  element.replaceChildren(fragment);
}

export function setDataset(element, dataset = {}) {
  if (!element || !isPlainObject(dataset)) return;

  Object.entries(dataset).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    element.dataset[key] = String(value);
  });
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);

  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.html !== undefined) element.innerHTML = options.html;

  if (options.attrs && typeof options.attrs === "object") {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, value);
      }
    });
  }

  if (options.dataset) {
    setDataset(element, options.dataset);
  }

  if (options.children && Array.isArray(options.children)) {
    options.children.filter(Boolean).forEach((child) => {
      element.appendChild(child);
    });
  }

  return element;
}

export function createFragment(children = []) {
  const fragment = document.createDocumentFragment();
  ensureArray(children)
    .filter(Boolean)
    .forEach((child) => fragment.appendChild(child));
  return fragment;
}

export function renderList(container, items = [], renderItem, emptyHTML = "") {
  if (!container) return;

  const safeItems = ensureArray(items);

  if (!safeItems.length) {
    container.innerHTML = emptyHTML;
    return;
  }

  container.innerHTML = safeItems
    .map((item, index) => renderItem(item, index))
    .join("");
}

export function setDisabled(element, disabled = true) {
  if (!element) return;
  element.disabled = Boolean(disabled);
  element.setAttribute("aria-disabled", String(Boolean(disabled)));
}

export function toggleClass(element, className, condition) {
  if (!element || !className) return;
  element.classList.toggle(className, Boolean(condition));
}

export function getData(element, key, fallback = null) {
  if (!element?.dataset) return fallback;
  return element.dataset[key] ?? fallback;
}

export function closestData(eventOrElement, selector) {
  const source = eventOrElement?.target || eventOrElement;
  return source?.closest?.(selector) || null;
}

export function focusFirstFocusable(container) {
  if (!container) return null;

  const firstFocusable = qs(
    [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(","),
    container
  );

  firstFocusable?.focus?.();
  return firstFocusable || null;
}

export function scrollIntoViewIfNeeded(element, options = {}) {
  if (!element?.scrollIntoView) return;
  element.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
    ...options
  });
}

export function mountPortalNode(id = "app-portal-root") {
  let portal = getById(id);

  if (!portal) {
    portal = createElement("div", {
      attrs: {
        id
      }
    });
    document.body.appendChild(portal);
  }

  return portal;
}

/* ======================================
   EVENTOS
====================================== */

export function delegate(root, eventName, selector, handler, options) {
  if (!root || typeof handler !== "function") {
    return () => {};
  }

  const listener = (event) => {
    const target = event.target?.closest?.(selector);
    if (!target || !root.contains(target)) return;
    handler(event, target);
  };

  root.addEventListener(eventName, listener, options);

  return () => {
    root.removeEventListener(eventName, listener, options);
  };
}

export function on(target, eventName, handler, options) {
  if (!target || !isFunction(handler)) return () => {};

  target.addEventListener(eventName, handler, options);
  return () => target.removeEventListener(eventName, handler, options);
}

/* ======================================
   FORMULARIOS
====================================== */

export function formToObject(form) {
  if (!(form instanceof HTMLFormElement)) return {};

  const formData = new FormData(form);
  const entries = {};

  for (const [key, value] of formData.entries()) {
    if (Object.prototype.hasOwnProperty.call(entries, key)) {
      const current = entries[key];
      entries[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      entries[key] = value;
    }
  }

  return entries;
}

export function resetForm(form, options = {}) {
  if (!(form instanceof HTMLFormElement)) return;
  form.reset();

  if (options.clearValidation) {
    clearFormValidation(form);
  }
}

export function fillForm(form, values = {}) {
  if (!(form instanceof HTMLFormElement) || !isPlainObject(values)) return;

  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;

    if (field instanceof RadioNodeList) {
      Array.from(field).forEach((input) => {
        input.checked = String(input.value) === String(value);
      });
      return;
    }

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      field.checked = toBoolean(value, false);
      return;
    }

    if (field instanceof HTMLSelectElement && field.multiple && Array.isArray(value)) {
      Array.from(field.options).forEach((option) => {
        option.selected = value.includes(option.value);
      });
      return;
    }

    field.value = value ?? "";
  });
}

export function serializeForm(form) {
  return compactObject(formToObject(form));
}

export function getFormField(form, name) {
  if (!(form instanceof HTMLFormElement) || !name) return null;
  return form.elements.namedItem(name);
}

export function getFormValue(form, name, fallback = "") {
  const field = getFormField(form, name);
  if (!field) return fallback;

  if (field instanceof RadioNodeList) {
    return field.value || fallback;
  }

  if (field instanceof HTMLInputElement && field.type === "checkbox") {
    return field.checked;
  }

  if (field instanceof HTMLSelectElement && field.multiple) {
    return Array.from(field.selectedOptions).map((option) => option.value);
  }

  return field.value ?? fallback;
}

export function setFieldError(field, message = "") {
  if (!field) return;

  field.classList.add("is-invalid");
  field.classList.remove("is-valid");
  field.setAttribute("aria-invalid", "true");

  const fieldWrapper =
    field.closest(".form-field") ||
    field.closest(".field") ||
    field.parentElement;

  if (!fieldWrapper) return;

  let errorNode = qs("[data-role='field-error']", fieldWrapper);

  if (!errorNode) {
    errorNode = createElement("div", {
      className: "form-field__error",
      attrs: {
        "data-role": "field-error"
      }
    });
    fieldWrapper.appendChild(errorNode);
  }

  errorNode.textContent = message || "";
  toggleElement(errorNode, Boolean(message));
}

export function clearFieldError(field) {
  if (!field) return;

  field.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");

  const fieldWrapper =
    field.closest(".form-field") ||
    field.closest(".field") ||
    field.parentElement;

  const errorNode = fieldWrapper
    ? qs("[data-role='field-error']", fieldWrapper)
    : null;

  if (errorNode) {
    errorNode.textContent = "";
    hide(errorNode);
  }
}

export function setFieldValid(field) {
  if (!field) return;
  field.classList.remove("is-invalid");
  field.classList.add("is-valid");
  field.removeAttribute("aria-invalid");
}

export function clearFormValidation(form) {
  if (!(form instanceof HTMLFormElement)) return;

  qsa(".is-invalid, .is-valid", form).forEach((field) => {
    field.classList.remove("is-invalid", "is-valid");
    field.removeAttribute("aria-invalid");
  });

  qsa("[data-role='field-error']", form).forEach((node) => {
    node.textContent = "";
    hide(node);
  });
}

export function validateRequired(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value === true;
  return safeTrimmedString(value) !== "";
}

/* ======================================
   DEBOUNCE / THROTTLE
====================================== */

export function debounce(fn, wait = 250) {
  let timeoutId = null;

  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      fn.apply(this, args);
    }, wait);
  };
}

export function throttle(fn, wait = 250) {
  let lastCall = 0;
  let timeoutId = null;

  return function throttled(...args) {
    const now = Date.now();
    const remaining = wait - (now - lastCall);

    if (remaining <= 0) {
      clearTimeout(timeoutId);
      timeoutId = null;
      lastCall = now;
      fn.apply(this, args);
      return;
    }

    if (!timeoutId) {
      timeoutId = window.setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

export function once(fn) {
  let called = false;
  let result;

  return function onceWrapper(...args) {
    if (called) return result;
    called = true;
    result = fn.apply(this, args);
    return result;
  };
}

/* ======================================
   TIEMPO / PROMESAS
====================================== */

export function wait(ms = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function safeAsync(task, fallback = null) {
  try {
    return await task();
  } catch (error) {
    console.warn("[utils] safeAsync capturó un error:", error);
    return fallback;
  }
}

/* ======================================
   BADGES / ESTADOS
====================================== */

export function getStatusBadgeClass(status = "") {
  const normalized = normalizeText(status);

  if (["vigente", "ok", "activo", "completo", "success", "operativo"].includes(normalized)) {
    return "badge badge--success";
  }

  if (
    ["proximo a vencer", "proximo", "pendiente", "warning", "bajo stock"].includes(
      normalized
    )
  ) {
    return "badge badge--warning";
  }

  if (["vencido", "critico", "danger", "error", "faltante", "inactivo"].includes(normalized)) {
    return "badge badge--danger";
  }

  if (["alerta", "alert", "por revisar", "revision", "en revision"].includes(normalized)) {
    return "badge badge--alert";
  }

  return "badge badge--muted";
}

export function getSeverityBadgeClass(severity = "") {
  const normalized = normalizeText(severity);

  if (["critical", "critico", "alta", "high"].includes(normalized)) {
    return "badge badge--danger";
  }

  if (["warning", "media", "medium"].includes(normalized)) {
    return "badge badge--warning";
  }

  if (["info", "baja", "low"].includes(normalized)) {
    return "badge badge--muted";
  }

  return "badge badge--muted";
}

export function getExpiryBadgeClass(dateValue, options = {}) {
  const status = getExpiryStatus(dateValue, options);

  if (status.type === "alert") return "badge badge--alert";
  if (status.type === "warning") return "badge badge--warning";
  if (status.type === "danger") return "badge badge--danger";
  if (status.type === "success") return "badge badge--success";

  return "badge badge--muted";
}

export function resolveBadgeClassByTone(tone = "") {
  const normalized = normalizeText(tone);

  if (["success", "ok", "positive"].includes(normalized)) return "badge badge--success";
  if (["warning", "warn"].includes(normalized)) return "badge badge--warning";
  if (["danger", "error", "critical"].includes(normalized)) return "badge badge--danger";
  if (["alert"].includes(normalized)) return "badge badge--alert";
  if (["info"].includes(normalized)) return "badge badge--info";

  return "badge badge--muted";
}

export function resolveVisualState(type, value, fallbackLabel = "") {
  const visual = getVisualStatus?.(type, value, fallbackLabel) || {
    key: safeTrimmedString(value),
    label: safeTrimmedString(value, fallbackLabel || DEFAULT_TEXT_FALLBACK),
    tone: "neutral",
    icon: ""
  };

  return {
    ...visual,
    badgeClass: resolveBadgeClassByTone(visual.tone)
  };
}

/* ======================================
   EMPTY STATES
====================================== */

export function resolveEmptyState(key = "generic", overrides = {}) {
  const base = getEmptyState?.(key) || {
    title: "No hay información disponible",
    description: ""
  };

  return {
    icon: overrides.icon || DEFAULT_EMPTY_ICON,
    title: overrides.title || base.title,
    description: overrides.description || base.description,
    actionLabel: overrides.actionLabel || "",
    actionId: overrides.actionId || "",
    actionVariant: overrides.actionVariant || "primary"
  };
}

/* ======================================
   MÉTRICAS RÁPIDAS
====================================== */

export function countBotiquinesCriticos(botiquines = []) {
  return ensureArray(botiquines).filter((item) => {
    const estado = normalizeText(item?.estado || "");
    return ["critico", "vencido", "incompleto", "inactivo"].includes(estado);
  }).length;
}

export function countExpiringItems(items = [], daysLimit = getDefaultAlertDays?.() || 30) {
  return ensureArray(items).filter((item) => {
    const expiryDate =
      item?.fechaVencimiento ??
      item?.fecha_vencimiento ??
      item?.vencimiento ??
      item?.vence;

    const days = daysUntil(expiryDate);
    return typeof days === "number" && days >= 0 && days <= daysLimit;
  }).length;
}

export function countExpiredItems(items = []) {
  return ensureArray(items).filter((item) => {
    const expiryDate =
      item?.fechaVencimiento ??
      item?.fecha_vencimiento ??
      item?.vencimiento ??
      item?.vence;

    const days = daysUntil(expiryDate);
    return typeof days === "number" && days < 0;
  }).length;
}

export function countLowStockItems(items = []) {
  return ensureArray(items).filter((item) => {
    if (toBoolean(item?.bajo_stock, false)) return true;

    const actual = toNumber(item?.cantidad_actual ?? item?.cantidadActual, NaN);
    const minima = toNumber(
      item?.cantidad_minima ??
        item?.cantidadMinima ??
        item?.cantidad_requerida,
      NaN
    );

    return Number.isFinite(actual) && Number.isFinite(minima) && actual < minima;
  }).length;
}

/* ======================================
   STORAGE SIMPLE
====================================== */

function storageKey(key) {
  return `${STORAGE_PREFIX}:${key}`;
}

export function saveToStorage(key, value) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn("[utils] No se pudo guardar en localStorage:", error);
    return false;
  }
}

export function readFromStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[utils] No se pudo leer localStorage:", error);
    return fallback;
  }
}

export function removeFromStorage(key) {
  try {
    localStorage.removeItem(storageKey(key));
    return true;
  } catch (error) {
    console.warn("[utils] No se pudo eliminar del localStorage:", error);
    return false;
  }
}

export function clearAppStorage() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(`${STORAGE_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    });
    return true;
  } catch (error) {
    console.warn("[utils] No se pudo limpiar el storage de la app:", error);
    return false;
  }
}

/* ======================================
   DEBUG
====================================== */

export function debugLog(label, payload) {
  if (!APP_CONFIG?.appName) return;
  console.log(`[${APP_CONFIG.appShortName || APP_CONFIG.appName}] ${label}`, payload);
}
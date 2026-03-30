/* ======================================
   CONFIG GENERAL DE LA APP
   - Fuente única de configuración
   - Compatible con módulos existentes
   - Soporte adicional para UI reusable
====================================== */

const RAW_APP_CONFIG = {
  appName: "Seguimiento de Botiquines Musicala",
  appShortName: "Botiquines Musicala",
  organizationName: "Musicala",
  appVersion: "1.1.0",

  /* ======================================
     API / APPS SCRIPT
  ====================================== */
  apiBaseUrl:
    "https://script.google.com/macros/s/AKfycbyidGH9n8vq0FFd_6fvjPzMhg40q4Nw7TANo8cLB0ZkBpVBHP_MeAF3V8ox-exDQcPY4A/exec",

  api: {
    timeoutMs: 20000,
    defaultMethod: "GET"
  },

  actions: {
    ping: "ping",
    getDashboard: "getDashboard",
    getBotiquines: "getBotiquines",
    getInventario: "getInventario",
    getInspecciones: "getInspecciones",
    getReposiciones: "getReposiciones",
    getAlertas: "getAlertas",
    saveInspeccion: "saveInspeccion",
    saveReposicion: "saveReposicion",
    updateInventarioItem: "updateInventarioItem",
    recalcularEstados: "recalcularEstados",
    sendAlertsNow: "sendAlertsNow",
    sendMonthlySummaryNow: "sendMonthlySummaryNow"
  },

  /* ======================================
     REGLAS / UMBRALES
  ====================================== */
  defaults: {
    alertDays: 30,
    criticalDays: 7,
    reviewFrequencyDays: 30,
    pageSize: 20,
    locale: "es-CO",
    timeZone: "America/Bogota",
    currency: "COP",
    dateFormat: "YYYY-MM-DD",
    emptyValueLabel: "—",
    appDateInputFormat: "YYYY-MM-DD"
  },

  thresholds: {
    stockCriticalMultiplier: 0.5
  },

  /* ======================================
     BOTIQUINES REGISTRADOS
  ====================================== */
  botiquines: [
    {
      id: "BOT-001",
      nombre: "Botiquín Primer Piso",
      tipo: "Grande",
      ubicacion: "Primer piso",
      sede: "Musicala",
      activo: true
    },
    {
      id: "BOT-002",
      nombre: "Botiquín Segundo Piso",
      tipo: "Grande",
      ubicacion: "Segundo piso",
      sede: "Musicala",
      activo: true
    },
    {
      id: "BOT-003",
      nombre: "Botiquín Oficina",
      tipo: "Pequeño",
      ubicacion: "Oficina",
      sede: "Musicala",
      activo: true
    },
    {
      id: "BOT-004",
      nombre: "Botiquín Recepción",
      tipo: "Pequeño",
      ubicacion: "Recepción",
      sede: "Musicala",
      activo: true
    }
  ],

  /* ======================================
     LABELS Y TEXTOS REUTILIZABLES
  ====================================== */
  labels: {
    dashboard: "Dashboard",
    botiquines: "Botiquines",
    inventario: "Inventario",
    inspecciones: "Inspecciones",
    reposiciones: "Reposiciones",
    alertas: "Alertas",

    activo: "Activo",
    inactivo: "Inactivo",
    si: "Sí",
    no: "No",
    noDisponible: "No disponible",
    sinDatos: "Sin datos",
    sinFecha: "Sin fecha",
    sinObservaciones: "Sin observaciones",
    sinResponsable: "Sin responsable",
    pendiente: "Pendiente",
    completado: "Completado",

    crear: "Crear",
    editar: "Editar",
    guardar: "Guardar",
    cancelar: "Cancelar",
    cerrar: "Cerrar",
    confirmar: "Confirmar",
    eliminar: "Eliminar",
    verDetalle: "Ver detalle",
    recargar: "Recargar",
    aplicar: "Aplicar",
    limpiar: "Limpiar",
    buscar: "Buscar",

    hoy: "Hoy",
    proximamente: "Próximamente",
    vencido: "Vencido",
    vencenPronto: "Próximos a vencer",
    bajoStock: "Bajo stock",
    faltante: "Faltante",
    atrasada: "Atrasada",
    sinRegistros: "Sin registros"
  },

  navigation: [
    { id: "dashboard", label: "Dashboard", hash: "#dashboard" },
    { id: "botiquines", label: "Botiquines", hash: "#botiquines" },
    { id: "inventario", label: "Inventario", hash: "#inventario" },
    { id: "inspecciones", label: "Inspecciones", hash: "#inspecciones" },
    { id: "reposiciones", label: "Reposiciones", hash: "#reposiciones" },
    { id: "alertas", label: "Alertas", hash: "#alertas" }
  ],

  /* ======================================
     CATÁLOGOS
  ====================================== */
  estadosInventario: [
    "Vigente",
    "Próximo a vencer",
    "Vencido",
    "Bajo stock",
    "Faltante",
    "Sin fecha",
    "Pendiente revisión"
  ],

  estadosGeneralesInspeccion: ["OK", "Con novedades", "Crítico"],

  estadosItemInspeccion: [
    "OK",
    "Bajo stock",
    "Vencido",
    "Faltante",
    "Dañado",
    "Pendiente revisión"
  ],

  accionesRequeridasInspeccion: [
    "Ninguna",
    "Reponer",
    "Revisar",
    "Retirar",
    "Actualizar fecha",
    "Escalar"
  ],

  motivosReposicion: ["Reposición", "Vencimiento", "Uso", "Auditoría"],

  severidadesAlerta: ["info", "warning", "critical"],

  categoriasAlerta: [
    "vencidos",
    "proximos_a_vencer",
    "bajo_stock",
    "faltantes",
    "inspecciones_atrasadas",
    "hallazgos_pendientes"
  ],

  tiposModal: [
    "default",
    "info",
    "success",
    "warning",
    "danger",
    "confirm",
    "detail",
    "form"
  ],

  tamanosModal: ["sm", "md", "lg", "xl", "full"],

  /* ======================================
     VISTAS / RUTAS
  ====================================== */
  views: {
    defaultView: "dashboard",
    available: [
      "dashboard",
      "botiquines",
      "inventario",
      "inspecciones",
      "reposiciones",
      "alertas"
    ],
    titles: {
      dashboard: "Dashboard",
      botiquines: "Botiquines",
      inventario: "Inventario",
      inspecciones: "Inspecciones",
      reposiciones: "Reposiciones",
      alertas: "Alertas"
    }
  },

  /* ======================================
     UI REUSABLE
  ====================================== */
  ui: {
    animationMs: 180,
    toastDurationMs: 3800,
    modalCloseOnBackdrop: true,
    modalCloseOnEscape: true,
    detailModalDefaultSize: "lg",
    formModalDefaultSize: "xl",
    confirmModalDefaultSize: "md",
    defaultEmptyIcon: "📭",
    defaultLoadingLabel: "Cargando...",
    defaultErrorTitle: "Ocurrió un problema",
    defaultErrorMessage: "No fue posible completar la operación.",
    defaultConfirmTitle: "Confirmar acción",
    zIndex: {
      backdrop: 900,
      modal: 910,
      toast: 950
    }
  },

  /* ======================================
     FORMULARIOS DINÁMICOS
  ====================================== */
  forms: {
    inspeccion: {
      submitLabelCreate: "Guardar inspección",
      submitLabelEdit: "Actualizar inspección",
      detailFieldName: "detalle_items"
    },
    reposicion: {
      submitLabelCreate: "Guardar reposición",
      submitLabelEdit: "Actualizar reposición"
    }
  },

  /* ======================================
     MAPAS VISUALES DE ESTADO
  ====================================== */
  visualStatus: {
    severidadAlerta: {
      info: {
        label: "Informativa",
        tone: "info",
        icon: "ℹ️"
      },
      warning: {
        label: "Advertencia",
        tone: "warning",
        icon: "⚠️"
      },
      critical: {
        label: "Crítica",
        tone: "danger",
        icon: "🚨"
      }
    },

    estadoInventario: {
      Vigente: {
        label: "Vigente",
        tone: "success",
        icon: "✅"
      },
      "Próximo a vencer": {
        label: "Próximo a vencer",
        tone: "warning",
        icon: "⏳"
      },
      Vencido: {
        label: "Vencido",
        tone: "danger",
        icon: "🛑"
      },
      "Bajo stock": {
        label: "Bajo stock",
        tone: "warning",
        icon: "📉"
      },
      Faltante: {
        label: "Faltante",
        tone: "danger",
        icon: "📦"
      },
      "Sin fecha": {
        label: "Sin fecha",
        tone: "neutral",
        icon: "📅"
      },
      "Pendiente revisión": {
        label: "Pendiente revisión",
        tone: "info",
        icon: "🕵️"
      }
    },

    estadoGeneralInspeccion: {
      OK: {
        label: "OK",
        tone: "success",
        icon: "✅"
      },
      "Con novedades": {
        label: "Con novedades",
        tone: "warning",
        icon: "📝"
      },
      Crítico: {
        label: "Crítico",
        tone: "danger",
        icon: "🚨"
      }
    },

    estadoItemInspeccion: {
      OK: {
        label: "OK",
        tone: "success",
        icon: "✅"
      },
      "Bajo stock": {
        label: "Bajo stock",
        tone: "warning",
        icon: "📉"
      },
      Vencido: {
        label: "Vencido",
        tone: "danger",
        icon: "🛑"
      },
      Faltante: {
        label: "Faltante",
        tone: "danger",
        icon: "📦"
      },
      Dañado: {
        label: "Dañado",
        tone: "warning",
        icon: "🩹"
      },
      "Pendiente revisión": {
        label: "Pendiente revisión",
        tone: "info",
        icon: "🕵️"
      }
    }
  },

  /* ======================================
     EMPTY STATES REUSABLES
  ====================================== */
  emptyStates: {
    generic: {
      title: "No hay información disponible",
      description: "Todavía no hay registros para mostrar."
    },
    dashboard: {
      title: "Sin métricas disponibles",
      description: "Aún no hay datos suficientes para construir el dashboard."
    },
    botiquines: {
      title: "No hay botiquines registrados",
      description: "Verifica la configuración local o la carga de datos."
    },
    inventario: {
      title: "No hay ítems en inventario",
      description: "Cuando existan elementos activos, aparecerán aquí."
    },
    inspecciones: {
      title: "No hay inspecciones registradas",
      description: "Crea una nueva inspección para empezar el seguimiento."
    },
    reposiciones: {
      title: "No hay reposiciones registradas",
      description: "Las reposiciones aparecerán aquí cuando se registren."
    },
    alertas: {
      title: "No hay alertas activas",
      description: "Buenísimo. Por ahora no se detectan novedades críticas."
    },
    search: {
      title: "Sin resultados",
      description: "No encontramos coincidencias con los filtros aplicados."
    }
  }
};

/* ======================================
   HELPERS INTERNOS
====================================== */

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.getOwnPropertyNames(value).forEach((prop) => {
    const child = value[prop];
    if (
      child &&
      (typeof child === "object" || typeof child === "function") &&
      !Object.isFrozen(child)
    ) {
      deepFreeze(child);
    }
  });

  return Object.freeze(value);
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeTrimmedString(value, fallback = "") {
  return safeString(value, fallback).trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = safeTrimmedString(value).toLowerCase();

  if (
    ["true", "1", "si", "sí", "yes", "y", "activo", "activa"].includes(normalized)
  ) {
    return true;
  }

  if (
    ["false", "0", "no", "n", "inactivo", "inactiva"].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

function normalizeBotiquin(rawBotiquin = {}) {
  return {
    id: safeTrimmedString(rawBotiquin.id),
    nombre: safeTrimmedString(rawBotiquin.nombre),
    tipo: safeTrimmedString(rawBotiquin.tipo),
    ubicacion: safeTrimmedString(rawBotiquin.ubicacion),
    sede: safeTrimmedString(rawBotiquin.sede),
    activo: normalizeBoolean(rawBotiquin.activo, true)
  };
}

function normalizeArrayStrings(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeTrimmedString(value)).filter(Boolean);
}

function compactParams(params = {}) {
  if (!isPlainObject(params)) return {};

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      return value !== undefined && value !== null && value !== "";
    })
  );
}

function normalizeMapEntries(map = {}) {
  if (!isPlainObject(map)) return {};

  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => {
      const safeKey = safeTrimmedString(key);
      if (!safeKey) return [key, value];

      if (!isPlainObject(value)) {
        return [safeKey, value];
      }

      return [
        safeKey,
        {
          ...value,
          label: safeTrimmedString(value.label, safeKey),
          tone: safeTrimmedString(value.tone, "neutral"),
          icon: safeTrimmedString(value.icon, "")
        }
      ];
    })
  );
}

function normalizeVisualStatus(rawVisualStatus = {}) {
  if (!isPlainObject(rawVisualStatus)) return {};

  return {
    severidadAlerta: normalizeMapEntries(rawVisualStatus.severidadAlerta),
    estadoInventario: normalizeMapEntries(rawVisualStatus.estadoInventario),
    estadoGeneralInspeccion: normalizeMapEntries(
      rawVisualStatus.estadoGeneralInspeccion
    ),
    estadoItemInspeccion: normalizeMapEntries(rawVisualStatus.estadoItemInspeccion)
  };
}

function normalizeEmptyStates(rawEmptyStates = {}) {
  if (!isPlainObject(rawEmptyStates)) return {};

  return Object.fromEntries(
    Object.entries(rawEmptyStates).map(([key, value]) => {
      if (!isPlainObject(value)) {
        return [
          key,
          {
            title: "Sin información",
            description: ""
          }
        ];
      }

      return [
        key,
        {
          title: safeTrimmedString(value.title, "Sin información"),
          description: safeTrimmedString(value.description, "")
        }
      ];
    })
  );
}

/* ======================================
   CONFIG FINAL NORMALIZADA
====================================== */

export const APP_CONFIG = deepFreeze({
  ...RAW_APP_CONFIG,
  apiBaseUrl: safeTrimmedString(RAW_APP_CONFIG.apiBaseUrl).replace(/\/+$/, ""),
  botiquines: (RAW_APP_CONFIG.botiquines || []).map(normalizeBotiquin),
  estadosInventario: normalizeArrayStrings(RAW_APP_CONFIG.estadosInventario),
  estadosGeneralesInspeccion: normalizeArrayStrings(
    RAW_APP_CONFIG.estadosGeneralesInspeccion
  ),
  estadosItemInspeccion: normalizeArrayStrings(
    RAW_APP_CONFIG.estadosItemInspeccion
  ),
  accionesRequeridasInspeccion: normalizeArrayStrings(
    RAW_APP_CONFIG.accionesRequeridasInspeccion
  ),
  motivosReposicion: normalizeArrayStrings(RAW_APP_CONFIG.motivosReposicion),
  severidadesAlerta: normalizeArrayStrings(RAW_APP_CONFIG.severidadesAlerta),
  categoriasAlerta: normalizeArrayStrings(RAW_APP_CONFIG.categoriasAlerta),
  tiposModal: normalizeArrayStrings(RAW_APP_CONFIG.tiposModal),
  tamanosModal: normalizeArrayStrings(RAW_APP_CONFIG.tamanosModal),
  visualStatus: normalizeVisualStatus(RAW_APP_CONFIG.visualStatus),
  emptyStates: normalizeEmptyStates(RAW_APP_CONFIG.emptyStates)
});

/* ======================================
   HELPERS DE API
====================================== */

/**
 * Devuelve la URL final limpia de la API
 */
export function getApiUrl() {
  return APP_CONFIG.apiBaseUrl;
}

/**
 * Verifica si la API está configurada
 */
export function hasApiConfigured() {
  const url = getApiUrl();
  return !!url && url !== "PEGAR_AQUI_URL_WEB_APP";
}

/**
 * Lanza error si la API no está configurada
 */
export function assertApiConfigured() {
  if (!hasApiConfigured()) {
    throw new Error(
      "La API no está configurada. Debes pegar la URL del Web App en config.js."
    );
  }

  return true;
}

/**
 * Construye una URL GET con parámetros
 * @param {string} action
 * @param {object} params
 */
export function buildApiGetUrl(action, params = {}) {
  assertApiConfigured();

  const safeAction = safeTrimmedString(action);

  if (!safeAction) {
    throw new Error("Debes indicar una acción válida para la API.");
  }

  const url = new URL(getApiUrl());
  url.searchParams.set("action", safeAction);

  Object.entries(compactParams(params)).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

/**
 * Devuelve el nombre de una acción registrada
 * @param {string} key
 */
export function getApiAction(key) {
  const action = APP_CONFIG.actions?.[key];

  if (!action) {
    throw new Error(`La acción de API "${key}" no está definida en config.js.`);
  }

  return action;
}

/**
 * Devuelve todas las acciones registradas
 */
export function getApiActions() {
  return { ...APP_CONFIG.actions };
}

/* ======================================
   HELPERS DE BOTIQUINES
====================================== */

/**
 * Devuelve la lista de botiquines locales
 */
export function getBotiquinesMeta() {
  return [...APP_CONFIG.botiquines];
}

/**
 * Devuelve la información local de un botiquín por ID
 * @param {string} botiquinId
 */
export function getBotiquinMeta(botiquinId) {
  const safeId = safeTrimmedString(botiquinId);

  if (!safeId) return null;

  return APP_CONFIG.botiquines.find((botiquin) => botiquin.id === safeId) || null;
}

/**
 * Verifica si un botiquín existe en el catálogo local
 * @param {string} botiquinId
 */
export function hasBotiquinMeta(botiquinId) {
  return !!getBotiquinMeta(botiquinId);
}

/**
 * Devuelve el nombre del botiquín o un fallback
 * @param {string} botiquinId
 * @param {string} fallback
 */
export function getBotiquinName(botiquinId, fallback = "Botiquín") {
  return getBotiquinMeta(botiquinId)?.nombre || fallback;
}

/**
 * Devuelve opciones listas para selects
 */
export function getBotiquinOptions() {
  return APP_CONFIG.botiquines.map((botiquin) => ({
    value: botiquin.id,
    label: botiquin.nombre,
    tipo: botiquin.tipo,
    ubicacion: botiquin.ubicacion,
    sede: botiquin.sede,
    activo: botiquin.activo
  }));
}

/* ======================================
   HELPERS DE LABELS / CATÁLOGOS
====================================== */

export function getLabel(key, fallback = "") {
  return APP_CONFIG.labels?.[key] || fallback;
}

export function getNavigationItems() {
  return [...APP_CONFIG.navigation];
}

export function isValidView(viewId) {
  return APP_CONFIG.views.available.includes(safeTrimmedString(viewId));
}

export function getDefaultView() {
  return APP_CONFIG.views.defaultView;
}

export function getViewTitle(viewId, fallback = "") {
  const safeViewId = safeTrimmedString(viewId);
  return APP_CONFIG.views?.titles?.[safeViewId] || fallback || safeViewId;
}

export function getAvailableViews() {
  return [...APP_CONFIG.views.available];
}

export function getEstadosInventario() {
  return [...APP_CONFIG.estadosInventario];
}

export function isValidEstadoInventario(value) {
  return APP_CONFIG.estadosInventario.includes(safeTrimmedString(value));
}

export function getEstadosGeneralesInspeccion() {
  return [...APP_CONFIG.estadosGeneralesInspeccion];
}

export function isValidEstadoGeneralInspeccion(value) {
  return APP_CONFIG.estadosGeneralesInspeccion.includes(safeTrimmedString(value));
}

export function getEstadosItemInspeccion() {
  return [...APP_CONFIG.estadosItemInspeccion];
}

export function isValidEstadoItemInspeccion(value) {
  return APP_CONFIG.estadosItemInspeccion.includes(safeTrimmedString(value));
}

export function getAccionesRequeridasInspeccion() {
  return [...APP_CONFIG.accionesRequeridasInspeccion];
}

export function isValidAccionRequeridaInspeccion(value) {
  return APP_CONFIG.accionesRequeridasInspeccion.includes(
    safeTrimmedString(value)
  );
}

export function getMotivosReposicion() {
  return [...APP_CONFIG.motivosReposicion];
}

export function isValidMotivoReposicion(value) {
  return APP_CONFIG.motivosReposicion.includes(safeTrimmedString(value));
}

export function getSeveridadesAlerta() {
  return [...APP_CONFIG.severidadesAlerta];
}

export function isValidSeveridadAlerta(value) {
  return APP_CONFIG.severidadesAlerta.includes(safeTrimmedString(value));
}

export function getCategoriasAlerta() {
  return [...APP_CONFIG.categoriasAlerta];
}

export function getTiposModal() {
  return [...APP_CONFIG.tiposModal];
}

export function getTamanosModal() {
  return [...APP_CONFIG.tamanosModal];
}

export function isValidModalSize(value) {
  return APP_CONFIG.tamanosModal.includes(safeTrimmedString(value));
}

export function isValidModalType(value) {
  return APP_CONFIG.tiposModal.includes(safeTrimmedString(value));
}

/* ======================================
   HELPERS DE DEFAULTS / UI
====================================== */

export function getDefaultAlertDays() {
  return APP_CONFIG.defaults.alertDays;
}

export function getDefaultCriticalDays() {
  return APP_CONFIG.defaults.criticalDays;
}

export function getDefaultReviewFrequency() {
  return APP_CONFIG.defaults.reviewFrequencyDays;
}

export function getDefaultPageSize() {
  return APP_CONFIG.defaults.pageSize;
}

export function getLocale() {
  return APP_CONFIG.defaults.locale;
}

export function getTimeZone() {
  return APP_CONFIG.defaults.timeZone;
}

export function getCurrency() {
  return APP_CONFIG.defaults.currency;
}

export function getDateFormat() {
  return APP_CONFIG.defaults.dateFormat;
}

export function getAppDateInputFormat() {
  return APP_CONFIG.defaults.appDateInputFormat;
}

export function getEmptyValueLabel() {
  return APP_CONFIG.defaults.emptyValueLabel;
}

export function getApiTimeout() {
  return APP_CONFIG.api.timeoutMs;
}

export function getStockCriticalMultiplier() {
  return APP_CONFIG.thresholds.stockCriticalMultiplier;
}

export function getUiConfig() {
  return { ...APP_CONFIG.ui };
}

export function getToastDuration() {
  return APP_CONFIG.ui.toastDurationMs;
}

export function getModalAnimationMs() {
  return APP_CONFIG.ui.animationMs;
}

export function shouldCloseModalOnBackdrop() {
  return APP_CONFIG.ui.modalCloseOnBackdrop === true;
}

export function shouldCloseModalOnEscape() {
  return APP_CONFIG.ui.modalCloseOnEscape === true;
}

export function getDefaultDetailModalSize() {
  return APP_CONFIG.ui.detailModalDefaultSize;
}

export function getDefaultFormModalSize() {
  return APP_CONFIG.ui.formModalDefaultSize;
}

export function getDefaultConfirmModalSize() {
  return APP_CONFIG.ui.confirmModalDefaultSize;
}

export function getUiZIndex() {
  return { ...APP_CONFIG.ui.zIndex };
}

/* ======================================
   HELPERS VISUALES / ESTADOS
====================================== */

export function getVisualStatusMap(type) {
  const safeType = safeTrimmedString(type);
  return { ...(APP_CONFIG.visualStatus?.[safeType] || {}) };
}

export function getVisualStatus(type, value, fallbackLabel = "") {
  const safeType = safeTrimmedString(type);
  const safeValue = safeTrimmedString(value);

  const map = APP_CONFIG.visualStatus?.[safeType] || {};
  const entry = map[safeValue];

  if (entry) {
    return {
      key: safeValue,
      label: entry.label,
      tone: entry.tone,
      icon: entry.icon
    };
  }

  return {
    key: safeValue,
    label: safeValue || fallbackLabel || getLabel("sinDatos", "Sin datos"),
    tone: "neutral",
    icon: ""
  };
}

export function getInventarioVisualStatus(value) {
  return getVisualStatus("estadoInventario", value);
}

export function getInspeccionGeneralVisualStatus(value) {
  return getVisualStatus("estadoGeneralInspeccion", value);
}

export function getInspeccionItemVisualStatus(value) {
  return getVisualStatus("estadoItemInspeccion", value);
}

export function getAlertaSeverityVisualStatus(value) {
  return getVisualStatus("severidadAlerta", value);
}

/* ======================================
   HELPERS DE EMPTY STATES
====================================== */

export function getEmptyState(key = "generic") {
  const safeKey = safeTrimmedString(key, "generic");
  return (
    APP_CONFIG.emptyStates[safeKey] ||
    APP_CONFIG.emptyStates.generic || {
      title: "Sin información",
      description: ""
    }
  );
}

/* ======================================
   HELPERS DE FORMULARIOS
====================================== */

export function getFormConfig(formKey) {
  const safeKey = safeTrimmedString(formKey);
  return APP_CONFIG.forms?.[safeKey]
    ? { ...APP_CONFIG.forms[safeKey] }
    : {};
}

/* ======================================
   HELPERS DE FORMATEO LIVIANO
====================================== */

export function formatBooleanLabel(value, trueLabel = "Sí", falseLabel = "No") {
  return normalizeBoolean(value, false) ? trueLabel : falseLabel;
}

export function formatActivoLabel(value) {
  return normalizeBoolean(value, false)
    ? getLabel("activo", "Activo")
    : getLabel("inactivo", "Inactivo");
}

/* ======================================
   DEBUG / INFO
====================================== */

export function getAppInfo() {
  return {
    appName: APP_CONFIG.appName,
    appShortName: APP_CONFIG.appShortName,
    organizationName: APP_CONFIG.organizationName,
    appVersion: APP_CONFIG.appVersion,
    apiBaseUrl: APP_CONFIG.apiBaseUrl,
    hasApiConfigured: hasApiConfigured()
  };
}
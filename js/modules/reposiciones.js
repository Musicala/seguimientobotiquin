import { store, selectors, actions } from "../state.js";
import {
  getReposiciones,
  getBotiquines,
  getInventario,
  getInspecciones,
  saveReposicion
} from "../api.js";
import { navigateTo } from "../router.js";
import { openFormModal } from "../ui/form-modal.js";
import { showSuccessToast, showErrorToast } from "../ui/toast.js";
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

const MODULE_ID = "reposiciones-module";
const SEARCH_DEBOUNCE_MS = 250;
const CREATE_MODAL_ID = "reposicion-create-modal";

const ESTADO_OPTIONS = [
  { value: "Pendiente", label: "Pendiente" },
  { value: "En proceso", label: "En proceso" },
  { value: "Completada", label: "Completada" }
];

const MOTIVO_OPTIONS = [
  { value: "", label: "Seleccionar" },
  { value: "Faltante", label: "Faltante" },
  { value: "Bajo stock", label: "Bajo stock" },
  { value: "Vencimiento", label: "Vencimiento" },
  { value: "Deterioro", label: "Deterioro" },
  { value: "Ajuste por inspección", label: "Ajuste por inspección" },
  { value: "Reposición preventiva", label: "Reposición preventiva" },
  { value: "Otro", label: "Otro" }
];

const moduleState = {
  initialized: false,
  mounted: false,
  container: null,
  unsubscribe: null,
  selectedReposicionId: "",
  createModalOpen: false,
  saving: false,
  lastRenderSignature: "",
  lastCreateContext: {
    botiquinId: "",
    inspeccionId: "",
    itemId: ""
  }
};

/* ======================================
   API PÚBLICA
====================================== */

export async function initReposicionesModule(options = {}) {
  const { container, forceRender = false } = options;

  if (!(container instanceof HTMLElement)) {
    throw new Error("[reposiciones] initReposicionesModule requiere un container válido.");
  }

  moduleState.container = container;

  if (!moduleState.initialized) {
    moduleState.unsubscribe = store.subscribe(handleStoreChange);
    bindReposicionesEvents();
    bindReposicionesGlobalEvents();
    moduleState.initialized = true;
  }

  await syncReposicionesModuleData();

  if (forceRender || isReposicionesRoute()) {
    renderReposicionesView();
  }

  moduleState.mounted = true;
}

export function renderReposicionesView() {
  if (!moduleState.container) return;

  const state = store.getState();
  const viewModel = getReposicionesViewModel(state);
  const signature = createRenderSignature(viewModel);

  if (!moduleState.mounted || signature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createReposicionesTemplate(viewModel));
    hydrateReposicionesUI(moduleState.container, viewModel);
    moduleState.lastRenderSignature = signature;
  }
}

export async function syncReposicionesModuleData(options = {}) {
  const { force = false } = options;
  const state = store.getState();

  const currentReposiciones = normalizeReposiciones(
    ensureArray(selectors.reposiciones?.(state))
  );
  const currentBotiquines = normalizeBotiquines(
    ensureArray(selectors.botiquines?.(state))
  );
  const currentInventario = normalizeInventario(
    ensureArray(selectors.inventario?.(state))
  );
  const currentInspecciones = normalizeInspecciones(
    ensureArray(selectors.inspecciones?.(state))
  );

  const needReposiciones = force || !currentReposiciones.length;
  const needBotiquines = force || !currentBotiquines.length;
  const needInventario = force || !currentInventario.length;
  const needInspecciones = force || !currentInspecciones.length;

  if (!needReposiciones && !needBotiquines && !needInventario && !needInspecciones) {
    return {
      reposiciones: currentReposiciones,
      botiquines: currentBotiquines,
      inventario: currentInventario,
      inspecciones: currentInspecciones
    };
  }

  setGlobalLoading(true, "Cargando reposiciones...");

  try {
    const [reposicionesResponse, botiquinesResponse, inventarioResponse, inspeccionesResponse] =
      await Promise.all([
        needReposiciones ? getReposiciones() : currentReposiciones,
        needBotiquines ? getBotiquines() : currentBotiquines,
        needInventario ? getInventario() : currentInventario,
        needInspecciones ? getInspecciones() : currentInspecciones
      ]);

    const reposiciones = needReposiciones
      ? normalizeReposiciones(reposicionesResponse)
      : currentReposiciones;

    const botiquines = needBotiquines
      ? normalizeBotiquines(botiquinesResponse)
      : currentBotiquines;

    const inventario = needInventario
      ? normalizeInventario(inventarioResponse)
      : currentInventario;

    const inspecciones = needInspecciones
      ? normalizeInspecciones(inspeccionesResponse)
      : currentInspecciones;

    if (needReposiciones && typeof actions.setReposiciones === "function") {
      actions.setReposiciones(reposiciones);
    }

    if (needBotiquines && typeof actions.setBotiquines === "function") {
      actions.setBotiquines(botiquines);
    }

    if (needInventario && typeof actions.setInventario === "function") {
      actions.setInventario(inventario);
    }

    if (needInspecciones && typeof actions.setInspecciones === "function") {
      actions.setInspecciones(inspecciones);
    }

    if (typeof actions.setLastSync === "function") {
      actions.setLastSync(new Date().toISOString());
    }

    clearStoreError();

    return { reposiciones, botiquines, inventario, inspecciones };
  } catch (error) {
    console.error("[reposiciones] Error cargando datos:", error);
    setStoreError(error);
    showErrorToast(error?.message || "No se pudieron cargar las reposiciones.");
    throw error;
  } finally {
    setGlobalLoading(false);
  }
}

export function destroyReposicionesModule() {
  if (typeof moduleState.unsubscribe === "function") {
    moduleState.unsubscribe();
  }

  moduleState.initialized = false;
  moduleState.mounted = false;
  moduleState.container = null;
  moduleState.unsubscribe = null;
  moduleState.selectedReposicionId = "";
  moduleState.createModalOpen = false;
  moduleState.saving = false;
  moduleState.lastRenderSignature = "";
  moduleState.lastCreateContext = {
    botiquinId: "",
    inspeccionId: "",
    itemId: ""
  };
}

/* ======================================
   STORE / REACTIVIDAD
====================================== */

function handleStoreChange(payload) {
  if (!isReposicionesRoute()) return;
  if (!moduleState.container) return;

  const state = payload?.state || store.getState();
  const viewModel = getReposicionesViewModel(state);
  const signature = createRenderSignature(viewModel);

  if (signature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createReposicionesTemplate(viewModel));
    hydrateReposicionesUI(moduleState.container, viewModel);
    moduleState.lastRenderSignature = signature;
  }
}

function isReposicionesRoute() {
  const state = store.getState();
  const currentRoute = selectors.currentRoute?.(state);

  if (currentRoute) return currentRoute === "reposiciones";

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash === "reposiciones";
}

/* ======================================
   NORMALIZACIÓN
====================================== */

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
    elemento: String(item?.elemento || item?.nombre || item?.insumo || item?.producto || ""),
    categoria: String(item?.categoria || ""),
    unidad: String(item?.unidad || ""),
    cantidadRepuesta: Math.max(
      0,
      toNumber(item?.cantidad_repuesta ?? item?.cantidadRepuesta ?? item?.cantidad ?? 0)
    ),
    fecha: String(item?.fecha || item?.createdAt || item?.fechaRegistro || ""),
    responsable: String(item?.responsable || ""),
    motivo: String(item?.motivo || item?.razon || ""),
    lote: String(item?.lote || ""),
    fechaVencimientoNueva: String(
      item?.fecha_vencimiento_nueva || item?.fechaVencimientoNueva || ""
    ),
    observaciones: String(item?.observaciones || item?.comentarios || ""),
    estado: String(item?.estado || ""),
    updatedAt: String(
      item?.updatedAt || item?.fechaActualizacion || item?.fecha_actualizacion || ""
    ),
    raw: item
  }));
}

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
        item?.nombre_botiquin ||
        item?.nombreBotiquin ||
        item?.botiquin ||
        `Botiquín ${index + 1}`
    ),
    sede: String(item?.sede || ""),
    ubicacion: String(item?.ubicacion || ""),
    tipo: String(item?.tipo || ""),
    responsable: String(item?.responsable || ""),
    estado: String(item?.estado || ""),
    raw: item
  }));
}

function normalizeInventario(items = []) {
  return ensureArray(items).map((item, index) => {
    const idRegistro =
      item?.id_registro ||
      item?.id ||
      item?.rowId ||
      item?.row_id ||
      `INV-${String(index + 1).padStart(4, "0")}`;

    const idItem =
      item?.id_item ||
      item?.itemId ||
      item?.item_id ||
      item?.sku ||
      `ITEM-${String(index + 1).padStart(4, "0")}`;

    const botiquinId =
      item?.id_botiquin ||
      item?.botiquinId ||
      item?.botiquin_id ||
      item?.botiquin ||
      "";

    const cantidadActual = Math.max(
      0,
      toNumber(
        item?.cantidad_actual ??
          item?.cantidadActual ??
          item?.cantidad ??
          item?.stock ??
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
      item?.fecha_vencimiento ??
      item?.fechaVencimiento ??
      item?.vence ??
      item?.vencimiento ??
      "";

    return {
      id: String(idRegistro),
      idRegistro: String(idRegistro),
      idItem: String(idItem),
      botiquinId: String(botiquinId),
      elemento: String(
        item?.elemento ??
          item?.nombre ??
          item?.insumo ??
          item?.producto ??
          item?.descripcion ??
          `Elemento ${index + 1}`
      ),
      categoria: String(item?.categoria || ""),
      unidad: String(item?.unidad || ""),
      cantidadActual,
      cantidadMinima,
      lote: String(item?.lote || ""),
      fechaVencimiento: String(fechaVencimiento || ""),
      ubicacion: String(item?.ubicacion || ""),
      observaciones: String(item?.observaciones || ""),
      activo: normalizeActiveFlag(item?.activo, true),
      expiry: getSafeExpiryStatus(fechaVencimiento),
      raw: item
    };
  });
}

function normalizeInspecciones(items = []) {
  return ensureArray(items).map((item, index) => {
    const id =
      item?.id ||
      item?.id_inspeccion ||
      item?.inspeccionId ||
      `INS-${String(index + 1).padStart(4, "0")}`;

    const detalle = normalizeDetalleInspeccion(
      item?.detalle || item?.items || item?.detalle_items || []
    );

    return {
      id: String(id),
      botiquinId: String(
        item?.botiquinId || item?.id_botiquin || item?.botiquin_id || ""
      ),
      fecha: String(item?.fecha || item?.createdAt || item?.fechaRegistro || ""),
      responsable: String(item?.responsable || ""),
      estadoGeneral: String(
        item?.estadoGeneral || item?.estado_general || item?.estado || ""
      ),
      observaciones: String(
        item?.observaciones ||
          item?.observaciones_generales ||
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
      item?.accion_requerida ?? item?.accionRequerida ?? item?.accion ?? ""
    ),
    fechaVencimiento: String(
      item?.fecha_vencimiento ?? item?.fechaVencimiento ?? ""
    ),
    observacion: String(item?.observacion ?? item?.observaciones ?? ""),
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
   VIEW MODEL
====================================== */

function getReposicionesViewModel(state) {
  const allReposiciones = normalizeReposiciones(
    ensureArray(selectors.reposiciones?.(state))
  );
  const botiquines = normalizeBotiquines(
    ensureArray(selectors.botiquines?.(state))
  );
  const inventario = normalizeInventario(
    ensureArray(selectors.inventario?.(state))
  );
  const inspecciones = normalizeInspecciones(
    ensureArray(selectors.inspecciones?.(state))
  );

  const filters = normalizeReposicionesFilters(selectors.filters?.(state) || {});
  const selectedBotiquinId =
    selectors.selectedBotiquinId?.(state) ||
    selectors.selectedBotiquin?.(state) ||
    "";

  const botiquinesMap = new Map(botiquines.map((item) => [String(item.id), item]));
  const inventarioMap = new Map(inventario.map((item) => [String(item.idItem), item]));
  const inspeccionesMap = new Map(inspecciones.map((item) => [String(item.id), item]));

  const visibleReposiciones = filterReposiciones({
    items: allReposiciones,
    filters,
    selectedBotiquinId,
    botiquinesMap
  });

  const selectedReposicionId = resolveSelectedReposicionId({
    visibleReposiciones,
    allReposiciones
  });

  const selectedReposicionRaw =
    visibleReposiciones.find((item) => String(item.id) === String(selectedReposicionId)) ||
    allReposiciones.find((item) => String(item.id) === String(selectedReposicionId)) ||
    null;

  const selectedReposicion = decorateReposicion(
    selectedReposicionRaw,
    botiquinesMap,
    inventarioMap,
    inspeccionesMap
  );

  const decoratedReposiciones = visibleReposiciones.map((item) =>
    decorateReposicion(item, botiquinesMap, inventarioMap, inspeccionesMap)
  );

  const statsVisible = buildReposicionesStats(visibleReposiciones);
  const statsGlobal = buildReposicionesStats(allReposiciones);
  const selectedBotiquin = botiquinesMap.get(String(selectedBotiquinId || "")) || null;
  const pendingCandidates = buildPendingCandidates({
    inventario,
    inspecciones,
    reposiciones: allReposiciones,
    selectedBotiquinId
  });

  return {
    filters,
    stats: statsVisible,
    globalStats: statsGlobal,
    reposiciones: decoratedReposiciones,
    selectedReposicionId,
    selectedReposicion,
    selectedBotiquinId,
    selectedBotiquin,
    totalReposiciones: allReposiciones.length,
    visibleReposicionesCount: visibleReposiciones.length,
    pendingCandidates
  };
}

function normalizeReposicionesFilters(filters = {}) {
  return {
    search: filters.search || "",
    motivo: filters.motivo || "",
    responsable: filters.responsable || "",
    estado: filters.estado || ""
  };
}

function resolveSelectedReposicionId({ visibleReposiciones = [], allReposiciones = [] }) {
  const visibleIds = new Set(visibleReposiciones.map((item) => String(item.id)));

  if (moduleState.selectedReposicionId && visibleIds.has(String(moduleState.selectedReposicionId))) {
    return moduleState.selectedReposicionId;
  }

  if (visibleReposiciones.length) {
    moduleState.selectedReposicionId = visibleReposiciones[0].id;
    return moduleState.selectedReposicionId;
  }

  if (allReposiciones.length) {
    moduleState.selectedReposicionId = allReposiciones[0].id;
    return moduleState.selectedReposicionId;
  }

  moduleState.selectedReposicionId = "";
  return "";
}

function decorateReposicion(item, botiquinesMap = new Map(), inventarioMap = new Map(), inspeccionesMap = new Map()) {
  if (!item) return null;

  return {
    ...item,
    botiquin: botiquinesMap.get(String(item.botiquinId || "")) || null,
    inventarioItem: inventarioMap.get(String(item.idItem || "")) || null,
    inspeccionOrigen: inspeccionesMap.get(String(item.inspeccionOrigenId || "")) || null
  };
}

function filterReposiciones({
  items = [],
  filters = {},
  selectedBotiquinId = "",
  botiquinesMap = new Map()
}) {
  const search = normalizeText(filters.search);
  const motivo = normalizeText(filters.motivo);
  const responsable = normalizeText(filters.responsable);
  const estado = normalizeText(filters.estado);

  return ensureArray(items)
    .slice()
    .sort((a, b) => getDateValue(b.fecha) - getDateValue(a.fecha))
    .filter((item) => {
      const botiquin = botiquinesMap.get(String(item.botiquinId || ""));
      const haystack = normalizeText(
        [
          item.id,
          item.idItem,
          item.elemento,
          item.categoria,
          item.responsable,
          item.motivo,
          item.estado,
          item.observaciones,
          item.lote,
          item.inspeccionOrigenId,
          botiquin?.nombre,
          botiquin?.sede,
          botiquin?.ubicacion
        ]
          .filter(Boolean)
          .join(" ")
      );

      const matchesSearch = !search || haystack.includes(search);
      const matchesMotivo = !motivo || normalizeText(item.motivo).includes(motivo);
      const matchesResponsable = !responsable || normalizeText(item.responsable).includes(responsable);
      const matchesEstado = !estado || normalizeText(item.estado).includes(estado);
      const matchesBotiquin =
        !selectedBotiquinId ||
        String(item.botiquinId || "") === String(selectedBotiquinId);

      return matchesSearch && matchesMotivo && matchesResponsable && matchesEstado && matchesBotiquin;
    });
}

function buildReposicionesStats(items = []) {
  const total = items.length;
  const pendientes = items.filter((item) => normalizeText(item.estado) === "pendiente").length;
  const enProceso = items.filter((item) => normalizeText(item.estado) === "en proceso").length;
  const completadas = items.filter((item) =>
    ["completada", "completa", "ok"].includes(normalizeText(item.estado))
  ).length;
  const vinculadasInspeccion = items.filter((item) => Boolean(item.inspeccionOrigenId)).length;

  return {
    total,
    pendientes,
    enProceso,
    completadas,
    vinculadasInspeccion
  };
}

function buildPendingCandidates({
  inventario = [],
  inspecciones = [],
  reposiciones = [],
  selectedBotiquinId = ""
}) {
  const latestReposByItem = new Map();

  reposiciones
    .slice()
    .sort((a, b) => getDateValue(b.fecha) - getDateValue(a.fecha))
    .forEach((reposicion) => {
      const key = String(reposicion.idItem || "");
      if (key && !latestReposByItem.has(key)) {
        latestReposByItem.set(key, reposicion);
      }
    });

  const selectedInspectionCandidates = [];

  inspecciones.forEach((inspeccion) => {
    if (
      selectedBotiquinId &&
      String(inspeccion.botiquinId || "") !== String(selectedBotiquinId)
    ) {
      return;
    }

    ensureArray(inspeccion.detalle).forEach((detail) => {
      if (!detail.idItem) return;
      if (!needsReposition(detail)) return;

      const latestRepos = latestReposByItem.get(String(detail.idItem || ""));
      const alreadyCovered =
        latestRepos &&
        latestRepos.inspeccionOrigenId &&
        String(latestRepos.inspeccionOrigenId) === String(inspeccion.id);

      if (alreadyCovered) return;

      const inventoryItem = inventario.find(
        (inv) =>
          String(inv.idItem || "") === String(detail.idItem || "") &&
          String(inv.botiquinId || "") === String(inspeccion.botiquinId || "")
      );

      selectedInspectionCandidates.push({
        source: "inspeccion",
        botiquinId: inspeccion.botiquinId,
        inspeccionId: inspeccion.id,
        itemId: detail.idItem,
        elemento: detail.elemento || inventoryItem?.elemento || "",
        categoria: detail.categoria || inventoryItem?.categoria || "",
        unidad: detail.unidad || inventoryItem?.unidad || "",
        motivo: detail.estadoItem || detail.accionRequerida || "Ajuste por inspección",
        cantidadSugerida: Math.max(
          1,
          toNumber(detail.cantidadSistema, 0) - toNumber(detail.cantidadEncontrada, 0) || 1
        ),
        inventoryItem
      });
    });
  });

  return selectedInspectionCandidates
    .sort((a, b) => normalizeText(a.elemento).localeCompare(normalizeText(b.elemento), "es"));
}

function createRenderSignature(vm) {
  return JSON.stringify({
    filters: vm.filters,
    stats: vm.stats,
    selectedReposicionId: vm.selectedReposicionId,
    selectedBotiquinId: vm.selectedBotiquinId,
    totalReposiciones: vm.totalReposiciones,
    visibleCount: vm.visibleReposicionesCount,
    repoIds: vm.reposiciones.map((item) => item.id),
    selectedDetail: vm.selectedReposicion
      ? {
          id: vm.selectedReposicion.id,
          estado: vm.selectedReposicion.estado,
          cantidad: vm.selectedReposicion.cantidadRepuesta,
          fecha: vm.selectedReposicion.fecha
        }
      : null,
    pendingCandidates: vm.pendingCandidates.map((item) => [
      item.inspeccionId,
      item.itemId,
      item.botiquinId
    ])
  });
}

/* ======================================
   TEMPLATE
====================================== */

function createReposicionesTemplate(vm) {
  return `
    <section class="reposiciones-page" data-module="${MODULE_ID}">
      <header class="page-toolbar">
        <div>
          <h2 class="section-title">Reposiciones</h2>
          <p class="section-text">
            Registra reposiciones por ítem y conéctalas con inspecciones, inventario y hallazgos pendientes.
          </p>
        </div>

        <div class="page-toolbar__actions">
          <button
            type="button"
            class="btn btn--primary"
            data-action="create-reposicion"
          >
            Nueva reposición
          </button>

          <button
            type="button"
            class="btn btn--secondary"
            data-action="refresh-reposiciones"
            ${moduleState.saving ? "disabled" : ""}
          >
            Actualizar
          </button>
        </div>
      </header>

      ${renderReposicionesContextBar(vm)}

      <section class="kpi-grid">
        <article class="kpi-card">
          <span class="kpi-card__label">Total reposiciones</span>
          <strong class="kpi-card__value">${vm.stats.total}</strong>
          <span class="kpi-card__hint">${escapeHTML(getStatsHint(vm, "total"))}</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Pendientes</span>
          <strong class="kpi-card__value">${vm.stats.pendientes}</strong>
          <span class="kpi-card__hint">Aún no cerradas en el flujo</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">En proceso</span>
          <strong class="kpi-card__value">${vm.stats.enProceso}</strong>
          <span class="kpi-card__hint">Reposición iniciada</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Desde inspección</span>
          <strong class="kpi-card__value">${vm.stats.vinculadasInspeccion}</strong>
          <span class="kpi-card__hint">Con trazabilidad completa</span>
        </article>
      </section>

      ${
        vm.pendingCandidates.length
          ? renderPendingCandidatesCard(vm.pendingCandidates)
          : ""
      }

      <section class="card">
        <div class="card__body">
          <form class="filters-grid" data-role="reposiciones-filters" autocomplete="off">
            <div class="form-group">
              <label class="form-label" for="reposicionesSearch">Buscar</label>
              <input
                id="reposicionesSearch"
                name="search"
                class="input"
                type="search"
                placeholder="Elemento, botiquín, responsable, ID..."
                value="${escapeHTML(vm.filters.search || "")}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="reposicionesMotivo">Motivo</label>
              <input
                id="reposicionesMotivo"
                name="motivo"
                class="input"
                type="text"
                placeholder="Faltante, vencimiento, inspección..."
                value="${escapeHTML(vm.filters.motivo || "")}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="reposicionesResponsable">Responsable</label>
              <input
                id="reposicionesResponsable"
                name="responsable"
                class="input"
                type="text"
                placeholder="Nombre responsable"
                value="${escapeHTML(vm.filters.responsable || "")}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="reposicionesEstado">Estado</label>
              <input
                id="reposicionesEstado"
                name="estado"
                class="input"
                type="text"
                placeholder="Pendiente, en proceso..."
                value="${escapeHTML(vm.filters.estado || "")}"
              />
            </div>

            <div class="form-group form-group--actions">
              <label class="form-label is-ghost">Acciones</label>
              <div class="form-actions-inline">
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="reset-reposiciones-filters"
                >
                  Limpiar filtros
                </button>

                ${
                  vm.selectedBotiquinId
                    ? `
                      <button
                        type="button"
                        class="btn btn--secondary"
                        data-action="clear-selected-botiquin"
                      >
                        Ver todos
                      </button>
                    `
                    : ""
                }
              </div>
            </div>
          </form>
        </div>
      </section>

      <section class="reposiciones-layout">
        <div class="reposiciones-layout__list">
          ${renderReposicionesList(vm.reposiciones, vm.selectedReposicionId)}
        </div>

        <aside class="reposiciones-layout__detail">
          ${renderReposicionDetail(vm.selectedReposicion)}
        </aside>
      </section>
    </section>
  `;
}

function renderReposicionesContextBar(vm) {
  const selectedBotiquin = vm.selectedBotiquin;

  return `
    <section class="card reposiciones-context-card">
      <div class="card__body reposiciones-context">
        <div class="reposiciones-context__main">
          <span class="reposiciones-context__eyebrow">Contexto actual</span>
          <h3 class="reposiciones-context__title">
            ${
              selectedBotiquin
                ? escapeHTML(selectedBotiquin.nombre || "Botiquín seleccionado")
                : "Vista consolidada"
            }
          </h3>
          <p class="section-text">
            ${
              selectedBotiquin
                ? "Las reposiciones y sugerencias se están filtrando por el botiquín activo."
                : "Se muestra el historial consolidado de reposiciones de todos los botiquines."
            }
          </p>
        </div>

        <div class="reposiciones-context__meta">
          ${
            selectedBotiquin
              ? `
                ${selectedBotiquin.tipo ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.tipo)}</span>` : ""}
                ${selectedBotiquin.ubicacion ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.ubicacion)}</span>` : ""}
                ${selectedBotiquin.sede ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.sede)}</span>` : ""}
              `
              : `
                <span class="badge badge--success">Vista global</span>
                <span class="badge badge--muted">${vm.totalReposiciones} registros</span>
              `
          }
        </div>

        <div class="reposiciones-context__actions">
          <button
            type="button"
            class="btn btn--primary"
            data-action="create-reposicion"
          >
            Crear reposición
          </button>

          ${
            selectedBotiquin
              ? `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="open-botiquin"
                  data-botiquin-id="${escapeHTML(selectedBotiquin.id || "")}"
                >
                  Ir a botiquín
                </button>
              `
              : `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-inspecciones"
                >
                  Ver inspecciones
                </button>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderPendingCandidatesCard(candidates = []) {
  return `
    <section class="card">
      <div class="card__body">
        <div class="detail-header">
          <div>
            <h3 class="card__title">Pendientes sugeridos desde inspecciones</h3>
            <p class="section-text">
              Hallazgos con pinta clara de reposición. Qué milagro, ahora sí hay trazabilidad.
            </p>
          </div>
        </div>

        <div class="cards-grid">
          ${candidates.slice(0, 8).map(renderPendingCandidateCard).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPendingCandidateCard(candidate) {
  return `
    <article class="card card--compact">
      <div class="card__body">
        <span class="badge badge--warning">Pendiente</span>
        <h4 class="card__title">${escapeHTML(candidate.elemento || candidate.itemId || "Ítem sin nombre")}</h4>
        <p class="section-text">
          ${escapeHTML(candidate.motivo || "Sin motivo")}
        </p>

        <dl class="data-list">
          <div>
            <dt>ID ítem</dt>
            <dd>${escapeHTML(candidate.itemId || "Sin ID")}</dd>
          </div>
          <div>
            <dt>Cantidad sugerida</dt>
            <dd>${escapeHTML(String(candidate.cantidadSugerida || 1))}</dd>
          </div>
        </dl>

        <div class="card__actions">
          <button
            type="button"
            class="btn btn--primary"
            data-action="create-reposicion-from-candidate"
            data-botiquin-id="${escapeHTML(candidate.botiquinId || "")}"
            data-inspeccion-id="${escapeHTML(candidate.inspeccionId || "")}"
            data-item-id="${escapeHTML(candidate.itemId || "")}"
          >
            Reponer
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderReposicionesList(items = [], selectedId = "") {
  if (!items.length) {
    return `
      <article class="card card--empty">
        <div class="card__body">
          <h3 class="card__title">No hay reposiciones para mostrar</h3>
          <p class="section-text">
            No encontré resultados con los filtros actuales. Nadie repuso nada o todavía no lo registraron, clásico.
          </p>

          <div class="card__actions">
            <button
              type="button"
              class="btn btn--primary"
              data-action="create-reposicion"
            >
              Registrar reposición
            </button>
          </div>
        </div>
      </article>
    `;
  }

  return `
    <div class="cards-grid">
      ${items.map((item) => renderReposicionCard(item, selectedId)).join("")}
    </div>
  `;
}

function renderReposicionCard(item, selectedId = "") {
  const isActive = String(item.id) === String(selectedId);
  const botiquinNombre = item.botiquin?.nombre || "Botiquín no definido";
  const subtitle = [
    botiquinNombre,
    item.responsable || "",
    item.fecha ? formatDate(item.fecha) : ""
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <article
      class="card reposicion-card ${isActive ? "is-active" : ""}"
      data-reposicion-id="${escapeHTML(item.id)}"
    >
      <div class="card__body">
        <div class="reposicion-card__header">
          <div>
            <span class="badge ${getEstadoBadgeClass(item.estado)}">
              ${escapeHTML(item.estado || "Sin estado")}
            </span>
            <h3 class="card__title">${escapeHTML(item.elemento || "Sin elemento")}</h3>
            <p class="reposicion-card__meta">${escapeHTML(subtitle)}</p>
          </div>
        </div>

        <dl class="data-list">
          <div>
            <dt>ID ítem</dt>
            <dd>${escapeHTML(item.idItem || "Sin ID")}</dd>
          </div>
          <div>
            <dt>Cantidad</dt>
            <dd>${escapeHTML(String(item.cantidadRepuesta ?? 0))}${item.unidad ? ` ${escapeHTML(item.unidad)}` : ""}</dd>
          </div>
          <div>
            <dt>Motivo</dt>
            <dd>${escapeHTML(item.motivo || "No registrado")}</dd>
          </div>
        </dl>

        <p class="section-text">
          ${escapeHTML(item.observaciones || "Sin observaciones registradas.")}
        </p>

        <div class="card__actions">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="select-reposicion"
            data-reposicion-id="${escapeHTML(item.id)}"
          >
            Ver detalle
          </button>

          <button
            type="button"
            class="btn btn--secondary"
            data-action="open-botiquin"
            data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
          >
            Ver botiquín
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderReposicionDetail(item) {
  if (!item) {
    return `
      <article class="card">
        <div class="card__body">
          <h3 class="card__title">Detalle de reposición</h3>
          <p class="section-text">
            Selecciona una reposición para ver la información completa y su trazabilidad.
          </p>
        </div>
      </article>
    `;
  }

  const expiryText = item.fechaVencimientoNueva
    ? formatExpiryText(item.fechaVencimientoNueva)
    : "Sin fecha registrada";

  return `
    <article class="card reposicion-detail-card">
      <div class="card__body">
        <div class="detail-header">
          <div>
            <span class="badge ${getEstadoBadgeClass(item.estado)}">
              ${escapeHTML(item.estado || "Sin estado")}
            </span>
            <h3 class="card__title">${escapeHTML(item.elemento || "Sin elemento")}</h3>
            <p class="section-text">
              ${escapeHTML(
                [
                  item.botiquin?.nombre || "",
                  item.botiquin?.ubicacion || "",
                  item.responsable || ""
                ].filter(Boolean).join(" · ")
              )}
            </p>
          </div>
        </div>

        <dl class="data-list data-list--stack">
          <div><dt>ID reposición</dt><dd>${escapeHTML(item.id)}</dd></div>
          <div><dt>ID ítem</dt><dd>${escapeHTML(item.idItem || "No registrado")}</dd></div>
          <div><dt>ID inspección origen</dt><dd>${escapeHTML(item.inspeccionOrigenId || "Sin origen")}</dd></div>
          <div><dt>Fecha</dt><dd>${item.fecha ? escapeHTML(formatDate(item.fecha)) : "Sin fecha"}</dd></div>
          <div><dt>Botiquín</dt><dd>${escapeHTML(item.botiquin?.nombre || "No definido")}</dd></div>
          <div><dt>Sede</dt><dd>${escapeHTML(item.botiquin?.sede || "No registrada")}</dd></div>
          <div><dt>Ubicación</dt><dd>${escapeHTML(item.botiquin?.ubicacion || "No registrada")}</dd></div>
          <div><dt>Cantidad repuesta</dt><dd>${escapeHTML(String(item.cantidadRepuesta ?? 0))} ${item.unidad ? escapeHTML(item.unidad) : ""}</dd></div>
          <div><dt>Motivo</dt><dd>${escapeHTML(item.motivo || "No registrado")}</dd></div>
          <div><dt>Lote</dt><dd>${escapeHTML(item.lote || "No registrado")}</dd></div>
          <div><dt>Nuevo vencimiento</dt><dd>${item.fechaVencimientoNueva ? escapeHTML(formatDate(item.fechaVencimientoNueva)) : "No registrado"}</dd></div>
          <div><dt>Resumen vencimiento</dt><dd>${escapeHTML(expiryText)}</dd></div>
          <div><dt>Observaciones</dt><dd>${escapeHTML(item.observaciones || "Sin observaciones")}</dd></div>
          <div><dt>Última actualización</dt><dd>${item.updatedAt ? escapeHTML(formatDate(item.updatedAt)) : "No registrada"}</dd></div>
        </dl>

        <div class="card__actions">
          <button
            type="button"
            class="btn btn--secondary"
            data-action="open-botiquin"
            data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
          >
            Ir a botiquín
          </button>

          ${
            item.inspeccionOrigenId
              ? `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-inspecciones"
                  data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
                >
                  Ver inspección origen
                </button>
              `
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function hydrateReposicionesUI(container, vm) {
  qsa("[data-reposicion-id]", container).forEach((card) => {
    const id = card.dataset.reposicionId;

    if (String(id) === String(vm.selectedReposicionId)) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  });

  const searchInput = qs("#reposicionesSearch", container);
  const motivoInput = qs("#reposicionesMotivo", container);
  const responsableInput = qs("#reposicionesResponsable", container);
  const estadoInput = qs("#reposicionesEstado", container);

  if (searchInput && document.activeElement !== searchInput) {
    searchInput.value = vm.filters.search || "";
  }

  if (motivoInput && document.activeElement !== motivoInput) {
    motivoInput.value = vm.filters.motivo || "";
  }

  if (responsableInput && document.activeElement !== responsableInput) {
    responsableInput.value = vm.filters.responsable || "";
  }

  if (estadoInput && document.activeElement !== estadoInput) {
    estadoInput.value = vm.filters.estado || "";
  }
}

/* ======================================
   EVENTOS
====================================== */

function bindReposicionesEvents() {
  document.addEventListener("input", handleReposicionesInput, true);
  document.addEventListener("click", handleReposicionesClick, true);
}

function bindReposicionesGlobalEvents() {
  document.addEventListener("keydown", handleReposicionesKeydown, true);
}

const debouncedSearch = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ search: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedMotivo = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ motivo: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedResponsable = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ responsable: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedEstado = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ estado: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

function handleReposicionesInput(event) {
  const target = event.target;
  if (!moduleState.container) return;
  if (!moduleState.container.contains(target)) return;

  if (target.matches("#reposicionesSearch")) {
    debouncedSearch(target.value);
    return;
  }

  if (target.matches("#reposicionesMotivo")) {
    debouncedMotivo(target.value);
    return;
  }

  if (target.matches("#reposicionesResponsable")) {
    debouncedResponsable(target.value);
    return;
  }

  if (target.matches("#reposicionesEstado")) {
    debouncedEstado(target.value);
  }
}

async function handleReposicionesClick(event) {
  const trigger = event.target.closest("[data-action], [data-reposicion-id]");
  if (!trigger) return;

  if (!moduleState.container?.contains(trigger)) return;

  const action = trigger.dataset.action;
  const reposicionId =
    trigger.dataset.reposicionId ||
    trigger.closest("[data-reposicion-id]")?.dataset.reposicionId ||
    "";
  const botiquinId = trigger.dataset.botiquinId || "";
  const inspeccionId = trigger.dataset.inspeccionId || "";
  const itemId = trigger.dataset.itemId || "";

  if (!action && reposicionId) {
    selectReposicion(reposicionId);
    return;
  }

  switch (action) {
    case "refresh-reposiciones":
      await syncReposicionesModuleData({ force: true });
      renderReposicionesView();
      return;

    case "reset-reposiciones-filters":
      if (typeof actions.setFilters === "function") {
        actions.setFilters({
          search: "",
          motivo: "",
          responsable: "",
          estado: ""
        });
      }
      return;

    case "select-reposicion":
      if (reposicionId) selectReposicion(reposicionId);
      return;

    case "open-botiquin":
      if (botiquinId) setSelectedBotiquin(botiquinId);
      navigateTo("botiquines");
      return;

    case "go-inspecciones":
      if (botiquinId) setSelectedBotiquin(botiquinId);
      navigateTo("inspecciones");
      return;

    case "clear-selected-botiquin":
      clearSelectedBotiquin();
      renderReposicionesView();
      return;

    case "create-reposicion":
      await openCreateReposicionModal();
      return;

    case "create-reposicion-from-candidate":
      await openCreateReposicionModal({
        botiquinId,
        inspeccionId,
        itemId
      });
      return;

    default:
      break;
  }
}

function handleReposicionesKeydown(event) {
  if (!moduleState.createModalOpen) return;

  if (event.key === "Escape") {
    event.preventDefault();
  }
}

function selectReposicion(reposicionId) {
  moduleState.selectedReposicionId = String(reposicionId || "");
  renderReposicionesView();
}

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

/* ======================================
   CREACIÓN
====================================== */

async function openCreateReposicionModal(prefill = {}) {
  if (moduleState.saving) return;

  const state = store.getState();
  let botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));
  let inventario = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  let inspecciones = normalizeInspecciones(ensureArray(selectors.inspecciones?.(state)));

  if (!botiquines.length || !inventario.length || !inspecciones.length) {
    await syncReposicionesModuleData({ force: true });
    const refreshed = store.getState();
    botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(refreshed)));
    inventario = normalizeInventario(ensureArray(selectors.inventario?.(refreshed)));
    inspecciones = normalizeInspecciones(ensureArray(selectors.inspecciones?.(refreshed)));
  }

  const selectedBotiquinId =
    prefill.botiquinId ||
    selectors.selectedBotiquinId?.(store.getState()) ||
    selectors.selectedBotiquin?.(store.getState()) ||
    botiquines[0]?.id ||
    "";

  const sourceContext = resolveReposicionSourceContext({
    botiquines,
    inventario,
    inspecciones,
    selectedBotiquinId,
    prefill
  });

  moduleState.createModalOpen = true;
  moduleState.lastCreateContext = {
    botiquinId: sourceContext.botiquinId || "",
    inspeccionId: sourceContext.inspeccionId || "",
    itemId: sourceContext.itemId || ""
  };

  openFormModal({
    modalId: CREATE_MODAL_ID,
    title: "Nueva reposición",
    subtitle: "Registro conectado con botiquín, ítem e inspección de origen cuando aplica.",
    submitLabel: "Guardar reposición",
    fields: buildReposicionFields({ botiquines, sourceContext }),
    onInit: ({ formElement }) => {
      bindReposicionCreateFormEnhancements({
        formElement,
        inventario,
        inspecciones,
        botiquines
      });
    },
    onSubmit: async (values, context) => {
      await submitReposicionForm(values, context, { inventario, inspecciones });
    },
    onClose: () => {
      moduleState.createModalOpen = false;
      moduleState.saving = false;
      moduleState.lastCreateContext = {
        botiquinId: "",
        inspeccionId: "",
        itemId: ""
      };
    }
  });
}

function buildReposicionFields({ botiquines = [], sourceContext = {} }) {
  const sourceLabel = sourceContext.inspeccionId
    ? `Inspección ${sourceContext.inspeccionId}`
    : "Registro manual";

  return [
    {
      type: "html",
      name: "reposicion_context_banner",
      col: 12,
      html: `
        <section class="detail-section">
          <div class="detail-header">
            <div>
              <h4 class="detail-section__title">Contexto de origen</h4>
              <p class="section-text">
                ${escapeHTML(sourceLabel)}${sourceContext.elemento ? ` · ${escapeHTML(sourceContext.elemento)}` : ""}
              </p>
            </div>
          </div>
        </section>
      `
    },
    {
      name: "id_botiquin",
      label: "Botiquín",
      type: "select",
      required: true,
      value: sourceContext.botiquinId || "",
      col: 6,
      options: botiquines.map((botiquin) => ({
        value: botiquin.id,
        label: [botiquin.nombre, botiquin.sede].filter(Boolean).join(" · ")
      }))
    },
    {
      name: "fecha",
      label: "Fecha",
      type: "date",
      required: true,
      value: getTodayISODate(),
      col: 3
    },
    {
      name: "estado",
      label: "Estado",
      type: "select",
      required: true,
      value: sourceContext.defaultEstado || "Completada",
      col: 3,
      options: ESTADO_OPTIONS
    },
    {
      name: "responsable",
      label: "Responsable",
      type: "text",
      required: true,
      placeholder: "Nombre responsable",
      col: 6
    },
    {
      name: "motivo",
      label: "Motivo",
      type: "select",
      required: true,
      value: sourceContext.motivo || "",
      col: 6,
      options: MOTIVO_OPTIONS
    },
    {
      name: "id_item",
      label: "ID ítem",
      type: "text",
      required: true,
      value: sourceContext.itemId || "",
      col: 4,
      hint: "Debe corresponder al ítem de inventario real."
    },
    {
      name: "elemento",
      label: "Elemento",
      type: "text",
      required: true,
      value: sourceContext.elemento || "",
      col: 8
    },
    {
      name: "categoria",
      label: "Categoría",
      type: "text",
      value: sourceContext.categoria || "",
      col: 4
    },
    {
      name: "unidad",
      label: "Unidad",
      type: "text",
      value: sourceContext.unidad || "",
      col: 4
    },
    {
      name: "cantidad_repuesta",
      label: "Cantidad repuesta",
      type: "number",
      min: 1,
      step: 1,
      required: true,
      value: sourceContext.cantidadSugerida || 1,
      col: 4
    },
    {
      name: "lote",
      label: "Lote",
      type: "text",
      value: "",
      col: 4
    },
    {
      name: "fecha_vencimiento_nueva",
      label: "Nuevo vencimiento",
      type: "date",
      value: "",
      col: 4
    },
    {
      name: "id_inspeccion_origen",
      label: "ID inspección origen",
      type: "text",
      value: sourceContext.inspeccionId || "",
      col: 4,
      readonly: Boolean(sourceContext.inspeccionId)
    },
    {
      name: "observaciones",
      label: "Observaciones",
      type: "textarea",
      rows: 4,
      value: sourceContext.observacion || "",
      col: 12
    }
  ];
}

function bindReposicionCreateFormEnhancements({
  formElement,
  inventario,
  inspecciones
}) {
  const botiquinField = qs('[name="id_botiquin"]', formElement);
  const itemField = qs('[name="id_item"]', formElement);

  if (botiquinField) {
    botiquinField.addEventListener("change", () => {
      const botiquinId = botiquinField.value || "";
      moduleState.lastCreateContext.botiquinId = botiquinId;

      if (!itemField?.value) return;

      const inv = inventario.find(
        (item) =>
          String(item.idItem || "") === String(itemField.value || "") &&
          String(item.botiquinId || "") === String(botiquinId)
      );

      if (inv) {
        fillReposicionFormFromInventoryItem(formElement, inv);
      }
    });
  }

  if (itemField) {
    itemField.addEventListener("blur", () => {
      const botiquinId = qs('[name="id_botiquin"]', formElement)?.value || "";
      const itemId = itemField.value || "";

      if (!itemId) return;

      const inv = inventario.find(
        (item) =>
          String(item.idItem || "") === String(itemId) &&
          (!botiquinId || String(item.botiquinId || "") === String(botiquinId))
      );

      if (inv) {
        fillReposicionFormFromInventoryItem(formElement, inv);
        moduleState.lastCreateContext.itemId = inv.idItem || "";
        moduleState.lastCreateContext.botiquinId = inv.botiquinId || "";
      }

      const sourceInspection = findLatestRelevantInspectionForItem({
        inspecciones,
        itemId,
        botiquinId: botiquinId || inv?.botiquinId || ""
      });

      if (sourceInspection) {
        const inspeccionField = qs('[name="id_inspeccion_origen"]', formElement);
        if (inspeccionField && !inspeccionField.value) {
          inspeccionField.value = sourceInspection.id;
        }
      }
    });
  }
}

function fillReposicionFormFromInventoryItem(formElement, inv) {
  const elementoField = qs('[name="elemento"]', formElement);
  const categoriaField = qs('[name="categoria"]', formElement);
  const unidadField = qs('[name="unidad"]', formElement);
  const botiquinField = qs('[name="id_botiquin"]', formElement);
  const motivoField = qs('[name="motivo"]', formElement);
  const cantidadField = qs('[name="cantidad_repuesta"]', formElement);

  if (elementoField && !elementoField.value) elementoField.value = inv.elemento || "";
  if (categoriaField && !categoriaField.value) categoriaField.value = inv.categoria || "";
  if (unidadField && !unidadField.value) unidadField.value = inv.unidad || "";
  if (botiquinField && !botiquinField.value) botiquinField.value = inv.botiquinId || "";

  if (motivoField && !motivoField.value) {
    motivoField.value = deriveReposicionMotivoFromInventory(inv);
  }

  if (cantidadField && (!cantidadField.value || Number(cantidadField.value) <= 0)) {
    const suggested = inv.cantidadMinima > inv.cantidadActual
      ? Math.max(1, inv.cantidadMinima - inv.cantidadActual)
      : 1;
    cantidadField.value = String(suggested);
  }
}

async function submitReposicionForm(values, context = {}, { inventario = [], inspecciones = [] } = {}) {
  if (moduleState.saving) return;

  const { formElement, close } = context;
  const submitButton = formElement?.querySelector?.('[data-role="form-submit"]');

  moduleState.saving = true;

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Guardando...";
    }

    const payload = buildReposicionPayload(values);
    validateReposicionPayload(payload, { inventario });

    setGlobalLoading(true, "Guardando reposición...");
    const result = await saveReposicion(payload);

    const createdRecord =
      result?.record ||
      result?.data ||
      result?.item ||
      null;

    await syncReposicionesModuleData({ force: true });

    const createdId =
      createdRecord?.id ||
      createdRecord?.id_reposicion ||
      "";

    if (createdId) {
      moduleState.selectedReposicionId = String(createdId);
    } else {
      const refreshed = store.getState();
      const allRepos = normalizeReposiciones(
        ensureArray(selectors.reposiciones?.(refreshed))
      );
      moduleState.selectedReposicionId = allRepos[0]?.id || "";
    }

    showSuccessToast("Reposición guardada correctamente.");

    if (typeof close === "function") {
      close();
    }

    renderReposicionesView();
  } catch (error) {
    console.error("[reposiciones] Error guardando reposición:", error);
    setStoreError(error);
    showErrorToast(error?.message || "No se pudo guardar la reposición.");
    throw error;
  } finally {
    moduleState.saving = false;
    moduleState.createModalOpen = false;
    setGlobalLoading(false);

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Guardar reposición";
    }
  }
}

function buildReposicionPayload(values = {}) {
  return {
    id_botiquin: values.id_botiquin || "",
    id_item: values.id_item || "",
    id_inspeccion_origen: values.id_inspeccion_origen || "",
    elemento: values.elemento || "",
    categoria: values.categoria || "",
    unidad: values.unidad || "",
    cantidad_repuesta: Math.max(1, toNumber(values.cantidad_repuesta, 1)),
    fecha: values.fecha || "",
    responsable: values.responsable || "",
    motivo: values.motivo || "",
    lote: values.lote || "",
    fecha_vencimiento_nueva: values.fecha_vencimiento_nueva || "",
    observaciones: values.observaciones || "",
    estado: values.estado || "Completada"
  };
}

function validateReposicionPayload(payload, { inventario = [] } = {}) {
  if (!payload.id_botiquin) {
    throw new Error("Debes seleccionar un botiquín.");
  }

  if (!payload.id_item) {
    throw new Error("Debes indicar el ID del ítem.");
  }

  if (!payload.fecha) {
    throw new Error("Debes indicar la fecha.");
  }

  if (!payload.responsable) {
    throw new Error("Debes indicar el responsable.");
  }

  if (!payload.elemento) {
    throw new Error("Debes indicar el elemento repuesto.");
  }

  if (!payload.cantidad_repuesta || payload.cantidad_repuesta <= 0) {
    throw new Error("La cantidad repuesta debe ser mayor que 0.");
  }

  if (!payload.motivo) {
    throw new Error("Debes indicar el motivo de la reposición.");
  }

  const existsInInventory = inventario.some(
    (item) =>
      String(item.idItem || "") === String(payload.id_item) &&
      String(item.botiquinId || "") === String(payload.id_botiquin)
  );

  if (!existsInInventory) {
    throw new Error("El ID del ítem no coincide con el inventario del botiquín seleccionado.");
  }
}

function resolveReposicionSourceContext({
  botiquines = [],
  inventario = [],
  inspecciones = [],
  selectedBotiquinId = "",
  prefill = {}
}) {
  const botiquinId = prefill.botiquinId || selectedBotiquinId || botiquines[0]?.id || "";
  const itemId = prefill.itemId || "";
  const inspeccionId = prefill.inspeccionId || "";

  const inventoryItem = inventario.find(
    (item) =>
      (!itemId || String(item.idItem || "") === String(itemId)) &&
      (!botiquinId || String(item.botiquinId || "") === String(botiquinId))
  );

  let sourceInspection = null;
  if (inspeccionId) {
    sourceInspection = inspecciones.find((item) => String(item.id) === String(inspeccionId)) || null;
  } else if (inventoryItem) {
    sourceInspection = findLatestRelevantInspectionForItem({
      inspecciones,
      itemId: inventoryItem.idItem,
      botiquinId: inventoryItem.botiquinId
    });
  }

  const sourceDetail =
    sourceInspection?.detalle?.find(
      (detail) => String(detail.idItem || "") === String(itemId || inventoryItem?.idItem || "")
    ) || null;

  return {
    botiquinId: botiquinId || inventoryItem?.botiquinId || "",
    inspeccionId: sourceInspection?.id || "",
    itemId: itemId || inventoryItem?.idItem || "",
    elemento: inventoryItem?.elemento || sourceDetail?.elemento || "",
    categoria: inventoryItem?.categoria || sourceDetail?.categoria || "",
    unidad: inventoryItem?.unidad || sourceDetail?.unidad || "",
    cantidadSugerida: sourceDetail
      ? Math.max(
          1,
          toNumber(sourceDetail.cantidadSistema, 0) - toNumber(sourceDetail.cantidadEncontrada, 0) || 1
        )
      : inventoryItem
        ? Math.max(1, inventoryItem.cantidadMinima - inventoryItem.cantidadActual || 1)
        : 1,
    motivo:
      sourceDetail?.estadoItem ||
      deriveReposicionMotivoFromInventory(inventoryItem) ||
      "",
    observacion: sourceDetail?.observacion || "",
    defaultEstado: "Completada"
  };
}

function findLatestRelevantInspectionForItem({
  inspecciones = [],
  itemId = "",
  botiquinId = ""
}) {
  return inspecciones
    .filter((inspeccion) => {
      const matchesBotiquin =
        !botiquinId || String(inspeccion.botiquinId || "") === String(botiquinId);

      const hasItem = ensureArray(inspeccion.detalle).some(
        (detail) =>
          String(detail.idItem || "") === String(itemId || "") &&
          needsReposition(detail)
      );

      return matchesBotiquin && hasItem;
    })
    .sort((a, b) => getDateValue(b.fecha) - getDateValue(a.fecha))[0] || null;
}

function deriveReposicionMotivoFromInventory(inv) {
  if (!inv) return "";

  const expiry = getSafeExpiryStatus(inv.fechaVencimiento);

  if ((inv.cantidadActual ?? 0) <= 0) return "Faltante";
  if ((inv.cantidadMinima ?? 0) > 0 && (inv.cantidadActual ?? 0) <= (inv.cantidadMinima ?? 0)) {
    return "Bajo stock";
  }
  if (expiry.isExpired) return "Vencimiento";
  if (expiry.isNearExpiry) return "Reposición preventiva";
  return "Otro";
}

function needsReposition(detail) {
  const status = normalizeText(detail.estadoItem || "");
  const action = normalizeText(detail.accionRequerida || "");

  return (
    ["faltante", "bajo stock", "deteriorado", "vencido"].includes(status) ||
    ["reponer", "dar de baja", "ajustar inventario"].includes(action)
  );
}

/* ======================================
   HELPERS UI
====================================== */

function getEstadoBadgeClass(estado = "") {
  const normalized = normalizeText(estado);

  if (["completada", "completa", "ok"].includes(normalized)) return "badge--success";
  if (["pendiente"].includes(normalized)) return "badge--warning";
  if (["en proceso"].includes(normalized)) return "badge--alert";
  if (["cancelada", "error"].includes(normalized)) return "badge--danger";

  return "badge--muted";
}

function getStatsHint(vm, type) {
  if (vm.selectedBotiquin?.nombre && type === "total") {
    return `Resumen de ${vm.selectedBotiquin.nombre}`;
  }

  return "Historial filtrado actual";
}

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

/* ======================================
   HELPERS GENERALES
====================================== */

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

function getDateValue(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getTodayISODate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
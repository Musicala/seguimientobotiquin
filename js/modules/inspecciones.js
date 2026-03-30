import { store, selectors, actions } from "../state.js";
import {
  getInspecciones,
  getBotiquines,
  getInventario,
  saveInspeccion
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

const MODULE_ID = "inspecciones-module";
const SEARCH_DEBOUNCE_MS = 250;
const CREATE_MODAL_ID = "inspeccion-create-modal";

const GENERAL_STATUS_OPTIONS = [
  { value: "OK", label: "OK" },
  { value: "Con novedades", label: "Con novedades" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Crítico", label: "Crítico" }
];

const DETAIL_STATUS_OPTIONS = [
  { value: "OK", label: "OK" },
  { value: "Bajo stock", label: "Bajo stock" },
  { value: "Faltante", label: "Faltante" },
  { value: "Vencido", label: "Vencido" },
  { value: "Por vencer", label: "Por vencer" },
  { value: "Deteriorado", label: "Deteriorado" },
  { value: "Pendiente", label: "Pendiente" }
];

const ACTION_OPTIONS = [
  { value: "", label: "Sin acción" },
  { value: "Reponer", label: "Reponer" },
  { value: "Ajustar inventario", label: "Ajustar inventario" },
  { value: "Revisar vencimiento", label: "Revisar vencimiento" },
  { value: "Dar de baja", label: "Dar de baja" },
  { value: "Seguimiento", label: "Seguimiento" }
];

const moduleState = {
  initialized: false,
  mounted: false,
  container: null,
  unsubscribe: null,
  selectedInspeccionId: "",
  creating: false,
  createModalOpen: false,
  lastRenderSignature: "",
  lastCreateContextBotiquinId: ""
};

/* ======================================
   API PÚBLICA
====================================== */

export async function initInspeccionesModule(options = {}) {
  const { container, forceRender = false } = options;

  if (!(container instanceof HTMLElement)) {
    throw new Error("[inspecciones] initInspeccionesModule requiere un container válido.");
  }

  moduleState.container = container;

  if (!moduleState.initialized) {
    moduleState.unsubscribe = store.subscribe(handleStoreChange);
    bindInspeccionesEvents();
    bindInspeccionesGlobalEvents();
    moduleState.initialized = true;
  }

  await syncInspeccionesModuleData();

  if (forceRender || isInspeccionesRoute()) {
    renderInspeccionesView();
  }

  moduleState.mounted = true;
}

export function renderInspeccionesView() {
  if (!moduleState.container) return;

  const state = store.getState();
  const viewModel = getInspeccionesViewModel(state);
  const signature = createRenderSignature(viewModel);

  if (!moduleState.mounted || moduleState.lastRenderSignature !== signature) {
    setHTML(moduleState.container, createInspeccionesTemplate(viewModel));
    hydrateInspeccionesUI(moduleState.container, viewModel);
    moduleState.lastRenderSignature = signature;
  }
}

export async function syncInspeccionesModuleData(options = {}) {
  const { force = false } = options;
  const state = store.getState();

  const currentInspecciones = normalizeInspecciones(
    ensureArray(selectors.inspecciones?.(state))
  );
  const currentBotiquines = normalizeBotiquines(
    ensureArray(selectors.botiquines?.(state))
  );
  const currentInventario = normalizeInventario(
    ensureArray(selectors.inventario?.(state))
  );

  const needInspecciones = force || !currentInspecciones.length;
  const needBotiquines = force || !currentBotiquines.length;
  const needInventario = force || !currentInventario.length;

  if (!needInspecciones && !needBotiquines && !needInventario) {
    return {
      inspecciones: currentInspecciones,
      botiquines: currentBotiquines,
      inventario: currentInventario
    };
  }

  setGlobalLoading(true, "Cargando inspecciones...");

  try {
    const [inspeccionesResponse, botiquinesResponse, inventarioResponse] = await Promise.all([
      needInspecciones ? getInspecciones() : currentInspecciones,
      needBotiquines ? getBotiquines() : currentBotiquines,
      needInventario ? getInventario() : currentInventario
    ]);

    const inspecciones = needInspecciones
      ? normalizeInspecciones(inspeccionesResponse)
      : currentInspecciones;

    const botiquines = needBotiquines
      ? normalizeBotiquines(botiquinesResponse)
      : currentBotiquines;

    const inventario = needInventario
      ? normalizeInventario(inventarioResponse)
      : currentInventario;

    if (needInspecciones && typeof actions.setInspecciones === "function") {
      actions.setInspecciones(inspecciones);
    }

    if (needBotiquines && typeof actions.setBotiquines === "function") {
      actions.setBotiquines(botiquines);
    }

    if (needInventario && typeof actions.setInventario === "function") {
      actions.setInventario(inventario);
    }

    if (typeof actions.setLastSync === "function") {
      actions.setLastSync(new Date().toISOString());
    }

    clearStoreError();

    return { inspecciones, botiquines, inventario };
  } catch (error) {
    console.error("[inspecciones] Error cargando datos:", error);
    setStoreError(error);
    showErrorToast(error?.message || "No se pudieron cargar las inspecciones.");
    throw error;
  } finally {
    setGlobalLoading(false);
  }
}

export function destroyInspeccionesModule() {
  if (typeof moduleState.unsubscribe === "function") {
    moduleState.unsubscribe();
  }

  moduleState.initialized = false;
  moduleState.mounted = false;
  moduleState.container = null;
  moduleState.unsubscribe = null;
  moduleState.selectedInspeccionId = "";
  moduleState.creating = false;
  moduleState.createModalOpen = false;
  moduleState.lastRenderSignature = "";
  moduleState.lastCreateContextBotiquinId = "";
}

/* ======================================
   STORE / REACTIVIDAD
====================================== */

function handleStoreChange(payload) {
  if (!isInspeccionesRoute()) return;
  if (!moduleState.container) return;

  const state = payload?.state || store.getState();
  const viewModel = getInspeccionesViewModel(state);
  const signature = createRenderSignature(viewModel);

  if (signature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createInspeccionesTemplate(viewModel));
    hydrateInspeccionesUI(moduleState.container, viewModel);
    moduleState.lastRenderSignature = signature;
  }
}

function isInspeccionesRoute() {
  const state = store.getState();
  const route = selectors.currentRoute?.(state);

  if (route) return route === "inspecciones";

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash === "inspecciones";
}

/* ======================================
   NORMALIZACIÓN
====================================== */

function normalizeBotiquines(items = []) {
  return ensureArray(items).map((item, index) => ({
    id:
      item?.id ??
      item?.id_botiquin ??
      item?.botiquinId ??
      item?.botiquin_id ??
      `BOT-${String(index + 1).padStart(3, "0")}`,
    nombre:
      item?.nombre ??
      item?.nombre_botiquin ??
      item?.nombreBotiquin ??
      item?.botiquin ??
      `Botiquín ${index + 1}`,
    sede: item?.sede || "",
    ubicacion: item?.ubicacion || "",
    tipo: item?.tipo || "",
    responsable: item?.responsable || "",
    estado: item?.estado || "",
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

    const activo = normalizeActiveFlag(item?.activo, true);

    return {
      id: idRegistro,
      idRegistro,
      idItem,
      botiquinId,
      elemento:
        item?.elemento ??
        item?.nombre ??
        item?.insumo ??
        item?.producto ??
        item?.descripcion ??
        `Elemento ${index + 1}`,
      categoria: item?.categoria || "",
      unidad: item?.unidad || "",
      cantidadActual,
      cantidadMinima,
      lote: item?.lote || "",
      fechaVencimiento,
      ubicacion: item?.ubicacion || "",
      observaciones: item?.observaciones || "",
      activo,
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

    const hallazgos = item?.hallazgos || buildHallazgosFromDetalle(detalle);
    const acciones = item?.acciones || buildAccionesFromDetalle(detalle);
    const estadoGeneral =
      item?.estadoGeneral ||
      item?.estado_general ||
      item?.estado ||
      item?.resultado ||
      deriveGeneralStatusFromDetalle(detalle);

    const metrics = buildInspeccionMetrics(detalle);

    return {
      id: String(id),
      botiquinId: String(
        item?.botiquinId || item?.id_botiquin || item?.botiquin_id || ""
      ),
      fecha: item?.fecha || item?.createdAt || item?.fechaRegistro || "",
      hora: item?.hora || "",
      responsable: item?.responsable || "",
      estadoGeneral,
      observaciones:
        item?.observaciones ||
        item?.observaciones_generales ||
        item?.comentarios ||
        item?.novedades ||
        "",
      hallazgos,
      acciones,
      proximaRevision:
        item?.proximaRevision ||
        item?.proxima_revision ||
        item?.fecha_proxima_revision ||
        "",
      updatedAt:
        item?.updatedAt ||
        item?.fechaActualizacion ||
        item?.fecha_actualizacion ||
        "",
      detalle,
      metrics,
      raw: item
    };
  });
}

function normalizeDetalleInspeccion(items = []) {
  return ensureArray(items).map((item, index) => {
    const cantidadSistema = Math.max(
      0,
      toNumber(
        item?.cantidad_sistema ??
          item?.cantidadSistema ??
          item?.cantidad_actual_sistema ??
          item?.cantidadActualSistema ??
          0
      )
    );

    const cantidadEncontrada = Math.max(
      0,
      toNumber(
        item?.cantidad_encontrada ??
          item?.cantidadEncontrada ??
          item?.cantidad_actual ??
          item?.cantidadActual ??
          0
      )
    );

    const estadoItem =
      item?.estado_item ||
      item?.estadoItem ||
      item?.estado ||
      deriveDetailStatus({
        cantidadSistema,
        cantidadEncontrada,
        fechaVencimiento:
          item?.fecha_vencimiento ?? item?.fechaVencimiento ?? ""
      });

    return {
      id:
        item?.id ||
        item?.id_detalle ||
        item?.id_registro ||
        `DET-${String(index + 1).padStart(4, "0")}`,
      idItem:
        item?.id_item ||
        item?.itemId ||
        item?.item_id ||
        "",
      idRegistroInventario:
        item?.id_registro_inventario ||
        item?.idRegistroInventario ||
        item?.id_registro ||
        "",
      elemento: item?.elemento || "",
      categoria: item?.categoria || "",
      unidad: item?.unidad || "",
      cantidadSistema,
      cantidadEncontrada,
      estadoItem,
      accionRequerida:
        item?.accion_requerida ??
        item?.accionRequerida ??
        item?.accion ??
        deriveActionFromStatus(estadoItem),
      fechaVencimiento:
        item?.fecha_vencimiento ??
        item?.fechaVencimiento ??
        "",
      observacion:
        item?.observacion ??
        item?.observaciones ??
        "",
      raw: item
    };
  });
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

function getInspeccionesViewModel(state) {
  const allInspecciones = normalizeInspecciones(
    ensureArray(selectors.inspecciones?.(state))
  );
  const botiquines = normalizeBotiquines(
    ensureArray(selectors.botiquines?.(state))
  );
  const inventario = normalizeInventario(
    ensureArray(selectors.inventario?.(state))
  );

  const filters = normalizeInspeccionesFilters(selectors.filters?.(state) || {});
  const selectedBotiquinId =
    selectors.selectedBotiquinId?.(state) ||
    selectors.selectedBotiquin?.(state) ||
    "";

  const botiquinesMap = new Map(botiquines.map((item) => [String(item.id), item]));
  const visibleInspecciones = filterInspecciones({
    items: allInspecciones,
    filters,
    selectedBotiquinId,
    botiquinesMap
  });

  const selectedInspeccionId = resolveSelectedInspeccionId({
    visibleInspecciones,
    allInspecciones
  });

  const selectedInspeccion =
    decorateInspeccion(
      visibleInspecciones.find((item) => String(item.id) === String(selectedInspeccionId)) ||
      allInspecciones.find((item) => String(item.id) === String(selectedInspeccionId)) ||
      null,
      botiquinesMap
    );

  const decoratedInspecciones = visibleInspecciones.map((item) =>
    decorateInspeccion(item, botiquinesMap)
  );

  const selectedBotiquin =
    botiquinesMap.get(String(selectedBotiquinId || "")) || null;

  const statsVisible = buildInspeccionesStats(visibleInspecciones);
  const statsGlobal = buildInspeccionesStats(allInspecciones);
  const createCandidates = buildCreateCandidates({
    inventario,
    botiquines,
    selectedBotiquinId
  });

  return {
    filters,
    stats: statsVisible,
    globalStats: statsGlobal,
    inspecciones: decoratedInspecciones,
    selectedInspeccionId,
    selectedInspeccion,
    selectedBotiquinId,
    selectedBotiquin,
    totalInspecciones: allInspecciones.length,
    visibleInspeccionesCount: visibleInspecciones.length,
    createCandidates
  };
}

function normalizeInspeccionesFilters(filters = {}) {
  return {
    search: filters.search || "",
    estado: filters.estado || "",
    responsable: filters.responsable || ""
  };
}

function decorateInspeccion(item, botiquinesMap = new Map()) {
  if (!item) return null;

  return {
    ...item,
    botiquin: botiquinesMap.get(String(item.botiquinId || "")) || null
  };
}

function resolveSelectedInspeccionId({ visibleInspecciones = [], allInspecciones = [] }) {
  const visibleIds = new Set(visibleInspecciones.map((item) => String(item.id)));

  if (moduleState.selectedInspeccionId && visibleIds.has(String(moduleState.selectedInspeccionId))) {
    return moduleState.selectedInspeccionId;
  }

  if (visibleInspecciones.length) {
    moduleState.selectedInspeccionId = visibleInspecciones[0].id;
    return moduleState.selectedInspeccionId;
  }

  if (allInspecciones.length) {
    moduleState.selectedInspeccionId = allInspecciones[0].id;
    return moduleState.selectedInspeccionId;
  }

  moduleState.selectedInspeccionId = "";
  return "";
}

function filterInspecciones({
  items = [],
  filters = {},
  selectedBotiquinId = "",
  botiquinesMap = new Map()
}) {
  const search = normalizeText(filters.search);
  const estado = normalizeText(filters.estado);
  const responsable = normalizeText(filters.responsable);

  return ensureArray(items)
    .slice()
    .sort((a, b) => getDateValue(b.fecha, b.hora) - getDateValue(a.fecha, a.hora))
    .filter((item) => {
      const botiquin = botiquinesMap.get(String(item.botiquinId || ""));
      const haystack = normalizeText(
        [
          item.id,
          item.responsable,
          item.estadoGeneral,
          item.observaciones,
          item.hallazgos,
          item.acciones,
          botiquin?.nombre,
          botiquin?.sede,
          botiquin?.ubicacion,
          ...ensureArray(item.detalle).flatMap((detail) => [
            detail.idItem,
            detail.elemento,
            detail.estadoItem,
            detail.accionRequerida,
            detail.observacion
          ])
        ]
          .filter(Boolean)
          .join(" ")
      );

      const matchesSearch = !search || haystack.includes(search);
      const matchesEstado = !estado || normalizeText(item.estadoGeneral).includes(estado);
      const matchesResponsable = !responsable || normalizeText(item.responsable).includes(responsable);
      const matchesBotiquin =
        !selectedBotiquinId ||
        String(item.botiquinId || "") === String(selectedBotiquinId);

      return matchesSearch && matchesEstado && matchesResponsable && matchesBotiquin;
    });
}

function buildInspeccionesStats(items = []) {
  const total = items.length;
  const criticas = items.filter((item) => normalizeText(item.estadoGeneral) === normalizeText("Crítico")).length;
  const conNovedades = items.filter((item) => normalizeText(item.estadoGeneral) === normalizeText("Con novedades")).length;
  const pendientes = items.filter((item) => normalizeText(item.estadoGeneral) === normalizeText("Pendiente")).length;
  const satisfactorias = items.filter((item) => normalizeText(item.estadoGeneral) === normalizeText("OK")).length;
  const hallazgosPendientes = items.filter((item) =>
    ensureArray(item.detalle).some((detail) => requiresFollowUp(detail))
  ).length;

  return {
    total,
    criticas,
    conNovedades,
    pendientes,
    satisfactorias,
    hallazgosPendientes
  };
}

function buildCreateCandidates({ inventario = [], botiquines = [], selectedBotiquinId = "" }) {
  const activeItems = inventario.filter((item) => item.activo);
  const grouped = new Map();

  activeItems.forEach((item) => {
    const key = String(item.botiquinId || "");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  return botiquines
    .map((botiquin) => {
      const items = grouped.get(String(botiquin.id)) || [];
      return {
        botiquin,
        totalItems: items.length,
        canInspect: items.length > 0,
        isSelected: String(botiquin.id) === String(selectedBotiquinId || ""),
        riskItems: items.filter((item) => deriveRiskFromInventarioItem(item) !== "OK").length
      };
    })
    .sort((a, b) => {
      if (a.isSelected && !b.isSelected) return -1;
      if (!a.isSelected && b.isSelected) return 1;
      return normalizeText(a.botiquin.nombre).localeCompare(normalizeText(b.botiquin.nombre), "es");
    });
}

function createRenderSignature(vm) {
  return JSON.stringify({
    filters: vm.filters,
    stats: vm.stats,
    globalStats: vm.globalStats,
    selectedInspeccionId: vm.selectedInspeccionId,
    selectedBotiquinId: vm.selectedBotiquinId,
    count: vm.inspecciones.length,
    ids: vm.inspecciones.map((item) => item.id),
    selectedMetrics: vm.selectedInspeccion?.metrics || null
  });
}

/* ======================================
   TEMPLATE
====================================== */

function createInspeccionesTemplate(vm) {
  return `
    <section class="inspecciones-page" data-module="${MODULE_ID}">
      <header class="page-toolbar">
        <div>
          <h2 class="section-title">Inspecciones</h2>
          <p class="section-text">
            Revisión real por botiquín con detalle por ítem, hallazgos, acciones y seguimiento.
          </p>
        </div>

        <div class="page-toolbar__actions">
          <button
            type="button"
            class="btn btn--primary"
            data-action="create-inspeccion"
          >
            Nueva inspección
          </button>

          <button
            type="button"
            class="btn btn--secondary"
            data-action="refresh-inspecciones"
            ${moduleState.creating ? "disabled" : ""}
          >
            Actualizar
          </button>
        </div>
      </header>

      ${renderInspeccionesContextBar(vm)}

      <section class="kpi-grid">
        <article class="kpi-card">
          <span class="kpi-card__label">Total inspecciones</span>
          <strong class="kpi-card__value">${vm.stats.total}</strong>
          <span class="kpi-card__hint">${escapeHTML(getStatsHint(vm, "total"))}</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Críticas</span>
          <strong class="kpi-card__value">${vm.stats.criticas}</strong>
          <span class="kpi-card__hint">Hallazgos graves o bloqueantes</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Con novedades</span>
          <strong class="kpi-card__value">${vm.stats.conNovedades}</strong>
          <span class="kpi-card__hint">Requieren corrección o revisión</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Hallazgos pendientes</span>
          <strong class="kpi-card__value">${vm.stats.hallazgosPendientes}</strong>
          <span class="kpi-card__hint">Inspecciones con acciones abiertas</span>
        </article>
      </section>

      <section class="card">
        <div class="card__body">
          <form class="filters-grid" data-role="inspecciones-filters" autocomplete="off">
            <div class="form-group">
              <label class="form-label" for="inspeccionesSearch">Buscar</label>
              <input
                id="inspeccionesSearch"
                name="search"
                class="input"
                type="search"
                placeholder="Botiquín, hallazgo, elemento, ID..."
                value="${escapeHTML(vm.filters.search)}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="inspeccionesEstado">Estado</label>
              <input
                id="inspeccionesEstado"
                name="estado"
                class="input"
                type="text"
                placeholder="OK, con novedades, crítico..."
                value="${escapeHTML(vm.filters.estado)}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="inspeccionesResponsable">Responsable</label>
              <input
                id="inspeccionesResponsable"
                name="responsable"
                class="input"
                type="text"
                placeholder="Nombre responsable"
                value="${escapeHTML(vm.filters.responsable)}"
              />
            </div>

            <div class="form-group form-group--actions">
              <label class="form-label is-ghost">Acciones</label>
              <div class="form-actions-inline">
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="reset-inspecciones-filters"
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

      <section class="inspecciones-layout">
        <div class="inspecciones-layout__list">
          ${renderInspeccionesList(vm.inspecciones, vm.selectedInspeccionId, vm)}
        </div>

        <aside class="inspecciones-layout__detail">
          ${renderInspeccionDetail(vm.selectedInspeccion)}
        </aside>
      </section>
    </section>
  `;
}

function renderInspeccionesContextBar(vm) {
  const selectedBotiquin = vm.selectedBotiquin;

  return `
    <section class="card inspecciones-context-card">
      <div class="card__body inspecciones-context">
        <div class="inspecciones-context__main">
          <span class="inspecciones-context__eyebrow">Contexto actual</span>
          <h3 class="inspecciones-context__title">
            ${
              selectedBotiquin
                ? escapeHTML(selectedBotiquin.nombre || "Botiquín seleccionado")
                : "Historial consolidado"
            }
          </h3>
          <p class="section-text">
            ${
              selectedBotiquin
                ? "Estás viendo las inspecciones del botiquín activo. Crear una nueva usará ese contexto."
                : "Estás viendo el historial global de inspecciones de todos los botiquines."
            }
          </p>
        </div>

        <div class="inspecciones-context__meta">
          ${
            selectedBotiquin
              ? `
                ${selectedBotiquin.tipo ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.tipo)}</span>` : ""}
                ${selectedBotiquin.ubicacion ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.ubicacion)}</span>` : ""}
                ${selectedBotiquin.sede ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.sede)}</span>` : ""}
              `
              : `
                <span class="badge badge--success">Vista global</span>
                <span class="badge badge--muted">${vm.totalInspecciones} inspecciones registradas</span>
              `
          }
        </div>

        <div class="inspecciones-context__actions">
          <button
            type="button"
            class="btn btn--primary"
            data-action="create-inspeccion"
          >
            Crear inspección
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

function renderInspeccionesList(items = [], selectedId = "", vm = {}) {
  if (!items.length) {
    return `
      <article class="card card--empty">
        <div class="card__body">
          <h3 class="card__title">No hay inspecciones para mostrar</h3>
          <p class="section-text">
            No encontré resultados con los filtros actuales. La máquina no se perdió, solo no hay datos que mostrar.
          </p>

          <div class="card__actions">
            <button
              type="button"
              class="btn btn--primary"
              data-action="create-inspeccion"
            >
              Registrar inspección
            </button>
          </div>
        </div>
      </article>
    `;
  }

  return `
    <div class="cards-grid">
      ${items.map((item) => renderInspeccionCard(item, selectedId, vm)).join("")}
    </div>
  `;
}

function renderInspeccionCard(item, selectedId = "") {
  const isActive = String(item.id) === String(selectedId);
  const botiquinNombre = item.botiquin?.nombre || "Botiquín sin nombre";
  const totalDetalle = ensureArray(item.detalle).length;
  const meta = [
    item.botiquin?.sede || "",
    item.botiquin?.ubicacion || "",
    item.responsable || "Sin responsable"
  ].filter(Boolean).join(" · ");

  return `
    <article
      class="card inspeccion-card ${isActive ? "is-active" : ""}"
      data-inspeccion-id="${escapeHTML(item.id)}"
    >
      <div class="card__body">
        <div class="inspeccion-card__header">
          <div>
            <span class="badge ${getEstadoBadgeClass(item.estadoGeneral)}">
              ${escapeHTML(item.estadoGeneral || "Sin estado")}
            </span>
            <h3 class="card__title">${escapeHTML(botiquinNombre)}</h3>
            <p class="inspeccion-card__meta">${escapeHTML(meta)}</p>
          </div>
        </div>

        <dl class="data-list">
          <div>
            <dt>Fecha</dt>
            <dd>${item.fecha ? escapeHTML(formatDate(item.fecha)) : "Sin fecha"}</dd>
          </div>
          <div>
            <dt>Ítems revisados</dt>
            <dd>${totalDetalle}</dd>
          </div>
          <div>
            <dt>Hallazgos</dt>
            <dd>${item.metrics.hallazgos}</dd>
          </div>
          <div>
            <dt>Acciones</dt>
            <dd>${item.metrics.accionesPendientes}</dd>
          </div>
        </dl>

        <p class="section-text">
          ${escapeHTML(item.observaciones || item.hallazgos || "Sin observaciones registradas.")}
        </p>

        <div class="card__actions">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="select-inspeccion"
            data-inspeccion-id="${escapeHTML(item.id)}"
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

function renderInspeccionDetail(item) {
  if (!item) {
    return `
      <article class="card">
        <div class="card__body">
          <h3 class="card__title">Detalle de inspección</h3>
          <p class="section-text">
            Selecciona una inspección para ver hallazgos, acciones y detalle por ítem.
          </p>
        </div>
      </article>
    `;
  }

  const detailRows = ensureArray(item.detalle);
  const hasPendingRepos = detailRows.some((row) => needsReposition(row));

  return `
    <article class="card inspeccion-detail-card">
      <div class="card__body">
        <div class="detail-header">
          <div>
            <span class="badge ${getEstadoBadgeClass(item.estadoGeneral)}">
              ${escapeHTML(item.estadoGeneral || "Sin estado")}
            </span>
            <h3 class="card__title">${escapeHTML(item.botiquin?.nombre || "Botiquín sin nombre")}</h3>
            <p class="section-text">
              ${escapeHTML(
                [
                  item.botiquin?.sede || "",
                  item.botiquin?.ubicacion || "",
                  item.responsable || ""
                ].filter(Boolean).join(" · ")
              )}
            </p>
          </div>
        </div>

        <dl class="data-list data-list--stack">
          <div>
            <dt>ID inspección</dt>
            <dd>${escapeHTML(item.id)}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>${item.fecha ? escapeHTML(formatDate(item.fecha)) : "Sin fecha"}</dd>
          </div>
          <div>
            <dt>Hora</dt>
            <dd>${escapeHTML(item.hora || "No registrada")}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>${escapeHTML(item.responsable || "No registrado")}</dd>
          </div>
          <div>
            <dt>Observaciones</dt>
            <dd>${escapeHTML(item.observaciones || "Sin observaciones")}</dd>
          </div>
          <div>
            <dt>Hallazgos</dt>
            <dd>${escapeHTML(item.hallazgos || "Sin hallazgos")}</dd>
          </div>
          <div>
            <dt>Acciones</dt>
            <dd>${escapeHTML(item.acciones || "Sin acciones")}</dd>
          </div>
          <div>
            <dt>Próxima revisión</dt>
            <dd>${item.proximaRevision ? escapeHTML(formatDate(item.proximaRevision)) : "No definida"}</dd>
          </div>
        </dl>

        <section class="detail-section">
          <h4 class="detail-section__title">Resumen operativo</h4>
          <div class="kpi-grid kpi-grid--compact">
            <article class="kpi-card">
              <span class="kpi-card__label">Ítems revisados</span>
              <strong class="kpi-card__value">${item.metrics.totalItems}</strong>
            </article>
            <article class="kpi-card">
              <span class="kpi-card__label">Hallazgos</span>
              <strong class="kpi-card__value">${item.metrics.hallazgos}</strong>
            </article>
            <article class="kpi-card">
              <span class="kpi-card__label">Acciones pendientes</span>
              <strong class="kpi-card__value">${item.metrics.accionesPendientes}</strong>
            </article>
            <article class="kpi-card">
              <span class="kpi-card__label">Riesgo alto</span>
              <strong class="kpi-card__value">${item.metrics.riesgoAlto}</strong>
            </article>
          </div>
        </section>

        ${renderDetalleTable(detailRows)}

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
            hasPendingRepos
              ? `
                <button
                  type="button"
                  class="btn btn--primary"
                  data-action="go-reposiciones"
                  data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
                  data-inspeccion-id="${escapeHTML(item.id)}"
                >
                  Ir a reposiciones
                </button>
              `
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function renderDetalleTable(items = []) {
  if (!items.length) {
    return `
      <section class="detail-section">
        <h4 class="detail-section__title">Detalle revisado</h4>
        <p class="section-text">No hay ítems de detalle registrados en esta inspección.</p>
      </section>
    `;
  }

  return `
    <section class="detail-section">
      <h4 class="detail-section__title">Detalle revisado</h4>

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Elemento</th>
              <th>ID ítem</th>
              <th>Sistema</th>
              <th>Encontrada</th>
              <th>Estado</th>
              <th>Acción</th>
              <th>Vencimiento</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(renderDetalleTableRow).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDetalleTableRow(item) {
  const expiryText = item.fechaVencimiento
    ? formatExpiryText(item.fechaVencimiento)
    : "Sin fecha";

  return `
    <tr>
      <td>${escapeHTML(item.elemento || "Sin nombre")}</td>
      <td>${escapeHTML(item.idItem || "Sin ID")}</td>
      <td>${escapeHTML(String(item.cantidadSistema ?? 0))}</td>
      <td>${escapeHTML(String(item.cantidadEncontrada ?? 0))}</td>
      <td>
        <span class="badge ${getEstadoBadgeClass(item.estadoItem)}">
          ${escapeHTML(item.estadoItem || "Sin estado")}
        </span>
      </td>
      <td>${escapeHTML(item.accionRequerida || "Sin acción")}</td>
      <td>${escapeHTML(expiryText)}</td>
      <td>${escapeHTML(item.observacion || "—")}</td>
    </tr>
  `;
}

function hydrateInspeccionesUI(container, vm) {
  const cards = qsa("[data-inspeccion-id]", container);

  cards.forEach((card) => {
    const id = card.dataset.inspeccionId;
    if (String(id) === String(vm.selectedInspeccionId)) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  });

  const searchInput = qs("#inspeccionesSearch", container);
  const estadoInput = qs("#inspeccionesEstado", container);
  const responsableInput = qs("#inspeccionesResponsable", container);

  if (searchInput && document.activeElement !== searchInput) {
    searchInput.value = vm.filters.search;
  }

  if (estadoInput && document.activeElement !== estadoInput) {
    estadoInput.value = vm.filters.estado;
  }

  if (responsableInput && document.activeElement !== responsableInput) {
    responsableInput.value = vm.filters.responsable;
  }
}

/* ======================================
   EVENTOS
====================================== */

function bindInspeccionesEvents() {
  document.addEventListener("input", handleInspeccionesInput, true);
  document.addEventListener("click", handleInspeccionesClick, true);
}

function bindInspeccionesGlobalEvents() {
  document.addEventListener("keydown", handleInspeccionesKeydown, true);
}

const debouncedSearch = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ search: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedEstado = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ estado: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedResponsable = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ responsable: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

function handleInspeccionesInput(event) {
  const target = event.target;
  if (!moduleState.container) return;

  if (moduleState.container.contains(target)) {
    if (target.matches("#inspeccionesSearch")) {
      debouncedSearch(target.value);
      return;
    }

    if (target.matches("#inspeccionesEstado")) {
      debouncedEstado(target.value);
      return;
    }

    if (target.matches("#inspeccionesResponsable")) {
      debouncedResponsable(target.value);
    }
  }
}

async function handleInspeccionesClick(event) {
  const trigger = event.target.closest("[data-action], [data-inspeccion-id]");
  if (!trigger) return;

  if (moduleState.container?.contains(trigger)) {
    const action = trigger.dataset.action;
    const inspeccionId =
      trigger.dataset.inspeccionId ||
      trigger.closest("[data-inspeccion-id]")?.dataset.inspeccionId ||
      "";
    const botiquinId = trigger.dataset.botiquinId || "";

    if (!action && inspeccionId) {
      selectInspeccion(inspeccionId);
      return;
    }

    switch (action) {
      case "refresh-inspecciones":
        await syncInspeccionesModuleData({ force: true });
        renderInspeccionesView();
        return;

      case "reset-inspecciones-filters":
        if (typeof actions.setFilters === "function") {
          actions.setFilters({
            search: "",
            estado: "",
            responsable: ""
          });
        }
        return;

      case "select-inspeccion":
        if (inspeccionId) selectInspeccion(inspeccionId);
        return;

      case "clear-selected-botiquin":
        clearSelectedBotiquin();
        renderInspeccionesView();
        return;

      case "open-botiquin":
        if (botiquinId) {
          setSelectedBotiquin(botiquinId);
        }
        navigateTo("botiquines");
        return;

      case "go-reposiciones":
        if (botiquinId) {
          setSelectedBotiquin(botiquinId);
        }
        navigateTo("reposiciones");
        return;

      case "go-botiquines":
        navigateTo("botiquines");
        return;

      case "create-inspeccion":
        await openCreateInspeccionModal();
        return;

      default:
        break;
    }
  }
}

function handleInspeccionesKeydown(event) {
  if (!moduleState.createModalOpen) return;

  if (event.key === "Escape") {
    event.preventDefault();
  }
}

function selectInspeccion(inspeccionId) {
  moduleState.selectedInspeccionId = String(inspeccionId || "");
  renderInspeccionesView();
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
   CREACIÓN DE INSPECCIÓN
====================================== */

async function openCreateInspeccionModal() {
  if (moduleState.creating) return;

  const state = store.getState();
  let inventario = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  let botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));

  if (!inventario.length || !botiquines.length) {
    await syncInspeccionesModuleData({ force: true });
    const refreshed = store.getState();
    inventario = normalizeInventario(ensureArray(selectors.inventario?.(refreshed)));
    botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(refreshed)));
  }

  const selectedBotiquinId =
    selectors.selectedBotiquinId?.(store.getState()) ||
    selectors.selectedBotiquin?.(store.getState()) ||
    botiquines.find((item) => inventario.some((inv) => String(inv.botiquinId) === String(item.id) && inv.activo))?.id ||
    botiquines[0]?.id ||
    "";

  moduleState.lastCreateContextBotiquinId = selectedBotiquinId;

  openFormModal({
    modalId: CREATE_MODAL_ID,
    title: "Nueva inspección",
    subtitle: "Se precarga el inventario activo del botiquín seleccionado.",
    submitLabel: "Guardar inspección",
    fields: [
      {
        name: "id_botiquin",
        label: "Botiquín",
        type: "select",
        required: true,
        value: selectedBotiquinId,
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
        name: "hora",
        label: "Hora",
        type: "time",
        value: getCurrentTimeHHMM(),
        col: 3
      },
      {
        name: "responsable",
        label: "Responsable",
        type: "text",
        required: true,
        placeholder: "Nombre de quien realizó la inspección",
        col: 6
      },
      {
        name: "estado_general",
        label: "Estado general",
        type: "select",
        required: true,
        value: "",
        col: 3,
        options: GENERAL_STATUS_OPTIONS
      },
      {
        name: "proxima_revision",
        label: "Próxima revisión",
        type: "date",
        col: 3
      },
      {
        name: "observaciones_generales",
        label: "Observaciones generales",
        type: "textarea",
        rows: 4,
        placeholder: "Resumen general de la inspección",
        col: 12
      },
      {
        name: "detalle_json",
        label: "Detalle de inspección",
        type: "html",
        col: 12,
        html: createInspeccionDetailEditorHTML({
          rows: buildPrefillDetailRowsFromInventario(inventario, selectedBotiquinId)
        })
      }
    ],
    onInit: ({ modalElement, formElement }) => {
      moduleState.createModalOpen = true;
      bindCreateInspeccionModalEnhancements({
        modalElement,
        formElement,
        inventario,
        botiquines
      });
    },
    onSubmit: async (values, context) => {
      await submitCreateInspeccionForm(values, context);
    },
    onClose: () => {
      moduleState.creating = false;
      moduleState.createModalOpen = false;
      moduleState.lastCreateContextBotiquinId = "";
    }
  });
}

function createInspeccionDetailEditorHTML({ rows = [] } = {}) {
  const safeRows = rows.length ? rows : [createEmptyDetailRowViewModel()];

  return `
    <section class="detail-section">
      <div class="detail-section__header">
        <div>
          <h4 class="detail-section__title">Detalle inspeccionado</h4>
          <p class="section-text">
            Cada fila corresponde a un ítem del inventario del botiquín. Menos improvisación, menos caos.
          </p>
        </div>

        <div class="form-actions-inline">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="reload-inspeccion-detail"
          >
            Recargar desde botiquín
          </button>

          <button
            type="button"
            class="btn btn--secondary"
            data-action="add-inspeccion-detail-row"
          >
            Agregar fila manual
          </button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Elemento</th>
              <th>ID ítem</th>
              <th>Sistema</th>
              <th>Encontrada</th>
              <th>Estado</th>
              <th>Acción</th>
              <th>Vencimiento</th>
              <th>Observación</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-role="inspeccion-detail-body">
            ${safeRows.map((row) => createInspeccionDetailRowHTML(row)).join("")}
          </tbody>
        </table>
      </div>

      <input type="hidden" name="detalle_json_hidden_bridge" value="1" />
    </section>
  `;
}

function createInspeccionDetailRowHTML(row = {}) {
  const statusValue = row.estado_item || "";
  const actionValue = row.accion_requerida || "";

  return `
    <tr data-detail-row>
      <td>
        <input
          type="hidden"
          data-detail-field="id_item"
          value="${escapeHTML(row.id_item || "")}"
        />
        <input
          type="hidden"
          data-detail-field="id_registro_inventario"
          value="${escapeHTML(row.id_registro_inventario || "")}"
        />
        <input
          type="hidden"
          data-detail-field="categoria"
          value="${escapeHTML(row.categoria || "")}"
        />
        <input
          type="hidden"
          data-detail-field="unidad"
          value="${escapeHTML(row.unidad || "")}"
        />
        <input
          type="text"
          class="input"
          data-detail-field="elemento"
          placeholder="Elemento"
          value="${escapeHTML(row.elemento || "")}"
          required
        />
      </td>
      <td>
        <input
          type="text"
          class="input"
          data-detail-field="id_item_display"
          value="${escapeHTML(row.id_item || "")}"
          readonly
        />
      </td>
      <td>
        <input
          type="number"
          class="input"
          data-detail-field="cantidad_sistema"
          min="0"
          step="1"
          value="${escapeHTML(String(row.cantidad_sistema ?? 0))}"
        />
      </td>
      <td>
        <input
          type="number"
          class="input"
          data-detail-field="cantidad_encontrada"
          min="0"
          step="1"
          value="${escapeHTML(String(row.cantidad_encontrada ?? 0))}"
        />
      </td>
      <td>
        <select
          class="input"
          data-detail-field="estado_item"
        >
          ${DETAIL_STATUS_OPTIONS.map((option) => `
            <option
              value="${escapeHTML(option.value)}"
              ${normalizeText(option.value) === normalizeText(statusValue) ? "selected" : ""}
            >
              ${escapeHTML(option.label)}
            </option>
          `).join("")}
        </select>
      </td>
      <td>
        <select
          class="input"
          data-detail-field="accion_requerida"
        >
          ${ACTION_OPTIONS.map((option) => `
            <option
              value="${escapeHTML(option.value)}"
              ${normalizeText(option.value) === normalizeText(actionValue) ? "selected" : ""}
            >
              ${escapeHTML(option.label)}
            </option>
          `).join("")}
        </select>
      </td>
      <td>
        <input
          type="date"
          class="input"
          data-detail-field="fecha_vencimiento"
          value="${escapeHTML(row.fecha_vencimiento || "")}"
        />
      </td>
      <td>
        <input
          type="text"
          class="input"
          data-detail-field="observacion"
          placeholder="Observación"
          value="${escapeHTML(row.observacion || "")}"
        />
      </td>
      <td>
        <button
          type="button"
          class="btn btn--ghost"
          data-action="remove-inspeccion-detail-row"
          aria-label="Eliminar fila"
        >
          Quitar
        </button>
      </td>
    </tr>
  `;
}

function createEmptyDetailRowViewModel() {
  return {
    id_item: "",
    id_registro_inventario: "",
    elemento: "",
    categoria: "",
    unidad: "",
    cantidad_sistema: 0,
    cantidad_encontrada: 0,
    estado_item: "OK",
    accion_requerida: "",
    fecha_vencimiento: "",
    observacion: ""
  };
}

function bindCreateInspeccionModalEnhancements({ modalElement, formElement, inventario }) {
  const botiquinField = qs('[name="id_botiquin"]', formElement);
  const detailBody = qs('[data-role="inspeccion-detail-body"]', modalElement);

  if (!botiquinField || !detailBody) return;

  botiquinField.addEventListener("change", () => {
    const botiquinId = botiquinField.value || "";
    moduleState.lastCreateContextBotiquinId = botiquinId;

    const rows = buildPrefillDetailRowsFromInventario(inventario, botiquinId);
    replaceCreateModalDetailRows(detailBody, rows);
    updateGeneralStatusSuggestion(formElement);
  });

  modalElement.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;

    const action = trigger.dataset.action;

    switch (action) {
      case "add-inspeccion-detail-row":
        event.preventDefault();
        detailBody.insertAdjacentHTML(
          "beforeend",
          createInspeccionDetailRowHTML(createEmptyDetailRowViewModel())
        );
        updateGeneralStatusSuggestion(formElement);
        break;

      case "remove-inspeccion-detail-row":
        event.preventDefault();
        removeCreateDetailRow(trigger, detailBody);
        updateGeneralStatusSuggestion(formElement);
        break;

      case "reload-inspeccion-detail":
        event.preventDefault();
        replaceCreateModalDetailRows(
          detailBody,
          buildPrefillDetailRowsFromInventario(inventario, botiquinField.value || "")
        );
        updateGeneralStatusSuggestion(formElement);
        break;

      default:
        break;
    }
  });

  modalElement.addEventListener("input", (event) => {
    const row = event.target.closest("[data-detail-row]");
    if (!row) return;

    if (
      event.target.matches('[data-detail-field="cantidad_encontrada"]') ||
      event.target.matches('[data-detail-field="cantidad_sistema"]') ||
      event.target.matches('[data-detail-field="fecha_vencimiento"]')
    ) {
      autoUpdateDetailRow(row);
      updateGeneralStatusSuggestion(formElement);
      return;
    }

    if (event.target.matches('[data-detail-field="estado_item"]')) {
      autoSuggestActionForRow(row);
      updateGeneralStatusSuggestion(formElement);
    }
  });

  updateGeneralStatusSuggestion(formElement);
}

function replaceCreateModalDetailRows(detailBody, rows = []) {
  const safeRows = rows.length ? rows : [createEmptyDetailRowViewModel()];
  detailBody.innerHTML = safeRows.map((row) => createInspeccionDetailRowHTML(row)).join("");
}

function removeCreateDetailRow(trigger, detailBody) {
  const row = trigger.closest("[data-detail-row]");
  const rows = qsa("[data-detail-row]", detailBody);

  if (!row) return;

  if (rows.length <= 1) {
    row.outerHTML = createInspeccionDetailRowHTML(createEmptyDetailRowViewModel());
    return;
  }

  row.remove();
}

function buildPrefillDetailRowsFromInventario(inventario = [], botiquinId = "") {
  const rows = inventario
    .filter((item) => item.activo && String(item.botiquinId || "") === String(botiquinId || ""))
    .sort((a, b) => normalizeText(a.elemento).localeCompare(normalizeText(b.elemento), "es"))
    .map((item) => {
      const estado = deriveRiskFromInventarioItem(item);

      return {
        id_item: item.idItem || "",
        id_registro_inventario: item.idRegistro || "",
        elemento: item.elemento || "",
        categoria: item.categoria || "",
        unidad: item.unidad || "",
        cantidad_sistema: item.cantidadActual ?? 0,
        cantidad_encontrada: item.cantidadActual ?? 0,
        estado_item: estado,
        accion_requerida: deriveActionFromStatus(estado),
        fecha_vencimiento: item.fechaVencimiento || "",
        observacion: ""
      };
    });

  return rows.length ? rows : [createEmptyDetailRowViewModel()];
}

function autoUpdateDetailRow(row) {
  const cantidadSistema = toNumber(qs('[data-detail-field="cantidad_sistema"]', row)?.value, 0);
  const cantidadEncontrada = toNumber(qs('[data-detail-field="cantidad_encontrada"]', row)?.value, 0);
  const fechaVencimiento = qs('[data-detail-field="fecha_vencimiento"]', row)?.value || "";

  const derivedStatus = deriveDetailStatus({
    cantidadSistema,
    cantidadEncontrada,
    fechaVencimiento
  });

  const statusSelect = qs('[data-detail-field="estado_item"]', row);
  if (statusSelect) {
    statusSelect.value = derivedStatus;
  }

  autoSuggestActionForRow(row);
}

function autoSuggestActionForRow(row) {
  const status = qs('[data-detail-field="estado_item"]', row)?.value || "";
  const actionSelect = qs('[data-detail-field="accion_requerida"]', row);

  if (actionSelect && !normalizeText(actionSelect.value || "")) {
    actionSelect.value = deriveActionFromStatus(status);
  } else if (
    actionSelect &&
    ["reponer", "ajustar inventario", "revisar vencimiento", "dar de baja", "seguimiento", ""]
      .includes(normalizeText(actionSelect.value || ""))
  ) {
    actionSelect.value = deriveActionFromStatus(status);
  }
}

function updateGeneralStatusSuggestion(formElement) {
  const detail = collectCreateDetailRows(formElement);
  const suggested = deriveGeneralStatusFromDetalle(detail);
  const generalStatusField = qs('[name="estado_general"]', formElement);

  if (!generalStatusField) return;
  if (!generalStatusField.value || GENERAL_STATUS_OPTIONS.some((opt) => normalizeText(opt.value) === normalizeText(generalStatusField.value))) {
    generalStatusField.value = suggested;
  }
}

async function submitCreateInspeccionForm(values, context = {}) {
  if (moduleState.creating) return;

  const { formElement, close } = context;
  const submitButton = formElement?.querySelector?.('[data-role="form-submit"]');

  moduleState.creating = true;

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Guardando...";
    }

    const payload = buildInspeccionPayloadFromForm(values, formElement);
    validateInspeccionPayload(payload);

    setGlobalLoading(true, "Guardando inspección...");
    const result = await saveInspeccion(payload);

    const createdRecord =
      result?.record ||
      result?.data ||
      result?.item ||
      null;

    await syncInspeccionesModuleData({ force: true });

    const createdId =
      createdRecord?.id ||
      createdRecord?.id_inspeccion ||
      "";

    if (createdId) {
      moduleState.selectedInspeccionId = String(createdId);
    } else {
      const state = store.getState();
      const allInspecciones = normalizeInspecciones(
        ensureArray(selectors.inspecciones?.(state))
      );
      moduleState.selectedInspeccionId = allInspecciones[0]?.id || "";
    }

    showSuccessToast("Inspección guardada correctamente.");

    if (typeof close === "function") {
      close();
    }

    renderInspeccionesView();
  } catch (error) {
    console.error("[inspecciones] Error guardando inspección:", error);
    setStoreError(error);
    showErrorToast(error?.message || "No se pudo guardar la inspección.");
    throw error;
  } finally {
    moduleState.creating = false;
    moduleState.createModalOpen = false;
    setGlobalLoading(false);

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Guardar inspección";
    }
  }
}

function buildInspeccionPayloadFromForm(values = {}, formElement) {
  const detail = collectCreateDetailRows(formElement);

  const hallazgos = buildHallazgosFromDetalle(detail);
  const acciones = buildAccionesFromDetalle(detail);

  return {
    id_botiquin: values.id_botiquin || "",
    fecha: values.fecha || "",
    hora: values.hora || "",
    responsable: values.responsable || "",
    estado_general: values.estado_general || deriveGeneralStatusFromDetalle(detail),
    observaciones_generales: values.observaciones_generales || "",
    proxima_revision: values.proxima_revision || "",
    hallazgos,
    acciones,
    detalle: detail.map((item) => ({
      id_item: item.idItem,
      id_registro_inventario: item.idRegistroInventario,
      elemento: item.elemento,
      categoria: item.categoria,
      unidad: item.unidad,
      cantidad_sistema: item.cantidadSistema,
      cantidad_encontrada: item.cantidadEncontrada,
      estado_item: item.estadoItem,
      accion_requerida: item.accionRequerida,
      fecha_vencimiento: item.fechaVencimiento,
      observacion: item.observacion
    }))
  };
}

function collectCreateDetailRows(formElement) {
  const rows = qsa("[data-detail-row]", formElement);

  return rows
    .map((row) => {
      const cantidadSistema = Math.max(
        0,
        toNumber(qs('[data-detail-field="cantidad_sistema"]', row)?.value, 0)
      );
      const cantidadEncontrada = Math.max(
        0,
        toNumber(qs('[data-detail-field="cantidad_encontrada"]', row)?.value, 0)
      );
      const fechaVencimiento = qs('[data-detail-field="fecha_vencimiento"]', row)?.value || "";

      const derivedStatus = deriveDetailStatus({
        cantidadSistema,
        cantidadEncontrada,
        fechaVencimiento
      });

      const estadoManual = qs('[data-detail-field="estado_item"]', row)?.value || derivedStatus;
      const finalStatus = estadoManual || derivedStatus;

      return {
        idItem: qs('[data-detail-field="id_item"]', row)?.value || "",
        idRegistroInventario: qs('[data-detail-field="id_registro_inventario"]', row)?.value || "",
        elemento: qs('[data-detail-field="elemento"]', row)?.value?.trim() || "",
        categoria: qs('[data-detail-field="categoria"]', row)?.value || "",
        unidad: qs('[data-detail-field="unidad"]', row)?.value || "",
        cantidadSistema,
        cantidadEncontrada,
        estadoItem: finalStatus,
        accionRequerida:
          qs('[data-detail-field="accion_requerida"]', row)?.value || deriveActionFromStatus(finalStatus),
        fechaVencimiento,
        observacion: qs('[data-detail-field="observacion"]', row)?.value?.trim() || ""
      };
    })
    .filter((item) => {
      return Boolean(
        item.idItem ||
        item.elemento ||
        item.cantidadSistema ||
        item.cantidadEncontrada ||
        item.estadoItem ||
        item.accionRequerida ||
        item.fechaVencimiento ||
        item.observacion
      );
    });
}

function validateInspeccionPayload(payload) {
  if (!payload.id_botiquin) {
    throw new Error("Debes seleccionar un botiquín.");
  }

  if (!payload.fecha) {
    throw new Error("Debes indicar la fecha de la inspección.");
  }

  if (!payload.responsable) {
    throw new Error("Debes indicar el responsable.");
  }

  if (!payload.estado_general) {
    throw new Error("Debes indicar el estado general.");
  }

  if (!Array.isArray(payload.detalle) || !payload.detalle.length) {
    throw new Error("Debes incluir al menos un ítem en el detalle.");
  }

  const invalidRow = payload.detalle.find((item) => !item.id_item && !item.elemento);
  if (invalidRow) {
    throw new Error("Cada fila del detalle debe tener al menos un elemento identificado.");
  }
}

/* ======================================
   LÓGICA DE NEGOCIO
====================================== */

function deriveRiskFromInventarioItem(item) {
  const expiry = getSafeExpiryStatus(item.fechaVencimiento);

  if (!item.activo) return "Pendiente";
  if (expiry.isExpired) return "Vencido";
  if ((item.cantidadActual ?? 0) <= 0) return "Faltante";
  if ((item.cantidadMinima ?? 0) > 0 && (item.cantidadActual ?? 0) <= (item.cantidadMinima ?? 0)) {
    return "Bajo stock";
  }
  if (expiry.isNearExpiry) return "Por vencer";
  return "OK";
}

function deriveDetailStatus({
  cantidadSistema = 0,
  cantidadEncontrada = 0,
  fechaVencimiento = ""
}) {
  const expiry = getSafeExpiryStatus(fechaVencimiento);

  if (expiry.isExpired) return "Vencido";
  if (cantidadEncontrada <= 0) return "Faltante";
  if (cantidadSistema > 0 && cantidadEncontrada < cantidadSistema) return "Bajo stock";
  if (expiry.isNearExpiry) return "Por vencer";
  return "OK";
}

function deriveActionFromStatus(status = "") {
  const normalized = normalizeText(status);

  if (normalized === normalizeText("Faltante")) return "Reponer";
  if (normalized === normalizeText("Bajo stock")) return "Reponer";
  if (normalized === normalizeText("Vencido")) return "Dar de baja";
  if (normalized === normalizeText("Por vencer")) return "Revisar vencimiento";
  if (normalized === normalizeText("Deteriorado")) return "Reponer";
  if (normalized === normalizeText("Pendiente")) return "Seguimiento";
  return "";
}

function deriveGeneralStatusFromDetalle(detalle = []) {
  const rows = ensureArray(detalle);

  if (!rows.length) return "Pendiente";

  const normalizedStatuses = rows.map((item) => normalizeText(item.estadoItem || ""));

  if (normalizedStatuses.some((status) =>
    ["faltante", "vencido", "critico", "crítico"].includes(status)
  )) {
    return "Crítico";
  }

  if (normalizedStatuses.some((status) =>
    ["bajo stock", "por vencer", "deteriorado", "pendiente"].includes(status)
  )) {
    return "Con novedades";
  }

  return "OK";
}

function buildHallazgosFromDetalle(detalle = []) {
  const rows = ensureArray(detalle)
    .filter((item) => normalizeText(item.estadoItem || "") !== normalizeText("OK"))
    .map((item) => {
      const parts = [
        item.elemento || item.idItem || "Ítem sin nombre",
        item.estadoItem || "Sin estado"
      ];

      if (item.cantidadEncontrada !== item.cantidadSistema) {
        parts.push(`sistema ${item.cantidadSistema} / encontrada ${item.cantidadEncontrada}`);
      }

      if (item.observacion) {
        parts.push(item.observacion);
      }

      return parts.join(" - ");
    });

  return rows.join(" · ");
}

function buildAccionesFromDetalle(detalle = []) {
  const rows = ensureArray(detalle)
    .filter((item) => item.accionRequerida)
    .map((item) => `${item.elemento || item.idItem || "Ítem"}: ${item.accionRequerida}`);

  return rows.join(" · ");
}

function buildInspeccionMetrics(detalle = []) {
  const rows = ensureArray(detalle);

  return {
    totalItems: rows.length,
    hallazgos: rows.filter((item) => normalizeText(item.estadoItem) !== normalizeText("OK")).length,
    accionesPendientes: rows.filter((item) => Boolean(item.accionRequerida)).length,
    riesgoAlto: rows.filter((item) => {
      const status = normalizeText(item.estadoItem || "");
      return ["faltante", "vencido", "critico", "crítico"].includes(status);
    }).length
  };
}

function requiresFollowUp(detail) {
  const status = normalizeText(detail.estadoItem || "");
  return (
    status !== normalizeText("OK") ||
    Boolean(detail.accionRequerida)
  );
}

function needsReposition(detail) {
  const status = normalizeText(detail.estadoItem || "");
  const action = normalizeText(detail.accionRequerida || "");

  return (
    ["faltante", "bajo stock", "deteriorado"].includes(status) ||
    action === normalizeText("Reponer")
  );
}

/* ======================================
   UI HELPERS
====================================== */

function getEstadoBadgeClass(estado = "") {
  const normalized = normalizeText(estado);

  if (["ok", "operativo", "satisfactoria", "completa", "favorable"].includes(normalized)) {
    return "badge--success";
  }

  if (["pendiente", "warning", "con novedades", "observacion", "observación", "por vencer", "bajo stock"].includes(normalized)) {
    return "badge--warning";
  }

  if (["revision", "en revision", "revisión"].includes(normalized)) {
    return "badge--alert";
  }

  if (["critico", "crítica", "critica", "danger", "inactivo", "critical", "vencido", "faltante"].includes(normalized)) {
    return "badge--danger";
  }

  return "badge--muted";
}

function getStatsHint(vm, type) {
  if (vm.selectedBotiquin?.nombre) {
    if (type === "total") return `Resumen de ${vm.selectedBotiquin.nombre}`;
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
   HELPERS STORE / FECHA
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

function getDateValue(dateValue, timeValue = "") {
  if (!dateValue) return 0;
  const full = `${dateValue}${timeValue ? `T${timeValue}` : ""}`;
  const timestamp = new Date(full).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getTodayISODate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTimeHHMM() {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
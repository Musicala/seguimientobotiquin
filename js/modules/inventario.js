import { store, selectors, actions } from "../state.js";
import { getInventario, getBotiquines, updateInventarioItem } from "../api.js";
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
  getExpiryStatus,
  formatExpiryText,
  toNumber
} from "../utils.js";

/* ======================================
   CONFIG
====================================== */

const MODULE_ID = "inventario-module";
const SEARCH_DEBOUNCE_MS = 250;
const EDIT_MODAL_ID = "inventario-edit-modal";

const moduleState = {
  initialized: false,
  mounted: false,
  container: null,
  unsubscribe: null,
  selectedItemId: "",
  isModalOpen: false,
  editingItemId: "",
  savingItem: false,
  eventsBound: false,
  globalEventsBound: false,
  lastRenderSignature: ""
};

/* ======================================
   API PÚBLICA
====================================== */

export async function initInventarioModule(options = {}) {
  const { container, forceRender = false } = options;

  if (!(container instanceof HTMLElement)) {
    throw new Error("[inventario] initInventarioModule requiere un container válido.");
  }

  moduleState.container = container;

  if (!moduleState.initialized) {
    moduleState.unsubscribe = store.subscribe(handleStoreChange);
    moduleState.initialized = true;
  }

  if (!moduleState.eventsBound) {
    bindInventarioEvents();
    moduleState.eventsBound = true;
  }

  if (!moduleState.globalEventsBound) {
    bindInventarioGlobalEvents();
    moduleState.globalEventsBound = true;
  }

  await syncInventarioModuleData();

  if (forceRender || isInventarioRoute()) {
    renderInventarioView();
  }

  moduleState.mounted = true;
}

export function renderInventarioView() {
  if (!moduleState.container) return;

  const state = store.getState();
  const viewModel = getInventarioViewModel(state);
  const signature = createRenderSignature(viewModel);

  if (!moduleState.mounted || moduleState.lastRenderSignature !== signature) {
    setHTML(moduleState.container, createInventarioTemplate(viewModel));
    hydrateInventarioUI(moduleState.container, viewModel);
    moduleState.lastRenderSignature = signature;
  }
}

export async function syncInventarioModuleData(options = {}) {
  const { force = false } = options;
  const state = store.getState();

  const currentInventario = normalizeInventario(
    ensureArray(selectors.inventario?.(state))
  );
  const currentBotiquines = normalizeBotiquines(
    ensureArray(selectors.botiquines?.(state))
  );

  const needsInventario = force || !currentInventario.length;
  const needsBotiquines = force || !currentBotiquines.length;

  if (!needsInventario && !needsBotiquines) {
    return {
      inventario: currentInventario,
      botiquines: currentBotiquines
    };
  }

  setGlobalLoading(true, "Cargando inventario...");

  try {
    const [inventarioResponse, botiquinesResponse] = await Promise.all([
      needsInventario ? getInventario() : currentInventario,
      needsBotiquines ? getBotiquines() : currentBotiquines
    ]);

    const inventario = needsInventario
      ? normalizeInventario(inventarioResponse)
      : currentInventario;

    const botiquines = needsBotiquines
      ? normalizeBotiquines(botiquinesResponse)
      : currentBotiquines;

    if (needsInventario && typeof actions.setInventario === "function") {
      actions.setInventario(inventario);
    }

    if (needsBotiquines && typeof actions.setBotiquines === "function") {
      actions.setBotiquines(botiquines);
    }

    if (typeof actions.setLastSync === "function") {
      actions.setLastSync(new Date().toISOString());
    }

    clearStoreError();

    return { inventario, botiquines };
  } catch (error) {
    console.error("[inventario] Error cargando inventario:", error);
    setStoreError(error);
    showErrorToast(error?.message || "No se pudo cargar el inventario.");
    throw error;
  } finally {
    setGlobalLoading(false);
  }
}

export function destroyInventarioModule() {
  if (typeof moduleState.unsubscribe === "function") {
    moduleState.unsubscribe();
  }

  unbindInventarioEvents();
  unbindInventarioGlobalEvents();

  moduleState.initialized = false;
  moduleState.mounted = false;
  moduleState.container = null;
  moduleState.unsubscribe = null;
  moduleState.selectedItemId = "";
  moduleState.isModalOpen = false;
  moduleState.editingItemId = "";
  moduleState.savingItem = false;
  moduleState.eventsBound = false;
  moduleState.globalEventsBound = false;
  moduleState.lastRenderSignature = "";

  document.body.classList.remove("modal-open");
}

/* ======================================
   STORE / REACTIVIDAD
====================================== */

function handleStoreChange(payload) {
  if (!isInventarioRoute()) return;
  if (!moduleState.container) return;

  const state = payload?.state || store.getState();
  const viewModel = getInventarioViewModel(state);
  const nextSignature = createRenderSignature(viewModel);

  if (nextSignature !== moduleState.lastRenderSignature) {
    setHTML(moduleState.container, createInventarioTemplate(viewModel));
    hydrateInventarioUI(moduleState.container, viewModel);
    moduleState.lastRenderSignature = nextSignature;
  }
}

function isInventarioRoute() {
  const state = store.getState();
  const currentRoute = selectors.currentRoute?.(state);

  if (currentRoute) return currentRoute === "inventario";

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash === "inventario";
}

/* ======================================
   NORMALIZACIÓN
====================================== */

function normalizeInventario(items = []) {
  return ensureArray(items).map((item, index) => {
    const idRegistro = resolveInventarioRegistroId(item, index);
    const idItem = resolveInventarioItemId(item, index);
    const idBotiquin = resolveBotiquinId(item);

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
    const expiry = getSafeExpiryStatus(fechaVencimiento);

    const estadoDerivado = deriveInventoryState({
      activo,
      cantidadActual,
      cantidadMinima,
      fechaVencimiento,
      estadoBase:
        item?.estado ??
        item?.estado_item ??
        item?.estadoItem ??
        ""
    });

    return {
      id: String(idRegistro),
      idRegistro: String(idRegistro),
      idItem: String(idItem),
      botiquinId: String(idBotiquin || ""),

      elemento:
        item?.elemento ??
        item?.nombre ??
        item?.insumo ??
        item?.producto ??
        item?.descripcion ??
        `Elemento ${index + 1}`,

      categoria: String(item?.categoria || ""),
      unidad: String(item?.unidad || ""),
      cantidadActual,
      cantidadMinima,
      lote: String(item?.lote || ""),
      fechaVencimiento: String(fechaVencimiento || ""),
      ubicacion: String(item?.ubicacion || ""),
      observaciones: String(item?.observaciones || ""),
      activo,

      estadoBase: String(
        item?.estado ??
        item?.estado_item ??
        item?.estadoItem ??
        ""
      ),

      estadoDerivado,
      expiry,

      createdAt: String(
        item?.createdAt ||
        item?.fecha_creacion ||
        item?.fechaCreacion ||
        ""
      ),

      updatedAt: String(
        item?.updatedAt ||
        item?.fecha_actualizacion ||
        item?.fechaActualizacion ||
        item?.timestamp ||
        ""
      ),

      raw: item
    };
  });
}

function normalizeBotiquines(items = []) {
  return ensureArray(items).map((item, index) => ({
    id: String(
      item?.id ??
      item?.id_botiquin ??
      item?.botiquinId ??
      item?.botiquin_id ??
      `BOT-${String(index + 1).padStart(3, "0")}`
    ),

    nombre: String(
      item?.nombre ??
      item?.nombre_botiquin ??
      item?.nombreBotiquin ??
      item?.botiquin ??
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

function resolveInventarioRegistroId(item = {}, index = 0) {
  return (
    item?.id_registro ||
    item?.id ||
    item?.rowId ||
    item?.row_id ||
    `INV-${String(index + 1).padStart(4, "0")}`
  );
}

function resolveInventarioItemId(item = {}, index = 0) {
  return (
    item?.id_item ||
    item?.itemId ||
    item?.item_id ||
    item?.sku ||
    `ITEM-${String(index + 1).padStart(4, "0")}`
  );
}

function resolveBotiquinId(item = {}) {
  return (
    item?.id_botiquin ||
    item?.botiquinId ||
    item?.botiquin_id ||
    item?.botiquin ||
    ""
  );
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
  activo = true,
  cantidadActual = 0,
  cantidadMinima = 0,
  fechaVencimiento = "",
  estadoBase = ""
}) {
  const normalizedEstadoBase = normalizeText(estadoBase);
  const expiry = getSafeExpiryStatus(fechaVencimiento);

  if (!activo) return "inactivo";
  if (expiry.isExpired) return "vencido";
  if (cantidadActual <= 0 || normalizedEstadoBase === "faltante") return "faltante";
  if (cantidadMinima > 0 && cantidadActual <= cantidadMinima) return "bajo stock";
  if (expiry.isNearExpiry) return "por vencer";
  if (normalizedEstadoBase) return normalizedEstadoBase;

  return "disponible";
}

/* ======================================
   VIEW MODEL
====================================== */

function getInventarioViewModel(state) {
  const allItems = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  const botiquines = normalizeBotiquines(ensureArray(selectors.botiquines?.(state)));
  const filters = normalizeInventarioFilters(selectors.filters?.(state) || {});

  const selectedBotiquinId =
    selectors.selectedBotiquinId?.(state) ||
    selectors.selectedBotiquin?.(state) ||
    "";

  const botiquinesMap = new Map(
    botiquines.map((botiquin) => [String(botiquin.id), botiquin])
  );

  const visibleItems = filterInventarioItems({
    items: allItems,
    filters,
    selectedBotiquinId,
    botiquinesMap
  });

  const selectedItemId = resolveSelectedItemId({
    visibleItems,
    allItems
  });

  const selectedItem = findDecoratedItemById({
    items: visibleItems.length ? visibleItems : allItems,
    itemId: selectedItemId,
    botiquinesMap
  });

  const decoratedItems = visibleItems.map((item) =>
    decorateInventarioItem(item, botiquinesMap)
  );

  const selectedBotiquin =
    botiquinesMap.get(String(selectedBotiquinId || "")) || null;

  const statsVisible = buildInventarioStats(visibleItems);
  const statsGlobal = buildInventarioStats(allItems);

  const categoryOptions = buildCategoryOptions(allItems);

  return {
    filters,
    categoryOptions,
    stats: statsVisible,
    globalStats: statsGlobal,
    items: decoratedItems,
    selectedItemId,
    selectedItem,
    selectedBotiquinId,
    selectedBotiquin,
    totalItems: allItems.length,
    visibleItemsCount: visibleItems.length,
    isScopedToBotiquin: Boolean(selectedBotiquinId),
    isModalOpen: moduleState.isModalOpen,
    isEditing: Boolean(moduleState.editingItemId),
    savingItem: moduleState.savingItem
  };
}

function normalizeInventarioFilters(filters = {}) {
  return {
    search: String(filters.search || ""),
    categoria: String(filters.categoria || filters.tipo || ""),
    estado: String(filters.estado || "")
  };
}

function decorateInventarioItem(item, botiquinesMap = new Map()) {
  return {
    ...item,
    botiquin: botiquinesMap.get(String(item.botiquinId || "")) || null
  };
}

function resolveSelectedItemId({ visibleItems = [], allItems = [] }) {
  const sourceIds = new Set(visibleItems.map((item) => String(item.id)));

  if (moduleState.selectedItemId && sourceIds.has(String(moduleState.selectedItemId))) {
    return moduleState.selectedItemId;
  }

  if (visibleItems.length) {
    const nextId = visibleItems[0].id;
    moduleState.selectedItemId = nextId;
    return nextId;
  }

  if (allItems.length) {
    const nextId = allItems[0].id;
    moduleState.selectedItemId = nextId;
    return nextId;
  }

  moduleState.selectedItemId = "";
  return "";
}

function findDecoratedItemById({ items = [], itemId = "", botiquinesMap = new Map() }) {
  const found = ensureArray(items).find((item) => String(item.id) === String(itemId));
  return found ? decorateInventarioItem(found, botiquinesMap) : null;
}

function filterInventarioItems({
  items = [],
  filters = {},
  selectedBotiquinId = "",
  botiquinesMap = new Map()
}) {
  const search = normalizeText(filters.search);
  const categoria = normalizeText(filters.categoria);
  const estado = normalizeText(filters.estado);

  return ensureArray(items)
    .filter((item) => {
      const botiquin = botiquinesMap.get(String(item.botiquinId || ""));
      const haystack = normalizeText(
        [
          item.elemento,
          item.categoria,
          item.unidad,
          item.ubicacion,
          item.lote,
          item.observaciones,
          item.idItem,
          item.idRegistro,
          item.estadoBase,
          item.estadoDerivado,
          botiquin?.nombre,
          botiquin?.sede,
          botiquin?.ubicacion,
          botiquin?.tipo
        ]
          .filter(Boolean)
          .join(" ")
      );

      const matchesSearch = !search || haystack.includes(search);
      const matchesCategoria = !categoria || normalizeText(item.categoria).includes(categoria);
      const matchesEstado = !estado || matchesEstadoFilter(item, estado);
      const matchesBotiquin =
        !selectedBotiquinId ||
        String(item.botiquinId || "") === String(selectedBotiquinId);

      return matchesSearch && matchesCategoria && matchesEstado && matchesBotiquin;
    })
    .sort(sortInventarioItems);
}

function sortInventarioItems(a, b) {
  const rankA = getPriorityRank(a);
  const rankB = getPriorityRank(b);

  if (rankA !== rankB) return rankA - rankB;

  const expiryDelta = getDateValue(a.fechaVencimiento) - getDateValue(b.fechaVencimiento);
  if (expiryDelta !== 0) return expiryDelta;

  return normalizeText(a.elemento).localeCompare(normalizeText(b.elemento), "es");
}

function matchesEstadoFilter(item, estadoFilter = "") {
  const candidate = normalizeText(estadoFilter);
  const values = [
    normalizeText(item.estadoBase),
    normalizeText(item.estadoDerivado),
    normalizeText(buildEstadoLabel(item))
  ].filter(Boolean);

  return values.some((value) => value.includes(candidate));
}

function buildInventarioStats(items = []) {
  const total = items.length;

  const vencidos = items.filter((item) => getSafeExpiryStatus(item.fechaVencimiento).isExpired).length;
  const proximosVencer = items.filter((item) => {
    const status = getSafeExpiryStatus(item.fechaVencimiento);
    return status.isNearExpiry && !status.isExpired;
  }).length;

  const bajoStock = items.filter((item) => {
    return item.cantidadMinima > 0 && item.cantidadActual > 0 && item.cantidadActual <= item.cantidadMinima;
  }).length;

  const faltantes = items.filter((item) => item.cantidadActual <= 0).length;

  return {
    total,
    vencidos,
    proximosVencer,
    bajoStock,
    faltantes,
    riesgo: bajoStock + faltantes
  };
}

function buildCategoryOptions(items = []) {
  return [...new Set(
    ensureArray(items)
      .map((item) => item.categoria)
      .filter(Boolean)
      .map((value) => String(value).trim())
  )].sort((a, b) => a.localeCompare(b, "es"));
}

function getPriorityRank(item) {
  const expiry = getSafeExpiryStatus(item.fechaVencimiento);

  if (!item.activo) return 6;
  if (expiry.isExpired) return 1;
  if (item.cantidadActual <= 0) return 2;
  if (item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima) return 3;
  if (expiry.isNearExpiry) return 4;
  return 5;
}

function getDateValue(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;

  const date = new Date(value).getTime();
  return Number.isFinite(date) ? date : Number.MAX_SAFE_INTEGER;
}

function createRenderSignature(vm) {
  return JSON.stringify({
    filters: vm.filters,
    stats: vm.stats,
    globalStats: vm.globalStats,
    selectedItemId: vm.selectedItemId,
    selectedBotiquinId: vm.selectedBotiquinId,
    isModalOpen: vm.isModalOpen,
    isEditing: vm.isEditing,
    savingItem: vm.savingItem,
    itemIds: vm.items.map((item) => item.id),
    detailId: vm.selectedItem?.id || "",
    detailQty: vm.selectedItem?.cantidadActual || 0,
    detailMin: vm.selectedItem?.cantidadMinima || 0,
    detailExpiry: vm.selectedItem?.fechaVencimiento || "",
    detailStatus: vm.selectedItem?.estadoDerivado || "",
    detailActivo: vm.selectedItem?.activo ?? null
  });
}

/* ======================================
   TEMPLATE
====================================== */

function createInventarioTemplate(vm) {
  return `
    <section class="inventario-page" data-module="${MODULE_ID}">
      <header class="page-toolbar">
        <div>
          <h2 class="section-title">Inventario</h2>
          <p class="section-text">
            Vista operativa del inventario real por botiquín. Desde aquí revisas existencias,
            vencimientos, riesgo y contexto para inspecciones o reposiciones.
          </p>
        </div>

        <div class="page-toolbar__actions">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="go-pedido"
          >
            Ver pedido
          </button>

          <button
            type="button"
            class="btn btn--secondary"
            data-action="refresh-inventario"
            ${vm.savingItem ? "disabled" : ""}
          >
            Actualizar
          </button>
        </div>
      </header>

      ${renderInventarioContextBar(vm)}

      <section class="kpi-grid">
        <button
          type="button"
          class="kpi-card"
          data-action="noop"
        >
          <span class="kpi-card__label">Total ítems</span>
          <strong class="kpi-card__value">${vm.stats.total}</strong>
          <span class="kpi-card__hint">${escapeHTML(getStatsHint(vm, "total"))}</span>
        </button>

        <button
          type="button"
          class="kpi-card"
          data-action="set-estado-filter"
          data-estado="vencido"
        >
          <span class="kpi-card__label">Vencidos</span>
          <strong class="kpi-card__value">${vm.stats.vencidos}</strong>
          <span class="kpi-card__hint">${escapeHTML(getStatsHint(vm, "vencidos"))}</span>
        </button>

        <button
          type="button"
          class="kpi-card"
          data-action="set-estado-filter"
          data-estado="por vencer"
        >
          <span class="kpi-card__label">Próximos a vencer</span>
          <strong class="kpi-card__value">${vm.stats.proximosVencer}</strong>
          <span class="kpi-card__hint">${escapeHTML(getStatsHint(vm, "proximos"))}</span>
        </button>

        <button
          type="button"
          class="kpi-card"
          data-action="go-pedido"
        >
          <span class="kpi-card__label">Bajo stock / faltantes</span>
          <strong class="kpi-card__value">${vm.stats.riesgo}</strong>
          <span class="kpi-card__hint">${escapeHTML(getStatsHint(vm, "riesgo"))}</span>
        </button>
      </section>

      <section class="card">
        <div class="card__body">
          <form class="filters-grid" data-role="inventario-filters" autocomplete="off">
            <div class="form-group">
              <label class="form-label" for="inventarioSearch">Buscar</label>
              <input
                id="inventarioSearch"
                name="search"
                class="input"
                type="search"
                placeholder="Elemento, lote, ID, botiquín..."
                value="${escapeHTML(vm.filters.search)}"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="inventarioCategoria">Categoría</label>
              <input
                id="inventarioCategoria"
                name="categoria"
                class="input"
                type="text"
                list="inventarioCategoriaList"
                placeholder="Todas"
                value="${escapeHTML(vm.filters.categoria)}"
              />
              <datalist id="inventarioCategoriaList">
                ${vm.categoryOptions.map((option) => `<option value="${escapeHTML(option)}"></option>`).join("")}
              </datalist>
            </div>

            <div class="form-group">
              <label class="form-label" for="inventarioEstado">Estado</label>
              <input
                id="inventarioEstado"
                name="estado"
                class="input"
                type="text"
                placeholder="vencido, por vencer, bajo stock..."
                value="${escapeHTML(vm.filters.estado)}"
              />
            </div>

            <div class="form-group form-group--actions">
              <label class="form-label is-ghost">Acciones</label>
              <div class="form-actions-inline">
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="reset-inventario-filters"
                >
                  Limpiar filtros
                </button>

                <button
                  type="button"
                  class="btn btn--secondary"
                  data-action="go-pedido"
                >
                  Abrir pedido
                </button>

                ${
                  vm.isScopedToBotiquin
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

      <section class="inventario-results">
        <div class="inventario-results__header">
          <div>
            <h3 class="card__title">Elementos encontrados</h3>
            <p class="section-text">
              ${
                vm.isScopedToBotiquin
                  ? `${vm.visibleItemsCount} resultado(s) dentro de ${vm.selectedBotiquin?.nombre || "este botiquín"}`
                  : `${vm.visibleItemsCount} resultado(s) consolidados`
              }
            </p>
          </div>

          <div class="inventario-results__actions">
            <button
              type="button"
              class="btn btn--ghost"
              data-action="go-pedido"
            >
              Ir a pedido consolidado
            </button>
          </div>
        </div>

        <div class="inventario-layout__list">
          ${renderInventarioList(vm.items, vm.selectedItemId, vm)}
        </div>
      </section>

      ${renderInventarioModal(vm)}
    </section>
  `;
}

function renderInventarioContextBar(vm) {
  const selectedBotiquin = vm.selectedBotiquin;
  const hasBotiquin = Boolean(selectedBotiquin);

  return `
    <section class="card inventario-context-card">
      <div class="card__body inventario-context">
        <div class="inventario-context__main">
          <span class="inventario-context__eyebrow">Contexto actual</span>
          <h3 class="inventario-context__title">
            ${
              hasBotiquin
                ? escapeHTML(selectedBotiquin.nombre || "Botiquín seleccionado")
                : "Vista consolidada"
            }
          </h3>
          <p class="section-text">
            ${
              hasBotiquin
                ? "Los indicadores y el listado están filtrados por el botiquín activo."
                : "Se muestra el inventario consolidado de todos los botiquines registrados."
            }
          </p>
        </div>

        <div class="inventario-context__meta">
          ${
            hasBotiquin
              ? `
                ${selectedBotiquin.tipo ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.tipo)}</span>` : ""}
                ${selectedBotiquin.ubicacion ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.ubicacion)}</span>` : ""}
                ${selectedBotiquin.sede ? `<span class="badge badge--muted">${escapeHTML(selectedBotiquin.sede)}</span>` : ""}
              `
              : `
                <span class="badge badge--success">Vista global</span>
                <span class="badge badge--muted">${escapeHTML(String(vm.totalItems))} ítems registrados</span>
              `
          }
        </div>

        <div class="inventario-context__actions">
          ${
            hasBotiquin
              ? `
                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="clear-selected-botiquin"
                >
                  Ver todos
                </button>

                <button
                  type="button"
                  class="btn btn--secondary"
                  data-action="open-botiquin"
                  data-botiquin-id="${escapeHTML(selectedBotiquin.id || "")}"
                >
                  Ir a botiquín
                </button>

                <button
                  type="button"
                  class="btn btn--secondary"
                  data-action="go-pedido"
                >
                  Ver pedido
                </button>
              `
              : `
                <button
                  type="button"
                  class="btn btn--secondary"
                  data-action="go-botiquines"
                >
                  Explorar botiquines
                </button>

                <button
                  type="button"
                  class="btn btn--ghost"
                  data-action="go-pedido"
                >
                  Abrir pedido
                </button>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderInventarioList(items = [], selectedId = "", vm = {}) {
  if (!items.length) {
    return `
      <article class="card card--empty">
        <div class="card__body">
          <h3 class="card__title">No hay elementos para mostrar</h3>
          <p class="section-text">
            No se encontraron resultados con los filtros actuales. Qué sorpresa, los filtros sí filtran.
          </p>
        </div>
      </article>
    `;
  }

  return `
    <div class="cards-grid">
      ${items.map((item) => renderInventarioCard(item, selectedId, vm)).join("")}
    </div>
  `;
}

function renderInventarioCard(item, selectedId = "", vm = {}) {
  const isActive = String(item.id) === String(selectedId);
  const isEditingThis = String(moduleState.editingItemId) === String(item.id);
  const shouldOfferPedido = item.cantidadActual <= 0 || (
    item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima
  );

  const botiquinMeta = [
    item.botiquin?.nombre || "Botiquín no definido",
    item.botiquin?.ubicacion || item.ubicacion || "",
    item.botiquin?.tipo || ""
  ]
    .filter(Boolean)
    .join(" · ");

  const expiryText = item.fechaVencimiento
    ? formatExpiryText(item.fechaVencimiento)
    : "Sin fecha de vencimiento";

  return `
    <article
      class="card inventario-card ${isActive ? "is-active" : ""}"
      data-item-id="${escapeHTML(item.id)}"
    >
      <div class="card__body">
        <div class="inventario-card__header">
          <div class="inventario-card__header-main">
            <span class="badge ${getEstadoBadgeClass(item)}">
              ${escapeHTML(buildEstadoLabel(item))}
            </span>
            <h3 class="card__title">${escapeHTML(item.elemento)}</h3>
            <p class="inventario-card__meta">${escapeHTML(botiquinMeta)}</p>
          </div>
        </div>

        <dl class="data-list">
          <div>
            <dt>Categoría</dt>
            <dd>${escapeHTML(item.categoria || "No definida")}</dd>
          </div>
          <div>
            <dt>Cantidad</dt>
            <dd>${escapeHTML(String(item.cantidadActual))}${item.unidad ? ` ${escapeHTML(item.unidad)}` : ""}</dd>
          </div>
          <div>
            <dt>Mínimo</dt>
            <dd>${escapeHTML(String(item.cantidadMinima))}</dd>
          </div>
        </dl>

        <p class="section-text">${escapeHTML(expiryText)}</p>

        <div class="card__actions">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="open-item-modal"
            data-item-id="${escapeHTML(item.id)}"
          >
            Ver detalle
          </button>

          <button
            type="button"
            class="btn btn--primary"
            data-action="edit-item"
            data-item-id="${escapeHTML(item.id)}"
            ${vm.savingItem ? "disabled" : ""}
          >
            ${isEditingThis && vm.savingItem ? "Guardando..." : "Editar"}
          </button>

          ${
            shouldOfferPedido
              ? `
                <button
                  type="button"
                  class="btn btn--secondary"
                  data-action="go-pedido"
                >
                  Ir a pedido
                </button>
              `
              : `
                <button
                  type="button"
                  class="btn btn--secondary"
                  data-action="open-botiquin"
                  data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
                >
                  Ver botiquín
                </button>
              `
          }
        </div>
      </div>
    </article>
  `;
}

function renderInventarioModal(vm) {
  if (!vm.isModalOpen || !vm.selectedItem) return "";

  const item = vm.selectedItem;
  const shouldOfferPedido = item.cantidadActual <= 0 || (
    item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima
  );

  return `
    <div
      class="modal-overlay modal-overlay--inventario is-open"
      data-role="inventario-modal-overlay"
      aria-hidden="false"
    >
      <section
        class="modal-dialog modal-dialog--inventario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventarioModalTitle"
      >
        <article class="card inventario-detail-card inventario-detail-card--modal">
          <div class="card__body">
            <div class="detail-header detail-header--modal">
              <div>
                <span class="badge ${getEstadoBadgeClass(item)}">
                  ${escapeHTML(buildEstadoLabel(item))}
                </span>
                <h3 class="card__title" id="inventarioModalTitle">
                  ${escapeHTML(item.elemento)}
                </h3>
                <p class="section-text">
                  ${escapeHTML(item.botiquin?.nombre || "Botiquín no definido")}
                  ${item.botiquin?.ubicacion ? ` · ${escapeHTML(item.botiquin.ubicacion)}` : ""}
                </p>
              </div>

              <button
                type="button"
                class="btn btn--ghost"
                data-action="close-item-modal"
                aria-label="Cerrar detalle"
              >
                Cerrar
              </button>
            </div>

            <dl class="data-list data-list--stack">
              <div>
                <dt>ID registro</dt>
                <dd>${escapeHTML(item.idRegistro)}</dd>
              </div>
              <div>
                <dt>ID ítem</dt>
                <dd>${escapeHTML(item.idItem || "No registrado")}</dd>
              </div>
              <div>
                <dt>Botiquín</dt>
                <dd>${escapeHTML(item.botiquin?.nombre || "No definido")}</dd>
              </div>
              <div>
                <dt>Sede</dt>
                <dd>${escapeHTML(item.botiquin?.sede || "No registrada")}</dd>
              </div>
              <div>
                <dt>Ubicación</dt>
                <dd>${escapeHTML(item.ubicacion || item.botiquin?.ubicacion || "No registrada")}</dd>
              </div>
              <div>
                <dt>Tipo de botiquín</dt>
                <dd>${escapeHTML(item.botiquin?.tipo || "No definido")}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>${escapeHTML(item.categoria || "No definida")}</dd>
              </div>
              <div>
                <dt>Unidad</dt>
                <dd>${escapeHTML(item.unidad || "No registrada")}</dd>
              </div>
              <div>
                <dt>Cantidad actual</dt>
                <dd>${escapeHTML(String(item.cantidadActual))}</dd>
              </div>
              <div>
                <dt>Cantidad mínima</dt>
                <dd>${escapeHTML(String(item.cantidadMinima))}</dd>
              </div>
              <div>
                <dt>Estado base</dt>
                <dd>${escapeHTML(item.estadoBase || "Sin estado base")}</dd>
              </div>
              <div>
                <dt>Estado calculado</dt>
                <dd>${escapeHTML(buildEstadoLabel(item))}</dd>
              </div>
              <div>
                <dt>Activo</dt>
                <dd>${item.activo ? "Sí" : "No"}</dd>
              </div>
              <div>
                <dt>Lote</dt>
                <dd>${escapeHTML(item.lote || "No registrado")}</dd>
              </div>
              <div>
                <dt>Fecha de vencimiento</dt>
                <dd>${item.fechaVencimiento ? escapeHTML(formatDate(item.fechaVencimiento)) : "Sin fecha registrada"}</dd>
              </div>
              <div>
                <dt>Resumen de vencimiento</dt>
                <dd>${escapeHTML(item.fechaVencimiento ? formatExpiryText(item.fechaVencimiento) : "Sin fecha de vencimiento")}</dd>
              </div>
              <div>
                <dt>Observaciones</dt>
                <dd>${escapeHTML(item.observaciones || "Sin observaciones")}</dd>
              </div>
              <div>
                <dt>Última actualización</dt>
                <dd>${item.updatedAt ? escapeHTML(formatDate(item.updatedAt)) : "No registrada"}</dd>
              </div>
            </dl>

            <div class="card__actions">
              <button
                type="button"
                class="btn btn--primary"
                data-action="edit-item"
                data-item-id="${escapeHTML(item.id)}"
                ${vm.savingItem ? "disabled" : ""}
              >
                ${
                  vm.savingItem && String(moduleState.editingItemId) === String(item.id)
                    ? "Guardando..."
                    : "Editar inventario"
                }
              </button>

              <button
                type="button"
                class="btn btn--secondary"
                data-action="open-botiquin"
                data-botiquin-id="${escapeHTML(item.botiquinId || "")}"
              >
                Ir a botiquín
              </button>

              ${
                shouldOfferPedido
                  ? `
                    <button
                      type="button"
                      class="btn btn--secondary"
                      data-action="go-pedido"
                    >
                      Ir a pedido
                    </button>
                  `
                  : `
                    <button
                      type="button"
                      class="btn btn--ghost"
                      data-action="go-alertas"
                    >
                      Ver alertas
                    </button>
                  `
              }
            </div>
          </div>
        </article>
      </section>
    </div>
  `;
}

function hydrateInventarioUI(container, vm) {
  const cards = qsa("[data-item-id]", container);

  cards.forEach((card) => {
    const id = card.dataset.itemId;
    if (String(id) === String(vm.selectedItemId)) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  });

  const searchInput = qs("#inventarioSearch", container);
  const categoriaInput = qs("#inventarioCategoria", container);
  const estadoInput = qs("#inventarioEstado", container);

  if (searchInput && document.activeElement !== searchInput) {
    searchInput.value = vm.filters.search;
  }

  if (categoriaInput && document.activeElement !== categoriaInput) {
    categoriaInput.value = vm.filters.categoria;
  }

  if (estadoInput && document.activeElement !== estadoInput) {
    estadoInput.value = vm.filters.estado;
  }

  document.body.classList.toggle("modal-open", Boolean(vm.isModalOpen));
}

/* ======================================
   EVENTOS
====================================== */

function bindInventarioEvents() {
  document.addEventListener("input", handleInventarioInput, true);
  document.addEventListener("click", handleInventarioClick, true);
}

function unbindInventarioEvents() {
  document.removeEventListener("input", handleInventarioInput, true);
  document.removeEventListener("click", handleInventarioClick, true);
}

function bindInventarioGlobalEvents() {
  document.addEventListener("keydown", handleInventarioKeydown, true);
}

function unbindInventarioGlobalEvents() {
  document.removeEventListener("keydown", handleInventarioKeydown, true);
}

const debouncedSearch = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ search: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedCategoria = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ categoria: value || "", tipo: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

const debouncedEstado = debounce((value) => {
  if (typeof actions.setFilters === "function") {
    actions.setFilters({ estado: value || "" });
  }
}, SEARCH_DEBOUNCE_MS);

function handleInventarioInput(event) {
  if (!moduleState.container) return;
  if (!moduleState.container.contains(event.target)) return;

  const target = event.target;

  if (target.matches("#inventarioSearch")) {
    debouncedSearch(target.value);
    return;
  }

  if (target.matches("#inventarioCategoria")) {
    debouncedCategoria(target.value);
    return;
  }

  if (target.matches("#inventarioEstado")) {
    debouncedEstado(target.value);
  }
}

async function handleInventarioClick(event) {
  if (!moduleState.container) return;

  const isInsideContainer = moduleState.container.contains(event.target);
  const isOverlay = event.target.closest('[data-role="inventario-modal-overlay"]');

  if (!isInsideContainer && !isOverlay) return;

  const overlay = event.target.closest('[data-role="inventario-modal-overlay"]');
  if (overlay && event.target === overlay) {
    closeInventarioModal();
    return;
  }

  const trigger = event.target.closest("[data-action], [data-item-id]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  const itemId =
    trigger.dataset.itemId ||
    trigger.closest("[data-item-id]")?.dataset.itemId ||
    "";

  const botiquinId = trigger.dataset.botiquinId || "";
  const estado = trigger.dataset.estado || "";

  if (!action && itemId) {
    selectInventarioItem(itemId);
    return;
  }

  switch (action) {
    case "refresh-inventario":
      await syncInventarioModuleData({ force: true });
      renderInventarioView();
      break;

    case "reset-inventario-filters":
      if (typeof actions.setFilters === "function") {
        actions.setFilters({
          search: "",
          categoria: "",
          tipo: "",
          estado: ""
        });
      }
      break;

    case "set-estado-filter":
      if (typeof actions.setFilters === "function") {
        actions.setFilters({ estado: estado || "" });
      }
      break;

    case "open-item-modal":
      if (itemId) openInventarioModal(itemId);
      break;

    case "edit-item":
      if (itemId) openInventarioEditModal(itemId);
      break;

    case "close-item-modal":
      closeInventarioModal();
      break;

    case "open-botiquin":
      if (botiquinId) {
        setSelectedBotiquin(botiquinId);
        closeInventarioModal();
        navigateTo("botiquines");
      }
      break;

    case "clear-selected-botiquin":
      clearSelectedBotiquin();
      closeInventarioModal();
      renderInventarioView();
      break;

    case "go-alertas":
      closeInventarioModal();
      navigateTo("alertas");
      break;

    case "go-botiquines":
      navigateTo("botiquines");
      break;

    case "go-pedido":
      closeInventarioModal();
      navigateTo("pedido");
      break;

    case "noop":
    default:
      break;
  }
}

function handleInventarioKeydown(event) {
  if (!isInventarioRoute()) return;

  if (moduleState.isModalOpen && event.key === "Escape") {
    event.preventDefault();
    closeInventarioModal();
  }
}

function openInventarioModal(itemId) {
  if (!itemId) return;
  moduleState.selectedItemId = itemId;
  moduleState.isModalOpen = true;
  renderInventarioView();
}

function closeInventarioModal() {
  if (!moduleState.isModalOpen) return;
  moduleState.isModalOpen = false;
  renderInventarioView();
}

function selectInventarioItem(itemId) {
  if (!itemId) return;
  moduleState.selectedItemId = itemId;
  renderInventarioView();
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
   EDICIÓN
====================================== */

function getInventarioItemById(itemId) {
  if (!itemId) return null;

  const state = store.getState();

  if (typeof selectors.getInventarioItemById === "function") {
    const found = selectors.getInventarioItemById(state, itemId);
    return found ? normalizeInventario([found])[0] : null;
  }

  const items = normalizeInventario(ensureArray(selectors.inventario?.(state)));
  return items.find((item) => String(item.id) === String(itemId)) || null;
}

function openInventarioEditModal(itemId) {
  const item = getInventarioItemById(itemId);

  if (!item) {
    showErrorToast("No encontré el ítem de inventario que quieres editar.");
    return;
  }

  moduleState.editingItemId = itemId;
  renderInventarioView();

  openFormModal({
    modalId: EDIT_MODAL_ID,
    title: "Editar inventario",
    subtitle: `${item.elemento} · ${item.botiquinId || "Sin botiquín"}`,
    submitLabel: "Guardar cambios",
    fields: [
      {
        type: "hidden",
        name: "id_registro",
        value: item.idRegistro
      },
      {
        type: "hidden",
        name: "id_item",
        value: item.idItem || ""
      },
      {
        type: "hidden",
        name: "id_botiquin",
        value: item.botiquinId || ""
      },
      {
        name: "elemento",
        label: "Elemento",
        value: item.elemento || "",
        readonly: true,
        col: 12
      },
      {
        name: "cantidad_actual",
        label: "Cantidad actual",
        type: "number",
        value: item.cantidadActual,
        min: 0,
        step: 1,
        required: true,
        col: 4,
        hint: "Cantidad disponible actualmente."
      },
      {
        name: "cantidad_minima",
        label: "Cantidad mínima",
        type: "number",
        value: item.cantidadMinima,
        min: 0,
        step: 1,
        required: true,
        col: 4,
        hint: "Umbral para alertar reposición."
      },
      {
        name: "fecha_vencimiento",
        label: "Fecha de vencimiento",
        type: "date",
        value: item.fechaVencimiento || "",
        col: 4
      },
      {
        name: "lote",
        label: "Lote",
        value: item.lote || "",
        col: 6
      },
      {
        name: "activo",
        label: "Activo",
        type: "select",
        value: item.activo ? "si" : "no",
        col: 6,
        options: [
          { value: "si", label: "Sí" },
          { value: "no", label: "No" }
        ]
      },
      {
        name: "observaciones",
        label: "Observaciones",
        type: "textarea",
        value: item.observaciones || "",
        rows: 4,
        col: 12
      }
    ],
    onSubmit: async (values, context) => {
      const currentItem = getInventarioItemById(itemId);

      if (!currentItem) {
        showErrorToast("El ítem ya no está disponible en memoria.");
        return;
      }

      await saveInventarioItemEdition(currentItem, values, context);
    },
    onClose: () => {
      moduleState.editingItemId = "";
      renderInventarioView();
    }
  });
}

async function saveInventarioItemEdition(item, values, context = {}) {
  if (moduleState.savingItem) return;

  const { formElement, close } = context;
  const submitButton = formElement?.querySelector?.('[data-role="form-submit"]');

  moduleState.savingItem = true;
  renderInventarioView();

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Guardando...";
    }

    const payload = buildInventarioUpdatePayload(item, values);
    const response = await updateInventarioItem(payload);
    const updatedItem = normalizeUpdatedInventarioItem(item, payload, response);

    applyUpdatedInventarioItemToStore(updatedItem);

    if (typeof actions.setLastSync === "function") {
      actions.setLastSync(new Date().toISOString());
    }

    clearStoreError();

    moduleState.selectedItemId = updatedItem.id;
    moduleState.editingItemId = "";

    showSuccessToast("Inventario actualizado correctamente.");

    if (typeof close === "function") {
      close();
    }

    renderInventarioView();
  } catch (error) {
    console.error("[inventario] Error guardando edición:", error);
    setStoreError(error);
    showErrorToast(error?.message || "No se pudo actualizar el inventario.");
  } finally {
    moduleState.savingItem = false;
    moduleState.editingItemId = "";

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Guardar cambios";
    }

    renderInventarioView();
  }
}

function buildInventarioUpdatePayload(item, values = {}) {
  return {
    id_registro: item.idRegistro || item.id,
    id_item: item.idItem || values.id_item || "",
    id_botiquin: item.botiquinId || values.id_botiquin || "",
    cantidad_actual: Math.max(
      0,
      toNumber(values.cantidad_actual, item.cantidadActual)
    ),
    cantidad_minima: Math.max(
      0,
      toNumber(values.cantidad_minima, item.cantidadMinima)
    ),
    lote: values.lote || "",
    fecha_vencimiento: values.fecha_vencimiento || "",
    observaciones: values.observaciones || "",
    activo: normalizeActiveFlag(values.activo, item.activo)
  };
}

function normalizeUpdatedInventarioItem(originalItem, payload = {}, apiResponse = {}) {
  const record =
    apiResponse?.record ||
    apiResponse?.item ||
    apiResponse?.row ||
    apiResponse?.data ||
    {};

  const merged = {
    ...originalItem.raw,
    ...record,
    id_registro:
      record?.id_registro ??
      payload.id_registro ??
      originalItem.idRegistro,
    id_item:
      record?.id_item ??
      payload.id_item ??
      originalItem.idItem,
    id_botiquin:
      record?.id_botiquin ??
      payload.id_botiquin ??
      originalItem.botiquinId,
    elemento:
      record?.elemento ??
      originalItem.elemento,
    categoria:
      record?.categoria ??
      originalItem.categoria,
    unidad:
      record?.unidad ??
      originalItem.unidad,
    cantidad_actual:
      payload.cantidad_actual ??
      record?.cantidad_actual ??
      originalItem.cantidadActual,
    cantidad_minima:
      payload.cantidad_minima ??
      record?.cantidad_minima ??
      originalItem.cantidadMinima,
    lote:
      payload.lote ??
      record?.lote ??
      originalItem.lote,
    fecha_vencimiento:
      payload.fecha_vencimiento ??
      record?.fecha_vencimiento ??
      originalItem.fechaVencimiento,
    ubicacion:
      record?.ubicacion ??
      originalItem.ubicacion,
    observaciones:
      payload.observaciones ??
      record?.observaciones ??
      originalItem.observaciones,
    activo:
      payload.activo ??
      record?.activo ??
      originalItem.activo
  };

  return normalizeInventario([merged])[0];
}

function applyUpdatedInventarioItemToStore(updatedItem) {
  if (typeof actions.upsertInventarioItem === "function") {
    actions.upsertInventarioItem(updatedItem);
    return;
  }

  if (typeof actions.setInventario === "function") {
    const currentItems = normalizeInventario(
      ensureArray(selectors.inventario?.(store.getState()))
    );

    const nextItems = currentItems.map((current) =>
      String(current.id) === String(updatedItem.id) ? updatedItem : current
    );

    actions.setInventario(nextItems);
  }
}

/* ======================================
   UI HELPERS
====================================== */

function getStatsHint(vm, type) {
  if (vm.isScopedToBotiquin && vm.selectedBotiquin?.nombre) {
    switch (type) {
      case "total":
        return `Resumen de ${vm.selectedBotiquin.nombre}`;
      case "vencidos":
        return "Elementos críticos en este botiquín";
      case "proximos":
        return "Revisión preventiva pendiente";
      case "riesgo":
        return "Reposición o ajuste requerido";
      default:
        return `Vista de ${vm.selectedBotiquin.nombre}`;
    }
  }

  switch (type) {
    case "total":
      return "Resumen global del sistema";
    case "vencidos":
      return "Elementos vencidos en todos los botiquines";
    case "proximos":
      return "Elementos próximos a vencer";
    case "riesgo":
      return "Faltantes o bajo stock";
    default:
      return "Vista global";
  }
}

function buildEstadoLabel(item) {
  const expiry = getSafeExpiryStatus(item.fechaVencimiento);

  if (!item.activo) return "Inactivo";
  if (expiry.isExpired) return "Vencido";
  if (item.cantidadActual <= 0) return "Faltante";
  if (item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima) return "Bajo stock";
  if (expiry.isNearExpiry) return "Por vencer";
  if (normalizeText(item.estadoDerivado) === "disponible") return "Disponible";

  return item.estadoBase || "Disponible";
}

function getEstadoBadgeClass(item) {
  const expiry = getSafeExpiryStatus(item.fechaVencimiento);

  if (!item.activo) return "badge--muted";
  if (expiry.isExpired) return "badge--danger";
  if (item.cantidadActual <= 0) return "badge--danger";
  if (item.cantidadMinima > 0 && item.cantidadActual <= item.cantidadMinima) return "badge--warning";
  if (expiry.isNearExpiry) return "badge--alert";
  return "badge--success";
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
   HELPERS STORE
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
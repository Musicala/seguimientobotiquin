import { store, selectors, actions } from "../state.js";
import { getBotiquines } from "../api.js";
import { navigateTo } from "../router.js";
import {
  qs,
  qsa,
  setHTML,
  debounce,
  ensureArray,
  normalizeText,
  escapeHTML,
  formatDate
} from "../utils.js";

/* ======================================
   CONFIG DEL MÓDULO
====================================== */

const MODULE_ID = "botiquines-module";
const SEARCH_DEBOUNCE_MS = 250;
const BODY_MODAL_CLASS = "modal-open";

const moduleState = {
  initialized: false,
  mounted: false,
  container: null,
  unsubscribe: null,
  selectedId: null,
  isDetailModalOpen: false
};

/* ======================================
   API PÚBLICA
====================================== */

/**
 * Inicializa el módulo de botiquines.
 * @param {Object} options
 * @param {HTMLElement} options.container
 * @param {boolean} options.forceRender
 */
export async function initBotiquinesModule(options = {}) {
  const { container, forceRender = false } = options;

  if (!(container instanceof HTMLElement)) {
    throw new Error("[botiquines] initBotiquinesModule requiere un container válido.");
  }

  moduleState.container = container;

  if (!moduleState.initialized) {
    moduleState.unsubscribe = store.subscribe(handleStoreChange);
    bindBotiquinesEvents();
    moduleState.initialized = true;
  }

  await syncBotiquinesModuleData();

  if (forceRender || isBotiquinesRoute()) {
    renderBotiquinesView();
  }

  moduleState.mounted = true;
}

/**
 * Renderiza la vista completa del módulo.
 */
export function renderBotiquinesView() {
  if (!moduleState.container) return;

  const state = store.getState();
  const viewModel = getBotiquinesViewModel(state);

  setHTML(moduleState.container, createBotiquinesTemplate(viewModel));
  hydrateBotiquinesUI(moduleState.container, viewModel);

  if (moduleState.isDetailModalOpen && viewModel.selectedBotiquin) {
    openDetailModalUI();
  } else {
    closeDetailModalUI({ preserveSelection: true });
  }
}

/**
 * Sincroniza botiquines desde API si hace falta.
 * @param {Object} options
 * @param {boolean} options.force
 */
export async function syncBotiquinesModuleData(options = {}) {
  const { force = false } = options;

  const state = store.getState();
  const currentItems = ensureArray(selectors.botiquines(state));

  if (!force && currentItems.length > 0) {
    return currentItems;
  }

  actions.setLoading(true, "Cargando botiquines...");

  try {
    const response = await getBotiquines();
    const botiquines = normalizeBotiquines(response);

    actions.setBotiquines(botiquines);
    actions.setLastError(null);
    actions.setLastSync(new Date().toISOString());

    return botiquines;
  } catch (error) {
    console.error("[botiquines] Error cargando botiquines:", error);
    actions.setLastError(error);
    throw error;
  } finally {
    actions.setLoading(false);
  }
}

/**
 * Limpieza opcional.
 */
export function destroyBotiquinesModule() {
  if (typeof moduleState.unsubscribe === "function") {
    moduleState.unsubscribe();
  }

  document.body.classList.remove(BODY_MODAL_CLASS);

  moduleState.initialized = false;
  moduleState.mounted = false;
  moduleState.container = null;
  moduleState.unsubscribe = null;
  moduleState.selectedId = null;
  moduleState.isDetailModalOpen = false;
}

/* ======================================
   STORE / REACTIVIDAD
====================================== */

function handleStoreChange(payload) {
  const state = payload?.state || store.getState();

  if (!isBotiquinesRoute()) return;
  if (!moduleState.container) return;

  renderBotiquinesView();
}

function isBotiquinesRoute() {
  const state = store.getState();
  const route = selectors.currentRoute?.(state);

  if (route) return route === "botiquines";

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash === "botiquines" || hash === "";
}

/* ======================================
   NORMALIZACIÓN
====================================== */

function normalizeBotiquines(items = []) {
  return ensureArray(items).map((item, index) => ({
    id: item?.id || item?.id_botiquin || item?.botiquinId || `BOT-${String(index + 1).padStart(3, "0")}`,
    nombre: item?.nombre || item?.nombreBotiquin || item?.botiquin || `Botiquín ${index + 1}`,
    sede: item?.sede || "",
    ubicacion: item?.ubicacion || "",
    tipo: item?.tipo || "",
    responsable: item?.responsable || "",
    estado: item?.estado || "",
    descripcion: item?.descripcion || "",
    fechaUltimaInspeccion:
      item?.fechaUltimaInspeccion ||
      item?.ultimaInspeccion ||
      item?.fecha_ultima_inspeccion ||
      "",
    observaciones: item?.observaciones || "",
    updatedAt:
      item?.updatedAt ||
      item?.fechaActualizacion ||
      item?.fecha_actualizacion ||
      "",
    createdAt:
      item?.createdAt ||
      item?.fechaCreacion ||
      item?.fecha_creacion ||
      ""
  }));
}

/* ======================================
   VIEW MODEL
====================================== */

function getBotiquinesViewModel(state) {
  const allBotiquines = ensureArray(selectors.botiquines(state));
  const filters = selectors.filters?.(state) || {};
  const selectedBotiquinId =
    selectors.selectedBotiquinId?.(state) ||
    selectors.selectedBotiquin?.(state) ||
    moduleState.selectedId ||
    "";

  const visibleBotiquines = filterBotiquines(allBotiquines, filters);
  const selectedBotiquin =
    visibleBotiquines.find((item) => String(item.id) === String(selectedBotiquinId)) ||
    allBotiquines.find((item) => String(item.id) === String(selectedBotiquinId)) ||
    null;

  const stats = buildBotiquinesStats(allBotiquines);
  const quickAccess = buildQuickAccess(allBotiquines);

  return {
    filters,
    stats,
    quickAccess,
    allBotiquines,
    visibleBotiquines,
    selectedBotiquinId,
    selectedBotiquin,
    totalVisible: visibleBotiquines.length
  };
}

function filterBotiquines(items = [], filters = {}) {
  const search = normalizeText(filters.search || "");
  const sede = normalizeText(filters.sede || "");
  const tipo = normalizeText(filters.tipo || "");

  return ensureArray(items).filter((item) => {
    const haystack = normalizeText(
      [
        item.nombre,
        item.sede,
        item.ubicacion,
        item.tipo,
        item.responsable,
        item.estado,
        item.descripcion
      ]
        .filter(Boolean)
        .join(" ")
    );

    const matchesSearch = !search || haystack.includes(search);
    const matchesSede = !sede || normalizeText(item.sede).includes(sede) || normalizeText(item.ubicacion).includes(sede);
    const matchesTipo = !tipo || normalizeText(item.tipo).includes(tipo);

    return matchesSearch && matchesSede && matchesTipo;
  });
}

function buildBotiquinesStats(items = []) {
  const total = items.length;

  const porTipo = items.reduce((acc, item) => {
    const key = normalizeText(item.tipo || "sin tipo") || "sin tipo";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const porEstado = items.reduce((acc, item) => {
    const key = normalizeText(item.estado || "sin estado") || "sin estado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const principalesTipos = Object.entries(porTipo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    total,
    operativos: porEstado.operativo || porEstado.activo || porEstado.ok || 0,
    pendientes: porEstado.pendiente || 0,
    revision: (porEstado.revision || 0) + (porEstado["en revision"] || 0),
    topTipos: principalesTipos
  };
}

function buildQuickAccess(items = []) {
  return ensureArray(items)
    .slice()
    .sort((a, b) => {
      const nombreA = normalizeText(a.nombre || a.ubicacion || "");
      const nombreB = normalizeText(b.nombre || b.ubicacion || "");
      return nombreA.localeCompare(nombreB, "es");
    })
    .map((item) => ({
      id: item.id,
      titulo: item.ubicacion || item.nombre || "Botiquín",
      subtitulo: item.tipo || item.sede || "Sin categoría"
    }));
}

/* ======================================
   TEMPLATE
====================================== */

function createBotiquinesTemplate(vm) {
  return `
    <section class="botiquines-page" data-module="${MODULE_ID}">
      <header class="page-toolbar page-toolbar--botiquines">
        <div class="page-toolbar__content">
          <div class="eyebrow">Sistema interno</div>
          <h2 class="section-title">Botiquines</h2>
          <p class="section-text">
            Consulta el estado general, filtra rápidamente y revisa el detalle de cada botiquín sin mandarlo al fondo de la página como si fuera castigo.
          </p>
        </div>

        <div class="page-toolbar__actions">
          <button
            type="button"
            class="btn btn--secondary"
            data-action="refresh-botiquines"
          >
            Actualizar
          </button>
        </div>
      </header>

      <section class="kpi-grid">
        <article class="kpi-card">
          <span class="kpi-card__label">Total</span>
          <strong class="kpi-card__value">${vm.stats.total}</strong>
          <span class="kpi-card__hint">Botiquines registrados</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Operativos</span>
          <strong class="kpi-card__value">${vm.stats.operativos}</strong>
          <span class="kpi-card__hint">Listos para uso</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">Pendientes</span>
          <strong class="kpi-card__value">${vm.stats.pendientes}</strong>
          <span class="kpi-card__hint">Requieren acción</span>
        </article>

        <article class="kpi-card">
          <span class="kpi-card__label">En revisión</span>
          <strong class="kpi-card__value">${vm.stats.revision}</strong>
          <span class="kpi-card__hint">Seguimiento activo</span>
        </article>
      </section>

      <section class="botiquines-shell">
        <aside class="botiquines-sidebar">
          <section class="card botiquines-sidebar__panel">
            <div class="card__body">
              <div class="botiquines-sidebar__heading">
                <h3 class="card__title">Filtros</h3>
                <p class="section-text">Refina la vista sin sufrir.</p>
              </div>

              <form class="filters-grid filters-grid--stack" data-role="botiquines-filters" autocomplete="off">
                <div class="form-group">
                  <label class="form-label" for="botiquinesSearch">Buscar</label>
                  <input
                    id="botiquinesSearch"
                    name="search"
                    class="input"
                    type="search"
                    placeholder="Nombre, sede, ubicación..."
                    value="${escapeHTML(vm.filters.search || "")}"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="botiquinesSede">Sede o ubicación</label>
                  <input
                    id="botiquinesSede"
                    name="sede"
                    class="input"
                    type="text"
                    placeholder="Ej. Primer piso"
                    value="${escapeHTML(vm.filters.sede || "")}"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="botiquinesTipo">Tipo</label>
                  <input
                    id="botiquinesTipo"
                    name="tipo"
                    class="input"
                    type="text"
                    placeholder="Ej. Grande, pequeño..."
                    value="${escapeHTML(vm.filters.tipo || "")}"
                  />
                </div>

                <div class="form-actions-inline form-actions-inline--stack">
                  <button
                    type="button"
                    class="btn btn--ghost"
                    data-action="reset-botiquines-filters"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section class="card botiquines-sidebar__panel">
            <div class="card__body">
              <div class="botiquines-sidebar__heading botiquines-sidebar__heading--split">
                <h3 class="card__title">Accesos rápidos</h3>
                <span class="section-text">${vm.quickAccess.length}</span>
              </div>

              <div class="quick-access-list">
                ${renderQuickAccess(vm.quickAccess, vm.selectedBotiquinId)}
              </div>
            </div>
          </section>
        </aside>

        <div class="botiquines-main">
          <section class="botiquines-results card">
            <div class="card__body botiquines-results__header">
              <div>
                <h3 class="card__title">Listado de botiquines</h3>
                <p class="section-text">
                  ${vm.totalVisible} resultado${vm.totalVisible === 1 ? "" : "s"} visible${vm.totalVisible === 1 ? "" : "s"} de ${vm.allBotiquines.length}.
                </p>
              </div>
            </div>
          </section>

          ${renderBotiquinesList(vm.visibleBotiquines, vm.selectedBotiquinId)}
        </div>
      </section>

      ${renderBotiquinDetailModal(vm.selectedBotiquin)}
    </section>
  `;
}

function renderQuickAccess(items = [], selectedId = "") {
  if (!items.length) {
    return `
      <div class="empty-state empty-state--compact">
        <p class="section-text">No hay accesos rápidos disponibles.</p>
      </div>
    `;
  }

  return items
    .map((item) => {
      const isActive = String(item.id) === String(selectedId);

      return `
        <button
          type="button"
          class="quick-access-item ${isActive ? "is-active" : ""}"
          data-action="select-botiquin"
          data-open-detail="true"
          data-botiquin-id="${escapeHTML(item.id)}"
        >
          <span class="quick-access-item__title">${escapeHTML(item.titulo)}</span>
          <span class="quick-access-item__subtitle">${escapeHTML(item.subtitulo || "Sin categoría")}</span>
        </button>
      `;
    })
    .join("");
}

function renderBotiquinesList(items = [], selectedId = "") {
  if (!items.length) {
    return `
      <article class="card card--empty">
        <div class="card__body">
          <h3 class="card__title">No hay botiquines para mostrar</h3>
          <p class="section-text">
            No se encontraron resultados con los filtros actuales. Maravilloso ritual administrativo: filtrar todo y luego preguntarse dónde quedó la información.
          </p>
        </div>
      </article>
    `;
  }

  return `
    <section class="cards-grid cards-grid--botiquines">
      ${items.map((item) => renderBotiquinCard(item, selectedId)).join("")}
    </section>
  `;
}

function renderBotiquinCard(item, selectedId = "") {
  const isActive = String(item.id) === String(selectedId);
  const lastInspectionText = item.fechaUltimaInspeccion
    ? escapeHTML(formatDate(item.fechaUltimaInspeccion))
    : "Sin registro";

  return `
    <article
      class="card botiquin-card ${isActive ? "is-active" : ""}"
      data-botiquin-id="${escapeHTML(item.id)}"
    >
      <div class="card__body">
        <div class="botiquin-card__top">
          <div class="botiquin-card__title-wrap">
            <span class="badge ${getEstadoBadgeClass(item.estado)}">${escapeHTML(item.estado || "Sin estado")}</span>
            <h3 class="card__title">${escapeHTML(item.nombre)}</h3>
            <p class="botiquin-card__subtitle">${escapeHTML(item.ubicacion || item.sede || "Ubicación no registrada")}</p>
          </div>

          <button
            type="button"
            class="icon-btn botiquin-card__icon-btn"
            data-action="select-botiquin"
            data-open-detail="true"
            data-botiquin-id="${escapeHTML(item.id)}"
            aria-label="Ver detalle de ${escapeHTML(item.nombre)}"
            title="Ver detalle"
          >
            →
          </button>
        </div>

        <dl class="data-list data-list--botiquin">
          <div>
            <dt>Sede</dt>
            <dd>${escapeHTML(item.sede || "No registrada")}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>${escapeHTML(item.tipo || "No definido")}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>${escapeHTML(item.responsable || "No asignado")}</dd>
          </div>
          <div>
            <dt>Última inspección</dt>
            <dd>${lastInspectionText}</dd>
          </div>
        </dl>

        <div class="botiquin-card__footer">
          <button
            type="button"
            class="btn btn--ghost"
            data-action="select-botiquin"
            data-open-detail="true"
            data-botiquin-id="${escapeHTML(item.id)}"
          >
            Ver detalle
          </button>

          <button
            type="button"
            class="btn btn--secondary"
            data-action="go-inventario"
            data-botiquin-id="${escapeHTML(item.id)}"
          >
            Ver inventario
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderBotiquinDetailModal(item) {
  const isOpen = Boolean(moduleState.isDetailModalOpen && item);

  return `
    <div
      class="detail-modal ${isOpen ? "is-open" : ""}"
      data-role="botiquin-detail-modal"
      aria-hidden="${isOpen ? "false" : "true"}"
    >
      <div class="detail-modal__backdrop" data-action="close-botiquin-detail"></div>

      <div
        class="detail-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="botiquinDetailTitle"
      >
        ${
          item
            ? renderBotiquinDetailContent(item)
            : `
              <div class="detail-modal__panel">
                <div class="detail-modal__header">
                  <div>
                    <p class="detail-modal__eyebrow">Detalle del botiquín</p>
                    <h3 id="botiquinDetailTitle" class="detail-modal__title">Sin selección</h3>
                  </div>

                  <button
                    type="button"
                    class="detail-modal__close"
                    data-action="close-botiquin-detail"
                    aria-label="Cerrar detalle"
                  >
                    ×
                  </button>
                </div>

                <div class="detail-modal__body">
                  <p class="section-text">Selecciona un botiquín para ver su información detallada.</p>
                </div>
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderBotiquinDetailContent(item) {
  const ultimaInspeccion = item.fechaUltimaInspeccion
    ? escapeHTML(formatDate(item.fechaUltimaInspeccion))
    : "Sin registro";

  const fechaActualizacion = item.updatedAt
    ? escapeHTML(formatDate(item.updatedAt))
    : "Sin registro";

  return `
    <article class="detail-modal__panel botiquin-detail-card">
      <header class="detail-modal__header">
        <div class="detail-modal__title-wrap">
          <p class="detail-modal__eyebrow">Detalle del botiquín</p>
          <h3 id="botiquinDetailTitle" class="detail-modal__title">${escapeHTML(item.nombre)}</h3>
          <div class="detail-modal__meta">
            <span class="badge ${getEstadoBadgeClass(item.estado)}">${escapeHTML(item.estado || "Sin estado")}</span>
            <span class="detail-chip">ID: ${escapeHTML(item.id)}</span>
          </div>
        </div>

        <button
          type="button"
          class="detail-modal__close"
          data-action="close-botiquin-detail"
          aria-label="Cerrar detalle"
        >
          ×
        </button>
      </header>

      <div class="detail-modal__body">
        <section class="detail-summary-grid">
          <article class="detail-summary-card">
            <span class="detail-summary-card__label">Sede</span>
            <strong class="detail-summary-card__value">${escapeHTML(item.sede || "No registrada")}</strong>
          </article>

          <article class="detail-summary-card">
            <span class="detail-summary-card__label">Ubicación</span>
            <strong class="detail-summary-card__value">${escapeHTML(item.ubicacion || "No registrada")}</strong>
          </article>

          <article class="detail-summary-card">
            <span class="detail-summary-card__label">Tipo</span>
            <strong class="detail-summary-card__value">${escapeHTML(item.tipo || "No definido")}</strong>
          </article>

          <article class="detail-summary-card">
            <span class="detail-summary-card__label">Responsable</span>
            <strong class="detail-summary-card__value">${escapeHTML(item.responsable || "No asignado")}</strong>
          </article>
        </section>

        <section class="detail-block">
          <h4 class="detail-block__title">Información general</h4>

          <dl class="data-list data-list--stack">
            <div>
              <dt>Última inspección</dt>
              <dd>${ultimaInspeccion}</dd>
            </div>
            <div>
              <dt>Última actualización</dt>
              <dd>${fechaActualizacion}</dd>
            </div>
            <div>
              <dt>Descripción</dt>
              <dd>${escapeHTML(item.descripcion || "Sin descripción registrada")}</dd>
            </div>
            <div>
              <dt>Observaciones</dt>
              <dd>${escapeHTML(item.observaciones || "Sin observaciones registradas")}</dd>
            </div>
          </dl>
        </section>
      </div>

      <footer class="detail-modal__footer">
        <button
          type="button"
          class="btn btn--ghost"
          data-action="go-inspecciones"
          data-botiquin-id="${escapeHTML(item.id)}"
        >
          Ver inspecciones
        </button>

        <button
          type="button"
          class="btn btn--secondary"
          data-action="go-inventario"
          data-botiquin-id="${escapeHTML(item.id)}"
        >
          Ir a inventario
        </button>
      </footer>
    </article>
  `;
}

function hydrateBotiquinesUI(container, vm) {
  const cards = qsa(".botiquin-card[data-botiquin-id]", container);
  cards.forEach((card) => {
    const id = card.dataset.botiquinId;
    const isCurrent = String(id) === String(vm.selectedBotiquinId);

    if (isCurrent) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
  });
}

/* ======================================
   EVENTOS
====================================== */

function bindBotiquinesEvents() {
  document.addEventListener("input", handleBotiquinesInput, true);
  document.addEventListener("click", handleBotiquinesClick, true);
  document.addEventListener("keydown", handleBotiquinesKeydown, true);
}

const debouncedSearch = debounce((value) => {
  actions.setFilters({ search: value || "" });
}, SEARCH_DEBOUNCE_MS);

const debouncedSede = debounce((value) => {
  actions.setFilters({ sede: value || "" });
}, SEARCH_DEBOUNCE_MS);

const debouncedTipo = debounce((value) => {
  actions.setFilters({ tipo: value || "" });
}, SEARCH_DEBOUNCE_MS);

function handleBotiquinesInput(event) {
  if (!moduleState.container) return;
  if (!moduleState.container.contains(event.target)) return;

  const target = event.target;

  if (target.matches("#botiquinesSearch")) {
    debouncedSearch(target.value);
    return;
  }

  if (target.matches("#botiquinesSede")) {
    debouncedSede(target.value);
    return;
  }

  if (target.matches("#botiquinesTipo")) {
    debouncedTipo(target.value);
  }
}

async function handleBotiquinesClick(event) {
  if (!moduleState.container) return;

  const trigger = event.target.closest("[data-action], [data-botiquin-id]");
  if (!trigger) return;

  const clickedInsideModule =
    moduleState.container.contains(trigger) ||
    trigger.closest("[data-role='botiquin-detail-modal']");

  if (!clickedInsideModule) return;

  const action = trigger.dataset.action;
  const clickedCardId =
    trigger.dataset.botiquinId ||
    trigger.closest("[data-botiquin-id]")?.dataset.botiquinId ||
    "";

  if (!action && clickedCardId) {
    selectBotiquin(clickedCardId);
    return;
  }

  switch (action) {
    case "refresh-botiquines":
      await syncBotiquinesModuleData({ force: true });
      renderBotiquinesView();
      break;

    case "reset-botiquines-filters":
      actions.setFilters({
        search: "",
        sede: "",
        tipo: ""
      });
      break;

    case "select-botiquin":
      if (clickedCardId) {
        selectBotiquin(clickedCardId);

        if (trigger.dataset.openDetail === "true") {
          openBotiquinDetail(clickedCardId);
        }
      }
      break;

    case "close-botiquin-detail":
      closeBotiquinDetail();
      break;

    case "go-inventario":
      if (clickedCardId) {
        selectBotiquin(clickedCardId);
        closeDetailModalUI({ preserveSelection: true });
        navigateTo("inventario");
      }
      break;

    case "go-inspecciones":
      if (clickedCardId) {
        selectBotiquin(clickedCardId);
        closeDetailModalUI({ preserveSelection: true });
        navigateTo("inspecciones");
      }
      break;

    default:
      break;
  }
}

function handleBotiquinesKeydown(event) {
  if (!moduleState.isDetailModalOpen) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeBotiquinDetail();
  }
}

function selectBotiquin(botiquinId) {
  moduleState.selectedId = botiquinId;

  if (typeof actions.setSelectedBotiquin === "function") {
    actions.setSelectedBotiquin(botiquinId);
    return;
  }

  if (typeof actions.setSelectedBotiquinId === "function") {
    actions.setSelectedBotiquinId(botiquinId);
  }
}

function openBotiquinDetail(botiquinId) {
  if (!botiquinId) return;

  selectBotiquin(botiquinId);
  moduleState.isDetailModalOpen = true;
  renderBotiquinesView();
}

function closeBotiquinDetail() {
  moduleState.isDetailModalOpen = false;
  closeDetailModalUI({ preserveSelection: true });
}

/* ======================================
   HELPERS DE UI
====================================== */

function openDetailModalUI() {
  const modal = getDetailModalElement();
  if (!modal) return;

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add(BODY_MODAL_CLASS);

  const closeButton = qs("[data-action='close-botiquin-detail']", modal);
  if (closeButton instanceof HTMLElement) {
    requestAnimationFrame(() => closeButton.focus());
  }
}

function closeDetailModalUI(options = {}) {
  const { preserveSelection = true } = options;

  const modal = getDetailModalElement();
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove(BODY_MODAL_CLASS);

  if (!preserveSelection) {
    moduleState.selectedId = null;
  }
}

function getDetailModalElement() {
  if (!moduleState.container) return null;
  return qs("[data-role='botiquin-detail-modal']", moduleState.container);
}

function getEstadoBadgeClass(estado = "") {
  const normalized = normalizeText(estado);

  if (["operativo", "activo", "ok"].includes(normalized)) return "badge--success";
  if (["pendiente"].includes(normalized)) return "badge--warning";
  if (["revision", "en revision"].includes(normalized)) return "badge--alert";
  if (["critico", "inactivo"].includes(normalized)) return "badge--danger";

  return "badge--muted";
}
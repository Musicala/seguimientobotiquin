import { getPedidoBaseData } from "../api.js";
import { actions, select, selectors, store } from "../state.js";
import {
  buildPedidoConsolidado,
  buildPedidoSummary,
  buildPedidoPrintableText,
  buildPedidoHtmlRows,
  debounce,
  escapeHTML,
  formatDateTime,
  formatNumber,
  normalizeText,
  qs,
  qsa,
  safeString,
  setHTML,
  setText
} from "../utils.js";

/* ======================================
   CONFIG / ESTADO LOCAL
====================================== */

const VIEW_ROOT_SELECTOR = '[data-view="pedido"]';

let unsubscribeStore = null;
let rootRef = null;
let currentContainerRef = null;
let currentRouteToken = 0;

/* ======================================
   TEMPLATE
====================================== */

function getPedidoTemplate() {
  return `
    <section class="pedido-view" data-view="pedido">
      <div class="page-section">
        <div class="section-card">
          <div class="section-card__header pedido-header">
            <div>
              <p class="section-eyebrow">Pedido consolidado</p>
              <h2 class="section-title">Solicitud de cotización</h2>
              <p class="section-subtitle">
                Consolidado automático de faltantes y vencidos para enviar al proveedor.
              </p>
            </div>

            <div class="pedido-header__actions">
              <button
                type="button"
                class="btn btn--ghost"
                data-action="refresh-pedido"
              >
                Actualizar
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                data-action="copy-pedido"
              >
                Copiar
              </button>
              <button
                type="button"
                class="btn btn--primary"
                data-action="print-pedido"
              >
                Imprimir
              </button>
            </div>
          </div>

          <div class="pedido-kpis">
            <article class="pedido-kpi">
              <span class="pedido-kpi__label">Productos</span>
              <strong class="pedido-kpi__value" data-role="pedido-total-productos">0</strong>
            </article>
            <article class="pedido-kpi">
              <span class="pedido-kpi__label">Unidades</span>
              <strong class="pedido-kpi__value" data-role="pedido-total-unidades">0</strong>
            </article>
            <article class="pedido-kpi">
              <span class="pedido-kpi__label">Botiquines afectados</span>
              <strong class="pedido-kpi__value" data-role="pedido-total-botiquines">0</strong>
            </article>
            <article class="pedido-kpi pedido-kpi--meta">
              <span class="pedido-kpi__label">Última actualización</span>
              <strong class="pedido-kpi__value pedido-kpi__value--small" data-role="pedido-generated-at">
                Aún no calculado
              </strong>
            </article>
          </div>
        </div>

        <div class="section-card">
          <div class="pedido-toolbar">
            <div class="field-group pedido-toolbar__search">
              <label class="field-label" for="pedidoSearch">Buscar</label>
              <input
                id="pedidoSearch"
                type="search"
                class="input"
                data-role="pedido-search"
                placeholder="Nombre, ID, categoría, unidad..."
                autocomplete="off"
              />
            </div>

            <div class="field-group pedido-toolbar__filter">
              <label class="field-label" for="pedidoCategoria">Categoría</label>
              <select
                id="pedidoCategoria"
                class="select"
                data-role="pedido-categoria"
              >
                <option value="">Todas las categorías</option>
              </select>
            </div>
          </div>
        </div>

        <div class="section-card">
          <div class="section-card__header">
            <div>
              <h3 class="section-title section-title--sm">Detalle del pedido</h3>
              <p class="section-subtitle">
                Consolidado por <strong>id_elemento</strong> y detalle por botiquín.
              </p>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table pedido-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ID elemento</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Faltante total</th>
                  <th>Detalle por botiquín</th>
                </tr>
              </thead>
              <tbody data-role="pedido-table-body">
                <tr>
                  <td colspan="6">
                    <div class="pedido-empty-inline">Cargando pedido...</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="empty-state empty-state--embedded is-hidden" data-role="pedido-empty">
            <div class="empty-state__icon">🧾</div>
            <div class="empty-state__content">
              <h3 class="empty-state__title">No hay elementos para pedir</h3>
              <p class="empty-state__text">
                Ajusta los filtros o actualiza los datos para recalcular el consolidado.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section class="pedido-print-sheet" aria-hidden="true">
        <header class="pedido-print-sheet__header">
          <h1>Solicitud de cotización</h1>
          <p>Pedido consolidado de elementos faltantes</p>
          <p data-role="pedido-generated-at">Aún no calculado</p>
        </header>

        <div class="pedido-print-sheet__notes" data-role="pedido-notes">
          Consolidado automático de faltantes por id_elemento.
        </div>

        <table class="pedido-print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ID elemento</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Faltante total</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody data-role="pedido-print-table-body"></tbody>
        </table>
      </section>
    </section>
  `;
}

/* ======================================
   HELPERS DOM
====================================== */

function getRoot() {
  if (rootRef && document.body.contains(rootRef)) return rootRef;
  rootRef = document.querySelector(VIEW_ROOT_SELECTOR);
  return rootRef;
}

function resolveQuery(selector, scope) {
  if (!scope) return null;
  if (typeof qs === "function") return qs(selector, scope);
  return scope.querySelector(selector);
}

function resolveQueryAll(selector, scope) {
  if (!scope) return [];
  if (typeof qsa === "function") return qsa(selector, scope);
  return Array.from(scope.querySelectorAll(selector));
}

function getEls(root = getRoot()) {
  if (!root) return {};

  const generatedAtCandidates = resolveQueryAll("[data-role='pedido-generated-at']", root);

  return {
    root,
    summaryProductos: resolveQuery("[data-role='pedido-total-productos']", root),
    summaryUnidades: resolveQuery("[data-role='pedido-total-unidades']", root),
    summaryBotiquines: resolveQuery("[data-role='pedido-total-botiquines']", root),
    generatedAtList: generatedAtCandidates,

    searchInput: resolveQuery("[data-role='pedido-search']", root),
    categoryFilter: resolveQuery("[data-role='pedido-categoria']", root),

    printButton: resolveQuery("[data-action='print-pedido']", root),
    refreshButton: resolveQuery("[data-action='refresh-pedido']", root),
    copyButton: resolveQuery("[data-action='copy-pedido']", root),

    tableBody: resolveQuery("[data-role='pedido-table-body']", root),
    emptyState: resolveQuery("[data-role='pedido-empty']", root),
    printableNotes: resolveQuery("[data-role='pedido-notes']", root),
    printableTable: resolveQuery("[data-role='pedido-print-table-body']", root),

    detailBlocks: resolveQueryAll("[data-role='pedido-detalle']", root)
  };
}

function ensurePedidoView(container) {
  const targetContainer =
    container instanceof HTMLElement
      ? container
      : currentContainerRef instanceof HTMLElement
        ? currentContainerRef
        : null;

  if (!targetContainer) {
    rootRef = getRoot();
    return rootRef;
  }

  currentContainerRef = targetContainer;

  const existingRoot = targetContainer.querySelector(VIEW_ROOT_SELECTOR);
  if (existingRoot) {
    rootRef = existingRoot;
    return rootRef;
  }

  targetContainer.innerHTML = getPedidoTemplate();
  rootRef = targetContainer.querySelector(VIEW_ROOT_SELECTOR);
  return rootRef;
}

/* ======================================
   DATA / CÁLCULO
====================================== */

async function loadPedidoData() {
  if (typeof actions?.setLoading === "function") {
    actions.setLoading(true, "Calculando pedido sugerido...");
  }

  try {
    const { inventario, catalogo, botiquines } = await getPedidoBaseData();

    if (typeof actions?.setInventario === "function") {
      actions.setInventario(Array.isArray(inventario) ? inventario : []);
    }

    if (typeof actions?.setCatalogo === "function") {
      actions.setCatalogo(Array.isArray(catalogo) ? catalogo : []);
    }

    if (typeof actions?.setBotiquines === "function") {
      actions.setBotiquines(Array.isArray(botiquines) ? botiquines : []);
    }

    recalculatePedido();

    if (typeof actions?.clearLastError === "function") {
      actions.clearLastError();
    }
  } catch (error) {
    console.error("[pedido] Error cargando datos base:", error);

    if (typeof actions?.setLastError === "function") {
      actions.setLastError(error);
    }

    addToast({
      type: "danger",
      title: "No se pudo cargar el pedido",
      message: error?.message || "Ocurrió un error al consolidar los faltantes."
    });

    throw error;
  } finally {
    if (typeof actions?.setLoading === "function") {
      actions.setLoading(false, null);
    }
  }
}

function recalculatePedido() {
  const state = store.getState();
  const inventario = selectors?.inventario ? selectors.inventario(state) : [];
  const catalogo = selectors?.catalogo ? selectors.catalogo(state) : [];
  const botiquines = selectors?.botiquines ? selectors.botiquines(state) : [];

  const pedidoItems = buildPedidoConsolidado(
    Array.isArray(inventario) ? inventario : [],
    Array.isArray(catalogo) ? catalogo : [],
    Array.isArray(botiquines) ? botiquines : [],
    {
      includeInactiveCatalog: false,
      includeZeroMissing: false,
      sortDirection: "asc"
    }
  );

  const summary = buildPedidoSummary(pedidoItems);

  if (typeof actions?.setPedidoItems === "function") {
    actions.setPedidoItems(pedidoItems, summary);
  }
}

/* ======================================
   FILTROS
====================================== */

function getFilters() {
  return select(selectors.filters) || {};
}

function getFilteredPedidoItems() {
  const state = store.getState();
  const allItems = selectors?.pedidoItems ? selectors.pedidoItems(state) || [] : [];
  const filters = selectors?.filters ? selectors.filters(state) || {} : {};

  const search = normalizeText(filters.search || "");
  const categoria = normalizeText(filters.categoria || "");

  return allItems.filter((item) => {
    const matchSearch =
      !search ||
      normalizeText(
        [
          item?.id_elemento,
          item?.id_item,
          item?.nombre_elemento,
          item?.categoria,
          item?.unidad,
          item?.detalle_texto
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(search);

    const matchCategoria =
      !categoria || normalizeText(item?.categoria || "") === categoria;

    return matchSearch && matchCategoria;
  });
}

function syncFilterControls() {
  const root = getRoot();
  const els = getEls(root);
  const filters = getFilters();

  if (els.searchInput && els.searchInput.value !== (filters.search || "")) {
    els.searchInput.value = filters.search || "";
  }

  if (els.categoryFilter && els.categoryFilter.value !== (filters.categoria || "")) {
    els.categoryFilter.value = filters.categoria || "";
  }
}

function bindFilters() {
  const root = getRoot();
  const els = getEls(root);
  if (!root) return;

  if (els.searchInput && !els.searchInput.dataset.boundPedidoSearch) {
    const onSearch = debounce((event) => {
      if (typeof actions?.setFilters === "function") {
        actions.setFilters({
          search: event.target.value || ""
        });
      }
      renderPedido();
    }, 180);

    els.searchInput.addEventListener("input", onSearch);
    els.searchInput.dataset.boundPedidoSearch = "true";
  }

  if (els.categoryFilter && !els.categoryFilter.dataset.boundPedidoCategoria) {
    els.categoryFilter.addEventListener("change", (event) => {
      if (typeof actions?.setFilters === "function") {
        actions.setFilters({
          categoria: event.target.value || ""
        });
      }
      renderPedido();
    });

    els.categoryFilter.dataset.boundPedidoCategoria = "true";
  }
}

/* ======================================
   RENDER
====================================== */

function setGeneratedAtText(els, text) {
  if (!Array.isArray(els.generatedAtList)) return;
  els.generatedAtList.forEach((node) => setText(node, text, "Aún no calculado"));
}

function renderSummary(items) {
  const root = getRoot();
  const els = getEls(root);
  const summary = buildPedidoSummary(items);
  const lastCalculatedAt = select(selectors.pedidoLastCalculatedAt);

  setText(els.summaryProductos, formatNumber(summary.totalProductos), "0");
  setText(els.summaryUnidades, formatNumber(summary.totalUnidades), "0");
  setText(
    els.summaryBotiquines,
    formatNumber(summary.totalBotiquinesAfectados),
    "0"
  );

  setGeneratedAtText(
    els,
    lastCalculatedAt
      ? `Actualizado ${formatDateTime(lastCalculatedAt)}`
      : "Aún no calculado"
  );
}

function renderPedidoTable(items) {
  const root = getRoot();
  const els = getEls(root);

  if (!els.tableBody) return;

  if (!items.length) {
    setHTML(
      els.tableBody,
      `
        <tr>
          <td colspan="6">
            <div class="pedido-empty-inline">
              No hay elementos faltantes para incluir en el pedido.
            </div>
          </td>
        </tr>
      `
    );
    return;
  }

  const rows = items
    .map((item, index) => {
      const detalleHtml = (item.detalle || [])
        .map(
          (detail) => `
            <div class="pedido-detalle-item">
              <span class="pedido-detalle-botiquin">${escapeHTML(
                detail.nombre_botiquin || "Sin botiquín"
              )}</span>
              <span class="pedido-detalle-cantidad">${formatNumber(
                detail.faltante
              )} ${escapeHTML(item.unidad || "")}</span>
            </div>
          `
        )
        .join("");

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHTML(item.id_elemento || item.id_item || "")}</td>
          <td>${escapeHTML(item.nombre_elemento || item.nombre || "")}</td>
          <td>${escapeHTML(item.categoria || "No definida")}</td>
          <td>${formatNumber(item.cantidad_total_faltante || 0)}</td>
          <td>
            <div class="pedido-detalle-wrap" data-role="pedido-detalle">
              ${detalleHtml || '<span class="pedido-detalle-empty">Sin detalle</span>'}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  setHTML(els.tableBody, rows);
}

function renderPrintVersion(items) {
  const root = getRoot();
  const els = getEls(root);
  const printMeta = select(selectors.pedidoPrintMeta) || {};

  if (els.printableNotes) {
    setText(
      els.printableNotes,
      printMeta.notes || "Consolidado automático de faltantes por id_elemento."
    );
  }

  if (els.printableTable) {
    setHTML(els.printableTable, buildPedidoHtmlRows(items));
  }
}

function populateCategoryFilter(items) {
  const root = getRoot();
  const els = getEls(root);
  if (!els.categoryFilter) return;

  const currentValue = els.categoryFilter.value || "";
  const categorias = [...new Set(items.map((item) => item?.categoria).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "es", { sensitivity: "base" }));

  const options = [
    `<option value="">Todas las categorías</option>`,
    ...categorias.map(
      (categoria) =>
        `<option value="${escapeHTML(categoria)}">${escapeHTML(categoria)}</option>`
    )
  ].join("");

  setHTML(els.categoryFilter, options);

  if (categorias.includes(currentValue)) {
    els.categoryFilter.value = currentValue;
  }
}

function toggleEmptyState(items) {
  const root = getRoot();
  const els = getEls(root);

  if (!els.emptyState) return;

  els.emptyState.classList.toggle("is-hidden", items.length > 0);
}

export function renderPedido() {
  const root = getRoot();
  if (!root) return;

  const filteredItems = getFilteredPedidoItems();
  const allItems = select(selectors.pedidoItems) || [];

  renderSummary(filteredItems);
  renderPedidoTable(filteredItems);
  renderPrintVersion(filteredItems);
  populateCategoryFilter(allItems);
  syncFilterControls();
  toggleEmptyState(filteredItems);
}

/* ======================================
   IMPRESIÓN / COPIAR
====================================== */

function addToast(payload) {
  if (typeof actions?.addToast === "function") {
    actions.addToast(payload);
    return;
  }

  const fallbackMessage =
    payload?.message ||
    payload?.title ||
    "Operación realizada.";

  if (payload?.type === "danger") {
    console.error("[pedido]", fallbackMessage);
  } else {
    console.log("[pedido]", fallbackMessage);
  }
}

function handlePrintPedido() {
  const state = store.getState();
  const printMeta = selectors?.pedidoPrintMeta ? selectors.pedidoPrintMeta(state) || {} : {};
  const items = getFilteredPedidoItems();

  if (!items.length) {
    addToast({
      type: "warning",
      title: "Nada para imprimir",
      message: "No hay elementos en el pedido sugerido."
    });
    return;
  }

  const originalTitle = document.title;
  const pageTitle = safeString(printMeta.title, "Solicitud de cotización");

  try {
    document.title = pageTitle;
    window.print();
  } finally {
    setTimeout(() => {
      document.title = originalTitle;
    }, 250);
  }
}

async function handleCopyPedido() {
  const state = store.getState();
  const items = getFilteredPedidoItems();
  const printMeta = selectors?.pedidoPrintMeta ? selectors.pedidoPrintMeta(state) || {} : {};

  if (!items.length) {
    addToast({
      type: "warning",
      title: "Nada para copiar",
      message: "No hay elementos faltantes en el pedido."
    });
    return;
  }

  const text = buildPedidoPrintableText(items, {
    title: printMeta.title || "Solicitud de cotización",
    subtitle: printMeta.subtitle || "Pedido consolidado de elementos faltantes",
    includeDetalle: true,
    includeDate: true,
    dateValue: new Date(),
    notes:
      printMeta.notes || "Consolidado automático de faltantes por botiquín."
  });

  try {
    await navigator.clipboard.writeText(text);

    addToast({
      type: "success",
      title: "Pedido copiado",
      message: "El texto del pedido quedó listo para pegar y enviar al proveedor."
    });
  } catch (error) {
    console.error("[pedido] No se pudo copiar al portapapeles:", error);
    addToast({
      type: "danger",
      title: "No se pudo copiar",
      message: "El navegador no permitió copiar el pedido."
    });
  }
}

/* ======================================
   EVENTOS
====================================== */

function bindActions() {
  const root = getRoot();
  const els = getEls(root);
  if (!root) return;

  if (els.refreshButton && !els.refreshButton.dataset.boundPedidoRefresh) {
    els.refreshButton.addEventListener("click", async () => {
      try {
        await loadPedidoData();
        renderPedido();
      } catch {
        // el toast ya se maneja arriba
      }
    });

    els.refreshButton.dataset.boundPedidoRefresh = "true";
  }

  if (els.printButton && !els.printButton.dataset.boundPedidoPrint) {
    els.printButton.addEventListener("click", handlePrintPedido);
    els.printButton.dataset.boundPedidoPrint = "true";
  }

  if (els.copyButton && !els.copyButton.dataset.boundPedidoCopy) {
    els.copyButton.addEventListener("click", handleCopyPedido);
    els.copyButton.dataset.boundPedidoCopy = "true";
  }

  bindFilters();
}

function bindStoreSubscription() {
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }

  unsubscribeStore = store.subscribe((event) => {
    const type = event?.type || "";

    if (
      type.startsWith("data:setPedido") ||
      type.startsWith("data:clearPedido") ||
      type.startsWith("filters:") ||
      type.startsWith("data:setInventario") ||
      type.startsWith("data:setCatalogo") ||
      type.startsWith("data:setBotiquines")
    ) {
      renderPedido();
    }
  });
}

/* ======================================
   INIT / DESTROY
====================================== */

export async function initPedidoView(options = {}) {
  const container =
    options?.container instanceof HTMLElement
      ? options.container
      : currentContainerRef;

  ensurePedidoView(container);

  rootRef = getRoot();

  if (!rootRef) {
    console.warn("[pedido] No se encontró la vista pedido.");
    return null;
  }

  bindActions();
  bindStoreSubscription();

  const pedidoActual = select(selectors.pedidoItems) || [];

  if (!pedidoActual.length || options?.forceRender) {
    try {
      await loadPedidoData();
    } catch {
      // error ya manejado
    }
  }

  renderPedido();

  const tokenAtInit = ++currentRouteToken;

  return () => {
    if (tokenAtInit === currentRouteToken) {
      destroyPedidoView();
    }
  };
}

export async function initPedidoModule(options = {}) {
  return initPedidoView(options);
}

export function destroyPedidoView() {
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }

  rootRef = null;
  currentContainerRef = null;
}

export function destroyPedidoModule() {
  destroyPedidoView();
}

/* ======================================
   API DEL MÓDULO
====================================== */

const pedidoModule = {
  init: initPedidoView,
  destroy: destroyPedidoView,
  render: renderPedido,
  refresh: async () => {
    await loadPedidoData();
    renderPedido();
  },
  recalculate: () => {
    recalculatePedido();
    renderPedido();
  }
};

export default pedidoModule;
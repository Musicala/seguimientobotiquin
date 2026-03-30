// ========================================
// ui/render.js
// Helpers de renderizado y montaje UI
// - Sin lógica de negocio
// - Sin fetch
// - Sin state interno de dominio
// - Pensado para módulos dashboard vanilla
// - Reutilizable para cards, KPIs, tablas, badges,
//   estados vacíos, listas y bloques de detalle
// ========================================

import {
  qs,
  qsa,
  escapeHTML,
  safeString,
  safeTrimmedString,
  text,
  classNames,
  ensureArray,
  isPlainObject,
  isFunction,
  formatDate,
  formatDateTime,
  formatNumber,
  formatCurrency,
  formatPercent,
  formatExpiryText,
  getExpiryBadgeClass,
  resolveVisualState,
  resolveEmptyState,
  truncate
} from "../utils.js";

import {
  getLabel,
  getEmptyValueLabel,
  getViewTitle
} from "../config.js";

/* ========================================
   HELPERS INTERNOS
======================================== */

function resolveElement(target) {
  if (!target) return null;

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  if (target instanceof Element) {
    return target;
  }

  return null;
}

function ensureTarget(target, context = "render") {
  const element = resolveElement(target);

  if (!element) {
    console.warn(`[ui/render] No se encontró el contenedor para "${context}".`, target);
    return null;
  }

  return element;
}

function safeHTML(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeText(value, fallback = "") {
  return text(value, fallback);
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function renderAttrs(attrs = {}) {
  if (!isPlainObject(attrs)) return "";

  return Object.entries(attrs)
    .filter(([key, value]) => key && value !== null && value !== undefined && value !== false)
    .map(([key, value]) => {
      if (value === true) return escapeHTML(key);
      return `${escapeHTML(key)}="${escapeHTML(String(value))}"`;
    })
    .join(" ");
}

function normalizeAlign(value = "start") {
  const normalized = safeTrimmedString(value, "start").toLowerCase();
  if (["start", "center", "end", "between"].includes(normalized)) return normalized;
  return "start";
}

function resolveToneBadgeClass(tone = "") {
  const normalized = safeTrimmedString(tone).toLowerCase();

  if (["success", "ok", "positive"].includes(normalized)) return "badge badge--success";
  if (["warning", "warn"].includes(normalized)) return "badge badge--warning";
  if (["danger", "error", "critical"].includes(normalized)) return "badge badge--danger";
  if (["alert"].includes(normalized)) return "badge badge--alert";
  if (["info"].includes(normalized)) return "badge badge--info";

  return "badge badge--muted";
}

function inferValueFormat(value, format = "") {
  const normalized = safeTrimmedString(format).toLowerCase();

  if (normalized === "date") return formatDate(value);
  if (normalized === "datetime") return formatDateTime(value);
  if (normalized === "currency") return formatCurrency(value);
  if (normalized === "percent") return formatPercent(value);
  if (normalized === "number") return formatNumber(value);

  return hasValue(value) ? String(value) : getEmptyValueLabel?.() || "—";
}

function createEmptyStateHTML(options = {}) {
  const state = resolveEmptyState(options.key || "generic", options);

  const actionHTML =
    state.actionLabel && state.actionId
      ? `
        <div class="empty-state__actions">
          <button
            type="button"
            class="btn btn--${escapeHTML(state.actionVariant || "primary")}"
            data-action="${escapeHTML(state.actionId)}"
          >
            ${escapeHTML(state.actionLabel)}
          </button>
        </div>
      `
      : "";

  return `
    <section class="${escapeHTML(classNames("empty-state", options.className))}">
      <div class="empty-state__icon" aria-hidden="true">${escapeHTML(state.icon || "📭")}</div>
      <div class="empty-state__content">
        <h3 class="empty-state__title">${escapeHTML(state.title || "Sin información")}</h3>
        ${
          state.description
            ? `<p class="empty-state__description">${escapeHTML(state.description)}</p>`
            : ""
        }
        ${actionHTML}
      </div>
    </section>
  `;
}

/* ========================================
   RENDER BASE
======================================== */

export function renderHTML(target, html = "") {
  const element = ensureTarget(target, "renderHTML");
  if (!element) return null;

  element.innerHTML = safeHTML(html);
  return element;
}

export function setHTML(target, html = "") {
  return renderHTML(target, html);
}

export function insertHTML(target, html = "", position = "beforeend") {
  const element = ensureTarget(target, "insertHTML");
  if (!element) return null;

  element.insertAdjacentHTML(position, safeHTML(html));
  return element;
}

export function clearHTML(target) {
  const element = ensureTarget(target, "clearHTML");
  if (!element) return null;

  element.innerHTML = "";
  return element;
}

export function replaceInner(target, selector, html = "") {
  const element = ensureTarget(target, "replaceInner");
  if (!element) return null;

  const inner = element.querySelector(selector);
  if (!inner) {
    console.warn(`[ui/render] No se encontró el selector interno "${selector}".`);
    return null;
  }

  inner.innerHTML = safeHTML(html);
  return inner;
}

export function replaceElement(target, html = "") {
  const element = ensureTarget(target, "replaceElement");
  if (!element) return null;

  element.outerHTML = safeHTML(html);
  return true;
}

export function renderInto(target, selector, html = "") {
  const element = ensureTarget(target, "renderInto");
  if (!element) return null;

  const child = element.querySelector(selector);
  if (!child) {
    console.warn(`[ui/render] No se encontró "${selector}" dentro del contenedor.`);
    return null;
  }

  child.innerHTML = safeHTML(html);
  return child;
}

export function insertInto(target, selector, html = "", position = "beforeend") {
  const element = ensureTarget(target, "insertInto");
  if (!element) return null;

  const child = element.querySelector(selector);
  if (!child) {
    console.warn(`[ui/render] No se encontró "${selector}" dentro del contenedor.`);
    return null;
  }

  child.insertAdjacentHTML(position, safeHTML(html));
  return child;
}

/* ========================================
   ESTADOS DE RENDER
======================================== */

export function createLoadingState({
  title = "Cargando información",
  description = "Espera un momento mientras traemos los datos.",
  compact = false,
  className = ""
} = {}) {
  return `
    <section class="${escapeHTML(
      classNames("ui-state", "ui-state--loading", compact ? "ui-state--compact" : "", className)
    )}">
      <div class="ui-state__loader" aria-hidden="true">
        <span class="ui-state__spinner"></span>
      </div>
      <div class="ui-state__content">
        <h3 class="ui-state__title">${escapeHTML(title)}</h3>
        <p class="ui-state__description">${escapeHTML(description)}</p>
      </div>
    </section>
  `;
}

export function createErrorState({
  title = "Ocurrió un problema",
  description = "No fue posible mostrar esta información en este momento.",
  actionLabel = "",
  actionAttrs = "",
  compact = false,
  className = ""
} = {}) {
  const actionHTML = actionLabel
    ? `
      <div class="ui-state__actions">
        <button type="button" class="btn btn--primary" ${actionAttrs}>
          ${escapeHTML(actionLabel)}
        </button>
      </div>
    `
    : "";

  return `
    <section class="${escapeHTML(
      classNames("ui-state", "ui-state--error", compact ? "ui-state--compact" : "", className)
    )}">
      <div class="ui-state__icon" aria-hidden="true">⚠️</div>
      <div class="ui-state__content">
        <h3 class="ui-state__title">${escapeHTML(title)}</h3>
        <p class="ui-state__description">${escapeHTML(description)}</p>
        ${actionHTML}
      </div>
    </section>
  `;
}

export function createSuccessState({
  title = "Proceso completado",
  description = "La información se actualizó correctamente.",
  compact = false,
  className = ""
} = {}) {
  return `
    <section class="${escapeHTML(
      classNames("ui-state", "ui-state--success", compact ? "ui-state--compact" : "", className)
    )}">
      <div class="ui-state__icon" aria-hidden="true">✓</div>
      <div class="ui-state__content">
        <h3 class="ui-state__title">${escapeHTML(title)}</h3>
        <p class="ui-state__description">${escapeHTML(description)}</p>
      </div>
    </section>
  `;
}

export function renderLoading(target, options = {}) {
  return renderHTML(target, createLoadingState(options));
}

export function renderError(target, options = {}) {
  return renderHTML(target, createErrorState(options));
}

export function renderSuccess(target, options = {}) {
  return renderHTML(target, createSuccessState(options));
}

export function renderEmpty(target, options = {}) {
  return renderHTML(target, createEmptyStateHTML(options));
}

/* ========================================
   SHELLS / WRAPPERS DE VISTA
======================================== */

export function createViewShell({
  header = "",
  toolbar = "",
  content = "",
  aside = "",
  footer = "",
  className = ""
} = {}) {
  return `
    <section class="${escapeHTML(classNames("view-shell", className))}">
      ${header ? `<div class="view-shell__header">${header}</div>` : ""}
      ${toolbar ? `<div class="view-shell__toolbar">${toolbar}</div>` : ""}
      <div class="view-shell__main">
        <div class="view-shell__content">${content}</div>
        ${aside ? `<aside class="view-shell__aside">${aside}</aside>` : ""}
      </div>
      ${footer ? `<div class="view-shell__footer">${footer}</div>` : ""}
    </section>
  `;
}

export function createSectionBlock({
  title = "",
  subtitle = "",
  content = "",
  actions = "",
  className = ""
} = {}) {
  const hasHeader = title || subtitle || actions;

  return `
    <section class="${escapeHTML(classNames("section-block", className))}">
      ${
        hasHeader
          ? `
            <header class="section-block__header">
              <div class="section-block__copy">
                ${title ? `<h3 class="section-block__title">${escapeHTML(title)}</h3>` : ""}
                ${subtitle ? `<p class="section-block__subtitle">${escapeHTML(subtitle)}</p>` : ""}
              </div>
              ${actions ? `<div class="section-block__actions">${actions}</div>` : ""}
            </header>
          `
          : ""
      }
      <div class="section-block__content">
        ${content}
      </div>
    </section>
  `;
}

export function createViewHeader({
  view = "",
  eyebrow = "",
  title = "",
  description = "",
  actions = "",
  className = ""
} = {}) {
  const resolvedTitle = title || (view ? getViewTitle?.(view, view) : "");

  return `
    <header class="${escapeHTML(classNames("view-header", className))}">
      <div class="view-header__main">
        ${eyebrow ? `<p class="view-eyebrow">${escapeHTML(eyebrow)}</p>` : ""}
        ${resolvedTitle ? `<h1 class="view-title">${escapeHTML(resolvedTitle)}</h1>` : ""}
        ${description ? `<p class="view-description">${escapeHTML(description)}</p>` : ""}
      </div>
      ${actions ? `<div class="view-header__actions">${actions}</div>` : ""}
    </header>
  `;
}

export function createToolbar({
  left = "",
  right = "",
  className = ""
} = {}) {
  return `
    <div class="${escapeHTML(classNames("view-toolbar", className))}">
      <div class="view-toolbar__left">${left}</div>
      <div class="view-toolbar__right">${right}</div>
    </div>
  `;
}

/* ========================================
   KPIS / BADGES / META
======================================== */

export function createBadge({
  label = "",
  tone = "",
  icon = "",
  className = "",
  attrs = {}
} = {}) {
  const badgeClass = resolveToneBadgeClass(tone);

  return `
    <span
      class="${escapeHTML(classNames(badgeClass, className))}"
      ${renderAttrs(attrs)}
    >
      ${icon ? `<span class="badge__icon" aria-hidden="true">${escapeHTML(icon)}</span>` : ""}
      <span class="badge__label">${escapeHTML(label || getLabel?.("sinDatos", "Sin datos"))}</span>
    </span>
  `;
}

export function createVisualBadge({
  type = "",
  value = "",
  fallbackLabel = "",
  className = "",
  attrs = {}
} = {}) {
  const state = resolveVisualState(type, value, fallbackLabel);

  return `
    <span
      class="${escapeHTML(classNames(state.badgeClass, className))}"
      ${renderAttrs(attrs)}
    >
      ${state.icon ? `<span class="badge__icon" aria-hidden="true">${escapeHTML(state.icon)}</span>` : ""}
      <span class="badge__label">${escapeHTML(state.label)}</span>
    </span>
  `;
}

export function createExpiryBadge(dateValue, options = {}) {
  const label = formatExpiryText(dateValue, options);
  const className = getExpiryBadgeClass(dateValue, options);

  return `
    <span class="${escapeHTML(className)}">
      <span class="badge__label">${escapeHTML(label)}</span>
    </span>
  `;
}

export function createKpiCard({
  title = "",
  value = "",
  subtitle = "",
  icon = "",
  tone = "",
  trend = "",
  trendLabel = "",
  className = "",
  attrs = {}
} = {}) {
  return `
    <article
      class="${escapeHTML(classNames("kpi-card", tone ? `kpi-card--${tone}` : "", className))}"
      ${renderAttrs(attrs)}
    >
      <div class="kpi-card__main">
        <div class="kpi-card__copy">
          ${title ? `<p class="kpi-card__title">${escapeHTML(title)}</p>` : ""}
          <p class="kpi-card__value">${escapeHTML(hasValue(value) ? String(value) : "0")}</p>
          ${subtitle ? `<p class="kpi-card__subtitle">${escapeHTML(subtitle)}</p>` : ""}
        </div>
        ${icon ? `<div class="kpi-card__icon" aria-hidden="true">${escapeHTML(icon)}</div>` : ""}
      </div>
      ${
        trend || trendLabel
          ? `
            <div class="kpi-card__footer">
              ${trend ? `<span class="kpi-card__trend">${escapeHTML(trend)}</span>` : ""}
              ${trendLabel ? `<span class="kpi-card__trend-label">${escapeHTML(trendLabel)}</span>` : ""}
            </div>
          `
          : ""
      }
    </article>
  `;
}

export function createKpiGrid(items = [], { className = "" } = {}) {
  const html = ensureArray(items)
    .map((item) => createKpiCard(item))
    .join("");

  return `
    <div class="${escapeHTML(classNames("kpi-grid", className))}">
      ${html}
    </div>
  `;
}

export function createMetaList(items = [], { className = "" } = {}) {
  const safeItems = ensureArray(items).filter((item) => item && (item.label || item.value));

  if (!safeItems.length) {
    return "";
  }

  return `
    <dl class="${escapeHTML(classNames("meta-list", className))}">
      ${safeItems
        .map((item) => {
          const value = inferValueFormat(item.value, item.format);
          return `
            <div class="meta-list__item">
              <dt class="meta-list__label">${escapeHTML(item.label || "")}</dt>
              <dd class="meta-list__value">${escapeHTML(value)}</dd>
            </div>
          `;
        })
        .join("")}
    </dl>
  `;
}

/* ========================================
   TARJETAS / DETALLES
======================================== */

export function createCard({
  title = "",
  subtitle = "",
  content = "",
  actions = "",
  footer = "",
  padded = true,
  clickable = false,
  className = "",
  attrs = {}
} = {}) {
  return `
    <article
      class="${escapeHTML(
        classNames(
          "card",
          padded ? "card--padded" : "",
          clickable ? "card--interactive" : "",
          className
        )
      )}"
      ${renderAttrs(attrs)}
    >
      ${
        title || subtitle || actions
          ? `
            <header class="card__header">
              <div class="card__header-copy">
                ${title ? `<h3 class="card__title">${escapeHTML(title)}</h3>` : ""}
                ${subtitle ? `<p class="card__subtitle">${escapeHTML(subtitle)}</p>` : ""}
              </div>
              ${actions ? `<div class="card__actions">${actions}</div>` : ""}
            </header>
          `
          : ""
      }
      <div class="card__body">${content}</div>
      ${footer ? `<footer class="card__footer">${footer}</footer>` : ""}
    </article>
  `;
}

export function createCardGrid(items = [], { className = "" } = {}) {
  return `
    <div class="${escapeHTML(classNames("card-grid", className))}">
      ${ensureArray(items).join("")}
    </div>
  `;
}

export function createDetailRow({
  label = "",
  value = "",
  html = "",
  format = "",
  className = ""
} = {}) {
  const resolvedValue = html || escapeHTML(inferValueFormat(value, format));

  return `
    <div class="${escapeHTML(classNames("detail-row", className))}">
      <span class="detail-row__label">${escapeHTML(label || "")}</span>
      <span class="detail-row__value">${resolvedValue}</span>
    </div>
  `;
}

export function createDetailList(items = [], { className = "" } = {}) {
  const safeItems = ensureArray(items).filter(Boolean);

  return `
    <div class="${escapeHTML(classNames("detail-list", className))}">
      ${safeItems.map((item) => createDetailRow(item)).join("")}
    </div>
  `;
}

export function createStatPill({
  label = "",
  value = "",
  tone = "",
  className = ""
} = {}) {
  return `
    <div class="${escapeHTML(classNames("stat-pill", tone ? `stat-pill--${tone}` : "", className))}">
      <span class="stat-pill__label">${escapeHTML(label)}</span>
      <span class="stat-pill__value">${escapeHTML(hasValue(value) ? String(value) : "0")}</span>
    </div>
  `;
}

/* ========================================
   LISTAS / COLLECTIONS
======================================== */

export function renderCollection(items = [], itemRenderer, { emptyHTML = "", wrapper = null } = {}) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];

  if (!safeItems.length) {
    return safeHTML(emptyHTML);
  }

  const html = safeItems.map((item, index) => itemRenderer(item, index)).join("");

  if (!wrapper) return html;

  return `
    <div class="${escapeHTML(wrapper)}">
      ${html}
    </div>
  `;
}

export function createList({
  items = [],
  itemRenderer = null,
  empty = null,
  className = ""
} = {}) {
  const safeItems = ensureArray(items);

  if (!safeItems.length) {
    return empty || createEmptyStateHTML({ key: "generic" });
  }

  const html = safeItems
    .map((item, index) => {
      if (isFunction(itemRenderer)) {
        return itemRenderer(item, index);
      }

      return `
        <li class="simple-list__item">
          ${escapeHTML(typeof item === "string" ? item : JSON.stringify(item))}
        </li>
      `;
    })
    .join("");

  return `
    <ul class="${escapeHTML(classNames("simple-list", className))}">
      ${html}
    </ul>
  `;
}

export function createKeyValueList(items = [], { className = "" } = {}) {
  const safeItems = ensureArray(items).filter(Boolean);

  if (!safeItems.length) {
    return "";
  }

  return `
    <ul class="${escapeHTML(classNames("keyvalue-list", className))}">
      ${safeItems
        .map((item) => {
          const value = inferValueFormat(item.value, item.format);
          return `
            <li class="keyvalue-list__item">
              <span class="keyvalue-list__key">${escapeHTML(item.label || "")}</span>
              <span class="keyvalue-list__value">${escapeHTML(value)}</span>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

/* ========================================
   TABLAS
======================================== */

export function createTable({
  columns = [],
  rows = [],
  emptyHTML = "",
  className = "",
  dense = false
} = {}) {
  const safeColumns = ensureArray(columns).filter(Boolean);
  const safeRows = ensureArray(rows);

  if (!safeColumns.length) {
    return emptyHTML || createEmptyStateHTML({ key: "generic" });
  }

  if (!safeRows.length) {
    return emptyHTML || createEmptyStateHTML({ key: "search" });
  }

  return `
    <div class="${escapeHTML(classNames("table-wrap", className))}">
      <table class="${escapeHTML(classNames("table", dense ? "table--dense" : ""))}">
        <thead>
          <tr>
            ${safeColumns
              .map((column) => {
                const align = normalizeAlign(column.align);
                return `
                  <th class="table__th table__th--${escapeHTML(align)}">
                    ${escapeHTML(column.label || "")}
                  </th>
                `;
              })
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${safeRows
            .map((row, rowIndex) => {
              return `
                <tr class="table__tr">
                  ${safeColumns
                    .map((column) => {
                      const align = normalizeAlign(column.align);
                      let cellContent = "";

                      if (isFunction(column.render)) {
                        cellContent = column.render(row, rowIndex);
                      } else if (column.key) {
                        const rawValue = row?.[column.key];
                        cellContent = escapeHTML(inferValueFormat(rawValue, column.format));
                      } else {
                        cellContent = escapeHTML(getEmptyValueLabel?.() || "—");
                      }

                      return `
                        <td class="table__td table__td--${escapeHTML(align)}">
                          ${cellContent}
                        </td>
                      `;
                    })
                    .join("")}
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* ========================================
   HELPERS ESPECÍFICOS DEL SISTEMA
======================================== */

export function createBotiquinCard({
  botiquin = {},
  badges = [],
  stats = [],
  actions = "",
  className = ""
} = {}) {
  const title =
    botiquin?.nombre ||
    botiquin?.botiquin ||
    botiquin?.id_botiquin ||
    getLabel?.("sinDatos", "Sin datos");

  const subtitleParts = [
    botiquin?.ubicacion,
    botiquin?.tipo,
    botiquin?.sede
  ].filter(Boolean);

  const badgeHTML = ensureArray(badges).join("");
  const statHTML = ensureArray(stats).map((item) => createStatPill(item)).join("");

  return createCard({
    title,
    subtitle: subtitleParts.join(" · "),
    actions,
    className: classNames("botiquin-card", className),
    clickable: true,
    attrs: {
      "data-botiquin-id": botiquin?.id_botiquin || botiquin?.id || ""
    },
    content: `
      ${badgeHTML ? `<div class="card__badges">${badgeHTML}</div>` : ""}
      ${statHTML ? `<div class="stat-pill-group">${statHTML}</div>` : ""}
      ${botiquin?.observaciones ? `<p class="card__text">${escapeHTML(truncate(botiquin.observaciones, 180))}</p>` : ""}
    `
  });
}

export function createAlertCard({
  alerta = {},
  actions = "",
  className = ""
} = {}) {
  const title =
    alerta?.titulo ||
    alerta?.nombre ||
    alerta?.elemento ||
    alerta?.categoria ||
    "Alerta";

  const severityBadge = createVisualBadge({
    type: "severidadAlerta",
    value: alerta?.severidad || alerta?.severity || "info"
  });

  const meta = createMetaList([
    {
      label: "Categoría",
      value: alerta?.categoria || alerta?.tipo || getLabel?.("sinDatos", "Sin datos")
    },
    {
      label: "Botiquín",
      value: alerta?.botiquin || alerta?.nombre_botiquin || alerta?.id_botiquin || ""
    },
    {
      label: "Fecha",
      value: alerta?.fecha || alerta?.createdAt || "",
      format: alerta?.fecha || alerta?.createdAt ? "date" : ""
    }
  ]);

  return createCard({
    title,
    subtitle: alerta?.descripcion || "",
    actions,
    className: classNames("alert-card", className),
    content: `
      <div class="card__badges">${severityBadge}</div>
      ${meta}
    `
  });
}

export function createInventoryItemSummary({
  item = {},
  actions = "",
  className = ""
} = {}) {
  const estado =
    item?.estado ||
    item?.estado_item ||
    item?.status ||
    "";

  const badge =
    estado
      ? createVisualBadge({
          type: "estadoInventario",
          value: estado
        })
      : item?.fecha_vencimiento
        ? createExpiryBadge(item.fecha_vencimiento)
        : "";

  const details = createDetailList([
    { label: "Categoría", value: item?.categoria || "" },
    { label: "Unidad", value: item?.unidad || "" },
    { label: "Cantidad actual", value: item?.cantidad_actual ?? "", format: "number" },
    { label: "Cantidad mínima", value: item?.cantidad_minima ?? "", format: "number" },
    { label: "Lote", value: item?.lote || "" },
    { label: "Vence", value: item?.fecha_vencimiento || "", format: item?.fecha_vencimiento ? "date" : "" }
  ]);

  return createCard({
    title: item?.elemento || "Elemento",
    subtitle: item?.ubicacion || "",
    actions,
    className: classNames("inventory-card", className),
    attrs: {
      "data-item-id": item?.id_item || item?.id_registro || item?.id || ""
    },
    content: `
      ${badge ? `<div class="card__badges">${badge}</div>` : ""}
      ${details}
    `
  });
}

/* ========================================
   CONDICIONALES / FEEDBACK VISUAL
======================================== */

export function renderIf(condition, html = "", fallback = "") {
  return condition ? safeHTML(html) : safeHTML(fallback);
}

export function setElementState(target, className, isActive) {
  const element = ensureTarget(target, "setElementState");
  if (!element) return null;

  element.classList.toggle(className, Boolean(isActive));
  return element;
}

export function toggleHidden(target, shouldHide = true) {
  const element = ensureTarget(target, "toggleHidden");
  if (!element) return null;

  element.hidden = Boolean(shouldHide);
  return element;
}

export function setDisabled(target, disabled = true, selector = "button, input, select, textarea") {
  const element = ensureTarget(target, "setDisabled");
  if (!element) return [];

  const nodes = Array.from(element.querySelectorAll(selector));
  nodes.forEach((node) => {
    node.disabled = Boolean(disabled);
    node.setAttribute("aria-disabled", String(Boolean(disabled)));
  });

  return nodes;
}

export function setText(target, value = "") {
  const element = ensureTarget(target, "setText");
  if (!element) return null;

  element.textContent = value ?? "";
  return element;
}

export function setDataset(target, key, value) {
  const element = ensureTarget(target, "setDataset");
  if (!element || !key) return null;

  element.dataset[key] = value ?? "";
  return element;
}

/* ========================================
   SKELETONS
======================================== */

export function createSkeletonLines(count = 3, { className = "" } = {}) {
  const total = Number.isFinite(count) && count > 0 ? count : 3;

  return `
    <div class="${escapeHTML(classNames("skeleton-lines", className))}" aria-hidden="true">
      ${Array.from({ length: total })
        .map(() => `<span class="skeleton-line"></span>`)
        .join("")}
    </div>
  `;
}

export function createCardSkeleton({
  lines = 3,
  showHeader = true,
  className = ""
} = {}) {
  return `
    <article class="${escapeHTML(
      classNames("card", "card--padded", "card--skeleton", className)
    )}" aria-hidden="true">
      ${
        showHeader
          ? `
            <div class="card__header">
              <div class="skeleton-lines skeleton-lines--header">
                <span class="skeleton-line"></span>
                <span class="skeleton-line skeleton-line--short"></span>
              </div>
            </div>
          `
          : ""
      }
      <div class="card__body">
        ${createSkeletonLines(lines)}
      </div>
    </article>
  `;
}

export function createKpiSkeleton({ count = 4, className = "" } = {}) {
  const total = Number.isFinite(count) && count > 0 ? count : 4;

  return `
    <div class="${escapeHTML(classNames("kpi-grid", className))}">
      ${Array.from({ length: total })
        .map(
          () => `
            <article class="kpi-card kpi-card--skeleton" aria-hidden="true">
              <div class="skeleton-lines">
                <span class="skeleton-line skeleton-line--short"></span>
                <span class="skeleton-line"></span>
                <span class="skeleton-line skeleton-line--short"></span>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

/* ========================================
   RENDER ASYNC DE VISTA
======================================== */

export async function renderAsyncView(target, asyncRenderer, options = {}) {
  const {
    loading = {
      title: "Cargando información",
      description: "Estamos preparando esta vista."
    },
    error = {
      title: "No fue posible cargar la vista",
      description: "Intenta nuevamente en un momento."
    },
    onError = null
  } = options;

  renderLoading(target, loading);

  try {
    const html = await asyncRenderer();
    renderHTML(target, html);
    return { ok: true };
  } catch (err) {
    console.error("[ui/render] Error en renderAsyncView:", err);
    renderError(target, error);

    if (typeof onError === "function") {
      onError(err);
    }

    return { ok: false, error: err };
  }
}

/* ========================================
   HELPERS DE MONTAJE RÁPIDO
======================================== */

export function mountKpis(target, items = [], options = {}) {
  return renderHTML(target, createKpiGrid(items, options));
}

export function mountCards(target, cards = [], options = {}) {
  return renderHTML(target, createCardGrid(cards, options));
}

export function mountTable(target, config = {}) {
  return renderHTML(target, createTable(config));
}

export function mountDetailList(target, items = [], options = {}) {
  return renderHTML(target, createDetailList(items, options));
}
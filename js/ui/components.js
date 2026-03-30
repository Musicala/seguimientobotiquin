// ========================================
// ui/components.js
// Componentes de UI reutilizables
// Sin lógica de negocio ni fetch
// ========================================

import { escapeHTML } from "../utils.js";

export function renderKpiGrid(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <section class="kpi-grid">
      ${items.map(({ label = "", value = "--", meta = "", tone = "" }) => `
        <article class="kpi-card">
          <span class="kpi-card__label">${escapeHTML(label)}</span>
          <strong class="kpi-card__value${tone ? ` is-${escapeHTML(tone)}` : ""}">${escapeHTML(String(value))}</strong>
          ${meta ? `<span class="kpi-card__meta">${escapeHTML(meta)}</span>` : ""}
        </article>
      `).join("")}
    </section>
  `;
}

export function renderBadge(label = "", { tone = "muted", className = "" } = {}) {
  const classes = ["badge", `badge--${tone}`, className].filter(Boolean).join(" ");
  return `<span class="${escapeHTML(classes)}">${escapeHTML(label)}</span>`;
}

export function renderSectionHeader({ eyebrow = "", title = "", subtitle = "", actions = [] } = {}) {
  const actionsHTML = Array.isArray(actions)
    ? actions.map(({ label = "", variant = "secondary", attrs = "" }) =>
        `<button type="button" class="btn btn--${escapeHTML(variant)}" ${attrs}>${escapeHTML(label)}</button>`
      ).join("")
    : "";
  return `
    <header class="page-toolbar">
      <div>
        ${eyebrow ? `<p class="page-toolbar__eyebrow">${escapeHTML(eyebrow)}</p>` : ""}
        ${title ? `<h2 class="section-title">${escapeHTML(title)}</h2>` : ""}
        ${subtitle ? `<p class="section-text">${escapeHTML(subtitle)}</p>` : ""}
      </div>
      ${actionsHTML ? `<div class="page-toolbar__actions">${actionsHTML}</div>` : ""}
    </header>
  `;
}

export function renderCard({ title = "", subtitle = "", content = "", footer = "", className = "" } = {}) {
  const classes = ["card", className].filter(Boolean).join(" ");
  return `
    <article class="${escapeHTML(classes)}">
      <div class="card__body">
        ${title ? `<h3 class="card__title">${escapeHTML(title)}</h3>` : ""}
        ${subtitle ? `<p class="section-text">${escapeHTML(subtitle)}</p>` : ""}
        ${content ? `<div class="card__content">${content}</div>` : ""}
        ${footer ? `<div class="card__actions">${footer}</div>` : ""}
      </div>
    </article>
  `;
}

export function renderDetailList(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <dl class="data-list data-list--stack">
      ${items.map(({ label = "", value = "", allowHTML = false }) => {
        const valueHTML = allowHTML ? String(value ?? "") : escapeHTML(String(value ?? ""));
        return `<div><dt>${escapeHTML(label)}</dt><dd>${valueHTML}</dd></div>`;
      }).join("")}
    </dl>
  `;
}

export function renderToolbar({ start = "", end = "" } = {}) {
  if (!start && !end) return "";
  return `
    <div class="page-toolbar">
      ${start ? `<div class="page-toolbar__left">${start}</div>` : ""}
      ${end ? `<div class="page-toolbar__right">${end}</div>` : ""}
    </div>
  `;
}

export function renderStack(items = [], { gap = "md" } = {}) {
  const filtered = items.filter(Boolean);
  if (!filtered.length) return "";
  return `<div class="stack stack--${escapeHTML(gap)}">${filtered.join("")}</div>`;
}

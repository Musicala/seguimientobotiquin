// ========================================
// ui/empty-state.js
// Componente de estado vacío reutilizable
// ========================================

import { escapeHTML } from "../utils.js";

/**
 * Crea HTML para un estado vacío.
 * @param {object} options
 * @param {string} options.icon
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} options.actionHTML
 * @param {string} options.className
 * @param {boolean} options.compact
 */
export function createEmptyState({
  icon = "📭",
  title = "Sin resultados",
  description = "No hay información para mostrar en este momento.",
  actionHTML = "",
  className = "",
  compact = false
} = {}) {
  const classes = ["empty-state", compact ? "empty-state--compact" : "", className]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${escapeHTML(classes)}">
      <div class="empty-state__icon" aria-hidden="true">${escapeHTML(icon)}</div>
      <div class="empty-state__content">
        <h3 class="empty-state__title">${escapeHTML(title)}</h3>
        <p class="empty-state__text">${escapeHTML(description)}</p>
        ${actionHTML ? `<div class="empty-state__actions">${actionHTML}</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * Renderiza el estado vacío directamente en un contenedor.
 * @param {HTMLElement|string} target
 * @param {object} options
 */
export function renderEmptyState(target, options = {}) {
  const element =
    typeof target === "string" ? document.querySelector(target) : target;

  if (!element) return null;

  element.innerHTML = createEmptyState(options);
  return element;
}

    // ========================================
// ui/toast.js
// Sistema base de toasts / notificaciones
// - Sin lógica de negocio
// - Reusable
// - Vanilla JS + ES Modules
// ========================================

import { escapeHTML } from '../utils.js';

/* ========================================
   CONFIG BASE
======================================== */

const TOAST_ROOT_ID = 'app-toast-root';
const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;

let toastCounter = 0;

/* ========================================
   HELPERS
======================================== */

function safeText(value, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function joinClasses(...classes) {
  return classes.filter(Boolean).join(' ');
}

function ensureToastRoot() {
  let root = document.getElementById(TOAST_ROOT_ID);

  if (!root) {
    root = document.createElement('div');
    root.id = TOAST_ROOT_ID;
    root.className = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'false');
    document.body.appendChild(root);
  }

  return root;
}

function createToastId() {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

function getToastElement(toastId) {
  return document.querySelector(`[data-toast-id="${toastId}"]`);
}

function getToneIcon(tone = 'info') {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  return icons[tone] || icons.info;
}

function normalizeOptions(options = {}) {
  return {
    id: options.id || createToastId(),
    title: safeText(options.title, ''),
    message: safeText(options.message, ''),
    tone: safeText(options.tone, 'info'),
    duration: Number.isFinite(options.duration) ? options.duration : DEFAULT_DURATION,
    dismissible: options.dismissible !== false,
    icon: options.icon ?? getToneIcon(options.tone),
    className: safeText(options.className, ''),
    actionLabel: safeText(options.actionLabel, ''),
    actionAttrs: safeText(options.actionAttrs, ''),
    persistent: Boolean(options.persistent),
    onClose: typeof options.onClose === 'function' ? options.onClose : null
  };
}

function enforceToastLimit(root) {
  const toasts = Array.from(root.querySelectorAll('.toast'));
  if (toasts.length <= MAX_TOASTS) return;

  const overflow = toasts.length - MAX_TOASTS;
  toasts.slice(0, overflow).forEach((toast) => toast.remove());
}

/* ========================================
   RENDER
======================================== */

export function createToastHTML(options = {}) {
  const {
    id,
    title,
    message,
    tone,
    dismissible,
    icon,
    className,
    actionLabel,
    actionAttrs
  } = normalizeOptions(options);

  const hasTitle = Boolean(title);
  const hasMessage = Boolean(message);

  return `
    <div
      class="${escapeHTML(joinClasses('toast', `toast--${tone}`, className))}"
      data-toast-id="${escapeHTML(id)}"
      data-toast-tone="${escapeHTML(tone)}"
      role="${tone === 'error' || tone === 'warning' ? 'alert' : 'status'}"
      tabindex="0"
    >
      <div class="toast__icon" aria-hidden="true">
        ${escapeHTML(icon)}
      </div>

      <div class="toast__content">
        ${hasTitle ? `<h4 class="toast__title">${escapeHTML(title)}</h4>` : ''}
        ${hasMessage ? `<p class="toast__message">${escapeHTML(message)}</p>` : ''}
      </div>

      ${
        actionLabel
          ? `
            <div class="toast__actions">
              <button
                type="button"
                class="toast__action"
                ${actionAttrs}
              >
                ${escapeHTML(actionLabel)}
              </button>
            </div>
          `
          : ''
      }

      ${
        dismissible
          ? `
            <button
              type="button"
              class="toast__close"
              aria-label="Cerrar notificación"
              data-toast-close
            >
              ×
            </button>
          `
          : ''
      }
    </div>
  `;
}

/* ========================================
   MONTAJE
======================================== */

export function mountToast(options = {}) {
  const root = ensureToastRoot();
  const config = normalizeOptions(options);

  const existing = getToastElement(config.id);
  if (existing) existing.remove();

  root.insertAdjacentHTML('beforeend', createToastHTML(config));
  const toast = getToastElement(config.id);

  if (!toast) return null;

  toast._toastMeta = {
    timeoutId: null,
    onClose: config.onClose
  };

  enforceToastLimit(root);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  if (!config.persistent && config.duration > 0) {
    scheduleToastClose(config.id, config.duration);
  }

  return toast;
}

/* ========================================
   CIERRE / ELIMINACIÓN
======================================== */

export function closeToast(toastId) {
  const toast = getToastElement(toastId);
  if (!toast) return false;

  if (toast._toastMeta?.timeoutId) {
    clearTimeout(toast._toastMeta.timeoutId);
  }

  toast.classList.remove('is-visible');
  toast.classList.add('is-leaving');

  window.setTimeout(() => {
    const onClose = toast._toastMeta?.onClose;
    toast.remove();

    if (typeof onClose === 'function') {
      onClose(toastId);
    }
  }, 220);

  return true;
}

export function clearAllToasts() {
  const root = ensureToastRoot();
  const toasts = Array.from(root.querySelectorAll('.toast'));

  toasts.forEach((toast) => {
    const toastId = toast.getAttribute('data-toast-id');
    closeToast(toastId);
  });
}

/* ========================================
   TIMER
======================================== */

export function scheduleToastClose(toastId, duration = DEFAULT_DURATION) {
  const toast = getToastElement(toastId);
  if (!toast) return null;

  if (toast._toastMeta?.timeoutId) {
    clearTimeout(toast._toastMeta.timeoutId);
  }

  const timeoutId = window.setTimeout(() => {
    closeToast(toastId);
  }, duration);

  toast._toastMeta = {
    ...toast._toastMeta,
    timeoutId
  };

  return timeoutId;
}

export function pauseToastTimer(toastId) {
  const toast = getToastElement(toastId);
  if (!toast || !toast._toastMeta?.timeoutId) return false;

  clearTimeout(toast._toastMeta.timeoutId);
  toast._toastMeta.timeoutId = null;
  return true;
}

/* ========================================
   API DE ALTO NIVEL
======================================== */

export function showToast(options = {}) {
  return mountToast(options);
}

export function showSuccessToast(message, options = {}) {
  return showToast({
    title: options.title || 'Éxito',
    message,
    tone: 'success',
    ...options
  });
}

export function showErrorToast(message, options = {}) {
  return showToast({
    title: options.title || 'Error',
    message,
    tone: 'error',
    duration: options.duration ?? 5500,
    ...options
  });
}

export function showWarningToast(message, options = {}) {
  return showToast({
    title: options.title || 'Atención',
    message,
    tone: 'warning',
    ...options
  });
}

export function showInfoToast(message, options = {}) {
  return showToast({
    title: options.title || 'Información',
    message,
    tone: 'info',
    ...options
  });
}

/* ========================================
   UPDATE
======================================== */

export function updateToast(toastId, options = {}) {
  const existing = getToastElement(toastId);
  if (!existing) return null;

  const previousMeta = existing._toastMeta || {};
  existing.remove();

  const toast = mountToast({
    id: toastId,
    ...options,
    onClose: options.onClose || previousMeta.onClose
  });

  return toast;
}

/* ========================================
   EVENTOS GLOBALES
======================================== */

function handleToastCloseClick(event) {
  const closeBtn = event.target.closest('[data-toast-close]');
  if (!closeBtn) return;

  const toast = closeBtn.closest('.toast');
  if (!toast) return;

  const toastId = toast.getAttribute('data-toast-id');
  closeToast(toastId);
}

function handleToastMouseEnter(event) {
  const toast = event.target.closest('.toast');
  if (!toast) return;

  const toastId = toast.getAttribute('data-toast-id');
  pauseToastTimer(toastId);
}

function handleToastMouseLeave(event) {
  const toast = event.target.closest('.toast');
  if (!toast) return;

  const tone = toast.getAttribute('data-toast-tone') || 'info';
  const defaultDuration = tone === 'error' ? 5500 : DEFAULT_DURATION;
  const toastId = toast.getAttribute('data-toast-id');

  scheduleToastClose(toastId, defaultDuration);
}

let toastEventsBound = false;

export function initToastSystem() {
  if (toastEventsBound) return;

  ensureToastRoot();

  document.addEventListener('click', handleToastCloseClick);
  document.addEventListener('mouseover', handleToastMouseEnter);
  document.addEventListener('mouseout', handleToastMouseLeave);

  toastEventsBound = true;
}
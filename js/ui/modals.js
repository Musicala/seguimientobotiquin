// ========================================
// ui/modals.js
// Sistema base de modales reutilizable
// - Sin lógica de negocio
// - Sin fetch
// - Compatible con ES Modules
// - Pensado para dashboards vanilla
// ========================================

import {
  escapeHTML,
  safeString,
  safeTrimmedString,
  text,
  classNames,
  qs,
  qsa,
  createElement,
  mountPortalNode,
  focusFirstFocusable,
  setHTML
} from "../utils.js";

import {
  getUiConfig,
  getDefaultConfirmModalSize,
  shouldCloseModalOnBackdrop,
  shouldCloseModalOnEscape,
  isValidModalSize
} from "../config.js";

/* ========================================
   ESTADO INTERNO
======================================== */

const MODAL_ROOT_ID = "app-modals-root";
const OPEN_CLASS = "modal-open";
const MODAL_SELECTOR = ".modal";
const DIALOG_SELECTOR = ".modal__dialog";

const UI_CONFIG = (typeof getUiConfig === "function" && getUiConfig()) || {};

const modalState = {
  stack: [],
  lastFocusedElement: null,
  modalEventsBound: false
};

/* ========================================
   HELPERS BÁSICOS
======================================== */

function safeText(value, fallback = "") {
  return text(value, fallback);
}

function safeModalSize(size = "md") {
  const fallback =
    (typeof getDefaultConfirmModalSize === "function" &&
      getDefaultConfirmModalSize()) ||
    "md";

  if (typeof isValidModalSize === "function") {
    return isValidModalSize(size) ? size : fallback;
  }

  return safeTrimmedString(size, fallback) || fallback;
}

function ensureModalRoot() {
  let root = document.getElementById(MODAL_ROOT_ID);

  if (!root) {
    root = mountPortalNode(MODAL_ROOT_ID);
    root.classList.add("modals-root");
    root.setAttribute("data-role", "modals-root");
  }

  return root;
}

function getModalElement(modalId) {
  if (!modalId) return null;
  return document.querySelector(
    `${MODAL_SELECTOR}[data-modal-id="${CSS.escape(String(modalId))}"]`
  );
}

function getDialogElement(modal) {
  return modal?.querySelector(DIALOG_SELECTOR) || null;
}

function getAllModals() {
  return qsa(MODAL_SELECTOR, ensureModalRoot());
}

function getOpenModals() {
  return getAllModals().filter((modal) => modal.classList.contains("is-open"));
}

function hasOpenModal() {
  return getOpenModals().length > 0;
}

function getTopModalId() {
  return modalState.stack[modalState.stack.length - 1] || null;
}

function getTopModalElement() {
  const modalId = getTopModalId();
  return modalId ? getModalElement(modalId) : null;
}

function isTopModal(modalId) {
  return getTopModalId() === modalId;
}

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll(
      [
        'a[href]',
        'area[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'iframe',
        'object',
        'embed',
        '[contenteditable="true"]',
        '[tabindex]:not([tabindex="-1"])'
      ].join(",")
    )
  ).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hasAttribute("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest("[hidden]")) return false;

    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function getModalCallbacks(modal) {
  if (!modal) {
    return {
      onOpen: null,
      onClose: null
    };
  }

  if (!modal.__modalCallbacks) {
    modal.__modalCallbacks = {
      onOpen: null,
      onClose: null
    };
  }

  return modal.__modalCallbacks;
}

function getModalMeta(modal) {
  if (!modal) return {};

  return {
    modalId: modal.getAttribute("data-modal-id") || "",
    modal,
    dialog: getDialogElement(modal)
  };
}

function rememberFocusedElement() {
  const current = document.activeElement;
  if (current instanceof HTMLElement) {
    modalState.lastFocusedElement = current;
  }
}

function focusElementSafely(element) {
  if (!element || typeof element.focus !== "function") return;

  window.requestAnimationFrame(() => {
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      element.focus();
    }
  });
}

function restoreFocus(options = {}) {
  const { restoreFocus = true } = options;
  if (!restoreFocus) return;

  const currentTopModal = getTopModalElement();

  if (currentTopModal) {
    const target = getTargetFocus(currentTopModal);
    focusElementSafely(target);
    return;
  }

  if (
    modalState.lastFocusedElement instanceof HTMLElement &&
    document.contains(modalState.lastFocusedElement)
  ) {
    focusElementSafely(modalState.lastFocusedElement);
  }

  modalState.lastFocusedElement = null;
}

function lockBodyScroll() {
  document.body.classList.add(OPEN_CLASS);
}

function unlockBodyScroll() {
  if (!hasOpenModal()) {
    document.body.classList.remove(OPEN_CLASS);
  }
}

function normalizeActions(actions = []) {
  return Array.isArray(actions)
    ? actions
        .filter(Boolean)
        .map((action) => ({
          label: safeText(action.label, "Acción"),
          variant: safeTrimmedString(action.variant, "secondary"),
          attrs: safeString(action.attrs, ""),
          className: safeTrimmedString(action.className, ""),
          type: safeTrimmedString(action.type, "button"),
          disabled: Boolean(action.disabled)
        }))
    : [];
}

function renderActionButton(action) {
  const className = classNames(
    "btn",
    `btn--${action.variant}`,
    action.className
  );

  return `
    <button
      type="${escapeHTML(action.type)}"
      class="${escapeHTML(className)}"
      ${action.disabled ? 'disabled aria-disabled="true"' : ""}
      ${action.attrs}
    >
      ${escapeHTML(action.label)}
    </button>
  `;
}

function getTargetFocus(modal, focusSelector = "[data-autofocus]") {
  const dialog = getDialogElement(modal);
  if (!dialog) return null;

  const preferredFocus =
    focusSelector && modal.querySelector(focusSelector)
      ? modal.querySelector(focusSelector)
      : null;

  const firstFocusable = getFocusableElements(dialog)[0];

  return preferredFocus || firstFocusable || dialog;
}

function setModalState(modal, isOpen) {
  if (!modal) return;

  modal.classList.toggle("is-open", Boolean(isOpen));
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  modal.dataset.state = isOpen ? "open" : "closed";

  const dialog = getDialogElement(modal);
  if (dialog) {
    if (!dialog.hasAttribute("tabindex")) {
      dialog.setAttribute("tabindex", "-1");
    }
  }
}

function syncModalStack(modalId, isOpen) {
  const safeId = safeTrimmedString(modalId);
  if (!safeId) return;

  modalState.stack = modalState.stack.filter((id) => id !== safeId);

  if (isOpen) {
    modalState.stack.push(safeId);
  }
}

function updateModalLayering() {
  const openModals = getOpenModals();
  const zIndexBase = Number(UI_CONFIG?.zIndex?.modal || 910);

  openModals.forEach((modal, index) => {
    modal.style.zIndex = String(zIndexBase + index);
    modal.dataset.modalLayer = String(index + 1);
  });
}

function removeModalDom(modal) {
  if (!modal) return;
  modal.remove();
}

/* ========================================
   RENDER BASE
======================================== */

export function createModalHTML({
  id,
  title = "",
  subtitle = "",
  content = "",
  footer = "",
  size = "md",
  closable = true,
  closeOnOverlay = null,
  closeOnEscape = null,
  className = "",
  labelledBy = "",
  describedBy = ""
} = {}) {
  if (!id) {
    throw new Error('createModalHTML: "id" es obligatorio.');
  }

  const titleId = labelledBy || `${id}-title`;
  const descId = describedBy || `${id}-description`;

  const allowOverlayClose =
    closeOnOverlay === null || closeOnOverlay === undefined
      ? shouldCloseModalOnBackdrop?.() ?? true
      : Boolean(closeOnOverlay);

  const allowEscapeClose =
    closeOnEscape === null || closeOnEscape === undefined
      ? shouldCloseModalOnEscape?.() ?? true
      : Boolean(closeOnEscape);

  return `
    <div
      class="${escapeHTML(
        classNames("modal", `modal--${safeModalSize(size)}`, className)
      )}"
      data-modal-id="${escapeHTML(id)}"
      data-close-on-overlay="${allowOverlayClose ? "true" : "false"}"
      data-close-on-escape="${allowEscapeClose ? "true" : "false"}"
      aria-hidden="true"
      hidden
    >
      <div class="modal__overlay" data-modal-close-overlay></div>

      <section
        class="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="${escapeHTML(titleId)}"
        ${subtitle ? `aria-describedby="${escapeHTML(descId)}"` : ""}
        tabindex="-1"
      >
        <header class="modal__header">
          <div class="modal__header-copy">
            ${
              title
                ? `<h2 class="modal__title" id="${escapeHTML(
                    titleId
                  )}">${escapeHTML(title)}</h2>`
                : ""
            }
            ${
              subtitle
                ? `<p class="modal__subtitle" id="${escapeHTML(
                    descId
                  )}">${escapeHTML(subtitle)}</p>`
                : ""
            }
          </div>

          ${
            closable
              ? `
                <button
                  type="button"
                  class="modal__close"
                  aria-label="Cerrar ventana"
                  data-modal-close
                >
                  ×
                </button>
              `
              : ""
          }
        </header>

        <div class="modal__body">
          ${content}
        </div>

        ${footer ? `<footer class="modal__footer">${footer}</footer>` : ""}
      </section>
    </div>
  `;
}

/* ========================================
   HELPERS DE FOOTER
======================================== */

export function renderModalActions(actions = [], { align = "end" } = {}) {
  const normalized = normalizeActions(actions);

  if (!normalized.length) return "";

  return `
    <div class="modal__actions modal__actions--${escapeHTML(align)}">
      ${normalized.map(renderActionButton).join("")}
    </div>
  `;
}

export function renderConfirmModal({
  id,
  title = "Confirmar acción",
  subtitle = "",
  message = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  cancelVariant = "secondary",
  confirmAttrs = 'data-action="confirm"',
  cancelAttrs = "data-modal-close",
  size = null
} = {}) {
  const footer = renderModalActions([
    {
      label: cancelLabel,
      variant: cancelVariant,
      attrs: cancelAttrs
    },
    {
      label: confirmLabel,
      variant: confirmVariant,
      attrs: confirmAttrs
    }
  ]);

  return createModalHTML({
    id,
    title,
    subtitle,
    content: `<div class="modal__message">${escapeHTML(message)}</div>`,
    footer,
    size:
      size ||
      (typeof getDefaultConfirmModalSize === "function"
        ? getDefaultConfirmModalSize()
        : "sm")
  });
}

/* ========================================
   INSERCIÓN / REGISTRO
======================================== */

export function mountModal(modalHTML) {
  initModalSystem();

  const root = ensureModalRoot();
  const temp = document.createElement("div");
  temp.innerHTML = safeString(modalHTML, "").trim();

  const modalEl = temp.firstElementChild;

  if (!modalEl) {
    throw new Error("mountModal: no se pudo crear el modal.");
  }

  const modalId = modalEl.getAttribute("data-modal-id");

  if (!modalId) {
    throw new Error("mountModal: el modal debe incluir data-modal-id.");
  }

  const existing = getModalElement(modalId);
  if (existing) {
    const wasOpen = existing.classList.contains("is-open");
    const callbacks = getModalCallbacks(existing);

    if (wasOpen) {
      syncModalStack(modalId, false);
    }

    removeModalDom(existing);
    modalEl.__modalCallbacks = callbacks;
  }

  modalEl.hidden = true;
  root.appendChild(modalEl);

  updateModalLayering();
  unlockBodyScroll();

  return modalEl;
}

export function updateModal(modalId, modalHTML, options = {}) {
  const existing = getModalElement(modalId);
  const wasOpen = Boolean(existing?.classList.contains("is-open"));
  const callbacks = existing ? getModalCallbacks(existing) : null;

  if (existing) {
    removeModalDom(existing);
  }

  const modal = mountModal(modalHTML);

  if (callbacks) {
    modal.__modalCallbacks = callbacks;
  }

  if (wasOpen) {
    openModal(modalId, {
      restorePreviousFocus: false,
      ...options
    });
  }

  return modal;
}

export function removeModal(modalId, options = {}) {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  const wasOpen = modal.classList.contains("is-open");

  if (wasOpen) {
    closeModal(modalId, {
      ...options,
      removeAfterClose: false
    });
  }

  removeModalDom(modal);
  syncModalStack(modalId, false);
  updateModalLayering();
  unlockBodyScroll();

  return true;
}

export function clearAllModals(options = {}) {
  const root = ensureModalRoot();
  const modals = qsa(MODAL_SELECTOR, root);

  modals.forEach((modal) => {
    const callbacks = getModalCallbacks(modal);
    if (typeof callbacks.onClose === "function") {
      callbacks.onClose(modal);
    }
  });

  root.innerHTML = "";
  modalState.stack = [];
  unlockBodyScroll();
  restoreFocus(options);
}

/* ========================================
   APERTURA / CIERRE
======================================== */

export function openModal(modalId, options = {}) {
  const modal = getModalElement(modalId);
  if (!modal) {
    console.warn(`openModal: no existe modal con id "${modalId}"`);
    return null;
  }

  const {
    focusSelector = "[data-autofocus]",
    onOpen = null,
    onClose = null,
    restorePreviousFocus = true,
    keepOthersOpen = true
  } = options;

  if (!keepOthersOpen) {
    const currentOpen = getOpenModals();
    currentOpen.forEach((openModalEl) => {
      const currentId = openModalEl.getAttribute("data-modal-id");
      if (currentId && currentId !== modalId) {
        closeModal(currentId, { restoreFocus: false });
      }
    });
  }

  if (restorePreviousFocus && !hasOpenModal()) {
    rememberFocusedElement();
  }

  const callbacks = getModalCallbacks(modal);
  callbacks.onOpen = typeof onOpen === "function" ? onOpen : callbacks.onOpen;
  callbacks.onClose = typeof onClose === "function" ? onClose : callbacks.onClose;

  modal.hidden = false;
  setModalState(modal, true);
  syncModalStack(modalId, true);
  updateModalLayering();
  lockBodyScroll();

  const targetFocus = getTargetFocus(modal, focusSelector);
  focusElementSafely(targetFocus);

  if (typeof callbacks.onOpen === "function") {
    callbacks.onOpen(modal);
  }

  return modal;
}

export function closeModal(modalId = getTopModalId(), options = {}) {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  const {
    onClose = null,
    restoreFocus: shouldRestoreFocus = true,
    removeAfterClose = false
  } = options;

  const callbacks = getModalCallbacks(modal);
  const closeCallback =
    typeof onClose === "function" ? onClose : callbacks.onClose;

  setModalState(modal, false);
  modal.hidden = true;
  syncModalStack(modalId, false);
  updateModalLayering();
  unlockBodyScroll();

  if (typeof closeCallback === "function") {
    closeCallback(modal);
  }

  if (removeAfterClose) {
    removeModalDom(modal);
  }

  restoreFocus({ restoreFocus: shouldRestoreFocus });
  return true;
}

export function toggleModal(modalId, options = {}) {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  if (modal.classList.contains("is-open")) {
    return closeModal(modalId, options);
  }

  openModal(modalId, options);
  return true;
}

export function isModalOpen(modalId) {
  const modal = getModalElement(modalId);
  return Boolean(modal && modal.classList.contains("is-open"));
}

export function getActiveModalId() {
  return getTopModalId();
}

export function getActiveModal() {
  return getTopModalElement();
}

/* ========================================
   UTILIDADES DE CONTENIDO
======================================== */

export function setModalContent(modalId, html) {
  const modal = getModalElement(modalId);
  const body = modal?.querySelector(".modal__body");
  if (!body) return false;

  setHTML(body, html || "");
  return true;
}

export function setModalFooter(modalId, html) {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  const dialog = getDialogElement(modal);
  if (!dialog) return false;

  let footer = modal.querySelector(".modal__footer");

  if (!html) {
    if (footer) footer.remove();
    return true;
  }

  if (!footer) {
    footer = createElement("footer", {
      className: "modal__footer"
    });
    dialog.appendChild(footer);
  }

  footer.innerHTML = html;
  return true;
}

export function setModalTitle(modalId, title) {
  const modal = getModalElement(modalId);
  const titleEl = modal?.querySelector(".modal__title");
  if (!titleEl) return false;

  titleEl.textContent = safeText(title);
  return true;
}

export function setModalSubtitle(modalId, subtitle = "") {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  const headerCopy = modal.querySelector(".modal__header-copy");
  if (!headerCopy) return false;

  let subtitleEl = modal.querySelector(".modal__subtitle");

  if (!subtitle) {
    if (subtitleEl) subtitleEl.remove();
    return true;
  }

  if (!subtitleEl) {
    subtitleEl = createElement("p", {
      className: "modal__subtitle"
    });
    headerCopy.appendChild(subtitleEl);
  }

  subtitleEl.textContent = safeText(subtitle);
  return true;
}

export function setModalClosable(modalId, closable = true) {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  const closeButton = modal.querySelector("[data-modal-close]");

  if (closable && !closeButton) {
    const header = modal.querySelector(".modal__header");
    if (!header) return false;

    const button = createElement("button", {
      className: "modal__close",
      text: "×",
      attrs: {
        type: "button",
        "aria-label": "Cerrar ventana",
        "data-modal-close": ""
      }
    });

    header.appendChild(button);
    return true;
  }

  if (!closable && closeButton) {
    closeButton.remove();
  }

  return true;
}

export function setModalBusy(modalId, isBusy = true) {
  const modal = getModalElement(modalId);
  if (!modal) return false;

  modal.dataset.busy = isBusy ? "true" : "false";

  const controls = qsa("button, input, select, textarea", modal);

  controls.forEach((control) => {
    if (control.hasAttribute("data-modal-close")) return;

    if (isBusy) {
      control.setAttribute(
        "data-was-disabled",
        control.disabled ? "true" : "false"
      );
      control.disabled = true;
    } else {
      const wasDisabled = control.getAttribute("data-was-disabled") === "true";
      control.disabled = wasDisabled;
      control.removeAttribute("data-was-disabled");
    }
  });

  return true;
}

/* ========================================
   FORM HELPERS
======================================== */

export function renderModalFormGrid(fieldsHTML = []) {
  const items = Array.isArray(fieldsHTML) ? fieldsHTML.filter(Boolean) : [];

  return `
    <div class="modal-form-grid">
      ${items.join("")}
    </div>
  `;
}

export function renderModalMessage({
  tone = "info",
  title = "",
  description = ""
} = {}) {
  return `
    <div class="modal-message modal-message--${escapeHTML(tone)}">
      ${title ? `<h3 class="modal-message__title">${escapeHTML(title)}</h3>` : ""}
      ${
        description
          ? `<p class="modal-message__description">${escapeHTML(
              description
            )}</p>`
          : ""
      }
    </div>
  `;
}

/* ========================================
   EVENTOS GLOBALES
======================================== */

function handleOverlayClick(event) {
  const overlay = event.target.closest("[data-modal-close-overlay]");
  if (!overlay) return;

  const modal = overlay.closest(MODAL_SELECTOR);
  if (!modal) return;

  const modalId = modal.getAttribute("data-modal-id");
  if (!modalId || !isTopModal(modalId)) return;

  const allowOverlayClose = modal.dataset.closeOnOverlay === "true";
  if (!allowOverlayClose) return;

  closeModal(modalId);
}

function handleCloseClick(event) {
  const closeButton = event.target.closest("[data-modal-close]");
  if (!closeButton) return;

  const modal = closeButton.closest(MODAL_SELECTOR);
  if (!modal) return;

  const modalId = modal.getAttribute("data-modal-id");
  if (!modalId || !isTopModal(modalId)) return;

  closeModal(modalId);
}

function handleEscapeKey(event) {
  if (event.key !== "Escape") return;

  const modalId = getTopModalId();
  if (!modalId) return;

  const modal = getModalElement(modalId);
  if (!modal) return;

  const allowEscapeClose = modal.dataset.closeOnEscape !== "false";
  if (!allowEscapeClose) return;

  event.preventDefault();
  closeModal(modalId);
}

function handleFocusTrap(event) {
  if (event.key !== "Tab") return;

  const modal = getTopModalElement();
  const dialog = getDialogElement(modal);
  if (!dialog) return;

  const focusables = getFocusableElements(dialog);

  if (!focusables.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const current = document.activeElement;

  if (event.shiftKey && current === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  } else if (!dialog.contains(current)) {
    event.preventDefault();
    first.focus();
  }
}

function handleWindowFocus() {
  const modal = getTopModalElement();
  const dialog = getDialogElement(modal);
  if (!dialog) return;

  if (!dialog.contains(document.activeElement)) {
    const focusTarget = getTargetFocus(modal);
    focusElementSafely(focusTarget);
  }
}

/* ========================================
   INICIALIZACIÓN
======================================== */

export function initModalSystem() {
  if (modalState.modalEventsBound) return;

  document.addEventListener("click", handleOverlayClick);
  document.addEventListener("click", handleCloseClick);
  document.addEventListener("keydown", handleEscapeKey);
  document.addEventListener("keydown", handleFocusTrap);
  window.addEventListener("focus", handleWindowFocus);

  ensureModalRoot();
  modalState.modalEventsBound = true;
}

/* ========================================
   API DE ALTO NIVEL
======================================== */

export function showModal(config = {}, options = {}) {
  initModalSystem();
  mountModal(createModalHTML(config));
  return openModal(config.id, options);
}

export function showConfirmModal(config = {}, options = {}) {
  initModalSystem();
  mountModal(renderConfirmModal(config));
  return openModal(config.id, options);
}

/* ========================================
   BINDINGS AUXILIARES OPCIONALES
======================================== */

export function bindModalTriggers(container = document) {
  if (!container || container.__modalTriggersBound) return;

  container.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-modal-open]");
    if (!trigger) return;

    const modalId = trigger.getAttribute("data-modal-open");
    if (!modalId) return;

    openModal(modalId);
  });

  container.__modalTriggersBound = true;
}
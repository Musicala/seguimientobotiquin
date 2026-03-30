// ========================================
// ui/form-modal.js
// Infraestructura reusable para formularios modales
// - CRUD simple y complejo
// - soporte para fields dinámicos
// - validación visual
// - submit async
// - helpers para patch/reset/read
// ========================================

import {
  escapeHTML,
  safeString,
  safeTrimmedString,
  text,
  toBoolean,
  toNumber,
  isPlainObject,
  ensureArray,
  createElement,
  qs,
  qsa,
  clearHTML,
  setHTML,
  setDisabled,
  focusFirstFocusable,
  formToObject,
  fillForm,
  resetForm,
  clearFormValidation,
  validateRequired,
  setFieldError as setFieldErrorUtil,
  clearFieldError as clearFieldErrorUtil,
  createId,
  classNames
} from "../utils.js";

import {
  APP_CONFIG,
  getFormConfig,
  getDefaultFormModalSize,
  getLabel,
  isValidModalSize
} from "../config.js";

import {
  createModalHTML,
  renderModalActions,
  mountModal,
  openModal,
  closeModal,
  removeModal
} from "./modals.js";

/* ========================================
   CONSTANTES
======================================== */

const DEFAULT_SUBMIT_LABEL = "Guardar";
const DEFAULT_CANCEL_LABEL = "Cancelar";
const DEFAULT_FORM_SIZE =
  (typeof getDefaultFormModalSize === "function" && getDefaultFormModalSize()) ||
  "xl";

/* ========================================
   HELPERS BASE
======================================== */

function normalizeFieldType(type = "text") {
  return safeTrimmedString(type, "text").toLowerCase();
}

function normalizeCol(col = 12) {
  const parsed = Number(col);
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(1, Math.min(12, Math.round(parsed)));
}

function normalizeOptions(options = []) {
  return ensureArray(options).map((option) => {
    if (typeof option === "string" || typeof option === "number") {
      return {
        value: String(option),
        label: String(option),
        disabled: false,
        selected: false
      };
    }

    return {
      value: safeString(option?.value, ""),
      label: safeString(option?.label ?? option?.value, ""),
      hint: safeString(option?.hint, ""),
      disabled: toBoolean(option?.disabled, false),
      selected: toBoolean(option?.selected, false)
    };
  });
}

function resolveFormMode(mode = "create") {
  const normalized = safeTrimmedString(mode, "create").toLowerCase();
  if (["edit", "update", "editar", "actualizar"].includes(normalized)) return "edit";
  return "create";
}

function resolveSubmitLabel({
  submitLabel = "",
  formKey = "",
  mode = "create"
} = {}) {
  if (submitLabel) return submitLabel;

  const formConfig =
    typeof getFormConfig === "function" ? getFormConfig(formKey) : {};

  const resolvedMode = resolveFormMode(mode);

  if (resolvedMode === "edit" && formConfig?.submitLabelEdit) {
    return formConfig.submitLabelEdit;
  }

  if (resolvedMode === "create" && formConfig?.submitLabelCreate) {
    return formConfig.submitLabelCreate;
  }

  return DEFAULT_SUBMIT_LABEL;
}

function safeModalSize(size = "") {
  const fallback = DEFAULT_FORM_SIZE;
  if (typeof isValidModalSize === "function") {
    return isValidModalSize(size) ? size : fallback;
  }
  return safeTrimmedString(size, fallback) || fallback;
}

function fieldValueToString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeFieldValue(field = {}, values = {}) {
  const fieldName = safeTrimmedString(field?.name);
  const type = normalizeFieldType(field?.type);

  const explicitValue = field?.value;
  const valuesValue = fieldName ? values?.[fieldName] : undefined;
  const fallbackValue = explicitValue !== undefined ? explicitValue : valuesValue;

  if (type === "checkbox") {
    return toBoolean(
      explicitValue !== undefined ? explicitValue : valuesValue,
      toBoolean(field?.checked, false)
    );
  }

  if (type === "multiselect") {
    if (Array.isArray(fallbackValue)) return fallbackValue.map((item) => String(item));
    if (typeof fallbackValue === "string" && fallbackValue.trim()) {
      return fallbackValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  if (type === "number" || type === "range") {
    return fieldValueToString(fallbackValue, field?.defaultValue ?? "");
  }

  return fieldValueToString(fallbackValue, field?.defaultValue ?? "");
}

function withFieldRuntime(field = {}, values = {}) {
  const name = safeTrimmedString(field?.name);
  return {
    col: 12,
    required: false,
    disabled: false,
    readonly: false,
    hidden: false,
    className: "",
    wrapperClassName: "",
    inputClassName: "",
    labelClassName: "",
    hint: "",
    placeholder: "",
    rows: 4,
    step: "",
    min: "",
    max: "",
    autocomplete: "",
    inputmode: "",
    pattern: "",
    maxlength: "",
    minlength: "",
    checkedValue: "1",
    uncheckedValue: "",
    multiple: false,
    ...field,
    name,
    type: normalizeFieldType(field?.type),
    value: normalizeFieldValue(field, values)
  };
}

function buildCommonInputAttrs(field = {}) {
  return [
    field.name ? `name="${escapeHTML(field.name)}"` : "",
    field.name ? `id="${escapeHTML(field.id || field.name)}"` : "",
    field.placeholder
      ? `placeholder="${escapeHTML(field.placeholder)}"`
      : "",
    field.required ? "required" : "",
    field.disabled ? "disabled" : "",
    field.readonly ? "readonly" : "",
    field.min !== "" && field.min !== undefined
      ? `min="${escapeHTML(String(field.min))}"`
      : "",
    field.max !== "" && field.max !== undefined
      ? `max="${escapeHTML(String(field.max))}"`
      : "",
    field.step !== "" && field.step !== undefined
      ? `step="${escapeHTML(String(field.step))}"`
      : "",
    field.autocomplete
      ? `autocomplete="${escapeHTML(String(field.autocomplete))}"`
      : "",
    field.inputmode
      ? `inputmode="${escapeHTML(String(field.inputmode))}"`
      : "",
    field.pattern ? `pattern="${escapeHTML(String(field.pattern))}"` : "",
    field.maxlength !== "" && field.maxlength !== undefined
      ? `maxlength="${escapeHTML(String(field.maxlength))}"`
      : "",
    field.minlength !== "" && field.minlength !== undefined
      ? `minlength="${escapeHTML(String(field.minlength))}"`
      : "",
    field.multiple ? "multiple" : "",
    field.accept ? `accept="${escapeHTML(String(field.accept))}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function renderHint(hint = "") {
  const safeHint = safeTrimmedString(hint);
  if (!safeHint) return "";
  return `<p class="field__hint">${escapeHTML(safeHint)}</p>`;
}

function renderErrorSlot(name = "") {
  const safeName = safeTrimmedString(name);
  if (!safeName) return "";
  return `
    <p
      class="field__error"
      data-role="field-error"
      data-field-error="${escapeHTML(safeName)}"
      hidden
    ></p>
  `;
}

function renderLabel(field = {}) {
  if (!field.label) return "";

  return `
    <label
      class="${escapeHTML(classNames("field__label", field.labelClassName))}"
      for="${escapeHTML(field.id || field.name)}"
    >
      ${escapeHTML(text(field.label, field.name || ""))}
      ${field.required ? '<span aria-hidden="true">*</span>' : ""}
    </label>
  `;
}

function renderFieldWrapper(innerHTML, field = {}) {
  if (field.hidden || field.type === "hidden") {
    return innerHTML;
  }

  return `
    <div
      class="${escapeHTML(
        classNames(
          "field",
          `col-${normalizeCol(field.col)}`,
          field.wrapperClassName,
          {
            "field--readonly": field.readonly,
            "field--disabled": field.disabled
          }
        )
      )}"
      data-field="${escapeHTML(field.name || "")}"
      data-field-type="${escapeHTML(field.type || "text")}"
    >
      ${innerHTML}
    </div>
  `;
}

/* ========================================
   RENDER DE CAMPOS
======================================== */

function renderInputField(field = {}) {
  const inputType =
    field.type === "email" ||
    field.type === "password" ||
    field.type === "date" ||
    field.type === "datetime-local" ||
    field.type === "number" ||
    field.type === "time" ||
    field.type === "url" ||
    field.type === "tel" ||
    field.type === "search" ||
    field.type === "range"
      ? field.type
      : "text";

  const content = `
    ${renderLabel(field)}
    <input
      type="${escapeHTML(inputType)}"
      class="${escapeHTML(
        classNames("input", field.className, field.inputClassName)
      )}"
      value="${escapeHTML(fieldValueToString(field.value, ""))}"
      ${buildCommonInputAttrs(field)}
    />
    ${renderHint(field.hint)}
    ${renderErrorSlot(field.name)}
  `;

  return renderFieldWrapper(content, field);
}

function renderTextareaField(field = {}) {
  const content = `
    ${renderLabel(field)}
    <textarea
      class="${escapeHTML(
        classNames("textarea", field.className, field.inputClassName)
      )}"
      rows="${escapeHTML(String(field.rows || 4))}"
      ${buildCommonInputAttrs(field)}
    >${escapeHTML(fieldValueToString(field.value, ""))}</textarea>
    ${renderHint(field.hint)}
    ${renderErrorSlot(field.name)}
  `;

  return renderFieldWrapper(content, field);
}

function renderSelectField(field = {}) {
  const options = normalizeOptions(field.options);
  const currentValue = fieldValueToString(field.value, "");
  const includePlaceholder = safeTrimmedString(field.placeholder) !== "";

  const optionsHTML = [
    includePlaceholder
      ? `<option value="">${escapeHTML(field.placeholder)}</option>`
      : "",
    ...options.map((option) => {
      const isSelected =
        String(option.value) === String(currentValue) || option.selected === true;

      return `
        <option
          value="${escapeHTML(option.value)}"
          ${isSelected ? "selected" : ""}
          ${option.disabled ? "disabled" : ""}
        >
          ${escapeHTML(option.label)}
        </option>
      `;
    })
  ].join("");

  const content = `
    ${renderLabel(field)}
    <select
      class="${escapeHTML(
        classNames("select", field.className, field.inputClassName)
      )}"
      ${buildCommonInputAttrs(field)}
    >
      ${optionsHTML}
    </select>
    ${renderHint(field.hint)}
    ${renderErrorSlot(field.name)}
  `;

  return renderFieldWrapper(content, field);
}

function renderMultiSelectField(field = {}) {
  const options = normalizeOptions(field.options);
  const selectedValues = Array.isArray(field.value)
    ? field.value.map((item) => String(item))
    : [];

  const content = `
    ${renderLabel(field)}
    <select
      class="${escapeHTML(
        classNames("select", field.className, field.inputClassName)
      )}"
      ${buildCommonInputAttrs({ ...field, multiple: true })}
    >
      ${options
        .map((option) => {
          const isSelected =
            selectedValues.includes(String(option.value)) || option.selected === true;

          return `
            <option
              value="${escapeHTML(option.value)}"
              ${isSelected ? "selected" : ""}
              ${option.disabled ? "disabled" : ""}
            >
              ${escapeHTML(option.label)}
            </option>
          `;
        })
        .join("")}
    </select>
    ${renderHint(field.hint)}
    ${renderErrorSlot(field.name)}
  `;

  return renderFieldWrapper(content, field);
}

function renderCheckboxField(field = {}) {
  const checked = toBoolean(field.value, false);

  const content = `
    <div class="field__checkbox">
      <input
        type="hidden"
        name="${escapeHTML(field.name)}__unchecked"
        value="${escapeHTML(field.uncheckedValue ?? "")}"
        data-role="checkbox-unchecked-shadow"
      />
      <label class="checkbox">
        <input
          type="checkbox"
          id="${escapeHTML(field.id || field.name)}"
          name="${escapeHTML(field.name)}"
          value="${escapeHTML(field.checkedValue ?? "1")}"
          class="${escapeHTML(
            classNames("checkbox__input", field.className, field.inputClassName)
          )}"
          ${checked ? "checked" : ""}
          ${field.disabled ? "disabled" : ""}
          ${field.readonly ? "disabled" : ""}
        />
        <span>${escapeHTML(text(field.label, field.name || ""))}</span>
      </label>
    </div>
    ${renderHint(field.hint)}
    ${renderErrorSlot(field.name)}
  `;

  return renderFieldWrapper(content, field);
}

function renderRadioField(field = {}) {
  const options = normalizeOptions(field.options);
  const currentValue = fieldValueToString(field.value, "");

  const content = `
    ${field.label ? `<p class="field__label">${escapeHTML(field.label)}</p>` : ""}
    <div class="field__radios" role="radiogroup" aria-label="${escapeHTML(
      field.label || field.name || "Opciones"
    )}">
      ${options
        .map((option, index) => {
          const inputId = `${field.id || field.name}-${index}`;
          const isChecked =
            String(option.value) === String(currentValue) || option.selected === true;

          return `
            <label class="radio">
              <input
                type="radio"
                id="${escapeHTML(inputId)}"
                name="${escapeHTML(field.name)}"
                value="${escapeHTML(option.value)}"
                ${isChecked ? "checked" : ""}
                ${field.disabled || option.disabled ? "disabled" : ""}
              />
              <span>${escapeHTML(option.label)}</span>
            </label>
          `;
        })
        .join("")}
    </div>
    ${renderHint(field.hint)}
    ${renderErrorSlot(field.name)}
  `;

  return renderFieldWrapper(content, field);
}

function renderStaticField(field = {}) {
  const content = `
    ${field.label ? `<p class="field__label">${escapeHTML(field.label)}</p>` : ""}
    <div class="${escapeHTML(classNames("field__static", field.className))}">
      ${escapeHTML(fieldValueToString(field.value, getLabel?.("sinDatos", "Sin datos") || "Sin datos"))}
    </div>
    ${renderHint(field.hint)}
  `;

  return renderFieldWrapper(content, field);
}

function renderDividerField(field = {}) {
  const title = safeTrimmedString(field.label || field.title);
  const content = `
    <div class="form-divider">
      ${title ? `<p class="form-divider__title">${escapeHTML(title)}</p>` : ""}
    </div>
  `;

  return renderFieldWrapper(content, {
    ...field,
    col: field.col || 12
  });
}

function renderCustomField(field = {}) {
  const html = safeString(field.html, "");
  return renderFieldWrapper(html, field);
}

function renderHiddenField(field = {}) {
  return `
    <input
      type="hidden"
      id="${escapeHTML(field.id || field.name)}"
      name="${escapeHTML(field.name)}"
      value="${escapeHTML(fieldValueToString(field.value, ""))}"
    />
  `;
}

function renderField(field = {}, values = {}) {
  const runtimeField = withFieldRuntime(field, values);

  switch (runtimeField.type) {
    case "textarea":
      return renderTextareaField(runtimeField);
    case "select":
      return renderSelectField(runtimeField);
    case "multiselect":
      return renderMultiSelectField(runtimeField);
    case "checkbox":
      return renderCheckboxField(runtimeField);
    case "radio":
      return renderRadioField(runtimeField);
    case "hidden":
      return renderHiddenField(runtimeField);
    case "static":
    case "readonly":
      return renderStaticField(runtimeField);
    case "divider":
      return renderDividerField(runtimeField);
    case "custom":
      return renderCustomField(runtimeField);
    default:
      return renderInputField(runtimeField);
  }
}

function renderFields(fields = [], values = {}) {
  return ensureArray(fields)
    .map((field) => renderField(field, values))
    .join("");
}

/* ========================================
   DATOS DEL FORMULARIO
======================================== */

function cleanupCheckboxShadowValues(values = {}) {
  const next = { ...values };

  Object.keys(next).forEach((key) => {
    if (key.endsWith("__unchecked")) {
      delete next[key];
    }
  });

  return next;
}

function normalizeCheckboxValues(formElement, values = {}) {
  const next = { ...values };

  qsa('input[type="checkbox"][name]', formElement).forEach((checkbox) => {
    const name = checkbox.name;
    if (!name) return;

    if (checkbox.checked) {
      next[name] = checkbox.value || "1";
    } else {
      const shadowField = qs(
        `[name="${CSS.escape(name)}__unchecked"]`,
        formElement
      );
      next[name] = shadowField ? shadowField.value : "";
    }
  });

  return next;
}

function normalizeMultiSelectValues(formElement, values = {}) {
  qsa("select[multiple][name]", formElement).forEach((select) => {
    const selectedValues = Array.from(select.selectedOptions).map(
      (option) => option.value
    );
    values[select.name] = selectedValues;
  });

  return values;
}

export function readFormData(formElement) {
  if (!(formElement instanceof HTMLFormElement)) return {};

  let values = formToObject(formElement);
  values = cleanupCheckboxShadowValues(values);
  values = normalizeCheckboxValues(formElement, values);
  values = normalizeMultiSelectValues(formElement, values);

  return values;
}

export function patchFormValues(formElement, values = {}) {
  if (!(formElement instanceof HTMLFormElement) || !isPlainObject(values)) return;

  fillForm(formElement, values);

  Object.entries(values).forEach(([name, value]) => {
    const field = formElement.elements.namedItem(name);
    if (!field) return;

    if (field instanceof RadioNodeList) {
      Array.from(field).forEach((node) => {
        if (node instanceof HTMLInputElement && node.type === "checkbox") {
          node.checked = toBoolean(value, false);
        } else if (node instanceof HTMLInputElement && node.type === "radio") {
          node.checked = String(node.value) === String(value);
        }
      });
      return;
    }

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      field.checked = toBoolean(value, false);
      return;
    }

    if (field instanceof HTMLSelectElement && field.multiple) {
      const selectedValues = Array.isArray(value)
        ? value.map((item) => String(item))
        : [];
      Array.from(field.options).forEach((option) => {
        option.selected = selectedValues.includes(String(option.value));
      });
      return;
    }

    if ("value" in field) {
      field.value = value ?? "";
    }
  });
}

export function resetFormModal(formElement, options = {}) {
  if (!(formElement instanceof HTMLFormElement)) return;

  resetForm(formElement, { clearValidation: true });

  if (isPlainObject(options.values)) {
    patchFormValues(formElement, options.values);
  }
}

/* ========================================
   VALIDACIÓN
======================================== */

function getFieldMeta(fields = [], fieldName = "") {
  return ensureArray(fields).find(
    (field) => safeTrimmedString(field?.name) === safeTrimmedString(fieldName)
  );
}

function getFieldInput(formElement, fieldName = "") {
  if (!(formElement instanceof HTMLFormElement) || !fieldName) return null;

  const field = formElement.elements.namedItem(fieldName);
  if (field instanceof RadioNodeList) {
    return field[0] || null;
  }
  return field;
}

function setFieldErrorInternal(formElement, fieldName, message = "") {
  const fieldInput = getFieldInput(formElement, fieldName);
  if (fieldInput) {
    setFieldErrorUtil(fieldInput, message);
  }
}

function clearFieldErrorInternal(formElement, fieldName) {
  const fieldInput = getFieldInput(formElement, fieldName);
  if (fieldInput) {
    clearFieldErrorUtil(fieldInput);
  }
}

export function clearFormErrors(formElement) {
  if (!(formElement instanceof HTMLFormElement)) return;
  clearFormValidation(formElement);

  const formError = qs('[data-role="form-error"]', formElement);
  if (formError) {
    formError.hidden = true;
    formError.textContent = "";
  }
}

export function setFieldError(formElement, fieldName, message = "") {
  if (!(formElement instanceof HTMLFormElement) || !fieldName) return;
  setFieldErrorInternal(formElement, fieldName, message);
}

export function setFormError(formElement, message = "") {
  if (!(formElement instanceof HTMLFormElement)) return;

  let formError = qs('[data-role="form-error"]', formElement);

  if (!formError) {
    formError = createElement("p", {
      className: "form__error",
      attrs: {
        "data-role": "form-error"
      }
    });
    formElement.prepend(formError);
  }

  formError.hidden = false;
  formError.textContent = safeString(message, "Ocurrió un error.");
}

function defaultFieldValidator(field = {}, value, allValues = {}) {
  if (!field?.required) return "";

  if (field.type === "checkbox") {
    if (!validateRequired(toBoolean(value, false))) {
      return field.requiredMessage || "Este campo es obligatorio.";
    }
    return "";
  }

  if (field.type === "multiselect") {
    if (!Array.isArray(value) || value.length === 0) {
      return field.requiredMessage || "Debes seleccionar al menos una opción.";
    }
    return "";
  }

  if (!validateRequired(value)) {
    return field.requiredMessage || "Este campo es obligatorio.";
  }

  if (
    field.type === "number" &&
    safeTrimmedString(value) !== "" &&
    Number.isNaN(Number(value))
  ) {
    return "Debes ingresar un número válido.";
  }

  if (
    field.type === "number" &&
    safeTrimmedString(value) !== "" &&
    field.min !== "" &&
    toNumber(value, NaN) < toNumber(field.min, NaN)
  ) {
    return `El valor mínimo es ${field.min}.`;
  }

  if (
    field.type === "number" &&
    safeTrimmedString(value) !== "" &&
    field.max !== "" &&
    toNumber(value, NaN) > toNumber(field.max, NaN)
  ) {
    return `El valor máximo es ${field.max}.`;
  }

  if (typeof field.validate === "function") {
    const customMessage = field.validate(value, allValues, field);
    if (typeof customMessage === "string" && customMessage.trim()) {
      return customMessage;
    }
  }

  return "";
}

export function validateFormData(formElement, fields = [], values = {}) {
  const errors = {};

  ensureArray(fields).forEach((field) => {
    const type = normalizeFieldType(field?.type);
    const name = safeTrimmedString(field?.name);

    if (!name || ["hidden", "custom", "divider", "static", "readonly"].includes(type)) {
      return;
    }

    const message = defaultFieldValidator(field, values[name], values);
    if (message) {
      errors[name] = message;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function applyFormErrors(formElement, errors = {}) {
  if (!(formElement instanceof HTMLFormElement) || !isPlainObject(errors)) return;

  Object.entries(errors).forEach(([fieldName, message]) => {
    setFieldErrorInternal(formElement, fieldName, message);
  });
}

/* ========================================
   SUBMITTING / ESTADOS
======================================== */

export function setFormSubmitting(formElement, isSubmitting = false) {
  if (!(formElement instanceof HTMLFormElement)) return;

  qsa("input, select, textarea, button", formElement).forEach((control) => {
    if (isSubmitting) {
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

  formElement.dataset.submitting = isSubmitting ? "true" : "false";
}

export function setSubmitButtonState(
  formElement,
  {
    disabled = false,
    label = "",
    loading = false,
    selector = '[data-role="form-submit"]'
  } = {}
) {
  if (!(formElement instanceof HTMLFormElement)) return;

  const submitButton = qs(selector, formElement) || qs(selector, document);
  if (!submitButton) return;

  if (!submitButton.dataset.originalLabel) {
    submitButton.dataset.originalLabel = submitButton.textContent || "";
  }

  submitButton.disabled = Boolean(disabled || loading);
  submitButton.setAttribute("aria-busy", loading ? "true" : "false");

  if (label) {
    submitButton.textContent = label;
  } else if (!loading) {
    submitButton.textContent =
      submitButton.dataset.originalLabel || submitButton.textContent;
  }
}

/* ========================================
   HTML DEL MODAL
======================================== */

export function createFormModalHTML({
  modalId = "",
  formId = "",
  title = "",
  subtitle = "",
  description = "",
  fields = [],
  values = {},
  submitLabel = DEFAULT_SUBMIT_LABEL,
  cancelLabel = DEFAULT_CANCEL_LABEL,
  submitVariant = "primary",
  submitAttrs = 'data-role="form-submit"',
  size = DEFAULT_FORM_SIZE,
  formClassName = "",
  bodyClassName = "",
  footerActions = null,
  mode = "create",
  formKey = ""
} = {}) {
  const resolvedSubmitLabel = resolveSubmitLabel({
    submitLabel,
    formKey,
    mode
  });

  const content = `
    <div class="${escapeHTML(classNames("form-modal", bodyClassName))}">
      ${
        description
          ? `<p class="form-modal__description">${escapeHTML(description)}</p>`
          : ""
      }

      <form
        id="${escapeHTML(formId)}"
        class="${escapeHTML(classNames("form", formClassName))}"
        novalidate
      >
        <div class="form-grid">
          ${renderFields(fields, values)}
        </div>
      </form>
    </div>
  `;

  const footer =
    footerActions ||
    renderModalActions(
      [
        {
          label: cancelLabel || getLabel?.("cancelar", DEFAULT_CANCEL_LABEL),
          variant: "ghost",
          attrs: "data-modal-close"
        },
        {
          label: resolvedSubmitLabel,
          variant: submitVariant,
          type: "submit",
          attrs: `${submitAttrs} form="${escapeHTML(formId)}"`
        }
      ],
      { align: "end" }
    );

  return createModalHTML({
    id: modalId,
    title,
    subtitle,
    content,
    footer,
    size: safeModalSize(size)
  });
}

/* ========================================
   API PRINCIPAL
======================================== */

function getDefaultFocusSelector(fields = []) {
  const firstVisibleField = ensureArray(fields).find((field) => {
    const type = normalizeFieldType(field?.type);
    return (
      field?.name &&
      !field?.hidden &&
      !field?.disabled &&
      !["hidden", "custom", "divider", "static", "readonly"].includes(type)
    );
  });

  if (!firstVisibleField?.name) {
    return 'input:not([type="hidden"]), select, textarea, button';
  }

  return `[name="${CSS.escape(firstVisibleField.name)}"]`;
}

function createFormController({
  modalId,
  modalElement,
  formElement,
  fields = [],
  close
}) {
  return {
    modalId,
    modalElement,
    formElement,
    fields,

    readValues() {
      return readFormData(formElement);
    },

    patchValues(nextValues = {}) {
      patchFormValues(formElement, nextValues);
    },

    reset(options = {}) {
      resetFormModal(formElement, options);
    },

    focusFirstField() {
      return focusFirstFocusable(formElement);
    },

    clearErrors() {
      clearFormErrors(formElement);
    },

    setFieldError(fieldName, message) {
      setFieldError(formElement, fieldName, message);
    },

    clearFieldError(fieldName) {
      clearFieldErrorInternal(formElement, fieldName);
    },

    setFormError(message) {
      setFormError(formElement, message);
    },

    setSubmitting(isSubmitting, options = {}) {
      setFormSubmitting(formElement, isSubmitting);
      setSubmitButtonState(formElement, {
        ...options,
        disabled: isSubmitting || options.disabled
      });
    },

    validate(values = null) {
      const currentValues = values || readFormData(formElement);
      return validateFormData(formElement, fields, currentValues);
    },

    close
  };
}

export function openFormModal(config = {}) {
  const {
    modalId = `form-modal-${createId("fm")}`,
    title = "",
    subtitle = "",
    description = "",
    fields = [],
    values = {},
    submitLabel = "",
    cancelLabel = "",
    submitVariant = "primary",
    size = DEFAULT_FORM_SIZE,
    formClassName = "",
    bodyClassName = "",
    focusSelector = "",
    footerActions = null,
    formKey = "",
    mode = "create",
    closeOnSuccess = true,
    validateBeforeSubmit = true,
    onValidate = null,
    onOpen = null,
    onSubmit = null,
    onClose = null
  } = config;

  const formId = `${modalId}-form`;

  removeModal(modalId);

  const modalHTML = createFormModalHTML({
    modalId,
    formId,
    title,
    subtitle,
    description,
    fields,
    values,
    submitLabel,
    cancelLabel,
    submitVariant,
    size,
    formClassName,
    bodyClassName,
    footerActions,
    formKey,
    mode
  });

  const modalElement = mountModal(modalHTML);
  const formElement = qs("form", modalElement);

  let isClosed = false;

  const close = () => {
    if (isClosed) return;
    isClosed = true;

    closeModal(modalId);

    if (typeof onClose === "function") {
      onClose({
        modalId,
        modalElement,
        formElement
      });
    }
  };

  const controller = createFormController({
    modalId,
    modalElement,
    formElement,
    fields,
    close
  });

  if (formElement && typeof onSubmit === "function") {
    formElement.addEventListener("submit", async (event) => {
      event.preventDefault();

      controller.clearErrors();

      const valuesToSubmit = controller.readValues();

      if (validateBeforeSubmit) {
        const validation =
          typeof onValidate === "function"
            ? onValidate(valuesToSubmit, controller)
            : controller.validate(valuesToSubmit);

        if (validation && validation.isValid === false) {
          applyFormErrors(formElement, validation.errors || {});

          const firstErrorFieldName = Object.keys(validation.errors || {})[0];
          const firstField = firstErrorFieldName
            ? getFieldInput(formElement, firstErrorFieldName)
            : null;

          firstField?.focus?.();
          return;
        }
      }

      try {
        controller.setSubmitting(true, {
          loading: true
        });

        const result = await onSubmit(valuesToSubmit, controller);

        controller.setSubmitting(false, {
          loading: false
        });

        if (closeOnSuccess !== false && result?.close !== false) {
          close();
        }
      } catch (error) {
        console.error("[form-modal] Error en submit:", error);

        controller.setSubmitting(false, {
          loading: false
        });

        if (isPlainObject(error?.fieldErrors)) {
          applyFormErrors(formElement, error.fieldErrors);
        }

        controller.setFormError(
          error?.message || "No se pudo procesar el formulario."
        );
      }
    });
  }

  openModal(modalId, {
    focusSelector: focusSelector || getDefaultFocusSelector(fields)
  });

  if (typeof onOpen === "function") {
    onOpen(controller);
  }

  return {
    modalId,
    modalElement,
    formElement,
    ...controller
  };
}

/* ========================================
   FACTORIES ESPECÍFICOS
======================================== */

export function openCrudFormModal(config = {}) {
  return openFormModal(config);
}

export function buildReadonlyDetailFields(items = []) {
  return ensureArray(items).map((item) => ({
    type: item?.type || "static",
    name: item?.name,
    label: item?.label,
    value: item?.value,
    col: item?.col || 12,
    hint: item?.hint || ""
  }));
}
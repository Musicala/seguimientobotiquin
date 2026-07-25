/* ======================================================================
   ui/modal.js — MODALES Y FORMULARIOS

   Reemplaza ui/modals.js (994) + ui/form-modal.js (1.237).

   Los tres bugs de la versión anterior se eliminan por diseño:

   1. "Este campo es obligatorio" con los campos llenos.
      Causa: el modal se construía, y después de un `await` se volvía a
      construir; lo que la persona había escrito se perdía y la
      validación leía un formulario vacío. Aquí `abrirFormulario` es
      síncrono y solo recibe datos ya cargados. No hay await de por medio.

   2. `onInit` y `type: "html"` no existían.
      Se pasaban en reposiciones e inspecciones y se ignoraban en
      silencio, así que el autocompletado del formulario nunca corría.
      Aquí hay un único callback (`alAbrir`) y un único tipo libre
      (`nota`), ambos reales.

   3. El botón de guardar quedaba deshabilitado tras un error.
      Ahora el estado de envío se restaura siempre, en un `finally`.
====================================================================== */

import { $, $$, html, crudo, pintar, escapar } from "./dom.js";
import { aFechaLatam, normalizarFechaEntrada } from "../core/model.js";

let contenedor = null;
let abiertos = 0;

function raiz() {
  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.className = "modales";
    document.body.appendChild(contenedor);
  }
  return contenedor;
}

/* ======================================
   MODAL BASE
====================================== */

/**
 * Abre un modal. Devuelve { elemento, cerrar }.
 */
export function abrirModal({ titulo = "", subtitulo = "", cuerpo = "", pie = "", ancho = "md", alCerrar = null }) {
  const nodo = document.createElement("div");
  nodo.className = `modal modal--${ancho}`;
  nodo.setAttribute("role", "dialog");
  nodo.setAttribute("aria-modal", "true");
  nodo.setAttribute("aria-label", titulo || "Ventana");

  pintar(
    nodo,
    html`
      <div class="modal__fondo" data-cerrar></div>
      <div class="modal__caja">
        <header class="modal__cabecera">
          <div>
            <h2 class="modal__titulo">${titulo}</h2>
            ${subtitulo ? html`<p class="modal__subtitulo">${subtitulo}</p>` : ""}
          </div>
          <button type="button" class="modal__cerrar" data-cerrar aria-label="Cerrar">×</button>
        </header>
        <div class="modal__cuerpo">${crudo(cuerpo?.valor ?? cuerpo)}</div>
        ${pie ? html`<footer class="modal__pie">${crudo(pie?.valor ?? pie)}</footer>` : ""}
      </div>
    `
  );

  raiz().appendChild(nodo);
  abiertos += 1;
  document.body.classList.add("sin-scroll");

  let cerrado = false;

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;

    nodo.remove();
    abiertos = Math.max(0, abiertos - 1);
    if (abiertos === 0) document.body.classList.remove("sin-scroll");

    document.removeEventListener("keydown", alPresionarTecla);
    alCerrar?.();
  };

  const alPresionarTecla = (e) => {
    if (e.key === "Escape") cerrar();
  };

  document.addEventListener("keydown", alPresionarTecla);
  $$("[data-cerrar]", nodo).forEach((btn) => btn.addEventListener("click", cerrar));

  // El foco entra al modal para que el teclado funcione de inmediato.
  requestAnimationFrame(() => {
    const primero = $("input:not([type=hidden]), select, textarea, button:not([data-cerrar])", nodo);
    primero?.focus();
  });

  return { elemento: nodo, cerrar };
}

/* ======================================
   CONFIRMACIÓN
====================================== */

export function confirmar({ titulo = "¿Confirmas?", mensaje = "", etiquetaOk = "Confirmar", peligro = false }) {
  return new Promise((resolver) => {
    const { elemento, cerrar } = abrirModal({
      titulo,
      cuerpo: html`<p class="texto">${mensaje}</p>`,
      pie: html`
        <button type="button" class="btn btn--fantasma" data-no>Cancelar</button>
        <button type="button" class="btn ${peligro ? "btn--peligro" : "btn--primario"}" data-si>${etiquetaOk}</button>
      `,
      ancho: "sm",
      alCerrar: () => resolver(false)
    });

    $("[data-si]", elemento).addEventListener("click", () => {
      resolver(true);
      cerrar();
    });
    $("[data-no]", elemento).addEventListener("click", cerrar);
  });
}

/* ======================================
   CAMPOS
====================================== */

function pintarCampo(campo) {
  const {
    tipo = "texto",
    nombre = "",
    etiqueta = "",
    valor = "",
    ayuda = "",
    requerido = false,
    soloLectura = false,
    opciones = [],
    min,
    max,
    paso,
    ancho = 12,
    filas = 3
  } = campo;

  // Bloque libre para explicar contexto. Antes se pasaba como
  // `type: "html"`, que no existía y se renderizaba como un input vacío.
  if (tipo === "nota") {
    return html`<div class="campo campo--${ancho}"><div class="nota">${crudo(campo.contenido?.valor ?? campo.contenido ?? "")}</div></div>`;
  }

  const attrs = [
    `name="${escapar(nombre)}"`,
    `id="campo-${escapar(nombre)}"`,
    requerido ? "required" : "",
    soloLectura ? "readonly" : "",
    min !== undefined ? `min="${escapar(min)}"` : "",
    max !== undefined ? `max="${escapar(max)}"` : "",
    paso !== undefined ? `step="${escapar(paso)}"` : ""
  ]
    .filter(Boolean)
    .join(" ");

  let control;

  if (tipo === "select") {
    const items = opciones
      .map((op) => {
        const v = typeof op === "object" ? op.valor : op;
        const t = typeof op === "object" ? op.etiqueta : op;
        return `<option value="${escapar(v)}"${String(v) === String(valor) ? " selected" : ""}>${escapar(t)}</option>`;
      })
      .join("");
    control = `<select class="control" ${attrs}>${items}</select>`;
  } else if (tipo === "textarea") {
    control = `<textarea class="control" rows="${filas}" ${attrs}>${escapar(valor)}</textarea>`;
  } else {
    // Los selectores nativos de fecha cambian el orden de escritura según
    // navegador/SO. Aquí siempre se muestra y captura dd/mm/aaaa.
    const tipoInput = { numero: "number", fecha: "text", texto: "text" }[tipo] || tipo;
    const fechaAttrs = tipo === "fecha" ? ' inputmode="numeric" placeholder="dd/mm/aaaa" autocomplete="off"' : "";
    const valorVisible = tipo === "fecha" ? aFechaLatam(valor) : valor;
    control = `<input type="${escapar(tipoInput)}" class="control" value="${escapar(valorVisible)}" ${attrs}${fechaAttrs} />`;
  }

  return html`
    <div class="campo campo--${ancho}">
      <label class="campo__etiqueta" for="campo-${nombre}">
        ${etiqueta}${requerido ? crudo(' <span class="campo__req">*</span>') : ""}
      </label>
      ${crudo(control)}
      ${ayuda ? html`<p class="campo__ayuda">${ayuda}</p>` : ""}
      <p class="campo__error" data-error="${nombre}" hidden></p>
    </div>
  `;
}

/* ======================================
   FORMULARIO
====================================== */

/**
 * Abre un formulario modal.
 *
 * Importante: `campos` debe construirse con datos que YA estén en
 * memoria. Esta función no espera nada ni vuelve a dibujarse; si
 * necesitas cargar algo, hazlo antes de llamarla.
 *
 * `alEnviar(valores, api)` puede ser async. Si lanza, el mensaje se
 * muestra en el formulario y el modal queda abierto con lo escrito.
 * Para marcar un campo concreto, lanza un error con `.campos = {nombre: mensaje}`.
 */
export function abrirFormulario({
  titulo,
  subtitulo = "",
  campos = [],
  etiquetaEnviar = "Guardar",
  ancho = "md",
  alEnviar,
  alAbrir = null,
  alCerrar = null
}) {
  const cuerpo = html`
    <form class="formulario" novalidate>
      <p class="formulario__error" data-error-general hidden></p>
      <div class="rejilla">${campos.map(pintarCampo)}</div>
    </form>
  `;

  const { elemento, cerrar } = abrirModal({
    titulo,
    subtitulo,
    cuerpo,
    ancho,
    alCerrar,
    pie: html`
      <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
      <button type="submit" class="btn btn--primario" data-enviar>${etiquetaEnviar}</button>
    `
  });

  const form = $("form", elemento);
  const btnEnviar = $("[data-enviar]", elemento);
  const errorGeneral = $("[data-error-general]", elemento);

  const leer = () => {
    const valores = Object.fromEntries(new FormData(form).entries());
    campos.filter((campo) => campo.tipo === "fecha" && campo.nombre).forEach((campo) => {
      const normalizada = normalizarFechaEntrada(valores[campo.nombre]);
      if (normalizada !== null) valores[campo.nombre] = normalizada;
    });
    return valores;
  };

  const limpiarErrores = () => {
    errorGeneral.hidden = true;
    errorGeneral.textContent = "";
    $$("[data-error]", elemento).forEach((n) => {
      n.hidden = true;
      n.textContent = "";
    });
    $$(".control", elemento).forEach((c) => c.classList.remove("es-invalido"));
  };

  const marcarError = (nombre, mensaje) => {
    const nodo = $(`[data-error="${CSS.escape(nombre)}"]`, elemento);
    if (nodo) {
      nodo.textContent = mensaje;
      nodo.hidden = false;
    }
    form.elements[nombre]?.classList.add("es-invalido");
  };

  const validar = (valores) => {
    const errores = {};

    campos.forEach((campo) => {
      if (campo.tipo === "nota" || !campo.nombre) return;

      const valor = String(valores[campo.nombre] ?? "").trim();

      if (campo.requerido && !valor) {
        errores[campo.nombre] = "Este campo es obligatorio.";
        return;
      }

      if (campo.tipo === "numero" && valor !== "") {
        const n = Number(valor);
        if (Number.isNaN(n)) errores[campo.nombre] = "Debe ser un número.";
        else if (campo.min !== undefined && n < campo.min) errores[campo.nombre] = `El mínimo es ${campo.min}.`;
        else if (campo.max !== undefined && n > campo.max) errores[campo.nombre] = `El máximo es ${campo.max}.`;
      }

      if (campo.tipo === "fecha" && valor !== "" && !normalizarFechaEntrada(valor)) {
        errores[campo.nombre] = "Escribe una fecha válida como dd/mm/aaaa.";
      }

      if (campo.validar && !errores[campo.nombre]) {
        const mensaje = campo.validar(valor, valores);
        if (mensaje) errores[campo.nombre] = mensaje;
      }
    });

    return errores;
  };

  const enviar = async (e) => {
    e?.preventDefault();
    limpiarErrores();

    const valores = leer();
    const errores = validar(valores);

    if (Object.keys(errores).length) {
      Object.entries(errores).forEach(([nombre, mensaje]) => marcarError(nombre, mensaje));
      form.elements[Object.keys(errores)[0]]?.focus();
      return;
    }

    const etiquetaOriginal = btnEnviar.textContent;
    btnEnviar.disabled = true;
    btnEnviar.textContent = "Guardando...";
    form.classList.add("esta-enviando");

    try {
      await alEnviar(valores, { cerrar, elemento });
      cerrar();
    } catch (error) {
      console.error("[formulario]", error);

      if (error?.campos) {
        Object.entries(error.campos).forEach(([n, m]) => marcarError(n, m));
      }

      errorGeneral.textContent = error?.message || "No se pudo guardar.";
      errorGeneral.hidden = false;
    } finally {
      // Siempre: si esto viviera en el `catch`, un error dejaría el
      // botón deshabilitado para siempre y habría que recargar.
      btnEnviar.disabled = false;
      btnEnviar.textContent = etiquetaOriginal;
      form.classList.remove("esta-enviando");
    }
  };

  form.addEventListener("submit", enviar);
  btnEnviar.addEventListener("click", enviar);

  alAbrir?.({ formulario: form, elemento, leer, cerrar });

  return { elemento, cerrar, formulario: form };
}

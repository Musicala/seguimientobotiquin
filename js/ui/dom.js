/* ======================================================================
   ui/dom.js — UTILIDADES DE DOM Y FORMATO

   Reemplaza js/utils.js (1.788 líneas). Aquí solo queda lo que la app
   usa de verdad.
====================================================================== */

import { LOCALE } from "../core/config.js";

/* ======================================
   SELECCIÓN Y EVENTOS
====================================== */

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

export function on(elemento, evento, selectorOManejador, manejador) {
  // Forma directa: on(el, "click", fn)
  if (typeof selectorOManejador === "function") {
    elemento.addEventListener(evento, selectorOManejador);
    return;
  }

  // Delegada: on(contenedor, "click", "[data-accion]", fn)
  // Sobrevive a los re-render, que es justo lo que necesitan las listas.
  elemento.addEventListener(evento, (e) => {
    const objetivo = e.target.closest(selectorOManejador);
    if (objetivo && elemento.contains(objetivo)) manejador(e, objetivo);
  });
}

/* ======================================
   HTML

   `html` es una plantilla etiquetada que escapa todo lo interpolado.
   Cualquier dato que venga de Sheets pasa por aquí; para inyectar
   marcado ya construido se usa `crudo()`.
====================================================================== */

const MARCA_CRUDO = Symbol("html-crudo");

export function crudo(cadena) {
  return { [MARCA_CRUDO]: true, valor: String(cadena) };
}

export function escapar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function interpolar(valor) {
  if (valor === null || valor === undefined || valor === false) return "";
  if (valor?.[MARCA_CRUDO]) return valor.valor;
  if (Array.isArray(valor)) return valor.map(interpolar).join("");
  return escapar(valor);
}

export function html(partes, ...valores) {
  return crudo(partes.reduce((acc, parte, i) => acc + interpolar(valores[i - 1]) + parte));
}

/** Vuelca una plantilla en un contenedor. */
export function pintar(contenedor, plantilla) {
  if (!contenedor) return;
  contenedor.innerHTML = plantilla?.[MARCA_CRUDO] ? plantilla.valor : String(plantilla ?? "");
}

/* ======================================
   FORMATO
====================================== */

const FMT_FECHA = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

export function fmtFecha(valor) {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : FMT_FECHA.format(d);
}

/** "en 12 días", "hace 3 días", "hoy". */
export function fmtDias(dias) {
  if (dias === null || dias === undefined) return "";
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  return dias > 0 ? `en ${dias} días` : `hace ${Math.abs(dias)} días`;
}

/** "3 unidades", "1 unidad" — sin el "1" suelto que salía antes. */
export function fmtCantidad(cantidad, unidad = "unidad") {
  const n = Number(cantidad) || 0;
  const u = String(unidad || "unidad").trim();
  if (n === 1) return `1 ${u}`;
  return `${n} ${u.endsWith("s") ? u : u + "s"}`;
}

export function plural(n, singular, pluralForma) {
  return n === 1 ? singular : (pluralForma || singular + "s");
}

/* ======================================
   VARIOS
====================================== */

export function debounce(fn, ms = 250) {
  let id = null;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

/** "yyyy-mm-dd" de hoy, para inputs de fecha. */
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

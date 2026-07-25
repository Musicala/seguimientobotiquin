/* ======================================================================
   ui/toast.js — AVISOS

   Reemplaza el toast.js anterior (379 líneas).
====================================================================== */

import { escapar } from "./dom.js";

let pila = null;

function raiz() {
  if (!pila) {
    pila = document.createElement("div");
    pila.className = "avisos";
    pila.setAttribute("aria-live", "polite");
    document.body.appendChild(pila);
  }
  return pila;
}

function mostrar(mensaje, tono, duracionMs) {
  const nodo = document.createElement("div");
  nodo.className = `aviso aviso--${tono}`;
  nodo.setAttribute("role", tono === "error" ? "alert" : "status");
  nodo.innerHTML = `<span>${escapar(mensaje)}</span><button type="button" aria-label="Cerrar">×</button>`;

  const quitar = () => {
    nodo.classList.add("se-va");
    setTimeout(() => nodo.remove(), 200);
  };

  nodo.querySelector("button").addEventListener("click", quitar);
  raiz().appendChild(nodo);

  // Los errores se quedan hasta que la persona los cierre: si algo no
  // se guardó, hay que enterarse.
  if (duracionMs) setTimeout(quitar, duracionMs);

  return quitar;
}

export const exito = (mensaje) => mostrar(mensaje, "exito", 3500);
export const info = (mensaje) => mostrar(mensaje, "info", 3500);
export const error = (mensaje) => mostrar(mensaje, "error", 0);

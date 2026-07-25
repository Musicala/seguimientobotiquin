/* ======================================================================
   app.js — ARRANQUE Y NAVEGACIÓN

   Reemplaza app.js (832) + router.js (343).

   La app tiene tres pantallas, no siete. Las anteriores —dashboard,
   botiquines, inventario, inspecciones, alertas— eran cinco formas de
   mirar la misma tabla; ahora son una sola pantalla de revisión con
   filtros. Menos clics para llegar a lo que importa.
====================================================================== */

import * as store from "./core/store.js";
import * as avisar from "./ui/avisos.js";
import { $, $$, html, pintar } from "./ui/dom.js";
import { VISTAS, VISTA_INICIAL, esVistaValida, tituloDeVista } from "./core/config.js";

import * as revision from "./vistas/revision.js";
import * as pedido from "./vistas/pedido.js";
import * as historial from "./vistas/historial.js";

const vistas = { revision, pedido, historial };

/* ======================================
   NAVEGACIÓN
====================================== */

function vistaDeLaUrl() {
  const id = (location.hash || "").replace(/^#/, "").trim();
  return esVistaValida(id) ? id : VISTA_INICIAL;
}

function irA(id) {
  const destino = esVistaValida(id) ? id : VISTA_INICIAL;

  store.irA(destino);
  document.title = `${tituloDeVista(destino)} · Musicala`;

  $$("[data-vista]").forEach((enlace) => {
    const activo = enlace.dataset.vista === destino;
    enlace.classList.toggle("es-activo", activo);
    enlace.setAttribute("aria-current", activo ? "page" : "false");
  });

  $$("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== destino;
  });

  $("#tituloVista").textContent = tituloDeVista(destino);

  vistas[destino]?.pintarVista();
}

/* ======================================
   ESTADO DE CONEXIÓN
====================================== */

function pintarEstadoConexion() {
  const s = store.obtener();
  const chip = $("#estadoConexion");
  if (!chip) return;

  if (s.cargando) {
    chip.className = "chip chip--cargando";
    chip.textContent = "Sincronizando...";
    return;
  }

  if (s.error) {
    chip.className = "chip chip--error";
    chip.textContent = "Sin conexión";
    return;
  }

  chip.className = "chip chip--ok";
  chip.textContent = s.ultimaCarga
    ? `Al día · ${s.ultimaCarga.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
    : "Conectado";
}

/**
 * Cuando la hoja trae filas sin ID, hay que decirlo: son ítems que la
 * app no puede editar. Antes se les inventaba un ID y el problema
 * quedaba invisible hasta que una edición se perdía en silencio.
 */
function avisarFilasInvalidas() {
  const { filasInvalidas } = store.obtener();
  if (!filasInvalidas.length) return;

  avisar.error(
    `${filasInvalidas.length} fila(s) de la hoja no tienen ID y no se pueden editar. ` +
      `Revisa: ${filasInvalidas.slice(0, 3).map((f) => f.motivo).join("; ")}`
  );
}

/* ======================================
   INICIO
====================================== */

function construirMenu() {
  const nav = $("#menu");

  pintar(
    nav,
    html`
      ${VISTAS.map(
        (v) => html`
          <a href="#${v.id}" class="menu__enlace" data-vista="${v.id}">
            <span aria-hidden="true">${v.icono}</span>
            <span>${v.etiqueta}</span>
          </a>
        `
      )}
    `
  );
}

async function iniciar() {
  construirMenu();

  revision.montar($('[data-panel="revision"]'));
  pedido.montar($('[data-panel="pedido"]'));
  historial.montar($('[data-panel="historial"]'));

  // Un solo suscriptor: cuando el estado cambia, se repinta la vista
  // que esté visible. Las otras se repintan al entrar.
  store.suscribir(() => {
    pintarEstadoConexion();
    vistas[store.obtener().vista]?.pintarVista();
  });

  window.addEventListener("hashchange", () => irA(vistaDeLaUrl()));

  irA(vistaDeLaUrl());

  await store.cargar();

  const s = store.obtener();

  if (s.error) {
    avisar.error(`No se pudo conectar: ${s.error.message}`);
  } else {
    avisarFilasInvalidas();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}

/* ======================================================================
   vistas/historial.js — REVISIONES Y REPOSICIONES

   Reemplaza modules/reposiciones.js (2.137 líneas).

   Es la trazabilidad para auditoría: qué se revisó, cuándo, quién, y
   qué se repuso. Solo lectura salvo el borrado, porque un histórico
   que se edita no sirve como evidencia.
====================================================================== */

import * as store from "../core/store.js";
import * as avisar from "../ui/avisos.js";
import { confirmar } from "../ui/modal.js";
import { html, pintar, on, fmtFecha } from "../ui/dom.js";

let contenedor = null;
let pestana = "reposiciones";

export function montar(nodo) {
  contenedor = nodo;

  on(contenedor, "click", "[data-pestana]", (e, btn) => {
    pestana = btn.dataset.pestana;
    pintarVista();
  });

  on(contenedor, "click", "[data-borrar]", (e, btn) => borrar(btn.dataset.borrar));
  on(contenedor, "click", "[data-recargar]", () => store.cargar({ refrescar: true }));
}

export function pintarVista() {
  if (!contenedor) return;

  const s = store.obtener();

  pintar(
    contenedor,
    html`
      <div class="tabs">
        <button
          type="button"
          class="tab ${pestana === "reposiciones" ? "es-activo" : ""}"
          data-pestana="reposiciones"
        >
          Reposiciones <span class="tab__cuenta">${s.reposiciones.length}</span>
        </button>
        <button
          type="button"
          class="tab ${pestana === "revisiones" ? "es-activo" : ""}"
          data-pestana="revisiones"
        >
          Revisiones <span class="tab__cuenta">${s.inspecciones.length}</span>
        </button>
      </div>

      ${pestana === "reposiciones" ? tablaReposiciones(s) : tablaRevisiones(s)}
    `
  );
}

function tablaReposiciones(s) {
  if (!s.reposiciones.length) {
    return vacio("📦", "Sin reposiciones", "Cuando registres una reposición, quedará aquí.");
  }

  const ordenadas = [...s.reposiciones].sort((a, b) => (b.fecha || 0) - (a.fecha || 0));

  return html`
    <table class="tabla">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Elemento</th>
          <th class="tabla__num">Cantidad</th>
          <th>Responsable</th>
          <th>Motivo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${ordenadas.map(
          (r) => html`
            <tr>
              <td>${fmtFecha(r.fecha)}</td>
              <td>
                <strong>${r.nombre || r.itemId}</strong>
                <span class="tabla__tenue"> · ${r.botiquinId}</span>
              </td>
              <td class="tabla__num">${r.cantidad} ${r.unidad || ""}</td>
              <td>${r.responsable || "—"}</td>
              <td class="tabla__tenue">${r.motivo || "—"}</td>
              <td>
                <button type="button" class="btn btn--chico btn--fantasma" data-borrar="${r.id}">
                  Eliminar
                </button>
              </td>
            </tr>
          `
        )}
      </tbody>
    </table>
  `;
}

function tablaRevisiones(s) {
  if (!s.inspecciones.length) {
    return vacio(
      "📝",
      "Sin revisiones registradas",
      "Al terminar de revisar un botiquín, usa “Registrar revisión” para dejar constancia."
    );
  }

  const ordenadas = [...s.inspecciones].sort((a, b) => (b.fecha || 0) - (a.fecha || 0));

  return html`
    <table class="tabla">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Botiquín</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th>Observaciones</th>
        </tr>
      </thead>
      <tbody>
        ${ordenadas.map((i) => {
          const botiquin = s.botiquines.find((b) => b.id === i.botiquinId);
          return html`
            <tr>
              <td>${fmtFecha(i.fecha)} ${i.hora || ""}</td>
              <td>${botiquin?.nombre || i.botiquinId}</td>
              <td>${i.responsable || "—"}</td>
              <td>${i.estadoGeneral || "—"}</td>
              <td class="tabla__tenue">${i.observaciones || "—"}</td>
            </tr>
          `;
        })}
      </tbody>
    </table>
  `;
}

function vacio(icono, titulo, texto) {
  return html`
    <div class="estado-vacio">
      <div class="estado-vacio__icono">${icono}</div>
      <h3>${titulo}</h3>
      <p>${texto}</p>
    </div>
  `;
}

/**
 * Ojo: borrar la reposición NO devuelve el stock. Es un registro
 * histórico; si la cantidad quedó mal, se corrige en la revisión.
 * Lo decimos explícitamente para que nadie lo use como "deshacer".
 */
async function borrar(id) {
  const ok = await confirmar({
    titulo: "¿Eliminar esta reposición?",
    mensaje:
      "Se borra del historial, pero la cantidad ya sumada al inventario no se revierte. " +
      "Si el stock quedó mal, corrígelo en la pantalla de revisión.",
    etiquetaOk: "Eliminar",
    peligro: true
  });

  if (!ok) return;

  try {
    await store.eliminarReposicion(id);
    avisar.exito("Reposición eliminada del historial.");
  } catch (error) {
    if (/unsupported action|acción no soportada/i.test(error.message)) {
      avisar.error(
        "Eliminar requiere volver a desplegar el Code.gs en Apps Script. " +
          "Mientras tanto, puedes borrar la fila directamente en la hoja Reposiciones."
      );
      return;
    }

    avisar.error(`No se pudo eliminar: ${error.message}`);
  }
}

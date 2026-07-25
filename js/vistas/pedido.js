/* ======================================================================
   vistas/pedido.js — QUÉ HAY QUE COMPRAR

   Reemplaza modules/pedido.js (813 líneas).

   Consolida el faltante de todos los botiquines por elemento: si a los
   dos botiquines les faltan 100 guantes, aquí sale una sola línea de
   200. Es lo que se lleva al proveedor.
====================================================================== */

import * as store from "../core/store.js";
import * as avisar from "../ui/avisos.js";
import { html, pintar, on } from "../ui/dom.js";
import { calcularPedido } from "../core/model.js";

let contenedor = null;

export function montar(nodo) {
  contenedor = nodo;

  on(contenedor, "click", "[data-copiar]", copiar);
  on(contenedor, "click", "[data-imprimir]", () => window.print());
  on(contenedor, "click", "[data-recargar]", () => store.cargar({ refrescar: true }));
}

export function pintarVista() {
  if (!contenedor) return;

  const s = store.obtener();
  const lineas = calcularPedido(s.inventario);

  if (!lineas.length) {
    pintar(
      contenedor,
      html`
        <div class="estado-vacio">
          <div class="estado-vacio__icono">✅</div>
          <h3>No hay nada que comprar</h3>
          <p>Todos los botiquines están completos según los mínimos del catálogo.</p>
        </div>
      `
    );
    return;
  }

  const totalUnidades = lineas.reduce((suma, l) => suma + l.cantidad, 0);

  pintar(
    contenedor,
    html`
      <div class="herramientas herramientas--pedido">
        <div>
          <p class="pedido__resumen">
            <strong>${lineas.length}</strong> ${lineas.length === 1 ? "elemento" : "elementos"} ·
            <strong>${totalUnidades}</strong> unidades en total
          </p>
        </div>
        <div class="herramientas__botones">
          <button type="button" class="btn btn--fantasma" data-recargar>Actualizar</button>
          <button type="button" class="btn btn--fantasma" data-copiar>Copiar lista</button>
          <button type="button" class="btn btn--primario" data-imprimir>Imprimir</button>
        </div>
      </div>

      <table class="tabla">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Categoría</th>
            <th class="tabla__num">Cantidad</th>
            <th>Para</th>
          </tr>
        </thead>
        <tbody>
          ${lineas.map(
            (l) => html`
              <tr>
                <td><strong>${l.nombre}</strong></td>
                <td class="tabla__tenue">${l.categoria || "—"}</td>
                <td class="tabla__num"><strong>${l.cantidad}</strong> ${l.unidad}</td>
                <td class="tabla__tenue">${[...new Set(l.botiquines)].join(", ")}</td>
              </tr>
            `
          )}
        </tbody>
      </table>
    `
  );
}

/** Texto plano, listo para pegar en WhatsApp o en un correo. */
async function copiar() {
  const s = store.obtener();
  const lineas = calcularPedido(s.inventario);

  const texto = [
    `Pedido botiquines · Musicala · ${new Date().toLocaleDateString("es-CO")}`,
    "",
    ...lineas.map((l) => `- ${l.cantidad} ${l.unidad} · ${l.nombre}`)
  ].join("\n");

  try {
    await navigator.clipboard.writeText(texto);
    avisar.exito("Lista copiada. Ya puedes pegarla donde la necesites.");
  } catch {
    // El portapapeles necesita HTTPS o permiso; si no se puede,
    // mostramos el texto para copiarlo a mano.
    avisar.error("Tu navegador no dejó copiar. Usa Imprimir o selecciona la tabla a mano.");
  }
}

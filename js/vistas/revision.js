/* ======================================================================
   vistas/revision.js — PANTALLA PRINCIPAL

   Reemplaza inventario.js (1.916) + botiquines.js (933) +
   inspecciones.js (2.353) + alertas.js (1.571) + dashboard.js (1.779).

   Está construida alrededor del trabajo real: alguien está de pie
   frente al botiquín contando. Por eso la cantidad y la fecha se
   editan en la misma lista, sin abrir un modal por ítem, y todo se
   guarda junto al final: 30 ítems son 1 petición, no 30.

   Los cambios sin guardar viven aquí (`pendientes`) y no en el store,
   porque son estado de esta pantalla y se descartan al salir.
====================================================================== */

import * as store from "../core/store.js";
import * as avisar from "../ui/avisos.js";
import { abrirFormulario, confirmar } from "../ui/modal.js";
import { $, $$, html, crudo, pintar, on, fmtDias, debounce, hoyISO } from "../ui/dom.js";
import {
  ESTADO,
  metaEstado,
  filtrarItems,
  ordenarPorUrgencia,
  itemsDeBotiquin,
  itemPorId,
  aInputDate,
  aFechaLatam,
  normalizarFechaEntrada,
  faltanteParaMinimo
} from "../core/model.js";

/** id_item -> { cantidad, vence } pendientes de guardar. */
const pendientes = new Map();

let contenedor = null;

/* ======================================
   ENTRADA
====================================== */

export function montar(nodo) {
  contenedor = nodo;
  conectarEventos();
}

export function pintarVista() {
  if (!contenedor) return;

  const s = store.obtener();

  if (s.cargando && !s.cargadoAlMenosUnaVez) return pintar(contenedor, cargando());
  if (s.error && !s.cargadoAlMenosUnaVez) return pintar(contenedor, errorCarga(s.error));

  const items = itemsVisibles(s);

  pintar(
    contenedor,
    html`
      ${barraBotiquines(s)}
      ${resumen(s)}
      ${barraHerramientas(s)}
      ${items.length ? lista(items) : vacio(s)}
      ${barraPendientes()}
    `
  );

  // El foco se pierde al repintar; lo devolvemos donde estaba.
  restaurarFoco();
}

/* ======================================
   SELECCIÓN DE DATOS
====================================== */

function itemsVisibles(s) {
  const delBotiquin = itemsDeBotiquin(s.inventario, s.botiquinActivo).filter((i) => i.activo);

  const filtrados = filtrarItems(delBotiquin, {
    estado: s.filtroEstado,
    busqueda: s.busqueda
  });

  return ordenarPorUrgencia(filtrados);
}

/* ======================================
   BLOQUES
====================================== */

function barraBotiquines(s) {
  const total = s.inventario.filter((i) => i.activo).length;

  return html`
    <div class="tabs" role="tablist" aria-label="Botiquines">
      <button
        type="button"
        role="tab"
        class="tab ${!s.botiquinActivo ? "es-activo" : ""}"
        data-botiquin=""
        aria-selected="${!s.botiquinActivo}"
      >
        Todos <span class="tab__cuenta">${total}</span>
      </button>
      ${s.botiquines.filter((b) => b.activo).map((b) => {
        const cuenta = itemsDeBotiquin(s.inventario, b.id).filter((i) => i.activo).length;
        const activo = s.botiquinActivo === b.id;
        return html`
          <button
            type="button"
            role="tab"
            class="tab ${activo ? "es-activo" : ""}"
            data-botiquin="${b.id}"
            aria-selected="${activo}"
          >
            ${b.nombre} <span class="tab__cuenta">${cuenta}</span>
          </button>
        `;
      })}
    </div>
  `;
}

function resumen(s) {
  const visibles = itemsDeBotiquin(s.inventario, s.botiquinActivo).filter((i) => i.activo);
  const cuenta = (estado) => visibles.filter((i) => i.estado === estado).length;

  const fichas = [
    { estado: "", etiqueta: "Todo", n: visibles.length, tono: "neutro" },
    { estado: ESTADO.FALTANTE, etiqueta: "Faltantes", n: cuenta(ESTADO.FALTANTE), tono: "peligro" },
    { estado: ESTADO.VENCIDO, etiqueta: "Vencidos", n: cuenta(ESTADO.VENCIDO), tono: "peligro" },
    { estado: ESTADO.BAJO_STOCK, etiqueta: "Bajo stock", n: cuenta(ESTADO.BAJO_STOCK), tono: "aviso" },
    { estado: ESTADO.POR_VENCER, etiqueta: "Por vencer", n: cuenta(ESTADO.POR_VENCER), tono: "aviso" },
    { estado: ESTADO.OK, etiqueta: "Al día", n: cuenta(ESTADO.OK), tono: "bien" }
  ];

  return html`
    <div class="fichas">
      ${fichas.map(
        (f) => html`
          <button
            type="button"
            class="ficha ficha--${f.tono} ${s.filtroEstado === f.estado ? "es-activo" : ""}"
            data-filtro="${f.estado}"
            ${f.n === 0 && f.estado ? crudo("disabled") : ""}
          >
            <span class="ficha__n">${f.n}</span>
            <span class="ficha__etiqueta">${f.etiqueta}</span>
          </button>
        `
      )}
    </div>
  `;
}

function barraHerramientas(s) {
  const nombreBotiquin = s.botiquinActivo
    ? s.botiquines.find((b) => b.id === s.botiquinActivo)?.nombre
    : "todos los botiquines";

  return html`
    <div class="herramientas">
      <input
        type="search"
        class="control buscador"
        placeholder="Buscar elemento..."
        value="${s.busqueda}"
        data-buscar
        aria-label="Buscar elemento"
      />
      <button type="button" class="btn btn--fantasma" data-recargar ${s.cargando ? crudo("disabled") : ""}>
        ${s.cargando ? "Actualizando..." : "Actualizar"}
      </button>
      <button type="button" class="btn btn--primario" data-cerrar-revision>
        Registrar revisión
      </button>
      <p class="herramientas__contexto">Revisando ${nombreBotiquin}</p>
    </div>
  `;
}

function lista(items) {
  return html`
    <ul class="items" role="list">
      ${items.map(fila)}
    </ul>
  `;
}

function fila(item) {
  const meta = metaEstado(item.estado);
  const pendiente = pendientes.get(item.id);

  const cantidad = pendiente?.cantidad ?? item.cantidad;
  const vence = pendiente?.vence ?? aInputDate(item.vence);
  const venceVisible = aFechaLatam(vence);
  const cambiado = Boolean(pendiente);

  const falta = faltanteParaMinimo({ ...item, cantidad: Number(cantidad) || 0 });

  return html`
    <li class="item ${cambiado ? "es-cambiado" : ""}" data-item="${item.id}">
      <div class="item__info">
        <div class="item__linea1">
          <span class="insignia insignia--${meta.tone}">${meta.icon} ${meta.label}</span>
          ${cambiado ? html`<span class="insignia insignia--info">Sin guardar</span>` : ""}
        </div>
        <h3 class="item__nombre">${item.nombre}</h3>
        <p class="item__meta">
          ${item.botiquinNombre}${item.categoria ? ` · ${item.categoria}` : ""} · mínimo ${item.minimo} ${item.unidad}
        </p>
      </div>

      <div class="item__campos">
        <label class="mini">
          <span class="mini__etiqueta">Cantidad</span>
          <input
            type="number"
            class="control control--mini"
            min="0"
            step="1"
            value="${cantidad}"
            data-campo="cantidad"
            aria-label="Cantidad de ${item.nombre}"
          />
        </label>

        <label class="mini">
          <span class="mini__etiqueta">Vence</span>
          <input
            type="text"
            class="control control--mini"
            value="${venceVisible}"
            data-campo="vence"
            inputmode="numeric"
            placeholder="dd/mm/aaaa"
            autocomplete="off"
            aria-label="Fecha de vencimiento de ${item.nombre}"
          />
          ${
            !vence
              ? html`<span class="mini__nota">sin fecha</span>`
              : item.diasParaVencer !== null
                ? html`<span class="mini__nota">${fmtDias(item.diasParaVencer)}</span>`
                : ""
          }
        </label>
      </div>

      <div class="item__acciones">
        ${
          falta > 0
            ? html`<button type="button" class="btn btn--chico btn--primario" data-reponer>Reponer ${falta}</button>`
            : html`<button type="button" class="btn btn--chico btn--fantasma" data-reponer>Reponer</button>`
        }
      </div>
    </li>
  `;
}

function barraPendientes() {
  if (pendientes.size === 0) return "";

  const n = pendientes.size;

  return html`
    <div class="barra-pendientes" role="region" aria-label="Cambios sin guardar">
      <span><strong>${n}</strong> ${n === 1 ? "cambio" : "cambios"} sin guardar</span>
      <div class="barra-pendientes__acciones">
        <button type="button" class="btn btn--fantasma" data-descartar>Descartar</button>
        <button type="button" class="btn btn--primario" data-guardar>Guardar cambios</button>
      </div>
    </div>
  `;
}

/* ======================================
   ESTADOS DE PANTALLA
====================================== */

function cargando() {
  return html`
    <div class="estado-vacio">
      <div class="cargador"></div>
      <p>Leyendo la hoja de cálculo...</p>
    </div>
  `;
}

function errorCarga(error) {
  return html`
    <div class="estado-vacio estado-vacio--error">
      <div class="estado-vacio__icono">🔌</div>
      <h3>No se pudo cargar la información</h3>
      <p>${error.message}</p>
      <button type="button" class="btn btn--primario" data-recargar>Reintentar</button>
    </div>
  `;
}

function vacio(s) {
  const filtrando = s.filtroEstado || s.busqueda;

  return html`
    <div class="estado-vacio">
      <div class="estado-vacio__icono">${filtrando ? "🔍" : "🩹"}</div>
      <h3>${filtrando ? "Sin resultados" : "No hay elementos"}</h3>
      <p>
        ${
          filtrando
            ? "Ningún elemento coincide con lo que buscas."
            : "Este botiquín todavía no tiene elementos cargados en la hoja."
        }
      </p>
      ${filtrando ? html`<button type="button" class="btn btn--fantasma" data-limpiar>Limpiar filtros</button>` : ""}
    </div>
  `;
}

/* ======================================
   EVENTOS

   Delegados en el contenedor: la lista se repinta constantemente y
   los listeners directos morirían con cada repintado.
====================================== */

let ultimoFoco = null;

function conectarEventos() {
  on(contenedor, "click", "[data-botiquin]", (e, btn) => {
    store.elegirBotiquin(btn.dataset.botiquin);
  });

  on(contenedor, "click", "[data-filtro]", (e, btn) => {
    store.filtrarPorEstado(btn.dataset.filtro);
  });

  on(contenedor, "click", "[data-limpiar]", () => store.limpiarFiltros());
  on(contenedor, "click", "[data-recargar]", () => store.cargar({ refrescar: true }));
  on(contenedor, "click", "[data-guardar]", guardarPendientes);
  on(contenedor, "click", "[data-descartar]", descartarPendientes);
  on(contenedor, "click", "[data-cerrar-revision]", registrarRevision);
  on(contenedor, "click", "[data-reponer]", (e, btn) => {
    abrirReposicion(btn.closest("[data-item]").dataset.item);
  });

  const buscar = debounce((valor) => store.buscar(valor), 250);
  on(contenedor, "input", "[data-buscar]", (e) => {
    ultimoFoco = { selector: "[data-buscar]", posicion: e.target.selectionStart };
    buscar(e.target.value);
  });

  // Los campos de la lista solo marcan el cambio como pendiente.
  // Nada viaja a Sheets hasta que se pulsa "Guardar cambios".
  on(contenedor, "change", "[data-campo]", (e, campo) => {
    const valor = campo.dataset.campo === "vence" ? normalizarFechaEntrada(campo.value) : campo.value;
    if (valor === null) {
      avisar.error("Escribe una fecha válida como dd/mm/aaaa.");
      campo.focus();
      return;
    }
    anotarCambio(campo.closest("[data-item]").dataset.item, campo.dataset.campo, valor);
  });

  // Enter salta al siguiente ítem: se cuenta más rápido con el teclado.
  on(contenedor, "keydown", "[data-campo]", (e, campo) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const valor = campo.dataset.campo === "vence" ? normalizarFechaEntrada(campo.value) : campo.value;
    if (valor === null) {
      avisar.error("Escribe una fecha válida como dd/mm/aaaa.");
      return;
    }
    anotarCambio(campo.closest("[data-item]").dataset.item, campo.dataset.campo, valor);

    const campos = $$(`[data-campo="${campo.dataset.campo}"]`, contenedor);
    const siguiente = campos[campos.indexOf(campo) + 1];
    siguiente?.focus();
    siguiente?.select?.();
  });
}

function anotarCambio(itemId, campo, valor) {
  const s = store.obtener();
  const item = itemPorId(s.inventario, itemId);
  if (!item) return;

  const actual = pendientes.get(itemId) || {};
  const siguiente = { ...actual, [campo]: valor };

  // Si vuelve a coincidir con lo que hay en la hoja, ya no es un cambio.
  const cantidadIgual = Number(siguiente.cantidad ?? item.cantidad) === item.cantidad;
  const venceIgual = (siguiente.vence ?? aInputDate(item.vence)) === aInputDate(item.vence);

  if (cantidadIgual && venceIgual) pendientes.delete(itemId);
  else pendientes.set(itemId, siguiente);

  pintarVista();
}

function restaurarFoco() {
  if (!ultimoFoco) return;

  const nodo = $(ultimoFoco.selector, contenedor);
  if (nodo) {
    nodo.focus();
    if (ultimoFoco.posicion != null && nodo.setSelectionRange) {
      try {
        nodo.setSelectionRange(ultimoFoco.posicion, ultimoFoco.posicion);
      } catch {
        // Los input[type=number] no admiten setSelectionRange.
      }
    }
  }

  ultimoFoco = null;
}

/* ======================================
   GUARDAR
====================================== */

async function guardarPendientes() {
  if (pendientes.size === 0) return;

  const s = store.obtener();

  const items = [...pendientes.entries()].map(([id, cambios]) => {
    const item = itemPorId(s.inventario, id);
    const carga = { id_item: id };

    if (cambios.cantidad !== undefined) carga.cantidad_actual = Number(cambios.cantidad) || 0;
    if (cambios.vence !== undefined) carga.fecha_vencimiento = cambios.vence;

    // La unidad heredó el número 1 en muchas filas. Al guardar,
    // aprovechamos para dejar el texto correcto del catálogo.
    if (item?.unidad) carga.unidad = item.unidad;

    return carga;
  });

  try {
    const resultado = await store.guardarItems(items);

    pendientes.clear();

    const fallidos = resultado?.errores?.length || 0;

    if (fallidos) {
      avisar.error(
        `Se guardaron ${resultado.actualizados.length}, pero ${fallidos} fallaron: ` +
          resultado.errores.map((e) => `${e.id_item} (${e.error})`).join(", ")
      );
    } else {
      avisar.exito(`${items.length} ${items.length === 1 ? "elemento guardado" : "elementos guardados"}.`);
    }

    pintarVista();
  } catch (error) {
    // Los pendientes NO se borran: si la red falló, lo contado sigue ahí.
    avisar.error(`No se pudo guardar: ${error.message}`);
  }
}

async function descartarPendientes() {
  const ok = await confirmar({
    titulo: "¿Descartar los cambios?",
    mensaje: `Vas a perder ${pendientes.size} ${pendientes.size === 1 ? "cambio" : "cambios"} sin guardar.`,
    etiquetaOk: "Descartar",
    peligro: true
  });

  if (!ok) return;

  pendientes.clear();
  pintarVista();
}

/* ======================================
   REPOSICIÓN
====================================== */

function abrirReposicion(itemId) {
  const s = store.obtener();
  const item = itemPorId(s.inventario, itemId);

  if (!item) {
    avisar.error("No encontré ese elemento.");
    return;
  }

  const sugerida = faltanteParaMinimo(item) || 1;

  // Todos los datos ya están en memoria: el formulario se construye de
  // una vez y no se vuelve a dibujar. Ahí estaba el bug de los campos
  // que salían "obligatorios" estando llenos.
  abrirFormulario({
    titulo: "Registrar reposición",
    subtitulo: `${item.nombre} · ${item.botiquinNombre}`,
    ancho: "md",
    etiquetaEnviar: "Registrar",
    campos: [
      {
        tipo: "nota",
        ancho: 12,
        contenido: html`
          Hay <strong>${item.cantidad}</strong> de un mínimo de <strong>${item.minimo}</strong> ${item.unidad}.
          Al registrar, la cantidad se suma al inventario automáticamente.
        `
      },
      {
        nombre: "cantidad_repuesta",
        etiqueta: "Cantidad que repones",
        tipo: "numero",
        valor: sugerida,
        min: 1,
        requerido: true,
        ancho: 4
      },
      { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: hoyISO(), requerido: true, ancho: 4 },
      {
        nombre: "motivo",
        etiqueta: "Motivo",
        tipo: "select",
        valor: item.estado === ESTADO.VENCIDO ? "Vencimiento" : "Reposición",
        opciones: ["Reposición", "Vencimiento", "Uso", "Auditoría"],
        ancho: 4
      },
      { nombre: "responsable", etiqueta: "Responsable", valor: "", requerido: true, ancho: 6 },
      {
        nombre: "fecha_vencimiento_nueva",
        etiqueta: "Nuevo vencimiento",
        tipo: "fecha",
        valor: "",
        ayuda: item.tieneVencimiento ? "Este elemento vence: registra la fecha del lote nuevo." : "Opcional.",
        ancho: 6
      },
      { nombre: "lote", etiqueta: "Lote", valor: "", ancho: 6 },
      { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textarea", valor: "", ancho: 12, filas: 2 }
    ],
    alEnviar: async (valores) => {
      await store.guardarReposicion({
        // El id_item real de la hoja, no uno derivado del índice.
        id_item: item.id,
        id_botiquin: item.botiquinId,
        nombre_elemento: item.nombre,
        unidad: item.unidad,
        ...valores
      });

      avisar.exito(`Reposición registrada. ${item.nombre} quedó con ${item.cantidad + Number(valores.cantidad_repuesta)} ${item.unidad}.`);
    }
  });
}

/* ======================================
   CIERRE DE REVISIÓN

   Deja constancia en la hoja Inspecciones, que es lo que pide el
   SGSST para auditorías. Estaba vacía porque el flujo anterior nunca
   llegaba a guardar nada ahí.
====================================== */

function registrarRevision() {
  const s = store.obtener();

  if (!s.botiquinActivo) {
    avisar.info("Elige primero un botiquín para registrar su revisión.");
    return;
  }

  const botiquin = s.botiquines.find((b) => b.id === s.botiquinActivo);
  const items = itemsDeBotiquin(s.inventario, s.botiquinActivo).filter((i) => i.activo);
  const conProblema = items.filter((i) => i.estado !== ESTADO.OK);

  if (pendientes.size > 0) {
    avisar.info("Guarda primero los cambios pendientes para que la revisión quede completa.");
    return;
  }

  const estadoSugerido = conProblema.length === 0 ? "OK" : conProblema.length > 5 ? "Crítico" : "Con novedades";

  abrirFormulario({
    titulo: "Registrar revisión",
    subtitulo: botiquin?.nombre || "",
    etiquetaEnviar: "Registrar revisión",
    campos: [
      {
        tipo: "nota",
        ancho: 12,
        contenido: html`
          Revisaste <strong>${items.length}</strong> elementos.
          ${
            conProblema.length
              ? html`<strong>${conProblema.length}</strong> requieren atención.`
              : "Todos están al día."
          }
        `
      },
      { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: hoyISO(), requerido: true, ancho: 6 },
      { nombre: "responsable", etiqueta: "Responsable", valor: "", requerido: true, ancho: 6 },
      {
        nombre: "estado_general",
        etiqueta: "Estado general",
        tipo: "select",
        valor: estadoSugerido,
        opciones: ["OK", "Con novedades", "Crítico"],
        ancho: 6
      },
      {
        nombre: "hora",
        etiqueta: "Hora",
        valor: new Date().toTimeString().slice(0, 5),
        ancho: 6
      },
      {
        nombre: "observaciones_generales",
        etiqueta: "Observaciones",
        tipo: "textarea",
        valor: conProblema.length
          ? `Pendientes: ${conProblema.map((i) => i.nombre).join(", ")}.`
          : "",
        ancho: 12,
        filas: 3
      }
    ],
    alEnviar: async (valores) => {
      await store.guardarInspeccion({ id_botiquin: s.botiquinActivo, ...valores });
      avisar.exito("Revisión registrada en la hoja de inspecciones.");
    }
  });
}

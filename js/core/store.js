/* ======================================================================
   core/store.js — ESTADO DE LA APP

   Un objeto, un evento de cambio, suscriptores. La versión anterior
   tenía 1.571 líneas de estado con selectores, acciones y normalizadores
   propios que duplicaban lo que ya hacían los módulos.

   Regla: aquí solo vive estado. Las derivaciones (estados de ítem,
   alertas, resumen, pedido) las calcula core/model.js a partir de estos
   datos, para que nunca queden desincronizadas.
====================================================================== */

import { construirEstado } from "./model.js";
import * as api from "./api.js";
import { VISTA_INICIAL } from "./config.js";

/* ======================================
   ESTADO
====================================== */

const estado = {
  // datos ya normalizados
  botiquines: [],
  catalogo: [],
  inventario: [],
  inspecciones: [],
  reposiciones: [],
  alertas: [],
  resumen: null,
  filasInvalidas: [],

  // interfaz
  vista: VISTA_INICIAL,
  botiquinActivo: "",
  filtroEstado: "",
  busqueda: "",

  // conexión
  cargando: false,
  guardando: false,
  error: null,
  ultimaCarga: null,
  cargadoAlMenosUnaVez: false
};

const suscriptores = new Set();

/* ======================================
   LECTURA Y SUSCRIPCIÓN
====================================== */

export function obtener() {
  return estado;
}

export function suscribir(callback) {
  suscriptores.add(callback);
  return () => suscriptores.delete(callback);
}

function notificar() {
  suscriptores.forEach((callback) => {
    try {
      callback(estado);
    } catch (error) {
      console.error("[store] Un suscriptor falló:", error);
    }
  });
}

/** Escribe campos en el estado y avisa una sola vez. */
function fijar(cambios) {
  Object.assign(estado, cambios);
  notificar();
}

/* ======================================
   CARGA DE DATOS
====================================== */

/**
 * Trae todo del Web App y lo normaliza. Es la única puerta de entrada
 * de datos a la app.
 */
export async function cargar({ refrescar = false } = {}) {
  if (estado.cargando) return;

  fijar({ cargando: true, error: null });

  try {
    const crudo = await api.cargarTodo({ refrescar });
    const normalizado = construirEstado(crudo);

    fijar({
      ...normalizado,
      cargando: false,
      ultimaCarga: new Date(),
      cargadoAlMenosUnaVez: true
    });

    if (normalizado.filasInvalidas.length) {
      console.warn(
        `[store] ${normalizado.filasInvalidas.length} fila(s) de Sheets sin ID válido:`,
        normalizado.filasInvalidas
      );
    }
  } catch (error) {
    console.error("[store] Error cargando datos:", error);
    fijar({ cargando: false, error });
  }
}

/* ======================================
   ESCRITURAS

   Todas siguen la misma forma: guardar en Sheets, recargar, notificar.
   No hacemos actualización optimista: en una hoja compartida el dato
   que vale es el que quedó escrito, no el que creemos haber escrito.
====================================== */

async function conGuardado(operacion) {
  fijar({ guardando: true, error: null });

  try {
    const resultado = await operacion();
    await cargar({ refrescar: true });
    fijar({ guardando: false });
    return resultado;
  } catch (error) {
    fijar({ guardando: false, error });
    throw error;
  }
}

export function guardarItem(id, cambios) {
  return conGuardado(() => api.guardarItem(id, cambios));
}

/**
 * Guarda todos los cambios pendientes de la revisión de una vez.
 * Si algún ítem falla, el resto sí se guarda y devolvemos el detalle
 * para poder decir exactamente cuál no pasó.
 */
export function guardarItems(items) {
  return conGuardado(() => api.guardarItems(items));
}

export function guardarInspeccion(inspeccion) {
  return conGuardado(() => api.guardarInspeccion(inspeccion));
}

export function guardarReposicion(reposicion) {
  return conGuardado(() => api.guardarReposicion(reposicion));
}

export function eliminarReposicion(id) {
  return conGuardado(() => api.eliminarReposicion(id));
}

/* ======================================
   INTERFAZ
====================================== */

export function irA(vista, { botiquin = null } = {}) {
  const cambios = { vista };
  if (botiquin !== null) cambios.botiquinActivo = botiquin;
  fijar(cambios);
}

export function elegirBotiquin(id) {
  fijar({ botiquinActivo: id, filtroEstado: "", busqueda: "" });
}

export function filtrarPorEstado(estadoItem) {
  fijar({ filtroEstado: estado.filtroEstado === estadoItem ? "" : estadoItem });
}

export function buscar(texto) {
  fijar({ busqueda: texto });
}

export function limpiarFiltros() {
  fijar({ filtroEstado: "", busqueda: "" });
}

export function limpiarError() {
  fijar({ error: null });
}

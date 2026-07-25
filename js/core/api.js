/* ======================================================================
   core/api.js — CLIENTE DEL WEB APP

   Delgado a propósito. Habla HTTP, entrega JSON crudo y ya. Quien
   normaliza es core/model.js; quien guarda el estado es core/store.js.

   Lo que ya NO está aquí (y por qué):
   La versión anterior tenía ~150 líneas de reintentos —
   buildInventarioUpdateFallbackPayloads, buildServerResolvedInventarioPayload,
   isInventoryNotFoundError— que probaban tres formas distintas del payload
   y hasta releían el inventario del servidor para adivinar el id correcto.
   Todo eso existía porque el frontend inventaba IDs. Con los IDs reales
   de la hoja, la primera petición acierta siempre.
====================================================================== */

import { API_URL, TIMEOUT_MS, CACHE_TTL_MS } from "./config.js";

/* ======================================
   ERRORES
====================================== */

export class ApiError extends Error {
  constructor(mensaje, { accion = "", status = 0, causa = null } = {}) {
    super(mensaje);
    this.name = "ApiError";
    this.accion = accion;
    this.status = status;
    this.causa = causa;
  }
}

/* ======================================
   CACHÉ DE LECTURAS

   Las lecturas se cachean un rato para no castigar a Sheets cuando el
   usuario salta entre vistas. Cualquier escritura la invalida entera:
   más vale una relectura de más que mostrar un dato viejo.
====================================== */

const cache = new Map();
const enVuelo = new Map();

export function invalidarCache() {
  cache.clear();
}

function leerCache(clave) {
  const entrada = cache.get(clave);
  if (!entrada) return null;

  if (entrada.expira <= Date.now()) {
    cache.delete(clave);
    return null;
  }

  return structuredClone(entrada.datos);
}

function guardarCache(clave, datos) {
  cache.set(clave, { expira: Date.now() + CACHE_TTL_MS, datos: structuredClone(datos) });
}

/* ======================================
   TRANSPORTE
====================================== */

function construirUrl(accion, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", accion);

  Object.entries(params).forEach(([clave, valor]) => {
    if (valor === undefined || valor === null || valor === "") return;
    url.searchParams.set(clave, String(valor));
  });

  return url.toString();
}

async function pedir(url, opciones = {}, accion = "") {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  let respuesta;

  try {
    respuesta = await fetch(url, { ...opciones, signal: controlador.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(
        `La consulta tardó más de ${TIMEOUT_MS / 1000} segundos. Revisa tu conexión.`,
        { accion, causa: error }
      );
    }

    throw new ApiError(
      "No se pudo conectar con la hoja de cálculo. Revisa tu conexión a internet.",
      { accion, causa: error }
    );
  } finally {
    clearTimeout(temporizador);
  }

  const texto = await respuesta.text();
  let datos;

  try {
    datos = texto.trim() ? JSON.parse(texto) : {};
  } catch (error) {
    // Apps Script devuelve HTML cuando el despliegue está mal configurado
    // o cuando la sesión de Google expiró. Vale la pena decirlo claro.
    throw new ApiError(
      "El Web App no devolvió datos válidos. Puede que el despliegue esté desactualizado o que necesites volver a iniciar sesión en Google.",
      { accion, status: respuesta.status, causa: error }
    );
  }

  if (!respuesta.ok || datos?.ok === false) {
    throw new ApiError(datos?.error || datos?.message || `Error HTTP ${respuesta.status}`, {
      accion,
      status: respuesta.status
    });
  }

  return datos?.data !== undefined ? datos.data : datos;
}

/**
 * Lectura. Cachea y agrupa peticiones idénticas simultáneas: si dos
 * vistas piden lo mismo a la vez, sale una sola petición.
 */
async function leer(accion, params = {}, { refrescar = false } = {}) {
  const url = construirUrl(accion, params);

  if (!refrescar) {
    const cacheado = leerCache(url);
    if (cacheado !== null) return cacheado;
  }

  if (enVuelo.has(url)) return enVuelo.get(url);

  const promesa = pedir(url, { method: "GET", headers: { Accept: "application/json" } }, accion)
    .then((datos) => {
      guardarCache(url, datos);
      return datos;
    })
    .finally(() => enVuelo.delete(url));

  enVuelo.set(url, promesa);
  return promesa;
}

/**
 * Escritura. Siempre invalida la caché.
 *
 * El Content-Type es text/plain a propósito: convierte la petición en
 * "simple" para CORS y evita el preflight OPTIONS, que Apps Script no
 * sabe responder. El backend hace JSON.parse del cuerpo igual.
 */
async function escribir(accion, payload = {}) {
  try {
    return await pedir(
      API_URL,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: accion, payload })
      },
      accion
    );
  } finally {
    invalidarCache();
  }
}

/* ======================================
   LECTURAS
====================================== */

/**
 * Trae todo de una sola vez. Es la única lectura que usa la app al
 * arrancar y al refrescar: una petición en vez de seis.
 */
export function cargarTodo({ refrescar = false } = {}) {
  return leer(
    "getBootstrap",
    {
      include_dashboard: "false", // lo calculamos nosotros desde el inventario
      include_alertas: "false", // idem: una sola regla de negocio, en model.js
      include_botiquines: "true",
      include_inventario: "true",
      include_inspecciones: "true",
      include_reposiciones: "true",
      include_catalogo: "true",
      force_refresh: refrescar ? "true" : "false"
    },
    { refrescar }
  );
}

export const obtenerBotiquines = (o) => leer("getBotiquines", {}, o);
export const obtenerCatalogo = (o) => leer("getCatalogo", {}, o);
export const obtenerInventario = (o) => leer("getInventario", {}, o);
export const obtenerInspecciones = (o) => leer("getInspecciones", {}, o);
export const obtenerReposiciones = (o) => leer("getReposiciones", {}, o);

export const probarConexion = () => leer("ping", {}, { refrescar: true });

/* ======================================
   ESCRITURAS
====================================== */

/**
 * Actualiza una fila de Inventario.
 *
 * `id` es el id_item real de la hoja (BOT-001-ITM-001). No se acepta
 * nada más: si no lo tienes, no puedes editar, y eso es correcto —
 * antes se mandaba un id inventado y la escritura se perdía en silencio.
 */
export function guardarItem(id, cambios = {}) {
  if (!id) {
    throw new ApiError("No se puede guardar un ítem sin su id_item.", {
      accion: "updateInventarioItem"
    });
  }

  return escribir("updateInventarioItem", { id_item: id, ...cambios });
}

/** ¿El Web App desplegado no conoce esta acción todavía? */
function esAccionNoSoportada(error) {
  return /unsupported action|acción no soportada/i.test(error?.message || "");
}

/**
 * Guarda varios ítems de una vez. Lo usa la pantalla de revisión:
 * se recorre el botiquín corrigiendo y al final se guarda todo junto,
 * en una sola petición en vez de una por ítem.
 *
 * Si el Web App todavía no tiene `updateInventarioBatch` (porque no se
 * ha vuelto a desplegar el Code.gs), se guarda ítem por ítem. Es más
 * lento, pero la app sigue funcionando en vez de romperse: nadie
 * debería quedarse sin poder registrar una revisión por un despliegue
 * pendiente.
 */
export async function guardarItems(items = []) {
  if (!items.length) return { actualizados: [], errores: [] };

  try {
    return await escribir("updateInventarioBatch", { items });
  } catch (error) {
    if (!esAccionNoSoportada(error)) throw error;

    console.warn(
      "[api] El Web App no tiene updateInventarioBatch; guardando uno por uno. " +
        "Vuelve a desplegar apps-script/Code.gs para que sea una sola petición."
    );

    const actualizados = [];
    const errores = [];

    for (const item of items) {
      const { id_item: id, ...cambios } = item;

      try {
        await escribir("updateInventarioItem", { id_item: id, ...cambios });
        actualizados.push(id);
      } catch (fallo) {
        errores.push({ id_item: id, error: fallo.message });
      }
    }

    return { actualizados, errores, modoLento: true };
  }
}

export function guardarInspeccion(inspeccion) {
  return escribir("saveInspeccion", inspeccion);
}

export function guardarReposicion(reposicion) {
  return escribir("saveReposicion", reposicion);
}

export function eliminarReposicion(id) {
  if (!id) {
    throw new ApiError("No se puede eliminar una reposición sin su id.", {
      accion: "deleteReposicion"
    });
  }

  return escribir("deleteReposicion", { id_reposicion: id });
}

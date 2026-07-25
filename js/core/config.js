/* ======================================================================
   core/config.js — CONFIGURACIÓN

   Corta a propósito. La versión anterior tenía 1.019 líneas y, entre
   otras cosas, una lista fija de botiquines que ya no coincidía con la
   hoja: declaraba cuatro (BOT-001 a BOT-004) cuando en Sheets solo hay
   dos. Cualquier dato que viva en Sheets se lee de Sheets. Aquí queda
   únicamente lo que Sheets no puede saber.
====================================================================== */

export const APP = {
  nombre: "Seguimiento de Botiquines",
  organizacion: "Musicala",
  version: "2.0.0"
};

/* ======================================
   CONEXIÓN
====================================== */

/**
 * URL del Web App de Apps Script.
 *
 * Ojo al actualizar el backend: en Apps Script usa
 * **Implementar → Gestionar implementaciones → ✏️ → Nueva versión**.
 * Si en cambio creas una *Nueva implementación*, Google genera otra URL
 * y hay que cambiarla aquí — si no, la app se queda hablando con el
 * despliegue viejo y los cambios del Code.gs no se notan.
 */
export const API_URL =
  "https://script.google.com/macros/s/AKfycbwnnEWfmhJiPVtMJF7dZLhGaM55yyrZo2DZmksO9NsezTgs8f8MsERE3AjQFoB5HMPUWA/exec";

export const TIMEOUT_MS = 20000;
export const CACHE_TTL_MS = 45000;

/* ======================================
   REGIONAL
====================================== */

export const LOCALE = "es-CO";
export const ZONA_HORARIA = "America/Bogota";

/* ======================================
   VISTAS
====================================== */

export const VISTAS = [
  { id: "revision", etiqueta: "Revisión", icono: "🩺", titulo: "Revisión de botiquines" },
  { id: "pedido", etiqueta: "Pedido", icono: "🛒", titulo: "Pedido consolidado" },
  { id: "historial", etiqueta: "Historial", icono: "📦", titulo: "Historial de reposiciones" }
];

export const VISTA_INICIAL = "revision";

export function esVistaValida(id) {
  return VISTAS.some((vista) => vista.id === id);
}

export function tituloDeVista(id) {
  return VISTAS.find((vista) => vista.id === id)?.titulo || APP.nombre;
}

/* ======================================
   CATÁLOGOS DE FORMULARIO
====================================== */

export const MOTIVOS_REPOSICION = ["Reposición", "Vencimiento", "Uso", "Auditoría"];

export const UNIDADES = ["unidad", "paquete", "caja", "frasco", "rollo", "par", "sobre"];

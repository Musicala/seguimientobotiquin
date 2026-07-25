/* ======================================================================
   core/model.js — FUENTE ÚNICA DE VERDAD

   Toda la app lee los datos a través de este archivo. Nadie más
   normaliza, adivina o inventa nada.

   Regla número uno: los IDs vienen de Sheets. Si una fila no trae su
   ID real, la fila es inválida y se reporta — NUNCA se le fabrica uno.
   (La versión anterior generaba `ITEM-0001` a partir del índice del
   arreglo: el mismo ítem cambiaba de ID al filtrar, y las escrituras
   iban a parar a la fila equivocada o a ninguna.)

   Contrato real de las hojas, verificado contra el Web App:

   Botiquines   id_botiquin, nombre, tipo, ubicacion, responsable,
                frecuencia_revision_dias, fecha_ultima_revision, estado,
                observaciones
   Catalogo     id_elemento, nombre_elemento, tipo_botiquin, categoria,
                cantidad_requerida, unidad, tiene_vencimiento,
                requiere_lote, activo, observaciones
   Inventario   id_item, id_botiquin, id_elemento, elemento,
                cantidad_actual, cantidad_minima, unidad,
                fecha_vencimiento, fecha_ultima_reposicion,
                activo_(si/no)
   Inspecciones (vacía por ahora)
   Reposiciones id_reposicion, fecha, id_botiquin, id_item,
                nombre_elemento, cantidad_repuesta, unidad,
                fecha_vencimiento_nueva, lote, responsable, motivo,
                id_inspeccion_origen, observaciones
   Alertas      tipo, severidad, titulo, descripcion, id_item, id_botiquin
====================================================================== */

/* ======================================
   ESTADOS
====================================== */

export const ESTADO = {
  OK: "ok",
  BAJO_STOCK: "bajo_stock",
  FALTANTE: "faltante",
  POR_VENCER: "por_vencer",
  VENCIDO: "vencido",
  SIN_DATOS: "sin_datos"
};

export const ESTADO_META = {
  [ESTADO.OK]: { label: "Vigente", tone: "success", icon: "✅", orden: 0 },
  [ESTADO.POR_VENCER]: { label: "Próximo a vencer", tone: "warning", icon: "⏳", orden: 2 },
  [ESTADO.BAJO_STOCK]: { label: "Bajo stock", tone: "warning", icon: "📉", orden: 3 },
  [ESTADO.VENCIDO]: { label: "Vencido", tone: "danger", icon: "🛑", orden: 4 },
  [ESTADO.FALTANTE]: { label: "Faltante", tone: "danger", icon: "📦", orden: 5 },
  [ESTADO.SIN_DATOS]: { label: "Sin datos", tone: "neutral", icon: "—", orden: 1 }
};

/** Días antes del vencimiento a partir de los cuales avisamos. */
export const DIAS_AVISO_VENCIMIENTO = 30;

/* ======================================
   PARSEO DE CELDAS
   Sheets devuelve basura variada: "-", "", números donde
   esperábamos texto, fechas ISO con zona horaria. Se centraliza aquí.
====================================== */

/** Valores que en la hoja significan "aquí no hay nada". */
const VACIOS = new Set(["", "-", "--", "n/a", "na", "null", "undefined", "sin fecha"]);

export function esVacio(valor) {
  if (valor === null || valor === undefined) return true;
  return VACIOS.has(String(valor).trim().toLowerCase());
}

export function texto(valor, porDefecto = "") {
  if (esVacio(valor)) return porDefecto;
  return String(valor).trim();
}

export function numero(valor, porDefecto = 0) {
  if (esVacio(valor)) return porDefecto;
  const n = Number(String(valor).trim().replace(",", "."));
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Sí/No de Sheets a booleano. Acepta "Si", "Sí", "SI", "x", 1, true...
 */
export function booleano(valor, porDefecto = false) {
  if (typeof valor === "boolean") return valor;
  if (esVacio(valor)) return porDefecto;

  const v = String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (["si", "s", "true", "1", "x", "yes", "y", "activo"].includes(v)) return true;
  if (["no", "n", "false", "0", "inactivo"].includes(v)) return false;
  return porDefecto;
}

/**
 * Fecha de Sheets a Date (o null). Acepta ISO con zona horaria,
 * "yyyy-mm-dd" y "dd/mm/yyyy". Devuelve null para "-" y vacíos.
 *
 * Ojo con la zona horaria: Sheets manda "2028-02-01T05:00:00.000Z" para
 * el 1 de febrero en Bogotá (UTC-5). Si lo leyéramos como UTC y luego
 * formateáramos en local daría el 31 de enero. Por eso las fechas planas
 * se construyen siempre a mediodía local.
 */
export function fecha(valor) {
  if (esVacio(valor)) return null;

  const raw = String(valor).trim();

  // ISO completo con hora
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    // Reanclamos al día calendario que la hoja quiso decir.
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  }

  // yyyy-mm-dd
  const plana = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (plana) {
    return new Date(+plana[1], +plana[2] - 1, +plana[3], 12, 0, 0);
  }

  // dd/mm/yyyy
  const latam = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (latam) {
    return new Date(+latam[3], +latam[2] - 1, +latam[1], 12, 0, 0);
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date a "yyyy-mm-dd" para <input type="date">. Null si no hay fecha. */
export function aInputDate(valor) {
  const d = valor instanceof Date ? valor : fecha(valor);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Fecha ISO mostrada de forma natural para Colombia: dd/mm/aaaa. */
export function aFechaLatam(valor) {
  const iso = aInputDate(valor);
  if (!iso) return "";
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Convierte una fecha escrita como dd/mm/aaaa (o yyyy-mm-dd) a ISO.
 * Devuelve "" si se dejó vacía y null si no representa una fecha real.
 */
export function normalizarFechaEntrada(valor) {
  let texto = String(valor ?? "").trim();
  if (!texto) return "";

  // En celular el teclado numérico no siempre ofrece la barra. También
  // aceptamos 25072026 y lo convertimos a 25/07/2026.
  if (/^\d{8}$/.test(texto)) {
    texto = `${texto.slice(0, 2)}/${texto.slice(2, 4)}/${texto.slice(4)}`;
  }

  const match = texto.match(/^(?:(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{1,2})-(\d{1,2}))$/);
  if (!match) return null;

  const dia = Number(match[1] || match[6]);
  const mes = Number(match[2] || match[5]);
  const anio = Number(match[3] || match[4]);
  const comprobacion = new Date(anio, mes - 1, dia);

  if (
    comprobacion.getFullYear() !== anio ||
    comprobacion.getMonth() !== mes - 1 ||
    comprobacion.getDate() !== dia
  ) {
    return null;
  }

  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Medianoche de hoy, para comparar días sin que la hora estorbe. */
function hoy() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Días desde hoy hasta la fecha. Negativo = ya pasó. Null si no hay fecha. */
export function diasHasta(valor) {
  const d = valor instanceof Date ? valor : fecha(valor);
  if (!d) return null;
  const objetivo = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((objetivo - hoy()) / 86400000);
}

/* ======================================
   FILAS INVÁLIDAS

   En vez de inventar un ID y seguir como si nada, juntamos las filas
   rotas para poder mostrárselas a quien administra la hoja.
====================================== */

function crearReporte() {
  return { filas: [], agregar(hoja, fila, motivo) { this.filas.push({ hoja, fila, motivo }); } };
}

/* ======================================
   BOTIQUINES
====================================== */

export function normalizarBotiquines(filas = [], reporte = crearReporte()) {
  return asArray(filas)
    .map((fila) => {
      const id = texto(fila?.id_botiquin);

      if (!id) {
        reporte.agregar("Botiquines", fila, "Falta id_botiquin");
        return null;
      }

      return {
        id,
        nombre: texto(fila?.nombre, id),
        tipo: texto(fila?.tipo),
        ubicacion: texto(fila?.ubicacion),
        responsable: texto(fila?.responsable),
        frecuenciaRevisionDias: numero(fila?.frecuencia_revision_dias, 0) || null,
        ultimaRevision: fecha(fila?.fecha_ultima_revision),
        activo: texto(fila?.estado).toLowerCase() !== "inactivo",
        observaciones: texto(fila?.observaciones)
      };
    })
    .filter(Boolean);
}

/* ======================================
   CATÁLOGO

   Es la referencia normativa: qué debe llevar cada tipo de botiquín,
   en qué unidad y si vence. Cuando el inventario tiene un dato sucio,
   el catálogo es quien manda.
====================================== */

export function normalizarCatalogo(filas = [], reporte = crearReporte()) {
  return asArray(filas)
    .map((fila) => {
      const id = texto(fila?.id_elemento);

      if (!id) {
        reporte.agregar("Catalogo", fila, "Falta id_elemento");
        return null;
      }

      return {
        id,
        nombre: texto(fila?.nombre_elemento, id),
        tipoBotiquin: texto(fila?.tipo_botiquin),
        categoria: texto(fila?.categoria),
        cantidadRequerida: numero(fila?.cantidad_requerida, 0),
        unidad: texto(fila?.unidad),
        tieneVencimiento: booleano(fila?.tiene_vencimiento, false),
        requiereLote: booleano(fila?.requiere_lote, false),
        activo: booleano(fila?.activo, true),
        observaciones: texto(fila?.observaciones)
      };
    })
    .filter(Boolean);
}

/* ======================================
   INVENTARIO
====================================== */

/**
 * La columna `unidad` de Inventario está corrupta: trae el número 1 en
 * vez del texto ("unidad", "paquete", "caja"). El dato bueno vive en
 * Catalogo, así que resolvemos por id_elemento y sólo usamos el valor
 * de Inventario cuando es texto de verdad.
 */
function resolverUnidad(filaUnidad, entradaCatalogo) {
  const propia = texto(filaUnidad);
  const esNumero = propia !== "" && Number.isFinite(Number(propia));

  if (propia && !esNumero) return propia;
  if (entradaCatalogo?.unidad) return entradaCatalogo.unidad;
  return "unidad";
}

/**
 * @param {Array} filas          respuesta de getInventario
 * @param {Array} catalogo       catálogo YA normalizado
 * @param {Array} botiquines     botiquines YA normalizados
 */
export function normalizarInventario(
  filas = [],
  catalogo = [],
  botiquines = [],
  reporte = crearReporte()
) {
  const porElemento = indexar(catalogo, "id");
  const porBotiquin = indexar(botiquines, "id");

  return asArray(filas)
    .map((fila) => {
      // El ID real y nada más. Sin fallback, sin índice, sin inventos.
      const id = texto(fila?.id_item);

      if (!id) {
        reporte.agregar(
          "Inventario",
          fila,
          `Falta id_item (elemento: "${texto(fila?.elemento, "?")}")`
        );
        return null;
      }

      const elementoId = texto(fila?.id_elemento);
      const entradaCatalogo = elementoId ? porElemento.get(elementoId) : null;
      const botiquinId = texto(fila?.id_botiquin);
      const botiquin = botiquinId ? porBotiquin.get(botiquinId) : null;

      const cantidad = numero(fila?.cantidad_actual, 0);
      const minimo = numero(fila?.cantidad_minima, entradaCatalogo?.cantidadRequerida ?? 0);
      const vence = fecha(fila?.fecha_vencimiento);

      const item = {
        id,
        botiquinId,
        botiquinNombre: botiquin?.nombre || botiquinId,
        elementoId,
        nombre: texto(fila?.elemento) || entradaCatalogo?.nombre || id,
        categoria: entradaCatalogo?.categoria || "",
        cantidad,
        minimo,
        unidad: resolverUnidad(fila?.unidad, entradaCatalogo),
        vence,
        diasParaVencer: diasHasta(vence),
        ultimaReposicion: fecha(fila?.fecha_ultima_reposicion),
        // La hoja llama a esta columna `activo_(si/no)`, no `activo`.
        activo: booleano(fila?.["activo_(si/no)"] ?? fila?.activo, true),
        tieneVencimiento: entradaCatalogo?.tieneVencimiento ?? Boolean(vence),
        requiereLote: entradaCatalogo?.requiereLote ?? false
      };

      item.estado = calcularEstado(item);
      return item;
    })
    .filter(Boolean);
}

/**
 * Estado de un ítem, en orden de gravedad.
 *
 * Sobre bajo stock: la condición correcta es `cantidad < minimo`, no
 * `<=`. Con `<=` un ítem perfectamente surtido (20 de un mínimo de 20)
 * salía como bajo stock — así es como 31 de 32 ítems terminaron en
 * alerta y el tablero dejó de significar nada.
 */
export function calcularEstado(item = {}) {
  const cantidad = numero(item.cantidad, 0);
  const minimo = numero(item.minimo, 0);

  if (cantidad <= 0) return ESTADO.FALTANTE;

  const dias = item.diasParaVencer ?? diasHasta(item.vence);
  if (dias !== null && dias < 0) return ESTADO.VENCIDO;

  if (cantidad < minimo) return ESTADO.BAJO_STOCK;

  if (dias !== null && dias <= DIAS_AVISO_VENCIMIENTO) return ESTADO.POR_VENCER;

  // Debería tener vencimiento según el catálogo pero la hoja no lo trae.
  if (item.tieneVencimiento && !item.vence) return ESTADO.SIN_DATOS;

  return ESTADO.OK;
}

export function metaEstado(estado) {
  return ESTADO_META[estado] || ESTADO_META[ESTADO.SIN_DATOS];
}

/** ¿Este ítem necesita que alguien haga algo? */
export function requiereAccion(item = {}) {
  return item.estado !== ESTADO.OK;
}

/** Cuánto hay que reponer para volver al mínimo. */
export function faltanteParaMinimo(item = {}) {
  return Math.max(0, numero(item.minimo, 0) - numero(item.cantidad, 0));
}

/* ======================================
   REPOSICIONES
====================================== */

export function normalizarReposiciones(filas = [], reporte = crearReporte()) {
  return asArray(filas)
    .map((fila) => {
      const id = texto(fila?.id_reposicion);

      if (!id) {
        reporte.agregar("Reposiciones", fila, "Falta id_reposicion");
        return null;
      }

      return {
        id,
        fecha: fecha(fila?.fecha),
        botiquinId: texto(fila?.id_botiquin),
        itemId: texto(fila?.id_item),
        nombre: texto(fila?.nombre_elemento),
        cantidad: numero(fila?.cantidad_repuesta, 0),
        unidad: texto(fila?.unidad),
        nuevoVencimiento: fecha(fila?.fecha_vencimiento_nueva),
        lote: texto(fila?.lote),
        responsable: texto(fila?.responsable),
        motivo: texto(fila?.motivo),
        inspeccionOrigenId: texto(fila?.id_inspeccion_origen),
        observaciones: texto(fila?.observaciones)
      };
    })
    .filter(Boolean);
}

/* ======================================
   INSPECCIONES
====================================== */

export function normalizarInspecciones(filas = [], reporte = crearReporte()) {
  return asArray(filas)
    .map((fila) => {
      const id = texto(fila?.id_inspeccion);

      if (!id) {
        reporte.agregar("Inspecciones", fila, "Falta id_inspeccion");
        return null;
      }

      return {
        id,
        botiquinId: texto(fila?.id_botiquin),
        fecha: fecha(fila?.fecha),
        hora: texto(fila?.hora),
        responsable: texto(fila?.responsable),
        estadoGeneral: texto(fila?.estado_general),
        observaciones: texto(fila?.observaciones_generales)
      };
    })
    .filter(Boolean);
}

/* ======================================
   ALERTAS

   El backend manda alertas propias, pero las calcula con la regla
   equivocada de bajo stock. Preferimos derivarlas del inventario ya
   normalizado: una sola regla, un solo lugar.
====================================== */

export function calcularAlertas(inventario = []) {
  return asArray(inventario)
    .filter((item) => item.activo && requiereAccion(item))
    .map((item) => {
      const meta = metaEstado(item.estado);

      return {
        id: `${item.id}:${item.estado}`,
        itemId: item.id,
        botiquinId: item.botiquinId,
        botiquinNombre: item.botiquinNombre,
        estado: item.estado,
        severidad: meta.tone === "danger" ? "critical" : "warning",
        titulo: meta.label,
        elemento: item.nombre,
        detalle: describirAlerta(item),
        orden: meta.orden
      };
    })
    .sort((a, b) => b.orden - a.orden || a.elemento.localeCompare(b.elemento));
}

function describirAlerta(item) {
  switch (item.estado) {
    case ESTADO.FALTANTE:
      return `No hay unidades. Se requieren ${item.minimo} ${item.unidad}.`;
    case ESTADO.BAJO_STOCK:
      return `Quedan ${item.cantidad} de ${item.minimo} ${item.unidad}. Faltan ${faltanteParaMinimo(item)}.`;
    case ESTADO.VENCIDO:
      return `Venció hace ${Math.abs(item.diasParaVencer)} días. Retirar y reponer.`;
    case ESTADO.POR_VENCER:
      return `Vence en ${item.diasParaVencer} días.`;
    case ESTADO.SIN_DATOS:
      return "El catálogo dice que este elemento vence, pero no hay fecha registrada.";
    default:
      return "";
  }
}

/* ======================================
   RESUMEN PARA EL TABLERO
====================================== */

export function resumir(inventario = [], botiquines = []) {
  const activos = asArray(inventario).filter((item) => item.activo);
  const cuenta = (estado) => activos.filter((item) => item.estado === estado).length;

  return {
    botiquines: asArray(botiquines).filter((b) => b.activo).length,
    items: activos.length,
    vencidos: cuenta(ESTADO.VENCIDO),
    porVencer: cuenta(ESTADO.POR_VENCER),
    bajoStock: cuenta(ESTADO.BAJO_STOCK),
    faltantes: cuenta(ESTADO.FALTANTE),
    sinDatos: cuenta(ESTADO.SIN_DATOS),
    alDia: cuenta(ESTADO.OK),
    requierenAccion: activos.filter(requiereAccion).length
  };
}

/* ======================================
   ARMADO COMPLETO

   Un solo punto de entrada: le entregas las respuestas crudas del
   Web App y devuelve el estado completo de la app, ya coherente.
====================================== */

export function construirEstado({
  botiquines: botiquinesRaw = [],
  catalogo: catalogoRaw = [],
  inventario: inventarioRaw = [],
  inspecciones: inspeccionesRaw = [],
  reposiciones: reposicionesRaw = []
} = {}) {
  const reporte = crearReporte();

  const botiquines = normalizarBotiquines(botiquinesRaw, reporte);
  const catalogo = normalizarCatalogo(catalogoRaw, reporte);
  const inventario = normalizarInventario(inventarioRaw, catalogo, botiquines, reporte);
  const inspecciones = normalizarInspecciones(inspeccionesRaw, reporte);
  const reposiciones = normalizarReposiciones(reposicionesRaw, reporte);

  return {
    botiquines,
    catalogo,
    inventario,
    inspecciones,
    reposiciones,
    alertas: calcularAlertas(inventario),
    resumen: resumir(inventario, botiquines),
    filasInvalidas: reporte.filas
  };
}

/* ======================================
   CONSULTAS

   Las vistas preguntan por aquí en vez de recorrer arreglos a mano.
====================================== */

export function itemPorId(inventario = [], id) {
  const buscado = texto(id);
  if (!buscado) return null;
  return asArray(inventario).find((item) => item.id === buscado) || null;
}

export function itemsDeBotiquin(inventario = [], botiquinId) {
  const buscado = texto(botiquinId);
  if (!buscado) return asArray(inventario);
  return asArray(inventario).filter((item) => item.botiquinId === buscado);
}

export function botiquinPorId(botiquines = [], id) {
  const buscado = texto(id);
  if (!buscado) return null;
  return asArray(botiquines).find((b) => b.id === buscado) || null;
}

/**
 * Lo que hay que comprar, agrupado por elemento y sumando todos los
 * botiquines. Es la vista de pedido.
 */
export function calcularPedido(inventario = []) {
  const porElemento = new Map();

  asArray(inventario)
    .filter((item) => item.activo && faltanteParaMinimo(item) > 0)
    .forEach((item) => {
      const clave = item.elementoId || item.nombre;
      const actual = porElemento.get(clave);

      if (actual) {
        actual.cantidad += faltanteParaMinimo(item);
        actual.botiquines.push(item.botiquinNombre);
        return;
      }

      porElemento.set(clave, {
        elementoId: item.elementoId,
        nombre: item.nombre,
        categoria: item.categoria,
        unidad: item.unidad,
        cantidad: faltanteParaMinimo(item),
        botiquines: [item.botiquinNombre]
      });
    });

  return [...porElemento.values()].sort(
    (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)
  );
}

/* ======================================
   ORDEN Y FILTRO
====================================== */

/** Los que necesitan atención primero, y dentro de eso por gravedad. */
export function ordenarPorUrgencia(items = []) {
  return [...asArray(items)].sort((a, b) => {
    const diff = metaEstado(b.estado).orden - metaEstado(a.estado).orden;
    if (diff !== 0) return diff;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function filtrarItems(items = [], { botiquinId = "", estado = "", busqueda = "" } = {}) {
  const q = texto(busqueda).toLowerCase();

  return asArray(items).filter((item) => {
    if (botiquinId && item.botiquinId !== botiquinId) return false;
    if (estado && item.estado !== estado) return false;

    if (q) {
      const heno = `${item.nombre} ${item.categoria} ${item.id} ${item.botiquinNombre}`.toLowerCase();
      if (!heno.includes(q)) return false;
    }

    return true;
  });
}

/* ======================================
   AUXILIARES
====================================== */

function asArray(valor) {
  return Array.isArray(valor) ? valor : [];
}

function indexar(lista, clave) {
  const mapa = new Map();
  asArray(lista).forEach((entrada) => {
    const k = entrada?.[clave];
    if (k) mapa.set(k, entrada);
  });
  return mapa;
}

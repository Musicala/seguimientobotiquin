/**
 * Seguimiento de Botiquines — Musicala SGSST
 * Backend Apps Script sobre Google Sheets.
 *
 * Contrato de acciones:
 *   GET   getBootstrap, getBotiquines, getCatalogo, getInventario,
 *         getInspecciones, getReposiciones, ping
 *   POST  updateInventarioItem, saveInspeccion, saveReposicion,
 *         deleteReposicion
 *
 * Columnas reales de las hojas (no cambiar sin actualizar js/core/model.js):
 *   Botiquines    id_botiquin, nombre, tipo, ubicacion, responsable,
 *                 frecuencia_revision_dias, fecha_ultima_revision, estado,
 *                 observaciones
 *   Catalogo      id_elemento, nombre_elemento, tipo_botiquin, categoria,
 *                 cantidad_requerida, unidad, tiene_vencimiento,
 *                 requiere_lote, activo, observaciones
 *   Inventario    id_item, id_botiquin, id_elemento, elemento,
 *                 cantidad_actual, cantidad_minima, unidad,
 *                 fecha_vencimiento, fecha_ultima_reposicion,
 *                 activo_(si/no)
 *   Inspecciones  id_inspeccion, id_botiquin, fecha, hora, responsable,
 *                 estado_general, observaciones_generales
 *   Reposiciones  id_reposicion, fecha, id_botiquin, id_item,
 *                 nombre_elemento, cantidad_repuesta, unidad,
 *                 fecha_vencimiento_nueva, lote, responsable, motivo,
 *                 id_inspeccion_origen, observaciones
 */

var CACHE_TTL_SECONDS = 45;
var CACHE_PREFIX = "sb:v4:";

var SHEET_NAMES = {
  botiquines: ["Botiquines", "botiquines"],
  inventario: ["Inventario", "inventario"],
  inspecciones: ["Inspecciones", "inspecciones"],
  reposiciones: ["Reposiciones", "reposiciones"],
  catalogo: ["Catalogo", "Catálogo", "catalogo", "catálogo"]
};

/**
 * Nombres alternativos por campo. La hoja de Inventario llama a su
 * columna `activo_(si/no)`; el código antes escribía en `activo`, no
 * encontraba la columna y fallaba en silencio: el campo nunca se
 * guardaba y nadie se enteraba.
 */
var COLUMN_ALIASES = {
  activo: ["activo", "activo_(si/no)", "activo_si/no", "activo_si_no"],
  cantidad_actual: ["cantidad_actual", "cantidad"],
  cantidad_minima: ["cantidad_minima", "stock_minimo", "cantidad_requerida"],
  fecha_vencimiento: ["fecha_vencimiento", "vencimiento"],
  fecha_ultima_reposicion: ["fecha_ultima_reposicion", "ultima_reposicion"]
};

/* ======================================
   RUTEO
====================================== */

function doGet(e) {
  return route_("GET", e);
}

function doPost(e) {
  return route_("POST", e);
}

function route_(method, e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var body = parseJsonBody_(e);
    var action = normalizeString_(params.action || body.action || "");
    var payload = body.payload || {};

    switch (action) {
      case "ping":
        return jsonOk_({ ok: true, hora: new Date().toISOString() });

      case "getBootstrap":
        return jsonOk_(getBootstrap_(params));
      case "getBotiquines":
        return jsonOk_(readSheet_(SHEET_NAMES.botiquines));
      case "getCatalogo":
        return jsonOk_(readSheet_(SHEET_NAMES.catalogo));
      case "getInventario":
        return jsonOk_(readSheet_(SHEET_NAMES.inventario));
      case "getInspecciones":
        return jsonOk_(readSheet_(SHEET_NAMES.inspecciones));
      case "getReposiciones":
        return jsonOk_(readSheet_(SHEET_NAMES.reposiciones));

      case "updateInventarioItem":
        return jsonOk_(updateInventarioItem_(payload));
      case "updateInventarioBatch":
        return jsonOk_(updateInventarioBatch_(payload));
      case "saveInspeccion":
        return jsonOk_(saveInspeccion_(payload));
      case "saveReposicion":
        return jsonOk_(saveReposicion_(payload));
      case "deleteReposicion":
        return jsonOk_(deleteReposicion_(payload));

      default:
        return jsonError_("Acción no soportada: " + action, 400);
    }
  } catch (err) {
    return jsonError_(String(err && err.message ? err.message : err), 500);
  }
}

/* ======================================
   LECTURA
====================================== */

function getBootstrap_(params) {
  var include = function (key, def) {
    return toBoolParam_(params["include_" + key], def);
  };
  var force = toBoolParam_(params.force_refresh, false);

  var result = {};

  if (include("botiquines", true)) {
    result.botiquines = cachedRead_("botiquines", force, function () {
      return readSheet_(SHEET_NAMES.botiquines);
    });
  }
  if (include("catalogo", true)) {
    result.catalogo = cachedRead_("catalogo", force, function () {
      return readSheet_(SHEET_NAMES.catalogo);
    });
  }
  if (include("inventario", true)) {
    result.inventario = cachedRead_("inventario", force, function () {
      return readSheet_(SHEET_NAMES.inventario);
    });
  }
  if (include("inspecciones", true)) {
    result.inspecciones = cachedRead_("inspecciones", force, function () {
      return readSheet_(SHEET_NAMES.inspecciones);
    });
  }
  if (include("reposiciones", true)) {
    result.reposiciones = cachedRead_("reposiciones", force, function () {
      return readSheet_(SHEET_NAMES.reposiciones);
    });
  }

  return result;
}

/** Lee una hoja completa como array de objetos {encabezado: valor}. */
function readSheet_(names) {
  var sh = findSheetByNames_(SpreadsheetApp.getActive(), names);
  if (!sh) return [];

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(normalizeHeader_);
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    if (isEmptyRow_(data[i])) continue;

    var row = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      row[headers[c]] = serializeCell_(data[i][c]);
    }
    rows.push(row);
  }

  return rows;
}

/** Las fechas salen en ISO; todo lo demás tal cual. */
function serializeCell_(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isEmptyRow_(row) {
  for (var i = 0; i < row.length; i++) {
    if (normalizeString_(row[i]) !== "") return false;
  }
  return true;
}

/* ======================================
   ESCRITURA — INVENTARIO
====================================== */

/**
 * Actualiza una fila de Inventario identificada por su id_item real.
 *
 * Ya no se aceptan identificadores alternativos ni coincidencias
 * aproximadas: el frontend siempre manda el id_item de la hoja. Antes
 * se aceptaba casi cualquier cosa para compensar que el cliente
 * inventaba IDs, y una escritura podía caer en la fila equivocada.
 */
function updateInventarioItem_(payload) {
  var idItem = normalizeString_(payload.id_item);
  if (!idItem) throw new Error("Falta id_item.");

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var sh = findSheetByNames_(SpreadsheetApp.getActive(), SHEET_NAMES.inventario);
    if (!sh) throw new Error("No se encontró la hoja Inventario.");

    var data = sh.getDataRange().getValues();
    var headers = data[0].map(normalizeHeader_);
    var idIdx = headers.indexOf("id_item");
    if (idIdx < 0) throw new Error("La hoja Inventario no tiene columna id_item.");

    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (normalizeString_(data[i][idIdx]) === idItem) {
        rowIdx = i + 1;
        break;
      }
    }

    if (rowIdx < 0) {
      throw new Error('No existe el ítem "' + idItem + '" en la hoja Inventario.');
    }

    writeField_(sh, headers, rowIdx, "cantidad_actual", numberOrSkip_(payload.cantidad_actual));
    writeField_(sh, headers, rowIdx, "cantidad_minima", numberOrSkip_(payload.cantidad_minima));
    writeField_(sh, headers, rowIdx, "fecha_vencimiento", dateOrSkip_(payload.fecha_vencimiento));
    writeField_(sh, headers, rowIdx, "unidad", cleanUnidad_(payload.unidad));
    writeField_(sh, headers, rowIdx, "lote", payload.lote);
    writeField_(sh, headers, rowIdx, "observaciones", payload.observaciones);

    if (payload.activo !== undefined) {
      writeField_(sh, headers, rowIdx, "activo", toBoolLoose_(payload.activo, true) ? "Si" : "No");
    }

    clearReadCache_();

    return {
      message: "Inventario actualizado",
      id_item: idItem,
      record: readRowAsObject_(sh, headers, rowIdx)
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Actualiza varias filas de Inventario en una sola llamada.
 *
 * Es lo que usa la pantalla de revisión: quien revisa recorre el
 * botiquín corrigiendo cantidades y fechas, y al final guarda todo de
 * una vez. Ítem por ítem serían 30+ viajes a Sheets (y Apps Script
 * tarda cerca de un segundo por viaje).
 *
 * Un ítem que falle no tumba a los demás: se reportan en `errores`.
 */
function updateInventarioBatch_(payload) {
  var items = payload && payload.items;
  if (!items || !items.length) throw new Error("No se enviaron ítems para actualizar.");

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var sh = findSheetByNames_(SpreadsheetApp.getActive(), SHEET_NAMES.inventario);
    if (!sh) throw new Error("No se encontró la hoja Inventario.");

    var data = sh.getDataRange().getValues();
    var headers = data[0].map(normalizeHeader_);
    var idIdx = headers.indexOf("id_item");
    if (idIdx < 0) throw new Error("La hoja Inventario no tiene columna id_item.");

    // Índice id_item -> fila, para no recorrer la hoja por cada ítem.
    var filaPorId = {};
    for (var i = 1; i < data.length; i++) {
      var id = normalizeString_(data[i][idIdx]);
      if (id) filaPorId[id] = i + 1;
    }

    var actualizados = [];
    var errores = [];

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var itemId = normalizeString_(item.id_item);

      if (!itemId) {
        errores.push({ id_item: "", error: "Falta id_item." });
        continue;
      }

      var rowIdx = filaPorId[itemId];

      if (!rowIdx) {
        errores.push({ id_item: itemId, error: "No existe en la hoja Inventario." });
        continue;
      }

      try {
        writeField_(sh, headers, rowIdx, "cantidad_actual", numberOrSkip_(item.cantidad_actual));
        writeField_(sh, headers, rowIdx, "cantidad_minima", numberOrSkip_(item.cantidad_minima));
        writeField_(sh, headers, rowIdx, "fecha_vencimiento", dateOrSkip_(item.fecha_vencimiento));
        writeField_(sh, headers, rowIdx, "unidad", cleanUnidad_(item.unidad));
        writeField_(sh, headers, rowIdx, "lote", item.lote);
        writeField_(sh, headers, rowIdx, "observaciones", item.observaciones);

        if (item.activo !== undefined) {
          writeField_(sh, headers, rowIdx, "activo", toBoolLoose_(item.activo, true) ? "Si" : "No");
        }

        actualizados.push(itemId);
      } catch (err) {
        errores.push({ id_item: itemId, error: String(err && err.message ? err.message : err) });
      }
    }

    clearReadCache_();

    return {
      message: actualizados.length + " ítem(s) actualizado(s)",
      actualizados: actualizados,
      errores: errores
    };
  } finally {
    lock.releaseLock();
  }
}

/* ======================================
   ESCRITURA — INSPECCIONES
====================================== */

function saveInspeccion_(payload) {
  var idBotiquin = normalizeString_(payload.id_botiquin);
  if (!idBotiquin) throw new Error("Falta id_botiquin.");
  if (!normalizeString_(payload.responsable)) throw new Error("Falta el responsable.");

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var id = appendRow_(SHEET_NAMES.inspecciones, payload, "id_inspeccion", "INS");

    // Dejar constancia de la revisión en el botiquín.
    touchBotiquinRevision_(idBotiquin, payload.fecha);

    clearReadCache_();
    return { message: "Inspección guardada", id_inspeccion: id };
  } finally {
    lock.releaseLock();
  }
}

function touchBotiquinRevision_(idBotiquin, fecha) {
  var sh = findSheetByNames_(SpreadsheetApp.getActive(), SHEET_NAMES.botiquines);
  if (!sh) return;

  var data = sh.getDataRange().getValues();
  var headers = data[0].map(normalizeHeader_);
  var idIdx = headers.indexOf("id_botiquin");
  if (idIdx < 0) return;

  for (var i = 1; i < data.length; i++) {
    if (normalizeString_(data[i][idIdx]) === idBotiquin) {
      writeField_(sh, headers, i + 1, "fecha_ultima_revision", dateOrSkip_(fecha) || new Date());
      return;
    }
  }
}

/* ======================================
   ESCRITURA — REPOSICIONES
====================================== */

/**
 * Registra una reposición Y aplica el stock al inventario.
 *
 * Antes solo se agregaba la fila al historial: el inventario quedaba
 * igual, así que un ítem repuesto seguía apareciendo como faltante.
 * Registrar la reposición sin sumar las unidades no reponía nada.
 */
function saveReposicion_(payload) {
  var idItem = normalizeString_(payload.id_item);
  var cantidad = toNumber_(payload.cantidad_repuesta, 0);

  if (!idItem) throw new Error("Falta id_item.");
  if (!(cantidad > 0)) throw new Error("La cantidad repuesta debe ser mayor que cero.");
  if (!normalizeString_(payload.responsable)) throw new Error("Falta el responsable.");

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var sh = findSheetByNames_(SpreadsheetApp.getActive(), SHEET_NAMES.inventario);
    if (!sh) throw new Error("No se encontró la hoja Inventario.");

    var data = sh.getDataRange().getValues();
    var headers = data[0].map(normalizeHeader_);
    var idIdx = headers.indexOf("id_item");

    var rowIdx = -1;
    for (var i = 1; i < data.length; i++) {
      if (normalizeString_(data[i][idIdx]) === idItem) {
        rowIdx = i + 1;
        break;
      }
    }

    // Se valida ANTES de escribir el historial: no queremos una
    // reposición registrada contra un ítem que no existe.
    if (rowIdx < 0) {
      throw new Error('No existe el ítem "' + idItem + '" en la hoja Inventario.');
    }

    var cantidadIdx = findColumn_(headers, "cantidad_actual");
    var actual = cantidadIdx >= 0 ? toNumber_(data[rowIdx - 1][cantidadIdx], 0) : 0;

    writeField_(sh, headers, rowIdx, "cantidad_actual", actual + cantidad);
    writeField_(sh, headers, rowIdx, "fecha_ultima_reposicion", dateOrSkip_(payload.fecha) || new Date());

    // Reponer con lote nuevo normalmente cambia la fecha de vencimiento.
    var nuevoVencimiento = dateOrSkip_(payload.fecha_vencimiento_nueva);
    if (nuevoVencimiento) {
      writeField_(sh, headers, rowIdx, "fecha_vencimiento", nuevoVencimiento);
    }

    var id = appendRow_(SHEET_NAMES.reposiciones, payload, "id_reposicion", "REP");

    clearReadCache_();

    return {
      message: "Reposición registrada y stock actualizado",
      id_reposicion: id,
      cantidad_anterior: actual,
      cantidad_nueva: actual + cantidad
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteReposicion_(payload) {
  var id = normalizeString_(payload.id_reposicion);
  if (!id) throw new Error("Falta id_reposicion.");

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var sh = findSheetByNames_(SpreadsheetApp.getActive(), SHEET_NAMES.reposiciones);
    if (!sh) throw new Error("No se encontró la hoja Reposiciones.");

    var data = sh.getDataRange().getValues();
    var headers = data[0].map(normalizeHeader_);
    var idIdx = headers.indexOf("id_reposicion");
    if (idIdx < 0) throw new Error("La hoja Reposiciones no tiene columna id_reposicion.");

    for (var i = 1; i < data.length; i++) {
      if (normalizeString_(data[i][idIdx]) === id) {
        sh.deleteRow(i + 1);
        clearReadCache_();
        return { message: "Reposición eliminada", id_reposicion: id };
      }
    }

    throw new Error('No existe la reposición "' + id + '".');
  } finally {
    lock.releaseLock();
  }
}

/* ======================================
   AGREGAR FILAS
====================================== */

/**
 * Agrega una fila y devuelve el ID asignado.
 *
 * El ID se calcula a partir del mayor consecutivo existente, no del
 * número de filas: si alguien borra una fila intermedia, el siguiente
 * ID no debe repetir uno ya usado.
 */
function appendRow_(sheetNames, payload, idField, prefix) {
  var sh = findSheetByNames_(SpreadsheetApp.getActive(), sheetNames);
  if (!sh) throw new Error("No se encontró la hoja de destino.");

  var data = sh.getDataRange().getValues();
  if (data.length === 0) throw new Error("La hoja no tiene encabezados.");

  var headers = data[0].map(normalizeHeader_);
  var idIdx = headers.indexOf(normalizeHeader_(idField));

  var id = normalizeString_(payload[idField]) || nextId_(data, idIdx, prefix);
  var row = new Array(headers.length);

  for (var c = 0; c < headers.length; c++) {
    var key = headers[c];

    if (c === idIdx) {
      row[c] = id;
      continue;
    }

    var valor = payload[key];

    if (valor === undefined || valor === null) {
      row[c] = "";
    } else if (key.indexOf("fecha") > -1) {
      row[c] = dateOrSkip_(valor) || "";
    } else {
      row[c] = valor;
    }
  }

  sh.appendRow(row);
  return id;
}

function nextId_(data, idIdx, prefix) {
  var max = 0;

  if (idIdx >= 0) {
    for (var i = 1; i < data.length; i++) {
      var m = normalizeString_(data[i][idIdx]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }

  return prefix + "-" + padLeft_(max + 1, 4);
}

function padLeft_(num, size) {
  var s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
}

/* ======================================
   ESCRITURA DE CELDAS
====================================== */

/** Busca una columna considerando sus nombres alternativos. */
function findColumn_(headers, field) {
  var key = normalizeHeader_(field);
  var idx = headers.indexOf(key);
  if (idx >= 0) return idx;

  var aliases = COLUMN_ALIASES[key];
  if (!aliases) return -1;

  for (var i = 0; i < aliases.length; i++) {
    idx = headers.indexOf(normalizeHeader_(aliases[i]));
    if (idx >= 0) return idx;
  }

  return -1;
}

/** Escribe una celda. `undefined` significa "no tocar este campo". */
function writeField_(sheet, headers, rowIdx, field, value) {
  if (value === undefined) return;

  var colIdx = findColumn_(headers, field);
  if (colIdx < 0) return;

  sheet.getRange(rowIdx, colIdx + 1).setValue(value);
}

function readRowAsObject_(sheet, headers, rowIdx) {
  var values = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  var row = {};

  for (var c = 0; c < headers.length; c++) {
    if (!headers[c]) continue;
    row[headers[c]] = serializeCell_(values[c]);
  }

  return row;
}

/* ======================================
   LIMPIEZA DE VALORES

   La hoja acumuló datos sucios: "-" en fechas y el número 1 en la
   columna unidad. Al guardar los dejamos limpios, para que el problema
   se vaya corrigiendo solo a medida que se usa la app.
====================================== */

var VACIOS = ["", "-", "--", "n/a", "na", "null", "undefined"];

function isBlankish_(value) {
  if (value === null || value === undefined) return true;
  return VACIOS.indexOf(String(value).trim().toLowerCase()) >= 0;
}

function numberOrSkip_(value) {
  if (value === undefined || value === null || value === "") return undefined;
  var n = Number(value);
  return isNaN(n) ? undefined : n;
}

/**
 * Devuelve una Date real, "" para vaciar, o undefined para no tocar.
 * Así un "-" heredado se convierte en celda vacía en vez de propagarse.
 */
function dateOrSkip_(value) {
  if (value === undefined) return undefined;
  if (isBlankish_(value)) return "";

  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";

  // Fecha sin hora: evita que la zona horaria corra el día.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** La unidad es texto. Si llega un número (el 1 heredado), se descarta. */
function cleanUnidad_(value) {
  if (value === undefined) return undefined;

  var s = normalizeString_(value);
  if (!s) return undefined;
  if (!isNaN(Number(s))) return undefined;

  return s;
}

/* ======================================
   CACHÉ
====================================== */

function cachedRead_(key, force, producer) {
  var cache = CacheService.getScriptCache();
  var cacheKey = CACHE_PREFIX + key;

  if (!force) {
    var hit = cache.get(cacheKey);
    if (hit) {
      try {
        return JSON.parse(hit);
      } catch (_) {
        // caché corrupta: se relee
      }
    }
  }

  var value = producer();

  try {
    cache.put(cacheKey, JSON.stringify(value), CACHE_TTL_SECONDS);
  } catch (_) {
    // Supera el límite de 100 KB por entrada: se sirve sin cachear.
  }

  return value;
}

function clearReadCache_() {
  CacheService.getScriptCache().removeAll([
    CACHE_PREFIX + "botiquines",
    CACHE_PREFIX + "catalogo",
    CACHE_PREFIX + "inventario",
    CACHE_PREFIX + "inspecciones",
    CACHE_PREFIX + "reposiciones"
  ]);
}

/* ======================================
   UTILIDADES
====================================== */

function findSheetByNames_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}

function normalizeHeader_(value) {
  return normalizeString_(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeString_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber_(value, fallback) {
  var n = Number(value);
  return isNaN(n) ? (fallback || 0) : n;
}

function toBoolLoose_(value, fallback) {
  if (typeof value === "boolean") return value;
  if (isBlankish_(value)) return fallback;

  var v = String(value).trim().toLowerCase();
  if (["si", "sí", "s", "true", "1", "x", "yes"].indexOf(v) >= 0) return true;
  if (["no", "n", "false", "0"].indexOf(v) >= 0) return false;

  return fallback;
}

function toBoolParam_(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function parseJsonBody_(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch (_) {
    return {};
  }
}

function jsonOk_(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(message, status) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message, status: status || 500 }))
    .setMimeType(ContentService.MimeType.JSON);
}

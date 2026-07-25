# Backend en Apps Script

## Qué hay que hacer (una vez)

1. Abre la hoja de cálculo de botiquines en Google Sheets.
2. Menú **Extensiones → Apps Script**.
3. Borra todo el contenido de `Código.gs` y pega el contenido completo de
   [`Code.gs`](./Code.gs) de esta carpeta.
4. Guarda (Ctrl+S).
5. **Implementar → Gestionar implementaciones**.
6. En la implementación existente, pulsa el lápiz ✏️ y en *Versión* elige
   **Nueva versión**. Pulsa **Implementar**.

Importante: usa **Gestionar implementaciones → Nueva versión**, no
*Nueva implementación*. Una implementación nueva genera otra URL y habría
que cambiarla en `js/core/config.js`.

## Cómo comprobar que quedó bien

Abre esta dirección en el navegador (reemplaza por tu URL):

```
https://TU_WEB_APP/exec?action=getBootstrap
```

Debe responder JSON que empiece por `{"ok":true,...}` y traer
`botiquines`, `catalogo`, `inventario`, `inspecciones` y `reposiciones`.

## Qué cambia al desplegar

Sin desplegar, la app **funciona igual** pero en modo degradado:

| | Sin desplegar | Desplegado |
|---|---|---|
| Guardar una revisión de 30 ítems | 30 peticiones (~40 s) | 1 petición (~2 s) |
| Eliminar del historial | No disponible | Disponible |
| Reponer suma stock al inventario | No | Sí |
| Corregir `unidad` y `"-"` al guardar | No | Sí |
| Alertas de bajo stock del backend | Falsas (`<=`) | Correctas (`<`) |

El frontend detecta solo si la acción existe y usa el camino lento
cuando no está, así que nada se rompe mientras tanto.

## Acciones

| Acción | Método | Para qué |
|---|---|---|
| `getBootstrap` | GET | Trae todas las hojas de una vez |
| `getBotiquines`, `getCatalogo`, `getInventario`, `getInspecciones`, `getReposiciones` | GET | Hoja individual |
| `ping` | GET | Comprobar conexión |
| `updateInventarioItem` | POST | Actualiza un ítem por `id_item` |
| `updateInventarioBatch` | POST | Actualiza varios ítems en una llamada |
| `saveInspeccion` | POST | Registra una revisión |
| `saveReposicion` | POST | Registra reposición **y suma el stock** |
| `deleteReposicion` | POST | Borra una fila del historial |

## Reglas del contrato

**Los IDs son de la hoja.** El frontend nunca inventa un `id_item`.
Si una fila de `Inventario` no tiene `id_item`, la app la muestra como
inválida en lugar de asignarle uno: un ID inventado hace que las
ediciones se escriban en la fila equivocada o se pierdan en silencio.

**Los nombres de columna importan.** Si renombras una columna en Sheets,
hay que actualizar `js/core/model.js`. Casos ya contemplados:

- `activo_(si/no)` — se acepta también `activo`.
- `unidad` — si trae un número, se usa la del catálogo vía `id_elemento`.
- `fecha_vencimiento` — `"-"` y vacío se leen como "sin fecha".

**Bajo stock es `cantidad < minimo`**, no `<=`. Con `<=`, un ítem
completo (20 de un mínimo de 20) salía como bajo stock: así llegaron a
aparecer 31 alertas sobre 32 ítems.

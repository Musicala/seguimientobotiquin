# Seguimiento de Botiquines · Musicala

Control de inventario, vencimientos y reposiciones de los botiquines
institucionales, para el SGSST.

**App:** https://musicala.github.io/seguimientobotiquin/

## Cómo funciona

Sitio estático (HTML, CSS y JavaScript sin dependencias ni compilación)
servido por GitHub Pages. Los datos viven en una hoja de Google Sheets a
la que se accede mediante un Web App de Google Apps Script.

```
GitHub Pages  ──►  Apps Script (Web App)  ──►  Google Sheets
   la app            la API                     los datos
```

## Las tres pantallas

**Revisión** — la pantalla de trabajo. Se elige un botiquín y se corrigen
cantidades y fechas directamente en la lista, sin abrir ventanas. Los
cambios se acumulan y se guardan todos juntos al final. Al terminar,
"Registrar revisión" deja constancia en la hoja `Inspecciones`.

**Pedido** — lo que falta para llegar a los mínimos, consolidado por
elemento sumando todos los botiquines. Se puede copiar o imprimir.

**Historial** — reposiciones y revisiones registradas, para auditoría.

## Estructura

```
index.html            Estructura de la página
css/app.css           Todos los estilos
js/
  app.js              Arranque y navegación
  core/
    config.js         URL del Web App y configuración
    model.js          Normalización y reglas de negocio  ← el corazón
    api.js            Cliente HTTP del Web App
    store.js          Estado de la aplicación
  ui/
    dom.js            Utilidades de DOM y formato
    modal.js          Modales y formularios
    avisos.js         Notificaciones
  vistas/
    revision.js       Pantalla principal
    pedido.js         Pedido consolidado
    historial.js      Reposiciones y revisiones
apps-script/
  Code.gs             Backend (ver su README para desplegarlo)
  README.md           Pasos de despliegue y contrato de la API
```

## Reglas que conviene no romper

**Los IDs vienen de Sheets.** `js/core/model.js` nunca inventa un
`id_item`. Si una fila no lo trae, se reporta como inválida en vez de
asignarle uno: un ID generado a partir del índice del arreglo cambia al
filtrar u ordenar, y hace que las ediciones se escriban en la fila
equivocada o se pierdan sin aviso.

**Las reglas de negocio viven en un solo sitio.** Los estados de cada
ítem, las alertas y el pedido se derivan en `model.js` a partir del
inventario. El backend no calcula alertas por su cuenta, para que no
puedan contradecirse.

**Bajo stock es `cantidad < minimo`.** Con `<=`, un ítem completo (20 de
un mínimo de 20) se marca como bajo stock.

## Configuración

Si cambia la URL del Web App, se actualiza en `js/core/config.js`.

Al actualizar el backend usa **Implementar → Gestionar implementaciones →
✏️ → Nueva versión**. Crear una *Nueva implementación* genera otra URL y
la app se quedaría hablando con el despliegue anterior.

## Desarrollo

No hay build. Para probar en local hace falta un servidor (los módulos ES
no cargan desde `file://`):

```bash
python -m http.server 5599
```

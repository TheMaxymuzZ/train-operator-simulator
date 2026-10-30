# Changelog

Todas las versiones del simulador. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y la numeración, [Semantic Versioning](https://semver.org/lang/es/). La versión visible en la interfaz se define en `js/version.js`.

## [0.3.0] - 2026-10-30

### Añadido
- **Vías de apartado** (sin andén) en las estaciones, además de las vías con andén. Los trenes de viajeros que paran necesitan andén; los mercancías y los trenes que no paran usan primero el apartado.
- **Ancho de vía**: líneas de ancho estándar, ibérico y mixto. La alta velocidad solo circula por ancho estándar y los mercancías por ibérico; los trenes de larga distancia son de ancho variable y pasan por los **cambiadores** de Valladolid, León y Ourense, de uno en uno.
- **Incidencias**: limitaciones temporales de velocidad (obras, viento, niebla, catenaria), fallos de circuito de vía, averías de tren con mensaje del maquinista y atención a viajeros en estación. Se pueden desactivar al empezar.
- **Orden de rebase**: ante un fallo de circuito de vía, el operador autoriza al tren a pasar en marcha a la vista a 30 km/h.
- **Panel de trayecto**: al pulsar una línea se ven su longitud, vía, ancho, velocidad, cantones, bloqueo de sentido, LTV, fallos y trenes en circulación.
- **Turnos**: mañana (06–14), tarde (14–22) o jornada completa. El turno de tarde empieza con la red ya en servicio.
- **Informe de fin de turno** con puntualidad y retraso por tipo de tren, trenes con más retraso, incidencias, órdenes del operador y calificación. Se puede consultar en cualquier momento (tecla `I`) y descargar como texto.
- **Manual de operación** integrado (tecla `H`) y atajos de teclado.
- Versión visible en la cabecera, la pantalla de inicio y la barra de estado.
- Contador de incidencias en la cabecera, sombreado de LTV y fallos en el gráfico de marcha, icono de la aplicación.

### Cambiado
- Los mercancías Alicante–Madrid y Sevilla–Madrid se sustituyen por Valencia–Barcelona y Bilbao–Valladolid, que circulan por ancho ibérico.
- El registro de eventos conserva los últimos 30 mensajes y se puede desplazar.
- El código de la interfaz se reparte en `ui.js` (mapa y entrada), `panels.js` (paneles e informes) y `main.js` (arranque).

## [0.2.0] - 2026-10-30

### Añadido
- Simulador sobre la red española: 31 estaciones reales, doble vía y vía única, zoom y sectores.
- Cantones con señales, curva de frenado, reservas de vía, paso por vía general y bloqueo de sentido en vía única.
- Horario diario de unas 270 circulaciones (AV, LD, MD, mercancías) con puntualidad y retraso medio.
- Mando automático o manual por estación, retención de trenes, avisos y gráfico de marcha por corredor.

### Eliminado
- El prototipo arcade de la versión 0.1.0.

## [0.1.0] - 2026-10-30

### Añadido
- Prototipo jugable: monitor con 6 terminales y 10 desvíos, trenes con destino, colisiones y puntuación.

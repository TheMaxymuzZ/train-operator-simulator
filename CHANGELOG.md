# Changelog

Todas las versiones del simulador. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y la numeración, [Semantic Versioning](https://semver.org/lang/es/). La versión visible en la interfaz se define en `js/version.js`.

## [0.4.0] - 2026-10-30

### Añadido
- **Pantalla de título con acceso de operador**: ID de operador, clave y puesto de mando, seguidos de una secuencia de carga del puesto (enclavamientos, cantones, señales y horario) con barra de progreso. El acceso es simulado: vale cualquier clave y no se envía ningún dato; solo se recuerda el ID en el navegador.
- El **puesto** elegido (mando central o uno de los seis sectores) fija la vista inicial del mapa.
- Operador en la cabecera, con botón para cerrar sesión, y en el informe de fin de turno.

### Cambiado
- **Trenes** dibujados como composiciones con forma propia por tipo: AV con cabezas motrices aerodinámicas en ambos extremos, LD de tres coches, MD de dos y mercancías con locomotora y vagones. Cada coche y cada vagón se coloca sobre la vía por separado, así que la composición sigue el trazado y se dobla al pasar por una estación donde cambia la dirección de la línea; los coches que aún no han salido de la estación de origen no se dibujan. Llevan luz de cabeza (apagada cuando el tren está parado), el marco de selección y de aviso sigue toda la composición y la etiqueta tiene fondo para leerse sobre la vía.
- **Estaciones** con nodo de esquinas redondeadas, doble marco en las de 6 o más andenes, núcleo y marca M en ámbar en mando manual y línea de andén bajo las vías con andén.
- **Cambiadores** con los dos anchos dibujados dentro del rombo, que parpadea mientras cambia un tren.
- **Señales** con mástil y foco.
- **Leyenda** con los mismos iconos que el mapa.

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

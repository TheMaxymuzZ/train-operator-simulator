# Train Operator Simulator

Simulador de regulación de tráfico ferroviario sobre la red española. La pantalla es el puesto de mando: fondo oscuro, interfaz de terminal, líneas esquemáticas sobre el mapa de España e iconos de colores por tipo de tren.

## La red

- 32 estaciones reales (Madrid, Barcelona, Zaragoza, Valencia, Sevilla, Málaga, Bilbao, A Coruña…) unidas por líneas de **doble vía** y de **vía única**.
- Cada línea está dividida en **cantones** de unos 12 km, protegidos por señales (verde, amarillo, rojo). Un tren nunca entra en un cantón ocupado y frena con antelación según su curva de frenado.
- En **vía única** solo circulan trenes en un sentido a la vez, y un tren solo entra si tiene vía reservada en la estación siguiente para el cruce.
- Las estaciones tienen un número limitado de vías. Los trenes que no paran atraviesan la estación por la vía general si la línea siguiente está libre.

## Trenes y horario

Unas 270 circulaciones diarias de cuatro tipos, cada uno con su velocidad máxima y su color:

| Tipo | Velocidad | Color |
| --- | --- | --- |
| AV · Alta velocidad | 300 km/h | cian |
| LD · Larga distancia | 200 km/h | violeta |
| MD · Media distancia | 160 km/h | verde |
| MER · Mercancías | 100 km/h | ámbar |

Cada tren tiene su horario de paso por cada estación. La puntualidad cuenta llegadas con 5 minutos de retraso o menos.

## Cómo jugar

- **Arrastra** para mover el mapa, **rueda** o pellizco para el zoom, o usa los botones de sector. Al acercarte aparecen los cantones y las señales.
- **Clic en una estación** para ver sus vías, los trenes que se acercan y los próximos orígenes.
- Cada estación puede estar en mando **AUTO** o **MANUAL**:
  - En **AUTO** el sistema asigna vías por orden de llegada, da salida en cuanto la línea está libre y hace que los trenes lentos cedan el paso a los rápidos. Las vías impares se usan para los trenes que se alejan de Madrid y las pares para los que se acercan.
  - En **MANUAL** tú asignas la vía de entrada (`V1`, `V2`…), das **PASO** a los trenes que no paran y la orden de **SALIDA** a los que están en el andén.
- **RETENER** detiene un tren en su próxima estación hasta que lo liberes: sirve para dejar adelantar o para ordenar los cruces en vía única.
- La columna **AVISOS** y los círculos rojos en el mapa marcan trenes que esperan una orden o llevan más de 10 minutos parados.
- El **gráfico de marcha** muestra, por corredor, el horario previsto (discontinuo) y la marcha real (continua).
- Velocidad de simulación: pausa (espacio), x1, x10, x30 y x60.

## Ejecutar en local

No hay dependencias ni compilación: abre `index.html` en el navegador.

## Publicar en GitHub Pages

En el repositorio, ve a **Settings → Pages**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. El juego quedará en `https://<usuario>.github.io/train-operator-simulator/`.

## Estructura

- `index.html` y `style.css`: interfaz del puesto de mando.
- `js/data.js`: estaciones, líneas, tipos de tren, plan de servicios y corredores.
- `js/sim.js`: simulación (cantones, frenado, reservas de vía, vía única, horario, regulación automática).
- `js/ui.js`: mapa, cámara, panel lateral, gráfico de marcha y controles.

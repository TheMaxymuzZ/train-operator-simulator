# Train Operator Simulator

Simulador minimalista de control de tráfico ferroviario. La pantalla es el monitor del operador: fondo oscuro, vías como líneas, desvíos numerados y trenes que entran a la red con un destino.

## Cómo jugar

- Es el turno de mañana, de 06:00 a 14:00 (un segundo real equivale a un minuto de juego).
- Los trenes se anuncian en un terminal unos segundos antes de entrar. Cada tren tiene el color del terminal al que va.
- **Clic en un desvío** (círculo numerado) o pulsa su **tecla 1-0** para cambiar la vía. La ruta activa se ve más clara y la otra rama queda cortada.
- **Clic en un tren** para detenerlo o reanudar la marcha.
- Un desvío con un tren encima se bloquea (se marca en ámbar).
- Llegada a tiempo: +100. Con retraso: +40. Destino equivocado: −75 y un error. Con tres errores te relevan del puesto.
- Una colisión termina el turno al instante.
- `P` o espacio pausa la simulación. El botón `x1/x2` acelera el tiempo.

## Ejecutar en local

No hay dependencias ni compilación: abre `index.html` en el navegador.

## Publicar en GitHub Pages

En el repositorio, ve a **Settings → Pages**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. El juego quedará en `https://<usuario>.github.io/train-operator-simulator/`.

## Estructura

- `index.html`: interfaz del puesto (cabecera, monitor y registro de eventos).
- `style.css`: estética de terminal.
- `game.js`: red de vías, trenes, desvíos, colisiones y bucle de juego en canvas.

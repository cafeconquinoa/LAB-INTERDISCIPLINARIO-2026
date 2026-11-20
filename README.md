# Cortafuego La Reina — Dashboard web

Dashboard web independiente para GitHub Pages. La interfaz conserva el diseño del HTML que originalmente estaba embebido en el firmware Arduino.

## Estructura
- `index.html`: estructura del dashboard.
- `styles.css`: estilos originales extraídos del sketch.
- `script.js`: interfaz, gráficos, estados, simulación de nodos de demostración y cliente MQTT.
- `config.js`: URL WSS del broker y topic MQTT público.
- `firmware/Cortafuego_La_Reina.ino`: firmware de la ESP32.
- `design-system.md`: tokens visuales documentados.

## Comunicación
La ESP32 publica por MQTT TCP en `broker.hivemq.com:1883`, topic `cortafuego/grupo1/nodo1/estado`. El navegador se suscribe al mismo topic mediante MQTT sobre WebSocket seguro (WSS) en `wss://broker.hivemq.com:8884/mqtt`. El JSON publicado por el firmware se mantiene.

## Probar localmente
No abras `index.html` mediante `file://`. Inicia un servidor estático desde esta carpeta, por ejemplo:

```bash
python -m http.server 8000
```

Luego abre `http://localhost:8000`. La conexión MQTT requiere internet y que el broker público esté disponible.

## Publicar en GitHub Pages
1. Crea un repositorio público y sube el contenido de esta carpeta a la raíz.
2. En Settings → Pages, elige Deploy from a branch.
3. Selecciona `main` y `/ (root)` y guarda.
4. Espera la publicación y abre la URL indicada por GitHub Pages.

## Seguridad y limitaciones
- El topic estático del broker público no tiene autenticación: cualquiera que lo conozca podría publicar o leer mensajes. Úsalo solo para demostración; no envíes datos sensibles.
- No pongas credenciales WiFi, claves privadas ni tokens en `config.js`.
- GitHub Pages solo aloja el frontend; no ejecuta el firmware `.ino`.
- Los nodos no conectados siguen usando la simulación que ya existía en el dashboard (`DEMO=true`).

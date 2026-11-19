# Design system — Cortafuego La Reina

Este documento registra los tokens extraídos del dashboard original. La migración conserva su interfaz y estilos.

## Tipografía
- Familia: Inter (fuente WOFF2 embebida en `styles.css`), con fallback system-ui / Segoe UI / Arial.
- Escala: 12, 14, 16, 18, 24 y 32 px.

## Colores
- Fondo: `--bg` (gris `--g100`, #F3F4F6).
- Paneles: `--panel` (#FFFFFF).
- Texto principal: `--ink` (#131927).
- Texto secundario: `--muted` (#4D5461).
- Primario: `--p500` (#0095FF), `--p700` (#006AB5).
- Éxito: `--ok` (#308242).
- Advertencia: `--warn` (#B57900).
- Crítico: `--crit` (#D93E39).

## Espaciado y forma
- Espaciado: 4, 8, 12, 16, 24 y 32 px.
- Radios: 6, 8 y 12 px.
- Sombras: `--sh1`, `--sh2` y `--sh4`.

## Reglas de conservación
- No cambiar los nombres de clases ni IDs existentes sin actualizar `script.js`.
- Mantener los colores semánticos de estados: normal, advertencia, crítico y sin conexión.
- Mantener el diseño responsive definido en `styles.css`.

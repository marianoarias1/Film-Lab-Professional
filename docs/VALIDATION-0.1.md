# Validación · 0.1

Fecha: 19 de octubre de 2026 (UTC). Entorno de ejecución: Linux x86_64, motor Rust optimizado, hasta 8 hilos; Electron 44.9.0. Motor Windows x64 compilado de manera cruzada y paquete Electron Windows generado; **no se ejecutó en Windows** ni se verificó todavía con un ARW real de la Sony a6100.

## Pruebas realizadas

- Compilación/check del puente Rust contra ambas revisiones fijadas; builds release Linux y Windows x64.
- Dos pruebas Rust: conservación de diferencias float menores que un paso de 8 bits; rechazo de valores y curvas inválidos.
- Seis pruebas Node: ajustes por archivo, historial por gesto, rehacer invalidado al editar, selección parcial/vacía, snapshot de motor y guardado atómico/recuperación de originales faltantes.
- Integración real: JPEG 640×480, DNG Bayer sintético 128×96 de 16 bits, video MP4/H.264 320×240 de 2 segundos con tono AAC. Apertura, previews neutras y ajustadas, fuga de luz, exportaciones PNG16/JPEG95/MP4. No se reemplazó el motor por mocks.
- Inspección de PNG: profundidad 16 en exportaciones y perfil ICC sRGB presente. JPEG exportado con perfil ICC.
- ffprobe: MP4 exportado conserva video y audio; ambos empiezan en 0; video 2.000 s, audio 2.005 s. Esto cubre el clip sintético, no todos los códecs, variantes VFR o archivos de cámaras.
- Interfaz ejecutada dentro de Electron en Linux con motor nativo real. Los diálogos de archivos se sustituyeron por rutas de fixtures únicamente en el test: importación, IPC/protocolo de preview, receta, sliders, undo/redo, cambio de archivo sin contagiar ajustes, exportación de una selección, Laboratorio, comparación, cierre exterior del popup y recuperación local. Se verificó layout a 1500×980 y 1100×700.

## Medición orientativa

Un JPEG de prueba de **24 MP (6000×4000)**:

| Operación | Tiempo |
| --- | ---: |
| Abrir y preparar fuente | 367 ms |
| Preview neutra 1500×1000 | 118 ms |
| Preview con luz, claridad y ruido | 162 ms |
| Cambiar exposición con etapas calientes | 86 ms |

Son muestras individuales en este entorno, con otra compilación corriendo en paralelo: no un benchmark estadístico ni una predicción para Windows. Falta medir memoria pico, video 1080p/4K, RAW de cámaras reales, exportaciones largas, HDR/Log, VFR, cancelación bajo carga y estabilidad de una sesión extensa.

## Qué validar en el equipo del usuario

Abrir un ARW de Sony a6100 y un video habitual del teléfono/cámara. Revisar color neutro, recuperación de luces, detalle, tiempos, memoria, audio y exportación. Confirmar cierre/reapertura del proyecto y volver a vincular un original movido. Mantener las recetas Professional marcadas como experimentales hasta calibrarlas con fotos diversas.

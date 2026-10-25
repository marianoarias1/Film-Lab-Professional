# Validación 0.4

24 de octubre de 2026. Motor y Electron ejecutados en Linux x64; Windows x64 GNU compilado en release con Rust 1.99.1. **El paquete Windows no se ejecutó aquí. No se midió la nueva versión en el i5-10400F/RTX 4060 del usuario ni en una sesión NVENC real.** Se preserva el camino de codificación 0.3 validado antes por el usuario.

## Exportación

Se compararon 0.3 y 0.4 en el mismo entorno, usando el JPEG 1365×2048 y el video H.264 1080×1920 de 12,167 s del usuario. Se tomaron los ajustes del último fotograma registrado en su diagnóstico de video (incluyen exposición, color, claridad, neblina, grano y fuga de luz) y se usaron en ambas versiones. Video en CPU/VBR 20 Mbps; PNG16 a tamaño original.

| Medio | 0.3 | 0.4 | Menor tiempo |
|---|---:|---:|---:|
| photo | 0.661 s | 0.553 s | 16.4 % |
| video | 101.886 s | 94.227 s | 7.5 % |

Muestras aisladas de un entorno compartido: no son promedios estadísticos ni una predicción para la PC del usuario. Las salidas son idénticas byte por byte (SHA-256). Se verificó H.264 1080×1920, 30 fps, 365 frames y audio AAC estéreo; ambas pistas empiezan en 0. La optimización evita una conversión a preview y su histograma, sin reducir resolución, precisión o calidad. El beneficio es moderado; los efectos siguen siendo CPU.

La unidad `direct_export_keeps_float_samples_with_curves_grain_and_leak` compara las muestras float normales y directas, incluyendo HSL/curva/grano/fuga. Las exportaciones de fotos ahora registran revelado, grade, encode y escritura; video identifica que no genera imagen/histograma intermedios.

## Recetas y compatibilidad

- Snapshot del commit 59d7fedb3a5b5a57d27f08c0fe4e310a58c78a15 de `marianoarias1/film-lab`. 51 referencias, 30 activas, 21 retiradas conservadas y cinco presets Pro históricos ocultos salvo proyecto activo.
- Los 51 registros se renderizaron en el motor real; las 30 activas produjeron 30 imágenes distintas en el fixture RGB. Exportación MP4 con adaptación Fuji, HSL y audio correcta. No implica calibración uno a uno contra cámara o web.
- Se verificaron créditos, URLs originales, metadata de cámara, valores web retenidos, curvas válidas y regeneración exacta del catálogo sin red.
- 17 pruebas Node: modelo, selección/historial, proyectos, progreso/cola de preview, telemetría, catálogo y migración de proyectos anteriores. Siete pruebas Rust: precisión/validación, retry, caché, mezclador/tamaño y equivalencia directa.
- Integración: JPEG, DNG sintético, TIFF16, PNG16/JPEG95 y video con audio; automático sin NVIDIA que pasa a CPU, cancelación dirigida y caché de preview con invalidación por archivo/tiempo/calidad.
- Proyecto nuevo identifica engine 0.4. El lector admite/migra el identificador 0.1 usado por 0.1–0.3, sin modificar los valores. Las versiones antiguas rechazan proyectos guardados por 0.4, para no omitir los controles nuevos.

## Interfaz

Electron real con motor nativo y fixtures; solo se sustituyeron los diálogos por rutas de test y la apertura de fuente por captura de URL. Se probaron: 30 recetas visibles, búsqueda por @shadovisuals, estilo monocromo, fuente HTTPS correcta, HSL por banda, undo/redo e independencia por archivo, curva de 17 puntos con inputs legibles y exportar solo el video seleccionado con diagnóstico 0.4. Cero errores de renderer. Se inspeccionó visualmente a 1500×980.

## Alcance y pendientes

Google Fotos es investigación con documentación oficial de Google y Adobe; no se implementó OAuth ni se accedió a cuentas. Ver GOOGLE-PHOTOS.md. Las recetas están interpretadas para LightCraft; la revisión/calibración de apariencia y RAW Sony real sigue pendiente. No se agregó GPU para efectos ni se asegura respuesta/velocidad idéntica en distintos equipos. Standard no fue modificado. Los tests históricos se conservan en VALIDATION-0.3.md y anteriores.

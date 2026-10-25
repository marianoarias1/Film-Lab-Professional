# Validación · 0.3

19 de octubre de 2026. Motor y Electron ejecutados en Linux x64 con hasta 8 hilos; Rust 1.99.1. El paquete Windows x64 se compila de forma cruzada. **No se ejecutó Windows aquí ni se midió la respuesta en el i5-10400F del usuario.** La validación NVENC exitosa del usuario corresponde a 0.2; esta modificación no altera esa ruta.

## Pruebas

- 14 pruebas Node: modelo, independencia por archivo, selección, persistencia, exportación/progreso y nuevas pruebas de cola. Un arrastre continuo muestra borradores; solo hay una solicitud en vuelo y una pendiente. El resultado de un archivo anterior y un error obsoleto se descartan. Un refinamiento sustituido no tapa un gesto nuevo. Telemetría acotada, agrupación por calidad y validación de números no finitos.
- Cinco pruebas Rust: validación, precisión float, política de encoding/reintento y claves completas de caché de video.
- Integración de caché con MP4 real: acierto al cambiar ajustes del mismo frame, invalidación al buscar otra posición, separación Draft/Full, máximo dos entradas, limpieza al abrir otra fuente y liberación de fuente.
- Integración previa: JPEG, DNG sintético, TIFF16, PNG16/JPEG95 y MP4 con audio. CPU y automático sin NVIDIA, cancelación dirigida y motor respondiendo después de cancelar.
- Comparación entre motores 0.2 y 0.3: preview final Full de foto y video a 1500 px con exposición, denoise, textura, claridad y grano **idéntica en SHA-256**. Exports ajustados PNG16 y MP4/audio del fixture, incluyendo fuga de luz, **idénticos byte por byte** en modo CPU. Los originales y la política de exportación no cambian.

## Medición de preview con los archivos del usuario

Se probaron el JPEG 1365×2048 y el MP4 1080×1920 de 12,167 s proporcionados. Cinco valores de exposición por escenario; mediana de las cuatro solicitudes posteriores a la primera. `light` modifica exposición; `detail` agrega denoise 20, textura 10, claridad 10 y grano 8. No se conocen los ajustes exactos que produjo el usuario en 0.2; estos son escenarios de prueba explícitos.

0.2 usa 900 px y Full, como su UI anterior; 0.3 usa 640 px y Draft al arrastrar. Se mide IPC + motor, no presentación de pantalla. Son mediciones orientativas en este entorno compartido, no un benchmark estadístico ni una predicción del equipo del usuario.

| Escenario | 0.2 | 0.3 |
|---|---:|---:|
| photo · light | 34.0 ms | 19.4 ms |
| photo · detail | 42.8 ms | 23.1 ms |
| video · light | 50.0 ms | 14.3 ms |
| video · detail | 66.4 ms | 21.0 ms |

## Arrastre en Electron real

Se inyectaron 30 eventos de exposición separados por 30 ms (~900 ms), seguidos de change, con los originales reales y el motor nativo. Solo los diálogos de archivos se sustituyeron por rutas de test. La versión 0.2 no cambió el src visible durante el gesto; la 0.3 lo cambió **28 veces en foto y 29 veces en video**. Esto cuenta cambios de imagen en DOM, no garantiza la cantidad de frames que el monitor presentó físicamente.

Después del gesto, la imagen refinada vuelve a 1500 px. Undo/redo y cambio entre archivos conservan sus valores por separado. El diagnóstico se guardó desde Proyecto y no contiene rutas ni medios. Cero errores de renderer. Las estimaciones inputToPaint del diagnóstico incluyen la decodificación y dos requestAnimationFrame; no equivalen a la medición física de la pantalla. Las dos versiones usaron el mismo runtime Electron y calidad final.

## Límites

Los efectos siguen en CPU y el video se edita por fotograma; no se agregó reproducción de todos los efectos en tiempo real. Durante el gesto se reduce resolución y se omiten refinamientos costosos del modo Draft; la vista final se calcula Full. Un trabajo Full que ya comenzó aún puede demorar el siguiente borrador: no se agregó cancelación a mitad del pipeline. Cambios muy costosos y equipos diferentes requieren medir con el nuevo informe. No se promete respuesta instantánea para cualquier combinación ni mejora de tiempo de exportación.

El informe de interacción retiene hasta 120 previews completadas de la sesión; sus valores no se suben. El paquete Windows aún necesita probarse en el equipo del usuario. Las dependencias y revisiones upstream se conservaron; solo se modificó el puente y la UI propios de Professional. Ver VALIDATION-0.2.md y VALIDATION-0.1.md para pruebas previas. Standard permanece intacto.

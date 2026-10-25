# Catálogo web → Professional 0.4

Origen: https://github.com/marianoarias1/film-lab/commit/59d7fedb3a5b5a57d27f08c0fe4e310a58c78a15 . Snapshot del 24-10-2026. Base + editorial + referencias Fuji + catálogo de descubrimiento, con curación por ID de la misma revisión. 51 registros, 30 activos. Las recetas privadas de cuentas no se consultaron.

Se preservan ID, nombre, descripción, creador, paleta, URL, valores de cámara/referencia, `webSettings` normalizados y metadatos de adaptación. Professional se marca como interpretación. Una receta Fuji ya era una interpretación en la web; trasladarla no reproduce su simulación propietaria.

| Entrada web | Interpretación Pro |
|---|---|
| Luz, contraste, WB, saturación/intensidad | Controles de LightCraft, con respuestas diferentes |
| Curva + gamma + desvanecido | Curva compuesta de hasta 17 puntos o puntos originales; interpolación de LightCraft |
| HSL de ocho bandas | Mezclador perceptual; tono escalado y límites validados |
| Color Chrome / Blue Chrome | Reducción de luminosidad por bandas, ponderada por cromaticidad; no algoritmo Fuji |
| Grano / tamaño | Controles nativos con escala de tamaño convertida |
| Nitidez positiva | Nitidez nativa |
| Nitidez negativa / suavidad | Aproximación por detalle y reducción de ruido |
| Monocromo | B&W de LightCraft |

Laboratorio y encuadre son nulos en estos registros web: no se descartaron capas activas. Los cinco presets Pro anteriores conservan IDs y settings, ocultos para evitar duplicados pero disponibles al abrir proyectos viejos. Las retiradas también pueden renderizarse si se referencian.

`node scripts/import-web-catalog.mjs` regenera JSON y JS desde `scripts/web-reference`, sin red ni credenciales. Para actualizar, reemplazar coherentemente snapshot/commit, revisar curación, regenerar y probar. La aplicación no descarga código remoto al abrirse.

Pruebas: los 51 registros son aceptados por el motor; las 30 activas producen 30 resultados distintos en el fixture RGB; exportación de video con una adaptación Fuji y audio. Esto verifica ejecución, **no calibración visual uno a uno** frente a Fuji o todos los RAW. La revisión y calibración por cámara siguen pendientes.

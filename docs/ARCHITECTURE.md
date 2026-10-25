# Arquitectura del prototipo

Renderer HTML/CSS/JS → API limitada del preload → proceso principal Electron → proceso Rust por JSON Lines.

El renderer no tiene Node, no ejecuta comandos, no accede libremente al disco, no navega a sitios externos y no carga recursos remotos. El proceso principal permite únicamente archivos elegidos en diálogos y proyectos abiertos explícitamente. Los previews se exponen mediante URLs con tokens en un protocolo local, no un servidor HTTP abierto.

El proceso Rust posee una fuente activa. Para fotos conserva una fuente float reducida y su StageCache. Los exports vuelven a revelar el original a tamaño completo. Para video, FilmCraft abre por rangos, interpreta transferencia/primarias y obtiene fotogramas; se convierten a Rec.2020 lineal y pasan por el mismo pipeline de LightCraft. Para exportarlos, la salida float lineal sRGB se entrega a una MediaSource de FilmCraft; el audio original se delega al mismo source y FilmCraft codifica/multiplexa. No se usa la salida PNG8 de la preview para exportar fotos ni video.

La fuga de luz propia se agrega en la salida float, antes de codificar. El tamaño y posición se normalizan. La gradación de sombras/luces y grano se delegan a LightCraft.

Los cambios de slider se agrupan por gesto para el historial; las previews se coalescen con una sola solicitud en vuelo y una última pendiente. Las respuestas de otra revisión o archivo se descartan. La UI usa 640 px y Quality::Draft durante un gesto y solicita un refinamiento Full a 1500 px tras una pausa de 180 ms al terminar.

La recuperación y los proyectos son JSON versionado; escritura a temporal con fsync y rename, serializada. Los originales se referencian por ruta y se registra tamaño/fecha para detectar modificaciones. Se rechazan versiones de motor desconocidas. No se envían archivos a nube.

Limitaciones deliberadas: efectos CPU, una fuente activa, sin reproducción continua con efectos en tiempo real, sin video HDR de salida ni paquete completo de herramientas Standard. Esta primera versión permite validar el recorrido sin ocultar esas ausencias.

## Exportación 0.2

`export_diagnostics.rs` registra exclusivamente la fábrica NVENC de FilmCraft, sin habilitar decodificadores de plataforma. Las métricas de efectos usan contadores atómicos y los tiempos de etapas se capturan como deltas por exportación e intento. La disponibilidad solicitada nunca se confunde con el codificador real: se observan las sesiones y fotogramas de hardware de FilmCraft. Los fallos de sesión pueden reiniciar todo el archivo una vez en CPU; no se cambia de codificador dentro del mismo stream.

El proceso principal crea un temporal en la carpeta de destino y lo renombra al terminar; asocia eventos de progreso al archivo y conserva el último diagnóstico mediante escritura atómica. El informe no controla el éxito del archivo: un fallo de escritura del informe se comunica como advertencia aparte. Los originales y temporales conocidos se redactan de los errores antes de guardarlos en el informe. La UI no sube diagnósticos ni consulta servicios externos.

## Interacción 0.3

`PreviewQueue` reemplaza el debounce de interacción: inicia un trabajo inmediatamente y conserva una intención pendiente reemplazable. Las revisiones de ajustes ya no invalidan cada resultado de borrador; solo cambiar de contexto invalida una respuesta. Se muestran borradores terminados mientras llegan nuevos controles. Los refinamientos obsoletos se omiten si hay otra intención pendiente. La presentación precarga/decodifica la imagen antes de cambiar el src visible.

En Rust, `Photo` tiene StageCache independiente para borrador y Full. `State::video_previews` retiene hasta dos entradas de fotogramas RGB32f con su StageCache, identificadas por archivo, bits del tiempo solicitado, tamaño y calidad. Reutilizar una entrada evita volver a decodificar y transformar el mismo fotograma y mantiene estable el Arc que identifica la fuente para el cache de LightCraft. Abrir otra fuente o liberar la activa limpia sus entradas. La ruta export no usa estas previews ni altera su calidad, tamaño o ajustes.

El principal conserva hasta 120 muestras completadas con tiempos de cola/apertura/nativo, ajustes y basename. El renderer reconoce su traceId después de decodificar y dos requestAnimationFrame, sin bloquear el siguiente render durante esa medición. Esto es una aproximación de latencia de presentación, no una medición física del monitor. Los refinamientos miden desde su solicitud tras la pausa; no se mezclan con el gesto. El contador de intenciones coalescidas es acumulativo: no se suma entre muestras. El informe se genera solo cuando el usuario lo solicita.

## Exportación y catálogo 0.4

La extensión local `render_deep_cached` calcula la misma salida de precisión que la ruta Full, omitiendo la preview/histograma intermedios. El puente aplica la misma fuga de luz sobre el buffer float; PNG16 y video lo consumen directamente. JPEG genera su RGBA de salida una sola vez. Los benchmarks de referencia produjeron los mismos bytes.

El catálogo es un snapshot fijo del repo Standard, con IDs/créditos/valores originales y una interpretación de parámetros separada. El mezclador HSL y tamaño de grano se agregan a Settings con defaults equivalentes a 0.3. La versión de proyecto se incrementa a 0.4 por las herramientas nuevas: se aceptan/migran proyectos del identificador 0.1 anterior, pero los proyectos nuevos no se abren silenciosamente en engines viejos.

Las URLs de fuente se resuelven por ID en el principal usando el catálogo empaquetado y solo se abren mediante HTTPS tras un clic. No se entrega al renderer una API genérica para abrir URLs. Google Fotos queda como investigación de una futura conexión opcional; no se incluyen credenciales ni se realizan solicitudes OAuth.

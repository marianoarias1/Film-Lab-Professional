# Professional 0.5 · Laboratorio con máscaras

Esta entrega agrega máscaras locales radiales, lineales, pincel y rangos de luminosidad. Consultá [la guía de máscaras](docs/MASKS.md) y [la validación de 0.5](docs/VALIDATION-0.5.md). El manual y los diagnósticos anteriores se conservan como referencia.

# Film Lab Professional · prototipo 0.4

Aplicación de escritorio independiente de Film Lab Standard. Procesamiento local, originales intactos, sin cuenta, sin Supabase ni sincronización. Interfaz de Film Lab, con tonos crema y verde y tipografías DM Sans y Manrope incluidas localmente.

## Probar en Windows sin compilar

Descargá y **extraé todo** el ZIP de Windows en una carpeta. Abrí `Film Lab Professional.exe`; no abras el ejecutable dentro del ZIP ni separes la carpeta `resources`. La distribución es una carpeta portátil, no un instalador. No necesita Node.js, Rust, Python ni FFmpeg para usarse. Windows puede mostrar un aviso porque el prototipo no está firmado.

1. Agregá un JPEG, un RAW compatible o un video corto MP4/MOV.
2. Elegí un filtro y probá Editar → Luz / Color / Textura / Curva.
3. Abrí Laboratorio para probar fuga de luz, grano y color en luces/sombras. Con fuga mayor que cero, arrastrá sobre la foto para ubicarla.
4. Seleccioná archivos en la tira inferior y usá Exportar. Cada archivo conserva sus ajustes.
5. En Proyecto, guardá un `.flpro` y volvé a abrirlo. Si movés un original, hacé doble clic en la tarjeta para volver a vincularlo.

**Video:** el deslizador busca un fotograma y aplica los ajustes. `Generar reproducción` crea una copia reducida a 960 px, con efectos y audio, y la reproduce dentro de la app. Volver a editar invalida esa reproducción. Esta prueba todavía no procesa todos los efectos en tiempo real durante la reproducción.

## Nuevo en 0.4: exportación directa y catálogo web

- La exportación genera los datos float que necesita sin fabricar una preview e histograma que no se usan. PNG16 y video evitan esa conversión; JPEG crea su imagen de salida sin el histograma. Se mantiene resolución, precisión, compresión y audio.
- En una prueba aislada en Linux con los archivos y ajustes del diagnóstico del usuario: PNG16 661 → 553 ms y video 101,9 → 94,2 s, ambas salidas idénticas en SHA-256 a 0.3. Es una mejora moderada; no se midió en el i5/RTX del usuario. Los efectos siguen en CPU; NVENC acelera la codificación.
- Se incluyen las **30 recetas activas de la web**, con nombres, descripciones, creadores, referencias y clasificación por escena/estilo. Búsqueda por creador y enlaces a fuentes. Las 21 retiradas quedan como referencias ocultas; los cinco presets Pro anteriores se muestran si un proyecto los usa.
- Son **interpretaciones para LightCraft**, no valores de cámara Fuji ni apariencia idéntica a la web. La conversión de HSL/Color Chrome, curva/gamma/desvanecido, suavidad y grano se documenta en `docs/RECIPES.md`. Se retienen los ajustes originales en `ui/catalog/web-recipes.json`.
- Editar → Color suma el mezclador de ocho bandas. Textura permite variar tamaño del grano. Las curvas importadas de más de cinco puntos se muestran y editan con entradas etiquetadas por posición.
- El diagnóstico de fotos ahora detalla revelado, ajustes, codificación y escritura; el de video identifica que no genera preview/histograma.
- La investigación de Google Fotos está en `docs/GOOGLE-PHOTOS.md`: Picker opcional, OAuth y límites de calidad. Esta entrega no incluye una conexión OAuth configurada ni obliga a iniciar sesión para editar.

## Conservado de 0.3: controles con respuesta progresiva

- La preview se solicita al mover el control, sin esperar 70 ms de pausa. Se presenta el trabajo terminado mientras el usuario sigue arrastrando y se reemplazan los cambios pendientes por el valor más reciente: una solicitud en vuelo y una pendiente, sin una cola creciente.
- Preview interactiva de 640 px y modo Draft de LightCraft; al terminar el gesto, tras 180 ms de pausa, se refina a 1500 px. El tamaño y la calidad de las exportaciones no cambian. Durante el gesto puede verse menos detalle de textura/reducción de ruido.
- Foto: cachés de etapas separados para vista rápida y refinada. Video: se reutilizan los píxeles lineales del mismo fotograma y sus etapas espaciales al cambiar controles. La caché está limitada a dos entradas (una por calidad) y se invalida al cambiar archivo, posición, resolución o calidad; no incluye fotogramas de otro archivo.
- Se conserva la imagen anterior hasta que la nueva esté decodificada. Los resultados de otro archivo o sesión se descartan; un refinamiento atrasado no reemplaza un gesto nuevo.
- **Proyecto → Guardar diagnóstico de respuesta** genera un JSON local con las últimas 120 previews completadas: ajustes, caché, tiempo en cola, procesamiento, decodificación de imagen y estimación hasta presentación. Las métricas de foto/video y borrador/refinamiento están separadas. No hace falta exportar para medir los controles.
- El informe incluye nombres de archivos, valores de ajustes y hardware; no contiene las imágenes/videos ni rutas de originales. No se envía a ningún servidor. Revisalo antes de compartirlo.

Los efectos de preview siguen usando CPU; esta versión no agrega procesamiento GPU ni promete 60 fps en todos los ajustes/equipos. NVENC continúa disponible para exportar video. La apariencia refinada y las exportaciones se mantienen compatibles con 0.2; no cambió el identificador del motor de imagen ni se tocó Film Lab Standard.

## Conservado de 0.2: exportación medible

- Video → **Automática** intenta NVIDIA NVENC; **CPU** fuerza el codificador anterior. Se conserva la política de bitrate variable de 20 Mbps, tamaño, fps y audio de 0.1. Dos codificadores pueden producir archivos distintos aun con igual bitrate; no se promete identidad visual o binaria entre CPU y NVENC.
- Si el driver o dispositivo no admite la solicitud, se utiliza CPU. Si una sesión NVENC falla después de comenzar, se descarta el temporal y se reintenta **una vez desde el inicio** con CPU. Cancelar no dispara ese reintento.
- El progreso muestra codificador real, fotogramas/s, velocidad respecto del tiempo real, tiempo transcurrido y estimación restante **por video**. El tiempo restante es aproximado; no incluye con precisión los pasos finales ni el resto del lote.
- El porcentaje llega a 100 % solo cuando se ha finalizado y renombrado el archivo. Cancelar conserva únicamente los archivos del lote que ya terminaron.
- Por defecto se guarda un `.diagnostico.json` al lado de cada exportación. Se puede desactivar. Proyecto → **Guardar último diagnóstico** permite obtener el informe más reciente incluso tras reiniciar la aplicación. El informe es local: contiene nombre del archivo, CPU, RAM, resolución, tiempos y errores; no incluye fotos, video ni rutas conocidas de los originales. Revisalo antes de compartirlo.
- El informe detalla revelado de fotogramas, conversión de color de entrada, ajustes, empaquetado, codificación, audio y contenedor. Los tiempos acumulados de tareas paralelas se superponen y **no deben sumarse** como tiempo total.
- No hace falta instalar CUDA Toolkit. NVENC requiere una NVIDIA compatible y su driver. AMD/Intel usan CPU en esta versión.

Los proyectos `.flpro` 0.1 siguen siendo compatibles: el identificador del motor de imagen se conserva porque su apariencia no cambió.

## Qué funciona

- Apertura local de fotos, RAW compatibles y videos; errores visibles si un formato no se decodifica.
- Motor Rust real: LightCraft revela y procesa las fotos; FilmCraft lee video, interpreta su color, decodifica audio, codifica y multiplexa la exportación.
- **El mismo ajuste de LightCraft procesa fotos y fotogramas**, evitando dos fórmulas distintas para las recetas.
- Datos fotográficos de trabajo lineales Rec.2020 en RGB float32. Preview reducida para no procesar toda la foto en cada movimiento.
- Exposición, contraste, luces/sombras, blancos/negros, temperatura/matiz, intensidad/saturación, textura, claridad, neblina, grano, nitidez, reducción de ruido y viñeta.
- Curvas por puntos, con arrastre e inputs numéricos; hasta 32 puntos importados.
- Laboratorio inicial: fuga de luz propia de Film Lab con posición, difusión y temperatura; grano compartido; gradación de sombras y luces de LightCraft.
- Catálogo de 30 recetas web interpretadas para Professional, con créditos y referencias. **No son perfiles Fuji calibrados**; se conservan como históricos los presets Pro anteriores.
- Ajustes y deshacer/rehacer por archivo; un arrastre de slider se registra como un paso.
- Comparación por pulsación con el original revelado neutro de Professional.
- Exportación **solo de los archivos seleccionados**, sin sobrescribir un original ni una exportación previa.
- Fotos: PNG RGB de 16 bits o JPEG calidad 95 con crominancia 4:4:4. No se conserva EXIF en esta prueba.
- Videos: MP4/H.264 con audio, tamaño y tasa de fotogramas de origen. Exportación SDR. Un temporal se renombra al terminar correctamente; los fallos no dejan un archivo final aparentemente completo.
- Proyectos `.flpro` versionados, guardado atómico y recuperación automática local. Se referencian originales: **guardar el proyecto no copia las fotos/videos**.
- Solo se retiene una fuente activa reducida en memoria; se limita el número de previews temporales en disco. Los originales de video se leen por rangos cuando el formato lo permite.

## Qué todavía NO es esta versión

Es una prueba técnica integrada, no un reemplazo listo para producción de Lightroom o de Film Lab Standard.

- No hay nube, login, cobros, IA, timeline multipista ni conexiones al repo Standard.
- No se trasladaron aún recorte/giro, máscaras `Dónde aplicar`, polvo, todas las capas del Laboratorio ni favoritos/importación de recetas personales desde una cuenta web. Se incorporarán después de validar el motor; no hay botones que simulen esas funciones.
- Los efectos siguen ejecutándose en CPU, en segundo proceso con hasta 8 hilos. NVIDIA NVENC acelera únicamente la codificación H.264 cuando el hardware y el driver la admiten. No hay procesamiento de efectos ni revelado RAW en GPU.
- Salida de video SDR; no hay control de exportación HDR/Log en esta UI. FilmCraft interpreta los metadatos de color disponibles, pero aún falta validar los perfiles de cámaras y teléfonos reales que usarán los usuarios.
- Video primario y audio primario de cada archivo. No es una herramienta para preservar todas las pistas y metadatos de un contenedor profesional.
- No se conserva transparencia: los archivos con alpha se rechazan para evitar perderla silenciosamente.
- HEIC/HEIF fotográfico no está habilitado. Probar JPG/PNG/TIFF, RAW o video.
- Hasta 100 MP por foto en esta prueba para controlar memoria. Los RAW pueden consumir bastante más memoria durante revelado que un JPEG del mismo tamaño.
- Cámara sin matriz medida disponible: se muestra un aviso de color aproximado. No se asegura paridad con Lightroom ni calibración de todos los modelos.
- Ventana de escritorio mínima 1100 × 700; no es una app mobile.
- No hay sistema de actualización automático. La distribución Windows no está firmada.

## Versionado y compatibilidad

Los proyectos nuevos guardan `engineVersion: filmlab-pro-0.4-lc-d999e382-fc-6c3948a3`. Se abren los proyectos 0.1–0.3 conservando sus ajustes y se migran al guardar. Las versiones anteriores no abren proyectos guardados por 0.4, para no ignorar silenciosamente HSL/tamaño de grano. Se rechazan motores desconocidos. El futuro importador de Standard deberá convertir/recalibrar recetas de manera explícita, conservando ajustes y apariencia originales cuando corresponda.

## Desarrollar desde el código fuente

Requisitos: Node.js LTS compatible con Electron, Git y Rust **1.95 o posterior**. En Windows se recomienda la toolchain MSVC de Rust y Visual Studio Build Tools con la carga `Desarrollo para el escritorio con C++` y Windows SDK. No se usa FFmpeg en ejecución.

```powershell
npm ci
npm run setup
npm run build:engine
npm start
```

También se incluye `INICIAR-WINDOWS.cmd`, que ejecuta esos pasos después de verificar Node y Cargo. La primera compilación puede tardar varios minutos y requiere Internet para descargar dependencias. Luego la aplicación funciona localmente.

```powershell
npm run check
npm test
npm run test:engine
npm run test:preview
npm run test:export
npm run test:catalog
npm run build:win
```

`test:engine` usa JPEG, DNG sintético y clip de 2 segundos con tono de audio incluidos en `tests/fixtures`. Si `ffprobe` está disponible, verifica también la duración y pistas de la exportación. Los archivos de resultados quedan en `tests/fixtures/results`.

`FILMLAB_ENGINE` puede apuntar a un binario del motor para desarrollo. El IPC no expone acceso genérico a disco ni ejecución de comandos al renderer.

## Estructura

- `desktop/`: Electron, puente de proceso Rust y proyectos locales.
- `ui/`: interfaz, modelo por archivo, fuentes locales y controles.
- `native/`: puente Rust y bloqueo de versiones Cargo.
- `vendor/lightcraft`, `vendor/filmcraft`: fuentes upstream fijadas a las revisiones de `docs/UPSTREAM.md`, con la extensión local de exportación documentada en `third-party/patches`.
- `tests/`: selección, historial, persistencia e integración con el motor.
- `third-party/`: licencias, atribución y procedencia de dependencias.
- `docs/VALIDATION.md`: qué se ejecutó, medidas y límites de esa validación.

La app Standard y su repositorio no fueron modificados.

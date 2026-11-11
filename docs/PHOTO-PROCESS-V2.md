# Proceso fotográfico V2 — primer bloque (Professional 0.12)

## Alcance

Esta entrega implementa el primer bloque de V2: reducción de ruido y versionado del proceso. No es la totalidad del plan de la auditoría ni una afirmación de paridad con otros reveladores. RAW/perfiles, reconstrucción de luces, tone mapping, nitidez de salida, GPU y planificación por presupuesto de memoria quedan para bloques posteriores.

Con reducción de ruido de luminancia y color desactivada, V2 mantiene el procesamiento de V1. No se agrega un look ni un cambio de color general. Conservar nitidez/textura es un criterio de evaluación, no una promesa para toda imagen.

## Algoritmo

- V1 conserva sin cambios su filtrado guiado en log-luminancia y suavizado gaussiano de cromaticidad.
- V2 filtra log-luminancia a dos escalas. La segunda usa regularización menor y un aporte del 25 % para limitar la pérdida de bordes y textura. El control Detalle sigue afectando la regularización. La corrección se aplica como una ganancia RGB común, acotada a ±2 EV por seguridad numérica.
- V2 reemplaza el desenfoque indiscriminado de cromaticidad por un filtro de nueve muestras con pesos espaciales, de luminancia y cromaticidad. De este modo protege también fronteras de color con luminancia similar. Mantiene la luminancia y evita recortar independientemente canales negativos del espacio de trabajo.
- Se aplica antes de la nitidez y del grano creativo. Preview refinada, lupa y exportación utilizan la misma implementación; Draft mantiene su política de aproximación existente.
- Conserva la escala respecto de los píxeles del original. El filtro de color usa un buffer RGB auxiliar y contexto máximo de ocho píxeles por eje; la lupa mantiene el halo existente. La etapa de luminancia usa las estructuras de planos y filtros existentes. No es un perfil de ruido medido por cámara/ISO ni un método basado en IA.

Implementación independiente sobre las utilidades de LightCraft bajo MIT OR Apache-2.0. No se copió código de los proyectos GPL estudiados. La extensión se mantiene en `third-party/patches/lightcraft-process-v2.patch`, aplicada después de los dos parches existentes sobre la revisión fijada. El setup comprueba la aplicación previa para permitir ejecuciones repetidas.

## Compatibilidad

`settings.processVersion` distingue 1 y 2. Los ajustes sin el campo se interpretan como V1 tanto en el motor como al restaurar proyectos y versiones de edición. Las fotos nuevas usan V2; los videos nuevos siguen en V1. Reiniciar ajustes conserva el proceso elegido. La versión se guarda en el proyecto, historial, versiones y diagnósticos de preview/exportación. Se puede copiar con el grupo de ajustes de detalle.

La clave de caché incluye el proceso, incluso para la reutilización parcial de Draft. Cambiar V1 → V2 → V1 no reutiliza planos de otro proceso. La interfaz exige el protocolo de motor 0.12, evitando que un ejecutable viejo acepte silenciosamente ajustes V2. Se siguen abriendo proyectos 0.11 y anteriores admitidos por el lector.

## Cómo comparar con las fotos guardadas

1. Conservar intactos los JPG originales, las exportaciones V1 y sus JSON de diagnóstico.
2. Instalar el nuevo ejecutable 0.12 generado por la PR o recompilar el motor. Abrir el mismo original y conservar los ajustes, tamaño y opciones de exportación de la referencia.
3. En Revelar → Detalle → Proceso fotográfico, elegir V1 para verificar la referencia. Elegir V2 para procesar la comparación. Los proyectos anteriores abren en V1 deliberadamente: requieren esta selección explícita.
4. Exportar V2 a otra carpeta y guardar su diagnóstico. El JSON de exportación informa `processVersion` tanto junto al estado como dentro de `settings`.
5. Comparar al 100 %, especialmente sombras, piel, pelo y bordes de color. Si ambos controles de reducción de ruido están en cero, este bloque no debería cambiar la imagen. Para valorar el algoritmo, conservar también un caso con reducción activa en ambos procesos.

Los JSON de diagnóstico contienen ajustes pero esta entrega no añade un importador de esos JSON. Si no se guardó un proyecto, reproducir sus valores antes de comparar. No editar una exportación V1 para obtener V2.

## Validación realizada

- 60 pruebas JavaScript: modelo, persistencia, compatibilidad, versiones y suites existentes.
- 38 pruebas Rust: 9 pruebas nuevas incluyen identidad al desactivar NR, escala cero, neutros/HDR y componentes negativos constantes, reducción de ruido de luminancia y crominancia, conservación del escalón y de luminancia, menor contaminación en una frontera cromática sintética, caché V1/V2 en Full y Draft, y equivalencia float32 entre preview completa y exportación.
- `test:process`: protocolo real, PNG de ruido generado de forma determinista, preview Full/Draft, cambio reversible de caché, exportación PNG16 con ICC, reapertura y lupa. Rechazo de procesos desconocidos.
- Integraciones existentes `test:engine`, `test:detail` y `test:glow`: JPEG, TIFF16, RAW sintético y video; preservación de rutas existentes.
- Sintaxis JS, `git diff --check` y aplicación repetida del setup.
- Comprobación de tiempo de humo (una muestra por proceso, contenedor Linux, preview refinada 1800 de carta 2200×1500, NR 65/85): aproximadamente 319 ms V1 y 316 ms V2 totales. No es benchmark, p95, prueba de aceleración ni medición en la PC del usuario.

La verificación de Chromium local quedó bloqueada por una restricción del entorno al crear sockets; no se presenta como una prueba visual superada. El selector y su persistencia tienen cobertura de modelo y sintaxis, pero requieren verificación de interacción en el ejecutable de Windows.

Las fotos y JSON que guardó el usuario no se adjuntaron a esta sesión; su comparación visual y los tiempos en Windows siguen pendientes. Las pruebas sintéticas no establecen calidad profesional universal ni una mejora en cada fotografía.

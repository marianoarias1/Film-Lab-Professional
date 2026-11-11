# Proceso fotográfico V2 — Professional 0.13

Todas las fotografías usan V2. El selector V1/V2 de 0.12 fue retirado a pedido del usuario. Los proyectos anteriores, sus versiones guardadas y el historial se normalizan a V2 al restaurar o guardar; el backend fuerza V2 en preview, lupa y exportación aunque una petición antigua envíe `processVersion: 1`. El marcador permanece en los diagnósticos para identificar el procesamiento, sin funcionar como opción de interfaz. Los videos mantienen su ruta previa.

Esto constituye una migración intencional: un proyecto antiguo con ajustes de luz/color puede cambiar de aspecto en 0.13. Las exportaciones V1 conservadas y el ejecutable anterior sirven como referencia de comparación; 0.13 no ofrece un modo para reproducir V1 en fotografías. Los originales no se modifican.

## Reducción de ruido (bloque integrado en PR #9)

V2 utiliza dos escalas de filtrado guiado en log-luminancia. La escala gruesa usa regularización menor y aporte del 25 %. La cromaticidad se suaviza con pesos conjuntos de posición, luminancia y color para limitar la contaminación en fronteras cromáticas. Se aplica antes de nitidez y grano creativo, comparte implementación entre preview refinada/lupa/exportación y respeta la escala de píxeles del original. No es un modelo de ruido medido por cámara/ISO ni utiliza IA.

## Luces y color (0.13)

Altas luces y Sombras ajustan la base existente en pasos de exposición mediante funciones softplus. La combinación está acotada para que la derivada de la transformación de base sea al menos 0.35 dentro del rango de controles. La finalidad es evitar inversiones tonales con valores extremos y conseguir una respuesta suave. También se utiliza en las contribuciones de máscaras. Esta propiedad matemática del ajuste se verifica además con rampas completas del pipeline; no demuestra ausencia de cualquier halo en toda fotografía posible.

En salida sRGB SDR se retira la desaturación intermedia al blanco de Rec.2020 y se realiza una proyección de los colores fuera del gamut de destino a luminosidad y ángulo de tono constantes en OkLab, reduciendo cromaticidad. La búsqueda tiene 14 iteraciones máximas y se ejecuta solo en píxeles fuera de gamut; los representables pasan sin cambios por esta función. Blanco/negro y entradas no finitas tienen tratamiento explícito. El resto del pipeline (curvas, calibración, looks y efectos) conserva su orden.

La proyección puede reducir saturación y, cuando la luminosidad queda fuera de su rango físico, limitarla. No conserva simultáneamente todos los atributos de un color no representable ni recupera detalle quemado. No añade espacios de entrega, reconstrucción de canales RAW, perfiles nuevos ni GPU. El nuevo camino de acabado está limitado a sRGB SDR sin soft proofing ni transformación explícita de monitor; otros destinos conservan la ruta de LightCraft existente.

## Comparación con la referencia del usuario

1. Conservar los JPG originales, las exportaciones anteriores y sus JSON.
2. Usar el ejecutable 0.13 (o recompilar), abrir el mismo original y reproducir los ajustes/tamaño/calidad de exportación. No reutilizar la exportación editada como entrada.
3. Exportar a una carpeta nueva y guardar diagnóstico. Revisar especialmente sombras levantadas, luces, colores intensos y transiciones al blanco, además de ruido al 100 %.
4. Registrar diferencias deseadas y regresiones por imagen. Los JSON de diagnóstico contienen ajustes; esta entrega no añade un importador de esos archivos.

La versión de motor es 0.13; `processVersion` continúa siendo 2. Ambos identificadores están en los diagnósticos. Se requiere nuevo ejecutable; los clientes 0.13 rechazan el motor anterior para evitar ignorar las nuevas instrucciones.

## Implementación y validación

Las dependencias continúan fijadas. La nueva capa está en `third-party/patches/lightcraft-photo-tones.patch`, aplicada después de `lightcraft-process-v2.patch` y de las dos extensiones anteriores. Código propio sobre las utilidades MIT OR Apache-2.0 de LightCraft; no se incorporó código GPL de los programas estudiados.

Validación local: 61 pruebas JavaScript y 46 Rust. Incluye migración desde ajustes ausentes/V1/V2, versiones e historial; exclusión del proceso de las opciones copiables; más de 600.000 pasos de rampas para combinaciones extremas; rampas renderizadas completas; identidad de colores representables; continuidad de frontera; conservación de tono/luminosidad OkLab y comparación de error de tono con la proyección lineal anterior en colores sintéticos. La equivalencia float32 entre preview completa y exportación se mantiene.

Integración del protocolo real: `test:process`, `test:engine`, `test:detail` y `test:glow`. Fotos nuevas y peticiones antiguas convergen a V2 en Full/Draft/lupa/exportación; PNG16 con ICC y reapertura verificados; video conserva proceso 1. También se verifican JPEG, TIFF16 y RAW sintético. Sintaxis y setup repetible comprobados. La interacción visual del ejecutable Windows y la comparación con las fotos del usuario quedan pendientes; no se afirma una mejora universal ni paridad con otro editor.

Este bloque no cierra las fases restantes de la auditoría: integración RAW/perfiles, reconstrucción de luces de sensor, refinamiento de detalle, memoria/planificación y GPU siguen pendientes.

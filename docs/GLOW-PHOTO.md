# Resplandor fotográfico · 0.15

Mejora acotada de los estilos **Movimiento** y **Línea** en fotos. No agrega controles ni reproduce un algoritmo de Adobe. La referencia visual aportada muestra estelas originadas en luces y reflejos; también incluye claridad y neblina negativas, que son ajustes independientes.

## Comportamiento

- **Extender** controla la longitud de la estela. Antes también ensanchaba el desenfoque transversal; ahora el grosor depende de **Suavizado** y de la escala de la imagen, no de la longitud.
- **Suavizado** difunde la fuente de luz antes de extenderla. No es un desenfoque de toda la fotografía.
- La cuadrícula de trabajo de estos dos estilos fotográficos varía de 2048 px (extensión mínima) a 1536 px (máxima), limitada por el tamaño real de la salida. Antes siempre se reducía a 768 px. Mejora la representación de luces pequeñas y estelas estrechas; sigue siendo una aproximación de resolución limitada.
- La selección tonal suave, la mezcla en RGB lineal de salida, temperatura y evaluación de máscaras conservan su comportamiento. Una máscara eliminada u oculta no convierte el efecto en global.
- Vista y exportación usan la misma ruta. A igual tamaño de salida se comprueba igualdad float32. Distintas resoluciones de preview y export no se prometen idénticas al píxel.

**Compatibilidad:** los parámetros guardados no cambian. Proyectos anteriores con Movimiento o Línea fotográficos se verán con el tratamiento refinado al abrirlos. Resplandor suave, el estilo direccional anterior y todos los estilos de video mantienen el cálculo previo. El motor y la app deben actualizarse juntos a 0.15; los proyectos 0.14 siguen abriendo.

## Coste y límites

Sigue ejecutándose en CPU. La cuadrícula más fina aumenta memoria y trabajo cuando el efecto está activo. El máximo es 2048 × 2048; las imágenes alargadas usan menos píxeles. No equivale a procesar el resplandor a resolución original completa ni a aceleración GPU.

La referencia no permite conocer la fórmula de Lightroom. No se copian código, perfiles ni recursos de Adobe. Se conserva la convolución direccional propia, con caída exponencial y dos direcciones para Línea.

## Validación

- Pruebas de momentos espaciales: extensión modifica longitud sin modificar varianza transversal; suavidad aumenta grosor sin cambiar sustancialmente la longitud.
- Conservación aproximada de energía de una fuente aislada, simetría de Línea y rotación.
- Reflejo de un píxel en una imagen 2400 × 128, límites, valores finitos y sombras que no generan estelas.
- Igualdad float32 entre preview y exportación en una imagen 1800 × 96, con ambos estilos activos.
- Identidad de los estilos anteriores entre las dos rutas, y referencia de máscara ausente.
- Integración del motor real con JPEG, DNG sintético y video: estilos, rotación, suavidad, desactivación, máscaras y píxeles exportados.
- Revisión visual de reflejos de carrocería y cromo en el JPEG del usuario, comparando 0.14 con 0.15. No es una validación de todos los tipos de escena ni una comparación cuantitativa contra Lightroom.

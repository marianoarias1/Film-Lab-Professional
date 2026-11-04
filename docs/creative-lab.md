# Laboratorio creativo y entrega · Professional 0.8

En **Laboratorio → Desenfoque y movimiento**, **Añadir efecto** crea una capa independiente. Hasta seis capas se combinan en el orden de la lista; se pueden seleccionar, activar/desactivar, eliminar o subir en el orden. Cada archivo conserva sus capas e historial de deshacer/rehacer. Cambiar de receta conserva estos efectos y las máscaras.

## Franja nítida

- Punto central: mover toda la franja.
- Línea central: girar; el cursor y su ayuda indican la acción.
- Líneas continuas exteriores: ampliar o reducir el área nítida.
- Líneas punteadas: extender o comprimir la transición hacia el desenfoque.
- Desenfoque e intensidad siguen en el panel; ancho y transición se manipulan directamente sobre la foto.
- **Disolución de luces** distribuye textura fina y orgánica en el halo luminoso del desenfoque, con tamaño editable. Evita alternar original/blur indiscriminadamente en toda la imagen. Las áreas uniformes no adquieren sal y pimienta. No es grano fotográfico global ni una copia del modo Dissolve de Photoshop; la referencia usa también un sujeto recortado y transparencia, que esta herramienta no deduce automáticamente.

La franja usa una aproximación gaussiana de tres pasadas, en RGB lineal float. La geometría es normalizada para preview/exportación. Las guías se pueden ocultar.

## Trayectorias y pincel

Una capa de trayectorias admite hasta **ocho curvas**, con extremos y control central editables sobre la imagen. **Dibujar curva** permite arrastrar un recorrido nuevo. Seleccionar una curva muestra su longitud y alcance propios; las otras siguen participando. Los recorridos forman un campo de movimiento local con influencia suave según su proximidad. No se aplican como sucesivas pasadas de blur a toda la foto. No implementa todas las opciones de Path Blur de Photoshop ni seguimiento de sujetos.

Las trayectorias **no ofrecen disolución ni nuevas ventanas rectangulares**. Para combinarlas con una franja/disolución, añadir otra capa. El **Pincel de nitidez** quita solo el efecto de la capa de trayectorias seleccionada: el centro recupera completamente su imagen de entrada y el borde cae gradualmente según Suavidad. El cursor muestra radio e interior; tamaño y suavidad son editables. El modo inverso devuelve el desenfoque en lo pintado. Se puede borrar el conjunto de pinceladas o deshacer cada trazo. Hasta 128 trazos y 8192 puntos por capa.

El pincel no reconstruye detalle inexistente: conserva el revelado previo a esa capa, incluidos los efectos anteriores. En video la geometría y el patrón de textura son estáticos, sin tracking ni ruido temporal. Preview, foto y video utilizan el mismo motor float; la exportación completa puede tardar más. El movimiento direccional y las ventanas con marco opcional siguen disponibles en las capas que corresponden.

## Exportación para redes

Los destinos cargan valores iniciales **editables**, sin prometer evitar la recompresión de una plataforma:

| Destino | Tamaño | Encuadre | Video | JPEG |
|---|---|---|---|---|
| Original | Cada original | Completo | FPS original, 20 Mbps | 95 |
| Reels / Stories | 1080 × 1920 | Recortar | FPS original, 12 Mbps | 90 |
| Publicación vertical | 1080 × 1350 | Recortar | FPS original, 12 Mbps | 90 |
| Cuadrado | 1080 × 1080 | Recortar | FPS original, 10 Mbps | 90 |
| Horizontal Full HD | 1920 × 1080 | Completo | FPS original, 16 Mbps | 95 |
| Horizontal 4K | 3840 × 2160 | Completo | FPS original, 40 Mbps | 95 |

MP4: H.264 SDR / Rec.709, AAC, NVENC cuando está disponible con recuperación CPU. Mantiene el audio. FPS 0 conserva la frecuencia original; elegir otra remuestrea temporalmente, sin interpolación por IA. PNG conserva 16 bits; JPEG sRGB 4:4:4 con calidad de 1 a 100. Las dimensiones se limitan a 7680 px y 34 MP; video redondea a dimensiones pares. No ampliar por defecto: un original menor puede producir una entrega menor al tamaño del preset; activar Permitir ampliar para exigir el tamaño solicitado. Conservar imagen completa puede introducir márgenes negros. El encuadre horizontal/vertical 0–1 cambia el anclaje del recorte o de los márgenes.

Los proyectos 0.1–0.7 siguen abriéndose. El efecto único de 0.7 se convierte en una capa y conserva puntos, ventanas y ajustes; las ventanas anteriores de una trayectoria se mantienen para no descartar su protección, aunque las nuevas trayectorias usan el pincel. El motor se identifica como 0.8 para que versiones antiguas no ignoren las capas nuevas. La textura y el campo de movimiento se recalcularon: la apariencia de esos efectos puede variar respecto de 0.7. Después de actualizar: `npm run setup`, `npm run build:engine`, `npm start`.

Validación: `npm test`, `npm run check`, `npm run test:native`, `npm run test:creative`. La integración creativa usa JPEG, DNG y MP4 con audio reales y requiere ffprobe.

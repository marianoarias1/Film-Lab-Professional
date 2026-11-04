# Desenfoque creativo y entrega · Professional 0.7

En **Laboratorio → Desenfoque y movimiento**, activar el efecto y elegir:

- **Movimiento direccional:** orientar los dos puntos sobre la foto; Longitud controla el recorrido. Conservar imagen nítida mezcla el original con el rastro, una aproximación al aspecto de flash y exposición larga.
- **Franja nítida:** ubicar/girar la franja con los puntos. Ancho y transición conservan una zona nítida y desenfocan su exterior.
- **Trayectoria curva:** mover los dos extremos y el tercer punto de control de la curva. Se usa como recorrido del desenfoque, no como selección de sujeto.
- **Disolución:** transición estocástica entre imagen original y desenfocada. Tamaño cambia su textura. Es una interpretación propia de la referencia, no la implementación del modo Dissolve de Photoshop.
- **Ventanas nítidas:** Dibujar ventana y arrastrar sobre la foto; mover el rectángulo y redimensionar desde la esquina. Hasta ocho ventanas por archivo; suavidad y marco blanco opcionales. Ocultar las guías permite ver el resultado sin puntos superpuestos.

Los efectos trabajan en RGB lineal float antes de codificar, se guardan por archivo, admiten deshacer/rehacer y se conservan al cambiar de receta. Desactivarlos recupera el revelado sin el desenfoque; no modifica el original. El detalle protegido procede del original revelado: no reconstruye detalle ausente. En video la geometría es estática, sin tracking ni segmentación automática; el patrón de disolución es determinista para evitar ruido temporal.

La franja usa una aproximación gaussiana de tres pasadas. Movimiento y trayectoria integran hasta 96 muestras por píxel. Previews y exportación usan geometría normalizada y el mismo algoritmo; la exportación de resolución completa puede tardar más. No son simulaciones ópticas de profundidad ni equivalencias exactas con Photoshop.

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

Los proyectos de versiones anteriores se abren con el desenfoque desactivado. Se incrementó la identificación del motor para que una instalación antigua no abra una edición nueva y pierda estos datos silenciosamente. Después de actualizar el código: `npm run setup`, `npm run build:engine`, `npm start`.

Validación: `npm test`, `npm run check`, `npm run test:native`, `npm run test:creative`. La integración creativa usa JPEG, DNG y MP4 con audio reales y requiere ffprobe.

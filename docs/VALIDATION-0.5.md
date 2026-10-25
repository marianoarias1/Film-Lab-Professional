# Validación de Professional 0.5

## Comprobado
- 22 pruebas Node: catálogo, ajustes/historial por archivo, snapshots, selección de exportación, persistencia, cola de previews, OAuth y máscaras.
- 8 pruebas Rust: incluyen aplicación real de radial, lineal, pincel y rango de luminosidad, igualdad exacta de los valores float entre preview y exportación, y recuperación del resultado sin máscara al desactivarla.
- Interfaz en Electron Linux con puente simulado y eventos DOM: crear máscara, ajustar exposición, mover centro, deshacer/rehacer, pintar un trazo y crear rango de sombras. Sin errores JavaScript. No constituye una prueba manual de interacción física en Windows.
- Protocolo real del motor en Linux: abrir JPEG de prueba, DNG sintético y MP4 de dos segundos; preview con y sin máscara diferente; exportación correcta. PNG conserva 16 bits; ffprobe confirma audio y duración del video. Ejecutar `npm run test:masks` después de compilar el motor; la comprobación de video requiere ffprobe en el entorno de pruebas.

## Windows
Ejecutable compilado para x86_64-pc-windows-gnu. Se revisan los límites de todas las secciones PE, los DLL importados y la integridad de los archivos del ZIP. No hay entorno Windows disponible para ejecutar la aplicación aquí: el arranque y la interacción final deben confirmarse en el equipo del usuario.

## Alcance y límites
Máximos: 32 máscaras por archivo, 128 trazos y 10.000 puntos por máscara de pincel. Las máscaras del video no tienen tracking ni animación. No hay selección de personas/cielo por IA. Las guías del pincel muestran trazos, no el alfa exacto de la composición tras borrar. Los valores de luminosidad representan el espacio perceptual del motor y no una medición física ni una equivalencia calibrada con Lightroom.

Se conserva la versión incluida de LightCraft/FilmCraft y sus licencias. No se modifica Film Lab web. El formato de motor es filmlab-pro-0.5-lc-d999e382-fc-6c3948a3; puede leer formatos anteriores y guarda con el nuevo identificador para evitar que versiones viejas ignoren las máscaras.

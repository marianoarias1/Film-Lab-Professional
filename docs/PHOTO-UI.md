# Interfaz fotográfica · 0.15.1

Se conserva la paleta oscura, el verde y las tipografías existentes.

- Se quitan los textos promocionales/técnicos del inspector, filtros y progreso de exportación.
- Proyecto usa el estilo de acciones del encabezado y una flecha SVG con estado accesible.
- Archivos deja de ocupar una opción del encabezado; la tira inferior se conserva.
- Efectos pasa a llamarse Laboratorio. Revelar, Laboratorio y los grupos de ajuste de Máscaras comparten filas compactas, tipografía, divisores y campos.
- Película y color solo se accede desde Laboratorio.
- Curva permite agregar hasta 32 puntos con clic, moverlos en X/Y, quitar puntos interiores con Supr y restablecer. Los extremos permanecen en los bordes y los puntos no se cruzan, para conservar una entrada ordenada. Un arrastre equivale a un paso de deshacer; cancelar un gesto restaura el estado anterior.
- Exportar muestra destino y formato. Tamaño, encuadre, posición, calidad JPEG, ampliación y diagnóstico quedan en Ajustes avanzados. La calidad JPEG solo aparece para JPEG; PNG sigue siendo 16 bits. Destinos sociales proponen JPEG y medidas predefinidas; se pueden modificar.
- Se quitan FPS, bitrate, audio, elección de codificador y referencias visibles a video. El progreso muestra foto, porcentaje y tiempo. No se implementa aceleración GPU nueva.
- El selector local admite solo fotos. Google Fotos rechaza selecciones que no sean fotos antes de descargarlas. Los proyectos previos que incluyen otro tipo de medio no se cargan, sin modificar su archivo ni reemplazar la sesión actual.

El backend nativo conserva su compatibilidad interna anterior; esta entrega limita las entradas y la interfaz de Professional a fotografía. No se cambia el procesamiento de imagen ni el formato de los proyectos fotográficos.

## Verificación

Pruebas JavaScript de curva (inserción, límites, orden y movimiento XY), progreso, Google Fotos (omite medios no fotográficos), proyectos y resto de módulos existentes. Comprobación de sintaxis de la aplicación.

La validación visual automatizada de Chromium/Electron en este entorno se bloqueó por restricciones de sockets del sistema; no se afirma que se haya completado. Revisar con el ejecutable Windows:

1. Abrir JPEG/RAW compatible; recorrer Revelar, Laboratorio y Máscaras.
2. Agregar y mover un punto de curva en ambos ejes; deshacer/rehacer y restablecer.
3. Abrir Exportar: destino y formato visibles, avanzados cerrados; cambiar destino, abrir avanzados y modificar calidad/tamaño.
4. Cerrar con la X o Escape y comprobar que no se exportó; exportar una selección y revisar encuadre.
5. Probar Proyecto, cerrar fuera y volver a abrir. Confirmar que la tira de fotos sigue disponible aunque Archivos ya no aparezca en la navegación superior.

## Ajustes de la misma PR

- La tira carga miniaturas de las fotos sin tener que activarlas. Una cola de baja prioridad hace una solicitud por vez; omite originales ausentes y descarta respuestas de archivos eliminados. Los errores no se reintentan en bucle.
- Se ocultan los mensajes rutinarios de recuperación y los milisegundos de render. Se conserva el aviso si falla el guardado. El espacio de estado se aprovecha para miniaturas más grandes.
- Proyecto comparte la X SVG y el área de pulsación de Exportar. Los campos avanzados tienen alturas y separaciones uniformes; la opción de ampliación ocupa una fila propia.
- Con zoom, arrastrar con clic izquierdo mueve la vista sin cambiar el revelado. Con máscaras o efectos interactivos activos se usa Espacio + arrastrar para conservar sus gestos. El desplazamiento se limita a los bordes y vuelve a cero al cambiar de foto o restablecer zoom.

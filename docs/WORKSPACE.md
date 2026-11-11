# Editor oscuro y scopes de color

En **Biblioteca**, usá **P** para elegir, **X** para descartar y **U** para quitar la marca. Las flechas cambian de toma. Con **Avance automático** se pasa a la siguiente foto del filtro actual al marcar. Las marcas se guardan en el proyecto y su recuperación local, separadas de la selección de exportación. Descartar no elimina el original. Hacé doble clic en una foto o pulsá **Revelar toma** para editarla.

**Comparar dos tomas** abre la foto activa junto a otra del mismo filtro. El borde verde señala el lado activo; pulsá una miniatura de la tira para reemplazar esa toma. Podés ampliar con la rueda y arrastrar la imagen, vincular el zoom de ambos lados y plegar la tira. **Ajustar** muestra las fotos completas. La comparación usa vistas de los originales de hasta 1800 píxeles por lado largo; no aplica las ediciones ni modifica los archivos.

El botón con ícono de barra lateral en la cabecera fija de Filtros pliega ese panel. La lista se desplaza por separado. La flecha de Archivos pliega la tira inferior. Los dos paneles son independientes, amplían el visor y recuerdan su estado en el equipo. Al revelar un archivo, su miniatura se crea a partir de la vista previa; no se abren originales en segundo plano para poblar la tira.

El inspector separa Revelar, Efectos y Máscaras. Revelar agrupa los controles en Luz, Color, Curva y Textura y grano. Las recetas, los ajustes por archivo y los proyectos siguen usando el mismo motor y formato.

El histograma pequeño del visor se abre con **Scopes**. Incluye:

- **Histograma RGB:** cuenta los píxeles por valor de canal entre 0 y 255.
- **Forma de onda RGB:** muestra el nivel de cada canal de 0 a 100 % según la posición horizontal en la imagen. El brillo de la traza indica densidad.
- **Parade RGB:** separa la forma de onda de rojo, verde y azul para comparar canales.

Los gráficos se calculan a partir de los píxeles de la vista visible, incluida la comparación con el original y la reproducción de una copia de video. Analizan la preview SDR, hasta 1500 píxeles por lado largo, en valores de 8 bits. No son una medición del RAW lineal ni de la señal HDR. La lectura se limita a unas nueve actualizaciones por segundo; no se guarda en los proyectos ni se exporta.

Las tarjetas de Filtros muestran miniaturas de la foto activa, o del fotograma seleccionado, reveladas con cada receta por el mismo motor del editor. Se generan al entrar en la zona visible, sin modificar la edición ni aplicar sus máscaras o efectos locales. Sin un archivo activo, la tarjeta muestra un marcador neutro.

En **Archivos → Copiar ajustes**, elegí qué grupos llevar de la toma activa. Abrí otra toma y pulsá **Pegar ajustes** para aplicarlos. **Sincronizar…** permite elegir varios destinos y aplicarles los grupos desde la toma activa, con una selección separada de la de exportación. Se pueden transferir Luz, Color, Curva, Textura y detalle y Grano; las máscaras y los efectos del Laboratorio quedan en cada archivo.

Un solo **Deshacer** (Ctrl+Z) revierte el lote desde el origen o un destino. Si un archivo del lote tiene cambios posteriores, el editor indica qué archivo hay que deshacer primero. Los ajustes aplicados se guardan con el proyecto y el historial de deshacer se conserva durante la sesión.

En la cabecera, la flecha de **Exportar** ofrece **Selección manual** y **Fotos elegidas**, con sus cantidades. **Fotos elegidas** abre la exportación con todas las fotos elegidas del proyecto, sin importar el filtro actual. El diálogo permite revisar los nombres antes de elegir la carpeta y avisa si falta algún original elegido. El botón principal **Exportar** sigue usando la selección manual, que puede incluir videos. Abrir, cancelar o confirmar un lote no modifica las dos selecciones.

En **Revelar → Versiones**, **Guardar versión** conserva todos los ajustes del archivo activo, incluidas sus máscaras y efectos de Laboratorio, con un nombre de hasta 80 caracteres. Los nombres son únicos dentro de cada archivo. Las versiones se guardan con el proyecto y la recuperación local; no duplican los originales. **Restaurar** aplica una versión y se puede deshacer o rehacer en un solo paso. Cambiar de foto muestra sus propias versiones. El historial de deshacer sigue siendo temporal; las versiones nombradas se conservan al reabrir.

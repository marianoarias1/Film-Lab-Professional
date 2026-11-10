# Editor oscuro y scopes de color

El botón con ícono de barra lateral en la cabecera fija de Filtros pliega ese panel. La lista se desplaza por separado. La flecha de Archivos pliega la tira inferior. Los dos paneles son independientes, amplían el visor y recuerdan su estado en el equipo. Al revelar un archivo, su miniatura se crea a partir de la vista previa; no se abren originales en segundo plano para poblar la tira.

El inspector separa Revelar, Efectos y Máscaras. Revelar agrupa los controles en Luz, Color, Curva y Textura y grano. Las recetas, los ajustes por archivo y los proyectos siguen usando el mismo motor y formato.

El histograma pequeño del visor se abre con **Scopes**. Incluye:

- **Histograma RGB:** cuenta los píxeles por valor de canal entre 0 y 255.
- **Forma de onda RGB:** muestra el nivel de cada canal de 0 a 100 % según la posición horizontal en la imagen. El brillo de la traza indica densidad.
- **Parade RGB:** separa la forma de onda de rojo, verde y azul para comparar canales.

Los gráficos se calculan a partir de los píxeles de la vista visible, incluida la comparación con el original y la reproducción de una copia de video. Analizan la preview SDR, hasta 1500 píxeles por lado largo, en valores de 8 bits. No son una medición del RAW lineal ni de la señal HDR. La lectura se limita a unas nueve actualizaciones por segundo; no se guarda en los proyectos ni se exporta.

Las tarjetas de Filtros muestran miniaturas de la foto activa, o del fotograma seleccionado, reveladas con cada receta por el mismo motor del editor. Se generan al entrar en la zona visible, sin modificar la edición ni aplicar sus máscaras o efectos locales. Sin un archivo activo, la tarjeta muestra un marcador neutro.

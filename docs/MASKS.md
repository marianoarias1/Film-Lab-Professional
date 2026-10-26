# Laboratorio Professional · Máscaras

## Dibujar y transformar

Pulsá Nueva máscara y elegí Radial, Degradado lineal o Pincel. La herramienta queda activa: la zona se crea al hacer clic y arrastrar sobre la fotografía. Cancelar o Escape abandona la herramienta; Escape durante un gesto revierte ese gesto. Un clic sin arrastrar no crea un degradado.

- **Radial:** arrastrá para dibujar el óvalo. Los cuatro puntos exteriores cambian sus radios; el centro mueve la zona. Arrastrar el contorno fuera de los puntos gira el óvalo; el cursor indica la rotación. Desvanecer controla la transición.
- **Degradado lineal:** reemplaza las opciones vertical y horizontal. Arrastrá de la zona con efecto completo hacia la zona sin efecto. El punto central mueve todo sin cambiar inclinación ni transición. Arrastrar la línea central fuera del punto rota el degradado; cualquiera de las dos líneas exteriores comprime o extiende la transición, conservando el centro. Los extremos serializados se mantienen dentro de la imagen; cerca de sus bordes la amplitud puede reducirse al rotar. Los proyectos anteriores conservan sus degradados.
- **Pincel:** el cursor muestra un círculo exterior (tamaño) y otro interior (zona sin desvanecer). Pintar y borrar, tamaño, desvanecer, flujo y densidad se aplican a las pinceladas nuevas. Borrar quita cobertura de esa máscara, sin modificar el original. Una máscara nueva empieza en modo Pintar.
- **Rango de luminosidad:** Sombras, Tonos medios y Luces conservan límites y transiciones editables. La escala del motor es perceptual/logarítmica. No se simula una superposición para este rango a partir del JPEG ya revelado.

La superposición verde indica la cobertura de la máscara seleccionada y respeta inversión, desvanecido y borrado. Es una guía geométrica a resolución reducida (máximo 384 px de lado), no se exporta. En el pincel aproxima la rasterización del motor a esa escala: el borde final de una exportación puede diferir unos píxeles. El interruptor Mostrar zona y guías oculta la superposición y los puntos sin desactivar el efecto; volvé a activarlo para transformar la zona. El cursor del pincel permanece visible al pintar.

## Ajustes locales

Intensidad de la máscara y grupos desplegables:

- Luz: exposición, contraste, altas luces, sombras, blancos y negros.
- Color: temperatura, matiz, tono y saturación.
- Textura y efectos: textura, claridad y neblina.
- Detalle: nitidez, reducción de ruido, moiré y halos de color.

Todos usan controles locales ya soportados por el motor. Renombrar, duplicar, ocultar, invertir y eliminar mantienen su comportamiento. Cada archivo conserva sus máscaras y su historial; un gesto equivale a un paso de deshacer. Se guardan en .flpro y en recuperación. La recuperación automática usa el último gesto terminado. Máximo 32 máscaras por archivo, 128 trazos y 10.000 puntos por máscara de pincel.

Editar efectos globales permite volver a película, fuga y color global. Cambiar de receta conserva las máscaras locales. Restablecer todos los ajustes las elimina; Deshacer permite recuperarlas. El procesamiento se indica con un pequeño spinner en el pie del editor, fuera de la fotografía.

## Fotos y video

LightCraft aplica las mismas máscaras a preview y exportación. En video su geometría es fija: no hay seguimiento, animación ni selección automática de sujeto/cielo. Un rango de luminosidad se evalúa por fotograma y puede variar con la escena. Las guías nunca se exportan. No se modifica Film Lab web.

## Referencias

API de máscaras del LightCraft incluido (d999e382), con sus licencias y atribuciones. Las capturas aportadas sirven como referencia de interacción; no se copian recursos de Adobe.

## Professional 0.6 · Combinar zonas, archivos y zoom

Nueva máscara abre una paleta. Elegir Pincel, Radial o Lineal activa el dibujo; elegir un rango de luminosidad crea la selección. Las acciones de cada grupo abren esa misma paleta para añadir, restar o intersectar una zona.

Dentro de una máscara, Añadir zona, Restar zona e Intersectar zona permiten elegir después la herramienta. Cada zona aparece en una lista: podés seleccionarla para transformar su geometría, cambiar su operación o eliminarla. La primera zona establece la base; las siguientes se evalúan en orden. Añadir une por máximo, Restar multiplica por el complemento e Intersectar multiplica coberturas. Todas comparten los ajustes de la máscara. Máximo 16 zonas por máscara; deshacer/rehacer conserva la composición completa. La superposición verde muestra el resultado combinado cuando todas las zonas son geométricas o de pincel. Si hay un rango de luminancia, se oculta la superposición y se explica esa limitación; el rango sí se aplica en el revelado/exportación.

Cada tarjeta de archivo tiene una × para quitarlo del proyecto, con confirmación. El original nunca se borra. Se libera el archivo activo del motor y se conserva el resto del proyecto; al quitar el último vuelve el editor vacío. Quitar un archivo no tiene deshacer, por eso se confirma.

Ctrl + rueda arriba acerca y Ctrl + rueda abajo aleja, entre encuadre completo y 8×. El acercamiento toma como referencia el cursor. El botón de porcentaje vuelve al encuadre completo. El zoom es de visualización: no cambia el archivo exportado. Las guías, el pincel y sus gestos conservan la alineación a cualquier zoom; cambiar de archivo vuelve al encuadre completo.

**Actualización:** esta versión requiere ejecutar `npm run build:engine` una vez. Los proyectos anteriores se abren y al guardarlos usan el identificador 0.6, para evitar que una versión anterior ignore o rechace las zonas combinadas. Guardá una copia si necesitás conservar compatibilidad con versiones anteriores.

## Organización visual y espacio de trabajo

Nueva máscara abre una paleta de herramientas para crear otro grupo independiente. Cada grupo muestra su nombre, miniatura de cobertura, visibilidad y menú de duplicar/eliminar. Sus zonas aparecen anidadas, con su operación y un menú propio. Añadir, Restar e Intersectar están dentro de la tarjeta del grupo y abren allí la paleta: no usan un selector lejano. Se puede contraer cada grupo. Los ajustes inferiores pertenecen al grupo seleccionado; el control de desvanecido/pincel corresponde a la zona seleccionada.

Al pasar el cursor o enfocar el nombre del grupo se muestra su cobertura combinada; sobre una zona, solo la cobertura de esa zona. Al salir se restaura la máscara seleccionada. Es una inspección temporal: no altera ajustes, selección, historial ni exportación. Los rangos de luminosidad mantienen la limitación de superposición documentada arriba.

Filtros se abre desde la solapa izquierda; Archivos desde la solapa inferior. Se pueden abrir ambos de forma independiente, y el estado se recuerda en este equipo. Cerrados por defecto, liberan espacio para la fotografía. La franja de archivos usa tarjetas más compactas y el área de preview reduce márgenes, manteniendo la foto completa. Ningún cambio de panel modifica el revelado o el encuadre exportado.

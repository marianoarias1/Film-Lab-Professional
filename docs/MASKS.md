# Laboratorio Professional · Máscaras

## Dibujar y transformar

Elegí Radial, Degradado lineal o Pincel y pulsá Crear máscara. La herramienta queda activa: la zona se crea al hacer clic y arrastrar sobre la fotografía. Cancelar o Escape abandona la herramienta; Escape durante un gesto revierte ese gesto. Un clic sin arrastrar no crea un degradado.

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

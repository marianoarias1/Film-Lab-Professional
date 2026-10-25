# Laboratorio Professional · Máscaras 0.5

## Tipos y uso
- Radial: óvalo con centro móvil, dos radios, giro y suavizado. Arrastrá el centro o los dos puntos de tamaño sobre la foto.
- Degradado vertical/horizontal: el efecto va de Inicio (completo) a Fin (sin efecto). Mové los puntos para inclinarlo.
- Pincel: pintá sobre la foto; Modo borrar quita pinceladas de esa máscara. El tamaño y suavizado se aplican a los trazos nuevos.
- Rango de luminosidad: presets Sombras, Tonos medios y Luces. 0 = negros, 1 = blancos; los límites y las transiciones son editables.

## Ajustes locales
Intensidad global de la máscara, exposición, contraste, altas luces, sombras, blancos, negros, temperatura, matiz, saturación, textura, claridad y neblina. Renombrar, duplicar, ocultar, invertir y eliminar. Mostrar contorno y guías no modifica el archivo exportado. Las guías de pincel indican trazos, no son una vista exacta del alfa resultante después de borrar.

Cada archivo mantiene sus máscaras y su historial. Un gesto equivale a un paso de deshacer. Se guardan en .flpro y en recuperación. Máximo 32 máscaras por archivo, 128 trazos y 10.000 puntos por máscara de pincel.

Editar efectos globales permite volver a película, fuga y color global sin mover una máscara. La receta y los ajustes globales forman la base de las correcciones locales. Cambiar de receta conserva las máscaras locales. Restablecer todos los ajustes sí las elimina; Deshacer permite recuperarlas.

## Fotos y video
El motor LightCraft aplica las mismas máscaras a preview y exportación. En video las máscaras tienen una posición fija en todos los fotogramas: no hay seguimiento, animación ni selección automática de sujeto/cielo. No se descargan modelos de IA. Un rango de luminosidad se evalúa en cada fotograma, por eso su zona puede variar con la escena.

## Compatibilidad
Professional 0.5 abre proyectos de 0.1–0.4. Guardá una copia: las versiones anteriores no deben abrir los proyectos nuevos porque ignorarían las máscaras. La versión web normal no se modifica. Las coordenadas son relativas al archivo y escalan con la exportación; las guías no se exportan.

## Referencias
Implementación mediante la API de máscaras del LightCraft incluido (d999e382). No se copian recursos ni algoritmos de Adobe. Se mantienen las licencias y atribuciones del proyecto.

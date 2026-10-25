> Nota de versión: esta investigación corresponde a 0.4. La integración Picker está disponible desde 0.4.1; 0.5 conserva el nuevo Client ID y la importación local del JSON de escritorio.

# Google Fotos en Film Lab Professional

Investigación verificada el 24 de octubre de 2026. Alcance: viabilidad y propuesta; esta entrega no incorpora una conexión OAuth ni accede a una cuenta Google.

**Es viable importar fotos y videos elegidos por el usuario mediante Google Photos Picker API.** Podemos mantener Professional local y permitir editar sin iniciar sesión; conectar Google Fotos sería una acción opcional de importación.

## Qué hace Lightroom

Adobe documenta en Lightroom web: Agregar fotos → Conectar a Google Fotos → iniciar sesión en Google → abrir el selector de Google Fotos → elegir archivos → completar la importación. Por lo tanto, la experiencia que buscás tiene un equivalente oficial que podemos implementar. Esta referencia corresponde a Lightroom web; no presupone que todas sus variantes usen el mismo flujo.

Fuente: [Adobe: importar imágenes de Google Fotos](https://helpx.adobe.com/lightroom/web/share-your-work/share-and-invite/import-images-from-google-photos.html).

## Login y acceso a fotos son permisos distintos

Identificarse con Google no equivale a autorizar acceso a Google Fotos. Para Picker se solicita el scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`. Google exige OAuth y revisión de verificación para el acceso público a Photos; el consentimiento debe explicar para qué se usan los archivos. No se utilizan cuentas de servicio. La configuración requiere un proyecto Google Cloud, habilitar la API y preparar el cliente y la pantalla de consentimiento.

Fuentes: [autorización y scopes](https://developers.google.com/photos/overview/authorization), [configurar la app](https://developers.google.com/photos/overview/configure-your-app).

Desde los cambios de marzo de 2025, Library API se enfoca en contenido creado por la propia aplicación. Para elegir contenido preexistente de la biblioteca se usa Picker. No diseñaría una galería que enumere automáticamente todas las fotos de la cuenta en segundo plano.

Fuente: [cambios de las APIs](https://developers.google.com/photos/support/updates).

## Flujo propuesto

1. El usuario pulsa «Importar desde Google Fotos» y autoriza la conexión en su navegador.
2. Professional crea una sesión Picker y abre el enlace `pickerUri` de Google.
3. El usuario selecciona las fotos y videos que quiere compartir.
4. La app consulta la sesión respetando los intervalos y tiempos de espera devueltos por Google.
5. Al completarse, lista los seleccionados y descarga sus bytes a una carpeta local elegida por el usuario.
6. Los archivos pasan al mismo editor local y quedan referenciados por su ruta en el proyecto `.flpro`.

Google describe este flujo de sesión, selección, consulta y recuperación. La decisión de guardar copias locales permanentes es nuestra propuesta para conservar los proyectos.

Fuente: [flujo de Picker](https://developers.google.com/photos/picker/guides/get-started-picker).

## Implementación de escritorio

OAuth para apps instaladas debe abrir el navegador del sistema, usar PKCE y validar `state`. El retorno puede recibirse en una dirección loopback `127.0.0.1` con puerto temporal. Google considera públicas a las apps de escritorio: un secreto incluido en el ejecutable no debe tratarse como confidencial.

En nuestra arquitectura, la autorización y descargas se manejarían en el proceso principal de Electron. Los tokens no entrarían al renderer, proyectos ni diagnósticos. Para la primera prueba propongo conservarlos solo en memoria; recordar una conexión requeriría almacenamiento protegido y una acción de desconexión. No hace falta un servidor para almacenar las fotos ni adoptar nube para editar: es una propuesta de conexión directa y descarga local, que debemos validar con credenciales reales.

Fuente técnica de OAuth: [OAuth 2.0 para escritorio](https://developers.google.com/identity/protocols/oauth2/native-app). Las decisiones sobre procesos y almacenamiento son propuestas propias.

## Calidad y formatos: límites importantes

Las URLs de descarga son temporales (normalmente 60 minutos) y requieren autorización; no sirven como originales permanentes dentro de un proyecto. Para imágenes, `=d` solicita la descarga conservando EXIF excepto ubicación. Para video, `=dv` devuelve una versión de alta calidad **transcodificada**; no debemos presentarla como el video original idéntico byte a byte.

La documentación no basta para prometer que cada RAW de cámara se descargue intacto. Antes de ofrecer esa garantía hay que probar ARW/DNG reales, formato, profundidad, dimensiones y metadatos. Para trabajos que requieran el original de cámara, conservaría la importación local como vía explícita. «Raw bytes» en una API no significa necesariamente un archivo RAW de sensor.

Fuente: [listar y descargar medios](https://developers.google.com/photos/picker/guides/media-items).

## Cuotas y validación pendiente

La página actual distingue cuotas de Picker y Library: Picker informa 100.000 peticiones/minuto/proyecto y 1.000.000 accesos a bytes/minuto/proyecto. Son cuotas publicadas, no una garantía de servicio ni acceso ilimitado. Debemos revisar las asignadas al proyecto, manejar errores 429 y limitar descargas concurrentes.

Fuente: [cuotas](https://developers.google.com/photos/overview/api-limits-quotas).

Para una prueba real faltan: proyecto Google Cloud, cliente OAuth de escritorio y configuración de consentimiento; después, validar cancelación, permisos revocados, sesión vencida, descarga parcial, duplicados, disco lleno, fotos grandes y video con audio. Para publicar, completar la revisión de Google que corresponda.

**Recomendación:** empezar por importar una selección de fotos a disco con Picker; mantener edición local y conexión opcional. El login de una cuenta Film Lab, la sincronización completa y exportar nuevamente a Google Fotos son alcances distintos.

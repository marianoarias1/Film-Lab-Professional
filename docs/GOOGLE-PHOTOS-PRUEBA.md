# Google Fotos · Film Lab Professional 0.4.1 (prueba)

1. Extraé todo el ZIP en una carpeta nueva. No ejecutes desde dentro del ZIP.
2. Abrí Film Lab Professional.exe.
3. Pulsá Google Fotos → Conectar y elegir archivos.
4. Elegí una carpeta permanente para guardar las copias.
5. Iniciá sesión en el navegador con la cuenta agregada como usuario de prueba.
6. Elegí fotos o videos en Google Fotos, pulsá Listo y volvé a Film Lab.
7. Esperá la descarga y editá normalmente. Guardá el proyecto para reabrirlo.

## Si Google exige credenciales adicionales
Si aparece invalid_client, descargá el JSON de tu cliente OAuth de tipo Aplicación de escritorio en Google Cloud. En Film Lab → Google Fotos → Configurar Google (JSON local), elegí ese archivo y repetí la conexión. No lo compartas en el chat. Se usa solo en memoria hasta cerrar la aplicación. El Client ID debe coincidir con el ya configurado.

Si aparece access_denied, revisá que tu correo esté en Usuarios de prueba. Si aparece redirect_uri_mismatch, revisá que el cliente sea de escritorio y no de aplicación web. La API habilitada debe ser Google Photos Picker API.

## Alcance
Solo se accede a los elementos que elegís en el selector de Google; no se sincroniza toda la biblioteca. Los tokens no se guardan en disco ni se envían a la interfaz. Se vuelve a autorizar al importar. Los archivos completos descargados permanecen en la carpeta elegida incluso al cancelar el resto del lote. No borres ni muevas esos archivos sin volver a vincular el proyecto.

Google entrega videos transcodificados y puede convertir fotos; no se garantiza igualdad byte por byte con el original ni conservación de RAW. El formato se identifica a partir de la respuesta de descarga; para originales RAW usá la importación local.

## Validación de esta entrega
21 pruebas Node aprobadas (17 existentes y 4 nuevas), revisión de sintaxis y flujo simulado de OAuth PKCE + state, callback loopback, paginación, descarga, cancelación y limpieza de sesión. No se accedió a una cuenta real, ni se ejecutó Windows en este entorno. La validación real con tu cuenta está pendiente. El motor nativo y runtime Windows son los mismos de 0.4; se actualizó únicamente la capa de aplicación. Sin cambios de recetas ni de procesamiento.

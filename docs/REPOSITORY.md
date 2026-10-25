# Desarrollo desde GitHub

Repositorio: https://github.com/marianoarias1/Film-Lab-Professional

Clonar con `git clone --recurse-submodules https://github.com/marianoarias1/Film-Lab-Professional.git`.
En Windows: instalar Node.js 22+, Rust estable y Visual Studio Build Tools C++. Ejecutar `npm ci`, `npm run setup`, `npm run build:engine` y `npm start`.

LightCraft y FilmCraft son submódulos fijados a revisiones concretas. `npm run setup` aplica de forma idempotente la extensión de exportación de LightCraft incluida en third-party/patches. Es normal que ese submódulo aparezca modificado por el parche. No actualizar sus revisiones sin revisar la compatibilidad del motor.

El workflow Build Windows ejecuta comprobaciones y genera un portable de Windows. En GitHub → Actions → ejecución aprobada → Artifacts se descarga FilmLab-Professional-Windows-x64. El artefacto se conserva siete días y puede regenerarse manualmente con Run workflow. No publica releases ni requiere secretos OAuth.

El JSON OAuth se importa solo desde la PC del usuario. Nunca agregarlo al repositorio. Los binarios compilados, las fotos personales, los proyectos y las credenciales quedan fuera del código versionado.

Los cambios futuros se preparan en ramas y PR; esta importación inicial establece la base de main.

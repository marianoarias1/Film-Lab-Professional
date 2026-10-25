# Upstream fijado

- LightCraft: https://github.com/storytold/lightcraft/commit/d999e382bafbb5d5c54482fdb1d11f6a63bfdf69
- FilmCraft: https://github.com/storytold/filmcraft/commit/6c3948a36c80e4996d924766ba7157eec4fca85e

Ambos declaran MIT OR Apache-2.0. El código upstream conserva las revisiones indicadas con una extensión local en LightCraft (ver abajo); el puente, la UI y los efectos propios de Film Lab están fuera de `vendor`. No se incluyen sus logotipos ni fotos promocionales. Las licencias y avisos aplicables se conservan. Los nombres de Adobe solo identifican productos de referencia; este proyecto no contiene ni afirma usar el motor propietario de Adobe.

La integración usa directamente `lightcraft-{raw,color,raster,codecs,develop,pipeline}` y `filmcraft-{media,codecs,frame,color,project,render,export,time}` y sus dependencias. No incluye la UI egui de esos programas.

`Cargo.lock` fija dependencias transitivas. `third-party/RUST-DEPENDENCIES.json` registra sus versiones, licencias declaradas y URL de código fuente; los avisos de licencia acompañan la distribución. Symphonia se utiliza sin modificar y mantiene MPL-2.0 en sus archivos.

DM Sans y Manrope: fuentes de Google Fonts distribuidas por Fontsource Variable (SIL OFL, textos incluidos). Electron y Chromium incluyen sus propios archivos de licencia en el paquete Windows.

Antes de una distribución comercial amplia hay que revisar las obligaciones de distribución y las condiciones de codecs para los formatos y países elegidos. La licencia permisiva del código no resuelve por sí sola posibles derechos de patentes de codecs.

## Modificación local en 0.4

El 24-10-2026 se agregó `render_deep_cached` y una bandera privada para omitir la imagen de display cuando solo se solicita salida de alta precisión. El cálculo y sus muestras se mantienen; la API existente sigue generando preview e histograma. Parche contra la revisión fijada: `third-party/patches/lightcraft-deep-export.patch`. No se modificó FilmCraft. Se conservan licencias y avisos upstream.

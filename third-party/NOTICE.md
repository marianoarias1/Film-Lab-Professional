# Avisos

Film Lab Professional integra componentes de ArtCraft/Storytold: LightCraft y FilmCraft, copyright 2026 ArtCraft Team y sus contribuidores. Revisiones exactas y licencias en docs/UPSTREAM.md y archivos adyacentes. Ningún logotipo de ArtCraft o Adobe forma parte de nuestra UI.

Las bibliotecas Rust externas conservan sus avisos en rust-licenses y sus referencias de fuente en RUST-DEPENDENCIES.json. Las fuentes DM Sans y Manrope conservan sus avisos SIL OFL. El runtime Windows incluye LICENSE.electron.txt y LICENSES.chromium.html.

El puente y la interfaz propios de Film Lab no heredan automáticamente una licencia de publicación; el titular de Film Lab debe decidir cómo distribuirlos. Este paquete se entrega como prototipo para su evaluación.

Film Lab Professional 0.4 modifica localmente LightCraft `crates/pipeline/src/lib.rs` para exportar alta precisión sin preview/histograma intermedios. Modificación identificada y parche en `patches/lightcraft-deep-export.patch`. El catálogo deriva del repositorio Film Lab del usuario, conservando créditos y referencias.

Film Lab Professional 0.9 extiende además el radio de nitidez en LightCraft crates/pipeline/src/{lib,local,finish}.rs. La modificación está identificada en patches/lightcraft-detail-radius.patch, conservando sus licencias MIT OR Apache-2.0.

Film Lab Professional 0.12 extiende LightCraft con una versión de proceso en Detail, invalidación de caché por proceso y reducción de ruido V2 (luminancia en dos escalas y crominancia con pesos conjuntos). Modificaciones en crates/develop/src/settings.rs y crates/pipeline/src/{lib,local}.rs, identificadas en patches/lightcraft-process-v2.patch. Se conservan las licencias MIT OR Apache-2.0; V1 permanece disponible.

Film Lab Professional 0.13 agrega ajustes tonales suaves y proyección de gamut sRGB en OkLab en LightCraft crates/pipeline/src/finish.rs, identificados en patches/lightcraft-photo-tones.patch. Se conservan las licencias MIT OR Apache-2.0. Todas las fotografías se migran al proceso V2; el video mantiene su ruta anterior.

Film Lab Professional 0.14 refina el detalle fotográfico V2 mediante una banda de enfoque protegida y filtrado cromático en dos vecindades. Extensión original identificada en patches/lightcraft-photo-detail.patch sobre crates/pipeline/src/{lib,local,finish,photo_detail}.rs; se conservan las licencias MIT OR Apache-2.0. No se incorpora código GPL de los programas estudiados.

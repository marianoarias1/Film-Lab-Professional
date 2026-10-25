# Validación · 0.2

19 de octubre de 2026. Compilación release Linux x64 y Windows x64 GNU con Rust 1.99.1; Electron 44.9.0. Se ejecutó el motor y la interfaz en Linux. **El paquete Windows se compiló y verificó estructuralmente, pero no se ejecutó en Windows. Este entorno no tiene NVIDIA: no se midió ni validó aquí una sesión NVENC real.**

## Resultados

- Nueve pruebas Node: modelo, selección, historial, proyecto atómico, progreso con ETA desconocida y límite de 99 %, cancelación dirigida al request de exportación y redacción de rutas en diagnósticos.
- Cuatro pruebas Rust: precisión float, validación de ajustes, conservación de la política de compresión y condiciones de reintento de hardware (solo una vez; nunca al cancelar).
- Integración nativa: JPEG, DNG Bayer sintético, TIFF de 16 bits y MP4 con audio; previews ajustadas/neutras y exports reales. PNG16 e ICC, JPEG95/4:4:4 y MP4 con audio siguen funcionando.
- Integración nueva: modo CPU, automático sin driver NVIDIA que pasa a CPU, diagnóstico de etapas y cancelación de un export encolado detrás de una preview. El motor sigue respondiendo después de cancelar; no se crea el archivo cancelado.
- Interfaz Electron real: importar dos archivos, exportar solo el video seleccionado, generar JSON al lado del MP4 y guardar nuevamente el último informe desde Proyecto. Cero errores del renderer. Solo los diálogos de archivos se sustituyeron por rutas de test; el IPC y motor fueron reales.
- Windows: se incluyeron el motor PE x64 y los recursos Electron. Sus imports estáticos del motor corresponden a DLL del sistema Windows; NVENC se carga dinámicamente desde el driver. No se incluyeron DLL NVIDIA, CUDA Toolkit, fotos o videos personales.

## Video de referencia

El archivo proporcionado por el usuario es H.264 vertical 1080×1920, 30 fps, 365 fotogramas (12,167 s) y AAC estéreo 48 kHz. Se exportó completo con ajustes neutros, VBR 20 Mbps, efectos en CPU y hasta 8 hilos. Las mediciones corresponden al equipo de pruebas Linux, **no al i5-10400F / RTX 4060 del usuario**.

| Variante | Tiempo total medido | Codificador real |
|---|---:|---|
| 0.1 de referencia | 46.04 s | CPU |
| 0.2 CPU explícita | 48.64 s | CPU |
| 0.2 automática sin driver NVIDIA | 48.24 s | CPU |

Las tres salidas tienen exactamente el mismo SHA-256 y 30.834.162 bytes. ffprobe confirma H.264, 1080×1920, 30 fps, 365 fotogramas, AAC estéreo y comienzo de ambas pistas en 0. No son promedios estadísticos ni una demostración de mayor velocidad: son mediciones individuales con variación del entorno. **No se afirma una mejora de CPU ni una cifra de aceleración NVENC.** La finalidad de 0.2 es habilitar la aceleración de codificación y medir dónde se consume el tiempo; los ajustes siguen en CPU.

El diagnóstico registra tiempos acumulados de tareas paralelas y del codificador. Pueden superponerse (Convert está incluido en Encode); no se suman como tiempo total. La ETA es orientativa, por archivo.

## Validación pendiente en el equipo del usuario

Exportar el mismo video en Automática y luego en CPU, con iguales ajustes, y comparar `actualEncoder`, `hardwareFrames`, `wallMs` y `frameProcessing` de ambos JSON. Confirmar visualmente el resultado y el audio. Una sesión NVENC exitosa y el reintento tras un fallo real del driver requieren una NVIDIA: aquí solo se probaron la alternativa por falta de driver y las condiciones de reintento. Aún falta probar RAW Sony ARW real, más perfiles de color, archivos largos y VFR.

La validación previa de 0.1 se conserva en VALIDATION-0.1.md. No se modificó Film Lab Standard.

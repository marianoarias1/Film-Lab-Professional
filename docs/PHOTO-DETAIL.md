# Detalle fotográfico · Professional 0.14

Este bloque refina nitidez y ruido de color del proceso fotográfico V2 de 0.13. Conserva la transformación de luces/sombras y el gamut de la PR #10. No añade un selector de motor ni reconocimiento de piel, perfiles de ruido por cámara/ISO o IA. El video mantiene el proceso anterior.

## Controles actuales

- **Cantidad de nitidez:** realza el detalle con soporte de borde y un límite local. Puede verse más conservador al repetir los valores de 0.13, especialmente sobre ruido fino y bordes ya muy duros.
- **Radio:** se interpreta en píxeles originales. El valor 0 sigue siendo automático; en fotografías resuelve a 0.9 px originales, en lugar de usar la banda de textura proporcional al tamaño de toda la foto. Los valores positivos siguen usando el radio elegido. En previews reducidas el efecto se atenúa según su escala.
- **Máscara de nitidez:** usa un soporte de borde suavizado para evitar interpretar toda oscilación fina como una estructura que deba enfocarse.
- **Ruido de color:** dos vecindades conjuntas, una próxima y otra más amplia, con posiciones fraccionarias para eliminar saltos de espaciado al mover el control. Las intensidades parciales se combinan para respetar la mezcla solicitada. Se conserva la luminancia de entrada y las componentes negativas de gamut amplio.
- **Ruido de luminancia / Conservar detalle:** mantienen la reducción V2 de dos escalas integrada anteriormente. Esta entrega no la reemplaza por un algoritmo nuevo.

La protección de nitidez limita su propia contribución EV dentro del mínimo/máximo de una vecindad 3×3. No limita exposición, claridad u otros ajustes creativos ni demuestra que ninguna combinación posible de todos los controles pueda generar un halo. Las contribuciones positivas de máscaras usan la misma protección; los valores negativos mantienen su comportamiento de suavizado anterior.

## Estado, caché y precisión

Se utiliza la misma implementación en preview refinada, lupa a píxeles nativos y exportación. Draft conserva su carácter aproximado. El plano nuevo se cachea por radio y máscara de nitidez; cambiar solamente la cantidad lo reutiliza. Se invalida al cambiar sus entradas y al reutilizar un borrador con otra reducción de ruido. El contador de memoria incluye los planos de nitidez.

Los originales no cambian. Los parámetros y recetas existentes se conservan, pero imágenes con nitidez o ruido de color activos pueden renderizarse de forma distinta por el refinamiento. Con esos controles desactivados, los radios/máscara no alteran la salida. Los RAW pueden tener reducción de color por defecto y por ello también pueden mostrar diferencias aunque no se haya movido ese slider.

Motor **0.14**, `processVersion: 2` para fotografías y `photoDetailRevision: 1` en diagnósticos de preview/exportación. Video informa revisión de detalle 0 y sigue en proceso 1. La revisión es un dato de diagnóstico, no un ajuste copiable ni un selector de interfaz. Se requiere nuevo ejecutable o `npm run setup` seguido de `npm run build:engine`; los proyectos 0.13 se aceptan.

## Implementación y licencias

Extensión original en `third-party/patches/lightcraft-photo-detail.patch`, sobre LightCraft fijado y sus cuatro parches anteriores. No cambia los gitlinks de dependencias ni incorpora código de GIMP, Darktable, RawTherapee, ART, Adobe o bibliotecas GPL. Conserva las licencias MIT OR Apache-2.0 de las utilidades de la base. El módulo nuevo es `crates/pipeline/src/photo_detail.rs`.

El parche posterior reemplaza líneas de extensiones anteriores; `setup` reconoce la extensión final para que una segunda ejecución no trate esos cambios intencionales como conflictos. Se comprobó reconstrucción limpia y actualización desde los cuatro parches anteriores, con igualdad byte por byte de los archivos finales. Windows CI ejecuta setup dos veces.

## Evidencia local

- 62 pruebas JavaScript.
- 57 pruebas nativas correctas; el microbenchmark marcado como manual se ejecutó por separado.
- 191 pruebas de la biblioteca pipeline correctas; sus dos pruebas ignoradas preexistentes no se cuentan como ejecutadas.
- Casos sintéticos: campos constantes y vacíos, bordes duros/suaves, ruido fino, fronteras cromáticas, gamut con componentes negativas, imágenes de un píxel de ancho, caché, radios y máscaras, contribuciones neutras y ruta de video.
- Igualdad de float32 entre preview completa y exportación, y comparación de ventana nativa contra imagen completa lejos de su borde (tolerancia máxima de un código de 8 bits).
- Integraciones reales del protocolo: `test:engine`, `test:detail`, `test:process` y `test:glow`: JPEG, TIFF16, RAW sintético y video; Full/Draft/lupa/exportación; PNG16 con ICC y reapertura.

### Mediciones sintéticas, no promesas sobre todas las fotos

En el patrón uniforme con ruido de color de `photo_detail_tests`, el MSE respecto del gris limpio pasó de **0.0001712** con el filtro V2 anterior a **0.0001347** con el nuevo, aproximadamente 21 % menos error. Es una muestra procedimental con referencia conocida, no una medición de retratos del usuario.

En el patrón de ruido fino, con una misma contribución de enfoque, la varianza pasó de **0.02307** para la banda anterior a **0.00953** con la protección; la entrada tenía **0.00751**. Esto mide menor amplificación del ruido y no prueba recuperación de textura real.

Costo aislado del filtro cromático en esta máquina Linux, imagen sintética de 1.6 MP, mediana de cinco ejecuciones: **33.86 ms anterior → 100.62 ms nuevo**. Hay un costo de calidad explícito. No significa que toda la aplicación sea tres veces más lenta: ese resultado se cachea y los controles de tono/exposición pueden reutilizarlo. No se midió todavía en el i5/RTX del usuario ni se afirma una aceleración.

## Prueba recomendada en Windows

1. Conservar los originales y las exportaciones 0.13 junto con sus diagnósticos.
2. Con el ejecutable 0.14, abrir los mismos originales y repetir ajustes, dimensiones y formato. No editar la exportación anterior como si fuera el original.
3. Comparar en Detalle al 100 %: borde entre pelo/fondo, piel en sombra, ropa/follaje y zonas uniformes con ruido de color. Probar primero sin grano creativo para distinguir ruido de grano.
4. Revisar halos en reflejos y bordes contrastados. Si se usaba Radio 0, tener presente el nuevo radio automático; para una comparación adicional repetir un radio explícito, por ejemplo 1.2 px.
5. Exportar, reabrir y guardar el JSON. Registrar tanto ventajas como pérdida de textura o demoras. Los números sintéticos no sustituyen esta revisión visual.

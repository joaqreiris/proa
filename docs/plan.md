# Proa — plan de arranque

Documento completo, con el modelo de datos, la identidad visual y los seis tramos:
**https://claude.ai/code/artifact/e52bf0ea-1386-4566-87e9-c17e39e71ff3**

Acá queda solo el resumen, para que el repo se explique solo si el enlace se pierde.

## Qué es

Proa es para el entrenador que trabaja uno a uno: el preparador físico que atiende a ocho jugadores de distintos clubes, el que prepara a un atleta para una pretemporada, el que arma planes a distancia.

ClavaMetrics organiza un plantel. Proa organiza a una persona. El entrenador no controla la agenda del atleta, la **descubre**: el atleta estudia, trabaja, entrena con su club, viaja. El trabajo del entrenador es meter la carga en los huecos que quedan.

Por eso el corazón de la app no es el planificador sino la **anamnesis**: cuando se cargan los horarios reales del atleta, la semana se dibuja sola con los espacios libres ya marcados.

Y la segunda mitad del producto es la **devolución**: el atleta entra con su propia cuenta, marca lo que hizo, dice cómo se sintió, sube un video y comenta un ejercicio.

## Decisiones tomadas (2 de septiembre de 2026)

| | |
|---|---|
| Separación | Repo, base de datos y dominio propios. Nunca compartir tablas ni archivos con ClavaMetrics: hay clubes pagando en producción. Se copia por valor. |
| Nombre | **Proa**, con firma «by Clava». Se descartaron Athlon, Forja, Kova, Garra, Ludus, Agon, Brio y Faro: todos tienen ya una app de entrenamiento con ese nombre. |
| Cuenta del atleta | Sí, propia. Por eso el lado del atleta entra en el Tramo 1 y no al final. |
| Alcance de la v1 | Incluye comidas y recuperación. |
| Cobro | Por cupos de atletas activos, con Paddle, en el último tramo. |

## Modelo

La unidad de tenencia es el **espacio de trabajo** (`workspace_id`), no el club. Cada tabla lleva dos reglas de acceso: el entrenador ve todo lo de su espacio, el atleta ve únicamente sus propias filas.

Grupos de tablas: la cuenta · el atleta · la semana · la devolución · el seguimiento.

## Identidad

Primera versión (paleta marina, serifa para la prosa) descartada el 3 de septiembre: se leía como informe, no como app de entrenamiento. La dirección actual combina dos ideas:

**El color hace algo.** Cada tipo de trabajo tiene su color saturado y fijo en toda la app: gimnasio `#FF3D00`, campo `#00875A`, su club `#0047FF`, partido `#E5004C`, recuperación `#6B3FF5`, comida `#E09000`, estudio o trabajo `#8A94A6`, viaje `#0093B0`, descanso `#B8B8B1`. Con eso se lee la semana de un atleta sin leer una palabra. **No usar ninguno de esos colores para otra cosa** o el sistema deja de significar algo.

**El lenguaje gráfico es duro.** Plano, sin sombras, radios casi rectos, botones en mayúscula, riel negro, números grandes. Equipamiento deportivo, no panel de administración.

Tipografías: **Archivo** para la interfaz y **Barlow Condensed** para títulos, etiquetas y números — condensada entra mucho más número en el ancho de un teléfono. Sin serifa.

El naranja es marca y acción principal, **nunca** un estado. `--pr-accent` es para rellenos (con texto casi negro encima, que contrasta mejor que el blanco); `--pr-accent-ink`, más oscuro, es el naranja usable como texto sobre fondo claro.

## Lo que falta decidir

- Precios y escalones de cupos.
- Si un atleta puede tener más de un entrenador (pasa seguido: preparador físico y kinesiólogo sobre la misma persona). La tabla ya está preparada para varios.
- Avisos por correo: sin ellos la app se usa dos semanas y se abandona.
- Qué deportes al inicio. Propuesta: fútbol solo, con la estructura lista para sumar.

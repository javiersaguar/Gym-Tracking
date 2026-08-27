# Gym Tracking

App personal de seguimiento de entrenamiento. Trae la rutina ya cargada, cronómetro de descanso,
y un análisis de cada sesión que mide el progreso por grupo muscular. **Funciona entera sin conexión**:
no hay servidor, ni cuenta, ni red que se pueda caer a mitad de una serie.

## Qué hace

- **Portada de entrada.** Al abrir la app no te cae encima un panel de control: una portada dice qué día
  toca, con un solo botón para empezar y las secciones como un índice. Desde dentro, la marca de la
  barra superior devuelve siempre aquí.
- **La rutina ya está dentro.** El ciclo de 10 días completo, con sus ejercicios, series y rangos de
  repeticiones. Se puede editar: añadir y quitar series, quitar ejercicios, meter otros, cambiar el
  descanso objetivo o reordenarlos.
- **Apuntar una serie son dos toques.** Cada serie trae ya puesto el peso de la última vez; se ajusta
  con los pulsadores (mantener pulsado acelera) o se escribe la cifra directamente. Debajo del nombre
  del ejercicio siempre está lo que hiciste la vez anterior.
- **Cronómetro de descanso.** Arranca solo al marcar una serie y cuenta hacia arriba contra el objetivo
  del ejercicio, que se puede ajustar sobre la marcha. Avisa con dos pitidos y vibración al llegar.
  El tiempo se calcula desde el instante de arranque, así que no se pierde un segundo aunque bloquees
  el móvil o Android mate la app.
- **Análisis al cerrar el entreno.** Índice de progreso por grupo muscular, récords batidos, lectura de
  qué ha pasado y qué peso tocar la próxima vez en cada ejercicio.
- **Progreso a lo largo del tiempo.** Qué has trabajado más, series semanales por grupo contra una
  franja de referencia, evolución del 1RM estimado ejercicio a ejercicio y calendario de constancia.

## Cómo se mide el progreso

«Progresar» no es una sola cosa, así que se miden tres, y cada una usa el peso, las repeticiones y
el descanso de forma distinta:

| Métrica | Cómo se calcula | Qué dice |
|---|---|---|
| **Tonelaje** | Σ peso × repeticiones | El trabajo mecánico total |
| **Intensidad** | Mejor 1RM estimado por [Epley](https://en.wikipedia.org/wiki/One-repetition_maximum): `peso × (1 + reps/30)` | La fuerza pura |
| **Densidad** | Tonelaje ÷ tiempo total, contando el descanso real medido | Cuánto trabajo metes por minuto |

Cada serie reparte su estímulo entre los músculos que trabaja, no entero a todos: una prensa cuenta
0,65 de cuádriceps, 0,25 de glúteo y 0,1 de femoral. De ahí salen las **series efectivas** por grupo.

El **índice de progreso** compara los tres números contra la **mediana de tus tres últimas sesiones de
ese grupo** (mediana y no media: una sesión mala no debe hundir el listón de las tres siguientes):

```
índice = 100 × (0,45 · tonelaje/base + 0,35 · intensidad/base + 0,20 · densidad/base)
```

**100 = igual que tu media reciente.** El tonelaje pesa más porque es lo que más se mueve de sesión a
sesión; la densidad pesa poco porque un día con más cola en las máquinas no significa que hayas
entrenado peor. Si falta un componente (un grupo que solo entró como secundario no tiene dato de
fuerza), su peso se reparte entre los demás en vez de contarse como cero.

El índice de la sesión entera es la media de los grupos ponderada por tonelaje, para que un gemelo no
valga lo mismo que una prensa.

## Instalar en el móvil

Ábrela en el navegador y añádela a la pantalla de inicio (**Compartir → Añadir a pantalla de inicio**
en iOS; **menú → Instalar aplicación** en Android). A partir de ahí se abre a pantalla completa y
funciona con o sin cobertura.

## Dónde viven los datos

En el `localStorage` del navegador y en ningún sitio más. No se envían a ninguna parte. Eso significa
que si borras los datos del navegador o cambias de móvil se van con él: en **Ajustes → Tus datos** hay
una copia descargable en JSON y su restauración.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests del algoritmo (métricas, análisis, ciclo)
npm run build      # build de producción + service worker
npm run preview    # sirve el build, con el modo sin conexión activo
npm run icons      # regenera los PNG del icono a partir de public/icon.svg
```

El modo sin conexión solo está activo en el build de producción: en `npm run dev` no se registra el
service worker para que los cambios se vean al instante.

### Estructura

```
src/
  lib/
    types.ts       Modelo de datos
    routine.ts     Catálogo de ejercicios y el ciclo de 10 días sembrado
    metrics.ts     El algoritmo: tonelaje, 1RM, densidad, índice, récords, reparto
    analysis.ts    El análisis en prosa del final del entreno
    storage.ts     Persistencia en localStorage
    timer.ts       Cronómetro de descanso (fuera de React, sobrevive a recargas)
    actions.ts     Ciclo de vida de la sesión y edición de la rutina
  components/      Primitivas de interfaz, campos numéricos, gráficos
  screens/         Portada · Hoy · Entreno · Resumen · Progreso · Historial · Rutina · Ajustes
scripts/
  build-sw.mjs     Genera el service worker con la lista exacta del build
  make-icons.mjs   Rasteriza los iconos PNG desde el SVG
```

### Diseño

Papel blanco, tinta casi negra y un solo azul. El color es un recurso escaso: el negro se gasta en el
texto y en el botón principal, el azul marca lo activo y dibuja los datos, y los cuatro pasteles de
estado (bien, atención, error, información) solo aparecen acompañados de texto, nunca solos.

Titulares en **Instrument Serif** autoalojada (24 KB, precacheada por el service worker, así que sigue
estando sin conexión); el resto en la tipografía del sistema, que en el móvil da San Francisco o Roboto
y no cuesta un byte. Sombras por debajo del 5 % de opacidad: la jerarquía la dan el borde de un píxel,
el contraste de superficie y el espacio. Las listas se separan con líneas, no con una pila de tarjetas
iguales.

Los gráficos usan **un solo tono**: los grupos musculares son categorías nominales, así que darle un
color a cada uno gastaría el canal de identidad en repetir lo que ya dice la longitud de la barra. La
identidad la lleva la etiqueta, escrita siempre al lado. La rampa azul secuencial está validada contra
el papel (lightness monótona, saltos visibles, extremo claro por encima de 2:1 de contraste), y todo el
texto cumple 4,5:1 de contraste mínimo.

Las skills de diseño que guían todo esto están en `.claude/skills/`: `minimalist-skill` y
`redesign-skill` para el sistema visual, `apple-design` y `emil-design-eng` para el movimiento y el
detalle de interacción.

## Despliegue

`.github/workflows/deploy.yml` prueba y compila cada rama, y publica en GitHub Pages la **rama por
defecto del repositorio** (la compara con `default_branch`, no con un nombre escrito a mano, para que
el despliegue no deje de dispararse por llamarse la rama de otra forma).

El propio workflow intenta activar Pages por API en el primer despliegue. Si GitHub lo rechaza, hay que
activarlo a mano una vez en **Settings → Pages → Source → GitHub Actions**.

La app queda en `https://<usuario>.github.io/<repo>/`.

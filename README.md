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
- **Dos cronómetros.** Uno mide la sesión entera desde que empiezas; el otro arranca solo al marcar una
  serie y lo paras tú cuando vas a la siguiente. Sin objetivo que cumplir: en un gimnasio lleno el
  descanso lo decide la cola de la prensa. El tiempo se calcula desde el instante de arranque, así que
  no se pierde un segundo aunque bloquees el móvil o el sistema mate la app en segundo plano.
- **RIR en cada serie.** Un toque para apuntar cuántas repeticiones te quedaban, con la pregunta
  escrita entera al lado. Es lo que separa «7 y podía con dos más» de «7 y me morí», y lo que permite
  saber si una sesión floja fue falta de fuerza o falta de ganas.
- **El descanso se queda escrito entre serie y serie.** Al parar el cronómetro, el tiempo medido
  aparece justo donde ocurrió y se queda ahí: al mirar la tarjeta después se ve el ritmo real del
  ejercicio sin abrir nada.
- **Aviso de versión nueva.** Cuando se despliega una actualización, la app lo dice y la aplica al
  recargar. Sin eso, un móvil con la app instalada seguía sirviendo la copia vieja de la caché.
- **Análisis al cerrar el entreno.** Índice de progreso por grupo muscular, récords batidos, lectura de
  qué ha pasado y qué peso tocar la próxima vez en cada ejercicio.
- **Progreso, en cuatro vistas** y con el tramo de días que elijas (7, 14, 30, 90 o un año):
  - **Mapa** — dos láminas anatómicas, de frente y de espalda, donde **cada músculo es una pieza del
    dibujo** y se colorea él, no una mancha encima. Escala térmica como la de un mapa del tiempo: azul
    lo menos entrenado, rojo lo más. El color no son los kilos: es cómo de atendido está el grupo,
    mezclando volumen semanal, frecuencia, RIR y progreso. Se toca un músculo y se ve el desglose.
  - **Kilos** — tonelaje total por músculo y por ejercicio, desde series × repeticiones × peso.
  - **Fuerza** — evolución del 1RM estimado, tonelaje sesión a sesión y **tabla de récords por
    repetición** (mejor peso a 5, a 8, a 10…) de cada ejercicio.
  - **Descanso** — nube de puntos de descanso frente a rendimiento con la curva del modelo encima,
    para comprobar con tus propios datos si la fórmula te describe.
- **Registro completo.** Cada entreno desplegable serie a serie: ejercicio, peso, repeticiones, RIR y
  el descanso que precedió a cada una. Exportable a CSV.

## Cómo se mide el progreso cuando los descansos no son uniformes

Este es el problema de fondo de la app. En un gimnasio lleno el descanso lo decide la cola de la
prensa, no tú. Si el índice premiara meter más trabajo por minuto, un día de esperas se leería como
un bajón de forma — que es justo lo contrario de lo que pasó.

### Las tres piezas

**1. Curva de recuperación.** Con el mismo peso, las repeticiones que puedes hacer dependen de cuánto
llevas parado, y esa curva se satura:

```
recuperación(t) = 0,5 + 0,5 · (1 − e^(−t/110s))
```

≈71 % con 1 min, ≈83 % con 2 min, ≈90 % con 3 min, ≈97 % con 5 min. Son valores coherentes con lo
publicado sobre intervalos de descanso. Es una media poblacional, no una medida tuya: sirve para
descontar el efecto del descanso, no para predecir tu serie exacta. La pestaña **Descanso** dibuja tus
series reales contra esta curva para que puedas comprobarlo en vez de creértelo.

**2. Amortiguación por RIR.** La pieza que hace que todo funcione. Las series de esta rutina son
prescritas: paras a las 8 porque pone 8, no porque no puedas más. Si te sobraban tres repeticiones, el
descanso no decidió nada y no hay nada que descontar; solo cuando acabas cerca del fallo el descanso
explica el resultado. Sin RIR apuntado se aplica un valor intermedio.

**3. Atribución.** Al comparar con la referencia, el cambio se parte en dos:

```
total = efecto del descanso × cambio real
```

Y la app lo dice con esas palabras: *«Has subido un 8 %. De eso, 3 puntos son porque descansaste 40 s
más de media; los otros 5 son cambio real.»* También cuando el volumen sale plano pero el descanso no,
que es el caso que más despista.

### El índice

Dos componentes, y la densidad **fuera**:

| Peso | Componente | Qué es |
|---|---|---|
| 0,55 | **Fuerza** | Mejor 1RM estimado por [Epley](https://en.wikipedia.org/wiki/One-repetition_maximum) contando el RIR: `peso × (1 + (reps + RIR)/30)` |
| 0,45 | **Volumen ajustado** | Σ peso × repeticiones, dividido por el efecto del descanso |

La fuerza **no se normaliza** por el descanso a propósito. Normalizarla parecía elegante y estaba mal:
convertía «he hecho lo mismo descansando más» en una caída de fuerza del 20 %, con lo que el índice
seguía bailando al ritmo de la cola de la prensa, solo que al revés. Lo que levantas es lo que
levantas; el efecto del descanso vive en el volumen, que es donde de verdad manda.

La **densidad** (kg por minuto) se sigue calculando y se enseña, pero fuera del índice: es una medida
de cómo estaba el gimnasio, no de cómo estás tú.

Todo se compara contra la **mediana de tus tres últimas sesiones de ese grupo** — mediana y no media,
para que una sesión mala no hunda el listón de las tres siguientes. **100 = igual que tu media
reciente.** El índice de la sesión entera es la media de los grupos ponderada por tonelaje, para que un
gemelo no valga lo mismo que una prensa.

Cada serie reparte su estímulo entre los músculos que trabaja, no entero a todos: una prensa cuenta
0,65 de cuádriceps, 0,25 de glúteo y 0,1 de femoral. De ahí salen las **series efectivas** por grupo.

### El mapa de calor

El color de cada músculo es una puntuación compuesta de cuatro cosas, todas visibles por separado al
tocarlo para que el número no haya que creérselo a ciegas:

| Componente | Referencia |
|---|---|
| **Volumen** | series efectivas por semana frente a la franja recomendada del grupo |
| **Frecuencia** | días por semana que se toca (dos es el ideal) |
| **Intensidad** | RIR medio: acercarse al fallo sin pasarse de largo |
| **Progreso** | índice de las sesiones del periodo |

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
    metrics.ts     El algoritmo: curva de recuperación, capacidad, índice, atribución
    analysis.ts    El análisis en prosa del final del entreno
    storage.ts     Persistencia en localStorage
    timer.ts       Cronómetro de descanso (fuera de React, sobrevive a recargas)
    actions.ts     Ciclo de vida de la sesión y edición de la rutina
  components/      Primitivas de interfaz, campos numéricos, gráficos
  lib/
    muscleState.ts Puntuación compuesta por grupo, la que colorea el mapa
    csv.ts         Exportación e importación del registro, fila por serie
  screens/         Portada · Hoy · Entreno · Resumen · Progreso · Registro · Historial · Rutina · Ajustes
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

El mapa de calor es la excepción, y es deliberada: usa escala térmica en vez de la rampa azul. El
arcoíris tiene mala fama en visualización porque el orden de los tonos no es evidente, pero en un mapa
corporal la convención meteorológica ya la sabe leer cualquiera. Se compensa por tres vías: los tonos
van además de oscuro a claro y de vuelta a saturado, cada músculo lleva su cifra escrita en la lista de
al lado, y la leyenda es un degradado continuo rotulado de 0 a 100.

La anatomía (`src/components/anatomy.ts`) no se escribe como curvas Bézier a mano: cada pieza se
declara como una tabla de anchuras a distintas alturas y el trazo se genera interpolando. Ajustar
puntos de control a ciegas daba muñecos de jengibre; así la forma es un dato que se lee y se corrige.

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

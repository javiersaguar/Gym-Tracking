import type { Config } from 'tailwindcss';

/**
 * Sistema de diseño de Gym Tracking.
 *
 * Papel blanco, tinta casi negra y un solo azul. El color es un recurso
 * escaso: el azul marca lo activo y dibuja los datos, y los cuatro pasteles
 * de estado solo aparecen acompañados de texto, nunca solos. Todo lo demás
 * es blanco, línea de un píxel y aire.
 *
 * Nada de degradados en superficies grandes, nada de sombras pesadas y nada
 * de cristal más allá del desenfoque de las barras flotantes. Si un elemento
 * necesita destacar, se destaca con espacio y con tipografía, no con efectos.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Un `border` suelto no debe caer nunca en el gris por defecto de Tailwind.
      borderColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: '#E6E6E1' }),
      divideColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: '#E6E6E1' }),
      ringColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'rgba(43,90,192,0.35)' }),

      colors: {
        /* Lienzo hueso cálido; el blanco puro se reserva para las tarjetas,
           que así flotan sin necesidad de sombra. */
        canvas: '#FAFAF8',
        paper: '#FFFFFF',
        sunken: '#F4F4F1',
        line: {
          DEFAULT: '#E6E6E1',
          soft: '#F0F0EC',
          strong: '#D4D4CE',
        },
        ink: {
          DEFAULT: '#17171A',
          muted: '#6B6B66',
          /* 4,6:1 sobre el lienzo: es el gris más claro que todavía cumple
             el mínimo de contraste para texto pequeño. Subirlo un escalón
             más quedaba bonito y dejaba de leerse al sol. */
          faint: '#72726B',
          /* Nunca negro puro: a tamaño de cuerpo cansa la vista. */
          soft: '#3A3A3C',
        },
        accent: {
          DEFAULT: '#2B5AC0',
          deep: '#1B3F9E',
          mid: '#4A78D2',
          soft: '#9DB6E6',
          /* Fondo de estados seleccionados y de las barras de progreso. */
          wash: '#EDF2FC',
        },

        /* Estados. Pasteles lavados con su tinta legible encima; siempre
           llevan texto al lado, así que el color nunca informa solo. */
        good: { wash: '#EDF3EC', ink: '#346538' },
        warn: { wash: '#FBF3DB', ink: '#956400' },
        bad: { wash: '#FDEBEC', ink: '#9F2F2D' },
        info: { wash: '#E8EFFB', ink: '#2551C4' },

        /* Rampa secuencial de los gráficos: un solo tono, de menos a más
           magnitud. Validada sobre blanco — L monótona, saltos ≥0,06 y el
           extremo claro por encima de 2:1 de contraste. */
        viz: {
          1: '#9DB6E6',
          2: '#7196DC',
          3: '#4A78D2',
          4: '#2B5AC0',
          5: '#1B3F9E',
        },
      },

      fontFamily: {
        /* Tipografía del sistema: en el móvil da San Francisco o Roboto, que
           ya traen tamaños ópticos y tablas de tracking afinadas, y no cuesta
           un solo byte de descarga ni deja de funcionar sin cobertura. */
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'system-ui',
          'sans-serif',
        ],
        /* Serif editorial para los títulos grandes. Se autoaloja (24 KB) y el
           service worker la precachea, así que sigue estando sin conexión. */
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },

      /**
       * El tracking depende del tamaño: negativo al crecer, ligeramente
       * positivo al encoger. Un solo `letter-spacing` para todo está mal
       * en algún sitio por definición.
       */
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '0.95rem', letterSpacing: '0.02em' }],
        caption: ['0.75rem', { lineHeight: '1.05rem', letterSpacing: '0.005em' }],
        body: ['0.875rem', { lineHeight: '1.4rem', letterSpacing: '0' }],
        'body-lg': ['1rem', { lineHeight: '1.6rem', letterSpacing: '-0.005em' }],
        title: ['1.0625rem', { lineHeight: '1.4rem', letterSpacing: '-0.012em' }],
        'title-lg': ['1.3125rem', { lineHeight: '1.6rem', letterSpacing: '-0.018em' }],
        /* Escalones de la serif: interlineado apretado y tracking negativo. */
        display: ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['2.625rem', { lineHeight: '1.04', letterSpacing: '-0.028em' }],
        'display-xl': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.032em' }],
        /* Cifras: interlineado clavado al tamaño para que no descoloquen la fila. */
        figure: ['1.25rem', { lineHeight: '1.25rem', letterSpacing: '-0.02em' }],
        'figure-lg': ['1.75rem', { lineHeight: '1.75rem', letterSpacing: '-0.026em' }],
        'figure-xl': ['2.5rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em' }],
      },
      letterSpacing: { tightest: '-0.03em', label: '0.07em' },

      /* Radios nítidos. Nada de pastilla en tarjetas ni en botones grandes:
         solo las etiquetas pequeñas son redondas del todo. */
      borderRadius: { DEFAULT: '6px', sm: '4px', md: '6px', lg: '8px', xl: '12px', '2xl': '14px' },

      /* Sombras casi inexistentes: por debajo del 5 % de opacidad. La
         jerarquía la da el borde de un píxel y el espacio, no la elevación. */
      boxShadow: {
        card: '0 1px 2px rgba(23,23,26,0.03)',
        raise: '0 2px 8px rgba(23,23,26,0.04)',
        float: '0 1px 3px rgba(23,23,26,0.04), 0 8px 24px -12px rgba(23,23,26,0.10)',
        none: 'none',
      },

      /* Curvas fuertes: las de serie del navegador no tienen pegada. */
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },

      /* Presupuesto de duración: la interfaz no pasa de 300 ms. */
      transitionDuration: {
        press: '140ms',
        pop: '180ms',
        panel: '240ms',
        sheet: '300ms',
      },

      keyframes: {
        /* Entrada silenciosa: doce píxeles y una curva larga. */
        enter: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        swap: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        /* Marca discreta al batir un récord: un lavado de color, sin fuegos. */
        flashPr: {
          '0%': { backgroundColor: 'rgba(43,90,192,0)' },
          '22%': { backgroundColor: 'rgba(43,90,192,0.07)' },
          '100%': { backgroundColor: 'rgba(43,90,192,0)' },
        },
        breathe: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },

      animation: {
        enter: 'enter .6s cubic-bezier(.16,1,.3,1) both',
        swap: 'swap .18s cubic-bezier(.16,1,.3,1) both',
        'flash-pr': 'flashPr 1.2s ease-out',
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

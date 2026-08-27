import type { Config } from 'tailwindcss';

/**
 * Sistema de diseño de Gym Tracking.
 *
 * Tres colores y nada más: negro como fondo, blanco como contenido y una
 * gama de azules como único acento. Todo lo demás es semántico y aparece
 * poco: verde solo cuando se bate un récord, ámbar cuando algo baja, rojo
 * solo para destruir. Si un color no significa nada, no se usa.
 *
 * Los grupos musculares sí tienen paleta propia (`muscle`), pero está
 * construida alrededor del azul para que un gráfico no parezca un arcoíris.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Un `border` suelto no debe caer nunca en el gris por defecto de Tailwind.
      borderColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'rgba(255,255,255,0.08)' }),
      divideColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'rgba(255,255,255,0.08)' }),
      ringColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'rgba(46,123,255,0.45)' }),

      colors: {
        canvas: '#05070C',
        surface: {
          DEFAULT: '#0C1017',
          raised: '#121825',
          high: '#1A2333',
          sunken: '#080A10',
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.15)',
          glow: 'rgba(46,123,255,0.34)',
        },
        content: {
          DEFAULT: '#ECF1F8',
          muted: '#8B97AC',
          faint: '#57637A',
        },
        brand: {
          DEFAULT: '#2E7BFF',
          bright: '#6BA6FF',
          soft: '#A9C9FF',
          deep: '#1550C8',
          ink: '#03122E',
        },
        up: '#3DDC97',
        down: '#F2B33D',
        danger: '#FF6B6B',
        pr: '#7FD8FF',

        /* Rampa secuencial para los gráficos: un solo tono, cinco escalones,
           de menos a más magnitud. Un grupo muscular no se distingue por
           color sino por su etiqueta y por la longitud de la barra, así que
           gastar once tonos solo repetiría lo que ya dice la barra —y once
           azules no se distinguen entre sí de todas formas.
           Validada contra el fondo #0C1017: L monótona, saltos ≥0,06 y el
           extremo apagado por encima de 2:1 de contraste. */
        viz: {
          1: '#31518C',
          2: '#2C63C4',
          3: '#2E7BFF',
          4: '#6EA8FF',
          5: '#ABCDFF',
        },
      },

      /* Tipografía del sistema y solo del sistema: una fuente de CDN se cae
         justo cuando más falta hace (sin cobertura en el gimnasio) y una
         autoalojada son 200 KB por un San Francisco peor. Además ya trae
         tamaños ópticos y tablas de tracking afinadas. */
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
      },

      /**
       * El tracking depende del tamaño: negativo al crecer, ligeramente
       * positivo al encoger. Un solo `letter-spacing` para todo está mal
       * en algún sitio por definición.
       */
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.03em' }],
        caption: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.012em' }],
        body: ['0.875rem', { lineHeight: '1.35rem', letterSpacing: '0' }],
        'body-lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.006em' }],
        title: ['1.0625rem', { lineHeight: '1.3rem', letterSpacing: '-0.014em' }],
        'title-lg': ['1.375rem', { lineHeight: '1.6rem', letterSpacing: '-0.021em' }],
        display: ['1.75rem', { lineHeight: '1.95rem', letterSpacing: '-0.028em' }],
        'display-lg': ['2.5rem', { lineHeight: '2.5rem', letterSpacing: '-0.036em' }],
        /* Cifras: interlineado clavado al tamaño para que no descoloquen la fila. */
        figure: ['1.375rem', { lineHeight: '1.375rem', letterSpacing: '-0.024em' }],
        'figure-lg': ['2rem', { lineHeight: '2rem', letterSpacing: '-0.032em' }],
      },
      letterSpacing: { tightest: '-0.036em' },
      borderRadius: { lg: '10px', xl: '14px', '2xl': '18px', '3xl': '26px' },

      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.5), 0 14px 34px -20px rgba(0,0,0,.9)',
        lift: '0 2px 8px rgba(0,0,0,.55), 0 26px 60px -26px rgba(0,0,0,1)',
        'glow-brand': '0 0 0 1px rgba(46,123,255,.4), 0 12px 36px -14px rgba(46,123,255,.55)',
        'glow-pr': '0 0 0 1px rgba(127,216,255,.4), 0 12px 36px -14px rgba(127,216,255,.5)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.06)',
      },

      /* Curvas fuertes: las de serie del navegador no tienen pegada. */
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },

      /* Presupuesto de duración: la interfaz no pasa de 300ms. */
      transitionDuration: {
        press: '140ms',
        pop: '180ms',
        panel: '240ms',
        sheet: '300ms',
      },

      keyframes: {
        /* Para lo que cambia sin moverse de su hueco. Cuatro píxeles bastan
           para que se lea como un cambio y no como un parpadeo. */
        swap: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(.94)' },
          '60%': { opacity: '1', transform: 'scale(1.015)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        /* Latido del punto del cronómetro en marcha. */
        pulse2: { '75%,100%': { transform: 'scale(2.2)', opacity: '0' } },
        /* Fogonazo al marcar una serie que bate a la anterior. */
        flashPr: {
          '0%': { backgroundColor: 'rgba(127,216,255,0)' },
          '22%': { backgroundColor: 'rgba(127,216,255,.20)' },
          '100%': { backgroundColor: 'rgba(127,216,255,0)' },
        },
        confetti: {
          '0%': { opacity: '1', transform: 'translate3d(0,0,0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translate3d(var(--dx), var(--dy), 0) rotate(var(--dr))' },
        },
      },

      animation: {
        rise: 'rise .34s cubic-bezier(.22,.68,.28,1) both',
        swap: 'swap .18s cubic-bezier(.23,1,.32,1) both',
        'pop-in': 'popIn .28s cubic-bezier(.2,.9,.3,1.08) both',
        shimmer: 'shimmer 1.6s infinite',
        pulse2: 'pulse2 1.8s cubic-bezier(0,0,.2,1) infinite',
        'flash-pr': 'flashPr 1.1s ease-out',
        confetti: 'confetti var(--dur,1.1s) cubic-bezier(.2,.6,.4,1) forwards',
      },
    },
  },
  plugins: [],
} satisfies Config;

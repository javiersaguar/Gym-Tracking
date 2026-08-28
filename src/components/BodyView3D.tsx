import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BODY_HEIGHT, bestYaw, buildParts, buildSkin, type Part } from '../lib/body3d';
import type { Muscle } from '../lib/types';

/* ────────────────────────────────────────────────────────────────────────────
 * Visor del cuerpo
 *
 * Una sola figura que se gira arrastrando, se acerca pellizcando y responde al
 * toque: es más fácil de leer que dos siluetas planas de delante y detrás,
 * porque el hombro o el gemelo se ven donde están y no partidos entre dos
 * dibujos.
 *
 * El bucle de dibujo no corre siempre: se pide un fotograma cuando algo cambia
 * —un gesto, una animación de color, un giro automático— y se para solo. En un
 * móvil dentro del gimnasio eso es la diferencia entre una pestaña y una
 * estufa.
 *
 * La malla se construye una vez para toda la vida de la app: es cara de
 * generar y no depende de los datos. Lo que cambia con los datos es solo el
 * color de cada material, que se interpola para que el mapa no dé un salto
 * al cambiar de ventana temporal.
 * ──────────────────────────────────────────────────────────────────────── */

/** Geometría compartida: se genera al primer uso y ya no se vuelve a tocar. */
let cached: { skin: THREE.BufferGeometry; parts: { part: Part; geometry: THREE.BufferGeometry }[] } | null = null;

function geometryOf(m: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  shade?: Float32Array;
}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  if (m.shade) {
    /* La sombra de contacto viaja como color por vértice y multiplica al del
       material, así que basta con cambiar el color del músculo para repintar
       el mapa: el relieve se mantiene solo. */
    const rgb = new Float32Array(m.shade.length * 3);
    for (let i = 0; i < m.shade.length; i++) {
      const v = m.shade[i] as number;
      rgb[i * 3] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  }
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function body() {
  if (!cached) {
    cached = {
      skin: geometryOf(buildSkin()),
      parts: buildParts().map((part) => ({ part, geometry: geometryOf(part) })),
    };
  }
  return cached;
}

export type BodyPick = {
  muscle: Muscle;
  head: string | null;
  /** Posición en píxeles dentro del visor, para colocar la etiqueta. */
  x: number;
  y: number;
};

export type BodyView3DProps = {
  /** Color de cada pieza. Recibe grupo y cabeza; devolver null la deja neutra. */
  colorOf: (muscle: Muscle, head: string | null) => string | null;
  /** Grupo resaltado. En modo detalle, además, el único que se colorea. */
  focus?: Muscle | null;
  /** Detalle: colorea por cabeza, atenúa el resto y saca las capas profundas. */
  detail?: boolean;
  onPick?: (pick: BodyPick | null) => void;
  /** Cartel que sigue al músculo tocado mientras se gira la figura. */
  tag?: React.ReactNode;
  className?: string;
  label: string;
};

/* La piel va más clara que los músculos sin datos: si los dos grises se
   parecen, la figura entera se lee como un maniquí liso y no se distingue
   dónde empieza y acaba cada músculo. */
const SKIN = '#E4E4DD';
/** Músculo sin trabajo en el periodo. */
const UNTRAINED = '#C6C6BD';
/** Grupo atenuado en el mapa de detalle. */
const MUTED = '#D2D2CA';
/** Tejido que la app no mide: antebrazo, tibial. */
const UNMEASURED = '#D8D8D1';

/** Distancias de cámara: el cuerpo entero, y lo más cerca que deja acercarse. */
const FAR = 430;
const NEAR = 130;

export function BodyView3D({ colorOf, focus, detail = false, onPick, tag: tagNode, className, label }: BodyView3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  /* Todo lo que cambia por fotograma vive en refs: si pasara por el estado de
     React, cada grado de giro sería un render del árbol entero. */
  const api = useRef<{
    setColors: (fn: BodyView3DProps['colorOf'], focus: Muscle | null, detail: boolean) => void;
    spinTo: (yaw: number) => void;
    clearPick: () => void;
  } | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      el.dataset.failed = 'true';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 1, 2000);

    /* Luz de estudio: un hemisférico que levanta las sombras, una principal
       arriba a la derecha y un contraluz que despega la figura del fondo
       blanco de la tarjeta. */
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d0, 1.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(70, 160, 130);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-110, 50, 70);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(-40, 80, -140);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    const { skin, parts } = body();
    root.add(new THREE.Mesh(skin, new THREE.MeshStandardMaterial({
      color: SKIN,
      roughness: 0.96,
      metalness: 0,
      /* La piel se empuja hacia atrás para que los músculos, que nacen justo
         sobre ella, no parpadeen contra su propia superficie. */
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    })));

    type Item = { part: Part; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; from: THREE.Color; to: THREE.Color };
    const items: Item[] = parts.map(({ part, geometry }) => {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(SKIN),
        roughness: 0.74,
        metalness: 0,
        vertexColors: true,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.visible = !part.deep;
      mesh.userData = { part };
      root.add(mesh);
      return { part, mesh, mat, from: new THREE.Color(SKIN), to: new THREE.Color(SKIN) };
    });
    const pickable = items.filter((i) => i.part.muscle).map((i) => i.mesh);

    /* ── Cámara y gestos ─────────────────────────────────────────────────── */

    let yaw = 0;
    let yawTarget: number | null = null;
    let spin = 0;
    let dist = FAR;
    let look = BODY_HEIGHT * 0.52;
    let fade = 1;
    let picked: { point: THREE.Vector3; muscle: Muscle } | null = null;
    let frame = 0;
    let alive = true;
    /* Con movimiento reducido el cuerpo sigue girando con el dedo —eso es
       manipulación directa, no animación— pero se le quitan la inercia y el
       giro automático, que son los que se mueven solos. */
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const wake = () => {
      if (alive && !frame) frame = requestAnimationFrame(tick);
    };

    const place = () => {
      camera.position.set(0, look, dist);
      camera.lookAt(0, look, 0);
      root.rotation.y = yaw;
    };

    function tick() {
      frame = 0;
      let busy = false;

      if (yawTarget != null) {
        /* Camino más corto: girar 350° para llegar a 10° marea. */
        let d = yawTarget - yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        yaw += calm ? d : d * 0.14;
        if (calm || Math.abs(d) < 0.004) {
          yaw = yawTarget;
          yawTarget = null;
        } else busy = true;
      } else if (!calm && Math.abs(spin) > 0.0004 && !pointers.size) {
        // Inercia: el cuerpo sigue girando un momento al soltar.
        yaw += spin;
        spin *= 0.94;
        busy = true;
      }

      if (fade < 1) {
        fade = calm ? 1 : Math.min(1, fade + 0.055);
        busy = true;
      }
      for (const it of items) it.mat.color.lerpColors(it.from, it.to, fade);

      place();
      renderer.render(scene, camera);
      positionTag();
      if (busy) wake();
    }

    const positionTag = () => {
      const node = tag.current;
      if (!node) return;
      if (!picked) {
        node.style.opacity = '0';
        return;
      }
      const v = picked.point.clone().applyMatrix4(root.matrixWorld).project(camera);
      /* Si el punto ha quedado detrás del cuerpo al girar, la etiqueta sobra:
         estaría señalando a un músculo que ya no se ve. */
      const facing = picked.point.clone().applyMatrix4(new THREE.Matrix4().extractRotation(root.matrixWorld));
      const behind = facing.z < -2 && Math.abs(facing.x) < 12;
      node.style.opacity = v.z > 1 || behind ? '0' : '1';
      const rect = renderer.domElement.getBoundingClientRect();
      node.style.left = `${((v.x + 1) / 2) * rect.width}px`;
      node.style.top = `${((1 - v.y) / 2) * rect.height}px`;
    };

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    /* ── Punteros ────────────────────────────────────────────────────────── */

    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let startAt = 0;
    let pinchFrom = 0;
    let distFrom = 0;
    let lastTap = 0;

    const canvas = renderer.domElement;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const onDown = (e: PointerEvent) => {
      // Capturar puede fallar si el puntero ya se ha soltado; no es motivo
      // para tirar el gesto entero.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura: el gesto sigue funcionando mientras no salga del lienzo */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        moved = 0;
        startAt = performance.now();
        spin = 0;
        yawTarget = null;
      }
      if (pointers.size === 2) {
        pinchFrom = spread();
        distFrom = dist;
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);

      if (pointers.size >= 2) {
        const now = spread();
        if (pinchFrom > 0 && now > 0) {
          dist = Math.min(FAR, Math.max(NEAR, (distFrom * pinchFrom) / now));
        }
      } else {
        /* Horizontal gira; vertical sube y baja la mirada, que es lo que hace
           falta cuando se ha ampliado sobre una pierna o un hombro. */
        const perPx = (Math.PI * 2) / (canvas.clientWidth * 1.35);
        yaw += dx * perPx;
        spin = dx * perPx;
        look = Math.min(BODY_HEIGHT - 14, Math.max(14, look - dy * (dist / 900)));
      }
      wake();
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchFrom = 0;
      if (pointers.size === 0 && moved < 10 && performance.now() - startAt < 500) {
        const now = performance.now();
        if (now - lastTap < 320) {
          // Doble toque: volver a la vista de partida, que es la salida de
          // emergencia cuando uno se pierde girando y ampliando.
          dist = FAR;
          look = BODY_HEIGHT * 0.52;
          yawTarget = 0;
          picked = null;
          pick.current?.(null);
        } else {
          tap(e);
        }
        lastTap = now;
      }
      wake();
    };

    const ray = new THREE.Raycaster();
    const tap = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      if (!hit) {
        picked = null;
        pick.current?.(null);
        return;
      }
      const part = (hit.object.userData as { part: Part }).part;
      if (!part.muscle) return;
      picked = {
        point: hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert()),
        muscle: part.muscle,
      };
      const rectNow = canvas.getBoundingClientRect();
      pick.current?.({
        muscle: part.muscle,
        head: part.head,
        x: e.clientX - rectNow.left,
        y: e.clientY - rectNow.top,
      });
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    /* ── Interfaz hacia React ────────────────────────────────────────────── */

    api.current = {
      setColors(fn, nextFocus, isDetail) {
        for (const it of items) {
          it.mesh.visible = isDetail ? (!it.part.deep || it.part.muscle === nextFocus) : !it.part.deep;
          const dim = isDetail && it.part.muscle !== nextFocus;
          const c = it.part.muscle && !dim ? fn(it.part.muscle, isDetail ? it.part.head : null) : null;
          it.from.copy(it.mat.color);
          it.to.set(c ?? (!it.part.muscle ? UNMEASURED : dim ? MUTED : UNTRAINED));
          /* El grupo elegido se separa del resto con un punto de luz propia,
             que se lee mejor que un borde sobre una superficie curva. */
          it.mat.emissive.set(!isDetail && nextFocus && it.part.muscle === nextFocus ? 0x1a1a22 : 0x000000);
        }
        fade = 0;
        wake();
      },
      spinTo(next) {
        yawTarget = next;
        spin = 0;
        wake();
      },
      clearPick() {
        picked = null;
        wake();
      },
    };

    return () => {
      alive = false;
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      for (const it of items) it.mat.dispose();
      renderer.dispose();
      canvas.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.setColors(colorOf, focus ?? null, detail);
  }, [colorOf, focus, detail]);

  useEffect(() => {
    if (detail && focus) api.current?.spinTo(bestYaw(body().parts.map((p) => p.part), focus));
  }, [detail, focus]);

  return (
    <div className={className}>
      <div
        ref={host}
        className="relative h-full w-full select-none"
        role="img"
        aria-label={label}
      >
        <div
          ref={tag}
          className="absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] opacity-0 transition-opacity duration-200"
        >
          {tagNode}
        </div>
      </div>
    </div>
  );
}

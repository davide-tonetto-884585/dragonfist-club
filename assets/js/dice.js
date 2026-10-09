// ---------------------------------------------------------------------------
// Dice thrower: dadi 3D che cadono per gravità e rimbalzano sugli elementi del sito.
//
// - Vivono nel riquadro dello schermo: scrollando, titoli, schede, foto e rampe si
//   muovono e li colpiscono (le foto no). Sugli elementi larghi scivolano verso i bordi.
// - Si possono aggiungere/togliere d4, d6, d8, d10, d12, d20 (pannello in basso a destra).
// - Quando tutti si fermano, mostra i singoli valori e la somma.
// - Da telefono la gravità segue il giroscopio; scuotendo il telefono si lanciano.
// - Si trascinano e si lanciano col dito o col mouse.
// Basato su d20-giroscopio.html (three.js r128, caricato da cdnjs in index.html).
// ---------------------------------------------------------------------------
(() => {
  const wrap = document.querySelector(".dice");
  const canvas = wrap && wrap.querySelector(".dice__canvas");
  const hud = document.querySelector(".dice-hud");
  const hudValue = document.getElementById("dice-value");
  const hudSet = document.getElementById("dice-set");
  const panel = document.getElementById("dice-panel");
  const detail = document.getElementById("dice-detail");
  const btnRoll = document.getElementById("dice-roll");
  const btnSensors = document.getElementById("dice-sensors");
  const nav = document.querySelector(".nav");
  if (!canvas || !hud) return;

  const fail = () => {
    wrap.hidden = true;
    hud.hidden = true;
  };
  if (!window.THREE) return fail();

  /* ---------- Rendering: un unico canvas trasparente a tutto schermo ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return fail();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  camera.position.z = 800;
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1214, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(-300, 420, 600);
  scene.add(sun);

  /* ---------- Tipi di dado ---------- */
  // scale: quanto è grande il solido rispetto al raggio di collisione (a occhio, per farli sembrare simili)
  const TYPES = {
    d4: { sides: 4, top: "#4fae6c", bottom: "#23733f", scale: 1.25 },
    d6: { sides: 6, top: "#3f7bd0", bottom: "#204f94", scale: 1.55 },
    d8: { sides: 8, top: "#8a5cc9", bottom: "#56308f", scale: 1.3 },
    d10: { sides: 10, top: "#2ea3a3", bottom: "#156b6b", scale: 1.12 },
    d12: { sides: 12, top: "#e08a3c", bottom: "#a3531a", scale: 1.15 },
    d20: { sides: 20, top: "#d4323a", bottom: "#9e1d24", scale: 1.12 },
  };
  const ORDER = Object.keys(TYPES);
  const MAX_DICE = 10;

  // Trapezoedro pentagonale (d10): 10 facce a "aquilone"
  const d10Geometry = () => {
    // altezza dell'anello che rende planari gli aquiloni (apici a ±1, raggio 1)
    const s72 = Math.sin((72 * Math.PI) / 180);
    const c72 = Math.cos((72 * Math.PI) / 180);
    const s36 = Math.sin((36 * Math.PI) / 180);
    const c36 = Math.cos((36 * Math.PI) / 180);
    const k = (2 * s72) / (-s72 * c36 + (c72 - 1) * s36 - s72);
    const a = k + 1;
    const T = new THREE.Vector3(0, 0, 1);
    const Bt = new THREE.Vector3(0, 0, -1);
    const u = [];
    const l = [];
    for (let i = 0; i < 5; i++) {
      const au = (i * 72 * Math.PI) / 180;
      const al = ((i * 72 + 36) * Math.PI) / 180;
      u.push(new THREE.Vector3(Math.cos(au), Math.sin(au), a));
      l.push(new THREE.Vector3(Math.cos(al), Math.sin(al), -a));
    }
    const tris = [];
    for (let i = 0; i < 5; i++) {
      const n = (i + 1) % 5;
      tris.push([T, u[i], l[i]], [T, l[i], u[n]]); // aquilone superiore
      tris.push([Bt, l[i], u[n]], [Bt, u[n], l[n]]); // aquilone inferiore
    }
    const arr = [];
    for (let [p, q, r] of tris) {
      const nrm = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
      const cen = new THREE.Vector3().add(p).add(q).add(r);
      if (nrm.dot(cen) < 0) [q, r] = [r, q]; // normali verso l'esterno
      arr.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return g;
  };

  const rawGeometry = (type) => {
    let g;
    if (type === "d4") g = new THREE.TetrahedronGeometry(1, 0);
    else if (type === "d6") g = new THREE.BoxGeometry(2 / Math.sqrt(3), 2 / Math.sqrt(3), 2 / Math.sqrt(3));
    else if (type === "d8") g = new THREE.OctahedronGeometry(1, 0);
    else if (type === "d10") g = d10Geometry();
    else if (type === "d12") g = new THREE.DodecahedronGeometry(1, 0);
    else g = new THREE.IcosahedronGeometry(1, 0);
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute("uv");
    g.deleteAttribute("normal");
    return g;
  };

  // Costruisce geometria + texture numerata per un tipo (una volta sola, condivisa tra i dadi uguali)
  const kinds = {};
  const buildKind = (type) => {
    const def = TYPES[type];
    const geo = rawGeometry(type);
    const pos = geo.attributes.position;
    const P = (i) => new THREE.Vector3().fromBufferAttribute(pos, i);

    // Raggruppa i triangoli in facce (stesso piano)
    const faces = [];
    const triFace = [];
    for (let t = 0; t < pos.count / 3; t++) {
      const a = P(t * 3);
      const b = P(t * 3 + 1);
      const c = P(t * 3 + 2);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      let f = faces.find((x) => x.n.dot(n) > 0.999);
      if (!f) faces.push((f = { n, verts: [] }));
      for (const p of [a, b, c]) if (!f.verts.some((v) => v.distanceTo(p) < 1e-4)) f.verts.push(p);
      triFace.push(f);
    }

    // Per ogni faccia: centro, direzione "su" del numero e base 2D
    for (const f of faces) {
      f.c = f.verts.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / f.verts.length);
      const dists = f.verts.map((v) => v.distanceTo(f.c));
      const maxD = Math.max(...dists);
      const regular = dists.every((d) => Math.abs(d - maxD) < 1e-3);
      let up;
      if (f.verts.length === 4 && regular) {
        // quadrato: "su" verso il centro di un lato
        const v0 = f.verts[0];
        const v1 = f.verts.slice(1).reduce((best, v) => (v.distanceTo(v0) < best.distanceTo(v0) ? v : best));
        up = new THREE.Vector3().addVectors(v0, v1).multiplyScalar(0.5).sub(f.c);
      } else {
        up = f.verts[dists.indexOf(maxD)].clone().sub(f.c); // verso il vertice più lontano (punta dell'aquilone)
      }
      f.up = up.normalize();
      f.right = new THREE.Vector3().crossVectors(f.up, f.n).normalize();
      f.maxD = maxD;
      f.kite = f.verts.length === 4 && !regular;
    }

    // Numerazione: facce opposte che sommano a N+1 quando possibile (come i dadi veri)
    const N = faces.length;
    const opposite = faces.map((f) => faces.findIndex((g) => g !== f && f.n.dot(g.n) < -0.999));
    if (opposite.every((i) => i >= 0)) {
      let n = 1;
      faces.forEach((f, i) => {
        if (f.value) return;
        f.value = n;
        faces[opposite[i]].value = N + 1 - n;
        n++;
      });
    } else faces.forEach((f, i) => (f.value = i + 1));

    // Atlante delle facce
    const COLS = Math.ceil(Math.sqrt(N));
    const ROWS = Math.ceil(N / COLS);
    const CELL = 256;
    const atlas = document.createElement("canvas");
    atlas.width = COLS * CELL;
    atlas.height = ROWS * CELL;
    const ctx = atlas.getContext("2d");
    const toCell = (f, i, p) => {
      const s = (CELL * 0.46) / f.maxD;
      const d = new THREE.Vector3().subVectors(p, f.c);
      return [(i % COLS) * CELL + CELL / 2 + d.dot(f.right) * s, Math.floor(i / COLS) * CELL + CELL / 2 - d.dot(f.up) * s];
    };
    const draw = () => {
      ctx.fillStyle = def.bottom;
      ctx.fillRect(0, 0, atlas.width, atlas.height);
      faces.forEach((f, i) => {
        // poligono ordinato attorno al centro
        const pts = f.verts
          .map((v) => toCell(f, i, v))
          .map((p) => ({ p, a: Math.atan2(p[1] - (Math.floor(i / COLS) * CELL + CELL / 2), p[0] - ((i % COLS) * CELL + CELL / 2)) }))
          .sort((x, y) => x.a - y.a)
          .map((x) => x.p);
        const oy = Math.floor(i / COLS) * CELL;
        ctx.beginPath();
        pts.forEach((p, k) => (k ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
        const grd = ctx.createLinearGradient(0, oy, 0, oy + CELL);
        grd.addColorStop(0, def.top);
        grd.addColorStop(1, def.bottom);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.lineWidth = 9;
        ctx.strokeStyle = "#e8b923";
        ctx.stroke();
        const [cx, cy] = toCell(f, i, f.c.clone().addScaledVector(f.up, f.kite ? -0.18 * f.maxD : 0));
        const v = f.value;
        const crit = (type === "d20" && (v === 20 || v === 1)) || v === def.sides;
        ctx.fillStyle = crit ? "#fae003" : "#fff3c4";
        const size = CELL * (N <= 6 ? 0.42 : N <= 8 ? 0.34 : N <= 12 ? 0.3 : 0.28) * (v >= 10 ? 0.85 : 1);
        ctx.font = `900 ${size}px Cinzel, Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(v), cx, cy + size * 0.06);
        if (N >= 9 && (v === 6 || v === 9)) ctx.fillRect(cx - size * 0.22, cy + size * 0.52, size * 0.44, size * 0.08);
      });
    };
    draw();
    const uv = new Float32Array(pos.count * 2);
    for (let t = 0; t < pos.count / 3; t++) {
      const f = triFace[t];
      const i = faces.indexOf(f);
      for (let k = 0; k < 3; k++) {
        const [x, y] = toCell(f, i, P(t * 3 + k));
        uv[(t * 3 + k) * 2] = x / atlas.width;
        uv[(t * 3 + k) * 2 + 1] = 1 - y / atlas.height;
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(atlas);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.MeshStandardMaterial({ map: tex, flatShading: true, roughness: 0.4, metalness: 0.08 });
    return { type, geo, mat, faces, redraw: () => (draw(), (tex.needsUpdate = true)) };
  };
  const kind = (type) => kinds[type] || (kinds[type] = buildKind(type));
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      Object.values(kinds).forEach((k) => k.redraw());
      dirty = true;
    });
  }

  /* ---------- Stato ---------- */
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = innerWidth;
  let H = innerHeight;
  let BASE = 26; // raggio del dado (px)
  let wall = 0;
  const B = { left: 0, right: 0, top: 0, bottom: 0 };
  const G = { x: 0, y: 1 }; // gravità in "g", assi dello schermo (y verso il basso)
  const GPX = 2400; // px/s² per 1 g
  const SLIDE = 1400; // px/s² verso il bordo sugli elementi larghi
  let sensorsOn = false;
  let dirty = true;
  let rolling = false; // c'è un tiro in corso da sommare
  const dice = [];

  const rand = (a, b) => a + Math.random() * (b - a);
  const resize = () => {
    W = innerWidth;
    H = innerHeight;
    BASE = W < 560 ? 20 : 26;
    renderer.setSize(W, H, false);
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    wall = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--wall")) || 0;
    for (const d of dice) sizeDie(d);
    dirty = true;
  };
  const sizeDie = (d) => {
    d.R = BASE;
    d.mesh.scale.setScalar(d.R * TYPES[d.type].scale);
    d.shadow.style.width = d.shadow.style.height = d.R * 2.2 + "px";
  };

  const addDie = (type, x, y) => {
    const k = kind(type);
    const mesh = new THREE.Mesh(k.geo, k.mat);
    mesh.quaternion.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
    scene.add(mesh);
    const shadow = document.createElement("div");
    shadow.className = "dice__shadow";
    wrap.appendChild(shadow);
    const pop = document.createElement("div");
    pop.className = "dice-pop";
    pop.setAttribute("aria-hidden", "true");
    document.body.appendChild(pop);
    const d = {
      type,
      mesh,
      shadow,
      pop,
      R: BASE,
      x: x ?? rand(B.left + 40, B.right - 40),
      y: y ?? B.top + 40,
      vx: reduced ? 0 : rand(-500, 500),
      vy: 0,
      spin: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-8, 8)),
      settled: false,
      settle: null,
      still: 0,
      travel: 0,
      thrown: !reduced,
      grab: null,
      value: null,
    };
    sizeDie(d);
    dice.push(d);
    rolling = true;
    dirty = true;
    return d;
  };
  const removeDie = (d) => {
    scene.remove(d.mesh);
    d.shadow.remove();
    d.pop.remove();
    dice.splice(dice.indexOf(d), 1);
    dirty = true;
  };

  /* ---------- Ostacoli: elementi del sito e rampe ---------- */
  const SOLID = [
    "[data-solid]",
    ".hero__logo",
    ".hero h1",
    ".hero .btn",
    ".section__head h2",
    ".split__text h2",
    ".info",
    ".pills li",
    ".event",
    ".calendar__status",
    ".calendar__embed",
    ".calendar__actions .btn",
    ".story__text h3",
    ".more-events li",
    ".more-events .btn",
    ".cta h2",
    ".cta .btn",
    ".footer__brand",
    ".footer__social a",
  ].join(",");
  let solids = [];
  let baffles = [];
  const collect = () => {
    solids = [...document.querySelectorAll(SOLID)];
    baffles = [...document.querySelectorAll(".baffle")];
  };
  collect();
  setInterval(collect, 1000); // il calendario e le immagini arrivano dopo

  const range = document.createRange();
  // Per i titoli conta solo il testo, non tutta la riga
  const rectOf = (el) => {
    if (/^H[1-3]$/.test(el.tagName)) {
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    }
    return el.getBoundingClientRect();
  };

  let obstacles = [];
  const readObstacles = () => {
    obstacles = [];
    const span = B.right - B.left;
    for (const el of solids) {
      if (el.hidden) continue;
      const r = rectOf(el);
      if (!r.width || r.bottom < -80 || r.top > H + 80) continue;
      // fixed = non si muove con lo scroll; wide = fa scivolare il dado verso i bordi
      obstacles.push({ el, r, fixed: hud.contains(el), wide: r.width > span * 0.55 });
    }
    for (const el of baffles) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > H + 80 || !el.baffleEdge) continue;
      const [x0, y0, x1, y1] = el.baffleEdge; // bordo superiore della rampa, calcolato in main.js
      obstacles.push({ el, seg: [r.left + x0, r.top + y0, r.left + x1, r.top + y1] });
    }
  };

  const lastBump = new WeakMap();
  const bump = (el, nx, ny, imp) => {
    if (!el || !el.animate) return;
    const now = performance.now();
    if (now - (lastBump.get(el) || 0) < 120) return;
    lastBump.set(el, now);
    const k = Math.min(6, imp / 200);
    try {
      el.animate([{ translate: `${(-nx * k).toFixed(1)}px ${(-ny * k).toFixed(1)}px` }, { translate: "0px 0px" }], {
        duration: 180,
        easing: "ease-out",
      });
    } catch (e) {}
    if (sensorsOn && imp > 700 && navigator.vibrate) {
      try {
        navigator.vibrate(Math.min(25, imp / 80));
      } catch (e) {}
    }
  };

  const kick = (d, imp) => {
    const s = imp / 70;
    d.spin.x += rand(-0.5, 0.5) * s;
    d.spin.y += rand(-0.5, 0.5) * s;
    d.spin.z += rand(-0.5, 0.5) * s;
  };

  // Urto con una superficie che può muoversi (ovx, ovy): rimbalzo + attrito
  const resolve = (d, nx, ny, pen, el, ovx, ovy, dt, isWall) => {
    const R = d.R;
    if (!isWall) {
      // Se un elemento spinge il dado contro un bordo dello schermo, lo lascia passare invece di schiacciarlo
      if (ny < -0.5 && d.y - R <= B.top + 1.5) return;
      if (ny > 0.5 && d.y + R >= B.bottom - 1.5) return;
      if (nx < -0.5 && d.x - R <= B.left + 1.5) return;
      if (nx > 0.5 && d.x + R >= B.right - 1.5) return;
    }
    d.x += nx * pen;
    d.y += ny * pen;
    const vn = (d.vx - ovx) * nx + (d.vy - ovy) * ny;
    if (vn >= 0) return;
    const imp = -vn;
    const e = imp > 140 ? 0.45 : 0; // appoggiato non rimbalza
    d.vx -= (1 + e) * vn * nx;
    d.vy -= (1 + e) * vn * ny;
    const tx = -ny;
    const ty = nx;
    const vt = (d.vx - ovx) * tx + (d.vy - ovy) * ty;
    const keep = Math.exp(-3 * dt) - 1; // attrito di rotolamento
    d.vx += vt * keep * tx;
    d.vy += vt * keep * ty;
    if (imp > 260) {
      bump(el, nx, ny, imp);
      kick(d, imp);
    }
  };

  const collideRect = (d, o, ovy, dt) => {
    const r = o.r;
    const cx = Math.max(r.left, Math.min(d.x, r.right));
    const cy = Math.max(r.top, Math.min(d.y, r.bottom));
    const dx = d.x - cx;
    const dy = d.y - cy;
    const dist = Math.hypot(dx, dy);
    // Centro dentro l'elemento (all'avvio, dopo un salto di scroll o se schiacciato contro un bordo):
    // lo attraversa invece di restarci incastrato
    if (dist >= d.R || dist <= 1e-6) return;
    const nx = dx / dist;
    const ny = dy / dist;
    // Appoggiato sopra un elemento largo: scivola verso il bordo più vicino…
    let slide = 0;
    if (o.wide && ny < -0.7) {
      const mid = (r.left + r.right) / 2;
      slide = d.x === mid ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(d.x - mid);
      // …e se da quel lato non c'è spazio per cadere (l'elemento arriva al muro), alla fine ci passa attraverso
      const gap = slide < 0 ? r.left - B.left : B.right - r.right;
      const edge = slide < 0 ? r.left : r.right;
      if (gap < d.R * 2 + 4 && Math.abs(d.x - edge) < d.R * 1.6) return;
    }
    resolve(d, nx, ny, d.R - dist, o.el, 0, ovy, dt);
    if (slide) d.vx += slide * SLIDE * dt;
  };

  const collideSeg = (d, o, ovy, dt) => {
    const [ax, ay, bx, by] = o.seg;
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.max(0, Math.min(1, ((d.x - ax) * ex + (d.y - ay) * ey) / (ex * ex + ey * ey)));
    const dx = d.x - (ax + ex * t);
    const dy = d.y - (ay + ey * t);
    const dist = Math.hypot(dx, dy);
    if (dist >= d.R || dist <= 1e-6) return;
    resolve(d, dx / dist, dy / dist, d.R - dist, o.el, 0, ovy, dt);
  };

  // Urti tra dadi (stessa massa)
  const collideDice = () => {
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const a = dice[i];
        const b = dice[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.R + b.R;
        if (dist >= min || dist < 1e-6) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const pen = min - dist;
        const wa = a.grab ? 0 : b.grab ? 1 : 0.5; // il dado preso in mano non si sposta
        const wb = 1 - wa;
        a.x -= nx * pen * wa;
        a.y -= ny * pen * wa;
        b.x += nx * pen * wb;
        b.y += ny * pen * wb;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn >= 0) continue;
        const jmp = -(1 + 0.5) * vn;
        a.vx -= jmp * nx * wa;
        a.vy -= jmp * ny * wa;
        b.vx += jmp * nx * wb;
        b.vy += jmp * ny * wb;
        if (-vn > 200) {
          kick(a, -vn);
          kick(b, -vn);
        }
      }
    }
  };

  const stepDie = (d, dt, ovy) => {
    if (d.grab) return;
    const R = d.R;
    d.vx += G.x * GPX * dt;
    d.vy += G.y * GPX * dt;
    const damp = Math.exp(-0.5 * dt);
    d.vx *= damp;
    d.vy *= damp;
    const ox = d.x;
    const oy = d.y;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    for (const o of obstacles) {
      if (o.seg) collideSeg(d, o, ovy, dt);
      else collideRect(d, o, o.fixed ? 0 : ovy, dt);
    }
    if (d.x < B.left + R) resolve(d, 1, 0, B.left + R - d.x, null, 0, 0, dt, true);
    if (d.x > B.right - R) resolve(d, -1, 0, d.x - (B.right - R), null, 0, 0, dt, true);
    if (d.y < B.top + R) resolve(d, 0, 1, B.top + R - d.y, null, 0, 0, dt, true);
    if (d.y > B.bottom - R) resolve(d, 0, -1, d.y - (B.bottom - R), null, 0, 0, dt, true);
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > 3600) {
      d.vx *= 3600 / sp;
      d.vy *= 3600 / sp;
    }
    d.travel += Math.hypot(d.x - ox, d.y - oy);
  };

  /* ---------- Rotazione e assestamento ---------- */
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const rotate = (d, dt) => {
    // rotolare sul piano: velocità (vx, -vy) → velocità angolare (vy/R, vx/R, 0)
    tmpV.set((d.vy / d.R) * 0.85, (d.vx / d.R) * 0.85, 0).add(d.spin);
    const w = tmpV.length();
    if (w > 1e-4) {
      tmpQ.setFromAxisAngle(tmpV.multiplyScalar(1 / w), w * dt);
      d.mesh.quaternion.premultiply(tmpQ);
    }
    d.spin.multiplyScalar(Math.exp(-1.8 * dt));
  };

  // Gira il dado sulla faccia rivolta verso di noi, con il numero dritto
  const beginSettle = (d) => {
    const faces = kind(d.type).faces;
    const q = d.mesh.quaternion;
    let best = faces[0];
    let bz = -2;
    for (const f of faces) {
      const z = tmpV.copy(f.n).applyQuaternion(q).z;
      if (z > bz) {
        bz = z;
        best = f;
      }
    }
    const nW = best.n.clone().applyQuaternion(q);
    const to = new THREE.Quaternion().setFromUnitVectors(nW, Z).multiply(q);
    const u = best.up.clone().applyQuaternion(to);
    to.premultiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2 - Math.atan2(u.y, u.x)));
    d.settle = { from: q.clone(), to, t: 0, face: best };
  };

  /* ---------- Risultati ---------- */
  const isCrit = (d) => d.value === TYPES[d.type].sides;
  const isFumble = (d) => d.type === "d20" && d.value === 1;
  const popDie = (d) => {
    const p = d.pop;
    p.textContent = d.value;
    p.className = "dice-pop";
    if (isCrit(d)) p.classList.add("is-crit");
    if (isFumble(d)) p.classList.add("is-fumble");
    p.style.setProperty("--at", `translate(${d.x.toFixed(0)}px, ${(d.y - d.R - 30).toFixed(0)}px) translateX(-50%)`);
    void p.offsetWidth; // riavvia l'animazione
    p.classList.add("is-on");
  };

  const groupLabel = () => {
    const counts = {};
    dice.forEach((d) => (counts[d.type] = (counts[d.type] || 0) + 1));
    return ORDER.filter((t) => counts[t]).map((t) => (counts[t] > 1 ? counts[t] : "") + t).join(" + ") || "—";
  };

  const showTotal = () => {
    const total = dice.reduce((s, d) => s + (d.value || 0), 0);
    hudValue.textContent = total;
    const single = dice.length === 1 ? dice[0] : null;
    hudValue.classList.toggle("is-crit", !!single && isCrit(single));
    hudValue.classList.toggle("is-fumble", !!single && isFumble(single));
    hudValue.classList.remove("is-pop");
    void hudValue.offsetWidth;
    hudValue.classList.add("is-pop");
    const parts = ORDER.map((t) => {
      const vals = dice.filter((d) => d.type === t).map((d) => d.value);
      return vals.length ? `${t}: ${vals.join(" + ")}` : "";
    }).filter(Boolean);
    const text = `${parts.join(" · ")} = ${total}`;
    hudValue.title = text;
    if (detail) detail.textContent = text;
  };

  /* ---------- Pannello: aggiungi / togli dadi ---------- */
  const STORE = "df-dice";
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(dice.map((d) => d.type)));
    } catch (e) {}
  };
  const refreshPanel = () => {
    hudSet.textContent = groupLabel();
    if (!panel) return;
    panel.querySelectorAll("[data-type]").forEach((row) => {
      const t = row.dataset.type;
      const n = dice.filter((d) => d.type === t).length;
      row.querySelector("output").textContent = n;
      row.querySelector('[data-act="-"]').disabled = n === 0 || dice.length <= 1;
      row.querySelector('[data-act="+"]').disabled = dice.length >= MAX_DICE;
    });
  };
  if (panel) {
    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const t = btn.closest("[data-type]").dataset.type;
      if (btn.dataset.act === "+" && dice.length < MAX_DICE) addDie(t, rand(B.left + 40, B.right - 40), B.top + 30);
      if (btn.dataset.act === "-" && dice.length > 1) {
        const same = dice.filter((d) => d.type === t);
        if (same.length) removeDie(same[same.length - 1]);
        if (dice.every((d) => d.value != null && d.settled)) showTotal();
      }
      refreshPanel();
      save();
    });
  }
  hudSet.addEventListener("click", () => {
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    hudSet.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (panel && !panel.hidden && !hud.contains(e.target)) {
      panel.hidden = true;
      hudSet.setAttribute("aria-expanded", "false");
    }
  });

  /* ---------- Lancio ---------- */
  const throwDie = (d, dx, dy) => {
    if (dx == null) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dy = sensorsOn ? Math.sin(a) : rand(-1.2, -0.6);
    }
    const l = Math.hypot(dx, dy) || 1;
    const sp = rand(1300, 2200);
    d.vx = (dx / l) * sp;
    d.vy = (dy / l) * sp;
    d.spin.set(rand(-15, 15), rand(-15, 15), rand(-10, 10));
    d.settled = false;
    d.settle = null;
    d.still = 0;
    d.thrown = true;
  };
  const throwAll = (dx, dy) => {
    dice.forEach((d) => throwDie(d, dx == null ? null : dx + rand(-0.4, 0.4), dy == null ? null : dy + rand(-0.4, 0.4)));
    rolling = true;
  };
  btnRoll.addEventListener("click", () => throwAll());

  /* ---------- Trascina e lancia ---------- */
  const nearest = (x, y) => {
    let best = null;
    let bd = Infinity;
    for (const d of dice) {
      const dist = Math.hypot(x - d.x, y - d.y);
      if (dist <= d.R * 1.7 && dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  };
  let swallowClick = false;
  // Su touch impedisce lo scroll solo quando il dito prende un dado
  addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (t && e.touches.length === 1 && !hud.contains(e.target) && nearest(t.clientX, t.clientY)) e.preventDefault();
    },
    { passive: false, capture: true }
  );
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.button > 0 || hud.contains(e.target)) return;
      const d = nearest(e.clientX, e.clientY);
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      swallowClick = true;
      d.grab = { id: e.pointerId, ox: d.x - e.clientX, oy: d.y - e.clientY, trail: [[e.clientX, e.clientY, performance.now()]] };
      d.settled = false;
      d.settle = null;
      d.vx = d.vy = 0;
    },
    { capture: true, passive: false }
  );
  addEventListener("pointermove", (e) => {
    const d = dice.find((x) => x.grab && x.grab.id === e.pointerId);
    if (!d) return;
    const g = d.grab;
    const now = performance.now();
    const prev = g.trail[g.trail.length - 1];
    const dtm = Math.max(1, now - prev[2]) / 1000;
    const nx = Math.min(Math.max(e.clientX + g.ox, B.left + d.R), B.right - d.R);
    const ny = Math.min(Math.max(e.clientY + g.oy, B.top + d.R), B.bottom - d.R);
    d.vx = d.vx * 0.5 + ((nx - d.x) / dtm) * 0.5;
    d.vy = d.vy * 0.5 + ((ny - d.y) / dtm) * 0.5;
    d.travel += Math.hypot(nx - d.x, ny - d.y);
    d.x = nx;
    d.y = ny;
    g.trail.push([e.clientX, e.clientY, now]);
    if (g.trail.length > 6) g.trail.shift();
  });
  const release = (e) => {
    const d = dice.find((x) => x.grab && x.grab.id === e.pointerId);
    if (!d) return;
    const g = d.grab;
    const now = performance.now();
    const old = g.trail.find((p) => now - p[2] < 120) || g.trail[0];
    const dtm = Math.max(16, now - old[2]) / 1000;
    let vx = (e.clientX - old[0]) / dtm;
    let vy = (e.clientY - old[1]) / dtm;
    const sp = Math.hypot(vx, vy);
    if (sp > 3600) {
      vx *= 3600 / sp;
      vy *= 3600 / sp;
    }
    d.vx = vx;
    d.vy = vy;
    d.grab = null;
    d.thrown = sp > 300;
    if (d.thrown) rolling = true;
    d.spin.set(rand(-0.5, 0.5) * (sp / 90), rand(-0.5, 0.5) * (sp / 90), rand(-0.5, 0.5) * (sp / 140));
  };
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);
  addEventListener(
    "click",
    (e) => {
      if (swallowClick) {
        e.stopPropagation();
        e.preventDefault();
        swallowClick = false;
      }
    },
    true
  );

  /* ---------- Sensori (giroscopio e scuotimento) ---------- */
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && btnSensors) btnSensors.hidden = false;
  let lastShake = 0;
  const screenAngle = () => {
    const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    return (a * Math.PI) / 180;
  };
  const toScreen = (dx, dy) => {
    // assi del dispositivo (x destra, y giù) → assi dello schermo
    const a = screenAngle();
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  };
  const onOrient = (e) => {
    if (e.beta == null || e.gamma == null) return;
    if (!sensorsOn) {
      sensorsOn = true;
      if (btnSensors) {
        btnSensors.classList.add("is-on");
        btnSensors.setAttribute("aria-label", "Giroscopio attivo");
      }
    }
    const b = (e.beta * Math.PI) / 180;
    const g = (e.gamma * Math.PI) / 180;
    // direzione del "giù" proiettata sul piano dello schermo
    const t = toScreen(Math.sin(g) * Math.cos(b), Math.sin(b));
    G.x += (t.x - G.x) * 0.3;
    G.y += (t.y - G.y) * 0.3;
  };
  const onMotion = (e) => {
    const a = e.acceleration;
    if (!a || a.x == null) return;
    const now = performance.now();
    if (Math.hypot(a.x, a.y, a.z) > 15 && now - lastShake > 700) {
      lastShake = now;
      const s = toScreen(a.x, -a.y);
      throwAll(s.x, s.y);
    }
  };
  const listenSensors = () => {
    addEventListener("deviceorientation", onOrient);
    addEventListener("devicemotion", onMotion);
  };
  // Android: funziona subito. iPhone: serve il permesso (pulsante 🧭)
  const needsPermission =
    window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function";
  if (!needsPermission) listenSensors();
  if (btnSensors) {
    btnSensors.addEventListener("click", async () => {
      try {
        if (needsPermission) {
          if ((await DeviceOrientationEvent.requestPermission()) !== "granted") throw new Error("denied");
          if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === "function") {
            await DeviceMotionEvent.requestPermission().catch(() => {});
          }
          listenSensors();
        }
      } catch (err) {
        btnSensors.setAttribute("aria-label", "Permesso giroscopio negato");
        btnSensors.textContent = "🚫";
        return;
      }
      setTimeout(() => {
        if (!sensorsOn) {
          btnSensors.textContent = "🚫";
          btnSensors.setAttribute("aria-label", "Giroscopio non disponibile");
        }
      }, 1500);
    });
  }

  /* ---------- Avvio ---------- */
  addEventListener("resize", resize);
  resize();
  const updateBounds = () => {
    B.left = wall;
    B.right = W - wall;
    B.top = Math.max(0, nav ? nav.getBoundingClientRect().bottom : 0);
    B.bottom = H;
  };
  updateBounds();
  let initial = ["d20"];
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (Array.isArray(saved) && saved.length) initial = saved.filter((t) => TYPES[t]).slice(0, MAX_DICE);
  } catch (e) {}
  if (!initial.length) initial = ["d20"];
  initial.forEach((t, i) => addDie(t, W / 2 + (i - (initial.length - 1) / 2) * BASE * 2.6, B.top + 60));
  refreshPanel();

  /* ---------- Ciclo ---------- */
  let prev = performance.now();
  let lastScroll = window.scrollY;

  const frame = (now) => {
    const dt = Math.min(0.033, (now - prev) / 1000);
    prev = now;

    // Velocità dello scroll → velocità con cui gli elementi si muovono sullo schermo
    const sy = window.scrollY;
    const ovy = dt > 0 ? Math.max(-2500, Math.min(2500, -(sy - lastScroll) / dt)) : 0;
    lastScroll = sy;

    // Tutti fermi, senza scroll e senza giroscopio: niente da calcolare
    const idle = !dirty && !sensorsOn && ovy === 0 && dice.every((d) => d.settled && !d.grab);
    if (!idle) {
      updateBounds();
      readObstacles();
      const SUB = 4;
      for (let i = 0; i < SUB; i++) {
        for (const d of dice) stepDie(d, dt / SUB, ovy);
        collideDice();
      }

      for (const d of dice) {
        const speed = Math.hypot(d.vx, d.vy);
        if (d.settle) {
          d.settle.t += dt;
          const k = Math.min(1, d.settle.t / 0.28);
          d.mesh.quaternion.copy(d.settle.from).slerp(d.settle.to, 1 - Math.pow(1 - k, 3));
          if (speed > 160 || d.grab) d.settle = null;
          else if (k >= 1) {
            d.value = d.settle.face.value;
            d.settle = null;
            d.settled = true;
            if (d.travel > d.R * 3 || d.thrown) {
              popDie(d);
              rolling = true;
            }
            d.travel = 0;
            d.thrown = false;
          }
        } else if (d.settled) {
          if (speed > 160 || d.grab) {
            d.settled = false;
            d.still = 0;
          }
        } else {
          rotate(d, dt);
          if (!d.grab && speed < 24 && d.spin.length() < 1) {
            d.still += dt;
            if (d.still > 0.3) beginSettle(d);
          } else d.still = 0;
        }
        d.mesh.position.set(d.x - W / 2, H / 2 - d.y, 0);
        d.shadow.style.transform = `translate3d(${(d.x - d.R * 1.1 + 5).toFixed(1)}px, ${(d.y - d.R * 1.1 + 8).toFixed(1)}px, 0)`;
      }

      // Tutti fermi dopo un tiro: somma
      if (rolling && dice.every((d) => d.settled && d.value != null)) {
        rolling = false;
        showTotal();
      }

      renderer.render(scene, camera);
      dirty = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();

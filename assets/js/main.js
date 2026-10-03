// Navigazione: sfondo allo scroll e menu mobile
const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav__toggle");

const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", open);
});
document.querySelectorAll(".nav__links a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  })
);

// Animazione di comparsa allo scroll
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 90}ms`;
  io.observe(el);
});

// Braci che salgono dallo sfondo
const embers = document.querySelector(".embers");
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (let i = 0; i < 22; i++) {
    const s = document.createElement("i");
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDuration = `${8 + Math.random() * 10}s`;
    s.style.animationDelay = `${Math.random() * 12}s`;
    s.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    const size = 2 + Math.random() * 3;
    s.style.width = s.style.height = `${size}px`;
    embers.appendChild(s);
  }
}

// Lightbox foto eventi
const lightbox = document.querySelector(".lightbox");
const lbImg = lightbox.querySelector("img");
const closeLb = () => (lightbox.hidden = true);
document.querySelectorAll(".story__photo").forEach((item) =>
  item.addEventListener("click", () => {
    lbImg.src = item.dataset.full;
    lbImg.alt = item.querySelector("img").alt;
    lightbox.hidden = false;
  })
);
lightbox.addEventListener("click", (e) => {
  if (e.target !== lbImg) closeLb();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLb();
});

document.getElementById("year").textContent = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Dice tower: il d20 cade lungo la pagina, rotola sulle rampe e atterra nel vassoio.
//
// Lo scroll stabilisce *dove* il dado dovrebbe essere; il dado ci arriva muovendosi
// lungo il percorso con una piccola fisica (molla + velocità massima), così non
// "schizza" sulle rampe ma rotola a velocità regolare, rallentando quando arriva.
// ---------------------------------------------------------------------------
(() => {
  const die = document.querySelector(".die20");
  const felt = document.querySelector(".tray__felt");
  if (!die || !felt) return;
  const squash = die.querySelector(".die20__squash");
  const body = die.querySelector(".die20__body");
  const num = die.querySelector(".die20__num");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Faccia mostrata dopo ogni ribaltamento (dipende dall'angolo, quindi tornando su è la stessa)
  const ROLLS = [7, 13, 4, 17, 9, 2, 15, 11, 6, 19, 3, 12, 8, 16, 5, 18, 1, 14, 10];
  const STEP = 60; // un d20 visto di profilo è un esagono: si ribalta di 60° alla volta
  const SPIN = 0.3; // gradi per pixel mentre cade

  let segs = [];
  let total = 0;
  let startY = 0;
  let endY = 0;
  let size = 0;
  let vw = 0;

  // Ribaltamento "a scatti": resta quasi fermo su una faccia, poi si inclina sullo spigolo e cade sulla successiva
  const tumble = (deg) => {
    const q = deg / STEP;
    const i = Math.floor(q);
    const f = q - i;
    const e = f * f * f * (f * (f * 6 - 15) + 10); // smootherstep
    return (i + e) * STEP;
  };

  // Percorso: caduta → rotola sulla rampa → cade dal buco in fondo → rampa successiva … → vassoio
  const build = () => {
    size = die.offsetWidth;
    const r = size / 2;
    vw = document.documentElement.clientWidth;
    const sy = window.scrollY;
    const inset = Math.max(r + 14, (vw - 1180) / 4); // nel margine laterale quando c'è spazio
    const baffles = [...document.querySelectorAll(".baffle")];
    const pts = []; // ogni punto dice anche che tipo di tratto porta fino a lui

    const firstLtr = (baffles[0]?.dataset.dir || "ltr") === "ltr";
    startY = window.innerHeight * 0.5;
    pts.push({ x: firstLtr ? inset : vw - inset, y: startY });

    baffles.forEach((b) => {
      const rc = b.getBoundingClientRect();
      const ltr = b.dataset.dir !== "rtl";
      // Bordo superiore della rampa: dal 6% al 70% dell'altezza (vedi SVG in index.html)
      const edge = (x) => {
        const f = (x - rc.left) / rc.width;
        return rc.top + sy + rc.height * (0.06 + 0.64 * (ltr ? f : 1 - f));
      };
      // La rampa copre l'88% della larghezza: in fondo resta il buco da cui il dado cade
      const xa = ltr ? inset : vw - inset;
      const xEnd = ltr ? rc.left + rc.width * 0.88 - r * 0.4 : rc.left + rc.width * 0.12 + r * 0.4;
      const xb = ltr ? vw - inset : inset;
      const lift = r * 1.05;
      pts.push({ x: xa, y: edge(xa) - lift, type: "fall" });
      pts.push({ x: xEnd, y: edge(xEnd) - lift, type: "roll" });
      pts.push({ x: xb, y: edge(xEnd) - lift + r * 1.4, type: "fall" });
    });

    // Atterraggio nel vassoio
    const fr = felt.getBoundingClientRect();
    const ty = fr.top + sy + fr.height * 0.4;
    pts.push({ x: pts[pts.length - 1].x, y: ty - 40, type: "fall" });
    pts.push({ x: fr.left + fr.width / 2, y: ty, type: "settle" });
    endY = ty;

    // La posizione obiettivo si ricava dalla Y: il percorso deve sempre scendere
    for (let i = 1; i < pts.length; i++) if (pts[i].y <= pts[i - 1].y) pts[i].y = pts[i - 1].y + 1;

    const rollK = 360 / (Math.PI * size); // gradi per pixel di rotolamento
    segs = [];
    let s0 = 0;
    let ang = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const len = Math.hypot(dx, b.y - a.y);
      const type = b.type;
      const k = type === "roll" ? rollK * Math.sign(dx) : type === "settle" ? rollK * Math.sign(dx || 1) : SPIN * (i % 2 ? 1 : -1);
      const seg = { a, b, len, type, k, s0, ang0: ang };
      segs.push(seg);
      s0 += len;
      ang += type === "roll" ? tumble(len * k) : len * k;
    }
    total = s0;
    // Nel vassoio il dado si ferma dritto, con il 20 leggibile
    const settle = segs[segs.length - 1];
    settle.k = (Math.round(ang / 360) * 360 - settle.ang0) / settle.len;
  };

  // Da Y (obiettivo dello scroll) a distanza lungo il percorso
  const yToS = (y) => {
    for (const g of segs) {
      if (y <= g.b.y) return g.s0 + g.len * Math.min(1, Math.max(0, (y - g.a.y) / (g.b.y - g.a.y)));
    }
    return total;
  };
  const segAt = (s) => {
    for (let i = 0; i < segs.length; i++) if (s <= segs[i].s0 + segs[i].len) return i;
    return segs.length - 1;
  };
  // Velocità massima per tipo di tratto (px/s): rotola piano, cade veloce
  const maxSpeed = (type) =>
    type === "roll" ? Math.min(750, Math.max(380, vw * 0.55)) : type === "settle" ? 420 : 1700;

  let s = null; // posizione lungo il percorso
  let v = 0; // velocità lungo il percorso
  let last = performance.now();
  let lastSeg = -1;
  let hopT = Infinity;
  let hopA = 0;
  let shown = "";

  const frame = (now) => {
    const frameDt = Math.min(0.05, (now - last) / 1000);
    let dt = frameDt;
    last = now;
    if (!segs.length) build();

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    const sT = yToS(startY + p * (endY - startY));

    if (s === null || still) {
      s = sT;
      v = 0;
    } else {
      // Molla smorzata verso l'obiettivo, con velocità limitata (sottopassi per stabilità)
      const K = 26;
      const C = 2 * Math.sqrt(K);
      while (dt > 0) {
        const h = Math.min(dt, 1 / 120);
        dt -= h;
        const diff = sT - s;
        const g = segs[segAt(s)];
        // Se il dado è rimasto molto indietro (salto con un link) può andare più veloce
        const vmax = maxSpeed(g.type) * (1 + Math.max(0, Math.abs(diff) - 1500) / 1000);
        v += (K * diff - C * v) * h;
        v = Math.max(-vmax, Math.min(vmax, v));
        s = Math.max(0, Math.min(total, s + v * h));
      }
    }

    const i = segAt(s);
    const g = segs[i];
    const t = g.len ? (s - g.s0) / g.len : 0;
    const x = g.a.x + (g.b.x - g.a.x) * t;
    const y = g.a.y + (g.b.y - g.a.y) * t;
    const rel = (s - g.s0) * g.k;
    const angle = g.ang0 + (g.type === "roll" ? tumble(rel) : rel);

    // Impatto con una rampa o col vassoio: schiacciamento + piccolo rimbalzo
    if (i !== lastSeg && lastSeg !== -1 && !still && i > lastSeg && g.type !== "fall" && v > 150) {
      hopT = 0;
      hopA = Math.min(size * 0.35, v * 0.02);
      squash.animate([{ transform: "scale(1.18, 0.82)" }, { transform: "scale(0.96, 1.04)" }, { transform: "scale(1)" }], {
        duration: 320,
        easing: "ease-out",
      });
    }
    lastSeg = i;
    hopT += frameDt;
    const hop = hopT < 1 ? -hopA * Math.abs(Math.sin(hopT * 14)) * Math.exp(-hopT * 7) : 0;

    const r = size / 2;
    die.style.transform = `translate3d(${(x - r).toFixed(1)}px, ${(y - r + hop).toFixed(1)}px, 0)`;
    body.style.transform = `rotate(${angle.toFixed(1)}deg)`;

    const landed = s >= total - 1 && Math.abs(v) < 40;
    const face = ROLLS[Math.abs(Math.round(angle / STEP)) % ROLLS.length];
    const value = landed ? "20" : String(face);
    if (value !== shown) num.textContent = shown = value;
    die.classList.toggle("is-landed", landed);
    felt.classList.toggle("is-crit", landed);

    requestAnimationFrame(frame);
  };

  window.addEventListener("load", build);
  window.addEventListener("resize", build);
  // Ricalcola quando cambia l'altezza della pagina (immagini, calendario caricato…)
  new ResizeObserver(build).observe(document.body);
  requestAnimationFrame(frame);
})();

// ---------------------------------------------------------------------------
// Prossimi eventi da Google Calendar
// ---------------------------------------------------------------------------
(() => {
  const box = document.getElementById("calendar");
  if (!box) return;
  const { googleCalendarId: id = "", googleApiKey: key = "", maxEvents = 6 } = window.DF_CONFIG || {};
  const tz = "Europe/Rome";
  const insta = '<a href="https://www.instagram.com/dragonfist.club/" target="_blank" rel="noopener">Instagram</a>';
  const wa = '<a href="https://chat.whatsapp.com/KNVJ56EsfvCIpdMg19fBOC" target="_blank" rel="noopener">WhatsApp</a>';

  const status = (html) => (box.innerHTML = `<p class="calendar__status">${html}</p>`);

  if (!id) {
    status(`Il calendario degli eventi arriva presto! 🐉<br>Nel frattempo trovi le prossime date su ${insta} e ${wa}.`);
    return;
  }

  const subscribe = document.getElementById("cal-subscribe");
  const full = document.getElementById("cal-full");
  subscribe.href = `https://calendar.google.com/calendar/u/0?cid=${btoa(id).replace(/=+$/, "")}`;
  full.href = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(id)}&ctz=${encodeURIComponent(tz)}&hl=it`;
  subscribe.hidden = full.hidden = false;

  // Senza chiave API: calendario Google incorporato
  if (!key) {
    const src =
      `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(id)}` +
      `&ctz=${encodeURIComponent(tz)}&hl=it&mode=AGENDA&showTitle=0&showPrint=0&showTabs=1&showCalendars=0&showTz=0`;
    box.innerHTML = `<iframe class="calendar__embed" title="Calendario eventi DragonFist Club" src="${src}" loading="lazy"></iframe>`;
    return;
  }

  // Con chiave API: lista eventi con la grafica del sito
  const esc = (s = "") =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const plain = (html = "") => {
    // DOMParser non esegue script né carica immagini della descrizione
    const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, " "), "text/html");
    const t = doc.body.textContent.trim();
    return t.length > 160 ? t.slice(0, 157).trimEnd() + "…" : t;
  };
  const fmt = (date, opts) => new Intl.DateTimeFormat("it-IT", { timeZone: tz, ...opts }).format(date);

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events` +
    `?key=${encodeURIComponent(key)}&singleEvents=true&orderBy=startTime` +
    `&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=${maxEvents}&timeZone=${tz}`;

  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(({ items = [] }) => {
      if (!items.length) {
        status(`Nessun evento in programma al momento. Seguici su ${insta} per non perdere le prossime date!`);
        return;
      }
      box.innerHTML = items
        .map((ev) => {
          const allDay = !ev.start.dateTime;
          const start = new Date(ev.start.dateTime || `${ev.start.date}T12:00:00`);
          const end = ev.end && ev.end.dateTime ? new Date(ev.end.dateTime) : null;
          const weekday = fmt(start, { weekday: "long" });
          const time = allDay
            ? "Tutto il giorno"
            : fmt(start, { hour: "2-digit", minute: "2-digit" }) + (end ? ` – ${fmt(end, { hour: "2-digit", minute: "2-digit" })}` : "");
          const desc = plain(ev.description);
          return `
            <article class="event">
              <div class="event__date">
                <span class="event__day">${fmt(start, { day: "numeric" })}</span>
                <span class="event__month">${fmt(start, { month: "short" }).replace(".", "")}</span>
              </div>
              <div class="event__body">
                <h3>${esc(ev.summary || "Serata DragonFist")}</h3>
                <p class="event__meta">${esc(weekday)} · ${esc(time)}${ev.location ? ` · 📍 ${esc(ev.location)}` : ""}</p>
                ${desc ? `<p class="event__desc">${esc(desc)}</p>` : ""}
                <a class="event__link" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener">Salva nel calendario →</a>
              </div>
            </article>`;
        })
        .join("");
    })
    .catch(() => status(`Non riesco a caricare il calendario in questo momento. Trovi le prossime date su ${insta}.`));
})();

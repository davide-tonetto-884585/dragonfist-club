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
// Rampe della torre: disegnate in pixel reali, così sono ben inclinate e con
// spessore costante. Il bordo superiore (el.baffleEdge) lo usa dice.js.
// ---------------------------------------------------------------------------
(() => {
  const draw = (el) => {
    const svg = el.querySelector("svg");
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (!svg || !W || !H) return;
    const ltr = el.dataset.dir !== "rtl";
    const T = W < 560 ? 18 : 26; // spessore della tavola
    const L = W * 0.86; // in fondo resta il buco da cui cadono i dadi
    const y0 = 8;
    const y1 = H - T - 8;
    const X = (x) => (ltr ? x : W - x);
    const pts = (list) => list.map(([x, y]) => `${X(x).toFixed(1)},${y.toFixed(1)}`).join(" ");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <polygon points="${pts([[0, y0], [L, y1], [L, y1 + T], [0, y0 + T]])}" fill="url(#plank)"/>
      <polyline points="${pts([[0, y0 + T * 0.35], [L, y1 + T * 0.35]])}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1"/>
      <polyline points="${pts([[0, y0 + T * 0.68], [L, y1 + T * 0.68]])}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      <polyline points="${pts([[0, y0 + T], [L, y1 + T]])}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3"/>
      <polyline points="${pts([[0, y0], [L, y1], [L, y1 + T]])}" fill="none" stroke="#fae003" stroke-width="2.5" stroke-linejoin="round"/>`;
    el.baffleEdge = [X(0), y0, X(L), y1];
  };
  const ro = new ResizeObserver((entries) => entries.forEach((e) => draw(e.target)));
  document.querySelectorAll(".baffle").forEach((b) => {
    draw(b);
    ro.observe(b);
  });
})();

// ---------------------------------------------------------------------------
// Vassoio in fondo alla pagina: due rampe a imbuto dai bordi dello schermo fino al
// vassoio. La geometria (el.trayGeom, in px relativi alla zona) la usa dice.js.
// ---------------------------------------------------------------------------
(() => {
  const zone = document.querySelector(".tray-zone");
  if (!zone) return;
  const svg = zone.querySelector(".tray-zone__funnel");
  const tray = zone.querySelector(".tray");
  const felt = zone.querySelector(".tray__felt");
  const draw = () => {
    const z = zone.getBoundingClientRect();
    if (!z.width) return;
    const t = tray.getBoundingClientRect();
    const f = felt.getBoundingClientRect();
    const T = z.width < 560 ? 16 : 22; // spessore delle tavole
    const top = 10;
    const fl = { l: f.left - z.left, t: t.top - z.top, r: f.right - z.left, b: f.bottom - z.top };
    // bordo superiore delle due rampe: dal bordo dello schermo fino all'interno del vassoio
    const left = [0, top, fl.l, fl.t];
    const right = [z.width, top, fl.r, fl.t];
    const plank = ([x0, y0, x1, y1]) =>
      `<polygon points="${x0},${y0} ${x1},${y1} ${x1},${y1 + T} ${x0},${y0 + T}" fill="url(#plank)"/>
       <polyline points="${x0},${y0 + T} ${x1},${y1 + T}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3"/>
       <polyline points="${x0},${y0} ${x1},${y1}" fill="none" stroke="#fae003" stroke-width="2.5"/>`;
    svg.setAttribute("viewBox", `0 0 ${z.width} ${z.height}`);
    svg.innerHTML = plank(left) + plank(right);
    zone.trayGeom = { funnels: [left, right], felt: fl };
  };
  new ResizeObserver(draw).observe(zone);
  addEventListener("load", draw);
  draw();
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

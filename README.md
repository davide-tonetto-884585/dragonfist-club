# DragonFist Club APS – sito web

Sito statico (HTML/CSS/JS, nessuna build) dell'associazione ludica **DragonFist Club APS** di Scorzè (VE).

## Struttura

```
index.html            pagina unica
assets/css/style.css  stile (colori in :root)
assets/js/config.js   ⚙️ impostazioni del calendario Google
assets/js/main.js     menu mobile, rampe, calendario, lightbox
assets/js/dice.js     dadi 3D con gravità, collisioni, somma e giroscopio
assets/img/           logo, foto e locandine (da Instagram @dragonfist.club)
```

## Pubblicare su GitHub Pages

1. Crea un repository su GitHub (es. `dragonfist-club`).
2. Dalla cartella del progetto:
   ```bash
   git init && git add . && git commit -m "Sito DragonFist Club"
   git branch -M main
   git remote add origin https://github.com/<utente>/dragonfist-club.git
   git push -u origin main
   ```
3. Su GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
4. Dopo un minuto il sito è online su `https://<utente>.github.io/dragonfist-club/`.

## I dadi (dice thrower)

Dadi 3D (three.js, `assets/js/dice.js`) che cadono per gravità e rimbalzano sugli
elementi del sito: scorrendo, titoli, schede, rampe di legno e la barra dei dadi
li colpiscono (le foto no). In fondo alla pagina un imbuto li porta nel vassoio.

- Dal pannello in basso a sinistra (clic sull'etichetta tipo "d20 + 2d6") si aggiungono
  e tolgono d4, d6, d8, d10, d12, d20 (max 10). La scelta resta salvata nel browser.
- Quando tutti i dadi si fermano compare la somma, con il dettaglio nel pannello.
- Si trascinano e si lanciano; da telefono la gravità segue il giroscopio
  (su iPhone serve toccare 🧭 per dare il permesso) e scuotendo il telefono si lanciano.
- Quali elementi sono ostacoli: lista `SOLID` in `dice.js`, oppure aggiungi
  l'attributo `data-solid` a un elemento.
- Le rampe (`<div class="baffle">`) sono disegnate da `main.js`; alterna `data-dir="ltr"` / `"rtl"`.
  Inclinazione: altezza `.baffle` in `style.css`.
- Colori e dimensioni dei dadi: `TYPES` e `BASE` in `dice.js`.

## Collegare Google Calendar (sezione "Prossimi eventi")

1. Su [calendar.google.com](https://calendar.google.com) crea un calendario dedicato
   (es. "DragonFist Club eventi") e inserisci lì serate ed eventi.
   Titolo, orario, luogo e descrizione dell'evento vengono mostrati sul sito.
2. **Impostazioni del calendario → Autorizzazioni di accesso agli eventi** →
   spunta *"Rendi disponibile pubblicamente"* (con "Mostra tutti i dettagli dell'evento").
3. **Impostazioni del calendario → Integra calendario** → copia l'**ID calendario**
   (tipo `xxxx@group.calendar.google.com`) e incollalo in `assets/js/config.js`
   come `googleCalendarId`.

Basta questo: il sito mostra il calendario Google incorporato (vista "Programma")
e i pulsanti *Aggiungi a Google Calendar* / *Vedi calendario completo*.

### Opzionale: lista eventi con la grafica del sito

Per avere le "card" in stile DragonFist invece del riquadro di Google serve una chiave API gratuita:

1. Vai su [console.cloud.google.com](https://console.cloud.google.com), crea un progetto.
2. **API e servizi → Libreria** → abilita **Google Calendar API**.
3. **API e servizi → Credenziali → Crea credenziali → Chiave API**.
4. Limita la chiave: *Limitazioni applicazione → Referrer HTTP* →
   `https://<utente>.github.io/*` e *Limitazioni API → Google Calendar API*.
   (La chiave è visibile nel codice del sito: per questo va limitata così.)
5. Incollala in `assets/js/config.js` come `googleApiKey`.

## Aggiornare i contenuti

- **Prossimi eventi**: si aggiornano da soli dal Google Calendar, non serve toccare il sito.
- **Eventi fatti**: copia un blocco `<article class="story__item">` nella sezione `#eventi`
  di `index.html`, cambia foto, data e testo. Per locandine quadrate aggiungi
  la classe `story__photo--poster`. Gli eventi senza foto vanno nella lista "E ancora…".
- **Foto**: mettile in `assets/img/` (meglio JPG ≤ 300 KB).
- **Logo**: `assets/img/logo.jpg` è a 150×150 px (preso da Instagram); se hai il file
  originale ad alta risoluzione sostituiscilo con lo stesso nome.

## Dopo ogni modifica

In `index.html` aumenta il numero `?v=1` → `?v=2` sui file CSS/JS che hai cambiato
(anche `config.js`), così i browser scaricano subito la versione nuova.

## Anteprima in locale

```bash
python3 -m http.server 8000
```
poi apri http://localhost:8000

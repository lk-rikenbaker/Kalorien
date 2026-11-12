# Kalorienzähler 🎤

Eine Web-App (PWA), mit der du deine Mahlzeiten **einsprichst** – die App berechnet daraus die Kalorien
(plus Eiweiß, Kohlenhydrate und Fett) und führt ein Tagebuch.

## Funktionen

- **Spracheingabe auf Deutsch** (Web Speech API) – z. B. „Zwei Scheiben Vollkornbrot mit Butter und eine Tasse Kaffee mit Milch“
- **Kalorienschätzung mit Claude** (optional, mit eigenem Anthropic-API-Schlüssel): versteht beliebige Gerichte und Mengenangaben
- **Offline-Datenbank** mit über 120 gängigen Lebensmitteln als Ausweichlösung – funktioniert ohne Schlüssel und ohne Internet
- Tagesübersicht mit Tagesziel, Fortschrittsbalken und Makronährstoffen
- Tagebuch nach Mahlzeiten (Frühstück, Mittag, Abend, Snack), Einträge löschbar, Vor-/Zurückblättern zwischen Tagen
- Daten-Export als JSON
- Installierbar auf dem Handy („Zum Startbildschirm hinzufügen“), offlinefähig

## Schnellstart: eine einzige Datei

**`kalorien.html`** herunterladen und per Doppelklick im Browser öffnen – fertig. Kein Server, keine Installation.
Die Datei enthält die komplette App (Design, Logik, Lebensmitteldatenbank, Claude-Anbindung).

Neu erzeugen nach Änderungen am Code: `npm install && npm run build:single`

> Spracheingabe aus einer lokalen Datei: In Chrome und Edge klappt das (Mikrofon-Freigabe bestätigen).
> Safari erlaubt das Mikrofon bei lokalen Dateien teils nicht – dann die Server-Variante unten nutzen.
> Der Offline-Cache und „Zum Startbildschirm hinzufügen“ gibt es nur in der Server-Variante.

## Starten mit Webserver

Die App ist rein statisch – einfach den Ordner über einen Webserver ausliefern:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Für die Spracheingabe braucht der Browser Mikrofonzugriff und eine sichere Verbindung (HTTPS oder `localhost`).
Unterstützt in Chrome, Edge und Safari (Firefox hat keine Spracherkennung).
Zum Nutzen auf dem Handy z. B. über GitHub Pages veröffentlichen.

## Claude aktivieren (empfohlen)

1. API-Schlüssel unter <https://console.anthropic.com> erstellen.
2. In der App auf ⚙︎ tippen und den Schlüssel eintragen.

Der Schlüssel wird nur im `localStorage` deines Browsers gespeichert und direkt an `api.anthropic.com` gesendet.
Die App ist deshalb für die **private Nutzung** gedacht – nicht mit eingetragenem Schlüssel an andere weitergeben.
Ohne Schlüssel (oder wenn die API nicht erreichbar ist) rechnet die App mit der Offline-Datenbank.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css` | Oberfläche (hell/dunkel) |
| `js/app.js` | Logik: Spracheingabe, Tagebuch, Speicherung |
| `js/claude.js` | Kalorienschätzung über die Claude API (strukturierte JSON-Ausgabe) |
| `js/parser.js`, `js/foods.js` | Offline-Erkennung von Mengen und Lebensmitteln + Nährwertdatenbank |
| `js/vendor/anthropic-sdk.js` | Gebündeltes Anthropic-SDK für den Browser (`npm install && npm run build:vendor`) |
| `sw.js`, `manifest.webmanifest` | PWA / Offline-Cache |
| `build-single.mjs` → `kalorien.html` | Baut alles zu einer einzigen, eigenständigen HTML-Datei |

Alle Nährwerte sind Schätzungen und ersetzen keine Ernährungsberatung.

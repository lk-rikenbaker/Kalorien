import { estimateOffline } from "./parser.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "kalorien.entries.v1";
const SETTINGS_KEY = "kalorien.settings.v1";

// ---------- Speicher ----------
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    setStatus("Speichern im Browser nicht möglich.", true);
  }
}

let entries = load(STORE_KEY, []);
let settings = { goal: 2000, apiKey: "", ...load(SETTINGS_KEY, {}) };
let currentDate = todayISO();
let pending = null; // aktuelles, noch nicht gespeichertes Ergebnis

function todayISO(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function shiftDate(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return todayISO(d);
}
function formatDate(iso) {
  const today = todayISO();
  if (iso === today) return "Heute";
  if (iso === shiftDate(today, -1)) return "Gestern";
  return new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}
const fmt = (n) => Math.round(n).toLocaleString("de-DE");
const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function guessMealType() {
  const h = new Date().getHours();
  if (h < 11) return "Frühstück";
  if (h < 15) return "Mittagessen";
  if (h >= 17 && h < 22) return "Abendessen";
  return "Snack";
}

// ---------- Anzeige ----------
function render() {
  const day = entries.filter((e) => e.date === currentDate);
  const items = day.flatMap((e) => e.items);
  const total = sum(items, "kcal");

  $("dateLabel").textContent = formatDate(currentDate);
  $("nextDay").disabled = currentDate >= todayISO();
  $("totalKcal").textContent = fmt(total);
  $("totalProtein").textContent = fmt(sum(items, "protein"));
  $("totalCarbs").textContent = fmt(sum(items, "carbs"));
  $("totalFat").textContent = fmt(sum(items, "fat"));

  const pct = settings.goal ? total / settings.goal : 0;
  $("progressBar").style.width = `${Math.min(100, pct * 100)}%`;
  $("progressBar").classList.toggle("over", pct > 1);
  const rest = settings.goal - total;
  $("goalText").textContent = rest >= 0
    ? `Noch ${fmt(rest)} kcal bis zum Tagesziel von ${fmt(settings.goal)} kcal`
    : `${fmt(-rest)} kcal über dem Tagesziel von ${fmt(settings.goal)} kcal`;

  const log = $("log");
  log.replaceChildren();
  if (!day.length) {
    log.innerHTML = '<p class="muted">Noch keine Einträge an diesem Tag.</p>';
    return;
  }
  for (const meal of ["Frühstück", "Mittagessen", "Abendessen", "Snack"]) {
    const group = day.filter((e) => e.meal === meal);
    if (!group.length) continue;
    const wrap = document.createElement("div");
    wrap.className = "meal-group";
    const h = document.createElement("h3");
    h.innerHTML = `<span></span><span></span>`;
    h.children[0].textContent = meal;
    h.children[1].textContent = `${fmt(sum(group.flatMap((e) => e.items), "kcal"))} kcal`;
    wrap.append(h);
    for (const entry of group) {
      for (const item of entry.items) {
        const row = document.createElement("div");
        row.className = "entry";
        const text = document.createElement("div");
        text.className = "text";
        text.innerHTML = `<div></div><div class="muted small"></div>`;
        text.children[0].textContent = item.name;
        text.children[1].textContent = item.amount;
        const kcal = document.createElement("strong");
        kcal.textContent = `${fmt(item.kcal)} kcal`;
        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "✕";
        del.setAttribute("aria-label", `${item.name} löschen`);
        del.onclick = () => removeItem(entry.id, item);
        row.append(text, kcal, del);
        wrap.append(row);
      }
    }
    log.append(wrap);
  }
}

function removeItem(entryId, item) {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.items = entry.items.filter((i) => i !== item);
  if (!entry.items.length) entries = entries.filter((e) => e.id !== entryId);
  save(STORE_KEY, entries);
  render();
}

function showResult(result, source) {
  pending = result;
  const list = $("resultItems");
  list.replaceChildren();
  for (const item of result.items) {
    const li = document.createElement("li");
    li.innerHTML = `<div><div class="name"></div><div class="detail"></div></div><div class="kcal"></div>`;
    li.querySelector(".name").textContent = item.name;
    li.querySelector(".detail").textContent =
      `${item.amount} · E ${fmt(item.protein)} g · KH ${fmt(item.carbs)} g · F ${fmt(item.fat)} g`;
    li.querySelector(".kcal").textContent = `${fmt(item.kcal)} kcal`;
    list.append(li);
  }
  for (const u of result.unknown || []) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="warn"></div>`;
    li.firstChild.textContent = `„${u}“ nicht erkannt – bitte genauer beschreiben oder API-Schlüssel hinterlegen.`;
    list.append(li);
  }
  $("resultTotal").textContent = fmt(sum(result.items, "kcal"));
  $("resultSource").textContent = source + (result.note ? ` · ${result.note}` : "");
  $("saveBtn").disabled = !result.items.length;
  $("mealType").value = guessMealType();
  $("resultCard").classList.remove("hidden");
  $("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Berechnung ----------
async function analyze() {
  const text = $("mealInput").value.trim();
  if (!text) {
    setStatus("Bitte zuerst eine Mahlzeit eingeben oder sprechen.", true);
    return;
  }
  stopListening();
  $("analyzeBtn").disabled = true;

  if (settings.apiKey) {
    setStatus("Claude berechnet die Kalorien …");
    try {
      const { estimateWithClaude } = await import("./claude.js");
      const result = await estimateWithClaude(text, settings.apiKey);
      showResult({ ...result, input: text }, "Geschätzt von Claude");
      setStatus("");
    } catch (err) {
      const offline = estimateOffline(text);
      showResult({ ...offline, input: text }, "Offline-Datenbank (Claude nicht erreichbar)");
      setStatus(err.message || String(err), true);
    }
  } else {
    showResult({ ...estimateOffline(text), input: text }, "Geschätzt mit der Offline-Datenbank");
    setStatus("");
  }
  $("analyzeBtn").disabled = false;
}

function saveResult() {
  if (!pending?.items.length) return;
  entries.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: currentDate,
    meal: $("mealType").value,
    text: pending.input,
    items: pending.items,
    createdAt: new Date().toISOString(),
  });
  save(STORE_KEY, entries);
  discardResult();
  $("mealInput").value = "";
  setStatus("Gespeichert ✓");
  render();
}

function discardResult() {
  pending = null;
  $("resultCard").classList.add("hidden");
}

// ---------- Spracheingabe ----------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

function setupSpeech() {
  if (!SpeechRecognition) {
    $("micBtn").disabled = true;
    $("micLabel").textContent = "Sprache n. v.";
    $("micBtn").title = "Dein Browser unterstützt keine Spracherkennung (z. B. Chrome, Edge oder Safari verwenden).";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.continuous = true;

  let base = "";
  recognition.onstart = () => {
    listening = true;
    base = $("mealInput").value.trim();
    $("micBtn").classList.add("listening");
    $("micLabel").textContent = "Stopp";
    setStatus("Ich höre zu … sag, was du gegessen hast.");
  };
  recognition.onresult = (event) => {
    let finalText = "";
    let interim = "";
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    $("mealInput").value = [base, finalText, interim].filter(Boolean).join(" ").trim();
  };
  recognition.onerror = (event) => {
    const msgs = {
      "not-allowed": "Mikrofonzugriff wurde verweigert.",
      "no-speech": "Es wurde nichts gehört. Bitte erneut versuchen.",
      "audio-capture": "Kein Mikrofon gefunden.",
      network: "Netzwerkfehler bei der Spracherkennung.",
    };
    setStatus(msgs[event.error] || `Spracherkennung: ${event.error}`, true);
  };
  recognition.onend = () => {
    listening = false;
    $("micBtn").classList.remove("listening");
    $("micLabel").textContent = "Sprechen";
    if ($("status").textContent.startsWith("Ich höre")) {
      setStatus($("mealInput").value.trim() ? "Fertig – jetzt „Kalorien berechnen“ tippen." : "");
    }
  };
}

function toggleListening() {
  if (!recognition) return;
  if (listening) stopListening();
  else {
    try { recognition.start(); } catch { /* läuft bereits */ }
  }
}
function stopListening() {
  if (recognition && listening) recognition.stop();
}

// ---------- Einstellungen ----------
function openSettings() {
  $("goalInput").value = settings.goal;
  $("apiKeyInput").value = settings.apiKey;
  $("settingsDialog").showModal();
}
$("settingsDialog").addEventListener("close", () => {
  if ($("settingsDialog").returnValue !== "save") return;
  const goal = parseInt($("goalInput").value, 10);
  settings = {
    goal: goal > 0 ? goal : settings.goal,
    apiKey: $("apiKeyInput").value.trim(),
  };
  save(SETTINGS_KEY, settings);
  render();
});

function exportData() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kalorien-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Ereignisse ----------
$("micBtn").onclick = toggleListening;
$("analyzeBtn").onclick = analyze;
$("saveBtn").onclick = saveResult;
$("discardBtn").onclick = discardResult;
$("settingsBtn").onclick = openSettings;
$("exportBtn").onclick = exportData;
$("prevDay").onclick = () => { currentDate = shiftDate(currentDate, -1); render(); };
$("nextDay").onclick = () => { currentDate = shiftDate(currentDate, 1); render(); };
$("mealInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
});

setupSpeech();
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

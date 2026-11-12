// Offline-Schätzung: zerlegt einen deutschen Satz in Lebensmittel mit Mengen
// und rechnet sie über die eingebaute Datenbank in Kalorien um.
import { FOODS, GENERIC_UNITS } from "./foods.js";

const NUMBER_WORDS = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, halb: 0.5, halbe: 0.5, halben: 0.5, halbes: 0.5,
  anderthalb: 1.5, eineinhalb: 1.5, zweieinhalb: 2.5, paar: 2, einige: 3, viertel: 0.25,
};

// Einheit -> [Schlüssel, Faktor in g/ml oder null für lebensmittelabhängig]
const UNIT_ALIASES = [
  [/^(kilogramm|kilo|kg)$/, "gramm", 1000],
  [/^(gramm|gr|g)$/, "gramm", 1],
  [/^(liter|l)$/, "gramm", 1000],
  [/^(milliliter|ml)$/, "gramm", 1],
  [/^(zentiliter|cl)$/, "gramm", 10],
  [/^(scheiben?|scheibchen)$/, "scheibe"],
  [/^(stücke?|stück|stk|stückchen)$/, "stück"],
  [/^(tassen?|pott|kaffeebecher)$/, "tasse"],
  [/^(gläser|glas)$/, "glas"],
  [/^(becher)$/, "becher"],
  [/^(teller)$/, "teller"],
  [/^(schüsseln?|schälchen|schalen?)$/, "schüssel"],
  [/^(dosen?)$/, "dose"],
  [/^(flaschen?)$/, "flasche"],
  [/^(esslöffel|el)$/, "esslöffel"],
  [/^(teelöffel|tl)$/, "teelöffel"],
  [/^(handvoll)$/, "handvoll"],
  [/^(portionen?)$/, "portion"],
  [/^(kugeln?)$/, "kugel"],
  [/^(riegel)$/, "riegel"],
  [/^(tafeln?)$/, "tafel"],
  [/^(tüten?)$/, "tüte"],
  [/^(würfel)$/, "würfel"],
  [/^(maß)$/, "maß"],
];

const SIZE_WORDS = { klein: 0.7, kleine: 0.7, kleinen: 0.7, kleiner: 0.7, kleines: 0.7,
  groß: 1.4, große: 1.4, großen: 1.4, großer: 1.4, großes: 1.4,
  doppelt: 2, doppelte: 2, doppelten: 2 };

const FILLER = /\b(ich|habe|hab|hatte|gegessen|getrunken|gefrühstückt|zum|zu|frühstück|mittag|mittagessen|abendessen|abend|snack|heute|gerade|noch|dann|außerdem|etwas|bisschen|ca|circa|ungefähr|etwa|so|von|vom|der|die|das|den|dem|des|mein|meine|meinen)\b/g;

// Alle Aliase, längste zuerst, damit "griechischer joghurt" vor "joghurt" greift.
const ALIASES = FOODS.flatMap((food) => food.n.map((alias) => ({ alias, food })))
  .sort((a, b) => b.alias.length - a.alias.length);

function normalize(text) {
  return text.toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[„“"!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSegments(text) {
  const segments = [];
  for (const part of text.split(/,|\.(?!\d)|\+|\bund\b|\bsowie\b|\bdazu\b|\n/)) {
    const pieces = part.split(/\bmit\b/);
    pieces.forEach((piece, i) => {
      if (piece.trim()) segments.push({ text: piece.trim(), isSide: i > 0 });
    });
  }
  return segments;
}

function findFood(text) {
  for (const { alias, food } of ALIASES) {
    const re = new RegExp(`(^|[^a-zäöüß])${alias.replace(/[-]/g, "\\-")}(n|en|s|e)?($|[^a-zäöüß])`);
    if (re.test(text)) return { food, alias };
  }
  // Teilwort-Treffer (z. B. "käsebrot" enthält "brot")
  for (const { alias, food } of ALIASES) {
    if (alias.length >= 4 && text.includes(alias)) return { food, alias };
  }
  return null;
}

function parseQuantity(tokens) {
  let qty = null;
  let unit = null;
  let factor = 1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+(\.\d+)?$/.test(t) && qty === null) {
      qty = parseFloat(t);
      continue;
    }
    const m = t.match(/^(\d+(?:\.\d+)?)([a-zäöüß]+)$/);
    if (m && qty === null) {
      qty = parseFloat(m[1]);
      const u = matchUnit(m[2]);
      if (u) unit = u;
      continue;
    }
    if (t in NUMBER_WORDS && qty === null) {
      qty = NUMBER_WORDS[t];
      continue;
    }
    if (t in SIZE_WORDS) { factor *= SIZE_WORDS[t]; continue; }
    if (!unit) {
      const u = matchUnit(t);
      if (u) unit = u;
    }
  }
  return { qty, unit, factor };
}

function matchUnit(token) {
  for (const [re, key, grams] of UNIT_ALIASES) {
    if (re.test(token)) return { key, grams: grams ?? null };
  }
  return null;
}

function unitGrams(food, unit) {
  if (unit.grams) return unit.grams;
  if (unit.key === "portion") return food.portion;
  return food.units?.[unit.key] ?? GENERIC_UNITS[unit.key] ?? food.portion;
}

export function estimateOffline(input) {
  const text = normalize(input);
  const items = [];
  const unknown = [];
  let lastMain = null; // zuletzt erkanntes Hauptlebensmittel (für "mit …")
  let lastEntry = null; // zuletzt erzeugte Position mit Lebensmittel

  for (const seg of splitSegments(text)) {
    const cleaned = seg.text.replace(FILLER, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const tokens = cleaned.split(" ");
    const { qty, unit, factor } = parseQuantity(tokens);
    // Mengen-, Einheiten- und Größenwörter entfernen, damit z. B. "ein" nicht als "Ei" erkannt wird
    const foodText = tokens.filter((t) => !(t in NUMBER_WORDS) && !(t in SIZE_WORDS) && !matchUnit(t)
      && !/^\d/.test(t)).join(" ");
    const match = foodText ? findFood(foodText) : null;

    if (!match) {
      // "Eis mit zwei Kugeln": nur Mengenangabe -> auf vorherige Position anwenden
      if (lastEntry && unit && seg.isSide) {
        const grams = (qty ?? 1) * unitGrams(lastEntry.food, unit) * factor;
        Object.assign(lastEntry.item, nutrition(lastEntry.food, grams, lastEntry.item.name));
      } else {
        unknown.push(seg.text);
      }
      continue;
    }
    const { food } = match;

    let grams;
    if (unit) {
      grams = (qty ?? 1) * unitGrams(food, unit);
    } else if (qty !== null) {
      // "2 Eier", "3 Kartoffeln": Stückgewicht, sonst Portion
      grams = qty * (food.units?.stück ?? food.units?.scheibe ?? food.portion);
    } else if (seg.isSide) {
      grams = lastMain?.pairs?.[food.n[0]] ?? food.side ?? food.portion;
    } else {
      grams = food.portion;
    }
    grams *= factor;

    const item = nutrition(food, grams, capitalize(match.alias));
    items.push(item);
    lastEntry = { item, food };
    if (!seg.isSide) lastMain = food;
  }

  return { items, unknown };
}

function nutrition(food, grams, name) {
  grams = Math.round(grams);
  const ratio = grams / 100;
  return {
    name,
    amount: `${grams} ${isDrink(food) ? "ml" : "g"}`,
    kcal: Math.round(food.k * ratio),
    protein: round1(food.p * ratio),
    carbs: round1(food.c * ratio),
    fat: round1(food.f * ratio),
  };
}

function isDrink(food) {
  return ["kaffee", "tee", "wasser", "cola", "apfelsaft", "bier", "wein", "sekt", "milch",
    "hafermilch", "apfelschorle", "smoothie", "cappuccino", "latte macchiato", "cola zero",
    "alkoholfreies bier", "fettarme milch"].includes(food.n[0]);
}

const round1 = (x) => Math.round(x * 10) / 10;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Kalorienschätzung mit Claude (Anthropic API) direkt aus dem Browser.
// Der API-Schlüssel bleibt im localStorage des Geräts und wird nur an api.anthropic.com gesendet.
import Anthropic from "./vendor/anthropic-sdk.js";

const MODEL = "claude-opus-5-5";

const SYSTEM = `Du bist ein Ernährungsexperte. Der Nutzer beschreibt (oft per Spracheingabe, daher evtl. mit Erkennungsfehlern) auf Deutsch, was er gegessen oder getrunken hat.
Zerlege die Beschreibung in einzelne Lebensmittel bzw. Gerichte und schätze für jedes realistisch:
- die Menge (wenn nicht genannt: eine übliche Portion für Erwachsene in Deutschland),
- Kalorien (kcal), Eiweiß, Kohlenhydrate und Fett in Gramm.
Zubereitungen (z. B. "Kaffee mit Milch und Zucker", "Brot mit Butter") listest du als getrennte Positionen.
Nutze typische deutsche Nährwerte (z. B. Bundeslebensmittelschlüssel). Antworte ausschließlich im vorgegebenen JSON-Format; Namen und Mengenangaben auf Deutsch.
Wenn die Eingabe keine Lebensmittel enthält, gib eine leere Liste zurück und erkläre das kurz in "hinweis".`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "hinweis"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "kcal", "protein", "carbs", "fat"],
        properties: {
          name: { type: "string", description: "Lebensmittel, z. B. 'Vollkornbrot'" },
          amount: { type: "string", description: "Menge, z. B. '2 Scheiben (100 g)'" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
        },
      },
    },
    hinweis: { type: "string", description: "Kurzer Hinweis zu Annahmen, oder leer" },
  },
};

export async function estimateWithClaude(text, apiKey) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error("Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error("Zu viele Anfragen – bitte kurz warten und erneut versuchen.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new Error("Keine Verbindung zur Claude-API.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Claude-API-Fehler (${err.status ?? "?"}): ${err.message}`);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new Error("Claude konnte diese Anfrage nicht beantworten.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Die Antwort war zu lang – bitte die Mahlzeit kürzer beschreiben.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Leere Antwort von Claude.");
  const data = JSON.parse(textBlock.text);

  return {
    items: data.items.map((it) => ({
      name: it.name,
      amount: it.amount,
      kcal: Math.round(it.kcal),
      protein: Math.round(it.protein * 10) / 10,
      carbs: Math.round(it.carbs * 10) / 10,
      fat: Math.round(it.fat * 10) / 10,
    })),
    note: data.hinweis || "",
  };
}

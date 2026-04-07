export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

const SYSTEM = `You are a YouTube outreach analyst for a video editor specialising in motion graphics, B-roll, and polished talking-head videos. Evaluate whether each YouTube creator is a high-value outreach target.

STRONG FIT (must match most): sells something (course/coaching/SaaS/consulting/agency/digital product), 3k-120k subscribers, posted within last 6 weeks, editing is basic/functional, English-speaking or clearly monetised.

POSSIBLE FIT: some product signals but unclear, subscriber range 1k-200k, posted in last 3 months.

WEAK FIT: pure entertainment/gaming, no monetisation, over 250k or under 500 subs, inactive over 4 months, already has polished production.

Return ONLY valid JSON, no markdown, no explanation:
{"channel_name":"string","subscriber_count":"string","niche":"string","has_product":true,"product_type":"string or null","last_post":"string","posting_frequency":"string","editing_quality":"basic","avg_views":"string or null","fit_score":"Strong fit","fit_reason":"one concise sentence","email_hook":"one personalised sentence for a cold DM"}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, imageBase64, mediaType, url, context } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    let parts;
    if (type === "screenshot") {
      parts = [
        { inlineData: { mimeType: mediaType || "image/jpeg", data: imageBase64 } },
        { text: "Analyse this YouTube channel screenshot and return the JSON evaluation." },
      ];
    } else {
      parts = [{ text: "Analyse this YouTube channel.\n\nURL: " + url + "\nContext: " + (context || "None provided") }];
    }

    const body = {
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    };

    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error("Gemini API error " + response.status + ": " + errText);
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("Could not parse AI response: " + cleaned.slice(0, 200));
    }

    if (!parsed.channel_name) throw new Error("Invalid response: missing channel_name");
    return res.status(200).json(parsed);

  } catch (err) {
    console.error("Analysis error:", err);
    return res.status(500).json({ error: err.message || "Analysis failed" });
  }
}

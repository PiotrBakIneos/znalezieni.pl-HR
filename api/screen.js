const SYSTEM_PROMPT = `Jesteś ekspertem rekrutera z 15-letnim doświadczeniem w Polsce. Analizujesz CV kandydatów względem ogłoszenia o pracę.

Dla każdego kandydata zwróć WYŁĄCZNIE obiekt JSON (bez żadnego tekstu przed ani po):

{
  "kandydaci": [
    {
      "imie_nazwisko": "string",
      "wynik": number (1-10),
      "mocne_strony": ["string", "string", "string"],
      "slabe_strony": ["string"],
      "czerwona_flaga": "string lub null",
      "rekomendacja": "TAK" | "MOZE" | "NIE",
      "podsumowanie": "string (max 2 zdania)"
    }
  ]
}

Zasady:
- Bądź bezwzględnie szczery — HR potrzebuje prawdy, nie dyplomacji
- Wynik 8-10 tylko dla naprawdę silnych dopasowań
- mocne_strony: max 3 krótkie frazy (nie całe zdania)
- slabe_strony: max 3 krótkie frazy
- Czerwona flaga: luki w CV, zbyt częste zmiany pracy, brak kluczowych wymagań (null jeśli brak)
- Sortuj od najwyższego wyniku do najniższego
- Odpowiadaj wyłącznie w JSON, zero dodatkowego tekstu
- Nie używaj znaków specjalnych ani nowych linii wewnątrz wartości JSON string`;

function repairJson(str) {
  const stack = [];
  let inStr = false;
  let escape = false;
  for (const ch of str) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return str + stack.reverse().join('');
}

async function callAnthropic(body, retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (response.status === 529 || (data.error && data.error.type === 'overloaded_error')) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * attempt));
          continue;
        }
        throw new Error('Serwer jest chwilowo przeciążony. Spróbuj ponownie za 30 sekund.');
      }
      if (data.error) throw new Error(data.error.message);
      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Przekroczono limit czasu. Spróbuj z mniejszą liczbą CV.');
      throw err;
    }
  }
}

export default async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  const allowed = process.env.ALLOWED_ORIGIN || 'https://znalezieni.pl';
  if (origin && origin !== allowed && !origin.endsWith('.vercel.app')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobDesc, cvsText } = req.body || {};
  if (!jobDesc || !cvsText) return res.status(400).json({ error: 'Brak danych wejściowych.' });
  if (jobDesc.length > 15000 || cvsText.length > 80000) return res.status(400).json({ error: 'Za dużo danych wejściowych.' });

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const key = `znalezieni_ip:${ip}`;
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const countRes = await fetch(`${upstashUrl}/get/${key}`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      const countData = await countRes.json();
      if (parseInt(countData.result || '0') >= 5) {
        return res.status(429).json({ error: 'Limit 5 bezpłatnych analiz wykorzystany. Napisz na kontakt@znalezieni.pl.' });
      }
      await fetch(`${upstashUrl}/incr/${key}`, { headers: { Authorization: `Bearer ${upstashToken}` } });
      await fetch(`${upstashUrl}/expire/${key}/2592000`, { headers: { Authorization: `Bearer ${upstashToken}` } });
    } catch (_) {
      console.error('Upstash unavailable — rate limiting skipped for screen');
    }
  }

  try {
    const data = await callAnthropic({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `OGŁOSZENIE O PRACĘ:\n${jobDesc}\n\n========\n\nCV KANDYDATÓW:\n${cvsText}` }]
    });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    if (start === -1) throw new Error('Nieprawidłowa odpowiedź serwera.');
    let jsonStr = clean.slice(start);
    const end = jsonStr.lastIndexOf('}');
    jsonStr = end === -1 ? repairJson(jsonStr) : jsonStr.slice(0, end + 1);
    const parsed = JSON.parse(jsonStr);
    return res.status(200).json(parsed);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: 'Nie udało się przetworzyć odpowiedzi AI. Spróbuj z mniejszą liczbą CV.' });
    }
    const status = err.message.includes('przeciążony') ? 503 : err.message.includes('limit czasu') ? 504 : 500;
    return res.status(status).json({ error: err.message });
  }
}

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
- Czerwona flaga: luki w CV, zbyt częste zmiany pracy, brak kluczowych wymagań
- Sortuj od najwyższego wyniku do najniższego
- Odpowiadaj wyłącznie w JSON, zero dodatkowego tekstu`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobDesc, cvsText } = req.body || {};
  if (!jobDesc || !cvsText) return res.status(400).json({ error: 'Brak danych wejściowych.' });
  if (jobDesc.length > 15000 || cvsText.length > 80000) return res.status(400).json({ error: 'Za dużo danych wejściowych.' });

  // IP-based rate limit via Upstash Redis (optional but recommended)
  // If you set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel env vars,
  // this will block users who bypass the client-side limit.
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
      const current = parseInt(countData.result || '0');

      if (current >= 5) {
        return res.status(429).json({ error: 'Limit 5 bezpłatnych analiz wykorzystany. Napisz na kontakt@znalezieni.pl.' });
      }

      await fetch(`${upstashUrl}/incr/${key}`, { headers: { Authorization: `Bearer ${upstashToken}` } });
      await fetch(`${upstashUrl}/expire/${key}/2592000`, { headers: { Authorization: `Bearer ${upstashToken}` } });
    } catch (_) {
      // If Redis fails, don't block the request — just skip the server-side check
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `OGŁOSZENIE O PRACĘ:\n${jobDesc}\n\n========\n\nCV KANDYDATÓW:\n${cvsText}`
        }]
      })
    });

    const data = await response.json();

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Nieprawidłowa odpowiedź serwera.');
    const parsed = JSON.parse(clean.slice(start, end + 1));

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'Błąd analizy: ' + err.message });
  }
}

const SYSTEM_PROMPT = `Jesteś ekspertem rekrutera z 15-letnim doświadczeniem w Polsce. Analizujesz dopasowanie kandydatów do konkretnej roli.

Dla każdego kandydata zwróć WYŁĄCZNIE obiekt JSON (bez żadnego tekstu przed ani po):

{
  "rola": "nazwa stanowiska z ogłoszenia",
  "kandydaci": [
    {
      "imie_nazwisko": "string — imię i nazwisko lub 'Kandydat 1' jeśli anonimowy",
      "procent_dopasowania": number (0-100),
      "poziom": "WYSOKI" | "SREDNI" | "NISKI",
      "podsumowanie_dopasowania": "string (1-2 zdania dlaczego pasuje lub nie pasuje do roli)",
      "co_pasuje": ["string", "string"],
      "czego_brakuje": ["string"],
      "rekomendacja": "ZAPROŚ" | "ROZWAŻ" | "ODRZUĆ",
      "uzasadnienie_rekomendacji": "string (1 zdanie uzasadniające decyzję)"
    }
  ]
}

Zasady:
- Bądź bezwzględnie szczery — HR potrzebuje prawdy, nie dyplomacji
- procent_dopasowania: 80-100 tylko dla naprawdę silnych dopasowań, poniżej 40 dla słabych
- WYSOKI: 70-100%, SREDNI: 40-69%, NISKI: 0-39%
- co_pasuje: konkretne elementy CV które spełniają wymagania ogłoszenia
- czego_brakuje: konkretne luki — brakujące umiejętności, certyfikaty, doświadczenie (pusta lista jeśli nic nie brakuje)
- Sortuj kandydatów od najwyższego procent_dopasowania do najniższego
- Odpowiadaj wyłącznie w JSON, zero dodatkowego tekstu`;

async function callAnthropic(body, retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Overloaded — wait and retry
    if (response.status === 529 || (data.error && data.error.type === 'overloaded_error')) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * attempt)); // 2s, 4s, 6s
        continue;
      }
      throw new Error('Serwer jest chwilowo przeciążony. Spróbuj ponownie za 30 sekund.');
    }

    if (data.error) throw new Error(data.error.message);
    return data;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { jobDesc, cvsText } = req.body || {};
  if (!jobDesc || !cvsText) return res.status(400).json({ error: 'Brak danych wejściowych.' });
  if (jobDesc.length > 15000 || cvsText.length > 80000) return res.status(400).json({ error: 'Za dużo danych wejściowych.' });

  // IP rate limit via Upstash (optional)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const key = `znalezieni_match_ip:${ip}`;
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const countRes = await fetch(`${upstashUrl}/get/${key}`, { headers: { Authorization: `Bearer ${upstashToken}` } });
      const countData = await countRes.json();
      if (parseInt(countData.result || '0') >= 5) {
        return res.status(429).json({ error: 'Limit 5 bezpłatnych analiz dopasowania wykorzystany. Napisz na kontakt@znalezieni.pl.' });
      }
      await fetch(`${upstashUrl}/incr/${key}`, { headers: { Authorization: `Bearer ${upstashToken}` } });
      await fetch(`${upstashUrl}/expire/${key}/2592000`, { headers: { Authorization: `Bearer ${upstashToken}` } });
    } catch (_) {}
  }

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `OGŁOSZENIE O PRACĘ:\n${jobDesc}\n\n========\n\nCV KANDYDATÓW:\n${cvsText}` }]
    });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Nieprawidłowa odpowiedź serwera.');
    const parsed = JSON.parse(clean.slice(start, end + 1));

    return res.status(200).json(parsed);
  } catch (err) {
    const status = err.message.includes('przeciążony') ? 503 : 500;
    return res.status(status).json({ error: err.message });
  }
}

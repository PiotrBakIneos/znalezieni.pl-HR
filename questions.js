const SYSTEM_PROMPT = `Jesteś ekspertem ds. inkluzywnej rekrutacji z 15-letnim doświadczeniem w Polsce. Generujesz pytania screeningowe pozbawione biasów poznawczych.

Na podstawie ogłoszenia o pracę wygeneruj dokładnie 10 pytań screeningowych.

Zwróć WYŁĄCZNIE obiekt JSON (bez żadnego tekstu przed ani po):

{
  "pytania": [
    {
      "pytanie": "string — treść pytania",
      "eliminuje_biasy": ["Bias płci" | "Bias wieku" | "Bias afiliacji" | "Bias potwierdzenia" | "Bias atrakcyjności"],
      "uzasadnienie": "string — jedno zdanie wyjaśniające dlaczego to pytanie jest neutralne"
    }
  ]
}

Zasady generowania pytań:
- Pytania muszą oceniać KOMPETENCJE i DOŚWIADCZENIE, nie cechy osobiste
- Żadnych pytań o wiek, rok ukończenia studiów, stan cywilny, plany rodzinne
- Żadnych pytań które faworyzują konkretną płeć
- Używaj formy bezosobowej lub "Proszę opisać..."
- Pytania muszą być konkretne i mierzalne
- Mix: pytania behawioralne (STAR), sytuacyjne i kompetencyjne
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

  const { jobDesc, cvText } = req.body || {};
  if (!jobDesc) return res.status(400).json({ error: 'Brak treści ogłoszenia.' });
  if (jobDesc.length > 15000) return res.status(400).json({ error: 'Ogłoszenie jest za długie.' });
  if (cvText && cvText.length > 20000) return res.status(400).json({ error: 'CV jest za długie.' });

  // IP rate limit via Upstash (optional)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const key = `znalezieni_q_ip:${ip}`;
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const countRes = await fetch(`${upstashUrl}/get/${key}`, { headers: { Authorization: `Bearer ${upstashToken}` } });
      const countData = await countRes.json();
      if (parseInt(countData.result || '0') >= 5) {
        return res.status(429).json({ error: 'Limit 5 bezpłatnych generowań wykorzystany. Napisz na kontakt@znalezieni.pl.' });
      }
      await fetch(`${upstashUrl}/incr/${key}`, { headers: { Authorization: `Bearer ${upstashToken}` } });
      await fetch(`${upstashUrl}/expire/${key}/2592000`, { headers: { Authorization: `Bearer ${upstashToken}` } });
    } catch (_) {}
  }

  try {
    const data = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: cvText
        ? `OGŁOSZENIE O PRACĘ:\n${jobDesc}\n\n========\n\nCV KANDYDATA:\n${cvText}\n\nUwaga: masz dostęp do CV kandydata — uwzględnij jego doświadczenie i umiejętności przy formułowaniu pytań, aby były trafniejsze i bardziej spersonalizowane.`
        : `OGŁOSZENIE O PRACĘ:\n${jobDesc}` }]
    });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Nieprawidłowa odpowiedź.');
    const parsed = JSON.parse(clean.slice(start, end + 1));

    return res.status(200).json(parsed);
  } catch (err) {
    const status = err.message.includes('przeciążony') ? 503 : 500;
    return res.status(status).json({ error: err.message });
  }
}

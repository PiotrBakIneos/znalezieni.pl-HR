const SYSTEM_PROMPT = `Jesteś ekspertem rekrutera z 15-letnim doświadczeniem w Polsce. Dopasowujesz jednego kandydata do kilku ofert pracy.

Zwróć WYŁĄCZNIE obiekt JSON (bez żadnego tekstu przed ani po):

{
  "role": [
    {
      "nazwa_roli": "string — nazwa stanowiska z ogłoszenia",
      "wynik": number (1-10),
      "mocne_strony": ["string", "string", "string"],
      "luki": ["string"],
      "rekomendacja": "TAK" | "MOZE" | "NIE",
      "podsumowanie": "string (max 2 zdania)"
    }
  ]
}

Zasady:
- Oceniaj dopasowanie kandydata do każdej roli osobno
- Mocne strony: co kandydat wnosi do tej konkretnej roli
- Luki: czego brakuje kandydatowi względem wymagań tej roli
- Sortuj od najlepszego dopasowania (najwyższy wynik) do najsłabszego
- Wynik 8-10 tylko dla naprawdę silnych dopasowań
- Bądź bezwzględnie szczery — HR potrzebuje prawdy
- Odpowiadaj wyłącznie w JSON, zero dodatkowego tekstu`;

async function callAnthropic(body, retries=3, delayMs=2000){
  for(let attempt=1;attempt<=retries;attempt++){
    const response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify(body),
    });
    const data=await response.json();
    if(response.status===529||(data.error&&data.error.type==='overloaded_error')){
      if(attempt<retries){await new Promise(r=>setTimeout(r,delayMs*attempt));continue;}
      throw new Error('Serwer jest chwilowo przeciążony. Spróbuj ponownie za 30 sekund.');
    }
    if(data.error)throw new Error(data.error.message);
    return data;
  }
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const {cvText,roles}=req.body||{};
  if(!cvText||!roles||!roles.length)return res.status(400).json({error:'Brak CV lub ogłoszeń.'});
  if(cvText.length>20000)return res.status(400).json({error:'CV jest za długie.'});
  if(roles.length>5)return res.status(400).json({error:'Maksymalnie 5 ogłoszeń.'});

  // IP rate limit via Upstash (optional)
  if(process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN){
    const ip=(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
    const key=`znalezieni_match_ip:${ip}`;
    const upstashUrl=process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken=process.env.UPSTASH_REDIS_REST_TOKEN;
    try{
      const countRes=await fetch(`${upstashUrl}/get/${key}`,{headers:{Authorization:`Bearer ${upstashToken}`}});
      const countData=await countRes.json();
      if(parseInt(countData.result||'0')>=5)return res.status(429).json({error:'Limit 5 bezpłatnych analiz wykorzystany. Napisz na kontakt@znalezieni.pl.'});
      await fetch(`${upstashUrl}/incr/${key}`,{headers:{Authorization:`Bearer ${upstashToken}`}});
      await fetch(`${upstashUrl}/expire/${key}/2592000`,{headers:{Authorization:`Bearer ${upstashToken}`}});
    }catch(_){}
  }

  const rolesText=roles.map((r,i)=>`--- ROLA ${i+1} ---\n${r.text}`).join('\n\n');
  const userContent=`CV KANDYDATA:\n${cvText}\n\n========\n\nOGŁOSZENIA O PRACĘ:\n${rolesText}`;

  try{
    const data=await callAnthropic({
      model:'claude-sonnet-4-6',
      max_tokens:3000,
      system:SYSTEM_PROMPT,
      messages:[{role:'user',content:userContent}]
    });
    const text=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean=text.replace(/```json|```/g,'').trim();
    const start=clean.indexOf('{');const end=clean.lastIndexOf('}');
    if(start===-1||end===-1)throw new Error('Nieprawidłowa odpowiedź serwera.');
    const parsed=JSON.parse(clean.slice(start,end+1));
    return res.status(200).json(parsed);
  }catch(err){
    const status=err.message.includes('przeciążony')?503:500;
    return res.status(status).json({error:err.message});
  }
}

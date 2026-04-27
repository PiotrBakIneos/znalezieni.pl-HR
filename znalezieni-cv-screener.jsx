import { useState, useCallback } from "react";

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

const FAKE_JOB = `STANOWISKO: Senior HR Business Partner
FIRMA: TechCorp Polska Sp. z o.o. (150 pracowników, branża IT)

WYMAGANIA OBOWIĄZKOWE:
- Min. 5 lat doświadczenia w HR
- Doświadczenie w środowisku IT/tech
- Znajomość polskiego prawa pracy
- Angielski B2+
- Doświadczenie w rekrutacji technicznej

WYMAGANIA MILE WIDZIANE:
- Certyfikat SHRM lub CIPD
- Doświadczenie z systemami ATS (Workday, SAP)
- Znajomość metodologii Agile/Scrum

ZAKRES OBOWIĄZKÓW:
- Budowanie strategii HR dla działów technicznych
- Rekrutacja specjalistów IT (Java, Python, DevOps)
- Prowadzenie procesów onboardingowych
- Wsparcie managerów w kwestiach pracowniczych
- Raportowanie HR do zarządu

WYNAGRODZENIE: 12 000 - 16 000 PLN brutto`;

const FAKE_CVS = [
  {
    name: "Anna Kowalska",
    content: `Anna Kowalska | anna.kowalska@email.pl | +48 600 123 456
    
DOŚWIADCZENIE:
2019-obecnie: HR Business Partner, SoftwareMill (200 os.) - rekrutacja IT, onboarding, Workday
2016-2019: HR Specialist, Comarch SA - rekrutacja techniczna, prawo pracy
2014-2016: Recruiter, Hays Poland - headhunting IT

WYKSZTAŁCENIE: Mgr Zarządzanie Zasobami Ludzkimi, UJ Kraków 2014
CERTYFIKATY: SHRM-CP 2020, certyfikat prawa pracy 2018
JĘZYKI: Angielski C1, Niemicki B1
UMIEJĘTNOŚCI: Workday, SAP SuccessFactors, Agile HR`,
  },
  {
    name: "Marek Wiśniewski",
    content: `Marek Wiśniewski | marek.w@gmail.com | +48 501 987 654

DOŚWIADCZENIE:
2021-obecnie: HR Manager, sklep internetowy (12 os.) - ogólny HR
2020-2021: przerwa w karierze (opieka nad rodzicem)
2018-2020: HR Assistant, fabryka mebli
2015-2018: sprzedawca w sklepie AGD

WYKSZTAŁCENIE: Licencjat Administracja, WSIZ 2015
JĘZYKI: Angielski A2
UMIEJĘTNOŚCI: Excel, kadry-płace`,
  },
  {
    name: "Katarzyna Nowak",
    content: `Katarzyna Nowak | k.nowak@outlook.com

DOŚWIADCZENIE:
2020-obecnie: HRBP, Allegro (3000 os.) - partnering dla działu tech 400 os., rekrutacja senior devów
2017-2020: HR Specialist, OLX Group - EB, rekrutacja IT
2015-2017: Junior Recruiter, Antal

WYKSZTAŁCENIE: Psychologia, Uniwersytet Warszawski 2015
CERTYFIKATY: CIPD Level 5, Scrum Master
JĘZYKI: Angielski C2, Rosyjski B2
PROJEKTY: Wdrożenie Workday dla 3000 pracowników 2022`,
  },
  {
    name: "Piotr Zając",
    content: `Piotr Zając | piotr.zajac@email.pl

DOŚWIADCZENIE:
2022-obecnie: HR BP, startup fintech (40 os.)
2021-2022: HR BP, inna firma (zwolniony po 8 mies.)
2020-2021: HR BP, kolejna firma (odszedł po 6 mies.)
2019-2020: HR Specialist
2018-2019: HR Assistant

WYKSZTAŁCENIE: Zarządzanie, SGH 2018
JĘZYKI: Angielski B2
UMIEJĘTNOŚCI: rekrutacja, onboarding`,
  },
  {
    name: "Monika Dąbrowska",
    content: `Monika Dąbrowska | monika.dabrowska@gmail.com | LinkedIn: /in/monikadabrowska

DOŚWIADCZENIE:
2018-obecnie: Head of People, DocPlanner (500+ os., 13 krajów) 
- Zbudowanie działu HR od 3 do 15 osób
- Wdrożenie globalnej strategii rekrutacyjnej
- Rekrutacja 200+ specjalistów IT rocznie
2015-2018: Senior HRBP, Naspers/OLX

WYKSZTAŁCENIE: MBA, Koźminski 2017; Psychologia UW 2013
CERTYFIKATY: SHRM-SCP, ICF Coach
JĘZYKI: Angielski C2, Hiszpański B1
OSIĄGNIĘCIA: Top HR Leader 2023 (Forbes Polska)`,
  },
  {
    name: "Tomasz Lewandowski",
    content: `Tomasz Lewandowski

DOŚWIADCZENIE:
2023-obecnie: HR w firmie IT (świeży)
2020-2023: nauczyciel w szkole podstawowej
2018-2020: praca za granicą (Holandia, różne prace fizyczne)

WYKSZTAŁCENIE: Historia, UWr 2018
JĘZYKI: Angielski B1, Holenderski podstawowy
ZAINTERESOWANIA: HR, ludzie, rozwój`,
  },
  {
    name: "Aleksandra Wójcik",
    content: `Aleksandra Wójcik | aleksandra.wojcik@email.pl | +48 690 456 789

DOŚWIADCZENIE:
2019-obecnie: HR Business Partner, CD Projekt Red (1000+ os.)
- Partner HR dla działu R&D (300 programistów)
- Rekrutacja senior game devów i architektów
- Programy retencji dla kluczowych pracowników
2016-2019: HR Specialist, Sabre Polska
2014-2016: Recruiter IT, Michael Page

WYKSZTAŁCENIE: Socjologia, UW 2014
JĘZYKI: Angielski C1, Czeski komunikatywny
UMIEJĘTNOŚCI: Workday, Greenhouse ATS, Agile, OKR`,
  },
  {
    name: "Rafał Kowalczyk",
    content: `Rafał Kowalczyk | rafal.k@email.pl

DOŚWIADCZENIE:
2015-obecnie: Właściciel agencji rekrutacyjnej (IT)
- 8 lat rekrutacji wyłącznie IT
- Zrealizował 400+ projektów dla firm tech
- Specjalizacja: Java, Python, DevOps, Data Science
2012-2015: IT Recruiter, Luxoft

WYKSZTAŁCENIE: Informatyka (niezakończone), PW; Psychologia, SWPS 2014
JĘZYKI: Angielski C1
UWAGA: Przechodzi na etat po sprzedaży agencji — szuka stabilności`,
  },
  {
    name: "Joanna Kamińska",
    content: `Joanna Kamińska | joanna.kaminska@gmail.com

DOŚWIADCZENIE:
2021-2023: HR Generalist, firma produkcyjna (brak doświadczenia IT)
2019-2021: Specjalista ds. kadr i płac, biuro rachunkowe
2017-2019: urlop macierzyński x2

WYKSZTAŁCENIE: Prawo pracy, UKSW 2016
CERTYFIKATY: Kurs kadrowo-płacowy, Kurs HR Generalista
JĘZYKI: Angielski B1
UMIEJĘTNOŚCI: Płatnik, Enova, prawo pracy`,
  },
  {
    name: "Bartosz Szymański",
    content: `Bartosz Szymański | b.szymanski@email.pl | +48 502 111 222

DOŚWIADCZENIE:
2020-obecnie: People Partner, Revolut Polska (fintech, 300 os.)
- Partner dla engineering teams (150 devów)
- Rekrutacja: 80 inżynierów w 2023
- Wdrożenie Workday + integracja z Jira HR
2018-2020: HRBP, ING Tech Poland
2016-2018: HR Specialist, Accenture

WYKSZTAŁCENIE: Zarządzanie, SGH 2016
JĘZYKI: Angielski C1, Ukraiński natywny
CERTYFIKATY: SAP SuccessFactors, Agile HR Practitioner`,
  },
];

export default function ZnalezieniApp() {
  const [jobDesc, setJobDesc] = useState("");
  const [cvsText, setCvsText] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("tool");

  const loadTestData = () => {
    setJobDesc(FAKE_JOB);
    setCvsText(FAKE_CVS.map((cv, i) => `--- CV ${i + 1}: ${cv.name} ---\n${cv.content}`).join("\n\n"));
    setActiveTab("tool");
  };

  const screenCVs = async () => {
    if (!jobDesc.trim() || !cvsText.trim()) {
      setError("Wklej ogłoszenie i CV kandydatów.");
      return;
    }
    setError("");
    setLoading(true);
    setResults(null);

    try {
      const userMessage = `OGŁOSZENIE O PRACĘ:\n${jobDesc}\n\n========\n\nCV KANDYDATÓW:\n${cvsText}`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      const data = await response.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResults(parsed.kandydaci || []);
    } catch (err) {
      setError("Błąd analizy. Sprawdź dane i spróbuj ponownie.");
    }
    setLoading(false);
  };

  const exportCSV = () => {
    if (!results) return;
    const header = "Imię i nazwisko,Wynik,Rekomendacja,Czerwona flaga,Podsumowanie\n";
    const rows = results.map(k =>
      `"${k.imie_nazwisko}","${k.wynik}/10","${k.rekomendacja}","${k.czerwona_flaga || "-"}","${k.podsumowanie}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wyniki_rekrutacji.csv";
    a.click();
  };

  const recColor = (rec) => {
    if (rec === "TAK") return { bg: "#EAF3DE", color: "#3B6D11", border: "#97C459" };
    if (rec === "MOZE") return { bg: "#FAEEDA", color: "#854F0B", border: "#EF9F27" };
    return { bg: "#FCEBEB", color: "#A32D2D", border: "#F09595" };
  };

  return (
    <div style={{ fontFamily: "'Georgia', serif", minHeight: "100vh", background: "#FAFAF8" }}>
      {/* Header */}
      <div style={{ background: "#1a1a2e", padding: "1.5rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F5E6C8", letterSpacing: "-0.5px" }}>znalezieni<span style={{ color: "#EF9F27" }}>.pl</span></div>
          <div style={{ fontSize: 12, color: "#888", letterSpacing: "2px", textTransform: "uppercase", marginTop: 2 }}>AI Screening Kandydatów</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["tool", "data"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
              background: activeTab === tab ? "#EF9F27" : "rgba(255,255,255,0.1)",
              color: activeTab === tab ? "#1a1a2e" : "#ccc", fontWeight: activeTab === tab ? 600 : 400
            }}>
              {tab === "tool" ? "Narzędzie" : "Dane testowe"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>

        {activeTab === "data" && (
          <div>
            <div style={{ background: "#fff", border: "1px solid #E8E4DC", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: "0.75rem", color: "#1a1a2e" }}>Ogłoszenie testowe</div>
              <pre style={{ fontSize: 13, lineHeight: 1.7, color: "#444", whiteSpace: "pre-wrap", fontFamily: "monospace", background: "#F8F7F4", padding: "1rem", borderRadius: 8 }}>{FAKE_JOB}</pre>
            </div>
            <div style={{ background: "#fff", border: "1px solid #E8E4DC", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: "0.75rem", color: "#1a1a2e" }}>10 testowych CV</div>
              {FAKE_CVS.map((cv, i) => (
                <div key={i} style={{ background: "#F8F7F4", borderRadius: 8, padding: "1rem", marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: "#1a1a2e" }}>CV {i + 1}: {cv.name}</div>
                  <pre style={{ fontSize: 12, color: "#666", whiteSpace: "pre-wrap", fontFamily: "monospace", margin: 0 }}>{cv.content}</pre>
                </div>
              ))}
            </div>
            <button onClick={loadTestData} style={{
              width: "100%", padding: "14px", background: "#1a1a2e", color: "#F5E6C8",
              border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer"
            }}>
              Załaduj dane testowe do narzędzia →
            </button>
          </div>
        )}

        {activeTab === "tool" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase" }}>Ogłoszenie o pracę</label>
                <textarea
                  value={jobDesc}
                  onChange={e => setJobDesc(e.target.value)}
                  placeholder="Wklej treść ogłoszenia — stanowisko, wymagania, zakres obowiązków..."
                  style={{ width: "100%", height: 280, padding: "12px 14px", border: "1.5px solid #DDD", borderRadius: 10, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "monospace", background: "#fff", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#555", display: "block", marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase" }}>CV Kandydatów</label>
                <textarea
                  value={cvsText}
                  onChange={e => setCvsText(e.target.value)}
                  placeholder="Wklej CV kandydatów — oddziel każde CV separatorem np. '--- CV 1: Jan Kowalski ---'"
                  style={{ width: "100%", height: 280, padding: "12px 14px", border: "1.5px solid #DDD", borderRadius: 10, fontSize: 13, lineHeight: 1.6, resize: "vertical", fontFamily: "monospace", background: "#fff", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {error && <div style={{ background: "#FCEBEB", color: "#A32D2D", padding: "10px 16px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, marginBottom: "2rem" }}>
              <button onClick={screenCVs} disabled={loading} style={{
                flex: 1, padding: "14px", background: loading ? "#999" : "#1a1a2e",
                color: "#F5E6C8", border: "none", borderRadius: 10, fontSize: 15,
                fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.3px"
              }}>
                {loading ? "Analizuję kandydatów..." : "Przeanalizuj CV →"}
              </button>
              <button onClick={loadTestData} style={{
                padding: "14px 20px", background: "transparent", color: "#666",
                border: "1.5px solid #DDD", borderRadius: 10, fontSize: 14, cursor: "pointer"
              }}>
                Załaduj dane testowe
              </button>
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚙</div>
                <div style={{ fontSize: 15 }}>Claude analizuje kandydatów...</div>
                <div style={{ fontSize: 13, marginTop: 6, color: "#aaa" }}>To zajmie około 15-30 sekund</div>
              </div>
            )}

            {results && results.length > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>
                    Wyniki: {results.length} kandydatów przeanalizowanych
                  </div>
                  <button onClick={exportCSV} style={{
                    padding: "8px 16px", background: "#EAF3DE", color: "#3B6D11",
                    border: "1px solid #97C459", borderRadius: 8, fontSize: 13,
                    fontWeight: 600, cursor: "pointer"
                  }}>
                    Eksportuj CSV
                  </button>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem" }}>
                  {["TAK", "MOZE", "NIE"].map(rec => {
                    const count = results.filter(k => k.rekomendacja === rec).length;
                    const c = recColor(rec);
                    return (
                      <div key={rec} style={{ flex: 1, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{count}</div>
                        <div style={{ fontSize: 12, color: c.color, fontWeight: 600 }}>
                          {rec === "TAK" ? "Polecani" : rec === "MOZE" ? "Do rozważenia" : "Odrzuceni"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {results.map((k, i) => {
                  const c = recColor(k.rekomendacja);
                  return (
                    <div key={i} style={{
                      background: "#fff", border: `1px solid ${c.border}`,
                      borderLeft: `4px solid ${c.border}`, borderRadius: 10,
                      padding: "1.25rem 1.5rem", marginBottom: 12
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a2e" }}>
                            {i + 1}. {k.imie_nazwisko}
                          </div>
                          <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{k.podsumowanie}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 16 }}>
                          <div style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                            {k.rekomendacja}
                          </div>
                          <div style={{ background: "#1a1a2e", color: "#F5E6C8", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                            {k.wynik}/10
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Mocne strony</div>
                          {k.mocne_strony?.map((m, j) => (
                            <div key={j} style={{ fontSize: 13, color: "#444", padding: "2px 0" }}>✓ {m}</div>
                          ))}
                        </div>
                        <div>
                          {k.slabe_strony?.length > 0 && (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#854F0B", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Słabe strony</div>
                              {k.slabe_strony.map((s, j) => (
                                <div key={j} style={{ fontSize: 13, color: "#444", padding: "2px 0" }}>✗ {s}</div>
                              ))}
                            </>
                          )}
                          {k.czerwona_flaga && (
                            <div style={{ marginTop: 8, background: "#FCEBEB", border: "1px solid #F09595", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#A32D2D", fontWeight: 600 }}>
                              ⚠ {k.czerwona_flaga}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

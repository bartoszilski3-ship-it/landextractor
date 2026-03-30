import { GoogleGenAI, Type } from "@google/genai";
import { ParcelData } from "../types";

export const extractDataFromImages = async (base64Images: string[]): Promise<ParcelData[]> => {
  const apiKey = localStorage.getItem("gemini_api_key");
  
  if (!apiKey || apiKey === 'undefined' || apiKey.length < 10) {
  throw new Error("Brak klucza API. Wprowadź klucz przed użyciem.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const imageParts = base64Images.map(data => ({
    inlineData: {
      data,
      mimeType: "image/jpeg"
    }
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `Jesteś systemem do precyzyjnej ekstrakcji danych z polskich wypisów z rejestru gruntów.

Twoim zadaniem jest WYŁĄCZNIE wyciągnięcie danych właścicieli i działek do formatu JSON zgodnego dokładnie ze schematem odpowiedzi.

========================================
ZASADY OGÓLNE (BEZWZGLĘDNE)
========================================

1. ZWRACAJ WYŁĄCZNIE CZYSTY JSON
- bez komentarzy
- bez tekstu przed i po
- bez markdown
- bez wyjaśnień

2. JEDEN REKORD = JEDNA DZIAŁKA
- każda działka ma osobny rekord
- jeśli działka ma kilku właścicieli, wpisz ich pełny wspólny opis w polu "wlasciciel_pelny"
- nie twórz osobnych rekordów dla udziałów, jeśli dokument przypisuje właścicieli do jednej jednostki rejestrowej

3. NIE WOLNO:
- grupować działek
- sumować powierzchni
- zgadywać brakujących danych
- dopisywać danych spoza dokumentu

========================================
IGNORUJ CAŁKOWICIE (TO NIE SĄ DANE)
========================================

Wszystkie nagłówki i dane urzędowe, w szczególności:
- nazwy urzędów
- adresy urzędów
- pieczątki
- podpisy
- numery spraw
- daty wydania dokumentu
- dane z górnej części strony przed sekcją właścicieli

Te dane NIGDY nie mogą trafić do wyniku.

========================================
SKĄD BRAĆ DANE (KLUCZOWE)
========================================

DANE WŁAŚCICIELI pobieraj WYŁĄCZNIE z sekcji:
- "WŁAŚCICIELE"
- "WŁADAJĄCY"
- "WŁAŚCICIELE / WŁADAJĄCY"

DANE DZIAŁEK pobieraj WYŁĄCZNIE z tabeli działek oraz z linii:
- "Identyfikator działki"

========================================
ZASADY ADRESU (KRYTYCZNE)
========================================

Adres właściciela można pobrać WYŁĄCZNIE z linii zawierających:
- "Adres zameldowania na pobyt stały"
- "Adres siedziby"

Jeśli takiej linii NIE MA:
- ustaw "kod_pocztowy" jako pusty string
- ustaw "ulica_nr" jako pusty string
- ustaw "miejscowosc" jako pusty string

NIGDY nie pobieraj adresu z:
- nagłówka dokumentu
- pieczątek
- adresów urzędów

========================================
FILTR ANTY-URZĄD
========================================

Jeśli potencjalny adres zawiera słowa:
- "starosta"
- "starostwo"
- "urząd"
- "powiat"
- "miasto"

to uznaj go za NIEPRAWIDŁOWY i ustaw:
- "kod_pocztowy" jako pusty string
- "ulica_nr" jako pusty string
- "miejscowosc" jako pusty string

========================================
TERYT I DZIAŁKA
========================================

1. "teryt" musi zawierać PEŁNY identyfikator działki z linii:
"Identyfikator działki"
np. 160902_2.0002.AR_1.259/2

2. "nr_dzialki" ma zawierać sam numer działki,
np.:
- 259/2
- 313
- 477/42

3. "obreb" ma zawierać nazwę obrębu ewidencyjnego.

4. "gmina" ma zawierać nazwę gminy / jednostki ewidencyjnej, jeśli występuje w dokumencie.

========================================
POWIERZCHNIA
========================================

Pole "powierzchnia_ha" ma zawierać WYŁĄCZNIE całkowitą powierzchnię działki.

Jeżeli działka ma kilka klasoużytków i kilka powierzchni cząstkowych:
- NIE sumuj ich samodzielnie
- NIE wpisuj powierzchni cząstkowej
- wpisz tylko końcową powierzchnię całkowitą działki z dokumentu

========================================
KSIĘGA WIECZYSTA
========================================

Pole "nr_kw" ma zawierać numer księgi wieczystej dokładnie tak, jak występuje w dokumencie.
Nie poprawiaj formatu i niczego nie dopisuj.

========================================
WŁAŚCICIEL
========================================

Pole "wlasciciel_pelny" ma zawierać pełny opis właściciela lub właścicieli dokładnie według dokumentu.

Jeżeli właścicieli jest kilku:
- połącz ich w jeden pełny zapis tekstowy
- zachowaj informacje o udziałach, jeśli występują
- nie rozdzielaj na imię i nazwisko

========================================
BRAKI DANYCH
========================================

Jeśli danych brak:
- użyj pustego stringu

Nie zmieniaj nazw pól.
Nie zmieniaj struktury JSON.
Nie poprawiaj literówek z dokumentu.
Nie zgaduj.

========================================
CEL
========================================

Wynik ma być gotowy do importu do Excel.

BŁĘDNY ADRES = KRYTYCZNY BŁĄD
LEPIEJ DAĆ PUSTY STRING NIŻ ZGADYWAĆ.` },
          ...imageParts,
        ]
      },
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              teryt: { type: Type.STRING },
              gmina: { type: Type.STRING },
              obreb: { type: Type.STRING },
              nr_dzialki: { type: Type.STRING },
              powierzchnia_ha: { type: Type.STRING },
              nr_kw: { type: Type.STRING },
              wlasciciel_pelny: { type: Type.STRING },
              kod_pocztowy: { type: Type.STRING },
              ulica_nr: { type: Type.STRING },
              miejscowosc: { type: Type.STRING }
            },
            required: ["teryt", "nr_dzialki", "wlasciciel_pelny", "kod_pocztowy", "ulica_nr", "miejscowosc"]
          }
        }
      }
    });

    const text = response.text || "[]";
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (err: any) {
    console.error("Gemini Error:", err);
    if (err.message?.includes("XHR") || err.message?.includes("failed")) {
      throw new Error("Przekroczono limit danych dla jednej sesji. Spróbuj podzielić PDF na mniejsze części (np. po 20 stron).");
    }
    throw err;
  }
};

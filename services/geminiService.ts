import { GoogleGenAI, Type } from "@google/genai";
import { ParcelData } from "../types";

export const extractDataFromImages = async (base64Images: string[]): Promise<ParcelData[]> => {
  const apiKey = "AIzaSyAgEQG37COq23yjRq8Z87_jK8wyh1ngVjo";
  
  if (!apiKey || apiKey === 'undefined' || apiKey.length < 5) {
    throw new Error("Brak klucza API. Ustaw zmienną VITE_GEMINI_API_KEY w pliku .env.local.");
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
          ...imageParts,
          { text: `Jesteś ekspertem ds. ewidencji gruntów. Przeanalizuj CAŁY dokument (wszystkie strony).
          
          NAJWAŻNIEJSZE ZASADY:
          1. WYKRYJ WSZYSTKIE DZIAŁKI: Dokument może zawierać tabele na wielu stronach. Nie pomiń żadnej działki!
          2. ADRES WŁAŚCICIELA - ROZBIJ NA 3 POLA:
             - kod_pocztowy: format 00-000.
             - ulica_nr: ulica i numer (np. "ul. Polna 10" lub "Miejscowość 44" jeśli brak ulicy).
             - miejscowosc: sama nazwa (np. "Opole").
          3. TERYT: Wyodrębnij PEŁNY identyfikator, np. 160902_2.0002.AR_1.259/2.
          4. CIĄGŁOŚĆ: Jeśli właściciel jest wymieniony tylko na 1. stronie, przypisz go do KAŻDEJ działki na wszystkich kolejnych stronach.
          
          Zwróć wynik jako czysty JSON.` }
        ]
      },
      config: {
        temperature: 0.1,
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

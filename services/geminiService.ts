import OpenAI from "openai";
import { ParcelData } from "../types";

type ExtractField =
  | "teryt"
  | "gmina"
  | "obreb"
  | "nr_dzialki"
  | "powierzchnia_ha"
  | "nr_kw"
  | "wlasciciel_pelny"
  | "imiona"
  | "nazwisko"
  | "kod_pocztowy"
  | "ulica_nr"
  | "miejscowosc";

const ALL_FIELDS: ExtractField[] = [
  "teryt",
  "gmina",
  "obreb",
  "nr_dzialki",
  "powierzchnia_ha",
  "nr_kw",
  "wlasciciel_pelny",
  "imiona",
  "nazwisko",
  "kod_pocztowy",
  "ulica_nr",
  "miejscowosc",
];

const FIELD_DESCRIPTIONS: Record<ExtractField, string> = {
  teryt: 'pełny identyfikator działki z linii "Identyfikator działki"',
  gmina: 'nazwa gminy / jednostki ewidencyjnej z dokumentu',
  obreb: 'nazwa obrębu ewidencyjnego z dokumentu',
  nr_dzialki: 'sam numer działki, np. 259/2 albo 313',
  powierzchnia_ha: 'wyłącznie całkowita powierzchnia działki',
  nr_kw: 'numer księgi wieczystej dokładnie jak w dokumencie',
  wlasciciel_pelny: 'pełny czytelny zapis właściciela / właścicieli bez PESEL i bez fragmentów typu rodzice',
  imiona: 'same imiona właściciela / właścicieli, bez nazwiska; dla instytucji pusty string',
  nazwisko: 'samo nazwisko; dla instytucji pełna nazwa podmiotu',
  kod_pocztowy: 'kod pocztowy z linii adresowej właściciela',
  ulica_nr: 'ulica i numer z linii adresowej właściciela',
  miejscowosc: 'miejscowość z linii adresowej właściciela',
};

const BASE_REQUIRED_FIELDS: ExtractField[] = ["teryt", "nr_dzialki"];

const sanitizeSelectedFields = (selectedFields?: ExtractField[]): ExtractField[] => {
  const raw = selectedFields && selectedFields.length > 0 ? selectedFields : ALL_FIELDS;
  const merged = [...BASE_REQUIRED_FIELDS, ...raw];
  return Array.from(new Set(merged)).filter((field): field is ExtractField => ALL_FIELDS.includes(field as ExtractField));
};

const buildResponseSchema = (selectedFields: ExtractField[]) => {
  const properties = Object.fromEntries(
    selectedFields.map((field) => [field, { type: "string" }])
  );

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties,
          required: selectedFields,
        },
      },
    },
    required: ["items"],
  } as const;
};

const buildFieldInstructions = (selectedFields: ExtractField[]) => {
  return selectedFields
    .map((field) => `- ${field}: ${FIELD_DESCRIPTIONS[field]}`)
    .join("\n");
};

const buildPrompt = (selectedFields: ExtractField[]) => `Jesteś systemem do precyzyjnej ekstrakcji danych z polskich wypisów z rejestru gruntów.

Twoim zadaniem jest WYŁĄCZNIE wyciągnięcie danych właścicieli i działek do formatu JSON zgodnego dokładnie ze schematem odpowiedzi.

WYODRĘBNIJ TYLKO TE POLA:
${buildFieldInstructions(selectedFields)}

========================================
ZASADY OGÓLNE (BEZWZGLĘDNE)
========================================

1. ZWRACAJ WYŁĄCZNIE CZYSTY JSON
- bez komentarzy
- bez tekstu przed i po
- bez markdown
- bez wyjaśnień
- zwróć obiekt JSON w formacie: { "items": [ ... ] }
- każdy rekord ma zawierać WYŁĄCZNIE pola wskazane w schemacie odpowiedzi

2. JEDEN REKORD = JEDNA DZIAŁKA
- każda działka ma osobny rekord
- jeśli działka ma kilku właścicieli, rozbij ich na pola zgodnie z zasadami poniżej
- dla osób fizycznych wpisuj imiona do pola "imiona" i nazwisko wspólne do pola "nazwisko"
- przykład: „Adam Kowalski, Ewa Kowalska” -> imiona: "Adam, Ewa", nazwisko: "Kowalski / Kowalska"
- pole "wlasciciel_pelny" nadal wypełniaj pełnym czytelnym zapisem właściciela / właścicieli
- nie twórz osobnych rekordów dla udziałów, jeśli dokument przypisuje właścicieli do jednej jednostki rejestrowej

3. NIE WOLNO:
- grupować działek
- sumować powierzchni
- zgadywać brakujących danych
- dopisywać danych spoza dokumentu
- zmieniać polskich znaków na wersje bez znaków
- upraszczać nazwisk ani nazw miejscowości
- pomijać poprawnego adresu z linii adresowej właściciela

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
- adres rozbijaj dokładnie tak:
  - kod_pocztowy = kod w formacie XX-XXX, np. 47-316
  - miejscowosc = nazwa miejscowości po kodzie pocztowym, np. MALNIA
  - ulica_nr = pozostała część adresu po miejscowości, np. BOCZNA 2 albo UL. OPOLSKA 79
- jeśli adres jest podany w tej linii, nie zostawiaj pustych pól adresowych
- adres z linii właściciela ma pierwszeństwo nad nagłówkiem strony
- dla podmiotów instytucjonalnych poprawnym adresem jest pełny adres z linii "Adres siedziby"
- jeśli właścicielem jest np. gmina, skarb państwa, urząd, spółka albo inny podmiot instytucjonalny i w sekcji właściciela występuje linia "Adres siedziby", to MUSISZ przepisać ten adres do pól: "kod_pocztowy", "miejscowosc", "ulica_nr"
- dla podmiotów instytucjonalnych pusty adres jest błędem, jeżeli linia "Adres siedziby" jest obecna

Jeśli takiej linii NIE MA:
- ustaw "kod_pocztowy" jako pusty string
- ustaw "ulica_nr" jako pusty string
- ustaw "miejscowosc" jako pusty string

NIGDY nie pobieraj adresu z:
- nagłówka dokumentu
- pieczątek
- adresów urzędów, jeśli nie występują bezpośrednio przy właścicielu jako "Adres siedziby"

========================================
FILTR ANTY-URZĄD
========================================

Za błędny adres urzędowy uznawaj tylko adres z nagłówka, pieczątki lub sekcji urzędu.

Jeśli adres pochodzi z linii:
- "Adres zameldowania na pobyt stały"
- "Adres siedziby"
to traktuj go jako poprawny adres właściciela, nawet jeśli na stronie występuje też adres starostwa lub urzędu.

UWAGA: dla gmin, urzędów, skarbu państwa, spółek i innych instytucji adres z linii "Adres siedziby" NIE jest adresem urzędowym do odrzucenia — to jest właściwy adres właściciela i trzeba go wpisać do wyniku.

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

Pole "wlasciciel_pelny" ma zawierać pełny czytelny zapis właściciela / właścicieli dokładnie jak w dokumencie, z zachowaniem polskich znaków, ale bez fragmentów typu "rodzice:" i bez PESEL; zachowaj udziały jeśli są
- dla osób fizycznych dodatkowo rozbij dane na:
  - "imiona" = same imiona właściciela / właścicieli, bez nazwiska
  - "nazwisko" = samo nazwisko; jeśli jest wspólne dla kilku osób, wpisz je raz
- przykład: „Adam i Ewa Kowalscy” -> imiona: "Adam, Ewa", nazwisko: "Kowalscy"
- jeśli właścicielem nie jest osoba fizyczna, tylko urząd, gmina, skarb państwa, spółka albo inny podmiot instytucjonalny, to:
  - wpisz pełną nazwę podmiotu do pola "nazwisko"
  - pole "imiona" ustaw jako pusty string
- usuń z opisu właściciela wszystkie fragmenty typu "rodzice:", "PESEL:" oraz podobne dane osobowe
- nie zmieniaj liter takich jak: Ł, ł, Ó, ó, Ż, ż, Ź, ź, Ć, ć, Ś, ś, Ą, ą, Ę, ę, Ń, ń

========================================
BRAKI DANYCH
========================================

Jeśli danych brak:
- użyj pustego stringu
- ale jeśli dana występuje wyraźnie w dokumencie, przepisz ją dokładnie, nie upraszczaj
- szczególnie dla podmiotów instytucjonalnych: jeżeli występuje "Adres siedziby", pola adresowe NIE mogą być puste

Nie zmieniaj nazw pól.
Nie zmieniaj struktury JSON.
Nie poprawiaj literówek z dokumentu.
Nie zgaduj.

========================================
CEL
========================================

Wynik ma być gotowy do importu do Excel.

BŁĘDNY ADRES = KRYTYCZNY BŁĄD
LEPIEJ DAĆ PUSTY STRING NIŻ ZGADYWAĆ.`;

const getClient = () => {
  const apiKey =
    localStorage.getItem("openai_api_key") ||
    localStorage.getItem("gemini_api_key") ||
    "";

  if (!apiKey || apiKey === "undefined" || apiKey.length < 20) {
    throw new Error("Brak klucza OpenAI API. Wprowadź klucz przed użyciem.");
  }

  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
};

const normalizeRecord = (
  partial: Partial<Record<ExtractField, string>>,
  requestedFields: ExtractField[]
): ParcelData => {
  const getValue = (field: ExtractField) => {
    if (requestedFields.includes(field)) {
      return typeof partial[field] === "string" ? partial[field] || "" : "";
    }
    return "";
  };

  return {
    teryt: getValue("teryt"),
    gmina: getValue("gmina"),
    obreb: getValue("obreb"),
    nr_dzialki: getValue("nr_dzialki"),
    powierzchnia_ha: getValue("powierzchnia_ha"),
    nr_kw: getValue("nr_kw"),
    wlasciciel_pelny: getValue("wlasciciel_pelny"),
    imiona: getValue("imiona"),
    nazwisko: getValue("nazwisko"),
    kod_pocztowy: getValue("kod_pocztowy"),
    ulica_nr: getValue("ulica_nr"),
    miejscowosc: getValue("miejscowosc"),
  };
};

export const extractDataFromImages = async (
  base64Images: string[],
  selectedFields?: ExtractField[]
): Promise<ParcelData[]> => {
  const client = getClient();
  const requestedFields = sanitizeSelectedFields(selectedFields);
  const responseSchema = buildResponseSchema(requestedFields);
  const prompt = buildPrompt(requestedFields);

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...base64Images.map((data) => ({
              type: "input_image" as const,
              image_url: `data:image/jpeg;base64,${data}`,
              detail: "high" as const,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "parcel_data_array",
          schema: responseSchema,
          strict: true,
        },
      },
    });

    console.log("OPENAI RAW RESPONSE:", response);

    const text = response.output_text?.trim() || '{"items":[]}';
    console.log("OPENAI TEXT:", text);

    try {
      const parsed = JSON.parse(text) as {
        items?: Partial<Record<ExtractField, string>>[];
      };

      return (parsed.items || []).map((item) => normalizeRecord(item, requestedFields));
    } catch (parseErr) {
      console.error("OPENAI JSON PARSE ERROR:", parseErr);
      console.error("OPENAI TEXT THAT FAILED TO PARSE:", text);
      throw new Error(`OpenAI zwrócił nieprawidłowy JSON: ${text.slice(0, 500)}`);
    }
  } catch (err: any) {
    console.error("OpenAI Error:", err);

    const status = err?.status || err?.code;
    const message = err?.message || "";

    if (status === 429 || message.toLowerCase().includes("rate limit")) {
      throw new Error("Przekroczono limit OpenAI API. Odczekaj chwilę i spróbuj ponownie albo zmniejsz rozmiar partii stron.");
    }

    if (message.toLowerCase().includes("api key")) {
      throw new Error("Nieprawidłowy klucz OpenAI API.");
    }

    throw new Error(`Błąd analizy dokumentu (OpenAI): ${message || "brak szczegółów"}`);
  }
};

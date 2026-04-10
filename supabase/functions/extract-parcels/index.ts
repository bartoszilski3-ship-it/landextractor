import { ParcelData } from "../types";
import { supabase } from "../lib/supabase";

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

const BASE_REQUIRED_FIELDS: ExtractField[] = ["teryt", "nr_dzialki"];

const sanitizeSelectedFields = (selectedFields?: ExtractField[]): ExtractField[] => {
  const raw = selectedFields && selectedFields.length > 0 ? selectedFields : ALL_FIELDS;
  const merged = [...BASE_REQUIRED_FIELDS, ...raw];
  return Array.from(new Set(merged)).filter(
    (field): field is ExtractField => ALL_FIELDS.includes(field as ExtractField)
  );
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
  const requestedFields = sanitizeSelectedFields(selectedFields);

  const { data, error } = await supabase.functions.invoke("extract-parcels", {
    body: {
      images: base64Images,
      prompt: "extract parcels",
      schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true
            }
          }
        }
      }
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  const parsed = JSON.parse(data.result || '{"items":[]}');

  return (parsed.items || []).map((item: any) =>
    normalizeRecord(item, requestedFields)
  );
};

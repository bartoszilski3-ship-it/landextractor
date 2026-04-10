export interface ParcelData {
  teryt: string;
  wojewodztwo: string;
  powiat: string;
  gmina: string;
  obreb: string;
  nr_obrebu: string;
  nr_dzialki: string;
  powierzchnia_ha: string;
  nr_kw: string;
  wlasciciel_pelny: string;
  imiona: string;
  nazwisko: string;
  kod_pocztowy: string;
  ulica_nr: string;
  miejscowosc: string;
}

export interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  error: string | null;
}

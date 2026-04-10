import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ParcelData, ProcessingState } from './types';
import { convertPdfToImages } from './services/pdfService';
import { extractDataFromImages } from './services/geminiService';
import ResultTable from './components/ResultTable';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

type ExtractField =
  | 'teryt'
  | 'gmina'
  | 'obreb'
  | 'nr_dzialki'
  | 'powierzchnia_ha'
  | 'nr_kw'
  | 'wlasciciel_pelny'
  | 'imiona'
  | 'nazwisko'
  | 'kod_pocztowy'
  | 'ulica_nr'
  | 'miejscowosc';


type PresetKey = 'basic' | 'land' | 'full' | 'custom';

type ViewMode = 'new' | 'history' | 'points';

type ExtractionHistoryItem = {
  id: string;
  original_file_name: string;
  page_count: number;
  points_spent: number;
  selected_fields: ExtractField[];
  result_json: ParcelData[];
  created_at: string;
};

type PointsHistoryItem = {
  id: string;
  label: string;
  points: number;
  created_at: string;
  description: string | null;
};

const FIELD_LABELS: Record<ExtractField, string> = {
  imiona: 'Imiona',
  nazwisko: 'Nazwisko',
  nr_dzialki: 'Numer działki',
  teryt: 'Pełny TERYT',
  obreb: 'Obręb',
  gmina: 'Gmina',
  nr_kw: 'Numer KW',
  powierzchnia_ha: 'Powierzchnia całkowita',
  kod_pocztowy: 'Kod pocztowy',
  miejscowosc: 'Miejscowość',
  ulica_nr: 'Ulica i numer',
  wlasciciel_pelny: 'Właściciel pełny',
};

const FIELD_GROUPS: { title: string; fields: ExtractField[] }[] = [
  {
    title: 'Właściciel',
    fields: ['imiona', 'nazwisko', 'kod_pocztowy', 'miejscowosc', 'ulica_nr'],
  },
  {
    title: 'Nieruchomość',
    fields: ['teryt', 'nr_dzialki', 'powierzchnia_ha', 'nr_kw', 'gmina', 'obreb'],
  },
];


const PRESETS: Record<Exclude<PresetKey, 'custom'>, ExtractField[]> = {
  full: ['imiona', 'nazwisko', 'wlasciciel_pelny', 'teryt', 'nr_dzialki', 'obreb', 'gmina', 'nr_kw', 'powierzchnia_ha', 'kod_pocztowy', 'miejscowosc', 'ulica_nr'],
  basic: [],
  land: [],
};

const escapeCsvValue = (value: unknown): string => {
  const stringValue = value == null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const buildCsvFromResults = (rows: ParcelData[], fields: ExtractField[]): string => {
  const safeFields = fields.length > 0 ? fields : (Object.keys(FIELD_LABELS) as ExtractField[]);
  const header = safeFields.map((field) => escapeCsvValue(FIELD_LABELS[field])).join(';');
  const body = rows.map((row) => {
    return safeFields
      .map((field) => escapeCsvValue((row as Record<string, unknown>)[field] ?? ''))
      .join(';');
  });

  return [header, ...body].join('\n');
};

const downloadCsvFile = (fileName: string, csvContent: string) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const App: React.FC = () => {
  const [extractedResults, setExtractedResults] = useState<ParcelData[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingPageCount, setPendingPageCount] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [userPoints, setUserPoints] = useState(0);
  const [isPointsLoading, setIsPointsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('new');
  const [historyItems, setHistoryItems] = useState<ExtractionHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [pointsTransactions, setPointsTransactions] = useState<PointsHistoryItem[]>([]);
  const [isPointsHistoryLoading, setIsPointsHistoryLoading] = useState(false);
  useEffect(() => {
    const loadPointsHistory = async () => {
      if (!session?.user?.id) {
        setPointsTransactions([]);
        return;
      }

      try {
        setIsPointsHistoryLoading(true);

        const { data, error } = await supabase
          .from('points_transactions')
          .select('id, label, points, created_at, description')
          .eq('auth_user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setPointsTransactions((data as PointsHistoryItem[]) ?? []);
      } catch (err) {
        console.error('LOAD POINTS HISTORY ERROR:', err);
      } finally {
        setIsPointsHistoryLoading(false);
      }
    };

    loadPointsHistory();
  }, [session, extractedResults]);
  useEffect(() => {
    const loadHistory = async () => {
      if (!session?.user?.id) {
        setHistoryItems([]);
        setIsHistoryLoading(false);
        return;
      }

      try {
        setIsHistoryLoading(true);

        const { data, error } = await supabase
          .from('extractions')
          .select('id, original_file_name, page_count, points_spent, selected_fields, result_json, created_at')
          .eq('auth_user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        setHistoryItems((data as ExtractionHistoryItem[]) ?? []);
      } catch (err) {
        console.error('SUPABASE HISTORY LOAD ERROR:', err);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    loadHistory();
  }, [session, extractedResults]);
  const handleLoadHistoryItem = useCallback((item: ExtractionHistoryItem) => {
    setSelectedPreset('custom');
    setSelectedFields(item.selected_fields ?? []);
    setExtractedResults(item.result_json ?? []);
    setPendingFile(null);
    setPendingImages([]);
    setPendingPageCount(0);
    setEstimatedCost(0);
    setStatus({ isProcessing: false, progress: 0, error: null });
    setViewMode('new');
  }, []);

  const filteredHistoryItems = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    if (!query) {
      return historyItems;
    }

    return historyItems.filter((item) => {
      return (
        item.original_file_name.toLowerCase().includes(query) ||
        new Date(item.created_at).toLocaleString('pl-PL').toLowerCase().includes(query)
      );
    });
  }, [historyItems, historySearch]);


  const totalHistoryPages = useMemo(() => {
    return historyItems.reduce((sum, item) => sum + (item.page_count || 0), 0);
  }, [historyItems]);

  const totalHistoryPointsSpent = useMemo(() => {
    return historyItems.reduce((sum, item) => sum + (item.points_spent || 0), 0);
  }, [historyItems]);

  const handleDeleteHistoryItem = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('extractions')
        .delete()
        .eq('id', itemId);

      if (error) {
        throw error;
      }

      setHistoryItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error('DELETE HISTORY ITEM ERROR:', err);
      setStatus((prev) => ({
        ...prev,
        error: 'Nie udało się usunąć wpisu z historii.',
      }));
    }
  }, []);

  const handleDownloadHistoryCsv = useCallback((item: ExtractionHistoryItem) => {
    const csvContent = buildCsvFromResults(item.result_json ?? [], item.selected_fields ?? []);
    const baseName = (item.original_file_name || 'zestawienie')
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9-_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, '_')
      .trim()
      .replace(/\s+/g, '_');

    downloadCsvFile(`${baseName || 'zestawienie'}_historia.csv`, csvContent);
  }, []);
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('land');
  const [selectedFields, setSelectedFields] = useState<ExtractField[]>(PRESETS.land);
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    error: null,
  });
  const [authInfoMessage, setAuthInfoMessage] = useState('');

  const checkKeyStatus = useCallback(() => {
    const savedKey = localStorage.getItem('openai_api_key') || localStorage.getItem('gemini_api_key');
    setHasApiKey(!!savedKey && savedKey !== 'undefined' && savedKey.length > 10);
  }, []);

  useEffect(() => {
    checkKeyStatus();
  }, [checkKeyStatus]);

  const userEmail = useMemo(() => session?.user?.email ?? '', [session]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsAuthLoading(true);
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        setSession(data.session ?? null);
      } catch (err) {
        console.error('SUPABASE AUTH INIT ERROR:', err);
        setStatus((prev) => ({
          ...prev,
          error: 'Nie udało się zainicjalizować logowania.',
        }));
      } finally {
        setIsAuthLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadUserPoints = async () => {
      if (!session?.user?.id) {
        setUserPoints(0);
        setIsPointsLoading(false);
        return;
      }

      try {
        setIsPointsLoading(true);

        const { data, error } = await supabase
          .from('users')
          .select('points')
          .eq('auth_user_id', session.user.id)
          .single();

        if (error) {
          throw error;
        }

        setUserPoints(data?.points ?? 0);
      } catch (err) {
        console.error('SUPABASE POINTS LOAD ERROR:', err);
        setStatus((prev) => ({
          ...prev,
          error: 'Nie udało się pobrać salda punktów z bazy.',
        }));
      } finally {
        setIsPointsLoading(false);
      }
    };

    loadUserPoints();
  }, [session]);

  const handleSaveApiKey = useCallback(() => {
    const trimmed = apiKeyInput.trim();

    if (!trimmed || trimmed.length < 10) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: 'Wklej poprawny klucz OpenAI API.',
      });
      return;
    }

    localStorage.setItem('openai_api_key', trimmed);
    setHasApiKey(true);
    setStatus({ isProcessing: false, progress: 0, error: null });
    setApiKeyInput('');
  }, [apiKeyInput]);

  const handleAuthSubmit = useCallback(async () => {
    const email = authEmailInput.trim();
    const password = authPasswordInput.trim();

    if (!email || !password) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: 'Wpisz e-mail i hasło.',
      });
      return;
    }

    try {
      setIsAuthLoading(true);
      setAuthInfoMessage('');
      setStatus({ isProcessing: false, progress: 0, error: null });

      if (authMode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        setAuthInfoMessage('Sprawdź skrzynkę mailową i kliknij link aktywacyjny. Po potwierdzeniu wrócisz do aplikacji z aktywnym kontem i pakietem startowym 100 punktów.');
        setAuthPasswordInput('');
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        setAuthInfoMessage('');
      }

      setAuthPasswordInput('');
    } catch (err: any) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: err.message || 'Nie udało się zalogować.',
      });
    } finally {
      setIsAuthLoading(false);
    }
  }, [authEmailInput, authPasswordInput, authMode]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserPoints(0);
    setPendingFile(null);
    setPendingImages([]);
    setPendingPageCount(0);
    setEstimatedCost(0);
    setExtractedResults([]);
    setHistoryItems([]);
    setViewMode('new');
    setHistorySearch('');
    setAuthInfoMessage('');
    setStatus({ isProcessing: false, progress: 0, error: null });
  }, []);

  const handleClearApiKey = useCallback(() => {
    localStorage.removeItem('openai_api_key');
    localStorage.removeItem('gemini_api_key');
    setHasApiKey(false);
    setExtractedResults([]);
    setPendingFile(null);
    setPendingImages([]);
    setPendingPageCount(0);
    setEstimatedCost(0);
    setUserPoints(0);
    setIsPointsLoading(true);
    localStorage.removeItem('landextractor_user_email');
    localStorage.removeItem('landextractor_user_id');
    setApiKeyInput('');
    setAuthInfoMessage('');
    setStatus({ isProcessing: false, progress: 0, error: null });
  }, []);

  const resetState = useCallback(() => {
    setExtractedResults([]);
    setPendingFile(null);
    setPendingImages([]);
    setPendingPageCount(0);
    setEstimatedCost(0);
    setViewMode('new');
    setHistorySearch('');
    setStatus({ isProcessing: false, progress: 0, error: null });
  }, []);

  const handlePresetSelect = useCallback((preset: PresetKey) => {
    setSelectedPreset(preset);

    if (preset !== 'custom') {
      setSelectedFields(PRESETS[preset]);
    }
  }, []);

  const handleFieldToggle = useCallback((field: ExtractField) => {
    setSelectedPreset('custom');
    setSelectedFields((prev) => {
      if (prev.includes(field)) {
        return prev.filter((item) => item !== field);
      }
      return [...prev, field];
    });
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!session?.user) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: 'Zaloguj się, aby rozpocząć analizę.',
      });
      return;
    }

    if (selectedFields.length === 0) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: 'Wybierz przynajmniej jedno pole do wyodrębnienia.',
      });
      return;
    }

    if (estimatedCost > userPoints) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: `Masz za mało punktów. Potrzebujesz ${estimatedCost}, a dostępne saldo to ${userPoints}.`,
      });
      return;
    }

    setStatus({ isProcessing: true, progress: 10, error: null });
    setExtractedResults([]);

    try {
      const images = pendingImages.length > 0 ? pendingImages : await convertPdfToImages(file);
      const totalPages = images.length;
      const calculatedCost = totalPages;

      console.log("TOTAL PAGES:", totalPages);
      console.log("ESTIMATED COST:", calculatedCost);
      setStatus((prev) => ({ ...prev, progress: 30 }));

      const chunkSize = 1;
      let allResults: ParcelData[] = [];

      for (let i = 0; i < images.length; i += chunkSize) {
        const chunk = images.slice(i, i + chunkSize);

        console.log(
          `Processing pages ${i + 1}-${Math.min(i + chunkSize, images.length)}`
        );

        const partialResults = await extractDataFromImages(chunk, selectedFields);

        allResults = [...allResults, ...partialResults];

        setStatus((prev) => ({
          ...prev,
          progress: Math.min(
            90,
            30 + (60 * (i + chunk.length)) / images.length
          ),
        }));
      }

      // Deduct points securely via RPC
      const { data: newPointsBalance, error: deductPointsError } = await supabase
        .rpc('deduct_points_secure', {
          points_to_deduct: calculatedCost,
        });

      if (deductPointsError) {
        if (deductPointsError.message?.includes('NOT_AUTHENTICATED')) {
          throw new Error('Sesja wygasła. Zaloguj się ponownie.');
        }
        throw deductPointsError;
      }

      // Save extraction history
      const { error: historyError } = await supabase
        .from('extractions')
        .insert({
          auth_user_id: session.user.id,
          original_file_name: file.name,
          page_count: totalPages,
          points_spent: calculatedCost,
          selected_fields: selectedFields,
          result_json: allResults,
        });

      if (historyError) {
        console.error('SAVE HISTORY ERROR:', historyError);
      }

      setExtractedResults(allResults);
      setUserPoints(newPointsBalance ?? (userPoints - calculatedCost));
      setPendingFile(null);
      setPendingImages([]);
      setPendingPageCount(0);
      setEstimatedCost(0);
      setStatus({ isProcessing: false, progress: 100, error: null });
    } catch (err: any) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: err.message || 'Błąd analizy dokumentu.',
      });
    }
  }, [selectedFields, pendingImages, estimatedCost, userPoints, session]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setStatus((prev) => ({ ...prev, error: 'Wymagany plik PDF.' }));
      return;
    }

    setStatus({ isProcessing: true, progress: 5, error: null });
    setExtractedResults([]);

    try {
      const images = await convertPdfToImages(file);
      const totalPages = images.length;
      const cost = totalPages;

      setPendingFile(file);
      setPendingImages(images);
      setPendingPageCount(totalPages);
      setEstimatedCost(cost);

      console.log('TOTAL PAGES:', totalPages);
      console.log('ESTIMATED COST:', cost);

      setStatus({ isProcessing: false, progress: 0, error: null });
    } catch (err: any) {
      setPendingFile(null);
      setPendingImages([]);
      setPendingPageCount(0);
      setEstimatedCost(0);
      setStatus({
        isProcessing: false,
        progress: 0,
        error: err.message || 'Nie udało się odczytać liczby stron PDF.',
      });
    }

    event.target.value = '';
  }, []);

  const handleStartExtraction = useCallback(async () => {
    if (!pendingFile) {
      setStatus((prev) => ({ ...prev, error: 'Najpierw wgraj plik PDF.' }));
      return;
    }

    await processFile(pendingFile);
  }, [pendingFile, processFile]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 font-black text-indigo-600 animate-pulse uppercase tracking-widest">
        Ładowanie sesji...
      </div>
    );
  }

  if (hasApiKey === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 font-black text-indigo-600 animate-pulse uppercase tracking-widest">
        Inicjalizacja systemu...
      </div>
    );
  }
  if (!session) {
    return (
      <div className="max-w-[1900px] mx-auto px-6 py-10 min-h-screen font-sans text-slate-900">
        <header className="mb-12 flex flex-col items-center text-center">
          <h1 className="text-6xl font-black text-slate-900 mb-2 uppercase">
            <span className="text-indigo-600">LAND</span>EXTRACTOR
          </h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em]">
            Logowanie użytkownika
          </p>
        </header>

        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl p-10 text-center">
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthInfoMessage('');
                  setStatus((prev) => ({ ...prev, error: null }));
                }}
                className={`rounded-2xl px-4 py-4 font-black border transition ${authMode === 'login' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 border-slate-200'}`}
              >
                Logowanie
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthInfoMessage('');
                  setStatus((prev) => ({ ...prev, error: null }));
                }}
                className={`rounded-2xl px-4 py-4 font-black border transition ${authMode === 'register' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 border-slate-200'}`}
              >
                Rejestracja
              </button>
            </div>

            <h2 className="text-3xl font-black mb-4">
              {authMode === 'register' ? 'Załóż konto' : 'Zaloguj się'}
            </h2>

            <p className="text-slate-600 mb-6">
              Konto jest wymagane do bezpiecznej obsługi punktów i historii użycia.
            </p>

            <input
              type="email"
              value={authEmailInput}
              onChange={(e) => setAuthEmailInput(e.target.value)}
              placeholder="E-mail"
              className="w-full border border-slate-300 rounded-2xl px-5 py-4 mb-4"
            />

            <input
              type="password"
              value={authPasswordInput}
              onChange={(e) => setAuthPasswordInput(e.target.value)}
              placeholder="Hasło"
              className="w-full border border-slate-300 rounded-2xl px-5 py-4 mb-4"
            />

            <button
              onClick={handleAuthSubmit}
              disabled={isAuthLoading}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black disabled:bg-slate-300 disabled:text-slate-500"
            >
              {isAuthLoading ? 'Ładowanie...' : authMode === 'register' ? 'Utwórz konto' : 'Zaloguj się'}
            </button>

            {authInfoMessage && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 font-semibold text-sm leading-relaxed">
                {authInfoMessage}
              </div>
            )}

            {status.error && (
              <div className="mt-4 text-red-600 font-bold">{status.error}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="max-w-[1900px] mx-auto px-6 py-10 min-h-screen font-sans text-slate-900">
        <header className="mb-12 flex flex-col items-center text-center">
          <h1 className="text-6xl font-black text-slate-900 mb-2 uppercase">
            <span className="text-indigo-600">LAND</span>EXTRACTOR
          </h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em]">
            Wymagany klucz API
          </p>
        </header>

        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl p-10 text-center">
            <h2 className="text-3xl font-black mb-4">Wklej klucz OpenAI API</h2>

            <p className="text-slate-600 mb-6">
              Klucz zapisuje się lokalnie w przeglądarce.
            </p>

            <input
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              className="w-full border border-slate-300 rounded-2xl px-5 py-4 mb-4"
            />

            <button
              onClick={handleSaveApiKey}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black"
            >
              Wejdź do generatora
            </button>

            {status.error && (
              <div className="mt-4 text-red-600 font-bold">{status.error}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {status.isProcessing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm text-white">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-6"></div>

          <h2 className="text-2xl font-black mb-2 uppercase tracking-widest">
            Analizuję dokument...
          </h2>

          <p className="text-sm text-white/70 mb-4">To może potrwać chwilę</p>

          <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>

          <div className="mt-2 text-xs text-white/60">{Math.round(status.progress)}%</div>
        </div>
      )}

      <div className="min-h-screen font-sans text-slate-900 bg-cover bg-center relative">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center"></div>
        <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px]"></div>
        <div className="relative z-10 max-w-[1900px] mx-auto px-6 py-10">
        <header className="mb-12 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 backdrop-blur px-4 py-2 text-[11px] font-black uppercase tracking-[0.35em] text-indigo-600 shadow-sm mb-5">
            Premium extraction engine
          </div>
          <h1 className="text-7xl md:text-8xl font-black text-slate-900 mb-3 uppercase tracking-tight drop-shadow-sm">
            <span className="text-indigo-600">LAND</span>EXTRACTOR
          </h1>

          <p className="max-w-2xl text-slate-600 text-lg leading-relaxed">
            Automatyczne zestawienia z wypisów z rejestru gruntów. Wybierasz zakres danych, a system generuje gotowy wynik w premium układzie.
          </p>

          <div className="mt-6 inline-flex items-center gap-3 rounded-[1.25rem] bg-white/85 px-5 py-3 border border-slate-200 shadow-sm">
            <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Saldo punktów</span>
            <span className="text-2xl font-black text-indigo-600">{isPointsLoading ? '...' : userPoints}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">{userEmail}</p>

          <div className="mt-6 w-full max-w-4xl rounded-[2rem] bg-white/85 border border-slate-200 shadow-sm p-6">
            <div className="mb-4">
              <h2 className="text-2xl font-black text-slate-900">Doładuj punkty</h2>
              <p className="text-slate-600 mt-2">Kup pakiet punktów i wróć do ekstraktora. Po opłaceniu doładujesz konto odpowiednią liczbą punktów.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a
                href="https://secure.tpay.com/?h=f4b3c6a2cb39e7856b7519405d8acabf8c1c8413"
                target="_blank"
                rel="noreferrer"
                className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="text-sm font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Pakiet startowy</div>
                <div className="text-3xl font-black text-slate-900">100 pkt</div>
                <div className="mt-2 text-lg font-bold text-indigo-600">9 zł</div>
                <div className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white px-4 py-2 font-black">Kup pakiet</div>
              </a>

              <a
                href="https://secure.tpay.com/?h=32e025b24be3931b46868ff66789d9c4d72c6c07"
                target="_blank"
                rel="noreferrer"
                className="rounded-[1.5rem] border border-indigo-200 bg-indigo-50 px-5 py-5 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="text-sm font-black uppercase tracking-[0.25em] text-indigo-600 mb-2">Najczęściej wybierany</div>
                <div className="text-3xl font-black text-slate-900">500 pkt</div>
                <div className="mt-2 text-lg font-bold text-indigo-600">29 zł</div>
                <div className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white px-4 py-2 font-black">Kup pakiet</div>
              </a>

              <a
                href="https://secure.tpay.com/?h=16ca9c7b714c17d0af9992bf093c225e519c507c"
                target="_blank"
                rel="noreferrer"
                className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="text-sm font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Pakiet firmowy</div>
                <div className="text-3xl font-black text-slate-900">2000 pkt</div>
                <div className="mt-2 text-lg font-bold text-indigo-600">79 zł</div>
                <div className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white px-4 py-2 font-black">Kup pakiet</div>
              </a>
            </div>
          </div>

          <div className="mt-4 flex gap-4 items-center">
            <button
              onClick={handleLogout}
              className="text-xs text-slate-600 underline"
            >
              Wyloguj
            </button>
            <button
              onClick={handleClearApiKey}
              className="text-xs text-red-500 underline"
            >
              Zmień klucz API
            </button>
          </div>
        </header>

        <div className="max-w-5xl mx-auto">
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => {
                setViewMode('new');
                setExtractedResults([]);
                setPendingFile(null);
                setPendingImages([]);
                setPendingPageCount(0);
                setEstimatedCost(0);
                setStatus({ isProcessing: false, progress: 0, error: null });
              }}
              className={`rounded-[1.5rem] px-6 py-4 font-black text-lg border transition-all duration-200 ${viewMode === 'new' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-slate-900 border-slate-200'}`}
            >
              Nowa analiza
            </button>
            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={`rounded-[1.5rem] px-6 py-4 font-black text-lg border transition-all duration-200 ${viewMode === 'history' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-slate-900 border-slate-200'}`}
            >
              Historia użycia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('points')}
              className={`rounded-[1.5rem] px-6 py-4 font-black text-lg border transition-all duration-200 ${viewMode === 'points' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-slate-900 border-slate-200'}`}
            >
              Historia punktów
            </button>
          </div>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-[1.5rem] bg-white/90 border border-slate-200 px-5 py-4 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Liczba analiz</div>
              <div className="text-3xl font-black text-slate-900">{historyItems.length}</div>
            </div>
            <div className="rounded-[1.5rem] bg-white/90 border border-slate-200 px-5 py-4 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Przetworzone strony</div>
              <div className="text-3xl font-black text-slate-900">{totalHistoryPages}</div>
            </div>
            <div className="rounded-[1.5rem] bg-white/90 border border-slate-200 px-5 py-4 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Zużyte punkty</div>
              <div className="text-3xl font-black text-indigo-600">{totalHistoryPointsSpent}</div>
            </div>
          </div>
          {viewMode === 'history' ? (
            <div className="bg-white/90 backdrop-blur rounded-[3rem] shadow-[0_20px_80px_rgba(15,23,42,0.12)] p-6 border border-white/70 overflow-hidden">
              <div className="mb-6">
                <h2 className="text-3xl font-black mb-2">Historia użycia</h2>
                <p className="text-slate-600">Tutaj możesz wrócić do wcześniej wygenerowanych zestawień i załadować je ponownie.</p>
                <div className="mt-4">
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Szukaj po nazwie pliku lub dacie..."
                    className="w-full border border-slate-300 rounded-2xl px-5 py-4"
                  />
                </div>
              </div>

              {isHistoryLoading ? (
                <div className="text-slate-500 font-semibold">Ładowanie historii...</div>
              ) : historyItems.length === 0 ? (
                <div className="text-slate-500 font-semibold">Brak zapisanych analiz.</div>
              ) : filteredHistoryItems.length === 0 ? (
                <div className="text-slate-500 font-semibold">Brak wyników dla podanej frazy.</div>
              ) : (
                <div className="space-y-4">
                  {filteredHistoryItems.map((item) => (
                    <div key={item.id} className="rounded-[1.5rem] bg-white border border-slate-200 px-5 py-5 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <div className="text-xl font-black text-slate-900">{item.original_file_name}</div>
                          <div className="mt-2 text-sm text-slate-500">
                            {new Date(item.created_at).toLocaleString('pl-PL')} • {item.page_count} stron • {item.points_spent} punktów
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={() => handleLoadHistoryItem(item)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black transition-all duration-200"
                          >
                            Załaduj wynik
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadHistoryCsv(item)}
                            className="bg-white hover:bg-slate-50 text-slate-900 px-5 py-3 rounded-2xl font-black border border-slate-200 transition-all duration-200"
                          >
                            Pobierz CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistoryItem(item.id)}
                            className="bg-white hover:bg-red-50 text-red-600 px-5 py-3 rounded-2xl font-black border border-red-200 transition-all duration-200"
                          >
                            Usuń
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : viewMode === 'points' ? (
            <div className="bg-white/90 backdrop-blur rounded-[3rem] shadow-[0_20px_80px_rgba(15,23,42,0.12)] p-6 border border-white/70 overflow-hidden">
              <div className="mb-6">
                <h2 className="text-3xl font-black mb-2">Historia punktów</h2>
                <p className="text-slate-600">Tutaj widzisz operacje zużycia punktów wynikające z dotychczasowych analiz.</p>
              </div>

              {isPointsHistoryLoading ? (
                <div className="text-slate-500 font-semibold">Ładowanie historii punktów...</div>
              ) : pointsTransactions.length === 0 ? (
                <div className="text-slate-500 font-semibold">Brak operacji punktowych.</div>
              ) : (
                <div className="space-y-4">
                  {pointsTransactions.map((item) => (
                    <div key={item.id} className="rounded-[1.5rem] bg-white border border-slate-200 px-5 py-5 shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <div className="text-xl font-black text-slate-900">{item.label}</div>
                          <div className="mt-2 text-sm text-slate-500">
                            {item.description || item.label} • {new Date(item.created_at).toLocaleString('pl-PL')}
                          </div>
                        </div>
                        <div className="text-2xl font-black text-red-600">{item.points}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : extractedResults.length === 0 ? (
            <div className="bg-white/90 backdrop-blur rounded-[3rem] shadow-[0_20px_80px_rgba(15,23,42,0.12)] p-4 border border-white/70 overflow-hidden">
              {!pendingFile ? (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-4 border-dashed rounded-[2.5rem] py-24 px-10 text-center relative shadow-inner">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    disabled={status.isProcessing}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />

                  <h2 className="text-3xl font-black">Wgraj PDF</h2>
                  <p className="text-slate-500 mt-4 font-medium">
                    Po wgraniu pliku wybierzesz zakres danych do wyodrębnienia.
                  </p>
                </div>
              ) : (
                <div className="p-10 md:p-12">
                  <div className="mb-8">
                    <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 text-indigo-700 px-4 py-2 text-xs font-black uppercase tracking-[0.35em] mb-4 shadow-sm">
                      Krok 2
                    </div>
                    <h2 className="text-5xl font-black mb-3 tracking-tight">Wybierz zakres danych</h2>
                    <p className="text-slate-600">
                      Plik: <span className="font-bold">{pendingFile.name}</span>
                    </p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-[1.5rem] bg-white border border-slate-200 px-5 py-4 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Liczba stron</div>
                        <div className="text-3xl font-black text-slate-900">{pendingPageCount}</div>
                      </div>
                      <div className="rounded-[1.5rem] bg-white border border-slate-200 px-5 py-4 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Koszt analizy</div>
                        <div className="text-3xl font-black text-indigo-600">{estimatedCost}</div>
                      </div>
                      <div className="rounded-[1.5rem] bg-white border border-slate-200 px-5 py-4 shadow-sm">
                        <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Saldo po analizie</div>
                        <div className={`text-3xl font-black ${userPoints - estimatedCost >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {userPoints - estimatedCost}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 bg-gradient-to-r from-indigo-50 to-white border border-indigo-100 rounded-[1.5rem] p-5 shadow-sm">
                      <p className="text-slate-600 text-base leading-relaxed">
                        Zaznacz wyłącznie te informacje, które mają trafić do finalnego zestawienia. Dzięki temu wynik będzie czystszy, bardziej czytelny i dopasowany do procesu klienta.
                      </p>
                    </div>
                  </div>

                  <div className="text-sm font-black uppercase tracking-wider text-slate-500 mb-4">
                    Presety
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('full')}
                      className={`rounded-[1.75rem] px-6 py-5 font-black text-lg border transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 ${selectedPreset === 'full' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 border-slate-200'}`}
                    >
                      Pełny
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetSelect('custom')}
                      className={`rounded-[1.75rem] px-6 py-5 font-black text-lg border transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 ${selectedPreset === 'custom' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 border-slate-200'}`}
                    >
                      Własny
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                    {FIELD_GROUPS.map((group) => (
                      <div key={group.title} className="bg-gradient-to-br from-white to-slate-50 rounded-[2rem] p-7 border border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.08)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-1">
                        <h3 className="text-2xl font-black mb-5 flex items-center gap-3 tracking-tight">
                          {group.title === 'Właściciel' ? '🧍' : '🏡'} {group.title}
                        </h3>
                        <div className="space-y-4">
                          {group.fields.map((field) => (
                            <label key={field} className="flex items-center gap-4 text-slate-800 font-semibold cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/40 transition">
                              <input
                                type="checkbox"
                                checked={selectedFields.includes(field)}
                                onChange={() => handleFieldToggle(field)}
                                className="w-6 h-6 rounded-lg border-2 border-indigo-500 checked:bg-indigo-600 checked:border-indigo-600 shadow-sm"
                              />
                              <span>{FIELD_LABELS[field]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <button
                      type="button"
                      onClick={handleStartExtraction}
                      disabled={status.isProcessing || isPointsLoading || estimatedCost > userPoints || pendingPageCount === 0}
                      className={`flex-1 py-5 rounded-[1.5rem] font-black text-lg transition-all duration-200 ${status.isProcessing || isPointsLoading || estimatedCost > userPoints || pendingPageCount === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-[0_12px_30px_rgba(79,70,229,0.35)] hover:-translate-y-0.5'}`}
                    >
                      {isPointsLoading ? 'Ładowanie salda...' : estimatedCost > userPoints ? 'Za mało punktów' : 'Generuj zestawienie'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFile(null);
                        setPendingImages([]);
                        setPendingPageCount(0);
                        setEstimatedCost(0);
                        setStatus({ isProcessing: false, progress: 0, error: null });
                      }}
                      className="flex-1 bg-white text-slate-900 py-5 rounded-[1.5rem] font-black border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      Wybierz inny plik
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ResultTable data={extractedResults} onReset={resetState} selectedFields={selectedFields} />
          )}

          {status.error && <div className="mt-6 text-red-600 font-bold">{status.error}</div>}
        </div>
      </div>
    </div>
    </>
  );
};

export default App;
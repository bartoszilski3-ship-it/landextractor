import React, { useState, useCallback, useEffect } from 'react';
import { ParcelData, ProcessingState } from './types';
import { convertPdfToImages } from './services/pdfService';
import { extractDataFromImages } from './services/geminiService';
import ResultTable from './components/ResultTable';

const App: React.FC = () => {
  const [extractedResults, setExtractedResults] = useState<ParcelData[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    error: null,
  });

  // 🔐 sprawdzanie klucza
  const checkKeyStatus = useCallback(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    setHasApiKey(!!savedKey && savedKey !== 'undefined' && savedKey.length > 10);
  }, []);

  useEffect(() => {
    checkKeyStatus();
  }, [checkKeyStatus]);

  // 💾 zapis klucza
  const handleSaveApiKey = useCallback(() => {
    const trimmed = apiKeyInput.trim();

    if (!trimmed || trimmed.length < 10) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: 'Wklej poprawny klucz Gemini API.',
      });
      return;
    }

    localStorage.setItem('gemini_api_key', trimmed);
    setHasApiKey(true);
    setStatus({ isProcessing: false, progress: 0, error: null });
    setApiKeyInput('');
  }, [apiKeyInput]);

  // 🧹 usunięcie klucza
  const handleClearApiKey = useCallback(() => {
    localStorage.removeItem('gemini_api_key');
    setHasApiKey(false);
    setExtractedResults([]);
    setApiKeyInput('');
    setStatus({ isProcessing: false, progress: 0, error: null });
  }, []);

  const resetState = useCallback(() => {
    setExtractedResults([]);
    setStatus({ isProcessing: false, progress: 0, error: null });
  }, []);

  // 📄 upload PDF + batch processing
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setStatus(prev => ({ ...prev, error: 'Wymagany plik PDF.' }));
      return;
    }

    setStatus({ isProcessing: true, progress: 10, error: null });
    setExtractedResults([]);

    try {
      const images = await convertPdfToImages(file);
      setStatus(prev => ({ ...prev, progress: 30 }));

      const chunkSize = 2;
      let allResults: ParcelData[] = [];

      for (let i = 0; i < images.length; i += chunkSize) {
        const chunk = images.slice(i, i + chunkSize);

        const partialResults = await extractDataFromImages(chunk);

        allResults = [...allResults, ...partialResults];

        setStatus(prev => ({
          ...prev,
          progress: Math.min(90, prev.progress + (60 / images.length) * chunkSize),
        }));
      }

      setExtractedResults(allResults);
      setStatus({ isProcessing: false, progress: 100, error: null });
    } catch (err: any) {
      setStatus({
        isProcessing: false,
        progress: 0,
        error: err.message || 'Błąd analizy dokumentu.',
      });
    }

    event.target.value = '';
  }, []);

  // ⏳ loading
  if (hasApiKey === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 font-black text-indigo-600 animate-pulse uppercase tracking-widest">
        Inicjalizacja systemu...
      </div>
    );
  }

  // 🔐 ekran logowania API
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
            <h2 className="text-3xl font-black mb-4">
              Wklej klucz Gemini API
            </h2>

            <p className="text-slate-600 mb-6">
              Klucz zapisuje się lokalnie w przeglądarce.
            </p>

            <input
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIza..."
              className="w-full border border-slate-300 rounded-2xl px-5 py-4 mb-4"
            />

            <button
              onClick={handleSaveApiKey}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black"
            >
              Wejdź do generatora
            </button>

            {status.error && (
              <div className="mt-4 text-red-600 font-bold">
                {status.error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 🚀 główna aplikacja
  return (
    <div className="max-w-[1900px] mx-auto px-6 py-10 min-h-screen font-sans text-slate-900">
      <header className="mb-12 flex flex-col items-center text-center">
        <h1 className="text-6xl font-black text-slate-900 mb-2 uppercase">
          <span className="text-indigo-600">LAND</span>EXTRACTOR
        </h1>

        <button
          onClick={handleClearApiKey}
          className="mt-4 text-xs text-red-500 underline"
        >
          Zmień klucz API
        </button>
      </header>

      <div className="max-w-4xl mx-auto">
        {extractedResults.length === 0 ? (
          <div className="bg-white rounded-[3rem] shadow-2xl p-4 border border-slate-100">
            <div className="bg-slate-50 border-4 border-dashed rounded-[2.5rem] py-24 px-10 text-center relative">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={status.isProcessing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              <h2 className="text-3xl font-black">
                {status.isProcessing ? 'Analiza...' : 'Wgraj PDF'}
              </h2>
            </div>
          </div>
        ) : (
          <ResultTable data={extractedResults} onReset={resetState} />
        )}

        {status.error && (
          <div className="mt-6 text-red-600 font-bold">
            {status.error}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
import React, { useState, useCallback, useEffect } from 'react';
import { ParcelData, ProcessingState } from './types';
import { convertPdfToImages } from './services/pdfService';
import { extractDataFromImages } from './services/geminiService';
import ResultTable from './components/ResultTable';

const App: React.FC = () => {
  const [extractedResults, setExtractedResults] = useState<ParcelData[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    error: null,
  });

  const checkKeyStatus = useCallback(() => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    setHasApiKey(!!apiKey && apiKey !== 'undefined' && apiKey.length > 10);
  }, []);

  useEffect(() => {
    checkKeyStatus();
  }, [checkKeyStatus]);

  const resetState = useCallback(() => {
    setExtractedResults([]);
    setStatus({ isProcessing: false, progress: 0, error: null });
  }, []);

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

      const results = await extractDataFromImages(images);

      setExtractedResults(results);
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

  if (hasApiKey === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 font-black text-indigo-600 animate-pulse uppercase tracking-widest">
        Inicjalizacja systemu...
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 px-6">
        <div className="bg-white border-2 border-red-200 p-12 rounded-[3rem] text-center shadow-2xl max-w-2xl w-full">
          <h2 className="text-3xl font-black mb-4 tracking-tight">Brak klucza API</h2>
          <p className="text-slate-600 leading-relaxed font-semibold">
            Ustaw zmienną <code>VITE_GEMINI_API_KEY</code> w pliku <code>.env.local</code>,
            a następnie uruchom aplikację ponownie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1900px] mx-auto px-6 py-10 min-h-screen font-sans text-slate-900">
      <header className="mb-12 flex flex-col items-center text-center">
        <div className="flex items-center space-x-2 mb-4">
          <span className="h-3 w-3 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(79,70,229,0.8)]"></span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Silnik: Gemini Pro
          </span>
        </div>

        <h1 className="text-6xl font-black text-slate-900 mb-2 tracking-tighter uppercase">
          <span className="text-indigo-600">LAND</span>EXTRACTOR
        </h1>

        <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em] mt-2">
          Profesjonalna ekstrakcja danych geodezyjnych
        </p>
      </header>

      <div className="max-w-4xl mx-auto">
        <div className="space-y-8">
          {extractedResults.length === 0 ? (
            <div className="bg-white rounded-[3rem] shadow-2xl p-4 border border-slate-100 overflow-hidden group">
              <div className="bg-slate-50 border-4 border-dashed border-slate-200 rounded-[2.5rem] py-24 px-10 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer relative text-center">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={status.isProcessing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />

                <div
                  className={`mx-auto w-24 h-24 rounded-3xl flex items-center justify-center mb-8 bg-white shadow-xl transition-transform duration-500 ${
                    status.isProcessing ? 'animate-spin' : 'group-hover:scale-110'
                  }`}
                >
                  {status.isProcessing ? (
                    <svg className="w-12 h-12 text-indigo-600" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg className="w-12 h-12 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  )}
                </div>

                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">
                  {status.isProcessing ? 'Praca modelu...' : 'Wgraj PDF do analizy'}
                </h2>

                <p className="mt-4 text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                  Analiza właścicieli, adresów i powierzchni
                </p>
              </div>
            </div>
          ) : (
            <ResultTable data={extractedResults} onReset={resetState} />
          )}
        </div>

        {status.error && (
          <div className="mt-8 p-6 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-2xl font-bold flex items-center space-x-3">
            <span>{status.error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
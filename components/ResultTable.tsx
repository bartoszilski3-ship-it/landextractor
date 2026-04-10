import React, { useMemo, useState } from 'react';
import { ParcelData } from '../types';

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

interface ResultTableProps {
  data: ParcelData[];
  onReset: () => void;
  selectedFields?: ExtractField[];
}

const FIELD_CONFIG: Record<ExtractField, { label: string; cellClassName?: string; render: (item: ParcelData) => React.ReactNode }> = {
  teryt: {
    label: 'Pełny TERYT / ID',
    render: (item) => (
      <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded select-all">
        {item.teryt || '-'}
      </span>
    ),
  },
  gmina: {
    label: 'Gmina',
    render: (item) => <span className="font-bold text-slate-700">{item.gmina || '-'}</span>,
  },
  obreb: {
    label: 'Obręb',
    render: (item) => <span className="font-bold text-slate-700">{item.obreb || '-'}</span>,
  },
  nr_dzialki: {
    label: 'Działka',
    render: (item) => <span className="font-black text-indigo-700 text-sm">{item.nr_dzialki || '-'}</span>,
  },
  powierzchnia_ha: {
    label: 'Pow [ha]',
    render: (item) => <span className="font-mono font-black text-slate-900">{item.powierzchnia_ha || '-'}</span>,
  },
  nr_kw: {
    label: 'KW',
    render: (item) => <span className="font-mono text-blue-800 text-[10px]">{item.nr_kw || '-'}</span>,
  },
  imiona: {
    label: 'Imiona',
    cellClassName: 'bg-indigo-50/10 border-l border-slate-200',
    render: (item) => <div className="font-black text-slate-900">{item.imiona || '-'}</div>,
  },
  nazwisko: {
    label: 'Nazwisko',
    cellClassName: 'bg-indigo-50/10',
    render: (item) => <div className="font-black text-slate-900">{item.nazwisko || '-'}</div>,
  },
  wlasciciel_pelny: {
    label: 'Właściciel',
    cellClassName: 'bg-indigo-50/10',
    render: (item) => <div className="font-black text-slate-900">{item.wlasciciel_pelny || '-'}</div>,
  },
  kod_pocztowy: {
    label: 'Kod pocztowy',
    cellClassName: 'bg-indigo-50/10',
    render: (item) => <span className="font-mono font-bold text-slate-600">{item.kod_pocztowy || '-'}</span>,
  },
  ulica_nr: {
    label: 'Ulica i nr',
    cellClassName: 'bg-indigo-50/10',
    render: (item) => <div className="italic text-slate-700">{item.ulica_nr || '-'}</div>,
  },
  miejscowosc: {
    label: 'Miejscowość',
    cellClassName: 'bg-indigo-50/10',
    render: (item) => <span className="font-bold uppercase text-slate-800">{item.miejscowosc || '-'}</span>,
  },
};

const DEFAULT_FIELD_ORDER: ExtractField[] = [
  'teryt',
  'gmina',
  'obreb',
  'nr_dzialki',
  'powierzchnia_ha',
  'nr_kw',
  'imiona',
  'nazwisko',
  'wlasciciel_pelny',
  'kod_pocztowy',
  'ulica_nr',
  'miejscowosc',
];

const ResultTable: React.FC<ResultTableProps> = ({ data, onReset, selectedFields }) => {
  const [copied, setCopied] = useState(false);

  const visibleFields = useMemo(() => {
    if (selectedFields && selectedFields.length > 0) {
      return DEFAULT_FIELD_ORDER.filter((field) => selectedFields.includes(field));
    }

    return DEFAULT_FIELD_ORDER.filter((field) =>
      data.some((item) => {
        const value = item[field];
        return typeof value === 'string' && value.trim() !== '';
      })
    );
  }, [data, selectedFields]);

  if (data.length === 0) return null;

  const copyToClipboard = () => {
    const headers = visibleFields.map((field) => FIELD_CONFIG[field].label);
    const rows = data.map((item) => visibleFields.map((field) => item[field] || ''));
    const tsvContent = headers.join("\t") + "\n" + rows.map((row) => row.map((val) => (val || '').toString().replace(/\t/g, ' ')).join("\t")).join("\n");
    navigator.clipboard.writeText(tsvContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadExcelCsv = () => {
    const headers = visibleFields.map((field) => FIELD_CONFIG[field].label);
    const rows = data.map((item) => visibleFields.map((field) => item[field] || ''));

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.map((val) => `"${(val || '').toString().replace(/"/g, '""')}"`).join(";"))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 10);

    link.setAttribute("href", url);
    link.setAttribute("download", `zestawienie_dzialek_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tableMinWidth = Math.max(1200, visibleFields.length * 170);

  return (
    <div className="mt-8 bg-white shadow-2xl rounded-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-slate-900 px-8 py-5 flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-white font-black text-xs tracking-[0.2em] uppercase">Zestawienie Danych Geodezyjnych</h2>
        <div className="flex gap-3">
          <button
            onClick={downloadExcelCsv}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            POBIERZ EXCEL
          </button>
          <button
            onClick={copyToClipboard}
            className={`${copied ? 'bg-green-600' : 'bg-indigo-600'} text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg shadow-indigo-900/20`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            {copied ? 'SKOPIOWANO!' : 'KOPIUJ DO SCHOWKA'}
          </button>
          <button
            onClick={onReset}
            className="bg-slate-700 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-slate-600 transition-colors"
          >
            NOWY PLIK
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] text-left border-collapse" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead className="sticky top-0 bg-slate-50 z-30 shadow-sm">
            <tr className="border-b border-slate-200">
              {visibleFields.map((field) => (
                <th
                  key={field}
                  className={`px-4 py-4 font-bold text-slate-500 uppercase tracking-wider ${FIELD_CONFIG[field].cellClassName ? 'bg-indigo-50/30' : ''}`}
                >
                  {FIELD_CONFIG[field].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item, index) => (
              <tr key={index} className="hover:bg-indigo-50/20 transition-colors">
                {visibleFields.map((field) => (
                  <td
                    key={`${index}-${field}`}
                    className={`px-4 py-4 ${FIELD_CONFIG[field].cellClassName || ''}`}
                  >
                    {FIELD_CONFIG[field].render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 font-black flex justify-between items-center">
        <span>Liczba znalezionych działek: {data.length}</span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]"></span>
          Dynamiczny widok kolumn
        </span>
      </div>
    </div>
  );
};

export default ResultTable;

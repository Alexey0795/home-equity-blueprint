import { useRef, useState } from 'react';
import { parseState, serializeState, type AppState } from '../state/appState';

interface Props {
  state: AppState;
  onImport: (state: AppState) => void;
}

/** Выгрузка всех данных в JSON-файл и загрузка обратно. */
export function DataFileButtons({ state, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function download() {
    const blob = new Blob([serializeState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Имя латиницей: Chromium отбрасывает имя с кириллицей у blob-ссылок и сохраняет «download».
    a.download = `ipoteka-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    // Отзываем ссылку с запасом, чтобы не оборвать начавшееся скачивание.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(file: File) {
    try {
      const imported = parseState(await file.text());
      if (window.confirm('Заменить текущие данные данными из файла?')) {
        onImport(imported);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="data-buttons">
      <button type="button" onClick={download}>Скачать JSON</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Загрузить JSON</button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
      {error && <span className="error">{error}</span>}
    </div>
  );
}

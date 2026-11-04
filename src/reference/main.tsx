import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReferenceContent } from '../ui/ReferenceContent';
import '../ui/styles.css';

/** Отдельная страница справки (reference.html) — открыть в соседней вкладке рядом с калькулятором. */
function ReferencePage() {
  return (
    <main>
      <header className="top">
        <h1>Справка: ставки и курсы НБРБ</h1>
        <div className="top-actions"><a href="./index.html">← К калькулятору</a></div>
      </header>
      <section className="card"><ReferenceContent /></section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReferencePage />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './ui/tokens.css';
import App from './App';
import { AudioEngine } from './audio/engine/AudioEngine';
import { Automix } from './audio/engine/Automix';
import { useLibrary } from './store/library';
import { useCrates } from './store/crates';
import { useAutomix } from './store/automix';
import { useMixer } from './store/mixer';
import { useDecks } from './store/decks';
import { useUi } from './store/ui';
import { useFx } from './store/fx';
import { useSampler } from './audio/engine/Sampler';
import { useDeckPrefs } from './store/deckPrefs';
import { LocalLibrary } from './services/localLibrary/LocalLibrary';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

// Debug/automation handle (also useful for power users & tests)
(window as any).djkado = { AudioEngine, Automix, LocalLibrary, stores: { useLibrary, useCrates, useAutomix, useMixer, useDecks, useUi, useFx, useSampler, useDeckPrefs } };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

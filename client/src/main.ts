import { Game } from './game/Game';

const game = new Game();
let disposed = false;

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__merkado = { game };
}

function shutdown(): void {
  if (disposed) return;
  disposed = true;
  try {
    game.dispose();
  } catch (error) {
    console.error('Failed to dispose the market cleanly.', error);
  }
}

function showFailure(error: unknown): void {
  console.error('Merkado De \'Colon failed to start.', error);
  const status = document.getElementById('boot-status');
  const tip = document.getElementById('boot-tip');
  if (status) {
    const detail = error instanceof Error ? error.message : String(error);
    status.textContent = `The market could not open: ${detail}`;
    status.style.color = '#e79b8f';
  }
  if (tip) {
    tip.textContent = 'Check the browser console for details, make sure WebGL is enabled, then reload.';
  }
}

void game.boot().catch(showFailure);

window.addEventListener('beforeunload', shutdown, { once: true });

window.addEventListener('error', (event) => {
  if (!document.getElementById('boot-screen')?.classList.contains('hidden')) {
    showFailure(event.error ?? event.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (!document.getElementById('boot-screen')?.classList.contains('hidden')) {
    showFailure(event.reason);
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(shutdown);
}

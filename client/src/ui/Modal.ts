export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
}

let active: ModalHandle | null = null;
let activeClose: (() => void) | null = null;

export function openModal(
  innerHtml: string,
  modalClass = '',
  onClose?: () => void,
): ModalHandle {
  closeActiveModal(true);
  const root = document.getElementById('overlay-root');
  if (!root) throw new Error('Overlay root missing');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${modalClass}" role="dialog" aria-modal="true">${innerHtml}</div>`;
  root.appendChild(backdrop);

  const modalEl = backdrop.querySelector<HTMLElement>('.modal')!;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.add('leaving');
    modalEl.classList.add('is-closing');
    document.removeEventListener('keydown', onKeyDown);
    active = null;
    activeClose = null;
    onClose?.();
    window.setTimeout(() => backdrop.remove(), 190);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) close();
  });
  modalEl.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      close();
    });
  });
  document.addEventListener('keydown', onKeyDown);

  const handle: ModalHandle = { el: modalEl, close };
  active = handle;
  activeClose = close;
  window.setTimeout(() => {
    modalEl.querySelector<HTMLElement>('button, input, select')?.focus({ preventScroll: true });
  }, 60);
  return handle;
}

export function closeActiveModal(immediate = false): void {
  if (activeClose) {
    activeClose();
  }
  active = null;
  activeClose = null;
  if (immediate) {
    const root = document.getElementById('overlay-root');
    if (root) root.innerHTML = '';
  }
}

export function isModalOpen(): boolean {
  return !!active;
}

export function modalHeader(options: {
  eyebrow?: string;
  eyebrowIcon?: string;
  title: string;
  subtitle?: string;
  right?: string;
  close?: boolean;
}): string {
  return `
    <div class="modal-head">
      <div class="modal-title-wrap">
        ${options.eyebrow ? `<div class="modal-eyebrow">${options.eyebrowIcon ? `<span class="icon">${options.eyebrowIcon}</span>` : ''}${options.eyebrow}</div>` : ''}
        <h2>${options.title}</h2>
        ${options.subtitle ? `<p class="modal-sub">${options.subtitle}</p>` : ''}
      </div>
      <div class="modal-head-side">
        ${options.right ?? ''}
        <button class="modal-close" type="button" data-modal-close aria-label="Close">✕</button>
      </div>
    </div>
  `;
}

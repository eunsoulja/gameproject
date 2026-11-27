/**
 * Tiny DOM confetti burst for milestone moments — goal stages, quest
 * completes, suki visits, big tips. Pure CSS animation, zero assets.
 */
export class Confetti {
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  burst(count = 36, originY = 0.32): void {
    const colors = ['#f0a43c', '#f0c14c', '#d94b3d', '#57c9a1', '#5aa7e8', '#d886d1', '#fff3d6'];
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      const left = 50 + (Math.random() - 0.5) * 30;
      const drift = (Math.random() - 0.5) * 260;
      const fall = 60 + Math.random() * 90;
      const spin = (Math.random() - 0.5) * 720;
      const size = 6 + Math.random() * 8;
      piece.style.left = `${left}%`;
      piece.style.top = `${originY * 100}%`;
      piece.style.width = `${size}px`;
      piece.style.height = `${size * (Math.random() > 0.4 ? 1 : 0.45)}px`;
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty('--dx', `${drift}px`);
      piece.style.setProperty('--dy', `${fall + 40}vh`);
      piece.style.setProperty('--rot', `${spin}deg`);
      piece.style.animationDuration = `${0.9 + Math.random() * 0.9}s`;
      piece.style.animationDelay = `${Math.random() * 0.15}s`;
      fragment.appendChild(piece);
    }
    this.root.appendChild(fragment);
    window.setTimeout(() => {
      this.root.querySelectorAll('.confetti-piece').forEach((el) => el.remove());
    }, 2600);
  }
}

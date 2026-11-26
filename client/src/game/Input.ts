export interface LookDelta {
  dx: number;
  dy: number;
}

/** Keyboard, mouse-drag, wheel and mobile controls for the night market. */
export class Input {
  private canvas: HTMLCanvasElement;
  private keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private wheelDelta = 0;
  private jumpQueued = false;
  private interactQueued = false;
  private helpQueued = false;
  private menuKey: string | null = null;
  private mobileMoveX = 0;
  private mobileMoveY = 0;
  private mobileSprint = false;
  private dragging = false;
  private dragPointer = -1;
  private dragLastX = 0;
  private dragLastY = 0;
  private joystickPointer = -1;
  private joystickCenter = { x: 0, y: 0 };
  private joystickRadius = 54;
  private enabled = true;
  private joystickKnob: HTMLElement | null;
  private joystickZone: HTMLElement | null;
  private detachFns: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.joystickZone = document.getElementById('joystick-zone');
    this.joystickKnob = this.joystickZone?.querySelector('.joystick-knob') ?? null;
    this.bind();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.dragging = false;
      this.canvas.classList.remove('dragging');
      this.mobileMoveX = 0;
      this.mobileMoveY = 0;
      this.resetKnob();
    }
  }

  private bind(): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.code === 'Space') event.preventDefault();
      if (event.repeat) return;
      this.keys.add(event.code);
      if (event.code === 'KeyE') this.interactQueued = true;
      if (event.code === 'KeyH') this.helpQueued = true;
      if (event.code === 'Space') this.jumpQueued = true;
      if (event.code === 'KeyB') this.menuKey = 'stock';
      if (event.code === 'KeyP') this.menuKey = 'boosts';
      if (event.code === 'KeyT') this.menuKey = 'stats';
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.keys.delete(event.code);
    };
    const onBlur = (): void => {
      this.keys.clear();
      this.mobileSprint = false;
      this.dragging = false;
      document.querySelectorAll('.mobile-action.active').forEach((el) => el.classList.remove('active'));
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.detachFns.push(() => window.removeEventListener('keydown', onKeyDown));
    this.detachFns.push(() => window.removeEventListener('keyup', onKeyUp));
    this.detachFns.push(() => window.removeEventListener('blur', onBlur));

    const onPointerDown = (event: PointerEvent): void => {
      if (!this.enabled) return;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      this.dragging = true;
      this.dragPointer = event.pointerId;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('dragging');
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!this.dragging || event.pointerId !== this.dragPointer) return;
      this.lookX += event.clientX - this.dragLastX;
      this.lookY += event.clientY - this.dragLastY;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
    };
    const endDrag = (event: PointerEvent): void => {
      if (event.pointerId !== this.dragPointer) return;
      this.dragging = false;
      this.dragPointer = -1;
      this.canvas.classList.remove('dragging');
    };
    const onWheel = (event: WheelEvent): void => {
      if (!this.enabled) return;
      event.preventDefault();
      this.wheelDelta += event.deltaY;
    };
    const onContext = (event: Event): void => event.preventDefault();

    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', onContext);
    this.detachFns.push(() => this.canvas.removeEventListener('pointerdown', onPointerDown));
    this.detachFns.push(() => this.canvas.removeEventListener('pointermove', onPointerMove));
    this.detachFns.push(() => this.canvas.removeEventListener('pointerup', endDrag));
    this.detachFns.push(() => this.canvas.removeEventListener('pointercancel', endDrag));
    this.detachFns.push(() => this.canvas.removeEventListener('wheel', onWheel));
    this.detachFns.push(() => this.canvas.removeEventListener('contextmenu', onContext));

    this.bindJoystick();
    this.bindMobileActions();
  }

  private bindJoystick(): void {
    const zone = this.joystickZone;
    if (!zone) return;

    const update = (event: PointerEvent): void => {
      const dx = event.clientX - this.joystickCenter.x;
      const dy = event.clientY - this.joystickCenter.y;
      const length = Math.hypot(dx, dy);
      const clamped = Math.min(length, this.joystickRadius);
      const nx = length > 0.001 ? (dx / length) * (clamped / this.joystickRadius) : 0;
      const ny = length > 0.001 ? (dy / length) * (clamped / this.joystickRadius) : 0;
      this.mobileMoveX = nx;
      this.mobileMoveY = -ny;
      if (this.joystickKnob) {
        this.joystickKnob.style.transform = `translate(${nx * this.joystickRadius}px, ${ny * this.joystickRadius}px)`;
      }
    };

    const down = (event: PointerEvent): void => {
      if (!this.enabled) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = zone.getBoundingClientRect();
      this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.joystickRadius = Math.max(36, rect.width / 2 - 12);
      this.joystickPointer = event.pointerId;
      zone.setPointerCapture(event.pointerId);
      zone.classList.add('active');
      update(event);
    };
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      update(event);
    };
    const up = (event: PointerEvent): void => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = -1;
      this.mobileMoveX = 0;
      this.mobileMoveY = 0;
      zone.classList.remove('active');
      this.resetKnob();
    };

    zone.addEventListener('pointerdown', down);
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', up);
    zone.addEventListener('pointercancel', up);
    this.detachFns.push(() => zone.removeEventListener('pointerdown', down));
    this.detachFns.push(() => zone.removeEventListener('pointermove', move));
    this.detachFns.push(() => zone.removeEventListener('pointerup', up));
    this.detachFns.push(() => zone.removeEventListener('pointercancel', up));
  }

  private bindMobileActions(): void {
    document.querySelectorAll<HTMLElement>('[data-mobile]').forEach((button) => {
      const action = button.dataset.mobile;
      if (action === 'sprint') {
        const down = (event: PointerEvent): void => {
          if (!this.enabled) return;
          event.preventDefault();
          button.classList.add('active');
          this.mobileSprint = true;
        };
        const up = (): void => {
          button.classList.remove('active');
          this.mobileSprint = false;
        };
        button.addEventListener('pointerdown', down);
        button.addEventListener('pointerup', up);
        button.addEventListener('pointercancel', up);
        button.addEventListener('pointerleave', up);
        this.detachFns.push(() => button.removeEventListener('pointerdown', down));
        this.detachFns.push(() => button.removeEventListener('pointerup', up));
        this.detachFns.push(() => button.removeEventListener('pointercancel', up));
        this.detachFns.push(() => button.removeEventListener('pointerleave', up));
        return;
      }
      const press = (event: PointerEvent): void => {
        if (!this.enabled) return;
        event.preventDefault();
        if (action === 'jump') this.jumpQueued = true;
        if (action === 'interact') this.interactQueued = true;
        button.classList.add('active');
      };
      const release = (): void => button.classList.remove('active');
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      this.detachFns.push(() => button.removeEventListener('pointerdown', press));
      this.detachFns.push(() => button.removeEventListener('pointerup', release));
      this.detachFns.push(() => button.removeEventListener('pointercancel', release));
    });
  }

  private resetKnob(): void {
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(0px, 0px)';
  }

  get movement(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (Math.abs(this.mobileMoveX) > 0.04 || Math.abs(this.mobileMoveY) > 0.04) {
      x = this.mobileMoveX;
      y = this.mobileMoveY;
    }
    return { x, y };
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.mobileSprint;
  }

  consumeJump(): boolean {
    const value = this.jumpQueued;
    this.jumpQueued = false;
    return value;
  }

  consumeInteract(): boolean {
    const value = this.interactQueued;
    this.interactQueued = false;
    return value;
  }

  consumeHelp(): boolean {
    const value = this.helpQueued;
    this.helpQueued = false;
    return value;
  }

  consumeMenuKey(): string | null {
    const value = this.menuKey;
    this.menuKey = null;
    return value;
  }

  consumeLook(): LookDelta {
    const delta = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  consumeWheel(): number {
    const value = this.wheelDelta;
    this.wheelDelta = 0;
    return value;
  }

  clearQueued(): void {
    this.jumpQueued = false;
    this.interactQueued = false;
    this.helpQueued = false;
    this.menuKey = null;
    this.wheelDelta = 0;
    this.lookX = 0;
    this.lookY = 0;
  }

  dispose(): void {
    for (const detach of this.detachFns) detach();
    this.detachFns = [];
  }
}

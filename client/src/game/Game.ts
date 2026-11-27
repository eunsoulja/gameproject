import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  ACHIEVEMENTS,
  BRANCH_ORDER,
  MARKET_EVENTS,
  STALL_CATEGORIES,
  type ActiveEventState,
  type EventVisual,
  type StallCategory,
  type UpgradeBranch,
} from '../../../shared/config';
import type {
  Appearance,
  GameSnapshot,
  JoinResult,
  PlayerProfile,
  PublicPlot,
  RemotePlayer,
} from '../../../shared/types';
import { PLOT_SLOTS } from '../../../shared/layout';
import { NetworkClient, type ConnectionState } from '../systems/NetworkClient';
import { SettingsManager, type GameSettings } from '../systems/Settings';
import { openDailyReport } from '../ui/DailyReportMenu';
import { openHelpMenu } from '../ui/HelpMenu';
import { HUD } from '../ui/HUD';
import { LoginScreen, type LoginSubmitPayload } from '../ui/LoginScreen';
import type { MenuContext } from '../ui/MenuContext';
import { isModalOpen, modalHeader, openModal } from '../ui/Modal';
import { Confetti } from '../ui/Confetti';
import { Notifications } from '../ui/Notifications';
import { OfferMenu } from '../ui/OfferMenu';
import { ShopMenu } from '../ui/ShopMenu';
import { SettingsMenu } from '../ui/SettingsMenu';
import { StatsMenu } from '../ui/StatsMenu';
import { UpgradeMenu } from '../ui/UpgradeMenu';
import { openVisitMenu } from '../ui/VisitMenu';
import { currentProgress, escapeHtml, nextTier, peso } from '../ui/format';
import { AudioManager } from './AudioManager';
import { BuildingGenerator } from './BuildingGenerator';
import { CollisionSystem } from './CollisionSystem';
import { CrowdSystem, type Customer } from './CrowdSystem';
import {
  KARENDERO_MAX_ORDERS,
  KARENDERO_ORDER_TTL_MS,
  KARENDERO_RICE_PRICE,
  type KarenderoOrderInfo,
} from '../../../shared/karendero';
import { Environment } from './Environment';
import { IntroCinematic } from './IntroCinematic';
import { FloatingText } from './FloatingText';
import { RainParticles } from './RainParticles';
import { Input } from './Input';
import { JeepneySystem } from './JeepneySystem';
import { InteractionSystem, type Interactable } from './InteractionSystem';
import { MarketGenerator } from './MarketGenerator';
import { Player } from './Player';
import { PlotManager } from './PlotManager';
import { RemotePlayers } from './RemotePlayers';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { UmbrellaSystem } from './UmbrellaSystem';
import { WeatherSystem } from './WeatherSystem';

const TIPS = [
  'Tip: regulars love a well-kept stall.',
  'Tip: stock up before the 6pm rush.',
  'Tip: a rain tarp pays for itself in one typhoon.',
  'Tip: press E at the glowing pads to upgrade.',
  'Tip: your suki remember a fair price.',
  'Tip: fixtures and feasts both draw a crowd.',
];

const SKINS = ['#f2d2b4', '#e4b58d', '#c99767', '#a66e45', '#7d4f2f'];
const HAIRS = ['#191210', '#2e1f18', '#53331e', '#7f4b28', '#c79a55', '#24222c'];
const PANTS = ['#283449', '#1a1f2a', '#414f63', '#665d4d', '#53313a', '#2f433c'];

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene = new THREE.Scene();
  private viewCamera!: THREE.PerspectiveCamera;
  private cameraRig!: ThirdPersonCamera;

  private settings = new SettingsManager();
  private audio = new AudioManager();
  private weather = new WeatherSystem();
  private collision!: CollisionSystem;
  private environment!: Environment;
  private buildings!: BuildingGenerator;
  private market!: MarketGenerator;
  private umbrellas!: UmbrellaSystem;
  private plotManager!: PlotManager;
  private crowd!: CrowdSystem;
  private remotePlayers!: RemotePlayers;
  private player: Player | null = null;
  private input!: Input;
  private interaction!: InteractionSystem;

  private network!: NetworkClient;
  private login!: LoginScreen;
  private hud!: HUD;
  private notifications!: Notifications;
  private floatingText!: FloatingText;
  private pendingCashDelta = 0;
  private cashFlushAt = 0;
  private saleSoundAt = 0;
  private activeEmote: string | null = null;
  private emoteUntil = 0;
  private lastEmoteSent: string | null = null;
  private lastServeAttempt = -10;
  private npcTalkPos = new THREE.Vector3();
  private npcTalkTarget: Customer | null = null;
  private npcTalkItem: Interactable | null = null;
  private lastNpcTalk = -10;
  private karenOrders: KarenderoOrderInfo[] = [];
  private heldDish: { dishId: string; dishName: string } | null = null;
  private karenServeNpc: Customer | null = null;
  private karenServePos = new THREE.Vector3();
  private karenOrderItem: Interactable | null = null;
  private karenPickupItem: Interactable | null = null;
  private karenServeItem: Interactable | null = null;
  private karenBusy = false;
  private lastKarenAction = -10;
  private lastServeInFlight = false;
  private intro: IntroCinematic | null = null;
  private introPlayed = false;
  private confetti: Confetti | null = null;
  private hagglePrompt: HTMLElement | null = null;
  private upsellPrompt: HTMLElement | null = null;
  private trafficTimer = 0;
  private fpsEl: HTMLElement | null = null;
  private fpsTimer = 0;
  private fpsFrames = 0;
  private recentToasts = new Map<string, number>();
  private fpsSamples: number[] = [];
  private autoQualityDone = false;
  private onboarded = false;
  private muted = false;
  private earnedBadges = new Set<string>();
  private upgradeMenu!: UpgradeMenu;
  private shopMenu!: ShopMenu;
  private statsMenu!: StatsMenu;
  private settingsMenu!: SettingsMenu;
  private offerMenu!: OfferMenu;
  private menuContext!: MenuContext;
  private rain: RainParticles | null = null;
  private jeepneys: JeepneySystem | null = null;

  private profile: PlayerProfile | null = null;
  private profileReceivedAt = 0;
  private plots: PublicPlot[] = [];
  private activeEvent: ActiveEventState | null = null;
  private onlineCount = 0;
  private serverOffset = 0;
  private joined = false;
  private joining = false;
  private booted = false;
  private lastPlotIndex = -1;
  private lastFrame = 0;
  private elapsed = 0;
  private frameHandle = 0;
  private atmosphereTimer = 0;
  private cashSoundAt = 0;
  private wasDisconnected = false;
  private serverInfoTimer = 0;
  private onboardingTimer = 0;
  private settingsUnsub: (() => void) | null = null;
  private detachFns: Array<() => void> = [];
  private cinematicFocus = new THREE.Vector3(0, 0, 50);
  private boundAnimate = (time: number) => this.animate(time);

  constructor() {
    const canvas = document.getElementById('game-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Game canvas is missing.');
    this.canvas = canvas;
  }

  async boot(): Promise<void> {
    try {
      this.setBoot('Warming the projector…', 4, TIPS[0]);
      this.setupRenderer();
      await this.nextFrame();

      this.collision = new CollisionSystem();
      this.setBoot('Paving Colon Street…', 13, TIPS[1]);
      this.environment = new Environment(this.scene);
      this.environment.addBoundaryAndProps(this.collision);
      await this.nextFrame();

      this.setBoot('Raising the shopfronts…', 27, TIPS[5]);
      this.buildings = new BuildingGenerator(this.scene, this.collision);
      this.buildings.build();
      await this.nextFrame();

      this.setBoot('Setting out the market stalls…', 44, TIPS[2]);
      this.market = new MarketGenerator(this.scene, this.collision);
      this.market.build(this.settings.current.quality);
      await this.nextFrame();

      this.setBoot('Stringing a hundred umbrellas…', 58, TIPS[3]);
      this.umbrellas = new UmbrellaSystem(this.scene);
      this.umbrellas.build();
      this.rain = new RainParticles();
      this.scene.add(this.rain.object);
      this.jeepneys = new JeepneySystem(this.scene);
      this.jeepneys.build();
      this.weather.onLightning = () => this.environment?.strike();
      await this.nextFrame();

      this.setBoot('Marking the sixteen vendor bays…', 70, TIPS[4]);
      this.plotManager = new PlotManager(this.scene, this.collision);
      this.plotManager.build();
      this.crowd = new CrowdSystem(this.scene);
      this.crowd.build();
      this.crowd.setVendorSpots(this.market.vendorSpots);
      this.remotePlayers = new RemotePlayers(this.scene);
      await this.nextFrame();

      this.setBoot('Opening the gates to Colon…', 84, TIPS[0]);
      this.setupNetwork();
      this.setupUI();
      // Input binds the joystick and mobile action buttons, so it must be created
      // after the HUD has rendered those elements.
      this.input = new Input(this.canvas);
      this.applySettings(this.settings.current);
      this.settingsUnsub = this.settings.onChange((next) => this.applySettings(next));

      this.bindWindowEvents();
      this.setBoot('The night market is open', 100, TIPS[5]);
      this.booted = true;
      this.login.show();
      this.startLoop();
      await this.nextFrame();
      window.setTimeout(() => {
        document.getElementById('boot-screen')?.classList.add('leaving');
        window.setTimeout(() => document.getElementById('boot-screen')?.classList.add('hidden'), 760);
      }, 320);
      void this.refreshServerInfo();
      this.serverInfoTimer = window.setInterval(() => {
        if (!this.joined) void this.refreshServerInfo();
      }, 15_000);
    } catch (error) {
      console.error(error);
      this.failBoot(error);
    }
  }

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.viewCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 520);
    this.viewCamera.position.set(0, 6.2, 72);
    this.viewCamera.lookAt(0, 2.2, 45);
    this.cameraRig = new ThirdPersonCamera(this.viewCamera, 0);
    this.applyComposer(this.settings.current.quality !== 'low');
  }

  private setupNetwork(): void {
    this.network = new NetworkClient({
      onProfile: (profile) => this.handleProfile(profile),
      onPlots: (plots) => this.handlePlots(plots),
      onPositions: (players) => this.remotePlayers.syncAll(players),
      onPlayerJoined: (player) => this.remotePlayers.upsert(player),
      onPlayerLeft: (id) => this.remotePlayers.remove(id),
      onNotification: (payload) => {
        // Dedupe: identical titles within 12s collapse into one toast.
        const key = payload.title.toLowerCase();
        const last = this.recentToasts.get(key) ?? 0;
        if (this.elapsed - last < 12) return;
        this.recentToasts.set(key, this.elapsed);
        this.notifications?.show(payload);
        // Milestone toasts earn a camera punch; the biggest ones get confetti.
        if (payload.kind === 'success' && /quest|guide|upgrade|stall is open|deal struck/i.test(payload.title)) {
          this.cameraRig?.pulseFov(4.5);
        }
        if (/goal complete|legend|quest complete|guide complete|is back|new regular/i.test(payload.title)) {
          this.confetti?.burst(44);
        }
      },
      onDayReport: (payload) => this.handleDayReport(payload),
      onMarketEvent: (event) => this.handleMarketEvent(event),
      onOffer: (offer) => {
        this.audio.notify('event');
        this.offerMenu?.open(offer);
      },
      onOfferResolved: (payload) => this.offerMenu?.resolved(payload.id, payload.accepted),
      onOnlineCount: (count) => {
        this.onlineCount = count;
        this.hud?.setOnline(count);
      },
      onStatus: (state, message) => this.handleConnectionState(state, message),
      onForceLogout: (reason) => this.handleForceLogout(reason),
      onRejoin: (snapshot, players) => {
        this.applySnapshot(snapshot, false);
        this.remotePlayers.syncAll(players);
        this.notifications?.info('Signal restored', 'You are back in the Colon Street market.', 'success');
        this.handleConnectionState('connected');
      },
    });
  }

  private setupUI(): void {
    const toastRoot = document.getElementById('toast-root');
    const hudRoot = document.getElementById('hud');
    const loginRoot = document.getElementById('login-screen');
    const overlayRoot = document.getElementById('overlay-root');
    if (!toastRoot || !hudRoot || !loginRoot || !overlayRoot) throw new Error('User interface elements are missing.');

    this.notifications = new Notifications(toastRoot, (kind) => this.audio.notify(kind));
    const confettiRoot = document.getElementById('confetti-root');
    this.confetti = confettiRoot ? new Confetti(confettiRoot) : null;
    this.menuContext = {
      getProfile: () => {
        if (!this.profile) throw new Error('No vendor profile is loaded.');
        return this.profile;
      },
      network: this.network,
      onProfile: (profile) => this.handleProfile(profile),
      notify: this.notifications,
      getPlots: () => this.plots,
    };

    this.upgradeMenu = new UpgradeMenu(this.menuContext);
    this.shopMenu = new ShopMenu(this.menuContext);
    this.statsMenu = new StatsMenu(this.menuContext);
    this.settingsMenu = new SettingsMenu({
      ...this.menuContext,
      settings: this.settings,
      onSettingsChanged: () => {},
      onAppearancePreview: (appearance) => {
        if (this.player) this.player.avatar.setAppearance(appearance);
      },
      onSignOut: () => this.handleSignOut(),
    });
    this.offerMenu = new OfferMenu(this.menuContext);

    this.hud = new HUD(hudRoot, {
      onBranch: (branch: UpgradeBranch) => {
        this.audio.click();
        this.upgradeMenu.open(branch);
      },
      onBoosts: () => {
        this.audio.click();
        this.shopMenu.open('boosts');
      },
      onShop: () => {
        this.audio.click();
        this.shopMenu.open('stock');
      },
      onStats: () => {
        this.audio.click();
        this.statsMenu.open();
      },
      onSettings: () => {
        this.audio.click();
        this.settingsMenu.open();
      },
      onHelp: () => {
        this.audio.click();
        openHelpMenu();
      },
    });
    this.hud.hide();
    this.interaction = new InteractionSystem(this.hud);
    const floatRoot = document.getElementById('float-text-root');
    this.floatingText = new FloatingText(floatRoot ?? toastRoot, this.viewCamera);
    this.login = new LoginScreen(loginRoot, (payload) => this.handleLogin(payload));
  }

  private bindWindowEvents(): void {
    const resize = (): void => {
      if (!this.viewCamera) return;
      // innerWidth can lag a frame behind visualViewport on mobile/zoom —
      // prefer the visual viewport when it reports a sane size.
      const vw = window.visualViewport;
      const w = vw && vw.width > 0 ? vw.width : window.innerWidth;
      const h = vw && vw.height > 0 ? vw.height : window.innerHeight;
      this.viewCamera.aspect = w / h;
      this.viewCamera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer?.setSize(w, h);
      this.lastFrame = 0;
    };
    const visibility = (): void => {
      this.lastFrame = 0;
    };
    const resetCamera = (): void => {
      if (!this.player) return;
      this.cameraRig.yaw = this.player.yaw;
      this.cameraRig.pitch = 0.22;
      this.cameraRig.distance = 5.6;
      this.cameraRig.snap(this.player.position, this.collision);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
    // Some browsers fire no resize when a window is un-maximised or a monitor
    // changes — a ResizeObserver on the root catches every layout shift.
    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);
    window.addEventListener('load', resize);
    window.addEventListener('merkado:reset-camera', resetCamera);
    document.addEventListener('visibilitychange', visibility);
    this.detachFns.push(() => window.removeEventListener('resize', resize));
    this.detachFns.push(() => window.removeEventListener('orientationchange', resize));
    this.detachFns.push(() => window.visualViewport?.removeEventListener('resize', resize));
    this.detachFns.push(() => ro.disconnect());
    this.detachFns.push(() => window.removeEventListener('load', resize));
    this.detachFns.push(() => window.removeEventListener('merkado:reset-camera', resetCamera));
    this.detachFns.push(() => document.removeEventListener('visibilitychange', visibility));
  }

  private async handleLogin(payload: LoginSubmitPayload): Promise<JoinResult> {
    if (this.joining) return { ok: false, error: 'The door is already opening. One moment.' };
    this.joining = true;
    try {
      const appearance = this.makeAppearance(payload.category);
      const result = await this.network.join({
        name: payload.name,
        token: payload.token,
        category: payload.category,
        appearance,
      });
      if (!result.ok || !result.snapshot) return result;

      try {
        localStorage.setItem('merkado.token', result.token ?? '');
        localStorage.setItem('merkado.playerName', payload.name);
      } catch {
        /* Private browsing can block storage; the session still works. */
      }

      this.joined = true;
      this.applySnapshot(result.snapshot, true);
      this.remotePlayers.syncAll(result.players ?? []);
      this.login.hide();
      this.hud.show();
      this.setConnectionOverlay(false);
      this.input.setEnabled(true);
      this.applySettings(this.settings.current);
      void this.audio.start().then(() => this.applySettings(this.settings.current));
      this.hud.setOnline(this.onlineCount);
      this.cameraRig.yaw = this.player?.yaw ?? 0;
      this.cameraRig.pitch = 0.2;
      if (this.player) this.cameraRig.snap(this.player.position, this.collision);

      // One-time join flyover — skipped for reduced-motion players and replays.
      if (
        this.player &&
        !this.introPlayed &&
        !this.settings.current.reduceMotion &&
        !payload.token // fresh vendor gets the full reveal; returning sessions skip it
      ) {
        this.introPlayed = true;
        this.intro = new IntroCinematic(this.player.position, this.player.yaw);
        this.input.setEnabled(false);
      }

      this.onboardingTimer = window.setTimeout(() => {
        try {
          if (localStorage.getItem('merkado.onboarded')) return;
          localStorage.setItem('merkado.onboarded', '1');
        } catch {
          /* ignore */
        }
        if (this.joined) openHelpMenu();
      }, 1800);
      return result;
    } catch (error) {
      console.error(error);
      return { ok: false, error: 'The market server did not answer. Check that it is running and try again.' };
    } finally {
      this.joining = false;
    }
  }

  private makeAppearance(category: StallCategory): Appearance {
    const def = STALL_CATEGORIES[category];
    return {
      shirt: def.color,
      pants: PANTS[Math.floor(Math.random() * PANTS.length)],
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
      hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
    };
  }

  private applySnapshot(snapshot: GameSnapshot, resetCamera: boolean): void {
    const profile = snapshot.profile;
    this.profile = profile;
    this.profileReceivedAt = Date.now();
    this.serverOffset = snapshot.serverNow - Date.now();
    this.hud.setServerOffset(this.serverOffset);
    this.plots = snapshot.plots;
    this.activeEvent = snapshot.activeEvent;
    this.onlineCount = snapshot.onlineCount;

    this.remotePlayers.setSelfId(profile.id);
    this.ensurePlayer(profile);
    this.lastPlotIndex = profile.plotIndex;
    this.crowd.setOwnStall(profile.plotIndex, this.ownPlotIsFood());
    this.plotManager.setState(this.plots, profile.id, profile);
    this.plotManager.updateStock(profile);
    this.hud.setProfile(profile);
    this.hud.setEvent(this.activeEvent);
    this.hud.setOnline(this.onlineCount);
    this.weather.set(profile.weather.condition, this.activeEvent);
    this.upgradeMenu.refresh(profile);
    this.shopMenu.refresh(profile);
    this.refreshInteractions();

    if (resetCamera && this.player) {
      this.cameraRig.yaw = this.player.yaw;
      this.cameraRig.pitch = 0.2;
      this.cameraRig.snap(this.player.position, this.collision);
    }
  }

  private ensurePlayer(profile: PlayerProfile): void {
    if (!this.player) {
      this.player = new Player(this.scene, profile.appearance, profile.name, profile.plotIndex);
      this.player.onFootstep = () => this.audio.footstep((this.player?.speed ?? 0) > 4.4);
      this.player.setNameVisible(false);
      this.player.setShadows(this.settings.current.quality === 'high');
      this.cameraRig.yaw = this.player.yaw;
      this.cameraRig.snap(this.player.position, this.collision);
      return;
    }
    if (this.lastPlotIndex !== profile.plotIndex) {
      this.player.spawnAtPlot(profile.plotIndex);
      this.cameraRig.yaw = this.player.yaw;
      this.cameraRig.snap(this.player.position, this.collision);
    }
    this.player.setAppearance(profile.appearance);
  }

  private handleProfile(profile: PlayerProfile): void {
    const previous = this.profile;
    this.checkAchievements(profile, previous);
    this.profile = profile;
    this.profileReceivedAt = Date.now();
    this.ensurePlayer(profile);
    this.lastPlotIndex = profile.plotIndex;
    this.crowd.setOwnStall(profile.plotIndex, this.ownPlotIsFood());
    this.hud.setProfile(profile);
    this.weather.set(profile.weather.condition, this.activeEvent);
    this.upgradeMenu.refresh(profile);
    this.shopMenu.refresh(profile);
    this.plotManager.setState(this.plots, profile.id, profile);
    this.plotManager.updateStock(profile);
    this.refreshInteractions();
    this.remotePlayers.setSelfId(profile.id);
    this.maybeOnboard(profile, previous);

    if (previous && profile.balance !== previous.balance) {
      this.pendingCashDelta += profile.balance - previous.balance;
      const now = performance.now();
      if (profile.balance > previous.balance && now - this.saleSoundAt > 1400) {
        this.saleSoundAt = now;
        this.audio.sale();
      }
      if (now - this.cashSoundAt > 7000) {
        this.cashSoundAt = now;
        this.audio.cash();
      }
    }
    if (this.pendingCashDelta !== 0 && Date.now() >= this.cashFlushAt) {
      this.flushCashFloat();
    }
  }

  /** Fire a toast the first time each badge flips to earned. */
  private checkAchievements(profile: PlayerProfile, previous: PlayerProfile | null): void {
    if (!previous) {
      this.earnedBadges = new Set(ACHIEVEMENTS.filter((a) => a.check(profile)).map((a) => a.id));
      return;
    }
    for (const achievement of ACHIEVEMENTS) {
      if (this.earnedBadges.has(achievement.id) || !achievement.check(profile)) continue;
      this.earnedBadges.add(achievement.id);
      this.notifications?.show(
        { kind: 'success', title: `Badge earned — ${achievement.title}`, message: achievement.description },
        8000,
      );
      this.audio.notify('success');
    }
  }

  /** First-night walkthrough — a short toast chain teaching the loop once. */
  private maybeOnboard(profile: PlayerProfile, previous: PlayerProfile | null): void {
    if (this.onboarded || profile.lifetime.daysPlayed > 0 || profile.day > 1) return;
    this.onboarded = true;
    const steps: Array<[number, string, string]> = [
      [900, 'Welcome to Colon', 'Walk to the glowing pads by your stall and press E to restock and set prices.'],
      [7000, 'The evening rush is coming', 'Shoppers appear as the clock moves — keep shelves full and prices fair.'],
      [14000, 'Keys to remember', 'B stock · P power-ups · T ledger · 1–4 emotes. Drag to look around.'],
    ];
    for (const [delay, title, message] of steps) {
      window.setTimeout(() => {
        if (this.profile?.id === profile.id) {
          this.notifications?.show({ kind: 'info', title, message }, 7000);
        }
      }, delay);
    }
    void previous;
  }

  private flushCashFloat(): void {
    const delta = this.pendingCashDelta;
    this.pendingCashDelta = 0;
    this.cashFlushAt = Date.now() + 1400;
    if (Math.abs(delta) < 5 || !this.plotManager) return;
    const own = this.plotManager.getStallPoints().find((point) => point.isSelf);
    if (!own) return;
    const at = own.center.clone();
    at.y = 2.6;
    at.x += (Math.random() - 0.5) * 0.8;
    at.z += (Math.random() - 0.5) * 0.8;
    this.floatingText.cash(delta, at);
  }

  private handlePlots(plots: PublicPlot[]): void {
    this.plots = plots;
    if (!this.profile) {
      this.plotManager.setState([], '', null);
      return;
    }
    // Stall categories can change (unlocks, stall count) — keep the crowd's
    // karendero flag in sync with the freshest plot data.
    this.crowd.setOwnStall(this.profile.plotIndex, this.ownPlotIsFood());
    this.plotManager.setState(plots, this.profile.id, this.profile);
    this.refreshInteractions();
  }

  private handleMarketEvent(event: ActiveEventState | null): void {
    this.activeEvent = event;
    this.hud.setEvent(event);
    this.weather.set(this.profile?.weather.condition ?? 'clear', event);
    if (event) this.hud.hidePrompt();
  }

  private handleDayReport(payload: { report: PlayerProfile['reports'][number]; profile: PlayerProfile }): void {
    this.handleProfile(payload.profile);
    openDailyReport(payload.report, payload.profile, this.notifications);
    this.audio.upgrade();
  }

  private handleConnectionState(state: ConnectionState, message?: string): void {
    if (!this.joined) {
      this.setConnectionOverlay(false);
      return;
    }
    const show = state !== 'connected';
    this.setConnectionOverlay(show);
    if (state === 'connected') {
      if (this.wasDisconnected) {
        this.wasDisconnected = false;
      }
    } else {
      this.wasDisconnected = true;
      if (state === 'error' && message) {
        this.notifications?.info('Market signal', message, 'warning');
      }
    }
  }

  private setConnectionOverlay(show: boolean): void {
    const el = document.getElementById('connection-lost');
    if (!el) return;
    el.classList.toggle('hidden', !show);
  }

  private handleForceLogout(reason: string): void {
    this.joined = false;
    this.input.setEnabled(false);
    this.interaction.clear();
    this.hud.hide();
    this.setConnectionOverlay(false);
    this.network.close();
    const handle = openModal(
      `
        ${modalHeader({
          eyebrow: 'Vendor session',
          title: 'This stall signed in elsewhere',
          subtitle: 'Only one market window can run each vendor at a time.',
        })}
        <div class="modal-body">
          <div class="vendor-note">
            <span>${escapeHtml(reason)} Your earnings and stock are safe on the server.</span>
          </div>
          <div class="help-card" style="margin-top:12px">
            <b>Open the market again</b>
            <p>Reload this window to come back with your saved vendor name and token.</p>
          </div>
        </div>
        <div class="modal-foot">
          <span class="modal-foot-note">Colon Street keeps your bay just as you left it.</span>
          <button type="button" class="btn-gold" id="force-reload">Reload the market</button>
        </div>
      `,
      'help-modal',
    );
    handle.el.querySelector('#force-reload')?.addEventListener('click', () => window.location.reload());
  }

  private handleSignOut(): void {
    try {
      localStorage.removeItem('merkado.token');
      localStorage.removeItem('merkado.playerName');
    } catch {
      /* ignore */
    }
    this.network.close();
    this.joined = false;
    window.setTimeout(() => window.location.reload(), 120);
  }

  private refreshInteractions(): void {
    if (!this.interaction || !this.plotManager || !this.profile) return;
    const profile = this.profile;
    const items: Interactable[] = [];

    for (const point of this.plotManager.getStallPoints()) {
      const plot = point.plot;
      if (!plot) continue;
      if (point.isSelf) {
        const stock = Object.values(profile.inventory).reduce((sum, value) => sum + value, 0);
        items.push({
          id: `stall-${point.index}`,
          position: point.center,
          radius: point.radius,
          title: 'Open your stall',
          subtitle: stock < 18 ? 'Low stock — restock, set prices and plan tonight' : 'Stock, prices, power-ups and supplier news',
          action: () => {
            this.audio.click();
            this.shopMenu.open('stock');
          },
        });
        // Counter spot out on the walkway — serving here earns full price + tips.
        const slot = PLOT_SLOTS[point.index];
        if (slot) {
          const inward = slot.side === 'west' ? 1 : -1;
          const counterPos = new THREE.Vector3(slot.x + inward * 3.1, 1.1, slot.z);
          items.push({
            id: `serve-${point.index}`,
            position: counterPos,
            radius: 2.1,
            title: 'Serve a customer',
            subtitle: stock > 0 ? 'Full price, no haggling — plus tips' : 'No stock on the shelf',
            price: stock > 0 ? 'POS' : undefined,
            priority: 1,
            enabled: () =>
              Object.values(this.profile?.inventory ?? {}).some((v) => v > 0) &&
              this.elapsed - this.lastServeAttempt > 1.2,
            action: () => this.serveCustomer(counterPos),
          });
        }
      } else {
        items.push({
          id: `visit-${point.index}`,
          position: point.center,
          radius: point.radius,
          title: `Visit ${plot.businessName}`,
          subtitle: `${plot.ownerName} · ${plot.categories.map((c) => STALL_CATEGORIES[c].shortName).join(' + ')}`,
          action: () => {
            this.audio.click();
            openVisitMenu(this.menuContext, plot);
          },
        });
      }
    }

    for (const pad of this.plotManager.getOwnPads()) {
      const next = nextTier(profile, pad.branch);
      const branchName = pad.branch[0].toUpperCase() + pad.branch.slice(1);
      items.push({
        id: `pad-${pad.branch}`,
        position: pad.center,
        radius: pad.radius,
        title: `Upgrade ${branchName}`,
        subtitle: next.tier
          ? `Tier ${next.tier} · ${pad.name.toLowerCase()} choices`
          : 'This branch is fully upgraded',
        price: next.tier ? `from ${peso(next.cheapest ?? 0)}` : 'MAX',
        priority: 1,
        action: () => {
          if (!this.profile) return;
          this.audio.click();
          this.upgradeMenu.open(pad.branch);
        },
      });
    }

    // Karendero mode — food stalls run take-order → cook → pickup → serve.
    this.karenOrderItem = null;
    this.karenPickupItem = null;
    this.karenServeItem = null;
    if (this.ownPlotIsFood() && profile) {
      const slot = PLOT_SLOTS[profile.plotIndex];
      if (slot) {
        const inward = slot.side === 'west' ? 1 : -1;
        const front = this.crowd.frontSlotPos();
        this.karenOrderItem = {
          id: 'karen-order',
          position: new THREE.Vector3(front.x, 1.1, front.z),
          radius: 2.4,
          title: 'Take order',
          subtitle: 'Customer at the counter',
          priority: 0.6,
          enabled: () =>
            this.crowd.queueFront() != null &&
            this.karenOrders.length < KARENDERO_MAX_ORDERS &&
            this.elapsed - this.lastKarenAction > 1.3,
          action: () => this.takeKarenOrder(),
        };
        items.push(this.karenOrderItem);

        this.karenPickupItem = {
          id: 'karen-pickup',
          position: new THREE.Vector3(slot.x + inward * 3.1, 1.1, slot.z),
          radius: 2.2,
          title: 'Pick up order',
          subtitle: 'Finished plates on the counter',
          priority: 0.7,
          enabled: () =>
            this.karenOrders.some((o) => !o.picked && o.readyAt <= Date.now()) &&
            this.elapsed - this.lastKarenAction > 1.0,
          action: () => this.pickupKarenFood(),
        };
        items.push(this.karenPickupItem);

        this.karenServeItem = {
          id: 'karen-serve',
          position: this.karenServePos,
          radius: 2.5,
          title: 'Serve dish',
          subtitle: 'Match the plate to the customer',
          priority: 0.8,
          enabled: () =>
            this.karenServeNpc != null &&
            this.heldDish != null &&
            this.karenServeNpc.orderDish === this.heldDish.dishId &&
            this.elapsed - this.lastKarenAction > 1.0,
          action: () => this.serveKarenDish(),
        };
        items.push(this.karenServeItem);
      }
    }

    // Chat prompt tracks whichever shopper is nearest — position is mutated per-frame.
    this.npcTalkItem = {
      id: 'npc-talk',
      position: this.npcTalkPos,
      radius: 2.5,
      title: 'Chat with a shopper',
      subtitle: 'Friendly market gossip',
      priority: -0.5,
      enabled: () => this.npcTalkTarget != null && this.elapsed - this.lastNpcTalk > 4,
      action: () => {
        const npc = this.npcTalkTarget;
        const p = this.player?.position;
        if (!npc || !p) return;
        if (!this.crowd.talkTo(npc, p.x, p.z)) return;
        this.lastNpcTalk = this.elapsed;
        this.audio.click();
      },
    };
    items.push(this.npcTalkItem);

    items.push({
      id: 'market-board',
      position: new THREE.Vector3(0, 0, 102),
      radius: 2.6,
      title: 'Colon market board',
      subtitle: 'Controls, goals and how the night market works',
      action: () => {
        this.audio.click();
        openHelpMenu();
      },
    });

    this.interaction.setItems(items);
  }

  /** True when the player's stall serves street food — enables karendero mode. */
  private ownPlotIsFood(): boolean {
    const profile = this.profile;
    if (!profile) return false;
    const own = this.plots.find((p) => p.ownerId === profile.id);
    const cats = own?.categories ?? profile.unlockedCategories;
    return cats.includes('streetFood');
  }

  /** Track the nearest shopper so the chat prompt follows them around. */
  private updateNpcTalkTarget(): void {
    const item = this.npcTalkItem;
    const p = this.player?.position;
    if (!item || !p) {
      this.npcTalkTarget = null;
      return;
    }
    const npc = this.crowd.nearestForTalk(p.x, p.z, 2.6);
    this.npcTalkTarget = npc;
    if (npc) {
      this.npcTalkPos.set(npc.x, 1.2, npc.z);
      item.title = `Chat with ${npc.name}`;
      item.subtitle = 'Friendly market gossip';
    }
  }

  /** Keep karendero prompts, order timers and the serve target fresh. */
  private updateKarendero(): void {
    const now = Date.now();
    const p = this.player?.position;
    // Drop orders that went cold; drop a held plate whose order vanished.
    this.karenOrders = this.karenOrders.filter((o) => o.expiresAt > now);
    if (
      this.heldDish &&
      !this.karenOrders.some((o) => o.picked && o.dishId === this.heldDish!.dishId)
    ) {
      this.heldDish = null;
    }

    const orderItem = this.karenOrderItem;
    if (orderItem) {
      const front = this.crowd.queueFront();
      orderItem.title = front ? `Take order — ${front.name}` : 'Take order';
      orderItem.subtitle = front
        ? `${this.crowd.queueLength()} in line · ${this.karenOrders.length}/${KARENDERO_MAX_ORDERS} cooking`
        : 'No one at the counter';
    }

    const pickupItem = this.karenPickupItem;
    if (pickupItem) {
      const ready = this.karenOrders.filter((o) => !o.picked && o.readyAt <= now).sort((a, b) => a.readyAt - b.readyAt);
      const cooking = this.karenOrders
        .filter((o) => !o.picked && o.readyAt > now)
        .sort((a, b) => a.readyAt - b.readyAt)[0];
      if (ready.length) {
        pickupItem.title = `Pick up ${ready[0].dishName}`;
        pickupItem.subtitle = `Ready · ${peso(ready[0].price)}`;
      } else if (cooking) {
        pickupItem.title = 'Pick up order';
        pickupItem.subtitle = `On the stove… ${Math.max(1, Math.ceil((cooking.readyAt - now) / 1000))}s`;
      } else {
        pickupItem.title = 'Pick up order';
        pickupItem.subtitle = this.heldDish ? `Holding ${this.heldDish.dishName}` : 'No orders yet';
      }
    }

    const serveItem = this.karenServeItem;
    if (!serveItem || !p) {
      this.karenServeNpc = null;
      return;
    }
    // Prefer the waiter whose dish matches the plate in hand.
    const match = this.heldDish
      ? this.crowd.nearestWaitingForDish(p.x, p.z, 2.8, this.heldDish.dishId)
      : null;
    const npc = match ?? this.crowd.nearestWaiting(p.x, p.z, 2.8);
    this.karenServeNpc = npc;
    if (npc) {
      this.karenServePos.set(npc.x, 1.2, npc.z);
      serveItem.title = `Serve ${npc.name}`;
      const wants = npc.orderDishName ?? 'a plate';
      serveItem.subtitle = this.heldDish
        ? this.heldDish.dishId === npc.orderDish
          ? `They ordered ${wants} — hand it over`
          : `They ordered ${wants} · you hold ${this.heldDish.dishName}`
        : `They ordered ${wants} — pick up the food first`;
    } else {
      serveItem.subtitle = this.heldDish ? `Holding ${this.heldDish.dishName}` : 'No customers waiting';
    }
  }

  /** Take an order from the front of the queue — starts the cook timer. */
  private takeKarenOrder(): void {
    const front = this.crowd.queueFront();
    if (!front || this.karenBusy) return;
    this.karenBusy = true;
    this.lastKarenAction = this.elapsed;
    void this.network.takeOrder().then((res) => {
      this.karenBusy = false;
      if (!res.ok || !res.data) {
        this.notifications?.show({ kind: 'warning', title: 'Cannot take order', message: res.error ?? 'Try again.' }, 2400);
        return;
      }
      const o = res.data;
      const now = Date.now();
      const label = o.drinkName ? `${o.dishName} + ${o.drinkName}` : o.dishName;
      this.crowd.startOrderFlow(front, o.dishId, label);
      this.karenOrders.push({
        dishId: o.dishId,
        dishName: o.dishName,
        drinkName: o.drinkName,
        drinkPrice: o.drinkPrice,
        price: o.price,
        readyAt: now + o.readyInMs,
        expiresAt: now + o.readyInMs + KARENDERO_ORDER_TTL_MS,
        picked: false,
      });
      const at = this.player?.position.clone();
      if (at) {
        at.y += 2.4;
        this.floatingText.spawn(at, `Order: ${label}`, 'info');
      }
      this.audio.click();
    });
  }

  /** Pick up a finished plate — fills the player's hands. */
  private pickupKarenFood(): void {
    if (this.karenBusy) return;
    this.karenBusy = true;
    this.lastKarenAction = this.elapsed;
    void this.network.pickupFood().then((res) => {
      this.karenBusy = false;
      if (!res.ok || !res.data) {
        this.notifications?.show({ kind: 'warning', title: 'Nothing to pick up', message: res.error ?? 'Try again.' }, 2400);
        return;
      }
      const d = res.data;
      this.heldDish = {
        dishId: d.dishId,
        dishName: d.drinkName ? `${d.dishName} + ${d.drinkName}` : d.dishName,
      };
      const order = this.karenOrders.find((o) => !o.picked && o.dishId === d.dishId);
      if (order) order.picked = true;
      const at = this.player?.position.clone();
      if (at) {
        at.y += 2.4;
        this.floatingText.spawn(
          at,
          `Picked up ${d.drinkName ? `${d.dishName} + ${d.drinkName}` : d.dishName} — serve it hot!`,
          'info',
        );
      }
      this.audio.click();
    });
  }

  /** Hand the held plate to the matching customer — pays out. */
  private serveKarenDish(): void {
    const npc = this.karenServeNpc;
    const held = this.heldDish;
    if (!npc || !held || this.karenBusy) return;
    if (npc.orderDish !== held.dishId) {
      const at = npc.avatar.position.clone();
      at.y += 2.3;
      this.floatingText.spawn(at, `Wrong order — they want ${npc.orderDishName ?? 'something else'}`, 'info');
      return;
    }
    this.karenBusy = true;
    this.lastKarenAction = this.elapsed;
    void this.network.serveDish(held.dishId).then((res) => {
      this.karenBusy = false;
      if (!res.ok || !res.data) {
        this.notifications?.show({ kind: 'warning', title: 'Cannot serve', message: res.error ?? 'Try again.' }, 2400);
        return;
      }
      const sale = res.data;
      this.crowd.markServed(npc);
      this.karenOrders = this.karenOrders.filter((o) => !(o.picked && o.dishId === held.dishId));
      this.heldDish = null;
      const at = this.player?.position.clone() ?? npc.avatar.position.clone();
      at.y += 2.2;
      this.floatingText.cash(sale.revenue + sale.tip + (sale.streakBonus ?? 0), at);
      this.audio.sale();
      this.cameraRig.pulseFov(2.5);
      if (sale.tip > 0) {
        this.floatingText.spawn(at.clone().add(new THREE.Vector3(0.9, 0.4, 0)), `tip +${peso(sale.tip)}`, 'info');
      }
      if (sale.streakBonus) {
        this.floatingText.spawn(at.clone().add(new THREE.Vector3(-0.9, 0.4, 0)), `streak +${peso(sale.streakBonus)}`, 'gain');
      }
      if (sale.review) {
        this.floatingText.spawn(at.clone().add(new THREE.Vector3(0, 0.7, 0)), '★'.repeat(sale.review), 'info');
      }
      window.setTimeout(() => this.audio.cash(), 180);
      if (sale.upsell) this.showUpsellPrompt();
    });
  }

  /** "Extra rice?" — a served customer asks for a small add-on, timed yes/no. */
  private showUpsellPrompt(): void {
    if (this.upsellPrompt || this.hagglePrompt) return;
    const root = document.getElementById('overlay-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'haggle-prompt';
    el.innerHTML = `
      <div class="haggle-card">
        <b>Karendero customer</b>
        <p>"Extra rice? ${peso(KARENDERO_RICE_PRICE)} lang!"</p>
        <div class="haggle-actions">
          <button type="button" class="haggle-accept">Yes, +${peso(KARENDERO_RICE_PRICE)}</button>
          <button type="button" class="haggle-hold">No thanks</button>
        </div>
        <div class="haggle-timer"><span></span></div>
      </div>`;
    root.appendChild(el);
    this.upsellPrompt = el;

    const timerBar = el.querySelector<HTMLElement>('.haggle-timer span')!;
    const duration = 8000;
    const started = performance.now();
    let answered = false;

    const answer = (accept: boolean): void => {
      if (answered) return;
      answered = true;
      window.clearInterval(tick);
      el.remove();
      this.upsellPrompt = null;
      this.audio.click();
      void this.network.karenderoUpsell(accept).then((result) => {
        if (!this.player) return;
        if (result.ok && result.data && result.data.price > 0) {
          const at = this.player.position.clone();
          at.y += 2.1;
          this.floatingText.cash(result.data.price, at);
          this.floatingText.spawn(at.clone().add(new THREE.Vector3(0.9, 0.4, 0)), 'extra rice!', 'info');
          this.audio.sale();
          window.setTimeout(() => this.audio.cash(), 180);
        } else if (!result.ok && result.error) {
          this.floatingText.spawn(this.player.position.clone().setY(2.2), result.error, 'info');
        }
      });
    };

    el.querySelector<HTMLButtonElement>('.haggle-accept')!.addEventListener('click', () => answer(true));
    el.querySelector<HTMLButtonElement>('.haggle-hold')!.addEventListener('click', () => answer(false));

    const tick = window.setInterval(() => {
      const remaining = 1 - (performance.now() - started) / duration;
      timerBar.style.transform = `scaleX(${Math.max(0, remaining)})`;
      if (remaining <= 0) {
        answered = true;
        window.clearInterval(tick);
        el.remove();
        this.upsellPrompt = null;
        // Walked away — tell the server so the offer clears.
        void this.network.karenderoUpsell(false);
      }
    }, 100);
  }

  /** Hands-on counter sale — full price plus tips, server-authoritative. */
  private serveCustomer(at: THREE.Vector3): void {
    if (!this.player || this.lastServeInFlight || this.hagglePrompt) return;
    this.lastServeAttempt = this.elapsed;
    this.lastServeInFlight = true;
    void this.network.serveCustomer().then((result) => {
      this.lastServeInFlight = false;
      if (!this.player) return;
      if (result.ok && result.data?.haggle) {
        this.showHagglePrompt(result.data.haggle);
        return;
      }
      if (result.ok && result.data) {
        const sale = result.data;
        if (sale.customer) {
          const label =
            sale.customer === 'tourist'
              ? 'Tourist pays full price!'
              : sale.customer === 'bargain'
                ? 'Bargain hunter…'
                : 'Suki regular!';
          const atPos = this.player.position.clone();
          atPos.y += 2.4;
          this.floatingText.spawn(atPos, label, 'info');
        }
        if (sale.refused) {
          this.floatingText.spawn(this.player.position.clone().setY(2.2), 'customer walked', 'info');
          return;
        }
        const total = sale.revenue + sale.tip;
        const atPos = this.player.position.clone();
        atPos.y += 2.1;
        this.floatingText.cash(total, atPos);
        if (sale.tip > 0) {
          this.floatingText.spawn(atPos.clone().add(new THREE.Vector3(0.9, 0.4, 0)), `tip +${peso(sale.tip)}`, 'info');
        }
        this.audio.sale();
        this.cameraRig.pulseFov(2.5);
        if (sale.tip >= 20) this.confetti?.burst(18, 0.45);
        window.setTimeout(() => this.audio.cash(), 180);
      } else if (!result.ok && result.error && !result.error.includes('breath')) {
        this.notifications?.show({ kind: 'warning', title: 'Cannot serve', message: result.error }, 2600);
      }
    });
  }

  /** Timed haggle prompt — accept the customer's offer or hold out for full price. */
  private showHagglePrompt(haggle: NonNullable<import('../../../shared/types').SaleReceipt['haggle']>): void {
    const root = document.getElementById('overlay-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'haggle-prompt';
    el.innerHTML = `
      <div class="haggle-card">
        <b>A customer haggles</b>
        <p>"${escapeHtml(haggle.productName)} ×${haggle.quantity} — can you do ${peso(haggle.offerPrice)}?"</p>
        <p class="haggle-ask">Your price: <b>${peso(haggle.askPrice)}</b></p>
        <div class="haggle-actions">
          <button type="button" class="haggle-accept">Accept ${peso(haggle.offerPrice)}</button>
          <button type="button" class="haggle-hold">Hold out</button>
        </div>
        <div class="haggle-timer"><span></span></div>
      </div>`;
    root.appendChild(el);
    this.hagglePrompt = el;

    const timerBar = el.querySelector<HTMLElement>('.haggle-timer span')!;
    const duration = Math.max(0, haggle.expiresAt - Date.now());
    const started = performance.now();
    let answered = false;

    const answer = (accept: boolean): void => {
      if (answered) return;
      answered = true;
      window.clearInterval(tick);
      el.remove();
      this.hagglePrompt = null;
      void this.network.respondHaggle(accept).then((result) => {
        if (!this.player) return;
        if (result.ok && result.data && !result.data.refused) {
          const sale = result.data;
          const total = sale.revenue + sale.tip;
          const atPos = this.player.position.clone();
          atPos.y += 2.1;
          this.floatingText.cash(total, atPos);
          if (sale.tip > 0) {
            this.floatingText.spawn(atPos.clone().add(new THREE.Vector3(0.9, 0.4, 0)), `tip +${peso(sale.tip)}`, 'info');
          }
          this.audio.sale();
          this.cameraRig.pulseFov(2.5);
          if (sale.tip >= 20) this.confetti?.burst(18, 0.45);
          window.setTimeout(() => this.audio.cash(), 180);
        } else if (result.ok && result.data?.refused) {
          this.floatingText.spawn(this.player.position.clone().setY(2.2), 'customer walked', 'info');
          this.audio.click();
        } else if (!result.ok && result.error) {
          this.floatingText.spawn(this.player.position.clone().setY(2.2), 'too late', 'info');
        }
      });
    };

    el.querySelector<HTMLButtonElement>('.haggle-accept')!.addEventListener('click', () => {
      this.audio.click();
      answer(true);
    });
    el.querySelector<HTMLButtonElement>('.haggle-hold')!.addEventListener('click', () => {
      this.audio.click();
      answer(false);
    });

    const tick = window.setInterval(() => {
      const remaining = 1 - (performance.now() - started) / duration;
      timerBar.style.transform = `scaleX(${Math.max(0, remaining)})`;
      if (remaining <= 0) {
        // Walked away — tell the server we refused so the offer clears.
        answered = true;
        window.clearInterval(tick);
        el.remove();
        this.hagglePrompt = null;
        void this.network.respondHaggle(false);
      }
    }, 50);
  }

  private applySettings(settings: GameSettings): void {
    const master = settings.masterVolume * (this.muted ? 0 : 1);
    this.audio.setVolumes(master, settings.ambienceVolume * (this.muted ? 0 : 1), settings.effectsVolume * (this.muted ? 0 : 1));
    if (this.environment) this.environment.applyQuality(settings.quality);
    if (this.renderer) {
      const ratio = Math.min(window.devicePixelRatio || 1, settings.quality === 'low' ? 1 : settings.quality === 'medium' ? 1.5 : 2);
      this.renderer.setPixelRatio(ratio);
      this.composer?.setPixelRatio(ratio);
      this.renderer.shadowMap.enabled = settings.quality === 'high';
      this.renderer.shadowMap.needsUpdate = true;
      this.applyComposer(settings.quality !== 'low');
    }
    this.player?.setShadows(settings.quality === 'high');
    this.input.touchSensitivity = settings.touchSensitivity;
    if (this.cameraRig) this.cameraRig.shakeEnabled = settings.cameraShake;
    this.remotePlayers?.setShadows(settings.quality === 'high');
    this.remotePlayers?.setShowNames(settings.showNames);
    this.crowd?.setNameTagsVisible(settings.showNames);
    this.crowd?.setQuality(settings.quality);
    this.weather.setEnabled(settings.weatherEffects);
  }

  /** Toggle the bloom pipeline — lantern glow and neon signage only bloom on medium+. */
  private applyComposer(enabled: boolean): void {
    if (!this.viewCamera) return;
    if (enabled && !this.composer) {
      // Composer targets bypass the canvas's own MSAA — ask for 4x samples
      // explicitly or medium/high quality renders jagged edges.
      const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.viewCamera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.4, // strength — subtle, the market glows rather than burns
        0.55, // radius
        0.7, // threshold — only bright emissive surfaces bloom
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.composer.setSize(window.innerWidth, window.innerHeight);
    } else if (!enabled && this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    }
  }

  private get eventVisual(): EventVisual {
    if (!this.activeEvent) return 'none';
    return MARKET_EVENTS[this.activeEvent.type]?.visual ?? 'none';
  }

  private update(dt: number): void {
    const blocked = isModalOpen();
    const look = this.input.consumeLook();
    const wheel = this.input.consumeWheel();
    const jump = this.input.consumeJump();
    const interact = this.input.consumeInteract();
    const help = this.input.consumeHelp();
    const menuKey = this.input.consumeMenuKey();
    const emote = this.input.consumeEmote();
    const mute = this.input.consumeMute();
    const fullscreen = this.input.consumeFullscreen();
    // FPS counter (settings toggle) — updates twice a second.
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsTimer = 0;
      this.fpsFrames = 0;
      const want = this.settings.current.showFps;
      if (want && !this.fpsEl) {
        this.fpsEl = document.createElement('div');
        this.fpsEl.id = 'fps-counter';
        document.body.appendChild(this.fpsEl);
      }
      if (this.fpsEl) {
        this.fpsEl.style.display = want ? 'block' : 'none';
        if (want) this.fpsEl.textContent = `${fps} fps`;
      }
      // Auto-quality: sustained low FPS steps the renderer down once.
      this.fpsSamples.push(fps);
      if (this.fpsSamples.length > 10) this.fpsSamples.shift();
      if (!this.autoQualityDone && this.fpsSamples.length === 10) {
        const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
        const q = this.settings.current.quality;
        if (avg < 45 && q === 'high') {
          this.settings.set('quality', 'medium');
          this.notifications?.info('Performance', 'Quality lowered to medium to keep the market smooth.', 'info');
        } else if (avg < 40 && q === 'medium') {
          this.settings.set('quality', 'low');
          this.notifications?.info('Performance', 'Quality lowered to low to keep the market smooth.', 'info');
        }
        this.autoQualityDone = true;
      }
    }
    const resetCam = this.input.consumeResetCamera();
    const namesToggle = this.input.consumeNames();
    const hasProfile = !!this.profile && !!this.player;
    const progress = this.profile
      ? currentProgress(this.profile, this.profileReceivedAt)
      : 0.52 + Math.sin(this.elapsed * 0.008) * 0.015;
    const visual = this.joined
      ? this.profile != null && this.profile.marketRushUntil > Date.now() + this.serverOffset
        ? 'crowd'
        : this.eventVisual
      : 'none';

    if (hasProfile && this.joined) {
      this.input.setEnabled(!blocked);
      if (mute) {
        this.muted = !this.muted;
        this.applySettings(this.settings.current);
        this.notifications?.show(
          { kind: 'info', title: this.muted ? 'Sound muted' : 'Sound on', message: '' },
          2000,
        );
      }
      if (fullscreen) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      }
      if (resetCam) {
        window.dispatchEvent(new CustomEvent('merkado:reset-camera'));
      }
      if (namesToggle) {
        const next = !this.settings.current.showNames;
        this.settings.set('showNames', next);
        this.notifications?.show(
          { kind: 'info', title: next ? 'Name tags on' : 'Name tags off', message: '' },
          2000,
        );
      }
      if (!blocked) {
        this.cameraRig.rotate(look.dx, look.dy, this.settings.current.sensitivity, this.settings.current.invertDrag);
        this.cameraRig.zoom(wheel);
        if (help) {
          this.audio.click();
          openHelpMenu();
        }
        if (menuKey === 'stock') {
          this.audio.click();
          this.shopMenu.open('stock');
        } else if (menuKey === 'boosts') {
          this.audio.click();
          this.shopMenu.open('boosts');
        } else if (menuKey === 'stats') {
          this.audio.click();
          this.statsMenu.open();
        }
        if (emote) {
          this.activeEmote = emote;
          this.emoteUntil = this.elapsed + 2.4;
          this.audio.click();
        }
      }
      let intent = blocked || this.intro
        ? { x: 0, y: 0, sprint: false, jump: false }
        : { x: this.input.movement.x, y: this.input.movement.y, sprint: this.input.sprint, jump };
      // Typhoon winds push back — you wade through the storm.
      if (this.weather.isStorm && (intent.x !== 0 || intent.y !== 0)) {
        intent = { ...intent, x: intent.x * 0.72, y: intent.y * 0.72, sprint: false };
      }
      this.player!.update(dt, this.elapsed, intent, this.cameraRig.yaw, this.collision);
      const landing = this.player!.consumeLanding();
      if (landing > 0) {
        this.cameraRig.shake(0.16 * landing, 0.28);
        this.audio.land(landing);
      }
      if (this.elapsed > this.emoteUntil) this.activeEmote = null;
      const payload = this.player!.positionPayload;
      if (this.activeEmote !== this.lastEmoteSent) {
        this.lastEmoteSent = this.activeEmote;
        this.network.sendPosition({ ...payload, emote: this.activeEmote ?? undefined }, true);
      } else {
        this.network.sendPosition(this.activeEmote ? { ...payload, emote: this.activeEmote } : payload);
      }
      this.interaction.setActive(!blocked && !this.intro);
      this.interaction.update(this.player!.position);
      // Trigger after the target refresh so a profile tick can never swallow the E press.
      if (!blocked && !this.intro && interact && this.interaction.trigger()) {
        this.cameraRig.shake(0.05, 0.18);
      }

      if (this.intro) {
        const skip = this.input.consumeAnyInput();
        const done = this.intro.update(dt, this.viewCamera) || skip;
        if (done) {
          this.intro = null;
          this.input.setEnabled(!blocked);
          this.cameraRig.yaw = this.player!.yaw;
          this.cameraRig.pitch = 0.2;
          this.cameraRig.snap(this.player!.position, this.collision);
        }
      } else {
        this.cameraRig.update(
          dt,
          this.player!.position,
          this.collision,
          this.player!.speed,
          this.settings.current.reduceMotion,
        );
      }
    } else {
      this.input.setEnabled(false);
      this.updateCinematicCamera();
    }

    this.remotePlayers.update(dt, this.elapsed);
    this.crowd.update(dt, this.elapsed, this.player?.position, this.activeEmote != null);
    this.updateNpcTalkTarget();
    this.updateKarendero();
    this.trafficTimer -= dt;
    if (this.trafficTimer <= 0) {
      this.trafficTimer = 0.6;
      this.hud.setTraffic(this.player ? this.crowd.trafficNearStall() : null);
    }
    this.market.update(dt, this.elapsed);
    this.umbrellas.update(dt, this.elapsed);
    this.plotManager.update(dt, this.elapsed);
    this.weather.update(dt);
    const rainIntensity = !this.settings.current.weatherEffects
      ? 0
      : this.weather.isStorm
        ? 1
        : this.weather.isRainy
          ? 0.6
          : 0;
    this.rain?.setIntensity(rainIntensity);
    this.crowd.setStorm(this.weather.isStorm ? 1 : this.weather.isRainy ? 0.45 : 0);
    this.rain?.update(dt, this.viewCamera.position);
    this.jeepneys?.setVisible(this.activeEvent?.type !== 'jeepneyStrike');
    this.jeepneys?.update(dt);

    const focus = hasProfile && this.joined && this.player ? this.player.position : this.cinematicFocus;
    // Seasonal calendar: fiesta week (days 7-8 of each 9) and parol season
    // (first 3 days of each 36) turn the lamps red and green.
    const day = this.profile?.day ?? 1;
    this.environment?.setFestive(day % 9 >= 7 || day % 36 < 3);
    this.environment.update(dt, progress, focus, visual);

    this.atmosphereTimer -= dt;
    if (this.atmosphereTimer <= 0) {
      this.atmosphereTimer = 0.7;
      this.crowd.setAtmosphere(progress, visual, this.settings.current.quality);
      const rain = this.weather.isStorm ? 1 : this.weather.isRainy ? 0.65 : 0;
      this.crowd.setRainy(rain > 0);
      this.player?.avatar.setUmbrella(rain > 0);
      const crowdLevel = visual === 'crowd' ? 1 : this.crowd.activeCount > 28 ? 0.8 : 0.5;
      this.audio.setEnvironment(crowdLevel, rain, progress > 0.72, this.settings.current.reduceMotion);
    }
    this.audio.update(dt, progress, this.weather.isRainy);
  }

  private updateCinematicCamera(): void {
    const t = this.elapsed;
    const orbit = t * 0.042;
    this.viewCamera.position.set(
      Math.sin(orbit) * 9.5,
      6.35 + Math.sin(t * 0.17) * 0.38,
      64 + Math.cos(orbit) * 10,
    );
    this.viewCamera.lookAt(0, 2.2, 43);
    this.cinematicFocus.set(0, 0, 48);
  }

  private animate(time: number): void {
    this.frameHandle = window.requestAnimationFrame(this.boundAnimate);
    if (!this.booted) return;
    if (!this.lastFrame) this.lastFrame = time;
    const dt = Math.min(0.06, Math.max(0.001, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    this.elapsed += dt;
    this.update(dt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.viewCamera);
  }

  private startLoop(): void {
    this.lastFrame = 0;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = window.requestAnimationFrame(this.boundAnimate);
  }

  private async refreshServerInfo(): Promise<void> {
    if (this.joined) return;
    try {
      const response = await fetch('/api/market', { cache: 'no-store' });
      if (!response.ok) throw new Error('offline');
      const data = (await response.json()) as { online?: number; persistence?: string };
      this.login?.setServerStatus({
        online: Number(data.online ?? 0),
        persistence: String(data.persistence ?? 'memory'),
        reachable: true,
      });
    } catch {
      this.login?.setServerStatus({ online: 0, persistence: 'memory', reachable: false });
    }
  }

  private setBoot(status: string, progress: number, tip?: string): void {
    const statusEl = document.getElementById('boot-status');
    const bar = document.getElementById('boot-progress');
    const tipEl = document.getElementById('boot-tip');
    if (statusEl) statusEl.textContent = status;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    if (tipEl && tip) tipEl.textContent = tip;
  }

  private failBoot(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.setBoot('The market could not open', 100, 'Check the browser console, then reload.');
    const statusEl = document.getElementById('boot-status');
    if (statusEl) {
      statusEl.textContent = `Could not start the 3D market: ${detail}`;
      statusEl.style.color = '#e79b8f';
    }
    const tip = document.getElementById('boot-tip');
    if (tip) tip.textContent = 'Make sure WebGL is enabled in your browser, then reload.';
  }

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      window.requestAnimationFrame(finish);
      // Background tabs pause animation frames; never leave the boot screen hanging.
      window.setTimeout(finish, 400);
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    window.clearInterval(this.serverInfoTimer);
    window.clearTimeout(this.onboardingTimer);
    this.settingsUnsub?.();
    for (const detach of this.detachFns) detach();
    this.detachFns = [];
    this.network?.close();
    this.input?.dispose();
    this.player?.dispose();
    this.remotePlayers?.dispose();
    this.crowd?.dispose();
    this.plotManager?.dispose();
    this.environment?.dispose();
    this.audio.dispose();
    this.renderer?.dispose();
  }
}

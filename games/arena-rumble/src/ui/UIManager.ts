import { el } from './dom';
import { MainMenu, type MainMenuCallbacks } from './MainMenu';
import { LobbyUI, type LobbyCallbacks } from './LobbyUI';
import { LoadingUI } from './LoadingUI';
import { RoundUI, RoundResultUI, EliminationUI } from './RoundUI';
import { SpectatorUI } from './SpectatorUI';
import { VictoryUI } from './VictoryUI';
import { HUD } from './HUD';

export type ScreenName =
  | 'menu'
  | 'lobby'
  | 'loading'
  | 'card'
  | 'result'
  | 'eliminated'
  | 'champion'
  | 'none';

/**
 * One place that decides what is on screen. The game never touches the DOM
 * directly; it asks for a screen and the manager swaps it in behind a fade.
 */
export class UIManager {
  readonly menu: MainMenu;
  readonly lobby: LobbyUI;
  readonly loading = new LoadingUI();
  readonly card = new RoundUI();
  readonly result = new RoundResultUI();
  readonly elimination = new EliminationUI();
  readonly spectator = new SpectatorUI();
  readonly victory: VictoryUI;
  readonly hud = new HUD();

  private container: HTMLElement;
  private fade: HTMLElement;
  private prompt: HTMLElement;
  private currentScreen: ScreenName = 'none';
  private hudVisible = false;
  private spectatorVisible = false;

  constructor(
    container: HTMLElement,
    callbacks: MainMenuCallbacks & LobbyCallbacks & { onBackToLobby: () => void },
  ) {
    this.container = container;
    this.menu = new MainMenu(callbacks);
    this.lobby = new LobbyUI(callbacks);
    this.victory = new VictoryUI(callbacks.onBackToLobby);

    this.fade = el('div', { class: 'fade' });
    this.prompt = el('div', { class: 'prompt', text: 'Click to look around' });
    this.prompt.style.display = 'none';

    container.append(this.fade, this.prompt);
    this.show('menu');
  }

  show(screen: ScreenName): void {
    if (this.currentScreen === screen) return;

    const previous = this.screenNode(this.currentScreen);
    if (previous) previous.remove();

    this.currentScreen = screen;
    const next = this.screenNode(screen);
    if (next) this.container.insertBefore(next, this.fade);
    if (screen === 'menu') this.menu.focus();
  }

  private screenNode(screen: ScreenName): HTMLElement | null {
    switch (screen) {
      case 'menu':
        return this.menu.root;
      case 'lobby':
        return this.lobby.root;
      case 'loading':
        return this.loading.root;
      case 'card':
        return this.card.root;
      case 'result':
        return this.result.root;
      case 'eliminated':
        return this.elimination.root;
      case 'champion':
        return this.victory.root;
      default:
        return null;
    }
  }

  setHudVisible(visible: boolean): void {
    if (visible === this.hudVisible) return;
    this.hudVisible = visible;
    if (visible) this.container.insertBefore(this.hud.root, this.fade);
    else this.hud.root.remove();
  }

  setSpectatorVisible(visible: boolean): void {
    if (visible === this.spectatorVisible) return;
    this.spectatorVisible = visible;
    if (visible) this.container.insertBefore(this.spectator.root, this.fade);
    else this.spectator.root.remove();
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.prompt.style.display = 'none';
      return;
    }
    this.prompt.textContent = text;
    this.prompt.style.display = '';
  }

  /** Fade to black, run the work, fade back in. */
  async transition(work: () => Promise<void> | void): Promise<void> {
    this.fade.classList.add('fade--on');
    await wait(340);
    await work();
    this.fade.classList.remove('fade--on');
  }

  setFaded(faded: boolean): void {
    this.fade.classList.toggle('fade--on', faded);
  }

  get screen(): ScreenName {
    return this.currentScreen;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

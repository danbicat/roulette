import type { Camera } from './camera';
import { canvasHeight, canvasWidth, initialZoom, Themes, winnerAreaHeight } from './data/constants';
import type { StageDef } from './data/maps';
import type { GameObject } from './gameObject';
import type { Marble } from './marble';
import type { ParticleManager } from './particleManager';
import type { ColorTheme } from './types/ColorTheme';
import type { MapEntityState } from './types/MapEntity.type';
import type { VectorLike } from './types/VectorLike';
import type { UIObject } from './UIObject';

export type RenderParameters = {
  camera: Camera;
  stage: StageDef;
  entities: MapEntityState[];
  marbles: Marble[];
  winners: Marble[];
  particleManager: ParticleManager;
  effects: GameObject[];
  winnerRank: number;
  winnerRankStart?: number;
  winnerRankEnd?: number;
  winner: Marble | null;
  winningMarbles?: Marble[];
  size: VectorLike;
  theme: ColorTheme;
};

const MAX_DISPLAY_WIDTH = 1920;
const WINNER_TEXT_OFFSET = 30;

export class RouletteRenderer {
  protected _canvas!: HTMLCanvasElement;
  protected _sceneCanvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  private _displayCtx!: CanvasRenderingContext2D;
  public sizeFactor = 1;

  protected _images: { [key: string]: HTMLImageElement } = {};
  protected _theme: ColorTheme = Themes.dark;

  constructor() {}

  get width() {
    return this._sceneCanvas.width;
  }

  get height() {
    return this._sceneCanvas.height;
  }

  get canvas() {
    return this._canvas;
  }

  set theme(value: ColorTheme) {
    this._theme = value;
  }

  async init() {
    await this._load();

    this._canvas = document.createElement('canvas');
    this._canvas.width = canvasWidth;
    this._canvas.height = canvasHeight;
    this._displayCtx = this._canvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;

    this._sceneCanvas = document.createElement('canvas');
    this._sceneCanvas.width = canvasWidth;
    this._sceneCanvas.height = canvasHeight;
    this.ctx = this._sceneCanvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;

    document.body.appendChild(this._canvas);

    const resizing = (entries?: ResizeObserverEntry[]) => {
      const realSize = entries ? entries[0].contentRect : this._canvas.getBoundingClientRect();
      if (realSize.width <= 0 || realSize.height <= 0) return;

      const width = Math.max(realSize.width / 2, 640);
      const height = (width / realSize.width) * realSize.height;
      this._sceneCanvas.width = Math.min(width, MAX_DISPLAY_WIDTH);
      this._sceneCanvas.height = Math.min(height, (MAX_DISPLAY_WIDTH / realSize.width) * realSize.height);
      this.sizeFactor = width / realSize.width;
    };

    const resizeObserver = new ResizeObserver(resizing);
    resizeObserver.observe(this._canvas);
    resizing();
  }

  private async _loadImage(url: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.src = url;
    return new Promise((resolve) => {
      img.addEventListener('load', () => {
        resolve(img);
      });
    });
  }

  private async _load(): Promise<void> {
    const loadPromises = [
      'chamru',
      'junyoop',
      'kkwak',
      'kubin',
      'waldokun',
    ].map(async (name) => {
      const imgUrl = new URL(`../assets/images/${name}.png`, import.meta.url);
      this._images[name] = await this._loadImage(imgUrl.toString());
    });

    loadPromises.push(
      (async () => {
        this._images.ff = await this._loadImage(new URL('../assets/images/ff.svg', import.meta.url).toString());
      })()
    );

    await Promise.all(loadPromises);
  }

  private getMarbleImage(name: string): CanvasImageSource | undefined {
    return this._images[name];
  }

  protected onBeforeEntities(): void {}
  protected onAfterScene(): void {}

  render(renderParameters: RenderParameters, uiObjects: UIObject[]) {
    this._theme = renderParameters.theme;
    this.ctx.fillStyle = this._theme.background;
    this.ctx.fillRect(0, 0, this._sceneCanvas.width, this._sceneCanvas.height);

    this.ctx.save();
    this.ctx.scale(initialZoom, initialZoom);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = '0.4pt sans-serif';
    this.ctx.lineWidth = 3 / (renderParameters.camera.zoom + initialZoom);
    renderParameters.camera.renderScene(this.ctx, () => {
      this.onBeforeEntities();
      this.renderEntities(renderParameters.entities);
      this.renderEffects(renderParameters);
      this.renderMarbles(renderParameters);
    });
    this.ctx.restore();
    this.onAfterScene();

    uiObjects.forEach((obj) =>
      obj.render(this.ctx, renderParameters, this._sceneCanvas.width, this._sceneCanvas.height)
    );
    renderParameters.particleManager.render(this.ctx);
    this.renderWinner(renderParameters);

    this._displayCtx.drawImage(this._sceneCanvas, 0, 0, this._canvas.width, this._canvas.height);
  }

  private renderEntities(entities: MapEntityState[]) {
    this.ctx.save();
    entities.forEach((entity) => {
      const transform = this.ctx.getTransform();
      this.ctx.translate(entity.x, entity.y);
      this.ctx.rotate(entity.angle);
      this.ctx.fillStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].fill;
      this.ctx.strokeStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].outline;
      this.ctx.shadowBlur = this._theme.entity[entity.shape.type].bloomRadius;
      this.ctx.shadowColor =
        entity.shape.bloomColor ?? entity.shape.color ?? this._theme.entity[entity.shape.type].bloom;
      const shape = entity.shape;
      switch (shape.type) {
        case 'polyline':
          if (shape.points.length > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(shape.points[0][0], shape.points[0][1]);
            for (let i = 1; i < shape.points.length; i++) {
              this.ctx.lineTo(shape.points[i][0], shape.points[i][1]);
            }
            this.ctx.stroke();
          }
          break;
        case 'box': {
          const w = shape.width * 2;
          const h = shape.height * 2;
          this.ctx.rotate(shape.rotation);
          this.ctx.fillRect(-w / 2, -h / 2, w, h);
          this.ctx.strokeRect(-w / 2, -h / 2, w, h);
          break;
        }
        case 'circle':
          this.ctx.beginPath();
          this.ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
          this.ctx.stroke();
          break;
      }

      this.ctx.setTransform(transform);
    });
    this.ctx.restore();
  }

  private renderEffects({ effects, camera }: RenderParameters) {
    effects.forEach((effect) => effect.render(this.ctx, camera.zoom * initialZoom, this._theme));
  }

  private renderMarbles({ marbles, camera, winnerRank, winnerRankStart, winnerRankEnd, winners, size }: RenderParameters) {
    const start = winnerRankStart ?? winnerRank;
    const end = winnerRankEnd ?? winnerRank;

    const viewPort = { x: camera.x, y: camera.y, w: size.x, h: size.y, zoom: camera.zoom * initialZoom };
    marbles.forEach((marble, i) => {
      const currentRank = i + winners.length;
      const isWinning = currentRank >= start && currentRank <= end;
      marble.render(
        this.ctx,
        camera.zoom * initialZoom,
        isWinning,
        false,
        this.getMarbleImage(marble.name),
        viewPort,
        this._theme
      );
    });
  }

  private renderWinner({ winner, winningMarbles, theme }: RenderParameters) {
    const list = winningMarbles && winningMarbles.length > 0 ? winningMarbles : (winner ? [winner] : []);
    if (list.length === 0) return;

    this.ctx.save();
    this.ctx.fillStyle = theme.winnerBackground;
    const bannerWidth = this._sceneCanvas.width / 2;
    const bannerX = this._sceneCanvas.width - bannerWidth;
    const bannerY = this._sceneCanvas.height - winnerAreaHeight;
    this.ctx.fillRect(bannerX, bannerY, bannerWidth, winnerAreaHeight);

    if (list.length === 1) {
      const winnerItem = list[0];
      const marbleSize = 100;
      const marbleCenterX = this._sceneCanvas.width - marbleSize / 2 - 20;
      const marbleCenterY = this._sceneCanvas.height - winnerAreaHeight / 2;
      const marbleImage = this.getMarbleImage(winnerItem.name);

      if (marbleImage) {
        this.ctx.drawImage(
          marbleImage,
          marbleCenterX - marbleSize / 2,
          marbleCenterY - marbleSize / 2,
          marbleSize,
          marbleSize
        );
      } else {
        this.ctx.beginPath();
        this.ctx.arc(marbleCenterX, marbleCenterY, marbleSize / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = `hsl(${winnerItem.hue} 100% ${theme.marbleLightness})`;
        this.ctx.fill();
      }

      this.ctx.fillStyle = theme.winnerText;
      this.ctx.strokeStyle = theme.winnerOutline;

      this.ctx.font = 'bold 48px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.lineWidth = 4;
      const textRightX = marbleCenterX - marbleSize / 2 - 20;
      if (theme.winnerOutline) {
        this.ctx.strokeText('Winner', textRightX, this._sceneCanvas.height - 120 + WINNER_TEXT_OFFSET);
      }

      this.ctx.fillText('Winner', textRightX, this._sceneCanvas.height - 120 + WINNER_TEXT_OFFSET);
      this.ctx.font = 'bold 72px sans-serif';
      this.ctx.fillStyle = `hsl(${winnerItem.hue} 100% ${theme.marbleLightness})`;
      if (theme.winnerOutline) {
        this.ctx.strokeText(winnerItem.name, textRightX, this._sceneCanvas.height - 55 + WINNER_TEXT_OFFSET);
      }
      this.ctx.fillText(winnerItem.name, textRightX, this._sceneCanvas.height - 55 + WINNER_TEXT_OFFSET);
    } else {
      // Multiple winners
      this.ctx.fillStyle = theme.winnerText;
      this.ctx.strokeStyle = theme.winnerOutline;
      this.ctx.lineWidth = 3;

      // Title
      this.ctx.font = 'bold 30px sans-serif';
      this.ctx.textAlign = 'left';
      const title = `Winners (${list.length})`;
      if (theme.winnerOutline) {
        this.ctx.strokeText(title, bannerX + 25, bannerY + 40);
      }
      this.ctx.fillText(title, bannerX + 25, bannerY + 40);

      // Render winners list
      const maxDisplay = Math.min(list.length, 10);
      const isTwoRows = list.length > 5;
      const cols = isTwoRows ? Math.ceil(maxDisplay / 2) : maxDisplay;
      const colWidth = (bannerWidth - 50) / cols;

      for (let i = 0; i < maxDisplay; i++) {
        const item = list[i];
        const row = isTwoRows ? Math.floor(i / cols) : 0;
        const col = isTwoRows ? i % cols : i;
        const itemX = bannerX + 25 + col * colWidth;
        const itemY = bannerY + (isTwoRows ? (row === 0 ? 80 : 130) : 100);

        const marbleRadius = isTwoRows ? 15 : 22;
        const centerX = itemX + marbleRadius;
        const centerY = itemY;

        const marbleImg = this.getMarbleImage(item.name);
        if (marbleImg) {
          this.ctx.drawImage(
            marbleImg,
            centerX - marbleRadius,
            centerY - marbleRadius,
            marbleRadius * 2,
            marbleRadius * 2
          );
        } else {
          this.ctx.beginPath();
          this.ctx.arc(centerX, centerY, marbleRadius, 0, Math.PI * 2);
          this.ctx.fillStyle = `hsl(${item.hue} 100% ${theme.marbleLightness})`;
          this.ctx.fill();
        }

        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = theme.winnerText;
        this.ctx.font = `bold ${isTwoRows ? 15 : 20}px sans-serif`;
        const textX = centerX + marbleRadius + 8;
        const nameText = item.name.length > 8 ? `${item.name.slice(0, 7)}…` : item.name;
        if (theme.winnerOutline) {
          this.ctx.strokeText(nameText, textX, centerY + (isTwoRows ? 5 : 7));
        }
        this.ctx.fillText(nameText, textX, centerY + (isTwoRows ? 5 : 7));
      }

      if (list.length > 10) {
        this.ctx.font = 'italic 16px sans-serif';
        this.ctx.fillStyle = theme.winnerText;
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`+${list.length - 10} more`, this._sceneCanvas.width - 25, bannerY + 38);
      }
    }
    this.ctx.restore();
  }
}
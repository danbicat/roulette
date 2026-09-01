import type { Marble } from './marble';
import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

export class WinnerRenderer implements UIObject {
  private _scrollY = 0;
  private _targetScrollY = 0;
  private _panelRect: Rect | null = null;
  private _winningMarbles: Marble[] = [];
  private _winnerRankStart = 0;
  private _winnerRankEnd = 0;
  private _isVisible = false;
  private _isClosed = false;

  private _isDragging = false;
  private _dragStartY = 0;
  private _dragStartScrollY = 0;

  private _isDraggingScrollbar = false;
  private _hoverClose = false;
  private _hoverCopy = false;

  private messageHandler?: (msg: string) => void;

  private readonly headerHeight = 50;
  private readonly rowHeight = 44;

  public reset() {
    this._scrollY = 0;
    this._targetScrollY = 0;
    this._winningMarbles = [];
    this._isVisible = false;
    this._isClosed = false;
    this._isDragging = false;
    this._isDraggingScrollbar = false;
  }

  public getBoundingBox(): Rect | null {
    if (!this._isVisible || this._isClosed) return null;
    return this._panelRect;
  }

  onMessage(func: (msg: string) => void) {
    this.messageHandler = func;
  }

  @bound
  onWheel(e: WheelEvent) {
    if (!this._isVisible || this._isClosed) return;
    e.preventDefault();

    const maxScroll = this._getMaxScroll();
    if (maxScroll <= 0) return;

    this._targetScrollY += e.deltaY * 0.7;
    if (this._targetScrollY < 0) this._targetScrollY = 0;
    if (this._targetScrollY > maxScroll) this._targetScrollY = maxScroll;
  }

  private _getMaxScroll(): number {
    if (!this._panelRect) return 0;
    const contentHeight = this._panelRect.h - this.headerHeight - 12;
    const totalHeight = this._winningMarbles.length * this.rowHeight;
    return Math.max(0, totalHeight - contentHeight);
  }

  @bound
  onMouseDown(e?: MouseEventArgs) {
    if (!e || !this._isVisible || this._isClosed || !this._panelRect) return;

    // Relative coords: e.x in [0, panelRect.w], e.y in [0, panelRect.h]
    // 1. Close button: x from w - 36 to w - 12, y from 12 to 36
    if (e.x >= this._panelRect.w - 36 && e.x <= this._panelRect.w - 12 && e.y >= 12 && e.y <= 36) {
      this._isClosed = true;
      return;
    }

    // 2. Copy button: x from w - 74 to w - 44, y from 12 to 36
    if (e.x >= this._panelRect.w - 74 && e.x <= this._panelRect.w - 44 && e.y >= 12 && e.y <= 36) {
      this._copyWinners();
      return;
    }

    // 3. Scrollbar track: x from w - 18 to w
    const maxScroll = this._getMaxScroll();
    if (maxScroll > 0 && e.x >= this._panelRect.w - 18 && e.y >= this.headerHeight) {
      this._isDraggingScrollbar = true;
      this._dragStartY = e.y;
      this._dragStartScrollY = this._scrollY;
      return;
    }

    // 4. Content drag
    if (e.y >= this.headerHeight && maxScroll > 0) {
      this._isDragging = true;
      this._dragStartY = e.y;
      this._dragStartScrollY = this._scrollY;
    }
  }

  @bound
  onMouseMove(e?: MouseEventArgs) {
    if (!this._isVisible || this._isClosed || !this._panelRect) return;

    if (!e) {
      this._hoverClose = false;
      this._hoverCopy = false;
      return;
    }

    this._hoverClose =
      e.x >= this._panelRect.w - 36 && e.x <= this._panelRect.w - 12 && e.y >= 12 && e.y <= 36;
    this._hoverCopy =
      e.x >= this._panelRect.w - 74 && e.x <= this._panelRect.w - 44 && e.y >= 12 && e.y <= 36;

    const maxScroll = this._getMaxScroll();
    if (maxScroll <= 0) return;

    if (this._isDraggingScrollbar) {
      const contentHeight = this._panelRect.h - this.headerHeight - 12;
      const totalHeight = this._winningMarbles.length * this.rowHeight;
      const thumbHeight = Math.max(24, (contentHeight / totalHeight) * contentHeight);
      const scrollableTrackHeight = contentHeight - thumbHeight;
      if (scrollableTrackHeight > 0) {
        const delta = e.y - this._dragStartY;
        const scrollDelta = (delta / scrollableTrackHeight) * maxScroll;
        this._targetScrollY = Math.max(0, Math.min(maxScroll, this._dragStartScrollY + scrollDelta));
        this._scrollY = this._targetScrollY;
      }
    } else if (this._isDragging) {
      const delta = this._dragStartY - e.y;
      this._targetScrollY = Math.max(0, Math.min(maxScroll, this._dragStartScrollY + delta));
      this._scrollY = this._targetScrollY;
    }
  }

  @bound
  onMouseUp(e?: MouseEventArgs) {
    this._isDragging = false;
    this._isDraggingScrollbar = false;
  }

  @bound
  onDblClick(e?: MouseEventArgs) {
    if (!e || !this._isVisible || this._isClosed) return;
    this._copyWinners();
  }

  private _copyWinners() {
    if (!navigator.clipboard || this._winningMarbles.length === 0) return;
    const tsv: string[] = [];
    tsv.push(['Rank', 'Name'].join('\t'));
    this._winningMarbles.forEach((marble, i) => {
      const rank = this._winnerRankStart + i + 1;
      tsv.push([rank.toString(), marble.name].join('\t'));
    });
    navigator.clipboard.writeText(tsv.join('\n')).then(() => {
      if (this.messageHandler) {
        this.messageHandler('The result has been copied');
      }
    });
  }

  update(deltaTime: number) {
    if (!this._isVisible || this._isClosed) return;

    const maxScroll = this._getMaxScroll();
    if (this._targetScrollY > maxScroll) this._targetScrollY = maxScroll;
    if (this._targetScrollY < 0) this._targetScrollY = 0;

    if (this._scrollY !== this._targetScrollY) {
      this._scrollY += (this._targetScrollY - this._scrollY) * Math.min(1, deltaTime / 70);
      if (Math.abs(this._targetScrollY - this._scrollY) < 0.5) {
        this._scrollY = this._targetScrollY;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, params: RenderParameters, width: number, height: number) {
    const list =
      params.winningMarbles && params.winningMarbles.length > 0
        ? params.winningMarbles
        : params.winner
        ? [params.winner]
        : [];

    if (list.length === 0) {
      this._isVisible = false;
      this._panelRect = null;
      return;
    }

    this._winningMarbles = list;
    this._winnerRankStart = params.winnerRankStart ?? params.winnerRank;
    this._winnerRankEnd = params.winnerRankEnd ?? params.winnerRank;
    this._isVisible = true;

    if (this._isClosed) return;

    // Calculate panel rect
    const isMobile = width < 700;
    const panelWidth = isMobile ? Math.max(280, width - 30) : 420;
    const maxRowsVisible = 6;
    const contentVisibleHeight = Math.min(list.length * this.rowHeight, maxRowsVisible * this.rowHeight);
    const panelHeight = Math.min(height - 40, this.headerHeight + contentVisibleHeight + 16);

    const panelX = isMobile ? (width - panelWidth) / 2 : width - panelWidth - 20;
    const panelY = height - panelHeight - 20;

    this._panelRect = { x: panelX, y: panelY, w: panelWidth, h: panelHeight };

    ctx.save();

    // Panel background & shadow
    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.fillStyle = params.theme.winnerBackground || 'rgba(25, 25, 30, 0.9)';
    ctx.strokeStyle = params.theme.winnerOutline || 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    drawRoundRect(ctx, panelX, panelY, panelWidth, panelHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Header background line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX, panelY + this.headerHeight);
    ctx.lineTo(panelX + panelWidth, panelY + this.headerHeight);
    ctx.stroke();

    // Header Title
    ctx.fillStyle = params.theme.winnerText || 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px sans-serif';
    const title = list.length === 1 ? 'Winner' : `Winners (${list.length})`;
    ctx.fillText(title, panelX + 18, panelY + this.headerHeight / 2);

    // Copy icon / button in header
    const copyBtnX = panelX + panelWidth - 62;
    const copyBtnY = panelY + this.headerHeight / 2;
    ctx.fillStyle = this._hoverCopy ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    drawRoundRect(ctx, copyBtnX - 12, copyBtnY - 12, 24, 24, 4);
    ctx.fill();

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = params.theme.winnerText || 'white';
    ctx.fillText('📋', copyBtnX, copyBtnY);

    // Close button (✕)
    const closeBtnX = panelX + panelWidth - 26;
    const closeBtnY = panelY + this.headerHeight / 2;
    ctx.fillStyle = this._hoverClose ? 'rgba(255, 60, 60, 0.3)' : 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    drawRoundRect(ctx, closeBtnX - 12, closeBtnY - 12, 24, 24, 4);
    ctx.fill();

    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = this._hoverClose ? '#ff6b6b' : params.theme.winnerText || 'white';
    ctx.fillText('✕', closeBtnX, closeBtnY);

    // Content List Area
    const contentY = panelY + this.headerHeight + 6;
    const contentH = panelHeight - this.headerHeight - 12;

    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX, contentY, panelWidth, contentH);
    ctx.clip();

    const startRow = Math.max(0, Math.floor(this._scrollY / this.rowHeight));
    const endRow = Math.min(list.length, Math.ceil((this._scrollY + contentH) / this.rowHeight));

    for (let i = startRow; i < endRow; i++) {
      const marble = list[i];
      const rankNum = this._winnerRankStart + i + 1;
      const rowY = contentY + i * this.rowHeight - this._scrollY;

      // Alternating row background
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(panelX + 4, rowY, panelWidth - 8, this.rowHeight);
      }

      // Rank text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px sans-serif';
      if (rankNum === 1) {
        ctx.fillStyle = '#ffd700'; // Gold
      } else if (rankNum === 2) {
        ctx.fillStyle = '#e0e0e0'; // Silver
      } else if (rankNum === 3) {
        ctx.fillStyle = '#cd7f32'; // Bronze
      } else {
        ctx.fillStyle = params.theme.winnerText || 'white';
      }
      ctx.fillText(`#${rankNum}`, panelX + 16, rowY + this.rowHeight / 2);

      // Marble avatar / colored circle
      const avatarX = panelX + 75;
      const avatarY = rowY + this.rowHeight / 2;
      const avatarR = 14;

      const img = params.getMarbleImage ? params.getMarbleImage(marble.name) : undefined;
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${marble.hue} 100% ${params.theme.marbleLightness}%)`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Marble Name
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = params.theme.winnerText || 'white';
      const maxTextWidth = panelWidth - 145;
      let displayName = marble.name;
      if (ctx.measureText(displayName).width > maxTextWidth) {
        while (displayName.length > 1 && ctx.measureText(displayName + '…').width > maxTextWidth) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '…';
      }
      ctx.fillText(displayName, avatarX + avatarR + 12, rowY + this.rowHeight / 2);

      // Star badge
      ctx.textAlign = 'right';
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('☆', panelX + panelWidth - 28, rowY + this.rowHeight / 2);
    }

    ctx.restore(); // restore clipping

    // Draw Scrollbar if scrollable
    const maxScroll = this._getMaxScroll();
    if (maxScroll > 0) {
      const totalH = list.length * this.rowHeight;
      const scrollbarTrackH = contentH;
      const thumbH = Math.max(24, (contentH / totalH) * scrollbarTrackH);
      const thumbY = contentY + (this._scrollY / maxScroll) * (scrollbarTrackH - thumbH);
      const scrollbarX = panelX + panelWidth - 10;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      drawRoundRect(ctx, scrollbarX - 2, contentY, 6, scrollbarTrackH, 3);
      ctx.fill();

      ctx.fillStyle = this._isDraggingScrollbar
        ? 'rgba(255, 255, 255, 0.5)'
        : 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      drawRoundRect(ctx, scrollbarX - 2, thumbY, 6, thumbH, 3);
      ctx.fill();
    }

    ctx.restore();
  }
}

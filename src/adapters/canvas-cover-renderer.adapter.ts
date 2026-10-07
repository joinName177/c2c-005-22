import type { CoverConfig } from '../core/models';
import {
  BUBBLE_PADDING_X,
  BUBBLE_PADDING_Y,
  DESIGN_HEIGHTS,
  DESIGN_WIDTH,
  LINE_HEIGHT_RATIO,
  bubbleBlock,
  bubbleRect,
  evaluateLayout,
  layoutTitle,
} from '../core/cover-layout';
import type { CoverRendererPort } from '../ports/cover-renderer.port';

export class CanvasCoverRendererAdapter implements CoverRendererPort {
  constructor(private readonly createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}

  async render(config: CoverConfig, target?: HTMLCanvasElement): Promise<Blob> {
    const canvas = target ?? this.createCanvas();
    canvas.width = DESIGN_WIDTH;
    canvas.height = DESIGN_HEIGHTS[config.ratio];
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法创建 Canvas');

    this.drawBackground(ctx, config);
    this.drawWave(ctx, config);
    if (config.layout) {
      const issue = validateForRender(config);
      if (issue) throw new Error(issue);
      this.drawTitle(ctx, config);
      this.drawBubble(ctx, { ...config, layout: config.layout });
    } else {
      // 旧作品：固定 92px 单行标题 + 单行原始位置气泡，逐像素保持原图
      this.drawLegacyTitle(ctx, config);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(config.bubbleText, (canvas.width * config.bubbleX) / 100, (canvas.height * config.bubbleY) / 100);
    }

    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('封面导出失败'))), 'image/png'),
    );
  }

  private drawBackground(ctx: CanvasRenderingContext2D, config: CoverConfig) {
    ctx.fillStyle = config.palette[0];
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHTS[config.ratio]);
    ctx.globalAlpha = config.filter === 'mono' ? 0.45 : 0.72;
    ctx.fillStyle = config.palette[1];
    ctx.fillRect(60, 60, DESIGN_WIDTH - 120, DESIGN_HEIGHTS[config.ratio] - 120);
    ctx.globalAlpha = 1;
  }

  private drawWave(ctx: CanvasRenderingContext2D, config: CoverConfig) {
    ctx.strokeStyle = config.palette[2];
    ctx.lineWidth = 14;
    ctx.beginPath();
    for (let x = 0; x <= DESIGN_WIDTH; x += 30) {
      const y = DESIGN_HEIGHTS[config.ratio] * 0.43 + Math.sin(x / 35) * 62;
      if (!x) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** 旧作品标题：固定 92px 单行，末行基线 0.30H */
  private drawLegacyTitle(ctx: CanvasRenderingContext2D, config: CoverConfig) {
    ctx.fillStyle = config.palette[2];
    ctx.font = '900 92px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(config.title, DESIGN_WIDTH / 2, DESIGN_HEIGHTS[config.ratio] * 0.3);
  }

  /** 标题与核心引擎共用 layoutTitle：缩字号/换行后末行基线仍在 0.30H */
  private drawTitle(ctx: CanvasRenderingContext2D, config: CoverConfig) {
    const title = layoutTitle(config.title);
    const baseline = DESIGN_HEIGHTS[config.ratio] * 0.3;
    ctx.fillStyle = config.palette[2];
    ctx.font = `900 ${title.fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    const lineHeight = title.fontPx * LINE_HEIGHT_RATIO;
    title.lines.forEach((line, index) => {
      const lineBaseline = baseline - (title.lines.length - 1 - index) * lineHeight;
      ctx.fillText(line, DESIGN_WIDTH / 2, lineBaseline);
    });
  }

  private drawBubble(ctx: CanvasRenderingContext2D, config: CoverConfig & { layout: NonNullable<CoverConfig['layout']> }) {
    const block = bubbleBlock(config.bubbleText, config.layout);
    const rect = bubbleRect(block, config.layout, config.ratio);
    const centerX = (config.layout.x / 100) * DESIGN_WIDTH;
    const centerY = (config.layout.y / 100) * DESIGN_HEIGHTS[config.ratio];

    ctx.fillStyle = '#ffffff';
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = config.palette[2];
    ctx.stroke();

    ctx.fillStyle = '#28133b';
    ctx.font = `700 ${block.fontPx}px sans-serif`;
    ctx.textAlign = 'center';
    const lineHeight = block.fontPx * LINE_HEIGHT_RATIO;
    const firstBaseline = centerY - ((block.lines.length - 1) * lineHeight) / 2 + block.fontPx * 0.35;
    block.lines.forEach((line, index) => ctx.fillText(line, centerX, firstBaseline + index * lineHeight));
  }
}

/** 导出前防御性校验：任何路径都不允许导出越界/重叠图 */
function validateForRender(config: CoverConfig): string | undefined {
  const report = evaluateLayout(config);
  if (report && !report.ok) return `封面布局存在冲突（${report.messages.join('、')}），已取消导出`;
  return undefined;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

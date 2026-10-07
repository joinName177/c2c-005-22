import type { CoverConfig } from '../core/models';
import { COVER_SIZE, LINE_HEIGHT, REF_WIDTH, TITLE_BASELINE_Y, WAVE, titleFontSize } from '../core/cover-geometry';
import { computeBubbleBox } from '../core/bubble-layout';
import type { CoverRendererPort } from '../ports/cover-renderer.port';

export class CanvasCoverRendererAdapter implements CoverRendererPort {
  constructor(private readonly createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}
  async render(config: CoverConfig, target?: HTMLCanvasElement): Promise<Blob> {
    const size = COVER_SIZE[config.ratio];
    const canvas = target ?? this.createCanvas(); canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法创建 Canvas');
    ctx.fillStyle = config.palette[0]; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = config.filter === 'mono' ? .45 : .72; ctx.fillStyle = config.palette[1]; ctx.fillRect(60, 60, canvas.width - 120, canvas.height - 120); ctx.globalAlpha = 1;
    ctx.strokeStyle = config.palette[2]; ctx.lineWidth = WAVE.lineWidth; ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 30) { const y = canvas.height * WAVE.centerY + Math.sin(x / 35) * WAVE.amplitude; if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = config.palette[2]; ctx.font = `900 ${titleFontSize(config.title, canvas.width)}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(config.title, canvas.width / 2, canvas.height * TITLE_BASELINE_Y);
    if (config.layout) this.drawBubble(ctx, config, canvas.width, canvas.height);
    else { ctx.fillStyle = '#ffffff'; ctx.font = '700 42px sans-serif'; ctx.fillText(config.bubbleText, canvas.width * config.bubbleX / 100, canvas.height * config.bubbleY / 100); }
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('封面导出失败')), 'image/png'));
  }
  /** 按选定布局绘制气泡：白底圆角盒 + 逐行文字，行列由核心层统一计算，与预览一致 */
  private drawBubble(ctx: CanvasRenderingContext2D, config: CoverConfig, width: number, height: number): void {
    const box = computeBubbleBox(config); const scale = width / REF_WIDTH;
    const layout = config.layout!;
    ctx.save(); ctx.translate(layout.x * width, layout.y * height); ctx.rotate(-0.05);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = .94;
    ctx.fillRect(-box.w * scale / 2, -box.h * scale / 2, box.w * scale, box.h * scale); ctx.globalAlpha = 1;
    ctx.fillStyle = '#28133b'; ctx.font = `700 ${box.fontSize * scale}px sans-serif`; ctx.textAlign = 'center';
    const lineHeight = box.fontSize * scale * LINE_HEIGHT;
    box.lines.forEach((line, i) => ctx.fillText(line, 0, (i - (box.lines.length - 1) / 2) * lineHeight + box.fontSize * scale * 0.36));
    ctx.restore();
  }
}

import { describe, expect, it } from 'vitest';
import { CanvasCoverRendererAdapter } from '../canvas-cover-renderer.adapter';
import { coverPresetFor } from '../../core/cover-presets';
import { defaultBubbleLayout } from '../../core/cover-layout';
import type { CoverConfig } from '../../core/models';

interface StubCtx {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  globalAlpha: number;
  operations: string[];
  [key: string]: unknown;
}

function makeCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext(): StubCtx {
      return {
        fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', globalAlpha: 1, operations: this.operations,
        fillRect: () => this.operations.push('fillRect'),
        fill: () => this.operations.push('fill-shape'),
        beginPath: () => this.operations.push('beginPath'),
        moveTo: () => {}, lineTo: () => {}, stroke: () => this.operations.push('stroke'), arcTo: () => {}, arc: () => {}, closePath: () => {},
        fillText: (text: string) => this.operations.push(text),
        save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      };
    },
    operations: [] as string[],
    toBlob(callback: (blob: Blob) => void) {
      callback(new Blob(['png'], { type: 'image/png' }));
    },
  };
  return canvas as unknown as HTMLCanvasElement & { operations: string[] };
}

describe('CanvasCoverRendererAdapter', () => {
  it('applies ratio, filter and bubble text and returns PNG', async () => {
    const canvas = makeCanvas();
    const config: CoverConfig = { ...coverPresetFor('阴阳怪气'), ratio: 'portrait', filter: 'mono', bubbleText: '你说得都对' };
    const blob = await new CanvasCoverRendererAdapter(() => canvas).render(config, canvas);
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(1200);
    expect(canvas.operations).toContain('你说得都对');
    expect(blob.type).toBe('image/png');
  });

  it('keeps the legacy single-line drawing path for old works without layout', async () => {
    const canvas = makeCanvas();
    const legacy = coverPresetFor('温柔姐姐');
    delete legacy.layout;
    await new CanvasCoverRendererAdapter(() => canvas).render(legacy, canvas);
    // 旧路径只有一次气泡 fillText，且不绘制气泡底板描边
    const bubbleDraws = canvas.operations.filter((op) => op === legacy.bubbleText).length;
    expect(bubbleDraws).toBe(1);
    expect(canvas.operations).not.toContain('stroke-bubble');
  });

  it('draws each wrapped line for new multi-line layouts with a bubble plate', async () => {
    const canvas = makeCanvas();
    const config: CoverConfig = { ...coverPresetFor('元气满满'), bubbleText: '哦'.repeat(18), layout: { ...defaultBubbleLayout(50, 80), strategy: 'wrap', widthPct: 80 } };
    await new CanvasCoverRendererAdapter(() => canvas).render(config, canvas);
    const lineDraws = canvas.operations.filter((op) => op.startsWith('哦')).length;
    expect(lineDraws).toBeGreaterThan(1);
  });

  it('refuses to export an out-of-bounds or overlapping layout instead of saving it', async () => {
    const canvas = makeCanvas();
    const config: CoverConfig = { ...coverPresetFor('元气满满'), layout: defaultBubbleLayout(50, 43) };
    await expect(new CanvasCoverRendererAdapter(() => canvas).render(config, canvas)).rejects.toThrow('冲突');
  });
});

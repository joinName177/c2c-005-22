import { describe, expect, it } from 'vitest';
import { CanvasCoverRendererAdapter } from '../canvas-cover-renderer.adapter';
import { coverPresetFor } from '../../core/cover-presets';
import type { CoverConfig } from '../../core/models';

function fakeCanvas(operations: string[]) {
  return {
    width: 0, height: 0,
    getContext: () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', globalAlpha: 1,
      fillRect: () => operations.push('fill'), beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, arc: () => {},
      fillText: (text: string) => operations.push(text), save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    }),
    toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
}

describe('CanvasCoverRendererAdapter', () => {
  it('applies ratio, filter and bubble text and returns PNG', async () => {
    const operations: string[] = [];
    const canvas = fakeCanvas(operations);
    const config = { ...coverPresetFor('阴阳怪气'), ratio: 'portrait' as const, filter: 'mono' as const, bubbleText: '你说得都对' };
    const blob = await new CanvasCoverRendererAdapter(() => canvas).render(config, canvas);
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(1200);
    expect(operations).toContain('你说得都对');
    expect(blob.type).toBe('image/png');
  });
  it('draws each wrapped line of the chosen layout instead of raw text', async () => {
    const operations: string[] = [];
    const canvas = fakeCanvas(operations);
    const config: CoverConfig = { ...coverPresetFor('元气满满'), bubbleText: '哈哈哈哈哈哈哈哈', layout: { x: 0.5, y: 0.72, fontScale: 1, maxWidth: 0.3 } };
    await new CanvasCoverRendererAdapter(() => canvas).render(config, canvas);
    expect(operations).toContain('哈哈哈哈哈');
    expect(operations).toContain('哈哈哈');
    expect(operations).not.toContain('哈哈哈哈哈哈哈哈');
  });
  it('falls back to legacy percentage coordinates when layout is missing', async () => {
    const operations: string[] = [];
    const canvas = fakeCanvas(operations);
    const config: CoverConfig = { ...coverPresetFor('温柔姐姐'), bubbleText: '旧版气泡' };
    delete config.layout;
    await new CanvasCoverRendererAdapter(() => canvas).render(config, canvas);
    expect(operations).toContain('旧版气泡');
  });
});

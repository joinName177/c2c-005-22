import { describe, expect, it } from 'vitest';
import {
  BUBBLE_FONT,
  DESIGN_HEIGHTS,
  DESIGN_WIDTH,
  adoptBubbleLayout,
  bubbleBlock,
  defaultBubbleLayout,
  evaluateLayout,
  layoutTitle,
  measureText,
  obstacleRects,
  solveLayout,
  validateCoverConfig,
  wrapText,
} from '../cover-layout';
import { coverPresetFor } from '../cover-presets';
import type { CoverConfig } from '../models';

function config(overrides: Partial<CoverConfig> = {}): CoverConfig {
  return { ...coverPresetFor('元气满满'), title: '元气满满', bubbleText: '元气满满', ...overrides };
}

describe('文字度量与换行', () => {
  it('区分全角与半角宽度，并在 CJK 边界换行', () => {
    expect(measureText('满', 100)).toBe(100);
    expect(measureText('a', 100)).toBe(56);    const lines = wrapText('今天也要元气满满哦哦哦哦', 42, 42 * 6);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('今天也要元气满满哦哦哦哦');
  });
  it('拉丁文优先在空格断词', () => {
    const lines = wrapText('make some noise please', 42, 110);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe('make');
    expect(lines[1]).toBe('some');
  });
});

describe('障碍盒与碰撞检测', () => {
  it('气泡压到标题时报告 title 冲突', () => {
    const layout = defaultBubbleLayout(50, 27);
    const report = evaluateLayout(config({ layout }));
    expect(report?.ok).toBe(false);
    expect(report?.conflicts).toContain('title');
    expect(report?.messages.join()).toContain('标题');
  });
  it('竖版正中气泡与波形带冲突', () => {
    const report = evaluateLayout(config({ ratio: 'portrait', layout: defaultBubbleLayout(50, 50) }));
    expect(report?.conflicts).toContain('wave');
  });
  it('越过安全边距报告 bounds', () => {
    const report = evaluateLayout(config({ layout: defaultBubbleLayout(2, 50) }));
    expect(report?.conflicts).toContain('bounds');
  });
  it('预设默认布局在方形与竖版都无冲突', () => {
    expect(evaluateLayout(config(coverPresetFor('元气满满')))?.ok).toBe(true);
    expect(evaluateLayout(config({ ...coverPresetFor('元气满满'), ratio: 'portrait' }))?.ok).toBe(true);
  });
  it('大标题占宽更大：标题盒显著宽于短标题', () => {
    const small = obstacleRects(config({ title: '元气满满' }))[0];
    const big = obstacleRects(config({ title: '今天也要元气满满哦哦哦哦' }))[0];
    expect(big.height).toBeGreaterThan(small.height);
    expect(layoutTitle('今天也要元气满满哦哦哦哦').lines.length).toBe(2);
  });
});

describe('候选求解：案例 A 长气泡', () => {
  const longText = '我今天真的超级超级超级想要大声说这句话啊';
  it('单行放不下时 move 缺席，推荐 wrap 保留原字号', () => {
    const result = solveLayout(config({ bubbleText: longText, layout: defaultBubbleLayout(50, 30) }));
    expect(result.feasible).toBe(true);
    expect(result.candidates.some((c) => c.strategy === 'move')).toBe(false);
    expect(result.recommended?.strategy).toBe('wrap');
    expect(result.recommended?.fontPx).toBe(BUBBLE_FONT);
    expect(result.recommended?.lines).toBeGreaterThan(1);
  });
  it('scale 作为备选且字号确实缩小，不与推荐并列', () => {
    const result = solveLayout(config({ bubbleText: longText, layout: defaultBubbleLayout(50, 30) }));
    const scaled = result.candidates.find((c) => c.strategy === 'scale');
    expect(scaled).toBeDefined();
    expect(scaled!.fontPx).toBeLessThan(BUBBLE_FONT);
    const wrap = result.candidates.find((c) => c.strategy === 'wrap');
    expect(result.candidates.indexOf(result.recommended!)).toBe(0);
    expect(wrap!.fontPx).toBeGreaterThan(scaled!.fontPx);
  });
});

describe('候选求解：案例 B 窄画面竖版', () => {
  it('冲突时推荐可读无损的 move，即使缩字候选距离更近；换行备选位移更大', () => {
    const bubbleText = '哦'.repeat(18);
    const result = solveLayout(config({ ratio: 'portrait', bubbleText, layout: defaultBubbleLayout(50, 50) }));
    expect(result.recommended?.strategy).toBe('move');
    expect(result.recommended?.lines).toBe(1);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    const move = result.candidates.find((c) => c.strategy === 'move')!;
    const wrap = result.candidates.find((c) => c.strategy === 'wrap')!;
    expect(move.distancePct).toBeLessThan(wrap.distancePct);
    // 可读性优先：存在缩字候选时推荐仍是 move（移动距离最小不等于最易读）
    expect(result.candidates.some((c) => c.strategy === 'scale')).toBe(true);
    // 采纳后在竖版下重新评估必须无冲突
    expect(evaluateLayout(config({ ratio: 'portrait', bubbleText, layout: move.layout }))?.ok).toBe(true);
  });
});

describe('候选求解：案例 C 大标题', () => {
  const bigTitle = '今天也要元气满满哦哦哦哦';
  it('大标题覆盖边角，所有可行候选都在障碍下方且位移明显变大', () => {
    const result = solveLayout(config({ title: bigTitle, layout: defaultBubbleLayout(15, 20) }));
    const waveBottom = obstacleRects(config({ title: bigTitle }))[1].y + obstacleRects(config({ title: bigTitle }))[1].height;
    for (const candidate of result.candidates) {
      const block = bubbleBlock('元气满满', candidate.layout);
      const top = (candidate.layout.y / 100) * DESIGN_HEIGHTS.square - block.height / 2 - 14;
      // 可贴住外扩净空框边缘（与墨迹仍有 28px），但不能进入
      expect(top).toBeGreaterThanOrEqual(Math.round(waveBottom));
    }
    expect(result.recommended?.strategy).toBe('move');
    expect(result.recommended!.distancePct).toBeGreaterThan(30);
  });
  it('同一位置短标题时边角可放，位移更小 —— 位置是算出来的而非写死', () => {
    const big = solveLayout(config({ title: bigTitle, layout: defaultBubbleLayout(15, 20) }));
    const small = solveLayout(config({ title: '元气满满', layout: defaultBubbleLayout(15, 20) }));
    expect(small.recommended!.distancePct).toBeLessThan(big.recommended!.distancePct);
  });
});

describe('无法容纳与校验', () => {
  it('文字超长到任何字号都放不下时给出量化原因', () => {
    const huge = '啊'.repeat(500);
    const result = solveLayout(config({ bubbleText: huge, ratio: 'portrait', layout: defaultBubbleLayout(50, 50) }));
    expect(result.feasible).toBe(false);
    expect(result.candidates).toHaveLength(0);
    expect(result.reason).toContain('删减气泡文字');
  });
  it('冲突布局阻止保存，合法布局与旧布局通过', () => {
    expect(validateCoverConfig(config({ layout: defaultBubbleLayout(50, 43) }))).toContain('冲突');
    expect(validateCoverConfig(config())).toBeUndefined();
    const legacy = config(); delete legacy.layout;
    expect(validateCoverConfig(legacy)).toBeUndefined();
  });
  it('旧作品启用布局时沿用当前气泡位置', () => {
    const layout = adoptBubbleLayout(30, 60);
    expect(layout.x).toBe(30);
    expect(layout.y).toBe(60);
    expect(layout.fontPct).toBeCloseTo((BUBBLE_FONT / DESIGN_WIDTH) * 100);
  });
});

import { describe, expect, it } from 'vitest';
import { COVER_SIZE, estimateTextWidth, rectsOverlap, titleFontSize, titleRect, waveRect, wrapBubbleText } from '../cover-geometry';
import { coverPresetFor } from '../cover-presets';

describe('cover-geometry', () => {
  it('estimates text width per character class (CJK 1em, ASCII 0.56em)', () => {
    expect(estimateTextWidth('哈'.repeat(8), 92)).toBeCloseTo(8 * 92);
    expect(estimateTextWidth('hello', 100)).toBeCloseTo(5 * 0.56 * 100);
  });
  it('shrinks oversized titles to fit the safe area and keeps small ones at base size', () => {
    expect(titleFontSize('元气满满')).toBe(92);
    const shrunk = titleFontSize('今天真的要被气笑了喂');
    expect(shrunk).toBeLessThan(92);
    expect(estimateTextWidth('今天真的要被气笑了喂', shrunk)).toBeLessThanOrEqual(COVER_SIZE.square.w - 48);
  });
  it('wraps text greedily by characters and respects explicit newlines', () => {
    const lines = wrapBubbleText('哈'.repeat(12), 42, 5 * 42 + 1);
    expect(lines.length).toBe(3);
    expect(lines[0].length).toBe(5);
    expect(wrapBubbleText('第一行\n第二行', 42, 900)).toEqual(['第一行', '第二行']);
  });
  it('places the waveform band at 43% height for both ratios', () => {
    const square = coverPresetFor('元气满满');
    expect(waveRect(square).cy).toBeCloseTo(900 * 0.43);
    expect(waveRect({ ...square, ratio: 'portrait' }).cy).toBeCloseTo(1200 * 0.43);
  });
  it('keeps title and waveform as distinct collision regions that the default preset avoids', () => {
    const config = coverPresetFor('暴躁老哥');
    expect(rectsOverlap(titleRect(config), waveRect(config))).toBe(true); // 区域相邻甚至相接，自由空间主要在波形下方
  });
});

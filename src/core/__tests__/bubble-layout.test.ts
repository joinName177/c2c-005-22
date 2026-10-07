import { describe, expect, it } from 'vitest';
import type { CoverConfig } from '../models';
import { coverPresetFor } from '../cover-presets';
import { coverObstacles, rectsOverlap, type Rect } from '../cover-geometry';
import {
  computeBubbleBox, detectBubbleConflicts, ensureBubbleLayout, scoreCandidate,
  suggestBubbleLayouts, validateCoverLayout,
} from '../bubble-layout';

function configWith(patch: Partial<CoverConfig>): CoverConfig {
  return { ...coverPresetFor('元气满满'), ...patch };
}
function boxOf(config: CoverConfig): Rect {
  return computeBubbleBox(config).rect;
}
function expectAllValid(config: CoverConfig) {
  const { candidates } = suggestBubbleLayouts(config);
  expect(candidates.length).toBeGreaterThan(0);
  for (const c of candidates) {
    const report = detectBubbleConflicts({ ...config, layout: c.layout });
    expect(report.messages).toEqual([]);
    expect(validateCoverLayout({ ...config, layout: c.layout })).toBeUndefined();
  }
  return candidates;
}

describe('bubble-layout 冲突检测', () => {
  it('默认预设在四种情绪下都没有冲突', () => {
    for (const label of ['暴躁老哥', '温柔姐姐', '阴阳怪气', '元气满满'] as const) {
      expect(detectBubbleConflicts(coverPresetFor(label)).messages).toEqual([]);
    }
  });
  it('气泡靠近波形与标题时分别给出对应提示', () => {
    const onWave = configWith({ layout: { x: 0.5, y: 0.45, fontScale: 1, maxWidth: 0.8 } });
    expect(detectBubbleConflicts(onWave).hits).toContain('waveform');
    expect(detectBubbleConflicts(onWave).messages.join()).toContain('波形');
    const onTitle = configWith({ layout: { x: 0.5, y: 0.28, fontScale: 1, maxWidth: 0.8 } });
    expect(detectBubbleConflicts(onTitle).hits).toContain('title');
    expect(detectBubbleConflicts(onTitle).messages.join()).toContain('标题');
  });
  it('越界是硬错误：校验返回原因，重叠只提示不拦截', () => {
    const out = configWith({ layout: { x: 0.01, y: 0.7, fontScale: 1, maxWidth: 0.8 } });
    expect(validateCoverLayout(out)).toContain('边界');
    const overlapOnly = configWith({ layout: { x: 0.5, y: 0.45, fontScale: 1, maxWidth: 0.8 } });
    expect(validateCoverLayout(overlapOnly)).toBeUndefined();
  });
});

describe('bubble-layout 候选比较：长气泡', () => {
  it('窄行宽长气泡压住波形时，首选放宽行宽减少行数且保持字号，缩放排在其后', () => {
    const longText = configWith({
      bubbleText: '哈'.repeat(16),
      layout: { x: 0.5, y: 0.45, fontScale: 1, maxWidth: 0.34 },
    });
    // 0.34 行宽下 16 字排成 3 行，气泡盒同时逼近标题与波形
    expect(computeBubbleBox(longText).lines.length).toBe(3);
    expect(detectBubbleConflicts(longText).hits).toContain('waveform');
    const candidates = expectAllValid(longText);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const [first] = candidates;
    expect(first.strategy).toBe('wrap');
    expect(first.layout.fontScale).toBe(1);
    expect(first.layout.maxWidth).toBeGreaterThan(0.34);
    expect(computeBubbleBox({ ...longText, layout: first.layout }).lines.length).toBeLessThan(3);
    // 缩放候选同样可行，但可读性代价更高，必须排在换行之后
    const scaled = candidates.find((c) => c.strategy === 'scale');
    expect(scaled).toBeDefined();
    expect(scaled!.layout.fontScale).toBeLessThan(1);
    expect(first.score).toBeLessThan(scaled!.score);
    expect(first.reason).toContain('行');
  });
  it('自由空间真的不够时缩放才会胜出，候选说明取舍', () => {
    // 100 字在方形画面排 7 行，超过波形下方 406px 自由区，移动与换行都无解
    const crowded = configWith({ bubbleText: '哈'.repeat(100), layout: { x: 0.5, y: 0.45, fontScale: 1, maxWidth: 0.8 } });
    const candidates = expectAllValid(crowded);
    expect(candidates[0].strategy).toBe('scale');
    expect(candidates[0].reason).toContain('字号');
  });
});

describe('bubble-layout 候选比较：窄画面竖版', () => {
  const narrow: CoverConfig = configWith({
    ratio: 'portrait',
    bubbleText: '你说得都对吧大概',
    layout: { x: 0.5, y: 0.45, fontScale: 1, maxWidth: 0.8 },
  });
  it('竖版中短气泡压住波形时，首选不缩字不换行的纯移动', () => {
    expect(detectBubbleConflicts(narrow).hits).toContain('waveform');
    const candidates = expectAllValid(narrow);
    expect(candidates[0].strategy).toBe('move');
    expect(candidates[0].layout.fontScale).toBe(1);
    expect(candidates[0].reason).toMatch(/波形下方|标题上方/);
  });
  it('竖版与方形之间切换后仍能继续给出合法候选', () => {
    const portraitCandidates = expectAllValid(narrow);
    const asSquare = { ...narrow, ratio: 'square' as const };
    const squareCandidates = expectAllValid(asSquare);
    // 同一批归一化坐标在两种比例下都落在各自画面内
    for (const c of [...portraitCandidates, ...squareCandidates]) {
      expect(c.layout.x).toBeGreaterThan(0);
      expect(c.layout.x).toBeLessThan(1);
      expect(c.layout.y).toBeGreaterThan(0);
      expect(c.layout.y).toBeLessThan(1);
    }
  });
});

describe('bubble-layout 候选比较：大标题', () => {
  it('标题占满宽度时，候选全部避开标题盒并说明位置', () => {
    const bigTitle = configWith({
      title: '今天真的要被气笑了喂',
      layout: { x: 0.5, y: 0.3, fontScale: 1, maxWidth: 0.8 },
    });
    const report = detectBubbleConflicts(bigTitle);
    expect(report.hits).toContain('title');
    const obstacles = coverObstacles(bigTitle);
    expect(obstacles.title.w).toBeGreaterThan(800); // 标题盒几乎占满安全宽度
    const candidates = expectAllValid(bigTitle);
    for (const c of candidates) {
      const rect = boxOf({ ...bigTitle, layout: c.layout });
      expect(rectsOverlap(rect, obstacles.title)).toBe(false);
      expect(rectsOverlap(rect, obstacles.waveform)).toBe(false);
    }
  });
});

describe('bubble-layout 评分规则', () => {
  it('移动距离最小不一定最易读：净距更大的稍远位置得分更优', () => {
    const config = configWith({});
    const obstacles = coverObstacles(config);
    const size = { w: 900, h: 900 };
    const current = { x: 0.5, y: 0.55, fontScale: 1, maxWidth: 0.8 };
    // 紧贴波形带下沿（净距 0）的近位置
    const near = { ...current, y: 510 / 900 };
    const nearRect: Rect = { cx: 450, cy: 510, w: 300, h: 80 };
    // 更远但净距充足的宽松位置
    const roomy = { ...current, y: 598 / 900 };
    const roomyRect: Rect = { cx: 450, cy: 598, w: 300, h: 80 };
    const nearScore = scoreCandidate(near, current, 1, nearRect, obstacles, size);
    const roomyScore = scoreCandidate(roomy, current, 1, roomyRect, obstacles, size);
    expect(roomyScore).toBeLessThan(nearScore);
  });
  it('采用顺序固定为移动 → 换行 → 缩放', () => {
    const config = configWith({});
    const obstacles = coverObstacles(config);
    const size = { w: 900, h: 900 };
    const current = { x: 0.5, y: 0.72, fontScale: 1, maxWidth: 0.8 };
    const rect: Rect = { cx: 450, cy: 648, w: 300, h: 86 };
    const move = scoreCandidate({ ...current }, current, 1, rect, obstacles, size);
    const wrap = scoreCandidate({ ...current, maxWidth: 0.45 }, current, 2, rect, obstacles, size);
    const scale = scoreCandidate({ ...current, fontScale: 0.85 }, current, 1, rect, obstacles, size);
    expect(move).toBeLessThan(wrap);
    expect(wrap).toBeLessThan(scale);
  });
});

describe('bubble-layout 无法容纳与旧作品迁移', () => {
  it('超长气泡在竖版也放不下时说明原因且不给出候选', () => {
    const huge = configWith({
      ratio: 'portrait',
      title: '今天真的要被气笑了喂',
      bubbleText: '哈'.repeat(320),
    });
    const result = suggestBubbleLayouts(huge);
    expect(result.candidates).toEqual([]);
    expect(result.reason).toContain('容纳不下');
    expect(result.reason).toContain('删减');
  });
  it('旧作品没有 layout 时按 legacy 百分比迁移，已有 layout 原样保留', () => {
    const legacy = configWith({ bubbleX: 50, bubbleY: 72 });
    delete legacy.layout;
    const migrated = ensureBubbleLayout(legacy);
    expect(migrated.layout).toBeDefined();
    expect(migrated.layout!.x).toBeCloseTo(0.5);
    expect(migrated.layout!.y).toBeCloseTo(0.7);
    expect(migrated.layout!.fontScale).toBe(1);
    const modern = configWith({});
    expect(ensureBubbleLayout(modern).layout).toEqual(modern.layout);
  });
});

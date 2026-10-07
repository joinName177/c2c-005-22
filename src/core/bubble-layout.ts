import type { BubbleLayout, CoverConfig } from './models';
import {
  BUBBLE_BASE_FONT, BUBBLE_MIN_SCALE, BUBBLE_PAD_X, BUBBLE_PAD_Y,
  COVER_SIZE, LINE_HEIGHT, SAFE_MARGIN,
  coverObstacles, estimateTextWidth, rectGap, rectInsideCanvas, rectsOverlap, wrapBubbleText,
  type CoverObstacles, type Rect,
} from './cover-geometry';

export const DEFAULT_BUBBLE_LAYOUT: BubbleLayout = { x: 0.5, y: 0.72, fontScale: 1, maxWidth: 0.8 };

/** 旧作品没有 layout 时按 legacy 百分比坐标迁移；已有 layout 原样保留 */
export function ensureBubbleLayout(config: CoverConfig): CoverConfig {
  if (config.layout) return config;
  const legacy: BubbleLayout = {
    x: clamp01(config.bubbleX / 100),
    // legacy 的 y 是文字基线，换算成盒子中心略向上
    y: clamp01(config.bubbleY / 100 - 0.02),
    fontScale: 1,
    maxWidth: 0.8,
  };
  return { ...config, layout: legacy };
}

export interface BubbleBox {
  lines: string[];
  fontSize: number;
  w: number;
  h: number;
  /** 气泡碰撞盒（含内边距），基准像素 */
  rect: Rect;
}

/** 由配置计算气泡盒：行内容、字号与碰撞盒。预览、导出、避让三处共用，保证不漂移 */
export function computeBubbleBox(config: CoverConfig): BubbleBox {
  const withLayout = ensureBubbleLayout(config);
  const layout = withLayout.layout!;
  const size = COVER_SIZE[config.ratio];
  const fontSize = BUBBLE_BASE_FONT * layout.fontScale;
  const maxTextWidth = size.w * layout.maxWidth - BUBBLE_PAD_X * 2;
  const lines = wrapBubbleText(config.bubbleText, fontSize, maxTextWidth);
  const textWidth = Math.max(...lines.map((line) => estimateTextWidth(line, fontSize)), fontSize * 0.5);
  const w = textWidth + BUBBLE_PAD_X * 2;
  const h = lines.length * fontSize * LINE_HEIGHT + BUBBLE_PAD_Y * 2;
  return { lines, fontSize, w, h, rect: { cx: layout.x * size.w, cy: layout.y * size.h, w, h } };
}

export type ObstacleName = keyof CoverObstacles;
export interface ConflictReport {
  outOfBounds: boolean;
  hits: ObstacleName[];
  messages: string[];
}

const OBSTACLE_LABEL: Record<ObstacleName, string> = { title: '标题', waveform: '波形装饰' };

/** 冲突检测：气泡盒与（外扩净距后的）标题/波形求交，并检查安全边距 */
export function detectBubbleConflicts(config: CoverConfig): ConflictReport {
  const box = computeBubbleBox(config);
  const size = COVER_SIZE[config.ratio];
  const obstacles = coverObstacles(config);
  const hits = (Object.keys(obstacles) as ObstacleName[]).filter((name) => rectsOverlap(box.rect, obstacles[name]));
  const outOfBounds = !rectInsideCanvas(box.rect, size);
  const messages = [
    ...hits.map((name) => `气泡压住了${OBSTACLE_LABEL[name]}`),
    ...(outOfBounds ? ['气泡超出了画面安全边界'] : []),
  ];
  return { outOfBounds, hits, messages };
}

/** 保存前的硬校验：越界不导出。与标题/波形重叠只提示不拦截（用户可拒绝建议） */
export function validateCoverLayout(config: CoverConfig): string | undefined {
  const report = detectBubbleConflicts(config);
  if (report.outOfBounds) return '气泡超出画面边界，越界的封面不会保存。请拖回画面内、采用建议布局，或缩短气泡文字。';
  return undefined;
}

export type LayoutStrategy = 'move' | 'wrap' | 'scale';
export interface LayoutSuggestion {
  layout: BubbleLayout;
  strategy: LayoutStrategy;
  /** 面向用户的采用理由，如“保持字号，移到波形下方·居中” */
  reason: string;
  score: number;
}
export interface SuggestionResult {
  candidates: LayoutSuggestion[];
  /** 一个候选都没有时的原因说明 */
  reason?: string;
}

/**
 * 评分：策略惩罚实现“先移动、再换行、最后缩放”的采用顺序——
 * 移动不损失可读性；换行保持字号但增加行数；缩放直接损害可读性，惩罚最重且字号有下限。
 * 同策略内部再比较距离与净距：净距奖励可以盖过距离权重，所以“移动最少”不一定胜出。
 */
export function scoreCandidate(
  layout: BubbleLayout,
  current: BubbleLayout,
  lines: number,
  rect: Rect,
  obstacles: CoverObstacles,
  size: { w: number; h: number },
): number {
  const strategyPenalty = 25 * (lines - 1) + 400 * (1 - layout.fontScale);
  const distance = Math.hypot(layout.x - current.x, layout.y - current.y);
  const clearance = Math.min(rectGap(rect, obstacles.title), rectGap(rect, obstacles.waveform));
  const edgeClear = Math.min(
    rect.cx - rect.w / 2 - SAFE_MARGIN, size.w - SAFE_MARGIN - (rect.cx + rect.w / 2),
    rect.cy - rect.h / 2 - SAFE_MARGIN, size.h - SAFE_MARGIN - (rect.cy + rect.h / 2),
  );
  return strategyPenalty + 12 * distance + 6 * (1 - Math.min(Math.max(edgeClear, 0), 48) / 48) - 8 * Math.min(clearance, 48) / 48;
}

const GRID_X = [0.22, 0.35, 0.5, 0.65, 0.78];
const GRID_Y = [0.16, 0.24, 0.56, 0.64, 0.72, 0.8, 0.88];
/** 换行策略的行宽档位：比当前窄可塞进窄空档，比当前宽可减少行数 */
const LINE_WIDTHS = [0.8, 0.6, 0.45, 0.34];
const SCALE_STEPS = [0.85, BUBBLE_MIN_SCALE];

interface Ranked { suggestion: LayoutSuggestion; rect: Rect; lines: number }

/** 生成避让候选：移动 → 换行 → 缩放三档策略各自找位，按评分排序，保证至少比较两种布局 */
export function suggestBubbleLayouts(config: CoverConfig): SuggestionResult {
  const withLayout = ensureBubbleLayout(config);
  const current = withLayout.layout!;
  const size = COVER_SIZE[config.ratio];
  const obstacles = coverObstacles(config);

  const variants: Array<{ layout: Omit<BubbleLayout, 'x' | 'y'>; strategy: LayoutStrategy }> = [
    { layout: { fontScale: current.fontScale, maxWidth: current.maxWidth }, strategy: 'move' },
    ...LINE_WIDTHS.filter((w) => Math.abs(w - current.maxWidth) > 0.01)
      .map((maxWidth) => ({ layout: { fontScale: current.fontScale, maxWidth }, strategy: 'wrap' as const })),
    ...SCALE_STEPS.filter((s) => s < current.fontScale - 0.01).flatMap((fontScale) => [
      { layout: { fontScale, maxWidth: current.maxWidth }, strategy: 'scale' as const },
      { layout: { fontScale, maxWidth: Math.min(current.maxWidth, 0.45) }, strategy: 'scale' as const },
    ]),
  ];

  const ranked: Ranked[] = [];
  for (const variant of variants) {
    // 除固定网格外，再吸附到波形带下沿、标题上沿与四边安全线，避免漏掉狭窄的可行区
    const probe = computeBubbleBox({ ...config, layout: { ...variant.layout, x: 0.5, y: 0.5 } });
    const xs = new Set(GRID_X);
    xs.add((SAFE_MARGIN + probe.w / 2) / size.w);
    xs.add((size.w - SAFE_MARGIN - probe.w / 2) / size.w);
    const ys = new Set(GRID_Y);
    ys.add((obstacles.waveform.cy + obstacles.waveform.h / 2 + probe.h / 2 + 1) / size.h);
    ys.add((obstacles.title.cy - obstacles.title.h / 2 - probe.h / 2 - 1) / size.h);
    ys.add((SAFE_MARGIN + probe.h / 2) / size.h);
    ys.add((size.h - SAFE_MARGIN - probe.h / 2) / size.h);
    for (const gx of [...xs].filter((v) => v > 0 && v < 1)) {
      for (const gy of [...ys].filter((v) => v > 0 && v < 1)) {
        const layout: BubbleLayout = { ...variant.layout, x: gx, y: gy };
        const box = computeBubbleBox({ ...config, layout });
        if (!rectInsideCanvas(box.rect, size)) continue;
        if (rectsOverlap(box.rect, obstacles.title) || rectsOverlap(box.rect, obstacles.waveform)) continue;
        const score = scoreCandidate(layout, current, box.lines.length, box.rect, obstacles, size);
        ranked.push({
          suggestion: { layout, strategy: variant.strategy, reason: reasonFor(variant.strategy, box, config, obstacles), score },
          rect: box.rect,
          lines: box.lines.length,
        });
      }
    }
  }

  if (!ranked.length) {
    const compactLines = wrapBubbleText(config.bubbleText, BUBBLE_BASE_FONT * BUBBLE_MIN_SCALE, size.w * 0.34 - BUBBLE_PAD_X * 2).length;
    return {
      candidates: [],
      reason: `当前${config.ratio === 'portrait' ? '竖版' : '方形'}画面容纳不下这段气泡：即使缩到最小字号（${Math.round(BUBBLE_MIN_SCALE * 100)}%）并排成约 ${compactLines} 行，仍会压住标题或波形、或超出画面。请删减气泡文字、缩短标题，或更换画面比例。`,
    };
  }

  ranked.sort((a, b) => a.suggestion.score - b.suggestion.score);
  const bestPerStrategy = new Map<LayoutStrategy, Ranked>();
  for (const item of ranked) if (!bestPerStrategy.has(item.suggestion.strategy)) bestPerStrategy.set(item.suggestion.strategy, item);
  const picked = [...bestPerStrategy.values()].sort((a, b) => a.suggestion.score - b.suggestion.score);
  // 只有一种策略可行时，用不同区域的次优候选补足，保证用户总能比较至少两种布局
  if (picked.length < 2) {
    const chosenZones = new Set(picked.map((item) => zoneOf(item.rect, config, obstacles)));
    for (const item of ranked) {
      if (picked.length >= 2) break;
      if (picked.includes(item)) continue;
      const zone = zoneOf(item.rect, config, obstacles);
      if (chosenZones.has(zone)) continue;
      chosenZones.add(zone);
      picked.push(item);
    }
  }
  return { candidates: picked.slice(0, 3).map((item) => item.suggestion) };
}

function zoneOf(rect: Rect, config: CoverConfig, obstacles: CoverObstacles): string {
  const size = COVER_SIZE[config.ratio];
  const vertical = rect.cy < obstacles.title.cy - obstacles.title.h / 2 ? '标题上方'
    : rect.cy > obstacles.waveform.cy + obstacles.waveform.h / 2 ? '波形下方'
      : rect.cy > obstacles.title.cy + obstacles.title.h / 2 && rect.cy < obstacles.waveform.cy - obstacles.waveform.h / 2 ? '标题与波形之间'
        : '中部';
  const horizontal = rect.cx < size.w / 3 ? '左侧' : rect.cx > (size.w * 2) / 3 ? '右侧' : '居中';
  return `${vertical}·${horizontal}`;
}

function reasonFor(strategy: LayoutStrategy, box: BubbleBox, config: CoverConfig, obstacles: CoverObstacles): string {
  const zone = zoneOf(box.rect, config, obstacles);
  if (strategy === 'move') return `保持字号与行数，移到${zone}`;
  if (strategy === 'wrap') return `字号不变，改为 ${box.lines.length} 行，放在${zone}`;
  return `字号缩至 ${Math.round((box.fontSize / BUBBLE_BASE_FONT) * 100)}% 并排 ${box.lines.length} 行，放在${zone}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

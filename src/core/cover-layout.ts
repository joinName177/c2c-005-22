import type { BubbleLayout, CoverConfig } from './models';

/** 设计坐标系：两种比例宽度恒为 900，保证百分比映射唯一 */
export const DESIGN_WIDTH = 900;
export const DESIGN_HEIGHTS = { square: 900, portrait: 1200 } as const;
/** 文字与障碍之间的可读净空 */
export const CLEAR_GAP = 28;
/** 画面安全边距：气泡包围盒必须完全在内框中 */
export const SAFE_MARGIN = 36;
export const BUBBLE_PADDING_X = 22;
export const BUBBLE_PADDING_Y = 14;
export const LINE_HEIGHT_RATIO = 1.32;
export const BUBBLE_FONT = 42;
export const TITLE_FONT_MAX = 92;
export const TITLE_FONT_MIN = 74;
/** 标题最大排版宽度，超出先缩字号再换行 */
export const TITLE_MAX_WIDTH = 720;
/** 波形装饰带：正弦中心 0.43H，振幅 62，描边 14 */
export const WAVE_CENTER_RATIO = 0.43;
export const WAVE_AMPLITUDE = 62;
export const WAVE_STROKE_HALF = 7;
/** 缩放策略逐档尝试，保留到 28px 为止（约 0.67 倍），再小直接判不可行 */
export const SCALE_FONT_STEPS = [38, 34, 30, 28] as const;
/** 换行/缩放策略允许使用的最大排版宽度 */
export const MAX_BUBBLE_WIDTH = DESIGN_WIDTH - SAFE_MARGIN * 2;

export type Ratio = CoverConfig['ratio'];
export interface Rect { x: number; y: number; width: number; height: number }
export interface TextBlock { lines: string[]; fontPx: number; width: number; height: number }
export type ConflictKind = 'title' | 'wave' | 'bounds';
export interface LayoutReport {
  ok: boolean;
  conflicts: ConflictKind[];
  /** 冲突描述，按标题 / 波形 / 越界顺序去重 */
  messages: string[];
  rect: Rect;
}
export interface LayoutCandidate {
  strategy: 'move' | 'wrap' | 'scale';
  layout: BubbleLayout;
  /** 气泡中心相对原位置的位移，占画面宽度百分比 */
  distancePct: number;
  lines: number;
  fontPx: number;
  reason: string;
}
export interface SolveResult {
  /** 至少存在一个可采用候选 */
  feasible: boolean;
  candidates: LayoutCandidate[];
  /** 推荐候选：按 移动 → 换行 → 缩放 的可读性顺序，同策略取位移最小 */
  recommended?: LayoutCandidate;
  /** 不可行时给出的原因与量化数据 */
  reason?: string;
}

/* ----------------------------- 文字度量（无浏览器，按字符估算） ----------------------------- */

function isFullWidth(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    code >= 0x2e80 && code <= 0x9fff ||
    code >= 0xac00 && code <= 0xd7a3 ||
    code >= 0xf900 && code <= 0xfaff ||
    code >= 0xff00 && code <= 0xffef ||
    code >= 0x3000 && code <= 0x303f
  );
}

/** 单行文字宽度（px，em 倍数估算，略保守） */
export function measureText(text: string, fontPx: number): number {
  let units = 0;
  for (const char of text) {
    if (char === ' ') units += 0.32;
    else if (isFullWidth(char)) units += 1;
    else units += 0.56;
  }
  return Math.round(units * fontPx * 100) / 100;
}

/** 贪心换行：CJK 可在任意字符间断行；拉丁文回退到最近的空格断词，超长单词强制断行 */
export function wrapText(text: string, fontPx: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = '';
    for (let i = 0; i < paragraph.length; i += 1) {
      const char = paragraph[i];
      if (line && measureText(line + char, fontPx) > maxWidth) {
        if (isFullWidth(char) || char === ' ') {
          lines.push(line.trimEnd());
          line = char === ' ' ? '' : char;
        } else {
          const lastSpace = line.lastIndexOf(' ');
          if (lastSpace > 0) {
            lines.push(line.slice(0, lastSpace).trimEnd());
            line = line.slice(lastSpace + 1) + char;
          } else {
            lines.push(line.trimEnd());
            line = char;
          }
        }
      } else {
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.length ? lines.filter((line) => line !== '') : [''];
}

/* --------------------------------- 障碍盒 --------------------------------- */

/** 标题排版：先缩字号到下限，仍超宽则换两行（与渲染器共用，保证所见即所导） */
export function layoutTitle(title: string): TextBlock {
  let fontPx = TITLE_FONT_MAX;
  let lines = [title];
  while (measureText(title, fontPx) > TITLE_MAX_WIDTH && fontPx > TITLE_FONT_MIN) fontPx -= 2;
  if (measureText(title, fontPx) > TITLE_MAX_WIDTH) lines = wrapText(title, fontPx, TITLE_MAX_WIDTH).slice(0, 2);
  const width = Math.min(TITLE_MAX_WIDTH, Math.max(...lines.map((line) => measureText(line, fontPx))));
  const height = lines.length * fontPx * LINE_HEIGHT_RATIO;
  return { lines, fontPx, width, height };
}

/** 标题包围盒：末行基线在 0.30H，向上展开整段高度，水平居中 */
export function titleRect(title: TextBlock, canvasHeight: number): Rect {
  const baseline = canvasHeight * 0.3;
  return {
    x: (DESIGN_WIDTH - title.width) / 2,
    y: baseline - title.height,
    width: title.width,
    height: title.height * 0.92,
  };
}

/** 装饰波形带：贯穿全宽的正弦条带（振幅 + 描边半宽） */
export function waveRect(canvasHeight: number): Rect {
  const halfHeight = WAVE_AMPLITUDE + WAVE_STROKE_HALF;
  return { x: 0, y: canvasHeight * WAVE_CENTER_RATIO - halfHeight, width: DESIGN_WIDTH, height: halfHeight * 2 };
}

function inflate(rect: Rect, gap: number): Rect {
  return { x: rect.x - gap, y: rect.y - gap, width: rect.width + gap * 2, height: rect.height + gap * 2 };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 所有障碍盒（标题 + 波形），统一外扩 CLEAR_GAP 作为可读净空 */
export function obstacleRects(config: Pick<CoverConfig, 'title' | 'ratio'>): Rect[] {
  const canvasHeight = DESIGN_HEIGHTS[config.ratio];
  return [inflate(titleRect(layoutTitle(config.title), canvasHeight), CLEAR_GAP), inflate(waveRect(canvasHeight), CLEAR_GAP)];
}

/* --------------------------------- 气泡盒与检测 --------------------------------- */

/** 按布局计算气泡文字块（纯函数，编辑文字/切比例时重算，不缓存行数） */
export function bubbleBlock(text: string, layout: BubbleLayout): TextBlock {
  const fontPx = (layout.fontPct / 100) * DESIGN_WIDTH;
  const maxWidth = (layout.widthPct / 100) * DESIGN_WIDTH;
  const allowWrap = layout.strategy === 'wrap' || layout.strategy === 'scale';
  const lines = text === '' ? [''] : allowWrap ? wrapText(text, fontPx, maxWidth) : [text];
  const width = Math.max(...lines.map((line) => measureText(line, fontPx)));
  const height = lines.length * fontPx * LINE_HEIGHT_RATIO;
  return { lines, fontPx, width, height };
}

export function bubbleRect(block: TextBlock, layout: BubbleLayout, ratio: Ratio): Rect {
  const canvasHeight = DESIGN_HEIGHTS[ratio];
  const centerX = (layout.x / 100) * DESIGN_WIDTH;
  const centerY = (layout.y / 100) * canvasHeight;
  return {
    x: centerX - block.width / 2 - BUBBLE_PADDING_X,
    y: centerY - block.height / 2 - BUBBLE_PADDING_Y,
    width: block.width + BUBBLE_PADDING_X * 2,
    height: block.height + BUBBLE_PADDING_Y * 2,
  };
}

const CONFLICT_TEXT: Record<ConflictKind, string> = {
  title: '气泡与标题重叠',
  wave: '气泡与装饰波形重叠',
  bounds: '气泡超出安全边距',
};

/** 对给定布局做完整碰撞检测；旧配置（无 layout）不检测，交由 legacy 路径原样导出 */
export function evaluateLayout(config: Pick<CoverConfig, 'title' | 'ratio' | 'bubbleText' | 'layout'>): LayoutReport | undefined {
  if (!config.layout) return undefined;
  const block = bubbleBlock(config.bubbleText, config.layout);
  const rect = bubbleRect(block, config.layout, config.ratio);
  const [title, wave] = obstacleRects(config);
  const conflicts: ConflictKind[] = [];
  if (intersects(rect, title)) conflicts.push('title');
  if (intersects(rect, wave)) conflicts.push('wave');
  if (
    rect.x < SAFE_MARGIN ||
    rect.y < SAFE_MARGIN ||
    rect.x + rect.width > DESIGN_WIDTH - SAFE_MARGIN ||
    rect.y + rect.height > DESIGN_HEIGHTS[config.ratio] - SAFE_MARGIN
  ) conflicts.push('bounds');
  return { ok: conflicts.length === 0, conflicts, messages: conflicts.map((kind) => CONFLICT_TEXT[kind]), rect };
}

/* --------------------------------- 候选求解 --------------------------------- */

function buildLayout(strategy: BubbleLayout['strategy'], centerX: number, centerY: number, fontPx: number, widthPx: number, ratio: Ratio): BubbleLayout {
  return {
    version: 1,
    strategy,
    x: (centerX / DESIGN_WIDTH) * 100,
    y: (centerY / DESIGN_HEIGHTS[ratio]) * 100,
    fontPct: (fontPx / DESIGN_WIDTH) * 100,
    widthPct: (widthPx / DESIGN_WIDTH) * 100,
  };
}

function distance(cx: number, cy: number, layout: BubbleLayout, ratio: Ratio): number {
  const dx = cx - (layout.x / 100) * DESIGN_WIDTH;
  const dy = cy - (layout.y / 100) * DESIGN_HEIGHTS[ratio];
  return Math.hypot(dx, dy);
}

function isFree(rect: Rect, obstacles: Rect[], ratio: Ratio): boolean {
  if (rect.x < SAFE_MARGIN || rect.y < SAFE_MARGIN) return false;
  if (rect.x + rect.width > DESIGN_WIDTH - SAFE_MARGIN || rect.y + rect.height > DESIGN_HEIGHTS[ratio] - SAFE_MARGIN) return false;
  return obstacles.every((obstacle) => !intersects(rect, obstacle));
}

function rectAt(cx: number, cy: number, block: TextBlock): Rect {
  return { x: cx - block.width / 2 - BUBBLE_PADDING_X, y: cy - block.height / 2 - BUBBLE_PADDING_Y, width: block.width + BUBBLE_PADDING_X * 2, height: block.height + BUBBLE_PADDING_Y * 2 };
}

/**
 * 在候选网格中为某个文字块找最近可行位置。
 * 水平取 居中/四分位/两侧，纵向 28px 步进；同距时优先靠下的稳定区域。
 */
function nearestFreeSpot(block: TextBlock, fromX: number, fromY: number, obstacles: Rect[], ratio: Ratio): { x: number; y: number } | undefined {
  const canvasHeight = DESIGN_HEIGHTS[ratio];
  const halfW = block.width / 2 + BUBBLE_PADDING_X;
  const halfH = block.height / 2 + BUBBLE_PADDING_Y;
  const xCols = [DESIGN_WIDTH / 2, DESIGN_WIDTH * 0.25, DESIGN_WIDTH * 0.75, halfW + SAFE_MARGIN, DESIGN_WIDTH - halfW - SAFE_MARGIN];
  const best = { x: 0, y: 0, d: Number.POSITIVE_INFINITY };
  for (const cx of xCols) {
    for (let cy = halfH + SAFE_MARGIN; cy <= canvasHeight - halfH - SAFE_MARGIN; cy += 28) {
      if (!isFree(rectAt(cx, cy, block), obstacles, ratio)) continue;
      const d = Math.hypot(cx - fromX, cy - fromY);
      if (d < best.d) { best.d = d; best.x = cx; best.y = cy; }
    }
  }
  return Number.isFinite(best.d) ? { x: best.x, y: best.y } : undefined;
}

/**
 * 比较并生成候选布局：
 * 1. move   原字号单行，仅移动（可读性无损，优先）
 * 2. wrap   原字号换行 + 移动（不缩字，代价是更高的气泡）
 * 3. scale  逐档缩字号（单行放不下时允许该字号下换行），直接损害可读性，最后
 */
export function solveLayout(config: Pick<CoverConfig, 'title' | 'ratio' | 'bubbleText' | 'layout'>): SolveResult {
  const current = config.layout;
  if (!current) return { feasible: false, candidates: [], reason: '旧版原始排版未启用布局检测' };
  const obstacles = obstacleRects(config);
  const fromX = (current.x / 100) * DESIGN_WIDTH;
  const fromY = (current.y / 100) * DESIGN_HEIGHTS[config.ratio];
  const toCandidate = (strategy: LayoutCandidate['strategy'], block: TextBlock, widthPx: number, spot: { x: number; y: number }, reason: string): LayoutCandidate => {
    const layout = buildLayout(strategy, spot.x, spot.y, block.fontPx, widthPx, config.ratio);
    return { strategy, layout, distancePct: (distance(fromX, fromY, layout, config.ratio) / DESIGN_WIDTH) * 100, lines: block.lines.length, fontPx: block.fontPx, reason };
  };
  const candidates: LayoutCandidate[] = [];

  // 策略 1：移动（单行原字号）
  const single = bubbleBlock(config.bubbleText, { ...current, strategy: 'manual' });
  const singleSpot = nearestFreeSpot(single, fromX, fromY, obstacles, config.ratio);
  if (singleSpot) candidates.push(toCandidate('move', single, Math.max(single.width, 120), singleSpot, '保持原字号单行，只移动位置'));

  // 策略 2：换行（原字号，80% 画面宽度）；多行才算候选（单行与 move 等价）
  const wrapWidth = DESIGN_WIDTH * 0.8;
  const wrapped = bubbleBlock(config.bubbleText, { ...current, strategy: 'wrap', widthPct: 80 });
  if (wrapped.lines.length > 1) {
    const wrapSpot = nearestFreeSpot(wrapped, fromX, fromY, obstacles, config.ratio);
    if (wrapSpot) candidates.push(toCandidate('wrap', wrapped, wrapWidth, wrapSpot, `保持原字号，排成 ${wrapped.lines.length} 行`));
  }

  // 策略 3：缩字号逐档尝试
  for (const fontPx of SCALE_FONT_STEPS) {
    const tryScale = (useWrap: boolean): TextBlock =>
      bubbleBlock(config.bubbleText, { version: 1, x: current.x, y: current.y, fontPct: (fontPx / DESIGN_WIDTH) * 100, widthPct: 92, strategy: useWrap ? 'scale' : 'manual' });
    let block = tryScale(false);
    let useWrap = false;
    if (block.width > MAX_BUBBLE_WIDTH) { block = tryScale(true); useWrap = true; }
    if (block.width > MAX_BUBBLE_WIDTH) continue;
    const spot = nearestFreeSpot(block, fromX, fromY, obstacles, config.ratio);
    if (spot) {
      candidates.push(toCandidate('scale', block, Math.max(block.width, DESIGN_WIDTH * 0.92), spot, useWrap ? `字号缩至 ${fontPx}px 并换行` : `字号缩至 ${fontPx}px 保持单行`));
      break;
    }
  }

  if (candidates.length === 0) {
    const minLong = bubbleBlock(config.bubbleText, { ...current, strategy: 'wrap', widthPct: 92 });
    const availableH = DESIGN_HEIGHTS[config.ratio] - SAFE_MARGIN * 2 - obstacles.reduce((sum, r) => sum + Math.max(0, r.height), 0);
    return {
      feasible: false,
      candidates: [],
      reason: `当前比例（${config.ratio === 'portrait' ? '竖版 3:4' : '方形 1:1'}）找不到能避开标题与波形的位置：气泡至少需要高 ${Math.ceil(minLong.height + BUBBLE_PADDING_Y * 2)}px，而障碍之间只剩约 ${Math.ceil(availableH)}px 可用。请删减气泡文字、缩短标题或切换比例。`,
    };
  }

  const order: LayoutCandidate['strategy'][] = ['move', 'wrap', 'scale'];
  candidates.sort((a, b) => order.indexOf(a.strategy) - order.indexOf(b.strategy) || a.distancePct - b.distancePct);
  return { feasible: true, candidates, recommended: candidates[0] };
}

/** 保存/导出前校验；旧配置（无 layout）视为免校验，由 legacy 路径保持原图 */
export function validateCoverConfig(config: CoverConfig): string | undefined {
  if (!config.layout) return undefined;
  const report = evaluateLayout(config);
  if (report && !report.ok) return `封面存在未解决的冲突：${report.messages.join('、')}。请采用建议位置或继续手动调整后再保存。`;
  return undefined;
}

/** 新作品默认布局（预设位置在方形与竖版下均通过校验） */
export function defaultBubbleLayout(x = 50, y = 72): BubbleLayout {
  return { version: 1, x, y, fontPct: (BUBBLE_FONT / DESIGN_WIDTH) * 100, widthPct: 80, strategy: 'manual' };
}

/** 旧作品进入编辑后由用户明确启用：以当前 bubbleX/bubbleY 生成布局 */
export function adoptBubbleLayout(x: number, y: number): BubbleLayout {
  return defaultBubbleLayout(x, y);
}

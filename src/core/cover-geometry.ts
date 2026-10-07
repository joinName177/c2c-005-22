import type { CoverConfig } from './models';

/**
 * 封面几何：所有布局计算都在“导出基准像素空间”进行（宽 900）。
 * 预览用百分比 / cqw 换算，导出用同一套常量绘制，因此改预览大小或重新打开都不会漂移。
 */
export const REF_WIDTH = 900;
export const COVER_SIZE: Record<CoverConfig['ratio'], { w: number; h: number }> = {
  square: { w: 900, h: 900 },
  portrait: { w: 900, h: 1200 },
};

export const TITLE_BASE_FONT = 92;
export const TITLE_BASELINE_Y = 0.3;
export const WAVE = { centerY: 0.43, amplitude: 62, lineWidth: 14 };
export const BUBBLE_BASE_FONT = 42;
export const BUBBLE_MIN_SCALE = 0.7;
export const BUBBLE_PAD_X = 26;
export const BUBBLE_PAD_Y = 16;
export const LINE_HEIGHT = 1.28;
/** 画面安全边距：气泡盒不得越过 */
export const SAFE_MARGIN = 24;
/** 障碍物外扩净距：让气泡“靠近”标题/波形时就提示，而不是等到视觉重叠 */
export const CLEARANCE_MARGIN = 14;

/** 中心点坐标系的轴对齐矩形，单位：基准像素 */
export interface Rect { cx: number; cy: number; w: number; h: number }

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h;
}

/** 两个矩形之间的净距（重叠时为 0），用于“呼吸感”评分 */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.abs(a.cx - b.cx) - (a.w + b.w) / 2);
  const dy = Math.max(0, Math.abs(a.cy - b.cy) - (a.h + b.h) / 2);
  return Math.hypot(dx, dy);
}

export function rectInsideCanvas(rect: Rect, size: { w: number; h: number }, margin = SAFE_MARGIN): boolean {
  return rect.cx - rect.w / 2 >= margin && rect.cx + rect.w / 2 <= size.w - margin
    && rect.cy - rect.h / 2 >= margin && rect.cy + rect.h / 2 <= size.h - margin;
}

/** 逐字估算文本宽：CJK 按 1em，ASCII 按 0.56em，空白 0.32em。偏保守（略宽于真实渲染），给碰撞盒留余量 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let ems = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) ems += 0.32;
    else if (/[⺀-鿿豈-﫿　-〿＀-￯]/.test(ch)) ems += 1;
    else ems += 0.56;
  }
  return ems * fontSize;
}

/** 标题字号：超长标题按比例收缩到安全边距内，收缩因子同时用于预览与导出 */
export function titleFontSize(title: string, canvasW = REF_WIDTH): number {
  const full = estimateTextWidth(title, TITLE_BASE_FONT);
  const avail = canvasW - SAFE_MARGIN * 2;
  return full <= avail ? TITLE_BASE_FONT : (TITLE_BASE_FONT * avail) / full;
}

/** 标题碰撞盒：水平居中，基线在 0.3h，上取 0.85em 下取 0.35em，外扩净距 */
export function titleRect(config: CoverConfig): Rect {
  const size = COVER_SIZE[config.ratio];
  const font = titleFontSize(config.title, size.w);
  const baseline = size.h * TITLE_BASELINE_Y;
  const w = Math.min(estimateTextWidth(config.title, font), size.w - SAFE_MARGIN * 2);
  return { cx: size.w / 2, cy: baseline - font * 0.25, w: w + CLEARANCE_MARGIN * 2, h: font * 1.2 + CLEARANCE_MARGIN * 2 };
}

/** 波形碰撞带：整条水平带，中心 0.43h ±（振幅 + 半线宽），外扩净距 */
export function waveRect(config: CoverConfig): Rect {
  const size = COVER_SIZE[config.ratio];
  const half = WAVE.amplitude + WAVE.lineWidth / 2 + CLEARANCE_MARGIN;
  return { cx: size.w / 2, cy: size.h * WAVE.centerY, w: size.w, h: half * 2 };
}

export interface CoverObstacles { title: Rect; waveform: Rect }
export function coverObstacles(config: CoverConfig): CoverObstacles {
  return { title: titleRect(config), waveform: waveRect(config) };
}

/** 贪心换行：先按显式 \n 分段，再逐字累积，超过 maxWidthPx 即折行（CJK 友好，无需空格） */
export function wrapBubbleText(text: string, fontSize: number, maxWidthPx: number): string[] {
  const lines: string[] = [];
  for (const segment of text.split('\n')) {
    let current = '';
    for (const ch of segment) {
      if (current && estimateTextWidth(current + ch, fontSize) > maxWidthPx) { lines.push(current); current = ch; }
      else current += ch;
    }
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

/** 预览用 SVG 波形路径，与导出 Canvas 共用同一组常量 */
export function wavePathD(ratio: CoverConfig['ratio']): string {
  const size = COVER_SIZE[ratio];
  const parts: string[] = [];
  for (let x = 0; x <= size.w; x += 30) {
    const y = size.h * WAVE.centerY + Math.sin(x / 35) * WAVE.amplitude;
    parts.push(`${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`);
  }
  return parts.join(' ');
}

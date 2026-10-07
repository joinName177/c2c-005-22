export type EmotionLabel = '暴躁老哥' | '温柔姐姐' | '阴阳怪气' | '元气满满';
export type StudioStage = 'record' | 'crop' | 'emotion' | 'cover' | 'collection';
export interface CropRange { start: number; end: number }
export interface AudioFeatures { loudness: number; dynamics: number; pitch: number; zeroCrossing: number; pauseRatio: number; tempoVariation: number }
export interface EmotionResult { label: EmotionLabel; confidence: number; explanation: string; scores: Record<EmotionLabel, number> }
export type LayoutStrategy = 'manual' | 'move' | 'wrap' | 'scale';
export interface BubbleLayout {
  version: 1;
  /** 气泡中心 x，占画面宽度百分比 0..100 */
  x: number;
  /** 气泡中心 y，占画面高度百分比 0..100 */
  y: number;
  /** 字号占画面宽度百分比（42px / 900 = 4.667），预览缩放时不漂移 */
  fontPct: number;
  /** 换行排版宽度占画面宽度百分比；仅 strategy 为 wrap/scale 时生效 */
  widthPct: number;
  strategy: LayoutStrategy;
}
export interface CoverConfig {
  label: EmotionLabel;
  title: string;
  bubbleText: string;
  bubbleX: number;
  bubbleY: number;
  palette: [string, string, string];
  filter: 'none' | 'mono' | 'saturate' | 'warm' | 'cool';
  ratio: 'square' | 'portrait';
  /** 缺失表示旧作品：保持原始排版，不做碰撞检测，直到用户在编辑中明确启用 */
  layout?: BubbleLayout;
}
export interface VoiceMeme {
  id: string;
  title: string;
  emotion: EmotionLabel;
  confidence: number;
  features: AudioFeatures;
  audio: Blob;
  duration: number;
  cover: Blob;
  coverConfig: CoverConfig;
  createdAt: string;
}

export function validateCropRange(range: CropRange, duration: number): string | undefined {
  if (range.start < 0) return '裁剪起点不能小于 0';
  if (range.end <= range.start) return '裁剪终点必须晚于起点';
  if (range.end > duration) return '裁剪终点超出音频时长';
  if (range.end - range.start > 10) return '裁剪片段不能超过 10 秒';
  return undefined;
}

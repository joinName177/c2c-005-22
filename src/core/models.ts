export type EmotionLabel = '暴躁老哥' | '温柔姐姐' | '阴阳怪气' | '元气满满';
export type StudioStage = 'record' | 'crop' | 'emotion' | 'cover' | 'collection';
export interface CropRange { start: number; end: number }
export interface AudioFeatures { loudness: number; dynamics: number; pitch: number; zeroCrossing: number; pauseRatio: number; tempoVariation: number }
export interface EmotionResult { label: EmotionLabel; confidence: number; explanation: string; scores: Record<EmotionLabel, number> }
export interface BubbleLayout {
  /** 气泡中心相对画面宽的位置，0..1 */
  x: number;
  /** 气泡中心相对画面高的位置，0..1 */
  y: number;
  /** 相对基准字号（900px 宽画面下 42px）的缩放，最小 0.7 */
  fontScale: number;
  /** 气泡盒最大宽度，相对画面宽 0..1，决定换行 */
  maxWidth: number;
}
export interface CoverConfig {
  label: EmotionLabel;
  title: string;
  bubbleText: string;
  /** 旧版百分比坐标，仅在没有 layout 的旧作品/旧分享链接中使用 */
  bubbleX: number;
  bubbleY: number;
  /** 归一化气泡布局；旧作品可能缺失，进入编辑时再迁移 */
  layout?: BubbleLayout;
  palette: [string, string, string];
  filter: 'none' | 'mono' | 'saturate' | 'warm' | 'cool';
  ratio: 'square' | 'portrait';
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

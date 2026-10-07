<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BubbleLayout, CoverConfig } from '../../core/models';
import {
  DESIGN_HEIGHTS,
  DESIGN_WIDTH,
  adoptBubbleLayout,
  bubbleBlock,
  bubbleRect,
  evaluateLayout,
  layoutTitle,
  obstacleRects,
  solveLayout,
  type LayoutCandidate,
} from '../../core/cover-layout';

const props = defineProps<{ config: CoverConfig; title: string }>();
const emit = defineEmits<{
  patch: [p: Partial<CoverConfig>];
  title: [t: string];
  save: [];
}>();

const isLegacy = computed(() => !props.config.layout);
const ratioH = computed(() => DESIGN_HEIGHTS[props.config.ratio]);

/** 标题同样由核心引擎排版，保证预览、碰撞框、导出三者一致 */
const titleBlock = computed(() => layoutTitle(props.config.title));
const titleBoxStyle = computed<Record<string, string>>(() => ({
  top: `${((ratioH.value * 0.3 - titleBlock.value.height) / ratioH.value) * 100}%`,
  height: `${(titleBlock.value.height / ratioH.value) * 100}%`,
  width: `${(titleBlock.value.width / DESIGN_WIDTH) * 100}%`,
}));
const titleFontCss = computed(() => `${titleBlock.value.fontPx / 9}cqw`);

/* ------------------------------- 冲突与候选（纯函数派生） ------------------------------- */

const report = computed(() => evaluateLayout(props.config));
const hasConflict = computed(() => report.value ? !report.value.ok : false);
const solution = computed(() => (props.config.layout && hasConflict.value ? solveLayout(props.config) : undefined));
const obstacles = computed(() => obstacleRects(props.config).map((rect) => ({
  left: `${(rect.x / DESIGN_WIDTH) * 100}%`,
  top: `${(rect.y / ratioH.value) * 100}%`,
  width: `${(rect.width / DESIGN_WIDTH) * 100}%`,
  height: `${(rect.height / ratioH.value) * 100}%`,
})));

const bubbleBox = computed(() => {
  if (!props.config.layout) return null;
  const block = bubbleBlock(props.config.bubbleText, props.config.layout);
  const rect = bubbleRect(block, props.config.layout, props.config.ratio);
  return {
    left: `${(rect.x / DESIGN_WIDTH) * 100}%`,
    top: `${(rect.y / ratioH.value) * 100}%`,
    width: `${(rect.width / DESIGN_WIDTH) * 100}%`,
    height: `${(rect.height / ratioH.value) * 100}%`,
  };
});

const bubbleFontSize = computed(() => (props.config.layout ? `${props.config.layout.fontPct}cqw` : ''));

/* ------------------------------- 建议面板显隐 ------------------------------- */

const showSuggestions = ref(false);
const dismissedAt = ref('');
const conflictKey = computed(() => `${props.config.ratio}|${props.config.bubbleText}|${props.config.title}|${report.value?.conflicts.join(',')}`);
const suggestVisible = computed(() => {
  if (!hasConflict.value || !solution.value?.feasible) return false;
  // 切比例 / 改文字产生新冲突时重新弹出；用户手动拒绝后同一冲突不再打扰
  return showSuggestions.value || dismissedAt.value !== conflictKey.value;
});
function rejectSuggestions() {
  dismissedAt.value = conflictKey.value;
  showSuggestions.value = false;
}

/* ------------------------------- 撤销栈 ------------------------------- */

const undoStack = ref<BubbleLayout[]>([]);
/** 本次编辑是否从旧版原图启用：始终保留“恢复旧版原图”出口，与撤销栈深度无关 */
const cameFromLegacy = ref(false);
function pushHistory(layout: BubbleLayout) {
  undoStack.value = [...undoStack.value, structuredCloneSafe(layout)].slice(-30);
}
function undo() {
  const previous = undoStack.value.at(-1);
  if (!previous) return;
  undoStack.value = undoStack.value.slice(0, -1);
  emit('patch', { layout: structuredCloneSafe(previous), bubbleX: previous.x, bubbleY: previous.y });
  showSuggestions.value = false;
}
function structuredCloneSafe(layout: BubbleLayout): BubbleLayout {
  return { ...layout };
}

/* ------------------------------- 拖动与键盘 ------------------------------- */

const stageEl = ref<HTMLElement>();
let dragging = false;
let dragStart: BubbleLayout | undefined;
let dragHistoryPushed = false;

function pointToPercent(event: PointerEvent | Pick<MouseEvent, 'clientX' | 'clientY'>) {
  const el = stageEl.value;
  if (!el) return { x: 50, y: 50 };
  const rect = el.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98),
  };
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function onPointerDown(event: PointerEvent) {
  if (!props.config.layout) return;
  dragging = true;
  dragStart = { ...props.config.layout };
  dragHistoryPushed = false;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  moveBubble(event, true);
}
function onPointerMove(event: PointerEvent) {
  if (dragging) moveBubble(event);
}
function onPointerUp() {
  dragging = false;
  dragStart = undefined;
  if (hasConflict.value) showSuggestions.value = true;
}
function moveBubble(event: PointerEvent | Pick<MouseEvent, 'clientX' | 'clientY'>, isFirst = false) {
  if (!props.config.layout || (!dragging && !isFirst)) return;
  const point = pointToPercent(event);
  // 单纯点击（未移动）不入撤销栈；首次实际位移时记录拖动前布局
  if (dragStart && !dragHistoryPushed && (Math.abs(point.x - dragStart.x) > 0.2 || Math.abs(point.y - dragStart.y) > 0.2)) {
    pushHistory(dragStart);
    dragHistoryPushed = true;
  }
  const layout: BubbleLayout = { ...props.config.layout, x: point.x, y: point.y, strategy: 'manual' };
  emit('patch', { layout, bubbleX: point.x, bubbleY: point.y });
}
function nudge(event: KeyboardEvent) {
  if (!props.config.layout) return;
  const step = event.shiftKey ? 5 : 1.2;
  const deltas: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
  };
  const delta = deltas[event.key];
  if (!delta) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    return;
  }
  event.preventDefault();
  pushHistory(props.config.layout);
  const layout: BubbleLayout = {
    ...props.config.layout,
    x: clamp(props.config.layout.x + delta[0], 2, 98),
    y: clamp(props.config.layout.y + delta[1], 2, 98),
    strategy: 'manual',
  };
  emit('patch', { layout, bubbleX: layout.x, bubbleY: layout.y });
  showSuggestions.value = true;
}

function accept(candidate: LayoutCandidate) {
  if (!props.config.layout) return;
  pushHistory(props.config.layout);
  emit('patch', { layout: candidate.layout, bubbleX: candidate.layout.x, bubbleY: candidate.layout.y });
  showSuggestions.value = false;
  dismissedAt.value = '';
}

/* ------------------------------- 旧作品处理 ------------------------------- */

function adoptLegacy() {
  const layout = adoptBubbleLayout(props.config.bubbleX, props.config.bubbleY);
  undoStack.value = []; // 旧版原始排版作为撤销终点：未保存前可撤销回“无布局”
  cameFromLegacy.value = true;
  emit('patch', { layout, bubbleX: layout.x, bubbleY: layout.y });
}
function undoToLegacy() {
  emit('patch', { layout: undefined });
  undoStack.value = [];
  cameFromLegacy.value = false;
}
const canSave = computed(() => isLegacy.value || report.value?.ok === true);
function labelFor(candidate: LayoutCandidate) {
  const names = { move: '移动', wrap: '换行', scale: '缩放' } as const;
  return names[candidate.strategy];
}
</script>

<template>
  <section class="cover-layout">
    <div class="stage-card controls">
      <span class="kicker">04 / COVER LAB</span>
      <h2>给声音穿件有戏的外套</h2>
      <label>作品名称 / 封面标题
        <input :value="title" @input="emit('title', ($event.target as HTMLInputElement).value)">
      </label>
      <label>气泡文字
        <textarea aria-label="气泡文字" :value="config.bubbleText" @input="emit('patch', { bubbleText: ($event.target as HTMLTextAreaElement).value })"></textarea>
      </label>
      <label>滤镜
        <select :value="config.filter" @change="emit('patch', { filter: ($event.target as HTMLSelectElement).value as CoverConfig['filter'] })">
          <option value="none">原色</option><option value="mono">黑白</option><option value="saturate">高饱和</option><option value="warm">暖调</option><option value="cool">冷调</option>
        </select>
      </label>
      <label>比例
        <select :value="config.ratio" @change="emit('patch', { ratio: ($event.target as HTMLSelectElement).value as CoverConfig['ratio'] })">
          <option value="square">方形 1:1</option><option value="portrait">竖版 3:4</option>
        </select>
      </label>

      <div v-if="isLegacy" class="legacy-banner" data-testid="legacy-banner">
        <p>这是旧版作品，当前保持<strong>原始排版</strong>，未启用碰撞检测与气泡拖动。</p>
        <div class="legacy-actions">
          <button type="button" class="acid-button small" data-testid="adopt-layout" @click="adoptLegacy">开始调整</button>
          <span>导出与保存将继续使用原图</span>
        </div>
      </div>

      <div class="edit-actions">
        <button type="button" class="ghost-button" :disabled="!undoStack.length" @click="undo">↶ 撤销</button>
        <button v-if="cameFromLegacy && config.layout" type="button" class="ghost-button" data-testid="undo-legacy" @click="undoToLegacy">恢复旧版原图</button>
      </div>

      <div v-if="hasConflict" class="conflict-card" data-testid="conflict-card" role="alert">
        <strong>检测到冲突</strong>
        <ul><li v-for="message in report?.messages" :key="message">{{ message }}</li></ul>
        <div v-if="solution && suggestVisible" class="suggestions" data-testid="suggestions">
          <p class="suggest-hint">为当前文字和比例找到 {{ solution.candidates.length }} 个可采用位置：</p>
          <button
            v-for="candidate in solution.candidates"
            :key="candidate.strategy"
            type="button"
            class="candidate"
            :class="{ recommended: candidate === solution.recommended }"
            data-testid="candidate"
            @click="accept(candidate)"
          >
            <b>{{ labelFor(candidate) }}<em v-if="candidate === solution.recommended">推荐</em></b>
            <span>{{ candidate.reason }} · 位移 {{ candidate.distancePct.toFixed(1) }}%<template v-if="candidate.lines > 1"> · {{ candidate.lines }} 行</template><template v-if="candidate.fontPx !== 42"> · {{ candidate.fontPx }}px</template></span>
          </button>
          <button type="button" class="ghost-button small" data-testid="reject-suggestion" @click="rejectSuggestions">拒绝建议，我自己调</button>
        </div>
        <p v-else-if="solution && !solution.feasible" class="infeasible" data-testid="infeasible">{{ solution.reason }}</p>
      </div>

      <button data-testid="save-work" class="acid-button" type="button" :disabled="!canSave" @click="emit('save')">
        {{ canSave ? '保存作品' : '存在冲突，无法保存' }}
      </button>
      <p v-if="!canSave && solution && !solution.feasible" class="save-hint">{{ solution.reason }}</p>
    </div>

    <div
      ref="stageEl"
      class="cover-preview"
      :class="[config.ratio, config.filter, { dragging: !!config.layout, conflict: hasConflict }]"
      :style="{ '--c1': config.palette[0], '--c2': config.palette[1], '--c3': config.palette[2], 'container-type': 'inline-size' } as Record<string, string>"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span>SOUND REACTION / 005</span>
      <div class="burst"></div>
      <h3 v-if="isLegacy" class="legacy-title">{{ config.title }}</h3>
      <h3 v-else class="cover-title" :style="titleBoxStyle"><span :style="{ fontSize: titleFontCss }"><template v-for="(line, index) in titleBlock.lines" :key="index">{{ line }}<br v-if="index < titleBlock.lines.length - 1"></template></span></h3>

      <i class="play-badge">▶ PLAY IT</i>

      <template v-if="config.layout">
        <div v-if="hasConflict" class="obstacle-layer">
          <div v-for="(box, index) in obstacles" :key="index" class="obstacle-box" :style="box"></div>
        </div>
        <div
          class="bubble"
          :class="{ invalid: hasConflict }"
          :style="{ ...bubbleBox!, fontSize: bubbleFontSize }"
          tabindex="0"
          role="slider"
          aria-label="气泡位置，方向键微调（Shift 加速）"
          :aria-valuenow="Math.round(config.layout.x)"
          aria-valuemin="2"
          aria-valuemax="98"
          :aria-valuetext="`横向 ${Math.round(config.layout.x)}%，纵向 ${Math.round(config.layout.y)}%`"
          @pointerdown="onPointerDown"
          @keydown="nudge"
        >
          <span class="bubble-text" :style="{ fontSize: bubbleFontSize }">{{ config.bubbleText }}</span>
        </div>
      </template>
      <p v-else class="bubble legacy-bubble">{{ config.bubbleText }}</p>
    </div>
  </section>
</template>

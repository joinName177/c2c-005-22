<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BubbleLayout, CoverConfig } from '../../core/models';
import { COVER_SIZE, TITLE_BASE_FONT, titleFontSize, wavePathD } from '../../core/cover-geometry';
import { computeBubbleBox, detectBubbleConflicts, ensureBubbleLayout, suggestBubbleLayouts, validateCoverLayout, type LayoutSuggestion } from '../../core/bubble-layout';

const props = defineProps<{ config: CoverConfig; title: string }>();
const emit = defineEmits<{ patch: [p: Partial<CoverConfig>]; title: [t: string]; save: [] }>();

const layout = computed(() => ensureBubbleLayout(props.config).layout!);
const bubble = computed(() => computeBubbleBox(props.config));
const conflicts = computed(() => detectBubbleConflicts(props.config));
const saveProblem = computed(() => validateCoverLayout(props.config));
const waveD = computed(() => wavePathD(props.config.ratio));
const viewH = computed(() => COVER_SIZE[props.config.ratio].h);
const titleScale = computed(() => titleFontSize(props.config.title) / TITLE_BASE_FONT);
const bubbleStyle = computed(() => ({ left: `${layout.value.x * 100}%`, top: `${layout.value.y * 100}%`, '--bs': String(layout.value.fontScale) }));

const suggestions = ref<LayoutSuggestion[]>([]);
const noFitReason = ref('');
const dismissed = ref(false);
const history = ref<BubbleLayout[]>([]);
const dragging = ref(false);

function refreshSuggestions() {
  const result = suggestBubbleLayouts(props.config);
  suggestions.value = result.candidates;
  noFitReason.value = result.reason ?? '';
}
watch(() => [props.config.bubbleText, props.config.ratio, props.config.title], () => {
  dismissed.value = false;
  if (conflicts.value.messages.length) refreshSuggestions();
  else { suggestions.value = []; noFitReason.value = ''; }
}, { immediate: true });

function pushHistory() { if (history.value.length < 50) history.value.push({ ...layout.value }); }
function accept(suggestion: LayoutSuggestion) { pushHistory(); dismissed.value = false; suggestions.value = []; noFitReason.value = ''; emit('patch', { layout: { ...suggestion.layout } }); }
function dismiss() { dismissed.value = true; suggestions.value = []; }
function undo() { const prev = history.value.pop(); if (prev) emit('patch', { layout: prev }); }

const previewEl = ref<HTMLElement>();
let drag: { id: number; sx: number; sy: number; lx: number; ly: number; w: number; h: number; moved: boolean } | null = null;
function onBubbleDown(event: PointerEvent) {
  const host = previewEl.value; if (!host) return;
  const rect = host.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, lx: layout.value.x, ly: layout.value.y, w: rect.width, h: rect.height, moved: false };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp, { once: true });
}
function onDragMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = (event.clientX - drag.sx) / drag.w; const dy = (event.clientY - drag.sy) / drag.h;
  if (!drag.moved && Math.hypot(dx, dy) < 0.004) return;
  if (!drag.moved) { pushHistory(); drag.moved = true; dragging.value = true; }
  dismissed.value = false;
  emit('patch', { layout: { ...layout.value, x: Math.min(1, Math.max(0, drag.lx + dx)), y: Math.min(1, Math.max(0, drag.ly + dy)) } });
}
function onDragUp() {
  window.removeEventListener('pointermove', onDragMove);
  if (drag?.moved && conflicts.value.messages.length) refreshSuggestions();
  else if (!conflicts.value.messages.length) { suggestions.value = []; noFitReason.value = ''; }
  drag = null; dragging.value = false;
}
</script>

<template>
  <section class="cover-layout">
    <div class="stage-card controls">
      <span class="kicker">04 / COVER LAB</span>
      <h2>给声音穿件有戏的外套</h2>
      <label>作品名称<input :value="title" @input="emit('title', ($event.target as HTMLInputElement).value)"></label>
      <label>气泡文字<textarea aria-label="气泡文字" :value="config.bubbleText" @input="emit('patch', { bubbleText: ($event.target as HTMLTextAreaElement).value })"></textarea></label>
      <label>滤镜<select :value="config.filter" @change="emit('patch', { filter: ($event.target as HTMLSelectElement).value as CoverConfig['filter'] })"><option value="none">原色</option><option value="mono">黑白</option><option value="saturate">高饱和</option><option value="warm">暖调</option><option value="cool">冷调</option></select></label>
      <label>比例<select :value="config.ratio" @change="emit('patch', { ratio: ($event.target as HTMLSelectElement).value as CoverConfig['ratio'] })"><option value="square">方形 1:1</option><option value="portrait">竖版 3:4</option></select></label>
      <div class="layout-tools">
        <button type="button" data-testid="auto-layout" @click="dismissed = false; refreshSuggestions()">自动避让</button>
        <button type="button" data-testid="undo-layout" :disabled="!history.length" @click="undo">撤销布局调整</button>
      </div>
      <p v-if="conflicts.messages.length" class="layout-warn" data-testid="conflict-hint">⚠ {{ conflicts.messages.join('；') }}。可以直接拖动气泡，或：</p>
      <div v-if="suggestions.length" class="suggestions" data-testid="suggestions">
        <div v-for="(s, i) in suggestions" :key="i" class="suggestion" data-testid="suggestion">
          <span>{{ s.reason }}</span>
          <button type="button" data-testid="accept-suggestion" @click="accept(s)">采用</button>
        </div>
        <button type="button" class="dismiss" data-testid="dismiss-suggestions" @click="dismiss">忽略建议，保持现在的位置</button>
      </div>
      <p v-else-if="noFitReason" class="layout-warn" data-testid="no-fit">{{ noFitReason }}</p>
      <p v-if="saveProblem" class="layout-error" data-testid="save-blocked">{{ saveProblem }}</p>
      <button data-testid="save-work" class="acid-button" type="button" :disabled="!!saveProblem" @click="emit('save')">保存作品</button>
    </div>
    <div class="cover-preview" ref="previewEl" :class="[config.ratio, config.filter]" :style="{ '--c1': config.palette[0], '--c2': config.palette[1], '--c3': config.palette[2] }">
      <span>SOUND REACTION / 005</span>
      <div class="burst"></div>
      <svg class="wave-lines" :viewBox="`0 0 900 ${viewH}`" preserveAspectRatio="none" aria-hidden="true"><path :d="waveD" :class="{ hit: conflicts.hits.includes('waveform') }" /></svg>
      <h3 :class="{ hit: conflicts.hits.includes('title') }" :style="{ '--ts': String(titleScale) }">{{ config.title }}</h3>
      <div class="bubble" data-testid="bubble" :class="{ conflict: conflicts.messages.length > 0, dragging }" :style="bubbleStyle" @pointerdown="onBubbleDown">{{ bubble.lines.join('\n') }}</div>
      <i>▶ PLAY IT</i>
    </div>
  </section>
</template>

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CoverWorkshop from '../components/CoverWorkshop.vue';
import { coverPresetFor } from '../../core/cover-presets';
import { detectBubbleConflicts } from '../../core/bubble-layout';
import type { CoverConfig } from '../../core/models';

function mountWorkshop(config: CoverConfig) {
  return mount(CoverWorkshop, { props: { config, title: '测试作品' } });
}
const onWave: CoverConfig = { ...coverPresetFor('元气满满'), layout: { x: 0.5, y: 0.45, fontScale: 1, maxWidth: 0.8 } };

describe('CoverWorkshop 气泡布局编辑', () => {
  it('气泡压住波形时提示冲突并给出至少两个可采用的位置', async () => {
    const wrapper = mountWorkshop(onWave);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="conflict-hint"]').text()).toContain('波形');
    const suggestions = wrapper.findAll('[data-testid="suggestion"]');
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    expect(wrapper.text()).toContain('采用');
  });
  it('采用建议后发出无冲突的布局，撤销后回到原布局', async () => {
    const wrapper = mountWorkshop(onWave);
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="accept-suggestion"]').trigger('click');
    const patches = wrapper.emitted('patch')!;
    const accepted = patches[patches.length - 1][0] as { layout: CoverConfig['layout'] };
    expect(accepted.layout).toBeDefined();
    expect(detectBubbleConflicts({ ...onWave, layout: accepted.layout }).messages).toEqual([]);
    await wrapper.get('[data-testid="undo-layout"]').trigger('click');
    const undos = wrapper.emitted('patch')!;
    const restored = undos[undos.length - 1][0] as { layout: CoverConfig['layout'] };
    expect(restored.layout).toEqual(onWave.layout);
  });
  it('用户可以忽略建议，冲突提示保留但建议收起', async () => {
    const wrapper = mountWorkshop(onWave);
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="dismiss-suggestions"]').trigger('click');
    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="conflict-hint"]').text()).toContain('波形');
  });
  it('气泡越界时禁用保存并说明原因', async () => {
    const out = { ...coverPresetFor('元气满满'), layout: { x: 0.01, y: 0.7, fontScale: 1, maxWidth: 0.8 } };
    const wrapper = mountWorkshop(out);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="save-blocked"]').text()).toContain('边界');
    expect(wrapper.get('[data-testid="save-work"]').attributes('disabled')).toBeDefined();
  });
  it('合法布局不显示冲突提示，保存按钮可用', async () => {
    const wrapper = mountWorkshop(coverPresetFor('温柔姐姐'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="conflict-hint"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="save-work"]').attributes('disabled')).toBeUndefined();
  });
});

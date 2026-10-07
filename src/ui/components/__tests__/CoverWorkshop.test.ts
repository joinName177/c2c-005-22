import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CoverWorkshop from '../CoverWorkshop.vue';
import { coverPresetFor } from '../../../core/cover-presets';
import type { CoverConfig } from '../../../core/models';

function mountWith(config: CoverConfig) {
  return mount(CoverWorkshop, {
    props: { config, title: config.title },
    attachTo: document.body,
  });
}

describe('CoverWorkshop 气泡避让', () => {
  it('旧作品无布局信息时显示横幅且保持原图，不显示冲突提示', () => {
    const legacy = coverPresetFor('温柔姐姐');
    delete legacy.layout;
    const wrapper = mountWith(legacy);
    expect(wrapper.get('[data-testid="legacy-banner"]').text()).toContain('原始排版');
    expect(wrapper.find('[data-testid="conflict-card"]').exists()).toBe(false);
    expect(wrapper.find('.legacy-bubble').exists()).toBe(true);
    expect((wrapper.get('[data-testid="save-work"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('点“开始调整”后纳入碰撞检测，冲突时给出至少两种候选并可撤销回原图', async () => {
    const legacy = coverPresetFor('元气满满');
    delete legacy.layout;
    const wrapper = mountWith(legacy);
    await wrapper.get('[data-testid="adopt-layout"]').trigger('click');
    const adopted = wrapper.emitted('patch')!.at(-1)![0] as Partial<CoverConfig>;
    expect(adopted.layout).toBeDefined();

    const conflicted = { ...coverPresetFor('元气满满'), bubbleText: '哦'.repeat(18), layout: { ...adopted.layout!, x: 50, y: 50 } };
    await wrapper.setProps({ config: conflicted });
    expect(wrapper.get('[data-testid="conflict-card"]').text()).toContain('装饰波形');
    const candidates = wrapper.findAll('[data-testid="candidate"]');
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const strategies = candidates.map((c) => c.get('b').text());
    expect(strategies.some((s) => s.includes('移动'))).toBe(true);
    expect(strategies.some((s) => s.includes('换行') || s.includes('缩放'))).toBe(true);
    expect(wrapper.get('.candidate.recommended').get('b').text()).toContain('移动');

    await wrapper.get('[data-testid="candidate"]').trigger('click');
    const accepted = wrapper.emitted('patch')!.at(-1)![0] as Partial<CoverConfig>;
    expect(accepted.layout?.strategy).toBe('move');

    // 撤销：恢复采纳前的冲突布局
    const undoButtons = wrapper.findAll('button').filter((b) => b.text().includes('撤销'));
    await undoButtons[0].trigger('click');
    const restored = wrapper.emitted('patch')!.at(-1)![0] as Partial<CoverConfig>;
    expect(restored.layout?.x).toBe(50);
    expect(restored.layout?.y).toBe(50);
    expect(restored.layout?.strategy).toBe('manual');

    await wrapper.get('[data-testid="undo-legacy"]').trigger('click');
    const undone = wrapper.emitted('patch')!.at(-1)![0] as Partial<CoverConfig>;
    expect(undone.layout).toBeUndefined();
  });

  it('拒绝建议后冲突徽标保留、保存保持禁用状态', async () => {
    const config = { ...coverPresetFor('元气满满'), layout: { ...coverPresetFor('元气满满').layout!, x: 50, y: 43 } };
    const wrapper = mountWith(config);
    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(true);
    await wrapper.get('[data-testid="reject-suggestion"]').trigger('click');
    expect(wrapper.find('[data-testid="suggestions"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="conflict-card"]').text()).toContain('装饰波形');
    expect((wrapper.get('[data-testid="save-work"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('键盘方向键微调会产生 manual 布局补丁，切竖版后仍按竖版障碍重新建议', async () => {
    const config = coverPresetFor('元气满满');
    const wrapper = mountWith(config);
    await wrapper.get('.bubble').trigger('keydown', { key: 'ArrowLeft' });
    const patch = wrapper.emitted('patch')!.at(-1)![0] as Partial<CoverConfig>;
    expect(patch.layout?.strategy).toBe('manual');
    expect(patch.layout!.x).toBeLessThan(50);

    const portraitConflict = { ...config, ratio: 'portrait' as const, layout: { ...config.layout!, x: 50, y: 50 } };
    await wrapper.setProps({ config: portraitConflict });
    expect(wrapper.get('[data-testid="conflict-card"]').text()).toContain('装饰波形');
    expect(wrapper.findAll('[data-testid="candidate"]').length).toBeGreaterThanOrEqual(1);
  });

  it('作品名修改同步发出 title 事件', async () => {
    const wrapper = mountWith(coverPresetFor('元气满满'));
    await wrapper.get('input').setValue('新的封面标题');
    expect(wrapper.emitted('title')?.at(-1)).toEqual(['新的封面标题']);
  });
});

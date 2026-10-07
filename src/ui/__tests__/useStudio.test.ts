import { describe, expect, it } from 'vitest';
import { useStudio, type StudioDependencies } from '../useStudio';
import { coverPresetFor } from '../../core/cover-presets';
import type { VoiceMeme } from '../../core/models';

function dependencies(overrides: Partial<StudioDependencies> = {}): StudioDependencies {
  const saved: VoiceMeme[] = [];
  return {
    recorder: { isRecording: false, start: async () => {}, stop: async () => new Blob(['voice'], { type: 'audio/webm' }) },
    analyzer: { analyze: async () => ({ duration: 2, features: { loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6 } }) },
    cropper: { inspect: async () => ({duration:2,needsCrop:false}), crop: async (blob, range) => ({blob,duration:range.end-range.start}) },
    renderer: { render: async () => new Blob(['cover'], { type: 'image/png' }) },
    repository: { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} },
    share: { share: async () => 'shared' },
    ...overrides,
  };
}

describe('useStudio', () => {
  it('turns microphone denial into a recoverable error', async () => {
    const studio = useStudio(dependencies({ recorder: { isRecording:false, start:async()=>{throw new DOMException('denied','NotAllowedError')}, stop:async()=>new Blob() } }));
    await studio.startRecording();
    expect(studio.error.value).toContain('麦克风权限');
    expect(studio.stage.value).toBe('record');
  });
  it('moves recording through crop and emotion with manual override', async () => {
    const studio = useStudio(dependencies()); await studio.startRecording(); await studio.stopRecording();
    expect(studio.stage.value).toBe('crop'); await studio.analyze(); expect(studio.emotion.value?.label).toBe('元气满满');
    studio.selectEmotion('温柔姐姐'); expect(studio.cover.value.label).toBe('温柔姐姐'); expect(studio.stage.value).toBe('emotion');
  });
  it('keeps the draft when saving fails and can edit an existing work', async () => {
    const studio = useStudio(dependencies({ repository: { list:async()=>[], save:async()=>{throw new DOMException('full','QuotaExceededError')}, rename:async()=>{}, delete:async()=>{} } }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 1; studio.cover.value = coverPresetFor('温柔姐姐'); studio.emotion.value = { label:'温柔姐姐',confidence:.8,explanation:'柔和',scores:{'暴躁老哥':0,'温柔姐姐':1,'阴阳怪气':0,'元气满满':0} };
    studio.features.value = { loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2 };
    await studio.save(); expect(studio.error.value).toContain('保存失败'); expect(studio.draft.audio?.size).toBe(1);
    const existing = { id:'old',title:'旧作品',emotion:'温柔姐姐' as const,confidence:.8,features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},audio:new Blob(['a']),duration:1,cover:new Blob(['c']),coverConfig:coverPresetFor('温柔姐姐'),createdAt:'2026-10-05' };
    studio.editMeme(existing); expect(studio.draft.title).toBe('旧作品'); expect(studio.stage.value).toBe('cover');
  });
  it('refuses to save an out-of-bounds bubble and keeps the work unsaved', async () => {
    const saved: VoiceMeme[] = [];
    const studio = useStudio(dependencies({ repository: { list:async()=>saved, save:async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} } }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 1;
    studio.cover.value = { ...coverPresetFor('元气满满'), layout: { x: 0.01, y: 0.7, fontScale: 1, maxWidth: 0.8 } };
    studio.emotion.value = { label:'元气满满',confidence:.9,explanation:'高能量',scores:{'暴躁老哥':0,'温柔姐姐':0,'阴阳怪气':0,'元气满满':1} };
    studio.features.value = { loudness:.8,dynamics:.6,pitch:.7,zeroCrossing:.5,pauseRatio:.1,tempoVariation:.5 };
    await studio.save();
    expect(studio.error.value).toContain('边界');
    expect(saved).toHaveLength(0);
  });
  it('migrates legacy works without layout explicitly when entering the editor', async () => {
    const studio = useStudio(dependencies());
    const legacyConfig = { ...coverPresetFor('暴躁老哥') }; delete legacyConfig.layout;
    const legacy = { id:'legacy',title:'旧封面',emotion:'暴躁老哥' as const,confidence:.7,features:{loudness:.5,dynamics:.5,pitch:.5,zeroCrossing:.5,pauseRatio:.5,tempoVariation:.5},audio:new Blob(['a']),duration:2,cover:new Blob(['c']),coverConfig:legacyConfig,createdAt:'2026-09-01' };
    studio.editMeme(legacy);
    expect(studio.cover.value.layout).toBeDefined();
    expect(studio.notice.value).toContain('旧版封面');
    const modern = { ...legacy, id:'modern', coverConfig: coverPresetFor('元气满满') };
    studio.editMeme(modern);
    expect(studio.notice.value).toBe('');
  });
});

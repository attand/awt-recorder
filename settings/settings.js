/**
 * awt-recorder/settings/settings.js
 * 设置管理与预设切换
 */

document.addEventListener('DOMContentLoaded', async () => {
  const presetSelect = document.getElementById('preset-select');
  const bridgeUrlInput = document.getElementById('bridge-url');
  const httpUrlInput = document.getElementById('http-fallback-url');
  const uiFrameworkSelect = document.getElementById('ui-framework');
  const testIdAttrInput = document.getElementById('testid-attr');
  const testIdPrefixInput = document.getElementById('testid-prefix');
  const saveBtn = document.getElementById('save-btn');
  const saveTip = document.getElementById('save-tip');

  let currentConfig = await ConfigManager.load();

  function populatePresets() {
    presetSelect.innerHTML = '';
    Object.keys(currentConfig.presets || {}).forEach(pid => {
      const opt = document.createElement('option');
      opt.value = pid;
      opt.textContent = currentConfig.presets[pid].name || pid;
      if (pid === currentConfig.activePresetId) {
        opt.selected = true;
      }
      presetSelect.appendChild(opt);
    });
  }

  function fillForm(cfg) {
    bridgeUrlInput.value = cfg.bridge?.url || 'ws://127.0.0.1:8766';
    httpUrlInput.value = cfg.bridge?.httpFallbackUrl || 'http://127.0.0.1:8766';
    uiFrameworkSelect.value = cfg.uiFramework || 'element-ui';
    testIdAttrInput.value = cfg.recording?.testIdAttribute || 'data-testid';
    testIdPrefixInput.value = cfg.recording?.testIdPrefix || '';
  }

  populatePresets();
  fillForm(currentConfig);

  presetSelect.addEventListener('change', async () => {
    const selectedPreset = presetSelect.value;
    currentConfig = await ConfigManager.switchPreset(selectedPreset);
    fillForm(currentConfig);
    saveTip.textContent = `已切换至预设: ${currentConfig.presets[selectedPreset]?.name}`;
    setTimeout(() => saveTip.textContent = '', 3000);
  });

  saveBtn.addEventListener('click', async () => {
    const updated = {
      bridge: {
        url: bridgeUrlInput.value.trim(),
        httpFallbackUrl: httpUrlInput.value.trim(),
        protocol: 'websocket'
      },
      uiFramework: uiFrameworkSelect.value,
      recording: {
        ...currentConfig.recording,
        testIdAttribute: testIdAttrInput.value.trim(),
        testIdPrefix: testIdPrefixInput.value.trim()
      }
    };

    currentConfig = await ConfigManager.save(updated);
    saveTip.textContent = '✅ 配置已保存成功！';
    setTimeout(() => saveTip.textContent = '', 3000);
  });
});

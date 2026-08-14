/**
 * awt-recorder/config/default_config.js
 * 默认配置、多项目预设与运行时 ConfigManager
 */

const DEFAULT_PRESETS = {
  'awt-element-ui': {
    name: 'AWT 稽核系统 (Element UI)',
    bridge: {
      url: 'ws://127.0.0.1:8766',
      httpFallbackUrl: 'http://127.0.0.1:8766',
      protocol: 'websocket'
    },
    uiFramework: 'element-ui',
    recording: {
      testIdAttribute: 'data-testid',
      testIdPrefix: 'vue',
      domSnippetDepth: 3,
      domSnippetMaxLength: 2000,
      inputDebounceMs: 300,
      autoMergeSelect: true
    },
    locatorPriority: ['testid', 'role-name', 'label', 'placeholder', 'text', 'css']
  },
  'generic-standard': {
    name: '通用项目 (原生 HTML/标准)',
    bridge: {
      url: 'ws://127.0.0.1:8766',
      httpFallbackUrl: 'http://127.0.0.1:8766',
      protocol: 'websocket'
    },
    uiFramework: 'generic',
    recording: {
      testIdAttribute: 'data-testid',
      testIdPrefix: '',
      domSnippetDepth: 3,
      domSnippetMaxLength: 2000,
      inputDebounceMs: 300,
      autoMergeSelect: true
    },
    locatorPriority: ['testid', 'role-name', 'label', 'placeholder', 'text', 'css']
  },
  'ant-design': {
    name: 'React/Vue 项目 (Ant Design)',
    bridge: {
      url: 'ws://127.0.0.1:8800',
      httpFallbackUrl: 'http://127.0.0.1:8800',
      protocol: 'websocket'
    },
    uiFramework: 'ant-design',
    recording: {
      testIdAttribute: 'data-testid',
      testIdPrefix: '',
      domSnippetDepth: 3,
      domSnippetMaxLength: 2000,
      inputDebounceMs: 300,
      autoMergeSelect: true
    },
    locatorPriority: ['testid', 'role-name', 'label', 'placeholder', 'text', 'css']
  }
};

const DEFAULT_CONFIG = {
  activePresetId: 'awt-element-ui',
  ...DEFAULT_PRESETS['awt-element-ui'],
  presets: DEFAULT_PRESETS
};

class ConfigManager {
  static async load() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get('awtConfig');
        if (stored && stored.awtConfig) {
          return ConfigManager._deepMerge(DEFAULT_CONFIG, stored.awtConfig);
        }
      }
    } catch (e) {
      console.warn('[AWT Config] 读取 storage 失败，降级使用默认配置:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  static async save(partialConfig) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const current = await ConfigManager.load();
      const updated = ConfigManager._deepMerge(current, partialConfig);
      await chrome.storage.local.set({ awtConfig: updated });
      return updated;
    }
    return DEFAULT_CONFIG;
  }

  static async switchPreset(presetId) {
    const config = await ConfigManager.load();
    const targetPreset = config.presets?.[presetId] || DEFAULT_PRESETS[presetId];
    if (!targetPreset) return config;

    const newConfig = {
      ...config,
      activePresetId: presetId,
      bridge: { ...targetPreset.bridge },
      uiFramework: targetPreset.uiFramework,
      recording: { ...targetPreset.recording },
      locatorPriority: [...targetPreset.locatorPriority]
    };
    await ConfigManager.save(newConfig);
    return newConfig;
  }

  static _deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (ConfigManager._isObject(target) && ConfigManager._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (ConfigManager._isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = ConfigManager._deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  static _isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

if (typeof window !== 'undefined') {
  window.__AWT_CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/**
 * awt-recorder/content/recorder.js (Phase 3 智能增强版 - 支持动态多 Frame 追踪与按键捕获)
 * 页面事件捕获 (Click, Input, Change, Keydown)、高亮联动、Frame 自动保活与智能定位器分发
 */

(function () {
  let isRecording = false;
  let localSeq = 0;
  let inputDebounceTimer = null;
  let pendingInputEvent = null;
  let hoverThrottleTimer = null;

  const TRACKED_KEYS = new Set([
    'Tab',
    'Enter',
    'Escape',
    'Delete',
    'Backspace',
    'ArrowDown',
    'ArrowUp',
    'ArrowLeft',
    'ArrowRight',
    'PageDown',
    'PageUp',
    'Home',
    'End'
  ]);

  function initConfig() {
    ConfigManager.load().then(cfg => {
      window.__AWT_CONFIG = cfg;
    });
  }
  initConfig();

  // 核心：动态子 Frame / iframe 加载时主动同步录制状态
  function checkInitialRecordingState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res && res.isRecording) {
            isRecording = true;
            attachListeners();
          }
        });
      }
    } catch (e) {}
  }
  checkInitialRecordingState();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkInitialRecordingState, { once: true });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_RECORDING') {
      isRecording = true;
      localSeq = 0;
      if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearAll();
      attachListeners();
      sendResponse({ status: 'recording_started' });
    } else if (msg.type === 'STOP_RECORDING') {
      flushPendingInput();
      isRecording = false;
      if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearHover();
      detachListeners();
      sendResponse({ status: 'recording_stopped' });
    } else if (msg.type === 'CLEAR_HIGHLIGHTS') {
      if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearAll();
      sendResponse({ status: 'cleared' });
    } else if (msg.type === 'CONFIG_UPDATED') {
      window.__AWT_CONFIG = msg.config;
      sendResponse({ status: 'config_synced' });
    }
    return true;
  });

  function attachListeners() {
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('input', handleInput, true);
    window.removeEventListener('change', handleChange, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mouseover', handleMouseOver, true);

    window.addEventListener('click', handleClick, true);
    window.addEventListener('input', handleInput, true);
    window.addEventListener('change', handleChange, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mouseover', handleMouseOver, true);
  }

  function detachListeners() {
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('input', handleInput, true);
    window.removeEventListener('change', handleChange, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mouseover', handleMouseOver, true);
  }

  function shouldIgnore(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') return true;
    if (el.id === 'awt-recorder-root' || el.id === 'awt-highlighter-root') return true;
    return false;
  }

  function handleMouseOver(e) {
    if (!isRecording) return;
    const target = e.target;
    if (shouldIgnore(target)) return;

    if (!hoverThrottleTimer) {
      hoverThrottleTimer = setTimeout(() => {
        hoverThrottleTimer = null;
        const locatorInfo = generateSmartLocator(target);
        if (window.__AWT_HIGHLIGHTER) {
          window.__AWT_HIGHLIGHTER.highlightHover(target, locatorInfo.primary);
        }
        sendEvent({
          type: 'ELEMENT_HOVER',
          data: {
            tagName: target.tagName,
            text: (target.innerText || '').trim().slice(0, 50),
            primaryLocator: locatorInfo.primary,
            alternatives: locatorInfo.alternatives,
            isInIframe: window.self !== window.top
          }
        });
      }, 50); // 50ms 节流
    }
  }

  function buildEventPayload(action, targetEl, value = null) {
    const rawText = targetEl.innerText || targetEl.textContent || '';
    const cleanText = rawText.trim().replace(/\s+/g, ' ').slice(0, 100);

    let cleanValue = value;
    const attrType = (targetEl.getAttribute('type') || '').toLowerCase();
    if (attrType === 'password') {
      cleanValue = '***';
    } else if (typeof cleanValue === 'string' && cleanValue.length > 500) {
      cleanValue = cleanValue.slice(0, 500);
    }

    localSeq++;
    const locatorInfo = generateSmartLocator(targetEl);
    const isIframe = window.self !== window.top;

    // 录制元素高亮记录
    if (window.__AWT_HIGHLIGHTER) {
      window.__AWT_HIGHLIGHTER.addRecordedElement(targetEl, localSeq);
    }

    let defaultIntent = '';
    if (action === 'click') {
      defaultIntent = `点击${cleanText ? '「' + cleanText + '」' : targetEl.tagName}`;
    } else if (action === 'fill') {
      defaultIntent = `填写${cleanText ? '「' + cleanText + '」' : targetEl.tagName}`;
    } else if (action === 'press') {
      defaultIntent = `按下键盘「${cleanValue}」${cleanText ? '（于 ' + cleanText + '）' : ''}`;
    } else {
      defaultIntent = `${action} ${cleanText || targetEl.tagName}`;
    }

    return {
      type: 'RECORDED_EVENT',
      data: {
        seq: localSeq,
        timestamp: Date.now(),
        action: action,
        intent: defaultIntent,
        value: cleanValue,
        url: window.location.href,
        locator: locatorInfo.primary,
        locatorAlternatives: locatorInfo.alternatives,
        isInIframe: isIframe,
        frameInfo: {
          isIframe: isIframe,
          name: window.name || '',
          url: window.location.href
        },
        element: {
          tagName: targetEl.tagName.toUpperCase(),
          text: cleanText,
          value: targetEl.value !== undefined ? targetEl.value : null,
          testId: getElementTestId(targetEl),
          attributes: getElementAttributes(targetEl)
        },
        context: extractFullContext(targetEl)
      }
    };
  }

  function handleClick(e) {
    if (!isRecording) return;
    const target = e.target;
    if (shouldIgnore(target)) return;

    flushPendingInput();

    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      const type = (target.getAttribute('type') || '').toLowerCase();
      if (type !== 'button' && type !== 'submit' && type !== 'checkbox' && type !== 'radio') {
        return;
      }
    }

    const payload = buildEventPayload('click', target, null);
    sendEvent(payload);
  }

  function handleInput(e) {
    if (!isRecording) return;
    const target = e.target;
    if (shouldIgnore(target)) return;

    const config = window.__AWT_CONFIG?.recording || {};
    const debounceMs = config.inputDebounceMs || 300;

    pendingInputEvent = {
      target: target,
      value: target.value
    };

    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => {
      flushPendingInput();
    }, debounceMs);
  }

  function handleChange(e) {
    if (!isRecording) return;
    const target = e.target;
    if (shouldIgnore(target)) return;

    const tag = target.tagName.toLowerCase();
    if (tag === 'select') {
      flushPendingInput();
      const payload = buildEventPayload('fill', target, target.value);
      sendEvent(payload);
    }
  }

  function handleKeyDown(e) {
    if (!isRecording) return;
    const target = e.target;
    if (shouldIgnore(target)) return;

    let keyName = e.key;
    let shouldRecord = false;

    if (TRACKED_KEYS.has(keyName)) {
      if (keyName === 'Backspace') {
        // 非文本输入框内的 Backspace 具有导航/删除语义时记录
        const tag = target.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          shouldRecord = true;
        }
      } else {
        shouldRecord = true;
      }
    } else if (e.ctrlKey && ['a', 'c', 'v', 'x', 'z', 'A', 'C', 'V', 'X', 'Z'].includes(keyName)) {
      keyName = `Control+${keyName.toLowerCase()}`;
      shouldRecord = true;
    }

    if (shouldRecord) {
      flushPendingInput();
      const payload = buildEventPayload('press', target, keyName);
      sendEvent(payload);
    }
  }

  function flushPendingInput() {
    if (pendingInputEvent) {
      clearTimeout(inputDebounceTimer);
      const payload = buildEventPayload('fill', pendingInputEvent.target, pendingInputEvent.value);
      sendEvent(payload);
      pendingInputEvent = null;
    }
  }

  function sendEvent(payload) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(payload).catch(() => {});
      }
    } catch (e) {}
  }
})();

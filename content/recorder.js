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

  // Phase 6: 断言拾取模式状态
  let isAssertPicking = false;
  let assertInsertIndex = -1;

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
      // 开启录制时无条件重置断言拾取状态，确保正常录制
      exitAssertPick();
      if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearAll();
      attachListeners();
      sendResponse({ status: 'recording_started' });
    } else if (msg.type === 'STOP_RECORDING') {
      flushPendingInput();
      isRecording = false;
      exitAssertPick();
      if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearHover();
      detachListeners();
      sendResponse({ status: 'recording_stopped' });
    } else if (msg.type === 'CLEAR_HIGHLIGHTS') {
      if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearAll();
      sendResponse({ status: 'cleared' });
    } else if (msg.type === 'CONFIG_UPDATED') {
      window.__AWT_CONFIG = msg.config;
      sendResponse({ status: 'config_synced' });
    } else if (msg.type === 'START_ASSERT_PICK') {
      // Phase 6: 进入断言拾取模式
      isAssertPicking = true;
      assertInsertIndex = msg.insertIndex ?? -1;
      document.body.style.cursor = 'crosshair';
      // 确保高亮可用（即使未在录制状态）
      attachListeners();
      sendResponse({ success: true });
    } else if (msg.type === 'CANCEL_ASSERT_PICK') {
      // Phase 6: 取消断言拾取
      exitAssertPick();
      sendResponse({ success: true });
    }
    return true;
  });

  // Phase 6: 退出断言拾取模式
  function exitAssertPick() {
    isAssertPicking = false;
    assertInsertIndex = -1;
    document.body.style.cursor = '';
    if (window.__AWT_HIGHLIGHTER && typeof window.__AWT_HIGHLIGHTER.resetHoverStyle === 'function') {
      window.__AWT_HIGHLIGHTER.resetHoverStyle();
    }
    if (window.__AWT_HIGHLIGHTER) window.__AWT_HIGHLIGHTER.clearHover();
    // 若不在录制状态则移除监听
    if (!isRecording) detachListeners();
  }

  // Phase 6: 断言拾取处理
  function handleAssertPick(targetEl) {
    const rawText = targetEl.innerText || targetEl.textContent || '';
    const expectedText = rawText.trim().replace(/\s+/g, ' ').slice(0, 200);
    const locatorInfo = (typeof generateSmartLocator === 'function')
      ? generateSmartLocator(targetEl)
      : { primary: targetEl.tagName.toLowerCase(), alternatives: [] };
    const isIframe = window.self !== window.top;

    const intentPreview = expectedText.slice(0, 30) + (expectedText.length > 30 ? '...' : '');

    const payload = {
      type: 'INSERT_ASSERT_STEP',
      insertIndex: assertInsertIndex,
      data: {
        seq: 0,
        timestamp: Date.now(),
        action: 'assert',
        intent: '验证文本「' + intentPreview + '」',
        value: null,
        expected_text: expectedText,
        url: window.location.href,
        locator: locatorInfo.primary,
        locatorAlternatives: locatorInfo.alternatives,
        isInIframe: isIframe,
        frameInfo: { isIframe, name: window.name || '', url: window.location.href },
        element: {
          tagName: targetEl.tagName.toUpperCase(),
          text: expectedText,
          value: targetEl.value !== undefined ? targetEl.value : null,
          testId: (typeof getElementTestId === 'function') ? getElementTestId(targetEl) : { self: null, closest: null },
          attributes: (typeof getElementAttributes === 'function') ? getElementAttributes(targetEl) : {}
        },
        context: (typeof extractFullContext === 'function') ? extractFullContext(targetEl) : {}
      }
    };

    try {
      chrome.runtime.sendMessage(payload).catch(() => {});
    } catch (e) {}

    exitAssertPick();
  }

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
    if ((!isRecording && !isAssertPicking) || window.__AWT_IS_EXPLORING) return;
    const target = e.target;
    if (shouldIgnore(target)) return;

    if (!hoverThrottleTimer) {
      hoverThrottleTimer = setTimeout(() => {
        hoverThrottleTimer = null;
        const locatorInfo = generateSmartLocator(target);
        if (window.__AWT_HIGHLIGHTER) {
          // Phase 6: 断言拾取模式使用紫色高亮
          if (isAssertPicking && typeof window.__AWT_HIGHLIGHTER.highlightAssertHover === 'function') {
            window.__AWT_HIGHLIGHTER.highlightAssertHover(target, locatorInfo.primary);
          } else {
            window.__AWT_HIGHLIGHTER.highlightHover(target, locatorInfo.primary);
          }
        }
        // 拾取模式下不发送 ELEMENT_HOVER 事件
        if (!isAssertPicking) {
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
        }
      }, 50); // 50ms 节流
    }
  }

  function buildEventPayload(action, targetEl, cleanValue) {
    localSeq++;
    const rawText = targetEl.innerText || targetEl.textContent || '';
    const cleanText = rawText.trim().replace(/\s+/g, ' ').slice(0, 100);

    const config = window.__AWT_CONFIG?.recording || {};
    const isPassword = targetEl.type === 'password';
    const safeValue = isPassword ? '***' : cleanValue;

    const locatorInfo = generateSmartLocator(targetEl);
    const isIframe = window.self !== window.top || targetEl.ownerDocument !== document;

    // 录制元素高亮记录
    if (window.__AWT_HIGHLIGHTER) {
      window.__AWT_HIGHLIGHTER.addRecordedElement(targetEl, localSeq);
    }

    let defaultIntent = '';
    if (action === 'click') {
      defaultIntent = cleanText ? '点击「' + cleanText.slice(0, 20) + '」' : '点击 ' + targetEl.tagName.toLowerCase();
    } else if (action === 'fill') {
      const label = extractFullContext(targetEl)?.formLabel?.text;
      defaultIntent = label ? '填写 ' + label : '输入文本';
    } else if (action === 'press') {
      defaultIntent = '按下 ' + cleanValue;
    }

    return {
      type: 'RECORDED_EVENT',
      data: {
        seq: localSeq,
        timestamp: Date.now(),
        action: action,
        intent: defaultIntent,
        value: safeValue,
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
    // Phase 6: 断言拾取模式拦截 — 必须在最前面
    if (isAssertPicking) {
      e.preventDefault();
      e.stopImmediatePropagation();
      handleAssertPick(e.target);
      return;
    }

    if (!isRecording || window.__AWT_IS_EXPLORING) return;
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
    if (!isRecording || window.__AWT_IS_EXPLORING) return;
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
    if (!isRecording || window.__AWT_IS_EXPLORING) return;
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
    // Phase 6: 在断言拾取模式下按 Escape 随时取消拾取
    if (isAssertPicking && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      exitAssertPick();
      try {
        chrome.runtime.sendMessage({ type: 'CANCEL_ASSERT_PICK' }).catch(() => {});
      } catch (err) {}
      return;
    }

    if (!isRecording || window.__AWT_IS_EXPLORING) return;
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

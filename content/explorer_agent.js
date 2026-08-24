/**
 * awt-recorder/content/explorer_agent.js
 * Phase 4b: 前端 AI 探索引擎 (支持跨 iframe 元素识别、防重拦截与步骤自动固化)
 */
(function () {

  let isExploring = false;
  let exploreAborted = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'BEGIN_EXPLORE') {
      // 只在顶层窗口运行探索主循环，子 iframe 不单独启动循环
      if (window.self !== window.top) {
        return false;
      }
      if (isExploring) {
        sendResponse({ status: 'already_exploring' });
        return true;
      }
      isExploring = true;
      window.__AWT_IS_EXPLORING = true;
      exploreAborted = false;
      runExploreLoop(msg.intent_text, msg.max_steps || 10);
      sendResponse({ status: 'explore_started' });
      return true;
    }

    if (msg.type === 'EXPLORE_STOP') {
      exploreAborted = true;
      sendResponse({ status: 'explore_stopping' });
      return true;
    }

    if (msg.type === 'EXPLORE_LLM_RESPONSE') {
      // LLM 响应通过全局 Promise 回调传递给 runExploreLoop
      if (window.__awt_explore_resolve) {
        window.__awt_explore_resolve(msg);
        window.__awt_explore_resolve = null;
      }
      return false;
    }
  });

  /**
   * 生成极简 DOM 快照（支持主页面及所有子 iframe）
   */
  function snapshot() {
    const refMap = {};
    let counter = 0;
    const outputLines = [];

    const INTERACTIVE = 'button, a, input, select, textarea, ' +
      '[role="button"], [role="textbox"], [role="tab"], ' +
      '[role="menuitem"], [role="checkbox"], [role="radio"], ' +
      '[role="combobox"], [role="listbox"], [role="option"], ' +
      '[onclick], [tabindex]';

    const seenTexts = new Set();

    function collectFromDoc(doc, label) {
      if (!doc) return;
      let elements;
      try {
        elements = doc.querySelectorAll(INTERACTIVE);
      } catch (e) {
        return;
      }
      if (!elements || elements.length === 0) return;

      outputLines.push(`--- ${label} ---`);

      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const win = doc.defaultView || window;
        const style = win.getComputedStyle ? win.getComputedStyle(el) : null;

        if (rect.width < 3 || rect.height < 3) return;
        if (style && (style.visibility === 'hidden' || style.display === 'none')) return;
        if (style && parseFloat(style.opacity) < 0.1) return;

        const tag = el.tagName.toLowerCase();
        if ((tag === 'span' || tag === 'label') &&
            !el.getAttribute('onclick') &&
            !el.getAttribute('role') &&
            !el.getAttribute('tabindex')) return;

        const text = (el.innerText || '').trim().substring(0, 40).replace(/\n/g, ' ');
        const name = el.getAttribute('name') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const type = el.getAttribute('type') || '';

        const dedupKey = tag + ':' + (text || name || placeholder);
        if (dedupKey.length > 2 && seenTexts.has(dedupKey)) return;
        if (dedupKey.length > 2) seenTexts.add(dedupKey);

        if (!text && !name && !placeholder && !ariaLabel &&
            tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;

        counter++;
        const ref = 'e' + counter;
        try {
          el.setAttribute('awt-explore-id', ref);
        } catch (e) {}
        refMap[ref] = el;

        // 格式化行
        const parts = [ref.padEnd(4) + ' [' + tag + ']'];
        if (text) parts.push('"' + text + '"');
        if (name) parts.push('name="' + name + '"');
        if (placeholder) parts.push('placeholder="' + placeholder + '"');
        if (ariaLabel && !text) parts.push('aria-label="' + ariaLabel + '"');
        if (type && tag === 'input') parts.splice(1, 0, 'type=' + type);
        outputLines.push('  ' + parts.join('  '));
      });
    }

    // 1. 采集主页面
    collectFromDoc(document, 'Page');

    // 2. 采集所有可访问的子 iframe
    try {
      const iframes = document.querySelectorAll('iframe, frame');
      iframes.forEach((iframe, idx) => {
        try {
          const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (subDoc) {
            collectFromDoc(subDoc, `iframe (${iframe.name || iframe.id || 'frame_' + (idx + 1)})`);
          }
        } catch (e) {}
      });
    } catch (e) {}

    return { text: outputLines.join('\n'), refMap: refMap };
  }

  /**
   * 根据短引用解析出真实 DOM 元素（支持跨 iframe）
   */
  function resolveRef(refMap, ref) {
    if (refMap && refMap[ref]) return refMap[ref];
    let el = document.querySelector('[awt-explore-id="' + ref + '"]');
    if (el) return el;
    try {
      const iframes = document.querySelectorAll('iframe, frame');
      for (const iframe of iframes) {
        try {
          const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (subDoc) {
            el = subDoc.querySelector('[awt-explore-id="' + ref + '"]');
            if (el) return el;
          }
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  /**
   * 清除页面及 iframe 中的 awt-explore-id 标记
   */
  function clearExploreIds() {
    try {
      document.querySelectorAll('[awt-explore-id]').forEach(el => el.removeAttribute('awt-explore-id'));
      const iframes = document.querySelectorAll('iframe, frame');
      iframes.forEach(iframe => {
        try {
          const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (subDoc) {
            subDoc.querySelectorAll('[awt-explore-id]').forEach(el => el.removeAttribute('awt-explore-id'));
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  /**
   * 在真实 DOM 上执行操作
   */
  function executeAction(el, actionType, value) {
    if (actionType === 'click') {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      el.click();
    } else if (actionType === 'fill') {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      el.focus();
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.value = value || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * 将探索操作转为 recorder.js 兼容的 RECORDED_EVENT 并发送
   */
  function emitRecordedStep(el, actionType, value, thinkText) {
    const locatorInfo = (typeof generateSmartLocator === 'function')
      ? generateSmartLocator(el)
      : { primary: el.tagName.toLowerCase(), alternatives: [] };

    const cleanText = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const isIframe = window.self !== window.top || el.ownerDocument !== document;

    let intent = thinkText || '';
    if (!intent) {
      if (actionType === 'click') intent = '点击' + (cleanText ? '「' + cleanText + '」' : el.tagName);
      else if (actionType === 'fill') intent = '填写' + (cleanText ? '「' + cleanText + '」' : el.tagName);
    }
    intent = '【AI探索】' + intent;

    const stepPayload = {
      action: actionType,
      intent: intent,
      value: value || null,
      locator: locatorInfo.primary
    };

    const payload = {
      type: 'RECORDED_EVENT',
      data: {
        seq: 0,
        timestamp: Date.now(),
        action: actionType,
        intent: intent,
        value: value || null,
        url: window.location.href,
        locator: locatorInfo.primary,
        locatorAlternatives: locatorInfo.alternatives,
        isInIframe: isIframe,
        frameInfo: { isIframe: isIframe, name: window.name || '', url: window.location.href },
        element: {
          tagName: el.tagName.toUpperCase(),
          text: cleanText,
          value: el.value || null,
          testId: (typeof getElementTestId === 'function') ? getElementTestId(el) : { self: null, closest: null },
          attributes: (typeof getElementAttributes === 'function') ? getElementAttributes(el) : {}
        },
        context: (typeof extractFullContext === 'function') ? extractFullContext(el) : {}
      }
    };

    try {
      chrome.runtime.sendMessage(payload).catch(() => {});
    } catch (e) {}

    return stepPayload;
  }

  /**
   * 等待 LLM 响应
   */
  function waitForLLMResponse(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.__awt_explore_resolve = null;
        reject(new Error('LLM 响应超时'));
      }, timeoutMs || 60000);

      window.__awt_explore_resolve = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
    });
  }

  /**
   * 主探索循环
   */
  async function runExploreLoop(intentText, maxSteps) {
    const history = [];
    const generatedStepsForExport = [];

    function reportProgress(stepNum, thinkText, actionType, ref) {
      try {
        chrome.runtime.sendMessage({
          type: 'EXPLORE_STEP_PROGRESS',
          step_num: stepNum,
          max_steps: maxSteps,
          think: thinkText,
          action: actionType,
          ref: ref
        }).catch(() => {});
      } catch (e) {}
    }

    try {
      for (let step = 1; step <= maxSteps; step++) {
        if (exploreAborted) {
          chrome.runtime.sendMessage({
            type: 'EXPLORE_COMPLETE',
            success: false,
            reason: '已手动终止探索',
            intent: intentText,
            generatedSteps: generatedStepsForExport
          }).catch(() => {});
          break;
        }

        // 等待页面渲染稳定
        await new Promise(r => setTimeout(r, 800));

        // 1. 生成 DOM 快照
        const snap = snapshot();

        // 2. 发送给 Bridge → LLM
        chrome.runtime.sendMessage({
          type: 'EXPLORE_LLM_REQUEST',
          intent_text: intentText,
          dom_snapshot: snap.text,
          history: JSON.stringify(history.length > 0 ? history : 'None')
        }).catch(() => {});

        // 3. 等待 LLM 响应
        let llmResponse;
        try {
          llmResponse = await waitForLLMResponse(60000);
        } catch (e) {
          reportProgress(step, 'LLM 响应超时', 'error', '');
          break;
        }

        const action = llmResponse.action;
        const ref = llmResponse.ref || '';
        const value = llmResponse.value || '';
        const think = llmResponse.think || '';

        reportProgress(step, think, action, ref);

        // 4. 执行动作
        if (action === 'done') {
          chrome.runtime.sendMessage({
            type: 'EXPLORE_COMPLETE',
            success: true,
            reason: think || '意图已达成',
            intent: intentText,
            generatedSteps: generatedStepsForExport
          }).catch(() => {});
          break;
        }

        const targetEl = resolveRef(snap.refMap, ref);
        if (!targetEl) {
          history.push({ step: step, action: action, ref: ref, error: 'ref not found' });
          continue;
        }

        executeAction(targetEl, action, value);
        const recordedStep = emitRecordedStep(targetEl, action, value, think);
        if (recordedStep) {
          generatedStepsForExport.push(recordedStep);
        }
        history.push({ step: step, action: action, ref: ref, value: value || undefined });

        if (step === maxSteps) {
          chrome.runtime.sendMessage({
            type: 'EXPLORE_COMPLETE',
            success: false,
            reason: '已达到最大步数上限',
            intent: intentText,
            generatedSteps: generatedStepsForExport
          }).catch(() => {});
        }
      }
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'EXPLORE_COMPLETE',
        success: false,
        reason: e.message,
        intent: intentText,
        generatedSteps: generatedStepsForExport
      }).catch(() => {});
    } finally {
      isExploring = false;
      window.__AWT_IS_EXPLORING = false;
      clearExploreIds();
    }
  }

})();

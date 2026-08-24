/**
 * awt-recorder/content/explorer_agent.js
 * Phase 4b: 前端 AI 探索引擎
 *
 * 职责：
 *   1. 生成当前页面的极简 DOM 快照（移植自 Python 端 DOMSimplifier）
 *   2. 将快照 + 意图 + 历史发送给后端 LLM
 *   3. 解析 LLM 返回的动作指令，在真实 DOM 上执行
 *   4. 将每步操作通过 RECORDED_EVENT 追加到录制列表
 *   5. 循环直到 LLM 返回 done 或达到 max_steps
 */
(function () {

  let isExploring = false;
  let exploreAborted = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'BEGIN_EXPLORE') {
      if (isExploring) {
        sendResponse({ status: 'already_exploring' });
        return true;
      }
      isExploring = true;
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
      // LLM 响应通过事件传递给 runExploreLoop 中的等待逻辑
      if (window.__awt_explore_resolve) {
        window.__awt_explore_resolve(msg);
        window.__awt_explore_resolve = null;
      }
      return false;
    }
  });

  /**
   * 生成极简 DOM 快照（移植自 Python DOMSimplifier._build_extraction_js）
   * 返回格式：
   *   --- Page ---
   *   e1  [button]  "登录系统"
   *   e2  [input]   placeholder="请输入员工账号"
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

    outputLines.push('--- Page ---');

    document.querySelectorAll(INTERACTIVE).forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      if (rect.width < 3 || rect.height < 3) return;
      if (style.visibility === 'hidden' || style.display === 'none') return;
      if (parseFloat(style.opacity) < 0.1) return;

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
      el.setAttribute('awt-explore-id', ref);
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

    return { text: outputLines.join('\n'), refMap: refMap };
  }

  /**
   * 根据短引用解析出真实 DOM 元素
   */
  function resolveRef(refMap, ref) {
    return refMap[ref] || document.querySelector('[awt-explore-id="' + ref + '"]');
  }

  /**
   * 在真实 DOM 上执行操作并派发对应事件
   */
  function executeAction(el, actionType, value) {
    if (actionType === 'click') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.click();
    } else if (actionType === 'fill') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus();
      // 清空现有值
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      // 填入新值
      el.value = value || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * 将探索操作转为 recorder.js 兼容的 RECORDED_EVENT 并发送
   */
  function emitRecordedStep(el, actionType, value, thinkText) {
    // 复用 dom_utils.js 中已有的函数（它们在同一个 Content Script 上下文中）
    const locatorInfo = (typeof generateSmartLocator === 'function')
      ? generateSmartLocator(el)
      : { primary: el.tagName.toLowerCase(), alternatives: [] };

    const cleanText = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const isIframe = window.self !== window.top;

    let intent = thinkText || '';
    if (!intent) {
      if (actionType === 'click') intent = '点击' + (cleanText ? '「' + cleanText + '」' : el.tagName);
      else if (actionType === 'fill') intent = '填写' + (cleanText ? '「' + cleanText + '」' : el.tagName);
    }
    intent = '【AI探索】' + intent;

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
  }

  /**
   * 等待 LLM 响应（通过 Promise + 消息回调）
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

    // 通知进度
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
          chrome.runtime.sendMessage({ type: 'EXPLORE_COMPLETE', success: false, reason: 'aborted' }).catch(() => {});
          break;
        }

        // 等待页面稳定
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
          chrome.runtime.sendMessage({ type: 'EXPLORE_COMPLETE', success: true, reason: think }).catch(() => {});
          break;
        }

        const targetEl = resolveRef(snap.refMap, ref);
        if (!targetEl) {
          history.push({ step: step, action: action, ref: ref, error: 'ref not found' });
          continue;
        }

        executeAction(targetEl, action, value);
        emitRecordedStep(targetEl, action, value, think);
        history.push({ step: step, action: action, ref: ref, value: value || undefined });

        // 如果是最后一步还没 done
        if (step === maxSteps) {
          chrome.runtime.sendMessage({ type: 'EXPLORE_COMPLETE', success: false, reason: 'max_steps_reached' }).catch(() => {});
        }
      }
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'EXPLORE_COMPLETE', success: false, reason: e.message }).catch(() => {});
    } finally {
      isExploring = false;
      // 清除 awt-explore-id 属性
      document.querySelectorAll('[awt-explore-id]').forEach(el => el.removeAttribute('awt-explore-id'));
    }
  }

})();

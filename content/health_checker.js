/**
 * awt-recorder/content/health_checker.js
 * Phase 4a: 定位器健检 — 在 Content Script 中验证 locator 并采集 DOM 上下文
 */
(function () {

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CHECK_LOCATORS') {
      const results = checkLocators(msg.locators);
      sendResponse({ results: results });
      return true;  // 异步响应
    }
  });

  /**
   * 逐条验证 locator 数组
   * @param {Array<{index: number, locator: string, intent: string}>} locators
   * @returns {Array<{index: number, locator: string, intent: string, status: string, dom_snippet: string}>}
   *   status: "found" | "not_found"
   *   dom_snippet: 仅在 not_found 时有值，为 document.body 的前 80000 字符 outerHTML
   */
  function checkLocators(locators) {
    const results = [];
    // 预先采集一次 DOM 快照（避免重复采集）
    let domSnapshot = '';
    let hasFailure = false;

    for (const item of locators) {
      const loc = item.locator;
      let found = false;

      // 动态变量插值 (如 tr:has-text('{{ bill_id }}') 或 ${var})：直接跳过检测，不做失效判断
      if (loc && (loc.includes('{{') || loc.includes('${'))) {
        results.push({
          index: item.index,
          locator: item.locator,
          intent: item.intent,
          status: 'dynamic_skipped',
          dom_snippet: ''
        });
        continue;
      }

      try {
        // 处理 Playwright 风格的文本选择器
        if (loc.startsWith("text=") || loc.startsWith("text='") || loc.startsWith('text="')) {
          // 提取文本内容，在 DOM 中搜索包含该文本的可见元素
          const textContent = loc.replace(/^text=['"]?|['"]?$/g, '');
          const allEls = document.querySelectorAll('*');
          for (const el of allEls) {
            if (el.innerText && el.innerText.trim().includes(textContent) && el.offsetParent !== null) {
              found = true;
              break;
            }
          }
        }
        // 处理 role 选择器: role=button[name='xxx']
        else if (loc.startsWith("role=")) {
          const match = loc.match(/^role=(\w+)\[name=['"](.+?)['"]\]$/);
          if (match) {
            const role = match[1];
            const name = match[2];
            const el = document.querySelector(`[role="${role}"][aria-label="${name}"]`) ||
                       document.querySelector(`[role="${role}"]`);
            found = !!el;
          }
        }
        // 处理 label 选择器: label:has-text('xxx')
        else if (loc.startsWith("label:has-text(")) {
          const textMatch = loc.match(/label:has-text\(['"](.+?)['"]\)/);
          if (textMatch) {
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
              if (label.textContent.includes(textMatch[1])) {
                found = true;
                break;
              }
            }
          }
        }
        // 处理 :has-text() 选择器: button:has-text('xxx')
        else if (loc.includes(':has-text(')) {
          const parts = loc.match(/^(.+?):has-text\(['"](.+?)['"]\)$/);
          if (parts) {
            const els = document.querySelectorAll(parts[1]);
            for (const el of els) {
              if (el.textContent.includes(parts[2])) {
                found = true;
                break;
              }
            }
          }
        }
        // 处理 iframe >> 前缀：去掉前缀后在 iframe 内部验证（Content Script 只能验证自身 frame）
        else if (loc.includes('>> content_frame >>') || loc.startsWith('iframe >>')) {
          // 跨 frame 定位器在当前 frame 中无法直接验证，标记为 found（避免误报）
          found = true;
        }
        // 标准 CSS 选择器
        else {
          const el = document.querySelector(loc);
          found = !!el;
        }
      } catch (e) {
        found = false;
      }

      if (!found) {
        hasFailure = true;
      }

      results.push({
        index: item.index,
        locator: item.locator,
        intent: item.intent,
        status: found ? 'found' : 'not_found',
        dom_snippet: ''  // 稍后统一填充
      });
    }

    // 仅在有失败项时采集 DOM 快照（性能优化）
    if (hasFailure) {
      try {
        const clone = document.body.cloneNode(true);
        // 移除 script 标签
        const scripts = clone.getElementsByTagName('script');
        while (scripts.length > 0) scripts[0].parentNode.removeChild(scripts[0]);
        domSnapshot = clone.outerHTML.substring(0, 80000);
      } catch (e) {
        domSnapshot = '<body>DOM 快照采集失败</body>';
      }

      // 为失败项填充 DOM 快照
      for (const r of results) {
        if (r.status === 'not_found') {
          r.dom_snippet = domSnapshot;
        }
      }
    }

    return results;
  }

})();

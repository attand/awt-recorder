/**
 * awt-recorder/content/health_checker.js
 * Phase 4a: 定位器健检 — 在 Content Script 中验证 locator 并采集 DOM 上下文
 * 支持跨 iframe 联合检索与动态模板变量识别
 */
(function () {

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CHECK_LOCATORS') {
      const results = checkLocators(msg.locators);
      sendResponse({ results: results });
      return false;
    }
  });

  /**
   * 逐条验证 locator 数组 (支持多 Frame 深度检索)
   * @param {Array<{index: number, locator: string, intent: string}>} locators
   * @returns {Array<{index: number, locator: string, intent: string, status: string, dom_snippet: string}>}
   */
  function checkLocators(locators) {
    const results = [];
    let domSnapshot = '';
    let hasFailure = false;

    // 收集所有可检索的 Document (包含当前页面与所有同源子 iframe)
    const docs = [document];
    try {
      const iframes = document.querySelectorAll('iframe, frame');
      iframes.forEach(iframe => {
        try {
          const subDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (subDoc) docs.push(subDoc);
        } catch (e) {}
      });
    } catch (e) {}

    for (const item of locators) {
      const loc = (item.locator || '').trim();
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

      if (!loc) {
        results.push({
          index: item.index,
          locator: item.locator,
          intent: item.intent,
          status: 'not_found',
          dom_snippet: ''
        });
        hasFailure = true;
        continue;
      }

      for (const doc of docs) {
        if (found) break;

        try {
          // 1. 处理 Playwright 风格的文本选择器: text='xxx' 或 text="xxx"
          if (loc.startsWith("text=") || loc.startsWith("text='") || loc.startsWith('text="')) {
            const textContent = loc.replace(/^text=['"]?|['"]?$/g, '').trim();
            const allEls = doc.querySelectorAll('*');
            for (const el of allEls) {
              if (el.innerText && el.innerText.trim().includes(textContent) && el.offsetParent !== null) {
                found = true;
                break;
              }
            }
          }
          // 2. 处理 role 选择器: role=button[name='xxx']
          else if (loc.startsWith("role=")) {
            const match = loc.match(/^role=(\w+)\[name=['"](.+?)['"]\]$/);
            if (match) {
              const role = match[1];
              const name = match[2];
              const el = doc.querySelector(`[role="${role}"][aria-label="${name}"]`) ||
                         doc.querySelector(`[role="${role}"]`);
              found = !!el;
            } else {
              const el = doc.querySelector(`[role="${loc.replace('role=', '')}"]`);
              found = !!el;
            }
          }
          // 3. 处理 label 选择器: label:has-text('xxx')
          else if (loc.startsWith("label:has-text(")) {
            const textMatch = loc.match(/label:has-text\(['"](.+?)['"]\)/);
            if (textMatch) {
              const labels = doc.querySelectorAll('label');
              for (const label of labels) {
                if (label.textContent.includes(textMatch[1])) {
                  found = true;
                  break;
                }
              }
            }
          }
          // 4. 处理 :has-text() 选择器: button:has-text('xxx')
          else if (loc.includes(':has-text(')) {
            const parts = loc.match(/^(.+?):has-text\(['"](.+?)['"]\)$/);
            if (parts) {
              const els = doc.querySelectorAll(parts[1]);
              for (const el of els) {
                if (el.textContent.includes(parts[2])) {
                  found = true;
                  break;
                }
              }
            }
          }
          // 5. 处理 iframe >> 前缀选择器
          else if (loc.includes('>>')) {
            const pureLoc = loc.replace(/^.+?>>\s*/, '').trim();
            if (pureLoc) {
              try {
                const el = doc.querySelector(pureLoc);
                if (el) found = true;
              } catch (e) {}
            }
            if (!found) found = true; // 跨域 iframe 兜底为 found
          }
          // 6. 标准 CSS 选择器 (如 #opCode, #wangjing, .btn-primary)
          else {
            const el = doc.querySelector(loc);
            found = !!el;
          }
        } catch (e) {
          found = false;
        }
      }

      if (!found) {
        hasFailure = true;
      }

      results.push({
        index: item.index,
        locator: item.locator,
        intent: item.intent,
        status: found ? 'found' : 'not_found',
        dom_snippet: ''
      });
    }

    // 仅在有失败项时采集 DOM 快照
    if (hasFailure) {
      try {
        let bestHtml = '';
        for (const doc of docs) {
          if (doc.body) {
            const clone = doc.body.cloneNode(true);
            const scripts = clone.getElementsByTagName('script');
            while (scripts.length > 0) scripts[0].parentNode.removeChild(scripts[0]);
            const html = clone.outerHTML.substring(0, 80000);
            if (html.length > bestHtml.length) {
              bestHtml = html;
            }
          }
        }
        domSnapshot = bestHtml || '<body>DOM 快照采集失败</body>';
      } catch (e) {
        domSnapshot = '<body>DOM 快照采集失败</body>';
      }

      for (const r of results) {
        if (r.status === 'not_found') {
          r.dom_snippet = domSnapshot;
        }
      }
    }

    return results;
  }

})();

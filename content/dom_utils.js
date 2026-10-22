/**
 * awt-recorder/content/dom_utils.js
 * 通用 DOM 属性提取、适配器调度与智能定位器生成
 */

const AWT_ADAPTER_REGISTRY = [
  ElementUIAdapter,
  AntDesignAdapter,
  GenericAdapter
];

function getActiveAdapter() {
  const configFramework = window.__AWT_CONFIG?.uiFramework;
  if (configFramework && configFramework !== 'auto') {
    const configured = AWT_ADAPTER_REGISTRY.find(a => a.name === configFramework);
    if (configured) return configured;
  }

  for (const adapter of AWT_ADAPTER_REGISTRY) {
    if (adapter.detect()) {
      return adapter;
    }
  }
  return GenericAdapter;
}

function getElementTestId(el) {
  if (!el || typeof el.getAttribute !== 'function') {
    return { self: null, closest: null };
  }

  const config = window.__AWT_CONFIG?.recording || {};
  const attrName = config.testIdAttribute || 'data-testid';
  const prefix = config.testIdPrefix || '';

  const filterPrefix = (val) => {
    if (!val) return null;
    if (!prefix) return val;
    return val.startsWith(prefix) ? val : null;
  };

  // 1. 优先提取自身 testid；若自身没有且处于可点击父级内部（如 button > span），尝试提取该交互组件的 testid
  let selfId = filterPrefix(el.getAttribute(attrName));
  if (!selfId && el.closest) {
    const clickable = el.closest('button, a, [role="button"], input, select');
    if (clickable && clickable !== el) {
      selfId = filterPrefix(clickable.getAttribute(attrName));
    }
  }

  // 2. 向上寻找最近带有 testid 的容器祖先
  const ancestor = el.parentElement ? el.parentElement.closest(`[${attrName}]`) : null;
  const closestId = ancestor ? filterPrefix(ancestor.getAttribute(attrName)) : null;

  return {
    self: selfId || null,
    closest: closestId || null
  };
}

function getElementAttributes(el) {
  if (!el || typeof el.getAttribute !== 'function') {
    return {
      id: '',
      name: '',
      role: null,
      ariaLabel: null,
      placeholder: null,
      type: null,
      classList: [],
      dataTestId: null,
      outerHTML: ''
    };
  }

  const config = window.__AWT_CONFIG?.recording || {};
  const attrName = config.testIdAttribute || 'data-testid';

  return {
    id: el.id || '',
    name: el.getAttribute('name') || '',
    role: el.getAttribute('role') || null,
    ariaLabel: el.getAttribute('aria-label') || null,
    placeholder: el.getAttribute('placeholder') || null,
    type: el.getAttribute('type') || null,
    classList: el.classList ? Array.from(el.classList) : [],
    dataTestId: el.getAttribute(attrName) || null,
    outerHTML: el.outerHTML ? el.outerHTML.slice(0, 500) : ''
  };
}

function getLocalDOMSnippet(el, depth = 3, maxLength = 2000) {
  if (!el) return '';
  try {
    const selfHtml = el.outerHTML || '';
    if (selfHtml.length >= maxLength) {
      return selfHtml.slice(0, maxLength) + '...<!-- [TRUNCATED] -->';
    }

    // 自底向上逐层扩大上下文，保证 best 始终完整包含 el 且其 outerHTML <= maxLength
    let best = el;
    let current = el;
    for (let i = 0; i < depth; i++) {
      if (!current.parentElement || current.parentElement.tagName.toLowerCase() === 'body') {
        break;
      }
      current = current.parentElement;
      if (current.outerHTML && current.outerHTML.length <= maxLength) {
        best = current;
      } else {
        // 如果 current 已经超出 maxLength，停止向上扩展，保证 best 完整且不会把 el 截断掉
        break;
      }
    }

    let resultHtml = best.outerHTML || '';

    // 若祖先有关键容器（如带有 data-testid 或特定弹窗 class 的容器），但在当前 best 外部，
    // 以注释形式附带其起始标签信息，给 LLM 提供容器上下文，同时保留自身完整 DOM
    const config = window.__AWT_CONFIG?.recording || {};
    const attrName = config.testIdAttribute || 'data-testid';
    const closestTestIdEl = el.closest ? el.closest(`[${attrName}]`) : null;
    const dialogEl = el.closest ? el.closest('[role="dialog"], .popupBg, .el-dialog__wrapper, .el-dialog') : null;

    let prefixContext = '';
    if (closestTestIdEl && !best.contains(closestTestIdEl) && closestTestIdEl !== best) {
      prefixContext += `<!-- Ancestor Container: <${closestTestIdEl.tagName.toLowerCase()} id="${closestTestIdEl.id || ''}" ${attrName}="${closestTestIdEl.getAttribute(attrName) || ''}" class="${closestTestIdEl.className || ''}"> -->\n`;
    }
    if (dialogEl && dialogEl !== closestTestIdEl && !best.contains(dialogEl) && dialogEl !== best) {
      prefixContext += `<!-- Dialog Container: <${dialogEl.tagName.toLowerCase()} id="${dialogEl.id || ''}" class="${dialogEl.className || ''}"> -->\n`;
    }

    return prefixContext + resultHtml;
  } catch (e) {
    return el.outerHTML ? el.outerHTML.slice(0, maxLength) : '';
  }
}

function extractFullContext(el) {
  const adapter = getActiveAdapter();
  const config = window.__AWT_CONFIG?.recording || {};
  const depth = config.domSnippetDepth || 3;
  const maxLen = config.domSnippetMaxLength || 2000;

  return {
    formLabel: adapter.getFormItemLabel(el),
    dialogTitle: adapter.getDialogContext(el)?.title || null,
    componentType: adapter.detectComponentType(el),
    tableFixed: adapter.getTableFixedInfo(el),
    domSnippet: getLocalDOMSnippet(el, depth, maxLen),
    detectedFramework: adapter.name
  };
}

/**
 * 根据优先级策略动态生成最优定位器与备选定位器列表
 * @param {Element} el
 * @returns {{ primary: string, alternatives: string[] }}
 */
function generateSmartLocator(el) {
  if (!el || !el.tagName) return { primary: '', alternatives: [] };

  const adapter = getActiveAdapter();
  const testIdData = getElementTestId(el);
  const attrs = getElementAttributes(el);
  const formLabel = adapter.getFormItemLabel(el);
  const isIframe = window.self !== window.top;
  const prefix = isIframe ? 'iframe >> ' : '';
  const cleanText = (el.innerText || '').trim();

  const candidates = [];

  // 1. Priority: data-testid (self)
  if (testIdData.self) {
    candidates.push(`${prefix}[data-testid='${testIdData.self}']`);
  }

  // 2. Priority: data-testid (closest ancestor)
  if (testIdData.closest) {
    const subTag = el.tagName.toLowerCase();
    if (attrs.id) {
      candidates.push(`${prefix}[data-testid='${testIdData.closest}'] >> #${attrs.id}`);
    }
    if (cleanText && cleanText.length < 30 && !cleanText.includes('\n')) {
      candidates.push(`${prefix}[data-testid='${testIdData.closest}'] >> text='${cleanText}'`);
    } else if (attrs.classList.length > 0) {
      candidates.push(`${prefix}[data-testid='${testIdData.closest}'] >> .${attrs.classList[0]}`);
    } else {
      candidates.push(`${prefix}[data-testid='${testIdData.closest}'] >> ${subTag}`);
    }
  }

  // 3. Priority: ID 精确定位
  if (attrs.id) {
    candidates.push(`${prefix}#${attrs.id}`);
  }

  // 4. Priority: role + name / aria-label
  if (attrs.role && (attrs.ariaLabel || cleanText)) {
    const nameVal = attrs.ariaLabel || cleanText;
    if (nameVal) {
      candidates.push(`${prefix}role=${attrs.role}[name='${nameVal}']`);
    }
  }

  // 5. Priority: label text
  if (formLabel && formLabel.text) {
    candidates.push(`${prefix}label:has-text('${formLabel.text}')`);
  }

  // 6. Priority: placeholder
  if (attrs.placeholder) {
    candidates.push(`${prefix}[placeholder='${attrs.placeholder}']`);
  }

  // 7. Priority: text selector
  if (cleanText && cleanText.length < 30 && !cleanText.includes('\n')) {
    candidates.push(`${prefix}text='${cleanText}'`);
  }

  // 8. Fallback: tag + class
  if (attrs.classList.length > 0) {
    candidates.push(`${prefix}.${attrs.classList[0]}`);
  } else {
    candidates.push(`${prefix}${el.tagName.toLowerCase()}`);
  }

  return {
    primary: candidates[0] || `${prefix}${el.tagName.toLowerCase()}`,
    alternatives: candidates.slice(1, 4)
  };
}

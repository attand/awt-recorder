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

  const selfId = filterPrefix(el.getAttribute(attrName));
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
      classList: []
    };
  }

  return {
    id: el.id || '',
    name: el.getAttribute('name') || '',
    role: el.getAttribute('role') || null,
    ariaLabel: el.getAttribute('aria-label') || null,
    placeholder: el.getAttribute('placeholder') || null,
    type: el.getAttribute('type') || null,
    classList: el.classList ? Array.from(el.classList) : []
  };
}

function getLocalDOMSnippet(el, depth = 3, maxLength = 2000) {
  if (!el || !el.parentElement) return '';
  try {
    let current = el;
    for (let i = 0; i < depth; i++) {
      if (current.parentElement && current.parentElement.tagName.toLowerCase() !== 'body') {
        current = current.parentElement;
      } else {
        break;
      }
    }
    const html = current.outerHTML || '';
    if (html.length > maxLength) {
      return html.slice(0, maxLength) + '...<!-- [TRUNCATED] -->';
    }
    return html;
  } catch (e) {
    return '';
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

  const candidates = [];

  // 1. Priority: data-testid (self)
  if (testIdData.self) {
    candidates.push(`${prefix}[data-testid='${testIdData.self}']`);
  }

  // 2. Priority: data-testid (closest ancestor)
  if (testIdData.closest) {
    const subTag = el.tagName.toLowerCase();
    candidates.push(`${prefix}[data-testid='${testIdData.closest}'] >> ${subTag}`);
  }

  // 3. Priority: role + name / aria-label
  if (attrs.role && (attrs.ariaLabel || el.innerText)) {
    const nameVal = attrs.ariaLabel || el.innerText.trim();
    if (nameVal) {
      candidates.push(`${prefix}role=${attrs.role}[name='${nameVal}']`);
    }
  }

  // 4. Priority: label text
  if (formLabel && formLabel.text) {
    candidates.push(`${prefix}label:has-text('${formLabel.text}')`);
  }

  // 5. Priority: placeholder
  if (attrs.placeholder) {
    candidates.push(`${prefix}[placeholder='${attrs.placeholder}']`);
  }

  // 6. Priority: text selector
  const cleanText = (el.innerText || '').trim();
  if (cleanText && cleanText.length < 30 && !cleanText.includes('\n')) {
    candidates.push(`${prefix}text='${cleanText}'`);
  }

  // 7. Fallback: tag + class
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

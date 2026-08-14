/**
 * awt-recorder/adapters/generic.js
 * 原生 HTML 兜底适配器
 */

class GenericAdapter extends BaseAdapter {
  static get name() {
    return 'generic';
  }

  static get displayName() {
    return '通用 (原生 HTML)';
  }

  static detect() {
    return true; // 永远匹配兜底
  }

  static detectComponentType(el) {
    if (!el || !el.tagName) return 'unknown';
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'button' || (tag === 'input' && (type === 'button' || type === 'submit'))) return 'button';
    if (tag === 'input') {
      if (type === 'date' || type === 'datetime-local') return 'date-picker';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'file') return 'upload';
      return 'input';
    }
    if (tag === 'table' || el.closest('table')) return 'table';
    if (el.closest('dialog, [role="dialog"]')) return 'dialog';
    return 'unknown';
  }

  static getFormItemLabel(el) {
    if (!el) return null;
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && label.textContent) {
        const text = label.textContent.trim().replace(/[:：\s\*]/g, '');
        if (text) return { text, forAttr: el.id };
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      const text = parentLabel.textContent.trim().replace(/[:：\s\*]/g, '');
      if (text) return { text, forAttr: null };
    }
    return null;
  }

  static getDialogContext(el) {
    if (!el) return null;
    const dialog = el.closest('dialog, [role="dialog"]');
    if (!dialog) return null;
    const ariaLabel = dialog.getAttribute('aria-label');
    const headerEl = dialog.querySelector('h1, h2, h3, h4, h5, [role="heading"]');
    const title = ariaLabel || (headerEl ? headerEl.textContent.trim() : null);
    return title ? { title, ariaLabel } : null;
  }

  static getTableFixedInfo(el) {
    return { hasFixedRight: false, hasFixedLeft: false };
  }

  static shouldMergeEvents(prevEvent, currEvent) {
    return null;
  }
}

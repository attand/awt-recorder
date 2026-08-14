/**
 * awt-recorder/adapters/ant_design.js
 * Ant Design (React / Vue) 基础适配器骨架
 */

class AntDesignAdapter extends BaseAdapter {
  static get name() {
    return 'ant-design';
  }

  static get displayName() {
    return 'Ant Design';
  }

  static detect() {
    return !!document.querySelector('.ant-form, .ant-table, .ant-modal, .ant-select, [class*="ant-"]');
  }

  static detectComponentType(el) {
    if (!el) return 'unknown';

    if (el.closest('.ant-select') || el.closest('.ant-select-dropdown')) return 'select';
    if (el.closest('.ant-picker-range')) return 'date-range';
    if (el.closest('.ant-picker')) return 'date-picker';
    if (el.closest('.ant-cascader')) return 'cascader';
    if (el.closest('.ant-tree')) return 'tree';
    if (el.closest('.ant-upload')) return 'upload';
    if (el.closest('.ant-checkbox-wrapper')) return 'checkbox';
    if (el.closest('.ant-radio-wrapper')) return 'radio';
    if (el.matches('.ant-btn, .ant-btn *') || el.closest('.ant-btn')) return 'button';
    if (el.closest('.ant-input-textarea')) return 'textarea';
    if (el.closest('.ant-input-affix-wrapper, .ant-input')) return 'input';
    if (el.closest('.ant-table')) return 'table';
    if (el.closest('.ant-modal, .ant-drawer')) return 'dialog';

    return 'unknown';
  }

  static getFormItemLabel(el) {
    if (!el) return null;
    const formItem = el.closest('.ant-form-item');
    if (!formItem) return null;

    const label = formItem.querySelector('.ant-form-item-label label');
    if (!label || !label.textContent) return null;

    const text = label.textContent.trim().replace(/[:：\s\*]/g, '');
    const forAttr = label.getAttribute('for') || null;
    return text ? { text, forAttr } : null;
  }

  static getDialogContext(el) {
    if (!el) return null;
    const dialog = el.closest('.ant-modal, .ant-drawer');
    if (!dialog) return null;

    const titleEl = dialog.querySelector('.ant-modal-title, .ant-drawer-title');
    const title = titleEl && titleEl.textContent ? titleEl.textContent.trim() : null;
    return title ? { title, ariaLabel: null } : null;
  }

  static getTableFixedInfo(el) {
    if (!el) return { hasFixedRight: false, hasFixedLeft: false };
    const table = el.closest('.ant-table');
    if (!table) return { hasFixedRight: false, hasFixedLeft: false };

    const isInFixedRight = !!el.closest('.ant-table-cell-fix-right');
    const isInFixedLeft = !!el.closest('.ant-table-cell-fix-left');
    return {
      hasFixedRight: !!table.querySelector('.ant-table-cell-fix-right'),
      hasFixedLeft: !!table.querySelector('.ant-table-cell-fix-left'),
      isInFixedRight: isInFixedRight,
      isInFixedLeft: isInFixedLeft
    };
  }

  static shouldMergeEvents(prevStep, currStep) {
    if (!prevStep || !currStep) return null;

    // ant-select 合并
    const prevIsSelect = prevStep.action === 'click' && prevStep.context?.componentType === 'select';
    const currIsOption = currStep.action === 'click' && (
      currStep.element?.attributes?.classList?.some(c => c.includes('ant-select-item-option'))
    );

    if (prevIsSelect && currIsOption) {
      const optionText = (currStep.element?.text || '').trim();
      return {
        merge: true,
        mergedStep: {
          ...prevStep,
          action: 'select_option',
          value: optionText,
          mergedFromSteps: [prevStep.globalSeq, currStep.globalSeq],
          element: {
            ...prevStep.element,
            text: optionText
          }
        }
      };
    }
    return null;
  }
}

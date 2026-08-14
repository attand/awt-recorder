/**
 * awt-recorder/adapters/element_ui.js
 * Element UI / Element Plus 适配器 (Phase 2 增强版)
 */

class ElementUIAdapter extends BaseAdapter {
  static get name() {
    return 'element-ui';
  }

  static get displayName() {
    return 'Element UI / Plus';
  }

  static detect() {
    return !!document.querySelector('.el-form, .el-table, .el-dialog, .el-select, [class*="el-"]');
  }

  static detectComponentType(el) {
    if (!el) return 'unknown';

    if (el.closest('.el-select') || el.closest('.el-select-dropdown')) return 'select';
    if (el.closest('.el-date-editor--daterange, .el-date-editor--datetimerange')) return 'date-range';
    if (el.closest('.el-date-editor')) return 'date-picker';
    if (el.closest('.el-cascader') || el.closest('.el-cascader-panel')) return 'cascader';
    if (el.closest('.el-tree')) return 'tree';
    if (el.closest('.el-upload')) return 'upload';
    if (el.closest('.el-checkbox, .el-checkbox-button')) return 'checkbox';
    if (el.closest('.el-radio, .el-radio-button')) return 'radio';
    if (el.matches('.el-button, .el-button *') || el.closest('.el-button')) return 'button';
    if (el.closest('.el-textarea')) return 'textarea';
    if (el.closest('.el-input')) return 'input';
    if (el.closest('.el-table')) return 'table';
    if (el.closest('.el-dialog, .el-drawer, [role="dialog"]')) return 'dialog';

    return 'unknown';
  }

  static getFormItemLabel(el) {
    if (!el) return null;
    const formItem = el.closest('.el-form-item');
    if (!formItem) return null;

    const label = formItem.querySelector('.el-form-item__label, label');
    if (!label || !label.textContent) return null;

    const text = label.textContent.trim().replace(/[:：\s\*]/g, '');
    const forAttr = label.getAttribute('for') || null;
    return text ? { text, forAttr } : null;
  }

  static getDialogContext(el) {
    if (!el) return null;
    const dialog = el.closest('.el-dialog, .el-drawer, .el-dialog__wrapper, [role="dialog"]');
    if (!dialog) return null;

    const titleEl = dialog.querySelector('.el-dialog__title, .el-drawer__title');
    const ariaLabel = dialog.getAttribute('aria-label');
    const title = (titleEl && titleEl.textContent ? titleEl.textContent.trim() : null) || ariaLabel;

    return title ? { title, ariaLabel } : null;
  }

  static getTableFixedInfo(el) {
    if (!el) return { hasFixedRight: false, hasFixedLeft: false };
    const table = el.closest('.el-table');
    if (!table) return { hasFixedRight: false, hasFixedLeft: false };

    const isInFixedRight = !!el.closest('.el-table__fixed-right');
    const isInFixedLeft = !!el.closest('.el-table__fixed');
    const tableHasFixedRight = !!table.querySelector('.el-table__fixed-right');
    const tableHasFixedLeft = !!table.querySelector('.el-table__fixed');

    return {
      hasFixedRight: tableHasFixedRight,
      hasFixedLeft: tableHasFixedLeft,
      isInFixedRight: isInFixedRight,
      isInFixedLeft: isInFixedLeft
    };
  }

  static shouldMergeEvents(prevStep, currStep) {
    if (!prevStep || !currStep) return null;

    // 场景 1: el-select 下拉框选值合并
    // 前一步：点击 el-select 输入框/触发区；当前步：点击下拉项 .el-select-dropdown__item
    const prevIsSelectClick = (prevStep.action === 'click') && (
      (prevStep.context?.componentType === 'select') ||
      (prevStep.element?.attributes?.classList?.some(c => c.includes('el-select')))
    );

    const currIsOptionClick = (currStep.action === 'click') && (
      currStep.element?.attributes?.classList?.some(c => c.includes('el-select-dropdown__item')) ||
      currStep.element?.tagName === 'LI'
    );

    if (prevIsSelectClick && currIsOptionClick) {
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
          },
          context: {
            ...prevStep.context,
            componentType: 'select'
          }
        }
      };
    }

    return null;
  }
}

/**
 * awt-recorder/adapters/base_adapter.js
 * 适配器抽象基类
 */

class BaseAdapter {
  static get name() {
    return 'base';
  }

  static get displayName() {
    return 'Base Adapter';
  }

  static detect() {
    return false;
  }

  static detectComponentType(el) {
    return 'unknown';
  }

  static getFormItemLabel(el) {
    return null;
  }

  static getDialogContext(el) {
    return null;
  }

  static getTableFixedInfo(el) {
    return { hasFixedRight: false, hasFixedLeft: false };
  }

  static shouldMergeEvents(prevEvent, currEvent) {
    return null;
  }
}

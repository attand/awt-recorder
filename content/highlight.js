/**
 * awt-recorder/content/highlight.js
 * 基于 Shadow DOM 的隔离式页面元素高亮器
 */

class AWTHighlighter {
  constructor() {
    this.hostEl = null;
    this.shadowRoot = null;
    this.hoverBox = null;
    this.recordedBoxes = new Map();
    this.init();
  }

  init() {
    if (document.getElementById('awt-highlighter-root')) return;

    this.hostEl = document.createElement('div');
    this.hostEl.id = 'awt-highlighter-root';
    this.hostEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';

    this.shadowRoot = this.hostEl.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        .awt-box {
          position: absolute;
          pointer-events: none;
          box-sizing: border-box;
          transition: all 0.1s ease-out;
          display: none;
        }
        .awt-box--hover {
          border: 2px dashed #2563eb;
          background-color: rgba(37, 99, 235, 0.08);
          z-index: 10;
        }
        .awt-box--recorded {
          border: 2px solid #10b981;
          background-color: rgba(16, 185, 129, 0.05);
          z-index: 5;
        }
        .awt-badge {
          position: absolute;
          top: -20px;
          left: -2px;
          background-color: #2563eb;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 5px;
          border-radius: 3px;
          white-space: nowrap;
          pointer-events: none !important;
        }
        .awt-badge--green {
          background-color: #10b981;
        }
      </style>
      <div id="hover-box" class="awt-box awt-box--hover">
        <span id="hover-badge" class="awt-badge">🎯 定位器预览</span>
      </div>
      <div id="recorded-container"></div>
    `;

    this.hoverBox = this.shadowRoot.getElementById('hover-box');
    this.hoverBadge = this.shadowRoot.getElementById('hover-badge');
    this.recordedContainer = this.shadowRoot.getElementById('recorded-container');

    document.documentElement.appendChild(this.hostEl);
  }

  highlightHover(targetEl, locatorText = '') {
    if (!targetEl || !this.hoverBox) return;
    try {
      const rect = targetEl.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      this.hoverBox.style.width = `${rect.width}px`;
      this.hoverBox.style.height = `${rect.height}px`;
      this.hoverBox.style.top = `${rect.top + scrollY}px`;
      this.hoverBox.style.left = `${rect.left + scrollX}px`;
      this.hoverBox.style.display = 'block';

      if (locatorText) {
        this.hoverBadge.textContent = locatorText.slice(0, 35) + (locatorText.length > 35 ? '...' : '');
      }
    } catch (e) {}
  }

  clearHover() {
    if (this.hoverBox) {
      this.hoverBox.style.display = 'none';
    }
  }

  addRecordedElement(targetEl, stepNum) {
    if (!targetEl || !this.recordedContainer) return;
    try {
      const rect = targetEl.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      const box = document.createElement('div');
      box.className = 'awt-box awt-box--recorded';
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.style.top = `${rect.top + scrollY}px`;
      box.style.left = `${rect.left + scrollX}px`;
      box.style.display = 'block';
      box.innerHTML = `<span class="awt-badge awt-badge--green">#${stepNum}</span>`;

      this.recordedContainer.appendChild(box);
      this.recordedBoxes.set(stepNum, box);
    } catch (e) {}
  }

  // Phase 6: 断言拾取高亮（紫色边框）
  highlightAssertHover(targetEl, locatorText = '') {
    if (!targetEl || !this.hoverBox) return;
    try {
      const rect = targetEl.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      this.hoverBox.style.width = `${rect.width}px`;
      this.hoverBox.style.height = `${rect.height}px`;
      this.hoverBox.style.top = `${rect.top + scrollY}px`;
      this.hoverBox.style.left = `${rect.left + scrollX}px`;
      this.hoverBox.style.border = '2px dashed #8b5cf6';
      this.hoverBox.style.background = 'rgba(139, 92, 246, 0.1)';
      this.hoverBox.style.display = 'block';

      const previewText = (targetEl.innerText || '').trim().slice(0, 40);
      this.hoverBadge.textContent = '🎯 断言: ' + (previewText || locatorText.slice(0, 35));
      this.hoverBadge.style.background = '#8b5cf6';
      this.hoverBadge.style.display = 'block';
    } catch (e) {}
  }

  // Phase 6: 重置高亮样式到默认蓝色
  resetHoverStyle() {
    if (this.hoverBox) {
      this.hoverBox.style.border = '2px dashed #2563eb';
      this.hoverBox.style.background = 'rgba(37, 99, 235, 0.08)';
    }
    if (this.hoverBadge) {
      this.hoverBadge.style.background = '#2563eb';
    }
  }

  clearAll() {
    this.clearHover();
    if (this.recordedContainer) {
      this.recordedContainer.innerHTML = '';
    }
    this.recordedBoxes.clear();
  }
}

window.__AWT_HIGHLIGHTER = new AWTHighlighter();

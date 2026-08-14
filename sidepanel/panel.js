/**
 * awt-recorder/sidepanel/panel.js (Phase 3 完整版)
 * 实时悬停预览、行内编辑与多渠道导出
 */

document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggle-record-btn');
  const btnText = document.getElementById('record-btn-text');
  const sendBtn = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-btn');
  const copyBtn = document.getElementById('copy-clipboard-btn');
  const exportBtn = document.getElementById('export-json-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const stepCountEl = document.getElementById('step-count');
  const stepsContainer = document.getElementById('steps-container');
  const statusMsg = document.getElementById('status-message');
  const bridgeBadge = document.getElementById('bridge-badge');
  const toastEl = document.getElementById('awt-toast');

  const previewTagEl = document.getElementById('preview-tag-name');
  const previewLocatorEl = document.getElementById('preview-locator-primary');
  const previewAltsEl = document.getElementById('preview-locator-alts');

  let currentSteps = [];

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.className = 'awt-toast awt-toast--visible';
    setTimeout(() => {
      toastEl.className = 'awt-toast';
    }, 2000);
  }

  function renderSteps(steps) {
    currentSteps = steps || [];
    stepCountEl.textContent = currentSteps.length;
    exportBtn.disabled = currentSteps.length === 0;
    copyBtn.disabled = currentSteps.length === 0;

    if (currentSteps.length === 0) {
      stepsContainer.innerHTML = `
        <div class="awt-empty-state">
          <div class="awt-empty-icon">📝</div>
          <p>暂无录制步骤</p>
          <p class="awt-empty-sub">开启录制并在页面操作，支持双击编辑意图/值</p>
        </div>
      `;
      return;
    }

    stepsContainer.innerHTML = '';
    currentSteps.forEach((step, idx) => {
      const card = document.createElement('div');
      card.className = 'awt-step-card';

      const action = step.action || 'click';
      const intent = step.intent || step.element?.text || step.value || '操作步骤';
      const testId = step.element?.testId?.self || step.element?.testId?.closest;
      const label = step.context?.formLabel?.text;
      const isIframe = step.isInIframe;

      card.innerHTML = `
        <div class="awt-step-main">
          <span class="awt-step-action awt-step-action--${action}">#${idx + 1} ${action}</span>
          <span class="awt-step-intent-text" title="双击修改意图描述">${intent}</span>
          <div class="awt-step-btns">
            ${idx > 0 ? `<button class="awt-step-btn awt-step-btn--up" data-index="${idx}" title="上移">▲</button>` : ''}
            ${idx < currentSteps.length - 1 ? `<button class="awt-step-btn awt-step-btn--down" data-index="${idx}" title="下移">▼</button>` : ''}
            <button class="awt-step-btn awt-step-btn--del" data-index="${idx}" title="删除">×</button>
          </div>
        </div>
        <div class="awt-step-meta">
          ${testId ? `<span class="awt-tag">🆔 ${testId}</span>` : ''}
          ${label ? `<span class="awt-tag">🏷️ ${label}</span>` : ''}
          ${isIframe ? `<span class="awt-tag">🖼️ iframe</span>` : ''}
          ${step.value !== null && step.value !== undefined ? `<span class="awt-tag awt-val-tag" title="双击修改值">${action === 'press' ? '⌨️' : '✍️'} "${step.value}"</span>` : ''}
        </div>
      `;

      // 意图双击编辑
      const intentEl = card.querySelector('.awt-step-intent-text');
      intentEl.addEventListener('dblclick', () => {
        const input = document.createElement('input');
        input.className = 'awt-inline-input';
        input.value = step.intent || intent;
        intentEl.replaceWith(input);
        input.focus();
        input.addEventListener('blur', () => {
          const newIntent = input.value.trim();
          chrome.runtime.sendMessage({ type: 'UPDATE_STEP', index: idx, intent: newIntent }, res => {
            if (res) updateUI(res);
          });
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
        });
      });

      // 值的双击编辑
      const valTag = card.querySelector('.awt-val-tag');
      if (valTag) {
        valTag.addEventListener('dblclick', () => {
          const input = document.createElement('input');
          input.className = 'awt-inline-input';
          input.value = step.value;
          valTag.replaceWith(input);
          input.focus();
          input.addEventListener('blur', () => {
            const newVal = input.value;
            chrome.runtime.sendMessage({ type: 'UPDATE_STEP', index: idx, value: newVal }, res => {
              if (res) updateUI(res);
            });
          });
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
          });
        });
      }

      // 删除按钮
      card.querySelector('.awt-step-btn--del').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DELETE_STEP', index: idx }, res => {
          if (res) updateUI(res);
        });
      });

      // 上移
      const upBtn = card.querySelector('.awt-step-btn--up');
      if (upBtn) {
        upBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'MOVE_STEP', fromIndex: idx, toIndex: idx - 1 }, res => {
            if (res) updateUI(res);
          });
        });
      }

      // 下移
      const downBtn = card.querySelector('.awt-step-btn--down');
      if (downBtn) {
        downBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'MOVE_STEP', fromIndex: idx, toIndex: idx + 1 }, res => {
            if (res) updateUI(res);
          });
        });
      }

      stepsContainer.appendChild(card);
    });

    stepsContainer.scrollTop = stepsContainer.scrollHeight;
  }

  function updateUI(status) {
    if (!status) return;

    if (typeof status.bridgeConnected === 'boolean') {
      bridgeBadge.className = status.bridgeConnected ? 'awt-badge awt-badge--on' : 'awt-badge awt-badge--off';
      bridgeBadge.textContent = status.bridgeConnected ? 'Bridge 在线' : 'Bridge 离线';

      if (status.bridgeConnected && statusMsg.textContent === '正在重新连接 Bridge...') {
        statusMsg.style.color = '';
        statusMsg.textContent = status.isRecording ? '🔴 正在实时捕获与高亮...' : '准备就绪';
        showToast('🟢 Bridge 连接正常');
      }
    }

    if (status.isRecording !== undefined) {
      if (status.isRecording) {
        toggleBtn.className = 'awt-btn awt-btn--recording awt-btn--lg';
        btnText.textContent = '停止录制';
        sendBtn.disabled = true;
        clearBtn.disabled = true;
        statusMsg.textContent = '🔴 正在实时捕获与高亮...';
      } else {
        toggleBtn.className = 'awt-btn awt-btn--primary awt-btn--lg';
        btnText.textContent = '开始录制';
        sendBtn.disabled = (!status.steps || status.steps.length === 0);
        clearBtn.disabled = (!status.steps || status.steps.length === 0);
        statusMsg.textContent = '准备就绪';
      }
    }

    if (status.steps !== undefined) {
      renderSteps(status.steps);
    }
  }

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
    if (res) updateUI(res);
  });

  toggleBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_RECORDING' }, res => {
      if (res) updateUI(res);
    });
  });

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_STEPS' }, res => {
      if (res) {
        updateUI(res);
        showToast('已清空所有录制步骤');
      }
    });
  });

  copyBtn.addEventListener('click', async () => {
    if (currentSteps.length === 0) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ steps: currentSteps }, null, 2));
      showToast('📋 JSON 已成功复制到剪贴板！');
    } catch (e) {
      showToast('❌ 复制失败');
    }
  });

  exportBtn.addEventListener('click', () => {
    if (currentSteps.length === 0) return;
    const blob = new Blob([JSON.stringify({ steps: currentSteps }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已保存 JSON 文件');
  });

  sendBtn.addEventListener('click', () => {
    sendBtn.disabled = true;
    statusMsg.textContent = '🚀 正在向 Bridge Server 发送并触发转译...';

    chrome.runtime.sendMessage({ type: 'SEND_TO_BRIDGE' }, res => {
      sendBtn.disabled = false;
      if (res && res.success) {
        statusMsg.style.color = '#10b981';
        statusMsg.textContent = res.message || '发送成功！等待 LLM 转译...';
        showToast('🚀 发送成功！');
      } else {
        statusMsg.style.color = '#ef4444';
        statusMsg.textContent = res ? res.message : '发送失败';
      }
    });
  });

  bridgeBadge.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, status => {
      if (status && status.bridgeConnected) {
        showToast('🟢 Bridge 当前已是在线连接状态');
        if (statusMsg.textContent === '正在重新连接 Bridge...') {
          statusMsg.style.color = '';
          statusMsg.textContent = status.isRecording ? '🔴 正在实时捕获与高亮...' : '准备就绪';
        }
        return;
      }
      statusMsg.style.color = '';
      statusMsg.textContent = '正在重新连接 Bridge...';
      showToast('🔄 正在尝试重新连接 Bridge...');
      chrome.runtime.sendMessage({ type: 'RECONNECT_WS' });
    });
  });

  openSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('settings/settings.html'));
    }
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'STATUS_UPDATE') {
      updateUI(msg);
    } else if (msg.type === 'STEP_ADDED' || msg.type === 'STEP_REPLACED') {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
        if (res) updateUI(res);
      });
    } else if (msg.type === 'PREVIEW_LOCATOR') {
      const data = msg.hoverData;
      previewTagEl.textContent = data.tagName;
      previewLocatorEl.textContent = data.primaryLocator;
      if (data.alternatives && data.alternatives.length > 0) {
        previewAltsEl.textContent = '备选: ' + data.alternatives.join(' | ');
      } else {
        previewAltsEl.textContent = '';
      }
    } else if (msg.type === 'TRANSLATE_COMPLETED') {
      statusMsg.style.color = msg.success ? '#10b981' : '#ef4444';
      statusMsg.textContent = msg.message;
      showToast(msg.success ? '🎉 YAML 转译完成！' : '⚠️ 转译遇到警告');
    }
  });
});

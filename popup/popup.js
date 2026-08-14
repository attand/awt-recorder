/**
 * awt-recorder/popup/popup.js
 * Popup 交互逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-record-btn');
  const btnText = document.getElementById('record-btn-text');
  const sendBtn = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-btn');
  const stepCountEl = document.getElementById('step-count');
  const statusMsg = document.getElementById('status-message');
  const bridgeStatus = document.getElementById('bridge-status');

  function updateUI(status) {
    stepCountEl.textContent = status.stepCount || 0;

    if (status.bridgeConnected) {
      bridgeStatus.className = 'awt-badge awt-badge--on';
      bridgeStatus.textContent = 'Bridge 已连接';
    } else {
      bridgeStatus.className = 'awt-badge awt-badge--off';
      bridgeStatus.textContent = 'Bridge 待检测';
    }

    if (status.isRecording) {
      toggleBtn.className = 'awt-btn awt-btn--recording';
      btnText.textContent = '停止录制';
      sendBtn.disabled = true;
      clearBtn.disabled = true;
    } else {
      toggleBtn.className = 'awt-btn awt-btn--primary';
      btnText.textContent = '开始录制';
      sendBtn.disabled = (status.stepCount === 0);
      clearBtn.disabled = (status.stepCount === 0);
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
      if (res && res.success) {
        updateUI({ isRecording: false, stepCount: 0 });
        statusMsg.textContent = '已清空录制步骤';
      }
    });
  });

  sendBtn.addEventListener('click', () => {
    sendBtn.disabled = true;
    statusMsg.textContent = '正在发送到 Bridge Server...';

    chrome.runtime.sendMessage({ type: 'SEND_TO_BRIDGE' }, res => {
      sendBtn.disabled = false;
      if (res && res.success) {
        statusMsg.style.color = '#16a34a';
        statusMsg.textContent = res.message || '发送成功';
        if (res.data) {
          bridgeStatus.className = 'awt-badge awt-badge--on';
          bridgeStatus.textContent = 'Bridge 已连接';
        }
      } else {
        statusMsg.style.color = '#dc2626';
        statusMsg.textContent = res ? res.message : '发送失败，请确认 Bridge 启动';
      }
    });
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'STATUS_UPDATE') {
      updateUI(msg);
    } else if (msg.type === 'STEP_ADDED') {
      stepCountEl.textContent = msg.totalSteps;
      sendBtn.disabled = false;
      clearBtn.disabled = false;
    }
  });
});

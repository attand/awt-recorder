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

  // Phase 4a: 健检相关元素
  const importYamlBtn = document.getElementById('import-yaml-btn');
  const healthCheckBtn = document.getElementById('health-check-btn');
  const yamlFileInput = document.getElementById('yaml-file-input');
  const healthSection = document.getElementById('health-check-section');
  const healthCloseBtn = document.getElementById('health-close-btn');
  const healthFileInfo = document.getElementById('health-file-info');
  const healthResults = document.getElementById('health-results');
  const healthActions = document.getElementById('health-actions');
  const healthApplyBtn = document.getElementById('health-apply-btn');

  let importedYamlSteps = [];  // 导入的 YAML 步骤（含 locator 的子集）
  let importedYamlPath = '';   // 导入的 YAML 文件名（用于显示）
  let healSuggestions = [];    // AI 修复建议 [{index, old_locator, new_locator}]

  // Phase 4b: AI 探索相关元素
  const exploreToggleHeader = document.getElementById('explore-toggle-header');
  const exploreBody = document.getElementById('explore-body');
  const exploreCollapseIcon = document.getElementById('explore-collapse-icon');
  const exploreIntentInput = document.getElementById('explore-intent-input');
  const exploreStartBtn = document.getElementById('explore-start-btn');
  const exploreStopBtn = document.getElementById('explore-stop-btn');
  const exploreProgress = document.getElementById('explore-progress');

  let isExploring = false;
  let lastRenderedStepNum = -1;

  // Phase 5: 视觉探索相关
  const exploreModeText = document.getElementById('explore-mode-text');
  const exploreModeVisual = document.getElementById('explore-mode-visual');
  const exploreModeHint = document.getElementById('explore-mode-hint');
  let isVisualExploring = false;
  let lastVisualStepNum = -1;

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
    // Phase 4a: 健检结果回调
    else if (msg.type === 'HEAL_RESULT') {
      handleHealResult(msg);
    } else if (msg.type === 'APPLY_RESULT') {
      healthApplyBtn.disabled = false;
      if (msg.success) {
        healthApplyBtn.textContent = '✅ 修复已采纳写入';
        showToast('✅ 修复已写入 YAML 文件');
        statusMsg.style.color = '#10b981';
        statusMsg.textContent = '修复已成功写入: ' + (msg.message || '');
      } else {
        showToast('❌ 写入失败: ' + (msg.message || ''));
        statusMsg.style.color = '#ef4444';
        statusMsg.textContent = '写入失败: ' + (msg.message || '');
      }
    }
    // Phase 4b: 探索进度回调
    else if (msg.type === 'EXPLORE_STEP_PROGRESS') {
      renderExploreStep(msg);
    } else if (msg.type === 'EXPLORE_COMPLETE') {
      handleExploreComplete(msg);
    } else if (msg.type === 'EXPLORE_SOLIDIFIED') {
      handleExploreSolidified(msg);
    }
    // Phase 5: 视觉探索进度回调
    else if (msg.type === 'EXPLORE_VISUAL_PROGRESS') {
      renderVisualExploreStep(msg);
    } else if (msg.type === 'EXPLORE_VISUAL_COMPLETE') {
      handleVisualExploreComplete(msg);
    } else if (msg.type === 'EXPLORE_VISUAL_ERROR') {
      handleVisualExploreError(msg);
    } else if (msg.type === 'EXPLORE_VISUAL_SOLIDIFIED') {
      handleExploreSolidified(msg);  // 复用现有固化结果处理函数
    }
  });

  // ==================== Phase 4a: 定位器健检逻辑 ====================

  importYamlBtn.addEventListener('click', () => {
    yamlFileInput.click();
  });

  yamlFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseYamlSimple(text);
      importedYamlPath = file.name;

      // 提取所有含 locator 的步骤
      importedYamlSteps = [];
      if (parsed.steps && Array.isArray(parsed.steps)) {
        parsed.steps.forEach((step, idx) => {
          if (step.locator && typeof step.locator === 'string' && step.locator.trim()) {
            importedYamlSteps.push({
              index: idx,
              action: step.action || '',
              intent: step.intent || '',
              locator: step.locator.trim(),
              value: step.value || '',
              key: step.key || ''
            });
          }
        });
      }

      // 重置状态
      healSuggestions = [];
      healthActions.style.display = 'none';
      healthApplyBtn.disabled = false;
      healthApplyBtn.textContent = '✅ 采纳全部修复';
      healthResults.innerHTML = '';
      healthSection.style.display = 'none';

      healthCheckBtn.disabled = importedYamlSteps.length === 0;
      showToast(`📂 已导入 ${importedYamlSteps.length} 个可检测步骤`);
      statusMsg.textContent = `已导入 ${file.name}（${importedYamlSteps.length} 个定位器）`;
    } catch (err) {
      showToast('❌ YAML 解析失败: ' + err.message);
    }

    // 重置 file input，允许再次选择相同文件
    yamlFileInput.value = '';
  });

  healthCheckBtn.addEventListener('click', () => {
    if (importedYamlSteps.length === 0) return;
    healthCheckBtn.disabled = true;
    statusMsg.textContent = '🩺 正在验证定位器...';
    healSuggestions = [];
    healthActions.style.display = 'none';
    healthApplyBtn.disabled = false;
    healthApplyBtn.textContent = '✅ 采纳全部修复';

    // 向 Service Worker 发送健检请求
    chrome.runtime.sendMessage({
      type: 'HEALTH_CHECK_REQUEST',
      steps: importedYamlSteps,
      yamlPath: importedYamlPath
    }, (res) => {
      healthCheckBtn.disabled = false;
      if (res) {
        renderHealthResults(res);
      }
    });
  });

  healthCloseBtn.addEventListener('click', () => {
    healthSection.style.display = 'none';
  });

  healthApplyBtn.addEventListener('click', () => {
    if (healSuggestions.length === 0) return;
    healthApplyBtn.disabled = true;
    statusMsg.textContent = '📝 正在写入修复...';

    chrome.runtime.sendMessage({
      type: 'APPLY_HEALS',
      yamlPath: importedYamlPath,
      repairs: healSuggestions.map(s => ({ old: s.old_locator, new: s.new_locator }))
    });
  });

  function renderHealthResults(res) {
    healthSection.style.display = '';
    healthFileInfo.textContent = `脚本: ${importedYamlPath}`;
    healthResults.innerHTML = '';
    healthActions.style.display = 'none';
    healthApplyBtn.disabled = false;
    healthApplyBtn.textContent = '✅ 采纳全部修复';

    const items = res.results || [];
    let okCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const item of items) {
      const div = document.createElement('div');
      const isDynamic = item.status === 'dynamic_skipped';
      const isOk = item.status === 'found';

      let statusBadge = '🟢 命中';
      let statusClass = 'awt-health-status--ok';
      let itemClass = 'awt-health-item--ok';

      if (isDynamic) {
        skipCount++;
        statusBadge = '🟡 动态跳过';
        statusClass = 'awt-health-status--skip';
        itemClass = 'awt-health-item--skip';
      } else if (isOk) {
        okCount++;
      } else {
        failCount++;
        statusBadge = '🔴 失效';
        statusClass = 'awt-health-status--fail';
        itemClass = 'awt-health-item--fail';
      }

      div.className = `awt-health-item ${itemClass}`;
      div.setAttribute('data-index', item.index);
      div.innerHTML = `
        <div class="awt-health-item__header">
          <span class="awt-health-item__intent">#${item.index + 1} ${item.intent}</span>
          <span class="awt-health-status ${statusClass}">${statusBadge}</span>
        </div>
        <div class="awt-health-item__locator">${item.locator}</div>
      `;
      healthResults.appendChild(div);
    }

    // 摘要
    const summary = document.createElement('div');
    summary.className = 'awt-health-summary';
    const parts = [`🟢 ${okCount} 命中`];
    if (skipCount > 0) parts.push(`🟡 ${skipCount} 动态跳过`);
    parts.push(`🔴 ${failCount} 失效`);
    summary.textContent = `验证完成: ${parts.join(' / ')}`;
    healthResults.prepend(summary);

    statusMsg.textContent = `健检完成: ${okCount} 通过, ${skipCount > 0 ? skipCount + ' 跳过, ' : ''}${failCount} 失效`;

    // 如果有失效项，自动请求 AI 修复
    if (failCount > 0) {
      statusMsg.textContent = `${failCount} 个定位器失效，正在请求 AI 修复...`;
      const failedItems = items
        .filter(i => i.status === 'not_found')
        .map(i => ({
          locator: i.locator,
          intent: i.intent,
          dom_snippet: i.dom_snippet || ''
        }));

      chrome.runtime.sendMessage({
        type: 'HEAL_REQUEST',
        items: failedItems,
        yamlPath: importedYamlPath
      });
    }
  }

  function handleHealResult(msg) {
    const results = msg.results || [];
    healSuggestions = [];

    for (const r of results) {
      if (r.new_locator && r.new_locator !== r.old_locator) {
        healSuggestions.push(r);

        // 在界面上更新对应的失效项，追加修复建议
        const items = healthResults.querySelectorAll('.awt-health-item--fail');
        for (const item of items) {
          const locatorEl = item.querySelector('.awt-health-item__locator');
          if (locatorEl && locatorEl.textContent === r.old_locator) {
            item.className = 'awt-health-item awt-health-item--healing';
            const statusEl = item.querySelector('.awt-health-status');
            if (statusEl) {
              statusEl.className = 'awt-health-status awt-health-status--healed';
              statusEl.textContent = '🔧 已修复';
            }
            // 追加 diff 展示
            const fixDiv = document.createElement('div');
            fixDiv.className = 'awt-health-item__fix';
            fixDiv.innerHTML = `
              <div class="awt-health-item__fix-old">- ${r.old_locator}</div>
              <div class="awt-health-item__fix-new">+ ${r.new_locator}</div>
            `;
            item.appendChild(fixDiv);
            break;
          }
        }
      }
    }

    if (healSuggestions.length > 0) {
      healthActions.style.display = '';
      healthApplyBtn.disabled = false;
      healthApplyBtn.textContent = '✅ 采纳全部修复';
      statusMsg.textContent = `AI 给出 ${healSuggestions.length} 个修复建议，请审核后采纳`;
      showToast(`🔧 AI 给出 ${healSuggestions.length} 个修复建议`);
    } else {
      statusMsg.textContent = 'AI 未能给出有效修复建议';
      showToast('⚠️ AI 未能修复失效的定位器');
    }
  }

  /**
   * 极简 YAML 解析器（仅支持本框架的 YAML 脚本格式，不引入第三方库）
   * 支持解析 name, description, steps 列表，每个 step 包含 action, intent, locator, value, key 等字段
   */
  function parseYamlSimple(yamlText) {
    const result = { steps: [] };
    const lines = yamlText.split('\n');
    let currentStep = null;
    let inSteps = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimEnd();

      // 跳过注释和空行
      if (trimmed.trim().startsWith('#') || trimmed.trim() === '') continue;

      // 顶层字段
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        if (trimmed.startsWith('name:')) {
          result.name = extractYamlValue(trimmed.substring(5));
        } else if (trimmed.startsWith('description:')) {
          result.description = extractYamlValue(trimmed.substring(12));
        } else if (trimmed.startsWith('steps:')) {
          inSteps = true;
        }
        continue;
      }

      if (!inSteps) continue;

      // 步骤列表项（以 "  - " 开头）
      if (trimmed.match(/^\s+-\s+\w+:/)) {
        if (currentStep) result.steps.push(currentStep);
        currentStep = {};
        // 解析同行的 key: value
        const afterDash = trimmed.replace(/^\s+-\s+/, '');
        const colonIdx = afterDash.indexOf(':');
        if (colonIdx > 0) {
          const key = afterDash.substring(0, colonIdx).trim();
          const val = extractYamlValue(afterDash.substring(colonIdx + 1));
          currentStep[key] = val;
        }
      } else if (currentStep && trimmed.match(/^\s+\w+:/)) {
        // 步骤的后续属性行
        const stripped = trimmed.trim();
        const colonIdx = stripped.indexOf(':');
        if (colonIdx > 0) {
          const key = stripped.substring(0, colonIdx).trim();
          const val = extractYamlValue(stripped.substring(colonIdx + 1));
          currentStep[key] = val;
        }
      }
    }

    if (currentStep) result.steps.push(currentStep);
    return result;
  }

  function extractYamlValue(raw) {
    let val = raw.trim();
    // 去除引号包裹
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  }

  // ==================== Phase 4b: AI 探索逻辑 ====================

  // 折叠/展开
  exploreToggleHeader.addEventListener('click', () => {
    const isHidden = exploreBody.style.display === 'none';
    exploreBody.style.display = isHidden ? '' : 'none';
    exploreCollapseIcon.className = isHidden ? 'awt-collapse-icon awt-collapse-icon--open' : 'awt-collapse-icon';
  });

  // 输入框启用按钮
  exploreIntentInput.addEventListener('input', () => {
    exploreStartBtn.disabled = !exploreIntentInput.value.trim() || isExploring;
  });

  // 开始探索
  exploreStartBtn.addEventListener('click', () => {
    const intent = exploreIntentInput.value.trim();
    if (!intent) return;

    // 前置检查 Bridge 连接状态，避免离线时静默超时
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
      if (!status || !status.bridgeConnected) {
        showToast('⚠️ Bridge 未连接，请先启动 Bridge 服务');
        statusMsg.style.color = '#ef4444';
        statusMsg.textContent = '探索需要 Bridge 服务支持，请先启动 bridge_server.py';
        return;
      }

      isExploring = true;
      lastRenderedStepNum = -1;
      exploreStartBtn.disabled = true;
      exploreStopBtn.disabled = false;
      exploreProgress.innerHTML = '';
      statusMsg.style.color = '';
      statusMsg.textContent = '🤖 AI 正在探索: ' + intent;

      // Phase 5: 根据模式选择发送不同的消息类型
      const isVisualMode = exploreModeVisual && exploreModeVisual.checked;
      if (isVisualMode) {
        isVisualExploring = true;
        lastVisualStepNum = -1;
        chrome.runtime.sendMessage({
          type: 'EXPLORE_VISUAL_START',
          intent_text: intent,
          max_steps: 10
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'EXPLORE_START',
          intent_text: intent,
          max_steps: 10
        });
      }
    });
  });

  // 停止探索
  exploreStopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXPLORE_STOP' });
    exploreStopBtn.disabled = true;
    statusMsg.textContent = '正在停止探索...';
  });

  function renderExploreStep(msg) {
    // 严格防重：如果同一步骤已经渲染过，跳过
    if (typeof msg.step_num === 'number' && msg.step_num === lastRenderedStepNum) {
      return;
    }
    lastRenderedStepNum = msg.step_num;

    const div = document.createElement('div');
    div.className = 'awt-explore-step';
    div.innerHTML = `
      <div class="awt-explore-step__action">Step ${msg.step_num}/${msg.max_steps}: ${msg.action} ${msg.ref || ''}</div>
      <div class="awt-explore-step__think">${msg.think || ''}</div>
    `;
    exploreProgress.appendChild(div);
    exploreProgress.scrollTop = exploreProgress.scrollHeight;
  }

  function handleExploreComplete(msg) {
    isExploring = false;
    exploreStartBtn.disabled = !exploreIntentInput.value.trim();
    exploreStopBtn.disabled = true;

    const div = document.createElement('div');
    div.className = 'awt-explore-step ' + (msg.success ? 'awt-explore-step--done' : 'awt-explore-step--error');
    div.innerHTML = `<div class="awt-explore-step__action">${msg.success ? '✅ 探索完成' : '⚠️ 探索结束'}: ${msg.reason || ''}</div>`;
    exploreProgress.appendChild(div);

    statusMsg.textContent = msg.success ? '🤖 AI 探索完成！步骤已追加到录制列表' : '探索结束: ' + (msg.reason || '');
    if (msg.success) showToast('🤖 AI 探索完成！');

    // 刷新步骤列表
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
      if (res) updateUI(res);
    });
  }

  function handleExploreSolidified(msg) {
    if (msg.success) {
      const div = document.createElement('div');
      div.className = 'awt-explore-step awt-explore-step--done';
      div.innerHTML = `<div class="awt-explore-step__action">💾 步骤已自动固化为 YAML 组件: <b>${msg.componentName}</b> (${msg.totalSteps} 步)</div>`;
      exploreProgress.appendChild(div);
      exploreProgress.scrollTop = exploreProgress.scrollHeight;
      showToast(`🎉 已固化为组件: ${msg.componentName}`);
      statusMsg.textContent = `已固化为 YAML 组件: ${msg.componentName}`;
    }
  }

  // ==================== Phase 5: 视觉探索函数 ====================

  // 模式切换提示文本
  if (exploreModeText) {
    exploreModeText.addEventListener('change', () => {
      if (exploreModeHint) exploreModeHint.textContent = '快速 · 低成本 · DOM 感知';
    });
  }
  if (exploreModeVisual) {
    exploreModeVisual.addEventListener('change', () => {
      if (exploreModeHint) exploreModeHint.textContent = '强感知 · 支持 Canvas/图标 · 需 Midscene 扩展';
    });
  }

  function renderVisualExploreStep(msg) {
    // 防重: 同一 step_num 不重复渲染
    if (typeof msg.step_num === 'number' && msg.step_num === lastVisualStepNum) {
      return;
    }
    lastVisualStepNum = msg.step_num;

    const div = document.createElement('div');
    div.className = 'awt-explore-step';
    div.innerHTML = `
      <div class="awt-explore-step__action">👁️ Step ${msg.step_num}: ${msg.action || ''}</div>
      <div class="awt-explore-step__think">${msg.think || ''}</div>
    `;
    exploreProgress.appendChild(div);
    exploreProgress.scrollTop = exploreProgress.scrollHeight;
  }

  function handleVisualExploreComplete(msg) {
    isExploring = false;
    isVisualExploring = false;
    exploreStartBtn.disabled = !exploreIntentInput.value.trim();
    exploreStopBtn.disabled = true;

    const div = document.createElement('div');
    div.className = 'awt-explore-step ' + (msg.success ? 'awt-explore-step--done' : 'awt-explore-step--error');
    div.innerHTML = `<div class="awt-explore-step__action">${msg.success ? '✅ 视觉探索完成' : '⚠️ 视觉探索结束'}: ${msg.reason || ''} (${msg.total_steps || 0} 步)</div>`;
    exploreProgress.appendChild(div);

    statusMsg.style.color = msg.success ? '#10b981' : '';
    statusMsg.textContent = msg.success
      ? `👁️ 视觉探索完成！共 ${msg.total_steps || 0} 步`
      : '视觉探索结束: ' + (msg.reason || '');
    if (msg.success) showToast('👁️ 视觉探索完成！');

    // 刷新步骤列表
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
      if (res) updateUI(res);
    });
  }

  function handleVisualExploreError(msg) {
    isExploring = false;
    isVisualExploring = false;
    exploreStartBtn.disabled = !exploreIntentInput.value.trim();
    exploreStopBtn.disabled = true;

    const div = document.createElement('div');
    div.className = 'awt-explore-step awt-explore-step--error';
    div.innerHTML = `<div class="awt-explore-step__action">❌ 视觉探索异常: ${msg.message || ''}</div>`;
    exploreProgress.appendChild(div);

    statusMsg.style.color = '#ef4444';
    statusMsg.textContent = '视觉探索异常: ' + (msg.message || '');
    showToast('❌ ' + (msg.message || '视觉探索异常'));
  }
});





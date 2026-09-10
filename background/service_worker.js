/**
 * awt-recorder/background/service_worker.js
 * Background Service Worker (Phase 3 智能增强版 - 支持多 Frame 动态保活与按键捕获)
 */

importScripts('../config/default_config.js');
importScripts('../adapters/base_adapter.js');
importScripts('../adapters/generic.js');
importScripts('../adapters/ant_design.js');
importScripts('../adapters/element_ui.js');

let isRecording = false;
let recordedSteps = [];
let globalStepSeq = 0;
let wsClient = null;
let isWsConnected = false;
let reconnectTimer = null;
let reconnectDelay = 1000;
let heartbeatInterval = null;

function getGlobalStatus() {
  return {
    isRecording: isRecording,
    stepCount: recordedSteps.length,
    steps: recordedSteps,
    bridgeConnected: isWsConnected
  };
}

// 初始化 SidePanel 点击行为
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AWT SW] AWT Recorder v0.5.0 已安装');
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(err => {
      console.warn('[AWT SW] 设置 SidePanel 失败:', err);
    });
  }
  initWebSocket();
});

// 监听扩展启动
chrome.runtime.onStartup.addListener(() => {
  initWebSocket();
});

// ---------------- 跨 Frame / 动态 Iframe 录制生命周期保活 ----------------

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
  chrome.webNavigation.onCompleted.addListener((details) => {
    if (isRecording) {
      chrome.tabs.sendMessage(details.tabId, { type: 'START_RECORDING' }, { frameId: details.frameId }).catch(() => {});
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (isRecording && changeInfo.status === 'complete') {
    broadcastRecordingState(true);
  }
});

// ---------------- WebSocket 通信层 ----------------

async function initWebSocket() {
  const config = await ConfigManager.load();
  if (config.bridge?.protocol !== 'websocket') {
    return;
  }

  const wsUrl = config.bridge?.url || 'ws://127.0.0.1:8766';

  if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    console.log(`[AWT SW] 正在连接 WebSocket Bridge: ${wsUrl}`);
    wsClient = new WebSocket(wsUrl);

    wsClient.onopen = () => {
      console.log('[AWT SW] WebSocket 连接建立成功');
      isWsConnected = true;
      reenableHeartbeat();
      reconnectDelay = 1000;
      notifyUIState();
    };

    wsClient.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'PONG') {
          return;
        }
        if (msg.type === 'TRANSLATE_RESULT') {
          notifySidePanel({
            type: 'TRANSLATE_COMPLETED',
            success: msg.success,
            message: msg.message,
            yamlPath: msg.yamlPath
          });
        }
        if (msg.type === 'HEAL_RESULT') {
          notifySidePanel({
            type: 'HEAL_RESULT',
            results: msg.results
          });
        }
        if (msg.type === 'APPLY_RESULT') {
          notifySidePanel({
            type: 'APPLY_RESULT',
            success: msg.success,
            message: msg.message
          });
        }
        if (msg.type === 'EXPLORE_LLM_RESPONSE') {
          // 将 LLM 决策转发到 Content Script
          broadcastToTabs({
            type: 'EXPLORE_LLM_RESPONSE',
            action: msg.action,
            ref: msg.ref,
            value: msg.value,
            think: msg.think
          });
        }
        if (msg.type === 'EXPLORE_SOLIDIFIED') {
          notifySidePanel({
            type: 'EXPLORE_SOLIDIFIED',
            success: msg.success,
            yamlPath: msg.yamlPath,
            componentName: msg.componentName,
            totalSteps: msg.totalSteps
          });
        }
        // Phase 5: 视觉探索 — 来自 Bridge 的消息直接转发到 Side Panel
        if (msg.type === 'EXPLORE_VISUAL_PROGRESS') {
          notifySidePanel(msg);
        }
        if (msg.type === 'EXPLORE_VISUAL_COMPLETE') {
          notifySidePanel(msg);
        }
        if (msg.type === 'EXPLORE_VISUAL_ERROR') {
          notifySidePanel(msg);
        }
        if (msg.type === 'EXPLORE_VISUAL_SOLIDIFIED') {
          notifySidePanel(msg);
        }
      } catch (e) {
        console.warn('[AWT SW] 解析 WS 消息异常:', e);
      }
    };

    wsClient.onclose = () => {
      console.log('[AWT SW] WebSocket 连接已断开');
      isWsConnected = false;
      stopHeartbeat();
      notifyUIState();
      scheduleReconnect();
    };

    wsClient.onerror = (err) => {
      console.warn('[AWT SW] WebSocket 出错:', err);
      wsClient.close();
    };
  } catch (err) {
    console.warn('[AWT SW] 初始化 WebSocket 异常:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    initWebSocket();
  }, reconnectDelay);
}

function reenableHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({ type: 'PING' }));
    }
  }, 20000); // 20 秒心跳保活
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ---------------- 消息总线路由 ----------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse(getGlobalStatus());
    return true;
  }

  if (msg.type === 'TOGGLE_RECORDING') {
    isRecording = !isRecording;
    if (isRecording) {
      recordedSteps = [];
      globalStepSeq = 0;
      broadcastRecordingState(true);
    } else {
      broadcastRecordingState(false);
    }
    notifyUIState();
    sendResponse(getGlobalStatus());
    return true;
  }

  if (msg.type === 'ELEMENT_HOVER') {
    notifySidePanel({
      type: 'PREVIEW_LOCATOR',
      hoverData: msg.data
    });
    return false;
  }

  if (msg.type === 'RECORDED_EVENT') {
    if (!isRecording) return false;

    globalStepSeq++;
    const stepData = msg.data;
    stepData.globalSeq = globalStepSeq;
    const isFrame = (typeof sender.frameId === 'number' && sender.frameId > 0) || stepData.isInIframe;
    stepData.isInIframe = isFrame;
    stepData.frameId = sender.frameId || 0;

    // 事件合并判定
    const lastStep = recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : null;
    let merged = false;

    if (lastStep) {
      const adapter = getAdapterByName(stepData.context?.detectedFramework);
      if (adapter && typeof adapter.shouldMergeEvents === 'function') {
        const mergeResult = adapter.shouldMergeEvents(lastStep, stepData);
        if (mergeResult && mergeResult.merge) {
          recordedSteps[recordedSteps.length - 1] = mergeResult.mergedStep;
          merged = true;
          notifyStepReplaced(mergeResult.mergedStep, recordedSteps.length - 1);
        }
      }
    }

    if (!merged) {
      recordedSteps.push(stepData);
      notifyStepAdded(stepData);
    }

    return false;
  }

  if (msg.type === 'UPDATE_STEP') {
    const { index, intent, value } = msg;
    if (index >= 0 && index < recordedSteps.length) {
      if (intent !== undefined) recordedSteps[index].intent = intent;
      if (value !== undefined) recordedSteps[index].value = value;
      notifyUIState();
      sendResponse({ success: true, ...getGlobalStatus() });
    }
    return true;
  }

  if (msg.type === 'MOVE_STEP') {
    const { fromIndex, toIndex } = msg;
    if (fromIndex >= 0 && fromIndex < recordedSteps.length && toIndex >= 0 && toIndex < recordedSteps.length) {
      const [moved] = recordedSteps.splice(fromIndex, 1);
      recordedSteps.splice(toIndex, 0, moved);
      recordedSteps.forEach((s, i) => s.globalSeq = i + 1);
      notifyUIState();
      sendResponse({ success: true, ...getGlobalStatus() });
    }
    return true;
  }

  if (msg.type === 'DELETE_STEP') {
    const idx = msg.index;
    if (idx >= 0 && idx < recordedSteps.length) {
      recordedSteps.splice(idx, 1);
      recordedSteps.forEach((s, i) => s.globalSeq = i + 1);
      globalStepSeq = recordedSteps.length;
      notifyUIState();
      sendResponse({ success: true, ...getGlobalStatus() });
    }
    return true;
  }

  if (msg.type === 'CLEAR_STEPS') {
    recordedSteps = [];
    globalStepSeq = 0;
    broadcastToTabs({ type: 'CLEAR_HIGHLIGHTS' });
    notifyUIState();
    sendResponse({ success: true, ...getGlobalStatus() });
    return true;
  }

  if (msg.type === 'SEND_TO_BRIDGE') {
    handleSendToBridge(sendResponse);
    return true;
  }

  if (msg.type === 'RECONNECT_WS') {
    initWebSocket();
    sendResponse({ status: 'reconnecting', ...getGlobalStatus() });
    return true;
  }

  // Phase 4a: 定位器健检 — 向当前 Tab 的 Content Script 发送验证请求
  if (msg.type === 'HEALTH_CHECK_REQUEST') {
    handleHealthCheck(msg, sendResponse);
    return true;
  }

  // Phase 4a: AI 修复请求 — 转发到 Bridge
  if (msg.type === 'HEAL_REQUEST') {
    sendToBridge({
      type: 'HEAL_REQUEST',
      items: msg.items,
      yamlPath: msg.yamlPath
    });
    return false;
  }

  // Phase 4a: 采纳修复 — 转发到 Bridge
  if (msg.type === 'APPLY_HEALS') {
    sendToBridge({
      type: 'APPLY_HEALS',
      yamlPath: msg.yamlPath,
      repairs: msg.repairs
    });
    return false;
  }

  // Phase 4b: 探索开始 — 向当前激活页面发送启动探索指令
  if (msg.type === 'EXPLORE_START') {
    getActiveWebTab().then(tab => {
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'BEGIN_EXPLORE',
          intent_text: msg.intent_text,
          max_steps: msg.max_steps || 10
        }).catch(err => {
          console.warn('[AWT SW] 发送 BEGIN_EXPLORE 异常:', err);
        });
      } else {
        console.warn('[AWT SW] 未找到待测页面的活动 Tab');
      }
    });
    return false;
  }

  // Phase 4b: 探索停止 — 转发到 Content Script
  if (msg.type === 'EXPLORE_STOP') {
    broadcastToTabs({ type: 'EXPLORE_STOP' });
    return false;
  }

  // Phase 4b: 探索 LLM 请求 — 转发到 Bridge
  if (msg.type === 'EXPLORE_LLM_REQUEST') {
    sendToBridge({
      type: 'EXPLORE_LLM_REQUEST',
      intent_text: msg.intent_text,
      dom_snapshot: msg.dom_snapshot,
      history: msg.history
    });
    return false;
  }

  // Phase 4b: 探索进度 — panel.js 已通过 content script 直接接收，无需 service_worker 二次转发（避免重复渲染）
  if (msg.type === 'EXPLORE_STEP_PROGRESS') {
    return false;
  }

  // Phase 4b: 探索完成 — 自动通知 Bridge 将步骤固化为 YAML 组件（panel.js 已直接接收 complete 消息）
  if (msg.type === 'EXPLORE_COMPLETE') {
    if (msg.success && msg.generatedSteps && msg.generatedSteps.length > 0) {
      sendToBridge({
        type: 'EXPLORE_SOLIDIFY_REQUEST',
        intent: msg.intent || 'ai_explore',
        steps: msg.generatedSteps
      });
    }
    return false;
  }

  // Phase 5: 视觉探索开始 — 转发到 Bridge（由 Bridge 启动 Node.js 子进程）
  if (msg.type === 'EXPLORE_VISUAL_START') {
    sendToBridge({
      type: 'EXPLORE_VISUAL_START',
      intent_text: msg.intent_text,
      max_steps: msg.max_steps || 10
    });
    return false;
  }

  // Phase 5: 视觉探索停止
  if (msg.type === 'EXPLORE_VISUAL_STOP') {
    sendToBridge({ type: 'EXPLORE_VISUAL_STOP' });
    return false;
  }

  return false;
});

/**
 * 健壮获取当前待测页面的活动 Tab (解决 Side Panel 焦点导致 currentWindow: true 查空问题)
 */
async function getActiveWebTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url && !tabs[0].url.startsWith('chrome-extension://')) {
      return tabs[0];
    }
  } catch (e) {}

  try {
    const allActive = await chrome.tabs.query({ active: true });
    if (allActive && allActive.length > 0) {
      const webTab = allActive.find(t => t.url && !t.url.startsWith('chrome-extension://'));
      if (webTab) return webTab;
      return allActive[0];
    }
  } catch (e) {}

  return null;
}

function getAdapterByName(name) {
  if (name === 'element-ui') return ElementUIAdapter;
  if (name === 'ant-design') return AntDesignAdapter;
  return GenericAdapter;
}

async function broadcastRecordingState(start) {
  const type = start ? 'START_RECORDING' : 'STOP_RECORDING';
  broadcastToTabs({ type: type });
}

async function broadcastToTabs(payload) {
  const tab = await getActiveWebTab();
  if (!tab) return;

  try {
    chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
  } catch (e) {}

  // 跨 Frame 深度分发广播
  if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
    try {
      chrome.webNavigation.getAllFrames({ tabId: tab.id }, (frames) => {
        if (chrome.runtime.lastError || !frames) return;
        if (Array.isArray(frames)) {
          frames.forEach(f => {
            if (f.frameId > 0) {
              chrome.tabs.sendMessage(tab.id, payload, { frameId: f.frameId }).catch(() => {});
            }
          });
        }
      });
    } catch (e) {}
  }
}

function notifyUIState() {
  notifySidePanel({
    type: 'STATUS_UPDATE',
    ...getGlobalStatus()
  });
}

function notifyStepAdded(step) {
  notifySidePanel({
    type: 'STEP_ADDED',
    step: step,
    totalSteps: recordedSteps.length
  });
}

function notifyStepReplaced(step, index) {
  notifySidePanel({
    type: 'STEP_REPLACED',
    step: step,
    index: index,
    totalSteps: recordedSteps.length
  });
}

function notifySidePanel(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function handleSendToBridge(sendResponse) {
  const config = await ConfigManager.load();
  const payload = {
    type: 'RECORDING_COMPLETE',
    steps: recordedSteps,
    metadata: {
      pluginVersion: chrome.runtime.getManifest().version,
      recordedAt: new Date().toISOString(),
      detectedFramework: recordedSteps[0]?.context?.detectedFramework || 'generic',
      totalSteps: recordedSteps.length,
      config: {
        testIdAttribute: config.recording?.testIdAttribute || 'data-testid'
      }
    }
  };

  // 1. 优先通过 WebSocket 发送
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    try {
      wsClient.send(JSON.stringify(payload));
      sendResponse({ success: true, message: `已通过 WebSocket 提交 ${recordedSteps.length} 步录制数据` });
      return;
    } catch (e) {
      console.warn('[AWT SW] WS 发送失败，尝试 HTTP 降级:', e);
    }
  }

  // 2. HTTP 降级通道
  const httpUrl = config.bridge?.httpFallbackUrl || 'http://127.0.0.1:8766';
  try {
    const res = await fetch(`${httpUrl}/api/recording`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      sendResponse({ success: true, message: `已通过 HTTP 降级通道发送成功`, data });
    } else {
      sendResponse({ success: false, message: `Bridge 返回异常: HTTP ${res.status}` });
    }
  } catch (err) {
    sendResponse({ success: false, message: `发送失败，请确认 Bridge 服务已启动: ${err.message}` });
  }
}

// Phase 4a: 定位器健检 — 向 Content Script 发送验证请求并汇总结果
async function handleHealthCheck(msg, sendResponse) {
  const tab = await getActiveWebTab();
  if (!tab) {
    console.warn('[AWT SW] 健检未找到待测页面 Tab');
    sendResponse({ results: (msg.steps || []).map(s => ({ index: s.index, locator: s.locator, intent: s.intent, status: 'not_found', dom_snippet: '' })) });
    return;
  }

  const tabId = tab.id;
  const locators = (msg.steps || []).map(s => ({
    index: s.index,
    locator: s.locator,
    intent: s.intent
  }));

  try {
    chrome.tabs.sendMessage(tabId, {
      type: 'CHECK_LOCATORS',
      locators: locators
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[AWT SW] 健检请求通信异常:', chrome.runtime.lastError.message);
      }
      const results = response?.results || [];
      if (results.length > 0) {
        sendResponse({ results: results });
      } else {
        sendResponse({ results: locators.map(l => ({ ...l, status: 'not_found', dom_snippet: '' })) });
      }
    });
  } catch (e) {
    sendResponse({ results: locators.map(l => ({ ...l, status: 'not_found', dom_snippet: '' })) });
  }
}

// Phase 4a: 通用 Bridge 发送（WebSocket 优先，无降级）
function sendToBridge(payload) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    try {
      wsClient.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('[AWT SW] Bridge 发送失败:', e);
    }
  } else {
    console.warn('[AWT SW] Bridge 未连接，无法发送:', payload.type);
  }
}



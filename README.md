# AWT 录制助手 (AWT Recorder)

专为 AWT 自动化测试框架量身打造的通用浏览器辅助录制插件。支持实时 DOM 语义提取、组件级定位器智能生成、Shadow DOM 隔离高亮探测、键盘按键监听、**定位器全量健检 (Healer)** 与 **双模式 AI 智能探索 (DOM 文本探索 + Midscene 视觉探索)** 及 LLM 智能转译。

---

## 一、功能特性全景

| 模块 | 核心特性 | 交付阶段 |
|---|---|:---:|
| **常驻侧边栏 (Side Panel)** | MV3 `sidePanel` 常驻展开，页面跳转/刷新不中断，支持步骤卡片实时流展示 | Phase 2 |
| **实时定位器探测** | 悬停页面元素时，顶部探测卡片根据优先级策略实时计算展示最优 Playwright 定位器与备选定位器 | Phase 3 |
| **隔离式页面高亮** | 基于 **Shadow DOM** 的高亮遮罩（蓝色悬停虚线框 + 绿色已录制序号实线框），`pointer-events: none` 零侵入原生排版与交互 | Phase 3 |
| **键盘操作感知** | 自动捕获 `Tab`（焦点切换）、`Delete`（清空）、`Enter`（回车提交）、`Escape`、方向键等控制按键为 `press` 动作 | Phase 3 优化 |
| **多 Frame 动态保活** | 监听 `webNavigation`，动态弹出的新 iframe / frame 自动激活录制，跨 frame 操作精准捕获 | Phase 3.1 |
| **定位器健检 (Healer)** | 支持一键导入已有 YAML 测试脚本，在当前真实 DOM 批量验证定位器命中率，失效项自动唤起 AI Healer 并支持**一键采纳回写修复** | Phase 4a |
| **前端 Agent 探索 (Explorer)** | 自然语言意图驱动的前端自主 Agent，基于极简 DOM 快照与 LLM 决策在浏览器中自动执行操作并产出录制步骤 | Phase 4b |
| **Midscene 视觉探索 (Visual Explorer)** | 集成 Midscene.js Bridge Mode，依托视觉多模态大模型与屏幕截图，突破 Canvas、图标按钮与无文本交互盲区，步骤自动固化为 YAML 组件 | Phase 5 🆕 |
| **操作复合自动合并** | `ElementUIAdapter` / `AntDesignAdapter` 自动将下拉框的「展开 + 点击选项」合并为单一 `select_option` 复合操作 | Phase 2 |
| **行内微调与参数化** | 步骤卡片支持**双击修改意图**（如改为“点击查询按钮”）与**双击参数占位符化**（如替换为 `${username}`） | Phase 3 |
| **双向长连接通信** | 与本地 `bridge_server.py` 保持 WebSocket 长连接，具备 20s 心跳保活与指数退避自动重连，支持 HTTP 自动降级 | Phase 2 |
| **多项目预设与设置** | 选项页（⚙️）内置「AWT 稽核系统 (Element UI)」、「通用原生 HTML」、「Ant Design」三套预设，支持快速自定义 | Phase 2 |
| **多渠道快捷导出** | 支持 WebSocket 发送转译、本地 JSON 文件下载、**一键复制剪贴板**（带 Toast 浮层提醒） | Phase 3 |

---

## 二、架构设计与技术栈约束

1. **纯 Vanilla JS 核心**：录制插件核心零打包构建工具、无需在浏览器端打包，轻量稳定。
2. **MV3 规范**：严格遵循 Chrome Manifest V3，采用 Background Service Worker + Content Script + Side Panel 通信模型。
3. **可插拔适配器模式**：所有组件特征与 DOM 语义提取均隔离在 `adapters/` 中，框架与适配器解耦。
4. **双探索引擎并存**：
   - **文本模式 (Phase 4b)**：纯前端 DOM 快照 + LLM 文本决策，快速、轻量、低 Token 成本；
   - **视觉模式 (Phase 5)**：通过 Bridge 调用 Node.js 端 `@midscene/web` (Bridge Mode) 连接 Chrome，屏幕截图 + 多模态大模型，感知力强，支持 Canvas、图标及复杂富交互。
5. **安全合规**：密码输入框（`type="password"`）强制脱敏为 `"***"`，禁止向非 `127.0.0.1` 发送录制数据。

---

## 三、快速开始与使用流程

### 1. 加载插件到浏览器
1. 打开 Microsoft Edge 或 Google Chrome，访问扩展管理页面：
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
2. 开启右上角的 **「开发者模式 (Developer Mode)」**。
3. 点击 **「加载已解包的扩展程序 (Load unpacked)」**，选择目录：
   `C:\9Codes\awt\awt-recorder`
4. 确认扩展列表中出现「AWT 录制助手 v0.5.0」。

### 2. 启动本地 Bridge 服务
在测试框架终端中运行：
```powershell
python c:\9Codes\awt\ai_automation_framework\tools\bridge_server.py
```
控制台将输出：
`[Bridge] 🚀 WebSocket 桥接服务启动就绪: ws://127.0.0.1:8766`

### 3. 常规录制流程
1. 在浏览器工具栏点击插件图标打开 **Side Panel**。
2. 检查右上角 Badge 状态为绿色的 **「Bridge 在线」**。
3. 点击 **「开始录制」**：
   - 鼠标滑动时实时预览定位器，页面操作实时被记录为步骤卡片。
   - 双击步骤文字可编辑意图，双击值可参数化为 `${var_name}`。
   - 录制完成后点击 **「🚀 发送转译」** 自动生成标准 YAML 测试脚本。

### 4. 定位器全量健检 (Healer) 使用流程
1. 打开被测系统目标页面。
2. 在 Side Panel 控制区点击 **「📂 导入脚本」**，选择需要体检的 YAML 文件。
3. 点击 **「🩺 健检」** 按钮：
   - 插件将逐条在当前 DOM 中执行匹配验证，展示 🟢 命中 / 🔴 失效。
   - 失效的定位器自动连同操作意图和页面快照发送至后端 **AI Healer**。
   - 面板展示 diff 修复建议（如 `- #old-btn` / `+ #new-active-btn`）。
4. 确认无误后点击 **「✅ 采纳全部修复」**，修复内容将直接持久化反写到原 YAML 文件！

### 5. AI 智能探索 (Explorer) 双模式使用流程

点击展开 Side Panel 底部的 **「🤖 AI 探索」** 折叠区。

#### 模式一：🔤 文本模式（默认，极速低成本）
适用于常规 Web 页面，表单、按钮、文字链接齐全的场景。
1. 在模式切换栏选中 **「🔤 文本模式」**（右侧提示：“快速 · 低成本 · DOM 感知”）；
2. 输入自然语言操作意图（例如：`点击系统管理菜单，进入角色管理页面`）；
3. 点击 **「▶ 开始探索」**：
   - Content Script 实时截取极简 DOM 快照经 Bridge 发送给 LLM 决策；
   - 自动在页面执行点击或录入，面板实时显示每一步思考与动作；
   - 探索完成后，步骤追加到录制列表中，并自动固化为 YAML 组件；
4. 点击 **「⏹ 停止」** 可随时中断探索。

#### 模式二：👁️ 视觉模式（Phase 5 🆕，Midscene.js 视觉增强）
适用于 **Canvas 绘图、SVG 无文字图标按钮、富文本编辑器、拖拽控件** 等纯 DOM 快照难以识别的复杂界面。

**前置准备（首次使用）**：
1. **安装 Node.js**（≥ 18，可在终端运行 `winget install OpenJS.NodeJS.LTS`）；
2. **安装 Midscene 依赖**：
   ```powershell
   cd c:\9Codes\awt\ai_automation_framework\tools
   npm install
   ```
3. **安装 Midscene 官方扩展**：在 Chrome Web Store 安装免费扩展 [Midscene](https://chromewebstore.google.com/detail/midscene/gbldofcpkknbggpkmbdaefngejllnief)；
4. **配置视觉多模态大模型**（支持 GPT-4o、Qwen-VL、Doubao 等）：
   - 可直接复用现有环境变量：`$env:OPENAI_API_KEY`、`$env:OPENAI_BASE_URL`；
   - 或单独为 Midscene 指定配置：
     ```powershell
     $env:MIDSCENE_MODEL_NAME="qwen-vl-max"  # 或 doubao-seed, gpt-4o 等
     $env:MIDSCENE_MODEL_API_KEY="sk-xxx"
     $env:MIDSCENE_MODEL_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
     ```

**使用流程**：
1. 在探索区单选切换为 **「👁️ 视觉模式」**（右侧提示：“强感知 · 支持 Canvas/图标 · 需 Midscene 扩展”）；
2. 输入探索意图（例如：`点击顶部导航栏中的放大镜图标，在弹出框中输入测试并回车`）；
3. 点击 **「▶ 开始探索」**：
   - Bridge 服务自动启动 Midscene Runner 子进程；
   - Midscene 通过 Bridge 协议连接当前 Chrome 标签页，全屏截图并交由视觉模型感知分析；
   - 实时流式回传 `👁️ Step N: ...` 与详细思考；
   - 探索成功后自动调用 `create_skill` 固化生成 YAML 操作组件；
4. 若系统未安装 Node.js 或未安装 npm 包，面板将显示清晰的错误排查指引，且不会影响任何其他功能。

---

## 四、如何开发自定义 UI 框架适配器

为新 UI 框架（例如 Naive UI、Vuetify、TDesign 等）添加适配支持仅需 3 步：

### 第 1 步：新建适配器文件
在 `adapters/` 目录下创建 `your_framework.js`，继承 `BaseAdapter`：

```javascript
class YourFrameworkAdapter extends BaseAdapter {
  static get name() {
    return 'your-framework';
  }

  static get displayName() {
    return 'Your Framework';
  }

  // 1. 自动检测当前页面是否使用了该 UI 框架
  static detect() {
    return !!document.querySelector('.your-prefix-form, [class*="your-prefix-"]');
  }

  // 2. 映射组件类型为标准通用类型 (select / date-picker / table / dialog / button / input / checkbox / radio)
  static detectComponentType(el) {
    if (el.closest('.your-prefix-select')) return 'select';
    if (el.closest('.your-prefix-picker')) return 'date-picker';
    if (el.closest('.your-prefix-table')) return 'table';
    if (el.closest('.your-prefix-modal')) return 'dialog';
    if (el.matches('.your-prefix-btn, .your-prefix-btn *')) return 'button';
    if (el.closest('.your-prefix-input')) return 'input';
    return 'unknown';
  }

  // 3. 提取所属表单项 Label
  static getFormItemLabel(el) {
    const item = el.closest('.your-prefix-form-item');
    if (!item) return null;
    const label = item.querySelector('.your-prefix-form-label');
    return label ? { text: label.textContent.trim(), forAttr: label.getAttribute('for') } : null;
  }

  // 4. 提取所属弹窗标题
  static getDialogContext(el) {
    const dialog = el.closest('.your-prefix-modal');
    if (!dialog) return null;
    const title = dialog.querySelector('.your-prefix-modal-title')?.textContent?.trim();
    return title ? { title, ariaLabel: null } : null;
  }

  // 5. 提取表格固定列信息
  static getTableFixedInfo(el) {
    return { hasFixedRight: false, hasFixedLeft: false };
  }

  // 6. 复合操作合并 (如 select 展开 + 选项点击)
  static shouldMergeEvents(prevStep, currStep) {
    return null;
  }
}
```

### 第 2 步：注册适配器
在 `content/dom_utils.js` 的 `AWT_ADAPTER_REGISTRY` 数组中引入：
```javascript
const AWT_ADAPTER_REGISTRY = [
  ElementUIAdapter,
  AntDesignAdapter,
  YourFrameworkAdapter, // 🆕 新增
  GenericAdapter        // 永远在最后作为兜底
];
```

并在 `background/service_worker.js` 的 `getAdapterByName` 中补充映射：
```javascript
function getAdapterByName(name) {
  if (name === 'element-ui') return ElementUIAdapter;
  if (name === 'ant-design') return AntDesignAdapter;
  if (name === 'your-framework') return YourFrameworkAdapter;
  return GenericAdapter;
}
```

### 第 3 步：更新 `manifest.json` 与 `service_worker.js`
在 `manifest.json` 的 `content_scripts.js` 中按顺序加入 `"adapters/your_framework.js"`：
```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": [
      "config/default_config.js",
      "adapters/base_adapter.js",
      "adapters/generic.js",
      "adapters/ant_design.js",
      "adapters/your_framework.js",
      "adapters/element_ui.js",
      "content/dom_utils.js",
      "content/highlight.js",
      "content/recorder.js",
      "content/health_checker.js",
      "content/explorer_agent.js"
    ]
  }
]
```
在 `background/service_worker.js` 头部添加：
```javascript
importScripts('../adapters/your_framework.js');
```

---

## 五、常见问题排查 (FAQ)

1. **右上角显示「Bridge 离线」怎么办？**
   - 确认本地终端已运行 `python tools/bridge_server.py`；
   - 点击侧边栏右上角红色的「Bridge 离线」Badge，插件将立即触发重连；
   - 若修改了服务端口，点击 ⚙️ 设置图标，在配置页修改端口并保存。
2. **页面更新了代码或插件修改后如何生效？**
   - 在扩展管理页（`edge://extensions`）点击插件卡片上的 **「刷新 / 重新加载」** 按钮；
   - 刷新待测网页，重新打开 Side Panel 即可。
3. **定位器健检提示失效但实际存在怎么办？**
   - 确认当前浏览器是否停留在与脚本步骤对应的目标页面；
   - 若是 iframe 内嵌页面，请确保 iframe 已经完全加载渲染。

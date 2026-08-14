# AWT 录制助手 (AWT Recorder)

专为 AWT 自动化测试框架量身打造的通用浏览器辅助录制插件。支持实时 DOM 语义提取、组件级定位器智能生成、Shadow DOM 隔离高亮探测、键盘按键监听与 LLM 智能转译。

---

## 一、功能特性全景

| 模块 | 核心特性 | 交付阶段 |
|---|---|:---:|
| **常驻侧边栏 (Side Panel)** | MV3 `sidePanel` 常驻展开，页面跳转/刷新不中断，支持步骤卡片实时流展示 | Phase 2 |
| **实时定位器探测** | 悬停页面元素时，顶部探测卡片根据优先级策略实时计算展示最优 Playwright 定位器与备选定位器 | Phase 3 |
| **隔离式页面高亮** | 基于 **Shadow DOM** 的高亮遮罩（蓝色悬停虚线框 + 绿色已录制序号实线框），`pointer-events: none` 零侵入原生排版与交互 | Phase 3 |
| **键盘操作感知** | 自动捕获 `Tab`（焦点切换）、`Delete`（清空）、`Enter`（回车提交）、`Escape`、方向键等控制按键为 `press` 动作 | Phase 3 优化 |
| **操作复合自动合并** | `ElementUIAdapter` / `AntDesignAdapter` 自动将下拉框的「展开 + 点击选项」合并为单一 `select_option` 复合操作 | Phase 2 |
| **行内微调与参数化** | 步骤卡片支持**双击修改意图**（如改为“点击查询按钮”）与**双击参数占位符化**（如替换为 `${username}`） | Phase 3 |
| **双向长连接通信** | 与本地 `bridge_server.py` 保持 WebSocket 长连接，具备 20s 心跳保活与指数退避自动重连，支持 HTTP 自动降级 | Phase 2 |
| **多项目预设与设置** | 选项页（⚙️）内置「AWT 稽核系统 (Element UI)」、「通用原生 HTML」、「Ant Design」三套预设，支持快速自定义 | Phase 2 |
| **多渠道快捷导出** | 支持 WebSocket 发送转译、本地 JSON 文件下载、**一键复制剪贴板**（带 Toast 浮层提醒） | Phase 3 |

---

## 二、架构设计与技术栈约束

1. **纯 Vanilla JS**：零 npm 依赖、零打包构建工具、无需 node_modules，所有代码原生手写。
2. **MV3 规范**：严格遵循 Chrome Manifest V3，采用 Background Service Worker + Content Script + Side Panel 通信模型。
3. **可插拔适配器模式**：所有组件特征与 DOM 语义提取均隔离在 `adapters/` 中，框架与适配器解耦。
4. **安全合规**：密码输入框（`type="password"`）强制脱敏为 `"***"`，禁止向非 `127.0.0.1` 发送录制数据。

---

## 三、快速开始与使用流程

### 1. 加载插件到浏览器
1. 打开 Microsoft Edge 或 Google Chrome，访问扩展管理页面：
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
2. 开启右上角的 **「开发者模式 (Developer Mode)」**。
3. 点击 **「加载已解包的扩展程序 (Load unpacked)」**，选择目录：
   `C:\9Codes\awt\awt-recorder`
4. 确认扩展列表中出现「AWT 录制助手 v0.3.0」。

### 2. 启动本地 Bridge 服务
在测试框架终端中运行：
```powershell
python c:\9Codes\awt\ai_automation_framework\tools\bridge_server.py
```
控制台将输出：
`[Bridge] 🚀 WebSocket 桥接服务启动就绪: ws://127.0.0.1:8766`

### 3. 开始录制与操作
1. 在浏览器工具栏点击插件图标，浏览器右侧将自动常驻展开 **Side Panel**。
2. 检查右上角 Badge 状态为绿色的 **「Bridge 在线」**。
3. 点击 **「开始录制」**：
   - 鼠标在页面滑动时，页面元素出现**蓝色虚线框**，侧边栏顶部黑底区域实时显示最优定位器。
   - 正常进行点击、表单输入（支持防抖合并）、下拉框选值（自动合并为 `select_option`）、按键操作（如 `Tab`、`Delete`、`Enter`）。
   - 被操作过的元素将在页面上保留**绿色实线边框与 `#1`、`#2` 序号**。

### 4. 微调与转译
1. **修改意图**：双击步骤文字，可原地修改业务意图描述（如改为 `点击顶部查询按钮`）并回车。
2. **动态变量参数化**：双击填写的具体数值，替换为 `${login_user}` 等动态变量。
3. **调整顺序 / 删除**：点击卡片右侧的 `▲` / `▼` 调整先后顺序，或点击 `×` 删除冗余步骤。
4. **触发转译**：点击 **「🚀 发送转译」**，本地框架将自动调用大模型翻译为符合规范的 YAML 测试脚本。

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
      "content/recorder.js"
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

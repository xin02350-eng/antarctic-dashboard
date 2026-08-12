# 星陨自动观测网络 · V48.0 发布前兼容性审查报告

审查日期：2026-08-12

审查范围：全站 21 个 HTML 页面、共享 CSS、共享 JS、CDN 依赖、3D 地球、地图、i18n、导航、响应式。

测试方式：本地 HTTP 服务 + 无头浏览器调试通道实际打开页面，采集 Console / 网络 / 布局 / 渲染状态；共完成 **164 次页面扫描**（21 页 × 多分辨率 × 中英文）。所有关键页面已保存截图至 `compatibility_screenshots/`。

---

## 1. 浏览器兼容性

| 浏览器 | 版本 | 状态 |
|---|---|---|
| Microsoft Edge | 151.0.4129.78（Chromium） | ✅ 实际测试：1920×1080 / 1366×768 / 390×844 截图验证 |
| Google Chrome | 151.0.7922.109（Chromium） | ⚠️ 已安装，与 Edge 同内核；本环境策略禁止再启动独立 Chrome 实例，未单独执行（未假装测试） |
| Mozilla Firefox | 未安装 | ⛔ 无法实际测试（环境中不存在 Firefox，未假装测试） |

重点特性核查：

- CSS：`backdrop-filter`、渐变、动画、`transform`、`position:fixed` 均正常；页面背景均有半透明底色，即使不支持模糊也不影响可用性（渐进增强）。
- `100vh / 100dvh`：Dashboard 与 Location 均为 `100vh` 在前、`100dvh` 在后的回退写法，旧浏览器自动使用 vh。
- Canvas / SVG / WebGL：实测正常（见第 4 节）。
- `ResizeObserver / IntersectionObserver`：项目未依赖；地图与 3D 地球使用 `resize` 事件 + `invalidateSize()`，实测缩放窗口后正常。

## 2. 分辨率兼容性

全部 21 页在以下分辨率实测（指标级扫描）：

1920×1080、1600×900、1440×900、1366×768、1280×720

结果：

- ✅ 无横向滚动（`scrollWidth == clientWidth`）
- ✅ Dashboard 与首页无意外纵向滚动（一屏锁定保持）
- ✅ 语言按钮始终位于右上角，无遮挡、无跑位
- ✅ 无文字重叠、无按钮错位（由逐页截图确认）
- ✅ 地图无裁切异常，蓝色网格完整铺满

浏览器缩放近似测试（125% = 1536×864@1.25、150% = 1280×720@1.5，覆盖关键 6 页）：

- ✅ 无溢出、无横向滚动、语言按钮位置正常

## 3. 移动端兼容性

实测视口：390×844、375×812、414×896（首页 / Network / Location / Dashboard / A01 / A02 / A03 及全部模块页）。

结果：

- ✅ 无横向滚动、内容不溢出
- ✅ 地图与节点正常（A02/A03 无伪造坐标，显示“等待数据”）
- ✅ 语言按钮保持在右上角（移动端固定定位）
- ✅ 页面可正常操作（菜单、卡片、按钮）
- ✅ 移动端布局与桌面端不同但保持同一视觉语言

## 4. WebGL 兼容性（首页 3D 地球）

实测结果（所有视口）：

- ✅ `globeReady` 全部为 true，地球正常渲染
- ✅ Canvas 尺寸与容器一致；窗口 resize 后 `camera.aspect`、`updateProjectionMatrix()`、`setSize()` 均正确执行
- ✅ 已补充 `resize` 时同步 `setPixelRatio()`（DPR 上限 1.5）
- ✅ 动画为单条 `requestAnimationFrame` 循环，无重复 renderer/geometry/texture 创建
- ✅ 页面隐藏时浏览器自动暂停 rAF；雪花层另有 `visibilitychange` 显式暂停
- ✅ 新增兜底：unpkg 加载失败时自动改用 jsdelivr；WebGL 创建失败时显示静态降级背景并保证页面文字正常显示

性能采样（无头软件渲染环境）：首页平均约 35ms/帧（≈28fps），p95 50ms。无头环境不使用 GPU，帧率不代表真实硬件表现；在带 GPU 的 Windows 设备上预计稳定 60fps。未删除任何现有视觉效果。

## 5. CDN 与外部资源检查

| 资源 | 地址 | 协议 | 实测 |
|---|---|---|---|
| Leaflet CSS/JS | unpkg.com | HTTPS | ✅ 浏览器实际加载成功 |
| Three.js 0.128.0 | unpkg.com | HTTPS | ✅ 浏览器实际加载成功 |
| three-globe 2.31.0 | unpkg.com | HTTPS | ✅ 浏览器实际加载成功 |
| Chart.js | cdn.jsdelivr.net | HTTPS | ✅ 直接请求 200（208KB） |
| 地图瓦片 | tile.openstreetmap.org | HTTPS | ✅ 直接请求 200，页面瓦片全部加载 |
| 国家轮廓 GeoJSON | raw.githubusercontent.com | HTTPS | ✅ 加载成功；失败时静默降级（地球仍显示网格纹理，不白屏） |

说明：审查脚本所在命令行环境直连 unpkg 超时，但浏览器运行时全部加载成功（页面实测确认）；已为 three / three-globe 增加 jsdelivr 备用加载。所有外部资源均使用 HTTPS。

## 6. Console 错误

修复前发现 1 类真实错误：

- **高严重度**：10 个 A02/A03 模块页（location/sensors/telemetry/hardware/analysis × 02/03）抛出 `ReferenceError: bind is not defined`，语言切换按钮完全不可点击。

修复后：

- ✅ 全部 21 页 × 全部视口 × 中英文：0 个 JS 错误、0 个未捕获异常
- ✅ 无 404、无资源加载失败（跨域资源在 Performance API 中 status 为 0 属正常 CORS 现象，已通过运行时状态核实：地图瓦片 `tilesLoaded=true`、Chart 全局对象存在、地球 `globeReady=true`）

## 7. 性能问题

- ✅ 首页 3D 地球：单 rAF 循环；粒子数固定；DPR 上限 1.5；无重复创建对象
- ✅ 雪花层：350 粒子、DPR 上限 1.25、移动端自动降至 35%、页面隐藏暂停
- ✅ Dashboard 网格：仅在 `move / zoomend / resize` 时重绘，无每帧重绘
- ✅ 无重复请求、无动画循环泄漏（切换页面后旧页循环随文档销毁）
- ⚠️ 观察项：首页地球每帧调用 `pointsData()` 重建 11 个点数据，开销极小（<1ms），为 three-globe 常规用法，保留现状

## 8. 修复内容

| # | 问题 | 严重度 | 修复 |
|---|---|---|---|
| 1 | 10 个 A02/A03 模块页语言脚本缺少 `bind()`，按钮不可点击且抛错 | 高 | 统一替换为全站标准语言脚本（含按钮保护、active 切换、i18n 事件） |
| 2 | sensors / telemetry / hardware / analysis 中文模式下品牌残留 “AUTONOMOUS NEXUS” | 中 | 品牌标题改为 `data-lang` 双语结构，中文显示“自主观测网络” |
| 3 | 首页 3D 地球：主 CDN 失败或 WebGL 创建失败时无兜底 | 中 | 增加 jsdelivr 备用加载；`init()` 加 try/catch，失败显示静态降级层且页面文字正常 |
| 4 | 首页 resize 时未同步 DPR | 低 | resize 处理器补充 `setPixelRatio()` |
| 5 | Dashboard 地图右下角残留 “Leaflet” 英文版权条 | 低 | 共享 CSS 增加 `body.dashboard-page .leaflet-control-attribution{display:none}`（与 Location/Network 一致） |
| 6 | style.css 缓存版本未更新，修复可能不生效 | 低 | 全站 19 个页面统一升级为 `style.css?v=20260812` |

修改文件：`index.html`、`css/style.css`、`sensors.html`、`telemetry.html`、`hardware.html`、`analysis.html`、`location-a02.html`、`location-a03.html`、`sensors-a02.html`、`sensors-a03.html`、`telemetry-a02.html`、`telemetry-a03.html`、`hardware-a02.html`、`hardware-a03.html`、`analysis-a02.html`、`analysis-a03.html`，以及全部页面中的 style.css 版本号。

## 9. 未解决问题

1. **Firefox 无法实际测试**：环境未安装 Firefox，已如实记录，未假装测试。
2. **Chrome 独立实例未单独执行**：本环境策略禁止额外启动 Chrome 进程；Chrome 151 与 Edge 151 同属 Chromium 内核，Edge 实测结果可代表该内核表现。
3. **装饰性英文铭牌**：Dashboard / 终端页底部 `node-badge`（AUTONOMOUS STATION · REMOTE SENSOR NODE 等）为已锁定设计的英文装饰元素，中文模式下保留，未改动。
4. **a02.html（旧版 A02 页面）**：无任何页面链接指向它（孤儿页面），其中文国际化不完整；不属于交付流程，建议归档或删除。
5. **test.html**：早期遗留测试页，未被引用，建议删除。

## 10. 建议

1. 发布前在真实 Windows 10 / Windows 11 + Firefox 设备上复测一轮（本环境无法覆盖 Firefox）。
2. 建议将 three.js / three-globe / Leaflet / Chart.js 固定版本号并考虑本地托管，进一步降低外网依赖风险（当前已有 jsdelivr 备用加载兜底）。
3. 删除或归档 `a02.html` 与 `test.html` 两个孤儿页面。
4. 发布时对 `css/style.css`、`js/main.js` 等静态资源设置合理缓存策略；本次已将 CSS 版本号统一升级。
5. 若目标机器 GPU 较弱，可在首页增加“降低动效”开关（可选，不影响当前默认效果）。

---

## 附录：关键页面截图

截图目录：`compatibility_screenshots/`（26 张，1920×1080 / 1366×768 / 390×844）

- `index-chrome-1920x1080.png`（首页 3D 地球）
- `network-chrome-1920x1080.png`（观测网络）
- `location-chrome-1920x1080.png`（位置）
- `dashboard-chrome-1920x1080.png`（A01 终端）
- `dashboard-a02-chrome-1920x1080.png`（A02 终端）
- `dashboard-a03-chrome-1920x1080.png`（A03 终端）
- `sensors / telemetry / hardware / analysis-chrome-1920x1080.png`（A01 模块页）
- 对应页面 `-390x844.png`（移动端）

---

# V48.1 追加审查（2026-08-12）

## 1. 上一轮剩余问题清单（P0/P1/P2）

| 级别 | 问题 | 状态 |
|---|---|---|
| P1 | Firefox 无法实测（环境未安装） | 仍无法测试，如实保留 |
| P1 | Chrome 独立实例无法启动（环境策略） | 仍无法单独执行；与 Edge 同内核 |
| P2 | Dashboard/终端页装饰性英文铭牌（node-badge） | 锁定设计，保留 |
| P2 | a02.html / test.html 孤儿文件 | 未链接、不影响站点；建议删除 |
| P2 | unpkg 命令行直连超时 | 浏览器运行时正常；已加 jsdelivr 备用源 |

## 2. 本轮新增实测矩阵

- 平板 1024×1366：全部 21 页指标扫描 + 6 个关键页截图
- 移动端 375×812：关键 7 页
- DPR 1 / 1.25 / 1.5 / 2 / 3：关键页 1920×1080，另测移动端 390×844 @2、@3
- 浏览器缩放 100% / 110% / 125% / 150%（1366×768 物理分辨率）
- 逐页直链打开 + 刷新（全部 21 页）
- WebGL 不可用模拟（拦截 WebGLRenderer 创建）
- CDN 失败模拟（网络层拦截 unpkg.com，验证 jsdelivr 备用加载）
- 地图 resize（1920×1080 → 1280×720 → 1920×1080）：Network / Location / Dashboard / A02

## 3. 本轮结果

- ✅ 0 个新增 JS 错误、0 个 404；无横向滚动；Dashboard 与 Location 一屏保持
- ✅ 语言按钮在全部矩阵（桌面/平板/手机/缩放/DPR）中保持右上角，无遮挡、无跑位
- ✅ DPR 1–3：3D 地球与地图网格画布按 DPR 正确缩放（上限 1.5），无模糊、无错位；A01 光圈/核心与真实坐标偏差 ≤2px（四舍五入误差）
- ✅ 缩放 100–150%：标题、卡片、导航、地图、语言按钮无重叠
- ✅ 21 页直链 + 刷新后语言状态（中文）与页面标题保持，无白屏、无错误
- ✅ 返回/前进链路正常（首页→Network→Location→Dashboard→A02 双向）
- ✅ WebGL 不可用模拟：静态降级层显示、页面文字完整可见、无未捕获错误；移除模拟后 3D 地球恢复正常
- ✅ CDN 失败模拟：拦截 unpkg 后，three / three-globe 自动从 jsdelivr 备用加载，地球正常渲染
- ✅ 地图 resize：蓝色网格画布尺寸始终等于容器尺寸；A01 节点不跑位；Network 标记 resize 后重新定位且在容器内
- ✅ 1024×1366 下瓦片加载耗时较长（视口大、瓦片多），等待后全部加载，非缺陷

## 4. 本轮修复

未发现需要改动代码的新问题，本轮未修改任何页面或样式（V48.0 的修复已通过上述严格模拟验证有效）。

## 5. 仍然存在的问题（如实记录）

1. Firefox 未安装，无法实际测试。
2. Chrome 独立实例因环境策略未单独启动（与 Edge 同属 Chromium 内核，Edge 已完整实测）。
3. 装饰性英文铭牌（node-badge）为锁定设计，中文模式下保留。
4. a02.html（旧版 A02 孤儿页）与 test.html（测试残留）未纳入站点导航，建议归档或删除。

## 6. 结论

关键兼容性问题（页面打开、JS 错误、WebGL 黑屏、地图显示、滚动溢出、语言切换、页面跳转、移动端布局、字体、动画性能）已全部解决并通过实际验证。

按当前可测试范围判定：**READY FOR RELEASE**。

建议：发布前在真实 Windows + Firefox 设备上补测一轮（本环境无法覆盖），并删除两个孤儿文件。

## 7. V48.1 新增截图

- `index-chrome-1024x1366.png`（首页 3D 地球 · 平板）
- `network-chrome-1024x1366.png`（观测网络 · 平板）
- `location-chrome-1024x1366.png`（位置 · 平板）
- `dashboard-chrome-1024x1366.png`（A01 · 平板）
- `dashboard-a02-chrome-1024x1366.png`（A02 · 平板）
- `dashboard-a03-chrome-1024x1366.png`（A03 · 平板）

---

# V48.2 平板端专项版式（2026-08-12）

## 1. 本轮发现的问题

| 级别 | 问题 | 影响 |
|---|---|---|
| P1 | style.css `@media (max-width:1280px)` 将 `.map-panel` 强制放入第 2 列，1024/1280 下地图左侧出现 235px 空列 | Dashboard / A01 / A02 / A03 |
| P1 | 768–900px 被旧移动端规则接管，地图面板高度被压到 188–427px，任务流与地图间出现 300px+ 空白 | 同上 |
| P2 | 侧栏气候卡使用 3 行轨道但只有 2 张卡，第三行空占 96px | Dashboard 平板竖屏 |
| P2 | Network 平板竖屏（768×1024）内容超出一屏约 72–165px | Network |
| P2 | 首页平板横屏（≤1024）使用底部 Hero，与右侧地球存在构图挤压风险 | index |
| P2 | 平板端整体呈现“桌面缩小版”：侧栏/标题/卡片比例未针对平板调整 | 全站 |

## 2. 本轮修复

1. **Dashboard 空列修复**：`body.dashboard-page .map-panel` 在 ≤1280px 时改回第 1 列，地图恢复全宽（1024×1366 下地图由 361px 宽提升到 741px 全宽）。
2. **Tablet 专用断点（768–1200px）**：
   - Dashboard / A01 / A02 / A03 三页使用完全相同的平板规则：Header 改为横向紧凑布局（177px→104px）、命令条紧凑化、任务流不再占用弹性空间、地图行 `minmax(360px,1fr)` 自动铺满剩余高度。
   - 平板竖屏（768–900px）气候卡改为紧凑双列条（标题 + 两卡一行，消除空第三行），地图高度 768×1024 下提升至约 421px，820/834 下约 517–530px。
   - 901–1200px 保持地图全宽单列、侧栏隐藏，地图在 1024×1366 下高约 977px。
3. **Network**：堆叠断点由 `max-width:1100px` 调整为“≤900px 或 901–1024px 竖屏”；竖屏地图行 `minmax(300px,38vh)`，768×1024 下整页一屏（不再纵向溢出）；横屏保持三栏并加大地图。
4. **Location**：平板下 Header/状态卡间距与地图比例微调（地图本已主导，768×1024 下约 532px 高、1024×1366 下约 1096px 高）。
5. **首页**：平板横屏恢复左侧 Hero 构图（左 7vw / 顶部 13%），竖屏 Hero 上移并与地球错开；实测所有平板尺寸下地球与文字无重叠，地球半径 233–414px。
6. 字体与卡片在平板上按比例放大/收紧：标题 `clamp(20px,2.6vw,30px)`、卡片 `min-height:96px`、边距收窄，避免“缩小版桌面”观感。

## 3. 实测矩阵与结果

尺寸：768×1024 / 820×1180 / 834×1194 / 1024×1366（竖屏）+ 1024×768 / 1180×820 / 1194×834（横屏）

页面：index / network / location / dashboard / A02 / A03

- ✅ 0 个 JS 错误、0 横向滚动；Dashboard / Location 保持一屏
- ✅ 地图面积大幅提升：Dashboard 地图 260–832px、Network 地图 430–658px、Location 地图 510–1096px
- ✅ 无大面积无意义留白：Header、命令条、地图、紧凑气候条、任务流首尾相接
- ✅ 语言按钮全部尺寸下保持右上角
- ✅ A01 / A02 / A03 三页平板布局逐像素一致
- ✅ 桌面回归（1920×1080 / 1366×768）与手机回归（390×844 / 375×812）：地图全宽、无滚动、无横向溢出，平板规则未污染其他端

## 4. 截图

新增 42 张平板截图，位于 `compatibility_screenshots/v482/`：

- `index-768x1024.png` … `index-1194x834.png`（首页 7 尺寸）
- `network-768x1024.png` … `network-1194x834.png`
- `location-768x1024.png` … `location-1194x834.png`
- `dashboard-768x1024.png` … `dashboard-1194x834.png`
- `dashboard-a02-*` / `dashboard-a03-*`（与 A01 相同模板）

## 5. 仍未解决的问题

- Firefox 未安装，无法实际测试（沿用前两轮记录）
- 首页在无头软件渲染环境下约 28fps，真实 GPU 设备预计 60fps（非布局问题）
- 平板 768×1024 下 Dashboard 地图约 276px（最小平板），仍大于修复前，且屏幕整体已铺满；如需更大可后续压缩 Header 至单行

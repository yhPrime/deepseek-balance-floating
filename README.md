# DeepSeek 余额悬浮窗插件（dsh-balance-floating）

> DeepSeek Harness Web 界面的左下角悬浮窗：**红色血条 = 账户余额**、**蓝色环 = 估算剩余 token**、**今日消耗横条**。
> 数据**基于 [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) 插件**提供（余额来自 DeepSeek 官方接口，token/费用来自它拦截 `llm/stream` 的账本）。

## 效果

侧边栏左下角（`sidebar.footer.action` 第一个格子，自动把「Cordis plugin」按钮与设置按钮挤到右侧）：

```
┌────────────┐
│  🔴 余额   │   ← 红色血条环：DeepSeek 账户余额，满血 = ¥100，点击立即刷新官方余额
│  🔵 剩余   │   ← 蓝色环：估算剩余 token，满蓝 = ¥100 额度的 token
└────────────┘
  今日 5820万    ← 今日消耗横条：文字在条上方，颜色按实际背景逐像素自动反色
  ▮▮▮▮▮▮▮▮     ← 蓝色填充 = 今日已用 token 占 ¥100 额度的比例
```

- 悬停圆环/横条可查看明细（总额/赠送/充值、估算依据、输入/输出/缓存分项、调用次数）。
- 每 60 秒自动轮询刷新；切换亮/暗/跟随系统主题时，配色自动跟随（读取主题语义色），「今日」文字用 `mix-blend-mode: difference` 相对实际背景逐像素反色。
- 侧边栏收窄（rail 模式）时自动隐藏，避免挤占空间。

## 依赖

**必须**：本插件本身不联网、不记账，只做展示。数据全部来自：

- **[dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) v1.3.1+** —— 余额（官方 `/user/balance` 接口）、今日/累计 token 与费用账本、官方价格表。

请先安装并启用 dsh-cost-meter，再安装本插件。

## 安装

前置：已安装 DeepSeek Harness（≥ 0.1.0-rc.5）并已安装 dsh-cost-meter。

```bash
# 方式一：从仓库目录直接添加
dsh plugin --profile web add /path/to/dsh-balance-floating

# 方式二：克隆后添加
git clone <本仓库地址>
dsh plugin --profile web add <克隆目录>

# 方式三：复制到 profile 的 node_modules 后添加
cp -r dsh-balance-floating ~/.dsh/profiles/web/node_modules/
dsh plugin --profile web add dsh-balance-floating
```

安装完成后重启（或刷新）DeepSeek Harness。在设置 → 外观中可切换主题查看效果。

## 配置说明

本插件暂无可视化设置页，两个刻度为内置常量，改动需编辑 `lib/client.js`：

| 常量 | 默认 | 含义 |
| --- | --- | --- |
| `BALANCE_CAP` | `100` | 血条满血额度（¥） |
| `BLEND_INPUT` / `BLEND_OUTPUT` | `0.7` / `0.3` | 估算剩余 token 的混合单价权重（输入 cacheMiss / 输出） |
| 今日横条额度 | ¥100 的 token 数 | 与满蓝同一基准 |

## 工作原理

1. **数据源**：客户端经 Typert RPC 调用 dsh-cost-meter 挂载的 `remote.costMeter.getState()` / `refreshBalance()`（与 dsh-cost-meter 自身 UI 同一条通道）。
2. **余额血条**：`balance.totalBalance`，环填充 = `余额 / 100`。
3. **剩余 token 估算**：`余额 ÷ 汇率 ÷ 混合单价`（混合单价 = 当前模型价表 `0.7×输入未命中 + 0.3×输出`，USD/1M tokens），满蓝 = ¥100 对应 token 数。
4. **今日消耗横条**：`今日(input+output+cacheRead+cacheWrite) ÷ 满蓝 token 数`。
5. **主题适配**：`getComputedStyle` 读取当前主题已解析的 `--dsw-alias-*` 语义色并内联应用；「今日」文字用 `mix-blend-mode: difference` 实现逐像素自动反色。

## 致谢 / 版权

- 数据层：**[dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)**（MIT）——本插件的余额与用量数据完全基于它提供。
- 界面层：本插件独立实现（左下角血条/剩余环/今日横条），依赖 DeepSeek Harness 的 `--dsw-*` 主题语义变量与 Slot 系统。

MIT License，见 [LICENSE](./LICENSE)。

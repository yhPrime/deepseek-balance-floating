/**
 * dsh-balance-floating 宿主入口。
 *
 * 本插件是纯客户端界面插件:数据全部由浏览器端经 `remote.costMeter.*`
 * (Typert RPC,由 dsh-cost-meter 挂载)读取。宿主侧无需任何能力,
 * 这里仅提供与 Loader 行约定一致的空入口。
 */

export const name = 'balance-floating'

export function apply(ctx) {
  // 数据源:dsh-cost-meter 的 costMeter 服务(客户端经 remote.costMeter 调用)。
  // 本插件不注册任何宿主服务。
}

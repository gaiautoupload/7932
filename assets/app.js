const state = { snapshot: null, catalyst: null, side: "buy", period: "core", expanded: null };
const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const dateLabel = (value = "") => value.length === 8 ? `${value.slice(0,4)}.${value.slice(4,6)}.${value.slice(6)}` : value;
const price = (value) => value === null || value === undefined ? "—" : Number(value).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lots = (value = 0) => `${Math.abs(Number(value)).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 張`;
const money = (value = 0) => {
  const amount = Math.abs(Number(value));
  if (amount >= 100000000) return `NT$ ${(amount / 100000000).toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 億`;
  if (amount >= 10000) return `NT$ ${(amount / 10000).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 萬`;
  return `NT$ ${amount.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
};
const signedClass = (value) => Number(value) >= 0 ? "up" : "down";
const signedPct = (value) => value === null || value === undefined ? "—" : `${Number(value) > 0 ? "+" : ""}${Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%`;
const currentWindow = () => state.snapshot.flow_windows?.[state.period] || { brokers: [] };

function brokerCard(broker, index, maxLots) {
  const isBuy = Number(broker.net_lots) > 0;
  const open = state.expanded === broker.broker_id;
  const confidence = { high: "高", medium: "中", low: "低" }[broker.confidence] || "低";
  const isCore = state.period === "core";
  const change = Number(broker.rank_change || 0);
  const rankBadge = !isCore ? "" : broker.rank_status === "new"
    ? `<span class="rank-move new">新進核心</span>`
    : change > 0 ? `<span class="rank-move up-rank">↑ ${change}</span>`
    : change < 0 ? `<span class="rank-move down-rank">↓ ${Math.abs(change)}</span>`
    : `<span class="rank-move same">持平</span>`;
  const statusIcon = { adding: "🟢", holding: "🟢", trimming: "🟡", reducing: "🟠", distribution: "🔴" }[broker.status_code] || "⚪";
  const winRate = broker.win_rate_qualified ? `${price(broker.win_rate)}%` : "建模中";
  const coreBody = `<div class="core-grid">
    <span><small>今日</small><b class="${signedClass(broker.daily_net_lots)}">${Number(broker.daily_net_lots) >= 0 ? "+" : "−"}${lots(broker.daily_net_lots)}</b></span>
    <span><small>累積庫存</small><b>${lots(broker.inventory_lots)}</b></span>
    <span><small>推估成本</small><b>${price(broker.inventory_cost)}</b></span>
    <span><small>勝率</small><b>${winRate}</b></span>
    <span><small>狀態</small><b class="status ${broker.status_code}">${statusIcon} ${broker.status_label}</b></span>
  </div>
  <div class="capital-line"><span>累積淨投入</span><b>${money(broker.cumulative_net_amount)}</b><small>${broker.unrealized_pct == null ? "成本樣本不足" : `現價較成本 ${Number(broker.unrealized_pct) >= 0 ? "+" : ""}${price(broker.unrealized_pct)}%`}</small></div>`;
  const flowBody = `<div class="broker-title"><b>${broker.broker_name}</b><small>${broker.broker_id}</small><strong class="${isBuy ? "up" : "down"}">${isBuy ? "+" : "−"}${lots(broker.net_lots)}</strong></div>
    <div class="net-amount ${isBuy ? "up" : "down"}">${isBuy ? "+" : "−"}${money(broker.net_amount)}</div>
    <div class="bar"><i style="width:${Math.abs(broker.net_lots) / maxLots * 100}%"></i></div>
    <div class="row-meta"><span>買進 <b>${lots(broker.buy_lots)}</b> · ${money(broker.buy_amount)}</span><span>賣出 <b>${lots(broker.sell_lots)}</b> · ${money(broker.sell_amount)}</span></div>`;
  return `<button class="broker-card ${open ? "expanded" : ""}" data-broker="${broker.broker_id}">
    <span class="rank">${String(index + 1).padStart(2, "0")}</span>
    <div class="broker-main">
      ${isCore ? `<div class="broker-title core-title"><b>${broker.broker_name}${rankBadge}</b><small>${broker.broker_id}</small></div>${coreBody}` : flowBody}
      ${open ? `<div class="detail"><span><small>推估成本區間</small><b>${price(broker.inventory_cost_low)}–${price(broker.inventory_cost_high)}</b></span><span><small>成本價位明細</small><b>${broker.cost_detail_records || 0} 筆</b></span><span><small>總資金占比</small><b>${price(broker.capital_share_pct)}%</b></span><span><small>證據可信度</small><b>${confidence}</b></span><span><small>歷史活躍</small><b>${broker.active_sessions}/${broker.history_sessions} 日</b></span><span><small>連續賣超</small><b>${broker.sell_streak || 0} 日</b></span><span><small>庫存留存率</small><b>${price(Number(broker.inventory_retention || 0) * 100)}%</b></span><span><small>股價影響樣本</small><b>${broker.samples || 0} 日</b></span></div>` : ""}
    </div>
  </button>`;
}

function renderBrokers() {
  const windowData = currentWindow();
  const allCore = windowData.brokers || [];
  const isCore = state.period === "core";
  const brokers = (isCore ? [...allCore] : allCore
    .filter((broker) => state.side === "buy" ? Number(broker.net_lots) > 0 : Number(broker.net_lots) < 0))
    .sort((left, right) => isCore
      ? Number(right.cumulative_net_amount) - Number(left.cumulative_net_amount)
      : state.side === "buy" ? Number(right.net_lots) - Number(left.net_lots) : Number(left.net_lots) - Number(right.net_lots));
  const maxLots = Math.max(...brokers.map((item) => Math.abs(item.net_lots)), 1);
  $("#period-meta").textContent = isCore
    ? `累積 ${windowData.actual_days} 個交易日總資金`
    : windowData.actual_days < windowData.requested_days
    ? `目前僅 ${windowData.actual_days} 個交易日資料`
    : `${dateLabel(windowData.start_date)}–${dateLabel(windowData.end_date)}`;
  $("#buy-count").textContent = allCore.filter((item) => Number(item.net_lots) > 0).length;
  $("#sell-count").textContent = allCore.filter((item) => Number(item.net_lots) < 0).length;
  $("#flow-side-tabs").classList.toggle("hidden", isCore);
  $("#broker-list").innerHTML = brokers.length
    ? brokers.map((broker, index) => brokerCard(broker, index, maxLots)).join("")
    : `<div class="empty"><b>這段期間沒有核心主力${state.side === "sell" ? "賣超" : "買超"}</b><p>名單由歷史行為評分選出，不會用當日排行榜替代。</p></div>`;
  all(".broker-card").forEach((button) => button.addEventListener("click", () => {
    state.expanded = state.expanded === button.dataset.broker ? null : button.dataset.broker;
    renderBrokers();
  }));
}

function renderImpact() {
  const ranking = state.snapshot.impact_ranking || [];
  $("#impact-list").innerHTML = ranking.length ? `<div class="impact-list">${ranking.map((broker, index) => `<article><span>${index + 1}</span><div><b>${broker.broker_name}</b><small>${broker.samples} 個有效交易日 · 隔日方向命中 ${Math.round((broker.direction_accuracy || 0) * 100)}%</small></div><strong>${broker.impact_score}</strong></article>`).join("")}</div>` : `<div class="model-empty"><span>60D</span><h3>影響力模型正在累積樣本</h3><p>至少 5 個有效交易日後才排名，避免用單日買超誤判。</p></div>`;
}

function render(data) {
  state.snapshot = data;
  const market = data.market || {};
  $("#stock-name").textContent = data.stock_name;
  $("#stock-id").textContent = data.stock_id;
  const marketPrice = market.weighted_avg_price ?? market.vwap;
  const marketChange = market.weighted_avg_change;
  const marketChangePct = market.weighted_avg_change_pct;
  $("#close").textContent = price(marketPrice);
  const hasChange = marketChange !== null && marketChange !== undefined;
  $("#change").textContent = hasChange ? `${Number(marketChange) >= 0 ? "▲" : "▼"} ${price(Math.abs(marketChange))} · ${price(Math.abs(marketChangePct))}%` : "興櫃加權均價";
  $("#timestamp").textContent = `資料日 ${dateLabel(data.as_of)} · TPEx 每日分點資料已驗證`;
  $("#data-status").textContent = "每日更新";
  $("#signal-score").textContent = data.signal.score;
  $("#signal-label").textContent = data.signal.label;
  $("#signal-copy").textContent = data.impact_ranking.length ? "歷史核心分點與市場方向的綜合判讀。" : "歷史樣本不足，目前只列候選分點，不判定控制關係。";
  $("#gauge").style.setProperty("--score", `${data.signal.score * 3.6}deg`);
  $("#volume").textContent = `${Number(market.volume_lots || 0).toLocaleString()} 張`;
  $("#concentration").textContent = `${Number(market.concentration_lots || 0).toLocaleString()} 張`;
  $("#concentration").className = signedClass(market.concentration_lots);
  $("#concentration-pct").textContent = `${price(market.concentration_pct)}%`;
  $("#method-note").textContent = `${data.method_note} 本頁僅供研究，不構成投資建議。`;
  renderBrokers();
  renderImpact();
  updateVisibleNet();
}

const catalystText = {
  READY_TO_IGNITE: ["🔥 點火", "內部主力與外部產業同步轉強，屬於完整共振。"],
  CONTROLLED_MOVE: ["⚠️ 孤立拉抬", "主力偏強但產業催化不足，需提防單點控盤。"],
  POSSIBLE_CATCH_UP: ["👀 等待補漲", "產業先行轉強，7932 主力籌碼尚未確認。"],
  RISK_OFF: ["🔴 轉弱", "主力與外部產業同步偏弱，風險優先。"],
  BULLISH: ["🟢 偏多", "至少一側轉強，但尚未達到完整點火門檻。"],
  NEUTRAL: ["🟡 中性", "內外訊號尚未形成一致方向。"],
  UNAVAILABLE: ["⚪ 資料不足", "關鍵來源缺漏，本日不產生點火判讀。"],
};
const componentMeta = {
  emc_2383: ["台光電 2383", "Direct Signal", "35%"],
  m8m9_proxy: ["M8 / M9", "Proxy Index", "30%"],
  ppo_mppo: ["PPO / MPPO", "Proxy + Event", "20%"],
  glass_proxy: ["富喬 / 台玻", "Low-Dk Sentiment", "15%"],
};
const alertText = {
  BROAD_UP: "CCL 3 家以上同步上漲",
  FULL_RESONANCE: "CCL 4 家全面共振",
  CCL_FULL_RESONANCE: "CCL 4 家全面共振",
  STRONG_CCL: "CCL Proxy 強勢",
  WEAK_CCL: "CCL Proxy 轉弱",
  PPO_PRICE_HIKE: "PPO / MPPO 漲價事件",
  POSSIBLE_CATCH_UP: "潛在補漲",
  POSITIVE_DIVERGENCE: "產業強、7932 尚未反映",
  ISOLATED_MOVE: "缺乏產業共振，偏籌碼行情",
};

function renderCatalyst(data) {
  state.catalyst = data;
  const signals = data.signals || {};
  const [title, copy] = catalystText[data.signal] || catalystText.UNAVAILABLE;
  const ignition = signals.ignition;
  $("#catalyst-date").textContent = `資料日 ${dateLabel((data.date || "").replaceAll("-", ""))}`;
  $("#ignition-score").textContent = ignition ?? "—";
  $("#main-force-score").textContent = signals.main_force ?? "—";
  $("#external-score").textContent = signals.external_catalyst ?? "—";
  $("#combined-score").textContent = ignition ?? "—";
  $("#catalyst-signal").textContent = data.signal_label || title;
  $("#catalyst-signal").dataset.signal = data.signal || "UNAVAILABLE";
  $("#catalyst-title").textContent = title;
  $("#catalyst-copy").textContent = copy;
  const components = data.components || {};
  $("#catalyst-list").innerHTML = Object.entries(componentMeta).map(([key, meta]) => {
    const item = components[key] || {};
    const change = item.change_pct ?? item.proxy_change_pct;
    const status = item.status || "missing";
    const freshness = item.freshness ? dateLabel(String(item.freshness).replaceAll("-", "")) : "無資料日";
    return `<article class="catalyst-row ${status}">
      <div><b>${meta[0]}</b><small>${meta[1]} · 權重 ${meta[2]}</small></div>
      <span class="freshness ${status}">${status === "fresh" ? "新鮮" : status === "partial" ? "部分" : status === "stale" ? "延遲" : "缺漏"}<small>${freshness}</small></span>
      <strong class="${signedClass(change)}">${signedPct(change)}</strong>
      <em>${item.score ?? "—"}</em>
    </article>`;
  }).join("");
  const alerts = data.alerts || [];
  $("#catalyst-alerts").classList.toggle("hidden", !alerts.length);
  $("#catalyst-alerts").innerHTML = alerts.map((alert) => `<span>${alertText[alert] || alert.replaceAll("_", " ")}</span>`).join("");
  const quality = data.quality || {};
  $("#catalyst-quality").textContent = quality.status === "ok" ? `8 / 8 行情已載入` : `${quality.stock_count || 0} / ${quality.expected_stock_count || 8} 行情已載入`;
  $("#catalyst-source").textContent = "TWSE / TPEx / SSE + 跨市場行情備援";
}

function updateVisibleNet() {
  const rows = currentWindow().brokers || [];
  const visible = state.period === "core" ? rows : rows.filter((item) => state.side === "buy" ? Number(item.net_lots) > 0 : Number(item.net_lots) < 0);
  const net = visible.reduce((sum, item) => sum + Number(item.net_lots), 0);
  $("#visible-net-label").textContent = state.period === "core"
    ? "核心累積淨額" : state.side === "buy" ? "核心期間買超" : "核心期間賣超";
  $("#visible-net").textContent = `${net > 0 ? "+" : ""}${net.toLocaleString()} 張`;
  $("#visible-net").className = signedClass(net);
}

all("[data-side]").forEach((button) => button.addEventListener("click", () => {
  state.side = button.dataset.side; state.expanded = null;
  all("[data-side]").forEach((item) => item.className = "");
  button.className = state.side === "buy" ? "active-buy" : "active-sell";
  renderBrokers(); updateVisibleNet();
}));

all("[data-period]").forEach((button) => button.addEventListener("click", () => {
  state.period = button.dataset.period; state.expanded = null;
  all("[data-period]").forEach((item) => item.className = item === button ? "active" : "");
  renderBrokers(); updateVisibleNet();
}));

Promise.all([
  fetch("./data/snapshot.json", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error("snapshot unavailable"); return response.json(); }),
  fetch("./data/current.json", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error("catalyst unavailable"); return response.json(); }),
])
  .then(([snapshot, catalyst]) => { render(snapshot); renderCatalyst(catalyst); })
  .catch(() => {
    $("#data-status").textContent = "資料錯誤";
    $("#signal-label").textContent = "無法讀取每日快照";
    $("#signal-copy").textContent = "請確認 data/snapshot.json 已提交至網站。";
    $("#catalyst-signal").textContent = "資料讀取失敗";
    $("#catalyst-copy").textContent = "請先執行本地每日更新 BAT，再確認 JSON 已提交。";
  });

const state = { snapshot: null, side: "buy", period: "1", expanded: null };
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
const currentWindow = () => state.snapshot.flow_windows?.[state.period] || { brokers: [] };

function brokerCard(broker, index, maxLots) {
  const isBuy = Number(broker.net_lots) > 0;
  const open = state.expanded === broker.broker_id;
  const confidence = { high: "高", medium: "中", low: "低" }[broker.confidence] || "低";
  return `<button class="broker-card ${open ? "expanded" : ""}" data-broker="${broker.broker_id}">
    <span class="rank">${String(index + 1).padStart(2, "0")}</span>
    <div class="broker-main">
      <div class="broker-title"><b>${broker.broker_name}</b><small>${broker.broker_id}</small><strong class="${isBuy ? "up" : "down"}">${isBuy ? "+" : "−"}${lots(broker.net_lots)}</strong></div>
      <div class="net-amount ${isBuy ? "up" : "down"}">${isBuy ? "+" : "−"}${money(broker.net_amount)}</div>
      <div class="bar"><i style="width:${Math.abs(broker.net_lots) / maxLots * 100}%"></i></div>
      <div class="row-meta"><span>買進 <b>${lots(broker.buy_lots)}</b> · ${money(broker.buy_amount)}</span><span>賣出 <b>${lots(broker.sell_lots)}</b> · ${money(broker.sell_amount)}</span></div>
      ${open ? `<div class="detail"><span><small>主力辨識分數</small><b>${broker.control_score}</b></span><span><small>證據可信度</small><b>${confidence}</b></span><span><small>歷史活躍</small><b>${broker.active_sessions}/${broker.history_sessions} 日</b></span><span><small>成交均價</small><b>${price(broker.avg_price)}</b></span><span><small>估算庫存</small><b>${Number(broker.inventory_lots || 0).toLocaleString()} 張</b></span><span><small>股價影響</small><b>${broker.qualified ? broker.impact_score : "樣本不足"}</b></span></div>` : ""}
    </div>
  </button>`;
}

function renderBrokers() {
  const windowData = currentWindow();
  const allCore = windowData.brokers || [];
  const brokers = allCore.filter((broker) => state.side === "buy" ? Number(broker.net_lots) > 0 : Number(broker.net_lots) < 0);
  const maxLots = Math.max(...brokers.map((item) => Math.abs(item.net_lots)), 1);
  $("#period-meta").textContent = windowData.actual_days < windowData.requested_days
    ? `目前僅 ${windowData.actual_days} 個交易日資料`
    : `${dateLabel(windowData.start_date)}–${dateLabel(windowData.end_date)}`;
  $("#buy-count").textContent = allCore.filter((item) => Number(item.net_lots) > 0).length;
  $("#sell-count").textContent = allCore.filter((item) => Number(item.net_lots) < 0).length;
  $("#broker-list").innerHTML = brokers.length
    ? brokers.map((broker) => brokerCard(broker, allCore.indexOf(broker), maxLots)).join("")
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
  $("#close").textContent = price(market.close);
  const hasChange = market.change !== null && market.change !== undefined;
  $("#change").textContent = hasChange ? `${Number(market.change) >= 0 ? "▲" : "▼"} ${price(Math.abs(market.change))} · ${price(Math.abs(market.change_pct))}%` : "前日參考價未提供";
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

function updateVisibleNet() {
  const rows = currentWindow().brokers || [];
  const visible = rows.filter((item) => state.side === "buy" ? Number(item.net_lots) > 0 : Number(item.net_lots) < 0);
  const net = visible.reduce((sum, item) => sum + Number(item.net_lots), 0);
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

fetch("./data/snapshot.json", { cache: "no-store" })
  .then((response) => { if (!response.ok) throw new Error("snapshot unavailable"); return response.json(); })
  .then(render)
  .catch(() => {
    $("#data-status").textContent = "資料錯誤";
    $("#signal-label").textContent = "無法讀取每日快照";
    $("#signal-copy").textContent = "請確認 data/snapshot.json 已提交至網站。";
  });

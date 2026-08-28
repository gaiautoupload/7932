const state = { snapshot: null, side: "buy", expanded: null };
const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const dateLabel = (value = "") => value.length === 8 ? `${value.slice(0,4)}.${value.slice(4,6)}.${value.slice(6)}` : value;
const price = (value) => value === null || value === undefined ? "—" : Number(value).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lots = (value = 0) => `${Math.abs(Number(value)).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} 張`;
const signedClass = (value) => Number(value) >= 0 ? "up" : "down";

function brokerCard(broker, index, maxLots) {
  const isBuy = state.side === "buy";
  const open = state.expanded === broker.broker_id;
  return `<button class="broker-card ${open ? "expanded" : ""}" data-broker="${broker.broker_id}">
    <span class="rank">${String(index + 1).padStart(2, "0")}</span>
    <div class="broker-main">
      <div class="broker-title"><b>${broker.broker_name}</b><small>${broker.broker_id}</small><strong class="${isBuy ? "up" : "down"}">${isBuy ? "+" : "−"}${lots(broker.net_lots)}</strong></div>
      <div class="bar"><i style="width:${Math.abs(broker.net_lots) / maxLots * 100}%"></i></div>
      <div class="row-meta"><span>成交均價 <b>${price(broker.avg_price)}</b></span><span>估算成本 <b>${price(broker.inventory_cost)}</b></span></div>
      ${open ? `<div class="detail"><span><small>估算庫存</small><b>${Number(broker.inventory_lots).toLocaleString()} 張</b></span><span><small>影響分數</small><b>${broker.qualified ? broker.impact_score : "建模中"}</b></span><span><small>有效樣本</small><b>${broker.samples || 0} 日</b></span></div>` : ""}
    </div>
  </button>`;
}

function renderBrokers() {
  const data = state.snapshot;
  const brokers = state.side === "buy" ? data.top_buyers : data.top_sellers;
  const maxLots = Math.max(...brokers.map((item) => Math.abs(item.net_lots)), 1);
  $("#broker-list").innerHTML = brokers.length
    ? brokers.map((broker, index) => brokerCard(broker, index, maxLots)).join("")
    : `<div class="empty"><b>尚未匯入${state.side === "sell" ? "賣方" : "買方"}明細</b><p>下一次執行每日追蹤器後，這裡會顯示完整前 10 名。</p></div>`;
  all(".broker-card").forEach((button) => button.addEventListener("click", () => {
    state.expanded = state.expanded === button.dataset.broker ? null : button.dataset.broker;
    renderBrokers();
  }));
}

function renderImpact() {
  const ranking = state.snapshot.impact_ranking || [];
  $("#impact-list").innerHTML = ranking.length ? `<div class="impact-list">${ranking.map((broker, index) => `<article><span>${index + 1}</span><div><b>${broker.broker_name}</b><small>${broker.samples} 個有效交易日 · 隔日方向命中 ${Math.round((broker.direction_accuracy || 0) * 100)}%</small></div><strong>${broker.impact_score}</strong></article>`).join("")}</div>` : `<div class="model-empty"><span>60D</span><h3>影響力模型正在累積樣本</h3><p>至少 5 個有效交易日後才排名，避免用單日買超誤判。分數由隔日報酬相關、方向命中率與樣本穩定度組成。</p></div>`;
}

function render(data) {
  state.snapshot = data;
  const market = data.market || {};
  const visibleNet = [...data.top_buyers, ...data.top_sellers].reduce((sum, item) => sum + Number(item.net_lots), 0);
  $("#stock-name").textContent = data.stock_name;
  $("#stock-id").textContent = data.stock_id;
  $("#close").textContent = price(market.close);
  const hasChange = market.change !== null && market.change !== undefined;
  $("#change").textContent = hasChange ? `${Number(market.change) >= 0 ? "▲" : "▼"} ${price(Math.abs(market.change))} · ${price(Math.abs(market.change_pct))}%` : "前日參考價未提供";
  $("#timestamp").textContent = `資料日 ${dateLabel(data.as_of)} · EMdss004 / EMdes010 已驗證`;
  $("#data-status").textContent = "每日更新";
  $("#signal-score").textContent = data.signal.score;
  $("#signal-label").textContent = data.signal.label;
  $("#signal-copy").textContent = data.impact_ranking.length ? "高影響分點與市場方向的綜合判讀。" : "累積足夠交易日後，才會啟用影響分點訊號。";
  $("#gauge").style.setProperty("--score", `${data.signal.score * 3.6}deg`);
  $("#visible-net").textContent = `${visibleNet > 0 ? "+" : ""}${visibleNet.toLocaleString()} 張`;
  $("#visible-net").className = signedClass(visibleNet);
  $("#volume").textContent = `${Number(market.volume_lots || 0).toLocaleString()} 張`;
  $("#concentration").textContent = `${Number(market.concentration_lots || 0).toLocaleString()} 張`;
  $("#concentration").className = signedClass(market.concentration_lots);
  $("#concentration-pct").textContent = `${price(market.concentration_pct)}%`;
  $("#buy-count").textContent = data.top_buyers.length;
  $("#sell-count").textContent = data.top_sellers.length;
  $("#method-note").textContent = `${data.method_note} 本頁僅供研究，不構成投資建議。`;
  renderBrokers();
  renderImpact();
}

all("[data-side]").forEach((button) => button.addEventListener("click", () => {
  state.side = button.dataset.side;
  state.expanded = null;
  all("[data-side]").forEach((item) => item.className = "");
  button.className = state.side === "buy" ? "active-buy" : "active-sell";
  renderBrokers();
}));

fetch("./data/snapshot.json", { cache: "no-store" })
  .then((response) => { if (!response.ok) throw new Error("snapshot unavailable"); return response.json(); })
  .then(render)
  .catch(() => {
    $("#data-status").textContent = "資料錯誤";
    $("#signal-label").textContent = "無法讀取每日快照";
    $("#signal-copy").textContent = "請確認 data/snapshot.json 已提交至網站。";
  });

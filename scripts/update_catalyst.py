from __future__ import annotations

import json
import math
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config"
DATA = ROOT / "data"
TAIPEI = timezone(timedelta(hours=8))


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_json(url: str, referer: str | None = None, attempts: int = 2):
    headers = {"User-Agent": "Mozilla/5.0 7932-Industry-Catalyst-Radar/1.0", "Accept": "application/json"}
    if referer:
        headers["Referer"] = referer
    last_error = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
                return json.loads(response.read().decode("utf-8-sig"))
        except Exception as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(1)
    raise RuntimeError(f"fetch failed: {url}: {last_error}")


def yahoo_history(symbol: str) -> list[dict]:
    encoded = urllib.parse.quote(symbol)
    errors = []
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        try:
            payload = fetch_json(
                f"https://{host}/v8/finance/chart/{encoded}?range=6mo&interval=1d&events=history",
                attempts=1,
            )
            result = payload["chart"]["result"][0]
            quote = result["indicators"]["quote"][0]
            rows = []
            for index, stamp in enumerate(result.get("timestamp", [])):
                close = quote.get("close", [])[index]
                volume = quote.get("volume", [])[index]
                if close is None:
                    continue
                rows.append({
                    "date": datetime.fromtimestamp(stamp, tz=timezone.utc).date().isoformat(),
                    "close": float(close), "volume": float(volume or 0),
                })
            if len(rows) < 2:
                raise RuntimeError("insufficient history")
            return rows
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError("; ".join(errors))


def roc_date(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 7:
        return f"{int(digits[:3]) + 1911:04d}-{digits[3:5]}-{digits[5:7]}"
    return value


def official_latest(stocks: dict) -> dict[str, dict]:
    found: dict[str, dict] = {}
    try:
        rows = fetch_json("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")
        for key, stock in stocks.items():
            if stock["market"] != "twse":
                continue
            row = next((item for item in rows if str(item.get("Code", "")).strip() == stock["code"]), None)
            if row:
                found[key] = {
                    "date": roc_date(str(row.get("Date", ""))),
                    "close": float(str(row.get("ClosingPrice", "0")).replace(",", "") or 0),
                    "volume": float(str(row.get("TradeVolume", "0")).replace(",", "") or 0),
                    "source": "TWSE OpenAPI",
                }
    except Exception:
        pass
    try:
        rows = fetch_json("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes")
        for key, stock in stocks.items():
            if stock["market"] != "tpex":
                continue
            row = next((item for item in rows if str(
                item.get("SecuritiesCompanyCode") or item.get("Code") or item.get("證券代號") or ""
            ).strip() == stock["code"]), None)
            if row:
                found[key] = {
                    "date": roc_date(str(row.get("Date") or row.get("資料日期") or "")),
                    "close": float(str(row.get("Close") or row.get("ClosingPrice") or row.get("收盤價") or "0").replace(",", "") or 0),
                    "volume": float(str(row.get("TradingShares") or row.get("TradeVolume") or row.get("成交股數") or "0").replace(",", "") or 0),
                    "source": "TPEx OpenAPI",
                }
    except Exception:
        pass
    return found


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def momentum_score(change_pct: float, daily_returns: list[float], minimum: int) -> tuple[float, float | None]:
    sample = daily_returns[-20:]
    if len(sample) < minimum:
        return 50.0, None
    volatility = statistics.stdev(sample)
    if volatility <= 1e-9:
        return 50.0, 0.0
    z = clamp(change_pct / volatility, -2.5, 2.5)
    return round(clamp(50 + z * 20), 1), round(z, 3)


def volume_score(ratio: float | None) -> float:
    if ratio is None:
        return 50
    if ratio < 0.7:
        return 30
    if ratio < 1.0:
        return 45
    if ratio < 1.5:
        return 60
    if ratio < 2.0:
        return 75
    return 90


def calculate_stock(key: str, stock: dict, rows: list[dict], official: dict | None, scoring: dict) -> dict:
    rows = [dict(row) for row in rows]
    official_match = bool(official and official.get("date") == rows[-1]["date"] and official.get("close"))
    if official_match:
        rows[-1]["close"] = float(official["close"])
        if official.get("volume"):
            rows[-1]["volume"] = float(official["volume"])
    closes = [row["close"] for row in rows]
    volumes = [row["volume"] for row in rows]
    returns = [(closes[i] / closes[i - 1] - 1) * 100 for i in range(1, len(closes)) if closes[i - 1]]
    one_day = returns[-1]
    five_day = (closes[-1] / closes[-6] - 1) * 100 if len(closes) >= 6 and closes[-6] else one_day
    twenty_day = (closes[-1] / closes[-21] - 1) * 100 if len(closes) >= 21 and closes[-21] else five_day
    avg_volume = statistics.mean(volumes[-21:-1]) if len(volumes) >= 21 else statistics.mean(volumes[:-1] or volumes)
    ratio = volumes[-1] / avg_volume if avg_volume else None
    day_score, z = momentum_score(one_day, returns[:-1], int(scoring["minimum_volatility_sessions"]))
    five_daily = five_day / math.sqrt(5)
    five_score, _ = momentum_score(five_daily, returns[:-1], int(scoring["minimum_volatility_sessions"]))
    vol_score = volume_score(ratio)
    weights = scoring["individual_weights"]
    score = round(day_score * weights["daily_momentum"] + five_score * weights["five_day_trend"] + vol_score * weights["volume"], 1)
    prior_high = max(closes[-21:-1]) if len(closes) >= 21 else max(closes[:-1])
    return {
        "key": key, "code": stock["code"], "name": stock["name"], "symbol": stock["symbol"],
        "date": rows[-1]["date"], "price": round(closes[-1], 4), "change_pct": round(one_day, 3),
        "return_5d_pct": round(five_day, 3), "trend_20d_pct": round(twenty_day, 3),
        "volume": round(volumes[-1]), "volume_ratio_20d": round(ratio, 3) if ratio is not None else None,
        "breakout_20d": closes[-1] > prior_high, "momentum_z": z,
        "daily_score": day_score, "five_day_score": five_score, "volume_score": vol_score,
        "score": score, "source": f"{official['source']} + Yahoo history" if official_match else "Yahoo Finance fallback",
        "source_url": "https://openapi.twse.com.tw/" if official_match and stock["market"] == "twse" else "https://www.tpex.org.tw/openapi/" if official_match else f"https://finance.yahoo.com/quote/{stock['symbol']}",
        "timestamp": datetime.now(TAIPEI).isoformat(timespec="seconds"), "freshness": rows[-1]["date"],
        "status": "fresh", "official_validated": official_match,
    }


def basket_score(name: str, definition: dict, stocks: dict[str, dict]) -> dict:
    available = [(key, weight, stocks[key]) for key, weight in definition["weights"].items() if key in stocks]
    missing_weight = 1 - sum(weight for _, weight, _ in available)
    if not available:
        return {
            "name": definition["label"], "score": None, "status": "missing", "confidence": "LOW",
            "source": "weighted proxy basket", "source_url": "config/proxy_baskets.json",
            "timestamp": None, "freshness": None, "constituents": [],
        }
    total = sum(weight for _, weight, _ in available)
    weighted_return = sum(item["change_pct"] * weight / total for _, weight, item in available)
    weighted_5d = sum(item["return_5d_pct"] * weight / total for _, weight, item in available)
    weighted_20d = sum(item["trend_20d_pct"] * weight / total for _, weight, item in available)
    score = sum(item["score"] * weight / total for _, weight, item in available)
    up_count = sum(item["change_pct"] > 0 for _, _, item in available)
    alerts = []
    if up_count >= 3:
        alerts.append("BROAD_UP")
    if len(available) == 4 and up_count == 4:
        alerts.append("FULL_RESONANCE")
    if weighted_return > 2:
        alerts.append("STRONG_CCL")
    if weighted_return < -2:
        alerts.append("WEAK_CCL")
    freshest = max((item.get("freshness", "") for _, _, item in available), default="")
    timestamps = [item.get("timestamp") for _, _, item in available if item.get("timestamp")]
    return {
        "name": definition["label"], "change_pct": round(weighted_return, 3),
        "return_5d_pct": round(weighted_5d, 3), "trend_20d_pct": round(weighted_20d, 3),
        "score": round(score, 1), "up_count": up_count, "total_count": len(definition["weights"]),
        "all_up": len(available) == len(definition["weights"]) and up_count == len(available),
        "alerts": alerts, "missing_weight": round(max(missing_weight, 0), 3),
        "confidence": "LOW" if missing_weight > 0.25 else "MEDIUM" if missing_weight > 0 else "HIGH",
        "status": "partial" if missing_weight > 0 else "fresh",
        "source": "weighted proxy basket",
        "source_url": "config/proxy_baskets.json",
        "timestamp": max(timestamps) if timestamps else None,
        "freshness": freshest or None,
        "constituents": [{"key": key, "weight": weight, "change_pct": item["change_pct"], "score": item["score"], "status": item["status"]} for key, weight, item in available],
    }


def fetch_sse_events(keywords: dict, previous: dict) -> dict:
    today = datetime.now(TAIPEI).date()
    begin = today - timedelta(days=60)
    query = urllib.parse.urlencode({
        "isPagination": "true", "productId": "605589", "securityType": "0101",
        "reportType2": "DQGG", "reportType": "ALL", "beginDate": begin.isoformat(),
        "endDate": today.isoformat(), "pageHelp.pageSize": 100, "pageHelp.pageNo": 1,
        "pageHelp.beginPage": 1, "pageHelp.endPage": 5,
    })
    existing = {event.get("source_url"): event for event in (previous or {}).get("events", []) if event.get("source_url")}
    status = "fresh"
    try:
        payload = fetch_json(
            f"https://query.sse.com.cn/security/stock/queryCompanyBulletin.do?{query}",
            referer="https://www.sse.com.cn/", attempts=2,
        )
        announcements = payload.get("pageHelp", {}).get("data", [])
        for item in announcements:
            title = item.get("TITLE", "")
            matched = [word for word in keywords["keywords"] + keywords["negative_keywords"] if word.lower() in title.lower()]
            if not matched:
                continue
            source_url = "https://www.sse.com.cn" + item.get("URL", "")
            event_date = item.get("SSEDATE", "")
            delta = sum(value for word, value in keywords["event_rules"].items() if word.lower() in title.lower())
            price_match = re.search(r"(\d+(?:\.\d+)?)\s*[%％]", title)
            price_change = float(price_match.group(1)) if price_match else None
            if price_change is not None:
                delta += 25 if price_change >= 15 else 15 if price_change >= 5 else 0
            existing[source_url] = {
                "event_date": event_date, "title": title, "price_change": price_change,
                "source": "Shanghai Stock Exchange", "source_level": "official_filing",
                "source_url": source_url, "keywords": matched, "base_delta": delta,
                "expiry_date": (date.fromisoformat(event_date) + timedelta(days=30)).isoformat(),
            }
    except Exception:
        status = "stale" if existing else "missing"
    events = sorted(existing.values(), key=lambda item: item.get("event_date", ""), reverse=True)
    return {"updated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"), "source": "SSE official announcements", "status": status, "events": events}


def event_score(events_payload: dict) -> tuple[float, list[dict]]:
    today = datetime.now(TAIPEI).date()
    active, weighted_delta = [], 0.0
    for event in events_payload.get("events", []):
        try:
            age = (today - date.fromisoformat(event["event_date"])).days
        except Exception:
            continue
        decay = 1.0 if age <= 3 else 0.8 if age <= 7 else 0.5 if age <= 14 else 0.25 if age <= 30 else 0
        if decay:
            enriched = dict(event)
            enriched["age_days"], enriched["decay"] = age, decay
            active.append(enriched)
            weighted_delta += float(event.get("base_delta", 0)) * decay
    return round(clamp(50 + weighted_delta), 1), active


def classify(main_force: float, catalyst: float, components: dict, stock_7932: dict) -> tuple[str, str, list[str]]:
    alerts = []
    emc = components["emc_2383"]
    ccl = components["m8m9_proxy"]
    glass = components["glass_proxy"]
    change_7932 = stock_7932.get("change_pct")
    if change_7932 is not None and change_7932 < 0 and emc.get("change_pct", -999) > 2 and ccl.get("change_pct", -999) > 1.5 and glass.get("change_pct", -999) > 0 and catalyst > 70 and stock_7932.get("inventory_not_declining", True):
        alerts.append("POSITIVE_DIVERGENCE")
    if change_7932 is not None and change_7932 > 5 and emc.get("change_pct", 999) < 0 and ccl.get("change_pct", 999) < 0 and glass.get("change_pct", 999) < 0 and catalyst < 40:
        alerts.append("ISOLATED_MOVE")
    alerts.extend(ccl.get("alerts", []))
    ppo = components.get("ppo_mppo", {})
    if any(any(word in event.get("title", "") for word in ("漲價", "調價")) for event in ppo.get("active_events", [])):
        alerts.append("PPO_PRICE_HIKE")
    if main_force >= 65 and catalyst >= 65:
        return "READY_TO_IGNITE", "🔥 點火", alerts
    if main_force >= 65 and catalyst < 45:
        return "CONTROLLED_MOVE", "⚠️ 孤立拉抬", alerts
    if main_force < 50 and catalyst >= 65:
        alerts.append("POSSIBLE_CATCH_UP")
        return "POSSIBLE_CATCH_UP", "👀 等待補漲", alerts
    if main_force < 45 and catalyst < 45:
        return "RISK_OFF", "🔴 轉弱", alerts
    if main_force >= 55 or catalyst >= 55:
        return "BULLISH", "🟢 偏多", alerts
    return "NEUTRAL", "🟡 中性", alerts


def main() -> int:
    stocks_config = load_json(CONFIG / "stocks.json", {})
    baskets = load_json(CONFIG / "proxy_baskets.json", {})
    scoring = load_json(CONFIG / "scoring.json", {})
    keywords = load_json(CONFIG / "keywords.json", {})
    prior_catalyst = load_json(DATA / "catalyst.json", {})
    prior_current = load_json(DATA / "current.json", {})
    official = official_latest(stocks_config)
    stocks: dict[str, dict] = {}
    errors = []
    critical_unavailable = False
    for key, stock in stocks_config.items():
        try:
            stocks[key] = calculate_stock(key, stock, yahoo_history(stock["symbol"]), official.get(key), scoring)
        except Exception as exc:
            errors.append(f"{key}: {exc}")
            if key == "emc_2383":
                critical_unavailable = True
            previous = prior_catalyst.get("stocks", {}).get(key)
            if previous:
                stocks[key] = {**previous, "status": "stale", "source": previous.get("source", "cached") + " (cached)", "timestamp": datetime.now(TAIPEI).isoformat(timespec="seconds")}
    if "emc_2383" not in stocks:
        stock = stocks_config["emc_2383"]
        stocks["emc_2383"] = {
            "key": "emc_2383", "code": stock["code"], "name": "台光電 Direct Signal",
            "symbol": stock["symbol"], "date": datetime.now(TAIPEI).date().isoformat(),
            "price": None, "change_pct": None, "return_5d_pct": None, "trend_20d_pct": None,
            "volume": None, "volume_ratio_20d": None, "breakout_20d": False, "momentum_z": None,
            "daily_score": None, "five_day_score": None, "volume_score": None, "score": None,
            "source": "unavailable", "source_url": "https://openapi.twse.com.tw/",
            "timestamp": datetime.now(TAIPEI).isoformat(timespec="seconds"), "freshness": None,
            "status": "missing", "official_validated": False,
        }
    latest_date = max(item["date"] for item in stocks.values())
    for item in stocks.values():
        if item["date"] != latest_date and item["status"] == "fresh":
            item["status"] = "stale"
    m8m9 = basket_score("m8m9_proxy", baskets["m8m9_proxy"], stocks)
    glass = basket_score("glass_proxy", baskets["glass_proxy"], stocks)
    previous_events = load_json(DATA / "events.json", {})
    events = fetch_sse_events(keywords, previous_events)
    event_component, active_events = event_score(events)
    resin_stock = stocks.get("shengquan_605589")
    if resin_stock:
        resin_score = round(resin_stock["score"] * 0.70 + event_component * 0.30, 1)
        ppo_mppo = {
            "name": "PPO/MPPO Proxy / Event Signal", "score": resin_score,
            "proxy_change_pct": resin_stock["change_pct"], "proxy_score": resin_stock["score"],
            "event_score": event_component, "actual_price_event": next((event.get("price_change") for event in active_events if event.get("price_change") is not None), None),
            "active_events": active_events, "status": "fresh" if events["status"] == "fresh" else "partial",
            "confidence": "HIGH" if events["status"] == "fresh" else "MEDIUM",
            "source": "聖泉集團行情 + SSE 官方公告",
            "source_url": "https://www.sse.com.cn/",
            "timestamp": max(resin_stock.get("timestamp") or "", events.get("updated_at") or ""),
            "freshness": resin_stock.get("freshness"),
        }
    else:
        ppo_mppo = {
            "name": "PPO/MPPO Proxy / Event Signal", "score": None, "status": "missing",
            "confidence": "LOW", "active_events": active_events, "source": "聖泉集團行情 + SSE 官方公告",
            "source_url": "https://www.sse.com.cn/", "timestamp": events.get("updated_at"), "freshness": None,
        }
    emc_stock = stocks["emc_2383"]
    emc_score = None if emc_stock.get("daily_score") is None else round(emc_stock["daily_score"] * 0.55 + emc_stock["five_day_score"] * 0.20 + emc_stock["volume_score"] * 0.15 + (100 if emc_stock["breakout_20d"] else 50) * 0.10, 1)
    emc = {**emc_stock, "score": emc_score, "name": "台光電 Direct Signal"}
    components = {"emc_2383": emc, "m8m9_proxy": m8m9, "ppo_mppo": ppo_mppo, "glass_proxy": glass}
    component_scores = {key: value.get("score") for key, value in components.items()}
    if critical_unavailable or any(value is None for value in component_scores.values()):
        external = None
    else:
        external = round(sum(component_scores[key] * weight for key, weight in scoring["external_weights"].items()), 1)
    snapshot = load_json(DATA / "snapshot.json", {})
    main_force = float(snapshot.get("signal", {}).get("score", 0))
    market = snapshot.get("market", {})
    core_inventory = round(sum(max(float(item.get("inventory_lots") or 0), 0) for item in snapshot.get("core_brokers", [])), 2)
    previous_stock = prior_current.get("7932", {})
    prior_inventory = previous_stock.get("core_inventory_lots")
    if previous_stock.get("freshness") != snapshot.get("as_of") and prior_inventory:
        inventory_change_pct = round((core_inventory / float(prior_inventory) - 1) * 100, 2)
    else:
        inventory_change_pct = previous_stock.get("core_inventory_change_pct")
    stock_7932 = {
        "weighted_avg_price": market.get("weighted_avg_price", market.get("vwap")),
        "change_pct": market.get("weighted_avg_change_pct", market.get("change_pct")),
        "source": "TPEx EMdes010", "status": "fresh" if snapshot.get("as_of") == latest_date.replace("-", "") else "stale",
        "freshness": snapshot.get("as_of"),
        "core_inventory_lots": core_inventory,
        "core_inventory_change_pct": inventory_change_pct,
        "inventory_not_declining": inventory_change_pct is None or inventory_change_pct >= -5,
    }
    if external is None:
        signal_code, signal_label, alerts = "UNAVAILABLE", "資料不足", []
        ignition = None
    else:
        ignition = round(main_force * scoring["ignition_weights"]["main_force"] + external * scoring["ignition_weights"]["external_catalyst"], 1)
        signal_code, signal_label, alerts = classify(main_force, external, components, stock_7932)
    payload = {
        "date": latest_date, "updated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "7932": stock_7932,
        "signals": {"main_force": main_force, "external_catalyst": external, "ignition": ignition},
        "components": components, "signal": signal_code, "signal_label": signal_label,
        "alerts": list(dict.fromkeys(alerts)),
        "quality": {"status": "ok" if not errors else "partial", "errors": errors, "stock_count": len(stocks), "expected_stock_count": len(stocks_config)},
    }
    catalyst = {"date": latest_date, "updated_at": payload["updated_at"], "stocks": stocks, "components": components, "external_catalyst": external, "quality": payload["quality"]}
    save_json(DATA / "events.json", events)
    save_json(DATA / "catalyst.json", catalyst)
    save_json(DATA / "current.json", payload)
    save_json(DATA / "history" / f"{latest_date}.json", payload)
    print(f"產業點火雷達完成：{latest_date} Catalyst={external} Ignition={ignition} {signal_code}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

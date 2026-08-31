import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_catalyst.py"
SPEC = importlib.util.spec_from_file_location("update_catalyst", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_momentum_and_volume_scores():
    score, z = MODULE.momentum_score(2.0, [1, -1] * 10, 10)
    assert 50 < score <= 100
    assert z > 0
    assert MODULE.volume_score(0.6) == 30
    assert MODULE.volume_score(2.1) == 90


def test_basket_reweights_available_members():
    definition = {"label": "test", "weights": {"a": 0.6, "b": 0.4}}
    stocks = {
        "a": {
            "change_pct": 2, "return_5d_pct": 4, "trend_20d_pct": 8, "score": 70,
            "status": "fresh", "freshness": "2026-08-31", "timestamp": "2026-08-31T18:15:00+08:00",
        }
    }
    basket = MODULE.basket_score("test", definition, stocks)
    assert basket["score"] == 70
    assert basket["change_pct"] == 2
    assert basket["missing_weight"] == 0.4
    assert basket["confidence"] == "LOW"
    assert basket["status"] == "partial"


def test_six_signal_states():
    components = {
        "emc_2383": {"change_pct": 0},
        "m8m9_proxy": {"change_pct": 0, "alerts": []},
        "glass_proxy": {"change_pct": 0},
    }
    stock = {"change_pct": 0}
    assert MODULE.classify(70, 70, components, stock)[0] == "READY_TO_IGNITE"
    assert MODULE.classify(70, 40, components, stock)[0] == "CONTROLLED_MOVE"
    assert MODULE.classify(40, 70, components, stock)[0] == "POSSIBLE_CATCH_UP"
    assert MODULE.classify(40, 40, components, stock)[0] == "RISK_OFF"
    assert MODULE.classify(60, 50, components, stock)[0] == "BULLISH"
    assert MODULE.classify(50, 50, components, stock)[0] == "NEUTRAL"

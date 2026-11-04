"""Persistent record of the improvement run: champion genome + per-generation log.

This doubles as the local "leaderboard" -- you can inspect leaderboard.json to
see how each generation moved the champion and its gauntlet win-rates over time.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional


class Registry:
    def __init__(self, path: str):
        self.path = path
        self.data: Dict[str, Any] = {
            "version": 1,
            "champion": None,
            "champion_gauntlet": None,
            "generations": [],
        }
        if os.path.exists(path):
            self.load()

    def load(self) -> None:
        with open(self.path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

    def save(self) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(self.path)) or ".", exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)

    @property
    def champion(self) -> Optional[Dict[str, float]]:
        return self.data.get("champion")

    def set_champion(self, weights: Dict[str, float], gauntlet: Dict[str, float]) -> None:
        self.data["champion"] = weights
        self.data["champion_gauntlet"] = gauntlet

    def log_generation(self, record: Dict[str, Any]) -> None:
        self.data["generations"].append(record)

    @property
    def generations(self) -> List[Dict[str, Any]]:
        return self.data["generations"]

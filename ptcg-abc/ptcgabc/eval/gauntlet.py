"""Gauntlet: evaluate a candidate agent against a fixed panel of opponents.

The panel gives an *absolute* skill signal (vs random, vs the current heuristic,
vs the search agent) to complement the head-to-head-vs-champion signal the
evolutionary loop uses. A submission must clear the random baseline by a wide
margin and hold its own against search.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, List

from ..engine.base import Agent, EngineAdapter
from .arena import evaluate


@dataclass
class GauntletResult:
    winrates: Dict[str, float] = field(default_factory=dict)
    games_each: int = 0

    @property
    def mean_winrate(self) -> float:
        return sum(self.winrates.values()) / len(self.winrates) if self.winrates else 0.0

    def __str__(self) -> str:
        parts = ", ".join(f"{k}:{v:.3f}" for k, v in self.winrates.items())
        return f"gauntlet mean {self.mean_winrate:.3f} [{parts}]"


def run_gauntlet(
    engine: EngineAdapter,
    candidate: Agent,
    opponents: Dict[str, Callable[[], Agent]],
    decks: List[List[int]],
    games: int = 40,
    base_seed: int = 5000,
    max_turns: int = 200,
) -> GauntletResult:
    res = GauntletResult(games_each=games)
    for i, (name, make_opp) in enumerate(opponents.items()):
        stats = evaluate(engine, candidate, make_opp(), decks,
                         games=games, base_seed=base_seed + i * 1000, max_turns=max_turns)
        res.winrates[name] = stats.winrate_a
    return res

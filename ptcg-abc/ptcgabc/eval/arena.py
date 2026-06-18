"""Arena: play matches between two agents and aggregate statistics.

To remove first-player advantage from the measurement, ``evaluate`` alternates
which agent moves first across the sample and uses a distinct seed per game so
results are reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

from ..engine.base import Agent, EngineAdapter, MatchResult


def play_match(
    engine: EngineAdapter,
    agent_a: Agent,
    agent_b: Agent,
    decks: List[List[int]],
    seed: int = 0,
    max_turns: int = 200,
) -> MatchResult:
    return engine.play_match([agent_a, agent_b], decks, seed=seed, max_turns=max_turns)


@dataclass
class MatchStats:
    games: int
    wins_a: int
    wins_b: int
    draws: int
    avg_turns: float

    @property
    def winrate_a(self) -> float:
        return (self.wins_a + 0.5 * self.draws) / self.games if self.games else 0.0

    @property
    def winrate_b(self) -> float:
        return (self.wins_b + 0.5 * self.draws) / self.games if self.games else 0.0

    def __str__(self) -> str:
        return (f"A {self.wins_a}-{self.draws}-{self.wins_b} B "
                f"(A winrate {self.winrate_a:.3f}, {self.games} games, "
                f"avg {self.avg_turns:.1f} turns)")


def evaluate(
    engine: EngineAdapter,
    agent_a: Agent,
    agent_b: Agent,
    decks: List[List[int]],
    games: int = 50,
    base_seed: int = 1000,
    max_turns: int = 200,
) -> MatchStats:
    wins_a = wins_b = draws = 0
    total_turns = 0
    for g in range(games):
        seed = base_seed + g
        # Alternate seats so neither agent keeps the first-move advantage.
        if g % 2 == 0:
            res = play_match(engine, agent_a, agent_b, decks, seed=seed, max_turns=max_turns)
            a_seat, b_seat = 0, 1
        else:
            res = play_match(engine, agent_b, agent_a, decks, seed=seed, max_turns=max_turns)
            a_seat, b_seat = 1, 0
        total_turns += res.turns
        if res.winner == -1:
            draws += 1
        elif res.winner == a_seat:
            wins_a += 1
        else:
            wins_b += 1
    return MatchStats(games=games, wins_a=wins_a, wins_b=wins_b, draws=draws,
                      avg_turns=total_turns / games if games else 0.0)

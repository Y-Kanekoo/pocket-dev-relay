"""Engine adapter protocol shared by the mock engine and the real cabt adapter.

An engine must be able to play a full match between two agents and report the
result. Agents are plain callables with the cabt signature:

    action = agent(observation, configuration)   # action: list[int]

Keeping this surface tiny is what makes the engine swappable: the orchestrator,
arena and CLI only ever touch ``EngineAdapter.play_match``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Protocol

from ..schema import Action, Observation

Agent = Callable[[Observation, dict], Action]


@dataclass
class MatchResult:
    winner: int          # 0, 1, or -1 for draw
    turns: int
    reason: str
    prizes: List[int] = field(default_factory=lambda: [0, 0])

    @property
    def is_draw(self) -> bool:
        return self.winner == -1

    def score_for(self, seat: int) -> float:
        """1.0 win / 0.5 draw / 0.0 loss -- the usual Elo score."""
        if self.winner == -1:
            return 0.5
        return 1.0 if self.winner == seat else 0.0


class EngineAdapter(Protocol):
    name: str

    def play_match(
        self,
        agents: List[Agent],
        decks: List[List[int]],
        seed: int = 0,
        max_turns: int = 200,
    ) -> MatchResult:
        ...

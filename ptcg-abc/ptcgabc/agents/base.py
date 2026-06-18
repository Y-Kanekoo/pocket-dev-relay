"""Agent base class. An agent maps a normalized observation to an action."""

from __future__ import annotations

import random
from typing import List

from ..schema import Observation, Action


class Agent:
    name = "agent"

    def __call__(self, observation: Observation, configuration: dict) -> Action:
        return self.act(observation, configuration)

    def act(self, observation: Observation, configuration: dict) -> Action:
        raise NotImplementedError


def argmax_indices(scores: List[float], rng: random.Random) -> int:
    """Index of the max score, breaking ties uniformly at random."""
    best = max(scores)
    winners = [i for i, s in enumerate(scores) if s >= best - 1e-9]
    return rng.choice(winners)

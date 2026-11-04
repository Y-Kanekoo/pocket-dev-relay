"""Random baseline -- identical in spirit to the official sample agent:

    return random.sample(range(len(obs["select"]["option"])), obs["select"]["maxCount"])

It is the absolute anchor for the gauntlet: any agent worth submitting must beat
this convincingly.
"""

from __future__ import annotations

import random

from ..schema import Observation, Action
from .base import Agent


class RandomAgent(Agent):
    name = "random"

    def __init__(self, seed: int = 0):
        self.rng = random.Random(seed)

    def act(self, observation: Observation, configuration: dict) -> Action:
        sel = observation["select"]
        n = len(sel["option"])
        k = min(sel["maxCount"], n)
        k = max(k, sel["minCount"])
        return self.rng.sample(range(n), k)

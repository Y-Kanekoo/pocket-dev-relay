"""Shallow value-based search agent.

For each legal Option it *imagines* the resulting position (a cheap forward model
applied to the observation view) and scores it with ``features.board_value``,
then picks the option leading to the best position. This is a 1-ply expectimax
over the macro-action menu; it reliably out-plays the pure-greedy heuristic on
tactical turns (e.g. lining up a knockout) while still depending only on the
normalized observation, so it works on any engine that fills in that schema.

The forward model here is approximate by design -- it captures the dominant
effect of each macro-action (damage/KO, energy, bench development) which is what
the static evaluation cares about. With the real cabt engine you can replace
``_imagine`` with cabt's own state-copy + step for exact lookahead.
"""

from __future__ import annotations

import copy
import random
from typing import Tuple

from ..schema import (
    ATTACH_ENERGY,
    ATTACK,
    CHOOSE_ACTIVE,
    PLAY_BASIC,
    RETREAT,
    Action,
    Observation,
)
from . import features
from .base import Agent, argmax_indices
from .heuristic import HeuristicAgent, Weights


class SearchAgent(Agent):
    name = "search"

    def __init__(self, weights: Weights = None, seed: int = 0):
        self.w = weights or Weights()
        self.rng = random.Random(seed)
        # fall back to the heuristic for setup/promote choices, where a full
        # board imagination adds little.
        self._heur = HeuristicAgent(self.w, seed=seed)

    def _imagine(self, option: dict, current: dict) -> Tuple[dict, dict]:
        you = copy.deepcopy(current["you"])
        opp = copy.deepcopy(current["opponent"])
        verb = option["action"]

        if verb == ATTACK and you["active"]:
            defender = opp["active"]
            if defender:
                eff = features.effective_damage(you["active"], option["damage"], defender)
                defender["hp"] -= eff
                if defender["hp"] <= 0:
                    you["prizes_taken"] += 1
                    # promote the strongest benched defender, if any
                    if opp["bench"]:
                        opp["bench"].sort(key=features.mon_threat, reverse=True)
                        opp["active"] = opp["bench"].pop(0)
                    else:
                        opp["active"] = None
        elif verb == ATTACH_ENERGY:
            if option["target"] == "active" and you["active"]:
                you["active"]["energy"] += 1
            elif option["target"] == "bench" and you["bench"]:
                bi = min(option.get("bench_index", 0), len(you["bench"]) - 1)
                you["bench"][bi]["energy"] += 1
        elif verb == PLAY_BASIC:
            from .. import cards
            c = cards.card(option["card"])
            you["bench"].append({
                "id": c["id"], "name": c["name"], "type": c["type"],
                "hp": c["hp"], "max_hp": c["hp"], "energy": 0,
                "weakness": c.get("weakness"), "attacks": c["attacks"],
            })
        elif verb == RETREAT and you["active"] and you["bench"]:
            bi = min(option.get("bench_index", 0), len(you["bench"]) - 1)
            old = you["active"]
            old["energy"] = max(0, old["energy"] - 1)
            you["active"] = you["bench"].pop(bi)
            you["bench"].append(old)
        # END_TURN / CHOOSE_ACTIVE: evaluate the position as-is.
        return you, opp

    def act(self, observation: Observation, configuration: dict) -> Action:
        current = observation["current"]
        if current["phase"] in ("setup", "promote"):
            return self._heur.act(observation, configuration)

        opts = observation["select"]["option"]
        scores = []
        for o in opts:
            you, opp = self._imagine(o, current)
            scores.append(features.board_value(you, opp))
        idx = argmax_indices(scores, self.rng)
        return [idx]

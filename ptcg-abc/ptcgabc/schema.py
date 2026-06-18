"""Engine-agnostic, normalized observation / action schema.

The whole point of this module is decoupling: agents are written against the
*normalized* observation defined here, and each engine (the bundled mock engine,
or the real `cabt` engine once you have it from Kaggle) translates its native
observation into this schema via an adapter. Swap the engine, keep the agents.

Shapes (all plain ``dict``/``list`` so they round-trip through JSON and match
the dict-based interface that ``kaggle_environments`` / cabt use):

observation = {
    "current": {
        "turn": int,
        "phase": "setup" | "main" | "promote",
        "to_act": 0 | 1,                  # which seat must decide
        "you":      PlayerView,           # full information about yourself
        "opponent": OpponentView,         # public information only
    },
    "select": {
        "prompt": str,
        "option": [Option, ...],          # the choices; action indexes into this
        "minCount": int,
        "maxCount": int,
    },
}

An *action* is a list of integer indices into ``select["option"]`` whose length
is between ``minCount`` and ``maxCount``. This mirrors cabt, where the agent
returns the indices of the Options it selects.
"""

from __future__ import annotations

from typing import Any, Dict, List

Observation = Dict[str, Any]
Option = Dict[str, Any]
Action = List[int]

# Option action verbs used by the normalized schema.
CHOOSE_ACTIVE = "choose_active"
PLAY_BASIC = "play_basic"
ATTACH_ENERGY = "attach_energy"
ATTACK = "attack"
RETREAT = "retreat"
END_TURN = "end_turn"


def select(observation: Observation) -> Dict[str, Any]:
    return observation["select"]


def options(observation: Observation) -> List[Option]:
    return observation["select"]["option"]


def current(observation: Observation) -> Dict[str, Any]:
    return observation["current"]


def legal_action(observation: Observation, indices: Action) -> bool:
    """Validate an action against the select constraints."""
    sel = observation["select"]
    n = len(sel["option"])
    if not isinstance(indices, list):
        return False
    if not (sel["minCount"] <= len(indices) <= sel["maxCount"]):
        return False
    if len(set(indices)) != len(indices):
        return False
    return all(isinstance(i, int) and 0 <= i < n for i in indices)

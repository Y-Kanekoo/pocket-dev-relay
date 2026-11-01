"""Shared feature helpers used by the heuristic and search agents.

Everything here reads the *normalized* observation (see ``schema.py``) only, so
the agents stay engine-agnostic.
"""

from __future__ import annotations

from typing import Optional


def best_affordable_attack(mon: Optional[dict]):
    """Return the highest-damage attack the mon can currently pay for, or None."""
    if not mon:
        return None
    best = None
    for atk in mon["attacks"]:
        if mon["energy"] >= atk["cost"]:
            if best is None or atk["damage"] > best["damage"]:
                best = atk
    return best


def best_attack_if_energy(mon: Optional[dict], extra_energy: int = 1):
    """Best attack the mon could pay for with ``extra_energy`` more attached."""
    if not mon:
        return None
    best = None
    for atk in mon["attacks"]:
        if mon["energy"] + extra_energy >= atk["cost"]:
            if best is None or atk["damage"] > best["damage"]:
                best = atk
    return best


def effective_damage(attacker: dict, base_damage: int, defender: Optional[dict]) -> int:
    """Weakness-adjusted damage, mirroring cards.effective_damage but on views."""
    if defender and defender.get("weakness") and attacker["type"] == defender["weakness"]:
        return base_damage * 2
    return base_damage


def mon_threat(mon: Optional[dict]) -> float:
    """Rough offensive value of a Pokemon in play."""
    if not mon:
        return 0.0
    atk = best_affordable_attack(mon)
    dmg = atk["damage"] if atk else 0
    # potential if one more energy is attached
    pot = best_attack_if_energy(mon, 1)
    pot_dmg = pot["damage"] if pot else 0
    return dmg + 0.4 * pot_dmg + 0.1 * mon["hp"]


def board_value(you: dict, opp: dict) -> float:
    """Static evaluation of a position from ``you``'s perspective.

    Positive is good for ``you``. Combines prize race, board presence, energy
    development and the immediate damage threat of the active Pokemon.
    """
    v = 0.0
    # Prize race is the dominant term.
    v += 60.0 * (you["prizes_taken"] - opp["prizes_taken"])

    # Having an Active at all matters; losing it with no bench loses the game.
    v += 25.0 if you["active"] else -120.0
    v -= 25.0 if opp["active"] else -120.0

    # Board development.
    v += 6.0 * len(you["bench"]) - 6.0 * len(opp["bench"])

    # Energy + threat on our side vs theirs.
    v += mon_threat(you["active"]) - mon_threat(opp["active"])
    for m in you["bench"]:
        v += 0.3 * m["energy"]
    for m in opp["bench"]:
        v -= 0.3 * m["energy"]

    # Current active HP cushion.
    if you["active"]:
        v += 0.15 * you["active"]["hp"]
    if opp["active"]:
        v -= 0.15 * opp["active"]["hp"]
    return v

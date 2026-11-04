"""Card database for the bundled mock engine.

This is a deliberately small, self-contained stand-in for the ~2,000-card
Standard pool that cabt ships. It keeps the decision structure that matters for
agent skill -- energy economy, type weakness, attack thresholds, bench
development -- without trying to reproduce real Pokemon TCG rules.

When you wire in the real cabt engine + its official card list, replace the
lookups here with cabt's card data; the agents only ever see the *normalized*
MonView/CardView produced from this table, so they don't depend on these IDs.

ID scheme:
    1-99    Basic Pokemon
    101-199 Basic Energy
"""

from __future__ import annotations

from typing import Dict, List

# Energy type identity for both Pokemon and Energy cards.
TYPES = ["Fire", "Water", "Grass", "Lightning", "Fighting", "Psychic", "Normal"]

# Simple weakness chart: attacker_type -> defends-poorly type. If the attacking
# Pokemon's type is the defender's weakness, damage is doubled.
WEAKNESS = {
    "Fire": "Grass",
    "Water": "Fire",
    "Grass": "Water",
    "Lightning": "Water",
    "Fighting": "Lightning",
    "Psychic": "Fighting",
    "Normal": "Fighting",
}


def _mon(id_, name, type_, hp, attacks):
    return {
        "id": id_,
        "name": name,
        "category": "pokemon",
        "type": type_,
        "hp": hp,
        # attacks: list of (energy_cost, damage, name)
        "attacks": [{"cost": c, "damage": d, "name": n} for (c, d, n) in attacks],
        "weakness": WEAKNESS.get(type_),
        "retreat_cost": 1,
    }


def _energy(id_, name, type_):
    return {"id": id_, "name": name, "category": "energy", "type": type_}


_POKEMON = [
    _mon(1, "Charmander", "Fire", 60, [(1, 20, "Ember")]),
    _mon(2, "Squirtle", "Water", 60, [(1, 20, "Bubble")]),
    _mon(3, "Bulbasaur", "Grass", 60, [(1, 20, "Vine Whip")]),
    _mon(4, "Pikachu", "Lightning", 60, [(1, 20, "Spark"), (2, 40, "Thunder Jolt")]),
    _mon(5, "Machop", "Fighting", 70, [(1, 10, "Low Kick"), (2, 40, "Karate Chop")]),
    _mon(6, "Abra", "Psychic", 50, [(1, 20, "Confuse Ray")]),
    _mon(7, "Growlithe", "Fire", 70, [(2, 40, "Flare")]),
    _mon(8, "Psyduck", "Water", 50, [(1, 10, "Headache"), (2, 30, "Water Gun")]),
    _mon(9, "Magnemite", "Lightning", 60, [(1, 20, "Tackle")]),
    _mon(10, "Geodude", "Fighting", 80, [(2, 40, "Rock Throw")]),
    _mon(11, "Dratini", "Normal", 70, [(2, 30, "Wrap")]),
    _mon(12, "Eevee", "Normal", 60, [(2, 30, "Tackle")]),
]

_ENERGY = [
    _energy(101, "Fire Energy", "Fire"),
    _energy(102, "Water Energy", "Water"),
    _energy(103, "Grass Energy", "Grass"),
    _energy(104, "Lightning Energy", "Lightning"),
    _energy(105, "Fighting Energy", "Fighting"),
    _energy(106, "Psychic Energy", "Psychic"),
    _energy(107, "Double Colorless Energy", "Normal"),
]

CARD_DB: Dict[int, dict] = {c["id"]: c for c in (_POKEMON + _ENERGY)}


def is_pokemon(card_id: int) -> bool:
    return CARD_DB[card_id]["category"] == "pokemon"


def is_energy(card_id: int) -> bool:
    return CARD_DB[card_id]["category"] == "energy"


def card(card_id: int) -> dict:
    return CARD_DB[card_id]


def basic_pokemon_ids() -> List[int]:
    return [c["id"] for c in _POKEMON]


def energy_ids() -> List[int]:
    return [c["id"] for c in _ENERGY]


def effective_damage(attacker_type: str, base_damage: int, defender_card: dict) -> int:
    """Apply the (simplified) weakness multiplier."""
    if defender_card.get("weakness") and attacker_type == defender_card["weakness"]:
        return base_damage * 2
    return base_damage

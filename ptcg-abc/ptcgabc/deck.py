"""Deck loading and validation.

A deck is a list of 60 card IDs, exactly as cabt expects:

    deck = [int(line) for line in open("deck.csv") if line.strip()]
    env = make("cabt", configuration={"decks": [deck, deck]})

The validation rules below are the competition-style minimums (60 cards, every
card known, at least one Basic Pokemon so an opening hand can be legal). The
real cabt engine enforces the official deck-building rules; this is a fast local
pre-check so we never submit an obviously illegal deck.
"""

from __future__ import annotations

import os
from collections import Counter
from typing import List, Tuple

from . import cards

DECK_SIZE = 60


def load_deck(path: str) -> List[int]:
    """Read a deck.csv (one card ID per non-empty line; '#' comments allowed)."""
    deck: List[int] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            deck.append(int(line))
    return deck


def save_deck(deck: List[int], path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for cid in deck:
            f.write(f"{cid}\n")


def validate_deck(deck: List[int]) -> Tuple[bool, List[str]]:
    """Return (ok, errors). Mirrors the cabt-style minimum constraints."""
    errors: List[str] = []
    if len(deck) != DECK_SIZE:
        errors.append(f"deck must contain exactly {DECK_SIZE} cards, got {len(deck)}")

    unknown = sorted({cid for cid in deck if cid not in cards.CARD_DB})
    if unknown:
        errors.append(f"unknown card IDs: {unknown}")

    known = [cid for cid in deck if cid in cards.CARD_DB]
    n_basic = sum(1 for cid in known if cards.is_pokemon(cid))
    if n_basic == 0:
        errors.append("deck must contain at least one Basic Pokemon")

    # Standard-style copy limit: at most 4 of any non-energy card.
    counts = Counter(cid for cid in known if cards.is_pokemon(cid))
    over = {cid: n for cid, n in counts.items() if n > 4}
    if over:
        errors.append(f"more than 4 copies of a Pokemon: {over}")

    return (len(errors) == 0, errors)


def deck_summary(deck: List[int]) -> str:
    counts = Counter(deck)
    lines = []
    for cid, n in sorted(counts.items()):
        c = cards.CARD_DB.get(cid, {"name": f"?{cid}", "category": "?"})
        lines.append(f"  {n:>2}x [{cid}] {c['name']} ({c['category']})")
    n_poke = sum(n for cid, n in counts.items() if cid in cards.CARD_DB and cards.is_pokemon(cid))
    n_energy = sum(n for cid, n in counts.items() if cid in cards.CARD_DB and cards.is_energy(cid))
    header = f"Deck: {len(deck)} cards | {n_poke} Pokemon | {n_energy} Energy"
    return header + "\n" + "\n".join(lines)

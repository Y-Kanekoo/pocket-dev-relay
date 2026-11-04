import os

from ptcgabc import deck as deckmod

DECKS = os.path.join(os.path.dirname(__file__), "..", "decks")


def test_starter_deck_is_valid():
    d = deckmod.load_deck(os.path.join(DECKS, "starter.csv"))
    assert len(d) == 60
    ok, errors = deckmod.validate_deck(d)
    assert ok, errors


def test_aggro_deck_is_valid():
    d = deckmod.load_deck(os.path.join(DECKS, "aggro.csv"))
    ok, errors = deckmod.validate_deck(d)
    assert ok, errors


def test_invalid_deck_detected():
    ok, errors = deckmod.validate_deck([101] * 60)  # all energy, no Basic
    assert not ok
    assert any("Basic" in e for e in errors)

    ok2, errors2 = deckmod.validate_deck([4] * 59)  # wrong size + 4-copy limit
    assert not ok2

import os

from ptcgabc import deck as deckmod
from ptcgabc.agents.random_agent import RandomAgent
from ptcgabc.engine.mock import MockCabtEngine
from ptcgabc.schema import legal_action

DECK = deckmod.load_deck(os.path.join(os.path.dirname(__file__), "..", "decks", "starter.csv"))


def test_match_terminates_and_is_well_formed():
    engine = MockCabtEngine()
    res = engine.play_match([RandomAgent(1), RandomAgent(2)], [DECK, DECK], seed=0)
    assert res.winner in (-1, 0, 1)
    assert res.turns >= 1
    assert res.reason


def test_observation_schema_and_legal_actions():
    from ptcgabc.engine.mock import MockGame

    game = MockGame([DECK, DECK], seed=3)
    steps = 0
    while not game.over and steps < 2000:
        obs, seat = game.current_decision()
        assert set(obs) == {"current", "select"}
        assert obs["select"]["option"], "there must always be at least one option"
        assert obs["current"]["to_act"] == seat
        action = RandomAgent(seat).act(obs, {})
        assert legal_action(obs, action)
        game.apply(seat, action)
        steps += 1
    assert game.over


def test_determinism_same_seed():
    engine = MockCabtEngine()
    r1 = engine.play_match([RandomAgent(1), RandomAgent(2)], [DECK, DECK], seed=42)
    r2 = engine.play_match([RandomAgent(1), RandomAgent(2)], [DECK, DECK], seed=42)
    assert (r1.winner, r1.turns, r1.prizes) == (r2.winner, r2.turns, r2.prizes)

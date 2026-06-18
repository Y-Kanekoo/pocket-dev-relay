"""Command-line entry point for the PTCGABC harness.

    python -m ptcgabc.cli deck      decks/starter.csv
    python -m ptcgabc.cli match     heuristic search --deck decks/starter.csv
    python -m ptcgabc.cli eval      heuristic random --games 100
    python -m ptcgabc.cli gauntlet  heuristic --games 40
    python -m ptcgabc.cli improve   --generations 10 --out leaderboard.json
    python -m ptcgabc.cli submit    --weights champion.json --out submission
"""

from __future__ import annotations

import argparse
import json
import os

from . import deck as deckmod
from .agents.heuristic import HeuristicAgent, Weights
from .agents.random_agent import RandomAgent
from .agents.search import SearchAgent
from .engine.mock import make_engine

DEFAULT_DECK = os.path.join(os.path.dirname(__file__), "..", "decks", "starter.csv")


def _load_weights(path):
    if path and os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return Weights.from_dict(json.load(f))
    return Weights()


def make_agent(name: str, weights_path=None, seed: int = 0):
    if name == "random":
        return RandomAgent(seed=seed)
    if name == "heuristic":
        return HeuristicAgent(_load_weights(weights_path), seed=seed)
    if name == "search":
        return SearchAgent(_load_weights(weights_path), seed=seed)
    raise SystemExit(f"unknown agent: {name} (choose from random|heuristic|search)")


def _resolve_deck(path):
    path = path or DEFAULT_DECK
    deck = deckmod.load_deck(path)
    ok, errors = deckmod.validate_deck(deck)
    if not ok:
        raise SystemExit("invalid deck:\n  " + "\n  ".join(errors))
    return deck


def cmd_deck(args):
    deck = deckmod.load_deck(args.path)
    ok, errors = deckmod.validate_deck(deck)
    print(deckmod.deck_summary(deck))
    print("valid:", ok)
    for e in errors:
        print("  -", e)


def cmd_match(args):
    engine = make_engine(args.engine)
    deck = _resolve_deck(args.deck)
    a = make_agent(args.agent_a, args.weights_a, seed=1)
    b = make_agent(args.agent_b, args.weights_b, seed=2)
    res = engine.play_match([a, b], [deck, deck], seed=args.seed, max_turns=args.max_turns)
    print(f"winner={res.winner} reason={res.reason} turns={res.turns} prizes={res.prizes}")


def cmd_eval(args):
    from .eval.arena import evaluate
    engine = make_engine(args.engine)
    deck = _resolve_deck(args.deck)
    a = make_agent(args.agent_a, args.weights_a, seed=1)
    b = make_agent(args.agent_b, args.weights_b, seed=2)
    stats = evaluate(engine, a, b, [deck, deck], games=args.games, max_turns=args.max_turns)
    print(f"{args.agent_a} vs {args.agent_b}: {stats}")


def cmd_gauntlet(args):
    from .eval.gauntlet import run_gauntlet
    engine = make_engine(args.engine)
    deck = _resolve_deck(args.deck)
    cand = make_agent(args.agent, args.weights, seed=1)
    panel = {
        "random": lambda: RandomAgent(seed=7),
        "heuristic": lambda: HeuristicAgent(seed=7),
        "search": lambda: SearchAgent(seed=7),
    }
    res = run_gauntlet(engine, cand, panel, [deck, deck], games=args.games, max_turns=args.max_turns)
    print(res)


def cmd_improve(args):
    from .orchestrator.improve import ImproveConfig, improve
    engine = make_engine(args.engine)
    deck = _resolve_deck(args.deck)
    cfg = ImproveConfig(
        generations=args.generations,
        population=args.population,
        games_vs_champion=args.games,
        gauntlet_games=args.gauntlet_games,
        seed=args.seed,
        max_turns=args.max_turns,
    )
    champ, reg = improve(engine, [deck, deck], cfg, registry_path=args.out)
    if args.weights_out:
        with open(args.weights_out, "w", encoding="utf-8") as f:
            json.dump(champ.to_dict(), f, indent=2)
        print("champion weights ->", args.weights_out)
    print("leaderboard ->", args.out)


def cmd_submit(args):
    from .submission.package import build_submission, validate_submission_file
    deck = _resolve_deck(args.deck)
    weights = _load_weights(args.weights)
    agent_path = build_submission(weights, args.out, deck=deck)
    report = validate_submission_file(agent_path, [deck, deck], games=args.games)
    print("submission ->", agent_path)
    print("validation:", report)
    if report["winrate_vs_random"] < 0.6:
        print("WARNING: submission barely beats random; tune more before submitting.")


def build_parser():
    p = argparse.ArgumentParser(prog="ptcgabc", description="PTCGABC agent harness")
    p.add_argument("--engine", default="mock", help="mock | cabt")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("deck", help="validate & summarize a deck")
    d.add_argument("path")
    d.set_defaults(func=cmd_deck)

    common_deck = dict(default=None)

    m = sub.add_parser("match", help="play one match")
    m.add_argument("agent_a")
    m.add_argument("agent_b")
    m.add_argument("--deck", **common_deck)
    m.add_argument("--weights-a", default=None)
    m.add_argument("--weights-b", default=None)
    m.add_argument("--seed", type=int, default=0)
    m.add_argument("--max-turns", type=int, default=200)
    m.set_defaults(func=cmd_match)

    e = sub.add_parser("eval", help="evaluate A vs B over many games")
    e.add_argument("agent_a")
    e.add_argument("agent_b")
    e.add_argument("--deck", **common_deck)
    e.add_argument("--weights-a", default=None)
    e.add_argument("--weights-b", default=None)
    e.add_argument("--games", type=int, default=100)
    e.add_argument("--max-turns", type=int, default=200)
    e.set_defaults(func=cmd_eval)

    g = sub.add_parser("gauntlet", help="candidate vs a fixed panel")
    g.add_argument("agent")
    g.add_argument("--deck", **common_deck)
    g.add_argument("--weights", default=None)
    g.add_argument("--games", type=int, default=40)
    g.add_argument("--max-turns", type=int, default=200)
    g.set_defaults(func=cmd_gauntlet)

    i = sub.add_parser("improve", help="run the evolutionary self-improvement loop")
    i.add_argument("--deck", **common_deck)
    i.add_argument("--generations", type=int, default=10)
    i.add_argument("--population", type=int, default=6)
    i.add_argument("--games", type=int, default=40)
    i.add_argument("--gauntlet-games", type=int, default=30)
    i.add_argument("--seed", type=int, default=12345)
    i.add_argument("--max-turns", type=int, default=200)
    i.add_argument("--out", default="leaderboard.json")
    i.add_argument("--weights-out", default="champion.json")
    i.set_defaults(func=cmd_improve)

    s = sub.add_parser("submit", help="build & validate a Kaggle submission")
    s.add_argument("--deck", **common_deck)
    s.add_argument("--weights", default="champion.json")
    s.add_argument("--out", default="submission")
    s.add_argument("--games", type=int, default=40)
    s.set_defaults(func=cmd_submit)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()

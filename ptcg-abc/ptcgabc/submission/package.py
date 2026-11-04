"""ヒューリスティックエージェントを単一ファイルに書き出して検証する。"""

from __future__ import annotations

import importlib.util
import os

from .. import deck as deckmod
from ..agents.heuristic import Weights
from ..agents.random_agent import RandomAgent
from ..engine.mock import MockCabtEngine
from ..eval.arena import evaluate
from ..schema import legal_action


_AGENT_TEMPLATE = '''"""単独で実行できる提出用エージェント。"""

WEIGHTS = __WEIGHTS__


def _best_attack(mon, extra_energy=0):
    if not mon:
        return None
    available = [attack for attack in mon["attacks"]
                 if mon["energy"] + extra_energy >= attack["cost"]]
    return max(available, key=lambda attack: attack["damage"], default=None)


def _score(option, current):
    you = current["you"]
    active = you["active"]
    verb = option["action"]
    w = WEIGHTS

    if verb == "end_turn":
        return w["end_turn_base"]
    if verb == "attack":
        defender = current["opponent"]["active"]
        damage = option["damage"]
        if defender and defender.get("weakness") and active["type"] == defender["weakness"]:
            damage *= 2
        knockout = bool(defender) and damage >= defender["hp"]
        return w["attack_base"] + w["attack_damage"] * damage + (w["attack_ko"] if knockout else 0.0)
    if verb == "attach_energy":
        if option["target"] == "active" and active:
            now = _best_attack(active)
            after = _best_attack(active, 1)
            now_damage = now["damage"] if now else 0
            after_damage = after["damage"] if after else 0
            gain = max(0, after_damage - now_damage)
            maxed = after is not None and after_damage == max(attack["damage"] for attack in active["attacks"])
            value = w["attach_base"] + w["attach_active_bonus"] + w["attach_enable_gain"] * gain
            if gain == 0 and maxed:
                value -= w["attach_overflow_penalty"]
            return value
        return w["attach_base"] + w["attach_bench_bonus"]
    if verb == "play_basic":
        return w["play_basic_base"] + (w["play_basic_empty_bench"] if not you["bench"] else 0.0)
    if verb == "retreat":
        stuck = bool(active) and _best_attack(active) is None and active["energy"] == 0
        return w["retreat_base"] + (w["retreat_when_stuck"] if stuck else 0.0)
    if verb == "choose_active":
        return (w["choose_hp"] * option.get("hp", 0)
                + w["choose_attack"] * option.get("max_attack", 0)
                + w["choose_energy"] * option.get("energy", 0))
    return 0.0


def agent(observation, configuration):
    select = observation["select"]
    options = select["option"]
    minimum = int(select["minCount"])
    maximum = int(select["maxCount"])
    if not 0 <= minimum <= maximum <= len(options):
        raise ValueError("選択数が不正です")
    if maximum == 0:
        return []
    scores = [_score(option, observation["current"]) for option in options]
    ranked = sorted(range(len(options)), key=lambda index: scores[index], reverse=True)
    return ranked[:max(1, minimum)]
'''


def build_submission(weights: Weights, output_dir: str, deck: list[int]) -> str:
    """単独の agent.py と deck.csv を生成する。"""
    valid, errors = deckmod.validate_deck(deck)
    if not valid:
        raise ValueError("デッキが不正です: " + "; ".join(errors))
    os.makedirs(output_dir, exist_ok=True)
    agent_path = os.path.join(output_dir, "agent.py")
    source = _AGENT_TEMPLATE.replace("__WEIGHTS__", repr(weights.to_dict()))
    with open(agent_path, "w", encoding="utf-8") as output:
        output.write(source)
    deckmod.save_deck(deck, os.path.join(output_dir, "deck.csv"))
    return agent_path


def validate_submission_file(agent_path: str, decks: list[list[int]], games: int = 20) -> dict:
    """書き出したファイルを独立に読み込み、合法手と対戦成績を確認する。"""
    spec = importlib.util.spec_from_file_location("ptcgabc_submission_validation", agent_path)
    if spec is None or spec.loader is None:
        raise ValueError(f"エージェントを読み込めません: {agent_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    submission_agent = getattr(module, "agent", None)
    if not callable(submission_agent):
        raise ValueError("agent 関数がありません")

    class CheckedAgent:
        legal = True

        def __call__(self, observation: dict, configuration: dict) -> list[int]:
            action = submission_agent(observation, configuration)
            if not legal_action(observation, action):
                self.legal = False
                return [len(observation["select"]["option"]) - 1]
            return action

    checked = CheckedAgent()
    stats = evaluate(MockCabtEngine(), checked, RandomAgent(seed=7), decks, games=games)
    return {"legal": checked.legal, "winrate_vs_random": stats.winrate_a, "games": games}

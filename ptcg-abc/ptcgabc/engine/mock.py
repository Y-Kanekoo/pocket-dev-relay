"""MockCabtEngine -- a self-contained, offline stand-in for the cabt engine.

Why this exists
---------------
The real cabt engine + official card list are gated behind Kaggle (accept the
competition rules, download the dataset). They cannot be fetched from a sandbox.
So we ship a small, deterministic, imperfect-information stochastic card game
that exposes the *same* normalized observation/action interface the agents use.
That lets the entire harness -- agents, arena, Elo, the evolutionary improvement
loop, submission packaging -- be developed, tested and run with zero network and
zero Kaggle access. When you have the real engine, drop in ``CabtAdapter`` (see
``engine/cabt.py``); the agents and orchestrator are unchanged.

The simplified game
-------------------
* 60-card decks of card IDs (see ``cards.py``).
* Each player: active Pokemon, up to 5 bench, hand, deck, prizes-taken counter.
* A turn: draw 1 (decking out = loss), then a menu of macro-actions presented one
  at a time as a ``select`` -- play a Basic to the bench, attach one Energy
  (once per turn), retreat, attack (ends the turn), or end the turn.
* Attacks need enough Energy on the active Pokemon; weakness doubles damage.
* Knock out the opponent's active -> take a prize; 6 prizes, or leaving the
  opponent with no Pokemon in play, wins. Decking out loses.

It is intentionally NOT full Pokemon TCG rules -- it is a faithful *decision
structure* so that better policies measurably win more often.
"""

from __future__ import annotations

import random
from typing import List, Optional

from .. import cards
from ..schema import (
    ATTACH_ENERGY,
    ATTACK,
    CHOOSE_ACTIVE,
    END_TURN,
    PLAY_BASIC,
    RETREAT,
)
from .base import Agent, MatchResult

BENCH_MAX = 5
PRIZES_TO_WIN = 6
HAND_START = 7


class Mon:
    __slots__ = ("card_id", "hp", "energy")

    def __init__(self, card_id: int):
        self.card_id = card_id
        self.hp = cards.card(card_id)["hp"]
        self.energy = 0

    def clone(self) -> "Mon":
        m = Mon.__new__(Mon)
        m.card_id, m.hp, m.energy = self.card_id, self.hp, self.energy
        return m

    def view(self) -> dict:
        c = cards.card(self.card_id)
        return {
            "id": self.card_id,
            "name": c["name"],
            "type": c["type"],
            "hp": self.hp,
            "max_hp": c["hp"],
            "energy": self.energy,
            "weakness": c.get("weakness"),
            "attacks": c["attacks"],
        }


class PlayerState:
    def __init__(self, deck: List[int], rng: random.Random):
        self.deck = deck[:]
        rng.shuffle(self.deck)
        self.hand: List[int] = []
        self.active: Optional[Mon] = None
        self.bench: List[Mon] = []
        self.prizes_taken = 0
        self.energy_attached_this_turn = False

    # -- deck/hand helpers -------------------------------------------------
    def draw(self, n: int = 1) -> bool:
        """Draw n cards. Return False if the deck runs out (decking out)."""
        for _ in range(n):
            if not self.deck:
                return False
            self.hand.append(self.deck.pop())
        return True

    def has_basic_in_hand(self) -> bool:
        return any(cards.is_pokemon(c) for c in self.hand)

    def pokemon_in_play(self) -> List[Mon]:
        return ([self.active] if self.active else []) + self.bench

    def clone(self) -> "PlayerState":
        p = PlayerState.__new__(PlayerState)
        p.deck = self.deck[:]
        p.hand = self.hand[:]
        p.active = self.active.clone() if self.active else None
        p.bench = [m.clone() for m in self.bench]
        p.prizes_taken = self.prizes_taken
        p.energy_attached_this_turn = self.energy_attached_this_turn
        return p


class MockGame:
    """Full game state plus the select-based step interface."""

    def __init__(self, decks: List[List[int]], seed: int = 0, max_turns: int = 200):
        self.rng = random.Random(seed)
        self.max_turns = max_turns
        self.players = [PlayerState(decks[0], self.rng), PlayerState(decks[1], self.rng)]
        self.turn = 0
        self.ply = 0
        self.phase = "setup"
        self.to_act = 0
        self.winner: Optional[int] = None
        self.reason = ""
        self._turn_action_count = 0
        self._first_turn = True
        self._setup_done = [False, False]

        for p in self.players:
            self._opening_hand(p)

    # -- setup -------------------------------------------------------------
    def _opening_hand(self, p: PlayerState) -> None:
        # Mulligan until the opening hand contains at least one Basic.
        for _ in range(50):
            p.deck += p.hand
            p.hand = []
            self.rng.shuffle(p.deck)
            p.draw(HAND_START)
            if p.has_basic_in_hand():
                return

    # -- public game status ------------------------------------------------
    @property
    def over(self) -> bool:
        return self.winner is not None

    def _finish(self, winner: int, reason: str) -> None:
        self.winner = winner
        self.reason = reason

    # -- observation construction -----------------------------------------
    def _opponent_view(self, opp: PlayerState) -> dict:
        return {
            "active": opp.active.view() if opp.active else None,
            "bench": [m.view() for m in opp.bench],
            "hand_size": len(opp.hand),
            "deck_size": len(opp.deck),
            "prizes_taken": opp.prizes_taken,
            "prizes_remaining": PRIZES_TO_WIN - opp.prizes_taken,
        }

    def _you_view(self, you: PlayerState) -> dict:
        v = self._opponent_view(you)
        v["hand"] = [
            {**cards.card(c), "hand_index": i} for i, c in enumerate(you.hand)
        ]
        v["energy_attached_this_turn"] = you.energy_attached_this_turn
        return v

    def _legal_options(self, seat: int) -> List[dict]:
        p = self.players[seat]

        if self.phase == "promote" or (self.phase == "setup"):
            # Must choose an active Pokemon from the Basics in hand.
            opts = []
            if self.phase == "promote":
                # promote from bench
                for i, m in enumerate(p.bench):
                    c = cards.card(m.card_id)
                    opts.append({"action": CHOOSE_ACTIVE, "from": "bench",
                                 "bench_index": i, "card": m.card_id, "name": c["name"],
                                 "hp": m.hp, "energy": m.energy,
                                 "max_attack": max((a["damage"] for a in c["attacks"]), default=0)})
            else:
                for i, c in enumerate(p.hand):
                    if cards.is_pokemon(c):
                        cc = cards.card(c)
                        opts.append({"action": CHOOSE_ACTIVE, "from": "hand",
                                     "hand_index": i, "card": c, "name": cc["name"],
                                     "hp": cc["hp"], "energy": 0,
                                     "max_attack": max((a["damage"] for a in cc["attacks"]), default=0)})
            return opts

        # main phase
        opts: List[dict] = []
        # play basics to bench
        if len(p.bench) < BENCH_MAX:
            for i, c in enumerate(p.hand):
                if cards.is_pokemon(c):
                    cc = cards.card(c)
                    opts.append({"action": PLAY_BASIC, "hand_index": i,
                                 "card": c, "name": cc["name"], "hp": cc["hp"]})
        # attach energy (once per turn) to any Pokemon in play
        if not p.energy_attached_this_turn:
            energy_in_hand = [i for i, c in enumerate(p.hand) if cards.is_energy(c)]
            if energy_in_hand and p.active is not None:
                ei = energy_in_hand[0]
                opts.append({"action": ATTACH_ENERGY, "hand_index": ei,
                             "target": "active", "card": p.hand[ei]})
                for k in range(len(p.bench)):
                    opts.append({"action": ATTACH_ENERGY, "hand_index": ei,
                                 "target": "bench", "bench_index": k, "card": p.hand[ei]})
        # retreat
        if p.active is not None and p.active.energy >= cards.card(p.active.card_id)["retreat_cost"] and p.bench:
            for k, m in enumerate(p.bench):
                opts.append({"action": RETREAT, "bench_index": k,
                             "card": m.card_id, "name": cards.card(m.card_id)["name"]})
        # attacks
        if p.active is not None:
            for a_idx, atk in enumerate(cards.card(p.active.card_id)["attacks"]):
                if p.active.energy >= atk["cost"]:
                    opts.append({"action": ATTACK, "attack_index": a_idx,
                                 "name": atk["name"], "cost": atk["cost"],
                                 "damage": atk["damage"]})
        opts.append({"action": END_TURN})
        return opts

    def current_decision(self):
        """Return (observation, seat) for the player who must act."""
        seat = self.to_act
        you, opp = self.players[seat], self.players[1 - seat]
        opts = self._legal_options(seat)
        prompts = {"setup": "Choose your Active Pokemon",
                   "promote": "Promote a Pokemon to Active",
                   "main": "Choose an action"}
        obs = {
            "current": {
                "turn": self.turn,
                "phase": self.phase,
                "to_act": seat,
                "you": self._you_view(you),
                "opponent": self._opponent_view(opp),
            },
            "select": {
                "prompt": prompts[self.phase],
                "option": opts,
                "minCount": 1,
                "maxCount": 1,
            },
        }
        return obs, seat

    # -- applying actions --------------------------------------------------
    def apply(self, seat: int, action: List[int]) -> None:
        opts = self._legal_options(seat)
        # Defensive: clamp illegal/empty actions to a safe default.
        if not action or action[0] < 0 or action[0] >= len(opts):
            idx = len(opts) - 1  # END_TURN / last safe option
        else:
            idx = action[0]
        opt = opts[idx]
        verb = opt["action"]

        if verb == CHOOSE_ACTIVE:
            self._apply_choose_active(seat, opt)
        elif verb == PLAY_BASIC:
            self._apply_play_basic(seat, opt)
        elif verb == ATTACH_ENERGY:
            self._apply_attach(seat, opt)
        elif verb == RETREAT:
            self._apply_retreat(seat, opt)
        elif verb == ATTACK:
            self._apply_attack(seat, opt)
        elif verb == END_TURN:
            self._end_turn(seat)
        self.ply += 1

    def _apply_choose_active(self, seat: int, opt: dict) -> None:
        p = self.players[seat]
        if opt["from"] == "hand":
            cid = p.hand.pop(opt["hand_index"])
        else:
            cid = p.bench.pop(opt["bench_index"]).card_id
        p.active = Mon(cid)

        if self.phase == "setup":
            self._setup_done[seat] = True
            if all(self._setup_done):
                self.phase = "main"
                self.to_act = 0
                self._begin_turn(0, first=True)
            else:
                self.to_act = 1 - seat
        elif self.phase == "promote":
            # The attacker's turn already ended with the attack. Now that the
            # defender has promoted a new Active, begin the defender's turn.
            self.phase = "main"
            self._end_turn(self._turn_owner)  # begins (1 - attacker) = defender

    def _apply_play_basic(self, seat: int, opt: dict) -> None:
        p = self.players[seat]
        cid = p.hand.pop(opt["hand_index"])
        if len(p.bench) < BENCH_MAX:
            p.bench.append(Mon(cid))
        self._tick_turn_guard(seat)

    def _apply_attach(self, seat: int, opt: dict) -> None:
        p = self.players[seat]
        # remove one matching energy card from hand
        try:
            p.hand.remove(opt["card"])
        except ValueError:
            pass
        target = p.active if opt["target"] == "active" else p.bench[opt["bench_index"]]
        if target is not None:
            target.energy += 1
        p.energy_attached_this_turn = True
        self._tick_turn_guard(seat)

    def _apply_retreat(self, seat: int, opt: dict) -> None:
        p = self.players[seat]
        if p.active and p.bench:
            p.active.energy -= cards.card(p.active.card_id)["retreat_cost"]
            new_active = p.bench.pop(opt["bench_index"])
            p.bench.append(p.active)
            p.active = new_active
        self._tick_turn_guard(seat)

    def _apply_attack(self, seat: int, opt: dict) -> None:
        attacker = self.players[seat]
        defender = self.players[1 - seat]
        atk = cards.card(attacker.active.card_id)["attacks"][opt["attack_index"]]
        atk_type = cards.card(attacker.active.card_id)["type"]
        if defender.active is not None:
            dmg = cards.effective_damage(atk_type, atk["damage"], cards.card(defender.active.card_id))
            defender.active.hp -= dmg
            if defender.active.hp <= 0:
                attacker.prizes_taken += 1
                defender.active = None
        # attacking ends the turn; resolve KO / promotion first
        if attacker.prizes_taken >= PRIZES_TO_WIN:
            self._finish(seat, "prizes")
            return
        if defender.active is None:
            if defender.bench:
                # defender must promote before their turn begins
                self.phase = "promote"
                self.to_act = 1 - seat
                self._turn_owner = seat  # attacker; turn passes to defender after promote
                return
            else:
                self._finish(seat, "no_pokemon")
                return
        self._end_turn(seat)

    def _tick_turn_guard(self, seat: int) -> None:
        self._turn_action_count += 1
        if self._turn_action_count > 40:  # safety against pathological loops
            self._end_turn(seat)

    # -- turn flow ---------------------------------------------------------
    def _begin_turn(self, seat: int, first: bool = False) -> None:
        self.turn += 1
        self.to_act = seat
        self._turn_action_count = 0
        p = self.players[seat]
        p.energy_attached_this_turn = False
        if not (first and self._first_turn):
            if not p.draw(1):
                self._finish(1 - seat, "deck_out")
                return
        self._first_turn = False
        if self.turn > self.max_turns:
            self._finish_by_prizes()

    def _end_turn(self, seat: int) -> None:
        if self.over:
            return
        self._begin_turn(1 - seat)

    def _finish_by_prizes(self) -> None:
        a, b = self.players[0].prizes_taken, self.players[1].prizes_taken
        if a > b:
            self._finish(0, "turn_limit")
        elif b > a:
            self._finish(1, "turn_limit")
        else:
            self._finish(-1, "turn_limit_draw")


class MockCabtEngine:
    """EngineAdapter implementation that drives MockGame."""

    name = "mock"

    def play_match(
        self,
        agents: List[Agent],
        decks: List[List[int]],
        seed: int = 0,
        max_turns: int = 200,
    ) -> MatchResult:
        game = MockGame(decks, seed=seed, max_turns=max_turns)
        config = {"max_turns": max_turns}
        guard = 0
        while not game.over:
            guard += 1
            if guard > max_turns * 60:  # absolute backstop
                game._finish_by_prizes()
                break
            obs, seat = game.current_decision()
            try:
                action = agents[seat](obs, config)
            except Exception:
                action = [len(obs["select"]["option"]) - 1]
            if not isinstance(action, list):
                action = [int(action)]
            game.apply(seat, action)
        return MatchResult(
            winner=game.winner if game.winner is not None else -1,
            turns=game.turn,
            reason=game.reason,
            prizes=[game.players[0].prizes_taken, game.players[1].prizes_taken],
        )


def make_engine(name: str = "mock"):
    if name == "mock":
        return MockCabtEngine()
    if name == "cabt":
        from .cabt import CabtAdapter
        return CabtAdapter()
    raise ValueError(f"unknown engine: {name}")

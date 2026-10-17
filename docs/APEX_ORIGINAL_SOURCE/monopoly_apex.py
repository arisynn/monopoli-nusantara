#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MONOPOLY APEX
=============
Satu file, tanpa library tambahan (Python 3.8+). Isi:

  1. Simulator Monopoly (papan edisi AS) dengan aturan resmi yang penting:
     lelang bila tidak dibeli, bangun merata, stok 32 rumah / 12 hotel, hipotek,
     penjara (maks 3 giliran), kartu Chance & Community Chest, bangkrut, trade.
  2. ApexBot: bot heuristik berbasis "nilai portofolio" + probabilitas pendaratan
     (dihitung lewat simulasi rantai Markov), dengan:
       - beli & lelang berdasar nilai marjinal + nilai MENGHALANGI lawan,
       - trade cerdas: menawar bertahap, menolak memberi set lengkap ke lawan,
       - bangun berdasar ROI sewa per dolar; cadangan kas dari "zona bahaya"
         (sewa terbesar 2-12 petak di depan pion),
       - penguncian stok rumah (tidak naik hotel saat lawan bisa memanfaatkannya),
       - hipotek properti receh untuk membiayai pembangunan set,
       - penjara dinamis (diam di penjara saat papan berbahaya).
  3. Bot pembanding: Pemula, Hati-hati, Acak, dan Solid (Apex tanpa trik lanjutan).
  4. Benchmark, duel 1-lawan-1, self-test invarian aturan, dan tuner evolusi.

Catatan jujur: Monopoly punya unsur dadu, jadi tidak ada bot yang 100% tak
terkalahkan. Target di sini: peluang menang setinggi mungkin lawan bot lain.

Cara pakai:
  python monopoly_apex.py                          # demo cepat (benchmark kecil)
  python monopoly_apex.py --bench 200              # 4 pemain: Apex vs Solid, Pemula, Hati-hati
  python monopoly_apex.py --duel 100               # Apex vs tiap bot, 1 lawan 1
  python monopoly_apex.py --play                   # satu game lengkap dengan log
  python monopoly_apex.py --selftest               # cek invarian aturan
  python monopoly_apex.py --tune 10 --games 60     # tuning parameter lewat self-play
  python monopoly_apex.py --bench 200 --params apex_params.json

Memasang ApexBot ke engine Monopoly milikmu sendiri: ApexBot hanya butuh objek `g`
dengan atribut owner/level/mort/houses/hotels/P (pemain: cash,pos,cards,jturns,dead)
dan method rent/has_set/gbuild/can_build/build/mortgage/unmortgage/unmort_cost
(semuanya ada di kelas Game di bawah). Keputusan diambil lewat buy_decision,
auction_bid, manage, jail_decision, propose_trades, accept_trade.
"""
import argparse
import json
import math
import os
import random
import sys
import time
from multiprocessing import Pool

# ═══════════════════════════ 1. PAPAN (edisi standar AS) ═══════════════════════════
N = 40
_SQ = []


def _street(name, price, grp, rents, hc):
    _SQ.append((name, 'street', price, grp, rents, hc))


def _rail(name):
    _SQ.append((name, 'rail', 200, 'rail', (25, 50, 100, 200), 0))


def _util(name):
    _SQ.append((name, 'util', 150, 'util', (), 0))


def _misc(name, kind, amount=0):
    _SQ.append((name, kind, amount, None, (), 0))


_misc('GO', 'go')
_street('Mediterranean Ave', 60, 'brown', (2, 10, 30, 90, 160, 250), 50)
_misc('Community Chest', 'chest')
_street('Baltic Ave', 60, 'brown', (4, 20, 60, 180, 320, 450), 50)
_misc('Income Tax', 'tax', 200)
_rail('Reading Railroad')
_street('Oriental Ave', 100, 'lblue', (6, 30, 90, 270, 400, 550), 50)
_misc('Chance', 'chance')
_street('Vermont Ave', 100, 'lblue', (6, 30, 90, 270, 400, 550), 50)
_street('Connecticut Ave', 120, 'lblue', (8, 40, 100, 300, 450, 600), 50)
_misc('Jail / Just Visiting', 'jail')
_street('St. Charles Pl', 140, 'pink', (10, 50, 150, 450, 625, 750), 100)
_util('Electric Company')
_street('States Ave', 140, 'pink', (10, 50, 150, 450, 625, 750), 100)
_street('Virginia Ave', 160, 'pink', (12, 60, 180, 500, 700, 900), 100)
_rail('Pennsylvania RR')
_street('St. James Pl', 180, 'orange', (14, 70, 200, 550, 750, 950), 100)
_misc('Community Chest', 'chest')
_street('Tennessee Ave', 180, 'orange', (14, 70, 200, 550, 750, 950), 100)
_street('New York Ave', 200, 'orange', (16, 80, 220, 600, 800, 1000), 100)
_misc('Free Parking', 'free')
_street('Kentucky Ave', 220, 'red', (18, 90, 250, 700, 875, 1050), 150)
_misc('Chance', 'chance')
_street('Indiana Ave', 220, 'red', (18, 90, 250, 700, 875, 1050), 150)
_street('Illinois Ave', 240, 'red', (20, 100, 300, 750, 925, 1100), 150)
_rail('B&O Railroad')
_street('Atlantic Ave', 260, 'yellow', (22, 110, 330, 800, 975, 1150), 150)
_street('Ventnor Ave', 260, 'yellow', (22, 110, 330, 800, 975, 1150), 150)
_util('Water Works')
_street('Marvin Gardens', 280, 'yellow', (24, 120, 360, 850, 1025, 1200), 150)
_misc('Go To Jail', 'gotojail')
_street('Pacific Ave', 300, 'green', (26, 130, 390, 900, 1100, 1275), 200)
_street('North Carolina Ave', 300, 'green', (26, 130, 390, 900, 1100, 1275), 200)
_misc('Community Chest', 'chest')
_street('Pennsylvania Ave', 320, 'green', (28, 150, 450, 1000, 1200, 1400), 200)
_rail('Short Line')
_misc('Chance', 'chance')
_street('Park Place', 350, 'dblue', (35, 175, 500, 1100, 1300, 1500), 200)
_misc('Luxury Tax', 'tax', 100)
_street('Boardwalk', 400, 'dblue', (50, 200, 600, 1400, 1700, 2000), 200)
assert len(_SQ) == N

NAME = [s[0] for s in _SQ]
KIND = [s[1] for s in _SQ]
PRICE = [s[2] for s in _SQ]          # untuk petak pajak: jumlah pajak
GROUP_OF = [s[3] for s in _SQ]
RENTS = [s[4] for s in _SQ]          # street: (dasar, 1r, 2r, 3r, 4r, hotel)
HCOST = [s[5] for s in _SQ]
GROUPS = {}
for _i, _g in enumerate(GROUP_OF):
    if _g:
        GROUPS.setdefault(_g, []).append(_i)
OWNABLE = [i for i in range(N) if KIND[i] in ('street', 'rail', 'util')]
STREET_GROUPS = [g for g in GROUPS if g not in ('rail', 'util')]
_STREETSET = set(STREET_GROUPS)
RAILS, UTILS = GROUPS['rail'], GROUPS['util']
DICE_P = [0.0] * 13
for _s in range(2, 13):
    DICE_P[_s] = (6 - abs(_s - 7)) / 36.0

# Kartu (disederhanakan dari edisi AS). 'jailcard' = Get Out of Jail Free.
CHANCE = [
    ('goto', 0), ('goto', 24), ('goto', 11), ('nearest', 'util'),
    ('nearest', 'rail'), ('nearest', 'rail'), ('cash', 50), ('jailcard',),
    ('back', 3), ('tojail',), ('repairs', 25, 100), ('cash', -15),
    ('goto', 5), ('goto', 39), ('eachpay', 50), ('cash', 150),
]
CHEST = [
    ('goto', 0), ('cash', 200), ('cash', -50), ('cash', 50), ('jailcard',),
    ('tojail',), ('cash', 100), ('cash', 20), ('eachget', 10), ('cash', 100),
    ('cash', -100), ('cash', -50), ('cash', 25), ('repairs', 40, 115),
    ('cash', 10), ('cash', 100),
]
JAIL_ID = {'chance': 7, 'chest': 4}   # indeks kartu 'jailcard' di tiap tumpukan


def _compute_land(turns=60000, seed=7):
    """Perkiraan rata-rata jumlah pendaratan per giliran di tiap petak
    (rantai Markov via simulasi: dadu, double, penjara, kartu gerak)."""
    r = random.Random(seed)
    cnt = [0] * N
    pos = 0
    for _ in range(turns):
        dc = 0
        while True:
            a, b = r.randint(1, 6), r.randint(1, 6)
            dbl = a == b
            if dbl:
                dc += 1
                if dc == 3:
                    pos = 10
                    cnt[10] += 1
                    break
            pos = (pos + a + b) % N
            cnt[pos] += 1
            sent = False
            for _hop in range(3):
                k = KIND[pos]
                if k == 'gotojail':
                    pos = 10
                    cnt[10] += 1
                    sent = True
                    break
                if k not in ('chance', 'chest'):
                    break
                c = (CHANCE if k == 'chance' else CHEST)[r.randrange(16)]
                t = c[0]
                if t == 'goto':
                    pos = c[1]
                elif t == 'nearest':
                    tg = RAILS if c[1] == 'rail' else UTILS
                    pos = min(tg, key=lambda x: (x - pos) % N or N)
                elif t == 'back':
                    pos = (pos - 3) % N
                elif t == 'tojail':
                    pos = 10
                    cnt[10] += 1
                    sent = True
                    break
                else:
                    break
                cnt[pos] += 1
            if sent or not dbl:
                break
    return [c / turns for c in cnt]


LAND = _compute_land()


# ═══════════════════════════════ 2. ENGINE ═══════════════════════════════
class Offer:
    """Penawaran trade: pemain `a` memberi (a_props + a_cash), pemain `b` memberi (b_props + b_cash)."""
    __slots__ = ('a', 'b', 'a_props', 'a_cash', 'b_props', 'b_cash')

    def __init__(self, a, b, a_props=(), a_cash=0, b_props=(), b_cash=0):
        self.a, self.b = a, b
        self.a_props, self.a_cash = tuple(a_props), int(a_cash)
        self.b_props, self.b_cash = tuple(b_props), int(b_cash)


class Player:
    __slots__ = ('id', 'pol', 'cash', 'pos', 'jail', 'jturns', 'cards', 'dead')

    def __init__(self, pid, pol, cash):
        self.id, self.pol, self.cash = pid, pol, cash
        self.pos, self.jail, self.jturns = 0, False, 0
        self.cards, self.dead = [], False


class Game:
    def __init__(self, policies, seed=0, max_rounds=400, verbose=False, start_cash=1500):
        self.rng = random.Random(seed)
        self.P = [Player(i, pol, start_cash) for i, pol in enumerate(policies)]
        self.n = len(self.P)
        self.owner = [-1] * N
        self.level = [0] * N            # 0..4 rumah, 5 = hotel
        self.mort = [False] * N
        self.houses, self.hotels = 32, 12
        self.decks = {'chance': list(range(16)), 'chest': list(range(16))}
        self.rng.shuffle(self.decks['chance'])
        self.rng.shuffle(self.decks['chest'])
        self.round, self.max_rounds, self.verbose = 0, max_rounds, verbose
        self.dice, self.order, self.trades = 7, [], 0

    # ── util ──
    def say(self, msg):
        if self.verbose:
            print(f'[r{self.round:03d}] {msg}')

    def n_alive(self):
        return sum(1 for p in self.P if not p.dead)

    def has_set(self, pid, grp):
        return all(self.owner[m] == pid for m in GROUPS[grp])

    def gbuild(self, grp):
        return any(self.level[m] for m in GROUPS[grp])

    def unmort_cost(self, i):
        return PRICE[i] // 2 + PRICE[i] // 20

    def rent(self, i, dice=7, special=None):
        o = self.owner[i]
        if o < 0 or self.mort[i]:
            return 0
        k = KIND[i]
        if k == 'street':
            lv = self.level[i]
            r = RENTS[i][lv]
            if lv == 0 and self.has_set(o, GROUP_OF[i]):
                r *= 2
            return r
        if k == 'rail':
            c = sum(1 for x in RAILS if self.owner[x] == o)
            return RENTS[i][c - 1] * (2 if special == 'rail2' else 1)
        c = sum(1 for x in UTILS if self.owner[x] == o)
        return dice * (10 if (special == 'util10' or c == 2) else 4)

    def net_worth(self, pid):
        w = self.P[pid].cash
        for i in OWNABLE:
            if self.owner[i] == pid:
                w += PRICE[i] // 2 if self.mort[i] else PRICE[i]
                w += self.level[i] * HCOST[i]
        return w

    # ── properti: bangun / jual / gadai ──
    def can_build(self, pid, i):
        if KIND[i] != 'street' or self.owner[i] != pid:
            return False
        mem = GROUPS[GROUP_OF[i]]
        if not all(self.owner[m] == pid and not self.mort[m] for m in mem):
            return False
        lv = self.level[i]
        if lv >= 5 or lv != min(self.level[m] for m in mem):
            return False
        return self.hotels > 0 if lv == 4 else self.houses > 0

    def build(self, pid, i):
        lv = self.level[i]
        self.P[pid].cash -= HCOST[i]
        if lv == 4:
            self.hotels -= 1
            self.houses += 4
        else:
            self.houses -= 1
        self.level[i] = lv + 1
        if self.verbose:
            self.say(f'{self.P[pid].pol.name} bangun di {NAME[i]} -> level {lv + 1}')

    def sell_level(self, pid, i):
        lv, hc = self.level[i], HCOST[i]
        p = self.P[pid]
        if lv == 5:
            k = min(4, self.houses)
            p.cash += (5 - k) * hc // 2
            self.houses -= k
            self.hotels += 1
            self.level[i] = k
        else:
            p.cash += hc // 2
            self.houses += 1
            self.level[i] = lv - 1

    def mortgage(self, pid, i):
        if self.owner[i] != pid or self.mort[i] or self.gbuild(GROUP_OF[i]):
            return False
        self.mort[i] = True
        self.P[pid].cash += PRICE[i] // 2
        return True

    def unmortgage(self, pid, i):
        c = self.unmort_cost(i)
        if self.owner[i] != pid or not self.mort[i] or self.P[pid].cash < c:
            return False
        self.P[pid].cash -= c
        self.mort[i] = False
        return True

    def group_power(self, pid, grp):
        return sum(RENTS[m][self.level[m]] * LAND[m] for m in GROUPS[grp] if self.owner[m] == pid)

    # ── uang, likuidasi, bangkrut ──
    def pay(self, pid, amt, to=None):
        p = self.P[pid]
        if amt <= 0:
            return True
        if p.cash < amt:
            self.liquidate(pid, amt)
        if p.cash < amt:
            self.go_bankrupt(pid, to)
            return False
        p.cash -= amt
        if to is not None:
            self.P[to].cash += amt
        return True

    def liquidate(self, pid, need):
        """Cairkan aset sampai kas >= need. Urutan: gadai properti receh -> jual bangunan -> gadai sisanya."""
        p = self.P[pid]
        kv = p.pol.keep_value
        while p.cash < need:
            c = [i for i in OWNABLE if self.owner[i] == pid and not self.mort[i]
                 and not self.gbuild(GROUP_OF[i]) and not self.has_set(pid, GROUP_OF[i])]
            if not c:
                break
            self.mortgage(pid, min(c, key=lambda j: kv(self, pid, j)))
        while p.cash < need:
            gs = [g for g in STREET_GROUPS if any(self.level[m] and self.owner[m] == pid for m in GROUPS[g])]
            if not gs:
                break
            g = min(gs, key=lambda x: self.group_power(pid, x))
            self.sell_level(pid, max(GROUPS[g], key=lambda m: self.level[m]))
        while p.cash < need:
            c = [i for i in OWNABLE if self.owner[i] == pid and not self.mort[i]]
            if not c:
                break
            self.mortgage(pid, min(c, key=lambda j: kv(self, pid, j)))

    def go_bankrupt(self, pid, creditor):
        p = self.P[pid]
        for i in OWNABLE:
            if self.owner[i] == pid and self.level[i]:
                if self.level[i] == 5:
                    self.hotels += 1
                else:
                    self.houses += self.level[i]
                self.level[i] = 0
        props = [i for i in OWNABLE if self.owner[i] == pid]
        p.dead = True
        self.order.append(pid)
        self.say(f'*** {p.pol.name} BANGKRUT (kreditur: {self.P[creditor].pol.name if creditor is not None else "bank"})')
        if creditor is not None and not self.P[creditor].dead:
            c = self.P[creditor]
            c.cash += p.cash
            p.cash = 0
            for i in props:
                self.owner[i] = creditor
                if self.mort[i]:
                    c.cash -= min(PRICE[i] // 20, c.cash)
            c.cards += p.cards
            p.cards = []
        else:
            p.cash = 0
            for dk in p.cards:
                self.decks[dk].append(JAIL_ID[dk])
            p.cards = []
            for i in props:
                self.owner[i] = -1
                self.mort[i] = False
            starter = next((q.id for q in self.P if not q.dead), None)
            if starter is not None:
                for i in props:
                    self.auction(i, starter)

    # ── lelang ──
    def auction(self, i, starter):
        bids = []
        for k in range(self.n):
            pid = (starter + k) % self.n
            q = self.P[pid]
            if q.dead:
                continue
            b = min(int(q.pol.auction_bid(self, pid, i)), q.cash)
            if b >= 1:
                bids.append((b, self.rng.random(), pid))
        if not bids:
            return None
        bids.sort(reverse=True)
        price = min(bids[0][0], bids[1][0] + 1) if len(bids) > 1 else 1
        w = bids[0][2]
        self.P[w].cash -= price
        self.owner[i] = w
        if self.verbose:
            self.say(f'LELANG {NAME[i]} -> {self.P[w].pol.name} (${price}, harga ${PRICE[i]})')
        return w

    # ── gerak & pendaratan ──
    def send_to_jail(self, pid):
        p = self.P[pid]
        p.pos, p.jail, p.jturns = 10, True, 0

    def use_card(self, pid):
        p = self.P[pid]
        dk = p.cards.pop()
        self.decks[dk].append(JAIL_ID[dk])

    def move_to(self, pid, idx):
        p = self.P[pid]
        if idx <= p.pos:
            p.cash += 200
        p.pos = idx

    def advance(self, pid, steps):
        p = self.P[pid]
        np_ = p.pos + steps
        if np_ >= N:
            p.cash += 200
        p.pos = np_ % N
        self.land(pid)

    def land(self, pid, special=None, depth=0):
        p = self.P[pid]
        i = p.pos
        k = KIND[i]
        if k in ('street', 'rail', 'util'):
            o = self.owner[i]
            if o == -1:
                if p.cash >= PRICE[i] and p.pol.buy_decision(self, pid, i):
                    p.cash -= PRICE[i]
                    self.owner[i] = pid
                    if self.verbose:
                        self.say(f'{p.pol.name} beli {NAME[i]} (${PRICE[i]})')
                else:
                    self.auction(i, pid)
            elif o != pid and not self.mort[i]:
                d = self.dice
                if special == 'util10':
                    d = self.rng.randint(1, 6) + self.rng.randint(1, 6)
                self.pay(pid, self.rent(i, d, special), to=o)
        elif k == 'tax':
            self.pay(pid, PRICE[i])
        elif k == 'gotojail':
            self.send_to_jail(pid)
        elif k in ('chance', 'chest') and depth < 4:
            self.draw_card(pid, k, depth)

    def draw_card(self, pid, deck, depth):
        p = self.P[pid]
        d = self.decks[deck]
        cid = d.pop(0)
        card = (CHANCE if deck == 'chance' else CHEST)[cid]
        t = card[0]
        if t != 'jailcard':
            d.append(cid)
        if t == 'goto':
            self.move_to(pid, card[1])
            self.land(pid, depth=depth + 1)
        elif t == 'nearest':
            tg = RAILS if card[1] == 'rail' else UTILS
            self.move_to(pid, min(tg, key=lambda x: (x - p.pos) % N or N))
            self.land(pid, special='rail2' if card[1] == 'rail' else 'util10', depth=depth + 1)
        elif t == 'cash':
            if card[1] >= 0:
                p.cash += card[1]
            else:
                self.pay(pid, -card[1])
        elif t == 'jailcard':
            p.cards.append(deck)
        elif t == 'back':
            p.pos = (p.pos - 3) % N
            self.land(pid, depth=depth + 1)
        elif t == 'tojail':
            self.send_to_jail(pid)
        elif t == 'repairs':
            nh = sum(self.level[i] for i in OWNABLE if self.owner[i] == pid and self.level[i] < 5)
            nho = sum(1 for i in OWNABLE if self.owner[i] == pid and self.level[i] == 5)
            self.pay(pid, card[1] * nh + card[2] * nho)
        elif t == 'eachpay':
            for q in [q for q in self.P if not q.dead and q.id != pid]:
                if p.dead:
                    break
                self.pay(pid, card[1], to=q.id)
        elif t == 'eachget':
            for q in [q for q in self.P if not q.dead and q.id != pid]:
                if p.dead:
                    break
                self.pay(q.id, card[1], to=pid)

    # ── trade ──
    def try_trade(self, off):
        a, b = off.a, off.b
        A, B = self.P[a], self.P[b]
        if a == b or A.dead or B.dead:
            return False
        if off.a_cash < 0 or off.b_cash < 0 or off.a_cash > A.cash or off.b_cash > B.cash:
            return False
        if not (off.a_props or off.b_props or off.a_cash or off.b_cash):
            return False
        for i in off.a_props:
            if self.owner[i] != a or self.gbuild(GROUP_OF[i]):
                return False
        for i in off.b_props:
            if self.owner[i] != b or self.gbuild(GROUP_OF[i]):
                return False
        fee_a = sum(PRICE[i] // 20 for i in off.b_props if self.mort[i])
        fee_b = sum(PRICE[i] // 20 for i in off.a_props if self.mort[i])
        if A.cash - off.a_cash + off.b_cash < fee_a or B.cash - off.b_cash + off.a_cash < fee_b:
            return False
        if not B.pol.accept_trade(self, b, off):
            return False
        A.cash += off.b_cash - off.a_cash - fee_a
        B.cash += off.a_cash - off.b_cash - fee_b
        for i in off.a_props:
            self.owner[i] = b
        for i in off.b_props:
            self.owner[i] = a
        self.trades += 1
        if self.verbose:
            self.say(f'TRADE {A.pol.name}: {[NAME[i] for i in off.a_props]}+${off.a_cash}  <->  '
                     f'{B.pol.name}: {[NAME[i] for i in off.b_props]}+${off.b_cash}')
        return True

    def trade_phase(self, pid):
        p = self.P[pid]
        for _ in range(3):
            ok = False
            for off in p.pol.propose_trades(self, pid):
                if self.try_trade(off):
                    ok = True
                    break
            if not ok:
                p.pol.trade_idle(self, pid)
                break

    # ── satu giliran ──
    def play_turn(self, pid):
        p = self.P[pid]
        self.trade_phase(pid)
        p.pol.manage(self, pid, 'pre')
        if p.jail:
            act = p.pol.jail_decision(self, pid)
            if act == 'card' and p.cards:
                self.use_card(pid)
                p.jail = False
            elif act == 'pay' and p.cash >= 50:
                p.cash -= 50
                p.jail = False
        doubles = 0
        while not p.dead:
            d1, d2 = self.rng.randint(1, 6), self.rng.randint(1, 6)
            total, dbl = d1 + d2, d1 == d2
            self.dice = total
            if p.jail:
                if dbl:
                    p.jail, dbl = False, False
                else:
                    p.jturns += 1
                    if p.jturns < 3:
                        break
                    if p.cards:
                        self.use_card(pid)
                    elif not self.pay(pid, 50):
                        break
                    p.jail = False
            elif dbl:
                doubles += 1
                if doubles == 3:
                    self.send_to_jail(pid)
                    break
            self.advance(pid, total)
            if p.dead or p.jail or not dbl:
                break
        if not p.dead:
            p.pol.manage(self, pid, 'post')

    def run(self, check=False):
        while self.n_alive() > 1 and self.round < self.max_rounds:
            self.round += 1
            for p in self.P:
                if p.dead:
                    continue
                self.play_turn(p.id)
                if check:
                    self.check()
                if self.n_alive() <= 1:
                    break
        return self.standings()

    def standings(self):
        alive = sorted([p.id for p in self.P if not p.dead], key=lambda i: -self.net_worth(i))
        return alive + self.order[::-1]          # urutan terbaik -> terburuk

    def check(self):
        h = sum(self.level[i] for i in OWNABLE if self.level[i] < 5)
        ho = sum(1 for i in OWNABLE if self.level[i] == 5)
        assert h + self.houses == 32 and self.houses >= 0, ('rumah', h, self.houses)
        assert ho + self.hotels == 12 and self.hotels >= 0, ('hotel', ho, self.hotels)
        for p in self.P:
            if p.dead:
                assert not any(self.owner[i] == p.id for i in OWNABLE), 'bangkrut masih punya properti'
            else:
                assert p.cash >= 0, ('kas negatif', p.id, p.cash)
        for i in OWNABLE:
            assert not (self.mort[i] and self.owner[i] < 0), 'gadai tanpa pemilik'
            assert not (self.level[i] and self.owner[i] < 0), 'bangunan tanpa pemilik'
        for g in STREET_GROUPS:
            m = GROUPS[g]
            if any(self.level[x] for x in m):
                assert all(self.owner[x] == self.owner[m[0]] and not self.mort[x] for x in m), ('grup', g)


# ═══════════════════════════════ 3. BOT ═══════════════════════════════
class Policy:
    name = 'base'

    def buy_decision(self, g, pid, i):
        return True

    def auction_bid(self, g, pid, i):
        return 0

    def jail_decision(self, g, pid):
        return 'roll'

    def manage(self, g, pid, phase):
        pass

    def accept_trade(self, g, pid, off):
        return False

    def propose_trades(self, g, pid):
        return []

    def trade_idle(self, g, pid):
        pass

    def keep_value(self, g, pid, i):
        return PRICE[i]


def legal_builds(g, pid):
    out = []
    for grp in STREET_GROUPS:
        if g.has_set(pid, grp):
            out.extend(i for i in GROUPS[grp] if g.can_build(pid, i))
    return out


def _side(off, pid):
    """(properti diterima, kas diterima, properti diberikan, kas diberikan) dari sudut pandang pid."""
    if pid == off.b:
        return off.a_props, off.a_cash, off.b_props, off.b_cash
    return off.b_props, off.b_cash, off.a_props, off.a_cash


class RandomBot(Policy):
    name = 'Acak'

    def __init__(self, seed=0):
        self.r = random.Random(seed)

    def buy_decision(self, g, pid, i):
        return self.r.random() < 0.5

    def auction_bid(self, g, pid, i):
        return self.r.randint(0, min(g.P[pid].cash, PRICE[i]))

    def jail_decision(self, g, pid):
        p = g.P[pid]
        c = ['roll'] + (['card'] if p.cards else []) + (['pay'] if p.cash >= 50 else [])
        return self.r.choice(c)

    def manage(self, g, pid, phase):
        p = g.P[pid]
        for i in legal_builds(g, pid):
            if self.r.random() < 0.3 and p.cash >= HCOST[i] and g.can_build(pid, i):
                g.build(pid, i)
        for i in OWNABLE:
            if g.owner[i] == pid and g.mort[i] and p.cash > 600:
                g.unmortgage(pid, i)

    def accept_trade(self, g, pid, off):
        return self.r.random() < 0.3


class GreedyBot(Policy):
    """'Pemula': beli semua, bangun apa saja yang termurah sampai kas habis, trade 'adil' menurut harga kartu."""
    name = 'Pemula'

    def auction_bid(self, g, pid, i):
        return min(g.P[pid].cash, PRICE[i])

    def jail_decision(self, g, pid):
        p = g.P[pid]
        if p.cards:
            return 'card'
        return 'pay' if p.cash >= 200 else 'roll'

    def manage(self, g, pid, phase):
        p = g.P[pid]
        for i in OWNABLE:
            if g.owner[i] == pid and g.mort[i] and p.cash - g.unmort_cost(i) >= 300:
                g.unmortgage(pid, i)
        for _ in range(60):
            c = [i for i in legal_builds(g, pid) if HCOST[i] <= p.cash]
            if not c:
                break
            g.build(pid, min(c, key=lambda j: (HCOST[j], j)))

    def accept_trade(self, g, pid, off):
        gp, gc, vp, vc = _side(off, pid)
        for i in vp:
            if KIND[i] == 'street' and g.has_set(pid, GROUP_OF[i]):
                return False
        get = sum(PRICE[i] for i in gp) + gc
        give = sum(PRICE[i] for i in vp) + vc
        for grp in {GROUP_OF[i] for i in gp if KIND[i] == 'street'}:
            if all(g.owner[m] == pid or m in gp for m in GROUPS[grp]):
                get += 400
        return get >= give * 1.05


class CautiousBot(Policy):
    """'Hati-hati': simpan kas besar, jarang beli/bangun, trade hanya bila untung besar."""
    name = 'Hati-hati'

    def buy_decision(self, g, pid, i):
        return g.P[pid].cash - PRICE[i] >= 350

    def auction_bid(self, g, pid, i):
        return max(0, min(g.P[pid].cash - 350, int(PRICE[i] * 0.8)))

    def jail_decision(self, g, pid):
        return 'card' if g.P[pid].cards else 'roll'

    def manage(self, g, pid, phase):
        p = g.P[pid]
        for i in OWNABLE:
            if g.owner[i] == pid and g.mort[i] and p.cash - g.unmort_cost(i) >= 700:
                g.unmortgage(pid, i)
        for _ in range(30):
            c = [i for i in legal_builds(g, pid) if p.cash - HCOST[i] >= 600]
            if not c:
                break
            g.build(pid, max(c, key=lambda j: RENTS[j][min(g.level[j] + 1, 5)] - RENTS[j][g.level[j]]))

    def accept_trade(self, g, pid, off):
        gp, gc, vp, vc = _side(off, pid)
        for i in vp:
            if KIND[i] == 'street' and g.has_set(pid, GROUP_OF[i]):
                return False
        return sum(PRICE[i] for i in gp) + gc >= (sum(PRICE[i] for i in vp) + vc) * 1.3


# Parameter ApexBot (hasil tuning self-play; lihat --tune). Bisa ditimpa lewat --params file.json
APEX_PARAMS = dict(
    roi_exp=1.0, rail_mult=1.8, util_mult=1.2,
    set_mult=2.4, rail_partial=0.8, util_partial=0.6,
    partial_bonus=0.5, contested_mult=0.8, deny_w=0.6,
    buy_thresh=0.55, buy_floor=80.0, buy_danger=0.25,
    bid_aggr=1.0,
    reserve_base=120.0, reserve_danger=0.7,
    build_level=3, lvl4_cash=800.0, rich_cash=1600.0,
    hoard=1, hoard_bank=8.0,
    unmort_floor=100.0, mort_build=1, junk_keep=220.0,
    cash_weight=1.2,
    trade=1, trade_lambda=0.6, trade_margin=30.0, trade_keep=120.0,
    trade_min_gain=80.0, gift_pen=300.0,
    jail_smart=1, jail_danger=70.0, jail_cash=250.0,
)
# 'Solid': Apex tanpa trik lanjutan (tidak menghitung untung lawan, tanpa kunci rumah, dst.)
SOLID_PARAMS = dict(APEX_PARAMS, hoard=0, mort_build=0, jail_smart=0, deny_w=0.0,
                    trade_lambda=0.0, gift_pen=0.0, reserve_danger=0.0, buy_danger=0.0)

# Ruang pencarian untuk tuner (batas bawah, batas atas)
PARAM_SPACE = {
    'roi_exp': (0.3, 2.0), 'rail_mult': (0.8, 3.0), 'util_mult': (0.3, 2.0),
    'set_mult': (1.3, 4.5), 'rail_partial': (0.2, 2.0), 'util_partial': (0.0, 1.5),
    'partial_bonus': (0.0, 1.5), 'contested_mult': (0.4, 1.2), 'deny_w': (0.0, 1.2),
    'buy_thresh': (0.3, 1.2), 'buy_floor': (0, 300), 'buy_danger': (0.0, 1.0),
    'bid_aggr': (0.5, 1.6), 'reserve_base': (0, 400), 'reserve_danger': (0.0, 1.5),
    'lvl4_cash': (300, 2000), 'rich_cash': (600, 3500), 'hoard_bank': (0, 20),
    'unmort_floor': (0, 400), 'junk_keep': (50, 500), 'cash_weight': (0.8, 2.0),
    'trade_lambda': (0.0, 1.2), 'trade_margin': (0, 300), 'trade_keep': (0, 400),
    'trade_min_gain': (20, 400), 'gift_pen': (0, 1500),
    'jail_danger': (10, 200), 'jail_cash': (50, 800),
}


class ApexBot(Policy):
    """
    Ide inti: nilai sebuah aset = perubahan nilai PORTOFOLIO. Nilai satu grup warna
    bergantung pada siapa yang memegang bagian lainnya (set lengkap bernilai besar,
    grup 'diperebutkan' bernilai kecil). Dengan satu fungsi nilai yang sama bot:
      - membeli/menawar properti (nilai untuk aku + nilai menghalangi lawan),
      - menilai trade (untung aku dikurangi lambda * untung lawan, dan penalti
        bila lawan mendapat set lengkap),
      - memutuskan apa yang dipertahankan saat harus mencairkan aset.
    """

    def __init__(self, params=None, name='Apex'):
        self.name = name
        self.p = dict(APEX_PARAMS)
        if params:
            self.p.update(params)
        self.gw = self._weights()
        self.cool = {}

    # ── bobot grup dari ROI nyata (sewa 3 rumah x peluang mendarat / investasi) ──
    def _weights(self):
        roi = {}
        for grp, mem in GROUPS.items():
            if grp == 'rail':
                inc, inv = sum(100 * LAND[m] for m in mem), sum(PRICE[m] for m in mem)
            elif grp == 'util':
                inc, inv = sum(49 * LAND[m] for m in mem), sum(PRICE[m] for m in mem)
            else:
                inc = sum(RENTS[m][3] * LAND[m] for m in mem)
                inv = sum(PRICE[m] for m in mem) + 3 * len(mem) * HCOST[mem[0]]
            roi[grp] = inc / inv
        mean = sum(roi.values()) / len(roi)
        gw = {g: (r / mean) ** self.p['roi_exp'] for g, r in roi.items()}
        gw['rail'] *= self.p['rail_mult']
        gw['util'] *= self.p['util_mult']
        return gw

    def gv(self, owner, me, grp):
        """Nilai grup `grp` bagi pemain `me` untuk susunan kepemilikan `owner`."""
        mem = GROUPS[grp]
        n = len(mem)
        mine = foreign = psum = 0
        for m in mem:
            o = owner[m]
            if o == me:
                mine += 1
                psum += PRICE[m]
            elif o >= 0:
                foreign += 1
        if not mine:
            return 0.0
        v = psum * self.gw[grp]
        if grp == 'rail':
            return v * (1 + self.p['rail_partial'] * (mine - 1) / (n - 1))
        if grp == 'util':
            return v * (1 + self.p['util_partial'] * (mine - 1))
        if mine == n:
            return v * self.p['set_mult']
        if foreign == 0:
            return v * (1 + self.p['partial_bonus'] * mine / n)
        return v * self.p['contested_mult']

    def delta_if_get(self, g, me, i):
        owner = g.owner
        grp = GROUP_OF[i]
        before = self.gv(owner, me, grp)
        old = owner[i]
        owner[i] = me
        after = self.gv(owner, me, grp)
        owner[i] = old
        return after - before

    def acq_value(self, g, me, i):
        v = self.delta_if_get(g, me, i)
        dw = self.p['deny_w']
        if dw > 0:
            best = 0.0
            for q in g.P:
                if not q.dead and q.id != me:
                    d = self.delta_if_get(g, q.id, i)
                    if d > best:
                        best = d
            v += dw * best
        return v

    def keep_value(self, g, pid, i):
        grp = GROUP_OF[i]
        before = self.gv(g.owner, pid, grp)
        old = g.owner[i]
        g.owner[i] = -1
        after = self.gv(g.owner, pid, grp)
        g.owner[i] = old
        return before - after

    # ── bahaya: sewa terbesar (terbobot peluang) di 2-12 petak depan ──
    def danger(self, g, pid):
        pos = g.P[pid].pos
        worst = 0.0
        for step in range(2, 13):
            i = (pos + step) % N
            o = g.owner[i]
            if o < 0 or o == pid or g.mort[i]:
                continue
            v = g.rent(i, step) * min(1.0, 6 * DICE_P[step])
            if v > worst:
                worst = v
        return worst

    # ── beli & lelang ──
    def buy_decision(self, g, pid, i):
        price = PRICE[i]
        val = self.acq_value(g, pid, i)
        if val < self.p['buy_thresh'] * price:
            return False
        floor = self.p['buy_floor'] + self.p['buy_danger'] * self.danger(g, pid)
        if val > 1.8 * price:
            floor = 0
        return g.P[pid].cash - price >= floor

    def auction_bid(self, g, pid, i):
        val = self.acq_value(g, pid, i) * self.p['bid_aggr']
        floor = 0 if val > 1.8 * PRICE[i] else self.p['buy_floor'] * 0.5
        return max(0, min(val, g.P[pid].cash - floor))

    # ── penjara ──
    def jail_decision(self, g, pid):
        p = g.P[pid]
        if self.p['jail_smart'] and p.jturns < 2 and p.cash > self.p['jail_cash']:
            td = sum(LAND[i] * g.rent(i, 7) for i in OWNABLE
                     if g.owner[i] >= 0 and g.owner[i] != pid and not g.mort[i])
            if td > self.p['jail_danger']:
                return 'roll'
        if p.cards:
            return 'card'
        return 'pay' if p.cash >= 50 else 'roll'

    # ── bangun / gadai ──
    def _hoard_block(self, g, pid):
        if not self.p['hoard'] or g.houses > self.p['hoard_bank']:
            return False
        for q in g.P:
            if q.dead or q.id == pid:
                continue
            for grp in STREET_GROUPS:
                if g.has_set(q.id, grp) and any(g.level[m] < 4 for m in GROUPS[grp]):
                    return True
        return False

    def _best_build(self, g, pid, reserve=None):
        p = g.P[pid]
        tgt = int(round(self.p['build_level']))
        if p.cash > self.p['lvl4_cash']:
            tgt = max(tgt, 4)
        if p.cash > self.p['rich_cash']:
            tgt = 5
        best = None
        for grp in STREET_GROUPS:
            if not g.has_set(pid, grp):
                continue
            for i in GROUPS[grp]:
                if not g.can_build(pid, i):
                    continue
                lv = g.level[i]
                if lv >= tgt or (lv == 4 and self._hoard_block(g, pid)):
                    continue
                cost = HCOST[i]
                if reserve is not None and p.cash - cost < reserve:
                    continue
                r0 = RENTS[i][0] * 2 if lv == 0 else RENTS[i][lv]
                sc = (RENTS[i][lv + 1] - r0) * LAND[i] / cost
                if best is None or sc > best[0]:
                    best = (sc, i)
        return best[1] if best else None

    def _build(self, g, pid):
        reserve = self.p['reserve_base'] + self.p['reserve_danger'] * self.danger(g, pid)
        for _ in range(40):
            i = self._best_build(g, pid, reserve)
            if i is None:
                break
            g.build(pid, i)

    def _fund_build(self, g, pid):
        """Gadaikan properti receh bila itu memungkinkan satu pembangunan yang menguntungkan."""
        p = g.P[pid]
        reserve = self.p['reserve_base'] * 0.5
        for _ in range(6):
            i = self._best_build(g, pid)
            if i is None:
                return
            need = HCOST[i] + reserve - p.cash
            if need > 0:
                junk = [j for j in OWNABLE if g.owner[j] == pid and not g.mort[j]
                        and not g.gbuild(GROUP_OF[j]) and not g.has_set(pid, GROUP_OF[j])
                        and self.keep_value(g, pid, j) < self.p['junk_keep']]
                junk.sort(key=lambda j: self.keep_value(g, pid, j))
                got, pick = 0, []
                for j in junk:
                    pick.append(j)
                    got += PRICE[j] // 2
                    if got >= need:
                        break
                if got < need:
                    return
                for j in pick:
                    g.mortgage(pid, j)
            g.build(pid, i)

    def _unmortgage(self, g, pid, critical):
        p = g.P[pid]
        mort = [i for i in OWNABLE if g.owner[i] == pid and g.mort[i]]
        if critical:
            mort = [i for i in mort if KIND[i] == 'street' and g.has_set(pid, GROUP_OF[i])]
        mort.sort(key=lambda i: -self.keep_value(g, pid, i))
        base = self.p['reserve_base']
        for i in mort:
            floor = base * 0.5 if critical else base + self.p['unmort_floor']
            if p.cash - g.unmort_cost(i) >= floor:
                g.unmortgage(pid, i)

    def manage(self, g, pid, phase):
        self._unmortgage(g, pid, True)
        self._build(g, pid)
        if self.p['mort_build']:
            self._fund_build(g, pid)
        self._unmortgage(g, pid, False)

    # ── trade ──
    def _score(self, g, me, off):
        owner = g.owner
        a, b = off.a, off.b
        opp = b if me == a else a
        chg = [(i, b) for i in off.a_props] + [(i, a) for i in off.b_props]
        grps = {GROUP_OF[i] for i, _ in chg}
        bm = sum(self.gv(owner, me, x) for x in grps)
        bo = sum(self.gv(owner, opp, x) for x in grps)
        comp_b = {x for x in grps if x in _STREETSET and all(owner[m] == opp for m in GROUPS[x])}
        olds = [(i, owner[i]) for i, _ in chg]
        for i, nw in chg:
            owner[i] = nw
        am = sum(self.gv(owner, me, x) for x in grps)
        ao = sum(self.gv(owner, opp, x) for x in grps)
        gift = sum(1 for x in grps if x in _STREETSET and x not in comp_b
                   and all(owner[m] == opp for m in GROUPS[x]))
        for i, o in olds:
            owner[i] = o
        pay, recv = (off.a_cash, off.b_cash) if me == a else (off.b_cash, off.a_cash)
        cw = self.p['cash_weight']
        d_me = am - bm + cw * (recv - pay)
        d_op = ao - bo + cw * (pay - recv)
        s = d_me - self.p['trade_lambda'] * d_op - self.p['gift_pen'] * gift
        return s, d_me, d_op, g.P[me].cash + recv - pay

    def accept_trade(self, g, pid, off):
        if not self.p['trade']:
            return False
        s, d_me, _, cash_after = self._score(g, pid, off)
        return s >= self.p['trade_margin'] and d_me > 0 and cash_after >= self.p['trade_keep'] * 0.4

    def trade_idle(self, g, pid):
        self.cool[pid] = g.round + 2

    def propose_trades(self, g, me):
        if not self.p['trade'] or g.round < self.cool.get(me, 0):
            return []
        P, owner = g.P[me], g.owner
        targets = []
        for grp, mem in GROUPS.items():
            if g.gbuild(grp) or not any(owner[m] == me for m in mem):
                continue
            for m in mem:
                if owner[m] >= 0 and owner[m] != me:
                    gain = self.delta_if_get(g, me, m)
                    if gain >= self.p['trade_min_gain']:
                        targets.append((gain, m))
        if not targets:
            return []
        targets.sort(reverse=True)
        cap = P.cash - self.p['trade_keep']
        offers = []
        for _, m in targets[:3]:
            o, price = owner[m], PRICE[m]
            for f in (0.9, 1.3, 1.8, 2.5, 3.5, 5.0):
                amt = int(price * f)
                if 0 < amt <= cap:
                    offers.append(Offer(me, o, (), amt, (m,), 0))
            spare = [j for j in OWNABLE if owner[j] == me and not g.gbuild(GROUP_OF[j])
                     and GROUP_OF[j] != GROUP_OF[m]]
            spare.sort(key=lambda j: self.keep_value(g, me, j))
            for j in spare[:3]:
                for f in (0, 0.4, 1.0, 1.8):
                    amt = int(price * f)
                    if amt <= cap:
                        offers.append(Offer(me, o, (j,), amt, (m,), 0))
        scored = []
        for off in offers:
            s, d_me, _, ca = self._score(g, me, off)
            if s >= self.p['trade_margin'] and d_me > 0 and ca >= self.p['trade_keep'] * 0.4:
                scored.append((s, off))
        scored.sort(key=lambda t: -t[0])
        return [off for _, off in scored[:12]]


# ═══════════════════════════ 4. BENCHMARK, TUNER, CLI ═══════════════════════════
def make(name, seed=0, pmap=None):
    pmap = pmap or {}
    if name in pmap:
        return ApexBot(pmap[name], name)
    if name == 'apex':
        return ApexBot(APEX_PARAMS, 'Apex')
    if name == 'solid':
        return ApexBot(SOLID_PARAMS, 'Solid')
    if name == 'pemula':
        return GreedyBot()
    if name == 'cautious':
        return CautiousBot()
    if name == 'random':
        return RandomBot(seed)
    raise ValueError('bot tidak dikenal: ' + name)


def _play_one(task):
    k, lineup, seed, pmap, max_rounds = task
    r = k % len(lineup)
    names = lineup[r:] + lineup[:r]                      # rotasi kursi agar adil
    g = Game([make(nm, seed * 31 + j, pmap) for j, nm in enumerate(names)],
             seed=seed, max_rounds=max_rounds)
    order = g.run()
    ranks = [(names[pid], rk) for rk, pid in enumerate(order)]
    return ranks, g.round, g.n_alive() > 1, g.trades


def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 0.0
    ph = k / n
    d = 1 + z * z / n
    c = ph + z * z / (2 * n)
    m = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))
    return (c - m) / d, (c + m) / d


def run_games(lineup, games, workers, seed, pmap=None, max_rounds=400, pool=None):
    tasks = [(k, lineup, seed + k, pmap, max_rounds) for k in range(games)]
    if pool is not None:
        return pool.map(_play_one, tasks, chunksize=max(1, games // (workers * 4)))
    if workers <= 1:
        return [_play_one(t) for t in tasks]
    with Pool(workers) as pl:
        return pl.map(_play_one, tasks, chunksize=max(1, games // (workers * 4)))


def summarize(results, lineup):
    n = len(results)
    wins = {nm: 0 for nm in lineup}
    place = {nm: 0.0 for nm in lineup}
    for ranks, _, _, _ in results:
        for nm, rk in ranks:
            place[nm] += rk
            if rk == 0:
                wins[nm] += 1
    capped = sum(1 for r in results if r[2])
    avg_rounds = sum(r[1] for r in results) / n
    avg_trades = sum(r[3] for r in results) / n
    return n, wins, place, capped, avg_rounds, avg_trades


def bench(games, lineup, workers, seed, pmap=None, max_rounds=400):
    t = time.time()
    res = run_games(lineup, games, workers, seed, pmap, max_rounds)
    n, wins, place, capped, ar, at = summarize(res, lineup)
    base = 100 / len(lineup)
    print(f'\n{n} game | {len(lineup)} pemain | kursi dirotasi | acak murni = {base:.0f}% menang')
    print(f'{"bot":<12}{"menang":>8}{"CI 95%":>16}{"peringkat rata2":>18}')
    for nm in sorted(lineup, key=lambda x: -wins[x]):
        lo, hi = wilson(wins[nm], n)
        print(f'{nm:<12}{100 * wins[nm] / n:>7.1f}%{f"[{100 * lo:.0f}-{100 * hi:.0f}%]":>16}'
              f'{place[nm] / n + 1:>18.2f}')
    print(f'rata2 {ar:.0f} ronde/game, {at:.1f} trade/game, {capped} game berhenti di batas ronde '
          f'(pemenang = kekayaan bersih terbesar) | {time.time() - t:.0f} dtk')


def duel(games, workers, seed):
    for opp in ('solid', 'pemula', 'cautious', 'random'):
        lineup = ['apex', opp]
        res = run_games(lineup, games, workers, seed)
        n, wins, _, capped, ar, _ = summarize(res, lineup)
        lo, hi = wilson(wins['apex'], n)
        print(f'Apex vs {opp:<9}: menang {100 * wins["apex"] / n:5.1f}%  CI95 [{100 * lo:.0f}-{100 * hi:.0f}%]'
              f'  ({n} game, ~{ar:.0f} ronde, {capped} habis-ronde)')


def play(lineup, seed, max_rounds):
    pols = [make(nm, seed + j) for j, nm in enumerate(lineup)]
    g = Game(pols, seed=seed, max_rounds=max_rounds, verbose=True)
    order = g.run()
    print('\n== HASIL ==')
    for rk, pid in enumerate(order):
        p = g.P[pid]
        print(f'{rk + 1}. {p.pol.name:<10} kekayaan bersih ${g.net_worth(pid)}' + (' (bangkrut)' if p.dead else ''))


def selftest(n=40):
    t = time.time()
    fails = 0
    pool = ['random', 'pemula', 'cautious', 'apex', 'solid']
    for s in range(n):
        rr = random.Random(s)
        names = [rr.choice(pool) for _ in range(rr.randint(2, 6))]
        g = Game([make(nm, s * 7 + j) for j, nm in enumerate(names)], seed=s, max_rounds=250)
        try:
            g.run(check=True)
        except AssertionError as e:
            fails += 1
            print('GAGAL seed', s, names, e)
    print(f'selftest: {n} game dengan pengecekan invarian tiap giliran, gagal = {fails}, {time.time() - t:.1f} dtk')
    return fails


def _mutate(params, sigma, rng):
    c = dict(params)
    keys = rng.sample(list(PARAM_SPACE), k=max(3, len(PARAM_SPACE) // 3))
    for k in keys:
        lo, hi = PARAM_SPACE[k]
        c[k] = min(hi, max(lo, c[k] + rng.gauss(0, sigma * (hi - lo))))
    return c


def _score_rank(rk, n):
    return (n - 1 - rk) / (n - 1) + (0.5 if rk == 0 else 0.0)


def tune(gens, games, workers, seed, lam=6, max_rounds=400):
    """(1+lambda)-ES lewat self-play: kandidat vs juara saat ini + Solid + Pemula (kursi dirotasi)."""
    rng = random.Random(seed)
    champ = dict(APEX_PARAMS)
    sigma = 0.15
    lineup = ['cand', 'champ', 'solid', 'pemula']
    t0 = time.time()
    pool = Pool(workers) if workers > 1 else None
    try:
        for gen in range(gens):
            best = None
            for _ in range(lam):
                cand = _mutate(champ, sigma, rng)
                res = run_games(lineup, games, workers, seed + gen * 997,
                                {'cand': cand, 'champ': champ}, max_rounds, pool)
                sc = {'cand': 0.0, 'champ': 0.0}
                for ranks, _, _, _ in res:
                    for nm, rk in ranks:
                        if nm in sc:
                            sc[nm] += _score_rank(rk, len(lineup))
                diff = (sc['cand'] - sc['champ']) / len(res)
                if best is None or diff > best[0]:
                    best = (diff, cand)
            tag = 'tidak berubah'
            if best[0] > 0.03:
                champ, sigma, tag = best[1], min(0.35, sigma * 1.15), 'DIGANTI'
            else:
                sigma = max(0.05, sigma * 0.88)
            print(f'generasi {gen + 1}/{gens}: selisih terbaik {best[0]:+.3f} -> juara {tag} '
                  f'(sigma {sigma:.2f}, {time.time() - t0:.0f} dtk)', flush=True)
            with open('apex_params.json', 'w') as f:
                json.dump({k: (round(v, 3) if isinstance(v, float) else v) for k, v in champ.items()}, f, indent=1)
    finally:
        if pool:
            pool.close()
    print('\nParameter terbaik disimpan di apex_params.json (pakai: --params apex_params.json)')
    return champ


def main():
    ap = argparse.ArgumentParser(description='Monopoly Apex: simulator + bot terkuat (satu file)')
    ap.add_argument('--bench', type=int, metavar='N', help='jumlah game benchmark')
    ap.add_argument('--duel', type=int, metavar='N', help='game per lawan (1 lawan 1)')
    ap.add_argument('--play', action='store_true', help='mainkan satu game dengan log')
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--tune', type=int, metavar='GENERASI')
    ap.add_argument('--games', type=int, default=60, help='game per kandidat saat tuning')
    ap.add_argument('--workers', type=int, default=max(1, os.cpu_count() or 1))
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--rounds', type=int, default=400, help='batas ronde per game')
    ap.add_argument('--lineup', default='apex,solid,pemula,cautious',
                    help='daftar bot: apex,solid,pemula,cautious,random')
    ap.add_argument('--params', help='file JSON parameter Apex (hasil --tune)')
    a = ap.parse_args()
    if a.params:
        with open(a.params) as f:
            APEX_PARAMS.update(json.load(f))
    lineup = [x.strip() for x in a.lineup.split(',')]
    if a.selftest:
        sys.exit(1 if selftest() else 0)
    elif a.play:
        play(lineup, a.seed, a.rounds)
    elif a.duel:
        duel(a.duel, a.workers, a.seed)
    elif a.tune:
        tune(a.tune, a.games, a.workers, a.seed, max_rounds=a.rounds)
    else:
        bench(a.bench or 40, lineup, a.workers, a.seed, None, a.rounds)


if __name__ == '__main__':
    main()

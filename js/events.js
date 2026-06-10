(function() {
    'use strict';

    /**
     * ════════════════════════════════════════════════════════
     *  EVENTS ENGINE
     *  Manages random world events that fire every 7–15 turns.
     *
     *  HOW TO ADD A NEW EVENT:
     *  1. Add an entry to EventsEngine.REGISTRY below.
     *  2. Each entry must have:
     *       id        {string}   – unique key
     *       name      {string}   – display name
     *       icon      {string}   – emoji shown in notification
     *       condition {function(hexMap) → bool}  – optional guard
     *       apply     {function(hexMap) → result}
     *         result: { message, duration?, detail? }
     *           message  – notification text shown to player
     *           duration – ms to show notification (default 4500)
     *           detail   – extra internal data (optional)
     *  3. That's it. The scheduler picks events randomly from REGISTRY.
     * ════════════════════════════════════════════════════════
     */
    window.EventsEngine = {

        // ─── Internal state ────────────────────────────────
        _nextEventTurn: 0,          // turn on which the next event fires
        _activeEffects: [],         // [ { type, turnsLeft, ...params } ]

        // ─── Public ────────────────────────────────────────

        /** Call once per new game to reset state. */
        reset: function() {
            this._nextEventTurn = this._rollNextTurn(1);
            this._activeEffects = [];
        },

        /**
         * Called by HexMap.processTurn() before economy is calculated.
         * Returns an array of event result objects that UI should display.
         * Active multi-turn effects are also ticked here.
         */
        processTurn: function(hexMap, currentTurn) {
            const fired = [];

            // Tick active effects
            this._activeEffects = this._activeEffects.filter(e => {
                e.turnsLeft--;
                return e.turnsLeft > 0;
            });

            // Try to fire scheduled event
            if (currentTurn >= this._nextEventTurn) {
                const event = this._pickEvent(hexMap);
                if (event) {
                    const result = event.apply(hexMap);
                    result.id   = event.id;
                    result.icon = event.icon;
                    result.name = event.name;
                    fired.push(result);
                }
                // Always reschedule, even if no eligible event found
                this._nextEventTurn = this._rollNextTurn(currentTurn);
            }

            return fired;
        },

        /**
         * Applies active multi-turn effects to deltas.
         * Called by EconomyEngine.computeDeltas().
         */
        applyActiveEffects: function(hexMap, deltas) {
            for (const effect of this._activeEffects) {
                if (effect.type === 'drought') {
                    // Reduce wheat production from farms
                    const farms = Object.values(hexMap.buildings).filter(b => b.type === 'farm');
                    deltas.wheat -= Math.min(farms.length * effect.reduction, deltas.wheat);
                    // Reduce apple production from orchards
                    const orchards = Object.values(hexMap.buildings).filter(b => b.type === 'orchard');
                    deltas.apples -= Math.min(orchards.length * effect.reduction, deltas.apples);
                }
                if (effect.type === 'strike') {
                    // Strike disables a specific building's production
                    // Handled in computeDeltas via _strikeTarget
                }
            }
        },

        /** Returns active drought effect, or null. Used by UI for status display. */
        getActiveDrought: function() {
            return this._activeEffects.find(e => e.type === 'drought') || null;
        },

        /** Returns active strike effect, or null. */
        getActiveStrike: function() {
            return this._activeEffects.find(e => e.type === 'strike') || null;
        },

        // ─── Private helpers ───────────────────────────────

        _rollNextTurn: function(fromTurn) {
            return fromTurn + 7 + Math.floor(Math.random() * 9); // 7–15
        },

        _pickEvent: function(hexMap) {
            const eligible = this.REGISTRY.filter(ev =>
                !ev.condition || ev.condition(hexMap)
            );
            if (eligible.length === 0) return null;
            return eligible[Math.floor(Math.random() * eligible.length)];
        },

        // ════════════════════════════════════════════════════
        //  EVENT REGISTRY
        //  Add new events here — no other file needs touching.
        // ════════════════════════════════════════════════════
        REGISTRY: [

            // ── 1. ЗАСУХА ───────────────────────────────────
            {
                id:   'drought',
                name: 'Засуха',
                icon: '☀️',
                condition: function(hexMap) {
                    // Only relevant if player has farms or orchards
                    return Object.values(hexMap.buildings).some(
                        b => b.type === 'farm' || b.type === 'orchard'
                    );
                },
                apply: function(hexMap) {
                    const duration   = 3 + Math.floor(Math.random() * 3); // 3–5 turns
                    const reduction  = 1; // -1 unit per farm/orchard per turn
                    window.EventsEngine._activeEffects.push({
                        type: 'drought', turnsLeft: duration, reduction
                    });
                    return {
                        message:  `☀️ Засуха! Урожай пшеницы и яблок падает на 1 в течение ${duration} ходов.`,
                        duration: 5000
                    };
                }
            },

            // ── 2. МИГРАЦИЯ ─────────────────────────────────
            {
                id:   'migration',
                name: 'Миграция',
                icon: '🚶',
                condition: function(hexMap) {
                    return hexMap.resources.population >= 5;
                },
                apply: function(hexMap) {
                    const pct  = 0.10 + Math.random() * 0.10;         // 10–20 %
                    const lost = Math.max(1, Math.floor(hexMap.resources.population * pct));
                    hexMap.resources.population = Math.max(0, hexMap.resources.population - lost);
                    return {
                        message:  `🚶 Миграция! ${lost} жителей покинули страну (${Math.round(pct * 100)}% населения).`,
                        duration: 5000
                    };
                }
            },

            // ── 3. НАБЕГ ────────────────────────────────────
            {
                id:   'raid',
                name: 'Набег',
                icon: '⚔️',
                condition: function(hexMap) {
                    // Only fires when there's something to lose
                    return hexMap.resources.money > 0 || hexMap.resources.bread > 0 || hexMap.resources.defense > 0;
                },
                apply: function(hexMap) {
                    const pop     = Math.floor(hexMap.resources.population);
                    const defense = Math.floor(hexMap.resources.defense);
                    if (defense < pop) {
                        // Overwhelmed — lose all money and bread
                        const lostMoney = hexMap.resources.money;
                        const lostBread = hexMap.resources.bread;
                        hexMap.resources.money = 0;
                        hexMap.resources.bread = 0;
                        return {
                            message: `⚔️ Набег! Защиты не хватило — разграблено ${lostMoney} 💰 и ${lostBread} 🍞!`,
                            duration: 6000
                        };
                    } else {
                        // Repelled — but all defense points spent
                        const spent = hexMap.resources.defense;
                        hexMap.resources.defense = 0;
                        return {
                            message: `⚔️ Набег отражён! Потрачено ${spent} 🛡️ очков обороны.`,
                            duration: 5000
                        };
                    }
                }
            },

            // ── 4. ХОРОШИЙ УРОЖАЙ ───────────────────────────
            {
                id:   'good_harvest',
                name: 'Хороший урожай',
                icon: '🌻',
                condition: function(hexMap) {
                    return Object.values(hexMap.buildings).some(b => b.type === 'farm');
                },
                apply: function(hexMap) {
                    const farms  = Object.values(hexMap.buildings).filter(b => b.type === 'farm');
                    const bonus  = farms.length * 5;
                    hexMap.resources.wheat += bonus;
                    return {
                        message:  `🌻 Хороший урожай! Каждая из ${farms.length} ферм дала +5 пшеницы. Итого: +${bonus} 🌾`,
                        duration: 4500
                    };
                }
            },

            // ── 5. НЕСЧАСТНЫЙ СЛУЧАЙ ────────────────────────
            {
                id:   'accident',
                name: 'Несчастный случай',
                icon: '💀',
                condition: function(hexMap) {
                    // Need at least one building with a worker
                    return Object.values(hexMap.buildings).some(b => (b.assignedWorkers || 0) > 0);
                },
                apply: function(hexMap) {
                    // Collect all buildings that have at least 1 worker
                    const active = Object.values(hexMap.buildings).filter(
                        b => (b.assignedWorkers || 0) > 0
                    );
                    // Pick one at random and remove one worker
                    const target = active[Math.floor(Math.random() * active.length)];
                    target.assignedWorkers = Math.max(0, (target.assignedWorkers || 1) - 1);
                    hexMap.resources.population = Math.max(0, hexMap.resources.population - 1);
                    const cfg  = window.GameConfig.BUILDINGS[target.type];
                    const name = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    return {
                        message:  `💀 Несчастный случай! Работник в «${name}» погиб.`,
                        duration: 5000
                    };
                }
            },

            // ── 6. ПОЖАР ────────────────────────────────────
            {
                id:   'fire',
                name: 'Пожар',
                icon: '🔥',
                condition: function(hexMap) {
                    // Need at least one destroyable building
                    return Object.values(hexMap.buildings).some(
                        b => b.type !== 'townhall' && b.type !== 'local_admin'
                    );
                },
                apply: function(hexMap) {
                    const destroyable = Object.values(hexMap.buildings).filter(
                        b => b.type !== 'townhall' && b.type !== 'local_admin'
                    );
                    const target = destroyable[Math.floor(Math.random() * destroyable.length)];
                    const cfg = window.GameConfig.BUILDINGS[target.type];
                    const name = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    // Remove workers back to free pool (population is kept, just reassigned)
                    // building is simply deleted — auto-cleanup handles excess workers
                    delete hexMap.buildings[target.col + ',' + target.row];
                    hexMap.recalculateTerritory();
                    return {
                        message:  `Пожар уничтожил ${name} [${target.col}, ${target.row}]! Здание сгорело дотла.`,
                        duration: 5500
                    };
                }
            },

            // ── 7. МОРСКАЯ УДАЧА ───────────────────────────
            {
                id:   'sea_fortune',
                name: 'Морская удача',
                icon: '⚓',
                condition: function(hexMap) {
                    return Object.values(hexMap.buildings).some(b => b.type === 'port');
                },
                apply: function(hexMap) {
                    const ports = Object.values(hexMap.buildings).filter(b => b.type === 'port');
                    const pct   = 0.15 + Math.random() * 0.05; // 15–20%
                    const bonus = Math.floor(hexMap.resources.money * pct);
                    hexMap.resources.money += bonus;
                    return {
                        message:  `⚓ Морская удача! ${ports.length} порт(а) принёс(ли) дополнительно ${bonus} 💰 (+${Math.round(pct * 100)}% к бюджету).`,
                        duration: 5000
                    };
                }
            },

            // ── 8. АЛМАЗЫ! ──────────────────────────────────
            {
                id:   'diamonds',
                name: 'Алмазы!',
                icon: '💎',
                condition: function(hexMap) {
                    return Object.values(hexMap.buildings).some(b => b.type === 'mine');
                },
                apply: function(hexMap) {
                    const mines = Object.values(hexMap.buildings).filter(b => b.type === 'mine');
                    const pct   = 0.05 + Math.random() * 0.05; // 5–10%
                    const bonus = Math.floor(hexMap.resources.money * pct);
                    hexMap.resources.money += bonus;
                    return {
                        message:  `💎 Алмазы! Шахтёры нашли драгоценные камни! +${bonus} 💰 (+${Math.round(pct * 100)}% к бюджету).`,
                        duration: 5000
                    };
                }
            },

            // ── 9. БОЛЬШЕ ЯБЛОК! ───────────────────────────
            {
                id:   'more_apples',
                name: 'Больше яблок!',
                icon: '🍎',
                condition: function(hexMap) {
                    return Object.values(hexMap.buildings).some(b => b.type === 'orchard');
                },
                apply: function(hexMap) {
                    const orchards = Object.values(hexMap.buildings).filter(b => b.type === 'orchard');
                    const bonusPer = 3 + Math.floor(Math.random() * 3); // 3–5
                    const totalBonus = orchards.length * bonusPer;
                    hexMap.resources.apples += totalBonus;
                    return {
                        message:  `🍎 Больше яблок! Каждый сад дал +${bonusPer} яблок. Итого: +${totalBonus} яблок.`,
                        duration: 4500
                    };
                }
            },

            // ── 10. ЗАБАСТОВКА! ─────────────────────────────
            {
                id:   'strike',
                name: 'Забастовка!',
                icon: '✊',
                condition: function(hexMap) {
                    // Need at least one mill or mine
                    return Object.values(hexMap.buildings).some(
                        b => b.type === 'mill' || b.type === 'mine'
                    );
                },
                apply: function(hexMap) {
                    const targets = Object.values(hexMap.buildings).filter(
                        b => b.type === 'mill' || b.type === 'mine'
                    );
                    const target = targets[Math.floor(Math.random() * targets.length)];
                    const duration = 3 + Math.floor(Math.random() * 4); // 3–6 turns
                    const cfg = window.GameConfig.BUILDINGS[target.type];
                    const name = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    window.EventsEngine._activeEffects.push({
                        type: 'strike',
                        turnsLeft: duration,
                        targetCol: target.col,
                        targetRow: target.row,
                        targetType: target.type
                    });
                    return {
                        message:  `✊ Забастовка! Рабочие ${name} [${target.col}, ${target.row}] отказываются работать на ${duration} ходов!`,
                        duration: 5500,
                        detail: { targetCol: target.col, targetRow: target.row, targetType: target.type }
                    };
                }
            },

            // ── 11. КОРРУПЦИЯ ──────────────────────────────
            {
                id:   'corruption',
                name: 'Коррупция',
                icon: '🕵️',
                condition: function(hexMap) {
                    return Object.values(hexMap.buildings).some(b => b.type === 'local_admin');
                },
                apply: function(hexMap) {
                    const admins = Object.values(hexMap.buildings).filter(b => b.type === 'local_admin');
                    const pct    = 0.03 + Math.random() * 0.07; // 3–10%
                    const lost   = Math.floor(hexMap.resources.money * pct);
                    hexMap.resources.money = Math.max(0, hexMap.resources.money - lost);
                    return {
                        message:  `🕵️ Коррупция! Чиновники в ${admins.length} администраци${admins.length === 1 ? 'и' : 'ях'} украли ${lost} 💰 (${Math.round(pct * 100)}% бюджета).`,
                        duration: 5500
                    };
                }
            }

            // ── ADD MORE EVENTS HERE ─────────────────────────
            // Copy the block above, give it a unique id, and push to the array.
        ]
    };
})();
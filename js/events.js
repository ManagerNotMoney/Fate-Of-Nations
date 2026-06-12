(function() {
    'use strict';

    /**
     * ════════════════════════════════════════════════════════
     *  EVENTS ENGINE  v0.0.3
     *
     *  Два типа ивентов:
     *
     *  МИРОВЫЕ (scope: 'world')
     *    apply(hexMap) → { message, duration?, detail?: { targetCol, targetRow } }
     *
     *  ЛОКАЛЬНЫЕ (scope: 'local')
     *    apply(hexMap) → LocalEventResult:
     *    {
     *      message,
     *      targetCol, targetRow,
     *      choices: [ { label, icon, apply(hexMap) → { message, ok } } ],
     *      onClose?(hexMap)   ← вызывается если игрок закрыл модал без выбора
     *    }
     *
     *  ВАЖНО ДЛЯ ЛОКАЛЬНЫХ:
     *    Любой необратимый эффект (уничтожение здания, смерть рабочего) должен
     *    произойти СРАЗУ в apply(), ДО возврата результата.
     *    Варианты choices — это способы ОТМЕНИТЬ или СМЯГЧИТЬ эффект.
     *    onClose() вызывается когда игрок закрывает окно без нажатия кнопки —
     *    нужен если надо что-то финализировать (например, уведомить).
     *
     *  КАК ДОБАВИТЬ НОВЫЙ ИВЕНТ:
     *  1. Добавь объект в REGISTRY.
     *  2. scope:'world' → apply возвращает { message }
     *  3. scope:'local' → apply сразу применяет эффект, возвращает { message, targetCol, targetRow, choices }
     *  4. Готово.
     * ════════════════════════════════════════════════════════
     */
    window.EventsEngine = {

        // ─── Internal state ────────────────────────────────
        _nextEventTurn: 0,
        _activeEffects: [],

        // ─── Public ────────────────────────────────────────

        reset: function() {
            this._nextEventTurn = this._rollNextTurn(1);
            this._activeEffects = [];
        },

        processTurn: function(hexMap, currentTurn) {
            const fired = [];

            this._activeEffects = this._activeEffects.filter(e => {
                e.turnsLeft--;
                return e.turnsLeft > 0;
            });

            if (currentTurn >= this._nextEventTurn) {
                const event = this._pickEvent(hexMap);
                if (event) {
                    const result  = event.apply(hexMap);
                    result.id     = event.id;
                    result.icon   = event.icon;
                    result.name   = event.name;
                    result.scope  = event.scope || 'world';
                    fired.push(result);
                }
                this._nextEventTurn = this._rollNextTurn(currentTurn);
            }

            return fired;
        },

        applyActiveEffects: function(hexMap, deltas) {
            for (const effect of this._activeEffects) {
                if (effect.type === 'drought') {
                    const farms = Object.values(hexMap.buildings).filter(b => b.type === 'farm');
                    deltas.wheat -= Math.min(farms.length * effect.reduction, deltas.wheat);
                    const orchards = Object.values(hexMap.buildings).filter(b => b.type === 'orchard');
                    deltas.apples -= Math.min(orchards.length * effect.reduction, deltas.apples);
                }
                if (effect.type === 'locust') {
                    // Саранча останавливает все фермы — обнуляем производство пшеницы
                    const farms = Object.values(hexMap.buildings).filter(b => b.type === 'farm');
                    deltas.wheat -= Math.min(farms.length * 3, deltas.wheat);
                }
                // strike: handled in computeDeltas via getActiveStrike()
            }
        },

        getActiveDrought: function() {
            return this._activeEffects.find(e => e.type === 'drought') || null;
        },

        getActiveStrike: function() {
            return this._activeEffects.find(e => e.type === 'strike') || null;
        },

        getActiveLocust: function() {
            return this._activeEffects.find(e => e.type === 'locust') || null;
        },

        /**
         * Resolve a player choice for a local event.
         * @param {object} hexMap
         * @param {object} pendingEvent  — LocalEventResult stored by UI
         * @param {number} choiceIndex
         * @returns {{ message, ok }}
         */
        resolveChoice: function(hexMap, pendingEvent, choiceIndex) {
            const choice = pendingEvent.choices[choiceIndex];
            if (!choice) return { message: 'Неизвестный выбор', ok: false };
            return choice.apply(hexMap);
        },

        // ─── Private helpers ───────────────────────────────

        _rollNextTurn: function(fromTurn) {
            return fromTurn + 7 + Math.floor(Math.random() * 9);
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
        // ════════════════════════════════════════════════════
        REGISTRY: [

            // ══════════════════════════════════════════════
            //  МИРОВЫЕ СОБЫТИЯ (scope: 'world')
            // ══════════════════════════════════════════════

            // ── 1. ЗАСУХА ────────────────────────────────
            {
                id: 'drought', name: 'Засуха', icon: '☀️', scope: 'world',
                condition: function(hm) {
                    return Object.values(hm.buildings).some(b => b.type === 'farm' || b.type === 'orchard');
                },
                apply: function(hm) {
                    const duration = 3 + Math.floor(Math.random() * 3);
                    window.EventsEngine._activeEffects.push({ type: 'drought', turnsLeft: duration, reduction: 1 });
                    return { message: `Засуха накрыла земли. Урожай пшеницы и яблок падает на 1 в течение ${duration} ходов.`, duration: 5000 };
                }
            },

            // ── 2. МИГРАЦИЯ ──────────────────────────────
            {
                id: 'migration', name: 'Миграция', icon: '🚶', scope: 'world',
                condition: function(hm) { return hm.resources.population >= 5; },
                apply: function(hm) {
                    const pct  = 0.10 + Math.random() * 0.10;
                    const lost = Math.max(1, Math.floor(hm.resources.population * pct));
                    hm.resources.population = Math.max(0, hm.resources.population - lost);
                    return { message: `${lost} жителей (${Math.round(pct * 100)}% населения) покинули страну.`, duration: 5000 };
                }
            },

            // ── 3. НАБЕГ ─────────────────────────────────
            {
                id: 'raid', name: 'Набег', icon: '⚔️', scope: 'world',
                condition: function(hm) { return hm.resources.money > 0 || hm.resources.bread > 0; },
                apply: function(hm) {
                    if (hm.resources.defense < Math.floor(hm.resources.population)) {
                        const lostMoney = hm.resources.money;
                        const lostBread = hm.resources.bread;
                        hm.resources.money = 0;
                        hm.resources.bread = 0;
                        return { message: `Защиты не хватило — разграблено ${lostMoney} 💰 и ${lostBread} 🍞! Постройте казармы.`, duration: 6000 };
                    } else {
                        const spent = hm.resources.defense;
                        hm.resources.defense = 0;
                        return { message: `Набег отражён! Потрачено ${spent} 🛡️ очков обороны.`, duration: 5000 };
                    }
                }
            },

            // ── 4. ХОРОШИЙ УРОЖАЙ ────────────────────────
            {
                id: 'good_harvest', name: 'Хороший урожай', icon: '🌻', scope: 'world',
                condition: function(hm) { return Object.values(hm.buildings).some(b => b.type === 'farm'); },
                apply: function(hm) {
                    const farms = Object.values(hm.buildings).filter(b => b.type === 'farm');
                    const bonus = farms.length * 5;
                    hm.resources.wheat += bonus;
                    return { message: `Каждая из ${farms.length} ферм дала щедрый урожай. Итого: +${bonus} 🌾`, duration: 4500 };
                }
            },

            // ── 5. МОРСКАЯ УДАЧА ─────────────────────────
            {
                id: 'sea_fortune', name: 'Морская удача', icon: '⚓', scope: 'world',
                condition: function(hm) { return Object.values(hm.buildings).some(b => b.type === 'port'); },
                apply: function(hm) {
                    const ports = Object.values(hm.buildings).filter(b => b.type === 'port');
                    const pct   = 0.15 + Math.random() * 0.05;
                    const bonus = Math.floor(hm.resources.money * pct);
                    hm.resources.money += bonus;
                    return { message: `${ports.length} порт(а) поймали удачный ветер — дополнительно ${bonus} 💰 (+${Math.round(pct * 100)}%).`, duration: 5000 };
                }
            },

            // ── 6. АЛМАЗЫ ────────────────────────────────
            {
                id: 'diamonds', name: 'Алмазы!', icon: '💎', scope: 'world',
                condition: function(hm) { return Object.values(hm.buildings).some(b => b.type === 'mine'); },
                apply: function(hm) {
                    const pct   = 0.05 + Math.random() * 0.05;
                    const bonus = Math.floor(hm.resources.money * pct);
                    hm.resources.money += bonus;
                    return { message: `Шахтёры нашли драгоценные камни! +${bonus} 💰 (+${Math.round(pct * 100)}%).`, duration: 5000 };
                }
            },

            // ── 7. БОЛЬШЕ ЯБЛОК ──────────────────────────
            {
                id: 'more_apples', name: 'Больше яблок!', icon: '🍎', scope: 'world',
                condition: function(hm) { return Object.values(hm.buildings).some(b => b.type === 'orchard'); },
                apply: function(hm) {
                    const orchards = Object.values(hm.buildings).filter(b => b.type === 'orchard');
                    const bonusPer = 3 + Math.floor(Math.random() * 3);
                    const total    = orchards.length * bonusPer;
                    hm.resources.apples += total;
                    return { message: `Каждый сад дал +${bonusPer} яблок. Итого: +${total} 🍎`, duration: 4500 };
                }
            },

            // ══════════════════════════════════════════════
            //  ЛОКАЛЬНЫЕ СОБЫТИЯ (scope: 'local')
            //  ПРАВИЛО: необратимый эффект применяется СРАЗУ в apply().
            //  choices — способы отменить/смягчить его.
            //  onClose — вызывается при закрытии без выбора.
            // ══════════════════════════════════════════════

            // ── 8. КОРРУПЦИЯ (переработанный) ─────────────
            {
                id: 'corruption', name: 'Коррупция', icon: '🕵️', scope: 'local',
                condition: function(hm) { return Object.values(hm.buildings).some(b => b.type === 'local_admin'); },
                apply: function(hm) {
                    const admins = Object.values(hm.buildings).filter(b => b.type === 'local_admin');
                    const pct  = 0.03 + Math.random() * 0.07;
                    const stolen = Math.floor(hm.resources.money * pct);
                    const targetAdmin = admins[Math.floor(Math.random() * admins.length)];
                    const col = targetAdmin.col;
                    const row = targetAdmin.row;

                    // ── НЕОБРАТИМЫЙ ЭФФЕКТ ПРИМЕНЯЕТСЯ СРАЗУ ──
                    hm.resources.money = Math.max(0, hm.resources.money - stolen);

                    return {
                        message: `В администрации [${col}, ${row}] разгорелся коррупционный скандал! Чиновники похитили ${stolen} 💰 (${Math.round(pct * 100)}%).`,
                        targetCol: col,
                        targetRow: row,
                        choices: [
                            {
                                label: `Посадить чиновника (−30 🛡️, вернуть ${stolen} 💰)`,
                                icon: '⚖️',
                                apply: function(hm) {
                                    if (hm.resources.defense < 30) {
                                        return { message: 'Не хватает 30 🛡️ для ареста. Деньги потеряны.', ok: false };
                                    }
                                    hm.resources.defense -= 30;
                                    hm.resources.money += stolen;
                                    return { message: `Чиновник посажен! Возвращено ${stolen} 💰. Потрачено 30 🛡️.`, ok: true };
                                }
                            },
                            {
                                label: 'Принять потерю',
                                icon: '😔',
                                apply: function(hm) {
                                    return { message: `Коррупционный скандал замяли. ${stolen} 💰 потеряны навсегда.`, ok: true };
                                }
                            }
                        ]
                    };
                }
            },

            // ── 9. ПОЖАР ─────────────────────────────────
            {
                id: 'fire', name: 'Пожар', icon: '🔥', scope: 'local',
                condition: function(hm) {
                    return Object.values(hm.buildings).some(
                        b => b.type !== 'townhall' && b.type !== 'local_admin'
                    );
                },
                apply: function(hm) {
                    const destroyable = Object.values(hm.buildings).filter(
                        b => b.type !== 'townhall' && b.type !== 'local_admin'
                    );
                    const target = destroyable[Math.floor(Math.random() * destroyable.length)];
                    const cfg    = window.GameConfig.BUILDINGS[target.type];
                    const name   = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    const col    = target.col;
                    const row    = target.row;
                    const snapshot = Object.assign({}, target);

                    delete hm.buildings[col + ',' + row];
                    hm.recalculateTerritory();

                    return {
                        message:   `В районе [${col}, ${row}] вспыхнул пожар! ${name} уничтожено.`,
                        targetCol: col,
                        targetRow: row,
                        choices: [
                            {
                                label: 'Восстановить (−80 💰)',
                                icon:  '🚒',
                                apply: function(hm) {
                                    if (hm.resources.money < 80) {
                                        return { message: 'Не хватает 80 💰. Здание не удалось восстановить.', ok: false };
                                    }
                                    hm.resources.money -= 80;
                                    hm.buildings[col + ',' + row] = snapshot;
                                    hm.recalculateTerritory();
                                    return { message: `Пожарные отстроили ${name} заново. Потрачено 80 💰.`, ok: true };
                                }
                            },
                            {
                                label: 'Принять потерю',
                                icon:  '😔',
                                apply: function(hm) {
                                    return { message: `${name} сгорело. Место расчищено.`, ok: true };
                                }
                            }
                        ]
                    };
                }
            },

            // ── 10. НЕСЧАСТНЫЙ СЛУЧАЙ ────────────────────
            {
                id: 'accident', name: 'Несчастный случай', icon: '💀', scope: 'local',
                condition: function(hm) {
                    return Object.values(hm.buildings).some(b => (b.assignedWorkers || 0) > 0);
                },
                apply: function(hm) {
                    const active = Object.values(hm.buildings).filter(b => (b.assignedWorkers || 0) > 0);
                    const target = active[Math.floor(Math.random() * active.length)];
                    const cfg    = window.GameConfig.BUILDINGS[target.type];
                    const name   = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    const col    = target.col;
                    const row    = target.row;

                    target.assignedWorkers = Math.max(0, (target.assignedWorkers || 1) - 1);
                    hm.resources.population = Math.max(0, hm.resources.population - 1);

                    return {
                        message:   `Работник в «${name}» [${col}, ${row}] получил тяжёлую травму и может скончаться.`,
                        targetCol: col,
                        targetRow: row,
                        choices: [
                            {
                                label: 'Оплатить Лечение (−50 💰)',
                                icon:  '🏥',
                                apply: function(hm) {
                                    if (hm.resources.money < 50) {
                                        return { message: 'Не хватает 50 💰 для лечения.', ok: false };
                                    }
                                    hm.resources.money -= 50;
                                    target.assignedWorkers = (target.assignedWorkers || 0) + 1;
                                    hm.resources.population += 1;
                                    return { message: `Работник выздоровел и вернулся в «${name}». Потрачено 50 💰.`, ok: true };
                                }
                            },
                            {
                                label: 'Принять потерю',
                                icon:  '😞',
                                apply: function(hm) {
                                    return { message: `Работник в «${name}» погиб. Население −1.`, ok: true };
                                }
                            }
                        ]
                    };
                }
            },

            // ── 11. ЗАБАСТОВКА ───────────────────────────
            {
                id: 'strike', name: 'Забастовка!', icon: '✊', scope: 'local',
                condition: function(hm) {
                    return Object.values(hm.buildings).some(b => b.type === 'mill' || b.type === 'mine');
                },
                apply: function(hm) {
                    const targets  = Object.values(hm.buildings).filter(b => b.type === 'mill' || b.type === 'mine');
                    const target   = targets[Math.floor(Math.random() * targets.length)];
                    const duration = 3 + Math.floor(Math.random() * 4);
                    const cfg      = window.GameConfig.BUILDINGS[target.type];
                    const name     = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    const col      = target.col;
                    const row      = target.row;

                    window.EventsEngine._activeEffects.push({
                        type: 'strike', turnsLeft: duration,
                        targetCol: col, targetRow: row, targetType: target.type
                    });

                    const _endStrike = function() {
                        window.EventsEngine._activeEffects = window.EventsEngine._activeEffects.filter(
                            e => !(e.type === 'strike' && e.targetCol === col && e.targetRow === row)
                        );
                    };

                    return {
                        message:   `Рабочие «${name}» [${col}, ${row}] объявили забастовку! Здание простаивает ${duration} ходов.`,
                        targetCol: col,
                        targetRow: row,
                        choices: [
                            {
                                label: 'Выдать премии (−300 💰)',
                                icon:  '💸',
                                apply: function(hm) {
                                    if (hm.resources.money < 300) {
                                        return { message: 'Не хватает 300 💰. Забастовка продолжается.', ok: false };
                                    }
                                    hm.resources.money -= 300;
                                    _endStrike();
                                    return { message: `Премии выплачены — рабочие «${name}» вернулись к работе.`, ok: true };
                                }
                            },
                            {
                                label: 'Подавить (−100 🛡️)',
                                icon:  '⚔️',
                                apply: function(hm) {
                                    if (hm.resources.defense < 100) {
                                        return { message: 'Не хватает 100 🛡️ для подавления. Забастовка продолжается.', ok: false };
                                    }
                                    hm.resources.defense -= 100;
                                    _endStrike();
                                    return { message: `Забастовка подавлена силой. «${name}» возобновляет работу. −100 🛡️.`, ok: true };
                                }
                            },
                            {
                                label: 'Игнорировать',
                                icon:  '🤷',
                                apply: function(hm) {
                                    return { message: `Забастовка в «${name}» продолжится ещё ${duration} ходов.`, ok: true };
                                }
                            }
                        ]
                    };
                }
            },

            // ── 12. САРАНЧА ───────────────────────────────
            {
                id: 'locust', name: 'Нашествие саранчи', icon: '🦗', scope: 'local',
                condition: function(hm) {
                    return Object.values(hm.buildings).some(b => b.type === 'farm');
                },
                apply: function(hm) {
                    const farms = Object.values(hm.buildings).filter(b => b.type === 'farm');
                    const duration = 3 + Math.floor(Math.random() * 3); // 3–5 ходов
                    const farmCount = farms.length;
                    const disinfectCost = farmCount * 15;

                    // ── НЕОБРАТИМЫЙ ЭФФЕКТ ПРИМЕНЯЕТСЯ СРАЗУ ──
                    // Сохраняем список ферм для визуального оверлея
                    const affectedFarms = farms.map(f => ({ col: f.col, row: f.row }));
                    window.EventsEngine._activeEffects.push({
                        type: 'locust', turnsLeft: duration,
                        affectedFarms: affectedFarms
                    });

                    const _endLocust = function() {
                        window.EventsEngine._activeEffects = window.EventsEngine._activeEffects.filter(
                            e => e.type !== 'locust'
                        );
                    };

                    return {
                        message: `Чёрное облако саранчи накрыло поля! ${farmCount} ферм${farmCount === 1 ? 'а' : ''} парализовано — урожай уничтожается на глазах. Нашествие продлится ${duration} ходов.`,
                        choices: [
                            {
                                label: `Дезинфицировать поля (−${disinfectCost} 💰)`,
                                icon: '🧪',
                                apply: function(hm) {
                                    if (hm.resources.money < disinfectCost) {
                                        return { message: `Не хватает ${disinfectCost} 💰 для дезинфекции. Саранча продолжает пожирать урожай!`, ok: false };
                                    }
                                    hm.resources.money -= disinfectCost;
                                    _endLocust();
                                    return { message: `Поля обработаны специальными реагентами. Саранча отступает! Потрачено ${disinfectCost} 💰.`, ok: true };
                                }
                            },
                            {
                                label: 'Принять потерю',
                                icon: '🌾',
                                apply: function(hm) {
                                    return { message: `Саранча продолжает пожирать урожай. Фермы простаивают ещё ${duration} ходов.`, ok: true };
                                }
                            }
                        ]
                    };
                }
            },

            // ── 13. ОБВАЛ ─────────────────────────────────
            {
                id: 'landslide', name: 'Обвал в шахте', icon: '⛰️', scope: 'local',
                condition: function(hm) {
                    return Object.values(hm.buildings).some(b => b.type === 'mine');
                },
                apply: function(hm) {
                    const mines = Object.values(hm.buildings).filter(b => b.type === 'mine');
                    const target = mines[Math.floor(Math.random() * mines.length)];
                    const cfg    = window.GameConfig.BUILDINGS[target.type];
                    const name   = cfg ? cfg.icon + ' ' + cfg.name : target.type;
                    const col    = target.col;
                    const row    = target.row;
                    const snapshot = Object.assign({}, target);

                    // ── НЕОБРАТИМЫЙ ЭФФЕКТ ПРИМЕНЯЕТСЯ СРАЗУ ──
                    delete hm.buildings[col + ',' + row];
                    hm.recalculateTerritory();

                    return {
                        message: `Тревожный гул под землёй… В шахте [${col}, ${row}] начинается обвал! Каменные плиты обрушиваются на галереи. Шахта разрушена!`,
                        targetCol: col,
                        targetRow: row,
                        choices: [
                            {
                                label: 'Укрепить стены (−100 💰, восстановить шахту)',
                                icon: '🏗️',
                                apply: function(hm) {
                                    if (hm.resources.money < 100) {
                                        return { message: 'Не хватает 100 💰 для укрепления. Шахта остаётся разрушенной.', ok: false };
                                    }
                                    hm.resources.money -= 100;
                                    hm.buildings[col + ',' + row] = snapshot;
                                    hm.recalculateTerritory();
                                    return { message: `Инженеры экстренно укрепили стены и расчистили завал. Шахта спасена! Потрачено 100 💰.`, ok: true };
                                }
                            },
                            {
                                label: 'Принять потерю',
                                icon: '💀',
                                apply: function(hm) {
                                    return { message: `Шахта [${col}, ${row}] засыпана обломками. Галереи навсегда утеряны.`, ok: true };
                                }
                            }
                        ]
                    };
                }
            }

            // ── ДОБАВЛЯЙ НОВЫЕ ИВЕНТЫ ЗДЕСЬ ─────────────
            // Мировой: { id, name, icon, scope:'world', condition?, apply → { message } }
            // Локальный (с немедленным эффектом):
            //   { id, name, icon, scope:'local', condition?,
            //     apply(hm) → {
            //       message, targetCol, targetRow,
            //       choices: [{ label, icon, apply(hm) → { message, ok } }],
            //       onClose?(hm)
            //     }
            //   }
        ]
    };
})();
(function() {
    'use strict';
    const HM = window.HexMap;
    const C = window.GameConfig;

    const CLAUDE_QUIPS = [
        '🤖 Клод доволен архитектурой вашего города!',
        '📊 Статистика говорит: вы справляетесь лучше среднего',
        '🏗️ Стройка идёт по плану.',
        '🌍 Город растёт. Клод доволен.'
    ];
    let _quipIdx = 0;

    window.UI = {
        turnCounter: null,
        notification: null,
        _animFrame: null,
        _notifTimer: null,
        _handlersBound: false,

        // Delegate sub-modules
        get tooltips() { return window.UITooltips; },
        get modals()   { return window.UIModals; },
        get panel()    { return window.UIPanel; },

        nextQuip: function() { return CLAUDE_QUIPS[_quipIdx++ % CLAUDE_QUIPS.length]; },

        init: function() {
            this.turnCounter  = document.getElementById('turnCounter');
            this.notification = document.getElementById('notification');

            if (window.UITooltips) this.tooltips.init(document.getElementById('tooltip'));
            else console.warn('[UI] ui-tooltips.js not loaded!');

            if (window.UIModals) this.modals.init();
            else console.warn('[UI] ui-modals.js not loaded!');

            if (window.UIPanel) this.panel.init();
            else console.warn('[UI] ui-panel.js not loaded!');

            if (!this._handlersBound) {
                document.getElementById('btnEndTurn').addEventListener('click', () => this.endTurn());
                document.addEventListener('keydown', (e) => {
                    if (e.code !== 'Space') return;
                    if (document.getElementById('gameScreen')?.style.display === 'none') return;
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                    e.preventDefault();
                    this.endTurn();
                });
                this._handlersBound = true;
            }

            this.updateResourceBar();
            // Show goal on first turn
            if (window.GameState.currentTurn === 1 && this.modals) {
                setTimeout(() => this.modals.openGoalModal(), 600);
            }
        },

        // ─── Resource Bar ──────────────────────────────────────
        updateResourceBar: function() {
            const res = HM.resources;
            const del = HM.deltas;

            const fmtNum = n => {
                const abs = Math.abs(n);
                if (abs >= 1_000_000) return (Math.floor(n / 100_000) / 10).toFixed(1).replace(/\.0$/, '') + 'м';
                if (abs >= 1_000)     return (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'к';
                return String(Math.floor(n));
            };
            const fmtDelta = d => {
                const n = Math.round(d);
                if (!n) return '';
                return n > 0
                    ? `<span class="res-delta pos">+${fmtNum(n)}</span>`
                    : `<span class="res-delta neg">${fmtNum(n)}</span>`;
            };
            const set = (id, val, delta) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = fmtNum(Math.floor(val)) + fmtDelta(delta);
            };

            set('resMoney',      res.money,                              del.money);
            // Food deficit indicator
            const applesAvail = Math.max(0, res.apples + del.apples);
            const cherryAvail = Math.max(0, res.cherry + del.cherry)
            const fishAvail   = Math.max(0, res.fish   + del.fish);
            const breadAvail  = Math.max(0, res.bread  + del.bread);
            const totalFoodCap = applesAvail + fishAvail + cherryAvail + breadAvail * C.FOOD_PER_POPULATION;
            const foodDeficit  = res.population > 0 ? Math.max(0, res.population - totalFoodCap) : 0;

            const foodChip = document.getElementById('resFoodChip');
            if (foodChip) foodChip.classList.toggle('food-deficit', foodDeficit > 0);

            const foodEl = document.getElementById('resFood');
            if (foodEl) {
                const foodDisplay = fmtNum(Math.floor(res.bread + res.apples + res.fish + res.cherry));
                const deltaHtml = fmtDelta(del.bread + del.apples + del.fish + del.cherry);
                if (foodDeficit > 0) {
                    foodEl.innerHTML = foodDisplay + deltaHtml +
                        `<span class="res-food-shortage"> −${fmtNum(Math.ceil(foodDeficit))}</span>`;
                } else {
                    foodEl.innerHTML = foodDisplay + deltaHtml;
                }
            }

            set('resRaw',        res.wheat,                              del.wheat);
            set('resResources', res.iron + res.copper + res.wood + res.coal + res.steel,
                    del.iron + del.copper + del.wood + del.coal + del.steel);
            set('resPopulation', res.population,                         del.population);
            set('resDefense',    res.defense,                            del.defense);

            if (this.tooltips) this.tooltips.updateAll();

            const bar = document.getElementById('resourceBar');
            if (bar) bar.classList.toggle('hunger-warning', del.population < 0);

            if (HM.townHallBuilt) {
                const popIncome = Math.floor(res.population * C.MONEY_PER_POPULATION);
                const el = document.getElementById('popIncomeHint');
                if (el) el.textContent = popIncome > 0 ? `(+${fmtNum(popIncome)} от жителей)` : '';
            }
        },

        // ─── End Turn ──────────────────────────────────────────
        endTurn: function() {
            window.GameState.currentTurn++;
            this.turnCounter.textContent = window.GameState.currentTurn;

            const completed = HM.processTurn();

            // ── Auto-work: assign workers to newly completed buildings ──
            if (window.GameState.autoWork && completed.length > 0) {
                const E = window.EconomyEngine;
                let autoAssigned = 0;
                for (const q of completed) {
                    const bc = window.GameConfig.BUILDINGS[q.type];
                    if (!bc || !bc.workersRequired) continue;
                    const maxW = bc.workersMax || bc.workersRequired;
                    let added = 0;
                    while (added < maxW) {
                        const r = window.PopulationEngine.assignWorker(HM, q.col, q.row);
                        if (!r.ok) break;
                        added++;
                        autoAssigned++;
                    }
                }
                if (autoAssigned > 0) {
                    setTimeout(() => this.showNotification(`👷 Авто-работа: назначено ${autoAssigned} рабочих на новые здания`, 3000), 600);
                }
            }
            if (window.HexMap._lastAccident &&
                window.HexMap._lastAccident.turn < window.GameState.currentTurn) {
                window.HexMap._lastAccident = null;
            }
            // ── World event notifications ───────────────────
            if (HM.pendingEventResults && HM.pendingEventResults.length > 0) {
                const ev = HM.pendingEventResults[0];
                HM.pendingEventResults = [];
                if (window.UIModals) window.UIModals.openEventModal(ev);
            }

            // Food / starvation alerts
            if (HM.lastEvents?.find(e => e.type === 'starvation')) {
                this.showNotification('😱 Голод! Жители умирают — стройте фермы, сады, мельницы и порты!', 4500);
            } else if (HM.deltas.population < 0) {
                this.showNotification('⚠️ Населению не хватает еды!', 3000);
            }

            const emigration = HM.lastEvents?.find(e => e.type === 'emigration');
            if (emigration) {
                this.showNotification(`🚶 ${emigration.count} житель${emigration.count === 1 ? '' : (emigration.count < 5 ? 'я' : 'ей')} покинул${emigration.count === 1 ? '' : 'и'} город — не хватает жилья! Стройте дома.`, 4500);
            }


            // Completion events
            const townhallDone    = completed.find(q => q.type === 'townhall');
            const localAdminDone  = completed.find(q => q.type === 'local_admin');

            if (townhallDone) {
                window.GameState.namingCell = { col: townhallDone.col, row: townhallDone.row, type: 'townhall' };
                this.showNotification('🏛️ Ратуша построена! Назовите город');
                if (this.modals) this.modals.openColorPicker();
            } else if (localAdminDone) {
                window.GameState.namingCell = { col: localAdminDone.col, row: localAdminDone.row, type: 'local_admin' };
                this.showNotification('🏢 Местная администрация построена! Территория расширена в радиусе 7 клеток');
                if (this.modals) this.modals.openCityNameModal('district');
            } else if (HM.lastEvents?.find(e => e.type === 'idle_workers')) {
                const idle = HM.lastEvents.find(e => e.type === 'idle_workers').count;
                this.showNotification(`⚠️ ${idle} здани${idle === 1 ? 'е' : 'я'} без рабочих — назначьте жителей!`, 4000);
            } else if (completed.length > 0) {
                const names = completed.map(q => C.BUILDINGS[q.type].icon + ' ' + C.BUILDINGS[q.type].name).join(', ');
                this.showNotification('✅ Построено: ' + names);
            }

            this.updateResourceBar();
            if (this.panel) this.panel.updateQueue();
            if (window.GameState.selectedCell) {
                if (this.panel) this.panel.openPanel(window.GameState.selectedCell.col, window.GameState.selectedCell.row);
            }
            window.Renderer.render();

            // Milestone quips
            const t = window.GameState.currentTurn;
            if (t === 5)  setTimeout(() => this.showNotification('🤖 Клод: «Неплохое начало для 5 ходов»'), 3500);
            if (t === 10) setTimeout(() => this.showNotification('📈 Клод: «Город развивается стабильно»'), 3500);
            if (t === 20) setTimeout(() => this.showNotification('🏆 Клод: «20 ходов! Внушительный прогресс»'), 3500);

            // ── Win / Lose check ───────────────────────────────
            if (HM.gameOver === 'win') {
                HM.gameOver = 'shown';
                setTimeout(() => { if (this.modals) this.modals.openWinModal(); }, 800);
                return;
            }
            // Lose: population wiped out
            if (HM.townHallBuilt && HM.resources.population <= 0) {
                HM.gameOver = 'shown';
                setTimeout(() => {
                    if (this.modals) this.modals.openLoseModal('Население вымерло — некому строить будущее.');
                }, 800);
            }
        },

        // ─── Construction Animation ────────────────────────────
        startConstructionAnim: function() {
            if (this._animFrame) return;
            const loop = () => {
                if (HM.buildQueue.length === 0) {
                    cancelAnimationFrame(this._animFrame);
                    this._animFrame = null;
                    return;
                }
                window.Renderer.render();
                this._animFrame = requestAnimationFrame(loop);
            };
            this._animFrame = requestAnimationFrame(loop);
        },

        // ─── Work Mode Animation ─────────────────────────────
        startWorkModeAnim: function() {
            if (this._workAnimFrame) return;
            const loop = () => {
                if (window.Renderer && window.Renderer.mapMode !== 'work') {
                    this._workAnimFrame = null;
                    return;
                }
                window.Renderer.render();
                this._workAnimFrame = requestAnimationFrame(loop);
            };
            this._workAnimFrame = requestAnimationFrame(loop);
        },

        stopWorkModeAnim: function() {
            if (this._workAnimFrame) {
                cancelAnimationFrame(this._workAnimFrame);
                this._workAnimFrame = null;
            }
        },

        // ─── Notification ──────────────────────────────────────
        showNotification: function(text, duration) {
            const n = this.notification;
            if (!n) return;
            n.textContent = text;
            n.classList.add('show');
            clearTimeout(this._notifTimer);
            this._notifTimer = setTimeout(() => n.classList.remove('show'), duration || 3000);
        },

        // ─── Panel proxies (backwards compat) ─────────────────
        openPanel:  function(col, row) { if (this.panel) this.panel.openPanel(col, row); },
        closePanel: function()         { if (this.panel) this.panel.closePanel(); },
        backToMenu: function()         { document.getElementById('btnMenuInGame')?.click(); },

        // ─── Cleanup ───────────────────────────────────────────
        cleanup: function() {
            if (this._animFrame)  { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
            if (this._workAnimFrame) { cancelAnimationFrame(this._workAnimFrame); this._workAnimFrame = null; }
            if (this._notifTimer) { clearTimeout(this._notifTimer); this._notifTimer = null; }
            if (this.notification) this.notification.classList.remove('show');
            if (this.panel)  this.panel.closePanel();
            if (this.modals) { this.modals.closeCityModal(); this.modals.closeColorPicker(); this.modals.closeEventModal(); }
            window.GameState.selectedCell = null;
            window.GameState.namingCell   = null;
        }
    };
})();

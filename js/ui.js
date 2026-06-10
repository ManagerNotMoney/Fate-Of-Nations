(function() {
    'use strict';
    const HM = window.HexMap;
    const C = window.GameConfig;

    const CLAUDE_QUIPS = [
        '🤖 Клод доволен архитектурой вашего города!',
        '📊 Статистика говорит: вы справляетесь лучше среднего',
        '🏗️ Архитектурное решение засчитано',
        '💡 Интересный ход. Буду наблюдать.',
        '🌍 Цивилизация растёт. Клод доволен.',
        '🍎 Яблоки — мудрый выбор. Сад порадует жителей!',
        '⚔️ Казармы? Готовитесь к худшему, надеетесь на лучшее.',
        '⛏️ Шахты в горах — отличная инвестиция!',
        '⚓ Порт открывает новые горизонты!',
        '🏢 Администрация расширяет влияние.'
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

            const fmtDelta = d => {
                const n = Math.round(d);
                if (!n) return '';
                return n > 0
                    ? `<span class="res-delta pos">+${n}</span>`
                    : `<span class="res-delta neg">${n}</span>`;
            };
            const set = (id, val, delta) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = Math.floor(val) + fmtDelta(delta);
            };

            set('resMoney',      res.money,                              del.money);
            set('resFood',       res.bread + res.apples + res.fish,      del.bread + del.apples + del.fish);
            set('resRaw',        res.wheat,                              del.wheat);
            set('resIron',       res.iron,                               del.iron);
            set('resCopper',     res.copper,                             del.copper);
            set('resPopulation', res.population,                         del.population);
            set('resDefense',    res.defense,                            del.defense);

            if (this.tooltips) this.tooltips.updateAll();

            const bar = document.getElementById('resourceBar');
            if (bar) bar.classList.toggle('hunger-warning', del.population < 0);

            if (HM.townHallBuilt) {
                const popIncome = Math.floor(res.population * C.MONEY_PER_POPULATION);
                const el = document.getElementById('popIncomeHint');
                if (el) el.textContent = popIncome > 0 ? `(+${popIncome} от жителей)` : '';
            }
        },

        // ─── End Turn ──────────────────────────────────────────
        endTurn: function() {
            window.GameState.currentTurn++;
            this.turnCounter.textContent = window.GameState.currentTurn;

            const completed = HM.processTurn();

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
            if (t === 10) setTimeout(() => this.showNotification('📈 Клод: «Смотрю данные. Впечатляет!»'), 3500);
            if (t === 20) setTimeout(() => this.showNotification('🏆 Клод: «20 ходов! Я бы так не смог»'), 3500);

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
                if (HM.buildQueue.length === 0) { this._animFrame = null; return; }
                window.Renderer.render();
                this._animFrame = requestAnimationFrame(loop);
            };
            this._animFrame = requestAnimationFrame(loop);
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
            if (this._notifTimer) { clearTimeout(this._notifTimer); this._notifTimer = null; }
            if (this.notification) this.notification.classList.remove('show');
            if (this.panel)  this.panel.closePanel();
            if (this.modals) { this.modals.closeCityModal(); this.modals.closeColorPicker(); this.modals.closeEventModal(); }
            window.GameState.selectedCell = null;
            window.GameState.namingCell   = null;
        }
    };
})();

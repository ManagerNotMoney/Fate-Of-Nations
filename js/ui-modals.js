(function() {
    'use strict';
    const HM = window.HexMap;
    const C = window.GameConfig;

    window.UIModals = {
        cityNameModal: null,
        cityNameInput: null,
        btnConfirmCityName: null,
        colorPickerModal: null,
        selectedColor: '#4f8ef7',
        _handlersBound: false,
        _pendingEvent: null,   // хранит LocalEventResult до выбора игрока

        init: function() {
            this.cityNameModal      = document.getElementById('cityNameModal');
            this.cityNameInput      = document.getElementById('cityNameInput');
            this.btnConfirmCityName = document.getElementById('btnConfirmCityName');
            this.colorPickerModal   = document.getElementById('colorPickerModal');

            if (this._handlersBound) return;

            const eventModal = document.getElementById('eventModal');
            if (eventModal) {
                document.getElementById('btnCloseEvent')?.addEventListener('click', () => this.closeEventModal());
                eventModal.addEventListener('click', e => { if (e.target === eventModal) this.closeEventModal(); });
            }

            const goalModal = document.getElementById('goalModal');
            if (goalModal) {
                document.getElementById('btnCloseGoal')?.addEventListener('click', () => this.closeGoalModal());
            }

            const winModal = document.getElementById('winModal');
            if (winModal) {
                document.getElementById('btnWinMenu')?.addEventListener('click', () => {
                    winModal.style.display = 'none';
                    if (window.UI) window.UI.backToMenu?.() || document.getElementById('btnMenuInGame')?.click();
                });
                document.getElementById('btnWinRestart')?.addEventListener('click', () => {
                    winModal.style.display = 'none';
                    document.getElementById('btnConfirmSetup')?.click();
                });
            }

            const loseModal = document.getElementById('loseModal');
            if (loseModal) {
                document.getElementById('btnLoseMenu')?.addEventListener('click', () => {
                    loseModal.style.display = 'none';
                    if (window.UI) window.UI.backToMenu?.() || document.getElementById('btnMenuInGame')?.click();
                });
                document.getElementById('btnLoseRestart')?.addEventListener('click', () => {
                    loseModal.style.display = 'none';
                    document.getElementById('btnConfirmSetup')?.click();
                });
            }

            if (this.btnConfirmCityName) {
                this.btnConfirmCityName.addEventListener('click', () => this.confirmName());
            }
            if (this.cityNameInput) {
                this.cityNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') this.confirmName(); });
            }
            if (this.cityNameModal) {
                this.cityNameModal.addEventListener('click', e => {
                    if (e.target === this.cityNameModal) this.closeCityModal();
                });
            }
            if (this.colorPickerModal) {
                this.colorPickerModal.addEventListener('click', e => {
                    if (e.target === this.colorPickerModal) this.closeColorPicker();
                });
                document.getElementById('btnCloseColorPicker').addEventListener('click', () => this.closeColorPicker());
                document.getElementById('btnConfirmColor').addEventListener('click', () => this.confirmColor());
                document.querySelectorAll('.color-swatch').forEach(swatch => {
                    swatch.addEventListener('click', () => {
                        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                        swatch.classList.add('selected');
                        this.selectedColor = swatch.dataset.color;
                    });
                });
            }

            this._handlersBound = true;
        },

        // ─── Camera: center on a hex cell ──────────────────────
        _centerOnCell: function(col, row) {
            const R = window.Renderer;
            if (!R || !R.canvas) return;
            const pos = HM.hexToPixel(col, row);
            const w   = HM.hexWidth();
            const h   = HM.hexHeight();
            const cx  = pos.x + w / 2;
            const cy  = pos.y + h / 2;
            HM.cameraX = R.canvas.width  / 2 - cx + HM.cameraX;
            HM.cameraY = R.canvas.height / 2 - cy + HM.cameraY;
            const rawX = col * HM.xOffset() + (row % 2 ? HM.hexWidth() / 2 : 0) + w / 2;
            const rawY = row * HM.yOffset() + h / 2;
            HM.cameraX = R.canvas.width  / 2 - rawX;
            HM.cameraY = R.canvas.height / 2 - rawY;
            R.render();
        },

        // ─── Color Picker ──────────────────────────────────────
        openColorPicker: function() {
            if (!this.colorPickerModal) return;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            const first = document.querySelector('.color-swatch[data-color="#4f8ef7"]');
            if (first) first.classList.add('selected');
            this.selectedColor = '#4f8ef7';
            this.colorPickerModal.style.display = 'flex';
        },

        closeColorPicker: function() {
            if (this.colorPickerModal) this.colorPickerModal.style.display = 'none';
        },

        confirmColor: function() {
            HM.factionColor = this.selectedColor;
            this.closeColorPicker();
            this.openCityNameModal();
        },

        // ─── City / District Name Modal ────────────────────────
        openCityNameModal: function(type) {
            if (!this.cityNameModal) return;
            const isDistrict = type === 'district';
            this.cityNameModal.querySelector('h2').textContent         = isDistrict ? '🏢 Район создан!'          : '🏛️ Город основан!';
            this.cityNameModal.querySelector('.modal-sub').textContent = isDistrict ? 'Дайте название новому району' : 'Дайте название вашему новому городу';
            this.cityNameInput.placeholder                             = isDistrict ? 'Например, Старый город…'    : 'Например, Новая Надежда…';
            this.cityNameModal.querySelector('.city-modal-icon').textContent = isDistrict ? '🏢' : '🏛️';
            this.cityNameInput.value = '';
            this.cityNameModal.style.display = 'flex';
            setTimeout(() => this.cityNameInput.focus(), 50);
        },

        closeCityModal: function() {
            if (this.cityNameModal) this.cityNameModal.style.display = 'none';
        },

        // ─── World Event Modal ─────────────────────────────────
        openEventModal: function(ev) {
            const modal = document.getElementById('eventModal');
            if (!modal) return;

            this._pendingEvent = ev.scope === 'local' ? ev : null;

            const styles = {
                drought:      { color: '#fb923c', glow: 'rgba(251,146,60,0.25)',  bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.30)' },
                migration:    { color: '#60a5fa', glow: 'rgba(96,165,250,0.25)',  bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.30)' },
                raid:         { color: '#f87171', glow: 'rgba(248,113,113,0.30)', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.35)' },
                good_harvest: { color: '#4ade80', glow: 'rgba(74,222,128,0.25)',  bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.30)' },
                accident:     { color: '#a78bfa', glow: 'rgba(167,139,250,0.25)', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.30)' },
                sea_fortune:  { color: '#38bdf8', glow: 'rgba(56,189,248,0.30)',  bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.35)' },
                diamonds:     { color: '#22d3ee', glow: 'rgba(34,211,238,0.30)',  bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.35)' },
                more_apples:  { color: '#f87171', glow: 'rgba(248,113,113,0.25)', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.30)' },
                strike:       { color: '#fbbf24', glow: 'rgba(251,191,36,0.30)',  bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.35)' },
                corruption:   { color: '#a855f7', glow: 'rgba(168,85,247,0.30)',  bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.35)' },
                fire:         { color: '#ef4444', glow: 'rgba(239,68,68,0.30)',   bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.35)' },
                locust:       { color: '#a16207', glow: 'rgba(161,98,7,0.30)',    bg: 'rgba(161,98,7,0.08)',    border: 'rgba(161,98,7,0.35)' },
                landslide:    { color: '#57534e', glow: 'rgba(87,83,78,0.30)',    bg: 'rgba(87,83,78,0.08)',    border: 'rgba(87,83,78,0.35)' }
            };
            const s = styles[ev.id] || { color: 'var(--accent)', glow: 'rgba(79,142,247,0.2)', bg: 'rgba(79,142,247,0.07)', border: 'rgba(79,142,247,0.25)' };

            const bodyText = ev.message.replace(/^[\p{Emoji}\s]+/u, '').trim();

            modal.querySelector('.event-modal-stripe').style.background =
                `linear-gradient(90deg, ${s.color}, ${s.color}88, ${s.color})`;
            modal.querySelector('.event-modal-icon-wrap').style.cssText +=
                `;background:${s.bg};border-color:${s.border};box-shadow:0 0 40px ${s.glow}`;
            modal.querySelector('.event-modal-icon').textContent  = ev.icon;
            modal.querySelector('.event-modal-title').textContent = ev.name;
            modal.querySelector('.event-modal-body').textContent  = bodyText;

            // Scope badge
            const scopeTag = modal.querySelector('.event-scope-tag');
            if (scopeTag) {
                if (ev.scope === 'local') {
                    scopeTag.textContent     = '📍 Локальное событие';
                    scopeTag.style.display   = 'inline-block';
                    scopeTag.style.background = 'rgba(251,191,36,0.10)';
                    scopeTag.style.borderColor = 'rgba(251,191,36,0.30)';
                    scopeTag.style.color      = '#fbbf24';
                } else {
                    scopeTag.textContent     = '🌍 Мировое событие';
                    scopeTag.style.display   = 'inline-block';
                    scopeTag.style.background = 'rgba(96,165,250,0.10)';
                    scopeTag.style.borderColor = 'rgba(96,165,250,0.30)';
                    scopeTag.style.color      = '#60a5fa';
                }
            }

            // Duration tag
            const tagEl = modal.querySelector('.event-modal-tag');
            if (ev.id === 'drought') {
                const drought = window.EventsEngine ? window.EventsEngine.getActiveDrought() : null;
                if (drought) {
                    tagEl.textContent = `Длится ещё ${drought.turnsLeft} ход(а)`;
                    tagEl.style.display = 'inline-block';
                } else { tagEl.style.display = 'none'; }
            } else if (ev.id === 'strike') {
                const strike = window.EventsEngine ? window.EventsEngine.getActiveStrike() : null;
                if (strike) {
                    tagEl.textContent = `Забастовка: ещё ${strike.turnsLeft} ход(а)`;
                    tagEl.style.display = 'inline-block';
                } else { tagEl.style.display = 'none'; }
            } else if (ev.id === 'locust') {
                const locust = window.EventsEngine ? window.EventsEngine.getActiveLocust() : null;
                if (locust) {
                    tagEl.textContent = `Нашествие: ещё ${locust.turnsLeft} ход(а)`;
                    tagEl.style.display = 'inline-block';
                } else { tagEl.style.display = 'none'; }
            } else { tagEl.style.display = 'none'; }

            // ── Build action buttons ──────────────────────────
            const actionsWrap = modal.querySelector('.event-modal-actions');
            if (actionsWrap) {
                actionsWrap.innerHTML = '';

                const hasTarget = ev.targetCol !== undefined && ev.targetRow !== undefined;

                if (ev.scope === 'local' && ev.choices && ev.choices.length) {
                    if (hasTarget) {
                        const gotoBtn = this._makeEventBtn('🗺️ Перейти', 'event-btn--goto', () => {
                            this._centerOnCell(ev.targetCol, ev.targetRow);
                        });
                        actionsWrap.appendChild(gotoBtn);
                    }
                    const labelsText = ev.choices.map(c => c.label).join(' ');
                    const needsMoney   = /−\s*[\d]+\s*💰/.test(labelsText);
                    const needsDefense = /−\s*[\d]+\s*🛡/.test(labelsText);
                    if (needsMoney || needsDefense) {
                        const res = window.HexMap.resources;
                        const parts = [];
                        if (needsMoney)   parts.push(`💰 <b>${Math.floor(res.money)}</b>`);
                        if (needsDefense) parts.push(`🛡️ <b>${Math.floor(res.defense)}</b>`);
                        const strip = document.createElement('div');
                        strip.className = 'event-balance-strip';
                        strip.innerHTML = 'Ваш баланс: ' + parts.join('&nbsp;&nbsp;');
                        actionsWrap.appendChild(strip);
                    }
                    ev.choices.forEach((choice, idx) => {
                        const btn = this._makeEventBtn(
                            `${choice.icon || ''} ${choice.label}`,
                            'event-btn--choice',
                            () => {
                                const result = window.EventsEngine.resolveChoice(window.HexMap, ev, idx);
                                if (window.UI) window.UI.showNotification(
                                    (result.ok ? '✅ ' : '⚠️ ') + result.message, 5000
                                );
                                if (window.UI) window.UI.updateResourceBar();
                                if (window.Renderer) window.Renderer.render();
                                this._pendingEvent = null;
                                this.closeEventModal();
                            }
                        );
                        actionsWrap.appendChild(btn);
                    });
                } else {
                    if (hasTarget) {
                        const gotoBtn = this._makeEventBtn('🗺️ Перейти', 'event-btn--goto', () => {
                            this._centerOnCell(ev.targetCol, ev.targetRow);
                        });
                        actionsWrap.appendChild(gotoBtn);
                    }
                    const acceptBtn = this._makeEventBtn('✓ Принять', 'event-btn--accept menu-play-btn', () => {
                        this.closeEventModal();
                    });
                    actionsWrap.appendChild(acceptBtn);
                }
            }

            modal.style.display = 'flex';
            setTimeout(() => modal.querySelector('.event-modal-box').classList.add('show'), 10);
        },

        _makeEventBtn: function(label, classes, onClick) {
            const btn = document.createElement('button');
            btn.className = 'event-action-btn ' + (classes || '');
            btn.innerHTML = label;
            btn.addEventListener('click', onClick);
            return btn;
        },

        closeEventModal: function() {
            const modal = document.getElementById('eventModal');
            if (!modal) return;
            modal.querySelector('.event-modal-box').classList.remove('show');
            setTimeout(() => { modal.style.display = 'none'; }, 280);
            if (this._pendingEvent && typeof this._pendingEvent.onClose === 'function') {
                this._pendingEvent.onClose(window.HexMap);
                if (window.UI) window.UI.updateResourceBar();
                if (window.Renderer) window.Renderer.render();
            }
            this._pendingEvent = null;
        },

        // ─── Goal Modal ────────────────────────────────────────
        openGoalModal: function() {
            const modal = document.getElementById('goalModal');
            if (!modal) return;
            modal.style.display = 'flex';
            setTimeout(() => modal.querySelector('.goal-modal-box').classList.add('show'), 10);
        },

        closeGoalModal: function() {
            const modal = document.getElementById('goalModal');
            if (!modal) return;
            modal.querySelector('.goal-modal-box').classList.remove('show');
            setTimeout(() => { modal.style.display = 'none'; }, 280);
        },

        // ─── Win / Lose Modals ─────────────────────────────────
        openWinModal: function() {
            const modal = document.getElementById('winModal');
            if (!modal) return;
            const turn  = window.GameState?.currentTurn || 0;
            const pop   = Math.floor(window.HexMap?.resources?.population || 0);
            const money = Math.floor(window.HexMap?.resources?.money || 0);
            modal.querySelector('.endgame-turn').textContent  = `Победа на ходу ${turn}`;
            modal.querySelector('.endgame-pop').textContent   = pop;
            modal.querySelector('.endgame-money').textContent = money.toLocaleString('ru-RU');
            modal.style.display = 'flex';
            setTimeout(() => modal.querySelector('.endgame-box').classList.add('show'), 10);
        },

        openLoseModal: function(reason) {
            const modal = document.getElementById('loseModal');
            if (!modal) return;
            const turn = window.GameState?.currentTurn || 0;
            modal.querySelector('.endgame-turn').textContent = `Поражение на ходу ${turn}`;
            modal.querySelector('.lose-reason').textContent  = reason || 'Цивилизация рухнула.';
            modal.style.display = 'flex';
            setTimeout(() => modal.querySelector('.endgame-box').classList.add('show'), 10);
        },

        // ─── City name confirm ─────────────────────────────────
        confirmName: function() {
            const name = this.cityNameInput.value.trim();
            if (!name) return;
            const nc = window.GameState.namingCell;
            if (!nc) return;

            const b = HM.buildings[nc.col + ',' + nc.row];
            if (!b) return;

            if (b.type === 'townhall') {
                const oldName = b.name || C.DEFAULT_CITY_NAME;
                b.name = name;
                HM.renameTerritory(oldName, name);
                HM.claimTerritory(nc.col, nc.row, name, 3);
                if (window.UI) window.UI.showNotification(`🏛️ Город «${name}» основан!`);
            } else if (b.type === 'local_admin') {
                b.name = name;
                HM.recalculateTerritory();
                if (window.UI) window.UI.showNotification(`🏢 Район «${name}» создан!`);
            }

            window.GameState.namingCell = null;
            this.closeCityModal();

            if (window.GameState.selectedCell &&
                window.GameState.selectedCell.col === nc.col &&
                window.GameState.selectedCell.row === nc.row) {
                if (window.UIPanel) window.UIPanel.openPanel(nc.col, nc.row);
            }
            window.Renderer.render();
        }
    };
})();
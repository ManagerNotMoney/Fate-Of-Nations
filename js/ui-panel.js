(function() {
    'use strict';
    const HM = window.HexMap;
    const C = window.GameConfig;
    const E = window.EconomyEngine;

    window.UIPanel = {
        panel: null,
        coords: null,
        type: null,
        cellOwner: null,
        catBasic: null,
        catBuildings: null,
        catTerrain: null,
        buildingsList: null,
        buildActionsContainer: null,
        queueSection: null,
        queueList: null,

        init: function() {
            this.panel                 = document.getElementById('cellPanel');
            this.coords                = document.getElementById('cellCoords');
            this.type                  = document.getElementById('cellType');
            this.cellOwner             = document.getElementById('cellOwner');
            this.catBasic              = document.getElementById('catBasic');
            this.catBuildings          = document.getElementById('catBuildings');
            this.catTerrain            = document.getElementById('catTerrain');
            this.buildingsList         = document.getElementById('buildingsList');
            this.buildActionsContainer = document.getElementById('buildActionsContainer');
            this.queueSection          = document.getElementById('queueSection');
            this.queueList             = document.getElementById('queueList');

            document.getElementById('btnClosePanel').addEventListener('click', () => this.closePanel());
        },

        // ─── Cell Panel ────────────────────────────────────────
        openPanel: function(col, row) {
            window.GameState.selectedCell = { col, row };
            const tile = HM.data[row][col];
            const key = col + ',' + row;
            const building = HM.buildings[key];
            const inQueue = HM.buildQueue.find(q => q.col === col && q.row === row);
            const owner = HM.getOwner(col, row);

            if (this.catBasic) {
                this.catBasic.style.display = 'block';
                if (this.cellOwner) {
                    if (owner) {
                        this.cellOwner.textContent = owner;
                        this.cellOwner.style.color = 'var(--gold)';
                    } else {
                        this.cellOwner.textContent = 'Ничейная земля';
                        this.cellOwner.style.color = 'var(--muted)';
                    }
                }
            }

            if (this.catBuildings) {
                if (building || inQueue) {
                    this.catBuildings.style.display = 'block';
                    let html = '';
                    if (building) {
                        const bc = C.BUILDINGS[building.type];
                        const level = building.level || 1;
                        const levelBadge = level > 1 ? ` <span class="building-level-badge">⭐ Уровень ${level}</span>` : '';
                        html += `<div class="building-card">
                            <div class="building-card-icon">${bc.icon}</div>
                            <div class="building-card-info">
                                <div class="building-card-name">${bc.name}${building.name ? ' «' + building.name + '»' : ''}${levelBadge}</div>
                                <div class="building-card-desc">${bc.description}</div>
                                ${this._renderBuildingStats(bc, building)}
                            </div>
                        </div>`;
                        html += this._renderCrisisTab(building);
                        if (bc.maxLevel && bc.maxLevel > 1) {
                            const canUpgrade = (building.level || 1) < bc.maxLevel;
                            const uc = bc.upgradeCost || {};
                            const costStr = Object.entries(uc).map(([r, a]) => `${C.RESOURCES[r]?.icon || r}${a}`).join(' ');
                            html += `<button class="upgrade-btn${canUpgrade ? '' : ' upgrade-btn--disabled'}" data-action="upgrade" ${canUpgrade ? '' : 'disabled'}>
                                ⭐ Улучшить до уровня ${(building.level || 1) + 1} (${costStr})
                            </button>`;
                        }
                        if (bc.maxResidents) {
                            html += this._renderResidentsTab(bc, building);
                        }
                        if (bc.workersRequired) {
                            html += this._renderWorkersTab(bc, building);
                        }
                        if (building.type === 'market') {
                            html += this._renderMarketTab(building);
                        }
                        if (building.type === 'mine') {
                            html += this._renderMineTab(building);
                        }
                        if (building.type === 'factory') {
                            html += this._renderFactoryTab(building);
                        }
                        if (building.type === 'port') {
                            html += this._renderPortTab(building);
                        }
                        if (building.type === 'local_admin' && (building.assignedWorkers || 0) >= 1) {
                            html += this._renderDistrictTab(building);
                        }
                        // Rename button for townhall and local_admin
                        if (building.type === 'townhall' || building.type === 'local_admin') {
                            const renameIcon = building.type === 'townhall' ? '🏛️' : '🏢';
                            html += `<button class=\"rename-btn\" data-action=\"rename\">
                                ${renameIcon} Переименовать${building.name ? ' «' + building.name + '»' : ''}
                            </button>`;
                        }
                        // Demolish button (not for townhall)
                        if (building.type !== 'townhall') {
                            html += `<button class="demolish-btn" data-action="demolish" title="Снос безвозвратен">
                                🗑️ Снести здание
                            </button>`;
                        }
                    }
                    if (inQueue) {
                        const bc = C.BUILDINGS[inQueue.type];
                        html += `<div class="building-card building-card--queue">
                            <div class="building-card-icon">🔨</div>
                            <div class="building-card-info">
                                <div class="building-card-name">Строится: ${bc.name}</div>
                                <div class="building-card-desc">Осталось ходов: ${inQueue.turnsRemaining}</div>
                            </div>
                        </div>
                        <button class="cancel-build-btn" data-action="cancel" title="Вернуть базовую стоимость">
                            ↩️ Отменить строительство (вернуть монеты)
                        </button>`;
                    }
                    this.buildingsList.innerHTML = html;
                    this._bindWorkerButtons(col, row);
                    this._bindMineModeButtons(col, row);
                    this._bindFactoryModeButtons(col, row);
                    this._bindPortModeButtons(col, row);
                    this._bindCancelDemolishButtons(col, row);
                    this._bindCrisisButtons(col, row);
                } else {
                    this.catBuildings.style.display = 'none';
                    this.buildingsList.innerHTML = '';
                }
            }

            if (this.catTerrain) {
                this.catTerrain.style.display = 'block';
                this.coords.textContent = col + ', ' + row;
                this.type.textContent = C.TILES[tile.type].name;
            }

            this._renderBuildActions(col, row, tile, building, inQueue);
            this.updateQueue();
            this.panel.classList.add('open');
            window.Renderer.render();
        },

        // ─── Residents Tab ────────────────────────────────────
        _renderResidentsTab: function(bc, building) {
            const resData = E.getBuildingResidents(HM, building.col, building.row);
            if (!resData) return '';
            const { residents, max } = resData;
            const pct = max > 0 ? Math.round((residents / max) * 100) : 0;
            const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f4b942' : '#4ade80';

            return `<div class="info-tab residents-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">🏘️</span>
                    <span class="info-tab-title">Жители</span>
                    <span class="info-tab-badge" style="color:${barColor}">${residents} / ${max}</span>
                </div>
                <div class="info-tab-body">
                    <div class="capacity-bar-wrap">
                        <div class="capacity-bar">
                            <div class="capacity-bar-fill" style="width:${pct}%;background:${barColor};"></div>
                        </div>
                        <span class="capacity-label">${pct}% заполнено</span>
                    </div>
                    <div class="residents-detail">
                        <span class="res-detail-item">👤 Живёт: <b>${residents}</b></span>
                        <span class="res-detail-item">🏠 Вместимость: <b>${max}</b></span>
                        <span class="res-detail-item" style="color:${max - residents > 0 ? '#4ade80' : '#f87171'}">
                            ${max - residents > 0 ? `✓ Свободно мест: ${max - residents}` : '⚠️ Заполнено'}
                        </span>
                    </div>
                </div>
            </div>`;
        },

        // ─── District Tab (local_admin / townhall) ────────────
        _renderDistrictTab: function(building) {
            const stats = E.getDistrictStats(HM, building.col, building.row);
            const ideo  = E.getDistrictIdeology(HM, building.col, building.row);
            const { residents, workInside, workOutside, unemployed, commutersIn, workingHere } = stats;

            // ── Ideology section ──────────────────────────────
            let ideoHtml = '';
            if (ideo && ideo.total > 0) {
                const rows = Object.entries(ideo.IDEO_META).map(([key, meta]) => {
                    const n = ideo[key] || 0;
                    if (n <= 0) return '';
                    const pct = Math.round((n / ideo.total) * 100);
                    const isDominant = key === ideo.dominant;
                    return `<div class="district-ideo-row${isDominant ? ' dominant' : ''}">
                        <span class="district-ideo-icon">${meta.icon}</span>
                        <span class="district-ideo-label" style="color:${meta.color}">${meta.label}</span>
                        <div class="district-ideo-bar-wrap">
                            <div class="district-ideo-bar" style="width:${pct}%;background:${meta.color};opacity:0.75;"></div>
                        </div>
                        <span class="district-ideo-pct" style="color:${meta.color}">${n}&nbsp;(${pct}%)</span>
                        ${isDominant ? '<span class="district-ideo-crown">★</span>' : ''}
                    </div>`;
                }).join('');

                const dm = ideo.dominantMeta;
                const dominantBadge = dm
                    ? `<div class="district-dominant-badge" style="border-color:${dm.color}40;background:${dm.color}12;color:${dm.color}">
                           ${dm.icon} Доминирует: <b>${dm.label}</b>
                       </div>`
                    : '';

                ideoHtml = `<div class="district-ideo-section">
                    <div class="district-ideo-title">⚑ Политические фракции района</div>
                    ${dominantBadge}
                    <div class="district-ideo-list">${rows}</div>
                </div>`;
            }

            return `<div class="info-tab district-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">🏙️</span>
                    <span class="info-tab-title">Район (радиус 7)</span>
                    <span class="info-tab-badge" style="color:#4ade80">${residents} 👥</span>
                </div>
                <div class="info-tab-body">
                    <div class="residents-detail">
                        <span class="res-detail-item">🏠 Живёт в районе: <b>${residents}</b></span>
                        <span class="res-detail-item">🛠️ Работает в районе: <b>${workingHere}</b></span>
                        <span class="res-detail-item">🚶 Приезжают из других районов: <b>${commutersIn}</b></span>
                        <span class="res-detail-item">🌍 Уезжают работать за пределы: <b>${workOutside}</b></span>
                        ${unemployed > 0 ? `<span class="res-detail-item" style="color:#f87171">😴 Без работы: <b>${unemployed}</b></span>` : ''}
                    </div>
                    ${ideoHtml}
                </div>
            </div>`;
        },

        // ─── Workers Tab ──────────────────────────────────────
        _renderWorkersTab: function(bc, building) {
            const assigned = building.assignedWorkers || 0;
            const required = bc.workersRequired;
            const level = building.level || 1;
            let maxWorkers = bc.workersMax || bc.workersRequired;
            if (bc.levelWorkersMax && bc.levelWorkersMax[level] !== undefined) {
                maxWorkers = bc.levelWorkersMax[level];
            }
            const free = E.getFreeWorkers(HM);

            // Check for strike
            let onStrike = false;
            if (window.EventsEngine) {
                const strike = window.EventsEngine.getActiveStrike();
                if (strike && strike.targetCol === building.col && strike.targetRow === building.row) {
                    onStrike = true;
                }
            }

            const isActive = !onStrike && assigned >= required;

            const slots = [];
            for (let i = 0; i < maxWorkers; i++) {
                const filled = i < assigned;
                slots.push(`<div class="worker-slot ${filled ? 'filled' : 'empty'}" data-slot="${i}">
                    <span class="worker-slot-icon">${filled ? '👷' : '👤'}</span>
                    <span class="worker-slot-label">${filled ? 'Рабочий' : 'Вакансия'}</span>
                </div>`);
            }

            const canAdd = assigned < maxWorkers && free > 0;
            const canRemove = assigned > 0;

            return `<div class="info-tab workers-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">⚒️</span>
                    <span class="info-tab-title">Рабочие</span>
                    <span class="info-tab-badge ${isActive ? 'badge-active' : onStrike ? 'badge-strike' : 'badge-inactive'}">
                        ${onStrike ? '✊ Забастовка' : isActive ? '✓ Работает' : '✗ Простаивает'}
                    </span>
                </div>
                <div class="info-tab-body">
                    <div class="worker-slots">${slots.join('')}</div>
                    <div class="worker-stats">
                        <span class="worker-stat-item">
                            <span style="color:var(--muted)">Назначено:</span> <b>${assigned}/${maxWorkers}</b>
                        </span>
                        <span class="worker-stat-item">
                            <span style="color:var(--muted)">Свободных жителей:</span>
                            <b style="color:${free > 0 ? '#4ade80' : '#f87171'}">${free}</b>
                        </span>
                    </div>
                    <div class="worker-controls">
                        <button class="worker-btn worker-btn-remove" data-action="remove" ${canRemove ? '' : 'disabled'}>
                            <span>−</span> Убрать рабочего
                        </button>
                        <button class="worker-btn worker-btn-add" data-action="add" ${canAdd ? '' : 'disabled'}>
                            <span>+</span> Назначить рабочего
                        </button>
                    </div>
                    ${!isActive && assigned < required ? `<div class="worker-warning">⚠️ Нужно ещё ${required - assigned} рабочих для работы здания</div>` : ''}
                    ${!canAdd && assigned < required ? `<div class="worker-warning" style="color:#f87171">😔 Нет свободных жителей — постройте дома!</div>` : ''}
                    <div class="worker-hint" style="margin-top:8px;padding:6px 9px;background:rgba(79,142,247,0.06);border:1px solid rgba(79,142,247,0.15);border-radius:7px;font-size:11px;color:var(--accent);line-height:1.4;">🖱️ ПКМ по клетке на карте — быстро назначить всех рабочих</div>
                </div>
            </div>`;
        },

        // ─── Crisis Tab (саранча / забастовка) ────────────────
        _renderCrisisTab: function(building) {
            const EV = window.EventsEngine;
            if (!EV) return '';

            // ── Саранча на ферме ──
            if (building.type === 'farm') {
                const locust = EV.getActiveLocust();
                if (locust && locust.affectedFarms.some(f => f.col === building.col && f.row === building.row)) {
                    return `<div class="info-tab crisis-tab crisis-tab--locust">
                        <div class="info-tab-header">
                            <span class="info-tab-icon">🦗</span>
                            <span class="info-tab-title">Нашествие саранчи</span>
                            <span class="info-tab-badge badge-strike">⏳ ${locust.turnsLeft} ход.</span>
                        </div>
                        <div class="info-tab-body">
                            <div class="crisis-desc">Поле кишит саранчой — урожай пшеницы с этой фермы уничтожается.</div>
                            <button class="crisis-btn crisis-btn--disinfect" data-crisis="disinfect">
                                <span class="crisis-btn-icon">🧪</span>
                                <span class="crisis-btn-label">Дезинфицировать поле</span>
                                <span class="crisis-btn-cost">−15 💰</span>
                            </button>
                        </div>
                    </div>`;
                }
            }

            // ── Забастовка на здании ──
            const strike = EV.getActiveStrike();
            if (strike && strike.targetCol === building.col && strike.targetRow === building.row) {
                return `<div class="info-tab crisis-tab crisis-tab--strike">
                    <div class="info-tab-header">
                        <span class="info-tab-icon">✊</span>
                        <span class="info-tab-title">Забастовка рабочих</span>
                        <span class="info-tab-badge badge-strike">⏳ ${strike.turnsLeft} ход.</span>
                    </div>
                    <div class="info-tab-body">
                        <div class="crisis-desc">Рабочие отказываются выходить на смену — здание простаивает.</div>
                        <div class="crisis-btn-row">
                            <button class="crisis-btn crisis-btn--bonus" data-crisis="strike-bonus">
                                <span class="crisis-btn-icon">💸</span>
                                <span class="crisis-btn-label">Выдать премии</span>
                                <span class="crisis-btn-cost">−300 💰</span>
                            </button>
                            <button class="crisis-btn crisis-btn--suppress" data-crisis="strike-suppress">
                                <span class="crisis-btn-icon">⚔️</span>
                                <span class="crisis-btn-label">Подавить</span>
                                <span class="crisis-btn-cost">−100 🛡️</span>
                            </button>
                        </div>
                    </div>
                </div>`;
            }

            return '';
        },

        _bindCrisisButtons: function(col, row) {
            const EV = window.EventsEngine;
            if (!EV) return;

            this.buildingsList.querySelectorAll('[data-crisis]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.crisis;
                    let result;
                    if (action === 'disinfect') {
                        result = EV.disinfectFarm(HM, col, row);
                    } else if (action === 'strike-bonus') {
                        result = EV.resolveStrikeAction(HM, col, row, 'bonus');
                    } else if (action === 'strike-suppress') {
                        result = EV.resolveStrikeAction(HM, col, row, 'suppress');
                    }
                    if (!result) return;

                    if (window.UI) {
                        window.UI.showNotification((result.ok ? '✅ ' : '⚠️ ') + result.message, result.ok ? 3500 : 2500);
                        window.UI.updateResourceBar();
                    }
                    if (result.ok) {
                        this.openPanel(col, row);
                        window.Renderer.render();
                    }
                });
            });
        },


        _renderMineTab: function(building) {
            const cfg = C.BUILDINGS['mine'];
            const mode = building.mineMode || 'gold';
            const modes = cfg.mineModes || ['gold'];
            const modeNames = cfg.mineModeNames || {};
            const modeIcons = cfg.mineModeIcons || {};
            const modeProduction = cfg.mineModeProduction || {};

            const modeButtons = modes.map(m => {
                const isActive = m === mode;
                const prod = modeProduction[m];
                const prodStr = prod ? Object.entries(prod).map(([r, a]) => `+${a} ${C.RESOURCES[r]?.icon || r}`).join(' ') : '';
                return `<button class="mine-mode-btn ${isActive ? 'active' : ''}" data-mode="${m}">
                    <span class="mine-mode-icon">${modeIcons[m] || '⛏️'}</span>
                    <span class="mine-mode-name">${modeNames[m] || m}</span>
                    <span class="mine-mode-prod">${prodStr}</span>
                </button>`;
            }).join('');

            return `<div class="info-tab mine-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">⛏️</span>
                    <span class="info-tab-title">Режим добычи</span>
                    <span class="info-tab-badge badge-gold">${modeNames[mode] || mode}</span>
                </div>
                <div class="info-tab-body">
                    <div class="mine-mode-grid">${modeButtons}</div>
                    <div class="mine-hint">💡 Выберите ресурс для добычи. Переключение мгновенное.</div>
                </div>
            </div>`;
        },

        _renderFactoryTab: function(building) {
            const cfg = C.BUILDINGS['factory'];
            const level = building.level || 1;
            const mode = building.factoryMode || 'goods';
            const modes = cfg.factoryModes || ['goods'];
            const modeNames = cfg.factoryModeNames || {};
            const modeIcons = cfg.factoryModeIcons || {};
            const modeProd = cfg.factoryModeProduction || {};
            const modeCons = cfg.factoryModeConsumption || {};

            const modeButtons = modes.map(m => {
                const isActive = m === mode;
                const locked = m === 'steel' && level < 2;
                const prod = modeProd[m];
                const cons = modeCons[m];
                const prodStr = prod ? Object.entries(prod).map(([r, a]) => `+${a} ${C.RESOURCES[r]?.icon || r}`).join(' ') : '';
                const consStr = cons ? Object.entries(cons).map(([r, a]) => `-${a} ${C.RESOURCES[r]?.icon || r}`).join(' ') : '';
                return `<button class="mine-mode-btn ${isActive ? 'active' : ''} ${locked ? 'mine-mode-btn--locked' : ''}" data-factory-mode="${m}" ${locked ? 'disabled' : ''}>
                    <span class="mine-mode-icon">${modeIcons[m] || '🏭'}</span>
                    <span class="mine-mode-name">${modeNames[m] || m}${locked ? ' 🔒 ур.2' : ''}</span>
                    <span class="mine-mode-prod">${prodStr}${consStr ? ' | ' + consStr : ''}</span>
                </button>`;
            }).join('');

            const assigned = building.assignedWorkers || 0;
            const extraWorkers = Math.max(0, assigned - cfg.workersRequired);
            const efficiency = Math.round((1 + extraWorkers * (1/3)) * 100);

            return `<div class="info-tab mine-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">🏭</span>
                    <span class="info-tab-title">Режим производства</span>
                    <span class="info-tab-badge badge-gold">${modeNames[mode] || mode}</span>
                </div>
                <div class="info-tab-body">
                    <div class="mine-mode-grid">${modeButtons}</div>
                    <div class="mine-hint">⚡ Эффективность: <b>${efficiency}%</b> (${assigned}/${cfg.workersMax} рабочих). Каждый доп. рабочий сверх ${cfg.workersRequired} даёт +33%.</div>
                    ${level < 2 ? '<div class="mine-hint" style="color:var(--muted);margin-top:4px;">🔒 Режим «Сталь» открывается на уровне 2</div>' : ''}
                </div>
            </div>`;
        },

        _renderMarketTab: function(building) {
            const income = E.getMarketIncome(HM, building.col, building.row);
            const cfg = C.BUILDINGS['market'];
            const radius = cfg.marketRadius || 5;
            const perPerson = cfg.moneyPerResident || 1;
            const nearbyPop = E.getPopulationInRadius(HM, building.col, building.row, radius);
            const hasCompetitor = E.hasNearbyMarket(HM, building.col, building.row);

            return `<div class="info-tab market-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">📈</span>
                    <span class="info-tab-title">Торговля</span>
                    <span class="info-tab-badge badge-gold">💰 +${income}/ход</span>
                </div>
                <div class="info-tab-body">
                    <div class="market-stats">
                        <div class="market-stat">
                            <div class="market-stat-label">Радиус торговли</div>
                            <div class="market-stat-val">${radius} клеток</div>
                        </div>
                        <div class="market-stat">
                            <div class="market-stat-label">Жители в домах рядом</div>
                            <div class="market-stat-val">${nearbyPop} чел.</div>
                        </div>
                        <div class="market-stat">
                            <div class="market-stat-label">Доход за жителя</div>
                            <div class="market-stat-val">× ${perPerson} 💰</div>
                        </div>
                        <div class="market-stat highlight">
                            <div class="market-stat-label">Итого в ход</div>
                            <div class="market-stat-val" style="color:#f4b942;font-size:16px;">+${income} 💰</div>
                        </div>
                    </div>
                    ${hasCompetitor
                        ? `<div class="market-hint" style="color:#f87171">⚠️ Конкуренция! Рядом есть другой рынок — доход снижен в 3 раза</div>`
                        : `<div class="market-hint">💡 Только жители из домов приносят доход. Держите рынки подальше друг от друга!</div>`
                    }
                </div>
            </div>`;
        },

        _bindMineModeButtons: function(col, row) {
            const modeBtns = this.buildingsList.querySelectorAll('.mine-mode-btn');
            modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const newMode = btn.dataset.mode;
                    const b = HM.buildings[col + ',' + row];
                    if (b && b.type === 'mine') {
                        b.mineMode = newMode;
                        if (window.UI) window.UI.showNotification(`⛏️ Режим шахты: ${C.BUILDINGS.mine.mineModeNames[newMode] || newMode}`);
                        this.openPanel(col, row);
                        window.Renderer.render();
                    }
                });
            });
        },

        _bindFactoryModeButtons: function(col, row) {
            const modeBtns = this.buildingsList.querySelectorAll('[data-factory-mode]');
            modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const newMode = btn.dataset.factoryMode;
                    const b = HM.buildings[col + ',' + row];
                    if (b && b.type === 'factory') {
                        const level = b.level || 1;
                        if (newMode === 'steel' && level < 2) {
                            if (window.UI) window.UI.showNotification('🔒 Режим «Сталь» доступен только на уровне 2');
                            return;
                        }
                        b.factoryMode = newMode;
                        if (window.UI) window.UI.showNotification(`🏭 Режим завода: ${C.BUILDINGS.factory.factoryModeNames[newMode] || newMode}`);
                        E.computeDeltas(HM);
                        this.openPanel(col, row);
                        window.Renderer.render();
                    }
                });
            });
        },

        _renderPortTab: function(building) {
            const cfg = C.BUILDINGS['port'];
            const level = building.level || 1;
            const mode = building.portMode || 'fishing';
            const modes = cfg.portModes || ['fishing'];
            const modeNames = cfg.portModeNames || {};
            const modeIcons = cfg.portModeIcons || {};
            const assigned = building.assignedWorkers || 0;

            const modeButtons = modes.map(m => {
                const isActive = m === mode;
                const locked = m === 'trade' && level < 2;
                let prodStr = '';
                if (m === 'fishing') {
                    const fish = assigned === 1 ? 2 : assigned >= 2 ? 5 : 2;
                    prodStr = `+${fish} 🐟`;
                } else if (m === 'trade') {
                    prodStr = '+1 🐟 +3 💰';
                }
                return `<button class="mine-mode-btn ${isActive ? 'active' : ''} ${locked ? 'mine-mode-btn--locked' : ''}" data-port-mode="${m}" ${locked ? 'disabled' : ''}>
                    <span class="mine-mode-icon">${modeIcons[m] || '⚓'}</span>
                    <span class="mine-mode-name">${modeNames[m] || m}${locked ? ' 🔒 ур.2' : ''}</span>
                    <span class="mine-mode-prod">${prodStr}</span>
                </button>`;
            }).join('');

            const hasWarehouse = E.hasNearbyWarehouse(HM, building.col, building.row);
            const tradeBonus = hasWarehouse ? 4 : 0;

            return `<div class="info-tab mine-tab">
                <div class="info-tab-header">
                    <span class="info-tab-icon">⚓</span>
                    <span class="info-tab-title">Режим порта</span>
                    <span class="info-tab-badge badge-gold">${modeNames[mode] || mode}</span>
                </div>
                <div class="info-tab-body">
                    <div class="mine-mode-grid">${modeButtons}</div>
                    ${level < 2 ? '<div class="mine-hint" style="color:var(--muted);margin-top:4px;">🔒 Режим «Торговля» открывается на уровне 2</div>' : ''}
                    ${mode === 'trade' && level >= 2 ? `<div class="market-hint" style="${hasWarehouse ? 'color:#4ade80;border-color:rgba(34,197,94,0.2);background:rgba(34,197,94,0.06);' : ''}">
                        📦 Склад рядом: ${hasWarehouse ? `✅ +4 💰 (итого 7 💰)` : '❌ нет — постройте склад в радиусе 2 клеток'}
                    </div>` : ''}
                </div>
            </div>`;
        },

        _bindPortModeButtons: function(col, row) {
            const modeBtns = this.buildingsList.querySelectorAll('[data-port-mode]');
            modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const newMode = btn.dataset.portMode;
                    const b = HM.buildings[col + ',' + row];
                    if (b && b.type === 'port') {
                        const level = b.level || 1;
                        if (newMode === 'trade' && level < 2) {
                            if (window.UI) window.UI.showNotification('🔒 Режим «Торговля» доступен только на уровне 2');
                            return;
                        }
                        b.portMode = newMode;
                        if (window.UI) window.UI.showNotification(`⚓ Режим порта: ${C.BUILDINGS.port.portModeNames[newMode] || newMode}`);
                        E.computeDeltas(HM);
                        this.openPanel(col, row);
                        window.Renderer.render();
                    }
                });
            });
        },

        _bindCancelDemolishButtons: function(col, row) {
            const cancelBtn = this.buildingsList.querySelector('.cancel-build-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    const result = E.cancelBuild(HM, col, row);
                    if (result.ok) {
                        if (window.UI) window.UI.showNotification('↩️ Строительство отменено, монеты возвращены');
                        if (window.UI) window.UI.updateResourceBar();
                        this.openPanel(col, row);
                        window.Renderer.render();
                    } else {
                        if (window.UI) window.UI.showNotification('⚠️ ' + result.reason, 2500);
                    }
                });
            }

            const demolishBtn = this.buildingsList.querySelector('.demolish-btn');
            if (demolishBtn) {
                demolishBtn.addEventListener('click', () => {
                    const key = col + ',' + row;
                    const b = HM.buildings[key];
                    if (!b) return;
                    const bc = C.BUILDINGS[b.type];
                    // Confirm before demolishing
                    if (!confirm(`Снести «${bc.name}»? Возврат средств не предусмотрен.`)) return;
                    const result = E.demolishBuilding(HM, col, row);
                    if (result.ok) {
                        if (window.UI) window.UI.showNotification(`🗑️ ${bc.name} снесено`);
                        if (window.UI) window.UI.updateResourceBar();
                        this.openPanel(col, row);
                        window.Renderer.render();
                    } else {
                        if (window.UI) window.UI.showNotification('⚠️ ' + result.reason, 2500);
                    }
                });
            }

            const upgradeBtn = this.buildingsList.querySelector('.upgrade-btn');
            if (upgradeBtn) {
                upgradeBtn.addEventListener('click', () => {
                    const result = E.upgradeBuilding(HM, col, row);
                    if (result.ok) {
                        const b = HM.buildings[col + ',' + row];
                        const bc = C.BUILDINGS[b.type];
                        if (window.UI) window.UI.showNotification(`⭐ ${bc.name} улучшен до уровня ${b.level}!`);
                        if (window.UI) window.UI.updateResourceBar();
                        this.openPanel(col, row);
                        window.Renderer.render();
                    } else {
                        if (window.UI) window.UI.showNotification('⚠️ ' + result.reason, 2500);
                    }
                });
            }

            const renameBtn = this.buildingsList.querySelector('.rename-btn');
            if (renameBtn) {
                renameBtn.addEventListener('click', () => {
                    const b = HM.buildings[col + ',' + row];
                    if (!b) return;
                    window.GameState.namingCell = { col, row, type: b.type };
                    if (window.UIModals) {
                        const modalType = b.type === 'local_admin' ? 'rename-district' : 'rename-city';
                        window.UIModals.openCityNameModal(modalType);
                        // Pre-fill with current name
                        const input = document.getElementById('cityNameInput');
                        if (input && b.name) input.value = b.name;
                    }
                });
            }
        },

        _bindWorkerButtons: function(col, row) {
            const addBtn = this.buildingsList.querySelector('.worker-btn-add');
            const removeBtn = this.buildingsList.querySelector('.worker-btn-remove');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    const result = E.assignWorker(HM, col, row);
                    if (result.ok) {
                        if (window.UI) window.UI.showNotification('👷 Рабочий назначен!');
                        if (window.UI) window.UI.updateResourceBar();
                        this.openPanel(col, row);
                        window.Renderer.render();
                    } else {
                        if (window.UI) window.UI.showNotification('⚠️ ' + result.reason, 2500);
                    }
                });
            }
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    const result = E.removeWorker(HM, col, row);
                    if (result.ok) {
                        if (window.UI) window.UI.showNotification('👤 Рабочий освобождён');
                        if (window.UI) window.UI.updateResourceBar();
                        this.openPanel(col, row);
                        window.Renderer.render();
                    } else {
                        if (window.UI) window.UI.showNotification('⚠️ ' + result.reason, 2500);
                    }
                });
            }
        },

        _renderBuildingStats: function(bc, building) {
            const parts = [];
            const level = building.level || 1;

            // Check for strike
            if (window.EventsEngine) {
                const strike = window.EventsEngine.getActiveStrike();
                if (strike && strike.targetCol === building.col && strike.targetRow === building.row) {
                    parts.push(`<span class="bstat" style="background:rgba(251,191,36,0.15);color:#fbbf24;">✊ Забастовка! Производство остановлено</span>`);
                }
            }
            if (bc.production) {
                if (building.type === 'market') {
                    const income = E.getMarketIncome(HM, building.col, building.row);
                    parts.push(`<span class="bstat prod">💰 +${income} монет/ход</span>`);
                } else if (building.type === 'mill') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const wheatNeeded = level === 2 ? 4 : 2;
                    const breadProduced = level === 2 ? 5 : 2;
                    parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">🍞 +${breadProduced} хлеба/ход</span>`);
                    parts.push(`<span class="bstat cons">🌾 -${wheatNeeded} пшеницы/ход</span>`);
                } else if (building.type === 'farm') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const workers = building.assignedWorkers || 0;
                    const baseWheat = bc.production.wheat || 3;
                    const perWorker = baseWheat * (level === 2 ? 1.5 : 1);
                    const total = Math.round(perWorker * workers * 10) / 10;
                    parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">🌾 +${total} пшеницы/ход (${workers} раб.)</span>`);
                } else if (building.type === 'mine') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const mode = building.mineMode || 'gold';
                    const level = building.level || 1;
                    const modeProduction = bc.mineModeProduction || {};
                    const prod = modeProduction[mode] || { money: 5 };
                    for (const [res, amt] of Object.entries(prod)) {
                        const rc = C.RESOURCES[res];
                        if (rc) {
                            // Level 2: +25% per extra worker (up to 3 workers)
                            const workers = building.assignedWorkers || 0;
                            const maxBase = (bc.levelWorkersMax && bc.levelWorkersMax[1]) || 2;
                            const extraWorkers = level >= 2 ? Math.max(0, workers - maxBase) : 0;
                            const multiplier = 1 + extraWorkers * 0.25;
                            const total = Math.round(amt * multiplier * 10) / 10;
                            parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">${rc.icon} +${total} ${rc.name}/ход</span>`);
                        }
                    }
                } else if (building.type === 'factory') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const factLevel = building.level || 1;
                    const factMode = building.factoryMode || 'goods';
                    const effectiveMode = (factMode === 'steel' && factLevel < 2) ? 'goods' : factMode;
                    const cfg2 = C.BUILDINGS['factory'];
                    const prod = cfg2.factoryModeProduction[effectiveMode] || {};
                    const cons = cfg2.factoryModeConsumption[effectiveMode] || {};
                    const assigned = building.assignedWorkers || 0;
                    const extraWorkers = Math.max(0, assigned - cfg2.workersRequired);
                    const factor = 1 + extraWorkers * (1/3);
                    for (const [res, amt] of Object.entries(prod)) {
                        const rc = C.RESOURCES[res];
                        if (rc) parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">${rc.icon} +${Math.round(amt * factor * 10)/10} ${rc.name}/ход</span>`);
                    }
                    for (const [res, amt] of Object.entries(cons)) {
                        const rc = C.RESOURCES[res];
                        if (rc) parts.push(`<span class="bstat cons">${rc.icon} -${amt} ${rc.name}/ход</span>`);
                    }
                } else if (building.type === 'smelter') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const woodNeeded = bc.consumption?.wood || 3;
                    const coalProduced = bc.production?.coal || 1;
                } else if (building.type === 'sawmill') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const tile = HM.data[building.row][building.col];
                    const baseWood = bc.production?.wood || 3;
                    const wood = tile.type === 'fertile' ? baseWood * 2 : baseWood;
                    parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">🟫 +${wood} дерева/ход (${tile.type === 'fertile' ? 'плодородная' : 'равнина'})</span>`);
                } else if (building.type === 'port') {
                    const active = E.isBuildingActive(HM, building.col, building.row);
                    const portLevel = building.level || 1;
                    const portMode = building.portMode || 'fishing';
                    const effectiveMode = (portMode === 'trade' && portLevel < 2) ? 'fishing' : portMode;
                    const assigned = building.assignedWorkers || 0;
                    if (effectiveMode === 'trade') {
                        parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">🐟 +1 рыбы/ход</span>`);
                        parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">💰 +3 монеты/ход</span>`);
                    } else {
                        const fish = assigned === 1 ? 2 : assigned >= 2 ? 5 : 0;
                        parts.push(`<span class="bstat prod" style="${!active ? 'opacity:0.5' : ''}">🐟 +${fish} рыбы/ход (${assigned}/2 рыбаков)</span>`);
                    }
                } else {
                    for (const [res, amt] of Object.entries(bc.production)) {
                        if (amt <= 0) continue;
                        const rc = C.RESOURCES[res];
                        if (rc) {
                            const active = E.isBuildingActive(HM, building.col, building.row);
                            parts.push(`<span class="bstat prod" style="${!active && bc.workersRequired ? 'opacity:0.5' : ''}">${rc.icon} +${amt} ${rc.name}/ход</span>`);
                        }
                    }
                }
            }
            if (bc.consumption && building.type !== 'mill' && building.type !== 'factory') {
                for (const [res, amt] of Object.entries(bc.consumption)) {
                    const rc = C.RESOURCES[res];
                    if (rc) parts.push(`<span class="bstat cons">${rc.icon} -${amt} ${rc.name}/ход</span>`);
                }
            }
            return parts.length ? '<div class="bstats">' + parts.join('') + '</div>' : '';
        },

        _renderBuildActions: function(col, row, tile, building, inQueue) {
            if (!this.buildActionsContainer) return;

            if (building || inQueue) {
                this.buildActionsContainer.style.display = 'none';
                return;
            }

            this.buildActionsContainer.style.display = 'block';

            const shouldHide = function(type, tileType) {
                return !E.isTerrainCompatible(type, tileType);
            };

            const btns = Object.entries(C.BUILDINGS).map(([type, bc]) => {
                if (shouldHide(type, tile.type)) return '';

                const check = E.canBuild(HM, col, row, type);

                // Dynamic cost
                const dynCost = E.getDynamicCost(HM, type);
                let costHtml = '';
                if (type === 'local_admin') {
                    const cost = dynCost.money || 0;
                    const baseCost = (Object.values(HM.buildings).filter(b => b.type === 'local_admin').length) * 500;
                    costHtml = `💰${cost}`;
                } else {
                    costHtml = Object.entries(dynCost).map(([r, a]) =>
                        `${C.RESOURCES[r] ? C.RESOURCES[r].icon : r}${a}`
                    ).join(' ');
                }

                // Show markup hint if price is inflated
                let priceMarkup = '';
                if (type !== 'local_admin') {
                    const baseCostEntries = Object.entries(bc.cost || {});
                    if (baseCostEntries.length > 0) {
                        const [baseRes, baseAmt] = baseCostEntries[0];
                        const dynAmt = dynCost[baseRes] || 0;
                        if (dynAmt > baseAmt) {
                            const pct = Math.round(((dynAmt - baseAmt) / baseAmt) * 100);
                            priceMarkup = `<span class="build-price-markup">+${pct}%</span>`;
                        }
                    }
                }

                const turnsHtml = bc.turnsToComplete > 1 ? `<span class="build-turns">${bc.turnsToComplete} хода</span>` : '';
                const maxWorkers = bc.workersMax || bc.workersRequired;
                const workersHtml = bc.workersRequired ? `<span class="build-workers">👷 ${bc.workersRequired}${maxWorkers > bc.workersRequired ? '–' + maxWorkers : ''}</span>` : '';
                const disabled = !check.ok;
                const title = disabled ? check.reason : bc.description;
                return `<button class="build-btn${disabled ? ' build-btn--disabled' : ''}"
                    data-type="${type}" title="${title}" ${disabled ? 'disabled' : ''}>
                    <span class="build-btn-icon">${bc.icon}</span>
                    <div class="build-btn-info">
                        <span class="build-btn-name">${bc.name} ${workersHtml}</span>
                        <span class="build-btn-cost">${costHtml || 'Бесплатно'} ${priceMarkup} ${turnsHtml}</span>
                    </div>
                    ${disabled ? `<span class="build-btn-reason">${check.reason}</span>` : ''}
                </button>`;
            }).filter(html => html !== '').join('');

            this.buildActionsContainer.innerHTML = `
                <span class="actions-label">🏗️ Строительство</span>
                <div class="build-grid">${btns}</div>
            `;

            this.buildActionsContainer.querySelectorAll('.build-btn:not(.build-btn--disabled)').forEach(btn => {
                btn.addEventListener('click', () => this.build(col, row, btn.dataset.type));
            });
        },

        closePanel: function() {
            window.GameState.selectedCell = null;
            if (this.panel) this.panel.classList.remove('open');
            if (window.Renderer) window.Renderer.render();
        },

        build: function(col, row, type) {
            const result = E.queueBuild(HM, col, row, type);
            if (result.ok) {
                const bc = C.BUILDINGS[type];
                // Track last built type for stamp mode
                window.GameState.lastBuildType = type;
                if (window._updateStampHint) window._updateStampHint();

                if (window.UI) window.UI.showNotification(bc.icon + ' ' + bc.name + ' поставлена в очередь строительства');
                if (window.UI) window.UI.updateResourceBar();
                this.openPanel(col, row);
                if (window.UI) window.UI.startConstructionAnim();
                if (Math.random() < 0.2) {
                    setTimeout(() => {
                        if (window.UI) window.UI.showNotification(window.UI.nextQuip());
                    }, 3200);
                }
            } else {
                if (window.UI) window.UI.showNotification('⚠️ ' + result.reason, 2500);
            }
        },

        // ─── Quick Worker Assignment (ПКМ) ────────────────────
        quickAssignWorkers: function(col, row) {
            const key = col + ',' + row;
            const building = HM.buildings[key];
            if (!building) return;

            const bc = C.BUILDINGS[building.type];
            if (!bc || !bc.workersRequired) {
                if (window.UI) window.UI.showNotification('ℹ️ Это здание не требует рабочих', 2000);
                return;
            }

            const level = building.level || 1;
            let maxWorkers = bc.workersMax || bc.workersRequired;
            if (bc.levelWorkersMax && bc.levelWorkersMax[level] !== undefined) {
                maxWorkers = bc.levelWorkersMax[level];
            }

            // Если уже все назначены — снимаем всех (toggle)
            if ((building.assignedWorkers || 0) >= maxWorkers) {
                let removed = 0;
                while ((building.assignedWorkers || 0) > 0) {
                    const r = E.removeWorker(HM, col, row);
                    if (!r.ok) break;
                    removed++;
                }
                if (window.UI) {
                    window.UI.showNotification(`👤 Убрано рабочих: ${removed}`, 2000);
                    window.UI.updateResourceBar();
                }
            } else {
                // Назначаем столько, сколько можно
                let added = 0;
                while ((building.assignedWorkers || 0) < maxWorkers) {
                    const r = E.assignWorker(HM, col, row);
                    if (!r.ok) break;
                    added++;
                }
                if (added > 0) {
                    if (window.UI) {
                        window.UI.showNotification(`👷 Назначено рабочих: ${added}`, 2000);
                        window.UI.updateResourceBar();
                    }
                } else {
                    if (window.UI) window.UI.showNotification('⚠️ Нет свободных жителей — постройте дома!', 2500);
                }
            }

            // Обновляем панель если открыта на этой клетке
            if (window.GameState.selectedCell &&
                window.GameState.selectedCell.col === col &&
                window.GameState.selectedCell.row === row) {
                this.openPanel(col, row);
            }
            window.Renderer.render();
        },

        // ─── Queue ─────────────────────────────────────────────
        updateQueue: function() {
            if (!this.queueSection) return;
            if (HM.buildQueue.length > 0) {
                this.queueSection.style.display = 'block';
                this.queueList.innerHTML = HM.buildQueue.map(q => {
                    const bc = C.BUILDINGS[q.type];
                    const total = bc.turnsToComplete;
                    const pct = Math.round(((total - q.turnsRemaining) / total) * 100);
                    return `<div class="queue-item" data-col="${q.col}" data-row="${q.row}">
                        <div class="queue-item-header">
                            <span class="queue-item-icon">${bc.icon}</span>
                            <span class="queue-item-name">${bc.name}</span>
                            <span class="queue-item-turns">${q.turnsRemaining} хода</span>
                            <button class="queue-cancel-btn" data-col="${q.col}" data-row="${q.row}" title="Отменить и вернуть монеты">✕</button>
                        </div>
                        <div class="queue-item-coords">[${q.col}, ${q.row}] — ${C.TILES[HM.data[q.row][q.col].type].name}</div>
                        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
                    </div>`;
                }).join('');

                // Bind cancel buttons in queue
                this.queueList.querySelectorAll('.queue-cancel-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const c = parseInt(btn.dataset.col);
                        const r = parseInt(btn.dataset.row);
                        const result = E.cancelBuild(HM, c, r);
                        if (result.ok) {
                            if (window.UI) window.UI.showNotification('↩️ Строительство отменено, монеты возвращены');
                            if (window.UI) window.UI.updateResourceBar();
                            this.updateQueue();
                            if (window.GameState.selectedCell) {
                                this.openPanel(window.GameState.selectedCell.col, window.GameState.selectedCell.row);
                            }
                            window.Renderer.render();
                        }
                    });
                });
            } else {
                this.queueSection.style.display = 'none';
            }
        }
    };
})();
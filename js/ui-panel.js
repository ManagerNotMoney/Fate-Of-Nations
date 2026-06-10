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
                        html += `<div class="building-card">
                            <div class="building-card-icon">${bc.icon}</div>
                            <div class="building-card-info">
                                <div class="building-card-name">${bc.name}${building.name ? ' «' + building.name + '»' : ''}</div>
                                <div class="building-card-desc">${bc.description}</div>
                                ${this._renderBuildingStats(bc, building)}
                            </div>
                        </div>`;
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
                    }
                    if (inQueue) {
                        const bc = C.BUILDINGS[inQueue.type];
                        html += `<div class="building-card building-card--queue">
                            <div class="building-card-icon">🔨</div>
                            <div class="building-card-info">
                                <div class="building-card-name">Строится: ${bc.name}</div>
                                <div class="building-card-desc">Осталось ходов: ${inQueue.turnsRemaining}</div>
                            </div>
                        </div>`;
                    }
                    this.buildingsList.innerHTML = html;
                    this._bindWorkerButtons(col, row);
                    this._bindMineModeButtons(col, row);
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

        // ─── Workers Tab ──────────────────────────────────────
        _renderWorkersTab: function(bc, building) {
            const assigned = building.assignedWorkers || 0;
            const required = bc.workersRequired;
            const maxWorkers = bc.workersMax || bc.workersRequired;
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

        // ─── Market Tab ───────────────────────────────────────
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

        _renderMarketTab: function(building) {
            const income = E.getMarketIncome(HM, building.col, building.row);
            const cfg = C.BUILDINGS['market'];
            const radius = cfg.marketRadius || 4;
            const perPerson = cfg.moneyPerResident || 1;
            const nearbyPop = income / perPerson;

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
                            <div class="market-stat-label">Жители рядом</div>
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
                    <div class="market-hint">💡 Стройте дома рядом с рынком для максимального дохода</div>
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
            if (bc.consumption) {
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

                let costHtml = '';
                if (type === 'local_admin') {
                    const adminCount = Object.values(HM.buildings).filter(b => b.type === 'local_admin').length;
                    const cost = (adminCount + 1) * 500;
                    costHtml = `💰${cost}`;
                } else {
                    costHtml = Object.entries(bc.cost || {}).map(([r, a]) =>
                        `${C.RESOURCES[r] ? C.RESOURCES[r].icon : r}${a}`
                    ).join(' ');
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
                        <span class="build-btn-cost">${costHtml || 'Бесплатно'} ${turnsHtml}</span>
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

            const maxWorkers = bc.workersMax || bc.workersRequired;

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
                    return `<div class="queue-item">
                        <div class="queue-item-header">
                            <span class="queue-item-icon">${bc.icon}</span>
                            <span class="queue-item-name">${bc.name}</span>
                            <span class="queue-item-turns">${q.turnsRemaining} хода</span>
                        </div>
                        <div class="queue-item-coords">[${q.col}, ${q.row}] — ${C.TILES[HM.data[q.row][q.col].type].name}</div>
                        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
                    </div>`;
                }).join('');
            } else {
                this.queueSection.style.display = 'none';
            }
        }
    };
})();
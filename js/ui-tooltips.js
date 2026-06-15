(function() {
    'use strict';
    const HM = window.HexMap;
    const C = window.GameConfig;
    const E = window.EconomyEngine;

    window.UITooltips = {
        tooltip: null,
        _bound: {},  // tracks which chips have had listeners attached

        init: function(tooltipEl) {
            this.tooltip = tooltipEl;
            this._bindChipTooltip('resMoneyChip');
            this._bindChipTooltip('resFoodChip');
            this._bindChipTooltip('resRawChip');
            this._bindChipTooltip('resResourcesChip');
            this._bindChipTooltip(this._popChipEl());
            this._bindCanvasTooltip();
        },

        // ════════════════════════════════════════════════════
        // GENERIC HELPERS
        // ════════════════════════════════════════════════════

        /**
         * Positions the shared tooltip element near a target element.
         * Call after setting tooltip.innerHTML.
         */
        _positionNear: function(anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            let left = rect.left;
            let top  = rect.bottom + 8;
            // Re-measure after content is set
            const tw = this.tooltip.getBoundingClientRect();
            if (left + tw.width  > window.innerWidth  - 4) left = window.innerWidth  - tw.width  - 4;
            if (top  + tw.height > window.innerHeight - 4) top  = rect.top - tw.height - 8;
            this.tooltip.style.left = Math.max(4, left) + 'px';
            this.tooltip.style.top  = Math.max(4, top)  + 'px';
        },

        /**
         * Attaches mouseenter/mouseleave to a chip element (by id or element reference).
         * The tooltip content is read from `element.dataset.tooltip` on hover.
         * Safe to call multiple times — will not attach duplicate listeners.
         */
        _bindChipTooltip: function(idOrEl) {
            const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
            if (!el || this._bound[el.id || el.className]) return;
            const key = el.id || el.className;

            el.addEventListener('mouseenter', () => {
                const html = el.dataset.tooltip;
                if (!html) return;
                this.tooltip.innerHTML = html.replace(/\n/g, '<br>');
                this.tooltip.style.display = 'block';
                this._positionNear(el);
            });
            el.addEventListener('mouseleave', () => {
                this.tooltip.style.display = 'none';
            });
            this._bound[key] = true;
        },

        /** Returns the population chip's parent element (which gets the tooltip). */
        _popChipEl: function() {
            return document.getElementById('resPopulation')?.closest('.res-chip') || null;
        },

        // ════════════════════════════════════════════════════
        // CONTENT UPDATERS  (called after each state change)
        // ════════════════════════════════════════════════════

        updateAll: function() {
            this._updateMoneyTooltip();
            this._updateFoodTooltip();
            this._updateRawTooltip();
            this._updateResourcesTooltip();
            this._updatePopTooltip();
        },

        _setChipTooltip: function(idOrEl, html) {
            const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
            if (!el) return;
            el.title = '';
            el.dataset.tooltip = html;
        },

        _updateMoneyTooltip: function() {
            const chip = document.getElementById('resMoney')?.closest('.res-chip');
            if (!chip) return;

            let buildingIncome = 0, factoryIncome = 0, marketIncome = 0;
            for (const key of Object.keys(HM.buildings)) {
                const b = HM.buildings[key];
                const cfg = C.BUILDINGS[b.type];
                if (!cfg) continue;
                if (b.type === 'market') {
                    marketIncome += E.getMarketIncome(HM, b.col, b.row);
                } else if (b.type === 'factory') {
                    if (E.isBuildingActive(HM, b.col, b.row)) {
                        const factLevel = b.level || 1;
                        const factMode = b.factoryMode || 'goods';
                        const effectiveMode = (factMode === 'steel' && factLevel < 2) ? 'goods' : factMode;
                        const prod = cfg.factoryModeProduction?.[effectiveMode] || {};
                        const assigned = b.assignedWorkers || 0;
                        const extraWorkers = Math.max(0, assigned - cfg.workersRequired);
                        const factor = 1 + extraWorkers * (1/3);
                        factoryIncome += Math.round((prod.money || 0) * factor * 10) / 10;
                    }
                } else if (cfg.production?.money && E.isBuildingActive(HM, b.col, b.row)) {
                    buildingIncome += cfg.production.money;
                }
            }
            const popIncome = HM.townHallBuilt ? Math.floor(HM.resources.population * C.MONEY_PER_POPULATION) : 0;
            const total = C.BASE_INCOME + buildingIncome + factoryIncome + marketIncome + popIncome;

            const lines = [
                '<b style=\"color:#4ade80\">\u{1F4B0} Доходы:</b>',
                `<span style=\"color:var(--muted)\">Базовый доход</span> <span style=\"color:#4ade80\">+${C.BASE_INCOME}</span>`,
            ];
            if (buildingIncome > 0) lines.push(`<span style=\"color:var(--muted)\">Здания</span> <span style=\"color:#4ade80\">+${buildingIncome}</span>`);
            if (factoryIncome > 0)  lines.push(`<span style=\"color:var(--muted)\">Заводы</span> <span style=\"color:#4ade80\">+${factoryIncome}</span>`);
            if (marketIncome > 0)   lines.push(`<span style=\"color:var(--muted)\">Рынки (1💰 за жителя рядом)</span> <span style=\"color:#4ade80\">+${marketIncome}</span>`);
            if (popIncome > 0)      lines.push(`<span style=\"color:var(--muted)\">Жители (${Math.floor(HM.resources.population)} × 1)</span> <span style=\"color:#4ade80\">+${popIncome}</span>`);
            lines.push('', `<b style=\"color:var(--gold)\">Итого: +${total}/ход</b>`);

            this._setChipTooltip(chip, lines.join('\n'));
        },
        _updateFoodTooltip: function() {
            const chip = document.getElementById('resFoodChip');
            if (!chip) return;
            const res = HM.resources, del = HM.deltas;
            const pop = Math.floor(res.population);
            const fmt = (v, d) => `${Math.floor(v)}${d ? (d > 0 ? ` (+${Math.round(d)})` : ` (${Math.round(d)})`) : ''}`;

            const directFood = Math.floor(res.apples + res.fish);
            const breadFeeds = Math.floor(res.bread) * C.FOOD_PER_POPULATION;
            const totalFeeds = directFood + breadFeeds;
            const statusColor  = pop > totalFeeds ? '#f87171' : '#4ade80';
            const statusText   = pop > totalFeeds
                ? `⚠️ Дефицит: не хватает на ${pop - totalFeeds} жит.`
                : `✓ Жители сыты (${totalFeeds - pop} запас)`;

            const lines = [
                '<b style="color:#fbbf24">🍽️ Еда и кормление:</b>',
                `<span style="color:var(--muted)">🍞 Хлеб</span> <span style="color:#e8834a">${fmt(res.bread, del.bread)}</span> <span style="color:var(--muted);font-size:10px;">1 хлеб → ${C.FOOD_PER_POPULATION} жителей</span>`,
                `<span style="color:var(--muted)">🍎 Яблоки</span> <span style="color:#ef4444">${fmt(res.apples, del.apples)}</span> <span style="color:var(--muted);font-size:10px;">1 яблоко → 1 жителю</span>`,
                `<span style="color:var(--muted)">🐟 Рыба</span> <span style="color:#38bdf8">${fmt(res.fish, del.fish)}</span> <span style="color:var(--muted);font-size:10px;">1 рыба → 1 жителю</span>`,
                '',
                `<b style="color:var(--gold)">Может прокормить: ${totalFeeds} жит.</b>`,
                `<span style="color:${statusColor}">${statusText}</span>`,
            ];
            this._setChipTooltip(chip, lines.join('\n'));
        },

        _updateRawTooltip: function() {
            const chip = document.getElementById('resRawChip');
            if (!chip) return;
            const res = HM.resources, del = HM.deltas;
            const dw = del.wheat;
            const lines = [
                '<b style="color:#86cc14">📦 Сырьё:</b>',
                `<span style="color:var(--muted)">🌾 Пшеница</span> <span style="color:#86cc14">${Math.floor(res.wheat)}${dw ? (dw > 0 ? ` (+${Math.round(dw)})` : ` (${Math.round(dw)})`) : ''}</span>`,
            ];
            this._setChipTooltip(chip, lines.join('\n'));
        },

        _updateResourcesTooltip: function() {
            const chip = document.getElementById('resResourcesChip');
            if (!chip) return;
            const res = HM.resources, del = HM.deltas;
            const warehouseCount = Object.values(HM.buildings).filter(b => b.type === 'warehouse').length;
            const maxStorage = 150 + warehouseCount * 150;

            const fmt = (v, d, icon, name, color) => {
                const n = Math.floor(v);
                const delta = d ? (d > 0 ? ` (+${Math.round(d)})` : ` (${Math.round(d)})`) : '';
                const pct = Math.round((n / maxStorage) * 100);
                const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
                return `<span style="color:var(--muted)">${icon} ${name}</span> <span style="color:${color}">${n}${delta}</span> <span style="color:var(--muted);font-size:9px;">${bar} ${pct}%</span>`;
            };

            const lines = [
                '<b style="color:#94a3b8">📦 Ресурсы:</b>',
                fmt(res.iron,   del.iron,   '⛓️', 'Железо',  '#94a3b8'),
                fmt(res.copper, del.copper, '🔶', 'Медь',    '#b45309'),
                fmt(res.coal,   del.coal,   '⚫', 'Уголь',   '#374151'),
                fmt(res.steel,  del.steel,  '🔩', 'Сталь',   '#9ca3af'),
                fmt(res.wood,   del.wood,   '🪵', 'Дерево',  '#a16207'),
                '',
                `<span style="color:var(--muted);font-size:11px;">📦 Складов: ${warehouseCount} · Лимит: ${maxStorage}</span>`,
            ];
            this._setChipTooltip(chip, lines.join('\n'));
        },

        _getIdeologies: function() {
            const IDEOLOGY_MAP = {
                farm:        'conservative',
                mill:        'conservative',
                sawmill:     'conservative',
                mine:        'communist',
                factory:     'communist',
                smelter:     'communist',
                orchard:     'liberal',
                port:        'liberal',
                townhall:    'militarist',
                local_admin: 'militarist',
                barracks:    'militarist',
            };
            const counts = { conservative: 0, communist: 0, liberal: 0, militarist: 0, anarchist: 0 };
            for (const b of Object.values(HM.buildings)) {
                const workers = b.assignedWorkers || 0;
                if (workers > 0) {
                    const ideo = IDEOLOGY_MAP[b.type];
                    if (ideo) counts[ideo] += workers;
                }
            }
            counts.anarchist = E.getFreeWorkers(HM);
            return counts;
        },

        _updatePopTooltip: function() {
            const chip = this._popChipEl();
            if (!chip) return;
            const assigned = E.getTotalAssignedWorkers(HM);
            const free = E.getFreeWorkers(HM);
            const total = Math.floor(HM.resources.population);
            const ideo = this._getIdeologies();

            const IDEO_META = {
                conservative: { icon: '🌾', label: 'Консерваторы',  color: '#86efac', hint: 'Фермы, мельницы, лесопилки' },
                communist:    { icon: '⚒️',  label: 'Коммунисты',    color: '#f87171', hint: 'Шахты и заводы'  },
                liberal:      { icon: '🍎', label: 'Либералы',       color: '#fbbf24', hint: 'Сады и порты' },
                militarist:   { icon: '⚔️', label: 'Кратократы',    color: '#a78bfa', hint: 'Ратуша, администрации, казармы' },
                anarchist:    { icon: '🔥', label: 'Анархисты',      color: '#94a3b8', hint: 'Безработные жители' },
            };

            const lines = [
                `<b style="color:#4f8ef7">👥 Население: ${total}</b>`,
                `<span style="color:var(--muted)">На работе: ${assigned} &nbsp;·&nbsp; Свободно: ${free}</span>`,
                '',
                '<b style="color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.8px;">⚑ Политические фракции</b>',
            ];

            for (const [key, meta] of Object.entries(IDEO_META)) {
                const n = ideo[key];
                if (n <= 0) continue;
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
                lines.push(
                    `<span style="color:${meta.color}">${meta.icon} ${meta.label}</span>` +
                    `<span style="color:var(--muted);font-size:10px;"> ${n} чел. (${pct}%)</span>` +
                    `<br><span style="color:${meta.color};font-size:9px;letter-spacing:1px;opacity:.6;">${bar}</span>` +
                    `<span style="color:var(--muted);font-size:9px;"> ${meta.hint}</span>`
                );
            }

            this._setChipTooltip(chip, lines.join('\n'));
        },

        // ════════════════════════════════════════════════════
        // CANVAS HOVER TOOLTIP
        // ════════════════════════════════════════════════════

        _bindCanvasTooltip: function() {
            if (this._bound['canvas']) return;
            const canvas = window.Renderer.canvas;
            if (!canvas) return;

            canvas.addEventListener('mousemove', e => {
                const rect = canvas.getBoundingClientRect();
                const hex = HM.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
                if (!hex) { this.tooltip.style.display = 'none'; return; }

                this.tooltip.innerHTML = this._buildHexTooltip(hex.col, hex.row);
                this.tooltip.style.display = 'block';

                // Position following the cursor
                let left = e.clientX + 12, top = e.clientY + 12;
                const tw = this.tooltip.getBoundingClientRect();
                if (left + tw.width  > window.innerWidth  - 4) left = e.clientX - tw.width  - 8;
                if (top  + tw.height > window.innerHeight - 4) top  = e.clientY - tw.height - 8;
                this.tooltip.style.left = Math.max(4, left) + 'px';
                this.tooltip.style.top  = Math.max(4, top)  + 'px';
            });

            canvas.addEventListener('mouseleave', () => {
                this.tooltip.style.display = 'none';
            });

            this._bound['canvas'] = true;
        },

        /** Builds the HTML string shown when hovering a hex cell. */
        _buildHexTooltip: function(col, row) {
            const tile     = HM.data[row][col];
            const key      = col + ',' + row;
            const building = HM.buildings[key];
            const inQueue  = HM.buildQueue.find(q => q.col === col && q.row === row);
            const owner    = HM.getOwner(col, row);

            let html = `<b>${C.TILES[tile.type].name}</b> <span style="color:var(--muted)">[${col},${row}]</span>`;

            if (owner) {
                const district = HM.getDistrictName(col, row);
                html += district
                    ? `<br><span style="color:var(--gold)">🏛️ ${owner}, район «${district}»</span>`
                    : `<br><span style="color:var(--gold)">🏛️ ${owner}</span>`;
            }

            if (building) {
                const bc = C.BUILDINGS[building.type];
                html += `<br><span style="color:var(--accent)">${bc.icon} ${bc.name}${building.name ? ` «${building.name}»` : ''}</span>`;

                if (bc.workersRequired) {
                    const assigned = building.assignedWorkers || 0;
                    const level = building.level || 1;
                    let maxWorkers = bc.workersMax || bc.workersRequired;
                    if (bc.levelWorkersMax && bc.levelWorkersMax[level] !== undefined) {
                        maxWorkers = bc.levelWorkersMax[level];
                    }
                    const active = assigned >= bc.workersRequired;
                    html += `<br><span style="color:${active ? '#4ade80' : '#f87171'};font-size:11px;">👷 ${assigned}/${maxWorkers} рабочих</span>`;
                }

                html += this._buildingProductionLine(building, bc);

                // District ideology summary for local_admin
                if (building.type === 'local_admin' && (building.assignedWorkers || 0) >= 1) {
                    const ideo = E.getDistrictIdeology(HM, building.col, building.row);
                    if (ideo && ideo.dominantMeta) {
                        const dm = ideo.dominantMeta;
                        html += `<br><span style="color:${dm.color};font-size:11px;">${dm.icon} Фракция района: <b>${dm.label}</b></span>`;
                        html += `<br><span style="color:var(--muted);font-size:10px;">`;
                        let parts = [];
                        for (const [key, meta] of Object.entries(ideo.IDEO_META)) {
                            const n = ideo[key] || 0;
                            if (n <= 0) continue;
                            const pct = ideo.total > 0 ? Math.round((n / ideo.total) * 100) : 0;
                            parts.push(`<span style="color:${meta.color}">${meta.icon}${pct}%</span>`);
                        }
                        html += parts.join(' · ') + '</span>';
                    }
                }

            } else if (inQueue) {
                const bc = C.BUILDINGS[inQueue.type];
                html += `<br><span style="color:var(--gold)">🔨 Строится: ${bc.name} (${inQueue.turnsRemaining} ход)</span>`;
            }

            return html;
        },

        /** Returns a one-line production summary for the hover tooltip. */
        _buildingProductionLine: function(building, bc) {
            // Check for strike
            let strikeInfo = '';
            if (window.EventsEngine) {
                const strike = window.EventsEngine.getActiveStrike();
                if (strike && strike.targetCol === building.col && strike.targetRow === building.row) {
                    strikeInfo = '<br><span style="color:#fbbf24;font-size:11px;">✊ Забастовка! Производство остановлено</span>';
                }
            }

            const active = E.isBuildingActive(HM, building.col, building.row);
            const col = active ? 'var(--success)' : 'var(--muted)';
            const suffix = active ? '' : ' (неактивно)';

            if (building.type === 'market') {
                const income = E.getMarketIncome(HM, building.col, building.row);
                return `<br><span style="color:#4ade80;font-size:11px;">💰 +${income} монет/ход (1💰 за жителя рядом)</span>` + strikeInfo;
            }
            if (building.type === 'sawmill') {
                const tile = HM.data[building.row][building.col];
                const baseWood = bc.production?.wood || 3;
                const wood = tile.type === 'fertile' ? baseWood * 2 : baseWood;
                return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">🟫 +${wood} дерева/ход (${tile.type === 'fertile' ? 'плодородная' : 'равнина'})${suffix}</span>` + strikeInfo;
            }
            if (building.type === 'mine') {
                const mode = building.mineMode || 'gold';
                const modeNames = bc.mineModeNames || {};
                const modeProduction = bc.mineModeProduction || {};
                const prod = modeProduction[mode];
                if (prod) {
                    const level = building.level || 1;
                    const assigned = building.assignedWorkers || 0;
                    const extraWorkers = level === 2 ? Math.max(0, assigned - bc.workersRequired) : 0;
                    const factor = 1 + extraWorkers * 0.25;
                    const prodStr = Object.entries(prod).map(([r, a]) => `+${Math.round(a * factor * 10) / 10} ${C.RESOURCES[r]?.icon || r}`).join(' ');
                    return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">${modeNames[mode] || mode}: ${prodStr}/ход${suffix}</span>` + strikeInfo;
                }
                return strikeInfo;
            }
            if (building.type === 'mill') {
                const level = building.level || 1;
                const wheatNeeded = level === 2 ? 4 : 2;
                const breadProduced = level === 2 ? 5 : 2;
                return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">🍞 +${breadProduced} хлеба/ход (🌾 -${wheatNeeded})${suffix}</span>` + strikeInfo;
            }
            if (building.type === 'farm') {
                const level = building.level || 1;
                const workers = building.assignedWorkers || 0;
                const baseWheat = bc.production.wheat || 3;
                const perWorker = baseWheat * (level === 2 ? 1.5 : 1);
                const total = Math.round(perWorker * workers * 10) / 10;
                return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">🌾 +${total} пшеницы/ход (${workers} раб.)${suffix}</span>` + strikeInfo;
            }
            if (building.type === 'smelter') {
                const active = E.isBuildingActive(HM, building.col, building.row);
                const woodNeeded = bc.consumption?.wood || 3;
                const coalProduced = bc.production?.coal || 1;
                return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">⚫ +${coalProduced} угля/ход (🪵 -${woodNeeded})${suffix}</span>` + strikeInfo;
            }
            if (building.type === 'port') {
                const portLevel = building.level || 1;
                const portMode = building.portMode || 'fishing';
                const effectiveMode = (portMode === 'trade' && portLevel < 2) ? 'fishing' : portMode;
                const assigned = building.assignedWorkers || 0;
                if (effectiveMode === 'trade') {
                    const hasWarehouse = E.hasNearbyWarehouse(HM, building.col, building.row);
                    const bonusMoney = hasWarehouse ? 4 : 0;
                    const totalMoney = 3 + bonusMoney;
                    const bonusText = hasWarehouse ? ' (+4 💰 от склада)' : '';
                    return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">🚢 Торговля: +1 🐟 +${totalMoney} 💰/ход${bonusText}${suffix}</span>` + strikeInfo;
                }
                const fish = assigned === 1 ? 2 : assigned >= 2 ? 5 : 0;
                return `<br><span style="color:${col};font-size:11px;">🐟 +${fish} рыбы/ход (${assigned}/2 рыбаков)${suffix}</span>` + strikeInfo;
            }
            if (building.type === 'orchard') {
                const assigned = building.assignedWorkers || 0;
                const apples = active ? 2 * assigned : 0;
                return `<br><span style="color:${col};font-size:11px;">🍎 +${apples} яблок/ход (${assigned}/2 садовников)${suffix}</span>` + strikeInfo;
            }
            if (building.type === 'factory') {
                const factLevel = building.level || 1;
                const factMode = building.factoryMode || 'goods';
                const effectiveMode = (factMode === 'steel' && factLevel < 2) ? 'goods' : factMode;
                const cfg2 = C.BUILDINGS['factory'];
                const prod = cfg2.factoryModeProduction?.[effectiveMode] || {};
                const cons = cfg2.factoryModeConsumption?.[effectiveMode] || {};
                const assigned = building.assignedWorkers || 0;
                const extraWorkers = Math.max(0, assigned - cfg2.workersRequired);
                const factor = 1 + extraWorkers * (1/3);
                const prodStr = Object.entries(prod).map(([r, a]) => `+${Math.round(a * factor * 10)/10} ${C.RESOURCES[r]?.icon || r}`).join(' ');
                const consStr = Object.entries(cons).map(([r, a]) => `-${a} ${C.RESOURCES[r]?.icon || r}`).join(' ');
                const modeName = cfg2.factoryModeNames?.[effectiveMode] || effectiveMode;
                return `<br><span style="color:${active ? '#4ade80' : 'var(--muted)'};font-size:11px;">${modeName}: ${prodStr} (${consStr})${suffix}</span>` + strikeInfo;
            }
            if (bc.production) {
                const prodStr = Object.entries(bc.production)
                    .filter(([, v]) => v > 0)
                    .map(([r, a]) => `+${a} ${C.RESOURCES[r]?.icon || r}`)
                    .join(' ');
                if (prodStr) return `<br><span style="color:${col};font-size:11px;">${prodStr}/ход${suffix}</span>` + strikeInfo;
            }
            return strikeInfo;
        }
    };
})();
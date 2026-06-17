(function() {
    'use strict';
    const C = window.GameConfig;
    const E = window.EconomyEngine;

    window.HexMap = {
        data: [],
        cols: 0,
        rows: 0,
        zoom: 1.0,
        cameraX: 0,
        cameraY: 0,
        buildings: {},
        buildQueue: [],
        townHallBuilt: false,
        townhallQueued: false,
        territory: {},
        factionColor: '#4f8ef7',
        citizens: [],
        _nextCitizenId: 1,
        _lastAccident: null,

        // ─── Resources ───────────────────────────────────────
        resources: {
            money: 50, wheat: 0, bread: 0, apples: 0,
            fish: 0, population: 0, defense: 0
        },
        deltas: {
            money: 0, wheat: 0, bread: 0, apples: 0,
            fish: 0, population: 0, defense: 0
        },
        lastEvents: [],

        // ════════════════════════════════════════════════════
        // HEX GEOMETRY  (pointy-top hexes, odd-r offset)
        // ════════════════════════════════════════════════════

        _cachedZoom: -1,
        _cachedSize: 0,
        _cachedWidth: 0,
        _cachedHeight: 0,
        _cachedYOffset: 0,

        _updateGeomCache: function() {
            if (this.zoom !== this._cachedZoom) {
                this._cachedZoom    = this.zoom;
                this._cachedSize    = C.BASE_HEX_SIZE * this.zoom;
                this._cachedWidth   = this._cachedSize * C.SQRT3;
                this._cachedHeight  = this._cachedSize * 2;
                this._cachedYOffset = this._cachedHeight * 0.75;
            }
        },

        hexSize:   function() { this._updateGeomCache(); return this._cachedSize; },
        hexWidth:  function() { this._updateGeomCache(); return this._cachedWidth; },
        hexHeight: function() { this._updateGeomCache(); return this._cachedHeight; },
        xOffset:   function() { this._updateGeomCache(); return this._cachedWidth; },
        yOffset:   function() { this._updateGeomCache(); return this._cachedYOffset; },

        /** Converts hex grid coordinates to canvas pixel position (top-left of bounding box). */
        hexToPixel: function(col, row) {
            const w = this.hexWidth();
            let x = col * w;
            if (row % 2 === 1) x += w / 2;
            return { x: x + this.cameraX, y: row * this.yOffset() + this.cameraY };
        },

        /** Converts canvas pixel coordinates to the nearest hex cell, or null if none. */
        pixelToHex: function(px, py) {
            const s = this.hexSize();
            const w = this.hexWidth();
            const h = this.hexHeight();
            const approxRow = Math.round((py - this.cameraY) / this.yOffset());
            let bestCol = -1, bestRow = -1, bestDist = Infinity;
            for (let r = Math.max(0, approxRow - 2); r <= Math.min(this.rows - 1, approxRow + 2); r++) {
                for (let c = 0; c < this.cols; c++) {
                    const pos = this.hexToPixel(c, r);
                    const cx = pos.x + w / 2;
                    const cy = pos.y + h / 2;
                    const dist = (px - cx) ** 2 + (py - cy) ** 2;
                    if (dist <= s * s && dist < bestDist) {
                        bestDist = dist;
                        bestCol = c;
                        bestRow = r;
                    }
                }
            }
            return bestCol === -1 ? null : { col: bestCol, row: bestRow };
        },

        /** Returns the hex-grid distance between two cells (cube-coordinate method). */
        hexDistance: function(c1, r1, c2, r2) {
            const q1 = c1 - (r1 - (r1 & 1)) / 2;
            const q2 = c2 - (r2 - (r2 & 1)) / 2;
            return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs((-q1 - r1) - (-q2 - r2))) / 2;
        },

        // ════════════════════════════════════════════════════
        // TERRITORY
        // ════════════════════════════════════════════════════

        /**
         * Marks all cells within `radius` hexes of (col, row) as owned by `cityName`.
         * Closer claims win ties.
         */
        claimTerritory: function(col, row, cityName, radius) {
            radius = radius || 3;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const dist = this.hexDistance(col, row, c, r);
                    if (dist <= radius) {
                        const key = c + ',' + r;
                        const existing = this.territory[key];
                        if (!existing || dist < existing.distance) {
                            this.territory[key] = { owner: cityName, distance: dist };
                        }
                    }
                }
            }
            // Invalidate renderer vertex/border cache
            if (window.Renderer?._invalidateVertCache) window.Renderer._invalidateVertCache();
        },

        /** Updates all territory entries when a city is renamed. */
        renameTerritory: function(oldName, newName) {
            for (const key of Object.keys(this.territory)) {
                if (this.territory[key].owner === oldName) {
                    this.territory[key].owner = newName;
                }
            }
        },

        /**
         * Returns the owning city name for a cell:
         * townhall tile → building name, territory tile → territory owner, else null.
         */
        getOwner: function(col, row) {
            const key = col + ',' + row;
            const b = this.buildings[key];
            if (b && b.type === 'townhall') return b.name || C.DEFAULT_CITY_NAME;
            const t = this.territory[key];
            return t ? t.owner : null;
        },

        /**
         * Returns the name of the nearest active local_admin within 7 cells,
         * used to show district labels in tooltips.
         */
        getDistrictName: function(col, row) {
            const owner = window.PopulationEngine.getDistrictOwner(this, col, row)
            return (owner && owner.name) ? owner.name : null;
        },

        /**
         * Rebuilds the entire territory map from scratch based on
         * current townhall + active local_admin buildings.
         * Also removes any non-townhall/admin buildings that fell outside territory.
         */
        recalculateTerritory: function() {
            this.territory = {};

            for (const key of Object.keys(this.buildings)) {
                const b = this.buildings[key];
                if (b.type === 'townhall') {
                    this.claimTerritory(b.col, b.row, b.name || C.DEFAULT_CITY_NAME, 3);
                }
            }

            const thKey = Object.keys(this.buildings).find(k => this.buildings[k].type === 'townhall');
            const cityName = thKey ? (this.buildings[thKey].name || C.DEFAULT_CITY_NAME) : C.DEFAULT_CITY_NAME;

            for (const key of Object.keys(this.buildings)) {
                const b = this.buildings[key];
                if (b.type === 'local_admin' && (b.assignedWorkers || 0) >= 1) {
                    this.claimTerritory(b.col, b.row, cityName, 7);
                }
            }

            // Remove buildings that are now outside territory (except anchors)
            for (const key of Object.keys(this.buildings)) {
                const b = this.buildings[key];
                if (b.type !== 'townhall' && b.type !== 'local_admin' && b.type !== 'mine' && !this.territory[key]) {
                    delete this.buildings[key];
                }
            }
        },

        /**
         * Returns true if edge `edgeIdx` (0–5) of cell (col, row) borders a different
         * territory or unclaimed land — used to draw faction border lines.
         */
        isBorderEdge: function(col, row, edgeIdx) {
            const key = col + ',' + row;
            const terr = this.territory[key];
            if (!terr) return false;

            const isOdd   = (row % 2 === 1);
            const evenDirs = [[+1,0],[0,+1],[-1,+1],[-1,0],[-1,-1],[0,-1]];
            const oddDirs  = [[+1,0],[+1,+1],[0,+1],[-1,0],[0,-1],[+1,-1]];
            const d = (isOdd ? oddDirs : evenDirs)[edgeIdx];
            const nc = col + d[0], nr = row + d[1];

            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) return false;

            const nKey = nc + ',' + nr;
            const nBuilding = this.buildings[nKey];
            const nTerr = this.territory[nKey];

            if (!nTerr && !nBuilding) return true;
            if (nBuilding && nBuilding.type === 'townhall' && nBuilding.name !== terr.owner) return true;
            if (nTerr && nTerr.owner !== terr.owner) return true;
            return false;
        },

        // ════════════════════════════════════════════════════
        // ECONOMY DELEGATION  (thin wrappers around EconomyEngine)
        // ════════════════════════════════════════════════════
        getTotalAssignedWorkers:   function()           { return window.PopulationEngine.getTotalAssignedWorkers(this); },
        getFreeWorkers:            function()           { return window.PopulationEngine.getFreeWorkers(this); },
        assignWorker:              function(col, row)   { return window.PopulationEngine.assignWorker(this, col, row); },
        removeWorker:              function(col, row)   { return window.PopulationEngine.removeWorker(this, col, row); },
        isBuildingActive:          function(col, row)   { return window.PopulationEngine.isBuildingActive(this, col, row); },
        getBuildingWorkerStatus:   function(col, row)   { return window.PopulationEngine.getBuildingWorkerStatus(this, col, row); },
        getBuildingResidents:      function(col, row)   { return window.PopulationEngine.getBuildingResidents(this, col, row); },
        getDistrictStats:          function(col, row)   { return window.PopulationEngine.getDistrictStats(this, col, row); },
        getPopulationInRadius:     function(col, row, r){ return window.ConstructionEngine.getPopulationInRadius(this, col, row, r); },
        getMarketIncome:           function(col, row)   { return window.ConstructionEngine.getMarketIncome(this, col, row); },
        hasNearbyMarket:           function(col, row)   { return window.ConstructionEngine.hasNearbyMarket(this, col, row); },
        getDynamicCost:            function(type)       { return window.ConstructionEngine.getDynamicCost(this, type); },
        isTerrainCompatible:       function(type, tile) { return window.ConstructionEngine.isTerrainCompatible(type, tile); },
        canBuild:                  function(col, row, t){ return window.ConstructionEngine.canBuild(this, col, row, t); },
        queueBuild:                function(col, row, t){ return window.ConstructionEngine.queueBuild(this, col, row, t); },
        cancelBuild:               function(col, row)   { return window.ConstructionEngine.cancelBuild(this, col, row); },
        demolishBuilding:          function(col, row)   { return window.ConstructionEngine.demolishBuilding(this, col, row); },
        upgradeBuilding:           function(col, row)   { return window.ConstructionEngine.upgradeBuilding(this, col, row); },
        computeDeltas:             function()           { return E.computeDeltas(this); },

        // ════════════════════════════════════════════════════
        // MAP GENERATION
        // ════════════════════════════════════════════════════

        /** Generates a new map of the given size preset key ('small'|'medium'|'large').
         *  @param {string} sizeKey - map size
         *  @param {string} difficulty - 'easy' | 'normal' | 'hard'
         */
        generate: function(sizeKey, difficulty, mapTypeKey) {
            this.mapType = mapTypeKey || 'auto';
            const dims = C.MAP_SIZES[sizeKey] || C.MAP_SIZES.medium;
            const diff = C.DIFFICULTY[difficulty] || C.DIFFICULTY.normal;
            this.cols = dims.cols;
            this.rows = dims.rows;
            this.data = [];
            this.buildings = {};
            this.buildQueue = [];
            this.townHallBuilt = false;
            this.townhallQueued = false;
            this.territory = {};
            this.citizens = [];
            this._nextCitizenId = 1;
            this.resources = {
                money: diff.money, wheat: diff.wheat, bread: diff.bread,
                apples: diff.apples, fish: diff.fish, iron: diff.iron,
                copper: diff.copper, coal: diff.coal, steel: diff.steel,
                wood: diff.wood, population: diff.population, defense: 0, cherry:0
            };
            this.deltas = { money: 0, wheat: 0, bread: 0, apples: 0, fish: 0, iron: 0, copper: 0, coal: 0, steel: 0, wood: 0, population: 0, defense: 0,cherry:0 };
            this.difficulty = difficulty || 'normal';
            this.lastEvents = [];
            this.pendingEventResults = [];
            this.winStreakTurns = 0;
            this.gameOver = null;
            this.factionColor = '#4f8ef7';
            if (window.EventsEngine) window.EventsEngine.reset();
            this.zoom = 1.0;
            this.cameraX = 0;
            this.cameraY = 0;

            const seed       = Math.random() * 1000;
            const seed2      = seed + 137;
            const seed3      = seed + 419;

            let mapType;
            const mt = mapTypeKey || 'auto';
            if      (mt === 'continent')   mapType = 0.1;
            else if (mt === 'archipelago') mapType = 0.5;
            else if (mt === 'mixed')       mapType = 0.8;
            else                           mapType = Math.random(); // auto
            const heightMap = [];
            const rawMap    = [];
            this._lastAccident = null;
            for (let r = 0; r < this.rows; r++) {
                const hRow = [];
                const tRow = [];
                for (let c = 0; c < this.cols; c++) {
                    // Основной рельеф — крупные формы
                    const h1 = window.Noise.fbm(c * 0.07 + seed,  r * 0.07 + seed,  5);
                    // Детальный шум — мелкие холмы
                    const h2 = window.Noise.fbm(c * 0.15 + seed2, r * 0.15 + seed2, 3);
                    // Горный хребтовый шум — вытянутые цепи
                    const ridgeRaw = window.Noise.fbm(c * 0.05 + seed3, r * 0.05 + seed3, 4);
                    const ridge = 1 - Math.abs(ridgeRaw * 2 - 1); // V-образные хребты

                    let val = h1 * 0.65 + h2 * 0.20 + ridge * 0.15;

                    if (mt === 'rivers') {
                        const dx = (c / this.cols - 0.5) * 2;
                        const dy = (r / this.rows - 0.5) * 2;
                        const distEdge = 1 - Math.sqrt(dx * dx + dy * dy) * 0.7;
                        val = val * 0.55 + distEdge * 0.45 + 0.07;
                    } else if (mapType < 0.35) {
                        const dx = (c / this.cols - 0.5) * 2;
                        const dy = (r / this.rows - 0.5) * 2;
                        const distEdge = 1 - Math.sqrt(dx * dx + dy * dy) * 0.85;
                        val = val * 0.6 + distEdge * 0.4;
                    } else if (mapType < 0.65) {
                        val = val * 0.75 - 0.08;
                    } else {
                        val = val * 0.85 + 0.08;
                    }

                    hRow.push(val);

                    // Пороги: горы 20–25%, fertile пятнами по всей карте
                    if      (val < 0.21) tRow.push('ocean');
                    else if (val < 0.34) tRow.push('sea');
                    else if (val < 0.44) tRow.push('plain');
                    else if (val < 0.54) tRow.push('fertile');
                    else if (val < 0.63) tRow.push('plain');
                    else                 tRow.push('mountain');
                }
                heightMap.push(hRow);
                rawMap.push(tRow);
            }

            // ── Pass 2: прибрежный песок ─────────────────────────
            const evenDirs = [[+1,0],[0,+1],[-1,+1],[-1,0],[-1,-1],[0,-1]];
            const oddDirs  = [[+1,0],[+1,+1],[0,+1],[-1,0],[0,-1],[+1,-1]];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (rawMap[r][c] !== 'plain' && rawMap[r][c] !== 'fertile') continue;
                    const dirs = (r % 2 === 1) ? oddDirs : evenDirs;
                    for (const [dc, dr] of dirs) {
                        const nc = c + dc, nr = r + dr;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols &&
                            (rawMap[nr][nc] === 'sea' || rawMap[nr][nc] === 'ocean')) {
                            rawMap[r][c] = 'sand';
                            break;
                        }
                    }
                }
            }

            // ── Pass 3: реки ─────────────────────────────────────
            const numRivers = (mt === 'rivers')
                ? 5 + Math.floor(Math.random() * 4)
                : 2 + Math.floor(Math.random() * 2);
            for (let ri = 0; ri < numRivers; ri++) {
                let startC = -1, startR = -1, attempts = 0;
                while (attempts < 300) {
                    const rc = 3 + Math.floor(Math.random() * (this.cols - 6));
                    const rr = 3 + Math.floor(Math.random() * (this.rows - 6));
                    if (rawMap[rr][rc] === 'mountain') { startC = rc; startR = rr; break; }
                    attempts++;
                }
                if (startC === -1) continue;

                const visited = new Set();
                let c = startC, r = startR, steps = 0;
                while (steps < this.cols + this.rows) {
                    const key = c + ',' + r;
                    if (visited.has(key)) break;
                    visited.add(key);
                    const t = rawMap[r][c];
                    if (t === 'ocean' || t === 'sea') break;
                    if (t !== 'mountain' && t !== 'sand') {
                        rawMap[r][c] = 'river';
                        const dirs2 = (r % 2 === 1) ? oddDirs : evenDirs;
                        for (const [dc, dr] of dirs2) {
                            const nc2 = c + dc, nr2 = r + dr;
                            if (nr2 >= 0 && nr2 < this.rows && nc2 >= 0 && nc2 < this.cols &&
                                rawMap[nr2][nc2] === 'plain') rawMap[nr2][nc2] = 'fertile';
                        }
                    }
                    const dirs3 = (r % 2 === 1) ? oddDirs : evenDirs;
                    let bestH = Infinity, bestC = -1, bestR = -1;
                    for (const [dc, dr] of dirs3) {
                        const nc = c + dc, nr = r + dr;
                        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
                        if (visited.has(nc + ',' + nr)) continue;
                        const jitter = (Math.random() - 0.5) * 0.06;
                        const h = heightMap[nr][nc] + jitter;
                        if (h < bestH) { bestH = h; bestC = nc; bestR = nr; }
                    }
                    if (bestC === -1) break;
                    c = bestC; r = bestR;
                    steps++;
                }
            }
            // ── Pass 4: финальные тайл-объекты ───────────────────
            for (let r = 0; r < this.rows; r++) {
                const row = [];
                for (let c = 0; c < this.cols; c++) {
                    row.push({ type: rawMap[r][c], col: c, row: r });
                }
                this.data.push(row);
            }
        },

        // ════════════════════════════════════════════════════
        // TURN PROCESSING
        // ════════════════════════════════════════════════════

        /**
         * Advances construction queue by one turn, completes finished buildings,
         * then delegates economy processing to EconomyEngine.
         * @returns {Array} list of newly completed building queue entries
         */
        processTurn: function() {
            const completed = [];
            for (let i = this.buildQueue.length - 1; i >= 0; i--) {
                this.buildQueue[i].turnsRemaining--;
                if (this.buildQueue[i].turnsRemaining <= 0) {
                    const q = this.buildQueue.splice(i, 1)[0];
                    this.buildings[q.col + ',' + q.row] = {
                        type: q.type,
                        name: null,
                        col: q.col,
                        row: q.row,
                        builtAt: Date.now(),
                        assignedWorkers: q.type === 'townhall' ? 1 : 0
                    };
                    if (q.type === 'townhall') {
                        this.townHallBuilt = true;
                        this.townhallQueued = false;
                        this.claimTerritory(q.col, q.row, C.DEFAULT_CITY_NAME, 3);
                    }
                    completed.push(q);
                }
            }
            return E.processTurn(this, completed);
        },

        /** Centers the camera so the map fills the canvas on first load. */
        center: function(canvasW, canvasH, keepCamera) {
            if (keepCamera) return; // Camera position already restored from save
            const mapW = this.cols * C.BASE_HEX_SIZE * C.SQRT3 + C.BASE_HEX_SIZE * C.SQRT3 / 2;
            const mapH = this.rows * C.BASE_HEX_SIZE * 2 * 0.75 + C.BASE_HEX_SIZE * 2 * 0.25;
            this.cameraX = (canvasW - mapW) / 2;
            this.cameraY = (canvasH - mapH) / 2;
        }
    };
})();

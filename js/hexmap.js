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

        hexSize:   function() { return C.BASE_HEX_SIZE * this.zoom; },
        hexWidth:  function() { return this.hexSize() * C.SQRT3; },
        hexHeight: function() { return this.hexSize() * 2; },
        xOffset:   function() { return this.hexWidth(); },
        yOffset:   function() { return this.hexHeight() * 0.75; },

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
            const candidates = [];
            for (let r = Math.max(0, approxRow - 2); r <= Math.min(this.rows - 1, approxRow + 2); r++) {
                for (let c = 0; c < this.cols; c++) {
                    const pos = this.hexToPixel(c, r);
                    const cx = pos.x + w / 2;
                    const cy = pos.y + h / 2;
                    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
                    if (dist <= s) candidates.push({ col: c, row: r, dist });
                }
            }
            if (candidates.length === 0) return null;
            candidates.sort((a, b) => a.dist - b.dist);
            return { col: candidates[0].col, row: candidates[0].row };
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
                    if (dist <= radius && dist > 0) {
                        const key = c + ',' + r;
                        const existing = this.territory[key];
                        if (!existing || dist < existing.distance) {
                            this.territory[key] = { owner: cityName, distance: dist };
                        }
                    }
                }
            }
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
            let closestDist = Infinity, closestName = null;
            for (const key of Object.keys(this.buildings)) {
                const b = this.buildings[key];
                if (b.type === 'local_admin' && (b.assignedWorkers || 0) >= 1 && b.name) {
                    const dist = this.hexDistance(col, row, b.col, b.row);
                    if (dist <= 7 && dist < closestDist) {
                        closestDist = dist;
                        closestName = b.name;
                    }
                }
            }
            return closestName;
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
                if (b.type !== 'townhall' && b.type !== 'local_admin' && !this.territory[key]) {
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
        getTotalAssignedWorkers:   function()           { return E.getTotalAssignedWorkers(this); },
        getFreeWorkers:            function()           { return E.getFreeWorkers(this); },
        assignWorker:              function(col, row)   { return E.assignWorker(this, col, row); },
        removeWorker:              function(col, row)   { return E.removeWorker(this, col, row); },
        isBuildingActive:          function(col, row)   { return E.isBuildingActive(this, col, row); },
        getBuildingWorkerStatus:   function(col, row)   { return E.getBuildingWorkerStatus(this, col, row); },
        getBuildingResidents:      function(col, row)   { return E.getBuildingResidents(this, col, row); },
        getPopulationInRadius:     function(col, row, r){ return E.getPopulationInRadius(this, col, row, r); },
        getMarketIncome:           function(col, row)   { return E.getMarketIncome(this, col, row); },
        isTerrainCompatible:       function(type, tile) { return E.isTerrainCompatible(type, tile); },
        canBuild:                  function(col, row, t){ return E.canBuild(this, col, row, t); },
        queueBuild:                function(col, row, t){ return E.queueBuild(this, col, row, t); },
        computeDeltas:             function()           { return E.computeDeltas(this); },

        // ════════════════════════════════════════════════════
        // MAP GENERATION
        // ════════════════════════════════════════════════════

        /** Generates a new map of the given size preset key ('small'|'medium'|'large'). */
        generate: function(sizeKey) {
            const dims = C.MAP_SIZES[sizeKey] || C.MAP_SIZES.medium;
            this.cols = dims.cols;
            this.rows = dims.rows;
            this.data = [];
            this.buildings = {};
            this.buildQueue = [];
            this.townHallBuilt = false;
            this.townhallQueued = false;
            this.territory = {};
            this.resources = { money: 50, wheat: 0, bread: 8, apples: 0, fish: 0, iron: 0, copper: 0, population: 3, defense: 0 };
            this.deltas = { money: 0, wheat: 0, bread: 0, apples: 0, fish: 0, iron: 0, copper: 0, population: 0, defense: 0 };
            this.lastEvents = [];
            this.pendingEventResults = [];
            this.winStreakTurns = 0;
            this.gameOver = null;
            this.factionColor = '#4f8ef7';
            if (window.EventsEngine) window.EventsEngine.reset();
            this.zoom = 1.0;
            this.cameraX = 0;
            this.cameraY = 0;

            const scale = 0.08;
            const seed = Math.random() * 1000;

            // Pass 1: generate raw terrain via fBm noise
            const rawMap = [];
            for (let r = 0; r < this.rows; r++) {
                const row = [];
                for (let c = 0; c < this.cols; c++) {
                    const val = window.Noise.fbm(c * scale + seed, r * scale + seed, 4);
                    if      (val < 0.20) row.push('ocean');
                    else if (val < 0.35) row.push('sea');
                    else if (val < 0.55) row.push('plain');
                    else if (val < 0.68) row.push('fertile');
                    else                 row.push('mountain');
                }
                rawMap.push(row);
            }

            // Pass 2: coastal plain → sand conversion
            const evenDirs = [[+1,0],[0,+1],[-1,+1],[-1,0],[-1,-1],[0,-1]];
            const oddDirs  = [[+1,0],[+1,+1],[0,+1],[-1,0],[0,-1],[+1,-1]];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (rawMap[r][c] !== 'plain') continue;
                    const dirs = (r % 2 === 1) ? oddDirs : evenDirs;
                    for (const [dc, dr] of dirs) {
                        const nc = c + dc, nr = r + dr;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && rawMap[nr][nc] === 'sea') {
                            rawMap[r][c] = 'sand';
                            break;
                        }
                    }
                }
            }

            // Pass 3: build final tile objects
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
        center: function(canvasW, canvasH) {
            const mapW = this.cols * C.BASE_HEX_SIZE * C.SQRT3 + C.BASE_HEX_SIZE * C.SQRT3 / 2;
            const mapH = this.rows * C.BASE_HEX_SIZE * 2 * 0.75 + C.BASE_HEX_SIZE * 2 * 0.25;
            this.cameraX = (canvasW - mapW) / 2;
            this.cameraY = (canvasH - mapH) / 2;
        }
    };
})();

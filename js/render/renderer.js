(function() {
    'use strict';
    const C = window.GameConfig;
    const HM = window.HexMap;

    const BUILDING_STYLES = {
        townhall:       { fill: '#f4b942', stroke: '#c28a1e', radius: 0.35 },
        house:          { fill: '#60a5fa', stroke: '#2563eb', radius: 0.28 },
        farm:           { fill: '#86efac', stroke: '#16a34a', radius: 0.30 },
        mill:           { fill: '#fb923c', stroke: '#c2410c', radius: 0.28 },
        orchard:        { fill: '#f87171', stroke: '#b91c1c', radius: 0.30 },
        cherry_orchard: { fill: '#9966db', stroke: '#9e1287', radius: 0.30 },
        market:         { fill: '#fde68a', stroke: '#d97706', radius: 0.30 },
        barracks:       { fill: '#a78bfa', stroke: '#6d28d9', radius: 0.28 },
        mine:           { fill: '#71717a', stroke: '#3f3f46', radius: 0.30 },
        port:           { fill: '#0ea5e9', stroke: '#0369a1', radius: 0.30 },
        local_admin:    { fill: '#64748b', stroke: '#334155', radius: 0.32 },
        factory:        { fill: '#e8795a', stroke: '#c2410c', radius: 0.32 },
        warehouse:      { fill: '#8b5cf6', stroke: '#6d28d9', radius: 0.30 },
        sawmill:        { fill: '#a16207', stroke: '#713f12', radius: 0.30 },
        smelter:        { fill: '#7c2d12', stroke: '#451a03', radius: 0.30 }
    };

    // ── Precomputed hex vertex offsets (unit-circle, pointy-top) ──────────
    // These are the 6 [cos, sin] pairs for angles: -30°, 30°, 90°, 150°, 210°, 270°
    // Multiplied by hexSize at render time. Recalculated only when zoom changes.
    const _HEX_ANGLES = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        _HEX_ANGLES.push([Math.cos(a), Math.sin(a)]);
    }

    // Vertex cache: stores [x,y] pairs for each hex, keyed by "col,row"
    // Invalidated when zoom or camera changes.
    let _sharedVerts = null;
    let _sharedVertsZoom = -1;

    // Tile fill colors as resolved array (avoid repeated object lookup)
    const _tileColors = {};

    window.Renderer = {
        canvas: null,
        ctx: null,
        mapMode: 'normal',
        _rafPending: false,

        requestRender: function() {
            if (this._rafPending) return;
            this._rafPending = true;
            requestAnimationFrame(() => {
                this._rafPending = false;
                this.render();
            });
        },

        init: function(canvasId) {
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas.getContext('2d', { alpha: false }); // opaque canvas = faster compositing
            this.resize();
            window.addEventListener('resize', () => this.resize());
            // Pre-resolve tile colors
            for (const [type, def] of Object.entries(C.TILES)) _tileColors[type] = def.color;
        },

        setMapMode: function(mode) {
            this.mapMode = mode;
            this.render();
        },

        resize: function() {
            if (!this.canvas) return;
            this.canvas.width  = window.innerWidth;
            this.canvas.height = window.innerHeight;
            _sharedVerts = null;
            this.render();
        },

        // ── Vertex helpers ──────────────────────────────────
        _invalidateVertCache: function() { _sharedVerts = null; _sharedVertsZoom = -1; },

        _getVerts: function(s) {
            if (_sharedVerts && _sharedVertsZoom === HM.zoom) return _sharedVerts;
            _sharedVerts = new Array(6);
            for (let i = 0; i < 6; i++) {
                _sharedVerts[i] = [s * _HEX_ANGLES[i][0], s * _HEX_ANGLES[i][1]];
            }
            _sharedVertsZoom = HM.zoom;
            return _sharedVerts;
        },

        // ── Fast hex path (inlined, no array allocation) ────
        _hexPath: function(ctx, v, cx, cy) {
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.beginPath();
            ctx.moveTo(v[0][0] + cx, v[0][1] + cy);
            ctx.lineTo(v[1][0] + cx, v[1][1] + cy);
            ctx.lineTo(v[2][0] + cx, v[2][1] + cy);
            ctx.lineTo(v[3][0] + cx, v[3][1] + cy);
            ctx.lineTo(v[4][0] + cx, v[4][1] + cy);
            ctx.lineTo(v[5][0] + cx, v[5][1] + cy);
            ctx.closePath();
        },

        // ── Main render ─────────────────────────────────────
        render: function() {
            if (!this.ctx || HM.data.length === 0) return;

            // Invalidate vertex cache on zoom change (camera offset applied at draw time)
            if (HM.zoom !== _sharedVertsZoom) this._invalidateVertCache();

            const ctx   = this.ctx;
            const cw    = this.canvas.width;
            const ch    = this.canvas.height;

            // Fill background once (canvas is opaque)
            ctx.fillStyle = '#080d18';
            ctx.fillRect(0, 0, cw, ch);

            // ── Precompute shared geometry for this frame ──
            const s   = HM.hexSize();
            const isZoomedOut = s < 12;
            const w   = HM.hexWidth();
            const h   = HM.hexHeight();
            const yOff = HM.yOffset();
            const camX = HM.cameraX;
            const camY = HM.cameraY;

            // ── Frustum culling bounds ─────────────────────
            // A hex is visible if its center is within (canvas + 1 hex margin)
            const margin = s * 2;
            const visX0 = -margin,       visX1 = cw + margin;
            const visY0 = -margin,       visY1 = ch + margin;

            // Row culling: find first/last visible row
            const firstRow = Math.max(0, Math.floor((-camY - margin) / yOff) - 1);
            const lastRow  = Math.min(HM.rows - 1, Math.ceil((ch - camY + margin) / yOff) + 1);

            // ── Pull event states ONCE per frame (not per building) ──
            const now    = Date.now();
            const strike = window.EventsEngine?.getActiveStrike?.() || null;
            const locust = window.EventsEngine?.getActiveLocust?.() || null;

            // Build a Set of locust-affected farm keys for O(1) lookup
            let locustSet = null;
            if (locust?.affectedFarms?.length) {
                locustSet = new Set(locust.affectedFarms.map(f => f.col + ',' + f.row));
            }

            const selectedCell = window.GameState?.selectedCell;
            const factionColor = HM.factionColor;
            const isWorkMode   = this.mapMode === 'work';
            
            const queueMap = {};
            for (const q of HM.buildQueue) queueMap[q.col + ',' + q.row] = q;

            // ── Render visible hexes ───────────────────────
            for (let r = firstRow; r <= lastRow; r++) {
                const rowData = HM.data[r];
                const isOddRow = (r % 2 === 1);
                const baseY    = r * yOff + camY;

                for (let c = 0; c < HM.cols; c++) {
                    // Column culling
                    let bx = c * w + camX;
                    if (isOddRow) bx += w / 2;
                    if (bx + w < visX0 || bx > visX1) continue;
                    if (baseY + h < visY0 || baseY > visY1) continue;

                    const cx = bx + w / 2;
                    const cy = baseY + h / 2;

                    this.drawHex(ctx, c, r, rowData[c], cx, cy, s, w, h,
                        factionColor, isWorkMode, now, strike, locustSet, selectedCell, queueMap, isZoomedOut);
                }
            }
            if (!isZoomedOut) {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                ctx.lineWidth = 1 * HM.zoom;
                const vv = this._getVerts(s);
                for (let r = firstRow; r <= lastRow; r++) {
                    const isOddRow = (r % 2 === 1);
                    const baseY = r * yOff + camY;
                    for (let c = 0; c < HM.cols; c++) {
                        let bx = c * w + camX;
                        if (isOddRow) bx += w / 2;
                        if (bx + w < visX0 || bx > visX1) continue;
                        const cx = bx + w / 2;
                        const cy = baseY + h / 2;
                        ctx.moveTo(vv[0][0] + cx, vv[0][1] + cy);
                        ctx.lineTo(vv[1][0] + cx, vv[1][1] + cy);
                        ctx.lineTo(vv[2][0] + cx, vv[2][1] + cy);
                        ctx.lineTo(vv[3][0] + cx, vv[3][1] + cy);
                        ctx.lineTo(vv[4][0] + cx, vv[4][1] + cy);
                        ctx.lineTo(vv[5][0] + cx, vv[5][1] + cy);
                        ctx.closePath();
                    }
                }
                ctx.stroke();
            }
        },

        // ── Draw a single hex ────────────────────────────────
        drawHex: function(ctx, col, row, tile, cx, cy, s, w, h,
          factionColor, isWorkMode, now, strike, locustSet, selectedCell, queueMap, isZoomedOut) {

            const key      = col + ',' + row;
            const terr     = HM.territory[key];
            const building = HM.buildings[key];

            // Get (cached) vertices
            const v = this._getVerts(s);
            
            if (isZoomedOut) {
                ctx.fillStyle = _tileColors[tile.type] || '#1a3352';
                this._hexPath(ctx, v, cx, cy);
                ctx.fill();
                if (terr || (building && building.type === 'townhall')) {
                    ctx.globalAlpha = 0.18;
                    ctx.fillStyle = factionColor;
                    this._hexPath(ctx, v, cx, cy);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                if (building) {
                    // Только цветная точка вместо иконки
                    const style = BUILDING_STYLES[building.type] || BUILDING_STYLES.townhall;
                    ctx.beginPath();
                    ctx.arc(cx, cy, Math.max(2, s * 0.3), 0, Math.PI * 2);
                    ctx.fillStyle = style.fill;
                    ctx.fill();
                }
                return; // пропускаем всё остальное
            }

            // ── 1. Base tile fill ──────────────────────────
            ctx.fillStyle = _tileColors[tile.type] || '#1a3352';
            this._hexPath(ctx, v, cx, cy);
            ctx.fill();

            // ── 2. Territory tint (faction color) ──────────
            if (terr || (building && building.type === 'townhall')) {
                ctx.globalAlpha = terr ? 0.15 : 0.10;
                ctx.fillStyle = factionColor;
                this._hexPath(ctx, v, cx, cy);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // ── 3. Work mode: idle building hex tint ───────
            if (isWorkMode && building) {
                const cfg = C.BUILDINGS[building.type];
                if (cfg?.workersRequired) {
                    const assigned = building.assignedWorkers || 0;
                    const isStruck = strike && strike.targetCol === col && strike.targetRow === row;
                    if (assigned < cfg.workersRequired && !isStruck) {
                        // Dark red tint
                        ctx.globalAlpha = 0.18;
                        ctx.fillStyle = '#ef4444';
                        this._hexPath(ctx, v, cx, cy);
                        ctx.fill();
                        ctx.globalAlpha = 1;

                        // Pulsing border
                        const pulse = (Math.sin(now / 500) + 1) / 2;
                        ctx.strokeStyle = `rgba(239,68,68,${0.4 + pulse * 0.4})`;
                        ctx.lineWidth = 2.5 * HM.zoom;
                        this._hexPath(ctx, v, cx, cy);
                        ctx.stroke();
                    }
                }
            }

            // ── 5. Territory border edges ──────────────────
            if (terr) {
                const isOdd = (row % 2 === 1);
                const evenDirs = [[+1,0],[0,+1],[-1,+1],[-1,0],[-1,-1],[0,-1]];
                const oddDirs  = [[+1,0],[+1,+1],[0,+1],[-1,0],[0,-1],[+1,-1]];
                const dirs = isOdd ? oddDirs : evenDirs;

                ctx.strokeStyle = factionColor;
                ctx.lineWidth   = 2.5 * HM.zoom;
                ctx.lineCap     = 'round';
                for (let i = 0; i < 6; i++) {
                    const d = dirs[i];
                    const nc = col + d[0], nr = row + d[1];
                    if (nr < 0 || nr >= HM.rows || nc < 0 || nc >= HM.cols) continue;
                    const nKey  = nc + ',' + nr;
                    const nTerr = HM.territory[nKey];
                    const nBuilding = HM.buildings[nKey];
                    const isBorder  = (!nTerr && !nBuilding) ||
                        (nBuilding?.type === 'townhall' && nBuilding.name !== terr.owner) ||
                        (nTerr && nTerr.owner !== terr.owner);
                    if (isBorder) {
                        ctx.beginPath();
                        ctx.moveTo(v[i][0] + cx, v[i][1] + cy);
                        ctx.lineTo(v[(i + 1) % 6][0] + cx, v[(i + 1) % 6][1] + cy);
                        ctx.stroke();
                    }
                }
            }

            // ── 6. Completed building ──────────────────────
            if (building) {
                this.drawBuilding(ctx, cx, cy, s, building.type, col, row, building,
                    now, isWorkMode, strike, locustSet);
            }

            // ── 7. Under-construction pulse ────────────────
            const inQueue = queueMap[key];
            if (inQueue) {
                const pulse = (Math.sin(now / 300) + 1) / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, s * 0.25 + pulse * s * 0.1, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(244,185,66,' + (0.3 + pulse * 0.35) + ')';
                ctx.fill();

                ctx.font = (s * 0.38) + 'px serif';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔨', cx, cy - s * 0.1);

                ctx.font = 'bold ' + (s * 0.22) + 'px sans-serif';
                ctx.fillStyle = '#f4b942';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 3;
                ctx.fillText(inQueue.turnsRemaining, cx, cy + s * 0.27);
                ctx.shadowBlur = 0;
            }

            // ── 8. Selected highlight ──────────────────────
            if (selectedCell && selectedCell.col === col && selectedCell.row === row) {
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth   = 2.5 * HM.zoom;
                this._hexPath(ctx, v, cx, cy);
                ctx.stroke();
            }
        },

        // ── Draw building on top of hex ──────────────────────
        drawBuilding: function(ctx, cx, cy, s, type, col, row, building,
                               now, isWorkMode, strike, locustSet) {
            const style = BUILDING_STYLES[type] || BUILDING_STYLES.townhall;
            const cfg   = C.BUILDINGS[type];

            // Circle background
            ctx.beginPath();
            ctx.arc(cx, cy, s * style.radius, 0, Math.PI * 2);
            ctx.fillStyle  = style.fill;
            ctx.fill();
            ctx.strokeStyle = style.stroke;
            ctx.lineWidth   = 1.5 * HM.zoom;
            ctx.stroke();

            // Building icon
            if (cfg) {
                ctx.font = (s * 0.38) + 'px serif';
                ctx.textAlign    = 'center';
                ctx.fillText(cfg.icon, cx, cy);
            }

            const accident = window.HexMap._lastAccident;
            if (accident && accident.col === col && accident.row === row) {
                const currentTurn = window.GameState?.currentTurn || 0;
                if (accident.turn === currentTurn) {
                    ctx.font = (s * 0.55) + 'px serif';
                    ctx.fillStyle = '#ef4444';
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 6;
                    ctx.fillText('💀', cx, cy - s * 0.15);
                    ctx.shadowBlur = 0;
                }
            }

            // Level star ⭐ (top-right)
            const hasLevel = building.level && building.level > 1;
            if (hasLevel) {
                ctx.font = (s * 0.22) + 'px serif';
                ctx.fillStyle   = '#f4b942';
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur  = 3;
                ctx.fillText('⭐', cx + s * 0.28, cy - s * 0.28);
                ctx.shadowBlur  = 0;
            }

            // Mine mode indicator dot (top-left if upgraded, top-right otherwise)
            if (type === 'mine') {
                const mode = building.mineMode || 'gold';
                const modeColors = { gold: '#f4b942', iron: '#94a3b8', copper: '#b45309', coal: '#374151' };
                const dotX = hasLevel ? cx - s * 0.25 : cx + s * 0.25;
                ctx.beginPath();
                ctx.arc(dotX, cy - s * 0.25, s * 0.12, 0, Math.PI * 2);
                ctx.fillStyle   = modeColors[mode] || '#f4b942';
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth   = 1 * HM.zoom;
                ctx.stroke();
            }

            // ── Work mode idle warning ─────────────────────
            if (isWorkMode && cfg?.workersRequired) {
                const assigned = building.assignedWorkers || 0;
                const isStruck = strike && strike.targetCol === col && strike.targetRow === row;
                if (assigned < cfg.workersRequired && !isStruck) {
                    const pulse = (Math.sin(now / 400) + 1) / 2;
                    ctx.globalAlpha = 0.3 + pulse * 0.2;
                    ctx.fillStyle = '#ef4444';
                    ctx.beginPath();
                    ctx.arc(cx, cy, s * style.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    ctx.font = (s * 0.35) + 'px serif';
                    ctx.fillStyle   = '#fca5a5';
                    ctx.shadowColor = 'rgba(0,0,0,0.7)';
                    ctx.shadowBlur  = 4;
                    ctx.fillText('⚠️', cx, cy - s * 0.35);

                    ctx.font = (s * 0.22) + 'px sans-serif';
                    ctx.shadowBlur = 0;
                    ctx.fillText(`${assigned}/${cfg.workersRequired}`, cx, cy + s * 0.35);

                    ctx.strokeStyle = `rgba(239,68,68,${0.5 + pulse * 0.3})`;
                    ctx.lineWidth   = 2 * HM.zoom;
                    ctx.beginPath();
                    ctx.arc(cx, cy, s * (style.radius + 0.06 + pulse * 0.04), 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // ── Strike overlay ─────────────────────────────
            if (strike && strike.targetCol === col && strike.targetRow === row) {
                ctx.globalAlpha = 0.35;
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(cx, cy, s * style.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;

                ctx.font = (s * 0.42) + 'px serif';
                ctx.fillStyle   = '#fbbf24';
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur  = 4;
                ctx.fillText('✊', cx, cy);
                ctx.shadowBlur  = 0;
            }

            // ── Locust overlay ─────────────────────────────
            if (locustSet) {
                const key = col + ',' + row;
                if (locustSet.has(key)) {
                    const pulse = (Math.sin(now / 400) + 1) / 2;
                    ctx.globalAlpha = 0.25 + pulse * 0.15;
                    ctx.fillStyle = '#2d1f0f';
                    ctx.beginPath();
                    ctx.arc(cx, cy, s * style.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    ctx.font = (s * 0.40) + 'px serif';
                    ctx.fillStyle   = '#a16207';
                    ctx.shadowColor = 'rgba(0,0,0,0.7)';
                    ctx.shadowBlur  = 5;
                    ctx.fillText('🦗', cx, cy - s * 0.05);
                    ctx.shadowBlur  = 0;

                    // Orbiting bug dots
                    const time = now / 300;
                    ctx.fillStyle = '#713f12';
                    for (let i = 0; i < 5; i++) {
                        const angle = time + (i * Math.PI * 2 / 5);
                        const dist  = s * 0.15 + Math.sin(time * 2 + i) * s * 0.05;
                        ctx.beginPath();
                        ctx.arc(cx + Math.cos(angle) * dist,
                                cy + Math.sin(angle) * dist + s * 0.05,
                                s * 0.04, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
    };
})();

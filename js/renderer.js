(function() {
    'use strict';
    const C = window.GameConfig;
    const HM = window.HexMap;

    const BUILDING_STYLES = {
        townhall:    { fill: '#f4b942', stroke: '#c28a1e', radius: 0.35 },
        house:       { fill: '#60a5fa', stroke: '#2563eb', radius: 0.28 },
        farm:        { fill: '#86efac', stroke: '#16a34a', radius: 0.30 },
        mill:        { fill: '#fb923c', stroke: '#c2410c', radius: 0.28 },
        orchard:     { fill: '#f87171', stroke: '#b91c1c', radius: 0.30 },
        market:      { fill: '#fde68a', stroke: '#d97706', radius: 0.30 },
        barracks:    { fill: '#a78bfa', stroke: '#6d28d9', radius: 0.28 },
        mine:        { fill: '#71717a', stroke: '#3f3f46', radius: 0.30 },
        port:        { fill: '#0ea5e9', stroke: '#0369a1', radius: 0.30 },
        local_admin: { fill: '#64748b', stroke: '#334155', radius: 0.32 }
    };

    window.Renderer = {
        canvas: null,
        ctx: null,

        init: function(canvasId) {
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
        },

        resize: function() {
            if (!this.canvas) return;
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.render();
        },

        render: function() {
            if (!this.ctx || HM.data.length === 0) return;
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            for (let r = 0; r < HM.rows; r++) {
                for (let c = 0; c < HM.cols; c++) {
                    this.drawHex(c, r, HM.data[r][c]);
                }
            }
        },

        drawHex: function(col, row, tile) {
            const ctx = this.ctx;
            const pos = HM.hexToPixel(col, row);
            const w = HM.hexWidth();
            const h = HM.hexHeight();
            const cx = pos.x + w / 2;
            const cy = pos.y + h / 2;
            const s = HM.hexSize();

            const verts = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                verts.push({ x: cx + s * Math.cos(angle), y: cy + s * Math.sin(angle) });
            }

            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();

            ctx.fillStyle = C.TILES[tile.type].color;
            ctx.fill();

            // Territory tint
            const key = col + ',' + row;
            const terr = HM.territory[key];
            if (terr) {
                ctx.save();
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = HM.factionColor;
                ctx.beginPath();
                ctx.moveTo(verts[0].x, verts[0].y);
                for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            // Also tint townhall tile itself
            const keyBuilding = HM.buildings[key];
            if (keyBuilding && keyBuilding.type === 'townhall') {
                ctx.save();
                ctx.globalAlpha = 0.10;
                ctx.fillStyle = HM.factionColor;
                ctx.beginPath();
                ctx.moveTo(verts[0].x, verts[0].y);
                for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            // Grid stroke
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1 * HM.zoom;
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();
            ctx.stroke();

            // Territory border edges
            if (terr) {
                ctx.strokeStyle = HM.factionColor;
                ctx.lineWidth = 2.5 * HM.zoom;
                ctx.lineCap = 'round';
                for (let i = 0; i < 6; i++) {
                    if (HM.isBorderEdge(col, row, i)) {
                        ctx.beginPath();
                        ctx.moveTo(verts[i].x, verts[i].y);
                        ctx.lineTo(verts[(i + 1) % 6].x, verts[(i + 1) % 6].y);
                        ctx.stroke();
                    }
                }
            }

            // Completed building
            const building = HM.buildings[key];
            if (building) {
                this.drawBuilding(ctx, cx, cy, s, building.type, col, row);
            }

            // Under construction (pulsing)
            const inQueue = HM.buildQueue.find(q => q.col === col && q.row === row);
            if (inQueue) {
                const pulse = (Math.sin(Date.now() / 300) + 1) / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, s * 0.25 + pulse * s * 0.1, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(244, 185, 66, ' + (0.3 + pulse * 0.35) + ')';
                ctx.fill();
                ctx.font = (s * 0.4) + 'px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔨', cx, cy);
            }

            // Selected highlight
            if (window.GameState && window.GameState.selectedCell &&
                window.GameState.selectedCell.col === col &&
                window.GameState.selectedCell.row === row) {
                ctx.beginPath();
                ctx.moveTo(verts[0].x, verts[0].y);
                for (let i = 1; i < 6; i++) ctx.lineTo(verts[i].x, verts[i].y);
                ctx.closePath();
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 2.5 * HM.zoom;
                ctx.stroke();
            }
        },

        drawBuilding: function(ctx, cx, cy, s, type, col, row) {
            const style = BUILDING_STYLES[type] || BUILDING_STYLES.townhall;
            const cfg = window.GameConfig.BUILDINGS[type];

            ctx.beginPath();
            ctx.arc(cx, cy, s * style.radius, 0, Math.PI * 2);
            ctx.fillStyle = style.fill;
            ctx.fill();
            ctx.strokeStyle = style.stroke;
            ctx.lineWidth = 1.5 * HM.zoom;
            ctx.stroke();

            // Draw building icon first
            if (cfg) {
                ctx.font = (s * 0.38) + 'px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cfg.icon, cx, cy);
            }

            // Strike overlay — drawn ON TOP of the building icon
            if (col !== undefined && row !== undefined && window.EventsEngine) {
                const strike = window.EventsEngine.getActiveStrike();
                if (strike && strike.targetCol === col && strike.targetRow === row) {
                    // Semi-transparent yellow circle overlay
                    ctx.save();
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle = '#fbbf24';
                    ctx.beginPath();
                    ctx.arc(cx, cy, s * style.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Strike icon on top, larger and clearly visible
                    ctx.save();
                    ctx.font = (s * 0.42) + 'px serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fbbf24';
                    ctx.shadowColor = 'rgba(0,0,0,0.6)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 1;
                    ctx.fillText('✊', cx, cy);
                    ctx.restore();
                }
            }
        }
    };
})();
(function() {
    'use strict';
    const P = window.PopulationEngine;

    window.IdeologyEngine = {

        /* ═══════════════════════════════════════════════════════
           СПРАВОЧНИКИ
           ═══════════════════════════════════════════════════════ */
        IDEOLOGY_MAP: {
            farm:           'conservative',
            mill:           'conservative',
            sawmill:        'conservative',
            mine:           'communist',
            factory:        'communist',
            smelter:        'communist',
            cherry_orchard: 'communist',
            orchard:        'liberal',
            port:           'liberal',
            townhall:       'militarist',
            local_admin:    'militarist',
            barracks:       'militarist',
            house:          null,
        },

        IDEOLOGY_META: {
            conservative: { icon: '🌾', label: 'Консерваторы',  color: '#86efac', hint: 'Фермы, мельницы, лесопилки' },
            communist:    { icon: '⚒️',  label: 'Коммунисты',    color: '#f87171', hint: 'Шахты, заводы и виш. сады' },
            liberal:      { icon: '🍎', label: 'Либералы',       color: '#fbbf24', hint: 'Ябл. сады и порты' },
            militarist:   { icon: '⚔️', label: 'Милитаристы',    color: '#a78bfa', hint: 'Ратуша, администрации, казармы' },
            anarchist:    { icon: '🔥', label: 'Анархисты',      color: '#94a3b8', hint: 'Безработные жители' },
        },

        /* ═══════════════════════════════════════════════════════
           ОБЩИЕ ХЕЛПЕРЫ
           ═══════════════════════════════════════════════════════ */

        /** Подсчёт рабочих по идеологиям с опциональным фильтром зданий. */
        countWorkersByIdeology: function(hexMap, filterFn) {
            const counts = { conservative: 0, communist: 0, liberal: 0, militarist: 0 };
            for (const b of Object.values(hexMap.buildings)) {
                if (filterFn && !filterFn(b)) continue;
                const workers = b.assignedWorkers || 0;
                if (workers > 0) {
                    const ideo = this.IDEOLOGY_MAP[b.type];
                    if (ideo) counts[ideo] += workers;
                }
            }
            return counts;
        },

        /** Подсчёт анархистов (безработных) внутри заданного набора домов. */
        countAnarchists: function(hexMap, homesInDistrict) {
            P.ensureCitizens(hexMap);
            const jobs = P.computeCitizenJobs(hexMap);
            let anarchists = 0;

            for (const c of hexMap.citizens) {
                if (!c.home) { anarchists++; continue; }
                if (homesInDistrict && !homesInDistrict.has(c.home)) continue;
                if (!jobs[c.id]) anarchists++;
            }
            return anarchists;
        },
        /**
         * Возвращает массив зданий, привязанных к указанной идеологии.
         * @param {boolean} onlyActive - только здания с рабочими (>0)
         * @returns {Array}
         */
        getBuildingsByIdeology: function(hexMap, ideology, onlyActive) {
            const out = [];
            for (const b of Object.values(hexMap.buildings)) {
                if (this.IDEOLOGY_MAP[b.type] !== ideology) continue;
                if (onlyActive && !(b.assignedWorkers || 0)) continue;
                out.push(b);
            }
            return out;
        },
        /** Определение доминанта. */
        getDominant: function(counts) {
            const total = Object.values(counts).reduce((s, v) => s + v, 0);
            let dominant = null, best = 0;
            for (const [k, v] of Object.entries(counts)) {
                if (v > best) { best = v; dominant = k; }
            }
            return { dominant, total, dominantMeta: dominant ? this.IDEOLOGY_META[dominant] : null };
        },

        /* ═══════════════════════════════════════════════════════
           ГЛОБАЛЬНЫЙ ПОДСЧЁТ (для тултипа населения)
           ═══════════════════════════════════════════════════════ */

        /**
         * Идеологии по всей карте.
         * @returns {{ conservative, communist, liberal, militarist, anarchist, total, dominant, dominantMeta, IDEOLOGY_META }}
         */
        getGlobalIdeologies: function(hexMap) {
            const counts = this.countWorkersByIdeology(hexMap);
            counts.anarchist = this.countAnarchists(hexMap);

            const { dominant, total, dominantMeta } = this.getDominant(counts);
            return { ...counts, total, dominant, dominantMeta, IDEOLOGY_META: this.IDEOLOGY_META };
        },

        /* ═══════════════════════════════════════════════════════
           РАЙОННЫЙ ПОДСЧЁТ (для панели администрации)
           ═══════════════════════════════════════════════════════ */

        /**
         * Идеологии и демография района (радиус 7 от local_admin).
         * @returns {{ conservative, communist, liberal, militarist, anarchist, total, dominant, dominantMeta, IDEOLOGY_META, residents, workInside, workOutside, unemployed, commutersIn, workingHere }}
         */
        getDistrictIdeology: function(hexMap, col, row) {
            P.ensureCitizens(hexMap);
            const jobs = P.computeCitizenJobs(hexMap);
            const self = hexMap.buildings[col + ',' + row];

            const isHere = (owner) => owner && self && owner.col === self.col && owner.row === self.row;

            // --- Рабочие в районе ---
            const counts = this.countWorkersByIdeology(hexMap, b =>
                hexMap.hexDistance(col, row, b.col, b.row) <= 7
            );

            // --- Жители в районе ---
            let residents = 0, workInside = 0, workOutside = 0, unemployed = 0, commutersIn = 0;
            const districtHomes = new Set();

            for (const c of hexMap.citizens) {
                if (!c.home) continue;
                const [hc, hr] = c.home.split(',').map(Number);
                if (hexMap.hexDistance(col, row, hc, hr) > 7) continue;

                districtHomes.add(c.home);
                const homeOwner = P.getDistrictOwner(hexMap, hc, hr);
                const jobKey = jobs[c.id];
                let jobOwner = null;
                if (jobKey) {
                    const [jc, jr] = jobKey.split(',').map(Number);
                    jobOwner = P.getDistrictOwner(hexMap, jc, jr);
                }

                const livesHere = isHere(homeOwner);
                const worksHere = isHere(jobOwner);

                if (livesHere) {
                    residents++;
                    if (!jobKey) unemployed++;
                    else if (worksHere) workInside++;
                    else workOutside++;
                }
                if (worksHere && !livesHere) commutersIn++;
            }

            counts.anarchist = unemployed;

            const { dominant, total, dominantMeta } = this.getDominant(counts);
            return {
                ...counts,
                total,
                dominant,
                dominantMeta,
                IDEOLOGY_META: this.IDEOLOGY_META,
                residents,
                workInside,
                workOutside,
                unemployed,
                commutersIn,
                workingHere: workInside + commutersIn
            };
        }
    };
})();
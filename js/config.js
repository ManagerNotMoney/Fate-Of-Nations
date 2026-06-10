(function() {
    'use strict';
    window.GameConfig = {
        // ─── Map & Rendering ──────────────────────────────────
        BASE_HEX_SIZE: 28,
        SQRT3: Math.sqrt(3),

        // ─── Fallback name used before a city is named ────────
        DEFAULT_CITY_NAME: 'Безымянный город',

        // ─── Tile definitions ─────────────────────────────────
        TILES: {
            ocean:   { color: '#0d1f3d', name: 'Океан',             canBuild: false },
            sea:     { color: '#1a3352', name: 'Море',              canBuild: false },
            sand:    { color: '#c2a96e', name: 'Песок',             canBuild: true  },
            plain:   { color: '#2a5225', name: 'Равнина',           canBuild: true  },
            fertile: { color: '#4a7020', name: 'Плодородная почва', canBuild: true  },
            mountain:{ color: '#4a3c2e', name: 'Горы',              canBuild: false }
        },

        // ─── Map size presets ─────────────────────────────────
        MAP_SIZES: {
            small:  { cols: 22, rows: 17 },
            medium: { cols: 34, rows: 26 },
            large:  { cols: 54, rows: 42 }
        },

        // ─── Building definitions ─────────────────────────────
        BUILDINGS: {
            townhall: {
                name: 'Ратуша',
                icon: '🏛️',
                cost: { money: 0 },
                production: { money: 5 },
                turnsToComplete: 1,
                allowedTiles: ['plain', 'fertile', 'sand'],
                unique: true,
                workersRequired: 1,
                maxResidents: 5,
                description: 'Административный центр. Приносит 5 монет/ход + 1 монета за каждого жителя. Захватывает территорию в радиусе 3 клеток. Вмещает до 5 жителей. Требует 1 жителя-управляющего.'
            },
            house: {
                name: 'Дом',
                icon: '🏠',
                cost: { money: 20 },
                production: { population: 2 },
                turnsToComplete: 1,
                allowedTiles: ['plain', 'fertile', 'sand'],
                unique: false,
                maxResidents: 20,
                description: 'Жилой дом. Привлекает +2 населения. Вмещает до 20 жителей. Жителям нужна еда каждый ход.'
            },
            farm: {
                name: 'Ферма',
                icon: '🌾',
                cost: { money: 15 },
                production: { wheat: 3 },
                turnsToComplete: 1,
                allowedTiles: ['fertile'],
                unique: false,
                workersRequired: 1,
                description: 'Только на плодородной почве. Производит 3 пшеницы/ход. Требует 1 жителя.'
            },
            mill: {
                name: 'Мельница',
                icon: '⚙️',
                cost: { money: 30 },
                production: { bread: 2 },
                consumption: { wheat: 2 },
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile', 'sand'],
                unique: false,
                workersRequired: 2,
                description: 'Перерабатывает 2 пшеницы → 2 хлеба/ход. Требует 2 жителей-мельников.'
            },
            orchard: {
                name: 'Яблоневый сад',
                icon: '🍎',
                cost: { money: 25 },
                production: {},
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile', 'sand'],
                forbiddenTiles: ['sand'],
                unique: false,
                workersRequired: 1,
                workersMax: 2,
                description: 'Только на равнинах и плодородной почве (не на песке). 1 работник = 2 яблока/ход, 2 работника = 4 яблока/ход. Каждое яблоко кормит 1 жителя. Можно назначить до 2 садовников.'
            },
            market: {
                name: 'Рынок',
                icon: '🏪',
                cost: { money: 40 },
                production: { money: 0 }, // Dynamic: based on nearby pop
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile', 'sand'],
                unique: false,
                marketRadius: 4,
                moneyPerResident: 1,
                description: 'Торговый центр. Приносит 1 монету за каждого жителя и работника в радиусе 4 клеток. Требует минимум 5 жителей в городе.'
            },
            barracks: {
                name: 'Казармы',
                icon: '⚔️',
                cost: { money: 50 },
                production: { defense: 3 },
                turnsToComplete: 3,
                allowedTiles: ['plain', 'fertile', 'sand'],
                unique: false,
                workersRequired: 2,
                description: 'Защита территории. +3 очка обороны/ход. Требует 2 солдат из населения.'
            },
            mine: {
                name: 'Шахта',
                icon: '⛏️',
                cost: { money: 35 },
                production: { money: 10 },
                turnsToComplete: 2,
                allowedTiles: ['mountain'],
                unique: false,
                workersRequired: 2,
                description: 'Только в горах. Добывает 10 монет/ход из золотой руды. Требует 2 шахтёров.'
            },
            port: {
                name: 'Порт',
                icon: '⚓',
                cost: { money: 45 },
                production: {},
                turnsToComplete: 2,
                allowedTiles: ['sea'],
                unique: false,
                workersRequired: 1,
                workersMax: 2,
                description: 'Только на море. 1 работник = 2 рыбы/ход, 2 работника = 5 рыб/ход. Каждая рыба кормит 1 жителя. Можно назначить до 2 рыбаков.'
            },
            local_admin: {
                name: 'Местная администрация',
                icon: '🏢',
                cost: { money: 0 },  // Dynamic cost: count * 500
                production: {},
                turnsToComplete: 5,
                allowedTiles: ['plain', 'fertile', 'sand'],
                unique: false,
                workersRequired: 1,
                description: 'Расширяет владение территорией в радиусе 7 клеток вокруг себя. Стоимость: кол-во администраций × 500 монет. Требует 1 жителя-администратора.'
            }
        },

        // ─── Resource display metadata ─────────────────────────
        RESOURCES: {
            money:      { icon: '💰', name: 'Монеты',    color: '#f4b942' },
            wheat:      { icon: '🌾', name: 'Пшеница',   color: '#86cc14' },
            bread:      { icon: '🍞', name: 'Хлеб',      color: '#e8834a' },
            apples:     { icon: '🍎', name: 'Яблоки',    color: '#ef4444' },
            fish:       { icon: '🐟', name: 'Рыба',      color: '#38bdf8' },
            population: { icon: '👥', name: 'Население',  color: '#4f8ef7' },
            defense:    { icon: '🛡️', name: 'Оборона',   color: '#a78bfa' }
        },

        // ─── Economy constants ─────────────────────────────────
        /** How many people 1 bread feeds per turn */
        FOOD_PER_POPULATION: 3,
        /** Apples/fish are 1:1 with population */
        APPLE_PER_PERSON: 1,
        FISH_PER_PERSON: 1,
        /** Flat income every turn */
        BASE_INCOME: 2,
        /** Max residents per house */
        HOUSE_MAX_POPULATION: 20,
        /** Coins earned per population point per turn (from townhall) */
        MONEY_PER_POPULATION: 1,
        /** Minimum population required to build a market */
        MARKET_MIN_POPULATION: 5,
        /** Max residents in the townhall */
        TOWNHALL_MAX_RESIDENTS: 5
    };
})();

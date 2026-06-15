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
                allowedTiles: ['plain', 'fertile'],
                unique: true,
                workersRequired: 1,
                maxResidents: 5,
                maxLevel: 2,
                upgradeCost: { money: 300 },
                levelWorkersMax: { 1: 1, 2: 2 },
                level2BuildDiscount: 0.04,
                description: 'Административный центр. Приносит 5 монет/ход + 1 монета за каждого жителя. Захватывает территорию в радиусе 3 клеток. Вмещает до 5 жителей. Требует 1 жителя-управляющего. Уровень 2: можно нанять 2-го работника-управляющего, при наличии 2 рабочих все постройки в городе дешевле на 4%.'
            },
            house: {
                name: 'Дом',
                icon: '🏠',
                cost: { money: 20 },
                production: { population: 2 },
                turnsToComplete: 1,
                allowedTiles: ['plain', 'fertile'],
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
                maxLevel: 2,
                upgradeCost: { money: 40 },
                levelWorkersMax: { 1: 1, 2: 2 },
                description: 'Только на плодородной почве. Производит 3 пшеницы/ход. Требует 1 жителя. Уровень 2: +50% урожайности и можно нанять 2-го работника.'
            },
            mill: {
                name: 'Мельница',
                icon: '⚙️',
                cost: { money: 30 },
                production: { bread: 2 },
                consumption: { wheat: 2 },
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile'],
                unique: false,
                workersRequired: 2,
                maxLevel: 2,
                upgradeCost: { money: 80 },
                description: 'Перерабатывает 2 пшеницы → 2 хлеба/ход. Требует 2 жителей-мельников. Уровень 2: 5 хлеба за 4 пшеницы.'
            },
            orchard: {
                name: 'Яблоневый сад',
                icon: '🍎',
                cost: { money: 25 },
                production: {},
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile'],
                forbiddenTiles: ['sand'],
                unique: false,
                workersRequired: 1,
                workersMax: 2,
                description: 'Только на равнинах и плодородной почве (не на песке). 1 работник = 2 яблока/ход, 2 работника = 4 яблока/ход. Каждое яблоко кормит 1 жителя. Можно назначить до 2 садовников.'
            },
            cherry_orchard: {
                name: 'Вишнёвый сад',
                icon: '🍒',
                cost: { money: 30 },
                production: {},
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile'],
                forbiddenTiles: ['sand'],
                unique: false,
                workersRequired: 1,
                workersMax: 2,
                description: 'Только на равнинах и плодородной почве (не на песке). 1 работник = 2 вишни/ход, 2 работника = 4 вишни/ход. Каждая вишня кормит 1 жителя. Можно назначить до 2 садовников.'
            },
            market: {
                name: 'Рынок',
                icon: '🏪',
                cost: { money: 40 },
                production: { money: 0 }, // Dynamic: based on nearby pop
                turnsToComplete: 5,
                allowedTiles: ['sand','plain', 'fertile'],
                unique: false,
                marketRadius: 5,
                moneyPerResident: 0.25,
                description: 'Торговый центр. Приносит 0.25 монеты за каждого жителя и работника в радиусе 4 клеток. Требует минимум 5 жителей в городе. Строится 5 ходов.'
            },
            barracks: {
                name: 'Казармы',
                icon: '⚔️',
                cost: { money: 50 },
                production: { defense: 3 },
                turnsToComplete: 3,
                allowedTiles: ['sand','plain', 'fertile'],
                unique: false,
                workersRequired: 2,
                maxLevel: 2,
                upgradeCost: { money: 30, steel: 45 },
                description: 'Защита территории. +3 очка обороны/ход. Требует 2 солдат из населения. Уровень 2: +6 обороны/ход (за 30 монет и 45 стали).'
            },
            mine: {
                name: 'Шахта',
                icon: '⛏️',
                cost: { money: 35 },
                production: { money: 5 },
                turnsToComplete: 2,
                allowedTiles: ['mountain'],
                unique: false,
                workersRequired: 2,
                maxLevel: 2,
                upgradeCost: { money: 60 },
                levelWorkersMax: { 1: 2, 2: 3 },
                mineModes: ['gold', 'iron', 'copper', 'coal'],
                mineModeNames: { gold: 'Золото', iron: 'Железо', copper: 'Медь', coal: 'Уголь' },
                mineModeIcons: { gold: '💰', iron: '⛓️', copper: '🔶', coal: '⚫' },
                mineModeProduction: { gold: { money: 5 }, iron: { iron: 3 }, copper: { copper: 3 }, coal: { coal: 3 } },
                description: 'Только в горах. Добывает золото, железо или медь. Переключайте режим в панели здания. Требует 2 шахтёров. Уровень 2: можно нанять 3-го шахтёра, +25% добычи за каждого работника сверх двух.'
            },
            factory: {
                name: 'Завод',
                icon: '🏭',
                cost: { money: 120, wood: 20, coal: 30 },
                production: { money: 10 },
                consumption: { iron: 2, copper: 1 },
                turnsToComplete: 3,
                allowedTiles: ['plain', 'fertile'],
                unique: false,
                workersRequired: 3,
                workersMax: 6,
                maxLevel: 2,
                upgradeCost: { money: 200, iron: 10 },
                factoryModes: ['goods', 'steel'],
                factoryModeNames: { goods: 'Товары', steel: 'Сталь' },
                factoryModeIcons: { goods: '📦', steel: '🔩' },
                factoryModeProduction: {
                    goods: { money: 10 },
                    steel: { steel: 1 }
                },
                factoryModeConsumption: {
                    goods: { iron: 2, copper: 1 },
                    steel: { iron: 3, coal: 2 }
                },
                description: 'Промышленное производство. Постройка требует 30 угля. Режим «Товары»: потребляет 2 железа и 1 медь/ход → 10 монет/ход. Режим «Сталь» (ур.2): 3 железа + 2 уголь → 1 сталь/ход. До 6 рабочих: каждый доп. рабочий сверх 3 даёт +33% эффективности (макс ×2). Требует минимум 3 рабочих.'
            },
            warehouse: {
                name: 'Склад',
                icon: '📦',
                cost: { money: 60, wood: 15 },
                production: {},
                turnsToComplete: 2,
                allowedTiles: ['sand','plain', 'fertile'],
                unique: false,
                description: 'Увеличивает максимальный запас ресурсов. Строится на равнинах, плодородной почве и песке.'
            },
            sawmill: {
                name: 'Лесопилка',
                icon: '🌲',
                cost: { money: 40 },
                production: { wood: 3 },
                turnsToComplete: 2,
                allowedTiles: ['plain', 'fertile'],
                unique: false,
                workersRequired: 1,
                description: 'Производит 3 дерева/ход (6 на плодородной почве). Требует 1 рабочего. Строится только на равнинах и плодородной почве.'
            },
            smelter: {
                name: 'Плавильня',
                icon: '🔥',
                cost: { money: 55 },
                production: { coal: 1 },
                consumption: { wood: 3 },
                turnsToComplete: 2,
                allowedTiles: ['sand','plain', 'fertile','mountain'],
                unique: false,
                workersRequired: 1,
                description: 'Перерабатывает 3 дерева → 1 уголь/ход. Требует 1 рабочего.'
            },
            port: {
                name: 'Порт',
                icon: '⚓',
                cost: { money: 45 },
                production: {},
                turnsToComplete: 2,
                allowedTiles: ['sand'],
                unique: false,
                workersRequired: 1,
                workersMax: 2,
                maxLevel: 2,
                upgradeCost: { money: 10, wood: 20 },
                portModes: ['fishing', 'trade'],
                portModeNames: { fishing: 'Рыбалка', trade: 'Торговля' },
                portModeIcons: { fishing: '🎣', trade: '🚢' },
                portModeProduction: {
                    fishing: {},   // handled dynamically (1 worker=2fish, 2 workers=5fish)
                    trade:   { fish: 1, money: 3 }
                },
                description: 'Только на песке. Режим «Рыбалка»: 1 рабочий = 2 рыбы/ход, 2 рабочих = 5 рыб/ход. Режим «Торговля» (ур.2): +1 рыба и +3 монеты/ход независимо от числа рыбаков. Уровень 2: 10 монет + 20 дерева.'
            },
            local_admin: {
                name: 'Местная администрация',
                icon: '🏢',
                cost: { money: 0 },  // Dynamic cost: count * 500
                production: {},
                turnsToComplete: 5,
                allowedTiles: ['sand','plain', 'fertile'],
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
            cherry:     { icon: '🍒', name: 'Вишня',    color: '#ef44bc' },
            fish:       { icon: '🐟', name: 'Рыба',      color: '#38bdf8' },
            iron:       { icon: '⛓️', name: 'Железо',    color: '#94a3b8' },
            copper:     { icon: '🔶', name: 'Медь',      color: '#b45309' },
            coal:       { icon: '⚫', name: 'Уголь',     color: '#374151' },
            steel:      { icon: '🔩', name: 'Сталь',     color: '#9ca3af' },
            wood:       { icon: '🟫', name: 'Дерево',    color: '#a16207' },
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
        /** How far another market must be to NOT cause income penalty */
        MARKET_COMPETITION_RADIUS: 4,
        /** Max residents in the townhall */
        TOWNHALL_MAX_RESIDENTS: 5,
        /** Minimum population required to build a market */
        MARKET_MIN_POPULATION: 5,

        // ─── Difficulty presets ──────────────────────────────
        DIFFICULTY: {
            easy: {
                money: 100, wheat: 10, bread: 16, apples: 5, fish: 5,
                iron: 20, copper: 20, coal: 15, steel: 5, wood: 30, population: 8
            },
            normal: {
                money: 50, wheat: 0, bread: 9, apples: 0, fish: 0,
                iron: 0, copper: 0, coal: 0, steel: 0, wood: 0, population: 3
            },
            hard: {
                money: 25, wheat: 0, bread: 4, apples: 0, fish: 0,
                iron: 0, copper: 0, coal: 0, steel: 0, wood: 0, population: 2
            }
        }
    };
})();

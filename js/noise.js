(function() {
    'use strict';
    window.Noise = {
        noise2D: function(x, y) {
            const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            return n - Math.floor(n);
        },
        smoothNoise: function(x, y) {
            const ix = Math.floor(x), iy = Math.floor(y);
            const fx = x - ix, fy = y - iy;
            const a = this.noise2D(ix, iy);
            const b = this.noise2D(ix + 1, iy);
            const c = this.noise2D(ix, iy + 1);
            const d = this.noise2D(ix + 1, iy + 1);
            const u = fx * fx * (3 - 2 * fx);
            const v = fy * fy * (3 - 2 * fy);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        },
        fbm: function(x, y, octaves) {
            let val = 0, amp = 0.5, freq = 1;
            for (let i = 0; i < octaves; i++) {
                val += amp * this.smoothNoise(x * freq, y * freq);
                amp *= 0.5;
                freq *= 2;
            }
            return val;
        }
    };
})();

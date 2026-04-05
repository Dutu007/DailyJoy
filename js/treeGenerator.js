window.TreeGenerator = {
    getSeedFromDate(dateStr) {
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) {
            hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
    },

    seededRandom(seedObj) {
        let x = Math.sin(seedObj.seed++) * 10000;
        return x - Math.floor(x);
    },

    drawTree(canvas, options) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // 适配高清屏幕
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width || canvas.width || 300;
        const height = rect.height || canvas.height || 300;
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const { dateStr, mood, completionRate, isMini } = options;
        
        // 如果没有任何记录（没有心情），画一颗小小的种子/芽
        if (!mood) {
            this.drawSprout(ctx, width, height);
            return;
        }

        // 使用日期作为种子，保证同一天的树长得一模一样
        const seedObj = { seed: this.getSeedFromDate(dateStr || 'default') };

        // 不同的心情对应不同的叶子颜色体系
        const colors = {
            'happy': ['#4ade80', '#22c55e', '#16a34a', '#86efac'], // 充满生机的绿色
            'calm': ['#60a5fa', '#3b82f6', '#2563eb', '#93c5fd'], // 宁静的蓝色
            'anxious': ['#facc15', '#eab308', '#ca8a04', '#fde047'], // 焦虑的黄色/秋叶
            'sad': ['#c084fc', '#a855f7', '#9333ea', '#d8b4fe'], // 忧郁的紫色
            'angry': ['#f87171', '#ef4444', '#dc2626', '#fca5a5']  // 暴躁的红色
        };
        const leafColors = colors[mood] || ['#9ca3af', '#6b7280']; // 默认灰色
        const trunkColor = '#5c4033'; // 树干棕色

        // 树的茂密程度由打卡完成率决定
        const maxDepth = isMini ? 4 : 7; // 小树层级少，大树层级多
        const leafDensity = 0.2 + (completionRate * 0.8); // 基础密度0.2，满完成率1.0

        // 递归画树枝
        const branch = (x, y, length, angle, depth, branchWidth) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            const endX = x + length * Math.cos(angle);
            const endY = y + length * Math.sin(angle);
            
            ctx.lineCap = 'round';
            ctx.lineWidth = branchWidth;
            ctx.strokeStyle = trunkColor;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // 在枝丫末端画叶子
            if (depth <= 2) {
                if (this.seededRandom(seedObj) < leafDensity) {
                    const leafSize = isMini ? (3 + this.seededRandom(seedObj)*2) : (6 + this.seededRandom(seedObj) * 6);
                    ctx.beginPath();
                    ctx.arc(endX, endY, leafSize, 0, 2 * Math.PI);
                    ctx.fillStyle = leafColors[Math.floor(this.seededRandom(seedObj) * leafColors.length)];
                    ctx.globalAlpha = 0.85;
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            }
            
            if (depth === 0) return;
            
            // 决定分叉数量
            const numBranches = isMini ? 2 : (this.seededRandom(seedObj) > 0.2 ? 3 : 2);
            for (let i = 0; i < numBranches; i++) {
                // 分叉角度变化
                const angleVariation = (this.seededRandom(seedObj) * 1.0) - 0.5;
                const newAngle = angle + angleVariation;
                // 长度递减
                const lengthReduction = 0.65 + (this.seededRandom(seedObj) * 0.15);
                const newLength = length * lengthReduction;
                branch(endX, endY, newLength, newAngle, depth - 1, branchWidth * 0.7);
            }
        };

        // 画一个底部的小土包
        ctx.beginPath();
        ctx.ellipse(width/2, height, width*0.3, isMini? 5: 10, 0, 0, Math.PI*2);
        ctx.fillStyle = '#f3f4f6'; // 浅灰色土包
        ctx.fill();

        // 开始画树干
        const startLength = height * 0.25;
        const startWidth = isMini ? 4 : 14;
        branch(width / 2, height - (isMini? 2: 5), startLength, -Math.PI / 2, maxDepth, startWidth);
    },

    drawSprout(ctx, width, height) {
        // 画土包
        ctx.beginPath();
        ctx.ellipse(width/2, height, width*0.3, 10, 0, 0, Math.PI*2);
        ctx.fillStyle = '#f3f4f6';
        ctx.fill();

        // 画小芽
        ctx.beginPath();
        ctx.moveTo(width / 2, height - 5);
        ctx.quadraticCurveTo(width / 2 - 5, height - 20, width / 2, height - 25);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#22c55e';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(width / 2 - 4, height - 25, 4, 0, 2*Math.PI);
        ctx.fillStyle = '#4ade80';
        ctx.fill();
    }
};
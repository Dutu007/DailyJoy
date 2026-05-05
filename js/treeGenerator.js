window.TreeGenerator = {
    getSeedFromDate(dateStr) {
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) {
            hash = dateStr.charCodeAt(i) + ((hash << 5) - hash;
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

        // 不同的心情对应不同的叶子颜色体系，更丰富的色彩层次
        const colors = {
            'happy': ['#86efac', '#4ade80', '#22c55e', '#16a34a', '#bef264', '#a3e635'], // 充满生机的绿色系
            'calm': ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#a5b4fc'], // 宁静的蓝色系
            'anxious': ['#fef3c7', '#fde68a', '#facc15', '#eab308', '#ca8a04', '#fb923c'], // 温暖的黄色橙色系
            'sad': ['#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#c4b5fd'], // 梦幻的紫色系
            'angry': ['#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#fca3a5']  // 温暖的红色粉色系
        };
        const leafColors = colors[mood] || ['#9ca3af', '#6b7280']; // 默认灰色
        const trunkColors = ['#8b5a2b', '#704214', '#5c4033', '#4a3520']; // 树干颜色数组，增加自然变化

        // 树的茂密程度由打卡完成率决定，更流畅的过渡
        const maxDepth = isMini ? 5 : 8; // 增加深度
        const leafDensity = 0.15 + (completionRate * 0.85);

        // 递归画树枝
        const branch = (x, y, length, angle, depth, branchWidth) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            const endX = x + length * Math.cos(angle);
            const endY = y + length * Math.sin(angle);
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = branchWidth;
            // 随机选择树干颜色，增加自然感
            const trunkColor = trunkColors[Math.floor(this.seededRandom(seedObj) * trunkColors.length)];
            ctx.strokeStyle = trunkColor;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // 在枝丫末端和中途都画叶子，让树更饱满
            if (depth <= 3) {
                const randomVal = this.seededRandom(seedObj);
                if (randomVal < leafDensity) {
                    // 画更多样化的叶子形状和大小
                    const baseLeafSize = isMini ? (2.5 + this.seededRandom(seedObj) * 3.5) : (5 + this.seededRandom(seedObj) * 7);
                    const leafSize = baseLeafSize * (0.6 + (completionRate * 0.6)); // 完成率影响叶子大小
                    
                    // 画圆形叶子
                    ctx.beginPath();
                    ctx.arc(endX, endY, leafSize, 0, 2 * Math.PI);
                    const leafColor = leafColors[Math.floor(this.seededRandom(seedObj) * leafColors.length)];
                    ctx.globalAlpha = 0.8 + this.seededRandom(seedObj) * 0.2;
                    ctx.fillStyle = leafColor;
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            }
            
            if (depth === 0) return;
            
            // 决定分叉数量
            const numBranches = isMini ? 2 : (this.seededRandom(seedObj) > 0.15 ? 3 : 2);
            for (let i = 0; i < numBranches; i++) {
                // 分叉角度变化更大，树形状更多样
                const angleVariation = (this.seededRandom(seedObj) * 1.4) - 0.7;
                const newAngle = angle + angleVariation;
                // 长度递减，带更多变化
                const lengthReduction = 0.6 + (this.seededRandom(seedObj) * 0.2);
                const newLength = length * lengthReduction;
                branch(endX, endY, newLength, newAngle, depth - 1, branchWidth * 0.72);
            }
        };

        // 画草地，更柔和
        const groundY = height - (isMini ? 3 : 8);
        
        // 画渐变草地（多层叠加增加层次感
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            const grassHeight = isMini ? 4 + i * 1.5 : 8 + i * 3;
            ctx.ellipse(width / 2, groundY + i, width * 0.32, grassHeight, 0, 0, Math.PI * 2);
            const grassColors = ['#e5e7eb', '#f3f4f6', '#f9fafb'];
            ctx.fillStyle = grassColors[i];
            ctx.fill();
        }

        // 开始画树干
        const startLength = height * (isMini ? 0.28 : 0.26);
        const startWidth = isMini ? 3.5 : 12;
        branch(width / 2, groundY, startLength, -Math.PI / 2, maxDepth, startWidth);
    },

    drawSprout(ctx, width, height) {
        // 画草地（柔和的草地）
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            const grassHeight = 4 + i * 1.5;
            ctx.ellipse(width / 2, height - 3 + i, width * 0.3, grassHeight, 0, 0, Math.PI * 2);
            const grassColors = ['#e5e7eb', '#f3f4f6', '#f9fafb'];
            ctx.fillStyle = grassColors[i];
            ctx.fill();
        }

        // 画小芽（更可爱的小芽）
        ctx.beginPath();
        ctx.moveTo(width / 2, height - 5);
        ctx.quadraticCurveTo(width / 2 - 4, height - 18, width / 2, height - 23);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#22c55e';
        ctx.stroke();

        // 左边小叶子
        ctx.beginPath();
        ctx.arc(width / 2 - 5, height - 23, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#86efac';
        ctx.fill();

        // 右边小叶子
        ctx.beginPath();
        ctx.arc(width / 2 + 4, height - 20, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#4ade80';
        ctx.fill();
    }
};
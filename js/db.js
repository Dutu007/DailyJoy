// Supabase 配置
// TODO: 替换为你自己的 Supabase 项目 URL 和 Anon Key
const SUPABASE_URL = 'https://qtlfncrljzuipahdvmnz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bGZuY3Jsanp1aXBhaGR2bW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NjQ2MDUsImV4cCI6MjA5MDM0MDYwNX0.ucCdK8vIEDajGaRSgW2FjbbFeaitaHD6jbuFBZGidHM';

// 初始化 Supabase 客户端 (改名为 supabaseClient 避免与全局变量 window.supabase 冲突)
const supabaseClient = (SUPABASE_URL && SUPABASE_KEY && window.supabase) 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
    : null;

if (!supabaseClient) {
    console.warn('⚠️ 未配置 Supabase，当前使用 LocalStorage 模拟数据库与登录（刷新不丢失）。\n请在 js/db.js 中填入你的 Supabase Key 以开启多端同步。');
}

// 统一的数据库与鉴权服务封装
const DB = {
    // 模拟网络延迟
    delay: (ms) => new Promise(res => setTimeout(ms, res)),
    
    async login(email, password) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw new Error(error.message);
            return data.user;
        } else {
            // 降级：使用 LocalStorage 模拟
            await this.delay(600); 
            const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
            if (users[email] && users[email] === password) {
                localStorage.setItem('mock_session', email);
                return { email };
            }
            throw new Error('邮箱或密码错误 (本地模拟)');
        }
    },
    
    async register(email, password) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw new Error(error.message);
            return data.user;
        } else {
            // 降级：使用 LocalStorage 模拟
            await this.delay(600);
            const users = JSON.parse(localStorage.getItem('mock_users') || '{}');
            if (users[email]) throw new Error('用户已存在');
            users[email] = password;
            localStorage.setItem('mock_users', JSON.stringify(users));
            localStorage.setItem('mock_session', email);
            return { email };
        }
    },

    async logout() {
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        } else {
            await this.delay(300);
            localStorage.removeItem('mock_session');
        }
    },

    async getUser() {
        if (supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            return session ? session.user : null;
        } else {
            const email = localStorage.getItem('mock_session');
            return email ? { id: 'mock-user-id', email } : null;
        }
    },

    // ==========================================
    // 业务数据接口 (Habits & Daily Records)
    // ==========================================

    // 1. 获取习惯列表
    async getHabits(userId) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('habits')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: true });
            
            if (error) throw new Error(error.message);
            return data;
        }
        return JSON.parse(localStorage.getItem('mock_habits') || '[]');
    },

    // 2. 初始化默认习惯 (如果新用户没有习惯)
    async initDefaultHabits(userId) {
        const defaults = [
            { user_id: userId, name: '喝水 8 杯', icon: '💧', frequency_type: 'daily' },
            { user_id: userId, name: '阅读 30 分钟', icon: '📚', frequency_type: 'daily' },
            { user_id: userId, name: '早起', icon: '☀️', frequency_type: 'daily' }
        ];
        
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('habits')
                .insert(defaults)
                .select();
            if (error) {
                console.error("初始化习惯失败:", error);
                throw new Error("初始化习惯失败: " + error.message);
            }
            return data;
        }
        
        const mockData = defaults.map((d, i) => ({ ...d, id: 'mock-habit-' + i }));
        localStorage.setItem('mock_habits', JSON.stringify(mockData));
        return mockData;
    },

    // 2.5 添加单个新习惯
    async addHabit(userId, name, icon, frequencyType = 'daily', frequencyDays = [], frequencyInterval = 1) {
        const habitData = { 
            user_id: userId, 
            name, 
            icon,
            frequency_type: frequencyType,
            frequency_days: frequencyDays,
            frequency_interval: frequencyInterval
        };

        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('habits')
                .insert([habitData])
                .select()
                .single();
            if (error) throw new Error(error.message);
            return data;
        }
        
        const mockNew = { id: 'mock-' + Date.now(), ...habitData, created_at: new Date().toISOString() };
        const existing = JSON.parse(localStorage.getItem('mock_habits') || '[]');
        existing.push(mockNew);
        localStorage.setItem('mock_habits', JSON.stringify(existing));
        return mockNew;
    },

    // 3. 获取某一天的记录 (心情 + 已完成的习惯)
    async getDailyRecord(userId, dateStr) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('daily_records')
                .select('*')
                .eq('user_id', userId)
                .eq('date', dateStr)
                .single(); // 获取单条
            
            // PostgREST 在查不到单条数据时会报错 PGRST116，这不是系统错误，只是没数据
            if (error && error.code !== 'PGRST116') throw new Error(error.message);
            return data || null;
        }
        const records = JSON.parse(localStorage.getItem('mock_records') || '{}');
        return records[`${userId}_${dateStr}`] || null;
    },

    // 4. 保存/更新某天的记录
    async upsertDailyRecord(userId, dateStr, mood, completedHabitIds) {
        if (supabaseClient) {
            // 先尝试获取今天的记录看是否存在
            const { data: existing } = await supabaseClient
                .from('daily_records')
                .select('id, diary')
                .eq('user_id', userId)
                .eq('date', dateStr)
                .single();

            const payload = {
                user_id: userId,
                date: dateStr,
                mood: mood,
                completed_habits: completedHabitIds
            };

            let result;
            if (existing) {
                // 更新，不覆盖 diary
                result = await supabaseClient
                    .from('daily_records')
                    .update(payload)
                    .eq('id', existing.id);
            } else {
                // 插入
                result = await supabaseClient
                    .from('daily_records')
                    .insert([payload]);
            }
            if (result.error) throw new Error(result.error.message);
            return true;
        }

        const records = JSON.parse(localStorage.getItem('mock_records') || '{}');
        const key = `${userId}_${dateStr}`;
        records[key] = records[key] || {};
        records[key].mood = mood;
        records[key].completed_habits = completedHabitIds;
        localStorage.setItem('mock_records', JSON.stringify(records));
        return true;
    },

    // 4.5 保存/更新某天的日记
    async updateDiary(userId, dateStr, diaryText) {
        if (supabaseClient) {
            const { data: existing } = await supabaseClient
                .from('daily_records')
                .select('id')
                .eq('user_id', userId)
                .eq('date', dateStr)
                .single();

            let result;
            if (existing) {
                result = await supabaseClient
                    .from('daily_records')
                    .update({ diary: diaryText })
                    .eq('id', existing.id);
            } else {
                result = await supabaseClient
                    .from('daily_records')
                    .insert([{ user_id: userId, date: dateStr, diary: diaryText }]);
            }
            if (result.error) throw new Error(result.error.message);
            return true;
        }
        
        const records = JSON.parse(localStorage.getItem('mock_records') || '{}');
        const key = `${userId}_${dateStr}`;
        records[key] = records[key] || {};
        records[key].diary = diaryText;
        localStorage.setItem('mock_records', JSON.stringify(records));
        return true;
    },

    // 5. 获取某个月的所有打卡记录 (用于渲染日历心情颜色)
    async getMonthlyRecords(userId, year, month) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]; // 当月最后一天

        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('daily_records')
                .select('date, mood, completed_habits')
                .eq('user_id', userId)
                .gte('date', startDate)
                .lte('date', endDate);
            
            if (error) throw new Error(error.message);
            
            // 为了让当天的打卡能立刻反映在森林里，即使还没有同步到数据库
            // 我们可以在这里尝试合并一下本地今天的状态（如果今天的记录还没上去）
            const todayStr = new Date().toISOString().split('T')[0];
            const hasTodayInDb = data.some(r => r.date === todayStr);
            if (!hasTodayInDb) {
                // 去查一下本地是不是有今天的缓存
                const records = JSON.parse(localStorage.getItem('mock_records') || '{}');
                const key = `${userId}_${todayStr}`;
                if (records[key] && records[key].mood) {
                    data.push({
                        date: todayStr,
                        mood: records[key].mood,
                        completed_habits: records[key].completed_habits || []
                    });
                }
            }
            
            return data || [];
        }
        
        const records = JSON.parse(localStorage.getItem('mock_records') || '{}');
        const results = [];
        Object.keys(records).forEach(key => {
            const prefix = `${userId}_${year}-${String(month).padStart(2, '0')}`;
            if (key.startsWith(prefix)) {
                results.push({ 
                    date: key.split('_')[1], 
                    mood: records[key].mood,
                    completed_habits: records[key].completed_habits || []
                });
            }
        });
        return results;
    },

    // ==========================================
    // 日程安排接口 (Schedules)
    // ==========================================

    // 6. 获取指定日期范围内的日程
    async getSchedules(userId, startDateStr, endDateStr) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('schedules')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startDateStr)
                .lte('date', endDateStr)
                .order('date', { ascending: true })
                .order('created_at', { ascending: true });
            
            if (error) throw new Error(error.message);
            return data || [];
        }
        return [];
    },

    // 7. 添加日程
    async addSchedule(userId, dateStr, title) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('schedules')
                .insert([{ user_id: userId, date: dateStr, title: title, is_completed: false }])
                .select()
                .single();
            
            if (error) throw new Error(error.message);
            return data;
        }
        return { id: 'mock-' + Date.now(), user_id: userId, date: dateStr, title, is_completed: false };
    },

    // 8. 切换日程完成状态
    async toggleScheduleStatus(scheduleId, isCompleted) {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('schedules')
                .update({ is_completed: isCompleted })
                .eq('id', scheduleId);
            
            if (error) throw new Error(error.message);
            return true;
        }
        return true;
    },

    // 9. 删除日程
    async deleteSchedule(scheduleId) {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('schedules')
                .delete()
                .eq('id', scheduleId);
            
            if (error) throw new Error(error.message);
            return true;
        }
        return true;
    }
};

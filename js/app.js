const { createApp, ref, computed, onMounted } = Vue;

const app = createApp({
    setup() {
        // --- 鉴权与用户状态 ---
        const isLoggedIn = ref(false);
        const isRegistering = ref(false);
        const isLoading = ref(false);
        const currentUser = ref(null);
        const authForm = ref({ email: '', password: '' });

        // 获取今天日期的标准字符串 (YYYY-MM-DD)
        const getTodayStr = () => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        };

        // 加载用户数据核心逻辑
        const loadUserData = async () => {
            if (!currentUser.value) return;
            try {
                // 1. 加载习惯
                let userHabits = await DB.getHabits(currentUser.value.id);
                if (userHabits.length === 0) {
                    userHabits = await DB.initDefaultHabits(currentUser.value.id);
                }
                
                // 2. 加载今天的打卡记录
                const todayRecord = await DB.getDailyRecord(currentUser.value.id, getTodayStr());
                
                // 3. 合并状态
                if (todayRecord) {
                    selectedMood.value = todayRecord.mood;
                    const completedIds = todayRecord.completed_habits || [];
                    habits.value = userHabits.map(h => ({
                        ...h,
                        completed: completedIds.includes(h.id)
                    }));
                } else {
                    selectedMood.value = null;
                    habits.value = userHabits.map(h => ({ ...h, completed: false }));
                }

                // 4. 加载日程 (刷新当前日历)
                await initCalendar(currentViewDate.value.getFullYear(), currentViewDate.value.getMonth() + 1);
                await initScheduleCalendar(currentScheduleCalendarDate.value.getFullYear(), currentScheduleCalendarDate.value.getMonth() + 1);
                
                // 确保树重新渲染
                if (currentTab.value === 'tree') {
                    if (treeViewMode.value === 'today') {
                        Vue.nextTick(() => renderTodayTree());
                    } else if (treeViewMode.value === 'forest') {
                        initForest(currentForestDate.value.getFullYear(), currentForestDate.value.getMonth() + 1);
                    }
                }
            } catch (error) {
                console.error('加载用户数据失败:', error);
            }
        };

        const checkAuth = async () => {
            const user = await DB.getUser();
            if (user) {
                currentUser.value = user;
                isLoggedIn.value = true;
                loadUserData(); // 登录成功后加载数据
            }
        };

        const handleAuth = async () => {
            if (!authForm.value.email || !authForm.value.password) {
                alert('请填写邮箱和密码');
                return;
            }
            isLoading.value = true;
            try {
                if (isRegistering.value) {
                    const user = await DB.register(authForm.value.email, authForm.value.password);
                    currentUser.value = user;
                    isLoggedIn.value = true;
                } else {
                    const user = await DB.login(authForm.value.email, authForm.value.password);
                    currentUser.value = user;
                    isLoggedIn.value = true;
                }
                loadUserData(); // 登录注册成功后加载数据
            } catch (error) {
                alert(error.message || '操作失败，请检查邮箱或密码');
            } finally {
                isLoading.value = false;
            }
        };

        const handleLogout = async () => {
            await DB.logout();
            isLoggedIn.value = false;
            currentUser.value = null;
            authForm.value.password = ''; // 清空密码，保留邮箱方便再次登录
        };

        // --- 导航与视图 ---
        const currentTab = ref('home');

        // --- 日期展示 ---
        const currentDateStr = ref('');
        const updateDate = () => {
            const now = new Date();
            const month = now.getMonth() + 1;
            const day = now.getDate();
            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekDay = weekDays[now.getDay()];
            currentDateStr.value = `${month}月${day}日 星期${weekDay}`;
        };

        // --- 模块 1：心情数据 ---
        const selectedMood = ref(null);
        const moods = [
            { id: 'happy', emoji: '😄', label: '开心', activeClass: 'bg-green-100 text-green-700', textColor: 'text-green-700' },
            { id: 'calm', emoji: '😌', label: '平静', activeClass: 'bg-blue-100 text-blue-700', textColor: 'text-blue-700' },
            { id: 'anxious', emoji: '😰', label: '焦虑', activeClass: 'bg-yellow-100 text-yellow-700', textColor: 'text-yellow-700' },
            // 修改点：难过 的颜色改为 紫色 (purple)，与默认灰色区分
            { id: 'sad', emoji: '😢', label: '难过', activeClass: 'bg-purple-100 text-purple-700', textColor: 'text-purple-700' }, 
            { id: 'angry', emoji: '😡', label: '生气', activeClass: 'bg-red-100 text-red-700', textColor: 'text-red-700' }
        ];

        const syncDailyRecord = async () => {
            if (!currentUser.value) return;
            const completedIds = habits.value.filter(h => h.completed).map(h => h.id);
            try {
                await DB.upsertDailyRecord(currentUser.value.id, getTodayStr(), selectedMood.value, completedIds);
            } catch (error) {
                console.error('同步打卡记录失败:', error);
            }
        };

        const selectMood = (id) => {
            selectedMood.value = id;
            syncDailyRecord(); // 选中心情即刻同步
            if (currentTab.value === 'tree') {
                if (treeViewMode.value === 'today') {
                    Vue.nextTick(() => renderTodayTree());
                } else if (treeViewMode.value === 'forest') {
                    initForest(currentForestDate.value.getFullYear(), currentForestDate.value.getMonth() + 1);
                }
            }
        };

        // --- 模块 2：习惯打卡数据 ---
        const habits = ref([]);

        // 判断一个习惯今天是否需要打卡
        const isHabitDueToday = (habit) => {
            const today = new Date();
            const freqType = habit.frequency_type || 'daily';
            
            if (freqType === 'daily') return true;
            
            if (freqType === 'weekly') {
                const currentDayOfWeek = today.getDay(); // 0 是周日, 1 是周一...
                const days = habit.frequency_days || [];
                return days.includes(currentDayOfWeek);
            }
            
            if (freqType === 'interval') {
                if (!habit.created_at) return true; // 兼容旧数据
                
                // 找到从创建日期开始，最近一个需要打卡的日子
                // 如果今天大于等于那个日子，就需要打卡
                const createdDate = new Date(habit.created_at);
                createdDate.setHours(0,0,0,0);
                
                // 这里我们简化逻辑：计算距离创建日期的天数，看是否是 interval 的整数倍
                const diffTime = today.setHours(0,0,0,0) - createdDate.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const interval = habit.frequency_interval || 1;
                
                // 只要 diffDays % interval === 0 就在今天展示
                // 进一步的“若当天未打卡则延期”需要在后端存上次打卡时间，为了MVP这里我们用取余简单实现“每几天展示一次”
                return diffDays >= 0 && (diffDays % interval === 0);
            }
            return true;
        };

        const todayHabits = computed(() => {
            return habits.value.filter(h => isHabitDueToday(h));
        });

        const completedHabitsCount = computed(() => {
            return todayHabits.value.filter(h => h.completed).length;
        });

        const toggleHabit = (id) => {
            const habit = habits.value.find(h => h.id === id);
            if (habit) {
                habit.completed = !habit.completed;
                if (currentTab.value === 'tree') {
                    if (treeViewMode.value === 'today') {
                        Vue.nextTick(() => renderTodayTree()); // 打卡状态改变，重新渲染树
                    } else if (treeViewMode.value === 'forest') {
                        initForest(currentForestDate.value.getFullYear(), currentForestDate.value.getMonth() + 1);
                    }
                }
                syncDailyRecord(); // 习惯改变即刻同步
            }
        };

        const isAddingHabit = ref(false);
        const newHabitName = ref('');
        const newHabitIcon = ref('');
        const newHabitFrequencyType = ref('daily');
        const newHabitWeekDays = ref([]);
        const newHabitIntervalDays = ref(1);

        const toggleNewHabitWeekDay = (dayIndex) => {
            const idx = newHabitWeekDays.value.indexOf(dayIndex);
            if (idx > -1) {
                newHabitWeekDays.value.splice(idx, 1);
            } else {
                newHabitWeekDays.value.push(dayIndex);
            }
        };

        const cancelAddHabit = () => {
            isAddingHabit.value = false;
            newHabitName.value = '';
            newHabitIcon.value = '';
            newHabitFrequencyType.value = 'daily';
            newHabitWeekDays.value = [];
            newHabitIntervalDays.value = 1;
        };

        const submitNewHabit = async () => {
            if (!newHabitName.value.trim() || !currentUser.value) return;
            if (newHabitFrequencyType.value === 'weekly' && newHabitWeekDays.value.length === 0) {
                alert('请至少选择一天');
                return;
            }
            try {
                const icon = newHabitIcon.value.trim() || '🌱';
                const newHabit = await DB.addHabit(
                    currentUser.value.id, 
                    newHabitName.value, 
                    icon,
                    newHabitFrequencyType.value,
                    newHabitWeekDays.value,
                    newHabitIntervalDays.value
                );
                
                // 将新习惯加入列表
                const addedData = Array.isArray(newHabit) ? newHabit[0] : newHabit;
                habits.value.push({ ...addedData, completed: false });
                
                // 重置状态
                cancelAddHabit();
                
                // 更新树
                if (currentTab.value === 'tree' && treeViewMode.value === 'today') {
                    Vue.nextTick(() => renderTodayTree());
                }
            } catch (error) {
                console.error('添加习惯失败:', error);
                alert('添加习惯失败: ' + error.message);
            }
        };

        // --- 模块 3：日程安排 (Schedule) ---
        const showAddSchedule = ref(false);
        const newScheduleTitle = ref('');
        const newScheduleDate = ref('');
        const isAddingSchedule = ref(false);
        const selectedScheduleDate = ref(null); 
        const specificDaySchedules = ref([]); 

        // 跨月日历状态
        const scheduleCalendarYearMonth = ref('');
        const scheduleCalendarGrid = ref([]);
        const currentScheduleCalendarDate = ref(new Date());
        
        // 全局已加载的日程标记 (用于显示小圆点: { '2023-10-25': true })
        const schedulesDotMap = ref({});

        const changeScheduleMonth = (delta) => {
            currentScheduleCalendarDate.value.setMonth(currentScheduleCalendarDate.value.getMonth() + delta);
            initScheduleCalendar(currentScheduleCalendarDate.value.getFullYear(), currentScheduleCalendarDate.value.getMonth() + 1);
        };

        const initScheduleCalendar = async (year, month) => {
            const d = new Date(year, month - 1, 1);
            scheduleCalendarYearMonth.value = `${year}年${month}月`;
            
            const firstDay = d.getDay();
            const daysInMonth = new Date(year, month, 0).getDate();
            const todayStr = getTodayStr();
            
            const days = [];
            for (let i = 0; i < firstDay; i++) days.push(null);
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                days.push({
                    date: i,
                    dateStr: dateStr,
                    isToday: dateStr === todayStr,
                    hasSchedule: !!schedulesDotMap.value[dateStr],
                    schedules: [] // 新增: 存储当天的具体日程数据，用于在网格中显示文字
                });
            }
            scheduleCalendarGrid.value = days;
            
            // 异步拉取这个月的日程数据以更新内容
            if (currentUser.value) {
                const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
                const endDate = new Date(year, month, 0).toISOString().split('T')[0];
                try {
                    const monthSchedules = await DB.getSchedules(currentUser.value.id, startDate, endDate);
                    monthSchedules.forEach(s => {
                        if (!s.is_completed) schedulesDotMap.value[s.date] = true;
                    });
                    
                    // 重新映射状态和具体日程内容
                    scheduleCalendarGrid.value.forEach(day => {
                        if (day) {
                            day.hasSchedule = !!schedulesDotMap.value[day.dateStr];
                            // 过滤出当天的日程，为了美观，网格里最多只显示 2 条
                            day.schedules = monthSchedules.filter(s => s.date === day.dateStr && !s.is_completed).slice(0, 2);
                        }
                    });
                } catch (error) {
                    console.error("拉取月度日程分布失败", error);
                }
            }
        };

        const selectedScheduleDateStr = computed(() => {
            if (!selectedScheduleDate.value) return '';
            const [y, m, d] = selectedScheduleDate.value.split('-');
            return `${m}月${d}日 安排`;
        });

        // 切换到单日视图
        const selectSpecificScheduleDate = async (dateStr) => {
            selectedScheduleDate.value = dateStr;
            newScheduleDate.value = dateStr; // 新增日程默认到这一天
            
            // 每次点击都清空旧数据，显示加载状态
            specificDaySchedules.value = [];
            
            if (currentUser.value) {
                try {
                    const schedules = await DB.getSchedules(currentUser.value.id, dateStr, dateStr);
                    specificDaySchedules.value = schedules;
                } catch (error) {
                    console.error("加载单日日程失败", error);
                }
            }
        };
        
        // --- 模块 4：心情日历 (Mood Calendar) ---
        const currentYearMonth = ref('');
        const calendarDays = ref([]);
        const selectedCalendarDate = ref(null);
        const currentDiaryText = ref('');
        const isSavingDiary = ref(false);
        const diarySaved = ref(false);
        let diarySaveTimeout = null;

        const formatSelectedCalendarDate = computed(() => {
            if (!selectedCalendarDate.value) return '';
            const [y, m, d] = selectedCalendarDate.value.split('-');
            return `${m}月${d}日`;
        });

        const selectCalendarDate = async (dateStr) => {
            selectedCalendarDate.value = dateStr;
            currentDiaryText.value = ''; // 清空加载中
            diarySaved.value = false;
            if (currentUser.value) {
                try {
                    const record = await DB.getDailyRecord(currentUser.value.id, dateStr);
                    if (record && record.diary) {
                        currentDiaryText.value = record.diary;
                    }
                } catch (error) {
                    console.error("加载日记失败:", error);
                }
            }
        };

        const handleDiaryInput = () => {
            diarySaved.value = false;
            isSavingDiary.value = true;
            if (diarySaveTimeout) clearTimeout(diarySaveTimeout);
            
            diarySaveTimeout = setTimeout(async () => {
                if (currentUser.value && selectedCalendarDate.value) {
                    try {
                        await DB.updateDiary(currentUser.value.id, selectedCalendarDate.value, currentDiaryText.value);
                        diarySaved.value = true;
                    } catch (error) {
                        console.error("保存日记失败:", error);
                    } finally {
                        isSavingDiary.value = false;
                    }
                }
            }, 800); // 停止输入 800ms 后自动保存
        };

        const initCalendar = async (year, month) => {
            const d = new Date(year, month - 1, 1);
            currentYearMonth.value = `${year}年${month}月`;
            
            const firstDay = d.getDay();
            const daysInMonth = new Date(year, month, 0).getDate();
            
            const days = [];
            for (let i = 0; i < firstDay; i++) days.push(null);
            
            const todayStr = getTodayStr();
            const moodColors = {
                'happy': 'bg-green-400 text-white',
                'calm': 'bg-blue-400 text-white',
                'anxious': 'bg-yellow-400 text-white',
                'sad': 'bg-purple-400 text-white',
                'angry': 'bg-red-400 text-white'
            };
            
            // 如果已登录，去云端拉取这个月的心情数据
            let monthRecords = [];
            if (currentUser.value) {
                try {
                    monthRecords = await DB.getMonthlyRecords(currentUser.value.id, year, month);
                } catch (error) {
                    console.error("拉取月度日历失败:", error);
                }
            }
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const record = monthRecords.find(r => r.date === dateStr);
                
                days.push({
                    date: i,
                    dateStr: dateStr,
                    isToday: dateStr === todayStr,
                    moodColor: (record && record.mood) ? moodColors[record.mood] : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                });
            }
            calendarDays.value = days;
        };

        const currentViewDate = ref(new Date());
        const changeMonth = (delta) => {
            currentViewDate.value.setMonth(currentViewDate.value.getMonth() + delta);
            initCalendar(currentViewDate.value.getFullYear(), currentViewDate.value.getMonth() + 1);
        };

        // --- 操作日程 ---
        const addSchedule = async () => {
            if (!newScheduleTitle.value.trim() || !currentUser.value) return;
            isAddingSchedule.value = true;
            
            try {
                const dateStr = newScheduleDate.value;
                const newItem = await DB.addSchedule(currentUser.value.id, dateStr, newScheduleTitle.value);
                
                // 将返回的新数据塞进列表 (如果是数组取第一项)
                const addedData = Array.isArray(newItem) ? newItem[0] : newItem;
                
                // 更新全局圆点状态
                schedulesDotMap.value[dateStr] = true;
                
                // 如果在单日视图中
                if (selectedScheduleDate.value === dateStr) {
                    specificDaySchedules.value.push(addedData);
                }
                
                // 更新日历网格的显示 (圆点和文字)
                scheduleCalendarGrid.value.forEach(day => {
                    if (day && day.dateStr === dateStr) {
                        day.hasSchedule = true;
                        // 动态把新日程加到格子里显示 (最多2条)
                        if (day.schedules.length < 2) {
                            day.schedules.push(addedData);
                        }
                    }
                });
                
                newScheduleTitle.value = '';
                showAddSchedule.value = false;
            } catch (error) {
                console.error("添加日程失败:", error);
                alert("添加日程失败");
            } finally {
                isAddingSchedule.value = false;
            }
        };

        const toggleSchedule = async (item) => {
            const originalStatus = item.is_completed;
            item.is_completed = !item.is_completed; // 乐观更新 UI
            try {
                await DB.toggleScheduleStatus(item.id, item.is_completed);
            } catch (error) {
                item.is_completed = originalStatus; // 回滚
                console.error("更新日程失败:", error);
            }
        };

        const deleteSchedule = async (id) => {
            try {
                await DB.deleteSchedule(id);
                // 更新 UI
                specificDaySchedules.value = specificDaySchedules.value.filter(s => s.id !== id);
                // 建议也从 scheduleCalendarGrid 中移除
                scheduleCalendarGrid.value.forEach(day => {
                    if (day && day.schedules) {
                        day.schedules = day.schedules.filter(s => s.id !== id);
                    }
                });
            } catch (error) {
                console.error("删除日程失败:", error);
            }
        };

        // --- 模块 4：Canvas 成长树可视化 ---
        const treeViewMode = ref('today'); // 'today' | 'forest'
        const moodLabels = {
            'happy': '开心',
            'calm': '平静',
            'anxious': '焦虑',
            'sad': '难过',
            'angry': '生气'
        };
        
        const getMoodEmoji = (mood) => {
            const emojiMap = {
                'happy': '😊',
                'calm': '😌',
                'anxious': '😰',
                'sad': '😢',
                'angry': '😡'
            };
            return emojiMap[mood] || '🌱';
        };

        const renderTodayTree = () => {
            const canvas = document.getElementById('dailyTreeCanvas');
            if (!canvas || !window.TreeGenerator) return;
            
            const totalHabits = habits.value.length;
            const completedCount = completedHabitsCount.value;
            const completionRate = totalHabits > 0 ? completedCount / totalHabits : 0;
            
            window.TreeGenerator.drawTree(canvas, {
                dateStr: getTodayStr(),
                mood: selectedMood.value,
                completionRate: completionRate,
                isMini: false
            });
        };

        // --- 森林视图逻辑 ---
        const forestDays = ref([]);
        const currentForestDate = ref(new Date());
        const forestYearMonth = ref('');

        const initForest = async (year, month) => {
            forestYearMonth.value = `${year}年${month}月`;
            const daysInMonth = new Date(year, month, 0).getDate();
            const days = [];
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                days.push({
                    dateStr,
                    dayNum: i,
                    hasRecord: false,
                    mood: null,
                    completionRate: 0
                });
            }
            forestDays.value = days;

            if (currentUser.value) {
                try {
                    const monthRecords = await DB.getMonthlyRecords(currentUser.value.id, year, month);
                    
                    monthRecords.forEach(record => {
                        const dayItem = days.find(d => d.dateStr === record.date);
                        if (dayItem) {
                            dayItem.hasRecord = !!record.mood;
                            dayItem.mood = record.mood;
                            // Estimate completion rate based on array length vs current total habits
                            // For history, we just use the raw count vs a rough max, or just count / 3
                            const compCount = record.completed_habits ? record.completed_habits.length : 0;
                            const currentTotal = habits.value.length > 0 ? habits.value.length : 3;
                            dayItem.completionRate = Math.min(1, compCount / currentTotal);
                        }
                    });
                    
                    // Render mini trees with a small delay to ensure DOM is ready
                    setTimeout(() => {
                        if (!window.TreeGenerator) return;
                        days.forEach(day => {
                            if (day.hasRecord) {
                                const canvas = document.getElementById('forest-tree-' + day.dateStr);
                                if (canvas) {
                                    window.TreeGenerator.drawTree(canvas, {
                                        dateStr: day.dateStr,
                                        mood: day.mood,
                                        completionRate: day.completionRate,
                                        isMini: true
                                    });
                                }
                            }
                        });
                    }, 100);

                } catch (error) {
                    console.error("加载森林数据失败:", error);
                }
            }
        };

        const changeForestMonth = (delta) => {
            currentForestDate.value.setMonth(currentForestDate.value.getMonth() + delta);
            initForest(currentForestDate.value.getFullYear(), currentForestDate.value.getMonth() + 1);
        };

        // 监听 Tab 和 ViewMode 切换
        Vue.watch([currentTab, treeViewMode], ([newTab, newMode]) => {
            if (newTab === 'tree') {
                if (newMode === 'today') {
                    Vue.nextTick(() => renderTodayTree());
                } else if (newMode === 'forest') {
                    // 添加 setTimeout 确保 DOM 已经完全切换并渲染完成
                    setTimeout(() => {
                        initForest(currentForestDate.value.getFullYear(), currentForestDate.value.getMonth() + 1);
                    }, 80);
                }
            }
        });


        // --- 初始化 ---
        onMounted(() => {
            updateDate();
            checkAuth(); // 检查登录状态
            
            // 初始化日历和今日默认日期
            const now = new Date();
            initCalendar(now.getFullYear(), now.getMonth() + 1);
            initScheduleCalendar(now.getFullYear(), now.getMonth() + 1);
            const todayStr = getTodayStr();
            newScheduleDate.value = todayStr;
            selectSpecificScheduleDate(todayStr); // 默认选中今天

            // 本地心情恢复（模拟）
            const localMood = localStorage.getItem('dailyjoy_mood');
            if (localMood) selectedMood.value = localMood;
        });

        return {
            isLoggedIn, isRegistering, isLoading, authForm, handleAuth, handleLogout,
            currentTab, currentDateStr,
            selectedMood, moods, selectMood,
            habits, todayHabits, completedHabitsCount, toggleHabit, 
            isAddingHabit, newHabitName, newHabitIcon, newHabitFrequencyType, newHabitWeekDays, newHabitIntervalDays, 
            toggleNewHabitWeekDay, cancelAddHabit, submitNewHabit,
            // 日程
            selectedScheduleDateStr, selectSpecificScheduleDate, specificDaySchedules, selectedScheduleDate,
            scheduleCalendarYearMonth, scheduleCalendarGrid, changeScheduleMonth,
            showAddSchedule, newScheduleTitle, newScheduleDate, isAddingSchedule, addSchedule, toggleSchedule, deleteSchedule,
            // 心情日历
            currentYearMonth, calendarDays, changeMonth,
            selectedCalendarDate, currentDiaryText, isSavingDiary, diarySaved, formatSelectedCalendarDate, selectCalendarDate, handleDiaryInput,
            // 树与森林
            treeViewMode, moodLabels, renderTodayTree, getMoodEmoji,
            forestDays, forestYearMonth, changeForestMonth
        };
    }
});

app.mount('#app');

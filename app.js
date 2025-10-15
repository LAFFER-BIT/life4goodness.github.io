// ============ 同步适配器抽象层 ============
class SyncAdapter {
    constructor() {
        this.serviceName = 'base';
        this.isInitialized = false;
    }
    
    async initialize() { throw new Error('Must implement initialize'); }
    async authenticate() { throw new Error('Must implement authenticate'); }
    async getSyncCode() { throw new Error('Must implement getSyncCode'); }
    async setSyncCode(code) { throw new Error('Must implement setSyncCode'); }
    async saveData(data) { throw new Error('Must implement saveData'); }
    async loadData() { throw new Error('Must implement loadData'); }
    async useSyncCode(code) { throw new Error('Must implement useSyncCode'); }
    listenToChanges(callback) { throw new Error('Must implement listenToChanges'); }
}

// ============ Firebase 适配器 ============
class FirebaseAdapter extends SyncAdapter {
    constructor(config) {
        super();
        this.serviceName = 'Firebase';
        this.config = config;
        this.db = null;
        this.auth = null;
        this.userId = null;
        this.syncCode = null;
        this.listener = null;
    }

    async initialize() {
        try {
            firebase.initializeApp(this.config);
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            this.isInitialized = true;
            console.log('✅ Firebase 初始化成功');
            return true;
        } catch (error) {
            console.error('❌ Firebase 初始化失败:', error);
            return false;
        }
    }

    async authenticate() {
        try {
            const result = await this.auth.signInAnonymously();
            this.userId = result.user.uid;
            console.log('✅ Firebase 用户登录成功:', this.userId);
            return true;
        } catch (error) {
            console.error('❌ Firebase 登录失败:', error);
            return false;
        }
    }

    async getSyncCode() {
        if (!this.userId) return null;
        
        try {
            const doc = await this.db.collection('users').doc(this.userId).get();
            if (doc.exists) {
                this.syncCode = doc.data().syncCode;
            } else {
                this.syncCode = this.generateSyncCode();
                await this.db.collection('users').doc(this.userId).set({
                    syncCode: this.syncCode,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                await this.db.collection('syncCodes').doc(this.syncCode).set({ 
                    userId: this.userId 
                });
            }
            return this.syncCode;
        } catch (error) {
            console.error('❌ Firebase 获取同步码失败:', error);
            return null;
        }
    }

    async saveData(data) {
        if (!this.userId) return false;
        
        try {
            await this.db.collection('userData').doc(this.userId).set({
                ...data,
                lastSync: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error('❌ Firebase 保存数据失败:', error);
            return false;
        }
    }

    async loadData() {
        if (!this.userId) return null;
        
        try {
            const doc = await this.db.collection('userData').doc(this.userId).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('❌ Firebase 加载数据失败:', error);
            return null;
        }
    }

    async useSyncCode(code) {
        try {
            const codeDoc = await this.db.collection('syncCodes').doc(code).get();
            if (!codeDoc.exists) return { success: false, message: '同步码不存在' };
            
            const targetUserId = codeDoc.data().userId;
            const dataDoc = await this.db.collection('userData').doc(targetUserId).get();
            
            if (!dataDoc.exists) return { success: false, message: '未找到数据' };
            
            this.userId = targetUserId;
            this.syncCode = code;
            
            return { success: true, data: dataDoc.data() };
        } catch (error) {
            console.error('❌ Firebase 使用同步码失败:', error);
            return { success: false, message: error.message };
        }
    }

    listenToChanges(callback) {
        if (!this.userId || this.listener) return;
        
        this.listener = this.db.collection('userData').doc(this.userId).onSnapshot((doc) => {
            if (doc.exists) {
                callback(doc.data());
            }
        }, (error) => {
            console.error('❌ Firebase 监听失败:', error);
        });
    }

    generateSyncCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}

// ============ LeanCloud 适配器 ============
class LeanCloudAdapter extends SyncAdapter {
    constructor(config) {
        super();
        this.serviceName = 'LeanCloud';
        this.config = config;
        this.userId = null;
        this.syncCode = null;
        this.listener = null;
    }

    async initialize() {
        try {
            AV.init({
                appId: this.config.appId,
                appKey: this.config.appKey,
                serverURL: this.config.serverURL
            });
            this.isInitialized = true;
            console.log('✅ LeanCloud 初始化成功');
            return true;
        } catch (error) {
            console.error('❌ LeanCloud 初始化失败:', error);
            return false;
        }
    }

    async authenticate() {
        try {
            let localUserId = localStorage.getItem('lc_userId');
            
            if (localUserId) {
                this.userId = localUserId;
            } else {
                this.userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('lc_userId', this.userId);
            }
            
            console.log('✅ LeanCloud 用户认证成功:', this.userId);
            return true;
        } catch (error) {
            console.error('❌ LeanCloud 认证失败:', error);
            return false;
        }
    }

    async getSyncCode() {
        if (!this.userId) return null;
        
        try {
            const UserCode = AV.Object.extend('UserCodes');
            const query = new AV.Query(UserCode);
            query.equalTo('userId', this.userId);
            const result = await query.first();
            
            if (result) {
                this.syncCode = result.get('syncCode');
            } else {
                this.syncCode = this.generateSyncCode();
                
                const userCode = new UserCode();
                userCode.set('userId', this.userId);
                userCode.set('syncCode', this.syncCode);
                await userCode.save();
                
                const SyncCode = AV.Object.extend('SyncCodes');
                const syncCodeObj = new SyncCode();
                syncCodeObj.set('code', this.syncCode);
                syncCodeObj.set('userId', this.userId);
                await syncCodeObj.save();
            }
            
            return this.syncCode;
        } catch (error) {
            console.error('❌ LeanCloud 获取同步码失败:', error);
            return null;
        }
    }

    async saveData(data) {
        if (!this.userId) return false;
        
        try {
            const UserData = AV.Object.extend('UserData');
            const query = new AV.Query(UserData);
            query.equalTo('userId', this.userId);
            let userData = await query.first();
            
            if (!userData) {
                userData = new UserData();
                userData.set('userId', this.userId);
            }
            
            userData.set('ingredients', data.ingredients || []);
            userData.set('customDishes', data.customDishes || []);
            userData.set('weeklyMenu', data.weeklyMenu || {});
            userData.set('cookedDishes', data.cookedDishes || {});
            userData.set('lastSync', new Date());
            
            await userData.save();
            return true;
        } catch (error) {
            console.error('❌ LeanCloud 保存数据失败:', error);
            return false;
        }
    }

    async loadData() {
        if (!this.userId) return null;
        
        try {
            const UserData = AV.Object.extend('UserData');
            const query = new AV.Query(UserData);
            query.equalTo('userId', this.userId);
            const result = await query.first();
            
            if (!result) return null;
            
            return {
                ingredients: result.get('ingredients') || [],
                customDishes: result.get('customDishes') || [],
                weeklyMenu: result.get('weeklyMenu') || {},
                cookedDishes: result.get('cookedDishes') || {}
            };
        } catch (error) {
            console.error('❌ LeanCloud 加载数据失败:', error);
            return null;
        }
    }

    async useSyncCode(code) {
        try {
            const SyncCode = AV.Object.extend('SyncCodes');
            const query = new AV.Query(SyncCode);
            query.equalTo('code', code);
            const codeObj = await query.first();
            
            if (!codeObj) return { success: false, message: '同步码不存在' };
            
            const targetUserId = codeObj.get('userId');
            
            const UserData = AV.Object.extend('UserData');
            const dataQuery = new AV.Query(UserData);
            dataQuery.equalTo('userId', targetUserId);
            const dataObj = await dataQuery.first();
            
            if (!dataObj) return { success: false, message: '未找到数据' };
            
            this.userId = targetUserId;
            this.syncCode = code;
            localStorage.setItem('lc_userId', this.userId);
            
            return {
                success: true,
                data: {
                    ingredients: dataObj.get('ingredients') || [],
                    customDishes: dataObj.get('customDishes') || [],
                    weeklyMenu: dataObj.get('weeklyMenu') || {},
                    cookedDishes: dataObj.get('cookedDishes') || {}
                }
            };
        } catch (error) {
            console.error('❌ LeanCloud 使用同步码失败:', error);
            return { success: false, message: error.message };
        }
    }

    listenToChanges(callback) {
        if (!this.userId || this.listener) return;
        
        let lastSyncTime = new Date();
        
        this.listener = setInterval(async () => {
            try {
                const UserData = AV.Object.extend('UserData');
                const query = new AV.Query(UserData);
                query.equalTo('userId', this.userId);
                query.greaterThan('lastSync', lastSyncTime);
                const result = await query.first();
                
                if (result) {
                    lastSyncTime = result.get('lastSync');
                    callback({
                        ingredients: result.get('ingredients') || [],
                        customDishes: result.get('customDishes') || [],
                        weeklyMenu: result.get('weeklyMenu') || {},
                        cookedDishes: result.get('cookedDishes') || {}
                    });
                }
            } catch (error) {
                console.error('❌ LeanCloud 监听失败:', error);
            }
        }, 5000);
    }

    generateSyncCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}

// ============ 同步管理器 ============
class SyncManager {
    constructor() {
        this.adapter = null;
        this.isSyncing = false;
    }

    async initialize() {
        const config = window.APP_CONFIG?.production;
        if (!config) {
            console.log('⚠️ 未找到配置，使用离线模式');
            return false;
        }

        let selectedAdapter = null;
        
        if (config.defaultSync === 'firebase' && config.firebase?.enabled) {
            selectedAdapter = new FirebaseAdapter(this.getFirebaseConfig(config.firebase));
        } else if (config.defaultSync === 'leancloud' && config.leancloud?.enabled) {
            selectedAdapter = new LeanCloudAdapter(config.leancloud);
        } else if (config.defaultSync === 'auto') {
            if (config.firebase?.enabled) {
                selectedAdapter = new FirebaseAdapter(this.getFirebaseConfig(config.firebase));
            } else if (config.leancloud?.enabled) {
                selectedAdapter = new LeanCloudAdapter(config.leancloud);
            }
        }

        if (!selectedAdapter) {
            console.log('⚠️ 没有启用任何同步服务');
            return false;
        }

        const initSuccess = await selectedAdapter.initialize();
        if (!initSuccess) return false;

        const authSuccess = await selectedAdapter.authenticate();
        if (!authSuccess) return false;

        this.adapter = selectedAdapter;
        console.log(`✅ 使用 ${this.adapter.serviceName} 作为同步服务`);
        
        this.updateCurrentServiceDisplay();
        
        return true;
    }

    getFirebaseConfig(fbConfig) {
        return {
            apiKey: fbConfig.apiKey,
            authDomain: `${fbConfig.projectId}.firebaseapp.com`,
            projectId: fbConfig.projectId,
            storageBucket: `${fbConfig.projectId}.firebasestorage.app`,
            appId: fbConfig.appId
        };
    }

    updateCurrentServiceDisplay() {
        if (this.adapter) {
            const serviceInfo = document.getElementById('currentServiceInfo');
            const serviceText = document.getElementById('currentServiceText');
            if (serviceInfo && serviceText) {
                serviceText.textContent = this.adapter.serviceName;
                serviceInfo.style.display = 'block';
            }
            
            const indicator = document.getElementById('syncIndicator');
            const badge = indicator.querySelector('.sync-service-badge');
            if (badge) {
                badge.remove();
            }
            const newBadge = document.createElement('span');
            newBadge.className = 'sync-service-badge';
            newBadge.textContent = this.adapter.serviceName;
            indicator.appendChild(newBadge);
        }
    }

    async getSyncCode() {
        return this.adapter ? await this.adapter.getSyncCode() : null;
    }

    async saveData(data) {
        if (!this.adapter || this.isSyncing) return false;
        
        this.isSyncing = true;
        updateSyncIndicator('syncing', '同步中...');
        
        const success = await this.adapter.saveData(data);
        
        if (success) {
            updateSyncIndicator('synced', '已同步');
        } else {
            updateSyncIndicator('error', '同步失败');
        }
        
        setTimeout(() => { this.isSyncing = false; }, 500);
        return success;
    }

    async loadData() {
        return this.adapter ? await this.adapter.loadData() : null;
    }

    async useSyncCode(code) {
        return this.adapter ? await this.adapter.useSyncCode(code) : 
            { success: false, message: '未初始化同步服务' };
    }

    listenToChanges(callback) {
        if (this.adapter) {
            this.adapter.listenToChanges((data) => {
                if (!this.isSyncing) {
                    callback(data);
                }
            });
        }
    }

    isAvailable() {
        return this.adapter !== null && this.adapter.isInitialized;
    }

    getServiceName() {
        return this.adapter ? this.adapter.serviceName : '离线';
    }
}

// ============ 全局变量 ============
const syncManager = new SyncManager();
let ingredients = [];
let customDishes = [];
let weeklyMenu = {};
let cookedDishes = {};
let currentWeekStart = new Date();
let selectedDate = null;
let tempDishIngredients = [];

const defaultDishes = [
    { id: 'default_1', name: '葱油焖鸡', description: '1. 鸡块提前腌制\n2. 倒入鸡块翻炒\n3. 加入调料翻炒均匀出锅', ingredients: [{ name: '鸡块', quantity: 1, unit: '份' }, { name: '葱', quantity: 1, unit: '根' }] },
    { id: 'default_2', name: '秋葵炒素肚', description: '1. 秋葵切片清洗\n2. 素肚切片\n3. 热锅炒青椒\n4. 加秋葵素肚炒匀', ingredients: [{ name: '秋葵', quantity: 1, unit: '份' }, { name: '素肚', quantity: 1, unit: '份' },  { name: '青椒', quantity: 1, unit: '个' }] }
];

// ============ 数据操作 ============
function loadLocalData() {
    console.log('📂 加载本地数据');
    ingredients = JSON.parse(localStorage.getItem('fridgeIngredients') || '[]');
    customDishes = JSON.parse(localStorage.getItem('customDishes') || '[]');
    weeklyMenu = JSON.parse(localStorage.getItem('weeklyMenu') || '{}');
    cookedDishes = JSON.parse(localStorage.getItem('cookedDishes') || '{}');
}

function saveData() {
    localStorage.setItem('fridgeIngredients', JSON.stringify(ingredients));
    localStorage.setItem('customDishes', JSON.stringify(customDishes));
    localStorage.setItem('weeklyMenu', JSON.stringify(weeklyMenu));
    localStorage.setItem('cookedDishes', JSON.stringify(cookedDishes));
    
    if (syncManager.isAvailable()) {
        syncManager.saveData({
            ingredients,
            customDishes,
            weeklyMenu,
            cookedDishes
        });
    }
}

// ============ UI更新函数 ============
function updateSyncIndicator(status, text) {
    const indicator = document.getElementById('syncIndicator');
    const dot = indicator.querySelector('.sync-dot');
    const spans = indicator.querySelectorAll('span');
    const textSpan = Array.from(spans).find(s => !s.classList.contains('sync-service-badge'));
    
    indicator.className = `sync-indicator ${status}`;
    if (textSpan) textSpan.textContent = text;
    
    const colorMap = {
        'synced': 'green',
        'syncing': 'yellow',
        'offline': 'gray',
        'error': 'red'
    };
    
    dot.className = 'sync-dot ' + colorMap[status];
}

// ============ 食材管理 ============
function addIngredient() {
    const name = document.getElementById('ingredientName').value.trim();
    const type = document.getElementById('ingredientType').value;
    const quantity = parseFloat(document.getElementById('ingredientQuantity').value);
    const unit = document.getElementById('ingredientUnit').value;
    
    if (name && quantity > 0) {
        ingredients.push({ 
            id: Date.now(), 
            name, 
            type, 
            quantity, 
            unit 
        });
        
        document.getElementById('ingredientName').value = '';
        document.getElementById('ingredientQuantity').value = '';
        
        saveData();
        renderAll();
    } else {
        alert('请填写完整的食材信息');
    }
}

function adjustQuantity(id, change) {
    const ingredient = ingredients.find(i => i.id === id);
    if (ingredient) {
        ingredient.quantity += change;
        if (ingredient.quantity <= 0) {
            if (confirm('数量为0,是否删除该食材?')) {
                ingredients = ingredients.filter(i => i.id !== id);
            } else {
                ingredient.quantity = 1;
            }
        }
        saveData();
        renderAll();
    }
}

function updateIngredientName(id, newName) {
    const ingredient = ingredients.find(i => i.id === id);
    if (ingredient && newName.trim()) {
        ingredient.name = newName.trim();
        saveData();
        renderAll();
    }
}

function removeIngredient(id) {
    if (confirm('确定删除?')) {
        ingredients = ingredients.filter(i => i.id !== id);
        saveData();
        renderAll();
    }
}

function renderIngredients() {
    const grouped = {
        '蔬菜': [],
        '肉类': [],
        '调料': [],
        '其他': []
    };
    
    ingredients.forEach(ing => {
        if (grouped[ing.type]) {
            grouped[ing.type].push(ing);
        } else {
            grouped['其他'].push(ing);
        }
    });
    
    const container = document.getElementById('ingredientsByCategory');
    const clearBtn = document.getElementById('clearBtn');
    
    if (ingredients.length === 0) {
        container.innerHTML = '<div class="empty-message">暂无食材</div>';
        clearBtn.style.display = 'none';
    } else {
        clearBtn.style.display = 'block';
        
        const typeEmojis = {
            '蔬菜': '🥬',
            '肉类': '🥩',
            '调料': '🧂',
            '其他': '📦'
        };
        
        const typeColors = {
            '蔬菜': '#22c55e',
            '肉类': '#ef4444',
            '调料': '#f59e0b',
            '其他': '#6b7280'
        };
        
        let html = '';
        
        Object.entries(grouped).forEach(([type, items]) => {
            if (items.length > 0) {
                html += `
                    <div style="margin-bottom: 20px;">
                        <div style="background: linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 100%); padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; font-weight: 600; color: #374151; border-left: 4px solid ${typeColors[type]}; display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 1.2rem;">${typeEmojis[type]}</span>
                            <span>${type}</span>
                            <span style="margin-left: auto; font-size: 0.85rem; color: #6b7280;">共 ${items.length} 种</span>
                        </div>
                        ${items.map(ing => `
                            <div class="ingredient-item">
                                <div style="flex: 1;">
                                    <input type="text" value="${ing.name}" onchange="updateIngredientName(${ing.id}, this.value)" style="font-weight: 500; border: 1px solid transparent; padding: 4px 8px; border-radius: 4px; background: #f9fafb; width: 100%;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <button class="btn btn-secondary" onclick="adjustQuantity(${ing.id}, -1)" style="padding: 4px 8px;">−</button>
                                    <span style="font-weight: 600; min-width: 60px; text-align: center;">${ing.quantity}${ing.unit}</span>
                                    <button class="btn btn-primary" onclick="adjustQuantity(${ing.id}, 1)" style="padding: 4px 8px;">+</button>
                                    <button class="btn btn-danger" onclick="removeIngredient(${ing.id})">🗑️</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        });
        
        container.innerHTML = html;
    }
}

// ============ 菜品管理 ============
function getAllDishes() {
    return [...defaultDishes, ...customDishes];
}

function canMakeDish(dish) {
    return dish.ingredients.every(required => {
        const available = ingredients.find(ing => 
            ing.name === required.name && ing.unit === required.unit
        );
        return available && available.quantity >= required.quantity;
    });
}

function cookDish(name) {
    const dish = getAllDishes().find(d => d.name === name);
    if (!dish) {
        alert('菜品不存在');
        return;
    }
    
    if (!canMakeDish(dish)) {
        const missing = getMissingIngredients(dish);
        const missingList = missing.map(m => `${m.name} ${m.needed}${m.unit}`).join('、');
        alert(`食材不足，还需要：\n${missingList}`);
        return;
    }
    
    if (confirm(`确定制作 ${name}?\n\n将扣除以下食材：\n${dish.ingredients.map(i => `${i.name} ${i.quantity}${i.unit}`).join('\n')}`)) {
        dish.ingredients.forEach(required => {
            const available = ingredients.find(ing => 
                ing.name === required.name && ing.unit === required.unit
            );
            if (available) {
                available.quantity -= required.quantity;
                if (available.quantity <= 0) {
                    ingredients = ingredients.filter(i => i.id !== available.id);
                }
            }
        });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateKey = formatDateKey(today);
        
        if (!cookedDishes[dateKey]) {
            cookedDishes[dateKey] = [];
        }
        
        if (!cookedDishes[dateKey].some(item => item.name === name)) {
            cookedDishes[dateKey].push({
                name: name,
                timestamp: Date.now()
            });
        }
        
        saveData();
        renderAll();
        alert(`🍳 ${name} 制作完成！\n\n已在日历上标记为已完成 ✓`);
    }
}

function renderStats() {
    const allDishes = getAllDishes();
    const available = allDishes.filter(canMakeDish);
    
    document.getElementById('statIngredients').textContent = ingredients.length;
    document.getElementById('statAvailable').textContent = available.length;
    document.getElementById('statMissing').textContent = allDishes.length - available.length;
}

// ============ 日历功能 ============
function initWeekCalendar() {
    setCurrentWeekStart();
    renderWeekCalendar();
    updateQuickDishSelect();
    updateCurrentDateDisplay();
    renderTodayMenu();
}

function setCurrentWeekStart() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() + diff);
    currentWeekStart.setHours(0, 0, 0, 0);
}

function removeDishFromMenu(date, dishName) {
    const dateKey = formatDateKey(date);
    if (weeklyMenu[dateKey]) {
        weeklyMenu[dateKey] = weeklyMenu[dateKey].filter(d => d !== dishName);
        if (weeklyMenu[dateKey].length === 0) {
            delete weeklyMenu[dateKey];
        }
        saveData();
        renderWeekCalendar();
        renderTodayMenu();
    }
}

function getMissingIngredients(dish) {
    if (!dish) return [];
    
    return dish.ingredients.filter(required => {
        const available = ingredients.find(ing => 
            ing.name === required.name && ing.unit === required.unit
        );
        return !available || available.quantity < required.quantity;
    }).map(missing => {
        const available = ingredients.find(ing => 
            ing.name === missing.name && ing.unit === missing.unit
        );
        const needed = available ? 
            missing.quantity - available.quantity : 
            missing.quantity;
        return { 
            name: missing.name, 
            needed: needed,
            unit: missing.unit 
        };
    });
}

function renderTodayMenu() {
    const container = document.getElementById('todayMenu');
    if (!container) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateKey = formatDateKey(today);
    const todayDishes = weeklyMenu[dateKey] || [];
    const cooked = cookedDishes[dateKey] || [];
    const cookedNames = cooked.map(item => typeof item === 'string' ? item : item.name);
    
    if (todayDishes.length === 0) {
        container.innerHTML = '<div class="empty-message" style="padding: 5px;">暂无菜品安排</div>';
    } else {
        container.innerHTML = todayDishes.map(dishName => {
            const dish = getAllDishes().find(d => d.name === dishName);
            const isCooked = cookedNames.includes(dishName);
            
            if (!dish) {
                return `
                    <div style="padding: 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 500; color: #dc2626;">${dishName}</span>
                            <button class="btn btn-danger" onclick="removeDishFromMenu(new Date(), '${dishName}')" style="padding: 3px 6px; font-size: 0.7rem;">
                                ✕
                            </button>
                        </div>
                        <span style="font-size: 0.75rem; color: #dc2626;">（菜品不存在）</span>
                    </div>
                `;
            }
            
            if (isCooked) {
                return `
                    <div style="padding: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 6px; margin-bottom: 8px; position: relative; opacity: 0.9;">
                        <div style="position: absolute; top: 8px; right: 8px; background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.65rem; font-weight: 600;">
                            ✓ 已完成
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <span style="font-weight: 600; color: #059669; font-size: 0.95rem; text-decoration: line-through; opacity: 0.8;">${dishName}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: #059669;">
                            🍳 制作于 ${new Date(cooked.find(c => (typeof c === 'string' ? c : c.name) === dishName)?.timestamp || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <button class="btn btn-danger" onclick="unmarkDishAsCooked('${dishName}')" style="padding: 4px 8px; font-size: 0.7rem; margin-top: 8px;">
                            ↩️ 撤销完成
                        </button>
                    </div>
                `;
            }
            
            const canMake = canMakeDish(dish);
            const missingItems = canMake ? [] : getMissingIngredients(dish);
            
            return `
                <div style="padding: 10px; background: ${canMake ? '#f0fdf4' : '#fff7ed'}; border: 1px solid ${canMake ? '#bbf7d0' : '#fed7aa'}; border-radius: 6px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${canMake ? '0' : '8px'};">
                        <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600; color: #374151; font-size: 0.95rem;">${dishName}</span>
                            <span style="font-size: 0.75rem; color: ${canMake ? '#059669' : '#d97706'}; font-weight: 500; padding: 2px 8px; background: ${canMake ? '#dcfce7' : '#fed7aa'}; border-radius: 12px;">
                                ${canMake ? '✅ 可制作' : '⚠️ 缺食材'}
                            </span>
                        </div>
                        <button class="btn btn-danger" onclick="removeDishFromMenu(new Date(), '${dishName}')" style="padding: 3px 6px; font-size: 0.7rem;" title="从今日菜单中移除">
                            ✕
                        </button>
                    </div>
                    ${!canMake && missingItems.length > 0 ? `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #fed7aa;">
                            <div style="font-size: 0.75rem; color: #92400e; font-weight: 500; margin-bottom: 6px;">
                                🛒 需采购：
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                ${missingItems.map(item => `
                                    <span style="background: #fbbf24; color: #78350f; padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 500;">
                                        ${item.name} ${item.needed}${item.unit}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${canMake ? `
                        <div style="margin-top: 8px;">
                            <button class="btn btn-success" onclick="cookDish('${dish.name}')" style="padding: 6px 12px; font-size: 0.75rem;">
                                🍳 完成制作
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
}

function unmarkDishAsCooked(dishName) {
    if (confirm(`确定要撤销"${dishName}"的完成状态吗？\n\n注意：食材不会恢复`)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateKey = formatDateKey(today);
        
        if (cookedDishes[dateKey]) {
            cookedDishes[dateKey] = cookedDishes[dateKey].filter(item => {
                const name = typeof item === 'string' ? item : item.name;
                return name !== dishName;
            });
            
            if (cookedDishes[dateKey].length === 0) {
                delete cookedDishes[dateKey];
            }
            
            saveData();
            renderAll();
        }
    }
}

function renderWeekCalendar() {
    const container = document.getElementById('weekCalendar');
    if (!container) return;
    
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    container.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(currentWeekStart.getDate() + i);
        const dateKey = formatDateKey(date);
        const dayDishes = weeklyMenu[dateKey] || [];
        const cooked = cookedDishes[dateKey] || [];
        const cookedNames = cooked.map(item => typeof item === 'string' ? item : item.name);

        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        if (date.getTime() === today.getTime()) {
            dayElement.classList.add('today');
        }
        
        dayElement.onclick = () => selectDate(date, dayElement);

        dayElement.innerHTML = `
            <div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 6px;">${weekdays[i]}</div>
            <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px;">${date.getDate()}</div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
                ${dayDishes.map(dish => {
                    const isCooked = cookedNames.includes(dish);
                    return `
                        <div style="background: ${isCooked ? '#10b981' : '#3b82f6'}; color: white; font-size: 0.6rem; padding: 2px 4px; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 2px; ${isCooked ? 'opacity: 0.85;' : ''}" title="${dish}${isCooked ? ' (已完成)' : ''}">
                            ${isCooked ? '<span style="font-size: 0.55rem;">✓</span>' : ''}
                            <span style="${isCooked ? 'text-decoration: line-through;' : ''}">${dish}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        container.appendChild(dayElement);
    }
}

function selectDate(date, element) {
    document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
    element.classList.add('selected');
    selectedDate = date;
    updateSelectedDateInfo();
}

function updateSelectedDateInfo() {
    const info = document.getElementById('selectedDateInfo');
    if (info) {
        if (selectedDate) {
            const dateStr = selectedDate.toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            info.textContent = `已选择: ${dateStr}`;
        } else {
            info.textContent = '请先选择日期';
        }
    }
}

function updateCurrentDateDisplay() {
    const elem = document.getElementById('currentDate');
    if (elem) {
        const today = new Date();
        elem.textContent = today.toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    }
}

function updateQuickDishSelect() {
    const select = document.getElementById('quickDishSelect');
    if (select) {
        const allDishes = getAllDishes();
        select.innerHTML = '<option value="">选择菜品...</option>';
        allDishes.forEach(dish => {
            const option = document.createElement('option');
            option.value = dish.name;
            option.textContent = dish.name;
            select.appendChild(option);
        });
    }
}

function quickAddDish() {
    const dishName = document.getElementById('quickDishSelect').value;
    if (!dishName || !selectedDate) {
        alert('请选择日期和菜品');
        return;
    }

    const dateKey = formatDateKey(selectedDate);
    if (!weeklyMenu[dateKey]) {
        weeklyMenu[dateKey] = [];
    }
    
    if (!weeklyMenu[dateKey].includes(dishName)) {
        weeklyMenu[dateKey].push(dishName);
        saveData();
        renderWeekCalendar();
        renderTodayMenu();
        alert(`已添加 ${dishName}`);
    } else {
        alert('该菜品已在当天菜单中');
    }
}

function formatDateKey(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function changeWeek(direction) {
    const days = direction * 7;
    currentWeekStart.setDate(currentWeekStart.getDate() + days);
    selectedDate = null;
    renderWeekCalendar();
    updateSelectedDateInfo();
}

// ============ 同步功能 ============
function openSyncModal() {
    const modal = document.getElementById('syncModal');
    const statusText = document.getElementById('syncStatusText');
    const codeDisplay = document.getElementById('displaySyncCode');
    
    if (!syncManager.isAvailable()) {
        statusText.textContent = '云同步未启用,当前为离线模式';
        codeDisplay.textContent = '------';
    } else {
        statusText.textContent = `云同步已启用 (${syncManager.getServiceName()})`;
        syncManager.getSyncCode().then(code => {
            if (code) {
                codeDisplay.textContent = code;
            }
        });
    }
    
    modal.classList.add('show');
}

function copySyncCode() {
    syncManager.getSyncCode().then(code => {
        if (code) {
            navigator.clipboard.writeText(code).then(() => {
                alert('✅ 同步码已复制!\n\n' + code);
            }).catch(() => {
                alert('同步码: ' + code);
            });
        } else {
            alert('同步码尚未生成');
        }
    });
}

async function useSyncCode() {
    const code = document.getElementById('inputSyncCode').value.trim();
    
    if (!syncManager.isAvailable()) {
        alert('云同步未启用');
        return;
    }
    
    if (code.length !== 6) {
        alert('请输入6位同步码');
        return;
    }
    
    showLoading('正在同步数据...');
    
    try {
        const result = await syncManager.useSyncCode(code);
        
        if (result.success) {
            ingredients = result.data.ingredients || [];
            customDishes = result.data.customDishes || [];
            weeklyMenu = result.data.weeklyMenu || {};
            cookedDishes = result.data.cookedDishes || {};
            
            saveData();
            renderAll();
            
            document.getElementById('syncModal').classList.remove('show');
            alert('✅ 数据同步成功!');
        } else {
            alert('❌ ' + result.message);
        }
    } catch (error) {
        console.error('同步失败:', error);
        alert('❌ 同步失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

// ============ AI功能 ============
function loadAPIKeys() {
    const deepseek = localStorage.getItem('deepseekApiKey');
    const qwen = localStorage.getItem('qwenApiKey');
    
    if (deepseek) document.getElementById('deepseekApiKey').value = deepseek;
    if (qwen) document.getElementById('qwenApiKey').value = qwen;
}

function showStatus(statusDiv, type, message) {
    statusDiv.className = `status-indicator status-${type}`;
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
}

async function testDeepSeekConnection() {
    const apiKey = document.getElementById('deepseekApiKey').value.trim();
    const statusDiv = document.getElementById('deepseekStatus');
    
    if (!apiKey) {
        showStatus(statusDiv, 'error', '请先输入API密钥');
        return;
    }
    
    showLoading('测试DeepSeek连接...');
    
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: '测试' }],
                max_tokens: 10
            })
        });
        
        if (response.ok) {
            showStatus(statusDiv, 'success', '✅ 连接成功');
            localStorage.setItem('deepseekApiKey', apiKey);
        } else {
            showStatus(statusDiv, 'error', '❌ 连接失败');
        }
    } catch (error) {
        showStatus(statusDiv, 'error', '❌ 错误: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function testQwenConnection() {
    const apiKey = document.getElementById('qwenApiKey').value.trim();
    const statusDiv = document.getElementById('qwenStatus');
    
    if (!apiKey) {
        showStatus(statusDiv, 'error', '请先输入API密钥');
        return;
    }
    
    showLoading('测试Qwen3-VL连接...');
    
    try {
        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'qwen3-vl-plus',
                messages: [{ role: 'user', content: '测试' }],
                max_tokens: 10
            })
        });
        
        if (response.ok) {
            showStatus(statusDiv, 'success', '✅ 连接成功');
            localStorage.setItem('qwenApiKey', apiKey);
        } else {
            showStatus(statusDiv, 'error', '❌ 连接失败');
        }
    } catch (error) {
        showStatus(statusDiv, 'error', '❌ 错误: ' + error.message);
    } finally {
        hideLoading();
    }
}

function initCamera() {
    document.getElementById('cameraBtn').onclick = () => {
        const qwenKey = document.getElementById('qwenApiKey').value.trim();
        if (!qwenKey) {
            alert('请先配置Qwen3-VL API密钥');
            return;
        }
        document.getElementById('cameraInput').click();
    };
    
    document.getElementById('cameraInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        showLoading('识别中...');
        
        try {
            const base64 = await fileToBase64(file);
            const items = await recognizeIngredientsWithQwen(base64);
            
            if (items && items.length > 0) {
                if (confirm(`识别到 ${items.length} 种食材,是否添加?`)) {
                    items.forEach(item => {
                        const existing = ingredients.find(i => 
                            i.name === item.name && i.unit === item.unit
                        );
                        if (existing) {
                            existing.quantity += item.quantity;
                        } else {
                            ingredients.push({
                                id: Date.now() + Math.random(),
                                name: item.name,
                                type: item.type || '其他',
                                quantity: item.quantity,
                                unit: item.unit
                            });
                        }
                    });
                    saveData();
                    renderAll();
                }
            } else {
                alert('未能识别到食材');
            }
        } catch (error) {
            alert('识别失败: ' + error.message);
        } finally {
            hideLoading();
        }
    };
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsDataURL(file);
    });
}

async function recognizeIngredientsWithQwen(base64Image) {
    const apiKey = document.getElementById('qwenApiKey').value.trim();
    
    const prompt = `请识别这张图片中的食材，严格按照JSON格式返回：
[{"name": "食材名称", "quantity": 数量, "unit": "单位", "type": "类别"}]

要求：
1. quantity必须是数字
2. unit只能是: 个、根、片、袋、盒、份、g、颗、块、桶中的一个
3. type只能是: 蔬菜、肉类、调料、其他中的一个
4. 如果无法确定数量，默认设为1
5. 只返回JSON数组，不要任何解释文字`;

    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'qwen3-vl-plus',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                ]
            }],
            max_tokens: 500
        })
    });

    if (!response.ok) throw new Error('API请求失败');
    
    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    return JSON.parse(cleaned);
}

async function askAI() {
    const apiKey = document.getElementById('deepseekApiKey').value.trim();
    const prompt = document.getElementById('aiPrompt').value.trim();
    
    if (!apiKey) {
        alert('请先配置DeepSeek API密钥');
        return;
    }
    if (!prompt) {
        alert('请输入问题');
        return;
    }

    const resultDiv = document.getElementById('aiResult');
    const aiIcon = document.getElementById('aiIcon');
    
    aiIcon.textContent = '⳩';
    resultDiv.style.display = 'block';
    resultDiv.textContent = '思考中...';

    try {
        const ingredientsInfo = ingredients.map(i => 
            `${i.name}(${i.quantity}${i.unit})`
        ).join('、');
        
        const fullPrompt = `我的冰箱里有已有食材: ${ingredientsInfo || '暂无'}\n\n${prompt}`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: '你是专业烹饪助手，请根据用户的冰箱食材和提出的需求，按照时下的季节和流行趋势提供符合当前季节的菜谱建议和详细烹饪方式。' },
                    { role: 'user', content: fullPrompt }
                ],
                max_tokens: 2000
            })
        });

        if (!response.ok) throw new Error('API请求失败');
        
        const data = await response.json();
        resultDiv.textContent = data.choices[0].message.content;
        localStorage.setItem('deepseekApiKey', apiKey);
    } catch (error) {
        resultDiv.textContent = '请求失败: ' + error.message;
    } finally {
        aiIcon.textContent = '🤖';
    }
}

// ============ 工具函数 ============
function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    
    const tab = document.getElementById(tabName + '-tab');
    if (tab) tab.classList.add('active');
    
    event.target.classList.add('active');
    
    if (tabName === 'menu') {
        initWeekCalendar();
    } else if (tabName === 'manage') {
        renderManageDishes();
    }
}

function renderAll() {
    renderIngredients();
    renderStats();
    
    if (document.getElementById('weekCalendar')) {
        renderWeekCalendar();
        renderTodayMenu();
    }
    
    if (document.getElementById('manage-tab').classList.contains('active')) {
        renderManageDishes();
    }
}

// ============ 菜品库管理 ============
function renderManageDishes() {
    const allDishes = getAllDishes();
    const dishCount = document.getElementById('dishCount');
    const container = document.getElementById('manageDishList');
    
    if (dishCount) {dishCount.textContent = allDishes.length;}
    
    if (!container) return;
    
    if (allDishes.length === 0) {
        container.innerHTML = '<div class="empty-message">暂无菜品</div>';
    } else {
        container.innerHTML = allDishes.map(dish => {
            const isDefault = dish.id && dish.id.startsWith('default_');
            return `
                <div class="dish-item" style="border-color: #e5e7eb; background: #f9fafb; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <h3 style="font-weight: 600; font-size: 1rem; flex: 1;">${dish.name}</h3>
                        <div style="display: flex; gap: 6px;">
                            ${!isDefault ? `
                                <button class="btn btn-danger" onclick="deleteDish('${dish.id}')" title="删除菜品">
                                    🗑️ 删除
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 8px;">
                        <strong>所需：</strong>
                        ${dish.ingredients.map(ing => `${ing.name}(${ing.quantity}${ing.unit})`).join('、')}
                    </div>
                    ${dish.description ? `
                        <div style="font-size: 0.875rem; color: #374151; background: #f8fafc; padding: 8px; border-radius: 4px; margin-top: 8px; border-left: 3px solid #3b82f6; white-space: pre-line;">
                            ${dish.description.replace(/^\s*\n/, '').trim()}
                        </div>
                    ` : ''}
                    <div style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 500; margin-top: 8px; ${isDefault ? 'background: #e0e7ff; color: #3730a3;' : 'background: #fef3c7; color: #92400e;'}">
                        ${isDefault ? '🔒 预置菜品' : '🔧 自定义菜品'}
                    </div>
                </div>
            `;
        }).join('');
    }
}

function addIngredientToDish() {
    const name = document.getElementById('newIngName').value.trim();
    const quantity = parseFloat(document.getElementById('newIngQuantity').value);
    const unit = document.getElementById('newIngUnit').value;
    
    if (name && quantity > 0) {
        tempDishIngredients.push({ name, quantity, unit });
        document.getElementById('newIngName').value = '';
        document.getElementById('newIngQuantity').value = '';
        renderTempIngredients();
    } else {
        alert('请填写完整的食材信息');
    }
}

function renderTempIngredients() {
    const container = document.getElementById('dishIngredientsList');
    if (!container) return;
    
    if (tempDishIngredients.length === 0) {
        container.innerHTML = '<div class="empty-message" style="padding: 10px; font-size: 0.8rem;">暂无食材，请添加食材</div>';
    } else {
        container.innerHTML = tempDishIngredients.map((ing, index) => `
            <div class="ingredient-item" style="margin-bottom: 5px; padding: 10px;">
                <span style="font-weight: 500;">${ing.name}</span>
                <span style="color: #6b7280; margin: 0 8px;">${ing.quantity}${ing.unit}</span>
                <button class="btn btn-danger" onclick="removeTempIngredient(${index})" style="padding: 4px 8px;">
                    🗑️
                </button>
            </div>
        `).join('');
    }
}

function removeTempIngredient(index) {
    tempDishIngredients.splice(index, 1);
    renderTempIngredients();
}

function saveDish() {
    const name = document.getElementById('newDishName').value.trim();
    const description = document.getElementById('newDishDescription').value.trim();
    
    if (!name) {
        alert('请输入菜品名称');
        return;
    }
    
    if (tempDishIngredients.length === 0) {
        alert('请至少添加一个食材');
        return;
    }
    
    if (getAllDishes().some(d => d.name === name)) {
        alert('菜品名称已存在，请使用其他名称');
        return;
    }
    
    customDishes.push({
        id: 'custom_' + Date.now(),
        name,
        description,
        ingredients: [...tempDishIngredients]
    });
    
    document.getElementById('newDishName').value = '';
    document.getElementById('newDishDescription').value = '';
    tempDishIngredients = [];
    renderTempIngredients();
    
    saveData();
    renderManageDishes();
    updateQuickDishSelect();
    alert('✅ 菜品添加成功！');
}

function deleteDish(dishId) {
    const dish = customDishes.find(d => d.id === dishId);
    if (!dish) return;
    
    if (confirm(`确定要删除菜品"${dish.name}"吗？\n\n⚠️ 此操作不可撤销`)) {
        customDishes = customDishes.filter(d => d.id !== dishId);
        saveData();
        renderManageDishes();
        updateQuickDishSelect();
        alert('✅ 菜品已删除');
    }
}

// ============ 事件监听 ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 应用启动中...');
    
    loadLocalData();
    renderAll();
    renderManageDishes();
    loadAPIKeys();
    initCamera();
    
    try {
        initWeekCalendar();
    } catch (e) {
        console.error('日历初始化失败:', e);
    }
    
    document.getElementById('addBtn').onclick = addIngredient;
    document.getElementById('clearBtn').onclick = () => {
        if (confirm('确定清空所有食材?')) {
            ingredients = [];
            saveData();
            renderAll();
        }
    };
    
    document.getElementById('copySyncCodeBtn').onclick = copySyncCode;
    document.getElementById('useSyncCodeBtn').onclick = useSyncCode;
    document.getElementById('closeSyncModalBtn').onclick = () => {
        document.getElementById('syncModal').classList.remove('show');
    };
    
    document.getElementById('testDeepSeekBtn').onclick = testDeepSeekConnection;
    document.getElementById('testQwenBtn').onclick = testQwenConnection;
    document.getElementById('askAI').onclick = askAI;
    
    document.getElementById('quickAddBtn').onclick = quickAddDish;
    document.getElementById('prevWeekBtn').onclick = () => changeWeek(-1);
    document.getElementById('nextWeekBtn').onclick = () => changeWeek(1);
    
    document.getElementById('addIngredientToDish').onclick = addIngredientToDish;
    document.getElementById('saveDishBtn').onclick = saveDish;
    
    ['newIngName', 'newIngQuantity'].forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.onkeypress = (e) => {
                if (e.key === 'Enter') addIngredientToDish();
            };
        }
    });
    
    updateSyncIndicator('syncing', '初始化中...');
    
    setTimeout(async () => {
        const syncSuccess = await syncManager.initialize();
        
        if (syncSuccess) {
            updateSyncIndicator('synced', '已同步');
            
            syncManager.listenToChanges((data) => {
                console.log('📥 收到云端数据更新');
                ingredients = data.ingredients || [];
                customDishes = data.customDishes || [];
                weeklyMenu = data.weeklyMenu || {};
                cookedDishes = data.cookedDishes || {};
                renderAll();
            });
            
            const cloudData = await syncManager.loadData();
            if (cloudData) {
                ingredients = cloudData.ingredients || [];
                customDishes = cloudData.customDishes || [];
                weeklyMenu = cloudData.weeklyMenu || {};
                cookedDishes = cloudData.cookedDishes || {};
                renderAll();
            }
        } else {
            updateSyncIndicator('offline', '离线模式');
        }
    }, 100);
    
    console.log('✅ 应用启动完成');
});

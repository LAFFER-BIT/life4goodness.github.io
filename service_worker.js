// Service Worker for 智能冰箱管理系统 PWA
const CACHE_NAME = 'smart-fridge-v1.2';
const urlsToCache = [
    './',
    './enhanced_dish_management_V1.2.html',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// 安装Service Worker
self.addEventListener('install', function(event) {
    console.log('Service Worker: 安装中...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Service Worker: 缓存文件');
                return cache.addAll(urlsToCache);
            })
            .catch(function(error) {
                console.error('Service Worker: 缓存失败', error);
            })
    );
});

// 激活Service Worker
self.addEventListener('activate', function(event) {
    console.log('Service Worker: 激活中...');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: 删除旧缓存', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 拦截网络请求
self.addEventListener('fetch', function(event) {
    // 跳过非HTTP(S)请求
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // 跳过API请求，让它们直接访问网络
    if (event.request.url.includes('api.openai.com') || 
        event.request.url.includes('api.deepseek.com') ||
        event.request.url.includes('firebase') ||
        event.request.url.includes('googleapis')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // 如果缓存中有，直接返回
                if (response) {
                    console.log('Service Worker: 从缓存返回', event.request.url);
                    return response;
                }
                
                // 否则从网络获取
                return fetch(event.request).then(function(response) {
                    // 检查响应是否有效
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // 只缓存GET请求
                    if (event.request.method !== 'GET') {
                        return response;
                    }

                    // 克隆响应用于缓存
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
            .catch(function(error) {
                console.error('Service Worker: 网络请求失败', error);
                // 网络和缓存都失败时的后备方案
                if (event.request.destination === 'document') {
                    return caches.match('./enhanced_dish_management_V1.2.html');
                }
            })
    );
});

// 处理后台同步（可选功能）
self.addEventListener('sync', function(event) {
    console.log('Service Worker: 后台同步事件', event.tag);
    if (event.tag === 'background-sync') {
        event.waitUntil(syncData());
    }
});

// 同步数据函数
function syncData() {
    console.log('Service Worker: 执行后台数据同步');
    // 这里可以实现离线数据同步逻辑
    return Promise.resolve();
}

// 处理推送通知（iOS 16.4+支持）
self.addEventListener('push', function(event) {
    console.log('Service Worker: 收到推送通知');
    
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || '您有新的食材提醒',
            icon: './icons/icon-192x192.png',
            badge: './icons/icon-72x72.png',
            tag: 'smart-fridge-notification',
            data: data.url || './',
            actions: [
                {
                    action: 'open',
                    title: '查看',
                    icon: './icons/icon-72x72.png'
                },
                {
                    action: 'dismiss',
                    title: '忽略'
                }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(
                data.title || '智能冰箱提醒', 
                options
            )
        );
    }
});

// 处理通知点击
self.addEventListener('notificationclick', function(event) {
    console.log('Service Worker: 通知被点击');
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow(event.notification.data || './')
        );
    }
});

// 处理消息传递
self.addEventListener('message', function(event) {
    console.log('Service Worker: 收到消息', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => cache.addAll(event.data.payload))
        );
    }
});

// 错误处理
self.addEventListener('error', function(event) {
    console.error('Service Worker: 发生错误', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
    console.error('Service Worker: 未处理的Promise拒绝', event.reason);
});
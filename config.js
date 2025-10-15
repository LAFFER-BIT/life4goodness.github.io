// 占位模板，运行时会被 CI 生成的文件取代
window.APP_CONFIG = {
  production: {
    firebase: {
      apiKey: "__API_KEY__",
      authDomain: "fitness-management4p.firebaseapp.com",            // 例如 your-project.firebaseapp.com
      projectId: "__PROJECT_ID__",
      storageBucket: "fitness-management4p.firebasestorage.app", // ✅ 正确的存储桶域名
      messagingSenderId: "__MSG_SENDER_ID__",
      appId: "__APP_ID__",
      enabled: true

    },
    leancloud: {
        appId: "U5uEmTjolCTyItwSg6ALj9AV-gzGzoHsz",
        appKey: "dCcxXHLYUwAUSu7S7KVBEMuz",
        serverURL: "https://u5uemtjo.lc-cn-n1-shared.com",
        enabled: true
    },
    defaultSync: 'auto'
    }
};

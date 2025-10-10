// 占位模板，运行时会被 CI 生成的文件取代
window.APP_CONFIG = {
  production: {
    firebase: {
      apiKey: "__API_KEY__",
      authDomain: "__AUTH_DOMAIN__",            // 例如 your-project.firebaseapp.com
      projectId: "__PROJECT_ID__",
      storageBucket: "__PROJECT_ID__.appspot.com", // ✅ 正确的存储桶域名
      messagingSenderId: "__MSG_SENDER_ID__",
      appId: "__APP_ID__"
    }
  }
};

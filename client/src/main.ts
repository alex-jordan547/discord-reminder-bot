import { createApp } from 'vue';
import App from '@/App.vue';
import { createPinia } from 'pinia';
import router from '@/router';
import '@/assets/styles.css';

// Create Vue app instance
const app = createApp(App);

// Add Pinia for state management
app.use(createPinia());

// Add Vue Router
app.use(router);

// Mount the app
app.mount('#app');
import { createApp } from 'vue';
import App from '@/App.vue';
import { createPinia } from 'pinia';
import '@/assets/styles.css';

// Create Vue app instance
const app = createApp(App);

// Add Pinia for state management
app.use(createPinia());

// Mount the app
app.mount('#app');
import { createApp } from 'vue';
import App from './App.vue';

{
  let app = createApp(App);
  app.mount('#container');
}

let body = document.querySelector('body');
window.onscroll = scrape_cache;

function scrape_cache() {
  let screens = (body.scrollHeight - window.scrollY + body.scrollTop)
                / window.innerHeight - 1;
  if(screens > 5) return;
  app.results = app.results.concat(app.result_cache.splice(0, app.results.length));
};

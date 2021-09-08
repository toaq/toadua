const Vue = require('vue').default;
const App = require('./App.vue').default;

let app = global.app = new Vue({
  el: '#main',
  render: h => h(App),
  components: { App },
  template: '<App/>',
}).$children[0];

let body = document.querySelector('body');
window.onscroll = scrape_cache;

function scrape_cache() {
  let screens = (body.scrollHeight - window.scrollY + body.scrollTop)
                / window.innerHeight - 1;
  if(screens > 5) return;
  app.results = app.results.concat(app.result_cache.splice(0, app.results.length));
};

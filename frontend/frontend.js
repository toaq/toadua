const Vue = require('vue').default;
const App = require('./App.vue').default;

let app = global.app = new Vue({
  el: '#main',
  render: h => h(App),
  components: { App },
  template: '<App/>',
}).$children[0];

let body = document.querySelector('body');
window.onscroll = () => {
  let screens = (body.scrollHeight - body.scrollTop)
                / window.innerHeight - 1;
  if(screens < 10 && app.result_cache.length)
    app.result_cache.splice(0, HOW_MANY_AT_ONCE).forEach(
      e => app.results.push(e));
};

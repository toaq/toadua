"use strict";

var app;
var HOW_MANY_AT_A_TIME = 25;
var dismissal = 'aq';
var store = window.localStorage || localStorage ||
  alert("Your browser doesn't support local storage, which is required for the app to function properly. Please consider updating.");

function focus_body() {
  setTimeout(function() {
    var body = document.getElementById('create_body'); 
    body.focus();
  }, 0);
}

var queue = {};
function apisend(what, or, and) {
  if(!and) {
    and = or;
    or = window.alert;
  }
  let req = queue[what.action];
  if(req) req.abort();
  queue[what.action] = req = new XMLHttpRequest();
  req.open('POST', 'api', true);
  if(app && app.token) what.token = app.token;
  req.send(JSON.stringify(what));
  req.onreadystatechange = function() {
    if(this.readyState == 4 && this.status == 200) {
      try {
        var data = JSON.parse(this.responseText);
        if(data.success) and.call(this, data);
        else {
          if(data.error == 'token has expired')
            app.clear_account();
          or(data.error);
        }
      } catch(e) {
        or('mystically bad error');
        console.warn(e);
      }
    }
  };
  return req;
}

function escape(s) {
  var el = document.createElement('p');
  el.innerText = s;
  return el.innerHTML;
}

function replacements(content) {
  return escape(content).replace(/▯/g, '◌')
    // can't use lookbehind due to compat :(
    .replace(/[#@][^\ ]+|&lt;.*?&gt;|\*\*.*?\*\*/g, function(m) {
      // hasty code, plsfix TODO
      var ante = '', post = '';
      var which;
      // note to self: messy patchwork code TODO
      if((which = m.startsWith('&lt;')) || m.startsWith('**')) {
        ante = which ? '&lt;' : '**';
        post = which ? '&gt;' : '**';
        m = m.substring(which ? 4 : 2, m.length - (which ? 4 : 2));
      }
      // this is to support the older `#stuff` format for arbitrary queries
      if(m.match(/^[#@]/) && !m.match(/^(#[A-Za-z0-9_-]+|@[A-Za-z]+)$/)) {
        ante = m[0];
        m = m.substring(1);
      }
      return ante
        + '<a href="#' + encodeURIComponent(m)
        + '" onclick="javascript:void(app.navigate(\''
        + m.replace(/'/g, '\\\'').replace(/"/g, '').replace(/\\/, '\\\\')
        + '\'))">' + m
        + '</a>' + post;
    });
}

app = new Vue({
  el: '#main',
  data: {
    token: null,
    username: null,
    dismissed: false,
    query: decodeURIComponent(window.location.hash.replace(/^#/, '')),
    results: [],
    result_cache: [],
    done_searching: false,
    scroll_up: false,
    count_stat: null,
    limit_search: false,
    scope: 0,
    scopes: ['en', 'toa', 'jbo', 'ja', 'es'],
    login_name: '',
    login_pass: '',
    new_head: '',
    new_body: ''
  },
  computed: {
    scope_name: function() {
      return this.scopes[this.scope];
    },
    search_pholder: function() {
      if(this.count_stat) return 'search ' + this.count_stat + ' words';
      else return 'search';
    },
    what_should_i_say: function() {
      if(this.done_searching)
        if(! this.results.length)
          return 'No results';
        else if(this.result_cache.length)
          return 'Loading more…';
        else return 'No more results';
      else return 'Loading…';
    }
  },
  methods: {
    navigate: function(where) {
      this.query = where;
      this.perform_search();
    },
    process_entry: function(e) {
      if(e.uncollapsed == undefined)
        e.uncollapsed = false;
      e.hesitating = false;
      e.fancy_body = replacements(e.body);
      e.notes.forEach(function(_) {
        _.fancy_content = replacements(_.content);
      });
      return e;
    },
    add_to_history: function(q) {
      if(window.history)
        window.history.replaceState('', '', '#' + this.query);
      else
        window.location.hash = this.query;
    },
    search: function() {
      if(this.current_search_request)
        this.current_search_request.abort();
      this.current_search_request = undefined;
      this.debounced_perform();
    },
    perform_search: function() {
      this.done_searching = false;
      if(queue.search) queue.search.abort();
      this.results = this.result_cache = [];
      if(! this.query) {
        this.add_to_history('');
        this.scroll_up = true;
        return;
      }
      this.current_search_request = apisend({action: 'search',
        query: this.query + (this.limit_search ? ' scope:' + this.scope_name : '')},
        function(data) {
        app.scroll_up = true;
        app.result_cache = data.data.map(app.process_entry);
        app.results = app.result_cache.splice(0, HOW_MANY_AT_A_TIME);
        app.add_to_history(app.query);
        app.done_searching = true;
        app.current_search_request = undefined;
      });
    },
    color_for: function(name) {
      if(name === 'official')
        return 'color: #333;';
      var n = 0;
      for(var i = 0, l = name.length; i < l; ++i)
        n = (((n << 5) - n) + name.charCodeAt(i)) % 360;
      return 'color: hsl(' + n + ', 100%, 30%);';
    },
    remove: function(whom) {
      apisend({action: 'remove', id: whom.id}, function() {
        app.results.splice(app.results.indexOf(whom), 1);
      });
    },
    uncollapse: function(whom) {
      whom.uncollapsed = true;
      // this atrocious and unimaginative code is for focusing the note field
      setTimeout(function() {
        var el = document.getElementById('results').children[app.results.indexOf(whom)].children[2].lastChild.children[1];
        el.focus();
      }, 0);
    },
    vote: function(whom, no) {
      apisend({action: 'vote', id: whom.id, vote: no}, function() {
        app.update_entry(whom);
      });
    },
    score_color: function(n) {
      var positivity = Math.atan(n / 2) / Math.PI * 2;
      return 'color: hsl(' + (60 + 60 * positivity) + ', 100%, 30%)';
    },
    score_number: function(n) {
      if(n > 0) return '+' + n;
      if(n < 0) return '−' + -n;
      return '±';
    },
    note: function(whom) {
      apisend({action: 'note', id: whom.id, content: whom.input}, function() {
        whom.uncollapsed = false;
        whom.input = '';
        app.update_entry(whom);
      });
    },
    create: function() {
      apisend({action: 'create', head: this.new_head, body: this.new_body, scope: this.scope_name}, function(data) {
        app.new_head = app.new_body = '';
        document.querySelector('#create_body').style.height = 24;
        app.navigate('#' + data.data);
      })
    },
    update_limit_search: function() {
      this.limit_search = !this.limit_search;
      store.setItem('limit_search', JSON.stringify(this.limit_search));
    },
    update_scope: function() {
      this.scope = (this.scope + 1) % this.scopes.length;
      store.setItem('scope', this.scopes[this.scope]);
    },
    update_entry: function(whom) {
      apisend({action: 'info', id: whom.id}, function(data) {
        for(var p in data.data)
          if(Object.hasOwnProperty.call(data.data, p))
            whom[p] = data.data[p];
        app.process_entry(whom);
      });
    },
    new_word: function() {
      this.new_head = this.query;
      this.navigate('');
      focus_body();
    },
    fork: function(whom) {
      this.new_head = whom.head;
      this.new_body = whom.body;
      this.navigate('');
      focus_body();
    },
    account: function(func) {
      apisend({action: func, name: this.login_name, pass: this.login_pass}, function(data) {
        app.token = data.token;
        store.setItem('token', app.token);
        app.whoami();
      });
    },
    clear_account: function() {
      app.token = app.username = undefined;
      store.removeItem('token');
    },
    logout: function() {
      apisend({action: 'logout'}, this.clear_account, this.clear_account);
    },
    whoami: function() {
      apisend({action: 'whoami', token: this.token}, function(data) {
        app.count_stat = data.count;
        app.username = data.data;
        if(! app.username) app.token = null;
        else app.perform_search();
      });
    },
    dismiss: function() {
      store.setItem('welcome', dismissal);
      this.dismissed = true;
    }
  },
  created: function() {
    this.debounced_perform = debounce(function() {
      app.perform_search();
    }, 300);
    this.perform_search();
    this.token = store.getItem('token') || store.getItem('id');
    this.dismissed = store.getItem('welcome') == dismissal;
    this.limit_search = store.getItem('limit_search') == 'true';
    this.scope = this.scopes.indexOf(store.getItem('scope'));
    if(this.scope == -1) this.scope = 0;
    this.whoami();
  },
  updated: function() {
    if(this.scroll_up) {
      this.scroll_up = false;
      document.querySelector('body').scrollTop = 0;
    }
    // This one has to be called dynamically because of Vue hiding it every now and then
    resize();
  }
});

function resize() {
  var create = document.getElementById('create_body');
  if(! create) return;
  var clone = create.cloneNode();
  create.parentNode.insertBefore(clone, create);
  clone.style.visibility = 'hidden';
  // clone.style.position = 'absolute';
  clone.style.height = 'auto';
  // clone.style.width = create.scrollWidth + 'px';
  clone.value = create.value;
  var u = clone.scrollTop + clone.scrollHeight;
  if(u > 40) u += 1;
  create.style.height = u + 'px';
  clone.parentNode.removeChild(clone);
}

function debounce(f, ms) {
  var timeout;
  return function() {
    if(timeout)
      clearTimeout(timeout);
    var args = arguments;
    timeout = setTimeout(function() {
      timeout = undefined;
      f.apply(args);
    }, ms);
  }
}

var body = document.querySelector('body');
window.onscroll = function() {
  var screens = (body.scrollHeight - body.scrollTop) / window.innerHeight - 1;
  if(screens < 10 && app.result_cache.length) {
    app.result_cache.splice(0, HOW_MANY_AT_A_TIME).forEach(function(e) {
      app.results.push(e);
    });
  }
};

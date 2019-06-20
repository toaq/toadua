var HOW_MANY_AT_A_TIME = 25;
var dismissal = 'ack';
var store = window.localStorage || localStorage ||
  alert("Your browser doesn't support local storage, which is required for the app to function properly. Please consider updating.");

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
  req.send(JSON.stringify(what));
  req.onreadystatechange = function() {
    if(this.readyState == 4 && this.status == 200) {
      try {
        var data = JSON.parse(this.responseText);
        if(data.success) and.call(this, data);
        else or(data.error);
      } catch(e) {
        or('mystically bad error');
        console.warn(e);
      }
    }
  };
}

function escape(s) {
  var el = document.createElement('p');
  el.innerText = s;
  return el.innerHTML;
}

function replacements(content) {
  return escape(content).replace(/▯/g, '◌')
    // can't use lookbehind due to compat :(
    .replace(/[#@][^\ ]+|&lt;.*?&gt;/g, function(m) {
      // hasty code, plsfix
      var ante = '', post = '';
      if(m.startsWith('&lt;')) {
        ante = '&lt;';
        post = '&gt;';
        m = m.substring(4, m.length - 4);
      }
      // this is to support the older `#stuff` format for arbitrary queries
      if(! m.match(/^[A-Za-z0-9#@_-]+$/) && m.startsWith('#'))
        m = m.substring(1);
      return ante + (m.match(/^[#@]/) ? m.charAt(0) : '')
        + '<a href="#' + encodeURIComponent(m)
        + '" onclick="javascript:void(app.navigate(\''
        + m.replace(/'/g, '\\\'').replace(/"/g, '').replace(/\\/, '\\\\')
        + '\'))">'
        + escape(m.match(/^[#@]/) ? m.substring(1) : m) + '</a>' + post;
    });
}

var app = new Vue({
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
    login_name: '',
    login_pass: '',
    new_head: '',
    new_body: ''
  },
  computed: {
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
      e.uncollapsed = e.hesitating = false;
      e.fancy_body = replacements(e.body);
      e.comments.forEach(function(_) {
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
    perform_search: function() {
      this.done_searching = false;
      if(queue.search) queue.search.abort();
      this.results = this.result_cache = [];
      if(! this.query) {
        this.add_to_history('');
        this.scroll_up = true;
        return;
      }
      apisend({action: 'search', query: this.query}, function(data) {
        app.scroll_up = true;
        app.result_cache = data.data.map(app.process_entry);
        app.results = app.result_cache.splice(0, HOW_MANY_AT_A_TIME);
        app.add_to_history(app.query);
        app.done_searching = true;
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
      apisend({action: 'remove', token: this.token, id: whom.id}, function() {
        app.results.splice(app.results.indexOf(whom), 1);
      });
    },
    uncollapse: function(whom) {
      whom.uncollapsed = true;
      // this atrocious and unimaginative code is for focusing the comment field
      setTimeout(function() {
        document.getElementById('results').children[app.results.indexOf(whom)].children[2].lastChild.children[1].focus();
      }, 0);
    },
    comment: function(whom) {
      apisend({action: 'comment', token: this.token, id: whom.id, content: whom.input}, function() {
        whom.uncollapsed = false;
        apisend({action: 'info', id: whom.id}, function(data) {
          whom.comments = data.data.comments;
          app.process_entry(whom);
        });
      });
    },
    create: function() {
      apisend({action: 'create', token: this.token, head: this.new_head, body: this.new_body}, function(data) {
        app.new_head = app.new_body = '';
        document.querySelector('#create_body').style.height = 24;
        app.navigate('#' + data.data);
      })
    },
    new_word: function() {
      this.new_head = this.query;
      this.new_body = '';
      this.navigate('');
      setTimeout(function() {
        document.getElementById('create_body').focus();
      }, 0);
    },
    fork: function(whom) {
      this.new_head = whom.head;
      this.new_body = whom.body; // .replace(/◌/g, '___');
      this.navigate('');
      setTimeout(function() {
        document.getElementById('create_body').focus();
      }, 0);
    },
    account: function(func) {
      apisend({action: func, name: this.login_name, pass: this.login_pass}, function(data) {
        app.token = data.token;
        store.setItem('token', app.token);
        app.whoami();
      });
    },
    logout: function() {
      var either_way = function() {
        app.token = app.username = undefined;
        store.removeItem('token');
      };
      apisend({action: 'logout', token: this.token}, either_way, either_way);
    },
    whoami: function() {
      apisend({action: 'whoami', token: this.token}, function(data) {
        app.count_stat = data.count;
        app.username = data.data;
        if(! app.username) app.token = null;
      });
    },
    dismiss: function() {
      store.setItem('welcome', dismissal);
      this.dismissed = true;
    }
  },
  created: function() {
    this.perform_search();
    this.token = store.getItem('token') || store.getItem('id');
    this.dismissed = store.getItem('welcome') == dismissal;
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

var body = document.querySelector('body');
window.onscroll = function() {
  var screens = (body.scrollHeight - body.scrollTop) / window.innerHeight - 1;
  if(screens < 10 && app.result_cache.length) {
    app.result_cache.splice(0, HOW_MANY_AT_A_TIME).forEach(function(e) {
      app.results.push(e);
    });
  }
};

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

function get_cookie(name) {
  var finding = document.cookie.split(/;\ ?/)
    .map(_ => _.split('='))
    .filter(_ => _[0] == name)[0];
  return finding && finding[1];
}
function set_cookie(name, value) {
  document.cookie = name + "=" + value;
}

var app = new Vue({
  el: '#main',
  data: {
    token: undefined,
    username: undefined,
    dismissed: false,
    query: decodeURIComponent(window.location.hash.replace(/^#/, '')),
    results: [],
    done_searching: false,
    count_stat: null,
    login_name: '',
    login_pass: '',
    new_head: '',
    new_body: ''
  },
  computed: {
    search_pholder: function() {
      if(this.count_stat) return 'search in ' + this.count_stat + ' entries';
      else return 'search';
    }
  },
  methods: {
    navigate: function(where) {
      this.query = where;
      this.perform_search();
    },
    process_entry: function(e) {
      e.uncollapsed = e.hesitating = false;
      e.body = e.body.replace(/▯/g, '◌');
      e.comments.forEach(function(_) {
        _.content = _.content.replace(/▯/g, '◌');
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
      if(! this.query) {
        this.add_to_history('');
        return this.results = [];
      }
      apisend({action: 'search', query: this.query}, function(data) {
        app.results = data.data.map(app.process_entry);
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
    uncollapse: function(e, whom) {
      whom.uncollapsed = true;
    },
    hesitate: function(whom) {
      whom.hesitating = true;
    },
    remove: function(whom) {
      apisend({action: 'remove', token: this.token, id: whom.id}, function() {
        app.results.splice(app.results.indexOf(whom), 1);
      });
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
        app.navigate('#' + data.data);
      })
    },
    fork: function(whom) {
      this.navigate('');
      this.new_head = whom.head;
      this.new_body = whom.body.replace(/◌/g, '___');
    },
    account: function(func) {
      apisend({action: func, name: this.login_name, pass: this.login_pass}, function(data) {
        app.token = data.token;
        set_cookie('token', app.token);
        app.whoami();
      });
    },
    logout: function() {
      var either_way = function() {
        app.token = app.username = undefined;
        set_cookie('token', '');
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
      set_cookie('welcome', 'no');
      this.dismissed = true;
    }
  },
  created: function() {
    this.perform_search();
    this.token = get_cookie('token') || get_cookie('id');
    this.dismissed = !! get_cookie('welcome');
    this.whoami();
  }
});

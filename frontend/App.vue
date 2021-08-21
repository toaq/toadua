<template>
  <div>
    <nav id="menu">
      <div>
        <input type="text" id="search" placeholder="search!" v-model="query" @input.lazy="search" autocomplete="off" autofocus><!--
        --><input type="button" id="cancel" value="×" v-if="query" @click="navigate('')">
      </div>
    </nav>
    <div id="spacer"></div>
    <div id="results">
      <div class="card" v-for="result in results">
        <div class="title">
          <h2>
            <a :href="'#' + result.head" class="name" @click="navigate(result.head)">{{result.head}}</a>
            <span class="info">
              <a :href="'#scope:' + result.scope" class="scope" @click="navigate('scope:' + result.user)">{{result.scope}}</a>
              <a :href="'#@' + result.user" :style="color_for(result.user)" @click="navigate('@' + result.user)">{{result.user}}</a>
              <a :href="'##' + result.id" @click="navigate('#' + result.id)">#{{result.id}}</a>
              <span :style="score_color(result.score)">{{score_number(result.score)}}</span>
            </span>
          </h2>
        </div>
        <p class="body" v-html="result.fancy_body"></p>
        <div class="notes">
          <p class="note" v-for="note in result.notes">
            <span :style="color_for(note.user)" class="note-author" @click="navigate('@' + note.user)">{{note.user}}</span><span v-html="note.fancy_content"></span>
          </p>
          <p class="note new_note" v-if="result.uncollapsed">
            <span :style="color_for(username)" class="note-author">{{username}}</span><input type="text" placeholder="your note?…" :value.sync="result.input" @input="$event.target.value = result.input = replacements($event.target.value, true, true)">
          </p>
        </div>
        <ul class="controls" v-if="username">
               <li v-if="! result.uncollapsed">
            <input type="button" value="add note" @click="uncollapse(result)">
          </li><li v-if="result.uncollapsed">
            <input type="button" value="submit"   @click="note(result)">
          </li><li v-if="result.vote != +1">
            <input type="button" value="+"        @click="vote(result, +1)">
          </li><li v-if="result.vote !=  0">
            <input type="button" value="±"        @click="vote(result,  0)">
          </li><li v-if="result.vote != -1">
            <input type="button" value="−"        @click="vote(result, -1)">
          </li><li v-if="username == result.user && !result.hesitating">
            <input type="button" value="remove"   @click="result.hesitating = true">
          </li><li v-if="result.hesitating">
            <input type="button" value="sure?"    @click="remove(result)">
          </li><li>
            <input type="button" value="fork"     @click="fork(result)">
          </li>
        </ul>
      </div>
    </div>
    <div class="card" v-if="query || results.length">
      <h2 class="name" style="color: #333">{{what_should_i_say}}</h2>
      <ul class="controls" v-if="done_searching && username">
        <li>
          <input type="button" :value="'create ‘' + query + '’?'" @click="new_word">
        </li>
      </ul>
    </div>
    <div class="card" id="welcome" v-if="!dismissed && !query.length && motd.length">
      <h2 v-html="motd[0]">Toadua</h2>
      <p v-for="par in motd.slice(1)" v-html="par"></p>
    </div>
    <div class="card" id="create" v-if="username && (done_searching || !query) && ! results.length">
      <div class="title">
        <input type="text" id="create_name" class="name" placeholder="Create new entry" :value.sync="new_head" @input="$event.target.value = new_head = normalize($event.target.value, false)">
      </div>
      <textarea id="create_body" class="body" rows="1" placeholder="Type in the Toaq word above and the definition here" :value.sync="new_body" @input="$event.target.value = new_body = replacements($event.target.value, true, true)"></textarea>
      <ul class="controls">
        <li><input type="submit" :value="'submit to ' + scope_name" class="submit" @click="create"></li><!--
        --><li v-if="new_head || new_body"><input type="button" value="clear" @click="new_head = new_body = ''"></li>
      </ul>
    </div>
    <div class="card" id="login" v-if="!(username || query)">
      <h2>Access</h2>
      <form>
        <div id="login_username"><input id="input_username" type="text" placeholder="username" v-model="login_name" autocomplete="username"></div>
        <div id="login_password"><input id="input_password" type="password" placeholder="password" v-model="login_pass" autocomplete="current-password"></div>
      </form>
      <ul class="controls">
           <li><input type="submit" value="login"    @click="account('login'   )"></li><!--
        --><li><input type="button" value="register" @click="account('register')"></li>
      </ul>
    </div>
    <div class="card" id="logout" v-if="! query">
      <span class="controls-left">Toadua{{version ? ` v${version}` : ''}}</span>
      <ul class="controls">
        <li v-if="username">logged in as <b :style="color_for(username)">{{username}}</b></li><!--
        --><li>limit search to {{scope_name}}:&thinsp;<input type="button" :value="limit_search ? 'yes' : 'no'" class="submit" @click="update_limit_search"></li><!--
        --><li>scope:&thinsp;<input type="button" :value="scope_name" class="submit" @click="update_scope"></li><!--
        --><li v-if="username"><input type="button" value="logout" class="submit" @click="logout"></li>
      </ul>
    </div>
  </div>
</template>

<script>
const debounce = require('lodash/debounce');
const shared = require('../shared/shared.js');
let methods = {};

methods.score_color  = s => shared.score_color(s).css;
methods.color_for    = s => shared.color_for  (s).css;
methods.score_number = shared.score_number;
methods.normalize    = shared.normalize;

const HOW_MANY_AT_ONCE = 25;
const character_operators = {'/': 'arity', '@': 'user', '#': 'id'};

methods.focus_body = function focus_body() {
  setTimeout(() => {
    let body = document.getElementById('create_body'); 
    body.focus();
  }, 0);
}

methods.apisend = function apisend(what, or, and) {
  if(!and) {
    and = or;
    or = window.alert;
  }
  let req = this.queue[what.action];
  if(req) req.abort();
  this.queue[what.action] = req = new XMLHttpRequest();
  req.open('POST', 'api', true);
  if(this && this.token) what.token = this.token;
  req.send(JSON.stringify(what));
  let app = this;
  req.onreadystatechange = function() {
    if(this.readyState === 4 && this.status === 200) {
      try {
        let data = JSON.parse(this.responseText);
        if(data.success)
          setTimeout(() => and(data), 0);
        else {
          if(data.error === 'token has expired')
            app.clear_account();
          setTimeout(() => or(data.error), 0);
        }
      } catch(e) {
        or('mystically bad error');
        console.warn(e);
      }
    }
  };
  return req;
}

methods.escape = function escape(s) {
  let el = document.createElement('p');
  el.innerText = s;
  return el.innerHTML;
}

methods.replacements = function replacements(content, still_editing, plain_text) {
  return (plain_text ? content : this.escape(content)).replace(/▯|___/g, still_editing ? '▯' : '◌')
    .replace(plain_text
      ? /[#@][0-9a-zA-Z_]+|<.*?>|\*\*.*?(\*{2})|\*\*.*/g
      : /[#@][0-9a-zA-Z_]+|&lt;.*?&gt;|\*\*.*?(\*{2})|\*\*.*/g, (m, ending) => {
      // hasty code, plsfix TODO
      let ante = '', post = '';
      let which;
      // note to self: messy patchwork code TODO
      if((which = m.startsWith('&lt;') || m.startsWith('<')) || m.startsWith('**')) {
        ante = which ? plain_text ? '<' : '&lt;' : '**';
        post = which ? plain_text ? '>' : '&gt;' : (ending || '');
        m = m.substring(ante.length, m.length - post.length);
      }

      if(still_editing)
        if(ante == '**')
          return ante + this.normalize(m, post === '**') + post;
        else
          return ante + m + post;
      else
        return ante
          + '<a href="#' + encodeURIComponent(m)
          + '" onclick="javascript:void(this.navigate(\''
          + m.replace(/'/g, '\\\'')
             .replace(/"/g, '')
             .replace(/\\/, '\\\\')
          + '\'))"'
          + (ante == '@' ? ` style="${shared.color_for(m).css}"` : '')
          + '>' + m + '</a>' + post;
    });
}

methods.navigate = function navigate(where) {
  this.dismissed = true;
  this.query = where;
  this.perform_search();
}

methods.process_entry = function process_entry(e) {
  if(e.uncollapsed === undefined)
    e.uncollapsed = false;
  e.hesitating = false;
  e.fancy_body = this.replacements(e.body, false, true);
  e.notes.forEach(_ => _.fancy_content = this.replacements(_.content, false, true));
  return e;
}

methods.add_to_history = function add_to_history() {
  if(window.history)
    window.history.replaceState('', '', '#' + this.query);
  else
    window.location.hash = this.query;
}

methods.search = function search() {
  if(this.current_search_request)
    this.current_search_request.abort();
  this.current_search_request = undefined;
  this.debounced_perform();
}

methods.parse_query = function parse_query() {
  let parts = this.query.split(/ /)
    .map(a => {
    let parts = a.split(/\|/).map(b => {
      let negative, what;
      if(negative = (b[0] === '!'))
        b = b.substring(1);
      let parts = b.split(':');
      if(parts.length === 2)
        what = [parts[0],
                parts[0] === 'arity' ? parseInt(parts[1], 10) || 0
                                     : parts[1]];
      else {
        parts = b.split(/(?=[\/@#])/);
        let operations = [];
        if(!parts[0].match(/^[\/@#]/))
          operations.push(['term', parts.shift()]);
        for(let i = 0; i < parts.length; ++i) {
          let rest = parts[i].substring(1);
          operations.push([character_operators[parts[i][0]],
            parts[i][0] === '/' ? parseInt(rest, 10) || 0
                                : rest]);
        }
        what = operations.length > 1
          ? ['and'].concat(operations) : operations[0];
      }
      return negative ? ['not', what] : what;
    });
    if(parts.length > 1)
      return ["or"].concat(parts);
    else return parts[0];
  });
  if(parts.length > 1)
    return ["and"].concat(parts);
  else return parts[0];
}

methods.perform_search = function perform_search() {
  this.done_searching = false;
  if(this.queue.search) this.queue.search.abort();
  this.results = this.result_cache = [];
  if(! this.query) {
    this.add_to_history('');
    this.scroll_up = true;
    return;
  }
  let parsed_query = this.parse_query();
  if (this.limit_search) parsed_query = ['and', ['scope', this.scope_name], parsed_query];
  this.current_search_request = this.apisend(
    {action: 'search', query: parsed_query},
    data => {
      this.scroll_up = true;
      this.result_cache = data.results.map(this.process_entry);
      this.results = this.result_cache.splice(0, HOW_MANY_AT_ONCE);
      this.add_to_history(this.query);
      this.done_searching = true;
      this.current_search_request = undefined;
    });
}

methods.remove = function remove(whom) {
  this.apisend({action: 'remove', id: whom.id}, () =>
    this.results.splice(this.results.indexOf(whom), 1));
}

methods.uncollapse = function uncollapse(whom) {
  whom.uncollapsed = true;
  // this atrocious and unimaginative code is for focusing the
  // note field – TODO
  setTimeout(() => {
    let el = document.getElementById('results')
      .children[this.results.indexOf(whom)]
      .children[2].lastChild.children[1];
    el.focus();
  }, 0);
}

methods.vote = function vote(whom, no) {
  this.apisend({action: 'vote', id: whom.id, vote: no}, 
    data => this.update_entry(whom, data.entry));
}

methods.note = function note(whom) {
  this.apisend({action: 'note', id: whom.id, content: whom.input}, data => {
    whom.uncollapsed = false;
    whom.input = '';
    this.update_entry(whom, data.entry);
  });
}

methods.create = function create() {
  this.apisend({action: 'create', head: this.new_head,
      body: this.new_body, scope: this.scope_name}, data => {
    this.new_head = this.new_body = '';
    document.querySelector('#create_body').style.height = 24;
    this.done_searching = this.dismissed = true;
    this.add_to_history(this.query = '#' + data.entry.id);
    this.results = [this.process_entry(data.entry)];
  })
}

methods.update_limit_search = function update_limit_search() {
  this.limit_search = !this.limit_search;
  this.store.setItem('limit_search',
    JSON.stringify(this.limit_search));
}

methods.update_scope = function update_scope() {
  this.scope = (this.scope + 1) % this.scopes.length;
  this.store.setItem('scope', this.scopes[this.scope]);
}

methods.update_entry = function update_entry(whom, what_with) {
  for(let p in what_with)
    if(Object.hasOwnProperty.call(what_with, p))
      whom[p] = what_with[p];
  this.process_entry(whom);
}

methods.new_word = function new_word() {
  this.new_head = this.query;
  this.navigate('');
  focus_body();
}

methods.fork = function fork(whom) {
  this.new_head = whom.head;
  this.new_body = whom.body;
  this.navigate('');
  focus_body();
}

methods.account = function account(func) {
  this.apisend({action: func, name: this.login_name,
      pass: this.login_pass}, data => {
    this.token = data.token;
    this.store.setItem('token', this.token);
    this.username = this.login_name;
    this.login_name = this.login_pass = '';
  });
}

methods.clear_account = function clear_account() {
  this.token = this.username = undefined;
  this.store.removeItem('token');
}

methods.logout = function logout() {
  this.apisend({action: 'logout'}, this.clear_account, this.clear_account);
}

methods.welcome = function welcome() {
  this.apisend({action: 'welcome', token: this.token}, data => {
    this.username = data.name;
    this.motd = data.motd;
    if(!data.name) this.token = null;
    else this.perform_search();
  });
}

methods.resize = function resize() {
  let create = document.getElementById('create_body');
  if(! create) return;
  let clone = create.cloneNode();
  create.parentNode.insertBefore(clone, create);
  clone.style.visibility = 'hidden';
  // clone.style.position = 'absolute';
  clone.style.height = 'auto';
  // clone.style.width = create.scrollWidth + 'px';
  clone.value = create.value;
  let u = clone.scrollTop + clone.scrollHeight;
  if(u > 40) u += 1;
  create.style.height = u + 'px';
  clone.parentNode.removeChild(clone);
}

module.exports = {
  methods,
  data() {
    return {
      dismissed: false,
      done_searching: false,
      limit_search: false,
      login_name: '',
      login_pass: '',
      motd: ['Toadua'],
      new_head: '',
      new_body: '',
      query: decodeURIComponent(window.location.hash.replace(/^#/, '')),
      queue: {},
      result_cache: [],
      results: [],
      scope: 0,
      scopes: ['en', 'toa', 'jbo', 'ja', 'es'],
      scroll_up: false,
      store: window.localStorage ||
        (alert("Your browser doesn't support local storage, " +
              "which is required for the app to function properly. " +
              "Please consider updating."), null),
      token: null,
      username: null,
      version: require('../package.json').version || null,
    };
  },
  computed: {
    scope_name() {
      return this.scopes[this.scope];
    },
    what_should_i_say() { return (
      this.done_searching
        ? this.results.length
          ? this.result_cache.length
            ? 'Loading more…'
            : 'No more results'
          : 'No results'
        : 'Loading…'
    )},
  },
  created() {
    this.debounced_perform = debounce(() => this.perform_search(), 300);
    this.perform_search();
    let token = this.token = this.store.getItem('token');
    this.limit_search = this.store.getItem('limit_search') == 'true';
    this.scope = this.scopes.indexOf(this.store.getItem('scope'));
    if(this.scope === -1) this.scope = 0;
    this.welcome(token);
  },
  updated() {
    if(this.scroll_up) {
      this.scroll_up = false;
      document.querySelector('body').scrollTop = 0;
    }
    // This one has to be called dynamically because of Vue hiding it
    // every now and then
    this.resize();
  },
};
</script>

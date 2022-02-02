<template>
  <div id=container>
    <nav id=menu>
      <div id=control-row>
        <ul id=top-controls class=controls>
          <li v-if=username>logged in as <span :style="color_for(username)">{{username}}</span></li><!--
          --><li><label for=limit-search>search scope ‘<span style="font-family: var(--heading-font); color: hsl(210deg, 75%, 25%);">{{scope}}</span>’ only:</label>&thinsp;<input id=limit-search type=button :value="limit_search ? 'yes' : 'no'" class=submit @click=update_limit_search tabindex=8></li><!--
          --><li v-if=username><input type=button value=logout class=submit @click=logout tabindex=9></li>
        </ul>
      </div>
      <div id=search-row>
        <input type=button value=" "><!--
        --><input type=text id=search placeholder="search!" v-model=query @input.lazy=search autocomplete=off spellcheck=off tabindex=1><!--
        --><input type=button id=cancel value="×" v-show=query @click="navigate(''); focus_search()" tabindex=2>
      </div>
    </nav>
    <div id=results>
      <div class=card v-for="result in results">
        <div class=title>
          <h2>
            <a :href="'#' + result.head" class=name @click="navigate(result.head)">{{result.head}}</a>
            <span class=info>
              <a :href="'#scope:' + result.scope" class=scope @click="navigate('scope:' + result.user)">{{result.scope}}</a>
              <a :href="'#@' + result.user" :style="color_for(result.user)" @click="navigate('@' + result.user)">{{result.user}}</a>
              <a :href="'##' + result.id" @click="navigate('#' + result.id)">#{{result.id}}</a>
              <span :style="score_color(result.score)">{{score_number(result.score)}}</span>
            </span>
          </h2>
        </div>
        <p class=body v-html="result.fancy_body"></p>
        <div class=notes>
          <p class=note v-for="note in result.notes">
            <span :style="color_for(note.user)" class=note-author @click="navigate('@' + note.user)">{{note.user}}</span><span v-html="note.fancy_content"></span>
          </p>
          <form style="display: contents;" action="javascript:void('note')" v-if="result.uncollapsed" @keypress.13.prevent="note(result)" autocomplete=off>
            <div class=note>
              <span :style="color_for(username)" class=note-author>{{username}}</span>
              <input type=submit value=submit class=note-submit
                @click="note(result)"
                :disabled="!result.input">
            </div>
            <p class="note new_note">
              <input type=text autofocus
                autocomplete=off
                placeholder="comment here"
                v-model="result.input"
                @input="$event.target.value
                      = result.input
                      = replacements($event.target.value, true, true)">
            </p>
          </form>
        </div>
        <ul class=controls v-if=username>
          <li v-if="!result.uncollapsed">
            <input type=button
              value="add note"
              @click="results.forEach(r => r.uncollapsed = false); result.uncollapsed = true">
              <!-- TODO: for some reason this doesn't work on second, third… try. jfc -->
          </li><li>
            <input type=button value="+"
              @click="vote(result, +1)"
              :disabled="result.vote == +1">
          </li><li>
            <input type=button value="±"
              @click="vote(result, 0)"
              :disabled="result.vote == 0">
          </li><li>
            <input type=button value="−"
              @click="vote(result, -1)"
              :disabled="result.vote == -1">
          </li><li v-if="username == result.user && !result.hesitating">
            <input type=button value="remove"
              @click="result.hesitating = true; setTimeout(() => result.hesitating = false, 2000)">
          </li><li v-if="result.hesitating">
            <input type=button value="sure?"
              @click="remove(result)">
          </li><li>
            <input type=button value="fork"
              @click="fork(result)">
          </li>
        </ul>
      </div>
    </div>
    <div class=card v-if="query || results.length">
      <h2 class=name style="color: #333">{{what_should_i_say}}</h2>
      <ul class=controls v-if="done_searching && username && !query.startsWith('#')">
        <li>
          <input type=button :value="'create ‘' + query + '’?'" @click=new_word>
        </li>
      </ul>
    </div>
    <form class=card id=create action="javascript:void('create')"
      v-show="username && (done_searching || !query) && !results.length"
      autocomplete=off>
      <div class=title>
        <input type=text id=create_name class=name
          placeholder="Create new entry"
          @input="$event.target.value = new_head = normalize($event.target.value, false)"
          :value.sync=new_head
          autocomplete=off autocorrect=off autocapitalize=off spellcheck=false
          tabindex=3>
      </div>
      <textarea class=body id=create_body rows=1
        placeholder="Type in the Toaq word above and the definition here"
        @input="$event.target.value = new_body = replacements($event.target.value, true, true)"
        @keypress.exact.13=create
        @keypress.shift.13=""
        :value.sync=new_body
        autocomplete=off autocorrect=on autocapitalize=on spellcheck=true
        tabindex=4></textarea>
      <span class=controls-left id=scope-editor>
           <label for=scope>scope:</label>&thinsp;<!--
        --><input type=text size=5
            v-model=scope id=scope
            autocomplete=language
            list=common-languages
            value=en tabindex=7><!--
        --><datalist id=common-languages>
             <option value=en />
             <option value=toa />
             <option value=ja />
             <option value=jbo />
             <option value=fr />
           </datalist>
      </span>
      <ul class=controls>
        <li>
          <input type=submit value=submit class=submit
            @click=create
            :disabled="!(new_head && new_body)"
            tabindex=4>
        </li><li>
          <input type=button value=clear
            @click="new_head = new_body = ''"
            :disabled="!(new_head || new_body)"
            tabindex=5>
        </li>
      </ul>
    </form>
    <form class=card id=login v-show="!(username || query)"
      action="javascript:void('login')" autocomplete=on>
      <h2>Access</h2>
      <div id=login_username><input id=input_username type=text
        placeholder=username v-model=login_name autocomplete=username tabindex=3></div>
      <div id=login_password><input id=input_password type=password
        placeholder=password v-model=login_pass autocomplete=current-password tabindex=4></div>
      <ul class=controls>
           <li><input type=submit value=login    @click="account('login'   )" :disabled="!(login_name && login_pass)" tabindex=5></li><!--
        --><li><input type=button value=register @click="account('register')" :disabled="!(login_name && login_pass)" tabindex=6></li>
      </ul>
    </form>
  </div>
</template>

<script>
const debounce = require('lodash/debounce');
const shared = require('../shared/shared.js');
let methods = { setTimeout };

methods.score_color  = s => shared.score_color(s).css;
methods.color_for    = s => shared.color_for  (s).css;
methods.score_number = shared.score_number;
methods.normalize    = shared.normalize;

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
      ? /[#@][0-9a-zA-Z_-]+|<.*?>|\*\*.*?(\*{2})|\*\*.*/g
      : /[#@][0-9a-zA-Z_-]+|&lt;.*?&gt;|\*\*.*?(\*{2})|\*\*.*/g, (m, ending) => {
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
          + '" onclick="javascript:void(app.navigate(\''
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
  let ordering;
  let parts = this.query.split(/ /)
    .map(a => {
    let parts = a.split(/\|/).map(b => {
      let negative, what;
      if(negative = (b[0] === '!'))
        b = b.substring(1);
      let parts = b.split(':');
      if(parts.length === 2)
        if(parts[0] == 'order') {
          ordering = parts[1];
          return ["and"];
        } else what = [parts[0], parts[0] === 'arity'
                                 ? parseInt(parts[1], 10) || 0
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
  let query;
  if(parts.length > 1)
    query = ["and"].concat(parts);
  else query = parts[0];
  return { query, ordering };
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
  if (this.limit_search) parsed_query.query = ['and', ['scope', this.scope], parsed_query.query];
  parsed_query.action = 'search';
  this.current_search_request = this.apisend(
    parsed_query,
    data => {
      this.scroll_up = true;
      this.result_cache = data.results.map(this.process_entry);
      this.results = this.result_cache.splice(0, this.initial_result_count);
      this.add_to_history(this.query);
      this.done_searching = true;
      this.current_search_request = undefined;
    });
}

methods.remove = function remove(whom) {
  this.apisend({action: 'remove', id: whom.id}, () =>
    this.results.splice(this.results.indexOf(whom), 1));
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
      body: this.new_body, scope: this.scope}, data => {
    this.new_head = this.new_body = '';
    document.querySelector('#create_body').style.height = 24;
    this.done_searching = this.dismissed = true;
    this.add_to_history(this.query = '#' + data.entry.id);
    this.results = [this.process_entry(data.entry)];
  })
}

methods.update_limit_search = function update_limit_search() {
  this.limit_search = !this.limit_search;
  this.store.setItem('limit_search', this.limit_search ? "true" : "" /* death */);
  this.perform_search();
}

methods.update_entry = function update_entry(whom, what_with) {
  for(let p in what_with)
    if(Object.hasOwnProperty.call(what_with, p))
      whom[p] = what_with[p];
  this.process_entry(whom);
}

methods.new_word = function new_word() {
  this.new_head = this.normalize(this.query, true);
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

methods.focus_search = function focus_search() {
  document.getElementById('search').focus();
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
      new_head: '',
      new_body: '',
      query: decodeURIComponent(window.location.hash.replace(/^#/, '')),
      queue: {},
      result_cache: [],
      initial_result_count: 25,
      results: [],
      scope: "en",
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
  watch: {
    scope(scope) {
      this.store.setItem('scope', scope);
    },
  },
  created() {
    this.debounced_perform = debounce(() => this.perform_search(), 250, {maxWait: 500});
    this.perform_search();
    for(let k of ['token', 'limit_search', 'scope'])
      this[k] = this.store.getItem(k) || this[k];
    this.welcome(this.token);
  },
  mounted() {
    this.focus_search();
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

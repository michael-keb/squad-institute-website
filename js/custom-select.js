/**
 * Accessible custom select — keeps native <select> for form submit / validation.
 */
(function () {
  var OPEN = [];

  function closeAll(except) {
    OPEN.forEach(function (wrap) {
      if (wrap !== except) closeMenu(wrap);
    });
  }

  function closeMenu(wrap) {
    wrap.classList.remove('is-open');
    wrap._trigger.setAttribute('aria-expanded', 'false');
    wrap._menu.hidden = true;
    wrap._options.forEach(function (li) {
      li.classList.remove('is-focused');
    });
  }

  function openMenu(wrap) {
    closeAll(wrap);
    wrap.classList.add('is-open');
    wrap._trigger.setAttribute('aria-expanded', 'true');
    wrap._menu.hidden = false;
    var selected = wrap._menu.querySelector('.cs-option.is-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function syncDisplay(wrap) {
    var select = wrap._select;
    var opt = select.options[select.selectedIndex];
    var text = opt ? opt.textContent : '';
    var empty = !select.value;
    wrap._valueEl.textContent = text;
    wrap._valueEl.classList.toggle('is-placeholder', empty);
    wrap._options.forEach(function (li) {
      li.classList.toggle('is-selected', li.dataset.value === select.value);
    });
  }

  function choose(wrap, li) {
    if (li.classList.contains('is-disabled')) return;
    wrap._select.value = li.dataset.value;
    syncDisplay(wrap);
    wrap._select.dispatchEvent(new Event('change', { bubbles: true }));
    closeMenu(wrap);
    wrap._trigger.focus();
  }

  function focusOption(wrap, index) {
    var opts = wrap._options.filter(function (li) {
      return !li.classList.contains('is-disabled');
    });
    if (!opts.length) return;
    wrap._focusIndex = Math.max(0, Math.min(index, opts.length - 1));
    wrap._options.forEach(function (li) {
      li.classList.remove('is-focused');
    });
    var li = opts[wrap._focusIndex];
    li.classList.add('is-focused');
    li.scrollIntoView({ block: 'nearest' });
  }

  function enhanceSelect(select) {
    if (select.dataset.csEnhanced) return;
    select.dataset.csEnhanced = '1';

    var wrap = document.createElement('div');
    wrap.className = 'cs';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    select.classList.add('cs-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    var listId = (select.id || 'cs') + '-listbox';
    var triggerId = (select.id || 'cs') + '-trigger';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.id = triggerId;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', listId);

    var label = select.id
      ? document.querySelector('label[for="' + select.id + '"]')
      : null;
    if (label) {
      if (!label.id) label.id = select.id + '-label';
      trigger.setAttribute('aria-labelledby', label.id);
    }

    var valueEl = document.createElement('span');
    valueEl.className = 'cs-value';

    var chevron = document.createElement('span');
    chevron.className = 'cs-chevron';
    chevron.setAttribute('aria-hidden', 'true');

    trigger.appendChild(valueEl);
    trigger.appendChild(chevron);

    var menu = document.createElement('ul');
    menu.className = 'cs-menu';
    menu.id = listId;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    var options = [];
    Array.prototype.forEach.call(select.options, function (opt) {
      var li = document.createElement('li');
      li.className = 'cs-option';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      if (opt.disabled) li.classList.add('is-disabled');
      if (opt.selected) li.classList.add('is-selected');
      menu.appendChild(li);
      options.push(li);
    });

    wrap.insertBefore(trigger, select);
    wrap.appendChild(menu);

    wrap._select = select;
    wrap._trigger = trigger;
    wrap._menu = menu;
    wrap._valueEl = valueEl;
    wrap._options = options;
    wrap._focusIndex = 0;

    select._csWrap = wrap;
    select._csSync = function () {
      syncDisplay(wrap);
    };

    trigger.addEventListener('click', function () {
      if (wrap.classList.contains('is-open')) closeMenu(wrap);
      else openMenu(wrap);
    });

    menu.addEventListener('click', function (e) {
      var li = e.target.closest('.cs-option');
      if (li) choose(wrap, li);
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!wrap.classList.contains('is-open')) {
          openMenu(wrap);
          var selIdx = options.findIndex(function (li) {
            return li.classList.contains('is-selected');
          });
          focusOption(wrap, selIdx >= 0 ? selIdx : 0);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          var focused = menu.querySelector('.cs-option.is-focused');
          if (focused) choose(wrap, focused);
          return;
        }
        var dir = e.key === 'ArrowDown' ? 1 : -1;
        focusOption(wrap, (wrap._focusIndex || 0) + dir);
      } else if (e.key === 'Escape') {
        closeMenu(wrap);
      }
    });

    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(wrap);
        trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusOption(wrap, (wrap._focusIndex || 0) + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusOption(wrap, (wrap._focusIndex || 0) - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var focused = menu.querySelector('.cs-option.is-focused');
        if (focused) choose(wrap, focused);
      }
    });

    if (!OPEN.includes(wrap)) OPEN.push(wrap);

    syncDisplay(wrap);
  }

  function init(root) {
    (root || document).querySelectorAll('select:not([data-cs-skip]):not(.cs-native)').forEach(enhanceSelect);
  }

  document.addEventListener('click', function (e) {
    OPEN.forEach(function (wrap) {
      if (!wrap.contains(e.target)) closeMenu(wrap);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });

  window.SICustomSelect = {
    init: init,
    refresh: function (selectEl) {
      if (selectEl && selectEl._csSync) selectEl._csSync();
    },
    focusTarget: function (selectEl) {
      if (selectEl && selectEl._csWrap) return selectEl._csWrap._trigger;
      return selectEl;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }
})();

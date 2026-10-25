/*
 * CheckAfford — shared input validation and live recalculation.
 * Loaded at the end of each calculator page, after the page's own script.
 * It wraps the page's calculate() and setLang() without changing their math:
 *   - invalid or empty required fields show a message next to the field and no verdict
 *   - after the first successful calculation, results update as the user edits a field
 *   - setLang() also updates <html lang> and the error messages
 */
(function () {
  'use strict';
  if (typeof window.calculate !== 'function') return;

  var script = document.currentScript;
  var termMax = Number((script && script.getAttribute('data-term-max')) || 480);
  var termUnit = (script && script.getAttribute('data-term-unit')) || 'months';

  // Field rules by input id. A field that is not on the page is skipped.
  var RULES = {
    income:     { required: true,  min: 1, max: 10000000, msg: 'income' },
    expenses:   { required: false, min: 0, max: 10000000, msg: 'range' },
    price:      { required: true,  min: 1, max: 100000000, msg: 'positive' },
    down:       { required: false, min: 0, max: 100000000, msg: 'range' },
    loanAmount: { required: true,  min: 1, max: 100000000, msg: 'positive' },
    rate:       { required: true,  min: 0, max: 60, msg: 'rate' },
    term:       { required: true,  min: 1, max: termMax, integer: true, msg: 'term' },
    housing:    { required: false, min: 0, max: 10000000, msg: 'range' }
  };

  var MSG = {
    en: {
      required: 'Enter a value.',
      income: 'Enter a monthly income greater than $0.',
      positive: 'Enter an amount greater than $0.',
      range: 'Enter a number from 0 up to 10,000,000.',
      rate: 'Enter a rate from 0% to 60%.',
      term: termUnit === 'payments'
        ? 'Enter a whole number of payments from 1 to ' + termMax + '.'
        : 'Enter a whole number of months from 1 to ' + termMax + '.',
      down: 'The down payment must be less than the price.',
      tax: 'Enter a rate from 0% to 20%.',
      summary: 'Fix the highlighted fields to see your result.'
    },
    es: {
      required: 'Ingresa un valor.',
      income: 'Ingresa un ingreso mensual mayor que $0.',
      positive: 'Ingresa un monto mayor que $0.',
      range: 'Ingresa un número entre 0 y 10,000,000.',
      rate: 'Ingresa una tasa entre 0% y 60%.',
      term: termUnit === 'payments'
        ? 'Ingresa un número entero de pagos entre 1 y ' + termMax + '.'
        : 'Ingresa un número entero de meses entre 1 y ' + termMax + '.',
      down: 'El enganche debe ser menor que el precio.',
      tax: 'Ingresa una tasa entre 0% y 20%.',
      summary: 'Corrige los campos marcados para ver tu resultado.'
    }
  };

  var state = { lang: 'en', calculated: false, invalid: false, errors: {} };

  // Styles for error messages, injected once.
  var css = document.createElement('style');
  css.textContent =
    '.ca-err{color:#ff6b81;font-size:12px;line-height:1.4;margin:6px 0 0;}' +
    'input[aria-invalid="true"]{border-color:#ff4d6d!important;box-shadow:0 0 0 1px #ff4d6d;}' +
    '.ca-summary{color:#ff6b81;font-size:13px;margin:12px 0 0;text-align:center;}';
  document.head.appendChild(css);

  // Inputs can also declare their own rule: data-min, data-max, data-required, data-integer, data-msg.
  function ruleFor(id) {
    var el = document.getElementById(id);
    if (el && el.hasAttribute('data-min')) {
      return {
        required: el.hasAttribute('data-required'),
        min: Number(el.getAttribute('data-min')),
        max: Number(el.getAttribute('data-max') || 10000000),
        integer: el.hasAttribute('data-integer'),
        msg: el.getAttribute('data-msg') || 'range'
      };
    }
    return RULES[id];
  }

  function fields() {
    var ids = Object.keys(RULES).filter(function (id) { return document.getElementById(id); });
    Array.prototype.forEach.call(document.querySelectorAll('input[data-min]'), function (el) {
      if (el.id && ids.indexOf(el.id) === -1) ids.push(el.id);
    });
    return ids;
  }

  function errorEl(id) {
    var input = document.getElementById(id);
    var errId = 'err-' + id;
    var el = document.getElementById(errId);
    if (!el) {
      el = document.createElement('p');
      el.id = errId;
      el.className = 'ca-err';
      el.setAttribute('role', 'alert');
      var field = input.closest('.field') || input.parentNode;
      field.appendChild(el);
    }
    return el;
  }

  function setError(id, key) {
    var input = document.getElementById(id);
    state.errors[id] = key;
    var el = errorEl(id);
    el.textContent = MSG[state.lang][key];
    el.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    var described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (described.indexOf(el.id) === -1) described.push(el.id);
    input.setAttribute('aria-describedby', described.join(' '));
  }

  function clearError(id) {
    var input = document.getElementById(id);
    delete state.errors[id];
    var el = document.getElementById('err-' + id);
    if (el) { el.textContent = ''; el.hidden = true; }
    input.removeAttribute('aria-invalid');
  }

  function validate() {
    var ok = true;
    fields().forEach(function (id) {
      var rule = ruleFor(id);
      var raw = String(document.getElementById(id).value).trim();
      if (raw === '') {
        if (rule.required) { setError(id, 'required'); ok = false; } else { clearError(id); }
        return;
      }
      var n = Number(raw);
      if (!isFinite(n) || n < rule.min || n > rule.max || (rule.integer && Math.floor(n) !== n)) {
        setError(id, rule.msg); ok = false; return;
      }
      clearError(id);
    });
    // Cross-field rule: down payment below home price.
    var price = document.getElementById('price'), down = document.getElementById('down');
    if (price && down && !state.errors.price && !state.errors.down && down.value !== '') {
      if (Number(down.value) >= Number(price.value)) { setError('down', 'down'); ok = false; }
    }
    return ok;
  }

  function summaryEl() {
    var el = document.getElementById('ca-summary');
    if (!el) {
      el = document.createElement('p');
      el.id = 'ca-summary';
      el.className = 'ca-summary';
      el.setAttribute('role', 'status');
      var ph = document.getElementById('placeholder');
      if (ph) ph.appendChild(el);
    }
    return el;
  }

  function showInvalid() {
    var res = document.getElementById('results-content');
    var ph = document.getElementById('placeholder');
    if (res) res.style.display = 'none';
    if (ph) ph.style.display = '';
    summaryEl().textContent = MSG[state.lang].summary;
  }

  function hideSummary() {
    var el = document.getElementById('ca-summary');
    if (el) el.textContent = '';
  }

  var pageCalculate = window.calculate;
  window.calculate = function () {
    if (!validate()) { state.invalid = true; showInvalid(); return; }
    state.invalid = false;
    hideSummary();
    var out = pageCalculate.apply(this, arguments);
    state.calculated = true;
    announce();
    return out;
  };

  // Screen-reader announcement of the new result (results panel itself is not a live region).
  function liveEl() {
    var el = document.getElementById('ca-live');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ca-live';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
      document.body.appendChild(el);
    }
    return el;
  }
  function announce() {
    var parts = ['verdict-text', 'stat-monthly'].map(function (id) {
      var el = document.getElementById(id);
      return el ? el.textContent.trim() : '';
    }).filter(Boolean);
    liveEl().textContent = parts.join(' ');
  }

  if (typeof window.setLang === 'function') {
    var pageSetLang = window.setLang;
    window.setLang = function (l) {
      state.lang = MSG[l] ? l : 'en';
      document.documentElement.lang = state.lang;
      var out = pageSetLang.apply(this, arguments);
      Object.keys(state.errors).forEach(function (id) { setError(id, state.errors[id]); });
      if (state.invalid) showInvalid();
      return out;
    };
  }

  // Live recalculation once the user has a result on screen.
  var timer = null;
  function onEdit() {
    if (!state.calculated) return;
    clearTimeout(timer);
    timer = setTimeout(function () { window.calculate(); }, 250);
  }
  fields().concat(['freq']).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', onEdit);
    el.addEventListener('change', onEdit);
  });

  window.CheckAffordValidation = { validate: validate, state: state };
})();

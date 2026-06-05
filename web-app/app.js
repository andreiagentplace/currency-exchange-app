/* FX Exchange — app.js
   Frankfurter API v2: https://api.frankfurter.dev/v2
   -------------------------------------------------- */
'use strict';

var API = 'https://api.frankfurter.dev/v2';
var currencies = [];
var chartInstance = null;

/* ── UTILITIES ─────────────────────────────────────── */

function getEl(id) { return document.getElementById(id); }

function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

function showLoading(prefix) {
  show(getEl(prefix + '-loading'));
  hide(getEl(prefix + '-error'));
  hide(getEl(prefix + '-result'));
  hide(getEl(prefix + '-wrapper'));
}

function hideLoading(prefix) {
  hide(getEl(prefix + '-loading'));
}

function showError(prefix, message) {
  hideLoading(prefix);
  var el = getEl(prefix + '-error');
  if (el) { el.textContent = message; show(el); }
}

function fmt4(n) { return Number(n).toFixed(4); }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  try {
    var parts = iso.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2])
      .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { return iso; }
}

function escapeHtml(s) {
  return String(s)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

/* ── DROPDOWNS ─────────────────────────────────────── */

function populateSelect(sel, defaultCode) {
  sel.innerHTML = '';
  for (var i = 0; i < currencies.length; i++) {
    var c = currencies[i];
    var opt = document.createElement('option');
    opt.value = c.iso_code;
    opt.textContent = c.iso_code + ' \u2014 ' + c.name;
    if (c.iso_code === defaultCode) opt.selected = true;
    sel.appendChild(opt);
  }
}

/* ── TAB NAVIGATION ────────────────────────────────── */

function initTabs() {
  var tabs   = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      /* deactivate all */
      tabs.forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach(function(p) {
        p.classList.remove('active');
      });

      /* activate selected */
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      var panelId = 'panel-' + tab.dataset.tab;
      var panel   = getEl(panelId);
      if (panel) {
        /* remove 'hidden' in case it was set, and make active */
        panel.classList.remove('hidden');
        panel.classList.add('active');
      }
    });
  });
}

/* ── SECTION 1: CONVERTER ──────────────────────────── */

function convert() {
  var raw    = getEl('amount').value.trim();
  var amount = parseFloat(raw);
  var from   = getEl('from-currency').value;
  var to     = getEl('to-currency').value;

  if (!raw || isNaN(amount) || amount <= 0) {
    showError('converter', 'Please enter a valid positive amount.');
    return;
  }

  if (from === to) {
    var r = getEl('converter-result');
    r.innerHTML =
      '<div class="result-main">' + fmt4(amount) + ' ' + to + '</div>' +
      '<div class="result-formula">Same currency \u2014 no conversion needed.</div>';
    hideLoading('converter');
    hide(getEl('converter-error'));
    show(r);
    return;
  }

  showLoading('converter');
  getEl('convert-btn').disabled = true;

  fetch(API + '/rate/' + encodeURIComponent(from) + '/' + encodeURIComponent(to))
    .then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(b) {
          throw new Error(b.message || 'HTTP ' + res.status);
        });
      }
      return res.json();
    })
    .then(function(data) {
      var rate      = data.rate;
      var date      = data.date;
      var converted = amount * rate;
      var fromName  = '';
      var toName    = '';
      for (var i = 0; i < currencies.length; i++) {
        if (currencies[i].iso_code === from) fromName = currencies[i].name;
        if (currencies[i].iso_code === to)   toName   = currencies[i].name;
      }
      fromName = fromName || from;
      toName   = toName   || to;

      var r = getEl('converter-result');
      r.innerHTML =
        '<div class="result-main">' + fmt4(converted) + ' ' + to + '</div>' +
        '<div class="result-formula">' +
          fmt4(amount) + ' ' + from + ' &times; ' + fmt4(rate) +
          ' = ' + fmt4(converted) + ' ' + to +
        '</div>' +
        '<div class="result-date">' +
          '1 ' + fromName + ' = ' + fmt4(rate) + ' ' + toName +
          ' &mdash; rate as of ' + fmtDate(date) +
        '</div>';
      hideLoading('converter');
      show(r);
    })
    .catch(function(err) {
      showError('converter', 'Could not fetch rate: ' + err.message);
    })
    .finally(function() {
      getEl('convert-btn').disabled = false;
    });
}

function initConverter() {
  populateSelect(getEl('from-currency'), 'USD');
  populateSelect(getEl('to-currency'),   'EUR');

  getEl('convert-btn').addEventListener('click', convert);

  getEl('amount').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') convert();
  });

  getEl('swap-btn').addEventListener('click', function() {
    var f   = getEl('from-currency');
    var t   = getEl('to-currency');
    var tmp = f.value;
    f.value = t.value;
    t.value = tmp;
    if (!getEl('converter-result').classList.contains('hidden')) convert();
  });
}

/* ── SECTION 2: RATE TABLE ─────────────────────────── */

function loadRateTable(base) {
  show(getEl('table-loading'));
  hide(getEl('table-error'));
  hide(getEl('table-wrapper'));
  hide(getEl('table-date'));

  var url = API + '/rates?base=' + encodeURIComponent(base);

  fetch(url)
    .then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(b) {
          throw new Error(b.message || 'HTTP ' + res.status);
        });
      }
      return res.json();
    })
    .then(function(data) {
      /* data is an array of {date, base, quote, rate} */
      var sorted = data.slice().sort(function(a, b) {
        return a.quote < b.quote ? -1 : a.quote > b.quote ? 1 : 0;
      });

      var tbody = getEl('rates-tbody');
      tbody.innerHTML = '';

      for (var i = 0; i < sorted.length; i++) {
        var item = sorted[i];
        var name = item.quote;
        for (var j = 0; j < currencies.length; j++) {
          if (currencies[j].iso_code === item.quote) {
            name = currencies[j].name;
            break;
          }
        }
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="code-col">' + escapeHtml(item.quote) + '</td>' +
          '<td>' + escapeHtml(name) + '</td>' +
          '<td class="rate-col">' + fmt4(item.rate) + '</td>';
        tbody.appendChild(tr);
      }

      var dateEl = getEl('table-date');
      if (data.length && data[0].date && dateEl) {
        dateEl.textContent = 'Rates as of ' + fmtDate(data[0].date);
        show(dateEl);
      }

      hide(getEl('table-loading'));
      show(getEl('table-wrapper'));
    })
    .catch(function(err) {
      showError('table', 'Could not load rates: ' + err.message);
    })
    .finally(function() {
      /* always ensure spinner is hidden so it never gets stuck */
      hideLoading('table');
    });
}

function initRateTable() {
  var sel = getEl('table-base');
  populateSelect(sel, 'USD');
  sel.addEventListener('change', function() {
    loadRateTable(sel.value);
  });
  loadRateTable('USD');
}

/* ── SECTION 3: 30-DAY CHART ───────────────────────── */

function loadChart() {
  var from = getEl('chart-from').value;
  var to   = getEl('chart-to').value;

  if (from === to) {
    showError('chart', 'Please select two different currencies.');
    return;
  }

  showLoading('chart');
  getEl('chart-btn').disabled = true;

  /* Build URL using string concatenation to avoid any HTML-entity corruption
     of the 'quotes' parameter name */
  var url = API + '/rates'
    + '?from='   + daysAgoStr(30)
    + '&to='     + todayStr()
    + '&base='   + encodeURIComponent(from)
    + '&quotes=' + encodeURIComponent(to);

  fetch(url)
    .then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(b) {
          throw new Error(b.message || 'HTTP ' + res.status);
        });
      }
      return res.json();
    })
    .then(function(data) {
      if (!data.length) {
        throw new Error('No rate data available for this currency pair and period.');
      }

      var sorted = data.slice().sort(function(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });

      var labels = sorted.map(function(d) { return d.date; });
      var rates  = sorted.map(function(d) { return d.rate; });

      var style   = getComputedStyle(document.documentElement);
      var primary = style.getPropertyValue('--primary').trim()       || '#4F46E5';
      var gridCol = style.getPropertyValue('--border').trim()        || '#E2E8F0';
      var tickCol = style.getPropertyValue('--text-muted').trim()    || '#64748B';
      var fillCol = style.getPropertyValue('--primary-light').trim() || 'rgba(79,70,229,.08)';

      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

      var ctx = getEl('rate-chart').getContext('2d');
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: from + ' / ' + to,
            data:  rates,
            borderColor:      primary,
            backgroundColor:  fillCol,
            borderWidth:      2,
            pointRadius:      sorted.length > 20 ? 0 : 4,
            pointHoverRadius: 6,
            pointBackgroundColor: primary,
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              labels: { color: tickCol, font: { size: 12, weight: '600' }, boxWidth: 12 }
            },
            tooltip: {
              callbacks: {
                label: function(c) {
                  return ' ' + c.dataset.label + ': ' + fmt4(c.parsed.y);
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: tickCol, maxTicksLimit: 8, font: { size: 11 } },
              grid:  { color: gridCol }
            },
            y: {
              ticks: { color: tickCol, callback: function(v) { return fmt4(v); }, font: { size: 11 } },
              grid:  { color: gridCol }
            }
          }
        }
      });

      hide(getEl('chart-loading'));
      show(getEl('chart-wrapper'));
    })
    .catch(function(err) {
      showError('chart', 'Could not load chart: ' + err.message);
    })
    .finally(function() {
      /* always ensure spinner is hidden so it never gets stuck */
      hideLoading('chart');
      getEl('chart-btn').disabled = false;
    });
}

function initChart() {
  populateSelect(getEl('chart-from'), 'EUR');
  populateSelect(getEl('chart-to'),   'USD');
  getEl('chart-btn').addEventListener('click', loadChart);
}

/* ── FALLBACK CURRENCIES ───────────────────────────── */

var FALLBACK_CURRENCIES = [
  { iso_code: 'AED', name: 'UAE Dirham' },
  { iso_code: 'AUD', name: 'Australian Dollar' },
  { iso_code: 'BRL', name: 'Brazilian Real' },
  { iso_code: 'CAD', name: 'Canadian Dollar' },
  { iso_code: 'CHF', name: 'Swiss Franc' },
  { iso_code: 'CNY', name: 'Chinese Renminbi Yuan' },
  { iso_code: 'EUR', name: 'Euro' },
  { iso_code: 'GBP', name: 'British Pound' },
  { iso_code: 'HKD', name: 'Hong Kong Dollar' },
  { iso_code: 'INR', name: 'Indian Rupee' },
  { iso_code: 'JPY', name: 'Japanese Yen' },
  { iso_code: 'KRW', name: 'South Korean Won' },
  { iso_code: 'MXN', name: 'Mexican Peso' },
  { iso_code: 'NOK', name: 'Norwegian Krone' },
  { iso_code: 'NZD', name: 'New Zealand Dollar' },
  { iso_code: 'PLN', name: 'Polish Zloty' },
  { iso_code: 'SEK', name: 'Swedish Krona' },
  { iso_code: 'SGD', name: 'Singapore Dollar' },
  { iso_code: 'TRY', name: 'Turkish Lira' },
  { iso_code: 'USD', name: 'United States Dollar' },
  { iso_code: 'ZAR', name: 'South African Rand' }
];

/* ── INIT ──────────────────────────────────────────── */

function init() {
  fetch(API + '/currencies')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      currencies = data
        .map(function(c) { return { iso_code: c.iso_code, name: c.name }; })
        .sort(function(a, b) { return a.iso_code < b.iso_code ? -1 : 1; });
    })
    .catch(function(err) {
      console.warn('Failed to load currency list, using fallback:', err.message);
      currencies = FALLBACK_CURRENCIES;
    })
    .then(function() {
      initTabs();
      initConverter();
      initRateTable();
      initChart();
    });
}

document.addEventListener('DOMContentLoaded', init);
'use strict';
const API = 'https://api.frankfurter.dev/v2';
let currencies = [];
let chartInstance = null;

function $(id) { return document.getElementById(id); }
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

function showLoading(prefix) {
  show($(`${prefix}-loading`));
  hide($(`${prefix}-error`));
  hide($(`${prefix}-result`));
  hide($(`${prefix}-wrapper`));
}
function hideLoading(prefix) { hide($(`${prefix}-loading`)); }
function showError(prefix, message) {
  hideLoading(prefix);
  const el = $(`${prefix}-error`);
  if (el) { el.textContent = message; show(el); }
}
function fmt4(n) { return Number(n).toFixed(4); }
function today() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function fmtDate(iso) {
  try {
    // Parse as local date to avoid UTC midnight off-by-one for UTC-N timezones
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}
function populateSelect(sel, defaultCode) {
  sel.innerHTML = '';
  currencies.forEach(({ iso_code, name }) => {
    const opt = document.createElement('option');
    opt.value = iso_code;
    opt.textContent = `${iso_code} \u2014 ${name}`;
    if (iso_code === defaultCode) opt.selected = true;
    sel.appendChild(opt);
  });
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      const panel = $(`panel-${tab.dataset.tab}`);
      if (panel) panel.classList.add('active');
    });
  });
}

async function convert() {
  const raw = $('amount').value.trim();
  const amount = parseFloat(raw);
  const from = $('from-currency').value;
  const to = $('to-currency').value;
  if (!raw || isNaN(amount) || amount <= 0) { showError('converter','Please enter a valid positive amount.'); return; }
  if (from === to) {
    const r = $('converter-result');
    r.innerHTML = `<div class="result-main">${fmt4(amount)} ${to}</div><div class="result-formula">Same currency \u2014 no conversion needed.</div>`;
    hideLoading('converter'); hide($('converter-error')); show(r); return;
  }
  showLoading('converter');
  $('convert-btn').disabled = true;
  try {
    const res = await fetch(`${API}/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
    if (!res.ok) { const b = await res.json().catch(()=>({})); throw new Error(b.message||`HTTP ${res.status}`); }
    const { rate, date } = await res.json();
    const converted = amount * rate;
    const fromName = currencies.find(c=>c.iso_code===from)?.name??from;
    const toName = currencies.find(c=>c.iso_code===to)?.name??to;
    const r = $('converter-result');
    r.innerHTML = `<div class="result-main">${fmt4(converted)} ${to}</div>
      <div class="result-formula">${fmt4(amount)} ${from} &times; ${fmt4(rate)} = ${fmt4(converted)} ${to}</div>
      <div class="result-date">1 ${fromName} = ${fmt4(rate)} ${toName} &mdash; rate as of ${fmtDate(date)}</div>`;
    hideLoading('converter'); show(r);
  } catch(err) { showError('converter',`Could not fetch rate: ${err.message}`); }
  finally { $('convert-btn').disabled = false; }
}
function initConverter() {
  populateSelect($('from-currency'),'USD');
  populateSelect($('to-currency'),'EUR');
  $('convert-btn').addEventListener('click', convert);
  $('amount').addEventListener('keydown', e => { if(e.key==='Enter') convert(); });
  $('swap-btn').addEventListener('click', () => {
    const f=$('from-currency'), t=$('to-currency'), tmp=f.value;
    f.value=t.value; t.value=tmp;
    if(!$('converter-result').classList.contains('hidden')) convert();
  });
}

async function loadRateTable(base) {
  show($('table-loading')); hide($('table-error')); hide($('table-wrapper')); hide($('table-date'));
  try {
    const res = await fetch(`${API}/rates?base=${encodeURIComponent(base)}`);
    if (!res.ok) { const b=await res.json().catch(()=>({})); throw new Error(b.message||`HTTP ${res.status}`); }
    const data = await res.json();
    const sorted = [...data].sort((a,b)=>a.quote.localeCompare(b.quote));
    const tbody = $('rates-tbody');
    tbody.innerHTML = '';
    sorted.forEach(({quote,rate}) => {
      const name = currencies.find(c=>c.iso_code===quote)?.name??quote;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="code-col">${escapeHtml(quote)}</td><td>${escapeHtml(name)}</td><td class="rate-col">${fmt4(rate)}</td>`;
      tbody.appendChild(tr);
    });
    const date = data[0]?.date;
    if (date) { $('table-date').textContent=`Rates as of ${fmtDate(date)}`; show($('table-date')); }
    hide($('table-loading')); show($('table-wrapper'));
  } catch(err) { showError('table',`Could not load rates: ${err.message}`); }
}
function initRateTable() {
  const sel = $('table-base');
  populateSelect(sel,'USD');
  sel.addEventListener('change', ()=>loadRateTable(sel.value));
  loadRateTable('USD');
}

async function loadChart() {
  const from=$('chart-from').value, to=$('chart-to').value;
  if (from===to) { showError('chart','Please select two different currencies.'); return; }
  showLoading('chart');
  $('chart-btn').disabled = true;
  try {
    const url=`${API}/rates?from=${daysAgo(30)}&to=${today()}&base=${encodeURIComponent(from)}&quotes=${encodeURIComponent(to)}`;
    const res = await fetch(url);
    if (!res.ok) { const b=await res.json().catch(()=>({})); throw new Error(b.message||`HTTP ${res.status}`); }
    const data = await res.json();
    if (!data.length) throw new Error('No rate data available for this currency pair and period.');
    const sorted=[...data].sort((a,b)=>a.date.localeCompare(b.date));
    const labels=sorted.map(d=>d.date), rates=sorted.map(d=>d.rate);
    const style=getComputedStyle(document.documentElement);
    const primary=style.getPropertyValue('--primary').trim()||'#4F46E5';
    const gridCol=style.getPropertyValue('--border').trim()||'#E2E8F0';
    const tickCol=style.getPropertyValue('--text-muted').trim()||'#64748B';
    const fillCol=style.getPropertyValue('--primary-light').trim()||'rgba(79,70,229,.08)';
    if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
    const ctx=$('rate-chart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type:'line',
      data:{ labels, datasets:[{ label:`${from} / ${to}`, data:rates, borderColor:primary, backgroundColor:fillCol, borderWidth:2, pointRadius:sorted.length>20?0:4, pointHoverRadius:6, pointBackgroundColor:primary, tension:0.3, fill:true }]},
      options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
        plugins:{ legend:{labels:{color:tickCol,font:{size:12,weight:'600'},boxWidth:12}}, tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt4(c.parsed.y)}`}}},
        scales:{ x:{ticks:{color:tickCol,maxTicksLimit:8,font:{size:11}},grid:{color:gridCol}}, y:{ticks:{color:tickCol,callback:v=>fmt4(v),font:{size:11}},grid:{color:gridCol}}}}
    });
    hide($('chart-loading')); show($('chart-wrapper'));
  } catch(err) { showError('chart',`Could not load chart: ${err.message}`); }
  finally { $('chart-btn').disabled=false; }
}
function initChart() {
  populateSelect($('chart-from'),'EUR');
  populateSelect($('chart-to'),'USD');
  $('chart-btn').addEventListener('click', loadChart);
}

const FALLBACK_CURRENCIES=[
  {iso_code:'AED',name:'UAE Dirham'},{iso_code:'AUD',name:'Australian Dollar'},
  {iso_code:'BRL',name:'Brazilian Real'},{iso_code:'CAD',name:'Canadian Dollar'},
  {iso_code:'CHF',name:'Swiss Franc'},{iso_code:'CNY',name:'Chinese Renminbi Yuan'},
  {iso_code:'EUR',name:'Euro'},{iso_code:'GBP',name:'British Pound'},
  {iso_code:'HKD',name:'Hong Kong Dollar'},{iso_code:'INR',name:'Indian Rupee'},
  {iso_code:'JPY',name:'Japanese Yen'},{iso_code:'KRW',name:'South Korean Won'},
  {iso_code:'MXN',name:'Mexican Peso'},{iso_code:'NOK',name:'Norwegian Krone'},
  {iso_code:'NZD',name:'New Zealand Dollar'},{iso_code:'PLN',name:'Polish Zloty'},
  {iso_code:'SEK',name:'Swedish Krona'},{iso_code:'SGD',name:'Singapore Dollar'},
  {iso_code:'TRY',name:'Turkish Lira'},{iso_code:'USD',name:'United States Dollar'},
  {iso_code:'ZAR',name:'South African Rand'}
];

async function init() {
  try {
    const res = await fetch(`${API}/currencies`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currencies = data.map(c=>({iso_code:c.iso_code,name:c.name})).sort((a,b)=>a.iso_code.localeCompare(b.iso_code));
  } catch(err) {
    console.warn('Failed to load currency list, using fallback:', err.message);
    currencies = FALLBACK_CURRENCIES;
  }
  initTabs(); initConverter(); initRateTable(); initChart();
}
document.addEventListener('DOMContentLoaded', init);
const GVIZ = (id, tab) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1&sheet=${tab}`;

async function gviz(id, tab){
  const t = await (await fetch(GVIZ(id, tab))).text();
  const json = JSON.parse(t.substring(t.indexOf('{'), t.lastIndexOf('}')+1));
  const cols = json.table.cols.map(c=>c.label);
  return json.table.rows.map(r=>Object.fromEntries(
    r.c.map((cell,i)=>[cols[i], cell? cell.v : null])));
}

const charts = {};
function draw(id, cfg){ if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg); }

const SEG = ["diamond","gold_jewelry","gold_24k"];
const COLORS = {diamond:"#c0392b", gold_jewelry:"#d4ac0d", gold_24k:"#7d6608", all:"#2c3e50"};
const LABEL = {diamond:"Kim cương", gold_jewelry:"Vàng trang sức", gold_24k:"Vàng 24K", all:"Tổng 3 ngành"};
const BENCHMARK_TY = 2000;   // buyback benchmark (tỷ đồng)

function fmtTy(vnd){ return (Number(vnd)||0)/1e9; }        // VND -> tỷ đồng

function renderKPIs(rows){
  const el = document.getElementById('kpis'); if(!el) return;
  const latest = rows.length ? rows[rows.length-1].date : null;
  const at = seg => rows.filter(r=>r.segment===seg && r.date===latest)[0] || {};
  const dia = at('diamond'), all = at('all');
  const diaTy = fmtTy(dia.total_value_vnd), allTy = fmtTy(all.total_value_vnd);
  const pct = allTy ? (100*diaTy/allTy) : null;
  const k = (cls,v,l)=>`<div class="kpi ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  el.innerHTML = [
    k('diamond', diaTy.toLocaleString('vi',{maximumFractionDigits:0})+' tỷ', 'Tồn kho kim cương (web)'),
    k('diamond', (dia.total_units||0).toLocaleString('vi'), 'Số sản phẩm KC tồn'),
    k('all', allTy.toLocaleString('vi',{maximumFractionDigits:0})+' tỷ', 'Tổng tồn kho 3 ngành'),
    k('diamond', pct==null?'—':pct.toFixed(1)+'%', 'KC chiếm % tổng tồn kho'),
    k('diamond', (BENCHMARK_TY ? (100*diaTy/BENCHMARK_TY) : 0).toFixed(0)+'%', 'KC so mốc buyback 2.000 tỷ'),
  ].join('');
}

function seriesByDate(rows, seg, field){
  const r = rows.filter(x=>x.segment===seg).sort((a,b)=>String(a.date).localeCompare(b.date));
  return {dates:r.map(x=>x.date), vals:r.map(x=>Number(x[field])||0)};
}

// Values aligned to a shared `dates` label axis: one point per label, null where a
// segment has no row for that date (so multi-segment charts never shift points under
// the wrong date when a segment is missing a day).
function alignedSeries(rows, seg, field, dates){
  const m = {};
  rows.filter(x=>x.segment===seg).forEach(x=>{ m[x.date] = Number(x[field])||0; });
  return dates.map(d => (d in m ? m[d] : null));
}

function render(rows){
  const dates = [...new Set(rows.map(r=>r.date))].sort();
  renderKPIs(rows);
  // 1) inventory value (tỷ đồng): diamond vs total-of-3-lines vs buyback benchmark
  const diaV = alignedSeries(rows, "diamond", "total_value_vnd", dates).map(v=>v==null?null:v/1e9);
  const allV = alignedSeries(rows, "all", "total_value_vnd", dates).map(v=>v==null?null:v/1e9);
  draw('invValue', {type:'line', data:{labels:dates, datasets:[
    {label:'Tồn kho KC (tỷ đ)', data:diaV, borderColor:COLORS.diamond, spanGaps:true},
    {label:'Tổng tồn kho 3 ngành (tỷ đ)', data:allV, borderColor:COLORS.all, spanGaps:true},
    {label:'Mốc buyback 2.000 tỷ', data:dates.map(()=>BENCHMARK_TY), borderDash:[6,4], borderColor:'#999', pointRadius:0}]},
    options:{plugins:{title:{display:true,text:'Giá trị tồn kho trên web — KC vs tổng 3 ngành'}}}});
  // 2) units + sell-through
  const u = seriesByDate(rows, "diamond", "total_units");
  const st = seriesByDate(rows, "diamond", "sellthrough_units");
  draw('units', {data:{labels:u.dates, datasets:[
    {type:'line', label:'Σ tồn (units)', data:u.vals, borderColor:COLORS.diamond, yAxisID:'y'},
    {type:'bar', label:'Sell-through/kỳ', data:st.vals, backgroundColor:'#e59866', yAxisID:'y1'}]},
    options:{plugins:{title:{display:true,text:'Tồn kho & sell-through kim cương'}},
      scales:{y1:{position:'right',grid:{drawOnChartArea:false}}}}});
  // 3) assortment (# SKU) per segment
  draw('assortment', {type:'line', data:{labels:dates, datasets:SEG.map(s=>
    ({label:LABEL[s], data:alignedSeries(rows,s,"n_skus_catalog",dates), borderColor:COLORS[s], spanGaps:true}))},
    options:{plugins:{title:{display:true,text:'Số SKU theo segment'}}}});
  // 4) review velocity
  draw('review', {type:'bar', data:{labels:dates, datasets:SEG.map(s=>
    ({label:LABEL[s], data:alignedSeries(rows,s,"review_velocity",dates), backgroundColor:COLORS[s]}))},
    options:{plugins:{title:{display:true,text:'Review velocity (Δ đánh giá)'}}}});
  // 5) relative index (value normalized to 100 at start)
  draw('relindex', {type:'line', data:{labels:dates, datasets:SEG.map(s=>{
    const av=alignedSeries(rows,s,"total_value_vnd",dates); const base=av.find(v=>v)||1;
    return {label:LABEL[s], data:av.map(v=>v==null?null:100*v/base), borderColor:COLORS[s], spanGaps:true};})},
    options:{plugins:{title:{display:true,text:'Chỉ số tương đối tồn kho (=100 tại điểm đầu)'}}}});
  // 6) price / discount
  draw('price', {type:'line', data:{labels:dates, datasets:SEG.map(s=>{
    const av=alignedSeries(rows,s,"median_price",dates);
    return {label:LABEL[s]+' median giá', data:av.map(v=>v==null?null:v/1e6), borderColor:COLORS[s], spanGaps:true};})},
    options:{plugins:{title:{display:true,text:'Giá median (triệu đ)'}}}});
}

function mergeRollups(listing, stock){
  // join by (date, segment); listing rows are the spine (daily), stock fields patched in
  const key = r => r.date + '|' + r.segment;
  const byKey = {};
  listing.forEach(r => { byKey[key(r)] = {...r}; });
  stock.forEach(r => { byKey[key(r)] = {...(byKey[key(r)]||{date:r.date,segment:r.segment}), ...r}; });
  return Object.values(byKey);
}

async function load(){
  const id = document.getElementById('sheetId').value.trim();
  const updated = document.getElementById('updated');
  try {
    let rows;
    if(id){
      const listing = await gviz(id, 'Segment_Listing');
      let stock = [];
      try { stock = await gviz(id, 'Segment_Stock'); } catch(e){ stock = []; }
      rows = mergeRollups(listing, stock);
    }
    else if(window.DEMO_ROLLUP){ rows = window.DEMO_ROLLUP; }
    else { updated.textContent = 'Nhập Sheet ID rồi bấm Tải dữ liệu.'; return; }
    rows.sort((a,b)=>String(a.date).localeCompare(b.date));
    updated.textContent = 'Cập nhật: ' + (rows.at(-1)?.date || '');
    render(rows);
    // breakdown (karat / type / price)
    let bd = [];
    if(id){ try { bd = await gviz(id, 'Breakdown'); } catch(e){ bd = []; } }
    else if(window.DEMO_BREAKDOWN){ bd = window.DEMO_BREAKDOWN; }
    window.__BD = bd;
    setupBreakdown(bd);
    setupTypeSummary(bd);
  } catch(e){
    updated.textContent = 'Lỗi tải dữ liệu — kiểm tra Sheet ID và quyền chia sẻ (' + e.message + ')';
    console.error(e);
  }
}

// Pivot over the karat×type×price cross-tab (dimension='cross', bucket='k|t|p').
const DIM_LABEL = {karat:'Hàm lượng vàng', type:'Loại trang sức', price:'Khoảng giá'};
const BUCKET_ORDER = {
  karat: ["24K","22K","18K","14K","10K","Khác"],
  price: ["<2tr","2-5tr","5-10tr","10-20tr","20-50tr","50-100tr","≥100tr","N/A"],
};
const BD_PALETTE = ['#c0392b','#d4ac0d','#7d6608','#2c3e50','#27ae60','#8e44ad','#e67e22','#16a085','#2980b9','#95a5a6'];
function parseCross(r){ const p=String(r.bucket).split("|"); return {karat:p[0],type:p[1],price:p[2]}; }
function ordBuckets(dim, vals){
  const o=BUCKET_ORDER[dim];
  return [...vals].sort((a,b)=> o ? ((o.indexOf(a)+1||99)-(o.indexOf(b)+1||99)) : String(a).localeCompare(b));
}
// Aggregate a set of cross rows into one metric value. value/units/n_skus are additive;
// median is estimated from the price-band histogram (price is always a cross dimension).
function aggValue(cells, metric){
  if(metric==='median'){
    const band={};
    cells.forEach(r=>{const p=parseCross(r).price; const n=Number(r.n_skus)||0;
      band[p]=band[p]||{n:0,wsum:0}; band[p].n+=n; band[p].wsum+=(Number(r.median_price)||0)*n;});
    const bands=ordBuckets('price', Object.keys(band));
    const total=bands.reduce((s,b)=>s+band[b].n,0); if(!total) return 0;
    let cum=0; for(const b of bands){ cum+=band[b].n; if(cum>=total/2) return (band[b].wsum/band[b].n)/1e6; }
    return 0;
  }
  const sum=cells.reduce((s,r)=>s+(Number(r[metric])||0),0);
  return metric==='total_value_vnd' ? sum/1e9 : sum;
}
function setupBreakdown(rows){
  const segSel = document.getElementById('bdSeg'); if(!segSel) return;
  const cross = (rows||[]).filter(r=>r.dimension==='cross');
  window.__BDX = cross;
  const segs = [...new Set(cross.map(r=>r.segment))];
  const prefer = ["diamond","gold_jewelry","gold_24k","all"].filter(s=>segs.includes(s));
  const list = prefer.length ? prefer : segs;
  const cur = segSel.value;
  segSel.innerHTML = list.map(s=>`<option value="${s}">${LABEL[s]||s}</option>`).join('');
  if(list.includes(cur)) segSel.value = cur;
  ['bdSeg','bdGroup','bdSplit','bdMetric'].forEach(id=>{
    const el=document.getElementById(id);
    if(el && !el.__wired){ el.addEventListener('change', renderBreakdown); el.__wired=true; }
  });
  renderBreakdown();
}
function renderBreakdown(){
  const cross = window.__BDX || [];
  const seg = document.getElementById('bdSeg').value;
  const gi = document.getElementById('bdGroup').value;
  const split = document.getElementById('bdSplit').value;
  const si = (split==='none' || split===gi) ? null : split;
  const metric = document.getElementById('bdMetric').value;
  const latest = cross.length ? cross.map(r=>r.date).sort().at(-1) : null;
  const rows = cross.filter(r=>r.segment===seg && r.date===latest).map(r=>({...r,_p:parseCross(r)}));
  const groupVals = ordBuckets(gi, new Set(rows.map(r=>r._p[gi])));
  const mlbl = {total_value_vnd:'Giá trị tồn (tỷ đ)', total_units:'Số lượng', n_skus:'Số SKU', median:'Median giá (triệu đ)'}[metric];
  let datasets;
  if(!si){
    datasets=[{label:(LABEL[seg]||seg)+' — '+mlbl,
      data:groupVals.map(gv=>aggValue(rows.filter(r=>r._p[gi]===gv), metric)),
      backgroundColor:COLORS[seg]||'#c0392b'}];
  } else {
    const splitVals=ordBuckets(si, new Set(rows.map(r=>r._p[si])));
    datasets=splitVals.map((sv,i)=>({label:sv,
      data:groupVals.map(gv=>aggValue(rows.filter(r=>r._p[gi]===gv && r._p[si]===sv), metric)),
      backgroundColor:BD_PALETTE[i%BD_PALETTE.length]}));
  }
  const stacked = !!si && metric!=='median';   // medians aren't additive → don't stack
  draw('breakdown', {type:'bar', data:{labels:groupVals, datasets},
    options:{indexAxis: gi==='type'?'y':'x',
      scales: stacked?{x:{stacked:true},y:{stacked:true}}:{},
      plugins:{title:{display:true,text:(LABEL[seg]||seg)+': '+mlbl+' theo '+DIM_LABEL[gi]+(si?(' × '+DIM_LABEL[si]):'')}}}});
}

// ---- Tổng hợp tồn kho theo loại trang sức (filter: ngành × loại × giá) ----
const TYPE_ORDER = ["Nhẫn","Bông tai","Dây chuyền","Lắc","Kiềng","Mặt dây","Charm","Vàng miếng/đồng","Vòng","Khác"];
function ordTypes(vals){
  return [...vals].sort((a,b)=>((TYPE_ORDER.indexOf(a)+1||99)-(TYPE_ORDER.indexOf(b)+1||99)));
}
function checkedVals(boxId){
  return [...document.querySelectorAll('#'+boxId+' input:checked')].map(i=>i.value);
}
function buildChipbox(boxId, values, checkedByDefault){
  const box = document.getElementById(boxId); if(!box) return;
  box.innerHTML = values.map(v=>
    `<label><input type="checkbox" value="${v}" ${checkedByDefault(v)?'checked':''}>${LABEL[v]||v}</label>`
  ).join('');
}
function wireAllNone(allBtnId, noneBtnId, boxId, rerender){
  const allBtn=document.getElementById(allBtnId), noneBtn=document.getElementById(noneBtnId);
  if(allBtn && !allBtn.__wired){ allBtn.addEventListener('click',()=>{
    document.querySelectorAll('#'+boxId+' input').forEach(i=>i.checked=true); rerender(); }); allBtn.__wired=true; }
  if(noneBtn && !noneBtn.__wired){ noneBtn.addEventListener('click',()=>{
    document.querySelectorAll('#'+boxId+' input').forEach(i=>i.checked=false); rerender(); }); noneBtn.__wired=true; }
}
function setupTypeSummary(rows){
  const segBox = document.getElementById('tsSegBox'); if(!segBox) return;
  const cross = (rows||[]).filter(r=>r.dimension==='cross');
  const latest = cross.length ? cross.map(r=>r.date).sort().at(-1) : null;
  const latestRows = cross.filter(r=>r.date===latest).map(r=>({...r,_p:parseCross(r)}));
  window.__TS = latestRows;

  const segs = ["diamond","gold_jewelry","gold_24k"].filter(s=>latestRows.some(r=>r.segment===s));
  buildChipbox('tsSegBox', segs, ()=>true);
  const types = ordTypes(new Set(latestRows.map(r=>r._p.type)));
  buildChipbox('tsTypeBox', types, ()=>true);
  const prices = ordBuckets('price', new Set(latestRows.map(r=>r._p.price)));
  buildChipbox('tsPriceBox', prices, ()=>true);

  ['tsSegBox','tsTypeBox','tsPriceBox'].forEach(id=>{
    document.querySelectorAll('#'+id+' input').forEach(i=>{
      if(!i.__wired){ i.addEventListener('change', renderTypeSummary); i.__wired=true; }
    });
  });
  const metricSel = document.getElementById('tsMetric');
  if(metricSel && !metricSel.__wired){ metricSel.addEventListener('change', renderTypeSummary); metricSel.__wired=true; }
  wireAllNone('tsPriceAll','tsPriceNone','tsPriceBox', renderTypeSummary);
  wireAllNone('tsTypeAll','tsTypeNone','tsTypeBox', renderTypeSummary);
  renderTypeSummary();
}
function renderTypeSummary(){
  const rows = window.__TS || [];
  const segs = checkedVals('tsSegBox');
  const types = checkedVals('tsTypeBox');
  const prices = checkedVals('tsPriceBox');
  const metric = document.getElementById('tsMetric').value;
  const mlbl = {total_value_vnd:'Giá trị tồn (tỷ đ)', total_units:'Số lượng', n_skus:'Số SKU'}[metric];
  const f = rows.filter(r=>segs.includes(r.segment) && prices.includes(r._p.price));
  const typeVals = ordTypes(new Set(f.map(r=>r._p.type))).filter(t=>types.includes(t));
  const datasets = segs.map(s=>({label:LABEL[s]||s,
    data:typeVals.map(t=>aggValue(f.filter(r=>r.segment===s && r._p.type===t), metric)),
    backgroundColor:COLORS[s]||'#c0392b'}));
  draw('typeSummary', {type:'bar', data:{labels:typeVals, datasets},
    options:{indexAxis:'y', scales:{x:{stacked:true},y:{stacked:true}},
      plugins:{title:{display:true,text:mlbl+' theo loại trang sức (lọc: ngành/loại/giá đã chọn)'}}}});
}

const _lb=document.getElementById('load'); if(_lb) _lb.addEventListener('click', load);
if(window.DEMO_ROLLUP){ load(); }   // auto-render baked snapshot

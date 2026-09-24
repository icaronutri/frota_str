(() => {
  'use strict';

  const CONFIG = window.APP_CONFIG || { mode: 'demo', apiUrl: '' };
  const STORAGE_KEY = 'controle_viaturas_afa_clean_v1';
  const SESSION_KEY = 'controle_viaturas_afa_session_clean_v1';
  const seed = {
    users: [{ id:'MGR-001', name:'Gerente Demo', login:'gerente', password:'123456', role:'GERENTE', status:'ATIVO', rank:'Gerente', sector:'Gerência' }],
    vehicles: [
      { id:'V1', prefix:'VTR-023', plate:'ABC1D23', model:'Ranger XLS', year:2024, sector:'Logística', km:82450, status:'DISPONÍVEL' },
      { id:'V2', prefix:'VTR-024', plate:'XYZ4E56', model:'Spin LT', year:2023, sector:'Apoio', km:43120, status:'DISPONÍVEL' }
    ],
    movements: [],
    audit: []
  };

  let db = loadDb();
  let session = loadSession();
  let flow = null;

  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => [...document.querySelectorAll(sel)];
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  const nowText = () => new Date().toLocaleString('pt-BR');
  const fmtKm = (n) => `${Number(n || 0).toLocaleString('pt-BR')} km`;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));

  function loadDb(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(seed); }
    catch { return clone(seed); }
  }
  function saveDb(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  function loadSession(){ return sessionStorage.getItem(SESSION_KEY) || null; }
  function saveSession(id){ session = id; if(id) sessionStorage.setItem(SESSION_KEY,id); else sessionStorage.removeItem(SESSION_KEY); }
  function currentUser(){ return db.users.find(u => u.id === session) || null; }
  function audit(event, details=''){ db.audit.push({id:uid('LOG'), at:nowText(), userId:session, event, details}); saveDb(); }

  function setMessage(id, text='', type='error'){
    const node=$(id); if(!node) return;
    node.textContent=text;
    node.className = text ? `message ${type}` : 'message hidden';
  }

  function showScreen(name){
    qsa('.screen').forEach(s => s.classList.remove('active'));
    const target = $(`screen-${name}`);
    if(!target) return;
    target.classList.add('active');
    const logged = !!currentUser();
    $('topbar').classList.toggle('hidden', !logged);
    $('bottom-nav').classList.toggle('hidden', !logged);
    if(name==='home') renderHome();
    if(name==='vehicles') renderVehicles();
    if(name==='history') renderHistory();
    if(name==='admin') renderAdmin();
    window.scrollTo({top:0, behavior:'instant'});
  }

  async function api(action, payload={}){
    if(CONFIG.mode !== 'live' || !CONFIG.apiUrl) return null;
    const res = await fetch(CONFIG.apiUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action, ...payload})});
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Falha no servidor');
    return data;
  }

  async function doLogin(){
    const login=$('login-user').value.trim();
    const password=$('login-pass').value;
    setMessage('login-message');
    try {
      if(CONFIG.mode==='live' && CONFIG.apiUrl){
        const out=await api('login',{login,password});
        localStorage.setItem('afa_live_token',out.token);
        db.users=[out.user]; db.vehicles=out.vehicles||[]; db.movements=out.movements||[];
        saveSession(out.user.id); showScreen('home'); return;
      }
      const user=db.users.find(u=>u.login===login && u.password===password);
      if(!user) return setMessage('login-message','Login ou senha incorretos.');
      if(user.status!=='ATIVO') return setMessage('login-message','Cadastro ainda não aprovado.');
      saveSession(user.id); audit('LOGIN'); showScreen('home');
    } catch(err){ setMessage('login-message',err.message || 'Falha ao entrar.'); }
  }

  async function registerDriver(){
    const data={name:$('reg-name').value.trim(),rank:$('reg-rank').value.trim(),sector:$('reg-sector').value.trim(),login:$('reg-login').value.trim(),password:$('reg-pass').value};
    setMessage('register-message');
    if(!data.name || !data.login || data.password.length<6) return setMessage('register-message','Preencha nome, login e senha com pelo menos 6 caracteres.');
    try {
      if(CONFIG.mode==='live' && CONFIG.apiUrl){ await api('registerDriver',data); }
      else {
        if(db.users.some(u=>u.login===data.login)) return setMessage('register-message','Este login já está cadastrado.');
        db.users.push({id:uid('MOT'),...data,role:'MOTORISTA',status:'PENDENTE',createdAt:nowText()}); saveDb();
      }
      setMessage('register-message','Cadastro enviado. Aguarde aprovação do gerente.','success');
      setTimeout(()=>showScreen('login'),900);
    } catch(err){ setMessage('register-message',err.message || 'Falha ao cadastrar.'); }
  }

  function renderHome(){
    const user=currentUser(); if(!user){showScreen('login');return;}
    $('home-hello').textContent=`Olá, ${user.name}`;
    const available=db.vehicles.filter(v=>v.status==='DISPONÍVEL').length;
    const running=db.vehicles.filter(v=>v.status==='EM DESLOCAMENTO').length;
    const pending=db.users.filter(u=>u.status==='PENDENTE').length;
    const totalKm=db.movements.reduce((s,m)=>s+(Number(m.distance)||0),0);
    $('home-summary').innerHTML=[['Disponíveis',available],['Em deslocamento',running],['Cadastros pendentes',pending],['KM registrados',totalKm]].map(([label,value])=>`<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
  }

  function renderVehicles(){
    const root=$('vehicle-list'); root.innerHTML='';
    db.vehicles.forEach(v=>{
      const frag=$('vehicle-template').content.cloneNode(true);
      frag.querySelector('.v-prefix').textContent=v.prefix;
      frag.querySelector('.v-plate').textContent=v.plate;
      frag.querySelector('.v-model').textContent=v.model;
      frag.querySelector('.v-sector').textContent=v.sector;
      frag.querySelector('.v-km').textContent=fmtKm(v.km);
      const pill=frag.querySelector('.v-status'); pill.textContent=v.status; pill.classList.add(v.status==='DISPONÍVEL'?'ok':v.status==='EM DESLOCAMENTO'?'run':'bad');
      const exit=frag.querySelector('.v-exit'); exit.disabled=v.status!=='DISPONÍVEL'; exit.dataset.vehicleId=v.id; exit.dataset.action='start-exit';
      const ret=frag.querySelector('.v-return'); ret.disabled=v.status!=='EM DESLOCAMENTO'; ret.dataset.vehicleId=v.id; ret.dataset.action='start-return-vehicle';
      root.appendChild(frag);
    });
  }

  function createChecks(){ return {Pneus:'OK',Iluminação:'OK',Freios:'OK',Óleo:'OK',Água:'OK',Documentação:'OK',Limpeza:'OK',Avarias:'OK'}; }
  function startExit(vehicleId){ flow={mode:'EXIT',vehicleId,step:1,checks:createChecks(),photos:[],signature:[],obs:''}; renderFlow(); showScreen('flow'); }
  function startReturnByVehicle(vehicleId){
    const movement=db.movements.find(m=>m.vehicleId===vehicleId && m.status==='EM DESLOCAMENTO');
    if(!movement) return alert('Não há movimentação aberta para esta viatura.');
    startReturn(movement.id);
  }
  function openReturn(){
    const open=db.movements.filter(m=>m.status==='EM DESLOCAMENTO');
    if(!open.length) return alert('Não há viaturas aguardando regresso.');
    if(open.length===1) return startReturn(open[0].id);
    showScreen('history');
  }
  function startReturn(moveId){ const m=db.movements.find(x=>x.id===moveId); if(!m)return; flow={mode:'RETURN',moveId,vehicleId:m.vehicleId,step:1,checks:createChecks(),photos:[],signature:[],obs:''}; renderFlow(); showScreen('flow'); }

  function stepBars(){ return `<div class="step-bars">${[1,2,3,4].map(n=>`<i class="${flow.step>=n?'on':''}"></i>`).join('')}</div>`; }
  function flowHeader(v){ return `<div class="flow-title"><div><h2>${flow.mode==='EXIT'?'Saída':'Regresso'} — ${esc(v.prefix)}</h2><p class="muted">${esc(v.plate)} • ${esc(v.model)}</p></div><button class="btn secondary" data-action="cancel-flow">Cancelar</button></div>${stepBars()}`; }

  function renderFlow(){
    const v=db.vehicles.find(x=>x.id===flow?.vehicleId); if(!v)return;
    const root=$('flow-root'); const movement=flow.mode==='RETURN'?db.movements.find(m=>m.id===flow.moveId):null;
    if(flow.step===1){
      root.innerHTML=flowHeader(v)+`<div class="card form-card">
        <label class="field"><span>${flow.mode==='RETURN'?'KM final':'KM inicial'}</span><input id="flow-km" class="control" inputmode="numeric" type="number" value="${esc(flow.km ?? (flow.mode==='RETURN'?movement.kmInitial:v.km))}"></label>
        ${flow.mode==='RETURN'?`<div class="note">KM inicial desta movimentação: <b>${fmtKm(movement.kmInitial)}</b></div>`:`<label class="field"><span>Destino / Finalidade</span><input id="flow-destination" class="control" value="${esc(flow.destination||'')}" placeholder="Ex.: Apoio operacional — Ala 2"></label>`}
        <label class="field"><span>Combustível</span><select id="flow-fuel" class="control"><option>Cheio</option><option>3/4</option><option>1/2</option><option>1/4</option><option>Reserva</option></select></label>
        <button class="btn primary full" data-action="flow-next-data">Próximo</button>
      </div>`;
      if(flow.fuel) $('flow-fuel').value=flow.fuel;
      return;
    }
    if(flow.step===2){
      root.innerHTML=flowHeader(v)+`<div class="check-list" id="check-list"></div><label class="field"><span>Observações</span><textarea id="flow-obs" class="control" placeholder="Descreva avarias ou ocorrências">${esc(flow.obs||'')}</textarea></label><div class="row"><button class="btn secondary" data-action="flow-back">Voltar</button><button class="btn primary" style="flex:1" data-action="flow-next-checks">Próximo</button></div>`;
      renderChecks(); return;
    }
    if(flow.step===3){
      root.innerHTML=flowHeader(v)+`<h3 class="section-title">Fotos</h3><p class="muted">Tire fotos diretamente com a câmera ou selecione imagens.</p><div class="photos" id="photo-grid"></div><div class="row" style="margin-top:14px"><button class="btn secondary" data-action="flow-back">Voltar</button><button class="btn primary" style="flex:1" data-action="flow-next-photos">Próximo</button></div>`;
      renderPhotos(); return;
    }
    root.innerHTML=flowHeader(v)+`<h3 class="section-title">Assinatura do responsável</h3><div class="signature-card"><canvas id="signature-canvas"></canvas><div class="row between" style="margin-top:8px"><span class="muted">Assine com o dedo.</span><button class="text-btn" data-action="clear-signature">Limpar</button></div></div><label class="row" style="margin:14px 0"><input id="flow-declare" type="checkbox"><span class="muted">Declaro que as informações correspondem à vistoria realizada.</span></label><div class="row"><button class="btn secondary" data-action="flow-back">Voltar</button><button class="btn success" style="flex:1" data-action="finish-flow">Finalizar</button></div>`;
    initSignature();
  }

  function renderChecks(){
    const root=$('check-list'); if(!root)return;
    root.innerHTML=Object.entries(flow.checks).map(([name,val])=>`<div class="check-row"><b>${esc(name)}</b><div><button class="seg ok ${val==='OK'?'active':''}" data-action="set-check" data-item="${esc(name)}" data-value="OK">OK</button> <button class="seg nc ${val==='NC'?'active':''}" data-action="set-check" data-item="${esc(name)}" data-value="NC">Não conforme</button></div></div>`).join('');
  }

  function renderPhotos(){
    const root=$('photo-grid'); if(!root)return;
    root.innerHTML=[0,1,2,3].map(i=>`<label class="photo-slot">${flow.photos[i]?`<img src="${flow.photos[i]}" alt="Foto ${i+1}">`:`<span>📷<br>Adicionar foto</span>`}<input type="file" accept="image/*" capture="environment" data-photo-index="${i}"></label>`).join('');
  }

  function nextData(){
    const km=Number($('flow-km').value); if(!km)return alert('Informe a quilometragem.');
    if(flow.mode==='RETURN'){
      const m=db.movements.find(x=>x.id===flow.moveId); if(km<m.kmInitial)return alert('O KM final não pode ser menor que o KM inicial.');
    } else {
      const destination=$('flow-destination').value.trim(); if(!destination)return alert('Informe destino/finalidade.'); flow.destination=destination;
    }
    flow.km=km; flow.fuel=$('flow-fuel').value; flow.step=2; renderFlow();
  }

  function nextChecks(){ flow.obs=$('flow-obs').value.trim(); const hasNc=Object.values(flow.checks).includes('NC'); if(hasNc&&!flow.obs)return alert('Há item não conforme. Descreva a ocorrência.'); flow.step=3; renderFlow(); }

  async function compressImage(file){
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data});
    const max=1280, scale=Math.min(1,max/Math.max(img.width,img.height)); const canvas=document.createElement('canvas'); canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale); const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/jpeg',.76);
  }

  function initSignature(){
    const c=$('signature-canvas'); if(!c)return; const rect=c.getBoundingClientRect(); const dpr=window.devicePixelRatio||1; c.width=Math.max(1,Math.round(rect.width*dpr)); c.height=Math.round(190*dpr); const ctx=c.getContext('2d'); ctx.scale(dpr,dpr); ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.strokeStyle='#12233f';
    let drawing=false,last=null; flow.signature=[];
    const point=(e)=>{const r=c.getBoundingClientRect();return{x:+(e.clientX-r.left).toFixed(2),y:+(e.clientY-r.top).toFixed(2),t:Date.now()}};
    c.addEventListener('pointerdown',(e)=>{e.preventDefault();drawing=true;last=point(e);flow.signature.push({type:'start',...last});c.setPointerCapture?.(e.pointerId)});
    c.addEventListener('pointermove',(e)=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();flow.signature.push({type:'move',...p});last=p});
    const end=(e)=>{if(!drawing)return;drawing=false;const p=point(e);flow.signature.push({type:'end',...p})}; c.addEventListener('pointerup',end); c.addEventListener('pointercancel',end);
  }

  async function finishFlow(){
    if(!$('flow-declare').checked)return alert('Confirme a declaração.'); if(flow.signature.length<4)return alert('Faça a assinatura.');
    const canvas=$('signature-canvas'); flow.signaturePng=canvas.toDataURL('image/png'); const v=db.vehicles.find(x=>x.id===flow.vehicleId); const actor=currentUser();
    if(flow.mode==='EXIT'){
      const movement={id:uid('MOV'),vehicleId:v.id,prefix:v.prefix,plate:v.plate,driverId:actor.id,driver:actor.name,destination:flow.destination,exitTime:nowText(),kmInitial:flow.km,fuelOut:flow.fuel,exitChecks:clone(flow.checks),exitObs:flow.obs,exitPhotos:clone(flow.photos),exitSignature:clone(flow.signature),exitSignaturePng:flow.signaturePng,status:'EM DESLOCAMENTO'};
      db.movements.push(movement); v.status='EM DESLOCAMENTO'; v.km=flow.km; audit('SAIDA',movement.id); saveDb(); alert(`Saída registrada. ${movement.id}`);
    } else {
      const movement=db.movements.find(m=>m.id===flow.moveId); movement.returnTime=nowText(); movement.kmFinal=flow.km; movement.distance=flow.km-movement.kmInitial; movement.fuelIn=flow.fuel; movement.returnChecks=clone(flow.checks); movement.returnObs=flow.obs; movement.returnPhotos=clone(flow.photos); movement.returnSignature=clone(flow.signature); movement.returnSignaturePng=flow.signaturePng; movement.status='FINALIZADA'; v.status='DISPONÍVEL'; v.km=flow.km; audit('REGRESSO',movement.id); saveDb(); alert(`Regresso finalizado. ${movement.distance} km percorridos.`);
    }
    flow=null; showScreen('home');
  }

  function renderHistory(){
    const user=currentUser(); if(!user)return;
    const list=user.role==='GERENTE'?db.movements:db.movements.filter(m=>m.driverId===user.id);
    const root=$('history-list');
    if(!list.length){root.innerHTML='<div class="empty">Nenhuma movimentação registrada.</div>';return;}
    root.innerHTML=list.slice().reverse().map(m=>`<article class="card" style="padding:15px"><div class="row between"><div><b>${esc(m.prefix)} • ${esc(m.plate)}</b><div class="muted">${esc(m.driver)} • ${esc(m.destination)}</div></div><span class="status-pill ${m.status==='FINALIZADA'?'ok':'run'}">${esc(m.status)}</span></div><div class="summary-box"><div class="summary-line"><span>Saída</span><b>${esc(m.exitTime)}</b></div><div class="summary-line"><span>KM inicial</span><b>${fmtKm(m.kmInitial)}</b></div>${m.status==='FINALIZADA'?`<div class="summary-line"><span>Regresso</span><b>${esc(m.returnTime)}</b></div><div class="summary-line"><span>KM percorrido</span><b>${fmtKm(m.distance)}</b></div>`:`<button class="btn primary full" data-action="start-return" data-move-id="${esc(m.id)}">Registrar regresso</button>`}</div></article>`).join('');
  }

  function renderAdmin(){
    const user=currentUser(); if(!user||user.role!=='GERENTE'){alert('Área exclusiva do gerente.');showScreen('home');return;}
    const pending=db.users.filter(u=>u.status==='PENDENTE'); const drivers=db.users.filter(u=>u.role==='MOTORISTA'&&u.status==='ATIVO');
    $('admin-root').innerHTML=`<div class="stats-grid"><div class="stat"><span>Pendentes</span><b>${pending.length}</b></div><div class="stat"><span>Motoristas ativos</span><b>${drivers.length}</b></div><div class="stat"><span>Viaturas</span><b>${db.vehicles.length}</b></div><div class="stat"><span>Movimentações</span><b>${db.movements.length}</b></div></div><h3 class="section-title">Cadastros pendentes</h3><div class="stack">${pending.length?pending.map(u=>`<div class="card" style="padding:14px"><div class="row between"><div><b>${esc(u.name)}</b><div class="muted">${esc(u.rank||'')} • ${esc(u.sector||'')}<br>${esc(u.login)}</div></div><div><button class="mini approve" data-action="approve-user" data-user-id="${esc(u.id)}">Aprovar</button> <button class="mini reject" data-action="reject-user" data-user-id="${esc(u.id)}">Recusar</button></div></div></div>`).join(''):'<div class="empty">Nenhum cadastro pendente.</div>'}</div><h3 class="section-title">Movimentações</h3><div class="table-wrap"><table><thead><tr><th>ID</th><th>Viatura</th><th>Motorista</th><th>Saída</th><th>KM rodado</th><th>Status</th></tr></thead><tbody>${db.movements.slice().reverse().map(m=>`<tr><td>${esc(m.id)}</td><td>${esc(m.prefix)}<br>${esc(m.plate)}</td><td>${esc(m.driver)}</td><td>${esc(m.exitTime)}</td><td>${m.distance==null?'—':esc(m.distance)}</td><td>${esc(m.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function approveUser(id){const u=db.users.find(x=>x.id===id);if(!u)return;u.status='ATIVO';audit('APROVAR_MOTORISTA',id);saveDb();renderAdmin();}
  function rejectUser(id){const u=db.users.find(x=>x.id===id);if(!u)return;u.status='RECUSADO';audit('RECUSAR_MOTORISTA',id);saveDb();renderAdmin();}

  document.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-action]'); if(!button)return;
    const action=button.dataset.action;
    const map={
      'login':doLogin,'logout':()=>{audit('LOGOUT');saveSession(null);flow=null;showScreen('login')},'open-register':()=>showScreen('register'),'go-login':()=>showScreen('login'),'register-driver':registerDriver,
      'go-home':()=>showScreen('home'),'open-vehicles':()=>showScreen('vehicles'),'open-return':openReturn,'open-history':()=>showScreen('history'),'open-admin':()=>showScreen('admin'),
      'start-exit':()=>startExit(button.dataset.vehicleId),'start-return-vehicle':()=>startReturnByVehicle(button.dataset.vehicleId),'start-return':()=>startReturn(button.dataset.moveId),'cancel-flow':()=>{flow=null;showScreen('vehicles')},
      'flow-next-data':nextData,'flow-next-checks':nextChecks,'flow-next-photos':()=>{flow.step=4;renderFlow()},'flow-back':()=>{flow.step=Math.max(1,flow.step-1);renderFlow()},'clear-signature':()=>{flow.signature=[];renderFlow()},'finish-flow':finishFlow,
      'set-check':()=>{flow.checks[button.dataset.item]=button.dataset.value;renderChecks()},'approve-user':()=>approveUser(button.dataset.userId),'reject-user':()=>rejectUser(button.dataset.userId)
    };
    if(map[action]){event.preventDefault();map[action]();}
  });

  document.addEventListener('change',async(event)=>{
    const input=event.target.closest('input[type="file"][data-photo-index]'); if(!input||!input.files?.[0]||!flow)return;
    try{flow.photos[Number(input.dataset.photoIndex)]=await compressImage(input.files[0]);renderPhotos();}catch{alert('Não foi possível processar a foto.');}
  });

  window.addEventListener('error',(e)=>{console.error(e.error||e.message);});

  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  if(currentUser()) showScreen('home'); else showScreen('login');
})();

const PROPS = PropertiesService.getScriptProperties();
const CONFIG = {
  SPREADSHEET_ID: PROPS.getProperty('SPREADSHEET_ID'),
  ROOT_FOLDER_ID: PROPS.getProperty('ROOT_FOLDER_ID'),
  VEHICLES_FOLDER_ID: PROPS.getProperty('VEHICLES_FOLDER_ID'),
  TZ: PROPS.getProperty('TZ') || 'America/Sao_Paulo'
};

function doGet(e){
  return json_({ok:true, service:'Controle de Viaturas AFA', version:'1.0.0', time:new Date().toISOString()});
}

function doPost(e){
  try{
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action;
    if(action==='login') return json_(login_(body.login, body.password));
    if(action==='registerDriver') return json_(registerDriver_(body));
    const user = requireToken_(body.token);
    if(action==='bootstrap') return json_(bootstrap_(user));
    if(action==='createExit') return json_(createExit_(user, body));
    if(action==='finishReturn') return json_(finishReturn_(user, body));
    if(action==='approveDriver') return json_(approveDriver_(user, body.userId, true));
    if(action==='rejectDriver') return json_(approveDriver_(user, body.userId, false));
    return json_({ok:false,error:'Ação desconhecida'});
  }catch(err){return json_({ok:false,error:String(err && err.message || err)});}
}

function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function ss_(){if(!CONFIG.SPREADSHEET_ID)throw new Error('SPREADSHEET_ID não configurado nas propriedades do script');return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);}
function sh_(name){const s=ss_().getSheetByName(name);if(!s)throw new Error('Aba não encontrada: '+name);return s;}
function now_(){return Utilities.formatDate(new Date(),CONFIG.TZ,'dd/MM/yyyy HH:mm:ss');}
function id_(p){return p+'-'+Utilities.formatDate(new Date(),CONFIG.TZ,'yyyyMMddHHmmss')+'-'+Math.floor(Math.random()*900+100);}
function values_(name){const sh=sh_(name), data=sh.getDataRange().getValues(); if(data.length<2)return []; const h=data[0].map(String); return data.slice(1).filter(r=>r.some(v=>v!==''&&v!=null)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));}
function append_(name,obj){const sh=sh_(name), headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);sh.appendRow(headers.map(h=>obj[h]??''));}
function rowBy_(name,key,value){const rows=values_(name);return rows.find(r=>String(r[key])===String(value))||null;}
function rowIndexBy_(name,key,value){const sh=sh_(name), data=sh.getDataRange().getValues(), headers=data[0].map(String), idx=headers.indexOf(key);for(let i=1;i<data.length;i++)if(String(data[i][idx])===String(value))return {row:i+1,headers};return null;}
function setFields_(name,key,value,fields){const found=rowIndexBy_(name,key,value);if(!found)throw new Error('Registro não encontrado');const sh=sh_(name);Object.entries(fields).forEach(([k,v])=>{const c=found.headers.indexOf(k);if(c>=0)sh.getRange(found.row,c+1).setValue(v);});}
function salt_(){return Utilities.getUuid().replace(/-/g,'');}
function hash_(password,salt){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt+'|'+password, Utilities.Charset.UTF_8);return bytes.map(b=>(b+256)%256).map(b=>('0'+b.toString(16)).slice(-2)).join('');}
function token_(){return Utilities.getUuid()+Utilities.getUuid();}
function putToken_(token,user){CacheService.getScriptCache().put('S_'+token,JSON.stringify(user),21600);}
function requireToken_(token){if(!token)throw new Error('Sessão não informada');const raw=CacheService.getScriptCache().get('S_'+token);if(!raw)throw new Error('Sessão expirada');return JSON.parse(raw);}
function log_(user,event,result,moveId,obs){append_('LOG_ACESSOS',{ID_LOG:id_('LOG'),DATA_HORA:now_(),ID_MOTORISTA:user&&user.ID_MOTORISTA||'',LOGIN:user&&user.LOGIN||'',EVENTO:event,RESULTADO:result||'OK',ID_MOVIMENTACAO:moveId||'',OBSERVACAO:obs||''});}

function login_(login,password){
  const access=rowBy_('ACESSOS','LOGIN',login); if(!access||String(access.STATUS)!=='ATIVO')return {ok:false,error:'Login não autorizado'};
  const expected=hash_(password,String(access.SALT)); if(expected!==String(access.HASH_SENHA))return {ok:false,error:'Login ou senha incorretos'};
  const driver=rowBy_('MOTORISTAS','ID_MOTORISTA',access.ID_MOTORISTA); if(!driver||String(driver.STATUS)!=='ATIVO')return {ok:false,error:'Cadastro não está ativo'};
  const user={ID_MOTORISTA:driver.ID_MOTORISTA,NOME_COMPLETO:driver.NOME_COMPLETO,LOGIN:login,PERFIL:driver.PERFIL,SETOR:driver.SETOR}; const token=token_();putToken_(token,user);setFields_('ACESSOS','LOGIN',login,{ULTIMO_LOGIN:now_(),TENTATIVAS_FALHAS:0});log_(user,'LOGIN','OK','','');
  const boot=bootstrap_(user);return {ok:true,token,user:{id:user.ID_MOTORISTA,name:user.NOME_COMPLETO,login:user.LOGIN,role:user.PERFIL,status:'ATIVO',sector:user.SETOR},vehicles:boot.vehicles,movements:boot.movements};
}

function registerDriver_(b){
  if(!b.name||!b.login||!b.password||String(b.password).length<6)return {ok:false,error:'Dados incompletos'};
  if(rowBy_('ACESSOS','LOGIN',b.login))return {ok:false,error:'Login já cadastrado'};
  const id=id_('MOT'), salt=salt_(), hash=hash_(b.password,salt), when=now_();
  append_('MOTORISTAS',{ID_MOTORISTA:id,NOME_COMPLETO:b.name,POSTO_GRADUACAO:b.rank||'',SETOR:b.sector||'',EMAIL_LOGIN:b.login,STATUS:'PENDENTE',PERFIL:'MOTORISTA',DATA_CADASTRO:when});
  append_('ACESSOS',{ID_MOTORISTA:id,LOGIN:b.login,SALT:salt,HASH_SENHA:hash,ALGORITMO:'SHA-256',STATUS:'PENDENTE',TENTATIVAS_FALHAS:0});
  append_('PENDENTES_APROVACAO',{ID_SOLICITACAO:id_('SOL'),ID_MOTORISTA:id,NOME_COMPLETO:b.name,EMAIL_LOGIN:b.login,SETOR:b.sector||'',DATA_SOLICITACAO:when,STATUS:'PENDENTE'});
  return {ok:true,id};
}

function bootstrap_(user){
  const vehicles=values_('VIATURAS').map(r=>({id:r.ID_VIATURA,prefix:r.PREFIXO,plate:r.PLACA,model:r.MARCA_MODELO,year:r.ANO,sector:r.SETOR,status:r.STATUS||'DISPONÍVEL',km:Number(r.QUILOMETRAGEM||0),folder:r.LINK_PASTA_DRIVE||''}));
  const movements=values_('MOVIMENTACOES').map(r=>({id:r.ID_MOV,vehicleId:'',prefix:r.PREFIXO,plate:r.PLACA,driver:r.CONDUTOR,destination:r.FINALIDADE_DESTINO,exitTime:r.SAIDA_DATA_HORA,kmInitial:Number(r.KM_INICIAL||0),returnTime:r.REGRESSO_DATA_HORA,kmFinal:Number(r.KM_FINAL||0),distance:Number(r.KM_PERCORRIDO||0),status:r.STATUS,pdf:r.LINK_RELATORIO_PDF||''}));
  return {ok:true,vehicles,movements};
}

function createExit_(user,b){
  const moveId=id_('MOV'), folder=movementFolder_(b.prefix,moveId), photoLinks=saveMedia_(folder,b.photos||[],'saida_foto'), sigPng=saveDataUrl_(folder,b.signaturePng,'assinatura_saida.png'), sigJson=saveText_(folder,JSON.stringify(b.signature||[]),'assinatura_saida.json','application/json');
  append_('MOVIMENTACOES',{ID_MOV:moveId,PREFIXO:b.prefix,PLACA:b.plate,CONDUTOR:user.NOME_COMPLETO,FINALIDADE_DESTINO:b.destination,SAIDA_DATA_HORA:now_(),KM_INICIAL:b.kmInitial,STATUS:'EM DESLOCAMENTO',ID_CHECKLIST_SAIDA:id_('CHK'),LINK_PASTA_DRIVE:folder.getUrl()});
  append_('CHECKLIST_SAIDA',{ID_CHECKLIST:id_('CHK'),ID_MOV:moveId,DATA_HORA:now_(),PREFIXO:b.prefix,PLACA:b.plate,KM_INICIAL:b.kmInitial,CONDUTOR:user.NOME_COMPLETO,COMBUSTIVEL:b.fuel,PNEUS:b.checks&&b.checks['Pneus'],LUZES:b.checks&&b.checks['Iluminação'],FREIOS:b.checks&&b.checks['Freios'],OLEO:b.checks&&b.checks['Óleo'],AGUA:b.checks&&b.checks['Água'],DOCUMENTACAO:b.checks&&b.checks['Documentação'],LIMPEZA:b.checks&&b.checks['Limpeza'],AVARIA:b.checks&&b.checks['Avarias'],OBSERVACOES:b.obs||'',LINK_FOTOS:photoLinks.join(' | '),ASSINATURA_JSON:sigJson,LINK_ASSINATURA:sigPng,RESULTADO:Object.values(b.checks||{}).includes('NC')?'ATENÇÃO':'APTO'});
  setFields_('VIATURAS','PREFIXO',b.prefix,{STATUS:'EM DESLOCAMENTO'});log_(user,'SAIDA','OK',moveId,b.prefix);return {ok:true,moveId,folderUrl:folder.getUrl()};
}

function finishReturn_(user,b){
  const row=rowBy_('MOVIMENTACOES','ID_MOV',b.moveId);if(!row)throw new Error('Movimentação não encontrada');if(Number(b.kmFinal)<Number(row.KM_INICIAL))throw new Error('KM final menor que o inicial');
  const folder=folderFromUrl_(row.LINK_PASTA_DRIVE)||movementFolder_(row.PREFIXO,b.moveId); const photoLinks=saveMedia_(folder,b.photos||[],'regresso_foto'), sigPng=saveDataUrl_(folder,b.signaturePng,'assinatura_regresso.png'), sigJson=saveText_(folder,JSON.stringify(b.signature||[]),'assinatura_regresso.json','application/json'), distance=Number(b.kmFinal)-Number(row.KM_INICIAL);
  append_('CHECKLIST_REGRESSO',{ID_CHECKLIST:id_('CHK'),ID_MOV:b.moveId,DATA_HORA:now_(),PREFIXO:row.PREFIXO,PLACA:row.PLACA,KM_FINAL:b.kmFinal,CONDUTOR:user.NOME_COMPLETO,COMBUSTIVEL:b.fuel,PNEUS:b.checks&&b.checks['Pneus'],LUZES:b.checks&&b.checks['Iluminação'],FREIOS:b.checks&&b.checks['Freios'],OLEO:b.checks&&b.checks['Óleo'],AGUA:b.checks&&b.checks['Água'],DOCUMENTACAO:b.checks&&b.checks['Documentação'],LIMPEZA:b.checks&&b.checks['Limpeza'],NOVA_AVARIA:b.checks&&b.checks['Avarias'],OBSERVACOES:b.obs||'',LINK_FOTOS:photoLinks.join(' | '),ASSINATURA_JSON:sigJson,LINK_ASSINATURA:sigPng,RESULTADO:Object.values(b.checks||{}).includes('NC')?'ATENÇÃO':'APTO'});
  const pdf=buildPdf_(folder,row,b,distance,sigPng,photoLinks);setFields_('MOVIMENTACOES','ID_MOV',b.moveId,{REGRESSO_DATA_HORA:now_(),KM_FINAL:b.kmFinal,KM_PERCORRIDO:distance,STATUS:'FINALIZADA',ID_CHECKLIST_REGRESSO:id_('CHK'),LINK_RELATORIO_PDF:pdf});setFields_('VIATURAS','PREFIXO',row.PREFIXO,{STATUS:'DISPONÍVEL'});log_(user,'REGRESSO','OK',b.moveId,row.PREFIXO);return {ok:true,distance,pdfUrl:pdf};
}

function approveDriver_(user,userId,approved){if(user.PERFIL!=='GERENTE')throw new Error('Sem permissão');const status=approved?'ATIVO':'RECUSADO';setFields_('MOTORISTAS','ID_MOTORISTA',userId,{STATUS:status,DATA_APROVACAO:now_()});setFields_('ACESSOS','ID_MOTORISTA',userId,{STATUS:status});const p=rowBy_('PENDENTES_APROVACAO','ID_MOTORISTA',userId);if(p)setFields_('PENDENTES_APROVACAO','ID_MOTORISTA',userId,{STATUS:status,APROVADO_POR:user.NOME_COMPLETO,DATA_DECISAO:now_()});log_(user,approved?'APROVAR_MOTORISTA':'RECUSAR_MOTORISTA','OK','',userId);return {ok:true};}

function movementFolder_(prefix,moveId){if(!CONFIG.VEHICLES_FOLDER_ID)throw new Error('VEHICLES_FOLDER_ID não configurado');const base=DriveApp.getFolderById(CONFIG.VEHICLES_FOLDER_ID), y=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy'), m=Utilities.formatDate(new Date(),CONFIG.TZ,'MM'), d=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');return ensureFolder_(ensureFolder_(ensureFolder_(ensureFolder_(base,prefix),y),m),d).createFolder(moveId);}
function ensureFolder_(parent,name){const it=parent.getFoldersByName(name);return it.hasNext()?it.next():parent.createFolder(name);}
function folderFromUrl_(url){try{const id=String(url||'').match(/[-\w]{20,}/);return id?DriveApp.getFolderById(id[0]):null;}catch(e){return null;}}
function saveMedia_(folder,arr,prefix){return arr.filter(Boolean).map((d,i)=>saveDataUrl_(folder,d,prefix+'_'+String(i+1).padStart(2,'0')+'.jpg'));}
function saveDataUrl_(folder,dataUrl,name){if(!dataUrl)return '';const m=String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);if(!m)return '';const blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],name);return folder.createFile(blob).getUrl();}
function saveText_(folder,text,name,mime){return folder.createFile(Utilities.newBlob(text,mime||'text/plain',name)).getUrl();}
function buildPdf_(folder,row,b,distance,sigUrl,photos){const doc=DocumentApp.create('Relatório '+row.ID_MOV),body=doc.getBody();body.appendParagraph('ACADEMIA DA FORÇA AÉREA').setHeading(DocumentApp.ParagraphHeading.HEADING1);body.appendParagraph('CHECKLIST DE VIATURA — RELATÓRIO FINAL').setHeading(DocumentApp.ParagraphHeading.HEADING2);[['Movimentação',row.ID_MOV],['Viatura',row.PREFIXO+' — '+row.PLACA],['Motorista',row.CONDUTOR],['Finalidade',row.FINALIDADE_DESTINO],['Saída',row.SAIDA_DATA_HORA],['KM inicial',row.KM_INICIAL],['Regresso',now_()],['KM final',b.kmFinal],['KM percorrido',distance]].forEach(x=>body.appendParagraph(x[0]+': '+x[1]));body.appendParagraph('Observações do regresso: '+(b.obs||'Sem observações.'));body.appendParagraph('Assinatura do regresso: '+(sigUrl||''));body.appendParagraph('Fotos do regresso: '+(photos||[]).join(' | '));doc.saveAndClose();const f=DriveApp.getFileById(doc.getId());folder.addFile(f);DriveApp.getRootFolder().removeFile(f);const pdf=folder.createFile(f.getAs(MimeType.PDF).setName('relatorio-final.pdf'));return pdf.getUrl();}

function setupManager(login,password,name){const id='MGR-001',salt=salt_(),hash=hash_(password,salt),when=now_();append_('MOTORISTAS',{ID_MOTORISTA:id,NOME_COMPLETO:name||'Gerente',POSTO_GRADUACAO:'',SETOR:'Gerência',EMAIL_LOGIN:login,STATUS:'ATIVO',PERFIL:'GERENTE',DATA_CADASTRO:when,DATA_APROVACAO:when});append_('ACESSOS',{ID_MOTORISTA:id,LOGIN:login,SALT:salt,HASH_SENHA:hash,ALGORITMO:'SHA-256',STATUS:'ATIVO',TENTATIVAS_FALHAS:0});return 'Gerente criado';}

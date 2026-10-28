const API=(window.ROOTRISE_API_BASE||'').replace(/\/$/,'');
const $=id=>document.getElementById(id);
let accounts=[];
async function request(path,options={}){const r=await fetch(`${API}/api${path}`,{...options,credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Request failed.');return data}
function say(text,error=false){const el=$('loginMessage');el.textContent=text;el.dataset.error=String(error)}
function when(value){if(!value)return'—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function online(a){return a.deviceOnline===true&&a.lastSeenAt&&Date.now()-new Date(a.lastSeenAt).getTime()<10*60*1000}
function render(){
 $('navCount').textContent=accounts.length;
 $('recordCount').textContent=`${accounts.length} account${accounts.length===1?'':'s'} · Open directory ↗`;
 $('statFarmers').textContent=accounts.length;
 $('statOnline').textContent=accounts.filter(online).length;
 $('statReporting').textContent=accounts.filter(a=>a.latest&&(a.latest.airTemperature!=null||a.latest.airHumidity!=null||a.latest.soilMoisture!=null)).length;
 $('statPumps').textContent=accounts.filter(a=>online(a)&&a.latest?.pumpOn===true).length;
 const active=accounts.filter(a=>a.latest).sort((a,b)=>new Date(b.latest.recordedAt||0)-new Date(a.latest.recordedAt||0))[0],list=$('latestReadings');list.replaceChildren();
 if(!active){const empty=document.createElement('div');empty.className='reading-empty';empty.append('No opted-in sensor data yet.');const span=document.createElement('span');span.textContent='Readings appear after a farmer opts in and connects an ESP32.';empty.append(document.createElement('br'),span);list.append(empty)}
 else{const v=active.latest,fields=[['Farmer',active.name||active.email],['Soil moisture',v.soilMoisture==null?'—':`${v.soilMoisture}%`],['Air temperature',v.airTemperature==null?'—':`${v.airTemperature} °C`],['Air humidity',v.airHumidity==null?'—':`${v.airHumidity}%`],['Water used',v.waterUsedLitres==null?'Not reported':`${v.waterUsedLitres} L`],['Last update',when(v.recordedAt)]];for(const [label,value] of fields){const row=document.createElement('div');row.className='reading';const k=document.createElement('span'),val=document.createElement('strong');k.textContent=label;val.textContent=value;row.append(k,val);list.append(row)}}
 $('lastRefresh').textContent=`Updated ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`
}
async function loadAccounts(){ $('cloudHealth').textContent='Syncing account data';try{const data=await request('/admin/users');accounts=data.users||[];render();$('cloudHealth').textContent='Connected · MongoDB';}catch(error){$('cloudHealth').textContent='Access unavailable';$('recordCount').textContent='Directory unavailable';say(error.message,true)}}
async function establish(user){if(user.role!=='admin'){say('This account is not an administrator. Ask the project owner to provision admin access.',true);return} $('loginShell').classList.add('hidden');$('dashboard').classList.remove('hidden');$('adminLabel').textContent=user.email;$('cloudHealth').textContent='Checking MongoDB';await loadAccounts()}
$('refreshButton').addEventListener('click',loadAccounts);$('adminLogout').addEventListener('click',async()=>{try{await request('/auth/logout',{method:'POST',body:'{}'})}catch(_){}$('dashboard').classList.add('hidden');$('loginShell').classList.remove('hidden');say('Signed out.')});
$('adminLogin').addEventListener('submit',async e=>{e.preventDefault();say('Signing in…');try{const result=await request('/auth/login',{method:'POST',body:JSON.stringify({email:$('adminEmail').value,password:$('adminPassword').value})});$('adminPassword').value='';await establish(result.user)}catch(error){say(error.message,true)}});
(async()=>{try{const result=await request('/auth/me');await establish(result.user)}catch(_){$('cloudHealth').textContent='Signed out';say('Sign in with your administrator account.')}})();

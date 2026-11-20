(function(){
"use strict";

/* ================= CONFIGURACIÓN ================= */
var NODO_REAL="A-03";  /* nodo que corresponde a los sensores conectados al ESP32 */
var CAM_NODO="A-01";   /* nodo que muestra la ESP32-CAM en vivo (vista RGB) */
var DEMO=false;         /* true: los otros nodos muestran datos simulados. false: aparecen sin conexión */
var ESCENARIO=false;    /* solo con DEMO: nodo 2 con señal de alerta, nodo 5 sin datos y nodo 4 pasa a posible incendio al minuto */
var TOTAL=5;           /* nodos en el mapa (2 postes cada 40 m) */
var LARGO_M=160;       /* distancia entre el primer y el último nodo, en metros */
var MAXH=30;           /* lecturas que guarda cada gráfico */
var CADA_MS=2000;      /* cada cuánto se consulta al ESP32 */
var LIMITE_S=10;       /* segundos sin respuesta del ESP32 antes de avisar */
var OPERADORA="Carolina Mena";
var SECTOR="Sector Parque Mahuida, borde de Av. Álvaro Casanova"; /* sector de ejemplo para los avisos */

/* Glosario: el POSTE es la estructura física, el NODO es el sensor que va en él, el FOCO es el fuego.
   Estados: Normal, Advertencia, Crítico, Sin conexión. Una ALERTA es el evento que abre un cambio de estado. */
var EST={normal:{t:"Normal",c:"ok",d:"sin señales",z:"Sin señales"},adv:{t:"Advertencia",c:"warn",d:"señal de alerta, mirar la cámara",z:"Señal de alerta"},crit:{t:"Crítico",c:"crit",d:"posible incendio, avisar a Bomberos",z:"Posible incendio"},off:{t:"Sin conexión",c:"off",d:"el nodo no envía datos",z:"Sin datos"}};
function sector(n){return "Nodo "+n.poste;}
var ORDEN={crit:0,adv:1,off:2,normal:3};
var MESES=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
var TIT={ayuda:"Ayuda",monitoreo:"Inicio",alertas:"Alertas",eventos:"Historial",post:"Post-incendio",avisos:"Vista previa de avisos"};
var BAJ={ayuda:"Guías para usar el panel",monitoreo:"Corredor de protección forestal de 100 m · La Reina",alertas:"Alertas abiertas y su ciclo de atención",eventos:"Historial de cambios de estado y de alertas",post:"Herramienta · suelo antes y después de un incendio",avisos:"Herramienta · lo que recibe cada usuario cuando se emite un aviso"};
var ZOOMS=[1,1.6,2.4];
var U={tAdv:25,tCrit:30,hAdv:30,hCrit:20};   /* umbrales; el ESP32 los envía y reemplazan estos */
var G={W:340,H:152,L:34,R:330,T:10,B:122};   /* geometría de los gráficos del detalle */
var VIENTO_BASE=225;   /* grados: de dónde sopla el viento (225 = suroeste) */

var nodos=[],eventos=[],alertas=[],selManual=null,vista="monitoreo",verTodos=false;
var serie={tm:[],tx:[],hm:[],vm:[]};
var zi=0,foco={x:.5,y:.5};
var ultimaResp=null,sonido=false,audio=null,ultimoPitido=0,sigAlerta=1;

function $(id){return document.getElementById(id);}
function p2(n){return (n<10?"0":"")+n;}
function hm(d){return d?p2(d.getHours())+":"+p2(d.getMinutes()):"--:--";}
function hms(d){return d?hm(d)+":"+p2(d.getSeconds()):"--:--:--";}
function fecha(d){return d.getDate()+" "+MESES[d.getMonth()]+" "+d.getFullYear();}
function r1(v){return Math.round(v*10)/10;}
function fmt(v,d){if(v===null||v===undefined||isNaN(v)){return "--";}return Number(v).toLocaleString("es-CL",{minimumFractionDigits:d,maximumFractionDigits:d});}
function set(el,h){if(el&&el.__h!==h){el.innerHTML=h;el.__h=h;}}
function ic(n,c){return '<svg class="ic'+(c?" "+c:"")+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>';}
function nodo(id){for(var i=0;i<nodos.length;i++){if(nodos[i].id===id){return nodos[i];}}return null;}
function metros(n){return Math.round((n.poste-1)*LARGO_M/(TOTAL-1));}
function idPoste(n){return "Nodo "+n.poste;}
function idTec(n){return "Nodo "+n.poste+" ("+n.id+")";}
function id2(n){return '<b>Nodo '+n.poste+'</b>';}
function rosa(g){var t=["N","NE","E","SE","S","SO","O","NO"];return t[Math.round(((g%360)+360)%360/45)%8];}
function hace(d){var s=Math.max(0,Math.round((Date.now()-d)/1000)),m;if(s<60){return "hace "+s+" s";}m=Math.floor(s/60);if(m<60){return "hace "+m+" min";}return "hace "+Math.floor(m/60)+" h "+(m%60)+" min";}

/* Marca de estado: forma + color. Normal = círculo con check, Advertencia = triángulo, Crítico = círculo con exclamación, Sin conexión = círculo tachado */
function marca(e,s){
  s=s||20;
  var a='<svg class="mk" width="'+s+'" height="'+s+'" viewBox="0 0 20 20" aria-hidden="true">';
  if(e==="normal"){a+='<circle cx="10" cy="10" r="9" style="fill:var(--ok)"/><path d="M5.8 10.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';}
  else if(e==="adv"){a+='<path d="M10 1.6L19.2 17.8H.8z" fill="#FFAA00" stroke="#FFAA00" stroke-width="1" stroke-linejoin="round"/><path d="M10 7.4v4.6" stroke="#131927" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="15" r="1.2" fill="#131927"/>';}
  else if(e==="crit"){a+='<circle cx="10" cy="10" r="10" style="fill:var(--mkc,#A9302D)"/><path d="M10.1 7v4.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="10.2" cy="14.6" r="1.2" fill="#fff"/>';}
  else{a+='<circle cx="10" cy="10" r="8" fill="#fff" style="stroke:var(--off)" stroke-width="2.2"/><path d="M4.6 15.4L15.4 4.6" style="stroke:var(--off)" stroke-width="2.2" stroke-linecap="round"/>';}
  return a+'</svg>';
}
function pill(e){return '<span class="pill t-'+EST[e].c+'">'+marca(e,16)+EST[e].t+'</span>';}

/* ================= DATOS ================= */
function clasificar(t,h){
  if(t===null||t===undefined){return {e:"off",m:"Sin datos"};}
  if(t>=U.tCrit){return {e:"crit",m:"Temperatura crítica"};}
  if(h!==null&&h<U.hCrit){return {e:"crit",m:"Humedad crítica"};}
  if(t>=U.tAdv){return {e:"adv",m:"Temperatura elevada"};}
  if(h!==null&&h<U.hAdv){return {e:"adv",m:"Humedad baja"};}
  return {e:"normal",m:"Condiciones normales"};
}
function paso(n){
  n.temp=r1(n.temp+(n.bt-n.temp)*.15+(Math.random()-.5)*.5);
  n.hum=r1(n.hum+(n.bh-n.hum)*.15+(Math.random()-.5)*1.4);
  n.ht.push(n.temp);n.hh.push(n.hum);
  if(n.ht.length>MAXH){n.ht.shift();n.hh.shift();}
}
/* viento (km/h), dirección y partículas: simulados hasta conectar anemómetro, veleta y sensor MP2,5 */
function clima(n){
  n.v=Math.max(0,r1(n.v+(n.vb-n.v)*.2+(Math.random()-.5)*2));
  n.dir=(n.dir+(Math.random()-.5)*10+360)%360;
  n.pm=Math.max(2,Math.round(n.pm+(n.pb-n.pm)*.2+(Math.random()-.5)*2));
}
function registrar(n,txt,est,t,ciclo){
  eventos.unshift({t:t||new Date(),id:n.id,poste:n.poste,txt:txt,est:est,ciclo:!!ciclo});
  if(eventos.length>200){eventos.pop();}
}
function iniciar(){
  var ahora=Date.now(),i,j,n,c,a5,a9,al;
  for(i=0;i<TOTAL;i++){
    n={id:"A-"+p2(i+1),poste:i+1,estado:"off",motivo:"Sin datos",temp:null,hum:null,suelo:null,dsmPulse:0,dsmValido:false,ht:[],hh:[],ultima:null,desde:new Date(ahora)};
    n.real=n.id===NODO_REAL;
    n.vb=11+Math.random()*9;n.v=n.vb;n.dir=(VIENTO_BASE+(Math.random()-.5)*30+360)%360;n.pb=10+Math.random()*10;n.pm=n.pb;
    n.lat=-33.4400+metros(n)*0.0000030;n.lng=-70.5300+metros(n)*0.0000108;
    if(DEMO&&!n.real){
      n.bt=21+Math.random()*2.6;n.bh=39+Math.random()*8;
      if(ESCENARIO&&n.id==="A-02"){n.bh=26;}
      if(ESCENARIO&&n.id==="A-05"){n.caido=true;n.ultima=new Date(ahora-108*60000);}
      else{
        n.temp=n.bt;n.hum=n.bh;
        for(j=0;j<MAXH;j++){paso(n);}
        c=clasificar(n.temp,n.hum);n.estado=c.e;n.motivo=c.m;n.ultima=new Date(ahora-Math.random()*20000);
      }
      if(ESCENARIO&&n.id==="A-04"){n.escalaEn=ahora+60000;}
    }
    nodos.push(n);
  }
  if(DEMO&&ESCENARIO){
    a9=nodo("A-05");a5=nodo("A-02");
    a9.desde=new Date(ahora-108*60000);a5.desde=new Date(ahora-47*60000);
    registrar(nodo("A-04"),"Condiciones normales","normal",new Date(ahora-131*60000));
    registrar(a9,"Sin conexión","off",new Date(ahora-108*60000));
    registrar(a5,"Humedad baja","adv",new Date(ahora-47*60000));
    registrar(a5,"Alerta atendida por "+OPERADORA,"adv",new Date(ahora-44*60000),true);
    abrirAlerta(a9,"off","Sin conexión",new Date(ahora-108*60000),true);
    al=abrirAlerta(a5,"adv","Humedad baja",new Date(ahora-47*60000),true);
    al.estado="reconocida";al.por=OPERADORA;al.tRec=new Date(ahora-44*60000);
  }
  /* con datos simulados, las tendencias del corredor parten con historia */
  if(DEMO){
    var sim=nodos.filter(function(n){return n.ht.length===MAXH;});
    for(j=0;j<MAXH&&sim.length;j++){
      serie.tx.push(Math.max.apply(null,sim.map(function(n){return n.ht[j];})));
      serie.hm.push(Math.min.apply(null,sim.map(function(n){return n.hh[j];})));
      serie.tm.push(r1(sim.reduce(function(t,n){return t+n.ht[j];},0)/sim.length));
      serie.vm.push(r1(sim.reduce(function(t,n){return t+n.v;},0)/sim.length));
    }
  }
  set($("pie"),"Prototipo · Poste "+p2(nodo(NODO_REAL).poste)+" · Nodo "+NODO_REAL+" con DHT22, DS18B20 y DSM501A reales"+(DEMO?". El resto de los nodos es simulado.":"."));
}

/* ---- alertas: Nueva → Reconocida → Resuelta ---- */
function abiertaDe(n){for(var i=0;i<alertas.length;i++){if(alertas[i].id===n.id&&alertas[i].estado!=="resuelta"){return alertas[i];}}return null;}
function alertaNum(k){for(var i=0;i<alertas.length;i++){if(alertas[i].n===k){return alertas[i];}}return null;}
function abrirAlerta(n,est,txt,t,silencio){
  var a={n:sigAlerta++,id:n.id,est:est,txt:txt,t:t||new Date(),estado:"nueva",por:null,tRec:null,tNorm:null};
  alertas.unshift(a);
  if(est==="crit"&&!silencio){avisarCritico(n,a);}
  return a;
}
function cambiar(n,est,txt){
  var a,mas;
  if(n.estado===est){n.motivo=txt;return;}
  n.estado=est;n.motivo=txt;n.desde=new Date();
  registrar(n,txt,est);
  a=abiertaDe(n);
  if(est==="normal"){if(a&&!a.tNorm){a.tNorm=new Date();}return;}
  if(!a){abrirAlerta(n,est,txt);return;}
  mas=ORDEN[est]<ORDEN[a.est];
  a.est=est;a.txt=txt;a.tNorm=null;
  if(mas){a.estado="nueva";a.por=null;a.tRec=null;a.t=new Date();if(est==="crit"){avisarCritico(n,a);}}
}
function reconocer(a){
  if(!a||a.estado!=="nueva"){return;}
  a.estado="reconocida";a.por=OPERADORA;a.tRec=new Date();
  registrar(nodo(a.id),"Alerta atendida por "+OPERADORA,a.est,null,true);
  pintar();
}
function resolver(a){
  var n;
  if(!a||a.estado!=="reconocida"){return;}
  n=nodo(a.id);a.estado="resuelta";
  registrar(n,"Alerta cerrada por "+OPERADORA,n.estado,null,true);
  pintar();
}
function avisarCritico(n,a){
  $("vivo").textContent="";
  setTimeout(function(){$("vivo").textContent="Crítico en "+idPoste(n)+" a las "+hm(a.t)+". "+a.txt+".";},50);
  if(sonido){pitar();}
}

/* ---- lectura del ESP32 ---- */
function aplicar(n,d){
  var c,esp;
  if(d.umbralAlerta){U.tAdv=d.umbralAlerta;}
  if(d.umbralCritico){U.tCrit=d.umbralCritico;}
  if(d.umbralHumAdv){U.hAdv=d.umbralHumAdv;}
  if(d.umbralHumCrit){U.hCrit=d.umbralHumCrit;}
  n.temp=typeof d.temperatura==="number"?d.temperatura:null;
  n.hum=typeof d.humedad==="number"?d.humedad:null;
  n.suelo=typeof d.temperaturaSuelo==="number"?d.temperaturaSuelo:null;
  n.dsmPulse=Number(d.dsmPulse||0);n.dsmValido=!!d.dsmValido;
  n.ht=d.historialTemp||[];n.hh=d.historialHum||[];
  n.ultima=new Date();
  c=clasificar(n.temp,n.hum);
  esp=d.estado==="CRITICO"?"crit":(d.estado==="ADVERTENCIA"||d.estado==="ALERTA")?"adv":"normal";
  if(ORDEN[esp]<ORDEN[c.e]){c={e:esp,m:esp==="crit"?"Condición crítica":"Condición de advertencia"};}
  if(n.estado==="off"&&c.e==="normal"){c.m="Conexión establecida";}
  cambiar(n,c.e,c.m);
}
function conectarMQTT(){
  if(!window.mqtt || !window.APP_CONFIG){
    console.error("No se pudo cargar MQTT.js o config.js.");
    cambiar(nodo(NODO_REAL),"off","No se pudo iniciar MQTT");
    pintar();
    return;
  }
  var cfg=window.APP_CONFIG;
  var cliente=mqtt.connect(cfg.brokerUrl,{
    clientId:"cortafuego_web_"+Math.random().toString(16).slice(2,10),
    clean:true,
    connectTimeout:10000,
    reconnectPeriod:3000
  });
  cliente.on("connect",function(){
    console.info("MQTT conectado:",cfg.brokerUrl);
    cliente.subscribe(cfg.topic,{qos:0},function(err){
      if(err){console.error("Error al suscribirse al topic:",err);}
      else{console.info("Suscrito a:",cfg.topic);}
    });
  });
  cliente.on("reconnect",function(){console.info("Reconectando a MQTT...");});
  cliente.on("offline",function(){console.warn("Cliente MQTT sin conexión.");});
  cliente.on("error",function(err){console.error("Error MQTT:",err);});
  cliente.on("message",function(topic,payload){
    if(topic!==cfg.topic){return;}
    try{
      var d=JSON.parse(payload.toString());
      if(!d || typeof d!=="object"){throw new Error("JSON vacío o inválido");}
      var real=nodo(NODO_REAL);
      if(!real){return;}
      if(d.lecturas!==0 && !(Number(d.edadMs)>10000)){
        ultimaResp=new Date();
        aplicar(real,d);
      }else{
        real.suelo=typeof d.temperaturaSuelo==="number"?d.temperaturaSuelo:null;
        cambiar(real,"off","Sensor sin respuesta");
      }
    }catch(err){
      console.error("No se pudo interpretar el mensaje MQTT:",err,payload.toString());
    }
  });
}
function actualizarDashboard(){
  var real=nodo(NODO_REAL),t=[],h=[],v=[],s=0,sv=0,ahora=Date.now();
  if(real){
    var segundos=ultimaResp?((ahora-ultimaResp.getTime())/1000):Infinity;
    if(segundos>LIMITE_S){
      cambiar(real,"off",ultimaResp?"Sin datos nuevos del ESP32":"Esperando datos MQTT");
    }
  }
  nodos.forEach(function(n){
    var c;
    clima(n);
    if(DEMO&&!n.real&&!n.caido){
      if(n.escalaEn&&ahora>=n.escalaEn&&!n.escalando){n.bt=31.5;n.bh=24;n.escalando=true;}
      if(n.escalando||Math.random()<.3){paso(n);n.ultima=new Date();c=clasificar(n.temp,n.hum);cambiar(n,c.e,c.m);}
    }
    if(n.estado!=="off"&&n.temp!==null){t.push(n.temp);h.push(n.hum);s+=n.temp;v.push(n.v);sv+=n.v;}
  });
  if(t.length){
    serie.tm.push(r1(s/t.length));serie.tx.push(Math.max.apply(null,t));serie.hm.push(Math.min.apply(null,h));serie.vm.push(r1(sv/v.length));
    if(serie.tm.length>MAXH){serie.tm.shift();serie.tx.shift();serie.hm.shift();serie.vm.shift();}
  }
  pintar();
}

/* ================= GRÁFICOS ================= */
function spark(v,nombre){
  var W=120,H=24,i,mn,mx,m,pts=[];
  if(v.length<2){return '<svg class="sp" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true"><line x1="2" y1="16" x2="118" y2="16" style="stroke:var(--trend)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';}
  mn=Math.min.apply(null,v);mx=Math.max.apply(null,v);
  if(mx-mn<2){m=(mx+mn)/2;mn=m-1;mx=m+1;}
  for(i=0;i<v.length;i++){pts.push((2+i*(W-4)/(v.length-1)).toFixed(1)+","+(H-3-((v[i]-mn)/(mx-mn))*(H-6)).toFixed(1));}
  return '<svg class="sp" viewBox="0 0 120 24" preserveAspectRatio="none" role="img" aria-label="Tendencia de '+nombre+'"><polyline points="'+pts.join(" ")+'" fill="none" style="stroke:var(--trend)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}
/* gráfico con escala fija (no se ajusta al dato) y líneas de umbral */
function grafico(v,marcas,nombre,lo,hi){
  var L=G.L,R=G.R,T=G.T,B=G.B,i,pts=[],h,ult;
  if(!v||v.length<2){return '<p class="nota">Esperando lecturas del nodo.</p>';}
  function Y(x){x=Math.max(lo,Math.min(hi,x));return B-((x-lo)/(hi-lo))*(B-T);}
  function X(k){return R-(v.length-1-k)*((R-L)/(MAXH-1));}
  h='<svg viewBox="0 0 '+G.W+' '+G.H+'" role="img" aria-label="'+nombre+', últimas '+v.length+' lecturas">';
  [lo,hi].forEach(function(g){
    h+='<line x1="'+L+'" x2="'+R+'" y1="'+Y(g).toFixed(1)+'" y2="'+Y(g).toFixed(1)+'" style="stroke:var(--line)" stroke-width="1"/><text class="ax" x="'+(L-6)+'" y="'+(Y(g)+4).toFixed(1)+'" text-anchor="end">'+fmt(g,0)+'</text>';
  });
  marcas.forEach(function(m){
    var y=Y(m.v);
    h+='<line x1="'+L+'" x2="'+R+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" style="stroke:var(--'+m.c+')" stroke-width="1.5" stroke-dasharray="4 4"/>';
    h+='<text class="ax lim" x="'+(m.der?R:L+4)+'" y="'+(m.abajo?y+13:y-4).toFixed(1)+'"'+(m.der?' text-anchor="end"':'')+' style="fill:var(--'+m.c+'-ink)">'+m.t+'</text>';
  });
  for(i=0;i<v.length;i++){pts.push(X(i).toFixed(1)+","+Y(v[i]).toFixed(1));}
  ult=v.length-1;
  h+='<polygon points="'+X(0).toFixed(1)+","+B+" "+pts.join(" ")+" "+R+","+B+'" style="fill:var(--trend)" opacity=".1"/>';
  h+='<polyline points="'+pts.join(" ")+'" fill="none" style="stroke:var(--trend)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  h+='<line class="guia" x1="0" x2="0" y1="'+T+'" y2="'+B+'" style="stroke:var(--muted)" stroke-width="1" visibility="hidden"/>';
  h+='<circle class="punto" cx="'+X(ult).toFixed(1)+'" cy="'+Y(v[ult]).toFixed(1)+'" r="4.5" style="fill:var(--trend)" stroke="#fff" stroke-width="2"/>';
  h+='<text class="ax" x="'+L+'" y="'+(G.H-6)+'">hace '+Math.round((v.length-1)*CADA_MS/1000)+' s</text><text class="ax" x="'+R+'" y="'+(G.H-6)+'" text-anchor="end">ahora</text></svg>';
  return h;
}
/* lectura al pasar el cursor o el dedo por un gráfico */
function sondear(caja,etq,vals,unidad,dec,lo,hi){
  function mover(e){
    var svg=caja.querySelector("svg"),b,x,k,L=G.L,R=G.R,px,py,v=vals(),y;
    if(!svg||!svg.querySelector(".guia")||v.length<2){return;}
    b=svg.getBoundingClientRect();x=(e.clientX-b.left)/b.width*G.W;
    k=Math.round(v.length-1-(R-x)/((R-L)/(MAXH-1)));
    k=Math.max(0,Math.min(v.length-1,k));
    y=Math.max(lo,Math.min(hi,v[k]));
    px=R-(v.length-1-k)*((R-L)/(MAXH-1));py=G.B-((y-lo)/(hi-lo))*(G.B-G.T);
    svg.querySelector(".guia").setAttribute("x1",px);svg.querySelector(".guia").setAttribute("x2",px);
    svg.querySelector(".guia").setAttribute("visibility","visible");
    svg.querySelector(".punto").setAttribute("cx",px);svg.querySelector(".punto").setAttribute("cy",py);
    etq.textContent=fmt(v[k],dec)+" "+unidad+" · hace "+Math.round((v.length-1-k)*CADA_MS/1000)+" s";
    caja.__fijo=true;
  }
  caja.addEventListener("pointermove",mover);
  caja.addEventListener("pointerdown",mover);
  caja.addEventListener("pointerleave",function(){caja.__fijo=false;caja.__h=null;etq.__h=null;pintarDetalle();});
}

/* ================= MAPA ================= */
/* nodos sobre el sendero (posición en % del mapa satelital) */
function pos(i){return {x:45.5+i*2.4,y:22+i*15.5};}
function azar(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function terreno(){}
function armarMapa(){
  var h="";
  nodos.forEach(function(n,i){
    var p=pos(i);
    h+='<button type="button" class="poste" data-id="'+n.id+'" style="left:'+p.x.toFixed(2)+'%;top:'+p.y.toFixed(2)+'%"><span class="halo"></span><span class="palo"></span><svg class="vec" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l6 10h-4v10h-4V12H6z"/></svg><span class="pin"><span class="mkw"></span><span class="corto">'+p2(n.poste)+'</span><span class="full">'+idPoste(n)+'</span></span></button>';
  });
  $("capa").innerHTML=h;
  set($("leyenda"),["normal","adv","crit","off"].map(function(e){return '<span>'+marca(e,16)+EST[e].z+'</span>';}).join(""));
  var DESC={normal:"todo normal, no hay que hacer nada.",adv:"temperatura alta o humedad baja. Mira la cámara.",crit:"mira la cámara y avisa a Bomberos.",off:"el nodo no envía datos. Avisa a mantención."};
  var colH=["normal","adv","crit","off"].map(function(e){return '<span>'+marca(e,20)+'<span><b>'+EST[e].z+':</b> '+DESC[e]+'</span></span>';}).join("");
  set($("colores"),colH);set($("colores2"),colH);
  set($("umbrales"),'<span class="t-ok"><i></i>Verde: normal</span><span class="t-warn"><i></i>Amarillo: temperatura desde '+U.tAdv+' °C o humedad bajo '+U.hAdv+' %</span><span class="t-crit"><i></i>Rojo: temperatura desde '+U.tCrit+' °C o humedad bajo '+U.hCrit+' %</span><span class="t-warn"><i></i>Viento amarillo: sobre 30 km/h</span>');
}
function vientoMedio(){
  var sx=0,sy=0,sv=0,k=0;
  nodos.forEach(function(n){var r=n.dir*Math.PI/180;sx+=Math.sin(r);sy+=Math.cos(r);sv+=n.v;k++;});
  return {dir:(Math.atan2(sx,sy)*180/Math.PI+360)%360,v:sv/k};
}
function pintarMapa(){
  var w=$("mapInner").clientWidth,sep=w*84.6/(TOTAL-1)/100,bts=$("capa").children,s=selActual(),vm=vientoMedio(),va=(vm.dir+180)%360;
  nodos.forEach(function(n,i){
    var b=bts[i],e=EST[n.estado],es=s===n,ver=true;
    b.className="poste t-"+e.c+(es?" sel":"")+(ver?" lbl":"")+"";
    b.setAttribute("aria-label",idPoste(n)+", "+e.z);
    set(b.querySelector(".full"),idPoste(n));
    b.setAttribute("aria-pressed",selManual===n?"true":"false");
    set(b.querySelector(".mkw"),marca(n.estado,20));
    b.querySelector(".vec").style.transform="rotate("+Math.round(n.dir+180)+"deg)";
  });
  set($("vientoMap"),'<svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate('+Math.round(va)+'deg)"><path d="M12 2l6 10h-4v10h-4V12H6z"/></svg><span><b>'+fmt(vm.v,0)+' km/h</b><br>hacia el '+rosa(va)+'</span>');
  $("vientoMap").setAttribute("aria-label","Viento medio "+fmt(vm.v,0)+" kilómetros por hora, hacia el "+rosa(va)+". Simulado.");
}
function escala(){
  var w=$("mapInner").clientWidth,h=$("mapInner").clientHeight,a=pos(0),b=pos(TOTAL-1);
  var px=Math.sqrt(Math.pow((b.x-a.x)/100*w,2)+Math.pow((b.y-a.y)/100*h,2)),ppm=px/LARGO_M,ops=[100,50,20,10,4,2],L=2,i;
  for(i=0;i<ops.length;i++){if(ops[i]*ppm<=170){L=ops[i];break;}}
  set($("escala"),'<div class="nums"><span>0</span><span>'+fmt(L/2,0)+'</span><span>'+L+' m</span></div><div class="barra" style="width:'+Math.round(L*ppm)+'px"></div>');
}
function encuadrar(redibujar){
  var z=ZOOMS[zi],caja=$("mapInner");
  foco.x=Math.max(.5/z,Math.min(1-.5/z,foco.x));foco.y=Math.max(.5/z,Math.min(1-.5/z,foco.y));
  caja.style.width=z*100+"%";caja.style.height=z*100+"%";
  caja.style.left=(.5-foco.x*z)*100+"%";caja.style.top=(.5-foco.y*z)*100+"%";
  if(redibujar){
    $("map").className="map"+(z>1?" zoomed":"");
    $("zIn").disabled=zi===ZOOMS.length-1;$("zOut").disabled=zi===0;$("zFit").disabled=zi===0;
    terreno();pintarMapa();escala();
  }
}
function arrastre(){
  var m=$("map"),ini=null;
  m.addEventListener("pointerdown",function(e){
    if(zi===0||e.target.closest("button")){return;}
    ini={x:e.clientX,y:e.clientY,fx:foco.x,fy:foco.y};m.setPointerCapture(e.pointerId);
  });
  m.addEventListener("pointermove",function(e){
    if(!ini){return;}
    var z=ZOOMS[zi];
    foco.x=ini.fx-(e.clientX-ini.x)/(m.clientWidth*z);foco.y=ini.fy-(e.clientY-ini.y)/(m.clientHeight*z);
    encuadrar(false);
  });
  function fin(){ini=null;}
  m.addEventListener("pointerup",fin);m.addEventListener("pointercancel",fin);
}

/* ================= PINTAR ================= */
var camModo=null,filtro="";
/* semáforo de resumen: el valor más extremo de los nodos con datos, coloreado según su umbral */
function franja(){
  var v=nodos.filter(function(n){return n.estado!=="off"&&n.temp!==null;}),tx=null,hmn=null,vm=vientoMedio();
  if(v.length){tx=Math.max.apply(null,v.map(function(n){return n.temp;}));hmn=Math.min.apply(null,v.map(function(n){return n.hum;}));}
  var et=tx===null?"off":tx>=U.tCrit?"crit":tx>=U.tAdv?"adv":"normal",
      eh=hmn===null?"off":hmn<U.hCrit?"crit":hmn<U.hAdv?"adv":"normal",
      ev=vm.v>30?"adv":"normal";
  function luz(e,lab,val,u){return '<div class="luz t-'+EST[e].c+'" role="img" aria-label="'+lab+' '+val+' '+u+', '+EST[e].t+'"><div><span>'+lab+'</span><b>'+val+'<small>'+u+'</small></b></div><i class="punto" aria-hidden="true"></i></div>';}
  return '<div class="franja">'+luz(et,"Temperatura",fmt(tx,0),"°C")+luz(eh,"Humedad",fmt(hmn,0),"%")+luz(ev,"Viento",fmt(vm.v,0),"km/h")+'</div>';
}
function leyendaLim(l){return '<div class="limL">'+l.map(function(x){return '<span class="t-'+x[0]+'"><i></i>'+x[1]+'</span>';}).join("")+'</div>';}
function contar(e){return nodos.filter(function(n){return n.estado===e;}).length;}
function porGravedad(a,b){return ORDEN[a.estado]-ORDEN[b.estado]||a.poste-b.poste;}
function selActual(){
  if(selManual){return selManual;}
  var l=nodos.filter(function(n){return n.estado==="crit"||n.estado==="adv";}).sort(porGravedad);
  return l[0]||null;
}
function riesgo(n){
  return [{t:"T° sobre 30 °C",si:n.temp!==null&&n.estado!=="off"&&n.temp>30},{t:"Humedad bajo 30 %",si:n.hum!==null&&n.estado!=="off"&&n.hum<30},{t:"Viento sobre 30 km/h",si:n.v>30}];
}
function cuenta(r){return r.filter(function(c){return c.si;}).length;}
function angosto(){return window.matchMedia("(max-width:1099px)").matches;}
/* avatar del nodo: número de poste + marca de estado; anillo de color si requiere atención */
function avatar(n,g){
  var e=EST[n.estado];
  var s=g?24:16,m=n.estado==="adv"?'<svg class="mk" width="'+s+'" height="'+s+'" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6v5.2" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.4" fill="#fff"/></svg>':marca(n.estado,s);
  return '<span class="av t-'+e.c+(g?" g":"")+'" aria-hidden="true">'+n.poste+'<span class="st">'+m+'</span></span>';
}
function lectura(n){
  /* en la lista solo va el estado; las lecturas están en el panel del poste */
  return EST[n.estado].t;
}
function filaEv(e){
  var n=nodo(e.id);
  return '<tr><td>'+fecha(e.t)+'</td><td>'+hms(e.t)+'</td><td>'+id2(n)+'</td><td>'+e.txt+'</td><td>'+pill(e.est)+'</td></tr>';
}
function celda(id,num,tono){
  var c=$(id);
  c.className="celda"+(tono?" tinte t-"+tono:"");
  set(c.querySelector(".num"),num);
}
function ambos(cl,h){[].forEach.call(document.querySelectorAll("."+cl),function(el){set(el,h);});}
function pintarFresco(){
  var s=ultimaResp?Math.round((Date.now()-ultimaResp)/1000):null,viejo=s===null||s>LIMITE_S;
  ambos("eSis",viejo?
    marca("adv",20)+'<span class="viejo">'+(s===null?"Sin datos del ESP32 todavía":"Sin datos nuevos del ESP32 "+hace(ultimaResp))+'</span>':
    marca("normal",20)+'<span><b>Sistema en línea</b> · datos '+hace(ultimaResp)+'</span>');
}

/* barras por poste, escala fija, con umbrales; el color de estado solo aparece cuando la lectura cruza un umbral */
function barras(tipo){
  var T=tipo==="t",lo=0,hi=T?45:100,W=360,H=176,L=30,R=354,Tp=14,B=146,step=(R-L)/TOTAL,bw=step*.56,h,s=selActual(),lims;
  function Y(v){v=Math.max(lo,Math.min(hi,v));return B-(v-lo)/(hi-lo)*(B-Tp);}
  lims=T?[{v:U.tAdv,c:"warn",t:"Advertencia "+fmt(U.tAdv,0)},{v:U.tCrit,c:"crit",t:"Crítico "+fmt(U.tCrit,0)}]:[{v:U.hAdv,c:"warn",t:"Humedad baja "+fmt(U.hAdv,0)},{v:U.hCrit,c:"crit",t:"Crítica "+fmt(U.hCrit,0),abajo:true}];
  h='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+(T?"Temperatura":"Humedad")+' actual por poste">';
  [lo,hi].forEach(function(g){h+='<line x1="'+L+'" x2="'+R+'" y1="'+Y(g)+'" y2="'+Y(g)+'" style="stroke:var(--line)"/><text class="ax" x="'+(L-6)+'" y="'+(Y(g)+4)+'" text-anchor="end">'+g+'</text>';});
  nodos.forEach(function(n,i){
    var x=L+i*step+(step-bw)/2,v=T?n.temp:n.hum,on=n.estado!=="off"&&v!==null,c=null,y,es=s===n;
    if(on){
      c=T?(v>=U.tCrit?"crit":v>=U.tAdv?"adv":null):(v<U.hCrit?"crit":v<U.hAdv?"adv":null);
      y=Y(v);
      if(es){h+='<rect x="'+(x-3).toFixed(1)+'" y="'+(y-3).toFixed(1)+'" width="'+(bw+6).toFixed(1)+'" height="'+(B-y+3).toFixed(1)+'" rx="5" fill="none" style="stroke:var(--ink)" stroke-width="2"/>';}
      h+='<rect class="bar" data-id="'+n.id+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+(B-y).toFixed(1)+'" rx="3" style="fill:var(--'+(c?(c==="adv"?"warn":"crit"):"bar")+')"><title>'+idPoste(n)+': '+fmt(v,T?1:0)+(T?" °C":" %")+'</title></rect>';
      if(c){h+=marca(c,16).replace('<svg class="mk"','<svg class="mk" x="'+(x+bw/2-8).toFixed(1)+'" y="'+(y-20).toFixed(1)+'"');}
    }else{
      h+=marca("off",16).replace('<svg class="mk"','<svg class="mk" x="'+(x+bw/2-8).toFixed(1)+'" y="'+(B-20)+'"');
    }
    h+='<text class="ax" x="'+(x+bw/2).toFixed(1)+'" y="'+(B+18)+'" text-anchor="middle"'+(es?' style="fill:var(--ink);font-weight:600"':'')+'>Nodo '+n.poste+'</text>';
  });
  lims.forEach(function(m){
    var y=Y(m.v);
    h+='<line x1="'+L+'" x2="'+R+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" style="stroke:var(--'+m.c+')" stroke-width="1.5" stroke-dasharray="4 4"/>';
  });
  return '<div class="limL">'+lims.map(function(m){return '<span class="t-'+m.c+'"><i></i>'+m.t+(T?" °C":" %")+'</span>';}).join("")+'</div>'+h+'</svg>';
}

/* ---- ajuste a la pantalla: escala el diseño completo para que quepa sin scroll en escritorio ---- */
function ajustar(){
  var r=document.documentElement,w=window.innerWidth,h=window.innerHeight,z;
  if(w>=1100){
    z=Math.max(.6,Math.min(1,w/1440,h/975));
    r.style.zoom=z;r.classList.add("ajuste");r.style.setProperty("--alto",(h/z)+"px");
  }else{r.style.zoom="";r.classList.remove("ajuste");}
  calzar();
}
/* si el panel derecho no cabe, se oculta "Lo último que pasó" (sigue en Historial) */
function calzar(){
  var r=document.documentElement,d=$("der");if(!d){return;}
  r.classList.remove("apretado");
  /* ahora el panel derecho tiene scroll: no se oculta nada */
}
function pintar(){
  var act=TOTAL-contar("off"),adv=contar("adv"),crit=contar("crit"),off=contar("off"),ev=null,i,vm,critN,nb,s,tx,hmn,vivos;
  for(i=0;i<eventos.length;i++){if(!eventos[i].ciclo&&eventos[i].est!=="normal"){ev=eventos[i];break;}}

  pintarFresco();

  /* gráficos por poste */
  vivos=nodos.filter(function(n){return n.estado!=="off"&&n.temp!==null;});
  tx=vivos.length?Math.max.apply(null,vivos.map(function(n){return n.temp;})):null;
  hmn=vivos.length?Math.min.apply(null,vivos.map(function(n){return n.hum;})):null;
  vm=vientoMedio();
  set($("graficos"),franja());

  /* contadores: rojo solo para Crítico, ámbar para Advertencia, gris para nodos caídos */
  nb="";
  if(crit){nb+='<span class="badge b-crit">'+crit+'</span>';}
  if(adv){nb+='<span class="badge b-warn">'+adv+'</span>';}
  set($("navBadges"),nb);
  $("dotB").hidden=!(crit||adv);$("dotB").className="dotB"+(crit?"":" w");$("dotB").textContent=crit||adv;
  $("navAlertas").setAttribute("aria-label","Alertas"+(crit||adv?": "+[crit?crit+" posible foco":"",adv?adv+" con riesgo":""].filter(Boolean).join(", "):""));

  /* banner y título de pestaña cuando hay Crítico sin reconocer */
  critN=alertas.filter(function(a){return a.estado==="nueva"&&a.est==="crit";});
  if(critN.length){
    s=nodo(critN[0].id);
    set($("banner"),'<span class="mkw">'+ic("fire")+'</span><div><b>Posible incendio · '+idPoste(s)+'</b><span>Desde las '+hm(critN[0].t)+(critN.length>1?' · y '+(critN.length-1)+' más':'')+'</span></div><div class="acc"><button type="button" class="btn sec" data-acc="ver" data-id="'+s.id+'">Ver en el mapa</button><button type="button" class="btn" data-acc="rec" data-a="'+critN[0].n+'">'+ic("check","i16")+'Atender</button></div>');
    $("banner").hidden=false;
  }else{$("banner").hidden=true;}
  s=nodos.filter(function(n){return n.estado==="crit";});
  document.title=s.length?"("+s.length+") Crítico · "+s[0].id+" · Cortafuego La Reina":"Cortafuego La Reina";

  pintarMapa();
  pintarListaAlertas();
  pintarDetalle();
  pintarAlertas();
  set($("tEventos"),eventos.length?eventos.map(filaEv).join(""):'<tr><td class="nada" colspan="5">Sin eventos registrados.</td></tr>');
}

/* explicación en una frase, sin jerga */
function explicar(n){
  if(n.estado==="crit"){return "Mira la cámara y avisa a Bomberos.";}
  if(n.estado==="adv"){return "Mira la cámara.";}
  if(n.estado==="off"){return "El nodo no envía datos.";}
  return "";
}
var chartModo="t",GUIA="cortafuego_guia_vista";
function guia(ver){
  $("guiaM").hidden=!ver;document.body.classList.toggle("conModal",ver);
  if(ver){setTimeout(function(){$("guiaOk").focus();},30);}
  try{if(!ver){localStorage.setItem(GUIA,"1");}}catch(e){}
}

/* ---- lista de alertas de incendio (rail derecho); los postes sin datos van aparte, como mantención ---- */
function alertasFuego(){
  return alertas.filter(function(a){return a.estado!=="resuelta"&&(a.est==="crit"||a.est==="adv");}).sort(function(a,b){return ORDEN[a.est]-ORDEN[b.est]||b.t-a.t;});
}
function pintarListaAlertas(){
  var l=alertasFuego(),s=selActual(),caidos=nodos.filter(function(n){return n.estado==="off";});
  set($("alertasN"),l.length?String(l.length):"");
  set($("alertasL"),l.length?l.map(function(a){
    var n=nodo(a.id);
    return '<button type="button" class="alertaI t-'+EST[a.est].c+(s===n?" sel":"")+'" data-id="'+a.id+'">'+avatar(n)+'<span class="txt"><b>'+EST[a.est].z+'</b><small>'+idPoste(n)+' · '+hace(a.t)+'</small></span><span class="sit'+(a.estado==="nueva"?" nueva":"")+'">'+(a.estado==="nueva"?"Sin atender":"En atención")+'</span></button>';
  }).join(""):'<p class="sinRes">'+marca("normal",16)+' Sin alertas</p>');
  $("mant").hidden=!caidos.length;
  set($("mant"),'<span class="over">Mantención</span>'+caidos.map(function(n){return '<p>'+marca("off",16)+idPoste(n)+' sin datos'+(n.ultima?' desde las '+hm(n.ultima):'')+'</p>';}).join(""));
}

/* ESP32-CAM: stream MJPEG directo en la red local del prototipo. */
var CAM_URL="http://192.168.4.100:81/stream", camRetry=null;
function detenerCamaraReal(){
  var img=$("camLive");
  if(camRetry!==null){clearTimeout(camRetry);camRetry=null;}
  img.hidden=true;
  if(img.hasAttribute("src")){img.removeAttribute("src");}
}
function mostrarCamaraReal(){
  var img=$("camLive");
  $("camFoto").hidden=true;$("camRgb").hidden=true;
  $("cam").hidden=true;$("camCap").hidden=false;
  if(!img.hidden&&img.hasAttribute("src")){return;}
  img.hidden=false;
  set($("camCap"),"RGB · "+idPoste(nodo(CAM_NODO))+" · conectando…");
  img.onload=function(){if(!img.hidden){set($("camCap"),"RGB · "+idPoste(nodo(CAM_NODO))+" · en vivo");}};
  img.onerror=function(){
    if(img.hidden){return;}
    set($("camCap"),"RGB · "+idPoste(nodo(CAM_NODO))+" · sin conexión (reintentando)");
    if(camRetry!==null){clearTimeout(camRetry);}
    camRetry=setTimeout(function(){camRetry=null;if(!img.hidden){img.src=CAM_URL+"?t="+Date.now();}},3000);
  };
  img.src=CAM_URL;
}
/* ---- portada de cámara (RGB o térmica) ---- */
function camara(n){
  var conCam=n.id===CAM_NODO;
  [].forEach.call($("camSeg").children,function(b){b.disabled=false;});
  if(conCam&&(camModo||"rgb")==="rgb"){
    [].forEach.call($("camSeg").children,function(b){var on=b.getAttribute("data-c")==="rgb";b.className=on?"on":"";b.setAttribute("aria-pressed",on?"true":"false");});
    mostrarCamaraReal();return;
  }
  detenerCamaraReal();$("cam").hidden=false;$("camCap").hidden=false;
  var modo=camModo||(conCam?"rgb":(n.estado==="crit"||n.estado==="adv"?"ter":"rgb")),cal=n.estado==="crit"||n.estado==="adv",r=n.estado==="crit"?24:14,x=(n.poste*37)%80+40;
  [].forEach.call($("camSeg").children,function(b){var on=b.getAttribute("data-c")===modo;b.className=on?"on":"";b.setAttribute("aria-pressed",on?"true":"false");});
  set($("camCap"),"Cámara "+(modo==="ter"?"térmica":"RGB")+" · imagen de ejemplo");
  $("camFoto").hidden=!(modo==="ter"&&cal);$("camRgb").hidden=!(modo==="rgb"&&cal);
  if(modo==="rgb"){
    set($("cam"),'<defs><linearGradient id="cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f5"/><stop offset="1" stop-color="#e9f1f8"/></linearGradient></defs><rect width="160" height="90" fill="url(#cs)"/><path d="M0 62L40 34l30 20 36-28 54 34v30H0z" fill="#8fa896"/><path d="M0 74c40-14 80-10 160-2v20H0z" fill="#5f8a62"/>'+(n.estado==="crit"?'<circle cx="'+x+'" cy="64" r="7" fill="#e5252c" opacity=".75"/>':""));
  }else{
    set($("cam"),'<defs><linearGradient id="ct" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1b5a"/><stop offset="1" stop-color="#5a2a7a"/></linearGradient><radialGradient id="cc"><stop offset="0" stop-color="#fff3b0"/><stop offset=".4" stop-color="#ff9f1a"/><stop offset="1" stop-color="#e5252c" stop-opacity="0"/></radialGradient></defs><rect width="160" height="90" fill="url(#ct)"/><path d="M0 74c40-14 80-10 160-2v20H0z" fill="#7a3a8a"/>'+(cal?'<circle cx="'+x+'" cy="62" r="'+r+'" fill="url(#cc)"/>':""));
  }
}
function riesgoHtml(r,titulo){
  return '<span>'+titulo+'</span><b>'+cuenta(r)+' de 3 <small>condiciones</small></b><div class="r3">'+r.map(function(c){return '<i class="rc'+(c.si?" si":"")+'">'+ic(c.si?"check":"minus","i16")+c.t+'</i>';}).join("")+'</div>';
}
/* sin alertas: resumen general del corredor */
function pintarVacio(){
  var vm=vientoMedio(),vivos=nodos.filter(function(n){return n.estado!=="off"&&n.temp!==null;}),tx=null,hmn=null,peor=null;
  if(vivos.length){tx=Math.max.apply(null,vivos.map(function(n){return n.temp;}));hmn=Math.min.apply(null,vivos.map(function(n){return n.hum;}));}
  vivos.forEach(function(n){var r=riesgo(n);if(!peor||cuenta(r)>cuenta(peor)){peor=r;}});
  set($("cam"),'<rect width="160" height="90" fill="#dfe7f1"/><g transform="translate(62 27) scale(1.5)" fill="none" stroke="#7b89a2" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/></g>');
  mostrarCamaraReal();
  set($("vacioP"),'<h3>Sin alertas</h3><p>Cámara RGB del nodo real A-03. Toca un nodo en el mapa para ver sus datos.</p>'+
    '');
}
function pintarDetalle(){
  var n=selActual(),auto=!selManual,propios;
  $("vacioP").hidden=!!n;$("perfilN").hidden=!n;$("cerrar").hidden=!selManual;$("camSeg").hidden=!n;
  if(!n){pintarVacio();return;}
  camara(n);
  set($("dAv"),avatar(n,true));
  set($("dNombre"),EST[n.estado].z);
  set($("dDonde"),idPoste(n)+(n.estado!=="normal"?" · desde las "+hm(n.desde):""));
  $("dExplica").hidden=!explicar(n);
  var al=abiertaDe(n);
  set($("dAcc"),al&&al.est!=="off"?(al.estado==="nueva"?'<button type="button" class="btn pri" data-acc="rec" data-a="'+al.n+'">'+ic("check","i16")+'Atender alerta</button>':'<span class="etapa">En atención por '+al.por+'</span><button type="button" class="btn" data-acc="res" data-a="'+al.n+'">Cerrar alerta</button>'):'');
  set($("dEstado"),pill(n.estado));
  set($("dExplica"),explicar(n));
  set($("dTempH"),"Advertencia desde "+fmt(U.tAdv,0)+" °C");
  set($("dHumH"),"Advertencia bajo "+fmt(U.hAdv,0)+" %");
  set($("dMeta"),idTec(n)+" · "+(n.real?"DHT22 + DS18B20 + DSM501A · lecturas reales":DEMO?"Datos simulados · sin sensor instalado":"Sin sensor instalado")+(n.ultima?" · "+hms(n.ultima):""));
  set($("dTemp"),fmt(n.estado==="off"?null:n.temp,1)+" <small>°C</small>");
  set($("dHum"),fmt(n.estado==="off"?null:n.hum,0)+" <small>%</small>");
  set($("dViento"),fmt(n.v,0)+" <small>km/h</small>");
  set($("dDir"),rosa(n.dir)+" <small>"+Math.round(n.dir)+"°</small>");
  $("dFlecha").style.transform="rotate("+Math.round(n.dir+180)+"deg)";
  set($("dDirTxt"),"Hacia el "+rosa((n.dir+180)%360)+" · simulado");
  set($("dSuelo"),n.real?fmt(n.suelo,2)+" <small>°C</small>":"--");
  set($("dSueloTxt"),n.real?(n.suelo===null?"DS18B20 sin respuesta":"DS18B20 · lectura real"):"Sensor de suelo no instalado en este nodo");
  $("dSueloV").hidden=!n.real;$("dSueloV").parentNode.classList.toggle("c4",!!n.real);
  set($("dSuelo2"),fmt(n.suelo,1)+" <small>°C</small>");
  if(n.real){
    set($("dPm"),n.dsmValido?fmt(n.dsmPulse,0)+" <small>µs</small>":"Sin lectura válida");
    set($("dPmTxt"),"Pulso VOUT2, aún sin conversión calibrada a MP2,5");
  }else{
    set($("dPm"),fmt(n.pm,0)+" <small>µg/m³</small>");
    set($("dPmTxt"),"Dato simulado · sensor de partículas no instalado");
  }
  set($("dRiesgo"),riesgoHtml(riesgo(n),"Regla 30-30-30 (CONAF) · riesgo combinado"));
  set($("dGps"),"Lat. "+fmt(n.lat,5)+"° · Long. "+fmt(n.lng,5)+"°");
  if(!$("gTemp").__fijo){
    set($("gTemp"),grafico(n.ht,[{v:U.tAdv,c:"warn",t:"Advertencia "+fmt(U.tAdv,0)+" °C"},{v:U.tCrit,c:"crit",t:"Crítico "+fmt(U.tCrit,0)+" °C",der:true}],"Temperatura",0,45));
    set($("lTemp"),n.ht.length?"últimas "+n.ht.length+" lecturas · 0–45 °C":"");
  }
  if(!$("gHum").__fijo){
    set($("gHum"),grafico(n.hh,[{v:U.hAdv,c:"warn",t:"Humedad baja "+fmt(U.hAdv,0)+" %",der:true},{v:U.hCrit,c:"crit",t:"Crítico "+fmt(U.hCrit,0)+" %",abajo:true}],"Humedad",0,100));
    set($("lHum"),n.hh.length?"últimas "+n.hh.length+" lecturas · 0–100 %":"");
  }
  propios=eventos.filter(function(e){return e.id===n.id;}).slice(0,2);
  set($("dHist"),propios.length?propios.map(function(e){return '<li>'+marca(e.est,16)+'<time>'+hm(e.t)+'</time><span>'+e.txt+'</span></li>';}).join(""):'<li>Sin eventos registrados.</li>');
}

/* ---- alertas como publicaciones: Nueva → Reconocida → Resuelta ---- */
function pintarAlertas(){
  var abiertas=alertas.filter(function(a){return a.estado!=="resuelta";}).sort(function(a,b){return ORDEN[a.est]-ORDEN[b.est]||(a.estado===b.estado?0:a.estado==="nueva"?-1:1)||b.t-a.t;}),nuevas=abiertas.filter(function(a){return a.estado==="nueva";}).length;
  set($("aResumen"),abiertas.length?abiertas.length+(abiertas.length===1?" alerta abierta":" alertas abiertas")+(nuevas?" · "+nuevas+" sin atender":" · todas en atención"):"Sin alertas.");
  set($("activas"),abiertas.map(function(a){
    var n=nodo(a.id);
    return '<article class="card post t-'+EST[a.est].c+'">'+
      '<header class="postH">'+avatar(n)+'<div><b>'+EST[a.est].z+'</b><small>'+idPoste(n)+' · '+hace(a.t)+'</small></div>'+pill(a.est)+'</header>'+
      '<div class="postB"><p>'+a.txt+'</p>'+
      (a.tNorm?'<span class="det">'+marca("normal",16)+'Volvió a Normal a las '+hm(a.tNorm)+'</span>':'')+
      '<span class="etapa'+(a.estado==="nueva"?" nueva":"")+'">'+(a.estado==="nueva"?"Sin atender":"En atención · "+a.por)+'</span></div>'+
      '<footer class="postA">'+
      (a.estado==="nueva"?'<button type="button" class="pri" data-acc="rec" data-a="'+a.n+'">'+ic("check")+'Atender</button>':'<button type="button" class="pri" data-acc="res" data-a="'+a.n+'">'+ic("check")+'Cerrar alerta</button>')+
      '<button type="button" data-acc="ver" data-id="'+a.id+'">'+ic("eye")+'Ver en el mapa</button></footer></article>';
  }).join(""));
}

/* ================= VISTA PREVIA DE AVISOS ================= */
var CASAS_M=[120,60],PROX_MIN=[10,5];
var NIVEL={1:{e:"adv",tag:"Aviso · Nivel 1",tit:"Fuego detectado",V:{t:34,h:18,v:13,pm:40}},2:{e:"crit",tag:"Alerta · Nivel 2",tit:"Fuego avanza hacia viviendas",V:{t:38,h:12,v:30,pm:85}}};
var NOT={esc:1};
function mapaNot(esc,tecnico,n){
  var t=(n.poste-1)/(TOTAL-1),fx=Math.round(50+t*200),fy=Math.round(106-fx*0.1),r=esc===2?15:10,k=(tecnico?"t":"c")+esc,
      tx=Math.min(fx+(esc===2?30:20),262),ty=130,col=esc===2?"#e5252c":"#b87300",gw=esc===2?4.5:3,lx=Math.min(tx+8,206),i,casas="",arboles="";
  for(i=0;i<7;i++){var hx=28+i*38;casas+='<rect x="'+hx+'" y="143" width="20" height="14" fill="#f4efe6" stroke="#b9ad98"/><path d="M'+(hx-2)+' 143L'+(hx+10)+' 134L'+(hx+22)+' 143z" fill="#c76b4a"/>';}
  for(i=0;i<9;i++){arboles+='<circle cx="'+(14+i*34)+'" cy="'+(18+(i%3)*14)+'" r="7" fill="#4f8452"/>';}
  return '<svg class="nMapa" viewBox="0 0 300 175" role="img" aria-label="Mapa de ejemplo con el foco y hacia dónde avanza">'+
   '<defs><marker id="nf'+k+'" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="'+col+'"/></marker>'+
   '<radialGradient id="ng'+k+'"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ff9f1a"/><stop offset="1" stop-color="#e5252c" stop-opacity="0"/></radialGradient></defs>'+
   '<rect width="300" height="175" fill="#e3ebd8"/>'+
   '<path d="M0 0H300V62C240 80 160 44 90 70C50 86 20 80 0 96Z" fill="#6f9d6a"/>'+arboles+
   '<rect y="126" width="300" height="49" fill="#ece7dd"/>'+casas+
   '<path d="M0 106L300 76" stroke="#d9c39a" stroke-width="11" stroke-linecap="round" fill="none"/>'+
   '<text x="8" y="14" font-size="12" fill="#fff" font-weight="600">Cerro</text><text x="8" y="171" font-size="12" fill="#5d5444" font-weight="600">Casas</text>'+
   '<line x1="'+fx+'" y1="'+(fy+r)+'" x2="'+tx+'" y2="'+ty+'" stroke="'+col+'" stroke-width="'+gw+'" stroke-dasharray="'+(esc===2?'0':'6 4')+'" marker-end="url(#nf'+k+')"/>'+
   '<circle cx="'+fx+'" cy="'+fy+'" r="'+(r+8)+'" fill="url(#ng'+k+')"><animate attributeName="r" values="'+(r+6)+';'+(r+11)+';'+(r+6)+'" dur="1.6s" repeatCount="indefinite"/></circle>'+
   '<circle cx="'+fx+'" cy="'+fy+'" r="4" fill="#e5252c" stroke="#fff" stroke-width="1.5"/>'+
   '<rect x="'+lx+'" y="109" width="92" height="18" rx="9" fill="#fff" opacity=".95"/><text x="'+(lx+46)+'" y="122" font-size="12" text-anchor="middle" fill="'+(esc===2?"#b8151c":"#935700")+'" font-weight="600">a '+CASAS_M[esc-1]+' m de casas</text>'+
   '<text x="'+fx+'" y="'+(fy-16)+'" font-size="12" fill="#131927" font-weight="600" text-anchor="middle" stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">'+(tecnico?"Foco · Poste "+p2(n.poste):"Foco")+'</text>'+
   '</svg>';
}
function imgsNot(){
  return '<div class="nImgs"><figure><svg viewBox="0 0 160 100" preserveAspectRatio="none" aria-label="Imagen RGB de ejemplo"><defs><linearGradient id="nrs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f5"/><stop offset="1" stop-color="#e9f1f8"/></linearGradient></defs><rect width="160" height="100" fill="url(#nrs)"/><path d="M0 70L40 40l30 22 36-30 54 38v30H0z" fill="#8fa896"/><path d="M0 82c40-14 80-10 160-2v20H0z" fill="#5f8a62"/><circle cx="92" cy="72" r="7" fill="#e5252c" opacity=".75"/></svg><figcaption>Cámara RGB (ejemplo)</figcaption></figure>'+
   '<figure><svg viewBox="0 0 160 100" preserveAspectRatio="none" aria-label="Imagen térmica de ejemplo"><defs><linearGradient id="nts" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1b5a"/><stop offset="1" stop-color="#5a2a7a"/></linearGradient><radialGradient id="ntc"><stop offset="0" stop-color="#fff3b0"/><stop offset=".4" stop-color="#ff9f1a"/><stop offset="1" stop-color="#e5252c" stop-opacity="0"/></radialGradient></defs><rect width="160" height="100" fill="url(#nts)"/><path d="M0 82c40-14 80-10 160-2v20H0z" fill="#7a3a8a"/><circle cx="92" cy="68" r="24" fill="url(#ntc)"/></svg><figcaption>Cámara térmica (ejemplo)</figcaption></figure></div>';
}
function pintarAvisos(){
  var sel=$("nSel"),n,esc=NOT.esc,N=NIVEL[esc],V=N.V,i,o,b,c,ahora=new Date();
  if(!sel.options.length){for(i=0;i<nodos.length;i++){o=document.createElement("option");o.value=nodos[i].id;o.textContent=idPoste(nodos[i]);sel.appendChild(o);}sel.value="A-02";}
  n=nodo(sel.value);
  [].forEach.call($("nEsc").children,function(x){var on=Number(x.getAttribute("data-e"))===esc;x.className=on?"on":"";x.setAttribute("aria-pressed",on?"true":"false");});
  b='<span class="nTag t-'+EST[N.e].c+'">'+marca(N.e,20)+N.tag+' · '+N.tit+'</span>'+
    '<div class="nFila"><span>Hora</span><div>'+hm(ahora)+'</div></div>'+
    '<div class="nFila"><span>Lugar</span><div>'+idPoste(n)+'</div></div>'+
    '<div class="nFila"><span>Sector</span><div>'+SECTOR+' (ejemplo)</div></div>'+
    '<div class="nFila"><span>GPS</span><div>Lat. '+fmt(n.lat,5)+'° · Long. '+fmt(n.lng,5)+'°</div></div>'+
    '<div class="nFila"><span>Distancia</span><div>A '+CASAS_M[esc-1]+' m de las viviendas más cercanas</div></div>'+
    '<div class="nFila"><span>Variables</span><div>'+V.t+' °C · humedad '+V.h+' % · viento '+V.v+' km/h hacia el '+rosa((n.dir+180)%360)+' · humo (MP2,5) '+V.pm+' µg/m³</div></div>'+
    '<div class="nFila"><span>Nivel</span><div>'+esc+' de 2 · '+EST[N.e].t+'</div></div>'+
    '<div class="nFila"><span>Próximo reporte</span><div>En '+PROX_MIN[esc-1]+' min</div></div>'+
    mapaNot(esc,true,n)+imgsNot()+
    '<p class="nota">'+(esc===1?'Se detectó fuego en el corredor. Se requiere revisión inmediata.':'El fuego avanza hacia las viviendas más rápido de lo esperado. Se requiere despacho inmediato.')+'</p>';
  c='<div class="tel"><div class="telTop">App de la Municipalidad · App RED</div><div class="telMsg">'+
    '<span class="nTag t-'+EST[N.e].c+'">'+marca(N.e,20)+N.tag+'</span>'+
    '<b class="tit">'+(esc===1?'Fuego detectado en '+SECTOR:'El fuego avanza hacia las viviendas de '+SECTOR)+'</b>'+
    '<p class="meta">Emitido a las '+hm(ahora)+' · próxima actualización en '+PROX_MIN[esc-1]+' min</p>'+
    '<span class="over">'+(esc===1?'Dónde está':'Dónde está ahora')+'</span>'+mapaNot(esc,false,n)+
    '<span class="over">Hacia dónde va</span>'+
    '<p>El fuego avanza hacia las casas del borde del cerro. '+(esc===1?'Por ahora el avance es <b>lento</b>.':'Ahora el avance es <b>más rápido</b>.')+'</p>'+
    '<span class="over">Qué hacer</span>'+
    '<p>'+(esc===1?'Mantente atento a esta app y sigue las instrucciones de las autoridades y de Bomberos.':'Si estás cerca, prepárate para evacuar y espera las instrucciones de las autoridades y de Bomberos.')+'</p>'+
    '<span class="over">Más información</span>'+
    '<p>Canales oficiales de la Municipalidad de La Reina y de SENAPRED.</p>'+
    '</div></div>';
  $("nBomb").innerHTML=b;$("nCiv").innerHTML=c;
}

/* ================= AVISO SONORO (opcional) ================= */
function pitar(){
  if(!audio){return;}
  try{
    var t=audio.currentTime;ultimoPitido=Date.now();
    [0,.25,.5].forEach(function(o){
      var os=audio.createOscillator(),g=audio.createGain();
      os.frequency.value=880;g.gain.setValueAtTime(.0001,t+o);g.gain.exponentialRampToValueAtTime(.25,t+o+.02);g.gain.exponentialRampToValueAtTime(.0001,t+o+.18);
      os.connect(g);g.connect(audio.destination);os.start(t+o);os.stop(t+o+.2);
    });
  }catch(e){}
}
function tick(){
  pintarFresco();
  if(sonido&&Date.now()-ultimoPitido>15000&&alertas.some(function(a){return a.estado==="nueva"&&a.est==="crit";})){pitar();}
}

/* ================= INTERACCIÓN ================= */
function ir(v){
  vista=v;
  ["monitoreo","alertas","eventos","post","avisos","ayuda"].forEach(function(k){$("v-"+k).hidden=k!==v;});
  [].forEach.call(document.querySelectorAll("[data-v]"),function(b){var on=b.getAttribute("data-v")===v;b.classList.toggle("on",on);if(on){b.setAttribute("aria-current","page");}else{b.removeAttribute("aria-current");}});
  $("tituloVista").hidden=v==="monitoreo";
  $("titulo").textContent=TIT[v];$("bajada").textContent=BAJ[v];
  document.body.classList.toggle("noMon",v!=="monitoreo");
  $("herrMenu").hidden=true;$("herrBtn").setAttribute("aria-expanded","false");
  window.scrollTo(0,0);
  if(v==="monitoreo"){encuadrar(true);}
  if(v==="avisos"){pintarAvisos();}
  pintar();
}
function elegir(id){
  var p;
  selManual=id?nodo(id):null;camModo=null;
  $("gTemp").__fijo=false;$("gHum").__fijo=false;
  if(selManual){p=pos(selManual.poste-1);foco={x:p.x/100,y:p.y/100};encuadrar(false);}
  pintar();
  if(selManual){
    if(angosto()){$("detalle").scrollIntoView({block:"start"});}
    else{$("der").scrollTop=0;}
  }
}
/* "Ver nodo": en pantalla ancha el nodo se abre en el panel derecho sin salir de la vista actual */
function verNodo(id){
  if(angosto()&&vista!=="monitoreo"){ir("monitoreo");}
  elegir(id);
}
function accion(e){
  var b=e.target.closest("[data-acc]"),a,k,sig;
  if(!b){return;}
  k=b.getAttribute("data-acc");
  if(k==="ver"){verNodo(b.getAttribute("data-id"));return;}
  a=alertaNum(Number(b.getAttribute("data-a")));
  if(k==="rec"){reconocer(a);sig=document.querySelector('#activas [data-acc="res"][data-a="'+a.n+'"]');if(sig&&vista==="alertas"){sig.focus();}}
  if(k==="res"){resolver(a);}
}
function eventosUI(){
  /* con la columna en modo íconos el texto se oculta: el nombre queda en aria-label y title */
  [].forEach.call(document.querySelectorAll(".nav button"),function(b){var t=b.querySelector(".lbl").textContent;b.title=t;if(!b.getAttribute("aria-label")){b.setAttribute("aria-label",t);}});
  $("nSel").addEventListener("change",pintarAvisos);
  $("nEsc").addEventListener("click",function(e){var b=e.target.closest("button");if(b){NOT.esc=Number(b.getAttribute("data-e"));pintarAvisos();}});
  [].forEach.call(document.querySelectorAll("#nav,#navHerr,#herrMenu"),function(c){c.addEventListener("click",function(e){var b=e.target.closest("[data-v]");if(b){ir(b.getAttribute("data-v"));}});});
  $("herrBtn").addEventListener("click",function(){var ab=$("herrMenu").hidden;$("herrMenu").hidden=!ab;this.setAttribute("aria-expanded",ab?"true":"false");});
  $("cerrar").addEventListener("click",function(){var id=selManual&&selManual.id;elegir(null);volverFoco(id);});
  $("capa").addEventListener("click",function(e){var b=e.target.closest(".poste");if(b){elegir(selManual&&selManual.id===b.getAttribute("data-id")?null:b.getAttribute("data-id"));}});
  $("alertasL").addEventListener("click",function(e){var b=e.target.closest(".alertaI");if(b){elegir(b.getAttribute("data-id"));}});
  $("dAcc").addEventListener("click",accion);
  $("camSeg").addEventListener("click",function(e){var b=e.target.closest("button");if(b){camModo=b.getAttribute("data-c");var s=selActual();if(s){camara(s);}}});
  $("activas").addEventListener("click",accion);
  $("guiaOk").addEventListener("click",function(){guia(false);});
  $("guiaMas").addEventListener("click",function(){guia(false);ir("ayuda");});
  $("guiaM").addEventListener("click",function(e){if(e.target===$("guiaM")){guia(false);}});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!$("guiaM").hidden){guia(false);}});
  $("verGuia").addEventListener("click",function(){guia(true);});
  document.addEventListener("click",function(e){var b=e.target.closest("[data-ayuda]");if(b){ir("ayuda");var d=$(b.getAttribute("data-ayuda"));d.open=true;d.scrollIntoView({block:"start"});}});
  $("guiaX").addEventListener("click",function(){guia(false);});
  $("banner").addEventListener("click",accion);
  $("zIn").addEventListener("click",function(){if(zi<ZOOMS.length-1){zi++;encuadrar(true);}});
  $("zOut").addEventListener("click",function(){if(zi>0){zi--;encuadrar(true);}});
  $("zFit").addEventListener("click",function(){zi=0;foco={x:.5,y:.5};encuadrar(true);});
  /* Esc cierra el detalle y devuelve el foco al elemento del nodo */
  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape"){return;}
    if(!$("herrMenu").hidden){$("herrMenu").hidden=true;$("herrBtn").setAttribute("aria-expanded","false");$("herrBtn").focus();return;}
    if(selManual){var id=selManual.id;elegir(null);volverFoco(id);}
  });
  sondear($("gTemp"),$("lTemp"),function(){var s=selActual();return s?s.ht:[];},"°C",1,0,45);
  sondear($("gHum"),$("lHum"),function(){var s=selActual();return s?s.hh:[];},"%",0,0,100);
  arrastre();
  var espera=null;
  window.addEventListener("resize",function(){clearTimeout(espera);espera=setTimeout(function(){ajustar();if(vista==="monitoreo"){encuadrar(true);}},120);});
}
function volverFoco(id){
  var n=nodo(id),b;
  if(!n){return;}
  b=document.querySelector('.poste[data-id="'+id+'"]');
  if(b){b.focus();}
}

var pintar0=pintar;pintar=function(){pintar0();calzar();};
iniciar();armarMapa();eventosUI();ajustar();encuadrar(true);pintar();
(function(){var visto=false;try{visto=localStorage.getItem(GUIA)==="1";}catch(e){}if(!visto){guia(true);}})();
conectarMQTT();setInterval(actualizarDashboard,CADA_MS);setInterval(tick,1000);
})();

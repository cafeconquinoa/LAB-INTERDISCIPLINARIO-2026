#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>

#define DHTPIN 22
#define DHTTYPE DHT11
#define BUZZER 26

DHT dht(DHTPIN, DHTTYPE);
WebServer server(80);

const char* nombreRed = "ESP32_MONITOR";
const char* claveRed  = "12345678";

float temperatura = 0;
float humedad = 0;

const int cantidadDatos = 30;
float historialTemp[cantidadDatos];
float historialHum[cantidadDatos];
int datosGuardados = 0;

unsigned long ultimaMedicion = 0;

String estadoActual() {
  if (temperatura >= 30) return "CRITICO";
  if (temperatura >= 25) return "ALERTA";
  return "NORMAL";
}

String jsonDatos() {
  String json = "{";
  json += "\"temperatura\":" + String(temperatura, 1) + ",";
  json += "\"humedad\":" + String(humedad, 0) + ",";
  json += "\"estado\":\"" + estadoActual() + "\",";
  json += "\"nodo\":\"A-07\",";
  json += "\"zona\":\"Interfaz La Reina\",";

  json += "\"historialTemp\":[";
  for (int i = 0; i < datosGuardados; i++) {
    if (i) json += ",";
    json += String(historialTemp[i], 1);
  }
  json += "],";

  json += "\"historialHum\":[";
  for (int i = 0; i < datosGuardados; i++) {
    if (i) json += ",";
    json += String(historialHum[i], 0);
  }
  json += "]}";
  return json;
}

void paginaWeb() {
  String pagina = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BORDE · Monitoreo territorial</title>
<style>
:root{
  --bg:#eef0ea;--panel:#fff;--ink:#111;--muted:#787b74;--line:#e8e9e4;
  --acid:#d9ff35;--danger:#ff655f;--warning:#ffca58;--ok:#6ecf8d;
  --soft:#f6f7f3;--radius:24px;
}
*{box-sizing:border-box} body{margin:0;background:var(--bg);font-family:Inter,Arial,sans-serif;color:var(--ink)}
button{font:inherit}.app{min-height:100vh;display:grid;grid-template-columns:230px 1fr}
.sidebar{position:sticky;top:0;height:100vh;padding:28px 18px;background:#111;color:#fff;display:flex;flex-direction:column}
.brand{font-size:20px;font-weight:800;letter-spacing:-.5px;margin:2px 10px 36px}.brand i{display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--acid);margin-right:9px}
.nav{display:flex;flex-direction:column;gap:6px}.nav button{border:0;background:transparent;color:#aaa;text-align:left;padding:12px 14px;border-radius:12px;cursor:pointer}.nav button:hover,.nav button.active{background:#252525;color:#fff}.nav small{display:inline-block;width:22px;color:var(--acid)}
.sideStatus{margin-top:auto;background:#1d1d1d;border:1px solid #2d2d2d;border-radius:18px;padding:15px}.sideStatus b{font-size:13px}.sideStatus p{margin:8px 0 0;font-size:11px;color:#aaa}.onlineDot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ok);margin-right:6px}
.main{padding:28px 32px 45px;min-width:0}.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.header h1{margin:0;font-size:30px;font-weight:600;letter-spacing:-1px}.header p{margin:6px 0 0;color:var(--muted);font-size:13px}.pill{background:#fff;border:1px solid var(--line);border-radius:999px;padding:10px 14px;font-size:12px}
.screen{display:none}.screen.active{display:block}.grid{display:grid;gap:16px}.kpis{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:16px}.card{background:var(--panel);border-radius:var(--radius);padding:20px;border:1px solid rgba(0,0,0,.025)}
.kpi{min-height:150px}.kpi.acid{background:var(--acid)}.kpi.dark{background:#171717;color:#fff}.label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.dark .label{color:#9a9a9a}.value{font-size:42px;letter-spacing:-2px;margin-top:24px}.value small{font-size:17px;letter-spacing:0}.micro{font-size:11px;color:var(--muted);margin-top:12px}.acid .micro{color:#555a22}.dark .micro{color:#999}
.overview{grid-template-columns:1.55fr .85fr}.map{height:370px;border-radius:18px;position:relative;overflow:hidden;background:linear-gradient(135deg,#eff1ea 25%,#e5e8df 25%,#e5e8df 50%,#eff1ea 50%,#eff1ea 75%,#e5e8df 75%);background-size:54px 54px}.road{position:absolute;height:5px;background:#fff;box-shadow:0 0 0 1px #ddd;border-radius:6px}.r1{width:120%;left:-10%;top:53%;transform:rotate(-11deg)}.r2{width:85%;left:28%;top:30%;transform:rotate(25deg)}.sector{position:absolute;left:39%;top:24%;width:235px;height:145px;border:2px dashed #a8be28;background:rgba(217,255,53,.18);border-radius:50%}.pin{position:absolute;left:53%;top:44%;transform:translate(-50%,-50%)}.pinCore{width:28px;height:28px;border-radius:50%;background:#111;border:7px solid var(--acid);box-shadow:0 0 0 12px rgba(217,255,53,.25)}.pinTag{margin:14px 0 0 -44px;background:#111;color:#fff;padding:9px 12px;border-radius:10px;font-size:10px;white-space:nowrap}.mapLegend{position:absolute;left:16px;bottom:16px;background:rgba(255,255,255,.92);padding:10px 12px;border-radius:12px;font-size:11px}
.stack{display:flex;flex-direction:column;gap:16px}.state{font-size:30px;margin-top:15px}.normal{color:var(--acid)}.alerta{color:var(--warning)}.critico{color:var(--danger)}.miniBtn{margin-top:16px;border:0;border-radius:12px;padding:10px 12px;background:#fff;cursor:pointer}.dark .miniBtn{background:#2b2b2b;color:#fff}.camera{height:188px;border-radius:18px;background:linear-gradient(145deg,#2c2c2c,#111);display:flex;align-items:center;justify-content:center;color:#fff;position:relative;overflow:hidden}.camera:before{content:"";position:absolute;inset:18%;border:1px solid #5d5d5d;border-radius:12px}.camText{z-index:1;text-align:center;font-size:12px}.camText b{display:block;font-size:16px;margin-bottom:7px}.tag{display:inline-block;background:var(--soft);border-radius:999px;padding:6px 10px;font-size:10px;color:#555}.sectionTitle{display:flex;justify-content:space-between;align-items:end;margin:2px 0 14px}.sectionTitle h2{margin:0;font-size:20px}.sectionTitle p{margin:5px 0 0;color:var(--muted);font-size:12px}
.sensorGrid{grid-template-columns:repeat(3,1fr)}.sensor{min-height:140px}.sensor .reading{font-size:28px;margin:18px 0 10px}.statusLine{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)}.statusDot{width:8px;height:8px;border-radius:50%;background:var(--ok)}.statusDot.demo{background:#bbb}
.charts{grid-template-columns:1fr 1fr;margin-top:16px}.chart{height:220px}.chart svg{width:100%;height:170px;overflow:visible}.axis{stroke:#ddd;stroke-width:1}.plot{fill:none;stroke:#111;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.plotHum{fill:none;stroke:#6c6c6c;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.eventLayout{grid-template-columns:1.1fr .9fr}.eventHero{background:#171717;color:#fff}.eventHero h2{font-size:28px;margin:12px 0 4px}.eventMeta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.eventMeta div{background:#242424;border-radius:14px;padding:12px}.eventMeta span{display:block;color:#999;font-size:10px;margin-bottom:5px}.timeline{display:flex;flex-direction:column;gap:14px}.step{display:grid;grid-template-columns:34px 1fr;gap:12px}.stepNum{width:30px;height:30px;border-radius:50%;background:var(--acid);display:flex;align-items:center;justify-content:center;font-size:11px}.step b{font-size:13px}.step p{font-size:11px;color:var(--muted);margin:4px 0 0}
.compare{grid-template-columns:1fr 1fr}.compareBox{padding:16px;border-radius:16px;background:var(--soft)}.compareBox h4{margin:0 0 12px}.metric{display:flex;justify-content:space-between;border-top:1px solid #e5e5e0;padding:10px 0;font-size:12px}.metric:first-of-type{border-top:0}.future{color:#999}.historyTable{width:100%;border-collapse:collapse;font-size:12px}.historyTable th,.historyTable td{text-align:left;padding:12px;border-bottom:1px solid var(--line)}.historyTable th{color:var(--muted);font-size:10px;text-transform:uppercase}.level{padding:5px 8px;border-radius:999px;background:var(--soft);font-size:10px}.level.warn{background:#fff0cb}.level.ok{background:#e9f8ed}
.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}.flowStep{background:#fff;border:1px solid var(--line);padding:13px;border-radius:15px;font-size:11px}.flowStep b{display:block;margin-bottom:5px}.flowStep.active{background:#171717;color:#fff}.flowStep.active span{color:#aaa}.flowStep span{color:var(--muted)}
@media(max-width:1050px){.kpis{grid-template-columns:1fr 1fr}.overview,.eventLayout{grid-template-columns:1fr}.sensorGrid{grid-template-columns:1fr 1fr}.flow{grid-template-columns:1fr 1fr}.app{grid-template-columns:190px 1fr}}
@media(max-width:760px){.app{display:block}.sidebar{height:auto;position:relative}.nav{display:grid;grid-template-columns:1fr 1fr}.sideStatus{display:none}.main{padding:20px}.kpis,.sensorGrid,.charts,.compare{grid-template-columns:1fr}.header{align-items:flex-start;gap:12px}.pill{display:none}.flow{grid-template-columns:1fr}.map{height:300px}}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand"><i></i>BORDE</div>
    <div class="nav">
      <button class="active" data-screen="inicio"><small>01</small> Inicio</button>
      <button data-screen="territorio"><small>02</small> Territorio</button>
      <button data-screen="tiempo"><small>03</small> Tiempo real</button>
      <button data-screen="evento"><small>04</small> Evento / alerta</button>
      <button data-screen="post"><small>05</small> Post-incendio</button>
      <button data-screen="historial"><small>06</small> Historial</button>
    </div>
    <div class="sideStatus"><b><span class="onlineDot"></span>Nodo A-07 conectado</b><p>DHT11 activo · resto del sistema en modo prototipo</p></div>
  </aside>

  <main class="main">
    <div class="header">
      <div><h1 id="pageTitle">Centro de monitoreo</h1><p>Zona de interfaz urbano-forestal · La Reina</p></div>
      <div class="pill"><span class="onlineDot"></span>Actualización cada 2 s</div>
    </div>

    <div class="flow">
      <div class="flowStep active"><b>1 · Territorio</b><span>Seleccionar sector y nodo</span></div>
      <div class="flowStep"><b>2 · Monitoreo</b><span>Variables + cámara</span></div>
      <div class="flowStep"><b>3 · Detección</b><span>Anomalía / foco</span></div>
      <div class="flowStep"><b>4 · Respuesta</b><span>Alerta + protocolo</span></div>
      <div class="flowStep"><b>5 · Post-incendio</b><span>Comparación histórica</span></div>
    </div>

    <section class="screen active" id="inicio">
      <div class="grid kpis">
        <div class="card kpi acid"><div class="label">Temperatura ambiental</div><div class="value"><span id="temp">--</span><small> °C</small></div><div class="micro">Lectura real · DHT11</div></div>
        <div class="card kpi"><div class="label">Humedad ambiental</div><div class="value"><span id="hum">--</span><small> %</small></div><div class="micro">Lectura real · DHT11</div></div>
        <div class="card kpi dark"><div class="label">Estado del sector</div><div class="state normal" id="estado">NORMAL</div><div class="micro" id="estadoDesc">Sin condición crítica detectada.</div></div>
        <div class="card kpi"><div class="label">Nodo seleccionado</div><div class="value" style="font-size:34px">A-07</div><div class="micro">Parque Reina Alta · prototipo</div></div>
      </div>

      <div class="grid overview">
        <div class="card">
          <div class="sectionTitle"><div><h2>Territorio</h2><p>Selecciona un nodo para revisar su estado y sus variables.</p></div><span class="tag">Mapa de operación</span></div>
          <div class="map"><div class="road r1"></div><div class="road r2"></div><div class="sector"></div><div class="pin"><div class="pinCore"></div><div class="pinTag">A-07 · ACTIVO</div></div><div class="mapLegend">Sector vigilado · interfaz bosque/vivienda</div></div>
        </div>
        <div class="stack">
          <div class="card dark"><div class="label">Condición actual</div><div class="state normal" id="estado2">NORMAL</div><div class="micro" id="estadoDesc2">Sin condición crítica detectada.</div><button class="miniBtn" onclick="go('evento')">Revisar evento</button></div>
          <div class="card"><div class="sectionTitle"><div><h2>Monitoreo visual</h2><p>RGB + térmica</p></div><span class="tag">Cámara 01</span></div><div class="camera"><div class="camText"><b>Vista del entorno</b>Cámara aún no conectada al prototipo</div></div></div>
        </div>
      </div>
    </section>

    <section class="screen" id="territorio">
      <div class="sectionTitle"><div><h2>Mapa territorial</h2><p>Vista del sector, nodos desplegados y condición de cada punto.</p></div><span class="tag">Sector: Reina Alta</span></div>
      <div class="card"><div class="map" style="height:520px"><div class="road r1"></div><div class="road r2"></div><div class="sector" style="left:34%;top:25%;width:330px;height:220px"></div><div class="pin"><div class="pinCore"></div><div class="pinTag">A-07 · nodo seleccionado</div></div><div class="mapLegend">Flujo: territorio → seleccionar nodo → tiempo real</div></div></div>
    </section>

    <section class="screen" id="tiempo">
      <div class="sectionTitle"><div><h2>Monitoreo en tiempo real · A-07</h2><p>Variables ambientales, viento, suelo y ubicación del nodo.</p></div><span class="tag">En vivo</span></div>
      <div class="grid sensorGrid">
        <div class="card sensor"><div class="label">Temperatura ambiental</div><div class="reading"><span id="temp2">--</span> °C</div><div class="statusLine"><i class="statusDot"></i>DHT11 · lectura real</div></div>
        <div class="card sensor"><div class="label">Humedad ambiental</div><div class="reading"><span id="hum2">--</span> %</div><div class="statusLine"><i class="statusDot"></i>DHT11 · lectura real</div></div>
        <div class="card sensor"><div class="label">Velocidad del viento</div><div class="reading future">-- m/s</div><div class="statusLine"><i class="statusDot demo"></i>Anemómetro · por conectar</div></div>
        <div class="card sensor"><div class="label">Dirección del viento</div><div class="reading future">-- °</div><div class="statusLine"><i class="statusDot demo"></i>Veleta · por conectar</div></div>
        <div class="card sensor"><div class="label">Material particulado</div><div class="reading future">-- µg/m³</div><div class="statusLine"><i class="statusDot demo"></i>PM2.5 · por conectar</div></div>
        <div class="card sensor"><div class="label">Ubicación</div><div class="reading" style="font-size:20px">A-07</div><div class="statusLine"><i class="statusDot demo"></i>GPS · módulo futuro</div></div>
      </div>
      <div class="grid charts">
        <div class="card"><div class="sectionTitle"><div><h2>Temperatura</h2><p>Últimas 30 lecturas</p></div></div><div class="chart"><svg id="chartTemp" viewBox="0 0 600 170"></svg></div></div>
        <div class="card"><div class="sectionTitle"><div><h2>Humedad</h2><p>Últimas 30 lecturas</p></div></div><div class="chart"><svg id="chartHum" viewBox="0 0 600 170"></svg></div></div>
      </div>
    </section>

    <section class="screen" id="evento">
      <div class="sectionTitle"><div><h2>Evento / alerta</h2><p>La anomalía reúne nodo, hora, variables, imágenes y nivel de riesgo.</p></div><span class="tag" id="eventTag">Sin evento crítico</span></div>
      <div class="grid eventLayout">
        <div class="card eventHero"><div class="label">Evento actual</div><h2 id="eventTitle">Monitoreo preventivo</h2><p id="eventText" style="color:#aaa;font-size:12px">No se ha superado el umbral principal de temperatura.</p><div class="eventMeta"><div><span>NODO</span>A-07</div><div><span>SECTOR</span>Reina Alta</div><div><span>TEMPERATURA</span><b id="temp3">--</b> °C</div><div><span>NIVEL</span><b id="estado3">NORMAL</b></div></div></div>
        <div class="card"><div class="sectionTitle"><div><h2>Secuencia de respuesta</h2><p>Qué ocurre cuando el sistema detecta una condición crítica.</p></div></div><div class="timeline"><div class="step"><div class="stepNum">1</div><div><b>Detectar anomalía</b><p>Comparar las variables con rangos definidos.</p></div></div><div class="step"><div class="stepNum">2</div><div><b>Revisar evidencia</b><p>Variables + cámara RGB/térmica + ubicación.</p></div></div><div class="step"><div class="stepNum">3</div><div><b>Clasificar nivel</b><p>Normal, alerta o crítico según reglas.</p></div></div><div class="step"><div class="stepNum">4</div><div><b>Notificar</b><p>Operador municipal y equipos de emergencia.</p></div></div><div class="step"><div class="stepNum">5</div><div><b>Registrar evento</b><p>Guardar hora, nodo, variables e historial.</p></div></div></div></div>
      </div>
    </section>

    <section class="screen" id="post">
      <div class="sectionTitle"><div><h2>Post-incendio</h2><p>Comparación de condiciones antes y después del evento con el módulo de suelo.</p></div><span class="tag">Módulo B · reutilizable</span></div>
      <div class="grid compare">
        <div class="card"><div class="compareBox"><h4>Antes del evento</h4><div class="metric"><span>Humedad del suelo</span><b>-- %</b></div><div class="metric"><span>Temperatura suelo</span><b>-- °C</b></div><div class="metric"><span>pH</span><b>--</b></div><div class="metric"><span>NPK</span><b>--</b></div><div class="metric"><span>Conductividad</span><b>-- µS/cm</b></div></div></div>
        <div class="card"><div class="compareBox"><h4>Después del evento</h4><div class="metric"><span>Humedad del suelo</span><b>-- %</b></div><div class="metric"><span>Temperatura suelo</span><b>-- °C</b></div><div class="metric"><span>pH</span><b>--</b></div><div class="metric"><span>NPK</span><b>--</b></div><div class="metric"><span>Conductividad</span><b>-- µS/cm</b></div></div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="sectionTitle"><div><h2>Interpretación</h2><p>Esta pantalla queda preparada para cuando conectes los sensores de suelo. No inventa lecturas.</p></div></div><div class="micro" style="font-size:12px">El flujo usa el historial de la base de datos para comparar el estado previo con la medición post-incendio y generar un reporte técnico.</div></div>
    </section>

    <section class="screen" id="historial">
      <div class="sectionTitle"><div><h2>Historial y reportes</h2><p>Registro de eventos y consultas del operador municipal.</p></div><button class="miniBtn" style="margin:0;background:#111;color:#fff">Generar reporte</button></div>
      <div class="card"><table class="historyTable"><thead><tr><th>Fecha</th><th>Nodo</th><th>Tipo</th><th>Nivel</th><th>Estado</th></tr></thead><tbody><tr><td>Hoy · tiempo real</td><td>A-07</td><td>Monitoreo ambiental</td><td><span class="level ok" id="histLevel">Normal</span></td><td>Activo</td></tr><tr><td>—</td><td>—</td><td>Sin eventos registrados</td><td>—</td><td>—</td></tr></tbody></table></div>
    </section>
  </main>
</div>
<script>
const titles={inicio:'Centro de monitoreo',territorio:'Territorio',tiempo:'Monitoreo en tiempo real',evento:'Evento / alerta',post:'Post-incendio',historial:'Historial y reportes'};
function go(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));document.getElementById(id).classList.add('active');const b=document.querySelector(`[data-screen="${id}"]`);if(b)b.classList.add('active');document.getElementById('pageTitle').textContent=titles[id];window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>go(b.dataset.screen)));
function setState(el,state){el.textContent=state;el.className='state '+(state==='NORMAL'?'normal':state==='ALERTA'?'alerta':'critico');}
function plot(svgId,data,min,max,cls){const svg=document.getElementById(svgId);if(!svg)return;svg.innerHTML='<line class="axis" x1="35" y1="20" x2="35" y2="145"/><line class="axis" x1="35" y1="145" x2="585" y2="145"/>';if(!data||data.length<2)return;const pts=data.map((v,i)=>{const x=35+(i/Math.max(29,data.length-1))*550;const vv=Math.max(min,Math.min(max,v));const y=145-((vv-min)/(max-min))*115;return `${x.toFixed(1)},${y.toFixed(1)}`}).join(' ');svg.innerHTML+=`<polyline class="${cls}" points="${pts}"/>`;}
async function update(){try{const r=await fetch('/data',{cache:'no-store'});const d=await r.json();['temp','temp2','temp3'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=d.temperatura.toFixed(1)});['hum','hum2'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=d.humedad.toFixed(0)});['estado','estado2','estado3'].forEach(id=>{const e=document.getElementById(id);if(e){if(id==='estado3'){e.textContent=d.estado}else setState(e,d.estado)}});const desc=d.estado==='NORMAL'?'Sin condición crítica detectada.':d.estado==='ALERTA'?'Temperatura sobre umbral preventivo.':'Condición crítica: revisar y activar protocolo.';document.getElementById('estadoDesc').textContent=desc;document.getElementById('estadoDesc2').textContent=desc;document.getElementById('eventTag').textContent=d.estado==='NORMAL'?'Sin evento crítico':'Evento detectado';document.getElementById('eventTitle').textContent=d.estado==='NORMAL'?'Monitoreo preventivo':'Anomalía térmica detectada';document.getElementById('eventText').textContent=d.estado==='NORMAL'?'No se ha superado el umbral principal de temperatura.':'La temperatura superó el rango definido y requiere revisión del operador.';document.getElementById('histLevel').textContent=d.estado;document.getElementById('histLevel').className='level '+(d.estado==='NORMAL'?'ok':'warn');plot('chartTemp',d.historialTemp,0,50,'plot');plot('chartHum',d.historialHum,0,100,'plotHum');}catch(e){}}
update();setInterval(update,2000);
</script>
</body>
</html>
)rawliteral";
  server.send(200, "text/html", pagina);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(BUZZER, OUTPUT);
  noTone(BUZZER);

  WiFi.softAP(nombreRed, claveRed);

  Serial.println();
  Serial.println("WIFI DEL ESP32 CREADO");
  Serial.print("Conectate a: ");
  Serial.println(nombreRed);
  Serial.print("Luego abre: http://");
  Serial.println(WiFi.softAPIP());

  server.on("/", paginaWeb);
  server.on("/data", []() {
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json", jsonDatos());
  });
  server.begin();
}

void loop() {
  server.handleClient();

  if (millis() - ultimaMedicion >= 2000) {
    ultimaMedicion = millis();
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(h) && !isnan(t)) {
      temperatura = t;
      humedad = h;

      if (datosGuardados < cantidadDatos) {
        historialTemp[datosGuardados] = temperatura;
        historialHum[datosGuardados] = humedad;
        datosGuardados++;
      } else {
        for (int i = 0; i < cantidadDatos - 1; i++) {
          historialTemp[i] = historialTemp[i + 1];
          historialHum[i] = historialHum[i + 1];
        }
        historialTemp[cantidadDatos - 1] = temperatura;
        historialHum[cantidadDatos - 1] = humedad;
      }

      Serial.print("Temperatura: ");
      Serial.print(temperatura);
      Serial.print(" C | Humedad: ");
      Serial.print(humedad);
      Serial.println(" %");

      if (temperatura >= 25) {
        tone(BUZZER, 2000);
        delay(120);
        noTone(BUZZER);
      } else {
        noTone(BUZZER);
      }
    }
  }
}

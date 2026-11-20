#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "secrets.h"

// =====================================================
// PINES DEL PROTOTIPO
// =====================================================

// DHT22 del prototipo original
#define PIN_DHT 18
#define DHTTYPE DHT22

// DS18B20
// Amarillo DATA -> GPIO 4
// Rojo VCC      -> 3.3V
// Negro GND     -> GND
// Resistencia pull-up 4.3 kOhm entre DATA y 3.3V
#define PIN_DS18B20 4

// DSM501A (ambas salidas del prototipo original)
// VOUT1 / N2 -> GPIO 25 (con adaptación a 3.3V)
// VOUT2 / N4 -> GPIO 26 (con adaptación a 3.3V)
// VCC -> 5V | GND -> GND
#define PIN_PM25 25
#define PIN_PM10 26

// Buzzer activo
#define PIN_BUZZER 27  // Se mueve a GPIO27 para no chocar con DSM501A VOUT2 en GPIO26

// =====================================================
// WIFI CREADO POR EL ESP32
// =====================================================

//const char* nombreRed = "ESP32_MONITOR";
//const char* claveRed = "12345678";

// =====================================================
// WIFI DEL ROUTER O HOTSPOT
// =====================================================
//PONER EL NOMBRE Y CONTRASEÑA DE UNA RED WIFI DE 2,4GHz

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

// =====================================================
// CONFIGURACION MQTT
// =====================================================

const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;

const char* mqtt_topic = "cortafuego/grupo1/nodo1/estado";

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long ultimaPublicacion = 0;
const unsigned long INTERVALO_MQTT = 2000;


// =====================================================
// UMBRALES
// =====================================================

// Temperatura del aire (°C)
const float UMBRAL_ALERTA = 25.0;      // Advertencia
const float UMBRAL_CRITICO = 30.0;     // Crítico

// Humedad del aire (%): bajo estos valores sube el riesgo (regla 30-30-30)
const float UMBRAL_HUM_ADV = 30.0;     // Advertencia
const float UMBRAL_HUM_CRITICO = 20.0; // Crítico

// =====================================================
// OBJETOS
// =====================================================

DHT dht(PIN_DHT, DHTTYPE);
OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);

// =====================================================
// DATOS ACTUALES
// =====================================================

float temperaturaAire = NAN;
float humedadAire = NAN;
float temperaturaSuelo = DEVICE_DISCONNECTED_C;

unsigned long dsmPulse = 0;
bool dsmValido = false;

unsigned long ultimaLecturaOK = 0;
unsigned long ultimaMedicion = 0;

const int MAX_HIST = 30;
float historialTemp[MAX_HIST];
float historialHum[MAX_HIST];
int historialCount = 0;

// El dashboard web vive ahora en archivos HTML/CSS/JS independientes.
// La ESP32 conserva el firmware y publica el JSON por MQTT TCP (puerto 1883).

// =====================================================
// HISTORIAL
// =====================================================

void guardarHistorial(float t, float h) {

  if (historialCount < MAX_HIST) {
    historialTemp[historialCount] = t;
    historialHum[historialCount] = h;
    historialCount++;
  } else {
    for (int i = 0; i < MAX_HIST - 1; i++) {
      historialTemp[i] = historialTemp[i + 1];
      historialHum[i] = historialHum[i + 1];
    }

    historialTemp[MAX_HIST - 1] = t;
    historialHum[MAX_HIST - 1] = h;
  }
}

// =====================================================
// ESTADO GENERAL
// =====================================================

String estadoActual() {

  if (isnan(temperaturaAire)) {
    return "SIN_DATOS";
  }

  bool humOK = !isnan(humedadAire);

  if (temperaturaAire >= UMBRAL_CRITICO || (humOK && humedadAire < UMBRAL_HUM_CRITICO)) {
    return "CRITICO";
  }

  // Mismo nombre que en el dashboard: Normal, Advertencia, Crítico
  if (temperaturaAire >= UMBRAL_ALERTA || (humOK && humedadAire < UMBRAL_HUM_ADV)) {
    return "ADVERTENCIA";
  }

  return "NORMAL";
}

// =====================================================
// BUZZER
// =====================================================

void actualizarBuzzer() {

  String e = estadoActual();
  if (e == "NORMAL" || e == "SIN_DATOS") {
    digitalWrite(PIN_BUZZER, LOW);
    return;
  }

  // Buzzer intermitente para que no quede sonando continuo.
  bool encendido = ((millis() / 300) % 2) == 0;
  digitalWrite(PIN_BUZZER, encendido ? HIGH : LOW);
}

// =====================================================
// LEER SENSORES
// =====================================================

void leerSensores() {

  // DHT22
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(h) && !isnan(t)) {
    humedadAire = h;
    temperaturaAire = t;
    ultimaLecturaOK = millis();
    guardarHistorial(temperaturaAire, humedadAire);
  }

  // DS18B20
  ds18b20.requestTemperatures();
  float ts = ds18b20.getTempCByIndex(0);

  if (ts != DEVICE_DISCONNECTED_C) {
    temperaturaSuelo = ts;
  }

  // DSM501A: comprobamos los pulsos de ambas salidas.
  // El dashboard muestra el ancho del pulso VOUT2; no se presenta
  // como concentracion PM calibrada.
  unsigned long pulsoVOUT1 = pulseIn(PIN_PM25, LOW, 250000);
  dsmPulse = pulseIn(PIN_PM10, LOW, 250000);
  dsmValido = dsmPulse > 100;

  // Resumen por Monitor Serie
  Serial.println();
  Serial.println("==============================");
  Serial.println("       RESUMEN SENSORES");
  Serial.println("==============================");

  Serial.print("Temperatura aire: ");
  if (isnan(temperaturaAire)) {
    Serial.println("SIN DATOS");
  } else {
    Serial.print(temperaturaAire, 1);
    Serial.println(" C");
  }

  Serial.print("Humedad aire:     ");
  if (isnan(humedadAire)) {
    Serial.println("SIN DATOS");
  } else {
    Serial.print(humedadAire, 1);
    Serial.println(" %");
  }

  Serial.print("Temperatura suelo:");
  if (temperaturaSuelo == DEVICE_DISCONNECTED_C) {
    Serial.println(" SIN DATOS");
  } else {
    Serial.print(" ");
    Serial.print(temperaturaSuelo, 2);
    Serial.println(" C");
  }

  Serial.print("DSM501A:          ");
  if (dsmValido) {
    Serial.print("SENAL (");
    Serial.print(dsmPulse);
    Serial.println(" us)");
  } else {
    Serial.println("SIN LECTURA VALIDA");
  }

  Serial.println("NPK:              PENDIENTE RS485");
  Serial.print("Estado:           ");
  Serial.println(estadoActual());
  Serial.println("==============================");
}

// =====================================================
// CREAR JSON PARA EL DASHBOARD
// =====================================================

String crearJSON() {

  String json;
  json.reserve(1900);

  json += "{";

  // El dashboard usa lecturas=0 para considerar el nodo desconectado.
  json += "\"lecturas\":";
  json += isnan(temperaturaAire) ? "0" : String(historialCount);

  json += ",\"edadMs\":";
  if (ultimaLecturaOK == 0) {
    json += "999999";
  } else {
    json += String(millis() - ultimaLecturaOK);
  }

  json += ",\"temperatura\":";
  if (isnan(temperaturaAire)) {
    json += "null";
  } else {
    json += String(temperaturaAire, 1);
  }

  json += ",\"humedad\":";
  if (isnan(humedadAire)) {
    json += "null";
  } else {
    json += String(humedadAire, 1);
  }

  json += ",\"temperaturaSuelo\":";
  if (temperaturaSuelo == DEVICE_DISCONNECTED_C) {
    json += "null";
  } else {
    json += String(temperaturaSuelo, 2);
  }

  json += ",\"dsmPulse\":";
  json += String(dsmPulse);

  json += ",\"dsmValido\":";
  json += dsmValido ? "true" : "false";

  json += ",\"estado\":\"";
  json += estadoActual();
  json += "\"";

  json += ",\"umbralAlerta\":";
  json += String(UMBRAL_ALERTA, 1);

  json += ",\"umbralCritico\":";
  json += String(UMBRAL_CRITICO, 1);

  json += ",\"umbralHumAdv\":";
  json += String(UMBRAL_HUM_ADV, 1);

  json += ",\"umbralHumCrit\":";
  json += String(UMBRAL_HUM_CRITICO, 1);

  json += ",\"historialTemp\":[";
  for (int i = 0; i < historialCount; i++) {
    if (i > 0) json += ",";
    json += String(historialTemp[i], 1);
  }
  json += "]";

  json += ",\"historialHum\":[";
  for (int i = 0; i < historialCount; i++) {
    if (i > 0) json += ",";
    json += String(historialHum[i], 1);
  }
  json += "]";

  json += "}";

  return json;
}

void conectarWiFi() {

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Conectando a WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi conectado");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void conectarMQTT() {

  while (!client.connected()) {

    Serial.print("Conectando a MQTT...");

    String id = "Cortafuego-";
    id += String((uint32_t)ESP.getEfuseMac(), HEX);

    if (client.connect(id.c_str())) {

      Serial.println(" conectado");

    } else {

      Serial.print("Error MQTT: ");
      Serial.println(client.state());

      delay(2000);
    }
  }
}

// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(115200);

  dht.begin();
  ds18b20.begin();

  pinMode(PIN_PM25, INPUT);
  pinMode(PIN_PM10, INPUT);

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  // Conexion WiFi
conectarWiFi();

// Configuracion MQTT
client.setServer(mqtt_server, mqtt_port);
client.setBufferSize(2048);

Serial.println();
Serial.println("======================================");
Serial.println(" DASHBOARD DEL CORTAFUEGO INICIADO");
Serial.println("DHT22: GPIO18 | DS18B20: GPIO4");
Serial.println("DSM501A: VOUT1=GPIO25, VOUT2=GPIO26");
Serial.println("======================================");

Serial.print("WiFi conectado: ");
Serial.println(ssid);

Serial.print("IP ESP32: ");
Serial.println(WiFi.localIP());

Serial.print("Broker MQTT: ");
Serial.println(mqtt_server);

Serial.print("Topic MQTT: ");
Serial.println(mqtt_topic);

Serial.println("Monitor Serie: 115200 baud");
Serial.println("======================================");

  // Primera lectura.
  leerSensores();
  ultimaMedicion = millis();
}

// =====================================================
// LOOP
// =====================================================

void loop() {

  actualizarBuzzer();

  if (WiFi.status() != WL_CONNECTED) {
    conectarWiFi();
  }

  if (!client.connected()) {
    conectarMQTT();
  }

  client.loop();

  if (millis() - ultimaMedicion >= 2000) {

    ultimaMedicion = millis();

    leerSensores();
  }

  if (millis() - ultimaPublicacion >= INTERVALO_MQTT) {

    ultimaPublicacion = millis();

    String mensaje = crearJSON();

    client.publish(
      mqtt_topic,
      mensaje.c_str()
    );

    Serial.println("Datos enviados por MQTT:");
    Serial.println(mensaje);
  }
}

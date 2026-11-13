#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"

const char* ssid = "ESP32_MONITOR";
const char* password = "12345678";
IPAddress ip(192,168,4,100), gateway(192,168,4,1), mask(255,255,255,0);
httpd_handle_t serverCam = nullptr;

static esp_err_t streamHandler(httpd_req_t* req) {
  esp_err_t result = httpd_resp_set_type(req, "multipart/x-mixed-replace; boundary=frame");
  if (result != ESP_OK) return result;
  httpd_resp_set_hdr(req, "Cache-Control", "no-store");
  while (WiFi.status() == WL_CONNECTED) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) return ESP_FAIL;
    char header[100];
    int n = snprintf(header, sizeof(header), "\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", (unsigned)fb->len);
    result = httpd_resp_send_chunk(req, header, n);
    if (result == ESP_OK) result = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    if (result != ESP_OK) return result;
    delay(50);
  }
  return ESP_FAIL;
}

void setup() {
  Serial.begin(115200);
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0=5; c.pin_d1=18; c.pin_d2=19; c.pin_d3=21;
  c.pin_d4=36; c.pin_d5=39; c.pin_d6=34; c.pin_d7=35;
  c.pin_xclk=0; c.pin_pclk=22; c.pin_vsync=25; c.pin_href=23;
  c.pin_sccb_sda=26; c.pin_sccb_scl=27; c.pin_pwdn=32; c.pin_reset=-1;
  c.xclk_freq_hz=20000000;
  c.pixel_format=PIXFORMAT_JPEG;
  c.frame_size=psramFound()?FRAMESIZE_VGA:FRAMESIZE_QVGA;
  c.jpeg_quality=15;
  c.fb_count=psramFound()?2:1;
  c.fb_location=psramFound()?CAMERA_FB_IN_PSRAM:CAMERA_FB_IN_DRAM;
  c.grab_mode=psramFound()?CAMERA_GRAB_LATEST:CAMERA_GRAB_WHEN_EMPTY;
  esp_err_t err=esp_camera_init(&c);
  if(err!=ESP_OK){Serial.printf("Error camara: 0x%x\n",err);return;}
  WiFi.mode(WIFI_STA);
  if (!WiFi.config(ip,gateway,mask)) {
    Serial.println("ERROR: no se pudo configurar la IP fija");
    return;
  }
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);
  WiFi.begin(ssid,password);
  Serial.print("Conectando a ESP32_MONITOR");
  while(WiFi.status()!=WL_CONNECTED){delay(500);Serial.print(".");}
  Serial.println();
  httpd_config_t config=HTTPD_DEFAULT_CONFIG();
  config.server_port=81;
  config.ctrl_port=32769;
  config.lru_purge_enable=true;   // libera conexiones viejas del stream
  httpd_uri_t uri={};
  uri.uri="/stream"; uri.method=HTTP_GET; uri.handler=streamHandler;
  if(httpd_start(&serverCam,&config)==ESP_OK && httpd_register_uri_handler(serverCam,&uri)==ESP_OK){
    Serial.println("ESP32-CAM conectada correctamente");
    Serial.print("IP real: "); Serial.println(WiFi.localIP());
    Serial.println("Puerto: 81");
    Serial.print("Video: http://");Serial.print(WiFi.localIP());Serial.println(":81/stream");
    Serial.println("Abre esa URL desde un equipo conectado a ESP32_MONITOR.");
  }else Serial.println("Error servidor de video");
}
void loop(){delay(1000);}

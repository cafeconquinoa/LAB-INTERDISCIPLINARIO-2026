# BITÁCORA DE AVANCE
## Desarrollo y pruebas del prototipo electrónico de monitoreo ambiental y de suelo

**Fecha:** Noviembre 2026  
**Etapa:** Desarrollo del prototipo electrónico, integración de sensores y programación.

### 1. Desarrollo de la arquitectura electrónica

Se avanzó en la implementación del sistema electrónico de monitoreo ambiental y de suelo, utilizando una placa ESP32 como unidad central de procesamiento y recopilación de datos.

El objetivo de esta etapa fue integrar los distintos sensores del sistema, establecer sus conexiones mediante una protoboard y desarrollar un código capaz de recibir, procesar y visualizar las mediciones en tiempo real.

Se trabajó en la integración de los siguientes componentes:

- ESP32 como controlador principal.
- Sensor DHT11 para la medición de temperatura y humedad ambiental.
- Sensor DS18B20 para la medición de temperatura del suelo.
- Sensor DSM501A para la detección de partículas suspendidas en el aire.
- Sensor NPK para la medición de nutrientes del suelo.
- Módulo MAX485 para establecer la comunicación RS485 entre el sensor NPK y el ESP32.
- Buzzer para generar alertas mediante señales sonoras.

### 2. Integración y conexión de sensores

Se realizaron distintas pruebas de conexión utilizando una protoboard, cables Dupont y resistencias, buscando establecer una distribución adecuada de los pines GPIO y evitar interferencias entre los componentes.

**Sensor DS18B20:** Se trabajó en su conexión mediante el protocolo OneWire, utilizando el GPIO4 y una resistencia de 4,3 kΩ como resistencia pull-up entre la alimentación de 3,3 V y la línea de datos. Se logró obtener lecturas de temperatura del suelo a través del Monitor Serie.

**Sensor DHT11:** Se integró para obtener datos de temperatura y humedad ambiental. Se consiguió visualizar sus mediciones correctamente en el Monitor Serie.

**Sensor NPK y módulo MAX485:** Se comenzó la integración del sensor NPK mediante comunicación RS485. Se identificaron los terminales VCC, GND, A y B del módulo MAX485, además de los pines RO, RE, DE y DI correspondientes a la comunicación con el ESP32. Se trabajó en la configuración de las conexiones y en la incorporación de la biblioteca ModbusMaster para gestionar la lectura de registros del sensor. Sin embargo, la comunicación todavía presentó dificultades y no se consiguió validar la recepción de datos del NPK.

**Sensor DSM501A:** Se realizaron diversas pruebas para conseguir la lectura de partículas suspendidas en el aire. Inicialmente se trabajó con una sola salida del sensor, pero posteriormente se decidió incorporar sus dos canales de señal, VOUT1 y VOUT2, para obtener una lectura más completa.

### 3. Desarrollo y modificación del código

Se desarrolló y modificó el programa principal del ESP32 utilizando Arduino IDE.

Durante este proceso se trabajó en:

- Incorporación de las bibliotecas necesarias para los sensores y módulos de comunicación.
- Configuración de los pines GPIO.
- Lectura de temperatura y humedad ambiental.
- Lectura de temperatura del suelo.
- Integración de la comunicación RS485 para el sensor NPK.
- Desarrollo de rutinas para obtener las señales del sensor DSM501A.
- Organización de los datos recibidos para su posterior visualización.
- Integración de las lecturas en un dashboard de monitoreo.

Durante la programación se presentaron errores relacionados con bibliotecas faltantes, conflictos en la asignación de pines y dificultades durante la carga del programa al ESP32.

Uno de los problemas identificados fue la utilización del GPIO26 tanto para el buzzer como para una salida del DSM501A. Para solucionarlo, se modificó la distribución de pines, trasladando el buzzer al GPIO33 y reservando los GPIO25 y GPIO26 para las dos salidas del sensor de partículas.

### 4. Integración del sensor DSM501A

Se revisó el funcionamiento del DSM501A a partir de un diagrama de referencia y se adaptaron sus conexiones para trabajar con el ESP32.

La nueva distribución propuesta quedó establecida de la siguiente manera:

- VOUT1: GPIO25.
- VOUT2: GPIO26.
- VCC: alimentación de 5 V.
- GND: tierra común.

Debido a que el ESP32 trabaja con señales de 3,3 V, se incorporaron divisores de tensión para adaptar las señales de salida del sensor y proteger las entradas GPIO.

También se modificó el código para registrar el tiempo durante el cual cada señal permanece en estado LOW, utilizando interrupciones y ventanas de medición de cinco segundos.

Se incorporó el cálculo de la proporción de tiempo LOW y su conversión a una concentración estimada de partículas. Además, se consideró un período aproximado de 60 segundos para la estabilización inicial del sensor.

### 5. Pruebas y dificultades identificadas

Durante las pruebas se detectaron problemas de comunicación e interacción entre algunos sensores.

En determinados momentos, el Monitor Serie mostraba lecturas de temperatura del suelo y partículas, pero posteriormente dejaba de recibirlas. También se observaron situaciones en las que algunos sensores entregaban información mientras otros dejaban de responder.

Esto llevó a revisar la distribución de los pines GPIO, las conexiones de alimentación, las conexiones de tierra y la programación de las rutinas de lectura.

También se presentó un error durante la carga del programa, relacionado con la verificación de la conexión con la memoria flash del ESP32. Aunque el código compilaba correctamente, la carga no siempre finalizaba de manera exitosa.

En las últimas pruebas se consiguió visualizar nuevamente la temperatura del suelo y los datos del DHT11 en el Monitor Serie. Sin embargo, el DSM501A todavía mostraba el mensaje de ausencia de lectura válida, por lo que quedó pendiente comprobar que la última versión del código estuviera correctamente cargada y que ambas salidas del sensor estuvieran entregando señales.

### 6. Estado actual del prototipo

Al finalizar esta etapa, el estado de integración de los componentes es el siguiente:

| Componente | Estado de avance |
|---|---|
| ESP32 | Configurado y programado |
| DHT11 | Lecturas obtenidas |
| DS18B20 | Lecturas de temperatura obtenidas |
| DSM501A | En proceso de diagnóstico de sus dos salidas |
| Sensor NPK | Integración RS485 pendiente de validar |
| MAX485 | Conexiones identificadas e integración en pruebas |
| Buzzer | Reasignación de pin realizada en el código |
| Dashboard | Estructura de visualización desarrollada; integración de todas las lecturas pendiente |

### 7. Próximos pasos

Para continuar con el desarrollo del prototipo se establecieron las siguientes tareas:

1. Verificar las conexiones eléctricas de todos los sensores en la protoboard.
2. Comprobar que los sensores no estén utilizando simultáneamente los mismos pines GPIO.
3. Validar las lecturas independientes de VOUT1 y VOUT2 del DSM501A.
4. Comprobar que el sensor DSM501A entregue lecturas estables después de su período de calentamiento.
5. Revisar la comunicación entre el sensor NPK y el ESP32 mediante el módulo MAX485.
6. Comprobar la alimentación y la continuidad de las conexiones.
7. Integrar progresivamente todos los sensores en un único programa.
8. Verificar que los datos se actualicen correctamente en el dashboard.
9. Realizar pruebas de funcionamiento simultáneo para comprobar la estabilidad del sistema.

### 8. Protocolo de comunicación.
| Sensor | Clasificación |
|---|---|
| DS18B20 | Ninguno |
| Sensor de humedad del suelo | Ninguno |
| DSM501A | Ninguno |
| Sensor NPK | UART |

**Conclusión de la etapa:**

Se logró avanzar en la construcción de la base electrónica del prototipo, desarrollando la programación inicial del ESP32 e integrando satisfactoriamente algunos de los sensores ambientales y de suelo. El proceso permitió identificar problemas relacionados con la asignación de pines, la comunicación entre módulos y la lectura simultánea de sensores.

Actualmente, el trabajo se encuentra enfocado en estabilizar las conexiones y validar individualmente los sensores que todavía presentan dificultades, con el objetivo de conseguir un funcionamiento conjunto y confiable del sistema de monitoreo.


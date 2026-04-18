-- Seed complete staff documentation (62 documents across 6 categories, EN + ES)
-- Generated for ICE Alarm España

-- ============================================
-- CATEGORY 1: EMERGENCY PROTOCOLS (10 docs)
-- ============================================

-- 1.1 SOS Alert Response Protocol (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'sos-alert-response-protocol-en',
  'SOS Alert Response Protocol',
  'emergency',
  '## SOS Alert Response Protocol

**Priority Level: CRITICAL** | **Response Time: < 30 seconds**

### Overview
When a member presses the SOS button on their EV-07B pendant, it triggers an immediate emergency alert. This protocol ensures rapid, professional response to protect member safety.

### Immediate Response Steps

1. **Acknowledge Alert (within 5 seconds)**
   - Click "Claim Alert" to take ownership
   - System logs your assignment automatically
   - Alert status changes to "In Progress"

2. **Establish Contact (within 30 seconds)**
   - Call member using the one-click dial button
   - Speak clearly: "Hello, this is [Name] from ICE Alarm. We received your emergency alert. Are you okay?"
   - Wait for response - allow 15 seconds

3. **Assess Situation**
   - **Member responds - Emergency confirmed**: Proceed to emergency services protocol
   - **Member responds - False alarm**: Document as accidental, reassure member
   - **No response**: Proceed to Non-Response Protocol

### Emergency Services Required

If member confirms emergency or cannot respond:

1. **Call 112 immediately** (Spanish emergency number)
2. Provide dispatcher with:
   - Member''s full name and age
   - Exact address (displayed on alert screen)
   - GPS coordinates if outdoors
   - Known medical conditions
   - Nature of emergency if known
3. **Stay on the line** with 112 until responders dispatched
4. **Call emergency contacts** in priority order
5. **Keep member calm** if communication possible

### Documentation Requirements

After every SOS alert, document:
- Time alert received and response time
- Communication attempts and outcomes
- Emergency services called (Y/N)
- Emergency contacts notified
- Resolution notes
- Member condition at close

### Escalation Triggers

**Immediately notify supervisor if:**
- Multiple alerts from same member in 24 hours
- Member reports abuse or threat
- Emergency services report serious injury
- Unable to establish any contact for 10+ minutes
- Technical issues preventing response

### Quality Standards

- Response time target: < 30 seconds to first call
- All alerts must be resolved within shift
- 100% documentation compliance required
- Monthly audit of response times',
  ARRAY['staff', 'ai'],
  10,
  ARRAY['sos', 'emergency', 'response', 'protocol', 'critical'],
  'en',
  'published'
);

-- 1.2 SOS Alert Response Protocol (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'sos-alert-response-protocol-es',
  'Protocolo de Respuesta a Alertas SOS',
  'emergency',
  '## Protocolo de Respuesta a Alertas SOS

**Nivel de Prioridad: CRÍTICO** | **Tiempo de Respuesta: < 30 segundos**

### Descripción General
Cuando un miembro pulsa el botón SOS de su colgante EV-07B, se activa una alerta de emergencia inmediata. Este protocolo garantiza una respuesta rápida y profesional para proteger la seguridad del miembro.

### Pasos de Respuesta Inmediata

1. **Confirmar Alerta (en 5 segundos)**
   - Haga clic en "Reclamar Alerta" para tomar responsabilidad
   - El sistema registra automáticamente su asignación
   - El estado de la alerta cambia a "En Progreso"

2. **Establecer Contacto (en 30 segundos)**
   - Llame al miembro usando el botón de marcación rápida
   - Hable claramente: "Hola, soy [Nombre] de ICE Alarm. Hemos recibido su alerta de emergencia. ¿Está usted bien?"
   - Espere respuesta - permita 15 segundos

3. **Evaluar Situación**
   - **Miembro responde - Emergencia confirmada**: Proceder al protocolo de servicios de emergencia
   - **Miembro responde - Falsa alarma**: Documentar como accidental, tranquilizar al miembro
   - **Sin respuesta**: Proceder al Protocolo de No Respuesta

### Servicios de Emergencia Requeridos

Si el miembro confirma emergencia o no puede responder:

1. **Llame al 112 inmediatamente**
2. Proporcione al operador:
   - Nombre completo y edad del miembro
   - Dirección exacta (mostrada en pantalla)
   - Coordenadas GPS si está en exterior
   - Condiciones médicas conocidas
   - Naturaleza de la emergencia si se conoce
3. **Permanezca en línea** con el 112 hasta que envíen ayuda
4. **Llame a los contactos de emergencia** en orden de prioridad
5. **Mantenga al miembro tranquilo** si es posible comunicarse

### Requisitos de Documentación

Después de cada alerta SOS, documentar:
- Hora de recepción y tiempo de respuesta
- Intentos de comunicación y resultados
- Servicios de emergencia llamados (S/N)
- Contactos de emergencia notificados
- Notas de resolución
- Estado del miembro al cierre

### Disparadores de Escalación

**Notificar inmediatamente al supervisor si:**
- Múltiples alertas del mismo miembro en 24 horas
- El miembro reporta abuso o amenaza
- Servicios de emergencia reportan lesión grave
- No se puede establecer contacto por 10+ minutos
- Problemas técnicos que impiden la respuesta

### Estándares de Calidad

- Objetivo de tiempo de respuesta: < 30 segundos a primera llamada
- Todas las alertas deben resolverse dentro del turno
- 100% cumplimiento de documentación requerido
- Auditoría mensual de tiempos de respuesta',
  ARRAY['staff', 'ai'],
  10,
  ARRAY['sos', 'emergencia', 'respuesta', 'protocolo', 'critico'],
  'es',
  'published'
);

-- 1.3 Fall Detection Alert Protocol (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'fall-detection-alert-protocol-en',
  'Fall Detection Alert Protocol',
  'emergency',
  '## Fall Detection Alert Protocol

**Priority Level: CRITICAL** | **Alert Type: Automatic**

### Overview
The EV-07B pendant includes automatic fall detection. When a fall is detected, the device automatically triggers an alert. Members have 30 seconds to cancel before the alert is sent to our call centre.

### Understanding Fall Alerts

**How Fall Detection Works:**
- Accelerometer detects sudden movement followed by impact
- 30-second countdown on device allows member to cancel
- If not cancelled, alert transmits automatically
- Alert includes GPS location at time of fall

**Common False Triggers:**
- Dropping the pendant
- Sudden sitting movements
- Placing pendant on hard surface
- Vigorous activities

### Response Protocol

1. **Acknowledge Alert Immediately**
   - Fall alerts are time-sensitive
   - Member may be injured and unable to respond

2. **Contact Member**
   - "Hello, this is [Name] from ICE Alarm. Your pendant detected a possible fall. Are you okay?"
   - Listen carefully for signs of distress

3. **Assessment Questions**
   - "Did you fall?"
   - "Are you injured?"
   - "Do you need medical assistance?"
   - "Can you stand up safely?"

4. **If Fall Confirmed - Member Injured**
   - Call 112 immediately
   - Stay on the line with member
   - Contact emergency contacts
   - Guide member to stay still if spinal injury possible

5. **If Fall Confirmed - Member Okay**
   - Offer to contact family member
   - Recommend medical checkup
   - Document incident fully
   - Schedule courtesy follow-up call

6. **If False Alarm**
   - Explain how to cancel alerts (hold cancel button)
   - Review sensitivity settings if frequent false alarms
   - Document as false detection
   - Consider sensitivity adjustment

### Special Considerations

**Elderly Members:**
- Falls can cause delayed symptoms
- Encourage medical evaluation even if feeling okay
- Watch for confusion or disorientation

**Members Who Live Alone:**
- Extra attention to non-response
- Lower threshold for emergency services
- More frequent courtesy calls recommended

### Documentation

Record for every fall alert:
- Type: Confirmed fall / False alarm / Unable to determine
- Injuries reported
- Actions taken
- Follow-up scheduled',
  ARRAY['staff', 'ai'],
  10,
  ARRAY['fall', 'detection', 'response', 'automatic', 'emergency'],
  'en',
  'published'
);

-- 1.4 Fall Detection Alert Protocol (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'fall-detection-alert-protocol-es',
  'Protocolo de Alerta por Detección de Caídas',
  'emergency',
  '## Protocolo de Alerta por Detección de Caídas

**Nivel de Prioridad: CRÍTICO** | **Tipo de Alerta: Automática**

### Descripción General
El colgante EV-07B incluye detección automática de caídas. Cuando se detecta una caída, el dispositivo activa automáticamente una alerta. Los miembros tienen 30 segundos para cancelar antes de que la alerta sea enviada a nuestro centro de llamadas.

### Entendiendo las Alertas de Caída

**Cómo Funciona la Detección de Caídas:**
- El acelerómetro detecta movimiento brusco seguido de impacto
- Cuenta regresiva de 30 segundos permite al miembro cancelar
- Si no se cancela, la alerta se transmite automáticamente
- La alerta incluye ubicación GPS en el momento de la caída

**Falsos Disparadores Comunes:**
- Dejar caer el colgante
- Movimientos bruscos al sentarse
- Colocar el colgante en superficie dura
- Actividades vigorosas

### Protocolo de Respuesta

1. **Confirmar Alerta Inmediatamente**
   - Las alertas de caída son urgentes
   - El miembro puede estar herido e incapaz de responder

2. **Contactar al Miembro**
   - "Hola, soy [Nombre] de ICE Alarm. Su colgante detectó una posible caída. ¿Está usted bien?"
   - Escuche atentamente señales de angustia

3. **Preguntas de Evaluación**
   - "¿Se ha caído?"
   - "¿Está herido/a?"
   - "¿Necesita asistencia médica?"
   - "¿Puede levantarse de forma segura?"

4. **Si Caída Confirmada - Miembro Herido**
   - Llame al 112 inmediatamente
   - Permanezca en línea con el miembro
   - Contacte a los contactos de emergencia
   - Indique al miembro que no se mueva si hay posible lesión espinal

5. **Si Caída Confirmada - Miembro Bien**
   - Ofrezca contactar a un familiar
   - Recomiende revisión médica
   - Documente el incidente completamente
   - Programe llamada de seguimiento

6. **Si Falsa Alarma**
   - Explique cómo cancelar alertas (mantener botón cancelar)
   - Revise ajustes de sensibilidad si hay falsas alarmas frecuentes
   - Documente como falsa detección
   - Considere ajuste de sensibilidad

### Consideraciones Especiales

**Miembros Mayores:**
- Las caídas pueden causar síntomas retrasados
- Anime a evaluación médica aunque se sienta bien
- Observe confusión o desorientación

**Miembros que Viven Solos:**
- Atención extra a falta de respuesta
- Umbral más bajo para servicios de emergencia
- Se recomiendan llamadas de cortesía más frecuentes

### Documentación

Registrar para cada alerta de caída:
- Tipo: Caída confirmada / Falsa alarma / No determinado
- Lesiones reportadas
- Acciones tomadas
- Seguimiento programado',
  ARRAY['staff', 'ai'],
  10,
  ARRAY['caida', 'deteccion', 'respuesta', 'automatica', 'emergencia'],
  'es',
  'published'
);

-- 1.5 Device Offline Alert Procedure (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'device-offline-alert-procedure-en',
  'Device Offline Alert Procedure',
  'emergency',
  '## Device Offline Alert Procedure

**Priority Level: HIGH** | **Response Time: < 2 hours**

### Overview
When an EV-07B pendant goes offline (no check-in for 4+ hours), the system generates an offline alert. This may indicate technical issues or potential member safety concerns.

### Common Causes of Offline Status

**Technical Issues:**
- Battery depleted
- Poor cellular coverage
- Device malfunction
- SIM card issue

**Member-Related:**
- Pendant not being worn
- Pendant left at home while travelling
- Charging but forgot to wear after
- Device damaged

### Response Protocol

1. **Check Device History**
   - Last known location
   - Last battery level reported
   - Recent alert history
   - Normal usage patterns

2. **Attempt Contact**
   - Call member''s mobile/home phone
   - Send SMS if available
   - Try at different times if no answer

3. **Contact Assessment**

   **If Member Answers:**
   - Verify they are safe
   - Troubleshoot device issue
   - Check if pendant is charging
   - Remind of importance of wearing device
   - Document resolution

   **If No Response After 3 Attempts:**
   - Contact emergency contact #1
   - Explain situation and ask them to check
   - Request callback with status update

4. **Escalation Path**
   - After 6 hours offline with no contact: Notify supervisor
   - After 12 hours: Consider welfare check request
   - Document all attempts in member file

### Troubleshooting Guide

**Battery Issues:**
- Confirm charging cable connected properly
- Check charging light (red = charging, green = full)
- Full charge takes approximately 2 hours
- Recommend nightly charging routine

**Coverage Issues:**
- Ask member to go near window
- Check if area has known coverage gaps
- May need to update APN settings

**Device Not Connecting:**
- Request member restart device (hold power 10 seconds)
- If still offline, may need replacement

### Documentation

Record for each offline alert:
- Duration offline
- Cause identified
- Resolution steps taken
- Member contacted (Y/N)
- Device status at close',
  ARRAY['staff', 'ai'],
  9,
  ARRAY['offline', 'device', 'troubleshooting', 'battery', 'connectivity'],
  'en',
  'published'
);

-- 1.6 Device Offline Alert Procedure (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'device-offline-alert-procedure-es',
  'Procedimiento de Alerta por Dispositivo Desconectado',
  'emergency',
  '## Procedimiento de Alerta por Dispositivo Desconectado

**Nivel de Prioridad: ALTO** | **Tiempo de Respuesta: < 2 horas**

### Descripción General
Cuando un colgante EV-07B se desconecta (sin registro por 4+ horas), el sistema genera una alerta de desconexión. Esto puede indicar problemas técnicos o posibles preocupaciones de seguridad del miembro.

### Causas Comunes de Estado Desconectado

**Problemas Técnicos:**
- Batería agotada
- Mala cobertura celular
- Mal funcionamiento del dispositivo
- Problema con tarjeta SIM

**Relacionados con el Miembro:**
- Colgante no está siendo usado
- Colgante dejado en casa mientras viaja
- Cargando pero olvidó ponérselo después
- Dispositivo dañado

### Protocolo de Respuesta

1. **Revisar Historial del Dispositivo**
   - Última ubicación conocida
   - Último nivel de batería reportado
   - Historial reciente de alertas
   - Patrones de uso normal

2. **Intentar Contacto**
   - Llamar al móvil/teléfono fijo del miembro
   - Enviar SMS si está disponible
   - Intentar en diferentes horarios si no responde

3. **Evaluación de Contacto**

   **Si el Miembro Responde:**
   - Verificar que está seguro
   - Solucionar problema del dispositivo
   - Comprobar si el colgante está cargando
   - Recordar importancia de usar el dispositivo
   - Documentar resolución

   **Si No Hay Respuesta Después de 3 Intentos:**
   - Contactar contacto de emergencia #1
   - Explicar situación y pedir que verifiquen
   - Solicitar llamada de retorno con actualización

4. **Ruta de Escalación**
   - Después de 6 horas desconectado sin contacto: Notificar supervisor
   - Después de 12 horas: Considerar solicitud de verificación de bienestar
   - Documentar todos los intentos en expediente del miembro

### Guía de Solución de Problemas

**Problemas de Batería:**
- Confirmar cable de carga conectado correctamente
- Verificar luz de carga (rojo = cargando, verde = completo)
- Carga completa toma aproximadamente 2 horas
- Recomendar rutina de carga nocturna

**Problemas de Cobertura:**
- Pedir al miembro que se acerque a la ventana
- Verificar si el área tiene brechas de cobertura conocidas
- Puede ser necesario actualizar configuración APN

**Dispositivo No Conecta:**
- Solicitar al miembro reiniciar dispositivo (mantener encendido 10 segundos)
- Si sigue desconectado, puede necesitar reemplazo

### Documentación

Registrar para cada alerta de desconexión:
- Duración desconectado
- Causa identificada
- Pasos de resolución tomados
- Miembro contactado (S/N)
- Estado del dispositivo al cierre',
  ARRAY['staff', 'ai'],
  9,
  ARRAY['desconectado', 'dispositivo', 'solucion', 'bateria', 'conectividad'],
  'es',
  'published'
);

-- 1.7 Emergency Escalation Guidelines (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'emergency-escalation-guidelines-en',
  'Emergency Escalation Guidelines',
  'emergency',
  '## Emergency Escalation Guidelines

**Purpose:** Define when and how to escalate emergency situations to supervisors, emergency services, and management.

### Escalation Levels

#### Level 1: Supervisor Notification (Immediate)

**Trigger Conditions:**
- Member reports abuse, violence, or threats
- Multiple SOS alerts from same member within 24 hours
- Member mentions self-harm or suicidal thoughts
- Staff member unsure how to proceed
- Technical failure affecting emergency response
- Dispute or complaint from member/family

**Action:**
- Continue assisting member
- Send immediate message to on-duty supervisor
- Document reason for escalation
- Supervisor will join or take over as needed

#### Level 2: Emergency Services - 112

**Always Call 112 When:**
- Member confirms medical emergency
- Member reports crime in progress
- Member is unresponsive after confirmed SOS
- Fire or gas leak reported
- Member trapped or in danger
- Any life-threatening situation

**Information to Provide to 112:**
1. Your name and "ICE Alarm monitoring centre"
2. Member''s full name and date of birth
3. Complete address with any access notes
4. GPS coordinates if outdoors
5. Medical conditions from member profile
6. Nature of emergency
7. Current status of member (responsive/unresponsive)

**After Calling 112:**
- Document call reference number
- Stay on line with member if possible
- Call emergency contacts
- Update alert with all actions
- Notify supervisor

#### Level 3: Management Escalation

**Contact Operations Manager When:**
- Death of a member
- Serious injury resulting from our service failure
- Media inquiry or potential PR issue
- Legal threat or police investigation
- Major system outage affecting multiple members
- Complaint from emergency services

### Emergency Contact Hierarchy

1. **On-Duty Supervisor** - First point of escalation
2. **Operations Manager** - Serious incidents, business hours
3. **On-Call Manager** - After hours emergencies
4. **Director** - Critical incidents only

### Documentation Requirements

All escalations must include:
- Date and time of escalation
- Reason for escalation
- Person escalated to
- Actions taken
- Outcome and resolution

### De-escalation

After emergency resolved:
- Follow up with member within 24 hours
- Review incident for learnings
- Update protocols if needed',
  ARRAY['staff', 'ai'],
  10,
  ARRAY['escalation', 'supervisor', '112', 'emergency', 'management'],
  'en',
  'published'
);

-- 1.8 Emergency Escalation Guidelines (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'emergency-escalation-guidelines-es',
  'Directrices de Escalación de Emergencias',
  'emergency',
  '## Directrices de Escalación de Emergencias

**Propósito:** Definir cuándo y cómo escalar situaciones de emergencia a supervisores, servicios de emergencia y dirección.

### Niveles de Escalación

#### Nivel 1: Notificación al Supervisor (Inmediata)

**Condiciones de Activación:**
- Miembro reporta abuso, violencia o amenazas
- Múltiples alertas SOS del mismo miembro en 24 horas
- Miembro menciona autolesión o pensamientos suicidas
- Personal no está seguro de cómo proceder
- Fallo técnico que afecta respuesta de emergencia
- Disputa o queja del miembro/familia

**Acción:**
- Continuar asistiendo al miembro
- Enviar mensaje inmediato al supervisor de turno
- Documentar razón de la escalación
- El supervisor se unirá o tomará el control según sea necesario

#### Nivel 2: Servicios de Emergencia - 112

**Siempre Llamar al 112 Cuando:**
- Miembro confirma emergencia médica
- Miembro reporta crimen en progreso
- Miembro no responde después de SOS confirmado
- Se reporta incendio o fuga de gas
- Miembro atrapado o en peligro
- Cualquier situación que amenace la vida

**Información a Proporcionar al 112:**
1. Su nombre y "centro de monitoreo ICE Alarm"
2. Nombre completo y fecha de nacimiento del miembro
3. Dirección completa con notas de acceso
4. Coordenadas GPS si está en exterior
5. Condiciones médicas del perfil del miembro
6. Naturaleza de la emergencia
7. Estado actual del miembro (responde/no responde)

**Después de Llamar al 112:**
- Documentar número de referencia de llamada
- Permanecer en línea con el miembro si es posible
- Llamar a contactos de emergencia
- Actualizar alerta con todas las acciones
- Notificar al supervisor

#### Nivel 3: Escalación a Dirección

**Contactar al Gerente de Operaciones Cuando:**
- Fallecimiento de un miembro
- Lesión grave resultante de fallo de nuestro servicio
- Consulta de medios o potencial problema de imagen
- Amenaza legal o investigación policial
- Interrupción importante del sistema que afecta múltiples miembros
- Queja de servicios de emergencia

### Jerarquía de Contacto de Emergencia

1. **Supervisor de Turno** - Primer punto de escalación
2. **Gerente de Operaciones** - Incidentes graves, horario laboral
3. **Gerente de Guardia** - Emergencias fuera de horario
4. **Director** - Solo incidentes críticos

### Requisitos de Documentación

Todas las escalaciones deben incluir:
- Fecha y hora de escalación
- Razón de la escalación
- Persona a quien se escaló
- Acciones tomadas
- Resultado y resolución

### Des-escalación

Después de resolver emergencia:
- Seguimiento con el miembro dentro de 24 horas
- Revisar incidente para aprendizajes
- Actualizar protocolos si es necesario',
  ARRAY['staff', 'ai'],
  10,
  ARRAY['escalacion', 'supervisor', '112', 'emergencia', 'direccion'],
  'es',
  'published'
);

-- 1.9 Member Non-Response Protocol (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'member-non-response-protocol-en',
  'Member Non-Response Protocol',
  'emergency',
  '## Member Non-Response Protocol

**Priority Level: HIGH** | **Time-Sensitive Procedure**

### Overview
When a member triggers an alert (SOS or fall detection) but does not respond to our calls, immediate action is required. Non-response may indicate the member is incapacitated, injured, or in danger.

### Non-Response Definition
- No answer after 3 call attempts over 5 minutes
- Answer but no voice/communication
- Unusual sounds (distress, struggle)
- Call connects then disconnects repeatedly

### Response Protocol

#### Phase 1: Initial Contact (0-5 minutes)

1. **First Call Attempt**
   - Call member''s pendant directly
   - Let it ring for 30 seconds
   - Leave clear voicemail if available

2. **Second Call Attempt (2 minutes later)**
   - Try again with pendant
   - Listen for any background sounds

3. **Third Call Attempt**
   - If member has secondary phone, try that
   - Document all attempt times

#### Phase 2: Emergency Contact (5-10 minutes)

4. **Call Emergency Contact #1**
   - Explain situation clearly
   - Ask if they know member''s whereabouts
   - Request they try to reach member
   - Ask them to call back within 10 minutes

5. **Call Emergency Contact #2** (if #1 unavailable)
   - Same process as above

6. **Continue Trying Member**
   - One more attempt while waiting for callback

#### Phase 3: Emergency Services (10+ minutes)

7. **If No Contact Established by 10 Minutes:**
   - **Call 112**
   - Request welfare check at member''s address
   - Provide all member information
   - Explain monitoring service and alert type
   - Stay on line for questions

8. **Notify Supervisor**
   - Log escalation
   - Supervisor may take over case

9. **Document Everything**
   - Exact times of all attempts
   - 112 reference number
   - Emergency contact responses
   - GPS location if available

### Special Circumstances

**Member Known to Have Episodes:**
- Check notes for relevant history
- May have different threshold
- Still follow protocol - safety first

**Night Time Alerts (10 PM - 7 AM):**
- Member may be sleeping
- Consider alert type carefully
- SOS = full protocol immediately
- Device offline = can wait until morning

**Member Recently Discharged from Hospital:**
- Higher concern level
- Lower threshold for 112
- Consider calling medical contact

### Resolution

Once member is located safe:
- Document final status
- Thank emergency contacts
- Cancel 112 if still en route
- Schedule follow-up call
- Review with supervisor if 112 was called',
  ARRAY['staff', 'ai'],
  9,
  ARRAY['non-response', 'safety-check', 'welfare', 'emergency', 'protocol'],
  'en',
  'published'
);

-- 1.10 Member Non-Response Protocol (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'member-non-response-protocol-es',
  'Protocolo de No Respuesta del Miembro',
  'emergency',
  '## Protocolo de No Respuesta del Miembro

**Nivel de Prioridad: ALTO** | **Procedimiento Urgente**

### Descripción General
Cuando un miembro activa una alerta (SOS o detección de caída) pero no responde a nuestras llamadas, se requiere acción inmediata. La falta de respuesta puede indicar que el miembro está incapacitado, herido o en peligro.

### Definición de No Respuesta
- Sin respuesta después de 3 intentos de llamada en 5 minutos
- Responde pero sin voz/comunicación
- Sonidos inusuales (angustia, forcejeo)
- La llamada conecta y desconecta repetidamente

### Protocolo de Respuesta

#### Fase 1: Contacto Inicial (0-5 minutos)

1. **Primer Intento de Llamada**
   - Llamar directamente al colgante del miembro
   - Dejar sonar 30 segundos
   - Dejar mensaje de voz claro si está disponible

2. **Segundo Intento de Llamada (2 minutos después)**
   - Intentar de nuevo con el colgante
   - Escuchar cualquier sonido de fondo

3. **Tercer Intento de Llamada**
   - Si el miembro tiene teléfono secundario, intentar ese
   - Documentar todos los tiempos de intento

#### Fase 2: Contacto de Emergencia (5-10 minutos)

4. **Llamar al Contacto de Emergencia #1**
   - Explicar la situación claramente
   - Preguntar si saben dónde está el miembro
   - Solicitar que intenten contactar al miembro
   - Pedir que llamen de vuelta en 10 minutos

5. **Llamar al Contacto de Emergencia #2** (si #1 no disponible)
   - Mismo proceso que arriba

6. **Continuar Intentando con el Miembro**
   - Un intento más mientras espera callback

#### Fase 3: Servicios de Emergencia (10+ minutos)

7. **Si No Se Establece Contacto en 10 Minutos:**
   - **Llamar al 112**
   - Solicitar verificación de bienestar en la dirección del miembro
   - Proporcionar toda la información del miembro
   - Explicar servicio de monitoreo y tipo de alerta
   - Permanecer en línea para preguntas

8. **Notificar al Supervisor**
   - Registrar escalación
   - El supervisor puede tomar el caso

9. **Documentar Todo**
   - Tiempos exactos de todos los intentos
   - Número de referencia del 112
   - Respuestas de contactos de emergencia
   - Ubicación GPS si está disponible

### Circunstancias Especiales

**Miembro Conocido por Tener Episodios:**
- Revisar notas para historial relevante
- Puede tener umbral diferente
- Aún seguir protocolo - seguridad primero

**Alertas Nocturnas (22:00 - 07:00):**
- El miembro puede estar durmiendo
- Considerar tipo de alerta cuidadosamente
- SOS = protocolo completo inmediatamente
- Dispositivo desconectado = puede esperar hasta la mañana

**Miembro Recién Dado de Alta del Hospital:**
- Mayor nivel de preocupación
- Umbral más bajo para llamar al 112
- Considerar llamar al contacto médico

### Resolución

Una vez que el miembro está localizado y seguro:
- Documentar estado final
- Agradecer a contactos de emergencia
- Cancelar 112 si aún están en camino
- Programar llamada de seguimiento
- Revisar con supervisor si se llamó al 112',
  ARRAY['staff', 'ai'],
  9,
  ARRAY['no-respuesta', 'verificacion-seguridad', 'bienestar', 'emergencia', 'protocolo'],
  'es',
  'published'
);

-- ============================================
-- CATEGORY 2: DEVICE GUIDES (10 docs)
-- ============================================

-- 2.1 EV-07B Pendant Complete Guide (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'ev07b-pendant-complete-guide-en',
  'EV-07B Pendant Complete Guide',
  'device',
  '## EV-07B Pendant Complete Guide

### Overview
The EV-07B is a medical alert pendant designed for elderly users and those needing emergency assistance. It provides 24/7 connection to the ICE Alarm monitoring centre.

### Device Specifications

| Feature | Specification |
|---------|--------------|
| Weight | 36 grams |
| Dimensions | 51 x 41 x 15 mm |
| Water Resistance | IP67 (waterproof) |
| Battery Life | Up to 5 days standby |
| Connectivity | 4G LTE |
| GPS | Built-in with A-GPS |
| Fall Detection | Automatic with 30s cancel |

### Key Features

**SOS Button**
- Large red button on front
- Press and hold 3 seconds to trigger emergency
- Two-way voice communication
- GPS location transmitted automatically

**Fall Detection**
- Automatic detection of falls
- 30-second countdown to cancel false alarms
- Can be adjusted or disabled if needed

**GPS Location**
- Real-time tracking when alert triggered
- Location history available
- Works indoors and outdoors

### Physical Design

- **Wear Options**: Neck lanyard or wrist strap
- **SOS Button**: Large, easy to press
- **Speaker/Microphone**: Built-in for two-way calls
- **Charging Port**: Magnetic USB on back
- **LED Indicators**: Show battery and connection status

### LED Status Indicators

| LED Pattern | Meaning |
|-------------|---------|
| Green steady | Fully charged |
| Red steady | Charging |
| Blue flashing | Connected to network |
| Red flashing | Low battery |
| No light | Device off or dead battery |

### Getting Started

1. **Charge fully** before first use (2 hours)
2. **Turn on** by pressing side button for 3 seconds
3. **Wait for blue light** indicating network connection
4. **Perform test alert** with monitoring centre

### Daily Use

- Wear pendant at all times, including in shower
- Charge nightly while sleeping
- Keep within cellular coverage
- Press SOS button in any emergency

### What Happens When You Press SOS

1. Device beeps and vibrates
2. GPS location captured
3. Call connects to monitoring centre
4. Operator speaks through pendant
5. Emergency contacts notified if needed

### Care Instructions

- Wipe with damp cloth to clean
- Do not use chemicals or soap
- Avoid extreme temperatures
- Charge before battery fully depletes',
  ARRAY['staff', 'ai', 'member'],
  9,
  ARRAY['ev07b', 'pendant', 'setup', 'guide', 'device'],
  'en',
  'published'
);

-- 2.2 EV-07B Pendant Complete Guide (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'ev07b-pendant-complete-guide-es',
  'Guía Completa del Colgante EV-07B',
  'device',
  '## Guía Completa del Colgante EV-07B

### Descripción General
El EV-07B es un colgante de alerta médica diseñado para usuarios mayores y aquellos que necesitan asistencia de emergencia. Proporciona conexión 24/7 al centro de monitoreo de ICE Alarm.

### Especificaciones del Dispositivo

| Característica | Especificación |
|----------------|----------------|
| Peso | 36 gramos |
| Dimensiones | 51 x 41 x 15 mm |
| Resistencia al Agua | IP67 (sumergible) |
| Duración de Batería | Hasta 5 días en espera |
| Conectividad | 4G LTE |
| GPS | Integrado con A-GPS |
| Detección de Caídas | Automática con 30s para cancelar |

### Características Principales

**Botón SOS**
- Botón rojo grande en el frente
- Mantener presionado 3 segundos para activar emergencia
- Comunicación de voz bidireccional
- Ubicación GPS transmitida automáticamente

**Detección de Caídas**
- Detección automática de caídas
- Cuenta regresiva de 30 segundos para cancelar falsas alarmas
- Se puede ajustar o desactivar si es necesario

**Ubicación GPS**
- Seguimiento en tiempo real cuando se activa alerta
- Historial de ubicación disponible
- Funciona en interiores y exteriores

### Diseño Físico

- **Opciones de Uso**: Cordón para cuello o correa de muñeca
- **Botón SOS**: Grande, fácil de presionar
- **Altavoz/Micrófono**: Integrado para llamadas bidireccionales
- **Puerto de Carga**: USB magnético en la parte trasera
- **Indicadores LED**: Muestran estado de batería y conexión

### Indicadores LED de Estado

| Patrón LED | Significado |
|------------|-------------|
| Verde fijo | Completamente cargado |
| Rojo fijo | Cargando |
| Azul parpadeante | Conectado a la red |
| Rojo parpadeante | Batería baja |
| Sin luz | Dispositivo apagado o batería agotada |

### Primeros Pasos

1. **Cargar completamente** antes del primer uso (2 horas)
2. **Encender** presionando el botón lateral por 3 segundos
3. **Esperar la luz azul** indicando conexión a la red
4. **Realizar alerta de prueba** con el centro de monitoreo

### Uso Diario

- Usar el colgante en todo momento, incluso en la ducha
- Cargar por la noche mientras duerme
- Mantener dentro de cobertura celular
- Presionar botón SOS en cualquier emergencia

### Qué Sucede Cuando Presiona SOS

1. El dispositivo emite pitido y vibra
2. Se captura ubicación GPS
3. La llamada se conecta al centro de monitoreo
4. El operador habla a través del colgante
5. Se notifica a contactos de emergencia si es necesario

### Instrucciones de Cuidado

- Limpiar con paño húmedo
- No usar químicos ni jabón
- Evitar temperaturas extremas
- Cargar antes de que la batería se agote completamente',
  ARRAY['staff', 'ai', 'member'],
  9,
  ARRAY['ev07b', 'colgante', 'configuracion', 'guia', 'dispositivo'],
  'es',
  'published'
);

-- 2.3 Pendant Charging & Battery Care (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'pendant-charging-battery-care-en',
  'Pendant Charging & Battery Care',
  'device',
  '## Pendant Charging & Battery Care

### Battery Overview

The EV-07B pendant uses a built-in rechargeable lithium-ion battery designed for reliable, long-lasting performance.

**Battery Specifications:**
- Capacity: 700mAh
- Standby time: Up to 5 days
- Charging time: Approximately 2 hours
- Charging method: Magnetic USB cable

### Charging Your Pendant

**Step-by-Step:**

1. **Locate the charging port** on the back of the pendant
2. **Attach magnetic cable** - it will snap into place
3. **Connect to USB power source** (wall adapter or computer)
4. **Red LED** indicates charging in progress
5. **Green LED** indicates fully charged

**Recommended Charging Routine:**
- Charge every night while sleeping
- Remove in the morning when waking
- Keep cable near bedside for convenience

### LED Battery Indicators

| Indicator | Meaning | Action |
|-----------|---------|--------|
| Green steady | Fully charged | Ready to use |
| Red steady | Charging | Leave connected |
| Red flashing | Low battery (<20%) | Charge soon |
| Rapid red flash | Critical (<5%) | Charge immediately |

### Battery Conservation Tips

**To Extend Battery Life:**
- Keep pendant charged above 20%
- Avoid complete discharge when possible
- Store in moderate temperature
- Turn off when not in use for extended periods

**What Drains Battery Faster:**
- Frequent SOS tests
- Poor cellular signal (pendant works harder)
- Extreme temperatures
- Continuous GPS tracking

### Troubleshooting Charging Issues

**Pendant Won''t Charge:**
- Clean charging contacts with dry cloth
- Ensure magnetic connection is secure
- Try different USB port or adapter
- Check cable for damage

**Charging Very Slowly:**
- Use wall adapter instead of computer USB
- Ensure adequate power source (5V/1A minimum)
- Check for debris in charging port

**Battery Drains Quickly:**
- Check cellular signal strength
- Reduce test frequency
- Contact support for battery assessment

### Battery Replacement

The battery is not user-replaceable. If battery performance degrades significantly (less than 2 days standby), contact ICE Alarm for device replacement.

### Safety Warnings

- Use only provided charging cable
- Do not expose to water while charging
- Do not charge near flammable materials
- Stop using if battery swells or leaks',
  ARRAY['staff', 'ai', 'member'],
  8,
  ARRAY['battery', 'charging', 'maintenance', 'power', 'care'],
  'en',
  'published'
);

-- 2.4 Pendant Charging & Battery Care (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'pendant-charging-battery-care-es',
  'Carga y Cuidado de la Batería del Colgante',
  'device',
  '## Carga y Cuidado de la Batería del Colgante

### Descripción de la Batería

El colgante EV-07B utiliza una batería de iones de litio recargable integrada, diseñada para un rendimiento fiable y duradero.

**Especificaciones de la Batería:**
- Capacidad: 700mAh
- Tiempo en espera: Hasta 5 días
- Tiempo de carga: Aproximadamente 2 horas
- Método de carga: Cable USB magnético

### Cargando Su Colgante

**Paso a Paso:**

1. **Localice el puerto de carga** en la parte trasera del colgante
2. **Conecte el cable magnético** - se ajustará en su lugar
3. **Conecte a fuente de alimentación USB** (adaptador de pared o computadora)
4. **LED rojo** indica carga en progreso
5. **LED verde** indica carga completa

**Rutina de Carga Recomendada:**
- Cargar cada noche mientras duerme
- Quitar por la mañana al despertar
- Mantener cable cerca de la mesita de noche para conveniencia

### Indicadores LED de Batería

| Indicador | Significado | Acción |
|-----------|-------------|--------|
| Verde fijo | Completamente cargado | Listo para usar |
| Rojo fijo | Cargando | Dejar conectado |
| Rojo parpadeante | Batería baja (<20%) | Cargar pronto |
| Rojo parpadeo rápido | Crítico (<5%) | Cargar inmediatamente |

### Consejos para Conservar la Batería

**Para Extender la Vida de la Batería:**
- Mantener el colgante cargado por encima del 20%
- Evitar descarga completa cuando sea posible
- Almacenar a temperatura moderada
- Apagar cuando no se use por períodos prolongados

**Qué Agota la Batería Más Rápido:**
- Pruebas SOS frecuentes
- Mala señal celular (el colgante trabaja más)
- Temperaturas extremas
- Seguimiento GPS continuo

### Solución de Problemas de Carga

**El Colgante No Carga:**
- Limpiar contactos de carga con paño seco
- Asegurar que la conexión magnética esté firme
- Probar diferente puerto USB o adaptador
- Revisar el cable por daños

**Carga Muy Lenta:**
- Usar adaptador de pared en lugar de USB de computadora
- Asegurar fuente de alimentación adecuada (mínimo 5V/1A)
- Revisar si hay residuos en el puerto de carga

**La Batería Se Agota Rápidamente:**
- Verificar fuerza de señal celular
- Reducir frecuencia de pruebas
- Contactar soporte para evaluación de batería

### Reemplazo de Batería

La batería no es reemplazable por el usuario. Si el rendimiento de la batería se degrada significativamente (menos de 2 días en espera), contacte a ICE Alarm para reemplazo del dispositivo.

### Advertencias de Seguridad

- Use solo el cable de carga proporcionado
- No exponga al agua mientras carga
- No cargue cerca de materiales inflamables
- Deje de usar si la batería se hincha o gotea',
  ARRAY['staff', 'ai', 'member'],
  8,
  ARRAY['bateria', 'carga', 'mantenimiento', 'energia', 'cuidado'],
  'es',
  'published'
);

-- 2.5 Pendant Troubleshooting Guide (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'pendant-troubleshooting-guide-en',
  'Pendant Troubleshooting Guide',
  'device',
  '## Pendant Troubleshooting Guide

### Quick Diagnosis

Use this guide to resolve common issues with the EV-07B pendant.

### Issue: Pendant Won''t Turn On

**Symptoms:** No response when pressing power button, no LED lights

**Solutions:**
1. **Charge the device** for at least 30 minutes
2. **Check charging connection** - ensure magnetic contact is secure
3. **Try different power source** - use wall adapter
4. **Perform hard reset** - hold power button for 15 seconds
5. If still unresponsive, **contact support** for replacement

### Issue: No Network Connection

**Symptoms:** No blue light, alerts not transmitting

**Solutions:**
1. **Move to different location** - near window is best
2. **Check SIM status** - contact support to verify active
3. **Restart device** - hold power 10 seconds, turn back on
4. **Wait 5 minutes** - network registration can take time
5. Check for **network outages** in your area

### Issue: Poor Voice Quality

**Symptoms:** Can''t hear or be heard during calls

**Solutions:**
1. **Clean speaker and microphone** openings gently
2. **Ensure pendant worn correctly** - speaker facing outward
3. **Check for obstructions** - clothing covering device
4. **Move to better reception area**
5. **Speak clearly and directly** toward pendant

### Issue: Fall Detection Too Sensitive

**Symptoms:** Frequent false alarms

**Solutions:**
1. **Ensure proper wearing** - close to body
2. **Avoid sudden movements** when possible
3. **Contact support** to adjust sensitivity settings
4. Consider **disabling fall detection** if not needed

### Issue: Fall Detection Not Working

**Symptoms:** Falls not detected

**Solutions:**
1. **Confirm feature is enabled** - contact support
2. **Ensure pendant worn correctly** - not in pocket
3. **Sensitivity may need adjustment**
4. Test with controlled movement

### Issue: GPS Location Inaccurate

**Symptoms:** Wrong location shown

**Solutions:**
1. **Move outdoors** for best GPS signal
2. **Wait 2-3 minutes** for GPS to acquire satellites
3. **Ensure sky is visible** - GPS works poorly indoors
4. Indoor locations use **cell tower approximation**

### Issue: Battery Drains Quickly

**Symptoms:** Less than 2 days between charges

**Solutions:**
1. **Check signal strength** - weak signal drains battery
2. **Reduce test frequency** - once monthly is sufficient
3. **Avoid extreme temperatures**
4. Battery may need replacement - **contact support**

### Issue: Button Hard to Press

**Symptoms:** Difficulty activating SOS

**Solutions:**
1. **Press firmly for 3 full seconds**
2. **Check for debris** around button
3. **Clean button area** with dry cloth
4. If physically damaged, **request replacement**

### When to Contact Support

- Device physically damaged
- Multiple issues persist after troubleshooting
- Battery performance severely degraded
- Network issues lasting more than 24 hours
- Any safety concerns with device

### Support Contact
Call centre available 24/7 for technical support.',
  ARRAY['staff', 'ai', 'member'],
  8,
  ARRAY['troubleshooting', 'issues', 'support', 'problems', 'fix'],
  'en',
  'published'
);

-- 2.6 Pendant Troubleshooting Guide (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'pendant-troubleshooting-guide-es',
  'Guía de Solución de Problemas del Colgante',
  'device',
  '## Guía de Solución de Problemas del Colgante

### Diagnóstico Rápido

Use esta guía para resolver problemas comunes con el colgante EV-07B.

### Problema: El Colgante No Enciende

**Síntomas:** Sin respuesta al presionar el botón de encendido, sin luces LED

**Soluciones:**
1. **Cargue el dispositivo** por al menos 30 minutos
2. **Verifique la conexión de carga** - asegure que el contacto magnético esté firme
3. **Pruebe diferente fuente de energía** - use adaptador de pared
4. **Realice reinicio forzado** - mantenga el botón de encendido 15 segundos
5. Si sigue sin responder, **contacte soporte** para reemplazo

### Problema: Sin Conexión de Red

**Síntomas:** Sin luz azul, alertas no se transmiten

**Soluciones:**
1. **Muévase a diferente ubicación** - cerca de ventana es mejor
2. **Verifique estado de SIM** - contacte soporte para confirmar activa
3. **Reinicie el dispositivo** - mantenga encendido 10 segundos, vuelva a encender
4. **Espere 5 minutos** - el registro de red puede tomar tiempo
5. Verifique **interrupciones de red** en su área

### Problema: Mala Calidad de Voz

**Síntomas:** No puede escuchar o ser escuchado durante llamadas

**Soluciones:**
1. **Limpie las aberturas del altavoz y micrófono** suavemente
2. **Asegure que el colgante se use correctamente** - altavoz hacia afuera
3. **Verifique obstrucciones** - ropa cubriendo el dispositivo
4. **Muévase a área con mejor recepción**
5. **Hable clara y directamente** hacia el colgante

### Problema: Detección de Caídas Muy Sensible

**Síntomas:** Falsas alarmas frecuentes

**Soluciones:**
1. **Asegure uso correcto** - cerca del cuerpo
2. **Evite movimientos bruscos** cuando sea posible
3. **Contacte soporte** para ajustar configuración de sensibilidad
4. Considere **desactivar detección de caídas** si no es necesaria

### Problema: Detección de Caídas No Funciona

**Síntomas:** Caídas no detectadas

**Soluciones:**
1. **Confirme que la función esté habilitada** - contacte soporte
2. **Asegure que el colgante se use correctamente** - no en bolsillo
3. **La sensibilidad puede necesitar ajuste**
4. Pruebe con movimiento controlado

### Problema: Ubicación GPS Incorrecta

**Síntomas:** Se muestra ubicación equivocada

**Soluciones:**
1. **Salga al exterior** para mejor señal GPS
2. **Espere 2-3 minutos** para que el GPS adquiera satélites
3. **Asegure que el cielo sea visible** - GPS funciona mal en interiores
4. Ubicaciones interiores usan **aproximación de torre celular**

### Problema: La Batería Se Agota Rápido

**Síntomas:** Menos de 2 días entre cargas

**Soluciones:**
1. **Verifique fuerza de señal** - señal débil agota batería
2. **Reduzca frecuencia de pruebas** - una vez al mes es suficiente
3. **Evite temperaturas extremas**
4. La batería puede necesitar reemplazo - **contacte soporte**

### Problema: Botón Difícil de Presionar

**Síntomas:** Dificultad para activar SOS

**Soluciones:**
1. **Presione firmemente por 3 segundos completos**
2. **Busque residuos** alrededor del botón
3. **Limpie área del botón** con paño seco
4. Si está físicamente dañado, **solicite reemplazo**

### Cuándo Contactar Soporte

- Dispositivo físicamente dañado
- Múltiples problemas persisten después de solución
- Rendimiento de batería severamente degradado
- Problemas de red que duran más de 24 horas
- Cualquier preocupación de seguridad con el dispositivo

### Contacto de Soporte
Centro de llamadas disponible 24/7 para soporte técnico.',
  ARRAY['staff', 'ai', 'member'],
  8,
  ARRAY['solucion', 'problemas', 'soporte', 'arreglar', 'ayuda'],
  'es',
  'published'
);

-- 2.7 GPS & Location Features (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'gps-location-features-en',
  'GPS & Location Features',
  'device',
  '## GPS & Location Features

### Overview

The EV-07B pendant includes GPS technology to help locate members during emergencies. This guide explains how location tracking works and its limitations.

### How GPS Works

**When Location Is Captured:**
- Immediately when SOS button pressed
- Automatically during fall detection alert
- Periodically for device check-in (every 4 hours)

**Location Methods:**
1. **GPS Satellites** - Most accurate (3-10 meters)
2. **A-GPS** - Assisted GPS for faster lock
3. **Cell Tower Triangulation** - Fallback method (50-500 meters)
4. **Wi-Fi Positioning** - When available

### Location Accuracy

| Environment | Expected Accuracy |
|-------------|-------------------|
| Outdoors, clear sky | 3-10 meters |
| Urban area, buildings | 10-30 meters |
| Indoors near window | 20-50 meters |
| Deep indoors | Cell tower only (50-500m) |
| Underground/basement | May not work |

### Viewing Location

**During an Alert:**
- Map displayed on call centre screen
- Address automatically resolved
- Coordinates available for emergency services

**Location History:**
- Last known location stored
- Visible in member profile
- Updated at each check-in

### Limitations

**GPS Cannot:**
- Track continuously (battery limitation)
- Work reliably underground
- Provide floor/apartment number
- Guarantee exact position indoors

**Factors Affecting Accuracy:**
- Weather conditions
- Building materials (metal, concrete)
- Urban canyons (tall buildings)
- Time since last fix

### Member Privacy

**Important Privacy Points:**
- Location only captured during alerts
- Not continuous tracking
- Data protected under GDPR
- Only shared with emergency services when needed

### Tips for Better Location

**Advise Members:**
- Move toward window if indoors during emergency
- Wait a few seconds for GPS lock
- Outdoor locations always more accurate
- Keep pendant exposed (not under clothing/bag)

### For Staff

**When Location Seems Wrong:**
1. Check timestamp - may be outdated
2. Use last known address as reference
3. Ask emergency contacts for current location
4. Provide 112 with coordinates AND address
5. Note accuracy limitations in documentation',
  ARRAY['staff', 'ai', 'member'],
  7,
  ARRAY['gps', 'location', 'tracking', 'map', 'coordinates'],
  'en',
  'published'
);

-- 2.8 GPS & Location Features (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'gps-location-features-es',
  'GPS y Funciones de Ubicación',
  'device',
  '## GPS y Funciones de Ubicación

### Descripción General

El colgante EV-07B incluye tecnología GPS para ayudar a localizar miembros durante emergencias. Esta guía explica cómo funciona el seguimiento de ubicación y sus limitaciones.

### Cómo Funciona el GPS

**Cuándo Se Captura la Ubicación:**
- Inmediatamente cuando se presiona el botón SOS
- Automáticamente durante alerta de detección de caída
- Periódicamente para verificación del dispositivo (cada 4 horas)

**Métodos de Ubicación:**
1. **Satélites GPS** - Más preciso (3-10 metros)
2. **A-GPS** - GPS asistido para fijación más rápida
3. **Triangulación de Torre Celular** - Método alternativo (50-500 metros)
4. **Posicionamiento Wi-Fi** - Cuando está disponible

### Precisión de Ubicación

| Entorno | Precisión Esperada |
|---------|-------------------|
| Exterior, cielo despejado | 3-10 metros |
| Área urbana, edificios | 10-30 metros |
| Interior cerca de ventana | 20-50 metros |
| Interior profundo | Solo torre celular (50-500m) |
| Subterráneo/sótano | Puede no funcionar |

### Visualización de Ubicación

**Durante una Alerta:**
- Mapa mostrado en pantalla del centro de llamadas
- Dirección resuelta automáticamente
- Coordenadas disponibles para servicios de emergencia

**Historial de Ubicación:**
- Última ubicación conocida almacenada
- Visible en perfil del miembro
- Actualizado en cada verificación

### Limitaciones

**El GPS No Puede:**
- Rastrear continuamente (limitación de batería)
- Funcionar confiablemente bajo tierra
- Proporcionar número de piso/apartamento
- Garantizar posición exacta en interiores

**Factores que Afectan la Precisión:**
- Condiciones climáticas
- Materiales de construcción (metal, concreto)
- Cañones urbanos (edificios altos)
- Tiempo desde última fijación

### Privacidad del Miembro

**Puntos Importantes de Privacidad:**
- Ubicación solo capturada durante alertas
- No es seguimiento continuo
- Datos protegidos bajo RGPD
- Solo compartido con servicios de emergencia cuando es necesario

### Consejos para Mejor Ubicación

**Aconseje a los Miembros:**
- Moverse hacia la ventana si está en interior durante emergencia
- Esperar unos segundos para fijación GPS
- Ubicaciones exteriores siempre más precisas
- Mantener colgante expuesto (no bajo ropa/bolso)

### Para el Personal

**Cuando la Ubicación Parece Incorrecta:**
1. Verificar marca de tiempo - puede estar desactualizada
2. Usar última dirección conocida como referencia
3. Preguntar a contactos de emergencia por ubicación actual
4. Proporcionar al 112 coordenadas Y dirección
5. Notar limitaciones de precisión en documentación',
  ARRAY['staff', 'ai', 'member'],
  7,
  ARRAY['gps', 'ubicacion', 'seguimiento', 'mapa', 'coordenadas'],
  'es',
  'published'
);

-- 2.9 Fall Detection Settings (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'fall-detection-settings-en',
  'Fall Detection Settings',
  'device',
  '## Fall Detection Settings

### How Fall Detection Works

The EV-07B pendant uses an accelerometer to detect falls. When it senses a pattern consistent with a fall (sudden movement + impact + stillness), it initiates an alert.

### Detection Sequence

1. **Fall Detected** - Accelerometer triggers
2. **Warning Beep** - Device alerts member
3. **30-Second Countdown** - Member can cancel
4. **Cancel or Alert** - Member presses cancel, or alert sends automatically

### Sensitivity Levels

| Level | Best For | False Alarm Risk |
|-------|----------|------------------|
| High | Frail elderly, fall history | Higher |
| Medium | Most members (default) | Moderate |
| Low | Active members | Lower |
| Off | Member request only | N/A |

### When to Adjust Sensitivity

**Increase Sensitivity (High):**
- Member has had previous falls
- Member has balance issues
- Member lives alone
- Doctor recommends monitoring

**Decrease Sensitivity (Low):**
- Frequent false alarms
- Active lifestyle (gardening, exercises)
- Tends to sit/stand quickly
- Drops pendant often

**Disable Fall Detection:**
- Only at member''s explicit request
- Document reason in member notes
- Review periodically

### Adjusting Settings

**Staff can request sensitivity changes:**
1. Note current setting and issue
2. Contact technical team
3. Specify desired level and reason
4. Document change in member profile
5. Inform member of change

### Common False Alarm Causes

- Dropping the pendant
- Sitting down quickly
- Getting in/out of car
- Placing pendant on hard surface
- Vigorous activities

### Member Education

**Teach members:**
- How to cancel false alarms (hold cancel button)
- To expect brief beep if fall suspected
- To wear pendant close to body for best detection
- To keep pendant on, not in pocket

### Important Notes

- Fall detection is an **aid**, not guarantee
- Some falls may not be detected
- Sensitivity is not 100% accurate
- Members should still press SOS if fallen and able
- Family should be informed of limitations',
  ARRAY['staff', 'ai', 'member'],
  8,
  ARRAY['fall-detection', 'sensitivity', 'settings', 'accelerometer', 'safety'],
  'en',
  'published'
);

-- 2.10 Fall Detection Settings (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'fall-detection-settings-es',
  'Configuración de Detección de Caídas',
  'device',
  '## Configuración de Detección de Caídas

### Cómo Funciona la Detección de Caídas

El colgante EV-07B usa un acelerómetro para detectar caídas. Cuando detecta un patrón consistente con una caída (movimiento brusco + impacto + quietud), inicia una alerta.

### Secuencia de Detección

1. **Caída Detectada** - Acelerómetro se activa
2. **Pitido de Advertencia** - Dispositivo alerta al miembro
3. **Cuenta Regresiva de 30 Segundos** - Miembro puede cancelar
4. **Cancelar o Alertar** - Miembro presiona cancelar, o la alerta se envía automáticamente

### Niveles de Sensibilidad

| Nivel | Mejor Para | Riesgo de Falsa Alarma |
|-------|------------|------------------------|
| Alto | Ancianos frágiles, historial de caídas | Mayor |
| Medio | Mayoría de miembros (predeterminado) | Moderado |
| Bajo | Miembros activos | Menor |
| Apagado | Solo por solicitud del miembro | N/A |

### Cuándo Ajustar Sensibilidad

**Aumentar Sensibilidad (Alto):**
- Miembro ha tenido caídas previas
- Miembro tiene problemas de equilibrio
- Miembro vive solo
- El médico recomienda monitoreo

**Disminuir Sensibilidad (Bajo):**
- Falsas alarmas frecuentes
- Estilo de vida activo (jardinería, ejercicios)
- Tiende a sentarse/levantarse rápidamente
- Deja caer el colgante a menudo

**Desactivar Detección de Caídas:**
- Solo por solicitud explícita del miembro
- Documentar razón en notas del miembro
- Revisar periódicamente

### Ajustando Configuración

**El personal puede solicitar cambios de sensibilidad:**
1. Anotar configuración actual y problema
2. Contactar equipo técnico
3. Especificar nivel deseado y razón
4. Documentar cambio en perfil del miembro
5. Informar al miembro del cambio

### Causas Comunes de Falsas Alarmas

- Dejar caer el colgante
- Sentarse rápidamente
- Entrar/salir del coche
- Colocar colgante en superficie dura
- Actividades vigorosas

### Educación del Miembro

**Enseñe a los miembros:**
- Cómo cancelar falsas alarmas (mantener botón cancelar)
- Esperar un breve pitido si se sospecha caída
- Usar el colgante cerca del cuerpo para mejor detección
- Mantener colgante puesto, no en bolsillo

### Notas Importantes

- La detección de caídas es una **ayuda**, no garantía
- Algunas caídas pueden no ser detectadas
- La sensibilidad no es 100% precisa
- Los miembros aún deben presionar SOS si caen y pueden
- La familia debe ser informada de las limitaciones',
  ARRAY['staff', 'ai', 'member'],
  8,
  ARRAY['deteccion-caidas', 'sensibilidad', 'configuracion', 'acelerometro', 'seguridad'],
  'es',
  'published'
);

-- ============================================
-- CATEGORY 3: STAFF INSTRUCTIONS (10 docs)
-- ============================================

-- 3.1 Daily Shift Procedures (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'daily-shift-procedures-en',
  'Daily Shift Procedures',
  'staff',
  '## Daily Shift Procedures

### Shift Start Checklist

Complete these tasks when beginning your shift:

**1. System Login (First 5 minutes)**
- Log into call centre dashboard
- Check your user profile is correct
- Verify audio equipment working
- Test headset microphone

**2. Review Handover Notes**
- Read previous shift''s handover notes
- Note any ongoing situations
- Check for pending callbacks required
- Review any member updates

**3. System Status Check**
- Verify dashboard showing live data
- Check alert queue for any pending
- Confirm device status panel loading
- Test incoming call functionality

**4. Review Priority Items**
- Members marked for special attention
- Scheduled courtesy calls due
- Follow-up calls from previous alerts
- Any VIP or complex cases

### During Your Shift

**Alert Response**
- Claim alerts within 5 seconds
- Follow response protocols strictly
- Document all interactions
- Escalate when criteria met

**Courtesy Calls**
- Complete scheduled calls on time
- Follow courtesy call script
- Document outcomes properly
- Schedule follow-ups if needed

**Member Queries**
- Answer calls professionally
- Verify member identity
- Resolve issues or escalate
- Log all interactions

**Documentation**
- Update member notes promptly
- Record all call outcomes
- Log any issues or concerns
- Complete shift log entries

### Breaks

- Coordinate with supervisor
- Ensure coverage maintained
- Log break start/end times
- Complete any urgent tasks first

### Shift End Checklist

**30 Minutes Before End:**
- Begin handover notes
- Resolve or hand over pending alerts
- Complete documentation backlog
- Prepare summary of shift events

**At Shift End:**
- Submit completed handover notes
- Transfer any active cases
- Log out of all systems
- Brief incoming colleague if needed

### Handover Note Requirements

Include in every handover:
- Active alerts and their status
- Pending callbacks with member details
- Any technical issues encountered
- Special situations requiring attention
- VIP or priority members contacted',
  ARRAY['staff', 'ai'],
  9,
  ARRAY['shift', 'procedures', 'daily', 'checklist', 'handover'],
  'en',
  'published'
);

-- 3.2 Daily Shift Procedures (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'daily-shift-procedures-es',
  'Procedimientos Diarios de Turno',
  'staff',
  '## Procedimientos Diarios de Turno

### Lista de Verificación al Inicio del Turno

Complete estas tareas al comenzar su turno:

**1. Inicio de Sesión del Sistema (Primeros 5 minutos)**
- Inicie sesión en el panel del centro de llamadas
- Verifique que su perfil de usuario es correcto
- Confirme que el equipo de audio funciona
- Pruebe el micrófono del auricular

**2. Revisar Notas de Relevo**
- Lea las notas de relevo del turno anterior
- Anote cualquier situación en curso
- Verifique si hay devoluciones de llamada pendientes
- Revise cualquier actualización de miembros

**3. Verificación del Estado del Sistema**
- Confirme que el panel muestra datos en vivo
- Revise la cola de alertas por pendientes
- Verifique que el panel de estado de dispositivos carga
- Pruebe la funcionalidad de llamadas entrantes

**4. Revisar Elementos Prioritarios**
- Miembros marcados para atención especial
- Llamadas de cortesía programadas pendientes
- Llamadas de seguimiento de alertas previas
- Cualquier caso VIP o complejo

### Durante Su Turno

**Respuesta a Alertas**
- Reclamar alertas en 5 segundos
- Seguir protocolos de respuesta estrictamente
- Documentar todas las interacciones
- Escalar cuando se cumplan los criterios

**Llamadas de Cortesía**
- Completar llamadas programadas a tiempo
- Seguir el guión de llamada de cortesía
- Documentar resultados correctamente
- Programar seguimientos si es necesario

**Consultas de Miembros**
- Responder llamadas profesionalmente
- Verificar identidad del miembro
- Resolver problemas o escalar
- Registrar todas las interacciones

**Documentación**
- Actualizar notas de miembros prontamente
- Registrar todos los resultados de llamadas
- Anotar cualquier problema o preocupación
- Completar entradas del registro de turno

### Descansos

- Coordinar con el supervisor
- Asegurar que se mantiene cobertura
- Registrar hora de inicio/fin de descanso
- Completar tareas urgentes primero

### Lista de Verificación al Final del Turno

**30 Minutos Antes del Final:**
- Comenzar notas de relevo
- Resolver o transferir alertas pendientes
- Completar documentación atrasada
- Preparar resumen de eventos del turno

**Al Final del Turno:**
- Enviar notas de relevo completadas
- Transferir cualquier caso activo
- Cerrar sesión de todos los sistemas
- Informar al colega entrante si es necesario

### Requisitos de Notas de Relevo

Incluir en cada relevo:
- Alertas activas y su estado
- Devoluciones de llamada pendientes con detalles del miembro
- Cualquier problema técnico encontrado
- Situaciones especiales que requieren atención
- Miembros VIP o prioritarios contactados',
  ARRAY['staff', 'ai'],
  9,
  ARRAY['turno', 'procedimientos', 'diario', 'lista', 'relevo'],
  'es',
  'published'
);

-- 3.3 Member Information Lookup (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'member-information-lookup-en',
  'Member Information Lookup',
  'staff',
  '## Member Information Lookup

### Finding a Member

**Quick Search Options:**
- Member name (first or last)
- Member ID number
- Phone number
- Device IMEI
- Address

**Search Tips:**
- Use exact phone numbers including country code
- Partial name searches work (first 3+ characters)
- Try alternative spellings for names

### Member Profile Sections

**Personal Details**
- Full name and date of birth
- Address and contact information
- Preferred language
- Membership type and status

**Emergency Contacts**
- Up to 3 contacts in priority order
- Relationship to member
- Phone numbers
- Language preferences

**Medical Information**
- Known conditions
- Current medications
- Allergies
- Mobility status
- DNR status if applicable

**Device Information**
- Assigned device IMEI
- Device status and battery
- Last check-in time
- Last known location

**Subscription Details**
- Plan type (Single/Couple)
- Payment status
- Next billing date
- Payment method

### Important Fields During Emergencies

**Priority Information:**
1. Member''s full name
2. Current address
3. Medical conditions
4. Emergency contact #1
5. Device location

**Provide to 112:**
- Name and date of birth
- Complete address with access notes
- Known medical conditions
- Current medications if relevant
- GPS coordinates

### Updating Member Information

**Staff can update:**
- Contact preferences
- Notes and observations
- Call logs

**Updates requiring authorization:**
- Address changes
- Emergency contacts
- Medical information
- Payment details

*Request member update through proper channels*

### Member Notes

**When to add notes:**
- After every call with member
- After alerts (resolved or false)
- When new information learned
- For special instructions

**Note format:**
- Date and your name
- Brief description
- Actions taken
- Follow-up needed

### Privacy Reminder

- Only access member data when needed
- Never share member information externally
- Close member profiles after use
- All access is logged for audit',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['member', 'lookup', 'crm', 'search', 'profile'],
  'en',
  'published'
);

-- 3.4 Member Information Lookup (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'member-information-lookup-es',
  'Búsqueda de Información del Miembro',
  'staff',
  '## Búsqueda de Información del Miembro

### Encontrar un Miembro

**Opciones de Búsqueda Rápida:**
- Nombre del miembro (nombre o apellido)
- Número de ID del miembro
- Número de teléfono
- IMEI del dispositivo
- Dirección

**Consejos de Búsqueda:**
- Use números de teléfono exactos incluyendo código de país
- Las búsquedas parciales de nombre funcionan (primeros 3+ caracteres)
- Pruebe ortografías alternativas para nombres

### Secciones del Perfil del Miembro

**Datos Personales**
- Nombre completo y fecha de nacimiento
- Dirección e información de contacto
- Idioma preferido
- Tipo de membresía y estado

**Contactos de Emergencia**
- Hasta 3 contactos en orden de prioridad
- Relación con el miembro
- Números de teléfono
- Preferencias de idioma

**Información Médica**
- Condiciones conocidas
- Medicamentos actuales
- Alergias
- Estado de movilidad
- Estado DNR si aplica

**Información del Dispositivo**
- IMEI del dispositivo asignado
- Estado y batería del dispositivo
- Última hora de registro
- Última ubicación conocida

**Detalles de Suscripción**
- Tipo de plan (Individual/Pareja)
- Estado de pago
- Próxima fecha de facturación
- Método de pago

### Campos Importantes Durante Emergencias

**Información Prioritaria:**
1. Nombre completo del miembro
2. Dirección actual
3. Condiciones médicas
4. Contacto de emergencia #1
5. Ubicación del dispositivo

**Proporcionar al 112:**
- Nombre y fecha de nacimiento
- Dirección completa con notas de acceso
- Condiciones médicas conocidas
- Medicamentos actuales si es relevante
- Coordenadas GPS

### Actualizar Información del Miembro

**El personal puede actualizar:**
- Preferencias de contacto
- Notas y observaciones
- Registros de llamadas

**Actualizaciones que requieren autorización:**
- Cambios de dirección
- Contactos de emergencia
- Información médica
- Datos de pago

*Solicite actualización del miembro a través de los canales apropiados*

### Notas del Miembro

**Cuándo agregar notas:**
- Después de cada llamada con el miembro
- Después de alertas (resueltas o falsas)
- Cuando se aprende nueva información
- Para instrucciones especiales

**Formato de nota:**
- Fecha y su nombre
- Breve descripción
- Acciones tomadas
- Seguimiento necesario

### Recordatorio de Privacidad

- Solo acceda a datos del miembro cuando sea necesario
- Nunca comparta información del miembro externamente
- Cierre perfiles de miembros después de usar
- Todo acceso se registra para auditoría',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['miembro', 'busqueda', 'crm', 'perfil', 'informacion'],
  'es',
  'published'
);

-- 3.5 Courtesy Call Guidelines (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'courtesy-call-guidelines-en',
  'Courtesy Call Guidelines',
  'staff',
  '## Courtesy Call Guidelines

### Purpose of Courtesy Calls

Courtesy calls are proactive check-ins with members to:
- Ensure their wellbeing
- Verify device is working
- Build relationship and trust
- Identify any concerns early
- Provide peace of mind to families

### Call Schedule

**Regular Members:**
- Monthly courtesy call
- Scheduled based on preferences

**Priority Members:**
- Weekly or bi-weekly calls
- Recently discharged from hospital
- Living alone with health conditions
- At family''s request

**Birthday Calls:**
- Special call on member''s birthday
- Brief, warm greeting

### Courtesy Call Script

**Opening:**
"Good [morning/afternoon], this is [Name] calling from ICE Alarm. May I speak with [Member Name]?"

"Hello [Member Name], I''m calling for your regular welfare check. How are you today?"

**Key Questions:**
1. "How have you been feeling lately?"
2. "Is your pendant working well? Any issues?"
3. "Are you charging it regularly?"
4. "Do you have any questions about the service?"
5. "Is there anything we can help you with?"

**Closing:**
"Thank you for your time, [Name]. Remember, we''re here 24/7 if you need us. Have a lovely [day/evening]."

### What to Listen For

**Signs of concern:**
- Confusion or memory issues
- Breathing difficulties
- Mentions of falls or near-falls
- Loneliness or depression indicators
- Changes in living situation
- Medication concerns

**Device issues:**
- Complaints about charging
- False alarms
- Comfort issues with wearing
- Battery problems

### Documentation

After each call, record:
- Date and time of call
- Member''s general wellbeing
- Any concerns raised
- Device status discussed
- Actions taken
- Follow-up needed

### Unsuccessful Calls

**If no answer:**
1. Try again later same day
2. Try at different time next day
3. After 3 attempts, note in file
4. Consider contacting emergency contact
5. Flag for supervisor review

### Language Considerations

- Speak slowly and clearly
- Use simple language
- Offer to speak in Spanish if preferred
- Be patient with elderly members
- Repeat information if needed',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['courtesy-calls', 'check-in', 'welfare', 'script', 'communication'],
  'en',
  'published'
);

-- 3.6 Courtesy Call Guidelines (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'courtesy-call-guidelines-es',
  'Directrices para Llamadas de Cortesía',
  'staff',
  '## Directrices para Llamadas de Cortesía

### Propósito de las Llamadas de Cortesía

Las llamadas de cortesía son verificaciones proactivas con los miembros para:
- Asegurar su bienestar
- Verificar que el dispositivo funciona
- Construir relación y confianza
- Identificar preocupaciones temprano
- Proporcionar tranquilidad a las familias

### Calendario de Llamadas

**Miembros Regulares:**
- Llamada de cortesía mensual
- Programada según preferencias

**Miembros Prioritarios:**
- Llamadas semanales o quincenales
- Recientemente dados de alta del hospital
- Viven solos con condiciones de salud
- Por solicitud de la familia

**Llamadas de Cumpleaños:**
- Llamada especial en el cumpleaños del miembro
- Saludo breve y cálido

### Guión de Llamada de Cortesía

**Apertura:**
"Buenos [días/tardes], le habla [Nombre] de ICE Alarm. ¿Puedo hablar con [Nombre del Miembro]?"

"Hola [Nombre del Miembro], le llamo para su verificación de bienestar regular. ¿Cómo está usted hoy?"

**Preguntas Clave:**
1. "¿Cómo se ha sentido últimamente?"
2. "¿Su colgante funciona bien? ¿Algún problema?"
3. "¿Lo está cargando regularmente?"
4. "¿Tiene alguna pregunta sobre el servicio?"
5. "¿Hay algo en lo que podamos ayudarle?"

**Cierre:**
"Gracias por su tiempo, [Nombre]. Recuerde que estamos aquí 24/7 si nos necesita. Que tenga un buen [día/tarde]."

### Qué Escuchar

**Señales de preocupación:**
- Confusión o problemas de memoria
- Dificultades para respirar
- Menciones de caídas o casi-caídas
- Indicadores de soledad o depresión
- Cambios en situación de vivienda
- Preocupaciones sobre medicamentos

**Problemas con dispositivo:**
- Quejas sobre la carga
- Falsas alarmas
- Problemas de comodidad al usar
- Problemas de batería

### Documentación

Después de cada llamada, registrar:
- Fecha y hora de la llamada
- Bienestar general del miembro
- Cualquier preocupación planteada
- Estado del dispositivo discutido
- Acciones tomadas
- Seguimiento necesario

### Llamadas Sin Éxito

**Si no hay respuesta:**
1. Intentar de nuevo más tarde el mismo día
2. Intentar a diferente hora al día siguiente
3. Después de 3 intentos, anotar en el archivo
4. Considerar contactar al contacto de emergencia
5. Marcar para revisión del supervisor

### Consideraciones de Idioma

- Hablar lenta y claramente
- Usar lenguaje simple
- Ofrecer hablar en español si se prefiere
- Ser paciente con miembros mayores
- Repetir información si es necesario',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['llamadas-cortesia', 'verificacion', 'bienestar', 'guion', 'comunicacion'],
  'es',
  'published'
);

-- 3.7 Shift Handover Protocol (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'shift-handover-protocol-en',
  'Shift Handover Protocol',
  'staff',
  '## Shift Handover Protocol

### Purpose

Proper shift handover ensures continuity of care for members and prevents information gaps that could affect emergency response.

### Handover Timeline

**30 Minutes Before Shift End:**
- Stop taking new complex cases
- Begin documentation review
- Start writing handover notes

**15 Minutes Before Shift End:**
- Handover notes complete
- Brief incoming colleague verbally
- Transfer any active cases

**At Shift Change:**
- Incoming staff reviews notes
- Questions answered
- Systems access transferred
- Outgoing staff logs out

### Handover Note Template

```
SHIFT HANDOVER
Date: [Date]
Outgoing: [Your Name]
Incoming: [Colleague Name]

ACTIVE ALERTS:
- [Alert ID] - [Member Name] - [Status] - [Notes]

PENDING CALLBACKS:
- [Member Name] - [Reason] - [By when]

TECHNICAL ISSUES:
- [Description of any system problems]

PRIORITY MEMBERS:
- [Member Name] - [Reason for priority]

SUPERVISOR ESCALATIONS:
- [Any issues raised to supervisor]

OTHER NOTES:
- [Anything else incoming staff should know]
```

### Critical Information to Include

**Always Document:**
- Any unresolved alerts
- Members awaiting callback
- Scheduled courtesy calls due
- Technical problems encountered
- Supervisor instructions received
- Unusual situations or concerns

### Verbal Handover

For complex situations, verbal handover is required:

1. Review written notes together
2. Explain any nuances not in notes
3. Answer questions from incoming staff
4. Confirm understanding

### When Incoming Staff is Late

- Continue monitoring normally
- Document extended coverage
- Do not leave position unattended
- Notify supervisor if significant delay

### Quality Standards

Handover notes should be:
- **Clear** - Easy to understand quickly
- **Complete** - All relevant info included
- **Concise** - Not unnecessarily long
- **Accurate** - Facts verified

### Accountability

- Both outgoing and incoming staff share responsibility
- Incoming staff should read notes immediately
- Questions should be asked before outgoing leaves
- Any gaps should be flagged to supervisor',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['handover', 'shift-change', 'continuity', 'documentation', 'transition'],
  'en',
  'published'
);

-- 3.8 Shift Handover Protocol (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'shift-handover-protocol-es',
  'Protocolo de Relevo de Turno',
  'staff',
  '## Protocolo de Relevo de Turno

### Propósito

Un relevo de turno adecuado asegura la continuidad de atención para los miembros y previene vacíos de información que podrían afectar la respuesta de emergencia.

### Cronología del Relevo

**30 Minutos Antes del Fin del Turno:**
- Dejar de tomar nuevos casos complejos
- Comenzar revisión de documentación
- Empezar a escribir notas de relevo

**15 Minutos Antes del Fin del Turno:**
- Notas de relevo completas
- Informar al colega entrante verbalmente
- Transferir cualquier caso activo

**En el Cambio de Turno:**
- Personal entrante revisa notas
- Preguntas respondidas
- Acceso a sistemas transferido
- Personal saliente cierra sesión

### Plantilla de Notas de Relevo

```
RELEVO DE TURNO
Fecha: [Fecha]
Saliente: [Su Nombre]
Entrante: [Nombre del Colega]

ALERTAS ACTIVAS:
- [ID de Alerta] - [Nombre del Miembro] - [Estado] - [Notas]

DEVOLUCIONES DE LLAMADA PENDIENTES:
- [Nombre del Miembro] - [Razón] - [Para cuándo]

PROBLEMAS TÉCNICOS:
- [Descripción de problemas del sistema]

MIEMBROS PRIORITARIOS:
- [Nombre del Miembro] - [Razón de prioridad]

ESCALACIONES AL SUPERVISOR:
- [Cualquier problema elevado al supervisor]

OTRAS NOTAS:
- [Cualquier cosa que el personal entrante deba saber]
```

### Información Crítica a Incluir

**Siempre Documentar:**
- Cualquier alerta no resuelta
- Miembros esperando devolución de llamada
- Llamadas de cortesía programadas pendientes
- Problemas técnicos encontrados
- Instrucciones recibidas del supervisor
- Situaciones o preocupaciones inusuales

### Relevo Verbal

Para situaciones complejas, se requiere relevo verbal:

1. Revisar notas escritas juntos
2. Explicar cualquier matiz no en las notas
3. Responder preguntas del personal entrante
4. Confirmar comprensión

### Cuando el Personal Entrante Llega Tarde

- Continuar monitoreando normalmente
- Documentar cobertura extendida
- No abandonar la posición sin atender
- Notificar al supervisor si hay retraso significativo

### Estándares de Calidad

Las notas de relevo deben ser:
- **Claras** - Fáciles de entender rápidamente
- **Completas** - Toda información relevante incluida
- **Concisas** - No innecesariamente largas
- **Precisas** - Hechos verificados

### Responsabilidad

- Personal saliente y entrante comparten responsabilidad
- Personal entrante debe leer notas inmediatamente
- Las preguntas deben hacerse antes de que el saliente se vaya
- Cualquier vacío debe reportarse al supervisor',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['relevo', 'cambio-turno', 'continuidad', 'documentacion', 'transicion'],
  'es',
  'published'
);

-- 3.9 Communication Standards (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'communication-standards-en',
  'Communication Standards',
  'staff',
  '## Communication Standards

### Professional Communication

All communication with members, families, and emergency services must be:
- Professional and courteous
- Clear and easy to understand
- Calm, especially during emergencies
- Empathetic and patient

### Phone Etiquette

**Answering Calls:**
"ICE Alarm, [Your Name] speaking. How may I help you?"

**Greeting Members:**
- Use their name when possible
- Speak clearly and at moderate pace
- Adjust volume for elderly members
- Be patient with hearing difficulties

**Ending Calls:**
- Summarize any actions taken
- Confirm understanding
- Thank them for calling
- End with warm closing

### Language Guidelines

**Preferred:**
- Simple, clear language
- Short sentences
- One instruction at a time
- Positive phrasing

**Avoid:**
- Technical jargon
- Complex medical terms (unless quoting)
- Rushing or interrupting
- Condescending tone

### Bilingual Communication

ICE Alarm serves members in English and Spanish.

**Ask Early:**
"Would you prefer to speak in English or Spanish?"
"¿Prefiere hablar en inglés o español?"

**If Language Barrier:**
- Speak slower, not louder
- Use simpler words
- Offer to call back with translator
- Never leave member struggling

### Difficult Conversations

**Upset Members/Family:**
- Listen fully before responding
- Acknowledge their feelings
- Stay calm and professional
- Offer solutions where possible
- Escalate if cannot resolve

**Confused Members:**
- Be patient and reassuring
- Repeat information gently
- Confirm understanding
- Note confusion in member file

### Emergency Communication

**Priority: Clarity and Calm**
- Speak slowly and clearly
- Give one instruction at a time
- Confirm member understands
- Stay on line when possible
- Reassure continuously

**With 112:**
- State facts clearly
- Provide complete address first
- Answer all questions directly
- Stay on line until released

### Written Communication

**Notes and Documentation:**
- Clear and factual
- Date and timestamp everything
- Use proper grammar
- Avoid abbreviations unless standard

### Confidentiality

- Never discuss members with unauthorized persons
- Do not share information externally
- Be careful in open office environments
- Member privacy is paramount',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['communication', 'professionalism', 'phone', 'language', 'etiquette'],
  'en',
  'published'
);

-- 3.10 Communication Standards (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'communication-standards-es',
  'Estándares de Comunicación',
  'staff',
  '## Estándares de Comunicación

### Comunicación Profesional

Toda comunicación con miembros, familias y servicios de emergencia debe ser:
- Profesional y cortés
- Clara y fácil de entender
- Calmada, especialmente durante emergencias
- Empática y paciente

### Etiqueta Telefónica

**Contestar Llamadas:**
"ICE Alarm, le habla [Su Nombre]. ¿En qué puedo ayudarle?"

**Saludar a Miembros:**
- Use su nombre cuando sea posible
- Hable claramente y a ritmo moderado
- Ajuste el volumen para miembros mayores
- Sea paciente con dificultades auditivas

**Terminar Llamadas:**
- Resuma cualquier acción tomada
- Confirme comprensión
- Agradezca por llamar
- Termine con cierre cálido

### Directrices de Lenguaje

**Preferido:**
- Lenguaje simple y claro
- Oraciones cortas
- Una instrucción a la vez
- Fraseología positiva

**Evitar:**
- Jerga técnica
- Términos médicos complejos (a menos que cite)
- Apurar o interrumpir
- Tono condescendiente

### Comunicación Bilingüe

ICE Alarm atiende miembros en inglés y español.

**Pregunte Temprano:**
"Would you prefer to speak in English or Spanish?"
"¿Prefiere hablar en inglés o español?"

**Si Hay Barrera de Idioma:**
- Hable más lento, no más fuerte
- Use palabras más simples
- Ofrezca llamar de vuelta con traductor
- Nunca deje al miembro con dificultades

### Conversaciones Difíciles

**Miembros/Familia Molestos:**
- Escuche completamente antes de responder
- Reconozca sus sentimientos
- Manténgase calmado y profesional
- Ofrezca soluciones donde sea posible
- Escale si no puede resolver

**Miembros Confundidos:**
- Sea paciente y tranquilizador
- Repita información gentilmente
- Confirme comprensión
- Anote confusión en archivo del miembro

### Comunicación de Emergencia

**Prioridad: Claridad y Calma**
- Hable lenta y claramente
- Dé una instrucción a la vez
- Confirme que el miembro entiende
- Permanezca en línea cuando sea posible
- Tranquilice continuamente

**Con el 112:**
- Exponga hechos claramente
- Proporcione dirección completa primero
- Responda todas las preguntas directamente
- Permanezca en línea hasta que le liberen

### Comunicación Escrita

**Notas y Documentación:**
- Clara y factual
- Feche y ponga hora a todo
- Use gramática correcta
- Evite abreviaturas a menos que sean estándar

### Confidencialidad

- Nunca discuta miembros con personas no autorizadas
- No comparta información externamente
- Tenga cuidado en ambientes de oficina abierta
- La privacidad del miembro es primordial',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['comunicacion', 'profesionalismo', 'telefono', 'idioma', 'etiqueta'],
  'es',
  'published'
);

-- ============================================
-- CATEGORY 4: GENERAL (10 docs)
-- ============================================

-- 4.1 Company Overview (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'company-overview-en',
  'Company Overview',
  'general',
  '## Company Overview

### About ICE Alarm España

ICE Alarm España is a personal emergency response service (PERS) provider operating in Spain. We specialize in providing 24/7 emergency monitoring for elderly individuals and those with medical conditions who wish to maintain their independence while having reliable emergency support.

### Our Mission

To provide peace of mind to our members and their families through reliable, caring, and responsive emergency monitoring services that enable independent living.

### Our Values

**Safety First**
Member safety is our absolute priority in every decision and action.

**Compassionate Care**
We treat every member with dignity, respect, and genuine care.

**Reliability**
Our service is available 24 hours a day, 365 days a year.

**Professionalism**
Our trained staff respond quickly and effectively to every alert.

### What We Do

ICE Alarm provides:
- 24/7 emergency monitoring from our call centre
- GPS-enabled medical alert pendants
- Automatic fall detection
- Regular courtesy check-in calls
- Connection to Spanish emergency services (112)
- Communication with emergency contacts

### Our Members

We primarily serve:
- Elderly individuals living independently
- People with medical conditions requiring monitoring
- Those recovering from illness or surgery
- Anyone wanting additional safety assurance

### Service Area

ICE Alarm España operates throughout Spain, providing coverage wherever there is mobile network connectivity.

### Technology

We use the EV-07B GPS medical alert pendant, featuring:
- 4G LTE connectivity
- Built-in GPS tracking
- Automatic fall detection
- Water-resistant design
- Long battery life
- Two-way voice communication

### Our Commitment

Every member receives:
- Personalized setup and training
- Prompt response to all alerts
- Regular welfare check-ins
- Compassionate, bilingual support
- Complete privacy and data protection',
  ARRAY['admin', 'staff', 'ai'],
  7,
  ARRAY['company', 'about', 'mission', 'overview', 'values'],
  'en',
  'published'
);

-- 4.2 Company Overview (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'company-overview-es',
  'Descripción de la Empresa',
  'general',
  '## Descripción de la Empresa

### Acerca de ICE Alarm España

ICE Alarm España es un proveedor de servicios de respuesta de emergencia personal (PERS) que opera en España. Nos especializamos en proporcionar monitoreo de emergencia 24/7 para personas mayores y aquellos con condiciones médicas que desean mantener su independencia mientras tienen apoyo de emergencia confiable.

### Nuestra Misión

Proporcionar tranquilidad a nuestros miembros y sus familias a través de servicios de monitoreo de emergencia confiables, compasivos y receptivos que permiten la vida independiente.

### Nuestros Valores

**Seguridad Primero**
La seguridad del miembro es nuestra prioridad absoluta en cada decisión y acción.

**Cuidado Compasivo**
Tratamos a cada miembro con dignidad, respeto y genuino cuidado.

**Fiabilidad**
Nuestro servicio está disponible 24 horas al día, 365 días al año.

**Profesionalismo**
Nuestro personal capacitado responde rápida y efectivamente a cada alerta.

### Lo Que Hacemos

ICE Alarm proporciona:
- Monitoreo de emergencia 24/7 desde nuestro centro de llamadas
- Colgantes de alerta médica con GPS
- Detección automática de caídas
- Llamadas regulares de verificación de cortesía
- Conexión con servicios de emergencia españoles (112)
- Comunicación con contactos de emergencia

### Nuestros Miembros

Servimos principalmente a:
- Personas mayores que viven independientemente
- Personas con condiciones médicas que requieren monitoreo
- Aquellos en recuperación de enfermedad o cirugía
- Cualquier persona que desee seguridad adicional

### Área de Servicio

ICE Alarm España opera en toda España, proporcionando cobertura dondequiera que haya conectividad de red móvil.

### Tecnología

Utilizamos el colgante de alerta médica GPS EV-07B, que cuenta con:
- Conectividad 4G LTE
- Seguimiento GPS integrado
- Detección automática de caídas
- Diseño resistente al agua
- Batería de larga duración
- Comunicación de voz bidireccional

### Nuestro Compromiso

Cada miembro recibe:
- Configuración y capacitación personalizada
- Respuesta rápida a todas las alertas
- Verificaciones regulares de bienestar
- Soporte bilingüe y compasivo
- Completa privacidad y protección de datos',
  ARRAY['admin', 'staff', 'ai'],
  7,
  ARRAY['empresa', 'acerca', 'mision', 'descripcion', 'valores'],
  'es',
  'published'
);

-- 4.3 Service Pricing & Plans (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'service-pricing-plans-en',
  'Service Pricing & Plans',
  'general',
  '## Service Pricing & Plans

### Membership Plans

ICE Alarm offers two membership types to suit different household needs.

#### Single Membership
**€27.49 per month**

Ideal for:
- Individuals living alone
- Single-person households

Includes:
- 24/7 emergency monitoring
- One EV-07B GPS pendant
- Automatic fall detection
- Monthly courtesy calls
- Unlimited SOS alerts

#### Couple Membership
**€38.49 per month**

Ideal for:
- Couples living together
- Two-person households

Includes:
- Everything in Single plan
- Two EV-07B GPS pendants
- Shared emergency contacts
- Monitoring for both partners

### Pendant Cost

**One-Time Purchase: €151.25**

Each pendant includes:
- EV-07B device
- Neck lanyard
- Wrist strap option
- Magnetic charging cable
- Quick start guide

### Billing Options

**Monthly Billing**
- Charged on same date each month
- Cancel anytime with 30-day notice

**Annual Billing**
- Pay 12 months upfront
- Equivalent to 11 months (1 month free)
- Best value option

### Payment Methods

We accept:
- Direct debit (domiciliación bancaria)
- Credit/debit card
- Bank transfer

### What''s Included

All memberships include:
- 24/7 call centre monitoring
- SOS alert response
- Fall detection alerts
- Device offline monitoring
- Emergency contact notification
- Connection to 112 when needed
- GPS location tracking
- Two-way voice communication
- Monthly courtesy calls
- Technical support

### No Hidden Fees

Our pricing includes:
- No setup fees
- No activation fees
- No contract lock-in
- No cancellation penalties

### Price Lock Guarantee

Your monthly rate is locked for the duration of your membership unless we notify you 60 days in advance of any changes.

### Replacement Policy

- Free replacement for manufacturing defects
- Replacement fee for lost/damaged devices
- Device must be returned if service cancelled',
  ARRAY['admin', 'staff', 'ai'],
  8,
  ARRAY['pricing', 'membership', 'plans', 'cost', 'billing'],
  'en',
  'published'
);

-- 4.4 Service Pricing & Plans (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'service-pricing-plans-es',
  'Precios y Planes de Servicio',
  'general',
  '## Precios y Planes de Servicio

### Planes de Membresía

ICE Alarm ofrece dos tipos de membresía para adaptarse a diferentes necesidades del hogar.

#### Membresía Individual
**€27.49 por mes**

Ideal para:
- Personas que viven solas
- Hogares de una persona

Incluye:
- Monitoreo de emergencia 24/7
- Un colgante GPS EV-07B
- Detección automática de caídas
- Llamadas de cortesía mensuales
- Alertas SOS ilimitadas

#### Membresía de Pareja
**€38.49 por mes**

Ideal para:
- Parejas que viven juntas
- Hogares de dos personas

Incluye:
- Todo en el plan Individual
- Dos colgantes GPS EV-07B
- Contactos de emergencia compartidos
- Monitoreo para ambos

### Costo del Colgante

**Compra Única: €151.25**

Cada colgante incluye:
- Dispositivo EV-07B
- Cordón para cuello
- Opción de correa de muñeca
- Cable de carga magnético
- Guía de inicio rápido

### Opciones de Facturación

**Facturación Mensual**
- Cobrado en la misma fecha cada mes
- Cancelar en cualquier momento con aviso de 30 días

**Facturación Anual**
- Pagar 12 meses por adelantado
- Equivalente a 11 meses (1 mes gratis)
- Mejor opción de valor

### Métodos de Pago

Aceptamos:
- Domiciliación bancaria
- Tarjeta de crédito/débito
- Transferencia bancaria

### Qué Está Incluido

Todas las membresías incluyen:
- Monitoreo del centro de llamadas 24/7
- Respuesta a alertas SOS
- Alertas de detección de caídas
- Monitoreo de dispositivo desconectado
- Notificación a contactos de emergencia
- Conexión al 112 cuando sea necesario
- Seguimiento de ubicación GPS
- Comunicación de voz bidireccional
- Llamadas de cortesía mensuales
- Soporte técnico

### Sin Cargos Ocultos

Nuestros precios incluyen:
- Sin cuotas de configuración
- Sin cuotas de activación
- Sin contrato de permanencia
- Sin penalizaciones por cancelación

### Garantía de Precio Fijo

Su tarifa mensual está fijada durante la duración de su membresía a menos que le notifiquemos con 60 días de anticipación sobre cualquier cambio.

### Política de Reemplazo

- Reemplazo gratuito por defectos de fabricación
- Cuota de reemplazo por dispositivos perdidos/dañados
- El dispositivo debe devolverse si se cancela el servicio',
  ARRAY['admin', 'staff', 'ai'],
  8,
  ARRAY['precios', 'membresia', 'planes', 'costo', 'facturacion'],
  'es',
  'published'
);

-- 4.5 Data Privacy & GDPR Compliance (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'data-privacy-gdpr-en',
  'Data Privacy & GDPR Compliance',
  'general',
  '## Data Privacy & GDPR Compliance

### Our Commitment

ICE Alarm España is fully committed to protecting the personal data of our members in accordance with the General Data Protection Regulation (GDPR) and Spanish data protection law (LOPD-GDD).

### Data We Collect

**Personal Information:**
- Name, address, date of birth
- Contact details (phone, email)
- Emergency contact information
- Medical conditions and medications
- Payment information

**Device Data:**
- GPS location (during alerts only)
- Device status and battery level
- Alert history

### How We Use Data

Your data is used to:
- Provide emergency monitoring services
- Contact you and your emergency contacts during alerts
- Share necessary information with emergency services (112)
- Process payments for services
- Send courtesy call reminders
- Improve our services

### Legal Basis

We process your data based on:
- **Contract**: Necessary to provide our services
- **Vital interests**: During medical emergencies
- **Legal obligation**: When required by law
- **Consent**: For optional communications

### Data Sharing

We share data only with:
- Emergency services (112) when necessary
- Your designated emergency contacts
- Payment processors for billing
- Cloud service providers (with data protection agreements)

We never sell your data to third parties.

### Your Rights

Under GDPR, you have the right to:
- **Access** your personal data
- **Rectify** inaccurate data
- **Erase** your data (right to be forgotten)
- **Restrict** processing
- **Port** your data to another provider
- **Object** to certain processing
- **Withdraw** consent at any time

### Data Retention

- Active member data: Duration of membership + 5 years
- Alert records: 7 years (legal requirement)
- Billing records: 6 years (tax requirement)
- After retention period: Securely deleted

### Security Measures

We protect your data with:
- Encrypted storage and transmission
- Access controls and authentication
- Regular security audits
- Staff training on data protection

### Contact Us

Data Protection Officer:
- Email: dpo@icealarm.es
- Post: ICE Alarm España, [Address]

You also have the right to lodge a complaint with the Spanish Data Protection Agency (AEPD).',
  ARRAY['admin', 'staff', 'ai'],
  8,
  ARRAY['gdpr', 'privacy', 'data-protection', 'lopd', 'compliance'],
  'en',
  'published'
);

-- 4.6 Data Privacy & GDPR Compliance (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'data-privacy-gdpr-es',
  'Privacidad de Datos y Cumplimiento RGPD',
  'general',
  '## Privacidad de Datos y Cumplimiento RGPD

### Nuestro Compromiso

ICE Alarm España está totalmente comprometido con la protección de los datos personales de nuestros miembros de acuerdo con el Reglamento General de Protección de Datos (RGPD) y la ley española de protección de datos (LOPD-GDD).

### Datos Que Recopilamos

**Información Personal:**
- Nombre, dirección, fecha de nacimiento
- Datos de contacto (teléfono, email)
- Información de contactos de emergencia
- Condiciones médicas y medicamentos
- Información de pago

**Datos del Dispositivo:**
- Ubicación GPS (solo durante alertas)
- Estado del dispositivo y nivel de batería
- Historial de alertas

### Cómo Usamos los Datos

Sus datos se utilizan para:
- Proporcionar servicios de monitoreo de emergencia
- Contactarle a usted y sus contactos de emergencia durante alertas
- Compartir información necesaria con servicios de emergencia (112)
- Procesar pagos por servicios
- Enviar recordatorios de llamadas de cortesía
- Mejorar nuestros servicios

### Base Legal

Procesamos sus datos basándonos en:
- **Contrato**: Necesario para proporcionar nuestros servicios
- **Intereses vitales**: Durante emergencias médicas
- **Obligación legal**: Cuando lo requiere la ley
- **Consentimiento**: Para comunicaciones opcionales

### Compartir Datos

Compartimos datos solo con:
- Servicios de emergencia (112) cuando es necesario
- Sus contactos de emergencia designados
- Procesadores de pago para facturación
- Proveedores de servicios en la nube (con acuerdos de protección de datos)

Nunca vendemos sus datos a terceros.

### Sus Derechos

Bajo el RGPD, tiene derecho a:
- **Acceder** a sus datos personales
- **Rectificar** datos inexactos
- **Suprimir** sus datos (derecho al olvido)
- **Limitar** el procesamiento
- **Portar** sus datos a otro proveedor
- **Oponerse** a cierto procesamiento
- **Retirar** el consentimiento en cualquier momento

### Retención de Datos

- Datos de miembro activo: Duración de membresía + 5 años
- Registros de alertas: 7 años (requisito legal)
- Registros de facturación: 6 años (requisito fiscal)
- Después del período de retención: Eliminado de forma segura

### Medidas de Seguridad

Protegemos sus datos con:
- Almacenamiento y transmisión encriptados
- Controles de acceso y autenticación
- Auditorías de seguridad regulares
- Formación del personal en protección de datos

### Contáctenos

Delegado de Protección de Datos:
- Email: dpo@icealarm.es
- Correo postal: ICE Alarm España, [Dirección]

También tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD).',
  ARRAY['admin', 'staff', 'ai'],
  8,
  ARRAY['rgpd', 'privacidad', 'proteccion-datos', 'lopd', 'cumplimiento'],
  'es',
  'published'
);

-- 4.7 Working Hours & Contact Information (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'working-hours-contact-en',
  'Working Hours & Contact Information',
  'general',
  '## Working Hours & Contact Information

### Emergency Monitoring

**24 Hours a Day, 7 Days a Week, 365 Days a Year**

Our call centre never closes. Emergency alerts are monitored and responded to around the clock, including:
- All weekends
- Public holidays
- Nights and early mornings

### Office Hours

**Customer Service & Sales**
Monday - Friday: 9:00 AM - 6:00 PM (CET)

For non-emergency queries such as:
- New membership enquiries
- Billing questions
- General information
- Address changes
- Payment updates

### Contact Methods

**Emergency Line (24/7)**
Members: Use your pendant or call centre number on device

**Customer Service**
Phone: [Customer Service Number]
Email: info@icealarm.es

**Technical Support**
Phone: [Support Number]
Email: soporte@icealarm.es

**Partner Enquiries**
Email: partners@icealarm.es

### Response Times

| Contact Type | Expected Response |
|--------------|-------------------|
| Emergency Alert | < 30 seconds |
| Phone Call (business hours) | < 2 minutes |
| Email | Within 24 hours |
| Written Letter | Within 5 business days |

### Language Support

All our services are available in:
- English
- Spanish

Staff can assist in both languages during all hours.

### Postal Address

ICE Alarm España
[Full postal address]
Spain

### Social Media

Follow us for updates and safety tips:
- Facebook: [Facebook page]
- Website: www.icealarm.es

### Emergency Services

For immediate life-threatening emergencies:
**Call 112** (Spanish emergency number)

Our staff will also call 112 on your behalf during monitored alerts when needed.

### Holiday Closures

Our emergency monitoring NEVER closes.

Office services may have reduced hours on Spanish national holidays. Check our website for specific holiday schedules.',
  ARRAY['admin', 'staff', 'ai'],
  6,
  ARRAY['hours', 'contact', 'support', 'phone', 'email'],
  'en',
  'published'
);

-- 4.8 Working Hours & Contact Information (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'working-hours-contact-es',
  'Horario de Trabajo e Información de Contacto',
  'general',
  '## Horario de Trabajo e Información de Contacto

### Monitoreo de Emergencia

**24 Horas al Día, 7 Días a la Semana, 365 Días al Año**

Nuestro centro de llamadas nunca cierra. Las alertas de emergencia se monitorean y responden las 24 horas, incluyendo:
- Todos los fines de semana
- Días festivos
- Noches y madrugadas

### Horario de Oficina

**Servicio al Cliente y Ventas**
Lunes - Viernes: 9:00 AM - 6:00 PM (CET)

Para consultas no urgentes como:
- Consultas de nueva membresía
- Preguntas de facturación
- Información general
- Cambios de dirección
- Actualizaciones de pago

### Métodos de Contacto

**Línea de Emergencia (24/7)**
Miembros: Use su colgante o el número del centro de llamadas en el dispositivo

**Servicio al Cliente**
Teléfono: [Número de Servicio al Cliente]
Email: info@icealarm.es

**Soporte Técnico**
Teléfono: [Número de Soporte]
Email: soporte@icealarm.es

**Consultas de Socios**
Email: partners@icealarm.es

### Tiempos de Respuesta

| Tipo de Contacto | Respuesta Esperada |
|------------------|-------------------|
| Alerta de Emergencia | < 30 segundos |
| Llamada Telefónica (horario laboral) | < 2 minutos |
| Email | Dentro de 24 horas |
| Carta Escrita | Dentro de 5 días hábiles |

### Soporte de Idiomas

Todos nuestros servicios están disponibles en:
- Inglés
- Español

El personal puede asistir en ambos idiomas durante todas las horas.

### Dirección Postal

ICE Alarm España
[Dirección postal completa]
España

### Redes Sociales

Síganos para actualizaciones y consejos de seguridad:
- Facebook: [Página de Facebook]
- Sitio web: www.icealarm.es

### Servicios de Emergencia

Para emergencias inmediatas que amenazan la vida:
**Llame al 112** (número de emergencia español)

Nuestro personal también llamará al 112 en su nombre durante alertas monitoreadas cuando sea necesario.

### Cierres por Festivos

Nuestro monitoreo de emergencia NUNCA cierra.

Los servicios de oficina pueden tener horarios reducidos en días festivos nacionales españoles. Consulte nuestro sitio web para horarios específicos de festivos.',
  ARRAY['admin', 'staff', 'ai'],
  6,
  ARRAY['horario', 'contacto', 'soporte', 'telefono', 'email'],
  'es',
  'published'
);

-- 4.9 Glossary of Terms (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'glossary-of-terms-en',
  'Glossary of Terms',
  'general',
  '## Glossary of Terms

### A

**A-GPS (Assisted GPS)**
Technology that uses cellular network data to help GPS locate position faster.

**Alert**
Notification triggered by SOS button press, fall detection, or device going offline.

### C

**Call Centre**
Our 24/7 monitoring facility staffed by trained operators who respond to alerts.

**Courtesy Call**
Proactive check-in call made by staff to verify member wellbeing.

### D

**DNR (Do Not Resuscitate)**
Medical order indicating member does not want CPR. Noted in medical profile.

### E

**Emergency Contact**
Person designated by member to be called during emergencies (up to 3).

**EV-07B**
Model name of the GPS medical alert pendant used by ICE Alarm.

### F

**Fall Detection**
Automatic feature that senses when member may have fallen and triggers alert.

**False Alarm**
Alert triggered accidentally, without actual emergency.

### G

**GPS (Global Positioning System)**
Satellite-based navigation system that determines device location.

### I

**IMEI**
Unique identifier number for each pendant device.

**IP67**
Water resistance rating - can withstand immersion in water up to 1 meter.

### L

**LTE**
4G mobile network technology used by pendant for communication.

### M

**Member**
Person subscribed to ICE Alarm services.

**Monitoring**
Continuous observation of alerts from member devices.

### P

**Pendant**
The wearable GPS device worn by members (also called medallion or alarm).

**PERS**
Personal Emergency Response System - the category of service we provide.

### R

**RLS**
Row Level Security - database protection ensuring data privacy.

### S

**SOS**
Emergency distress signal - triggered by pressing pendant button.

**SIM**
Subscriber Identity Module - card in pendant enabling cellular connectivity.

### T

**Two-Way Communication**
Ability to both speak and listen through the pendant.

**112**
Spanish national emergency number (equivalent to 911 in USA).

### W

**Welfare Check**
Request for emergency services to physically check on member''s wellbeing.',
  ARRAY['admin', 'staff', 'ai'],
  5,
  ARRAY['glossary', 'terminology', 'definitions', 'terms', 'vocabulary'],
  'en',
  'published'
);

-- 4.10 Glossary of Terms (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'glossary-of-terms-es',
  'Glosario de Términos',
  'general',
  '## Glosario de Términos

### A

**A-GPS (GPS Asistido)**
Tecnología que usa datos de red celular para ayudar al GPS a localizar posición más rápido.

**Alerta**
Notificación activada por presionar el botón SOS, detección de caída o dispositivo desconectado.

### C

**Centro de Llamadas**
Nuestra instalación de monitoreo 24/7 con operadores capacitados que responden a alertas.

**Colgante**
El dispositivo GPS portátil usado por los miembros (también llamado medallón o alarma).

**Comunicación Bidireccional**
Capacidad de hablar y escuchar a través del colgante.

### D

**DNR (No Resucitar)**
Orden médica indicando que el miembro no desea RCP. Anotado en perfil médico.

**112**
Número de emergencia nacional español.

### E

**EV-07B**
Nombre del modelo del colgante de alerta médica GPS usado por ICE Alarm.

### F

**Falsa Alarma**
Alerta activada accidentalmente, sin emergencia real.

### G

**GPS (Sistema de Posicionamiento Global)**
Sistema de navegación basado en satélites que determina la ubicación del dispositivo.

### I

**IMEI**
Número identificador único para cada dispositivo colgante.

**IP67**
Clasificación de resistencia al agua - puede soportar inmersión hasta 1 metro.

### L

**Llamada de Cortesía**
Llamada proactiva de verificación realizada por el personal para verificar bienestar del miembro.

**LTE**
Tecnología de red móvil 4G usada por el colgante para comunicación.

### M

**Miembro**
Persona suscrita a los servicios de ICE Alarm.

**Monitoreo**
Observación continua de alertas de los dispositivos de los miembros.

### P

**PERS**
Sistema de Respuesta de Emergencia Personal - la categoría de servicio que proporcionamos.

### R

**RLS**
Seguridad a Nivel de Fila - protección de base de datos que asegura privacidad de datos.

### S

**SIM**
Módulo de Identidad del Suscriptor - tarjeta en el colgante que permite conectividad celular.

**SOS**
Señal de socorro de emergencia - activada al presionar el botón del colgante.

### V

**Verificación de Bienestar**
Solicitud a servicios de emergencia para verificar físicamente el bienestar del miembro.

### Contacto de Emergencia
Persona designada por el miembro para ser llamada durante emergencias (hasta 3).

### Detección de Caídas
Función automática que detecta cuando el miembro puede haber caído y activa alerta.',
  ARRAY['admin', 'staff', 'ai'],
  5,
  ARRAY['glosario', 'terminologia', 'definiciones', 'terminos', 'vocabulario'],
  'es',
  'published'
);

-- ============================================
-- CATEGORY 5: MEMBER GUIDES (12 docs)
-- ============================================

-- 5.1 Getting Started with ICE Alarm (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'getting-started-en',
  'Getting Started with ICE Alarm',
  'member_guide',
  '## Getting Started with ICE Alarm

### Welcome to ICE Alarm

Congratulations on taking an important step toward independent living with peace of mind. This guide will help you get started with your new ICE Alarm service.

### What You''ll Receive

Your ICE Alarm package includes:
- EV-07B GPS Pendant
- Neck lanyard
- Wrist strap (optional wearing method)
- Magnetic USB charging cable
- Quick start guide

### First Steps

#### 1. Charge Your Pendant
Before first use, charge your pendant fully (about 2 hours):
- Connect the magnetic cable to the back of pendant
- Plug into any USB power source
- Red light = charging, Green light = fully charged

#### 2. Turn On Your Pendant
- Press and hold the side button for 3 seconds
- Wait for blue light to flash (network connected)
- This may take 1-2 minutes on first use

#### 3. Wear Your Pendant
Choose your preferred method:
- **Neck lanyard**: Hang around your neck
- **Wrist strap**: Wear like a watch

**Important**: Wear your pendant at all times, even while sleeping and showering.

#### 4. Test Your Connection
Our team may schedule a test call to:
- Verify your pendant is working
- Let you hear how the two-way voice works
- Answer any questions

### Using Your Pendant

**In an Emergency:**
1. Press and hold the red SOS button for 3 seconds
2. Device will beep to confirm
3. Stay calm - operator will speak through pendant
4. Tell them what''s wrong
5. Help will be arranged

**If Fall Detected:**
1. Pendant will beep
2. You have 30 seconds to cancel if false alarm
3. If you don''t cancel, alert sends automatically

### Charging Routine

- Charge every night while sleeping
- Full charge lasts up to 5 days
- But daily charging is best practice

### Getting Help

- For emergencies: Press your SOS button
- For questions: Call our support line
- For technical issues: We''re here to help

### Remember

Your safety is our priority. Don''t hesitate to press the button - even false alarms are okay. We''d rather you be safe.',
  ARRAY['member', 'staff', 'ai'],
  8,
  ARRAY['getting-started', 'onboarding', 'setup', 'new-member', 'welcome'],
  'en',
  'published'
);

-- 5.2 Getting Started with ICE Alarm (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'getting-started-es',
  'Comenzando con ICE Alarm',
  'member_guide',
  '## Comenzando con ICE Alarm

### Bienvenido a ICE Alarm

Felicitaciones por dar un paso importante hacia la vida independiente con tranquilidad. Esta guía le ayudará a comenzar con su nuevo servicio ICE Alarm.

### Lo Que Recibirá

Su paquete ICE Alarm incluye:
- Colgante GPS EV-07B
- Cordón para cuello
- Correa de muñeca (método de uso opcional)
- Cable de carga USB magnético
- Guía de inicio rápido

### Primeros Pasos

#### 1. Cargue Su Colgante
Antes del primer uso, cargue su colgante completamente (aproximadamente 2 horas):
- Conecte el cable magnético a la parte trasera del colgante
- Enchufe a cualquier fuente de alimentación USB
- Luz roja = cargando, Luz verde = completamente cargado

#### 2. Encienda Su Colgante
- Mantenga presionado el botón lateral por 3 segundos
- Espere a que la luz azul parpadee (red conectada)
- Esto puede tomar 1-2 minutos en el primer uso

#### 3. Use Su Colgante
Elija su método preferido:
- **Cordón para cuello**: Cuélguelo alrededor de su cuello
- **Correa de muñeca**: Úselo como un reloj

**Importante**: Use su colgante en todo momento, incluso mientras duerme y se ducha.

#### 4. Pruebe Su Conexión
Nuestro equipo puede programar una llamada de prueba para:
- Verificar que su colgante funciona
- Permitirle escuchar cómo funciona la voz bidireccional
- Responder cualquier pregunta

### Usando Su Colgante

**En una Emergencia:**
1. Presione y mantenga el botón SOS rojo por 3 segundos
2. El dispositivo pitará para confirmar
3. Mantenga la calma - el operador hablará a través del colgante
4. Dígale lo que está mal
5. Se organizará ayuda

**Si Se Detecta Caída:**
1. El colgante pitará
2. Tiene 30 segundos para cancelar si es falsa alarma
3. Si no cancela, la alerta se envía automáticamente

### Rutina de Carga

- Cargue cada noche mientras duerme
- La carga completa dura hasta 5 días
- Pero cargar diariamente es la mejor práctica

### Obtener Ayuda

- Para emergencias: Presione su botón SOS
- Para preguntas: Llame a nuestra línea de soporte
- Para problemas técnicos: Estamos aquí para ayudar

### Recuerde

Su seguridad es nuestra prioridad. No dude en presionar el botón - incluso las falsas alarmas están bien. Preferimos que esté seguro.',
  ARRAY['member', 'staff', 'ai'],
  8,
  ARRAY['comenzar', 'incorporacion', 'configuracion', 'nuevo-miembro', 'bienvenida'],
  'es',
  'published'
);

-- 5.3 Managing Your Emergency Contacts (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'managing-emergency-contacts-en',
  'Managing Your Emergency Contacts',
  'member_guide',
  '## Managing Your Emergency Contacts

### Why Emergency Contacts Matter

Your emergency contacts are people we call when you trigger an alert. They provide additional support and can help us help you during emergencies.

### How Many Contacts?

You can register up to **3 emergency contacts**. They are called in order of priority if needed during an alert.

### Who Should Be an Emergency Contact?

**Ideal contacts are:**
- Family members (children, siblings, spouse)
- Close friends who live nearby
- Neighbors who have a key to your home
- People available to respond quickly

**Consider:**
- Someone who can reach you quickly
- People comfortable making decisions for you
- Those who know your medical history
- Mix of local and available contacts

### Information We Need

For each contact, please provide:
- Full name
- Relationship to you
- Primary phone number
- Secondary phone (if available)
- Whether they speak English, Spanish, or both
- Any special notes (e.g., "has key to home")

### Priority Order

- **Contact #1**: Called first in emergencies
- **Contact #2**: Called if #1 unavailable
- **Contact #3**: Called if #1 and #2 unavailable

### Updating Your Contacts

**To update your emergency contacts:**

1. Log into your member dashboard
2. Go to "Emergency Contacts" section
3. Add, edit, or remove contacts
4. Save your changes

**Or contact us:**
- Call our support line
- Email with your request
- Ask during courtesy call

### Important Notes

- Keep contact information current
- Let your contacts know they are listed
- Inform them about how ICE Alarm works
- Update us if contacts change

### What Happens During an Alert

1. We first try to reach you
2. If you confirm emergency or don''t respond, we call contacts
3. We explain the situation
4. We may ask them to check on you
5. We keep them informed of status

### Privacy

Your emergency contact information is:
- Stored securely
- Only used during alerts
- Never shared with third parties
- Protected under GDPR',
  ARRAY['member', 'staff', 'ai'],
  8,
  ARRAY['contacts', 'emergency', 'update', 'family', 'management'],
  'en',
  'published'
);

-- 5.4 Managing Your Emergency Contacts (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'managing-emergency-contacts-es',
  'Gestionando Sus Contactos de Emergencia',
  'member_guide',
  '## Gestionando Sus Contactos de Emergencia

### Por Qué Importan los Contactos de Emergencia

Sus contactos de emergencia son personas a quienes llamamos cuando activa una alerta. Proporcionan apoyo adicional y pueden ayudarnos a ayudarle durante emergencias.

### ¿Cuántos Contactos?

Puede registrar hasta **3 contactos de emergencia**. Se llaman en orden de prioridad si es necesario durante una alerta.

### ¿Quién Debería Ser Contacto de Emergencia?

**Los contactos ideales son:**
- Familiares (hijos, hermanos, cónyuge)
- Amigos cercanos que viven cerca
- Vecinos que tienen llave de su casa
- Personas disponibles para responder rápidamente

**Considere:**
- Alguien que pueda llegar a usted rápidamente
- Personas cómodas tomando decisiones por usted
- Aquellos que conocen su historial médico
- Mezcla de contactos locales y disponibles

### Información Que Necesitamos

Para cada contacto, proporcione:
- Nombre completo
- Relación con usted
- Número de teléfono principal
- Teléfono secundario (si está disponible)
- Si hablan inglés, español o ambos
- Notas especiales (ej., "tiene llave de casa")

### Orden de Prioridad

- **Contacto #1**: Llamado primero en emergencias
- **Contacto #2**: Llamado si #1 no está disponible
- **Contacto #3**: Llamado si #1 y #2 no están disponibles

### Actualizando Sus Contactos

**Para actualizar sus contactos de emergencia:**

1. Inicie sesión en su panel de miembro
2. Vaya a la sección "Contactos de Emergencia"
3. Agregue, edite o elimine contactos
4. Guarde sus cambios

**O contáctenos:**
- Llame a nuestra línea de soporte
- Envíe email con su solicitud
- Pregunte durante la llamada de cortesía

### Notas Importantes

- Mantenga la información de contacto actualizada
- Avise a sus contactos que están en la lista
- Infórmeles sobre cómo funciona ICE Alarm
- Actualícenos si los contactos cambian

### Qué Sucede Durante una Alerta

1. Primero intentamos contactarle a usted
2. Si confirma emergencia o no responde, llamamos a contactos
3. Explicamos la situación
4. Podemos pedirles que le revisen
5. Les mantenemos informados del estado

### Privacidad

Su información de contacto de emergencia está:
- Almacenada de forma segura
- Solo se usa durante alertas
- Nunca se comparte con terceros
- Protegida bajo RGPD',
  ARRAY['member', 'staff', 'ai'],
  8,
  ARRAY['contactos', 'emergencia', 'actualizar', 'familia', 'gestion'],
  'es',
  'published'
);

-- 5.5 Updating Medical Information (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'updating-medical-information-en',
  'Updating Medical Information',
  'member_guide',
  '## Updating Medical Information

### Why Medical Information Matters

Your medical information helps emergency responders provide appropriate care. When we call 112, we share relevant details to ensure you receive the best possible treatment.

### What We Store

**Medical Conditions**
Any diagnosed conditions such as:
- Heart conditions
- Diabetes
- Respiratory issues
- Neurological conditions
- Mobility limitations
- Cognitive conditions

**Current Medications**
List of medications you take regularly:
- Prescription medications
- Dosages
- Frequency

**Allergies**
Important allergies including:
- Drug allergies
- Food allergies
- Other severe allergies

**Additional Information**
- Mobility status (walks unaided, uses walker, wheelchair, etc.)
- Blood type (if known)
- Doctor/GP details
- Hospital preference
- DNR status (if applicable)

### Why Keep It Updated

Accurate medical information:
- Helps paramedics prepare properly
- Prevents dangerous drug interactions
- Ensures appropriate treatment
- Saves valuable time in emergencies

### How to Update

**Through Your Dashboard:**
1. Log into member dashboard
2. Go to "Medical Information" section
3. Update any relevant fields
4. Click "Save Changes"

**Contact Us:**
- Call our support line during office hours
- Request update during courtesy call
- Email your changes to us

### What Gets Shared

**With Emergency Services (112):**
- Relevant medical conditions
- Current medications
- Known allergies
- Mobility status
- DNR status if applicable

**We Only Share:**
- Information relevant to the emergency
- What helps responders help you
- Nothing unnecessary

### Privacy Protection

Your medical data is:
- Encrypted and secure
- Only accessed during alerts
- Protected under GDPR
- Never used for marketing

### Regular Reviews

We recommend reviewing your medical information:
- After any hospital visit
- When medications change
- When new conditions diagnosed
- At least once per year

### Important Note

While we share information with emergency services, you should also consider wearing a medical ID bracelet and keeping a current medication list at home where it can be easily found.',
  ARRAY['member', 'staff', 'ai'],
  8,
  ARRAY['medical', 'health', 'update', 'conditions', 'medications'],
  'en',
  'published'
);

-- 5.6 Updating Medical Information (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'updating-medical-information-es',
  'Actualizando Información Médica',
  'member_guide',
  '## Actualizando Información Médica

### Por Qué Importa la Información Médica

Su información médica ayuda a los servicios de emergencia a proporcionar atención apropiada. Cuando llamamos al 112, compartimos detalles relevantes para asegurar que reciba el mejor tratamiento posible.

### Qué Almacenamos

**Condiciones Médicas**
Cualquier condición diagnosticada como:
- Condiciones cardíacas
- Diabetes
- Problemas respiratorios
- Condiciones neurológicas
- Limitaciones de movilidad
- Condiciones cognitivas

**Medicamentos Actuales**
Lista de medicamentos que toma regularmente:
- Medicamentos recetados
- Dosis
- Frecuencia

**Alergias**
Alergias importantes incluyendo:
- Alergias a medicamentos
- Alergias alimentarias
- Otras alergias severas

**Información Adicional**
- Estado de movilidad (camina sin ayuda, usa andador, silla de ruedas, etc.)
- Tipo de sangre (si se conoce)
- Datos del médico/médico de cabecera
- Preferencia de hospital
- Estado DNR (si aplica)

### Por Qué Mantenerla Actualizada

Información médica precisa:
- Ayuda a los paramédicos a prepararse correctamente
- Previene interacciones peligrosas de medicamentos
- Asegura tratamiento apropiado
- Ahorra tiempo valioso en emergencias

### Cómo Actualizar

**A Través de Su Panel:**
1. Inicie sesión en el panel de miembro
2. Vaya a la sección "Información Médica"
3. Actualice cualquier campo relevante
4. Haga clic en "Guardar Cambios"

**Contáctenos:**
- Llame a nuestra línea de soporte en horario de oficina
- Solicite actualización durante llamada de cortesía
- Envíe sus cambios por email

### Qué Se Comparte

**Con Servicios de Emergencia (112):**
- Condiciones médicas relevantes
- Medicamentos actuales
- Alergias conocidas
- Estado de movilidad
- Estado DNR si aplica

**Solo Compartimos:**
- Información relevante a la emergencia
- Lo que ayuda a los respondedores a ayudarle
- Nada innecesario

### Protección de Privacidad

Sus datos médicos están:
- Encriptados y seguros
- Solo se accede durante alertas
- Protegidos bajo RGPD
- Nunca usados para marketing

### Revisiones Regulares

Recomendamos revisar su información médica:
- Después de cualquier visita al hospital
- Cuando cambien los medicamentos
- Cuando se diagnostiquen nuevas condiciones
- Al menos una vez al año

### Nota Importante

Aunque compartimos información con los servicios de emergencia, también debería considerar usar una pulsera de identificación médica y mantener una lista actual de medicamentos en casa donde pueda encontrarse fácilmente.',
  ARRAY['member', 'staff', 'ai'],
  8,
  ARRAY['medico', 'salud', 'actualizar', 'condiciones', 'medicamentos'],
  'es',
  'published'
);

-- 5.7 Using the Member Dashboard (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'using-member-dashboard-en',
  'Using the Member Dashboard',
  'member_guide',
  '## Using the Member Dashboard

### Accessing Your Dashboard

**To log in:**
1. Visit our website
2. Click "Member Login" or "My Account"
3. Enter your email and password
4. Click "Sign In"

**Forgot password?**
- Click "Forgot Password"
- Enter your email
- Check inbox for reset link
- Create new password

### Dashboard Overview

Your member dashboard gives you access to:
- Your profile information
- Emergency contacts
- Medical details
- Device status
- Subscription information
- Alert history
- Support options

### Main Sections

**Profile**
View and update your:
- Personal details (name, address, phone)
- Communication preferences
- Language preference

**Emergency Contacts**
- View your 3 emergency contacts
- Update contact details
- Change priority order

**Medical Information**
- View stored conditions
- Update medications
- Modify allergies
- Update mobility status

**My Device**
- See device status
- Battery level (last known)
- Last check-in time
- Connection status

**Subscription**
- View your plan type
- See next billing date
- Payment method on file
- Billing history

**Alert History**
- View past alerts
- See how they were resolved
- Check dates and times

### Updating Information

**To update any section:**
1. Navigate to the section
2. Click "Edit" or the pencil icon
3. Make your changes
4. Click "Save"

Some changes may require verification or staff approval.

### Getting Help

**From your dashboard:**
- Click "Help" or "Support"
- View help articles
- Contact us directly
- Request callback

### Security Tips

- Keep your password secure
- Don''t share login details
- Log out on shared devices
- Update password regularly

### Mobile Access

The dashboard works on:
- Desktop computers
- Tablets
- Smartphones

For best experience, use a modern web browser.',
  ARRAY['member', 'staff', 'ai'],
  7,
  ARRAY['dashboard', 'account', 'profile', 'login', 'portal'],
  'en',
  'published'
);

-- 5.8 Using the Member Dashboard (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'using-member-dashboard-es',
  'Usando el Panel de Miembro',
  'member_guide',
  '## Usando el Panel de Miembro

### Accediendo a Su Panel

**Para iniciar sesión:**
1. Visite nuestro sitio web
2. Haga clic en "Inicio de Sesión de Miembro" o "Mi Cuenta"
3. Ingrese su email y contraseña
4. Haga clic en "Iniciar Sesión"

**¿Olvidó su contraseña?**
- Haga clic en "Olvidé mi Contraseña"
- Ingrese su email
- Revise su bandeja de entrada para el enlace de restablecimiento
- Cree una nueva contraseña

### Vista General del Panel

Su panel de miembro le da acceso a:
- Su información de perfil
- Contactos de emergencia
- Detalles médicos
- Estado del dispositivo
- Información de suscripción
- Historial de alertas
- Opciones de soporte

### Secciones Principales

**Perfil**
Vea y actualice su:
- Datos personales (nombre, dirección, teléfono)
- Preferencias de comunicación
- Preferencia de idioma

**Contactos de Emergencia**
- Vea sus 3 contactos de emergencia
- Actualice detalles de contacto
- Cambie el orden de prioridad

**Información Médica**
- Vea condiciones almacenadas
- Actualice medicamentos
- Modifique alergias
- Actualice estado de movilidad

**Mi Dispositivo**
- Vea el estado del dispositivo
- Nivel de batería (último conocido)
- Última hora de registro
- Estado de conexión

**Suscripción**
- Vea su tipo de plan
- Vea próxima fecha de facturación
- Método de pago en archivo
- Historial de facturación

**Historial de Alertas**
- Vea alertas pasadas
- Vea cómo se resolvieron
- Verifique fechas y horas

### Actualizando Información

**Para actualizar cualquier sección:**
1. Navegue a la sección
2. Haga clic en "Editar" o el ícono de lápiz
3. Realice sus cambios
4. Haga clic en "Guardar"

Algunos cambios pueden requerir verificación o aprobación del personal.

### Obteniendo Ayuda

**Desde su panel:**
- Haga clic en "Ayuda" o "Soporte"
- Vea artículos de ayuda
- Contáctenos directamente
- Solicite una llamada

### Consejos de Seguridad

- Mantenga su contraseña segura
- No comparta datos de inicio de sesión
- Cierre sesión en dispositivos compartidos
- Actualice su contraseña regularmente

### Acceso Móvil

El panel funciona en:
- Computadoras de escritorio
- Tablets
- Teléfonos inteligentes

Para mejor experiencia, use un navegador web moderno.',
  ARRAY['member', 'staff', 'ai'],
  7,
  ARRAY['panel', 'cuenta', 'perfil', 'inicio-sesion', 'portal'],
  'es',
  'published'
);

-- 5.9 How to Test Your Pendant (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'how-to-test-pendant-en',
  'How to Test Your Pendant',
  'member_guide',
  '## How to Test Your Pendant

### Why Test Your Pendant?

Regular testing ensures your pendant is working properly and you know how to use it in a real emergency. We recommend testing once per month.

### Before You Test

**Schedule your test:**
- Best to test during business hours (9 AM - 6 PM)
- Our monitoring is 24/7, but support is faster during day
- Have your member information ready

**Notify us (optional):**
- You can call ahead to let us know you''re testing
- This prevents any confusion
- Not required, but helpful

### How to Test

**Step 1: Prepare**
- Make sure pendant is charged
- Be in a comfortable location
- Have phone nearby (backup)

**Step 2: Press SOS**
- Hold the red SOS button for 3 seconds
- Device will beep to confirm
- Wait for connection (few seconds)

**Step 3: Speak to Operator**
- Operator will answer through pendant
- Say: "This is [Your Name]. I am testing my pendant."
- Confirm you can hear them clearly

**Step 4: Confirm Test**
- Operator will confirm your details
- They will mark it as a test
- Ask any questions you have

**Step 5: End Test**
- Thank the operator
- They will end the call
- Test is complete!

### What We Check

During the test, we verify:
- SOS button works properly
- Voice communication is clear (both ways)
- Your information is correct
- Device location is accurate

### Testing Tips

**Good practices:**
- Test in different rooms
- Test outside your home once
- Practice pressing the button quickly
- Get familiar with the voice communication

**Remember:**
- It''s okay to test anytime
- Never hesitate in real emergency
- False alarms are better than no alarms

### If Test Fails

**If you can''t connect:**
1. Check pendant is charged
2. Try moving to different location
3. Wait a minute and try again
4. Call our support line if issues persist

### Monthly Reminder

We send courtesy reminders to test your pendant. This helps ensure your device is always ready when you need it.',
  ARRAY['member', 'staff', 'ai'],
  7,
  ARRAY['testing', 'pendant', 'functionality', 'practice', 'verification'],
  'en',
  'published'
);

-- 5.10 How to Test Your Pendant (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'how-to-test-pendant-es',
  'Cómo Probar Su Colgante',
  'member_guide',
  '## Cómo Probar Su Colgante

### ¿Por Qué Probar Su Colgante?

Las pruebas regulares aseguran que su colgante funciona correctamente y que sabe cómo usarlo en una emergencia real. Recomendamos probar una vez al mes.

### Antes de Probar

**Programe su prueba:**
- Mejor probar durante horario laboral (9 AM - 6 PM)
- Nuestro monitoreo es 24/7, pero el soporte es más rápido durante el día
- Tenga su información de miembro lista

**Notifíquenos (opcional):**
- Puede llamar antes para avisarnos que está probando
- Esto previene cualquier confusión
- No es requerido, pero es útil

### Cómo Probar

**Paso 1: Preparar**
- Asegúrese de que el colgante está cargado
- Esté en un lugar cómodo
- Tenga teléfono cerca (respaldo)

**Paso 2: Presionar SOS**
- Mantenga el botón SOS rojo por 3 segundos
- El dispositivo pitará para confirmar
- Espere la conexión (pocos segundos)

**Paso 3: Hablar con el Operador**
- El operador responderá a través del colgante
- Diga: "Soy [Su Nombre]. Estoy probando mi colgante."
- Confirme que puede escucharles claramente

**Paso 4: Confirmar Prueba**
- El operador confirmará sus datos
- Lo marcarán como prueba
- Haga cualquier pregunta que tenga

**Paso 5: Terminar Prueba**
- Agradezca al operador
- Ellos terminarán la llamada
- ¡Prueba completada!

### Qué Verificamos

Durante la prueba, verificamos:
- El botón SOS funciona correctamente
- La comunicación de voz es clara (ambos sentidos)
- Su información es correcta
- La ubicación del dispositivo es precisa

### Consejos de Prueba

**Buenas prácticas:**
- Pruebe en diferentes habitaciones
- Pruebe fuera de su casa una vez
- Practique presionar el botón rápidamente
- Familiarícese con la comunicación de voz

**Recuerde:**
- Está bien probar en cualquier momento
- Nunca dude en una emergencia real
- Las falsas alarmas son mejores que ninguna alarma

### Si la Prueba Falla

**Si no puede conectar:**
1. Verifique que el colgante está cargado
2. Intente moverse a diferente ubicación
3. Espere un minuto e intente de nuevo
4. Llame a nuestra línea de soporte si los problemas persisten

### Recordatorio Mensual

Enviamos recordatorios de cortesía para probar su colgante. Esto ayuda a asegurar que su dispositivo siempre esté listo cuando lo necesite.',
  ARRAY['member', 'staff', 'ai'],
  7,
  ARRAY['prueba', 'colgante', 'funcionalidad', 'practica', 'verificacion'],
  'es',
  'published'
);

-- 5.11 Billing & Subscription FAQ (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'billing-subscription-faq-en',
  'Billing & Subscription FAQ',
  'member_guide',
  '## Billing & Subscription FAQ

### Common Questions

#### When am I billed?
You are billed on the same date each month, starting from your activation date.

#### What payment methods do you accept?
- Direct debit (domiciliación bancaria)
- Credit/debit card
- Bank transfer

#### Can I change my payment method?
Yes. Contact us or update through your member dashboard.

#### What if a payment fails?
- We will notify you
- Try again in 2-3 days
- Service continues during retry period
- Contact us if issues persist

### Plan Changes

#### Can I upgrade from Single to Couple plan?
Yes. Contact us to add a second pendant. You will pay:
- Prorated difference for current month
- Second pendant cost (€151.25)
- New monthly rate (€38.49) from next billing

#### Can I downgrade from Couple to Single?
Yes. Contact us to arrange. You must return one pendant.

### Cancellation

#### How do I cancel my service?
- Call our customer service
- Or email your cancellation request
- 30-day notice required

#### Is there a cancellation fee?
No. We do not charge cancellation fees.

#### What happens to my pendant?
- Pendant must be returned
- We will provide return instructions
- Device will be deactivated

### Billing History

#### Where can I see my invoices?
In your member dashboard under "Subscription" > "Billing History"

#### Can I get receipts emailed?
Yes. Request this through your dashboard or contact us.

### Price Increases

#### Will my price increase?
Your rate is locked. If changes are needed, we provide 60 days'' notice.

### Other Questions

#### Do you offer discounts?
- Annual payment: 1 month free
- Contact us about other programs

#### Is VAT included?
Yes, all prices include IVA (Spanish VAT).

#### Can I pause my service?
Please contact us to discuss options if you need temporary pause.

#### What if I''m in hospital?
Contact us - we can discuss options for extended hospitalization.

### Need Help?

For billing questions:
- Call our customer service line
- Email: info@icealarm.es
- Use dashboard contact form',
  ARRAY['member', 'staff', 'ai'],
  6,
  ARRAY['billing', 'subscription', 'payment', 'faq', 'pricing'],
  'en',
  'published'
);

-- 5.12 Billing & Subscription FAQ (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'billing-subscription-faq-es',
  'Preguntas Frecuentes de Facturación y Suscripción',
  'member_guide',
  '## Preguntas Frecuentes de Facturación y Suscripción

### Preguntas Comunes

#### ¿Cuándo se me cobra?
Se le cobra en la misma fecha cada mes, comenzando desde su fecha de activación.

#### ¿Qué métodos de pago aceptan?
- Domiciliación bancaria
- Tarjeta de crédito/débito
- Transferencia bancaria

#### ¿Puedo cambiar mi método de pago?
Sí. Contáctenos o actualice a través de su panel de miembro.

#### ¿Qué pasa si un pago falla?
- Le notificaremos
- Intentaremos de nuevo en 2-3 días
- El servicio continúa durante el período de reintento
- Contáctenos si los problemas persisten

### Cambios de Plan

#### ¿Puedo cambiar de plan Individual a Pareja?
Sí. Contáctenos para agregar un segundo colgante. Pagará:
- Diferencia prorrateada del mes actual
- Costo del segundo colgante (€151.25)
- Nueva tarifa mensual (€38.49) desde próxima facturación

#### ¿Puedo cambiar de Pareja a Individual?
Sí. Contáctenos para organizarlo. Debe devolver un colgante.

### Cancelación

#### ¿Cómo cancelo mi servicio?
- Llame a nuestro servicio al cliente
- O envíe su solicitud de cancelación por email
- Se requiere aviso de 30 días

#### ¿Hay cuota de cancelación?
No. No cobramos cuotas de cancelación.

#### ¿Qué pasa con mi colgante?
- El colgante debe devolverse
- Proporcionaremos instrucciones de devolución
- El dispositivo será desactivado

### Historial de Facturación

#### ¿Dónde puedo ver mis facturas?
En su panel de miembro bajo "Suscripción" > "Historial de Facturación"

#### ¿Pueden enviarme recibos por email?
Sí. Solicite esto a través de su panel o contáctenos.

### Aumentos de Precio

#### ¿Aumentará mi precio?
Su tarifa está fijada. Si se necesitan cambios, proporcionamos aviso de 60 días.

### Otras Preguntas

#### ¿Ofrecen descuentos?
- Pago anual: 1 mes gratis
- Contáctenos sobre otros programas

#### ¿Está incluido el IVA?
Sí, todos los precios incluyen IVA.

#### ¿Puedo pausar mi servicio?
Contáctenos para discutir opciones si necesita una pausa temporal.

#### ¿Qué pasa si estoy en el hospital?
Contáctenos - podemos discutir opciones para hospitalización prolongada.

### ¿Necesita Ayuda?

Para preguntas de facturación:
- Llame a nuestra línea de servicio al cliente
- Email: info@icealarm.es
- Use el formulario de contacto del panel',
  ARRAY['member', 'staff', 'ai'],
  6,
  ARRAY['facturacion', 'suscripcion', 'pago', 'faq', 'precios'],
  'es',
  'published'
);

-- ============================================
-- CATEGORY 6: PARTNER INFO (10 docs)
-- ============================================

-- 6.1 Partner Program Overview (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'partner-program-overview-en',
  'Partner Program Overview',
  'partner',
  '## Partner Program Overview

### About the ICE Alarm Partner Program

The ICE Alarm Partner Program enables individuals and organizations to earn commissions by referring new members to our service. Partners play a vital role in helping elderly individuals and their families discover the peace of mind that ICE Alarm provides.

### Who Can Be a Partner?

Our program is open to:
- Healthcare professionals
- Care home staff
- Home care providers
- Insurance agents
- Community organizations
- Social workers
- Pharmacies
- Anyone with connections to our target audience

### How It Works

**1. Apply and Get Approved**
- Complete the online application
- Provide required identification (NIF/NIE/CIF)
- Sign the partner agreement
- Receive your unique partner code

**2. Refer Potential Members**
- Share your personalized referral link
- Provide marketing materials
- Use your QR code for easy referrals
- Submit leads through partner dashboard

**3. Earn Commissions**
- €50 for each successful referral
- Paid after 7-day holding period
- Track earnings in real-time
- Receive monthly payments

### Program Benefits

**Competitive Commissions**
- €50 per successful referral
- No cap on earnings
- Recurring referrals welcome

**Marketing Support**
- Professional presentations (PDF/PPTX)
- Branded brochures
- Digital assets for sharing
- QR codes for easy referrals

**Easy Tracking**
- Real-time dashboard access
- See referral status
- Track pending commissions
- View payment history

**Dedicated Support**
- Partner support team
- Training materials
- Regular updates
- Marketing tips

### Requirements

**To become a partner:**
- Valid Spanish identification (NIF/NIE/CIF)
- Signed partner agreement
- Active email and phone
- Professional conduct standards

### Getting Started

1. Visit our partner signup page
2. Complete the application
3. Verify your identity
4. Sign the agreement
5. Access your partner dashboard
6. Start referring!

### Questions?

Email: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['partner', 'referral', 'program', 'overview', 'commission'],
  'en',
  'published'
);

-- 6.2 Partner Program Overview (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'partner-program-overview-es',
  'Descripción del Programa de Socios',
  'partner',
  '## Descripción del Programa de Socios

### Acerca del Programa de Socios de ICE Alarm

El Programa de Socios de ICE Alarm permite a individuos y organizaciones ganar comisiones refiriendo nuevos miembros a nuestro servicio. Los socios juegan un papel vital ayudando a personas mayores y sus familias a descubrir la tranquilidad que ICE Alarm proporciona.

### ¿Quién Puede Ser Socio?

Nuestro programa está abierto a:
- Profesionales de la salud
- Personal de residencias
- Proveedores de atención domiciliaria
- Agentes de seguros
- Organizaciones comunitarias
- Trabajadores sociales
- Farmacias
- Cualquiera con conexiones a nuestra audiencia objetivo

### Cómo Funciona

**1. Aplicar y Ser Aprobado**
- Complete la solicitud en línea
- Proporcione identificación requerida (NIF/NIE/CIF)
- Firme el acuerdo de socio
- Reciba su código de socio único

**2. Referir Miembros Potenciales**
- Comparta su enlace de referido personalizado
- Proporcione materiales de marketing
- Use su código QR para referencias fáciles
- Envíe leads a través del panel de socios

**3. Ganar Comisiones**
- €50 por cada referido exitoso
- Pagado después de período de retención de 7 días
- Rastree ganancias en tiempo real
- Reciba pagos mensuales

### Beneficios del Programa

**Comisiones Competitivas**
- €50 por referido exitoso
- Sin límite de ganancias
- Referencias recurrentes bienvenidas

**Apoyo de Marketing**
- Presentaciones profesionales (PDF/PPTX)
- Folletos con marca
- Activos digitales para compartir
- Códigos QR para referencias fáciles

**Seguimiento Fácil**
- Acceso al panel en tiempo real
- Vea estado de referidos
- Rastree comisiones pendientes
- Vea historial de pagos

**Soporte Dedicado**
- Equipo de soporte para socios
- Materiales de capacitación
- Actualizaciones regulares
- Consejos de marketing

### Requisitos

**Para convertirse en socio:**
- Identificación española válida (NIF/NIE/CIF)
- Acuerdo de socio firmado
- Email y teléfono activos
- Estándares de conducta profesional

### Comenzando

1. Visite nuestra página de registro de socios
2. Complete la solicitud
3. Verifique su identidad
4. Firme el acuerdo
5. Acceda a su panel de socios
6. ¡Comience a referir!

### ¿Preguntas?

Email: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['socio', 'referido', 'programa', 'descripcion', 'comision'],
  'es',
  'published'
);

-- 6.3 Commission Structure & Payments (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'commission-structure-payments-en',
  'Commission Structure & Payments',
  'partner',
  '## Commission Structure & Payments

### Commission Rates

**Standard Commission: €50 per successful referral**

A successful referral is when:
- Your referred lead becomes a paying member
- They complete their first month of service
- Payment is successfully processed

### Holding Period

**7-Day Holding Period**

After a referral converts:
- Commission enters 7-day hold
- This protects against early cancellations
- After 7 days, commission is approved
- Approved commissions are added to next payout

### Commission Status

Your dashboard shows commission status:

| Status | Meaning |
|--------|---------|
| Pending | Lead submitted, not yet converted |
| Converted | Lead became member, in holding period |
| Approved | Past holding period, ready for payment |
| Paid | Included in a payout |
| Cancelled | Lead cancelled before approval |

### Payment Schedule

**Monthly Payments**

- Commissions approved by month-end
- Paid on 10th of following month
- Minimum payout: €50 (1 referral)
- No maximum limit

### Payment Methods

**Bank Transfer (Preferred)**
- Direct deposit to Spanish bank account
- IBAN required in profile

**Requirements:**
- Valid Spanish bank account
- Account holder name matches partner name
- Active IBAN on file

### Tax Considerations

**Important:**
- Commissions are taxable income
- You receive gross amount
- Responsible for declaring to Hacienda
- Keep records of all payments
- Consult tax advisor if needed

### Commission Examples

| Referrals | Monthly Earnings |
|-----------|------------------|
| 1 | €50 |
| 5 | €250 |
| 10 | €500 |
| 20 | €1,000 |

### Tracking Earnings

In your partner dashboard:
- Real-time referral tracking
- Commission calculator
- Payment history
- Downloadable statements

### Important Rules

- Commissions only for new members
- Self-referrals not permitted
- Fraudulent referrals result in termination
- Member must complete first payment

### Questions About Payments?

Contact: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['commission', 'payment', 'earnings', 'payout', 'structure'],
  'en',
  'published'
);

-- 6.4 Commission Structure & Payments (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'commission-structure-payments-es',
  'Estructura de Comisiones y Pagos',
  'partner',
  '## Estructura de Comisiones y Pagos

### Tasas de Comisión

**Comisión Estándar: €50 por referido exitoso**

Un referido exitoso es cuando:
- Su lead referido se convierte en miembro pagador
- Completan su primer mes de servicio
- El pago se procesa exitosamente

### Período de Retención

**Período de Retención de 7 Días**

Después de que un referido se convierte:
- La comisión entra en retención de 7 días
- Esto protege contra cancelaciones tempranas
- Después de 7 días, la comisión es aprobada
- Las comisiones aprobadas se agregan al próximo pago

### Estado de Comisión

Su panel muestra el estado de comisión:

| Estado | Significado |
|--------|-------------|
| Pendiente | Lead enviado, aún no convertido |
| Convertido | Lead se convirtió en miembro, en período de retención |
| Aprobado | Pasó período de retención, listo para pago |
| Pagado | Incluido en un pago |
| Cancelado | Lead canceló antes de aprobación |

### Calendario de Pagos

**Pagos Mensuales**

- Comisiones aprobadas al fin de mes
- Pagadas el día 10 del mes siguiente
- Pago mínimo: €50 (1 referido)
- Sin límite máximo

### Métodos de Pago

**Transferencia Bancaria (Preferido)**
- Depósito directo a cuenta bancaria española
- IBAN requerido en perfil

**Requisitos:**
- Cuenta bancaria española válida
- Nombre del titular coincide con nombre del socio
- IBAN activo en archivo

### Consideraciones Fiscales

**Importante:**
- Las comisiones son ingreso gravable
- Usted recibe cantidad bruta
- Responsable de declarar a Hacienda
- Mantenga registros de todos los pagos
- Consulte asesor fiscal si es necesario

### Ejemplos de Comisión

| Referidos | Ganancias Mensuales |
|-----------|---------------------|
| 1 | €50 |
| 5 | €250 |
| 10 | €500 |
| 20 | €1,000 |

### Rastreo de Ganancias

En su panel de socios:
- Seguimiento de referidos en tiempo real
- Calculadora de comisiones
- Historial de pagos
- Estados de cuenta descargables

### Reglas Importantes

- Comisiones solo para nuevos miembros
- Auto-referidos no permitidos
- Referidos fraudulentos resultan en terminación
- El miembro debe completar primer pago

### ¿Preguntas Sobre Pagos?

Contacto: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['comision', 'pago', 'ganancias', 'desembolso', 'estructura'],
  'es',
  'published'
);

-- 6.5 Partner Dashboard Guide (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'partner-dashboard-guide-en',
  'Partner Dashboard Guide',
  'partner',
  '## Partner Dashboard Guide

### Accessing Your Dashboard

**To log in:**
1. Visit our website
2. Click "Partner Login"
3. Enter your email and password
4. Access your partner dashboard

### Dashboard Overview

Your partner dashboard provides:
- Referral statistics
- Commission tracking
- Marketing materials
- Payment history
- Profile management

### Main Sections

**Dashboard Home**
Quick overview showing:
- Total referrals submitted
- Conversions this month
- Pending commissions
- Total earnings to date

**My Referrals**
Track all your referrals:
- Lead name and submission date
- Current status
- Commission amount
- Conversion date (if applicable)

**Submit Referral**
Add new leads:
- Enter lead details
- Optional notes
- Auto-generates unique tracking
- Immediate confirmation

**Referral Link**
Your personal referral tools:
- Unique referral URL
- QR code for easy sharing
- Copy to clipboard
- Print-ready format

**Marketing Materials**
Access approved materials:
- Sales presentation (PDF)
- Sales presentation (PPTX)
- Brochures
- Digital assets

**Commissions**
Detailed earnings view:
- Pending commissions
- Approved commissions
- Payment history
- Download statements

**Settings**
Manage your account:
- Personal details
- Bank information
- Password change
- Notification preferences

### Submitting a Referral

**Step by step:**
1. Go to "Submit Referral"
2. Enter lead''s name
3. Enter contact phone
4. Add email if available
5. Include any notes
6. Click "Submit"

**After submission:**
- Lead appears in your list
- Status shows "Pending"
- You can track progress

### Using Your Referral Link

Share your unique link via:
- Email signature
- Social media
- WhatsApp/messaging
- Business cards (QR code)

When someone uses your link:
- They land on signup page
- Your partner code is attached
- Referral tracked automatically

### Checking Payments

In "Commissions" section:
- View approved amounts
- See payment schedule
- Download invoices
- Check payment history

### Need Help?

- Click "Support" in dashboard
- Email: partners@icealarm.es
- FAQ section available',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['dashboard', 'tools', 'referrals', 'tracking', 'portal'],
  'en',
  'published'
);

-- 6.6 Partner Dashboard Guide (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'partner-dashboard-guide-es',
  'Guía del Panel de Socios',
  'partner',
  '## Guía del Panel de Socios

### Accediendo a Su Panel

**Para iniciar sesión:**
1. Visite nuestro sitio web
2. Haga clic en "Inicio de Sesión de Socio"
3. Ingrese su email y contraseña
4. Acceda a su panel de socios

### Vista General del Panel

Su panel de socios proporciona:
- Estadísticas de referidos
- Seguimiento de comisiones
- Materiales de marketing
- Historial de pagos
- Gestión de perfil

### Secciones Principales

**Inicio del Panel**
Vista rápida mostrando:
- Total de referidos enviados
- Conversiones este mes
- Comisiones pendientes
- Ganancias totales a la fecha

**Mis Referidos**
Rastree todos sus referidos:
- Nombre del lead y fecha de envío
- Estado actual
- Cantidad de comisión
- Fecha de conversión (si aplica)

**Enviar Referido**
Agregue nuevos leads:
- Ingrese detalles del lead
- Notas opcionales
- Auto-genera seguimiento único
- Confirmación inmediata

**Enlace de Referido**
Sus herramientas personales de referido:
- URL de referido única
- Código QR para compartir fácil
- Copiar al portapapeles
- Formato listo para imprimir

**Materiales de Marketing**
Acceda a materiales aprobados:
- Presentación de ventas (PDF)
- Presentación de ventas (PPTX)
- Folletos
- Activos digitales

**Comisiones**
Vista detallada de ganancias:
- Comisiones pendientes
- Comisiones aprobadas
- Historial de pagos
- Descargar estados de cuenta

**Configuración**
Gestione su cuenta:
- Datos personales
- Información bancaria
- Cambio de contraseña
- Preferencias de notificación

### Enviando un Referido

**Paso a paso:**
1. Vaya a "Enviar Referido"
2. Ingrese nombre del lead
3. Ingrese teléfono de contacto
4. Agregue email si está disponible
5. Incluya cualquier nota
6. Haga clic en "Enviar"

**Después del envío:**
- El lead aparece en su lista
- El estado muestra "Pendiente"
- Puede rastrear el progreso

### Usando Su Enlace de Referido

Comparta su enlace único vía:
- Firma de email
- Redes sociales
- WhatsApp/mensajería
- Tarjetas de presentación (código QR)

Cuando alguien usa su enlace:
- Llegan a la página de registro
- Su código de socio está adjunto
- Referido rastreado automáticamente

### Verificando Pagos

En la sección "Comisiones":
- Vea cantidades aprobadas
- Vea calendario de pagos
- Descargue facturas
- Revise historial de pagos

### ¿Necesita Ayuda?

- Haga clic en "Soporte" en el panel
- Email: partners@icealarm.es
- Sección de FAQ disponible',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['panel', 'herramientas', 'referidos', 'seguimiento', 'portal'],
  'es',
  'published'
);

-- 6.7 Marketing Materials & Guidelines (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'marketing-materials-guidelines-en',
  'Marketing Materials & Guidelines',
  'partner',
  '## Marketing Materials & Guidelines

### Available Materials

**Sales Presentations**
- PDF format for sharing
- PowerPoint for customization
- Available in English and Spanish
- Professional design

**Digital Assets**
- Partner referral link
- QR codes
- Social media graphics
- Email templates

**Print Materials**
- Downloadable brochures
- Business card templates
- Flyers

### Accessing Materials

1. Log into partner dashboard
2. Go to "Marketing Materials"
3. Download what you need
4. Use according to guidelines

### Brand Guidelines

**DO:**
- Use official ICE Alarm logo
- Maintain brand colors
- Use approved messaging
- Keep materials up to date

**DON''T:**
- Modify the logo
- Change brand colors
- Make false claims
- Use outdated materials

### Approved Messaging

**Key Messages:**
- "24/7 Emergency Monitoring"
- "Peace of Mind for You and Your Family"
- "GPS-Enabled Medical Alert"
- "Automatic Fall Detection"
- "Bilingual Support (English/Spanish)"

**Pricing (always current):**
- Single: €27.49/month
- Couple: €38.49/month
- Pendant: €151.25 one-time

### Using Your Referral Link

**Best Practices:**
- Add to email signature
- Share on social media
- Include in presentations
- Print QR code on materials

### Social Media Guidelines

**When posting:**
- Be honest and transparent
- Identify yourself as a partner
- Don''t make medical claims
- Share success stories (with permission)
- Use approved hashtags

**Sample posts:**
- "Helping families stay connected with their elderly loved ones. Ask me about ICE Alarm."
- "Peace of mind for independent living. #ICEAlarm #ElderCare"

### Compliance

**Required:**
- Disclose partner relationship
- Use accurate information only
- Respect privacy regulations
- Follow local advertising laws

**Prohibited:**
- Guaranteed health outcomes
- Misleading claims
- Pressure tactics
- Unsolicited contact to vulnerable people

### Updating Materials

Materials are updated periodically. Always check your dashboard for latest versions before distributing.

### Questions?

Email: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['marketing', 'branding', 'materials', 'guidelines', 'assets'],
  'en',
  'published'
);

-- 6.8 Marketing Materials & Guidelines (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'marketing-materials-guidelines-es',
  'Materiales de Marketing y Directrices',
  'partner',
  '## Materiales de Marketing y Directrices

### Materiales Disponibles

**Presentaciones de Ventas**
- Formato PDF para compartir
- PowerPoint para personalización
- Disponible en inglés y español
- Diseño profesional

**Activos Digitales**
- Enlace de referido de socio
- Códigos QR
- Gráficos para redes sociales
- Plantillas de email

**Materiales Impresos**
- Folletos descargables
- Plantillas de tarjetas de presentación
- Volantes

### Accediendo a Materiales

1. Inicie sesión en el panel de socios
2. Vaya a "Materiales de Marketing"
3. Descargue lo que necesite
4. Use según las directrices

### Directrices de Marca

**HAGA:**
- Use el logo oficial de ICE Alarm
- Mantenga los colores de la marca
- Use mensajes aprobados
- Mantenga los materiales actualizados

**NO HAGA:**
- Modificar el logo
- Cambiar colores de la marca
- Hacer afirmaciones falsas
- Usar materiales desactualizados

### Mensajes Aprobados

**Mensajes Clave:**
- "Monitoreo de Emergencia 24/7"
- "Tranquilidad para Usted y Su Familia"
- "Alerta Médica con GPS"
- "Detección Automática de Caídas"
- "Soporte Bilingüe (Inglés/Español)"

**Precios (siempre actuales):**
- Individual: €27.49/mes
- Pareja: €38.49/mes
- Colgante: €151.25 único pago

### Usando Su Enlace de Referido

**Mejores Prácticas:**
- Agregar a firma de email
- Compartir en redes sociales
- Incluir en presentaciones
- Imprimir código QR en materiales

### Directrices de Redes Sociales

**Al publicar:**
- Sea honesto y transparente
- Identifíquese como socio
- No haga afirmaciones médicas
- Comparta historias de éxito (con permiso)
- Use hashtags aprobados

**Publicaciones de ejemplo:**
- "Ayudando a familias a mantenerse conectadas con sus seres queridos mayores. Pregúnteme sobre ICE Alarm."
- "Tranquilidad para la vida independiente. #ICEAlarm #CuidadoMayores"

### Cumplimiento

**Requerido:**
- Divulgar relación de socio
- Usar solo información precisa
- Respetar regulaciones de privacidad
- Seguir leyes de publicidad locales

**Prohibido:**
- Resultados de salud garantizados
- Afirmaciones engañosas
- Tácticas de presión
- Contacto no solicitado a personas vulnerables

### Actualizando Materiales

Los materiales se actualizan periódicamente. Siempre verifique su panel para las últimas versiones antes de distribuir.

### ¿Preguntas?

Email: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  7,
  ARRAY['marketing', 'marca', 'materiales', 'directrices', 'activos'],
  'es',
  'published'
);

-- 6.9 Partner Agreement Requirements (EN)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'partner-agreement-requirements-en',
  'Partner Agreement Requirements',
  'partner',
  '## Partner Agreement Requirements

### Overview

To become an ICE Alarm partner, you must complete the partner agreement. This document outlines the terms, responsibilities, and requirements of the partnership.

### Eligibility Requirements

**To apply, you must:**
- Be at least 18 years old
- Have valid Spanish identification
- Have a Spanish bank account
- Not be a current ICE Alarm employee
- Not have conflicts of interest

### Required Documentation

**Spanish Identification (one of):**
- NIF (Número de Identificación Fiscal) - Spanish nationals
- NIE (Número de Identidad de Extranjero) - Foreign residents
- CIF (Código de Identificación Fiscal) - Business entities

**Bank Information:**
- Spanish bank account IBAN
- Account holder must match applicant name

### Agreement Terms

The partner agreement covers:

**Your Commitments:**
- Honest representation of ICE Alarm services
- Protection of member privacy
- Compliance with marketing guidelines
- Professional conduct at all times
- Accurate reporting of referrals

**ICE Alarm Commitments:**
- Commission payments as agreed
- Access to marketing materials
- Partner support and training
- Dashboard access for tracking

**Commission Terms:**
- €50 per successful referral
- 7-day holding period
- Monthly payment schedule
- Minimum payout threshold

**Termination Conditions:**
- Either party can terminate with 30 days notice
- Immediate termination for fraud or misconduct
- Outstanding commissions paid upon termination

### Signing Process

1. **Complete Application**
   - Fill out online form
   - Upload identification

2. **Review Agreement**
   - Read full terms
   - Ask questions if needed

3. **Accept Terms**
   - Digital signature
   - Date of acceptance
   - IP address recorded

4. **Activation**
   - Agreement confirmed via email
   - Dashboard access granted
   - Partner code issued

### Ongoing Requirements

**As a partner, you must:**
- Keep information current
- Report changes to bank details
- Comply with updated guidelines
- Maintain professional standards

### Agreement Updates

ICE Alarm may update agreement terms. Partners will be notified 30 days in advance of significant changes.

### Questions?

Contact: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['agreement', 'legal', 'compliance', 'requirements', 'contract'],
  'en',
  'published'
);

-- 6.10 Partner Agreement Requirements (ES)
INSERT INTO documentation (slug, title, category, content, visibility, importance, tags, language, status)
VALUES (
  'partner-agreement-requirements-es',
  'Requisitos del Acuerdo de Socio',
  'partner',
  '## Requisitos del Acuerdo de Socio

### Descripción General

Para convertirse en socio de ICE Alarm, debe completar el acuerdo de socio. Este documento describe los términos, responsabilidades y requisitos de la asociación.

### Requisitos de Elegibilidad

**Para aplicar, debe:**
- Tener al menos 18 años
- Tener identificación española válida
- Tener cuenta bancaria española
- No ser empleado actual de ICE Alarm
- No tener conflictos de interés

### Documentación Requerida

**Identificación Española (uno de):**
- NIF (Número de Identificación Fiscal) - Ciudadanos españoles
- NIE (Número de Identidad de Extranjero) - Residentes extranjeros
- CIF (Código de Identificación Fiscal) - Entidades comerciales

**Información Bancaria:**
- IBAN de cuenta bancaria española
- El titular de la cuenta debe coincidir con el nombre del solicitante

### Términos del Acuerdo

El acuerdo de socio cubre:

**Sus Compromisos:**
- Representación honesta de los servicios de ICE Alarm
- Protección de la privacidad de los miembros
- Cumplimiento de las directrices de marketing
- Conducta profesional en todo momento
- Reporte preciso de referidos

**Compromisos de ICE Alarm:**
- Pagos de comisiones según lo acordado
- Acceso a materiales de marketing
- Soporte y capacitación para socios
- Acceso al panel para seguimiento

**Términos de Comisión:**
- €50 por referido exitoso
- Período de retención de 7 días
- Calendario de pago mensual
- Umbral mínimo de pago

**Condiciones de Terminación:**
- Cualquier parte puede terminar con 30 días de aviso
- Terminación inmediata por fraude o mala conducta
- Comisiones pendientes pagadas al terminar

### Proceso de Firma

1. **Completar Solicitud**
   - Llenar formulario en línea
   - Subir identificación

2. **Revisar Acuerdo**
   - Leer términos completos
   - Hacer preguntas si es necesario

3. **Aceptar Términos**
   - Firma digital
   - Fecha de aceptación
   - Dirección IP registrada

4. **Activación**
   - Acuerdo confirmado por email
   - Acceso al panel concedido
   - Código de socio emitido

### Requisitos Continuos

**Como socio, debe:**
- Mantener información actualizada
- Reportar cambios en datos bancarios
- Cumplir con directrices actualizadas
- Mantener estándares profesionales

### Actualizaciones del Acuerdo

ICE Alarm puede actualizar los términos del acuerdo. Los socios serán notificados 30 días antes de cambios significativos.

### ¿Preguntas?

Contacto: partners@icealarm.es',
  ARRAY['staff', 'ai'],
  8,
  ARRAY['acuerdo', 'legal', 'cumplimiento', 'requisitos', 'contrato'],
  'es',
  'published'
);
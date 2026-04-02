# Patch: Cold-Start Push Handling

## Ziel des Patches

Dieser Patch sorgt dafür, dass ein getappter Push auch dann zuverlässig verarbeitet werden kann, wenn die App auf iOS oder Android komplett beendet war.

Das Hauptproblem vorher war:

- Der Push-Tap kam nativ an.
- Die eigentliche Web-App (`app.js`) war zu diesem Zeitpunkt aber oft noch nicht bereit.
- Dadurch konnte das Push-Payload beim echten Cold Start verloren gehen oder zu spät verarbeitet werden.

Die neue Lösung trennt das sauber auf:

- Der native Plugin-Code puffert das ursprüngliche Push-Payload.
- Die lokale Shell (`index.js`) liest dieses Payload sehr früh aus und entscheidet beim Cold Start über das erste Ziel.
- Die eigentliche Web-App (`app.js`) kümmert sich danach nur noch um laufende Push-Fälle.


## Was der native Code jetzt macht

Betroffene Dateien:

- `src/ios/AppDelegate+FCMPlugin.h`
- `src/ios/AppDelegate+FCMPlugin.m`
- `src/ios/FCMPlugin.h`
- `src/ios/FCMPlugin.m`
- `src/android/FCMPlugin.java`
- `www/FCMPlugin.js`

### Neue Grundidee

Der native Code wertet die Push-Daten nicht mehr selbst fachlich aus.
Er entscheidet also nicht mehr, welche Property wichtig ist oder wohin navigiert werden soll.

Stattdessen macht er nur Folgendes:

1. Ein getappter Push wird nativ vollständig gespeichert.
2. Dieses gespeicherte Payload kann einmalig über `getInitialPushPayload()` ausgelesen werden.
3. Nach dem Auslesen wird das Initial-Payload wieder geleert.
4. Zusätzlich wird das normale `lastPush` ebenfalls geleert, damit derselbe Push nicht später noch einmal über `onNotification()` ankommt.

### iOS

Auf iOS wird beim Notification-Tap das Push-Payload mit `wasTapped = true` als JSON gespeichert.

Neu hinzugekommen ist ein separates Initial-Payload:

- `setInitialPushPayload(...)`
- `consumeInitialPushPayload()`

`consumeInitialPushPayload()` ist bewusst ein One-Shot:

- beim ersten Lesen wird das Payload zurückgegeben
- danach wird es gelöscht

Dadurch bekommt die App genau den Cold-Start-Push, der diesen Start ausgelöst hat, und nicht beliebig alte Daten.

### Android

Auf Android wurde das gleiche Prinzip ergänzt:

- `initialPush`
- `setInitialPushPayload(...)`
- `consumeInitialPushPayload()`

Wenn die App über einen Push gestartet wird oder ein neuer Intent mit Push-Daten kommt, wird dieses Payload ebenfalls separat gemerkt.

### Neue JS-API des Plugins

In `www/FCMPlugin.js` gibt es jetzt zusätzlich:

`FCMPlugin.getInitialPushPayload(success, error)`

Diese Methode ist die neue Brücke zwischen nativem Cold-Start-Puffer und der Shell/Web-App.


## Was die index.js jetzt macht

Betroffene Datei:

- `index.js`

### Rolle der index.js

Die `index.js` ist jetzt der Owner für den Cold-Start-Fall.

Das bedeutet:

- Sie läuft früher als die eigentliche Web-App.
- Sie liest direkt nach `deviceready` das native Initial-Payload.
- Sie entscheidet daraus, ob sofort auf ein Push-Ziel navigiert werden soll.

### Ablauf

1. Die Shell startet.
2. Nach `deviceready` ruft sie `FCMPlugin.getInitialPushPayload(...)` auf.
3. Wenn ein getapptes Push-Payload vorhanden ist, wird daraus die Ziel-URL bestimmt.
4. Erst danach wird die Zielseite geladen.

### Wichtige fachliche Regel in der Shell

Für den Cold Start verwendet die `index.js` jetzt bewusst nur noch:

- `untrackedUri`

Wenn zusätzlich `notificationId` im Payload vorhanden ist, wird diese als Query-Parameter an die `untrackedUri` angehängt.

Beispiel:

`https://nachrichtenbu.de/artikel/xyz?notificationId=abc123`

Damit gilt:

- Die Shell navigiert direkt und ohne Umweg auf die eigentliche Zielseite.
- Die Shell ist dabei trotzdem minimal fachlich gekoppelt.
- Das Plugin selbst bleibt generisch und kennt `untrackedUri` nicht.


## Was in der app.js jetzt anders ist

Betroffene Datei:

- `app.js`

### Neue Rolle der app.js

Die `app.js` ist nicht mehr für das Auffangen des echten Cold Starts zuständig.

Das übernimmt jetzt die Shell.

Die `app.js` verarbeitet nur noch Pushes, wenn die App bereits läuft oder bereits geladen wurde.

### Was geblieben ist

Geblieben ist:

- `FCMPlugin.onNotification(...)`

Diese Logik ist weiterhin sinnvoll für:

- Push im laufenden Betrieb
- Push-Tap aus dem Hintergrund
- Fälle, in denen die Web-App bereits aktiv ist

### Wie app.js jetzt navigiert

Wenn ein Push in der laufenden App verarbeitet wird, dann gilt weiterhin:

1. Wenn eine direkte Ziel-URL im Payload vorhanden ist, wird direkt dorthin navigiert.
2. Wenn keine direkte URL vorhanden ist, aber `notificationId` da ist, wird `clickNotification(...)` verwendet.

Zusätzlich bleibt ein Duplicate-Schutz erhalten:

- `lastHandledTappedNotificationKey`

Dadurch soll verhindert werden, dass derselbe Push mehrfach verarbeitet wird.

### Kleine Korrekturen nebenbei

Zusätzlich wurden zwei Fehler im bestehenden Code mit bereinigt:

- Das fehlerhafte `.then()` auf `updateNotificationsTimed(...)`
- Der problematische `grantPermission(claimToken())`-Aufruf


## Zusammenspiel der drei Ebenen

### Cold Start

1. Push wird getappt.
2. Native Ebene speichert das vollständige Payload.
3. `index.js` liest dieses Payload direkt nach dem Start aus.
4. `index.js` navigiert sofort auf `untrackedUri` und hängt bei Bedarf `notificationId` an.
5. Die Web-App lädt danach bereits auf der richtigen Zielseite.

### App läuft bereits

1. Push kommt an oder wird im Hintergrund getappt.
2. `app.js` erhält das Event über `FCMPlugin.onNotification(...)`.
3. `app.js` entscheidet dann wie bisher anhand des Payloads über die Navigation.


## Warum diese Aufteilung sinnvoll ist

Diese Aufteilung ist ein Kompromiss aus Robustheit und Flexibilität:

- Der kritische Cold-Start-Fall wird möglichst früh und stabil behandelt.
- Die eigentliche Web-App bleibt Owner für das normale Laufzeitverhalten.
- Das Plugin bleibt generisch und ist nicht fachlich auf `untrackedUri` fest verdrahtet.
- Die Shell darf für den ersten Einstieg bewusst minimal app-spezifisch sein.


## Kurzfassung

- Native Ebene puffert jetzt getappte Pushes sauber.
- `getInitialPushPayload()` liefert dieses Payload genau einmal zurück.
- `index.js` ist Owner für Cold Start.
- `app.js` ist Owner für Warm-/Background-Fälle.
- In der Shell wird für Cold Start nur noch `untrackedUri` verwendet.
- Wenn vorhanden, wird `notificationId` an die Ziel-URL angehängt.

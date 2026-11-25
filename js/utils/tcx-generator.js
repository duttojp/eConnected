/**
 * TCXGenerator - Générateur de fichier Training Center XML (TCX)
 * Format standard reconnu par Strava, Garmin Connect, Google Fit, GoldenCheetah, etc.
 */

export class TCXGenerator {
  /**
   * Génère le document XML TCX complet à partir des données de session
   */
  static buildTCX(session) {
    const startTime = session.startTime;
    const stats = session.stats;
    const samples = session.samples || [];

    const maxSpeedMs = (stats.maxSpeedKmH / 3.6).toFixed(2);

    let trackpointsXML = '';
    for (const s of samples) {
      const speedMs = (s.speed / 3.6).toFixed(2);
      const hrTag = s.heartRate > 0 
        ? `<HeartRateBpm><Value>${s.heartRate}</Value></HeartRateBpm>` 
        : '';

      trackpointsXML += `
        <Trackpoint>
          <Time>${s.timestamp}</Time>
          <DistanceMeters>${s.distanceMeters}</DistanceMeters>
          ${hrTag}
          <Cadence>${s.cadence}</Cadence>
          <Extensions>
            <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
              <Speed>${speedMs}</Speed>
              <Watts>${s.watts}</Watts>
            </TPX>
          </Extensions>
        </Trackpoint>`;
    }

    const tcxContent = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startTime}</Id>
      <Lap StartTime="${startTime}">
        <TotalTimeSeconds>${stats.totalTimeSeconds}</TotalTimeSeconds>
        <DistanceMeters>${stats.totalDistanceMeters}</DistanceMeters>
        <MaximumSpeed>${maxSpeedMs}</MaximumSpeed>
        <Calories>${stats.totalCalories}</Calories>
        ${stats.avgHeartRate > 0 ? `<AverageHeartRateBpm><Value>${stats.avgHeartRate}</Value></AverageHeartRateBpm>` : ''}
        ${stats.maxHeartRate > 0 ? `<MaximumHeartRateBpm><Value>${stats.maxHeartRate}</Value></MaximumHeartRateBpm>` : ''}
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
          ${trackpointsXML}
        </Track>
        <Extensions>
          <LX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
            <AvgSpeed>${(stats.avgSpeedKmH / 3.6).toFixed(2)}</AvgSpeed>
            <AvgWatts>${stats.avgWatts}</AvgWatts>
            <MaxWatts>${stats.maxWatts}</MaxWatts>
          </LX>
        </Extensions>
      </Lap>
      <Creator xsi:type="Device_t">
        <Name>Domyos Bike 500 Web</Name>
        <UnitId>500</UnitId>
        <ProductID>500</ProductID>
      </Creator>
    </Activity>
  </Activities>
  <Author xsi:type="Application_t">
    <Name>eConnected Web Alternative</Name>
    <Build>
      <Version>
        <VersionMajor>1</VersionMajor>
        <VersionMinor>0</VersionMinor>
      </Version>
    </Build>
    <LangID>fr</LangID>
  </Author>
</TrainingCenterDatabase>`;

    return tcxContent.trim();
  }

  /**
   * Déclenche le téléchargement du fichier TCX dans le navigateur
   */
  static download(session) {
    const xml = TCXGenerator.buildTCX(session);
    const blob = new Blob([xml], { type: 'application/vnd.garmin.tcx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date(session.startTime).toISOString().replace(/[:.]/g, '-');
    const filename = `domyos_seance_${dateStr}.tcx`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return filename;
  }
}

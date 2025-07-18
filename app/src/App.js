import React, { useState, useEffect } from 'react';
import { Search, Clock, Calendar, Train, Bus, AlertCircle, CheckCircle, Download, RefreshCw } from 'lucide-react';

// List of predefined locations
const LOCATIONS = [
  'Südbahnhof, Trier',
  'Westbahnhof, Trier-West',
  'Lindenplatz, Ehrang (Trier)',
  'Pfalzel, Am Mühlenteich, Trier',
  'Bahnhof Pfalzel, Pfalzel (Trier)',
  'Trier, Brückenstraße',
  'Hafenstraße, Pfalzel (Trier)',
  'Theater Trier, Trier'
];

export default function VRTJourneyPlanner() {
  const [origin, setOrigin] = useState('Ehrang (Trier), Lindenplatz');
  const [destination, setDestination] = useState('Theater Trier, Trier');
  const [customOrigin, setCustomOrigin] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [showCustomOrigin, setShowCustomOrigin] = useState(false);
  const [showCustomDestination, setShowCustomDestination] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [departure, setDeparture] = useState(true);
  const [loading, setLoading] = useState(false);
  const [journeys, setJourneys] = useState([]);
  const [error, setError] = useState('');
  const [rawHtml, setRawHtml] = useState('');
  const [autoSearch, setAutoSearch] = useState(false);

  // Parse URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);

    // Set origin and destination from URL if provided
    const vonParam = urlParams.get('von');
    const nachParam = urlParams.get('nach');
    const reverseParam = urlParams.get('reverse');
    const jsonParam = urlParams.get('json');

    if (vonParam) {
      const decodedVon = decodeURIComponent(vonParam);
      if (LOCATIONS.includes(decodedVon)) {
        setOrigin(decodedVon);
      } else {
        setShowCustomOrigin(true);
        setCustomOrigin(decodedVon);
        setOrigin('custom');
      }
    }

    if (nachParam) {
      const decodedNach = decodeURIComponent(nachParam);
      if (LOCATIONS.includes(decodedNach)) {
        setDestination(decodedNach);
      } else {
        setShowCustomDestination(true);
        setCustomDestination(decodedNach);
        setDestination('custom');
      }
    }

    // Handle reverse parameter
    if (reverseParam === 'true' && vonParam && nachParam) {
      const decodedVon = decodeURIComponent(nachParam);
      const decodedNach = decodeURIComponent(vonParam);

      if (LOCATIONS.includes(decodedVon)) {
        setOrigin(decodedVon);
      } else {
        setShowCustomOrigin(true);
        setCustomOrigin(decodedVon);
        setOrigin('custom');
      }

      if (LOCATIONS.includes(decodedNach)) {
        setDestination(decodedNach);
      } else {
        setShowCustomDestination(true);
        setCustomDestination(decodedNach);
        setDestination('custom');
      }
    }

    // Auto-search if json parameter is present
    if (jsonParam === 'true') {
      setAutoSearch(true);
    }
  }, []);

  // Auto-search when component mounts and autoSearch is true
  useEffect(() => {
    if (autoSearch) {
      fetchJourneyConnections();
    }
  }, [autoSearch]);

  const formatDateForAPI = (dateStr) => {
    const parts = dateStr.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  };

  const getActualOrigin = () => {
    return origin === 'custom' ? customOrigin : origin;
  };

  const getActualDestination = () => {
    return destination === 'custom' ? customDestination : destination;
  };

  const handleOriginChange = (value) => {
    setOrigin(value);
    if (value === 'custom') {
      setShowCustomOrigin(true);
    } else {
      setShowCustomOrigin(false);
      setCustomOrigin('');
    }
  };

  const handleDestinationChange = (value) => {
    setDestination(value);
    if (value === 'custom') {
      setShowCustomDestination(true);
    } else {
      setShowCustomDestination(false);
      setCustomDestination('');
    }
  };

  const fetchJourneyConnections = async () => {
    setLoading(true);
    setError('');
    setJourneys([]);

    const actualOrigin = getActualOrigin();
    const actualDestination = getActualDestination();

    const params = new URLSearchParams({
      'language': 'de',
      'itdLPxx_contractor': 'vrt',
      'name_origin': actualOrigin,
      'type_origin': 'any',
      'name_destination': actualDestination,
      'type_destination': 'any',
      'itdDateDayMonthYear': formatDateForAPI(date),
      'itdTime': time,
      'itdTripDateTimeDepArr': departure ? 'dep' : 'arr',
      'useRealtime': '1',
      'inclMOT_0': 'true',   // Zug
      'inclMOT_5': 'true',   // Stadtbus
      'inclMOT_6': 'true',   // Regionalbus
      'inclMOT_10': 'true',  // Ruftaxi/-bus
      'routeType': 'LEASTTIME',
      'trITMOTvalue100': '15',
      'useProxFootSearch': 'on',
      'sessionID': '0',
      'requestID': '0',
      'includedMeans': 'checkbox',
      'computationType': 'sequence',
      'itdLPxx_template': 'tripresults_pt_trip'
    });

    const proxyUrl = 'https://corsproxy.io/?';
    const apiUrl = `https://www.vrt-info.de/fahrplanauskunft/XSLT_TRIP_REQUEST2?${params}`;

    try {
      const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      setRawHtml(html);

      const parsedJourneys = parseJourneyResults(html);
      setJourneys(parsedJourneys);

      // If json=true was in URL params, automatically download JSON
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('json') === 'true' && parsedJourneys.length > 0) {
        setTimeout(() => downloadJSON(), 1000);
      }

    } catch (err) {
      setError(`Fehler beim Abrufen der Daten: ${err.message}. 
        Hinweis: Aufgrund von CORS-Beschränkungen funktioniert diese App möglicherweise nicht direkt. 
        Verwenden Sie einen CORS-Proxy oder richten Sie einen eigenen Backend-Server ein.`);
    } finally {
      setLoading(false);
    }
  };

  const parseJourneyResults = (htmlContent) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const journeyRows = doc.querySelectorAll('div.std3_row.std3_result-row.std3_open-explicit-details');
    const journeys = [];

    journeyRows.forEach((row, idx) => {
      const journey = {};

      // Extract times
      const timeContainer = row.querySelector('span.std3_time-container');
      if (timeContainer) {
        const times = timeContainer.textContent.trim();
        const timeMatch = times.match(/(\d{2}:\d{2})[^0-9]*(\d{2}:\d{2})/);
        if (timeMatch) {
          journey.departure = timeMatch[1];
          journey.arrival = timeMatch[2];
        }
      }

      // Extract duration
      const durationSpan = row.querySelector('span.std3_duration');
      if (durationSpan) {
        const durationText = durationSpan.textContent.trim();
        const durationMatch = durationText.match(/(\d+)\s*Min/);
        if (durationMatch) {
          journey.duration = `${durationMatch[1]} Min`;
        }
      }

      // Check delay status
      const delayedIcon = row.querySelector('span.std3_route-delayed-icon');
      const ontimeIcon = row.querySelector('span.std3_route-ontime-icon');

      if (delayedIcon) {
        journey.delayed = true;
        journey.status = 'Voraussichtlich verspätet';
      } else if (ontimeIcon) {
        journey.delayed = false;
        journey.status = 'Voraussichtlich pünktlich';
      } else {
        journey.delayed = null;
        journey.status = 'Keine Echtzeitinformation';
      }

      // Extract transport modes
      const transportIcons = row.querySelectorAll('span.std3_mot-label');
      const transportModes = [];
      transportIcons.forEach(icon => {
        const mode = icon.textContent.trim();
        if (mode && mode !== '' && mode !== ' ') {
          transportModes.push(mode);
        }
      });

      if (transportModes.length > 0) {
        journey.transport_modes = transportModes;
        journey.transport_display = transportModes.join(' → ');
      }

      journeys.push(journey);
    });

    return journeys;
  };

  const swapDirections = () => {
    const tempOrigin = origin;
    const tempDestination = destination;
    const tempCustomOrigin = customOrigin;
    const tempCustomDestination = customDestination;
    const tempShowCustomOrigin = showCustomOrigin;
    const tempShowCustomDestination = showCustomDestination;

    setOrigin(tempDestination);
    setDestination(tempOrigin);
    setCustomOrigin(tempCustomDestination);
    setCustomDestination(tempCustomOrigin);
    setShowCustomOrigin(tempShowCustomDestination);
    setShowCustomDestination(tempShowCustomOrigin);
  };

  const downloadJSON = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const data = {
      origin: getActualOrigin(),
      destination: getActualDestination(),
      date,
      time,
      departure,
      journeys
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vrt_journey_results_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadHTML = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([rawHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vrt_journey_results_${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (delayed) => {
    if (delayed === true) return <AlertCircle style={{ width: '20px', height: '20px', color: '#EAB308' }} />;
    if (delayed === false) return <CheckCircle style={{ width: '20px', height: '20px', color: '#22C55E' }} />;
    return <Clock style={{ width: '20px', height: '20px', color: '#6B7280' }} />;
  };

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#F3F4F6',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    wrapper: {
      maxWidth: '900px',
      margin: '0 auto'
    },
    card: {
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      padding: '24px',
      marginBottom: '24px'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: '8px',
      color: '#1F2937'
    },
    subtitle: {
      textAlign: 'center',
      color: '#6B7280',
      marginBottom: '24px'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '16px',
      marginBottom: '16px'
    },
    gridThree: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '16px',
      marginBottom: '16px'
    },
    inputGroup: {
      marginBottom: '16px'
    },
    label: {
      display: 'block',
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      marginBottom: '4px'
    },
    input: {
      width: '100%',
      padding: '12px 16px',
      border: '1px solid #D1D5DB',
      borderRadius: '6px',
      fontSize: '16px',
      outline: 'none',
      transition: 'border-color 0.2s',
      boxSizing: 'border-box',
      appearance: 'none',
      backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 4 5\'><path fill=\'%23666\' d=\'M2 0L0 2h4zm0 5L0 3h4z\'/></svg>")',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      backgroundSize: '12px',
      paddingRight: '40px'
    },
    select: {
      width: '100%',
      padding: '12px 16px',
      border: '1px solid #D1D5DB',
      borderRadius: '6px',
      fontSize: '16px',
      outline: 'none',
      transition: 'border-color 0.2s',
      boxSizing: 'border-box',
      appearance: 'none',
      backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 4 5\'><path fill=\'%23666\' d=\'M2 0L0 2h4zm0 5L0 3h4z\'/></svg>")',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      backgroundSize: '12px',
      paddingRight: '40px',
      cursor: 'pointer'
    },
    customInput: {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #D1D5DB',
      borderRadius: '6px',
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.2s',
      boxSizing: 'border-box',
      marginTop: '8px'
    },
    inputFocus: {
      borderColor: '#3B82F6'
    },
    button: {
      width: '100%',
      backgroundColor: '#3B82F6',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '6px',
      border: 'none',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'background-color 0.2s'
    },
    buttonHover: {
      backgroundColor: '#2563EB'
    },
    buttonDisabled: {
      backgroundColor: '#9CA3AF',
      cursor: 'not-allowed'
    },
    smallButton: {
      backgroundColor: '#10B981',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '6px',
      border: 'none',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'background-color 0.2s'
    },
    purpleButton: {
      backgroundColor: '#8B5CF6',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '6px',
      border: 'none',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      transition: 'background-color 0.2s'
    },
    errorBox: {
      backgroundColor: '#FEE2E2',
      border: '1px solid #FCA5A5',
      color: '#DC2626',
      padding: '16px',
      borderRadius: '6px',
      marginBottom: '24px'
    },
    journeyCard: {
      border: '1px solid #E5E7EB',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      transition: 'background-color 0.2s',
      cursor: 'pointer'
    },
    journeyCardHover: {
      backgroundColor: '#F9FAFB'
    },
    spinner: {
      display: 'inline-block',
      width: '20px',
      height: '20px',
      border: '2px solid #ffffff',
      borderRadius: '50%',
      borderTopColor: 'transparent',
      animation: 'spin 0.8s linear infinite'
    },
    reverseButton: {
      position: 'absolute',
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      backgroundColor: '#F3F4F6',
      border: '1px solid #D1D5DB',
      borderRadius: '50%',
      width: '36px',
      height: '36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: 'background-color 0.2s'
    },
    inputWrapper: {
      position: 'relative'
    }
  };

  // Add CSS animation for spinner
  if (!document.getElementById('spinner-style')) {
    const style = document.createElement('style');
    style.id = 'spinner-style';
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <h1 style={styles.title}>VRT Fahrplanauskunft</h1>
          <p style={styles.subtitle}>Verkehrsverbund Region Trier</p>

          <div>
            <div style={styles.grid}>
              <div style={styles.inputWrapper}>
                <label style={styles.label}>Von</label>
                <select
                  value={origin}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  style={styles.select}
                >
                  {LOCATIONS.map((location, index) => (
                    <option key={index} value={location}>
                      {location}
                    </option>
                  ))}
                  <option value="custom">Andere Haltestelle...</option>
                </select>
                {showCustomOrigin && (
                  <input
                    type="text"
                    value={customOrigin}
                    onChange={(e) => setCustomOrigin(e.target.value)}
                    style={styles.customInput}
                    placeholder="Geben Sie eine andere Haltestelle ein"
                  />
                )}
              </div>

              <div style={styles.inputWrapper}>
                <label style={styles.label}>Nach</label>
                <select
                  value={destination}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  style={styles.select}
                >
                  {LOCATIONS.map((location, index) => (
                    <option key={index} value={location}>
                      {location}
                    </option>
                  ))}
                  <option value="custom">Andere Haltestelle...</option>
                </select>
                {showCustomDestination && (
                  <input
                    type="text"
                    value={customDestination}
                    onChange={(e) => setCustomDestination(e.target.value)}
                    style={styles.customInput}
                    placeholder="Geben Sie eine andere Haltestelle ein"
                  />
                )}
                <button
                  onClick={swapDirections}
                  style={styles.reverseButton}
                  title="Richtung tauschen"
                >
                  <RefreshCw style={{ width: '18px', height: '18px', color: '#6B7280' }} />
                </button>
              </div>
            </div>

            <div style={styles.gridThree}>
              <div>
                <label style={styles.label}>
                  <Calendar style={{ display: 'inline', width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                  Datum
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>
                  <Clock style={{ display: 'inline', width: '16px', height: '16px', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                  Zeit
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>Zeitart</label>
                <select
                  value={departure ? 'dep' : 'arr'}
                  onChange={(e) => setDeparture(e.target.value === 'dep')}
                  style={styles.select}
                >
                  <option value="dep">Abfahrt</option>
                  <option value="arr">Ankunft</option>
                </select>
              </div>
            </div>

            <button
              onClick={fetchJourneyConnections}
              disabled={loading}
              style={{
                ...styles.button,
                ...(loading ? styles.buttonDisabled : {})
              }}
              onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = styles.buttonHover.backgroundColor)}
              onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = styles.button.backgroundColor)}
            >
              {loading ? (
                <>
                  <div style={styles.spinner}></div>
                  <span>Suche läuft...</span>
                </>
              ) : (
                <>
                  <Search style={{ width: '20px', height: '20px' }} />
                  <span>Verbindungen suchen</span>
                </>
              )}
            </button>

            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#F3F4F6', borderRadius: '6px', fontSize: '14px', color: '#6B7280' }}>
              <strong>URL Parameter:</strong>
              <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                <li><code>?von=Start&nach=Ziel</code> - Setzt Start und Ziel</li>
                <li><code>&reverse=true</code> - Tauscht Start und Ziel</li>
                <li><code>&json=true</code> - Sucht automatisch und lädt JSON herunter</li>
              </ul>
              <p style={{ marginTop: '8px', fontSize: '12px' }}>
                Beispiel: <code>?von=Südbahnhof, Trier&nach=Theater Trier, Trier&json=true</code>
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Fehler</p>
            <p style={{ fontSize: '14px' }}>{error}</p>
          </div>
        )}

        {journeys.length > 0 && (
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1F2937' }}>
                {journeys.length} Verbindungen gefunden
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={downloadJSON}
                  style={styles.smallButton}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#059669'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = styles.smallButton.backgroundColor}
                >
                  <Download style={{ width: '16px', height: '16px' }} />
                  JSON
                </button>
                <button
                  onClick={downloadHTML}
                  style={styles.purpleButton}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#7C3AED'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = styles.purpleButton.backgroundColor}
                >
                  <Download style={{ width: '16px', height: '16px' }} />
                  HTML
                </button>
              </div>
            </div>

            <div>
              {journeys.map((journey, idx) => (
                <div
                  key={idx}
                  style={styles.journeyCard}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.journeyCardHover.backgroundColor}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: '600' }}>
                          {journey.departure || 'N/A'} → {journey.arrival || 'N/A'}
                        </span>
                        <span style={{ color: '#6B7280' }}>
                          {journey.duration || 'N/A'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        {getStatusIcon(journey.delayed)}
                        <span style={{ fontSize: '14px', color: '#6B7280' }}>
                          {journey.status || 'N/A'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Train style={{ width: '16px', height: '16px' }} />
                          {journey.transport_display || 'N/A'}
                        </span>
                        {journey.fare && (
                          <span style={{ fontWeight: '600', color: '#10B981' }}>
                            {journey.fare}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#D1D5DB' }}>
                      {idx + 1}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
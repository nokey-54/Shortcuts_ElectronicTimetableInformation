import React, { useState } from 'react';
import { Search, Clock, Calendar, Train, Bus, AlertCircle, CheckCircle, Download } from 'lucide-react';

export default function VRTJourneyPlanner() {
  const [origin, setOrigin] = useState('Ehrang (Trier), Lindenplatz');
  const [destination, setDestination] = useState('Theater Trier, Trier');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [departure, setDeparture] = useState(true);
  const [loading, setLoading] = useState(false);
  const [journeys, setJourneys] = useState([]);
  const [error, setError] = useState('');
  const [rawHtml, setRawHtml] = useState('');

  const formatDateForAPI = (dateStr) => {
    const parts = dateStr.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  };

  const fetchJourneyConnections = async () => {
    setLoading(true);
    setError('');
    setJourneys([]);

    const params = new URLSearchParams({
      'language': 'de',
      'itdLPxx_contractor': 'vrt',
      'name_origin': origin,
      'type_origin': 'any',
      'name_destination': destination,
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

    // Note: Direct API calls might be blocked by CORS. In production, you'd need a proxy server.
    // For GitHub Pages, you'll need to use a CORS proxy service or set up your own backend.
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

      // Extract fare
      const fareButton = row.querySelector('button.std3_fare_button');
      if (fareButton) {
        const fareText = fareButton.textContent.trim();
        const fareMatch = fareText.match(/([\d,]+\s*€)/);
        if (fareMatch) {
          journey.fare = fareMatch[1];
        }
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

  const downloadJSON = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const data = {
      origin,
      destination,
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
    if (delayed === true) return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    if (delayed === false) return <CheckCircle className="w-5 h-5 text-green-500" />;
    return <Clock className="w-5 h-5 text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
            VRT Fahrplanauskunft
          </h1>
          <p className="text-center text-gray-600 mb-6">
            Verkehrsverbund Region Trier
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Von
                </label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Starthaltestelle"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nach
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Zielhaltestelle"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Datum
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Clock className="inline w-4 h-4 mr-1" />
                  Zeit
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Zeitart
                </label>
                <select
                  value={departure ? 'dep' : 'arr'}
                  onChange={(e) => setDeparture(e.target.value === 'dep')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="dep">Abfahrt</option>
                  <option value="arr">Ankunft</option>
                </select>
              </div>
            </div>

            <button
              onClick={fetchJourneyConnections}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center gap-2 disabled:bg-gray-400"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Suche läuft...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Verbindungen suchen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Fehler</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {journeys.length > 0 && (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  {journeys.length} Verbindungen gefunden
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={downloadJSON}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    JSON
                  </button>
                  <button
                    onClick={downloadHTML}
                    className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    HTML
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {journeys.map((journey, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <span className="text-lg font-semibold">
                            {journey.departure || 'N/A'} → {journey.arrival || 'N/A'}
                          </span>
                          <span className="text-gray-600">
                            {journey.duration || 'N/A'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(journey.delayed)}
                          <span className="text-sm text-gray-600">
                            {journey.status || 'N/A'}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Train className="w-4 h-4" />
                            {journey.transport_display || 'N/A'}
                          </span>
                          {journey.fare && (
                            <span className="font-semibold text-green-600">
                              {journey.fare}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-2xl font-bold text-gray-400">
                        {idx + 1}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
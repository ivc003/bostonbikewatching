// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiaXZjMDAzIiwiYSI6ImNtN2ZlYTUxZTBvN2kya29vODZpNTE1Zm0ifQ.eKtRilp9Sp_Us3GhaJEpHw';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
      });

    map.addLayer({
        id: 'bike-lanes-1',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 4,
            'line-opacity': 0.5
        }
        });
    
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
      });

    map.addLayer({
        id: 'bike-lanes-2',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',
            'line-width': 4,
            'line-opacity': 0.5
        }
        });
});

const svg = d3.select('#map').select('svg');
let stations = [];
let trips = [];
let circles;
let filteredStations = [];

// Load both stations and trips data when the map is loaded
map.on('load', () => {
    // Load the nested JSON file for stations
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);  // Log to verify structure
        
        // Access stations data from JSON
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        // Fetch the traffic data (trips) using d3.csv()
        const csvurl = 'bluebikes-traffic-2024-03.csv';
        d3.csv(csvurl).then(trips => {
            console.log('Loaded Traffic Data (Trips):', trips);
            trips = tripsData;

            // Calculate departures for each station
            const departures = d3.rollup(
                trips,
                (v) => v.length,  // Count the number of trips (departures)
                (d) => d.start_station_id,  // Group by start station ID
            );
            
            // Calculate arrivals for each station
            const arrivals = d3.rollup(
                trips,
                (v) => v.length,  // Count the number of trips (arrivals)
                (d) => d.end_station_id,  // Group by end station ID
            );

            // Now, update stations with traffic data (arrivals, departures, total traffic)
            stations = stations.map((station) => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;  // Default to 0 if no arrivals
                station.departures = departures.get(id) ?? 0;  // Default to 0 if no departures
                station.totalTraffic = station.arrivals + station.departures;  // Total traffic is arrivals + departures
                return station;
            });

            console.log('Stations with Traffic Data:', stations);  // Verify the updated stations

            const radiusScale = d3
                .scaleSqrt()
                .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
                .range([timeFilter === -1 ? 0 : 3, timeFilter === -1 ? 25 : 50]);  // Conditional scale

            // Append circles to the SVG for each station
            circles = svg.selectAll('circle')
                .data(stations)
                .enter()
                .append('circle')
                .attr('r', (d) => radiusScale(d.totalTraffic))  // Use filtered station data
                .attr('fill', 'blue')  // Circle fill color
                .attr('stroke', 'white')  // Circle border color
                .attr('stroke-width', 1)  // Circle border thickness
                .attr('opacity', 0.7)


            // Initial position update when map loads
            updatePositions();

            for (let trip of trips) {
                trip.started_at = new Date(trip.started_at);  // Convert start time to Date
                trip.ended_at = new Date(trip.ended_at);      // Convert end time to Date
              };
            
            // Call the filter function to filter trips based on time
            //filterTripsByTime(trips);

        }).catch(error => {
            console.error('Error loading Traffic Data (Trips):', error);  // Handle errors if CSV loading fails
        });
    }).catch(error => {
        console.error('Error loading Stations JSON:', error);  // Handle errors if JSON loading fails
    });
});


function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
  }

    // Function to update circle positions when the map moves/zooms
function updatePositions() {
    circles
        .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
        .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
    }

  // Reposition markers on map interactions
  map.on('move', updatePositions);     // Update during map movement
  map.on('zoom', updatePositions);     // Update during zooming
  map.on('resize', updatePositions);   // Update on window resize
  map.on('moveend', updatePositions);  // Final adjustment after movement ends

  let timeFilter = -1;

  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');
  
  function formatTime(minutes) {
      const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
      return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
    }
  
  function updateTimeDisplay() {
      timeFilter = Number(timeSlider.value);  // Get slider value
    
      if (timeFilter === -1) {
        selectedTime.textContent = '';  // Clear time display
        anyTimeLabel.style.display = 'block';  // Show "(any time)"
      } else {
        selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
        anyTimeLabel.style.display = 'none';  // Hide "(any time)"
      }
    
      // Trigger filtering logic which will be implemented in the next step
    }
  
  
  // Update the time display and filter trips when the slider value changes
timeSlider.addEventListener('input', () => {
    updateTimeDisplay();
    filterTripsByTime(trips);
  });
  
  // Initial call to filter trips based on the default slider value
  filterTripsByTime(trips);
  
  function minutesSinceMidnight(date) {
      return date.getHours() * 60 + date.getMinutes();  // Get minutes since midnight
    }
  
    let filteredTrips = [];
    let filteredArrivals = new Map();
    let filteredDepartures = new Map();
    let filteredStations = [];
    
    function filterTripsByTime(trips) {
        filteredTrips = timeFilter === -1
          ? trips
          : trips.filter((trip) => {
              const startedMinutes = minutesSinceMidnight(trip.started_at);
              const endedMinutes = minutesSinceMidnight(trip.ended_at);
              return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||  // Filter by time range (±60 minutes)
                Math.abs(endedMinutes - timeFilter) <= 60
              );
            });
      
        // Now update the arrivals and departures data for the filtered trips
        updateArrivalsAndDepartures(filteredTrips);
        updateFilteredStations(filteredTrips);
        updateCircles();
      }
  
      function updateArrivalsAndDepartures(filteredTrips) {
        // Calculate filtered arrivals and departures using d3.rollup
        filteredArrivals = d3.rollup(
          filteredTrips,
          (v) => v.length,  // Count number of trips
          (d) => d.start_station_id
        );
      
        filteredDepartures = d3.rollup(
          filteredTrips,
          (v) => v.length,  // Count number of trips
          (d) => d.end_station_id
        );
      }
    
      function updateFilteredStations(filteredTrips) {
        filteredStations = stations.map((station) => {
          let id = station.short_name;
      
          // Clone the station object to avoid modifying the original one
          station = { ...station };
      
          // Set filtered arrivals, departures, and total traffic
          station.arrivals = filteredArrivals.get(id) ?? 0;
          station.departures = filteredDepartures.get(id) ?? 0;
          station.totalTraffic = station.arrivals + station.departures;
      
          return station;
        });
      }
    
      function updateCircles() {
        const radiusScale = d3
          .scaleSqrt()
          .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
          .range([timeFilter === -1 ? 0 : 3, timeFilter === -1 ? 25 : 50]);  // Conditional scale
      
        circles
          .data(filteredStations)
          .attr('r', (d) => radiusScale(d.totalTraffic))
          .attr('cx', d => getCoords(d).cx)
          .attr('cy', d => getCoords(d).cy)
          .each(function (d) {
            d3.select(this)
              .select('title')
              .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
          });
      }
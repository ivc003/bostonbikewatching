// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiaXZjMDAzIiwiYSI6ImNtN2ZlYTUxZTBvN2kya29vODZpNTE1Zm0ifQ.eKtRilp9Sp_Us3GhaJEpHw';

// Define global variables
let stations = [];
let trips = [];
let circles;
let filteredStations = [];
let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let timeFilter = -1;
let map;

// Initialize the map
map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

// Setup UI controls
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

// Single map load event handler
map.on('load', () => { 
    // Add bike lane layers
    setupBikeLanes();
    
    // Then load data and create visualization
    loadDataAndCreateVisualization();
});

function setupBikeLanes() {
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
}

function loadDataAndCreateVisualization() {
    // Load the nested JSON file for stations
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);
        
        // Access stations data from JSON
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        // Fetch the traffic data (trips) using d3.csv()
        const csvurl = 'bluebikes-traffic-2024-03.csv';
        
        d3.csv(csvurl).then(tripsData => {
            console.log('Loaded Traffic Data (Trips):', tripsData);
            
            // Store trips globally
            trips = tripsData;

            // Process date fields
            for (let trip of trips) {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
            }

            // Calculate initial traffic data
            const departures = d3.rollup(
                trips,
                v => v.length,
                d => d.start_station_id
            );
            
            const arrivals = d3.rollup(
                trips,
                v => v.length,
                d => d.end_station_id
            );

            // Update stations with traffic data
            stations = stations.map(station => {
                const id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });

            console.log('Stations with Traffic Data:', stations);

            // Initialize filtered data
            filteredTrips = trips;
            filteredStations = stations;
            
            // Create the visualization
            createStationCircles();
            
            // Setup event listeners for time filtering
            setupTimeFiltering();
            
        }).catch(error => {
            console.error('Error loading Traffic Data (Trips):', error);
        });
    }).catch(error => {
        console.error('Error loading Stations JSON:', error);
    });
}

function createStationCircles() {
    // Get the map container for proper overlay positioning
    const container = map.getCanvasContainer();
    
    // Create SVG element inside the map container
    let svg = d3.select(container).select('svg');
    if (svg.empty()) {
        svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('position', 'absolute')
            .style('z-index', 2);
    }
    
    // Create the radius scale based on traffic data
    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(filteredStations, d => d.totalTraffic) || 1])
        .range([timeFilter === -1 ? 5 : 3, timeFilter === -1 ? 25 : 50]);
    
    // Create the circles
    circles = svg.selectAll('circle')
        .data(filteredStations)
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'blue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.7)
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)); // Set CSS variable for color

    // Add tooltips as separate selections
    circles.append('title')
        .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    
    // Apply the fill color based on departure ratio
    circles.style("fill", function(d) {
        const departureRatio = d.departures / d.totalTraffic;
        return `color-mix(in oklch, steelblue ${departureRatio * 100}%, darkorange)`;
    });
    
    // Initial position update
    updatePositions();
    
    // Setup map event listeners for position updates
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
}

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

function updatePositions() {
    if (!circles) return;
    
    circles
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy);
}

function setupTimeFiltering() {
    // Initialize time display
    updateTimeDisplay();
    
    // Add event listener to time slider
    timeSlider.addEventListener('input', () => {
        updateTimeDisplay();
        filterTripsByTime();
    });
    
    // Initial filtering
    filterTripsByTime();
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);
    
    if (timeFilter === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
    } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none';
    }
}

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime() {
    // Skip if data isn't loaded yet
    if (!trips || trips.length === 0) return;
    
    filteredTrips = timeFilter === -1
        ? trips
        : trips.filter(trip => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
    
    // Update arrivals and departures based on filtered trips
    updateArrivalsAndDepartures();
    updateFilteredStations();
    updateCircles();
}

function updateArrivalsAndDepartures() {
    filteredArrivals = d3.rollup(
        filteredTrips,
        v => v.length,
        d => d.end_station_id
    );
    
    filteredDepartures = d3.rollup(
        filteredTrips,
        v => v.length,
        d => d.start_station_id
    );
}

function updateFilteredStations() {
    filteredStations = stations.map(station => {
        const id = station.short_name;
        
        // Create a new object to avoid modifying the original
        return {
            ...station,
            arrivals: filteredArrivals.get(id) ?? 0,
            departures: filteredDepartures.get(id) ?? 0,
            totalTraffic: (filteredArrivals.get(id) ?? 0) + (filteredDepartures.get(id) ?? 0)
        };
    });
}

function updateCircles() {
    if (!circles) return;
    
    // Update the radius scale with new data
    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(filteredStations, d => d.totalTraffic) || 1])
        .range([timeFilter === -1 ? 5 : 3, timeFilter === -1 ? 25 : 50]);
    
    // Join the new data and update the circles
    circles = d3.select(map.getCanvasContainer())
        .select('svg')
        .selectAll('circle')
        .data(filteredStations);
    
    // Update existing circles
    circles
        .attr('r', d => radiusScale(d.totalTraffic))
        .select('title')
        .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);   
        
    // Apply the fill color based on departure ratio
    circles.style("fill", function(d) {
        const departureRatio = d.departures / d.totalTraffic;
        return `color-mix(in oklch, steelblue ${departureRatio * 100}%, darkorange)`;
    });    

    // Update positions
    updatePositions();
}

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
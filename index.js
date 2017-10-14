const button = document.getElementById('locate_button');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const csv = require('csvtojson');
const request = require('request');
const tripsCSVFilePath = './csv/trips.csv';
const stopsCSVFilePath = './csv/stops.csv';

const mapDims = 0.006;
const apiKey = '5478c04ea5da79c1c75aa912a1fb9fd9';

/* Feed Request Settings */
let requestSettings = {
  method: 'GET',
  url: `http://datamine.mta.info/mta_esi.php?key=${apiKey}&feed_id=2`,
  encoding: null
};

/* Train, Trip, Station Objects */
let stationObject = {};
let nearbyStations = {};
let tripsObject = {};
let nearbyStationsETA = {};
let stopsObject = {};
let feedObject = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, A: 26, C: 26, E: 26,
  N: 16, Q: 16, R: 16, W: 16, B: 21, D: 21, F: 21, M: 21, L: 2, G: 31};
let feeds = "";
let feedStr = "";
let routes = {};
/* Add Event Listeners */
$('#locate_button').on('click', (e) => {
  e.preventDefault();
  $.get('http://ip-api.com/json',(data) => {
      getNearbyStations(data);
    });
});

/* Populate Train, Trip, Station Objects */
csv()
  .fromStream(request.get('http://web.mta.info/developers/data/nyct/subway/Stations.csv'))
  .on('json', (obj) => {
  stationObject[obj["GTFS Stop ID"]] = obj;
});

csv()
  .fromFile(tripsCSVFilePath)
  .on('json', (obj) =>{
  tripsObject[obj["trip_id"]] = obj;
});

csv()
  .fromFile(stopsCSVFilePath)
  .on('json', (obj) =>{
  stopsObject[obj["stop_id"]] = obj;
});

/* Populate Nearby Trains Object */
const getNearbyStations = (data) => {
  // data.lat = 40.703811;
  // data.lon = -73.918425;
  for(let id in stationObject){
    if (id){
      let stationLat = parseFloat(stationObject[id]["GTFS Latitude"]);
      let stationLong = parseFloat(stationObject[id]["GTFS Longitude"]);
      if ((Math.abs(stationLat - data.lat) <= mapDims) && (Math.abs(stationLong - data.lon) <= mapDims))  {
        let stopId = stationObject[id]["GTFS Stop ID"];
        nearbyStations[stopId] = stationObject[id];
        nearbyStationsETA[stopId] = [];
      }
    }
  }
  getRoutes(nearbyStations);
  getIncomingTrains(nearbyStations);
};

/* Populate nearbyStationsETA */
const getIncomingTrains = (stations) => {
  let feed;



  request(requestSettings, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      feed = GtfsRealtimeBindings.FeedMessage.decode(body);
      // iterate over all of the trains
      feed.entity.forEach((train) => {
        // if it has scheduled stops
        if(train.trip_update){
          let nextStops = train.trip_update.stop_time_update;
          // iterate over all of a trains scheduled stops
          nextStops.forEach((stop, _ ,allStops) => {
            // stop_id includes N or S
            let formattedStation = stop.stop_id.slice(0, -1);
            // if upcoming stop is a nearbyStation push its ETA into ETA obj
            let destination = allStops[allStops.length - 1];
            if(nearbyStations[formattedStation]){
              populateNearByStation(formattedStation, stop, destination);
            }
          });
        }
      });
    }
  });


};

/* populate Feeds Array */
const getRoutes = (stations) => {
  feedStr = "";
  for (let key in stations) {
    feedStr += stations[key]["Daytime Routes"] + " ";
  }

  feedStr = feedStr.split(" ");
  feedStr.pop();

  for (let i = 0;  i < feedStr.length; i++) {
    let routeLetter = feedStr[i];
    let route = feedObject[routeLetter];
    routes[route] = route;
  }

};


/* Compare station times */

const populateNearByStation = (station, stop, destination) => {
  let currStationObj = {
    arrival: stop.arrival.time.low,
    destination: stopsObject[destination.stop_id].stop_name,
    stop_name: station
  };

  let first = nearbyStationsETA[station][0];
  let second = nearbyStationsETA[station][1];
  let currArrival = currStationObj.arrival;

  if (first === undefined || currArrival < first.arrival){
    nearbyStationsETA[station][1] = first;
    nearbyStationsETA[station][0] = currStationObj;
  } else if (second === undefined || currArrival < second.arrival) {
    nearbyStationsETA[station][1] = currStationObj;
  }
};

/* String to JSON parser */
const createStationJSON = (csvArray) => {
  let headers = csvArray[0];
  let stops = csvArray.slice(1);
  let jsonObject = {};

  stops.forEach((stopInfo) => {
    let stopInfoObj = skeletonObject(headers);
    let stationId = stopInfo[0];

    stopInfo.forEach((info, idx) => {
      stopInfoObj[headers[idx]] = info;
    });
    jsonObject[stationId] = stopInfoObj;
  });

  return jsonObject;
};

const skeletonObject = (headers) =>{
  let obj = {};
  headers.forEach((header)=>{
    obj[header] = "";
    });
    return obj;
};

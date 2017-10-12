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

/* Event Listeners */
$('#locate_button').on('click', (e)=>{
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
  data.lat = 40.703811;
  data.lon = -73.918425;
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
  getTrains(nearbyStations);
};

/* Populate nearbyStationsETA */
const getTrains = (stations) =>{
  let feed;
  request(requestSettings, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      feed = GtfsRealtimeBindings.FeedMessage.decode(body);
      // iterate over all of the trains
      feed.entity.forEach(function(entity) {
        // if it has a trip_update
        if(entity.trip_update){
          // grab FIRST stop_time_update

          let nextStops = entity.trip_update.stop_time_update;

          nextStops.forEach((stop)=>{
            // console.log(`Stop: ${stop.stop_id}`);
            // let parentStation = stopsObject[stop.stop_id].parent_station;

            // stop_id includes N or S
            let formattedStation = stop.stop_id.slice(0, -1);

            if(nearbyStations[formattedStation]){
              let arrivalTime = stop.arrival.time.low;
              // add arrival time to nearbyStationsETA object
              nearbyStationsETA[formattedStation].push(arrivalTime);
            }
          });
        }
      });
    }
  });
};

// String to JSON parser
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

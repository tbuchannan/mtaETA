const button = document.getElementById('locate_button');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const csv = require('csvtojson');
const request = require('request');
const tripsCSVFilePath = './csv/trips.csv';
const mapDims = 0.006;
const apiKey = '5478c04ea5da79c1c75aa912a1fb9fd9'

let stationObject = {};
let nearbyStations = {};
let tripsObject = {};



// populate stationObject using MTA Station Locations CSV
csv()
  .fromStream(request.get('http://web.mta.info/developers/data/nyct/subway/Stations.csv'))
  .on('json', (obj) => {
  stationObject[obj['Station ID']] = obj;
});

// populate tripsObject using csv downloaded from MTA Static Data Feed Subway CSV
csv()
  .fromFile(tripsCSVFilePath)
  .on('json', (obj) =>{
  tripsObject[obj["trip_id"]] = obj;
});


$('#locate_button').on('click', (e)=>{
  e.preventDefault();
  $.get('http://ip-api.com/json',(data) => {
      getNearbyStations(data);
    });
});

// populate nearbyStations by iterating over the stationObject and keeping stations within a desired range
const getNearbyStations = (data) => {

  for(let id in stationObject){
    if (id){
      let stationLat = parseFloat(stationObject[id]["GTFS Latitude"]);
      let stationLong = parseFloat(stationObject[id]["GTFS Longitude"]);
      if ((Math.abs(stationLat - data.lat) <= mapDims) && (Math.abs(stationLong - data.lon) <= mapDims))  {
        nearbyStations[stationObject[id]["Station ID"]] = stationObject[id];
      }
    }
  }
  getTrains(nearbyStations);
};

// populate
const getTrains = (stations) =>{
  let requestSettings = {
    method: 'GET',
    url: `http://datamine.mta.info/mta_esi.php?key=${apiKey}&feed_id=2`,
    encoding: null
  };

  let feed;
  request(requestSettings, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      feed = GtfsRealtimeBindings.FeedMessage.decode(body);
      feed.entity.forEach(function(entity) {
        // iterate over all of the trains
          // if it has a trip_update and stop_time_update
            // grab FIRST stop_time_update
              // get the stop_id
              // CHECK STOPS OBJECT[ITEM]
                // IF  ITEM.PARENT_STOP !== 1
                  //GRAB STOP_PBJECT[ITEM.PARENT]
            // grab trip_id and store in object?
        if (entity.trip_update) {
          // console.log(entity.trip_update);
        }
      });
    }
  });
  // debugger

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

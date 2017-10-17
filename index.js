const button = document.getElementById('locate_button');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const csv = require('csvtojson');
const request = require('request');
const tripsCSVFilePath = './csv/trips.csv';
const stopsCSVFilePath = './csv/stops.csv';
const stationsCSVFilePath = './csv/stations.csv';
const northBound = "N";
const southBound = "S";
const mapDims = 0.006;
const apiKey = '5478c04ea5da79c1c75aa912a1fb9fd9';

var displayCount = 0;
let callsRemaining = 0;

/* Feed Request Settings */
let requestSettings = {
  method: 'GET',
  encoding: null
};

/* Train, Trip, Station Objects */
let allStations = {};
let tripsObject = {};
let stopsObject = {};

let nearbyStations = {};
let nearbyStationsETA = {};

let feedObject = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
  A: 26, C: 26, E: 26,
  N: 16, Q: 16, R: 16, W: 16,
  B: 21, D: 21, F: 21, M: 21,
  L: 2,
  G: 31
};
let feedsToCall = {};

/* Add Event Listeners */


/* Populate Train, Trip, Station Objects */
csv()
  .fromFile(stationsCSVFilePath)
  .on('json', (obj) => {
  allStations[obj["GTFS Stop ID"]] = obj;
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

$('#locate_button').on('click', (e) => {
  e.preventDefault();
  $.get('http://ip-api.com/json',(data) => {
      getNearbyStations(data);
    });
});

/* Populate nearbyStations Object */
const getNearbyStations = (data) => {
  // data.lat = 40.703811;
  // data.lon = -73.918425;
  for(let id in allStations){
    if (id){
      let stationLat = parseFloat(allStations[id]["GTFS Latitude"]);
      let stationLong = parseFloat(allStations[id]["GTFS Longitude"]);
      if ((Math.abs(stationLat - data.lat) <= mapDims) && (Math.abs(stationLong - data.lon) <= mapDims))  {
        let stopId = allStations[id]["GTFS Stop ID"];
        let northID = stopId + northBound;
        let southID = stopId + southBound;
        nearbyStations[stopId] = allStations[id];
        nearbyStationsETA[northID] = [];
        nearbyStationsETA[southID] = [];
      }
    }
  }
  getRoutes();
};

/* Populate Feeds Array */
const getRoutes = () => {
  let feedStr = "";
  for (let key in nearbyStations) {
    feedStr += nearbyStations[key]["Daytime Routes"] + " ";
  }

  for (let i = 0;  i < feedStr.length; i += 2) {
    let routeLetter = feedStr[i];
    let feedId = feedObject[routeLetter];

    if (feedsToCall[feedId] === undefined && feedId !== '7'){
      feedsToCall[feedId] = true;
    }
  }
  displayCount = Object.keys(feedsToCall).length;
  getIncomingTrains();
};



/* Populate nearbyStationsETA */
const getIncomingTrains = () => {
  for (let feedId in feedsToCall) {
    requestSettings['url'] = `http://datamine.mta.info/mta_esi.php?key=${apiKey}&feed_id=${feedId}`;
    displayCount -= 1;
    console.log(displayCount);
    makeRequest();
  }
};

/* Call all feeds */
const makeRequest = () => {
  let feed;
  request(requestSettings, (error, response, body) => {
    if (!error && response.statusCode === 200) {

      feed = (GtfsRealtimeBindings.FeedMessage.decode(body));
      // iterate over all of the trains
      feed.entity.forEach((train) => {
        // if it has scheduled stops
        if(train.trip_update){
          let nextStops = train.trip_update.stop_time_update;
          // iterate over all of a trains scheduled stops
          nextStops.forEach((stop, _ ,allStops) => {
            // stop_id includes N or S
            let stationId = stop.stop_id;
            let formattedStationID = stationId.slice(0, -1);
            // if upcoming stop is a nearbyStation push its ETA into ETA obj
            let destination = allStops[allStops.length - 1];
            if(nearbyStations[formattedStationID]){
              populateNearByStation(stationId, stop, destination);
            }
          });
        }
      });
    }
    if (displayCount <= 0){ display(); }
  });
};

/* Compare station times */

const populateNearByStation = (station, stop, destination) => {
  let now = new Date();
  let arrival = new Date(stop.arrival.time.low * 1000);
  let timeInSeconds = now - arrival;
  let currStationObj = {
    arrival: stop.arrival.time.low,
    destination: stopsObject[destination.stop_id].stop_name,
    stop_name: station
  };

  // if(nearbyStationsETA[station] === undefined){
  //   nearbyStationsETA[station] = [];
  // }

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

const display = () => {
  for(let key in nearbyStationsETA){
    let train = $(`.${key}`);
    let stuff = $(".display");
    if (train.length < 1){
      if (nearbyStationsETA[key].length > 0){
        let el = $(`<div class=${key}>${JSON.stringify(nearbyStationsETA[key][0])}</div>`);
        let el2 = $(`<div class=${key}>${JSON.stringify(nearbyStationsETA[key][1])}</div>`);
        stuff.append(el);
        stuff.append(el2);
      }
      }
      else{
        train[0].innerText = JSON.stringify(nearbyStationsETA[key][0]);
        train[1].innerText = JSON.stringify(nearbyStationsETA[key][1]);
    }
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
